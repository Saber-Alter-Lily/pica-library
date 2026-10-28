/**
 * Source-neutral, versioned metadata for an explicitly trusted reader adapter.
 * This is NOT a plugin installer, an account store or permission to execute a
 * manifest. The application must supply the transport separately.
 *
 * Design references: Mihon's bring-your-own-content boundary and Suwayomi's
 * optional source runtime. Neither project's executable extension format is
 * imported by Pica Library.
 */
export const EXTERNAL_READER_API_VERSION = 1 as const

export interface ExternalReaderManifest {
    apiVersion: typeof EXTERNAL_READER_API_VERSION
    id: string
    capabilities: {
        chapters: true
        pages: true
        media: true
    }
}

export interface ExternalReaderEpisode {
    id: string
    title: string
    order: number
}

export interface ExternalReaderPage {
    /** Opaque source-local token, not a URL, filesystem path or account key. */
    key: string
}

export interface ExternalReaderMedia {
    /** Binary transfer through the application-controlled transport. */
    bytes: Uint8Array
    contentType: string
}

export interface ExternalReaderTransport {
    episodes(comicId: string): Promise<ExternalReaderEpisode[]>
    pages(comicId: string, episodeId: string): Promise<ExternalReaderPage[]>
    media(comicId: string, pageKey: string): Promise<ExternalReaderMedia>
}

/** The owner of the source runtime provides revocation and session identity. */
export interface ExternalReaderAccess {
    assertEnabled(): void
    /** Opaque revision; must change when ownership, permissions or account do. */
    revision(): string
}

const ID = /^[a-z][a-z0-9-]{2,31}$/
const WORK = /^[a-zA-Z0-9_-]{1,128}$/
const PAGE_KEY = /^[a-zA-Z0-9_-]{1,96}$/
const REVISION = /^[a-zA-Z0-9._-]{1,128}$/
const RESERVED = new Set([
    'pica', 'eh', 'exh', 'jm', 'local', 'host', 'remote', 'private'
])

function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
    return Object.keys(value).length === keys.length &&
        keys.every((key) => Object.hasOwn(value, key))
}

/** Fail closed on unknown API versions, executable hints and route collisions. */
export function normalizeExternalReaderManifest(value: unknown): ExternalReaderManifest {
    if (!object(value) || !exactKeys(value, ['apiVersion', 'id', 'capabilities']) ||
        value.apiVersion !== EXTERNAL_READER_API_VERSION ||
        typeof value.id !== 'string' || !ID.test(value.id) ||
        RESERVED.has(value.id) || !object(value.capabilities) ||
        !exactKeys(value.capabilities, ['chapters', 'pages', 'media']) ||
        value.capabilities.chapters !== true ||
        value.capabilities.pages !== true ||
        value.capabilities.media !== true)
        throw new Error('Invalid or unsupported external reader manifest')
    return {
        apiVersion: EXTERNAL_READER_API_VERSION,
        id: value.id,
        capabilities: { chapters: true, pages: true, media: true }
    }
}

export function externalComicIdentity(sourceId: string, comicId: string) {
    if (typeof comicId !== 'string' || !comicId.startsWith(sourceId + ':') ||
        !WORK.test(comicId.slice(sourceId.length + 1)))
        throw new Error('Comic does not belong to this source')
    return comicId
}

export function externalEpisodeIdentity(episodeId: string) {
    if (typeof episodeId !== 'string' || !WORK.test(episodeId))
        throw new Error('Invalid external reader chapter identity')
    return episodeId
}

export function externalRuntimeRevision(value: string) {
    if (typeof value !== 'string' || !REVISION.test(value))
        throw new Error('Invalid external reader runtime revision')
    return value
}

export function externalPageLocator(sourceId: string, comicId: string, key: string) {
    externalComicIdentity(sourceId, comicId)
    if (typeof key !== 'string' || !PAGE_KEY.test(key))
        throw new Error('Invalid source page token')
    return 'source-page:' + sourceId + ':' + encodeURIComponent(comicId) + ':' + key
}

/**
 * Bind a media token to its source AND work before every cache access.
 * HTTP(S) media URLs are intentionally never interpreted as a source route.
 */
export function assertExternalPageOwner(sourceId: string, comicId: string, locator: string) {
    externalComicIdentity(sourceId, comicId)
    const prefix = 'source-page:' + sourceId + ':' + encodeURIComponent(comicId) + ':'
    if (typeof locator !== 'string' || !locator.startsWith(prefix))
        throw new Error('Page source does not match comic source')
    const key = locator.slice(prefix.length)
    if (!PAGE_KEY.test(key)) throw new Error('Invalid source page token')
    return key
}

export function validateExternalEpisodes(value: unknown): ExternalReaderEpisode[] {
    if (!Array.isArray(value) || value.length > 4096)
        throw new Error('Invalid external chapter list')
    const seen = new Set<string>()
    return value.map((row: unknown) => {
        if (!object(row) || !exactKeys(row, ['id', 'title', 'order']))
            throw new Error('Invalid external chapter')
        const id = externalEpisodeIdentity(row.id as string)
        if (seen.has(id) || typeof row.title !== 'string' ||
            row.title.length > 512 || !Number.isSafeInteger(row.order) ||
            (row.order as number) < 0 || (row.order as number) > 1000000)
            throw new Error('Invalid external chapter')
        seen.add(id)
        return { id, title: row.title, order: row.order as number }
    })
}

export function validateExternalPages(value: unknown): ExternalReaderPage[] {
    if (!Array.isArray(value) || value.length > 10000)
        throw new Error('Invalid external page list')
    const seen = new Set<string>()
    return value.map((row: unknown) => {
        if (!object(row) || !exactKeys(row, ['key']) ||
            typeof row.key !== 'string' || !PAGE_KEY.test(row.key) ||
            seen.has(row.key))
            throw new Error('Invalid external page token')
        seen.add(row.key)
        return { key: row.key }
    })
}

const SAFE_RASTER = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif'
])
export const MAX_EXTERNAL_MEDIA_BYTES = 20 * 1024 * 1024

export function validateExternalMedia(value: unknown): ExternalReaderMedia {
    if (!object(value) || !exactKeys(value, ['bytes', 'contentType']) ||
        !(value.bytes instanceof Uint8Array) ||
        !value.bytes.byteLength || value.bytes.byteLength > MAX_EXTERNAL_MEDIA_BYTES ||
        typeof value.contentType !== 'string' || !SAFE_RASTER.has(value.contentType))
        throw new Error('Invalid external reader media payload')
    return { bytes: value.bytes, contentType: value.contentType }
}
