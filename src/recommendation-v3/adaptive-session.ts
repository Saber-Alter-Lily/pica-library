import { randomUUID } from 'node:crypto'
import type { LibraryDatabase } from '../library/database'
import type { RecommendationResult } from '../library/types'
import { buildBehaviorProfile } from './behavior-profile'
import { buildV3Profile } from './taste-model'
import { rankV3 } from './ranker'
import { rerankV3 } from './reranker'

interface GeneratedRecommendations {
    recommendations: RecommendationResult[]
    profile: unknown
    audit?: unknown
}

interface AdaptiveState {
    cycleId: string
    poolId: string | null
    batchIndex: number
    appSessionId: string | null
}

export class AdaptiveRecommendationSession {
    static readonly batchSize = 12
    static readonly candidateDepth = 500
    private readonly stateKey = 'recommendation.v3.activeCycle'
    private readonly generatedPools = new Map<
        string,
        GeneratedRecommendations
    >()

    constructor(
        private readonly database: LibraryDatabase,
        private readonly generate: (
            limit: number,
            appSessionId?: string | null
        ) => Promise<GeneratedRecommendations>
    ) {}

    private state(): AdaptiveState {
        const existing = this.database.getAppState<AdaptiveState>(this.stateKey)
        if (existing?.cycleId) return existing
        return this.saveState({
            cycleId: randomUUID(),
            poolId: null,
            batchIndex: -1,
            appSessionId: null
        })
    }

    private saveState(state: AdaptiveState) {
        this.database.setAppState(this.stateKey, state)
        return state
    }

    private async ensurePool(state: AdaptiveState) {
        if (state.poolId) {
            const existing = this.database.getV3CandidatePool(state.poolId)
            if (existing) return existing
        }
        const generated = await this.generate(
            AdaptiveRecommendationSession.candidateDepth,
            state.appSessionId
        )
        const ids = [
            ...new Set(
                generated.recommendations.map((item) => item.comic.comicId)
            )
        ]
        const pool = this.database.saveV3CandidatePool({
            cycleId: state.cycleId,
            appSessionId: state.appSessionId,
            candidateIds: ids,
            telemetry: { audit: generated.audit ?? null },
            modelVersion: 'v3.0.0-local-explainable'
        })
        this.saveState({ ...state, poolId: pool.id })
        this.generatedPools.set(pool.id, generated)
        return this.database.getV3CandidatePool(pool.id)!
    }

    async nextBatch(input: { appSessionId?: string | null } = {}) {
        let state = this.state()
        if (input.appSessionId && input.appSessionId !== state.appSessionId)
            state = this.saveState({
                ...state,
                appSessionId: input.appSessionId
            })
        const pool = await this.ensurePool(state)
        const allocated = new Set(
            this.database.recommendationSeen(state.cycleId)
        )
        const remaining = pool.candidateIds.filter((id) => !allocated.has(id))
        const cached = this.generatedPools.get(pool.id) ?? {
            recommendations: this.database.recommendationRecords(
                pool.candidateIds
            ),
            profile: null,
            audit: { restoredFromCandidatePool: true }
        }
        this.generatedPools.set(pool.id, cached)
        const catalog = this.database.listComics({ limit: 5000 })
        const favorites = catalog.filter((item) => item.isFavorite)
        const profile = buildBehaviorProfile(
            buildV3Profile(favorites, catalog),
            this.database.listUserEvents({ limit: 5000 }),
            catalog,
            state.appSessionId
        )
        const ranked = rankV3(
            catalog.filter((item) => remaining.includes(item.comicId)),
            favorites,
            profile,
            this.database.listUserEvents({ limit: 5000 })
        )
        const reranked = rerankV3(
            ranked,
            new Map(catalog.map((item) => [item.comicId, item])),
            AdaptiveRecommendationSession.batchSize
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
        const contextId = randomUUID()
        this.database.allocateRecommendationIds(
            state.cycleId,
            recommendations.map((item) => item.comic.comicId)
        )
        const batch = this.database.saveV3Batch({
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
            batchSize: AdaptiveRecommendationSession.batchSize,
            batchCount: Math.max(
                1,
                Math.ceil(
                    pool.candidateIds.length /
                        AdaptiveRecommendationSession.batchSize
                )
            ),
            recommendations,
            profile,
            audit: cached?.audit,
            contextId,
            candidatePoolId: pool.id,
            adaptive: true,
            seenCount: this.database.recommendationSeen(state.cycleId).length,
            exhausted: recommendations.length === 0,
            nextSessionReady: remaining.length > recommendations.length
        }
    }

    async restart(input: { appSessionId?: string | null } = {}) {
        this.saveState({
            cycleId: randomUUID(),
            poolId: null,
            batchIndex: -1,
            appSessionId: input.appSessionId ?? null
        })
        return this.nextBatch(input)
    }

    status() {
        const state = this.state()
        const pool = state.poolId
            ? this.database.getV3CandidatePool(state.poolId)
            : null
        const batches = pool ? this.database.listV3Batches(pool.id) : []
        const last = batches.at(-1)
        return {
            ...state,
            adaptive: true,
            contextId: last?.contextId ?? null,
            recommendations: last
                ? this.database.recommendationRecords(last.itemIds)
                : [],
            seenCount: this.database.recommendationSeen(state.cycleId).length,
            preparing: !pool
        }
    }
}
