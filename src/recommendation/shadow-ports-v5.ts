import type { StoredComic } from '../library/types'
import type { PortablePolicyStateV5 } from '../recommendation-v5/portable-policy'
import type { VisualEmbeddingRecord } from '../recommendation-v4/visual-style'
import type { TagResolutionV3 } from '../recommendation-v3/tag-resolution-v3'
import type { compileCandidateProviderRoutesV5 } from '../recommendation-v5/provider-query-compiler'
import type { buildPreferenceTimescalesV5 } from '../recommendation-v5/preference-timescales'
import type { ShadowRetrievalAdapterV5 } from '../recommendation-v5/shadow-retrieval'

export const RECOMMENDATION_V5_SHADOW_RETRIEVAL_CONFIRMATION =
    'RUN_RECOMMENDATION_V5_SHADOW_RETRIEVAL'

/** Existing public task shape, kept compatible through the LibraryService re-export. */
export interface RecommendationV5ShadowTaskProgress {
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
        | 'planning'
        | 'retrieving'
        | 'hygiene'
        | 'ranking'
        | 'diversity'
        | 'audit'
        | 'persisting'
        | 'paused'
        | 'complete'
        | 'failed'
        | 'cancelled'
    done: number
    total: number
    retrievalDone: number
    retrievalTotal: number
    rawCandidateCount: number
    candidateCount: number
    rankedCandidateCount: number
    selectedCount: number
    startedAt?: string
    updatedAt?: string
    error?: string
    poolId?: string
    cycleId?: string
    modelVersion?: string
}

export interface RecommendationShadowRuntimeV5 {
    checkpoint?: () => Promise<void> | void
    onProgress?: (progress: Partial<RecommendationV5ShadowTaskProgress>) => void
}

export interface RecommendationShadowAuditInputV5 {
    appSessionId: string | null
    cycleId: string
    candidateIds: string[]
    modelVersion: string
    telemetry: Record<string, unknown>
}

/** Manual audit only. No SQL handle, credential/session, raw-catalog writer or serving activation. */
export interface RecommendationShadowPortsV5 {
    evidence: {
        catalog(): StoredComic[]
        policy(): PortablePolicyStateV5
        embeddings(): VisualEmbeddingRecord[]
    }
    plan(
        appSessionId: string | null,
        limit: number
    ): ReturnType<typeof compileCandidateProviderRoutesV5>
    timescales(
        appSessionId: string | null,
        limit: number
    ): ReturnType<typeof buildPreferenceTimescalesV5>
    openProvider(): ShadowRetrievalAdapterV5
    loadTagResolver(): (raw: string) => TagResolutionV3
    createCycleId(): string
    assertSourcesCurrent(): void
    audit: {
        save(input: RecommendationShadowAuditInputV5): {
            id: string
            generatedAt: string
            candidateIds: string[]
        }
    }
}
