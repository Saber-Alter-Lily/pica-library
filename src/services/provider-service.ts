import { createHash } from 'node:crypto'
import type { Pica } from '../sdk'
import type { Comic, Episode, Picture } from '../types'
import { trustedCoverUrl } from '../library/cover-url'
import type { FavoriteRecord } from '../library/types'
import type { LibraryDatabase } from '../library/database'

export interface ProviderCapabilities {
    favoriteMutation: boolean
}

export type FavoritesSyncMode = 'quick' | 'full'

export interface ProviderFavoritesProgress {
    phase: 'reading' | 'processing'
    mode: FavoritesSyncMode
    page?: number
    pages?: number
    fetched?: number
    total?: number
    found?: number
    fallbackReason?: string
}

const FULL_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000
const STABLE_OVERLAP_IDS = 8
const MAX_QUICK_PAGES = 5

function fingerprint(ids: string[]) {
    return createHash('sha256').update(ids.join('\n')).digest('hex')
}

export function providerComicRecord(comic: Comic): FavoriteRecord {
    return {
        comicId: comic._id,
        title: comic.title.trim(),
        author: comic.author ?? '',
        description: comic.description ?? '',
        chineseTeam: comic.chineseTeam ?? '',
        categories: comic.categories ?? [],
        tags: comic.tags ?? [],
        finished: Boolean(comic.finished),
        createdAt: comic.created_at,
        updatedAt: comic.updated_at,
        totalLikes: comic.totalLikes ?? comic.likesCount ?? 0,
        totalViews: comic.totalViews ?? comic.viewsCount ?? 0,
        pagesCount: comic.pagesCount ?? 0,
        epsCount: comic.epsCount ?? 0,
        coverUrl: trustedCoverUrl(
            comic.thumb?.fileServer && comic.thumb.path
                ? `${comic.thumb.fileServer}/static/${comic.thumb.path}`
                : undefined
        )
    }
}

export class ProviderService {
    readonly capabilities: ProviderCapabilities = { favoriteMutation: true }

    constructor(
        private readonly connectProvider: () => Promise<Pica>,
        private readonly database: LibraryDatabase
    ) {}

    private connect() {
        return this.connectProvider()
    }

