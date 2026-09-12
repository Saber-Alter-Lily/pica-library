import pLimit from 'p-limit'
import type { LibraryDatabase } from '../library/database'
import type { Episode, Picture } from '../types'
import type { ProviderService } from './provider-service'
import type { PreviewCacheManager } from './preview-cache-manager'

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
        private readonly database: LibraryDatabase,
        private readonly provider: Pick<
            ProviderService,
            'getEpisodes' | 'getEpisodePages' | 'fetchPage'
        >,
        private readonly cache: PreviewCacheManager
    ) {}

    private id(value: string) {
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value))
            throw new Error('无效的漫画或章节标识')
        return value
    }

    async chapters(comicId: string) {
        this.id(comicId)
        let episodes = this.albums.get(comicId)
        if (!episodes) {
            episodes = await this.provider.getEpisodes(comicId)
            episodes = episodes.map((episode) => ({
                ...episode,
                id: this.id(episode.id || episode._id || '')
            }))
            if (this.albums.size >= 20)
                this.albums.delete(this.albums.keys().next().value!)
            this.albums.set(comicId, episodes)
        }
        return episodes.map(({ id, title, order }) => ({
            id,
            title,
            order,
            source: 'provider'
        }))
    }

    private async metadata(comicId: string, episodeId: string) {
        this.id(comicId)
        this.id(episodeId)
        const key = `${comicId}:${episodeId}`
        let value = this.chaptersCache.get(key)
        if (!value) {
            await this.chapters(comicId)
            const episode = this.albums
                .get(comicId)
                ?.find((entry) => entry.id === episodeId)
            if (!episode) throw new Error('此漫画中不存在该章节')
            const pictures = await this.provider.getEpisodePages(
                comicId,
                episode
            )
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
        const { episode, pictures } = await this.metadata(comicId, episodeId)
        return {
            source: 'provider',
            episode: { id: episode.id, title: episode.title },
            progress: this.recentProgress().find(
                (entry) =>
                    entry.comicId === comicId && entry.episodeId === episodeId
            ),
            pages: pictures.map((_, index) => ({
                index,
                url: `/api/v1/online-reader/comics/${encodeURIComponent(comicId)}/chapters/${encodeURIComponent(episodeId)}/pages/${index}`
            }))
        }
    }

    async picture(comicId: string, episodeId: string, index: number) {
        const { pictures } = await this.metadata(comicId, episodeId)
        if (
            !Number.isSafeInteger(index) ||
            index < 0 ||
            index >= pictures.length
        )
            throw new Error('阅读页码无效')
        const key = `${comicId}:${episodeId}:${index}`
        const cached = this.cache.get(key)
        if (cached) return cached
        const pending = this.pendingImages.get(key)
        if (pending) return pending
        const request = this.imageLimit(async () => {
            const image = await this.provider.fetchPage(pictures[index].url)
            this.cache.put(key, image.data, image.contentType)
            return image
        })
        this.pendingImages.set(key, request)
        try {
            return await request
        } finally {
            this.pendingImages.delete(key)
        }
    }

    async saveProgress(comicId: string, episodeId: string, index: number) {
        const { pictures } = await this.metadata(comicId, episodeId)
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
            'online-reader-progress-v1',
            [
                value,
                ...this.recentProgress().filter(
                    (item) =>
                        item.comicId !== comicId || item.episodeId !== episodeId
                )
            ].slice(0, 100)
        )
        return value
    }

    recentProgress() {
        return (
            this.database.getAppState<
                Array<{
                    comicId: string
                    episodeId: string
                    pageIndex: number
                    updatedAt: string
                }>
            >('online-reader-progress-v1') ?? []
        )
    }
}
