import { createHash } from 'node:crypto'
import pLimit from 'p-limit'
import type { Episode, Picture } from '../types'
import { orderReaderProgress } from '../reader/progress-writes'

export interface OnlineReaderState {
    getAppState<T>(key: string): T | undefined
    setAppState(key: string, value: unknown): void
}
export interface OnlineReaderCache {
    get(key: string, fingerprint?: string): { data: Buffer; contentType: string } | null
    put(key: string, data: Buffer, contentType: string, fingerprint?: string): unknown
}
export interface OnlineReaderSource {
    cacheScope(comicId: string): string
    prepareSource?(comicId: string): Promise<void>
    getEpisodes(comicId: string): Promise<Episode[]>
    getEpisodePages(comicId: string, episode: Episode): Promise<Picture[]>
    fetchPage(locator: string): Promise<{ data: Buffer; contentType: string }>
}

/** Application-owned ports, never accepted from a browser or a remote source descriptor. */
export interface OnlineReaderContract {
    comicId(value: string): string
    episodeId(value: string): string
    pageUrl(comicId: string, episodeId: string, index: number): string
    progressKey: string
    assertAccess(): void
}

/** Online metadata and bounded page cache; never creates a download job. */
export class OnlineReaderService {
    private readonly albums = new Map<string, Episode[]>()
    private readonly chaptersCache = new Map<
        string,
        { episode: Episode; pictures: Picture[] }
    >()
    private readonly pendingImages = new Map<
        string,
        Promise<{ data: Buffer; contentType: string }>
    >()
    private readonly imageLimit = pLimit(4)

    constructor(
        private readonly database: OnlineReaderState,
        private readonly provider: OnlineReaderSource,
        private readonly cache: OnlineReaderCache,
        private readonly contract?: OnlineReaderContract
    ) {}

    private comicId(value: string) {
        if (this.contract) return this.contract.comicId(value)
        if (
            !/^[a-zA-Z0-9_-]{1,128}$/.test(value) &&
            !/^eh:\d+:[0-9a-f]{10}$/i.test(value) &&
            !/^jm:[1-9]\d{0,14}$/.test(value)
        )
            throw new Error('无效的漫画标识')
        return value
    }

