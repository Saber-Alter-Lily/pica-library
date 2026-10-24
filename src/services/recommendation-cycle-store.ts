import type { LibraryDatabase } from '../library/database'
import type {
    CoordinatorStateV3,
    RecommendationCycleReadPortV3,
    RecommendationCycleWritePortV3
} from '../recommendation/ports'
import { RecommendationPolicyStoreV5 } from '../recommendation-v5/policy-store'

const STATE_KEY = 'recommendation.v3.activeCycle.v1'

/** Bind existing SQLite methods. No schema, key or transaction implementation is duplicated. */
export function recommendationCycleReadStoreV3(
    database: LibraryDatabase
): RecommendationCycleReadPortV3 {
    const policy = new RecommendationPolicyStoreV5(database)
    return Object.freeze({
        readState: () =>
            database.getAppState<CoordinatorStateV3>(STATE_KEY) ?? null,
        readPolicy: () => policy.state({ initialize: false }),
        latestV3CandidatePool: (cycleId: string) =>
            database.latestV3CandidatePool(cycleId),
        getV3CandidatePool: (poolId: string) =>
            database.getV3CandidatePool(poolId),
        listV3CandidatePools: (limit: number) =>
            database.listV3CandidatePools(limit),
        listV3Batches: (poolId: string) => database.listV3Batches(poolId),
        getComicsByIds: (ids: string[]) => database.getComicsByIds(ids),
        recommendationOwnershipState: () =>
            database.recommendationOwnershipState(),
        listAllWorkIdentityBindings: () =>
            database.listAllWorkIdentityBindings(),
        recommendationSeen: (cycleId: string) =>
            database.recommendationSeen(cycleId),
        favoriteIds: () => database.favoriteIds()
    })
}

export function recommendationCycleWriteStoreV3(
    database: LibraryDatabase
): RecommendationCycleWritePortV3 {
    return Object.freeze({
        ...recommendationCycleReadStoreV3(database),
        writeState: (state: CoordinatorStateV3) => {
            database.setAppState(STATE_KEY, state)
            return state
        },
        saveOrReuseV3Profile: (
            input: Parameters<
                RecommendationCycleWritePortV3['saveOrReuseV3Profile']
            >[0]
        ) => database.saveOrReuseV3Profile(input),
        saveV3CandidatePool: (
            input: Parameters<
                RecommendationCycleWritePortV3['saveV3CandidatePool']
            >[0]
        ) => database.saveV3CandidatePool(input),
        updateV3CandidatePoolState: (cycleId: string, state: string) =>
            database.updateV3CandidatePoolState(cycleId, state),
        saveV3BatchAndAllocate: (
            input: Parameters<
                RecommendationCycleWritePortV3['saveV3BatchAndAllocate']
            >[0]
        ) => ({
            ...database.saveV3BatchAndAllocate(input),
            evidence: input.evidence
        })
    })
}
