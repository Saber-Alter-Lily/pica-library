import type { LibraryDatabase } from '../library/database'
import type { StoredComic } from '../library/types'
import type { WorkIdentityPolicyFacts } from './types'
import type { buildWorkIdentityMaterializationPlanV5 } from '../recommendation-v5/work-identity-foundation'
export const WORK_IDENTITY_MATERIALIZATION_PREPARE_CONFIRMATION =
    'PREPARE_CANONICAL_WORK_BINDING'
export interface WorkIdentityEvidenceRefreshTaskProgress {
    state:
        | 'idle'
        | 'running'
        | 'pausing'
        | 'paused'
        | 'cancelling'
        | 'complete'
        | 'failed'
        | 'cancelled'
    phase:
        | 'idle'
        | 'loading'
        | 'bucketing'
        | 'comparing'
        | 'persisting'
        | 'paused'
        | 'complete'
        | 'failed'
        | 'cancelled'
    done: number
    total: number
    candidateCount: number
    pairChecks: number
    savedCount: number
    startedAt?: string
    updatedAt?: string
    error?: string
}
export interface WorkIdentityReadPortV5
    extends Pick<
        LibraryDatabase,
        | 'getWorkIdentityBinding'
        | 'listWorkIdentityBindingsForWork'
        | 'listWorkIdentityDecisionsForComic'
        | 'listWorkIdentityProbableEvidenceForComic'
        | 'listWorkIdentityBindingsByComicIds'
        | 'listVisualEmbeddings'
        | 'workIdentityStorageStatus'
        | 'listWorkIdentityEvidence'
        | 'listWorkIdentityDecisions'
        | 'listAllWorkIdentityDecisions'
        | 'listAllWorkIdentityBindings'
        | 'listWorkIdentityMaterializationRuns'
    > {
    catalog(): StoredComic[]
    policy(): WorkIdentityPolicyFacts
    digestPlan(
        plan: ReturnType<typeof buildWorkIdentityMaterializationPlanV5>
    ): string
}
export interface WorkIdentityWritePortV5
    extends Pick<
        LibraryDatabase,
        | 'saveWorkIdentityEvidence'
        | 'prepareWorkIdentityMaterializationRun'
        | 'clearWorkIdentityDecision'
        | 'saveWorkIdentityDecision'
        | 'workIdentityStorageStatus'
    > {
    setExplicitDistinctPair(
        left: string,
        right: string,
        distinct: boolean
    ): void
    atomic<T>(operation: () => T): T
}
export type WorkIdentityTaskReadPortV5 = Pick<
    WorkIdentityReadPortV5,
    'catalog' | 'policy'
>
export type WorkIdentityTaskWritePortV5 = Pick<
    WorkIdentityWritePortV5,
    'saveWorkIdentityEvidence'
>
export interface WorkIdentityTaskExecutionV5 {
    acquire(): Promise<{ release(): void }>
}
