import { randomBytes } from 'node:crypto'

const ROOT = 'v1'

export function remoteIdSegment(value: string) {
    const trimmed = value.trim()
    if (!trimmed) throw new Error('Remote library id cannot be empty')
    return encodeURIComponent(trimmed)
}

export function generationId(now = new Date()) {
    const timestamp = now.toISOString().replace(/[-:.]/g, '')
    return `${timestamp}-${randomBytes(3).toString('hex')}`
}

export const remoteLayout = {
    root: ROOT,
    current: `${ROOT}/control/current.json`,
    shelves: `${ROOT}/state/shelves.json`,
    favorites: `${ROOT}/state/favorites.json`,
    readerSettings: `${ROOT}/state/reader-settings.json`,
    readingRoot: `${ROOT}/state/reading`,
    readingCurrent: `${ROOT}/state/reading/current.json`,
    generationCatalog(generation: string) {
        return `${ROOT}/index/generations/${remoteIdSegment(generation)}.json`
    },
    comicRoot(comicId: string) {
        return `${ROOT}/comics/${remoteIdSegment(comicId)}`
    },
    comicManifest(comicId: string) {
        return `${this.comicRoot(comicId)}/manifest.json`
    },
    comicCover(comicId: string, extension: string) {
        const ext = extension.replace(/^\./, '').toLowerCase()
        if (!/^[a-z0-9]{2,8}$/.test(ext))
            throw new Error('Unsafe remote cover extension')
        return `${this.comicRoot(comicId)}/cover.${ext}`
    },
    episodeRoot(comicId: string, episodeId: string) {
        return `${this.comicRoot(comicId)}/episodes/${remoteIdSegment(episodeId)}`
    },
    episodeManifest(comicId: string, episodeId: string) {
        return `${this.episodeRoot(comicId, episodeId)}/manifest.json`
    },
    page(
        comicId: string,
        episodeId: string,
        pageIndex: number,
        extension: string
    ) {
        if (!Number.isInteger(pageIndex) || pageIndex < 0)
            throw new Error('Remote page index is invalid')
        const ext = extension.replace(/^\./, '').toLowerCase()
        if (!/^[a-z0-9]{2,8}$/.test(ext))
            throw new Error('Unsafe remote page extension')
        const file = String(pageIndex + 1).padStart(6, '0')
        return `${this.episodeRoot(comicId, episodeId)}/pages/${file}.${ext}`
    },
    readingState(deviceId: string) {
        return `${ROOT}/state/reading/${remoteIdSegment(deviceId)}.json`
    },
    recommendationState(profileId: string) {
        return `${ROOT}/state/recommendations/${remoteIdSegment(profileId)}.json`
    }
}