    private episodeId(value: string) {
        if (this.contract) return this.contract.episodeId(value)
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value) && !/^jm-chapter:[1-9]\d{0,14}$/.test(value))
            throw new Error('无效的章节标识')
        return value
    }

    private scope(comicId: string) {
        this.contract?.assertAccess()
        return this.provider.cacheScope(comicId)
    }
    private current(comicId: string, scope: string) {
        if (this.scope(comicId) !== scope) throw new Error('Reader source session changed')
    }

    async chapters(comicId: string) {
        this.comicId(comicId)
        await this.provider.prepareSource?.(comicId)
        const scope = this.scope(comicId)
        const albumKey = `${scope}\n${comicId}`
        let episodes = this.albums.get(albumKey)
        if (!episodes) {
            episodes = await this.provider.getEpisodes(comicId)
            this.current(comicId, scope)
            episodes = episodes.map((episode) => ({
                ...episode,
                id: this.episodeId(episode.id || episode._id || '')
            }))
            if (this.albums.size >= 20)
                this.albums.delete(this.albums.keys().next().value!)
            this.albums.set(albumKey, episodes)
        }
        return episodes.map(({ id, title, order }) => ({
            id,
            title,
            order,
            source: 'provider'
        }))
    }

    private async metadata(comicId: string, episodeId: string) {
        this.comicId(comicId)
        this.episodeId(episodeId)
        await this.chapters(comicId)
        const scope = this.scope(comicId)
        const albumKey = `${scope}\n${comicId}`
        const key = `${scope}\n${comicId}\n${episodeId}`
        let value = this.chaptersCache.get(key)
        if (!value) {
            const episode = this.albums
                .get(albumKey)
                ?.find((entry) => entry.id === episodeId)
            if (!episode) throw new Error('此漫画中不存在该章节')
            const pictures = await this.provider.getEpisodePages(
                comicId,
                episode
            )
            this.current(comicId, scope)
            if (pictures.length > 10000)
                throw new Error('章节过大，暂不支持在线阅读')
            value = { episode, pictures }
            if (this.chaptersCache.size >= 32)
                this.chaptersCache.delete(
                    this.chaptersCache.keys().next().value!
                )
            this.chaptersCache.set(key, value)
        }
        return value
    }

    async chapter(comicId: string, episodeId: string) {
        this.comicId(comicId); this.episodeId(episodeId)
        const scope = this.scope(comicId)
        const { episode, pictures } = await this.metadata(comicId, episodeId)
        this.current(comicId, scope)
        return {
            source: 'provider',
            episode: { id: episode.id, title: episode.title },
            progress: this.recentProgress().find(
                (entry) =>
                    entry.comicId === comicId && entry.episodeId === episodeId
            ),
            pages: pictures.map((_, index) => ({
                index,
                url: this.contract?.pageUrl(comicId, episodeId, index) ?? `/api/v1/online-reader/comics/${encodeURIComponent(comicId)}/chapters/${encodeURIComponent(episodeId)}/pages/${index}`
            }))
        }
    }

    async picture(comicId: string, episodeId: string, index: number) {
        this.comicId(comicId); this.episodeId(episodeId)
        const scope = this.scope(comicId)
        const { pictures } = await this.metadata(comicId, episodeId)
        this.current(comicId, scope)
        if (
            !Number.isSafeInteger(index) ||
            index < 0 ||
            index >= pictures.length
        )
            throw new Error('阅读页码无效')
        const key = `${comicId}:${episodeId}:${index}`
        const sourceFingerprint = createHash('sha256')
            .update(
                `${scope}\n${pictures[index].url}`
            )
            .digest('hex')
        const cached = this.cache.get(key, sourceFingerprint)
        if (cached) return cached
        const pendingKey = `${key}:${sourceFingerprint}`
        const pending = this.pendingImages.get(pendingKey)
        if (pending) return pending
        const request = this.imageLimit(async () => {
            this.current(comicId, scope)
            const image = await this.provider.fetchPage(pictures[index].url)
            this.current(comicId, scope)
            this.cache.put(
                key,
                image.data,
                image.contentType,
                sourceFingerprint
            )
            return image
        })
        this.pendingImages.set(pendingKey, request)
        try {
            return await request
        } finally {
            this.pendingImages.delete(pendingKey)
        }
    }

    async saveProgress(comicId: string, episodeId: string, index: number) {
        this.comicId(comicId); this.episodeId(episodeId)
        const scope = this.scope(comicId)
        return orderReaderProgress(
            this.database,
            this.contract?.progressKey ?? 'online-reader-progress-v1',
            async () => {
                this.current(comicId, scope)
                const { pictures } = await this.metadata(comicId, episodeId)
                this.current(comicId, scope)
                if (
                    !Number.isSafeInteger(index) ||
                    index < 0 ||
                    index >= pictures.length
                )
                    throw new Error('阅读页码无效')
                const value = {
                    comicId,
                    episodeId,
                    pageIndex: index,
                    updatedAt: new Date().toISOString()
                }
                this.database.setAppState(
                    this.contract?.progressKey ?? 'online-reader-progress-v1',
                    [
                        value,
                        ...this.recentProgress().filter(
                            (item) => item.comicId !== comicId || item.episodeId !== episodeId
                        )
                    ].slice(0, 100)
                )
                return value
            }
        )
    }

    recentProgress() {
        this.contract?.assertAccess()
        return (
            this.database.getAppState<
                Array<{
                    comicId: string
                    episodeId: string
                    pageIndex: number
                    updatedAt: string
                }>
            >(this.contract?.progressKey ?? 'online-reader-progress-v1') ?? []
        )
    }
}
