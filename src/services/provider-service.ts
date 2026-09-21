import { createHash } from 'node:crypto'
import type { Pica } from '../sdk'
import type { Comic, Episode, Picture } from '../types'
import type { FavoriteRecord } from '../library/types'
import type { LibraryDatabase } from '../library/database'
import {
    EhProvider,
    type EhSession,
    type ExHentaiCapability
} from '../providers/eh-provider'
import { PicaProvider, picaComic } from '../providers/pica-provider'
import {
    providerComicToRecord,
    type ComicProvider,
    type EhSurface,
    type OnlineSource,
    type ProviderId,
    type SearchRequest
} from '../providers/types'

export interface ProviderCapabilities {
    favoriteMutation: boolean
    providers: Record<ProviderId, ComicProvider['capabilities']>
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
    return providerComicToRecord(picaComic(comic))
}

export class ProviderService {
    readonly capabilities: ProviderCapabilities
    private readonly picaProvider: PicaProvider
    private readonly ehProvider: EhProvider

    constructor(
        private readonly connectProvider: () => Promise<Pica>,
        private readonly database: LibraryDatabase,
        ehProvider = new EhProvider()
    ) {
        this.picaProvider = new PicaProvider(connectProvider)
        this.ehProvider = ehProvider
        this.capabilities = {
            favoriteMutation: true,
            providers: {
                pica: this.picaProvider.capabilities,
                eh: this.ehProvider.capabilities
            }
        }
    }

    private connect() {
        return this.connectProvider()
    }

    private providerForComic(comicId: string): ComicProvider {
        return comicId.startsWith('eh:') ? this.ehProvider : this.picaProvider
    }

    private ehSurfaceForComic(comicId: string): EhSurface {
        const metadata = this.database.getComic(comicId)?.providerMetadata ?? {}
        return metadata.preferredSurface === 'exh' && this.ehProvider.hasSession()
            ? 'exh'
            : 'eh'
    }

    private recordForOnlineSource(comic: Parameters<typeof providerComicToRecord>[0], source: OnlineSource) {
        const record = providerComicToRecord(comic)
        if (source === 'pica') return record
        const previous = this.database.getComic(record.comicId)?.providerMetadata ?? {}
        const known = new Set<string>([
            ...(Array.isArray(previous.knownSurfaces) ? previous.knownSurfaces.map(String) : []),
            source
        ])
        record.providerMetadata = {
            ...previous,
            ...record.providerMetadata,
            preferredSurface: source,
            knownSurfaces: [...known].filter((item) => item === 'eh' || item === 'exh')
        }
        return record
    }

    providerStatus() {
        return this.capabilities.providers
    }

    setEhSession(session?: EhSession | null) {
        this.ehProvider.setSession(session)
    }

    ehAccountStatus() {
        return { configured: this.ehProvider.hasSession() }
    }

    verifyEhAccount() {
        return this.ehProvider.verifyAccount()
    }

    probeExHentai(): Promise<ExHentaiCapability> {
        return this.ehProvider.probeExHentai()
    }

    async syncEhFavorites() {
        const comics = await this.ehProvider.favoritesAll()
        const records = comics.map(providerComicToRecord)
        return this.database.syncEhFavorites(records)
    }

