import type { StoredComic } from '../library/types'
import type { FinalLifetimeProfileV3 } from '../recommendation-v3/final-profile'
import type { RecommendationIntentV3 } from '../recommendation-v3/intent-planner-v3'
import type { RetrievalRouteV3 } from '../recommendation-v3/provider-query-translator'
import type { RankedCandidateWithEvidenceV3 } from '../recommendation-v3/ranker-adapter-v3'
import type { PoolReadinessV3 } from '../recommendation-v3/retriever-v3'
import type { PortablePolicyStateV5 } from '../recommendation-v5/portable-policy'

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

export interface CoordinatorStateV3 {
    schemaVersion: 1
    activeCycleId: string | null
    buildingCycleId: string | null
    activeBatchIndex: number
    previousUsableCycleId: string | null
    buildingRequestId: string | null
    versions: V3CycleVersions
}

export function defaultCoordinatorStateV3(
    versions: V3CycleVersions
): CoordinatorStateV3 {
    return {
        schemaVersion: 1,
        activeCycleId: null,
        buildingCycleId: null,
        activeBatchIndex: -1,
        previousUsableCycleId: null,
        buildingRequestId: null,
        versions
    }
}

export interface RecommendationPoolV3 {
    id: string
    appSessionId: string | null
    cycleId: string
    generatedAt: string
    expiresAt: string | null
    modelVersion: string
    candidateIds: string[]
    telemetry: Record<string, unknown>
}

export interface RecommendationBatchV3 {
    id: string
    poolId: string
    cycleId: string
    sessionId?: string | null
    batchIndex: number
    contextId: string
    generatedAt: string
    itemIds: string[]
    evidence: Record<string, unknown>
}

/** Read capability only: no generic SQL, writes, provider clients or generation callback. */
export interface RecommendationCycleReadPortV3 {
    readState(): CoordinatorStateV3 | null
    readPolicy(): PortablePolicyStateV5
    latestV3CandidatePool(cycleId: string): RecommendationPoolV3 | null
    getV3CandidatePool(poolId: string): RecommendationPoolV3 | null
    listV3CandidatePools(limit: number): RecommendationPoolV3[]
    listV3Batches(poolId: string): RecommendationBatchV3[]
    getComicsByIds(ids: string[]): StoredComic[]
    recommendationOwnershipState(): {
        ownedComicIds: string[]
        identityBindingsVersion: string
    }
    listAllWorkIdentityBindings(): Array<{ comicId: string; workId: string }>
    recommendationSeen(cycleId: string): string[]
    favoriteIds(): string[]
}

/** The application gives this broader capability only to explicit cycle/batch commands. */
export interface RecommendationCycleWritePortV3
    extends RecommendationCycleReadPortV3 {
    writeState(state: CoordinatorStateV3): CoordinatorStateV3
    saveOrReuseV3Profile(input: {
        profileKind: string
        evidenceCutoff: string
        modelVersion: string
        identity: string
        profile: Record<string, unknown>
    }): { id: string; reused: boolean }
    saveV3CandidatePool(input: {
        cycleId: string
        candidateIds: string[]
        modelVersion: string
        telemetry: Record<string, unknown>
    }): unknown
    updateV3CandidatePoolState(cycleId: string, state: string): boolean
    saveV3BatchAndAllocate(input: {
        poolId: string
        cycleId: string
        batchIndex: number
        contextId: string
        itemIds: string[]
        evidence: Record<string, unknown>
    }): RecommendationBatchV3
}

export interface RecommendationCycleRuntimeV3 {
    createId(): string
    now(): string
    /** Optional UI observer. It cannot veto persistence or change stored state. */
    onBuildState?(cycleId: string, state: 'persisting' | 'committed' | 'failed' | 'discarded', error?: unknown): void
}

/** Existing retrieval/ranking is supplied by the application; queries never receive this port. */
export type RecommendationCycleBuildPortV3 = (
    cycleId: string
) => Promise<BuiltRecommendationCycleV3>
