import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import pLimit from 'p-limit'
import { Pica } from '../sdk'
import type { Comic, Picture } from '../types'
import { LibraryDatabase } from './database'
import { normalizeAuthorKey } from './author'
import type { FavoriteRecord, SortMode } from './types'
import { recommendComics } from './recommendation'

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
    file?: string
}

export interface DownloadResult {
    comicId: string
    title: string
    episodes: number
    pictures: number
    downloaded: number
    skipped: number
    bytes: number
}

function safeSegment(value: string, fallback: string) {
    const normalized = value
        .normalize('NFKC')
        .trim()
        // eslint-disable-next-line no-control-regex
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .replace(/[. ]+$/g, '')
        .slice(0, 100)
    return normalized || fallback
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
        epsCount: comic.epsCount ?? 0
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

    constructor(
        readonly database: LibraryDatabase,
        readonly dataDir: string
    ) {
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

    async syncFavorites() {
        const pica = await this.connect()
        const { comics } = await pica.favoritesAll()
        return this.database.importFavorites(
            comics.map(comicToRecord),
            'pica:favorites',
            true
        )
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
        const seeds = [...favorites]
            .sort(
                (a, b) =>
                    (b.totalLikes ?? 0) - (a.totalLikes ?? 0) ||
                    String(b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
            )
            .slice(0, Math.max(1, Math.min(options.seedCount ?? 8, 12)))
        const related = await Promise.all(
            seeds.map(async (seed) => {
                try {
                    return await pica.related(seed.comicId)
                } catch {
                    return []
                }
            })
        )
        const candidateMap = new Map<string, FavoriteRecord>()
        for (const comic of related.flat())
            candidateMap.set(comic._id, comicToRecord(comic))
        this.database.importCatalog(
            [...candidateMap.values()],
            'pica:recommendations'
        )
        return recommendComics(this.database.listComics({ limit: 5000 }), limit)
    }

    async downloadComic(
        comicId: string,
        options: {
            episodeOrders?: number[]
            concurrency?: number
            onProgress?: (progress: DownloadProgress) => void
        } = {}
    ): Promise<DownloadResult> {
        const pica = await this.connect()
        const comic = await pica.comicInfo(comicId)
        if (comic.allowDownload === false) {
            throw new Error(
                'The site reports that this comic is not downloadable'
            )
        }
        this.database.importCatalog([comicToRecord(comic)], 'pica:download')
        let episodes = await pica.episodesAll(comicId)
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
            bytes: 0
        }
        for (const episode of episodes) {
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
            const pictures = await pica.picturesAll(comicId, episode)
            result.pictures += pictures.length
            const episodeDir = path.join(
                this.dataDir,
                'library',
                'objects',
                comicId,
                `${String(episode.order).padStart(4, '0')}-${safeSegment(
                    episode.title,
                    episodeId
                )}`
            )
            const concurrency = Math.max(
                1,
                Math.min(
                    options.concurrency ??
                        Number(process.env.PICA_DL_CONCURRENCY || 5),
                    20
                )
            )
            const limit = pLimit(concurrency)
            let completed = 0
            await Promise.all(
                pictures.map((picture, index) =>
                    limit(async () => {
                        const pictureId =
                            picture.id ||
                            String(
                                (picture as Picture & { _id?: string })._id ??
                                    ''
                            )
                        if (!pictureId) {
                            throw new Error(
                                'Picture response did not include an id'
                            )
                        }
                        this.database.upsertPicture({
                            id: pictureId,
                            comicId,
                            episodeId,
                            position: index + 1,
                            originalName: picture.media.originalName,
                            mediaPath: picture.media.path,
                            fileServer: picture.media.fileServer
                        })
                        const file = path.join(
                            episodeDir,
                            safeSegment(picture.name, `${index + 1}.jpg`)
                        )
                        const previous =
                            this.database.pictureDownloadState(pictureId)
                        const existingFile =
                            previous?.status === 'completed' &&
                            previous.localPath &&
                            fs.existsSync(previous.localPath)
                                ? previous.localPath
                                : fs.existsSync(file)
                                  ? file
                                  : null
                        if (
                            existingFile &&
                            fs.statSync(existingFile).size > 0
                        ) {
                            const data = fs.readFileSync(existingFile)
                            this.database.markPictureDownloaded(
                                pictureId,
                                existingFile,
                                data.byteLength,
                                createHash('sha256').update(data).digest('hex')
                            )
                            result.skipped += 1
                        } else {
                            const downloaded = await pica.downloadToFile(
                                picture.url,
                                file
                            )
                            this.database.markPictureDownloaded(
                                pictureId,
                                file,
                                downloaded.bytes,
                                downloaded.sha256
                            )
                            result.downloaded += 1
                            result.bytes += downloaded.bytes
                        }
                        completed += 1
                        options.onProgress?.({
                            comicId,
                            comicTitle: comic.title,
                            episodeId,
                            episodeTitle: episode.title,
                            completed,
                            total: pictures.length,
                            file
                        })
                    })
                )
            )
        }
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
