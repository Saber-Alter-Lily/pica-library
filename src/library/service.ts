import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import pLimit from 'p-limit'
import { Pica } from '../sdk'
import type { Comic, Picture } from '../types'
import { LibraryDatabase } from './database'
import { normalizeAuthorKey } from './author'
import { safeRasterContentType, trustedCoverUrl } from './cover-url'
import type {
    FavoriteRecord,
    RecommendationCandidate,
    RecallRoute,
    SortMode
} from './types'
import {
    mergeRecallCandidates,
    recommendComics,
    selectDiversifiedSeeds
} from './recommendation'
import { DownloadScheduler } from '../core/downloads/scheduler'
import { MediaRequestGate } from '../core/downloads/media-gate'
import {
    resolvePerformanceSettings,
    type PerformanceProfile,
    type PerformanceSettings
} from '../core/downloads/profiles'
import {
    defaultLibraryTemplate,
    renderLibraryPath,
    safePathSegment
} from './path-template'
import type {
    CreateDownloadJob,
    DownloadJob,
    DownloadRunner
} from '../core/downloads/types'
import { checkComicUpdates } from '../maintenance/updates'

export interface DiscoverQuery {
    keyword?: string
    tags?: string[]
    categories?: string[]
    sort?: SortMode
    limit?: number
}

export interface DownloadProgress {
    comicId: string
    comicTitle: string
    episodeId: string
    episodeTitle: string
    completed: number
    total: number
    bytes: number
    file?: string
}

export interface DownloadResult {
    comicId: string
    title: string
    episodes: number
    pictures: number
    downloaded: number
    skipped: number
    completed: number
    bytes: number
}

export interface FavoritesSyncProgress {
    phase: 'idle' | 'reading' | 'processing' | 'complete' | 'failed'
    page?: number
    pages?: number
    fetched?: number
    total?: number
    processed?: number
    error?: string
}

