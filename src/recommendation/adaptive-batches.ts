import type {
    LegacyGeneratedRecommendations,
    AdaptiveSessionState,
    AdaptiveSessionReadPort,
    AdaptiveSessionWritePort,
    SessionRuntime
} from './legacy-ports'
import { buildBehaviorProfile } from '../recommendation-v3/behavior-profile'
import { buildV3Profile } from '../recommendation-v3/taste-model'
import { rankV3 } from '../recommendation-v3/ranker'
import { rerankV3 } from '../recommendation-v3/reranker'
import {
    adaptiveSessionStatus,
    readAdaptiveSessionState
} from './compatibility-queries'
import {
    LEGACY_RECOMMENDATION_BATCH_SIZE,
    LEGACY_RECOMMENDATION_CANDIDATE_DEPTH
} from './legacy-ports'

export class AdaptiveRecommendationBatches {
    static readonly batchSize = LEGACY_RECOMMENDATION_BATCH_SIZE
    static readonly candidateDepth = LEGACY_RECOMMENDATION_CANDIDATE_DEPTH
    private initialState?: AdaptiveSessionState
    private readonly generatedPools = new Map<
        string,
        LegacyGeneratedRecommendations
    >()

    constructor(
        private readonly read: AdaptiveSessionReadPort,
        private readonly write: AdaptiveSessionWritePort,
        private readonly generate: (
            limit: number,
            appSessionId?: string | null
        ) => Promise<LegacyGeneratedRecommendations>,
        private readonly runtime: SessionRuntime
    ) {}

    private state(): AdaptiveSessionState {
        const { state, persisted } = readAdaptiveSessionState(this.read, () =>
            this.draft()
        )
        return persisted ? state : this.saveState(state)
    }

    private draft(): AdaptiveSessionState {
        return (this.initialState ??= {
            cycleId: this.runtime.createId(),
            poolId: null,
            batchIndex: -1,
            appSessionId: null
        })
    }

    private saveState(state: AdaptiveSessionState) {
        this.write.writeState(state)
        return state
    }

    private async ensurePool(state: AdaptiveSessionState) {
        if (state.poolId) {
            const existing = this.read.getV3CandidatePool(state.poolId)
            if (existing) return existing
        }
        const generated = await this.generate(
            AdaptiveRecommendationBatches.candidateDepth,
            state.appSessionId
        )
        const ids = [
            ...new Set(
                generated.recommendations.map((item) => item.comic.comicId)
            )
        ]
        const pool = this.write.atomic(() => {
            const saved = this.write.saveV3CandidatePool({
                cycleId: state.cycleId,
                appSessionId: state.appSessionId,
                candidateIds: ids,
                telemetry: { audit: generated.audit ?? null },
                modelVersion: 'v3.0.0-local-explainable'
            })
            this.saveState({ ...state, poolId: saved.id })
            return this.read.getV3CandidatePool(saved.id)!
        })
        this.generatedPools.set(pool.id, generated)
        return pool
    }

    async nextBatch(input: { appSessionId?: string | null } = {}) {
        let state = this.state()
        if (input.appSessionId && input.appSessionId !== state.appSessionId)
            state = this.saveState({
                ...state,
                appSessionId: input.appSessionId
            })
        const pool = await this.ensurePool(state)
        const allocated = new Set(this.read.recommendationSeen(state.cycleId))
        const remaining = pool.candidateIds.filter((id) => !allocated.has(id))
        const cached = this.generatedPools.get(pool.id) ?? {
            recommendations: this.read.recommendationRecords(pool.candidateIds),
            profile: null,
            audit: { restoredFromCandidatePool: true }
        }
        this.generatedPools.set(pool.id, cached)
        const catalog = this.read.listComics({ limit: 5000 })
        const favorites = catalog.filter((item) => item.isFavorite)
        const profile = buildBehaviorProfile(
            buildV3Profile(favorites, catalog),
            this.read.listUserEvents({ limit: 5000 }),
            catalog,
            state.appSessionId
        )
        const ranked = rankV3(
            catalog.filter((item) => remaining.includes(item.comicId)),
            favorites,
            profile,
            this.read.listUserEvents({ limit: 5000 })
        )
        const reranked = rerankV3(
            ranked,
            new Map(catalog.map((item) => [item.comicId, item])),
            AdaptiveRecommendationBatches.batchSize
        )
        const generatedById = new Map(
            (cached?.recommendations ?? []).map((item) => [
                item.comic.comicId,
                item
            ])
        )
        const recommendations = reranked.flatMap((item) => {
            const original = generatedById.get(item.comicId)
            const comic = catalog.find(
                (candidate) => candidate.comicId === item.comicId
            )
            return comic
                ? [
                      {
                          ...(original ?? {
                              comic,
                              recallSources: [],
                              matchedSignals: [],
                              exploration: false
                          }),
                          comic,
                          score: item.score,
                          reasons: item.reasons,
                          matchedSignals: item.reasons,
                          exploration: item.features.novelty > 0
                      }
                  ]
                : []
        })
        const batchIndex = state.batchIndex + 1
        const contextId = this.runtime.createId()
        return this.write.atomic(() => {
            this.write.allocateRecommendationIds(
                state.cycleId,
                recommendations.map((item) => item.comic.comicId)
            )
            const batch = this.write.saveV3Batch({
                poolId: pool.id,
                cycleId: state.cycleId,
                batchIndex,
                contextId,
                itemIds: recommendations.map((item) => item.comic.comicId),
                evidence: { adaptiveRerank: true, profile }
            })
            state = this.saveState({ ...state, poolId: pool.id, batchIndex })
            return {
                cycleId: state.cycleId,
                sessionId: batch.id,
                sessionNo: 1,
                currentBatchIndex: batchIndex,
                batchSize: AdaptiveRecommendationBatches.batchSize,
                batchCount: Math.max(
                    1,
                    Math.ceil(
                        pool.candidateIds.length /
                            AdaptiveRecommendationBatches.batchSize
                    )
                ),
                recommendations,
                profile,
                audit: cached?.audit,
                contextId,
                candidatePoolId: pool.id,
                adaptive: true,
                seenCount: this.read.recommendationSeen(state.cycleId).length,
                exhausted: recommendations.length === 0,
                nextSessionReady: remaining.length > recommendations.length
            }
        })
    }

    async restart(input: { appSessionId?: string | null } = {}) {
        this.saveState({
            cycleId: this.runtime.createId(),
            poolId: null,
            batchIndex: -1,
            appSessionId: input.appSessionId ?? null
        })
        return this.nextBatch(input)
    }

    status() {
        return adaptiveSessionStatus(
            this.read,
            readAdaptiveSessionState(this.read, () => this.draft()).state
        )
    }
}
