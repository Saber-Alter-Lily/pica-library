import type { ReaderService } from '../services/reader-service'

/**
 * Shared source-free read half of the EXISTING /api/v1/reader HTTP contract.
 * The old Desktop HTTP server and a future offline-only server use the same
 * ReaderService implementation; this is not another Reader or another URL API.
 *
 * Authentication, origin/CSRF, HTTP stream ownership, and response framing
 * remain with the trusted caller. This port cannot open a file externally,
 * write progress, connect a provider or initialize a source process.
 */
export type LocalReaderGetPort = Pick<
    ReaderService, 'chapters' | 'chapter' | 'picture' | 'recentProgress'
>

export type LocalReaderReadResult =
    | { kind: 'json'; value: unknown }
    | {
        kind: 'image'
        data: Buffer
        contentType: string
        cacheControl: 'private, no-store' | 'private, max-age=3600'
    }

/**
 * Return null for an unrelated GET URL. Malformed percent escapes are not
 * normalized/guessed; the host's existing HTTP error handler receives them.
 */
export function localReaderGet(
    pathname: string,
    reader: LocalReaderGetPort
): LocalReaderReadResult | null {
    const chapters = /^\/api\/v1\/reader\/comics\/([^/]+)\/chapters$/.exec(pathname)
    if (chapters)
        return {
            kind: 'json',
            value: reader.chapters(decodeURIComponent(chapters[1]))
        }
    const chapter = /^\/api\/v1\/reader\/comics\/([^/]+)\/chapters\/([^/]+)$/.exec(pathname)
    if (chapter)
        return {
            kind: 'json',
            value: reader.chapter(
                decodeURIComponent(chapter[1]),
                decodeURIComponent(chapter[2])
            )
        }
    const picture = /^\/api\/v1\/reader\/pictures\/([^/]+)$/.exec(pathname)
    if (picture) {
        const id = decodeURIComponent(picture[1])
        const image = reader.picture(id)
        return {
            kind: 'image',
            data: image.data,
            contentType: image.contentType,
            cacheControl: id.startsWith('local:')
                ? 'private, no-store' : 'private, max-age=3600'
        }
    }
    if (pathname === '/api/v1/reader/progress')
        return { kind: 'json', value: reader.recentProgress() }
    return null
}
