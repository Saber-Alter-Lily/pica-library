import {
    allocateRecommendationBatchV3,
    BATCH_ALLOCATOR_VERSION,
    FINAL_BATCH_SIZE
} from '../recommendation-v3/batch-allocator-v3'
import { RecommendationCycleQueriesV3 } from './queries'
import {
    defaultCoordinatorStateV3,
    MAX_VISIBLE_BATCHES_PER_CYCLE,
    type CoordinatorStateV3,
    type RecommendationCycleWritePortV3,
    type RecommendationCycleBuildPortV3,
    type RecommendationCycleRuntimeV3,
    type V3CycleVersions
} from './ports'

/** Explicit generation/allocation commands. I/O is supplied by application ports. */
export class RecommendationCycleCommandsV3 {
    private buildPromise: Promise<void> | null = null
    private readonly mutationPromises = new Map<string, Promise<unknown>>()

    private readonly reads: RecommendationCycleQueriesV3
    constructor(
        private readonly store: RecommendationCycleWritePortV3,
        private readonly buildCycle: RecommendationCycleBuildPortV3,
        private readonly versions: V3CycleVersions,
        private readonly runtime: RecommendationCycleRuntimeV3
    ) {
        this.reads = new RecommendationCycleQueriesV3(store, versions)
    }

    private state(): CoordinatorStateV3 {
        const current = this.store.readState()
        return current?.schemaVersion === 1
            ? current
            : this.saveState(defaultCoordinatorStateV3(this.versions))
    }

    private saveState(state: CoordinatorStateV3) {
        return this.store.writeState(state)
    }

    private notifyBuild(cycleId: string, state: 'persisting' | 'committed' | 'failed' | 'discarded', error?: unknown) {
        // A presentation observer must not roll back or mask a storage result.
        try { this.runtime.onBuildState?.(cycleId, state, error) } catch { /* non-authoritative observer */ }
    }

    private async completeBuild(
        cycleId: string,
        requestId: string,
        previousActive: string | null
    ) {
        try {
            const built = await this.buildCycle(cycleId)
            if (built.readiness === 'FAILED_INSUFFICIENT_POOL')
                throw new Error(
                    'Recommendation generation did not produce a usable pool; previous recommendations were kept'
                )
            this.notifyBuild(cycleId, 'persisting')
            const identity = [
                built.profile.favoriteFingerprint,
                built.profile.registryVersion,
                built.profile.profileVersion
            ].join(':')
            const profile = this.store.saveOrReuseV3Profile({
                profileKind: 'LIFETIME_V3_V1',
                evidenceCutoff: built.profile.generatedAt,
                modelVersion: built.profile.profileVersion,
                identity,
                profile: built.profile as unknown as Record<string, unknown>
            })
            this.store.saveV3CandidatePool({
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
                        evidence: item.evidence,
                        feedbackAdjustment: item.feedbackAdjustment,
                        visual: (item as { visual?: unknown }).visual
                    })),
                    readiness: built.readiness,
                    versions: built.versions,
                    completedAt: this.runtime.now(),
                    buildRequestId: requestId,
                    telemetry: built.telemetry
                }
            })
            const current = this.state()
            if (current.buildingCycleId !== cycleId) {
                this.notifyBuild(cycleId, 'discarded')
                return
            }
            if (previousActive)
                this.store.updateV3CandidatePoolState(
                    previousActive,
                    'SUPERSEDED'
                )
            this.reads.clearCache()
            this.saveState({
                ...current,
                activeCycleId: cycleId,
                buildingCycleId: null,
                activeBatchIndex: -1,
                previousUsableCycleId: previousActive,
                buildingRequestId: null,
                versions: built.versions
            })
            this.notifyBuild(cycleId, 'committed')
        } catch (error) {
            this.notifyBuild(cycleId, 'failed', error)
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
        const cycleId = this.runtime.createId()
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

    resumeOrCreate(requestId = `resume:${this.runtime.createId()}`) {
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
            this.reads.pool(current.activeCycleId)?.telemetry.buildRequestId ===
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
        return this.reads.status()
    }

    private existingRequest(poolId: string, requestId: string) {
        return this.store
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
        const pool = this.reads.pool(state.activeCycleId)
        if (!pool) throw new Error('Active V3 candidate pool is unavailable')
        const existing = next
            ? this.existingRequest(pool.id, requestId)
            : undefined
        if (existing) return this.reads.responseForBatch(existing)
        const batches = this.store.listV3Batches(pool.id)
        const last = batches.at(-1)
        if (!next && last) return this.reads.responseForBatch(last)
        if (
            next &&
            last &&
            last.batchIndex >= MAX_VISIBLE_BATCHES_PER_CYCLE - 1
        ) {
            this.store.updateV3CandidatePoolState(
                state.activeCycleId,
                'EXHAUSTED'
            )
            return this.reads.responseForBatch(last)
        }
        const snapshot = this.reads.servingSnapshot(state.activeCycleId, pool)
        const allocated = allocateRecommendationBatchV3({
            ranked: snapshot.eligibleRanked,
            intents: snapshot.intents,
            alreadyAllocated: new Set(
                this.store.recommendationSeen(state.activeCycleId)
            ),
            currentFavoriteIds: snapshot.favoriteIds,
            recentlyDisplayedComicIds: snapshot.recentlyDisplayedComicIds
        })
        const batchIndex = last ? last.batchIndex + 1 : 0
        const batch = this.store.saveV3BatchAndAllocate({
            poolId: pool.id,
            cycleId: state.activeCycleId,
            batchIndex,
            contextId: this.runtime.createId(),
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
            this.store.updateV3CandidatePoolState(
                state.activeCycleId,
                'EXHAUSTED'
            )
        this.saveState({ ...state, activeBatchIndex: batchIndex })
        return this.reads.responseForBatch(batch)
    }

    portable(limit?: number) {
        return this.reads.portable(limit)
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
