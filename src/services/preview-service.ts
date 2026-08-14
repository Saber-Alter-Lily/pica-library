import type { LibraryDatabase } from '../library/database'
import type { ProviderService } from './provider-service'
import type { PreviewCacheManager } from './preview-cache-manager'

export class PreviewService {
    constructor(
        private readonly database: LibraryDatabase,
        private readonly provider: ProviderService,
        private readonly cache: PreviewCacheManager
    ) {}

    async prepare(comicId: string, offset = 0, count = 3) {
        const boundedCount = Math.max(1, Math.min(count, 3))
        const boundedOffset = Math.max(0, offset)
        const localEpisode = this.database
            .listReaderEpisodes(comicId)
            .find((episode) => episode.downloadedPictures > 0)
        if (localEpisode) {
            const pictures = this.database
                .listDownloadedPictures(localEpisode.id)
                .slice(boundedOffset, boundedOffset + boundedCount)
            return {
                source: 'local' as const,
                episodeId: localEpisode.id,
                episodeTitle: localEpisode.title,
                offset: boundedOffset,
                pages: pictures.map((picture, index) => ({
                    index: boundedOffset + index,
                    url: `/api/v1/reader/pictures/${encodeURIComponent(picture.id)}`
                })),
                hasMore:
                    boundedOffset + pictures.length <
                    localEpisode.downloadedPictures
            }
        }
        const episodes = await this.provider.getEpisodes(comicId)
        const episode = episodes.find((item) => item.order > 0) ?? episodes[0]
        if (!episode)
            return { source: 'unavailable' as const, pages: [], hasMore: false }
        const pictures = await this.provider.getEpisodePages(comicId, episode)
        const selected = pictures.slice(
            boundedOffset,
            boundedOffset + boundedCount
        )
        for (let index = 0; index < selected.length; index++) {
            const picture = selected[index]
            const key = `${comicId}:${episode.id}:${boundedOffset + index}`
            if (this.cache.get(key)) continue
            const image = await this.provider.fetchPage(picture.url)
            this.cache.put(key, image.data, image.contentType)
        }
        return {
            source: 'provider' as const,
            episodeId: episode.id,
            episodeTitle: episode.title,
            offset: boundedOffset,
            pages: selected.map((_, index) => ({
                index: boundedOffset + index,
                url: `/api/v1/previews/${encodeURIComponent(comicId)}/${encodeURIComponent(episode.id)}/${boundedOffset + index}`
            })),
            hasMore: boundedOffset + selected.length < pictures.length
        }
    }

    page(comicId: string, episodeId: string, pageIndex: number) {
        const value = this.cache.get(`${comicId}:${episodeId}:${pageIndex}`)
        if (!value) throw new Error('Preview page is not cached')
        return value
    }

    stats() {
        return this.cache.stats()
    }

    clear() {
        return this.cache.clear()
    }
}
