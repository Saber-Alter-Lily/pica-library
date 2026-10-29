import type { ShelfService } from '../services/shelf-service'
import type { FavoriteRecord, LibraryFacetQuery } from './types'
import { offlineLocalFacetQuery } from './core-catalog-read'

/**
 * Original Desktop /api/v1/shelves contract lifted without the legacy
 * LibraryService/ProviderService constructor chain.
 *
 * The local-only composition is separate, explicit authority: it never
 * imports remote catalogue records or permits foreign work IDs.
 */
export type CoreShelfPort = Pick<ShelfService,
    'list' | 'create' | 'rename' | 'delete' | 'contents' |
    'add' | 'addFiltered' | 'remove'
>
export interface ShelfChange {
    eventType: 'shelf_add' | 'shelf_remove'
    shelfId: string
    comicIds: string[]
}
export interface CoreShelfResult {
    value: unknown
    change?: ShelfChange
}
const LOCAL_ID = /^local:[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
function list(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String).filter(Boolean)
    return String(value ?? '').split(',').map(item => item.trim()).filter(Boolean)
}
function matches(path: string) {
    const root = path === '/api/v1/shelves'
    const shelf = /^\/api\/v1\/shelves\/([^/]+)$/.exec(path)
    const items = /^\/api\/v1\/shelves\/([^/]+)\/(items|remove|add-filtered)$/.exec(path)
    return { root, shelf, items }
}
/** Must be used BEFORE reading any HTTP request body. */
export function isCoreShelfRoute(path: string, method: string) {
    const match = matches(path)
    return match.root && ['GET', 'POST'].includes(method) ||
        Boolean(match.shelf && ['GET', 'PATCH', 'DELETE'].includes(method)) ||
        Boolean(match.items && method === 'POST')
}
function localIds(value: unknown) {
    if (!Array.isArray(value) || value.length > 250 ||
        !value.every(id => typeof id === 'string' && LOCAL_ID.test(id)))
        throw new Error('Invalid local-only shelf selection')
    return value as string[]
}
function offlineBody(input: Record<string, unknown>,
    route: 'name' | 'items' | 'remove' | 'add-filtered') {
    const allowed = route === 'name' ? ['name'] :
        route === 'add-filtered' ? ['query'] : ['comicIds']
    if (Object.keys(input).some(key => !allowed.includes(key)))
        throw new Error('Invalid local-only shelf request')
    if (route === 'name') {
        const name = input.name
        if (typeof name !== 'string' || !name.trim() ||
            name.length > 120 || /[\u0000-\u001f\u007f]/.test(name))
            throw new Error('Invalid local shelf name')
    } else if (route === 'add-filtered')
        offlineLocalFacetQuery(input.query ?? {})
    else localIds(input.comicIds)
}
export function coreShelfRoute(
    pathname: string,
    method: string,
    input: Record<string, unknown>,
    shelves: CoreShelfPort,
    options: { localOnly?: boolean } = {}
): CoreShelfResult | null {
    const { root, shelf, items } = matches(pathname)
    if (!isCoreShelfRoute(pathname, method)) return null
    if (root) {
        if (method === 'GET') return { value: shelves.list() }
        if (options.localOnly) offlineBody(input, 'name')
        return { value: shelves.create(String(input.name ?? '')) }
    }
    if (shelf) {
        const id = decodeURIComponent(shelf[1])
        if (options.localOnly && !UUID.test(id))
            throw new Error('Invalid local shelf ID')
        if (method === 'GET')
            return {
                value: {
                    shelf: shelves.list().find(row => row.id === id),
                    items: options.localOnly
                        ? shelves.contents(id).filter(row =>
                            LOCAL_ID.test(row.comicId))
                        : shelves.contents(id)
                }
            }
        if (method === 'DELETE') return { value: shelves.delete(id) }
        if (options.localOnly) offlineBody(input, 'name')
        return { value: shelves.rename(id, String(input.name ?? '')) }
    }
    if (items) {
        const id = decodeURIComponent(items[1])
        if (options.localOnly && !UUID.test(id))
            throw new Error('Invalid local shelf ID')
        if (items[2] === 'add-filtered') {
            if (options.localOnly) offlineBody(input, 'add-filtered')
            return {
                value: shelves.addFiltered(
                    id, options.localOnly
                        ? offlineLocalFacetQuery(input.query ?? {})
                        : (input.query ?? {}) as LibraryFacetQuery
                )
            }
        }
        if (options.localOnly)
            offlineBody(input, items[2] === 'remove' ? 'remove' : 'items')
        const comicIds = options.localOnly
            ? localIds(input.comicIds) : list(input.comicIds)
        if (items[2] === 'remove')
            return {
                value: shelves.remove(id, comicIds),
                change: { eventType: 'shelf_remove', shelfId: id, comicIds }
            }
        return {
            value: shelves.add(id, comicIds,
                options.localOnly ? [] : Array.isArray(input.records)
                    ? input.records as FavoriteRecord[] : []),
            change: { eventType: 'shelf_add', shelfId: id, comicIds }
        }
    }
    return null
}
