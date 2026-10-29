import type { LibraryDatabase } from './database'
import type { LibraryFacetQuery, SortMode } from './types'
import type { LibraryQueryService } from '../services/library-query-service'

/**
 * Original /api/v1/comics, /api/v1/downloaded and /api/v1/library/query
 * semantics, now composed without LibraryService or any Provider SDK.
 *
 * The normal Desktop continues to see its entire historic catalogue.
 * Explicitly-owned OFFLINE QA composition can constrain reads to local IDs.
 * This type-only port cannot connect/activate sources or modify SQLite.
 */
export type CoreCataloguePort = Pick<
    LibraryDatabase,
    'listComics' | 'getComic' | 'listDownloadedComics'
>
export type CoreFacetsPort = Pick<LibraryQueryService, 'query'>

export interface CoreCatalogueResult {
    status: 200 | 404
    value: unknown
}
const LOCAL_ID = /^local:[a-f0-9]{64}$/
const allowedOfflineQuery = new Set([
    'scope', 'text', 'authorIds', 'tags', 'tagMode',
    'providerIds', 'finished', 'download', 'sort', 'limit', 'offset'
])
const sortModes = new Set([
    'latest', 'oldest', 'likes', 'views', 'title', 'recommended'
])
const scopes = new Set(['library', 'favorites', 'downloaded', 'catalog', 'all'])
const downloads = new Set([
    'downloaded', 'not-downloaded', 'partial', 'complete'
])
function list(value: string | null) {
    return String(value ?? '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
}

/** Exact historical GET query shape. Used by both existing and future core servers. */
export function coreCatalogueGet(
    url: URL,
    database: CoreCataloguePort,
    options: { localOnly?: boolean } = {}
): CoreCatalogueResult | null {
    if (url.pathname === '/api/v1/comics') {
        const query = {
            text: url.searchParams.get('q') ?? undefined,
            author: url.searchParams.get('author') ?? undefined,
            tags: list(url.searchParams.get('tags')),
            categories: list(url.searchParams.get('categories')),
            finished: url.searchParams.has('finished')
                ? url.searchParams.get('finished') === 'true'
                : undefined,
            sort: (url.searchParams.get('sort') ?? 'latest') as SortMode,
            limit: Number(url.searchParams.get('limit') ?? 100),
            offset: Number(url.searchParams.get('offset') ?? 0)
        }
        if (!options.localOnly)
            return { status: 200, value: database.listComics(query) }

        // The isolated core never interprets opaque provider IDs as local
        // records. Filter BEFORE pagination, including for historical DBs.
        const limit = Math.max(1, Math.min(
            Number.isSafeInteger(query.limit) ? query.limit : 100, 100
        ))
        const offset = Math.max(0, Math.min(
            Number.isSafeInteger(query.offset) ? query.offset : 0, 5000
        ))
        return {
            status: 200,
            value: database.listComics(
                { ...query, limit: Number.MAX_SAFE_INTEGER, offset: 0 },
                Number.MAX_SAFE_INTEGER
            ).filter(row =>
                row.providerId === 'local' && LOCAL_ID.test(row.comicId)
            ).slice(offset, offset + limit)
        }
    }
    if (url.pathname === '/api/v1/downloaded') {
        const values = database.listDownloadedComics()
        return { status: 200, value: options.localOnly
            ? values.filter(row => LOCAL_ID.test(row.comicId))
            : values }
    }
    const match = /^\/api\/v1\/comics\/([^/]+)$/.exec(url.pathname)
    if (match) {
        const comicId = decodeURIComponent(match[1])
        if (options.localOnly && !LOCAL_ID.test(comicId))
            return { status: 404, value: { error: 'Comic not found' } }
        const comic = database.getComic(comicId)
        if (options.localOnly && comic?.providerId !== 'local')
            return { status: 404, value: { error: 'Comic not found' } }
        return comic
            ? { status: 200, value: comic }
            : { status: 404, value: { error: 'Comic not found' } }
    }
    return null
}

/** Strict QA policy. The production server invokes the original query unchanged. */
export function offlineLocalFacetQuery(input: unknown): LibraryFacetQuery {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('Invalid local catalogue query')
    const data = input as Record<string, unknown>
    if (Object.keys(data).some(key => !allowedOfflineQuery.has(key)))
        throw new Error('Invalid local catalogue query')
    const string = (value: unknown, max = 200) =>
        value === undefined ||
        (typeof value === 'string' && value.length <= max &&
            !/[\u0000-\u001f\u007f]/.test(value))
    const strings = (value: unknown) =>
        value === undefined ||
        (Array.isArray(value) && value.length <= 40 &&
            value.every(item => typeof item === 'string' &&
                item.length > 0 && item.length <= 200 &&
                !/[\u0000-\u001f\u007f]/.test(item)))
    if (!string(data.text) || !strings(data.authorIds) ||
        !strings(data.tags) ||
        data.scope !== undefined && !scopes.has(String(data.scope)) ||
        data.tagMode !== undefined && !['all', 'any'].includes(String(data.tagMode)) ||
        data.finished !== undefined && typeof data.finished !== 'boolean' ||
        data.download !== undefined && !downloads.has(String(data.download)) ||
        data.sort !== undefined && !sortModes.has(String(data.sort)) ||
        data.limit !== undefined && (!Number.isSafeInteger(data.limit) ||
            Number(data.limit) < 1 || Number(data.limit) > 100) ||
        data.offset !== undefined && (!Number.isSafeInteger(data.offset) ||
            Number(data.offset) < 0 || Number(data.offset) > 5000) ||
        data.providerIds !== undefined &&
            (!Array.isArray(data.providerIds) ||
                data.providerIds.length !== 1 ||
                data.providerIds[0] !== 'local'))
        throw new Error('Invalid local catalogue query')
    return {
        ...data as LibraryFacetQuery,
        providerIds: ['local'],
        limit: data.limit === undefined ? 100 : data.limit as number,
        offset: data.offset === undefined ? 0 : data.offset as number
    }
}
export function coreCatalogueQuery(
    input: LibraryFacetQuery,
    queries: CoreFacetsPort,
    options: { localOnly?: boolean } = {}
) {
    return queries.query(
        options.localOnly ? offlineLocalFacetQuery(input) : input
    )
}