function comicToRecord(comic: Comic): FavoriteRecord {
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

function sortCode(pica: Pica, sort: SortMode | undefined) {
    if (sort === 'latest') return pica.Order.latest
    if (sort === 'oldest') return pica.Order.oldest
    if (sort === 'views') return pica.Order.point
    if (sort === 'likes' || sort === 'recommended') return pica.Order.loved
    return pica.Order.default
}

export class LibraryService {
    private pica: Pica | null = null
    private acceptingLocalDownloads = true
    private readonly activeLocalRuns = new Set<Promise<void>>()
    private readonly activeLocalSchedulers = new Set<DownloadScheduler>()
    private favoritesProgress: FavoritesSyncProgress = { phase: 'idle' }

    constructor(
        readonly database: LibraryDatabase,
        readonly dataDir: string,
        provider?: Pica
    ) {
        this.pica = provider ?? null
        fs.mkdirSync(dataDir, { recursive: true })
    }

    async connect() {
        if (this.pica) return this.pica
        const account = process.env.PICA_ACCOUNT
        const password = process.env.PICA_PASSWORD
        if (!account || !password) {
            throw new Error(
                'PICA_ACCOUNT and PICA_PASSWORD are required for connected mode'
            )
        }
        const pica = new Pica()
        await pica.login(account, password)
        this.pica = pica
        return pica
    }

    async cover(comicId: string) {
        const comic = this.database.getComic(comicId)
        if (!comic?.coverUrl) throw new Error('Comic cover is unavailable')

        const cacheDir = path.join(this.dataDir, 'cover-cache')
        const cacheKey = createHash('sha256').update(comicId).digest('hex')
        const imageFile = path.join(cacheDir, `${cacheKey}.bin`)
        const metadataFile = path.join(cacheDir, `${cacheKey}.json`)
        try {
            const metadata = JSON.parse(
                await fs.promises.readFile(metadataFile, 'utf8')
            ) as { contentType?: unknown }
            const contentType = safeRasterContentType(metadata.contentType)
            if (!contentType) throw new Error('invalid')
            return {
                data: await fs.promises.readFile(imageFile),
                contentType,
                cached: true
            }
        } catch {
            // A partial or stale cache entry is safely replaced below.
        }

        const pica = await this.connect()
        const image = await pica.fetchImage(comic.coverUrl)
        await fs.promises.mkdir(cacheDir, { recursive: true })
        const imagePartial = `${imageFile}.part`
        const metadataPartial = `${metadataFile}.part`
        await fs.promises.writeFile(imagePartial, image.data)
        await fs.promises.writeFile(
            metadataPartial,
            JSON.stringify({ contentType: image.contentType })
        )
        await fs.promises.rename(imagePartial, imageFile)
        await fs.promises.rename(metadataPartial, metadataFile)
        return { ...image, cached: false }
    }

    async downloadedCover(comicId: string) {
        const file = this.database.downloadedCoverPath(comicId)
        if (!file) throw new Error('Downloaded cover is unavailable')
        const contentTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.gif': 'image/gif'
        }
        const contentType = safeRasterContentType(
            contentTypes[path.extname(file).toLowerCase()]
        )
        if (!contentType) throw new Error('Downloaded cover type is unsafe')
        return { data: await fs.promises.readFile(file), contentType }
    }

    favoritesSyncProgress() {
        return { ...this.favoritesProgress }
    }

    async syncFavorites() {
        const pica = await this.connect()
        this.favoritesProgress = { phase: 'reading' }
        try {
            const { comics } = await pica.favoritesAll('all', (progress) => {
                this.favoritesProgress = {
                    phase: 'reading',
                    ...progress
                }
            })
            this.favoritesProgress = {
                phase: 'processing',
                fetched: comics.length,
                total: comics.length,
                processed: 0
            }
            const result = this.database.importFavorites(
                comics.map(comicToRecord),
                'pica:favorites',
                true
            )
            this.favoritesProgress = {
                phase: 'complete',
                fetched: comics.length,
                total: comics.length,
                processed: comics.length
            }
            return result
        } catch (error) {
            this.favoritesProgress = {
                phase: 'failed',
                error: error instanceof Error ? error.message : String(error)
            }
            throw error
        }
    }

    async favoritesPage(page: number) {
        if (!Number.isInteger(page) || page < 1)
            throw new Error('Favorite page must be a positive integer')
        const pica = await this.connect()
        const result = await pica.favorites(page)
        const records = result.docs.map(comicToRecord)
        this.database.importFavorites(
            records,
            `pica:favorites:page:${page}`,
            false,
            true
        )
        return {
            page: result.page,
            pages: result.pages,
            total: result.total,
            comics: records
        }
    }

    async discover(query: DiscoverQuery) {
        const pica = await this.connect()
        const order = sortCode(pica, query.sort)
        let comics: Comic[]
        if (query.keyword?.trim()) {
            comics = await pica.searchAll(
                query.keyword.trim(),
                order,
                query.categories ?? []
            )
        } else {
            comics = await pica.comicsAll(
                query.categories?.[0] ?? '',
                query.tags?.[0] ?? '',
                order
            )
        }

        const tags = (query.tags ?? []).map(normalizeAuthorKey)
        const categories = (query.categories ?? []).map(normalizeAuthorKey)
        let records = comics.map(comicToRecord).filter((comic) => {
            const comicTags = comic.tags.map(normalizeAuthorKey)
            const comicCategories = comic.categories.map(normalizeAuthorKey)
            return (
                tags.every((tag) => comicTags.includes(tag)) &&
                categories.every((category) =>
                    comicCategories.includes(category)
                )
            )
        })

        if (query.sort === 'title') {
            records = records.sort((a, b) => a.title.localeCompare(b.title))
        } else if (query.sort === 'recommended') {
            records = records.sort((a, b) => {
                const score = (comic: FavoriteRecord) =>
                    Math.log10(1 + (comic.totalLikes ?? 0)) * 3 +
                    Math.log10(1 + (comic.totalViews ?? 0)) +
                    tags.filter((tag) =>
                        comic.tags.map(normalizeAuthorKey).includes(tag)
                    ).length *
                        5
                return score(b) - score(a)
            })
        }
        records = records.slice(0, Math.min(query.limit ?? 100, 1000))
        this.database.importCatalog(records, 'pica:discover')
        return records
    }

    async recommendations(
        options: { limit?: number; seedCount?: number } = {}
    ) {
        const limit = Math.max(1, Math.min(options.limit ?? 30, 100))
        const favorites = this.database
            .listComics({ limit: 5000 })
            .filter((comic) => comic.isFavorite)
        if (favorites.length === 0) return recommendComics([], limit)

        const pica = await this.connect()
        const seedBudget = Math.max(1, Math.min(options.seedCount ?? 12, 16))
        const seeds = selectDiversifiedSeeds(favorites, seedBudget)
        const profile = recommendComics(favorites, limit).profile
        const recallTasks: Array<{
            route: RecallRoute
            source: string
            seedComicId?: string
            load: () => Promise<Comic[]>
            accepts?: (comic: Comic) => boolean
        }> = seeds.map((seed) => ({
            route: 'related' as const,
            source: seed.comicId,
            seedComicId: seed.comicId,
            load: () => pica.related(seed.comicId)
        }))
        for (const item of profile.tags.slice(0, 2))
            recallTasks.push({
                route: 'tag',
                source: item.value,
                load: async () =>
                    (await pica.comicsPage('', item.value, pica.Order.loved, 1))
                        .docs,
                accepts: (comic) =>
                    comic.tags.some(
                        (tag) =>
                            normalizeAuthorKey(tag) ===
                            normalizeAuthorKey(item.value)
                    )
            })
        for (const item of profile.categories.slice(0, 2))
            recallTasks.push({
                route: 'category',
                source: item.value,
                load: async () =>
                    (await pica.comicsPage(item.value, '', pica.Order.loved, 1))
                        .docs,
                accepts: (comic) =>
                    comic.categories.some(
                        (category) =>
                            normalizeAuthorKey(category) ===
                            normalizeAuthorKey(item.value)
                    )
            })
        for (const item of profile.authors.slice(0, 2))
            recallTasks.push({
                route: 'author',
                source: item.value,
                load: async () =>
                    (await pica.search(item.value, 1, pica.Order.loved)).docs,
                accepts: (comic) =>
                    normalizeAuthorKey(comic.author) ===
                    normalizeAuthorKey(item.value)
            })
        for (const item of profile.circles.slice(0, 2))
            recallTasks.push({
                route: 'circle',
                source: item.value,
                load: async () =>
                    (await pica.search(item.value, 1, pica.Order.loved)).docs,
                accepts: (comic) =>
                    normalizeAuthorKey(comic.author).includes(
                        normalizeAuthorKey(item.value)
                    )
            })
        const gate = pLimit(3)
        const recalled = await Promise.all(
            recallTasks.map((task) =>
                gate(async (): Promise<RecommendationCandidate[]> => {
                    try {
                        return (await task.load())
                            .filter((comic) => task.accepts?.(comic) ?? true)
                            .map((comic) => ({
                                comic: comicToRecord(comic),
                                recalls: [
                                    {
                                        route: task.route,
                                        source: task.source,
                                        seedComicId: task.seedComicId
                                    }
                                ]
                            }))
                    } catch {
                        return []
                    }
                })
            )
        )
        const candidates = mergeRecallCandidates(recalled.flat())
        this.database.importCatalog(
            candidates.map((item) => item.comic),
            'pica:recommendations'
        )
        return recommendComics(
            this.database.listComics({ limit: 5000 }),
            limit,
            candidates
        )
    }

    async checkUpdates(comicIds?: string[]) {
        const pica = await this.connect()
        const ids = comicIds?.length
            ? comicIds
            : this.database
                  .listComics({ limit: 5000 })
                  .filter((comic) => comic.downloadedPictures > 0)
                  .map((comic) => comic.comicId)
        const findings = []
        for (const comicId of ids) {
            findings.push(
                await checkComicUpdates(
                    this.database,
                    {
                        episodes: async (id) =>
                            (await pica.episodesAll(id)).flatMap((episode) => {
                                const episodeId = episode.id || episode._id
                                return episodeId
                                    ? [
                                          {
                                              id: episodeId,
                                              order: episode.order,
                                              title: episode.title,
                                              updatedAt: episode.updated_at
                                          }
                                      ]
                                    : []
                            })
                    },
                    comicId
                )
            )
        }
        return findings
    }

    enqueueDownload(input: CreateDownloadJob): DownloadJob {
        if (
            (input.runner ?? 'LOCAL') === 'LOCAL' &&
            !this.acceptingLocalDownloads
        )
            throw new Error('The local download engine is shutting down')
        const job = this.database.createDownloadJob(input)
        return this.database.transitionDownloadJob(job.id, 'QUEUED')
    }

    async runDownloadQueue(
        options: {
            runner?: DownloadRunner
            profile?: PerformanceProfile
            custom?: Partial<PerformanceSettings>
            onProgress?: (progress: DownloadProgress) => void
        } = {}
    ) {
        const runner = options.runner ?? 'LOCAL'
        if (runner === 'LOCAL' && !this.acceptingLocalDownloads)
            throw new Error('The local download engine is shutting down')
        const settings = resolvePerformanceSettings(
            options.profile ?? 'balanced',
            options.custom
        )
        const mediaGate = new MediaRequestGate(
            settings.globalMediaConcurrency,
            settings.requestIntervalMs
        )
        const store = {
            nextDownloadJobs: (limit: number) =>
                this.database.nextDownloadJobs(limit, runner),
            getDownloadJob: this.database.getDownloadJob.bind(this.database),
            transitionDownloadJob: this.database.transitionDownloadJob.bind(
                this.database
            )
        }
        const scheduler = new DownloadScheduler(
            store,
            async (job) => {
                const result = await this.downloadComicNow(job.comicId, {
                    episodeOrders: job.episodeOrders,
                    mediaGate,
                    onProgress: (progress) => {
                        this.database.updateDownloadProgress(job.id, {
                            progressCompleted: progress.completed,
                            progressTotal: progress.total,
                            bytes: progress.bytes,
                            chapterTitle: progress.episodeTitle
                        })
                        options.onProgress?.(progress)
                    },
                    shouldStop: () => {
                        const status = this.database.getDownloadJob(
                            job.id
                        ).status
                        return status === 'PAUSED' || status === 'CANCELLED'
                    }
                })
                this.database.updateDownloadProgress(job.id, {
                    progressCompleted: result.completed,
                    progressTotal: result.pictures,
                    bytes: result.bytes
                })
            },
            {
                jobConcurrency: settings.jobConcurrency,
                maxRetries: settings.maxRetries,
                retryBaseMs: settings.retryBaseMs
            }
        )
        const draining = scheduler.drain()
        if (runner === 'LOCAL') {
            this.activeLocalRuns.add(draining)
            this.activeLocalSchedulers.add(scheduler)
        }
        try {
            await draining
        } finally {
            if (runner === 'LOCAL') {
                this.activeLocalRuns.delete(draining)
                this.activeLocalSchedulers.delete(scheduler)
            }
        }
        return this.database.listDownloadJobs()
    }

    hasActiveLocalDownloads() {
        const active = new Set(['QUEUED', 'PREPARING', 'RUNNING', 'RETRY_WAIT'])
        return this.database
            .listDownloadJobs()
            .some((job) => job.runner === 'LOCAL' && active.has(job.status))
    }

    async quiesceLocalDownloads(timeoutMs = 30_000) {
        this.acceptingLocalDownloads = false
        for (const scheduler of this.activeLocalSchedulers) scheduler.stop()
        const pausable = new Set([
            'QUEUED',
            'PREPARING',
            'RUNNING',
            'RETRY_WAIT'
        ])
        for (const job of this.database.listDownloadJobs()) {
            if (job.runner === 'LOCAL' && pausable.has(job.status))
                this.database.transitionDownloadJob(job.id, 'PAUSED')
        }
        const settled = Promise.allSettled([...this.activeLocalRuns]).then(
            () => undefined
        )
        let timeout: NodeJS.Timeout | undefined
        try {
            await Promise.race([
                settled,
                new Promise<never>((_, reject) => {
                    timeout = setTimeout(
                        () =>
                            reject(
                                new Error(
                                    'Timed out waiting for active downloads to pause'
                                )
                            ),
                        timeoutMs
                    )
                })
            ])
        } finally {
            if (timeout) clearTimeout(timeout)
        }
    }

    private async downloadComicNow(
        comicId: string,
        options: {
            episodeOrders?: number[]
            mediaGate: MediaRequestGate
            onProgress?: (progress: DownloadProgress) => void
            shouldStop?: () => boolean
        }
    ): Promise<DownloadResult> {
        const pica = await this.connect()
        const comic = await pica.comicInfo(comicId)
        if (comic.allowDownload === false) {
            throw new Error(
                'The site reports that this comic is not downloadable'
            )
        }
        this.database.importCatalog(
            [comicToRecord(comic)],
            'pica:download:metadata'
        )
        const observedEpisodes = await pica.episodesAll(comicId)
        for (const episode of observedEpisodes) {
            const episodeId = episode.id || episode._id
            if (!episodeId)
                throw new Error('Episode response did not include an id')
            this.database.upsertEpisode({
                id: episodeId,
                comicId,
                title: episode.title,
                order: episode.order,
                updatedAt: episode.updated_at
            })
        }
        let episodes = observedEpisodes
        if (options.episodeOrders?.length) {
            const allowed = new Set(options.episodeOrders)
            episodes = episodes.filter((episode) => allowed.has(episode.order))
        }

        const result: DownloadResult = {
            comicId,
            title: comic.title.trim(),
            episodes: episodes.length,
            pictures: 0,
            downloaded: 0,
            skipped: 0,
            completed: 0,
            bytes: 0
        }
        const work: Array<{
            picture: Picture
            pictureId: string
            episodeId: string
            episodeTitle: string
            file: string
        }> = []
        for (const episode of episodes) {
            const episodeId = episode.id || episode._id
            if (!episodeId)
                throw new Error('Episode response did not include an id')
            const pictures = await pica.picturesAll(comicId, episode)
            result.pictures += pictures.length
            const stored = this.database
                .listComics({ limit: 5000 })
                .find((item) => item.comicId === comicId)
            const episodeDir = renderLibraryPath(
                path.join(this.dataDir, 'library'),
                process.env.PICA_LIBRARY_PATH_TEMPLATE ??
                    defaultLibraryTemplate,
                {
                    author:
                        stored?.canonicalAuthor ??
                        comic.author ??
                        'Unknown author',
                    title: comic.title,
                    comic_id: comicId,
                    chapter_order: String(episode.order).padStart(4, '0'),
                    chapter: episode.title || episodeId
                }
            )
            pictures.forEach((picture, index) => {
                const pictureId =
                    picture.id ||
                    String((picture as Picture & { _id?: string })._id ?? '')
                if (!pictureId)
                    throw new Error('Picture response did not include an id')
                this.database.upsertPicture({
                    id: pictureId,
                    comicId,
                    episodeId,
                    position: index + 1,
                    originalName: picture.media.originalName,
                    mediaPath: picture.media.path,
                    fileServer: picture.media.fileServer
                })
                work.push({
                    picture,
                    pictureId,
                    episodeId,
                    episodeTitle: episode.title,
                    file: path.join(
                        episodeDir,
                        safePathSegment(picture.name, `${index + 1}.jpg`)
                    )
                })
            })
        }
        const validExisting = new Map<string, string>()
        for (const item of work) {
            const previous = this.database.pictureDownloadState(item.pictureId)
            const existing =
                previous?.status === 'completed' &&
                previous.localPath &&
                fs.existsSync(previous.localPath)
                    ? previous.localPath
                    : fs.existsSync(item.file)
                      ? item.file
                      : null
            if (existing && fs.statSync(existing).size > 0) {
                validExisting.set(item.pictureId, existing)
            }
        }
        let completed = validExisting.size
        const completedPictureIds = new Set(validExisting.keys())
        let cumulativeBytes = [...validExisting.keys()].reduce(
            (total, pictureId) =>
                total +
                (this.database.pictureDownloadState(pictureId)?.byteSize ?? 0),
            0
        )
        result.skipped = completed
        result.pictures = work.length
        let attemptFailed = false
        const settled = await Promise.allSettled(
            work.map(async (item) => {
                if (options.shouldStop?.()) return
                const existing = validExisting.get(item.pictureId)
                if (existing) {
                    const data = fs.readFileSync(existing)
                    this.database.markPictureDownloaded(
                        item.pictureId,
                        existing,
                        data.byteLength,
                        createHash('sha256').update(data).digest('hex')
                    )
                    return
                }
                await options.mediaGate.run(async () => {
                    if (attemptFailed || options.shouldStop?.()) return
                    try {
                        const downloaded = await pica.downloadToFile(
                            item.picture.url,
                            item.file
                        )
                        this.database.markPictureDownloaded(
                            item.pictureId,
                            item.file,
                            downloaded.bytes,
                            downloaded.sha256
                        )
                        result.downloaded += 1
                        completedPictureIds.add(item.pictureId)
                        cumulativeBytes += downloaded.bytes
                        completed += 1
                        options.onProgress?.({
                            comicId,
                            comicTitle: comic.title,
                            episodeId: item.episodeId,
                            episodeTitle: item.episodeTitle,
                            completed,
                            total: work.length,
                            bytes: cumulativeBytes,
                            file: item.file
                        })
                    } catch (error) {
                        attemptFailed = true
                        throw error
                    }
                })
            })
        )
        result.completed = completedPictureIds.size
        result.bytes = [...completedPictureIds].reduce(
            (total, pictureId) =>
                total +
                (this.database.pictureDownloadState(pictureId)?.byteSize ?? 0),
            0
        )
        const failure = settled.find(
            (item): item is PromiseRejectedResult => item.status === 'rejected'
        )
        if (failure) throw failure.reason
        return result
    }
}

export function parseEpisodeSelection(input: string | undefined): number[] {
    if (!input || input === 'all') return []
    const values = new Set<number>()
    for (const part of input.split(',')) {
        const range = part.trim().match(/^(\d+)-(\d+)$/)
        if (range) {
            const start = Number(range[1])
            const end = Number(range[2])
            for (let value = start; value <= end; value += 1) values.add(value)
        } else {
            const value = Number(part.trim())
            if (Number.isInteger(value) && value > 0) values.add(value)
        }
    }
    return [...values].sort((a, b) => a - b)
}
