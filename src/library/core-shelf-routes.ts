import type { ShelfService } from '../services/shelf-service'
import type { FavoriteRecord, LibraryFacetQuery, StoredComic } from './types'
import type { UserEventInput } from '../recommendation-v3/types'
import { offlineLocalFacetQuery } from './core-catalog-read'

/**
 * Existing /api/v1/shelves route semantics, moved out of the former
 * source-entangled Desktop HTTP server. The imported services are type-only:
 * the caller owns authentication, JSON size bounds, SQLite and HTTP framing.
 *
 * Desktop (localOnly=false) retains the historic provider catalogue.
 * A source-free local-only host cannot create foreign catalogue records,
 * read foreign shelf rows, or silently enable any source.
 */
export type CoreShelfPort = Pick<ShelfService,
    'list' | 'create' | 'rename' | 'delete' | 'contents' |
    'add' | 'addFiltered' | 'remove'
>
export type CoreShelfAction =
    | 'list' | 'create' | 'contents' | 'rename' | 'delete'
    | 'items' | 'remove' | 'add-filtered'
export interface CoreShelfMatch {
    action: CoreShelfAction
    shelfId?: string
    needsBody: boolean
}
export interface CoreShelfOptions {
    localOnly?: boolean
    appSessionId?: string | null
    contextId?: string | null
    recordUserEvents?: (events: UserEventInput[]) => void
}
const LOCAL_COMIC = /^local:[a-f0-9]{64}$/
const SHELF_UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export function coreShelfMatch(method: string, pathname: string): CoreShelfMatch | null {
    if (pathname === '/api/v1/shelves') {
        if (method === 'GET') return { action: 'list', needsBody: false }
        if (method === 'POST') return { action: 'create', needsBody: true }
        return null
    }
    const single = /^\/api\/v1\/shelves\/([^/]+)$/.exec(pathname)
    if (single) {
        const shelfId = decodeURIComponent(single[1])
        if (method === 'GET') return { action: 'contents', shelfId, needsBody: false }
        if (method === 'PATCH') return { action: 'rename', shelfId, needsBody: true }
        if (method === 'DELETE') return { action: 'delete', shelfId, needsBody: false }
        return null
    }
    const items = /^\/api\/v1\/shelves\/([^/]+)\/(items|remove|add-filtered)$/.exec(pathname)
    if (items && method === 'POST')
        return { action: items[2] as CoreShelfAction,
            shelfId: decodeURIComponent(items[1]), needsBody: true }
    return null
}
function idList(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String).filter(Boolean)
    return String(value ?? '')
        .split(',').map(part => part.trim()).filter(Boolean)
}
function invalid(): never {
    throw new Error('Invalid local-only shelf request')
}
function object(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
function validatedInput(route: CoreShelfMatch, value: unknown,
    localOnly: boolean): Record<string, unknown> {
    if (!localOnly) return (value ?? {}) as Record<string, unknown>
    if (!object(value)) return invalid()
    const allowed = route.action === 'create' || route.action === 'rename'
        ? ['name']
        : route.action === 'add-filtered' ? ['query'] : ['comicIds']
    if (route.needsBody &&
        Object.keys(value).some(key => !allowed.includes(key)))
        return invalid()
    if (route.action === 'create' || route.action === 'rename') {
        if (typeof value.name !== 'string' ||
            !value.name.trim() || value.name.length > 80 ||
            /[\u0000-\u001f\u007f]/.test(value.name)) return invalid()
    }
    if (route.action === 'items' || route.action === 'remove') {
        if (!Array.isArray(value.comicIds) ||
            value.comicIds.length < 1 || value.comicIds.length > 100 ||
            value.comicIds.some(id => typeof id !== 'string' ||
                !LOCAL_COMIC.test(id))) return invalid()
    }
    if (route.action === 'add-filtered')
        return { query: offlineLocalFacetQuery(value.query ?? {}) }
    return value
}
function localOnlyRow(value: StoredComic) {
    return value.providerId === 'local' && LOCAL_COMIC.test(value.comicId)
}
function assertLocalShelfId(value: string) {
    if (!SHELF_UUID.test(value)) invalid()
}
function emit(
    action: 'shelf_add' | 'shelf_remove',
    shelfId: string,
    comicIds: string[],
    options: CoreShelfOptions
) {
    if (!options.recordUserEvents) return
    options.recordUserEvents(comicIds.map(comicId => ({
        eventType: action, comicId, source: 'shelf',
        appSessionId: options.appSessionId || null,
        contextId: options.contextId || null,
        metadata: { shelfId }
    } satisfies UserEventInput)))
}

/** Synchronous and generic so it can be used by both legacy Desktop and local core. */
export function coreShelfExecute(
    route: CoreShelfMatch,
    service: CoreShelfPort,
    input: unknown = {},
    options: CoreShelfOptions = {}
): unknown {
    const localOnly = options.localOnly === true
    const shelfId = route.shelfId ?? ''
    if (localOnly && route.shelfId !== undefined) assertLocalShelfId(shelfId)
    if (route.action === 'list') {
        const shelves = service.list()
        if (!localOnly) return shelves
        if (shelves.length > 100) return invalid()
        return shelves.map(shelf => ({
            ...shelf,
            count: service.contents(shelf.id).filter(localOnlyRow).length
        }))
    }
    if (route.action === 'contents') {
        const result = {
            shelf: service.list().find(item => item.id === shelfId),
            items: service.contents(shelfId)
        }
        if (localOnly) {
            if (result.shelf)
                result.shelf = { ...result.shelf,
                    count: result.items.filter(localOnlyRow).length }
            result.items = result.items.filter(localOnlyRow)
        }
        return result
    }
    if (route.action === 'delete')
        return service.delete(shelfId)

    const data = validatedInput(route, input, localOnly)
    if (route.action === 'create')
        return service.create(String(data.name ?? ''))
    if (route.action === 'rename')
        return service.rename(shelfId, String(data.name ?? ''))
    if (route.action === 'add-filtered')
        return service.addFiltered(shelfId,
            (data.query ?? {}) as LibraryFacetQuery)
    const ids = localOnly
        ? data.comicIds as string[] : idList(data.comicIds)
    if (route.action === 'remove') {
        const result = service.remove(shelfId, ids)
        emit('shelf_remove', shelfId, ids, options)
        return result
    }
    if (route.action === 'items') {
        const result = service.add(shelfId, ids,
            !localOnly && Array.isArray(data.records)
                ? data.records as FavoriteRecord[] : [])
        emit('shelf_add', shelfId, ids, options)
        return result
    }
    return invalid()
}
