import type { Episode, Picture } from '../types'
import type { FavoriteRecord } from '../library/types'

export type ProviderId = 'pica' | 'eh'
export type EhSurface = 'eh' | 'exh'
export type OnlineSource = 'pica' | EhSurface
export type CompletionStatus = 'FINISHED' | 'ONGOING' | 'UNKNOWN'
export type EhBrowseMode = 'latest' | 'popular' | 'favorites' | 'watched' | 'toplist'

export interface CanonicalTag {
    raw: string
    namespace: string | null
    value: string
    facet:
        | 'CREATOR'
        | 'CIRCLE'
        | 'FANDOM_IP'
        | 'CHARACTER'
        | 'LANGUAGE'
        | 'CONTENT_TRAIT'
        | 'LOCATION'
        | 'OTHER'
}

export interface ProviderComic {
    providerId: ProviderId
    providerRemoteId: string
    comicId: string
    title: string
    alternateTitles: string[]
    author: string
    authors: string[]
    circle: string | null
    description: string
    chineseTeam: string
    categories: string[]
    tags: string[]
    canonicalTags: CanonicalTag[]
    completionStatus: CompletionStatus
    createdAt?: string
    updatedAt?: string
    totalLikes?: number
    totalViews?: number
    pagesCount?: number
    epsCount?: number
    coverUrl?: string
    rating?: number
    uploader?: string
    providerMetadata: Record<string, unknown>
}

export interface ProviderCapabilities {
    publicBrowse: boolean
    search: boolean
    metadata: boolean
    chapters: boolean
    pages: boolean
    imageFetch: boolean
    remoteFavoritesRead: boolean
    remoteFavoritesWrite: boolean
    account: boolean
    exHentai: boolean
}

export interface SearchRequest {
    keyword?: string
    tags?: string[]
    categories?: string[]
    limit?: number
    /**
     * Optional single provider page for bounded retrieval. Existing callers
     * that omit this keep the legacy all-pages behavior where supported.
     */
    page?: number
    surface?: EhSurface
    ehMode?: EhBrowseMode
    ehToplist?: string
    ehLanguage?: string
    ehExcludeTags?: string[]
    ehMinRating?: number
    ehPageFrom?: number
    ehPageTo?: number
}

export interface ComicProvider {
    readonly id: ProviderId
    readonly capabilities: ProviderCapabilities
    search(input: SearchRequest): Promise<ProviderComic[]>
    details(comicId: string): Promise<ProviderComic>
    episodes(comicId: string): Promise<Episode[]>
    pages(comicId: string, episode: Episode): Promise<Picture[]>
    fetchPage(locator: string, maxBytes?: number): Promise<{ data: Buffer; contentType: string }>
}

export function providerComicToRecord(comic: ProviderComic): FavoriteRecord {
    return {
        comicId: comic.comicId,
        providerId: comic.providerId,
        providerRemoteId: comic.providerRemoteId,
        alternateTitles: [...comic.alternateTitles],
        completionStatus: comic.completionStatus,
        rating: comic.rating,
        providerMetadata: { ...comic.providerMetadata },
        title: comic.title,
        author: comic.author,
        description: comic.description,
        chineseTeam: comic.chineseTeam,
        categories: [...comic.categories],
        tags: [...comic.tags],
        finished: comic.completionStatus === 'FINISHED',
        createdAt: comic.createdAt,
        updatedAt: comic.updatedAt,
        totalLikes: comic.totalLikes,
        totalViews: comic.totalViews,
        pagesCount: comic.pagesCount,
        epsCount: comic.epsCount,
        coverUrl: comic.coverUrl
    }
}
