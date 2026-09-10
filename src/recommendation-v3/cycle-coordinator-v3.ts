import { randomUUID } from 'node:crypto'
import type { LibraryDatabase } from '../library/database'
import type { FinalLifetimeProfileV3 } from './final-profile'
import type { RecommendationIntentV3 } from './intent-planner-v3'
import type { RetrievalRouteV3 } from './provider-query-translator'
import type { RankedCandidateWithEvidenceV3 } from './ranker-adapter-v3'
import type { PoolReadinessV3 } from './retriever-v3'
import {
    allocateRecommendationBatchV3,
    BATCH_ALLOCATOR_VERSION,
    FINAL_BATCH_SIZE
} from './batch-allocator-v3'

export const CYCLE_COORDINATOR_VERSION = '3.2.0-schema8-visible-cap'
export const MAX_VISIBLE_BATCHES_PER_CYCLE = 6
export const RECENT_CYCLE_COOLDOWN_COUNT = 2

export interface V3CycleVersions {
    profileVersion: string
    registryVersion: string
    rankerModelVersion: string
    candidatePoolVersion: string
    allocatorVersion: string
}

export interface BuiltRecommendationCycleV3 {
    profile: FinalLifetimeProfileV3
    intents: RecommendationIntentV3[]
    routes: RetrievalRouteV3[]
    ranked: RankedCandidateWithEvidenceV3[]
    readiness: PoolReadinessV3
    telemetry: Record<string, unknown>
    versions: V3CycleVersions
}

interface CoordinatorStateV3 {
    schemaVersion: 1
    activeCycleId: string | null
    buildingCycleId: string | null
    activeBatchIndex: number
    previousUsableCycleId: string | null
    buildingRequestId: string | null
    versions: V3CycleVersions
}

export class CycleCoordinatorV3 {
    private readonly stateKey = 'recommendation.v3.activeCycle.v1'
    private buildPromise: Promise<void> | null = null
    private readonly mutationPromises = new Map<string, Promise<unknown>>()

    constructor(
        private readonly database: LibraryDatabase,
        private readonly buildCycle: (
            cycleId: string
        ) => Promise<BuiltRecommendationCycleV3>,
        private readonly versions: V3CycleVersions
    ) {}

    private state(): CoordinatorStateV3 {
        const current = this.database.getAppState<CoordinatorStateV3>(
            this.stateKey
        )
        if (current?.schemaVersion === 1) return current
        return this.saveState({
            schemaVersion: 1,
            activeCycleId: null,
            buildingCycleId: null,
            activeBatchIndex: -1,
            previousUsableCycleId: null,
            buildingRequestId: null,
            versions: this.versions
        })
    }

    private saveState(state: CoordinatorStateV3) {
        this.database.setAppState(this.stateKey, state)
        return state
    }

    private pool(cycleId: string | null) {
        return cycleId ? this.database.latestV3CandidatePool(cycleId) : null
    }

    private poolState(cycleId: string | null) {
        const state = this.pool(cycleId)?.telemetry.state
        return typeof state === 'string' ? state : null
    }

    private recentlyDisplayedComicIds(activeCycleId: string) {
        const cycleIds: string[] = []
        const seenCycles = new Set<string>()
        for (const pool of this.database.listV3CandidatePools(30)) {
            if (pool.cycleId === activeCycleId || seenCycles.has(pool.cycleId))
                continue
            const state = String(pool.telemetry.state ?? '')
            if (state !== 'SUPERSEDED' && state !== 'EXHAUSTED') continue
            seenCycles.add(pool.cycleId)
            cycleIds.push(pool.cycleId)
            if (cycleIds.length >= RECENT_CYCLE_COOLDOWN_COUNT) break
        }
        return new Set(
            cycleIds.flatMap((cycleId) =>
                this.database.recommendationSeen(cycleId)
            )
        )
    }

