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
    text?: string
    author?: string
    tags?: string[]
    categories?: string[]
    finished?: boolean
    sort?: SortMode
    limit?: number
    offset?: number
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
}

export interface LibrarySummary {
    comics: number
    favorites: number
    authors: number
    authorsPendingReview: number
    episodes: number
    pictures: number
    downloadedPictures: number
}

export interface ImportResult {
    imported: number
    inserted: number
    updated: number
    authorGroups: number
    authorsPendingReview: number
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
}
