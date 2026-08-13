import { PRODUCT_VERSION } from '../version'
import { serializeLibraryBundle } from '../types/bundle'
import type { LibraryDatabase } from './database'
import type { StoredComic } from './types'

export interface BrowserLiteBundleOptions {
    generatedAt?: string
    profile?: Record<string, unknown> | null
    recommendations?: unknown[]
    source?: string
    comics?: StoredComic[]
}

export class EmptyBrowserLiteLibraryError extends Error {
    readonly code = 'EMPTY_BROWSER_LITE_LIBRARY'

    constructor() {
        super('There is no library data to export yet')
        this.name = 'EmptyBrowserLiteLibraryError'
    }
}

export function serializeBrowserLiteDataPackage(
    database: LibraryDatabase,
    options: BrowserLiteBundleOptions = {}
) {
    const comics = options.comics ?? database.listComics({ limit: 5000 })
    if (comics.length === 0) throw new EmptyBrowserLiteLibraryError()
    return serializeLibraryBundle({
        schemaVersion: 1,
        kind: 'pica-library-bundle',
        generatedAt: options.generatedAt ?? new Date().toISOString(),
        library: { comics },
        authors: database.listAuthors(),
        profile: options.profile ?? null,
        recommendations: options.recommendations ?? [],
        queue: database.listDownloadJobs(),
        provenance: {
            application: 'pica-library',
            version: PRODUCT_VERSION,
            source: options.source ?? 'desktop-export'
        }
    })
}