    private async completeBuild(
        cycleId: string,
        requestId: string,
        previousActive: string | null
    ) {
        try {
            const built = await this.buildCycle(cycleId)
            const identity = [
                built.profile.favoriteFingerprint,
                built.profile.registryVersion,
                built.profile.profileVersion
            ].join(':')
            const profile = this.database.saveOrReuseV3Profile({
                profileKind: 'LIFETIME_V3_V1',
                evidenceCutoff: built.profile.generatedAt,
                modelVersion: built.profile.profileVersion,
                identity,
                profile: built.profile as unknown as Record<string, unknown>
            })
            this.database.saveV3CandidatePool({
                cycleId,
                candidateIds: built.ranked.map((item) => item.comicId),
                modelVersion: built.versions.candidatePoolVersion,
                telemetry: {
                    schemaVersion: 1,
                    state: built.readiness,
                    profileId: profile.id,
                    profileReused: profile.reused,
                    intentPlan: built.intents,
                    routes: built.routes,
                    rankedCandidates: built.ranked.map((item) => ({
                        comicId: item.comicId,
                        rawRank: item.rawRank,
                        score: item.score,
                        features: item.features,
                        reasons: item.reasons,
                        evidence: item.evidence
                    })),
                    readiness: built.readiness,
                    versions: built.versions,
                    completedAt: new Date().toISOString(),
                    buildRequestId: requestId,
                    telemetry: built.telemetry
                }
            })
            const current = this.state()
            if (current.buildingCycleId !== cycleId) return
            if (previousActive)
                this.database.updateV3CandidatePoolState(
                    previousActive,
                    'SUPERSEDED'
                )
            this.saveState({
                ...current,
                activeCycleId: cycleId,
                buildingCycleId: null,
                activeBatchIndex: -1,
                previousUsableCycleId: previousActive,
                buildingRequestId: null,
                versions: built.versions
            })
        } catch (error) {
            const current = this.state()
            if (current.buildingCycleId === cycleId)
                this.saveState({
                    ...current,
                    buildingCycleId: null,
                    buildingRequestId: null
                })
            throw error
        }
    }

    private startBuild(requestId: string) {
        const current = this.state()
        if (current.buildingCycleId) return this.status()
        const cycleId = randomUUID()
        const next = this.saveState({
            ...current,
            buildingCycleId: cycleId,
            buildingRequestId: requestId
        })
        this.buildPromise = this.completeBuild(
            cycleId,
            requestId,
            current.activeCycleId
        ).finally(() => {
            this.buildPromise = null
        })
        void this.buildPromise.catch(() => undefined)
        return { ...this.status(), buildingCycleId: next.buildingCycleId }
    }

    resumeOrCreate(requestId = `resume:${randomUUID()}`) {
        const current = this.state()
        if (current.activeCycleId || current.buildingCycleId)
            return this.status()
        return this.startBuild(requestId)
    }

    forceNew(requestId: string) {
        if (!requestId) throw new Error('requestId is required for force_new')
        const current = this.state()
        if (
            current.buildingRequestId === requestId ||
            this.pool(current.activeCycleId)?.telemetry.buildRequestId ===
                requestId
        )
            return this.status()
        return this.startBuild(requestId)
    }

    async waitForBuild() {
        await this.buildPromise
        return this.status()
    }

    status() {
        const state = this.state()
        const activePool = this.pool(state.activeCycleId)
        const activePoolState = this.poolState(state.activeCycleId)
        return {
            engine: 'v3' as const,
            activeCycleId: state.activeCycleId,
            buildingCycleId: state.buildingCycleId,
            activeBatchIndex: state.activeBatchIndex,
            previousUsableCycleId: state.previousUsableCycleId,
            activeCycleState: activePool
                ? state.activeBatchIndex >= 0
                    ? 'ACTIVE'
                    : activePoolState
                : null,
            buildingCycleState: state.buildingCycleId ? 'BUILDING' : null,
            poolId: activePool?.id ?? null,
            poolReadiness: activePool?.telemetry.readiness ?? null,
            versions: state.versions,
            fallbackMode: 'NONE' as const
        }
    }

