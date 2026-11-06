import type { RankedCandidateWithEvidenceV3 } from '../recommendation-v3/ranker-adapter-v3'
import type { RecommendationIntentV3 } from '../recommendation-v3/intent-planner-v3'
import { FINAL_BATCH_SIZE } from '../recommendation-v3/batch-allocator-v3'
import {
    activeTemporarySuppressionsV5,
    filterCandidatesAgainstOwnedV5
} from '../recommendation-v5/portable-policy'
import {
    defaultCoordinatorStateV3,
    MAX_VISIBLE_BATCHES_PER_CYCLE,
    RECENT_CYCLE_COOLDOWN_COUNT,
    type RecommendationBatchV3,
    type RecommendationCycleReadPortV3,
    type V3CycleVersions
} from './ports'

interface FrozenCycleServingSnapshotV3 {
    poolId: string
    ownershipKey: string
    eligibleRanked: RankedCandidateWithEvidenceV3[]
    eligibleById: Map<string, RankedCandidateWithEvidenceV3>
    intents: RecommendationIntentV3[]
    favoriteIds: Set<string>
    recentlyDisplayedComicIds: Set<string>
    servingFilterTelemetry: Record<string, unknown>
}

/** Local persisted results only. No generation, identity creation or storage mutation capability. */
export class RecommendationCycleQueriesV3 {
    private readonly servingSnapshots = new Map<
        string,
        FrozenCycleServingSnapshotV3
    >()
    constructor(
        private readonly store: RecommendationCycleReadPortV3,
        private readonly versions: V3CycleVersions
    ) {}

    state() {
        const current = this.store.readState()
        return current?.schemaVersion === 1
            ? current
            : defaultCoordinatorStateV3(this.versions)
    }

    clearCache() {
        this.servingSnapshots.clear()
    }

    pool(cycleId: string | null) {
        return cycleId ? this.store.latestV3CandidatePool(cycleId) : null
    }

    private poolState(cycleId: string | null) {
        const state = this.pool(cycleId)?.telemetry.state
        return typeof state === 'string' ? state : null
    }

