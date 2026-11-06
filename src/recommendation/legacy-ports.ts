import type { LibraryDatabase } from '../library/database'
import type { FavoriteRecord, RecommendationResult } from '../library/types'
import type { TagPolicyCarrierV1 } from '../tags/policy'
import type { Pica } from '../sdk'
import type { Comic } from '../types'

export const LEGACY_RECOMMENDATION_BATCH_SIZE = 12
export const LEGACY_RECOMMENDATION_SESSION_SIZE = 60
export const LEGACY_RECOMMENDATION_CANDIDATE_DEPTH = 500

export interface LegacyRecommendationOptions {
    limit?: number
    seedCount?: number
    appSessionId?: string | null
}

export interface LegacyGeneratedRecommendations {
    recommendations: RecommendationResult[]
    profile: unknown
    audit?: unknown
}

/** Historical Pica recall only. This is not a claim of cross-source SDK compatibility. */
export type LegacyRecallClient = Pick<
    Pica,
    'Order' | 'related' | 'comicsPage' | 'search'
>
export interface LegacyRecallPorts {
    read: Pick<
        LibraryDatabase,
        'listComics' | 'listUserEvents' | 'listRecommendationEdges'
    >
    write: Pick<LibraryDatabase, 'recordRecommendationEdge' | 'importCatalog'>
    tagPolicy(): TagPolicyCarrierV1
    openProvider(): Promise<{
        client: LegacyRecallClient
        assertCurrent(): void
    }>
    convert(comic: Comic): FavoriteRecord
    runtime: {
        nowMs(): number
        nowIso(): string
        /** Supplied by existing p-limit; no replacement scheduler in this domain. */
        limit(concurrency: number): <T>(work: () => Promise<T>) => Promise<T>
    }
}

export interface LegacySessionState {
    cycleId: string
    currentSessionNo: number
    currentBatchIndex: number
}
export interface AdaptiveSessionState {
    cycleId: string
    poolId: string | null
    batchIndex: number
    appSessionId: string | null
}
export interface SessionRuntime {
    createId(): string
}
export interface LegacySessionReadPort
    extends Pick<
        LibraryDatabase,
        'recommendationSession' | 'recommendationRecords' | 'recommendationSeen'
    > {
    readState(): LegacySessionState | undefined
}
export interface LegacySessionWritePort
    extends Pick<LibraryDatabase, 'saveRecommendationSession'> {
    writeState(state: LegacySessionState): void
}
export interface AdaptiveSessionReadPort
    extends Pick<
        LibraryDatabase,
        | 'getV3CandidatePool'
        | 'recommendationSeen'
        | 'recommendationRecords'
        | 'listComics'
        | 'listUserEvents'
        | 'listV3Batches'
    > {
    readState(): AdaptiveSessionState | undefined
}
export interface AdaptiveSessionWritePort
    extends Pick<
        LibraryDatabase,
        'saveV3CandidatePool' | 'allocateRecommendationIds' | 'saveV3Batch'
    > {
    writeState(state: AdaptiveSessionState): void
    /** Existing synchronous nested-safe SQLite savepoint. No async callback allowed. */
    atomic<T>(operation: () => T): T
}