    async syncFavorites(
        mode: FavoritesSyncMode = 'quick',
        onProgress?: (progress: ProviderFavoritesProgress) => void,
        checkpoint?: () => Promise<void>
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
            await checkpoint?.()
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
                },
                checkpoint
            )
            await checkpoint?.()
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
                favoriteOrderIds: comics.map((comic) => comic._id),
                favoritePageSize: comics.length
                    ? Math.ceil(comics.length / Math.max(1, pages))
                    : 20,
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
            await checkpoint?.()
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

        await checkpoint?.()
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
            favoriteOrderIds: undefined,
            favoritePageSize: undefined,
            fallbackReason: undefined
        }
    }

    async search(
        input: string | SearchRequest,
        providers: OnlineSource[] = ['pica'],
        provenance: 'discover' | 'recommendations' = 'discover',
        options: { persist?: boolean } = {}
    ) {
        const persist = options.persist !== false
        const request: SearchRequest =
            typeof input === 'string' ? { keyword: input, limit: 100 } : input
        const uniqueProviders = [...new Set(providers)]
        const settled = await Promise.allSettled(
            uniqueProviders.map(async (source) => {
                const provider = source === 'pica' ? this.picaProvider : this.ehProvider
                const comics = await provider.search({
                    ...request,
                    ...(source === 'pica' ? {} : { surface: source })
                })
                const records = comics.map((comic) =>
                    this.recordForOnlineSource(comic, source)
                )
                if (persist)
                    this.database.importCatalog(
                        records,
                        `${source}:${provenance}`
                    )
                return records
            })
        )
        const records = settled.flatMap((result) =>
            result.status === 'fulfilled' ? result.value : []
        )
        if (!records.length) {
            const firstError = settled.find(
                (result): result is PromiseRejectedResult =>
                    result.status === 'rejected'
            )
            if (firstError) throw firstError.reason
        }
        const consolidated = new Map<string, FavoriteRecord>()
        for (const record of records) {
            const previous = consolidated.get(record.comicId)
            if (!previous) {
                consolidated.set(record.comicId, record)
                continue
            }
            if (previous.providerId === 'eh' && record.providerId === 'eh') {
                const previousMetadata = previous.providerMetadata ?? {}
                const nextMetadata = record.providerMetadata ?? {}
                const knownSurfaces = new Set<string>([
                    ...(Array.isArray(previousMetadata.knownSurfaces)
                        ? previousMetadata.knownSurfaces.map(String)
                        : []),
                    ...(Array.isArray(nextMetadata.knownSurfaces)
                        ? nextMetadata.knownSurfaces.map(String)
                        : []),
                    String(previousMetadata.preferredSurface ?? ''),
                    String(nextMetadata.preferredSurface ?? '')
                ])
                consolidated.set(record.comicId, {
                    ...previous,
                    ...record,
                    providerMetadata: {
                        ...previousMetadata,
                        ...nextMetadata,
                        knownSurfaces: [...knownSurfaces].filter(
                            (surface) => surface === 'eh' || surface === 'exh'
                        )
                    }
                })
                continue
            }
            consolidated.set(record.comicId, record)
        }
        const result = [...consolidated.values()]
        const surfaceMerged = result.filter(
            (record) =>
                record.providerId === 'eh' &&
                Array.isArray(record.providerMetadata?.knownSurfaces) &&
                record.providerMetadata.knownSurfaces.length > 1
        )
        if (persist && surfaceMerged.length)
            this.database.importCatalog(
                surfaceMerged,
                'eh:surface-merge:' + provenance
            )
        return result
    }

    async relatedPica(
        comicId: string,
        provenance: 'discover' | 'recommendations' = 'recommendations',
        options: { persist?: boolean } = {}
    ) {
        const records = (await (await this.connect()).related(comicId)).map(
            providerComicRecord
        )
        if (options.persist !== false)
            this.database.importCatalog(records, `pica:${provenance}`)
        return records
    }

    async getComicDetails(comicId: string) {
        if (comicId.startsWith('eh:')) {
            const surface = this.ehSurfaceForComic(comicId)
            const comic = await this.ehProvider.detailsOnSurface(comicId, surface)
            const record = this.recordForOnlineSource(comic, surface)
            this.database.importCatalog([record], `${surface}:details`)
            return comic
        }
        const comic = await this.picaProvider.details(comicId)
        this.database.importCatalog([providerComicToRecord(comic)], 'pica:details')
        return comic
    }

    async getEpisodes(comicId: string): Promise<Episode[]> {
        return comicId.startsWith('eh:')
            ? this.ehProvider.episodesOnSurface(comicId, this.ehSurfaceForComic(comicId))
            : this.picaProvider.episodes(comicId)
    }

    async getEpisodePages(
        comicId: string,
        episode: Episode
    ): Promise<Picture[]> {
        return comicId.startsWith('eh:')
            ? this.ehProvider.pagesOnSurface(comicId, episode, this.ehSurfaceForComic(comicId))
            : this.picaProvider.pages(comicId, episode)
    }

    async fetchPage(locator: string, maxBytes = 20 * 1024 * 1024) {
        return locator.startsWith('eh-page:')
            ? this.ehProvider.fetchPage(locator, maxBytes)
            : this.picaProvider.fetchPage(locator, maxBytes)
    }

    async fetchCover(comicId: string, locator: string, maxBytes = 20 * 1024 * 1024) {
        return comicId.startsWith('eh:')
            ? this.ehProvider.fetchCover(locator, maxBytes)
            : this.picaProvider.fetchPage(locator, maxBytes)
    }

    async setFavorite(comicId: string, desired: boolean) {
        if (comicId.startsWith('eh:')) {
            const before = this.database.getComic(comicId)
            if (!before) throw new Error('E-H 漫画尚未加入本地目录')
            if (this.ehProvider.hasSession()) {
                const beforeRemote = this.database.hasFavoriteMembership(
                    comicId,
                    'eh-favorite'
                )
                if (beforeRemote === desired)
                    return {
                        changed: false,
                        isFavorite: before.isFavorite,
                        already: true,
                        remote: true
                    }
                await this.ehProvider.setRemoteFavorite(comicId, desired)
                const after = this.database.setEhFavoriteState(comicId, desired)
                return {
                    changed: true,
                    isFavorite: Boolean(after?.isFavorite),
                    already: false,
                    remote: true
                }
            }
            const beforeLocal = this.database.hasFavoriteMembership(
                comicId,
                'local-favorite'
            )
            if (beforeLocal === desired)
                return {
                    changed: false,
                    isFavorite: before.isFavorite,
                    already: true,
                    remote: false
                }
            const after = this.database.setLocalFavoriteState(comicId, desired)
            return {
                changed: true,
                isFavorite: Boolean(after?.isFavorite),
                already: false,
                remote: false
            }
        }
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