    private recentlyDisplayedComicIds(activeCycleId: string) {
        const cycleIds: string[] = []
        const seenCycles = new Set<string>()
        for (const pool of this.store.listV3CandidatePools(30)) {
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
                this.store.recommendationSeen(cycleId)
            )
        )
    }

    servingSnapshot(
        cycleId: string,
        pool = this.pool(cycleId)
    ): FrozenCycleServingSnapshotV3 {
        if (!pool) throw new Error('Active V3 candidate pool is unavailable')
        const telemetry = pool.telemetry as {
            intentPlan?: RecommendationIntentV3[]
            rankedCandidates?: Array<
                Omit<RankedCandidateWithEvidenceV3, 'comic'>
            >
        }
        const policy = this.store.readPolicy()
        const ownership = this.store.recommendationOwnershipState()
        const ownedComicIds = new Set([
            ...ownership.ownedComicIds,
            ...policy.ownedComicIds
        ])
        const ownershipKey = JSON.stringify({
            ownedComicIds: [...ownedComicIds].sort(),
            identityBindingsVersion: ownership.identityBindingsVersion,
            explicitDistinctPairs: [...policy.explicitDistinctPairs].sort(),
            hardSuppressComicIds: policy.hardSuppressComicIds,
            seenComicIds: policy.seenComicIds,
            duplicateReportComicIds: policy.duplicateReportComicIds,
            temporarySuppressions: activeTemporarySuppressionsV5(policy),
            blockControls: policy.controls.filter(
                (control) => control.direction === 'BLOCK'
            ),
            tagPolicy: policy.tagPolicy
        })
        const existing = this.servingSnapshots.get(cycleId)
        if (
            existing?.poolId === pool.id &&
            existing.ownershipKey === ownershipKey
        )
            return existing

        const bindings = this.store.listAllWorkIdentityBindings()
        const ownedWorkIds = new Set(
            bindings
                .filter((binding) => ownedComicIds.has(binding.comicId))
                .map((binding) => binding.workId)
        )
        const canonicalOwnedComicIds = bindings
            .filter((binding) => ownedWorkIds.has(binding.workId))
            .map((binding) => binding.comicId)
        const servingPolicy = {
            ...policy,
            ownedComicIds: [
                ...new Set([...policy.ownedComicIds, ...canonicalOwnedComicIds])
            ]
        }
        const rankedCandidateIds = (telemetry.rankedCandidates ?? []).map(
            (item) => item.comicId
        )
        const filterCatalog = this.store.getComicsByIds([
            ...new Set([
                ...ownership.ownedComicIds,
                ...servingPolicy.ownedComicIds,
                ...rankedCandidateIds
            ])
        ])
        const filterCatalogById = new Map(
            filterCatalog.map((comic) => [comic.comicId, comic])
        )
        const ranked = (telemetry.rankedCandidates ?? []).flatMap((item) => {
            const comic = filterCatalogById.get(item.comicId)
            return comic ? [{ ...item, comic }] : []
        })
        const serving = filterCandidatesAgainstOwnedV5(
            ranked,
            filterCatalog,
            servingPolicy
        )
        const eligibleRanked = serving.rows
        const snapshot: FrozenCycleServingSnapshotV3 = {
            poolId: pool.id,
            ownershipKey,
            eligibleRanked,
            eligibleById: new Map(
                eligibleRanked.map((item) => [item.comicId, item])
            ),
            intents: telemetry.intentPlan ?? [],
            favoriteIds: new Set(this.store.favoriteIds()),
            recentlyDisplayedComicIds: this.recentlyDisplayedComicIds(cycleId),
            servingFilterTelemetry: {
                ...serving.telemetry,
                canonicalOwnedWorkCount: ownedWorkIds.size,
                canonicalOwnedUploadCount: canonicalOwnedComicIds.length
            }
        }
        this.servingSnapshots.set(cycleId, snapshot)
        while (this.servingSnapshots.size > 2) {
            const oldest = this.servingSnapshots.keys().next().value
            if (!oldest) break
            this.servingSnapshots.delete(oldest)
        }
        return snapshot
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

    responseForBatch(batch: RecommendationBatchV3) {
        const state = this.state()
        const pool = this.store.getV3CandidatePool(batch.poolId)
        const snapshot = this.servingSnapshot(batch.cycleId, pool)
        const recommendations = batch.itemIds.flatMap((id) => {
            const item = snapshot.eligibleById.get(id)
            return item ? [item] : []
        })
        const exhausted =
            recommendations.length === 0 ||
            pool?.telemetry.state === 'EXHAUSTED'
        return {
            ...this.status(),
            cycleId: batch.cycleId,
            poolId: batch.poolId,
            batchId: batch.id,
            batchIndex: batch.batchIndex,
            contextId: batch.contextId,
            batchSize: FINAL_BATCH_SIZE,
            maxVisibleBatches: MAX_VISIBLE_BATCHES_PER_CYCLE,
            recommendations,
            servingFilteredCount: batch.itemIds.length - recommendations.length,
            servingFilterTelemetry: {
                frozenCycleSnapshot: true,
                cacheSize: snapshot.eligibleRanked.length,
                ...snapshot.servingFilterTelemetry
            },
            evidence: batch.evidence,
            exhausted,
            cycleState: exhausted ? 'EXHAUSTED' : 'ACTIVE',
            poolReadiness: pool?.telemetry.readiness ?? null,
            activeBatchIndex: state.activeBatchIndex
        }
    }

    portable(limit = FINAL_BATCH_SIZE * MAX_VISIBLE_BATCHES_PER_CYCLE) {
        const state = this.state(),
            pool = this.pool(state.activeCycleId)
        if (!state.activeCycleId || !pool)
            return {
                ...this.status(),
                items: [],
                source: 'final-v3-portable-cache',
                cached: true
            }
        const snapshot = this.servingSnapshot(state.activeCycleId, pool)
        const bounded = Math.max(1, Math.min(120, Math.floor(limit)))
        const buildTelemetry = pool.telemetry.telemetry as
            | { recommendationV5?: { portableBaseline?: unknown } }
            | undefined
        return {
            ...this.status(),
            cycleId: state.activeCycleId,
            items: snapshot.eligibleRanked.slice(0, bounded),
            policyBaseline:
                buildTelemetry?.recommendationV5?.portableBaseline ?? null,
            source: 'final-v3-portable-cache',
            cached: true,
            servingFilterTelemetry: snapshot.servingFilterTelemetry
        }
    }

    current() {
        const state = this.state(),
            pool = this.pool(state.activeCycleId)
        const batch = pool
            ? this.store.listV3Batches(pool.id).at(-1)
            : undefined
        if (batch) return this.responseForBatch(batch)
        return {
            ...this.status(),
            recommendations: [],
            cycleState: pool ? 'READY_NO_BATCH' : 'BUILDING',
            awaitingFirstBatch: Boolean(pool)
        }
    }
}
