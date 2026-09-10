export type SortMode =
    | 'latest'
    | 'oldest'
    | 'likes'
    | 'views'
    | 'title'
    | 'recommended'

export interface FavoriteRecord {
    position?: number
    comicId: string
    title: string
    author: string
    description?: string
    chineseTeam?: string
    categories: string[]
    tags: string[]
    finished: boolean
    createdAt?: string
    updatedAt?: string
    totalLikes?: number
    totalViews?: number
    pagesCount?: number
    epsCount?: number
    coverUrl?: string
}

export interface AuthorIdentity {
    raw: string
    display: string
    circle: string | null
    creator: string
    normalizedKey: string
    multiCreator: boolean
    genericLabel: boolean
    parsed: boolean
    confidence: number
    evidence: string
    needsReview: boolean
}

export interface ComicQuery {
    comicId?: string
    text?: string
    author?: string
    tags?: string[]
    categories?: string[]
    finished?: boolean
    sort?: SortMode
    limit?: number
    offset?: number
}

export type LibraryScope =
    | 'library'
    | 'favorites'
    | 'downloaded'
    | 'catalog'
    | 'all'
export type TagMatchMode = 'all' | 'any'
export type DownloadFacet =
    | 'downloaded'
    | 'not-downloaded'
    | 'partial'
    | 'complete'

export interface LibraryFacetQuery {
    scope?: LibraryScope
    text?: string
    authorIds?: string[]
    tags?: string[]
    tagMode?: TagMatchMode
    finished?: boolean
    download?: DownloadFacet
    sort?: SortMode
    limit?: number
    offset?: number
}

export interface FacetOption {
    value: string
    label: string
    count: number
}

export interface LibraryQueryResult {
    items: StoredComic[]
    total: number
    facets: {
        authors: FacetOption[]
        tags: FacetOption[]
    }
    query: LibraryFacetQuery
}

export interface StoredComic extends FavoriteRecord {
    canonicalAuthor: string | null
    circle: string | null
    authorId: string | null
    isFavorite: boolean
    firstSeenAt: string
    lastSeenAt: string
    knownEpisodes: number
    knownPictures: number
    downloadedPictures: number
    inLibrary?: boolean
}

export interface LibrarySummary {
    comics: number
    catalogComics: number
    favorites: number
    downloadedComics: number
    authors: number
    authorsPendingReview: number
    episodes: number
    pictures: number
    downloadedPictures: number
}

export interface FavoritesSyncState {
    lastFullSyncAt: string | null
    lastQuickSyncAt: string | null
    previousRemoteCount: number
    lastHeadIds: string[]
    lastHeadFingerprint: string
    lastKnownPageSize: number
    lastFullReconcileCount: number
}

export interface ImportResult {
    imported: number
    inserted: number
    updated: number
    authorGroups: number
    authorsPendingReview: number
    favoriteCount: number
    addedFavorites: number
    removedFavorites: number
    libraryInserted: number
    libraryUpdated: number
}

export interface LibraryReconciliation {
    totalComicRecords: number
    favoriteRecords: number
    nonFavoriteRecords: number
    distinctCanonicalComicIds: number
    distinctProviderRawIds: number
    duplicateCanonicalIds: number
    duplicateProviderRawIds: number
    provenanceGroups: Record<string, number>
    favoriteIdsMissingComics: number
    comicsWithoutKnownProvenance: number
    sameMangaMultipleIds: number
    metadataHydrationOnly: number
}

export interface DownloadedComic {
    comicId: string
    title: string
    author: string
    canonicalAuthor: string | null
    coverUrl?: string
    status: 'complete' | 'partial'
    downloadedChapters: number
    knownChapters: number
    downloadedPictures: number
    knownPictures: number
    localBytes: number
    lastDownloadedAt: string | null
}

export interface Shelf {
    id: string
    name: string
    createdAt: string
    updatedAt: string
    sortOrder: number
    count: number
}

export interface ReaderEpisode {
    id: string
    comicId: string
    title: string
    order: number
    downloadedPictures: number
    knownPictures: number
}

export interface ReaderPicture {
    id: string
    comicId: string
    episodeId: string
    position: number
    originalName: string
    localPath: string
}

export interface ReadingProgress {
    comicId: string
    episodeId: string
    pageIndex: number
    updatedAt: string
}

export interface AuthorGroup {
    id: string
    canonicalName: string
    normalizedKey: string
    aliases: string[]
    circles: string[]
    works: number
    confidence: number
    evidence: string
    reviewStatus: string
}

export interface PreferenceItem {
    value: string
    count: number
    weight: number
}

export interface RecommendationProfile {
    favoriteCount: number
    finishedRatio: number
    tags: PreferenceItem[]
    categories: PreferenceItem[]
    authors: PreferenceItem[]
    circles: PreferenceItem[]
}

export interface RecommendationResult {
    comic: StoredComic
    score: number
    reasons: string[]
    recallSources: string[]
    matchedSignals: string[]
    exploration: boolean
}

export type RecallRoute = 'related' | 'author' | 'tag' | 'category' | 'circle'

export interface RecallEvidence {
    route: RecallRoute
    source: string
    seedComicId?: string
    providerPage?: number
    providerRank?: number
    retrievedAt?: string
    queryTag?: string
    queryCombination?: string[]
}

export interface RecommendationCandidate {
    comic: FavoriteRecord
    recalls: RecallEvidence[]
}

export interface RecommendationAudit {
    favoriteCount: number
    seedCount: number
    seedAuthorDiversity: number
    seedTagDiversity: number
    candidateCountByRecallRoute: Record<RecallRoute, number>
    deduplicatedCandidateCount: number
    alreadyFavoriteExcludedCount: number
    finalRecommendationCount: number
    maxSameAuthorInTopN: number
    explorationCount: number
}
