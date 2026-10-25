import { catalogSourceId } from '../library/content-identity'
import type { CatalogSourceId } from '../library/content-identity'
import type { ReadingLibraryPort, ReadingLibraryRow, ReadingPosition } from '../library/reading-library'

interface CatalogueProgress extends ReadingPosition { comicId: string }
export interface ReadingCatalogueMetadata {
    comicId: string
    title: string
    providerId?: CatalogSourceId
    downloadedPictures: number
}
export interface ReadingCataloguePort {
    getComicsByIds(ids: string[]): readonly ReadingCatalogueMetadata[]
}
const labels: Record<CatalogSourceId, string> = { pica: 'Pica', eh: 'E-H / ExH', jm: 'JM', local: 'Local' }

/** All fixed-provider compatibility stays here, not in the generic projection. */
export function catalogueReadingPort(
    channel: 'local' | 'online',
    progress: () => readonly CatalogueProgress[],
    catalogue: ReadingCataloguePort,
    sourceEnabled: (id: Exclude<CatalogSourceId, 'local'>) => boolean
): ReadingLibraryPort {
    return {
        id: 'catalogue-' + channel,
        snapshot() {
            const values = progress()
            if (!Array.isArray(values) || values.length > 100) throw new Error('Invalid stored reading state')
            // Reject unknown namespaces before metadata lookup; never coerce a host into Pica.
            for (const value of values) catalogSourceId(value.comicId)
            const ids = [...new Set(values.map(value => value.comicId))]
            const comics = new Map(catalogue.getComicsByIds(ids).map(comic => [comic.comicId, comic]))
            return values.map(value => {
                const comic = comics.get(value.comicId), sourceId = catalogSourceId(value.comicId, comic?.providerId)
                return {
                    source: { key: 'catalogue:' + sourceId, label: labels[sourceId] },
                    comicId: value.comicId,
                    title: comic?.title ?? null,
                    channel,
                    available: channel === 'local' ? Boolean(comic && comic.downloadedPictures > 0) : sourceId !== 'local' && sourceEnabled(sourceId),
                    progress: { episodeId: value.episodeId, pageIndex: value.pageIndex, updatedAt: value.updatedAt }
                } satisfies ReadingLibraryRow
            })
        }
    }
}
