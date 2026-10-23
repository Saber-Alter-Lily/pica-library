import type { StoredComic } from '../library/types'
import type { FinalLifetimeProfileV3 } from '../recommendation-v3/final-profile'
import type { IntentCycleHistory } from '../recommendation-v3/intent-planner-v3'
import type { RetrieverProviderV3 } from '../recommendation-v3/retriever-v3'
import type { TagResolutionV3 } from '../recommendation-v3/tag-resolution-v3'
import type {
    RecommendationFeedbackState,
    VisualEmbeddingRecord,
    VisualInfluenceStrength,
    VisualRerankMode
} from '../recommendation-v4/visual-style'
import type { PortablePolicyStateV5 } from '../recommendation-v5/portable-policy'
import type { V3CycleVersions } from './ports'

export type RecommendationBuildPhaseV3 =
    | 'intents'
    | 'routes'
    | 'providers'
    | 'retrieve'
    | 'rank'
    | 'visual'
    | 'complete'

export interface RecommendationBuildVisualInputV3 {
    settings: {
        enabled: boolean
        rerankMode: VisualRerankMode
        strength: VisualInfluenceStrength
        [key: string]: unknown
    }
    embeddings: VisualEmbeddingRecord[]
}

/** Stage-specific snapshots preserve existing observation timing; no SQL handle. */
export interface RecommendationBuildEvidencePortV3 {
    catalog(): StoredComic[]
    policy(): PortablePolicyStateV5
    readingComicIds(): string[]
    feedback(): RecommendationFeedbackState[]
    intentHistory(): IntentCycleHistory[]
    graphEdges(): Array<{
        sourceComicId: string
        targetComicId: string
        confidence: number
        observationCount: number
    }>
    visualInput(): RecommendationBuildVisualInputV3
}

/** Registry loading/hashing is an application capability, not domain file I/O. */
export interface RecommendationBuildSemanticsV3 {
    profile(records: StoredComic[]): FinalLifetimeProfileV3
    resolve(raw: string): TagResolutionV3
}

export interface RecommendationBuildProviderV3 {
    provider: RetrieverProviderV3
    prepare(): Promise<void>
    telemetry(): {
        ehRequests: number
        exhRequests: number
        exhAvailable: boolean
    }
}

/** Only explicit build commands receive these capabilities. GET/read ports do not. */
export interface RecommendationBuildPortsV3 {
    evidence: RecommendationBuildEvidencePortV3
    openProvider(): Promise<RecommendationBuildProviderV3>
    loadSemantics(): RecommendationBuildSemanticsV3
    checkpoint(): Promise<void>
    progress(phase: RecommendationBuildPhaseV3): void
    assertSourcesCurrent(): void
    readonly versions: V3CycleVersions
}
