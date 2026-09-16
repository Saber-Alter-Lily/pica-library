import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { LibraryDatabase } from '../library/database'
import type { ProviderService } from './provider-service'
import type { PreviewCacheManager } from './preview-cache-manager'
import type { VisualSamplingMode, VisualSourceKind } from '../recommendation-v4/visual-style'

export const VISUAL_SAMPLE_LIMIT = 6

function spreadIndexes(total: number, wanted: number) {
    if (total <= 0 || wanted <= 0) return []
    const count = Math.min(total, wanted)
    if (count === 1) return [Math.floor((total - 1) / 2)]
    const indexes = Array.from({ length: count }, (_, index) =>
        Math.round(((index + 0.5) / count) * (total - 1))
    )
    return [...new Set(indexes)].slice(0, count)
}

export interface VisualSampleDescriptor {
    sampleId: string
    url: string
    sourceKind: VisualSourceKind
    episodeId?: string
    pageIndex?: number
}

export class VisualStyleService {
    constructor(
        private readonly database: LibraryDatabase,
        private readonly provider: ProviderService,
        private readonly cache: PreviewCacheManager
    ) {}

    private localSamples(comicId: string, limit: number): VisualSampleDescriptor[] {
        const pages = this.database
            .listReaderEpisodes(comicId)
            .flatMap((episode) =>
                this.database.listDownloadedPictures(episode.id).map((picture, pageIndex) => ({
                    episodeId: episode.id,
                    pageIndex,
                    pictureId: picture.id
                }))
            )
        return spreadIndexes(pages.length, limit).map((index) => {
            const page = pages[index]
            return {
                sampleId: `local:${page.pictureId}`,
                url: `/api/v1/reader/pictures/${encodeURIComponent(page.pictureId)}`,
                sourceKind: 'LOCAL_PAGES' as const,
                episodeId: page.episodeId,
                pageIndex: page.pageIndex
            }
        })
    }

    private async remoteSamples(comicId: string, limit: number) {
        const episodes = (await this.provider.getEpisodes(comicId)).filter(
            (episode) => episode.order > 0
        )
        const selectedEpisodes = spreadIndexes(
            episodes.length,
            Math.min(3, limit)
        ).map((index) => episodes[index])
        const locators: Array<{
            locator: string
            episodeId: string
            pageIndex: number
        }> = []
        const perEpisode = Math.max(1, Math.ceil(limit / Math.max(1, selectedEpisodes.length)))
        for (const episode of selectedEpisodes) {
            const pictures = await this.provider.getEpisodePages(comicId, episode)
            for (const pageIndex of spreadIndexes(pictures.length, perEpisode)) {
                const picture = pictures[pageIndex]
                if (!picture?.url) continue
                locators.push({
                    locator: picture.url,
                    episodeId: episode.id,
                    pageIndex
                })
                if (locators.length >= limit) break
            }
            if (locators.length >= limit) break
        }
        const samples: VisualSampleDescriptor[] = []
        for (const [index, item] of locators.entries()) {
            const token = `visual:${randomUUID()}`
            const image = await this.provider.fetchPage(item.locator, 20 * 1024 * 1024)
            this.cache.put(token, image.data, image.contentType)
            samples.push({
                sampleId: token,
                url: `/api/v1/visual/samples/${encodeURIComponent(token)}`,
                sourceKind: 'REMOTE_PAGES',
                episodeId: item.episodeId,
                pageIndex: item.pageIndex
            })
            if (index + 1 < locators.length) await delay(250)
        }
        return samples
    }

    async prepare(
        comicId: string,
        mode: VisualSamplingMode = 'local_only',
        requestedLimit = VISUAL_SAMPLE_LIMIT
    ) {
        const limit = Math.max(1, Math.min(VISUAL_SAMPLE_LIMIT, requestedLimit))
        if (!this.database.getComic(comicId)) throw new Error('Unknown comic')
        if (mode === 'cover_only') {
            return {
                comicId,
                mode,
                sourceKind: 'COVER_ONLY' as const,
                samples: [
                    {
                        sampleId: `cover:${comicId}`,
                        url: `/api/v1/covers/${encodeURIComponent(comicId)}`,
                        sourceKind: 'COVER_ONLY' as const
                    }
                ]
            }
        }
        const local = this.localSamples(comicId, limit)
        if (local.length >= Math.min(3, limit) || mode === 'local_only') {
            return {
                comicId,
                mode,
                sourceKind: local.length ? ('LOCAL_PAGES' as const) : null,
                samples: local
            }
        }
        try {
            const remote = await this.remoteSamples(comicId, limit)
            if (remote.length)
                return {
                    comicId,
                    mode,
                    sourceKind: 'REMOTE_PAGES' as const,
                    samples: remote
                }
        } catch (error) {
            if (local.length)
                return {
                    comicId,
                    mode,
                    sourceKind: 'LOCAL_PAGES' as const,
                    samples: local,
                    fallbackReason:
                        error instanceof Error ? error.message : String(error)
                }
            throw error
        }
        return { comicId, mode, sourceKind: null, samples: [] }
    }

    page(token: string) {
        if (!/^visual:[0-9a-f-]{36}$/i.test(token))
            throw new Error('Invalid visual sample token')
        const image = this.cache.get(token)
        if (!image) throw new Error('Visual sample is no longer cached')
        return image
    }

    stats() {
        return this.cache.stats()
    }

    clear() {
        return this.cache.clear()
    }
}