    private responseForBatch(
        batch: ReturnType<LibraryDatabase['saveV3BatchAndAllocate']>
    ) {
        const state = this.state()
        const pool = this.database.getV3CandidatePool(batch.poolId)
        const exhausted =
            batch.itemIds.length === 0 || pool?.telemetry.state === 'EXHAUSTED'
        return {
            ...this.status(),
            cycleId: batch.cycleId,
            poolId: batch.poolId,
            batchId: batch.id,
            batchIndex: batch.batchIndex,
            contextId: batch.contextId,
            batchSize: FINAL_BATCH_SIZE,
            maxVisibleBatches: MAX_VISIBLE_BATCHES_PER_CYCLE,
            recommendations: this.database.recommendationRecords(batch.itemIds),
            evidence: batch.evidence,
            exhausted,
            cycleState: exhausted ? 'EXHAUSTED' : 'ACTIVE',
            poolReadiness: pool?.telemetry.readiness ?? null,
            activeBatchIndex: state.activeBatchIndex
        }
    }

    private existingRequest(poolId: string, requestId: string) {
        return this.database
            .listV3Batches(poolId)
            .find((batch) => batch.evidence.requestId === requestId)
    }

    private allocate(requestId: string, next: boolean) {
        const state = this.state()
        if (!state.activeCycleId)
            return {
                ...this.status(),
                recommendations: [],
                cycleState: 'BUILDING'
            }
        const pool = this.pool(state.activeCycleId)
        if (!pool) throw new Error('Active V3 candidate pool is unavailable')
        const existing = next
            ? this.existingRequest(pool.id, requestId)
            : undefined
        if (existing) return this.responseForBatch(existing)
        const batches = this.database.listV3Batches(pool.id)
        const last = batches.at(-1)
        if (!next && last) return this.responseForBatch(last)
        if (
            next &&
            last &&
            last.batchIndex >= MAX_VISIBLE_BATCHES_PER_CYCLE - 1
        ) {
            this.database.updateV3CandidatePoolState(
                state.activeCycleId,
                'EXHAUSTED'
            )
            return this.responseForBatch(last)
        }
        const telemetry = pool.telemetry as {
            intentPlan?: RecommendationIntentV3[]
            rankedCandidates?: Array<
                Omit<RankedCandidateWithEvidenceV3, 'comic'>
            >
        }
        const catalog = new Map(
            this.database
                .listComics({ limit: 10000 })
                .map((comic) => [comic.comicId, comic])
        )
        const ranked = (telemetry.rankedCandidates ?? []).flatMap((item) => {
            const comic = catalog.get(item.comicId)
            return comic ? [{ ...item, comic }] : []
        })
        const favoriteIds = new Set(
            [...catalog.values()]
                .filter((comic) => comic.isFavorite)
                .map((comic) => comic.comicId)
        )
        const allocated = allocateRecommendationBatchV3({
            ranked,
            intents: telemetry.intentPlan ?? [],
            alreadyAllocated: new Set(
                this.database.recommendationSeen(state.activeCycleId)
            ),
            currentFavoriteIds: favoriteIds,
            recentlyDisplayedComicIds: this.recentlyDisplayedComicIds(
                state.activeCycleId
            )
        })
        const batchIndex = last ? last.batchIndex + 1 : 0
        const batch = this.database.saveV3BatchAndAllocate({
            poolId: pool.id,
            cycleId: state.activeCycleId,
            batchIndex,
            contextId: randomUUID(),
            itemIds: allocated.map((item) => item.comicId),
            evidence: {
                schemaVersion: 1,
                allocatorVersion: BATCH_ALLOCATOR_VERSION,
                requestId,
                items: allocated
            }
        })
        if (
            allocated.length === 0 ||
            batchIndex >= MAX_VISIBLE_BATCHES_PER_CYCLE - 1
        )
            this.database.updateV3CandidatePoolState(
                state.activeCycleId,
                'EXHAUSTED'
            )
        this.saveState({ ...state, activeBatchIndex: batchIndex })
        return this.responseForBatch(batch)
    }

    current() {
        return this.allocate('CURRENT', false)
    }

    next(requestId: string) {
        if (!requestId) throw new Error('requestId is required for next')
        const key = `NEXT:${requestId}`
        const existing = this.mutationPromises.get(key)
        if (existing) return existing
        const promise = Promise.resolve().then(() =>
            this.allocate(requestId, true)
        )
        this.mutationPromises.set(key, promise)
        void promise.finally(() => this.mutationPromises.delete(key))
        return promise
    }
}
