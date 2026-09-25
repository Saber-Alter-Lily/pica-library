import { createHash } from 'node:crypto'
import type { LibraryDatabase } from '../library/database'
import type { ProviderService } from './provider-service'
import type { PreviewCacheManager } from './preview-cache-manager'

export class PreviewService {
    private readonly preparedPages = new Map<
        string,
        { scope: string; sourceFingerprint: string }
    >()

    constructor(
        private readonly database: LibraryDatabase,
        private readonly provider: ProviderService,
        private readonly cache: PreviewCacheManager
    ) {}

    private sourceIdentity(comicId: string, locator: string) {
        const scope = this.provider.cacheScope(comicId)
        return {
            scope,
            sourceFingerprint: createHash('sha256')
                .update(`${scope}\n${locator}`)
                .digest('hex')
        }
    }

    private rememberPrepared(
        key: string,
        identity: { scope: string; sourceFingerprint: string }
    ) {
        if (!this.preparedPages.has(key) && this.preparedPages.size >= 128)
            this.preparedPages.delete(this.preparedPages.keys().next().value!)
        this.preparedPages.set(key, identity)
    }

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
            const identity = this.sourceIdentity(comicId, picture.url)
            if (!this.cache.get(key, identity.sourceFingerprint)) {
                const image = await this.provider.fetchPage(picture.url)
                this.cache.put(
                    key,
                    image.data,
                    image.contentType,
                    identity.sourceFingerprint
                )
            }
            this.rememberPrepared(key, identity)
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
        const key = `${comicId}:${episodeId}:${pageIndex}`
        const identity = this.preparedPages.get(key)
        if (
            !identity ||
            identity.scope !== this.provider.cacheScope(comicId)
        )
            throw new Error('Preview page is not prepared for the current provider scope')
        const value = this.cache.get(key, identity.sourceFingerprint)
        if (!value) throw new Error('Preview page is not cached')
        return value
    }

    stats() {
        return this.cache.stats()
    }

    clear() {
        this.preparedPages.clear()
        return this.cache.clear()
    }
}