    async syncFavorites(
        mode: FavoritesSyncMode = 'quick',
        onProgress?: (progress: ProviderFavoritesProgress) => void
    ) {
        const provider = await this.connect()
        const previous = this.database.favoritesSyncState()
        const known = new Set(this.database.favoriteIds())
        const now = new Date()
        const fullDue =
            !previous.lastFullSyncAt ||
            now.getTime() - new Date(previous.lastFullSyncAt).getTime() >=
                FULL_RECONCILE_INTERVAL_MS

        const full = async (fallbackReason?: string) => {
            let headIds: string[] = []
            let pagesChecked = 0
            const { comics, pages } = await provider.favoritesAll(
                'all',
                (page) => {
                    pagesChecked = page.page
                    onProgress?.({
                        phase: 'reading',
                        mode: 'full',
                        ...page,
                        fallbackReason
                    })
                }
            )
            headIds = comics.slice(0, 20).map((comic) => comic._id)
            onProgress?.({
                phase: 'processing',
                mode: 'full',
                fetched: comics.length,
                total: comics.length,
                found: comics.filter((comic) => !known.has(comic._id)).length,
                fallbackReason
            })
            const result = this.database.importFavorites(
                comics.map(providerComicRecord),
                'pica:favorites:full',
                true
            )
            const timestamp = now.toISOString()
            this.database.saveFavoritesSyncState({
                lastFullSyncAt: timestamp,
                lastQuickSyncAt: previous.lastQuickSyncAt,
                previousRemoteCount: comics.length,
                lastHeadIds: headIds,
                lastHeadFingerprint: fingerprint(headIds),
                lastKnownPageSize: comics.length
                    ? Math.ceil(comics.length / Math.max(1, pages))
                    : 0,
                lastFullReconcileCount: comics.length
            })
            return {
                ...result,
                syncMode: 'full' as const,
                pagesChecked,
                fallbackReason
            }
        }

        if (mode === 'full') return full()
        if (fullDue) return full('periodic-or-initial-reconciliation')

        const collected = [] as Comic[]
        const unseen = new Set<string>()
        let page = 1
        let remoteTotal = 0
        let totalPages = 0
        let stableOverlap = false
        let orderingAnomaly = false
        while (page <= MAX_QUICK_PAGES) {
            const result = await provider.favorites(page)
            remoteTotal = result.total
            totalPages = result.pages
            const ids = result.docs.map((comic) => comic._id)
            if (new Set(ids).size !== ids.length) orderingAnomaly = true
            collected.push(...result.docs)
            for (const id of ids) if (!known.has(id)) unseen.add(id)
            let trailingKnown = 0
            for (let index = collected.length - 1; index >= 0; index--) {
                if (!known.has(collected[index]._id)) break
                trailingKnown += 1
            }
            stableOverlap = trailingKnown >= STABLE_OVERLAP_IDS
            onProgress?.({
                phase: 'reading',
                mode: 'quick',
                page,
                pages: totalPages,
                fetched: collected.length,
                total: remoteTotal,
                found: unseen.size
            })
            const countConsistent = remoteTotal === known.size + unseen.size
            if (stableOverlap && countConsistent && !orderingAnomaly) break
            if (page >= totalPages) break
            page += 1
        }

        const countConsistent = remoteTotal === known.size + unseen.size
        if (!stableOverlap || !countConsistent || orderingAnomaly) {
            const reason = orderingAnomaly
                ? 'pagination-ordering-anomaly'
                : !countConsistent
                  ? 'remote-count-anomaly'
                  : 'stable-overlap-not-found'
            return full(reason)
        }

        onProgress?.({
            phase: 'processing',
            mode: 'quick',
            fetched: collected.length,
            total: remoteTotal,
            found: unseen.size
        })
        const result = this.database.importFavorites(
            collected.map(providerComicRecord),
            'pica:favorites:quick',
            false,
            true
        )
        const headIds = collected.slice(0, 20).map((comic) => comic._id)
        this.database.saveFavoritesSyncState({
            ...previous,
            lastQuickSyncAt: now.toISOString(),
            previousRemoteCount: remoteTotal,
            lastHeadIds: headIds,
            lastHeadFingerprint: fingerprint(headIds),
            lastKnownPageSize: collected.length
                ? Math.min(collected.length, previous.lastKnownPageSize || 20)
                : previous.lastKnownPageSize
        })
        return {
            ...result,
            syncMode: 'quick' as const,
            pagesChecked: page,
            foundNew: unseen.size,
            fallbackReason: undefined
        }
    }

    async search(keyword: string) {
        const provider = await this.connect()
        const comics = await provider.searchAll(keyword, provider.Order.loved)
        const records = comics.map(providerComicRecord)
        this.database.importCatalog(records, 'pica:discover')
        return records
    }

    async getComicDetails(comicId: string) {
        const provider = await this.connect()
        const comic = await provider.comicInfo(comicId)
        this.database.importCatalog(
            [providerComicRecord(comic)],
            'pica:details'
        )
        return comic
    }

    async getEpisodes(comicId: string): Promise<Episode[]> {
        return (await this.connect()).episodesAll(comicId)
    }

    async getEpisodePages(
        comicId: string,
        episode: Episode
    ): Promise<Picture[]> {
        return (await this.connect()).picturesAll(comicId, episode)
    }

    async fetchPage(url: string, maxBytes = 20 * 1024 * 1024) {
        return (await this.connect()).fetchImage(url, maxBytes)
    }

    async setFavorite(comicId: string, desired: boolean) {
        const provider = await this.connect()
        const before = await provider.comicInfo(comicId)
        if (Boolean(before.isFavourite) === desired)
            return { changed: false, isFavorite: desired, already: true }
        await provider.fav(comicId)
        const after = await provider.comicInfo(comicId)
        if (Boolean(after.isFavourite) !== desired)
            throw new Error('Pica 收藏状态未能得到远端确认')
        this.database.setFavoriteState(comicId, desired)
        return { changed: true, isFavorite: desired, already: false }
    }

    addFavorite(comicId: string) {
        return this.setFavorite(comicId, true)
    }

    removeFavorite(comicId: string) {
        return this.setFavorite(comicId, false)
    }
}
