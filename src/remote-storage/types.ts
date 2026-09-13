export const REMOTE_LIBRARY_SCHEMA_VERSION = 1 as const

export type RemoteStorageKind = 'webdav'

export interface RemoteStoragePublicConfig {
    kind: RemoteStorageKind
    baseUrl: string
    root: string
}

export interface RemoteStorageCredentials {
    username?: string
    password?: string
}

export interface RemoteLibraryPointer {
    schemaVersion: typeof REMOTE_LIBRARY_SCHEMA_VERSION
    generation: string
    catalogPath: string
    updatedAt: string
}

export interface RemoteCatalogEntry {
    comicId: string
    title: string
    author: string
    canonicalAuthor?: string | null
    authorId?: string | null
    tags?: string[]
    categories?: string[]
    finished?: boolean
    isFavorite?: boolean
    knownPictures?: number
    manifestPath: string
    coverPath?: string
    episodeCount: number
    pageCount: number
    updatedAt?: string
}

export interface RemoteLibraryCatalog {
    schemaVersion: typeof REMOTE_LIBRARY_SCHEMA_VERSION
    generation: string
    generatedAt: string
    comics: RemoteCatalogEntry[]
}

export interface RemotePageManifestEntry {
    index: number
    objectPath: string
    sha256: string
    bytes: number
    contentType: string
}

export interface RemoteEpisodeManifest {
    schemaVersion: typeof REMOTE_LIBRARY_SCHEMA_VERSION
    comicId: string
    episodeId: string
    title: string
    order: number
    pageCount: number
    pages: RemotePageManifestEntry[]
}

export interface RemoteComicEpisodeEntry {
    episodeId: string
    title: string
    order: number
    pageCount: number
    manifestPath: string
}

export interface RemoteComicManifest {
    schemaVersion: typeof REMOTE_LIBRARY_SCHEMA_VERSION
    comicId: string
    title: string
    author: string
    coverPath?: string
    coverSha256?: string
    coverBytes?: number
    generatedAt: string
    episodes: RemoteComicEpisodeEntry[]
}

export interface RemoteFavoriteItem {
    comicId: string
    title: string
    author: string
    canonicalAuthor?: string | null
    coverPath?: string
    downloadedPictures: number
    knownPictures: number
    updatedAt?: string
}

export interface RemoteFavoriteState {
    schemaVersion: typeof REMOTE_LIBRARY_SCHEMA_VERSION
    updatedAt: string
    items: RemoteFavoriteItem[]
}

export interface RemoteReadingEntry {
    comicId: string
    episodeId: string
    pageIndex: number
    updatedAt: string
    deviceId: string
    comicTitle?: string
    author?: string
    episodeTitle?: string
    episodeOrder?: number
}

export interface RemoteReadingState {
    schemaVersion: typeof REMOTE_LIBRARY_SCHEMA_VERSION
    updatedAt: string
    entries: RemoteReadingEntry[]
}

export interface RemoteReaderSettings {
    schemaVersion: typeof REMOTE_LIBRARY_SCHEMA_VERSION
    updatedAt: string
    deviceId: string
    mode: 0 | 1 | 2
    keepOn: boolean
}

export interface RemoteObject {
    path: string
    data: Buffer
    contentType?: string
    etag?: string
    lastModified?: string
}

export interface RemoteJsonVersion<T> {
    value: T | null
    exists: boolean
    etag?: string
    lastModified?: string
}

export interface RemoteStorageProvider {
    readonly kind: RemoteStorageKind
    withExclusiveLibraryWrite?<T>(work: () => Promise<T>): Promise<T>
    deleteComic?(comicId: string): Promise<void>
    test(): Promise<{ success: true; status: number }>
    exists(path: string): Promise<boolean>
    ensureDirectory(path: string): Promise<void>
    get(path: string): Promise<RemoteObject | null>
    put(path: string, data: Buffer, contentType?: string): Promise<void>
    getJson<T>(path: string): Promise<T | null>
    putJson(path: string, value: unknown): Promise<void>
    getJsonVersioned<T>(path: string): Promise<RemoteJsonVersion<T>>
    putJsonConditional(
        path: string,
        value: unknown,
        expected: Pick<
            RemoteJsonVersion<unknown>,
            'exists' | 'etag' | 'lastModified'
        >
    ): Promise<boolean>
}
