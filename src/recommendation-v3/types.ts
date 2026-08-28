export type V3EventType =
    | 'search'
    | 'search_result_open'
    | 'recommend_batch_presented'
    | 'recommend_impression'
    | 'recommend_detail_open'
    | 'preview_open'
    | 'preview_more'
    | 'favorite_add'
    | 'favorite_remove'
    | 'shelf_add'
    | 'shelf_remove'
    | 'download_enqueue'
    | 'download_start'
    | 'download_complete'
    | 'download_cancel'
    | 'download_failed'
    | 'reader_open'
    | 'reader_progress'
    | 'reader_complete'
    | 'recommendation_restart'
    | 'recommendation_batch_advance'

export interface UserEventInput {
    id?: string
    occurredAt?: string
    eventType: V3EventType
    comicId?: string | null
    source?: string | null
    appSessionId?: string | null
    contextId?: string | null
    recommendationCycleId?: string | null
    recommendationSessionId?: string | null
    recommendationBatchIndex?: number | null
    rankPosition?: number | null
    metadata?: Record<string, unknown>
    dedupeKey?: string | null
}

export interface UserEvent extends Required<Pick<UserEventInput, 'eventType'>> {
    id: string
    occurredAt: string
    eventType: V3EventType
    comicId: string | null
    source: string | null
    appSessionId: string | null
    contextId: string | null
    recommendationCycleId: string | null
    recommendationSessionId: string | null
    recommendationBatchIndex: number | null
    rankPosition: number | null
    metadata: Record<string, unknown>
    dedupeKey: string | null
    createdAt: string
}

export interface ItemFeature {
    comicId: string
    author: string
    circle: string
    tags: string[]
    categories: string[]
    finished: boolean
    lengthBucket: 'short' | 'medium' | 'long' | 'unknown'
    popularityBucket: 'low' | 'medium' | 'high'
}

export interface TagPreference {
    tag: string
    favoriteCount: number
    favoriteSupport: number
    backgroundCount: number
    backgroundSupport: number
    enrichment: number
    reliability: number
    score: number
}

export interface TagCombinationPreference {
    order: 2 | 3
    tags: string[]
    favoriteCount: number
    favoriteSupport: number
    backgroundCount: number
    backgroundSupport: number
    enrichment: number
    withinFavoriteInteraction: number
    backgroundInteraction: number
    specificInteraction: number
    reliability: number
    score: number
}

export interface TasteCluster {
    clusterId: string
    weight: number
    size: number
    itemIds: string[]
    authors: string[]
    circles: string[]
    tags: string[]
    tagPairs: string[][]
    tagTriples: string[][]
    confidence: number
}

export interface V3Profile {
    historical: ProfileWindow
    lifetime: ProfileWindow
    recent: ProfileWindow
    session: ProfileWindow
    generatedAt: string
    modelVersion: string
    evidenceCutoff: string
}

export interface ProfileWindow {
    clusters: TasteCluster[]
    tags: TagPreference[]
    pairs: TagCombinationPreference[]
    triples: TagCombinationPreference[]
}

export interface V3RankingFeatures {
    historicalSimilarity: number
    historicalClusterSimilarity: number
    lifetimeSimilarity: number
    recentSimilarity: number
    sessionSimilarity: number
    authorAffinity: number
    circleAffinity: number
    singleTagAffinity: number
    pairInteractionBonus: number
    tripleInteractionBonus: number
    categorySimilarity: number
    itemSimilarity: number
    relatedGraphScore: number
    positiveBehaviorSimilarity: number
    negativeBehaviorPenalty: number
    popularity: number
    novelty: number
    previousImpressionCount: number
    recentExposurePenalty: number
    alreadyFavorite: boolean
    alreadyDownloaded: boolean
    alreadyRead: boolean
    recallRouteSupport: number
}

export interface V3Recommendation {
    comicId: string
    score: number
    features: V3RankingFeatures
    reasons: string[]
    provenance: Record<string, unknown>[]
}

export interface RecallTelemetry {
    route: string
    source?: string
    seedComicId?: string
    requestCount: number
    latencyMs: number
    rawCandidateCount: number
    uniqueCandidateCount: number
    duplicateCount: number
    routeFailures: number
    pageDepth: number
    yield: number
}

export interface V3CandidatePool {
    id: string
    cycleId: string
    appSessionId: string | null
    candidateIds: string[]
    generatedAt: string
    expiresAt: string | null
    telemetry: RecallTelemetry[]
}
