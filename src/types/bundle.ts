import type { AuthorGroup, StoredComic } from '../library/types'
import type { DownloadJob } from '../core/downloads/types'

export const bundleSchemaVersion = 1

export interface LibraryBundle {
    schemaVersion: 1
    kind: 'pica-library-bundle'
    generatedAt: string
    library: {
        comics: StoredComic[]
    }
    authors: AuthorGroup[]
    profile: Record<string, unknown> | null
    recommendations: unknown[]
    queue: DownloadJob[]
    provenance: {
        application: 'pica-library'
        version: string
        source: string
    }
}

const sensitiveKey = /(account|password|passwd|token|cookie|secret|api[_-]?key)/i
const absoluteWindowsPath = /^[a-z]:[\\/]/i

function auditPortable(value: unknown, location = '$'): void {
    if (Array.isArray(value)) {
        value.forEach((item, index) => auditPortable(item, `${location}[${index}]`))
        return
    }
    if (!value || typeof value !== 'object') {
        if (
            typeof value === 'string' &&
            (absoluteWindowsPath.test(value) || value.startsWith('/'))
        )
            throw new Error(`Bundle contains an absolute path at ${location}`)
        return
    }
    for (const [key, item] of Object.entries(value)) {
        if (sensitiveKey.test(key))
            throw new Error(`Bundle contains a sensitive field at ${location}.${key}`)
        auditPortable(item, `${location}.${key}`)
    }
}

export function validateLibraryBundle(value: unknown): LibraryBundle {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Bundle must be an object')
    const bundle = value as Partial<LibraryBundle>
    if (bundle.schemaVersion !== bundleSchemaVersion)
        throw new Error(`Unsupported bundle schemaVersion: ${String(bundle.schemaVersion)}`)
    if (bundle.kind !== 'pica-library-bundle')
        throw new Error('Invalid bundle kind')
    if (!bundle.library || !Array.isArray(bundle.library.comics))
        throw new Error('Bundle library.comics must be an array')
    if (!Array.isArray(bundle.authors) || !Array.isArray(bundle.recommendations))
        throw new Error('Bundle authors and recommendations must be arrays')
    if (!Array.isArray(bundle.queue)) throw new Error('Bundle queue must be an array')
    if (!bundle.provenance || bundle.provenance.application !== 'pica-library')
        throw new Error('Invalid bundle provenance')
    auditPortable(bundle)
    return bundle as LibraryBundle
}

export function serializeLibraryBundle(bundle: LibraryBundle) {
    return JSON.stringify(validateLibraryBundle(bundle), null, 2)
}
