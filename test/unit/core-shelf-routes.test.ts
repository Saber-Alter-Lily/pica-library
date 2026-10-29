import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LocalLibraryIngestion } from '../../src/local-library/ingestion'
import { LibraryQueryService } from '../../src/services/library-query-service'
import { ShelfService } from '../../src/services/shelf-service'
import { coreShelfRoute, isCoreShelfRoute } from '../../src/library/core-shelf-routes'
import { collectSourceModuleGraph } from '../../scripts/audit-modules'

const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)
const remote = 'eh:123:abcdef1234'
async function fixture() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-core-shelves-'))
    const data = path.join(home, 'library')
    const original = path.join(home, 'original')
    fs.mkdirSync(data); fs.mkdirSync(original)
    fs.writeFileSync(path.join(original, '01.png'), png)
    const db = new LibraryDatabase(path.join(data, 'library.db'))
    const importer = new LocalLibraryIngestion(db, data)
    const preview = await importer.preview(original, 'folder')
    await importer.confirm(preview.token)
    db.importCatalog([{
        comicId: remote, providerId: 'eh',
        providerRemoteId: '123:abcdef1234',
        title: 'Synthetic remote catalogue',
        author: 'not a local user', categories: [], tags: [], finished: false
    }], 'eh:discover')
    const queries = new LibraryQueryService(db)
    const shelves = new ShelfService(db, queries)
    const close = () => {
        db.close()
        fs.rmSync(home, { recursive: true, force: true })
    }
    return { db, shelves, localId: preview.comicId, close }
}
function route(path: string, method: string, input: Record<string, unknown>,
    shelves: ShelfService, localOnly = false) {
    return coreShelfRoute(path, method, input, shelves, { localOnly })
}
describe('actual Desktop shelf CRUD now a reusable source-neutral core route', () => {
    it('retains old create, update, selection, event payload and deletion semantics', async () => {
        const f = await fixture()
        try {
            const created = route('/api/v1/shelves', 'POST', {
                name: 'To Read'
            }, f.shelves)!
            const id = (created.value as { id: string }).id
            expect(id).toMatch(/^[0-9a-f-]{36}$/)
            expect(route('/api/v1/shelves', 'GET', {}, f.shelves)?.value)
                .toMatchObject([{ id, name: 'To Read' }])
            expect(route('/api/v1/shelves/' + id, 'GET', {}, f.shelves)
                ?.value).toMatchObject({
                shelf: { id, name: 'To Read' }, items: []
            })
            const added = route('/api/v1/shelves/' + id + '/items',
                'POST', { comicIds: [f.localId] }, f.shelves)!
            expect(added.change).toEqual({
                eventType: 'shelf_add', shelfId: id, comicIds: [f.localId]
            })
            expect(f.shelves.contents(id).map(c => c.comicId))
                .toEqual([f.localId])
            expect(route('/api/v1/shelves/' + id, 'PATCH',
                { name: 'Finished reading' }, f.shelves)?.value)
                .toMatchObject({ id, name: 'Finished reading' })
            const removed = route('/api/v1/shelves/' + id + '/remove',
                'POST', { comicIds: [f.localId] }, f.shelves)!
            expect(removed.change).toEqual({
                eventType: 'shelf_remove', shelfId: id, comicIds: [f.localId]
            })
            expect(f.shelves.contents(id)).toEqual([])
            expect(route('/api/v1/shelves/' + id, 'DELETE', {}, f.shelves)
                ?.value).toBeDefined()
            expect(f.db.getComic(f.localId)).toBeDefined()
        } finally { f.close() }
    })

    it('enforces a local-only shelf boundary even in a catalogue with stored E-H rows', async () => {
        const f = await fixture()
        try {
            const id = (route('/api/v1/shelves', 'POST', {
                name: 'Offline'
            }, f.shelves, true)!.value as { id: string }).id
            const path = '/api/v1/shelves/' + id
            expect(() => route(path + '/items', 'POST',
                { comicIds: [remote] }, f.shelves, true))
                .toThrow('Invalid local-only shelf selection')
            expect(() => route(path + '/items', 'POST',
                { comicIds: [f.localId], records: [] }, f.shelves, true))
                .toThrow('Invalid local-only shelf request')
            expect(() => route(path + '/add-filtered', 'POST', {
                query: { scope: 'catalog', providerIds: ['eh'] }
            }, f.shelves, true)).toThrow('Invalid local catalogue query')
            const added = route(path + '/add-filtered', 'POST', {
                query: { scope: 'catalog' }
            }, f.shelves, true)
            expect(added?.change).toBeUndefined()
            expect(f.shelves.contents(id).map(c => c.comicId))
                .toEqual([f.localId])

            // A legacy contaminated shelf cannot leak foreign work identities,
            // titles or even counts into the source-free core read surface.
            f.db.addShelfItems(id, [remote])
            const offlineShelf = route(path, 'GET', {}, f.shelves, true)
                ?.value as { items: Array<{ comicId: string }> }
            expect(offlineShelf.items.map(c => c.comicId))
                .toEqual([f.localId])
            const listing = route('/api/v1/shelves', 'GET',
                {}, f.shelves, true)!.value as Array<{ count: number }>
            expect(listing[0].count).toBe(1)
            expect(() => route(path + '/remove', 'POST',
                { comicIds: [remote] }, f.shelves, true))
                .toThrow('Invalid local-only shelf selection')
            expect(() => route('/api/v1/shelves/unknown', 'GET',
                {}, f.shelves, true)).toThrow('Invalid local shelf ID')
        } finally { f.close() }
    })
    it('never accepts unknown operations as write permissions', () => {
        for (const [url, method] of [
            ['/api/v1/shelves', 'DELETE'],
            ['/api/v1/shelves/fake/items', 'GET'],
            ['/api/v1/shelves/fake/add-filtered', 'DELETE'],
            ['/api/v1/recommendations', 'POST'],
            ['/api/v1/shelves/fake/extra', 'POST']
        ])
            expect(isCoreShelfRoute(url, method)).toBe(false)
    })
    it('keeps actual core shelf runtime independent from source SDK and is used by old Desktop and offline core', () => {
        const graph = collectSourceModuleGraph()
        const port = 'src/library/core-shelf-routes.ts'
        expect(graph.edges).toContainEqual({
            from: 'src/library/server.ts', to: port, typeOnly: false
        })
        expect(graph.edges).toContainEqual({
            from: 'src/offline-core/qa-http.ts', to: port, typeOnly: false
        })
        expect(graph.edges.filter(e => e.from === port && !e.typeOnly))
            .toEqual([{ from: port,
                to: 'src/library/core-catalog-read.ts', typeOnly: false }])
    })
})
