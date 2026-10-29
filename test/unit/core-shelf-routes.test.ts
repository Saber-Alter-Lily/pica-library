import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryQueryService } from '../../src/services/library-query-service'
import { ShelfService } from '../../src/services/shelf-service'
import { LocalLibraryIngestion } from '../../src/local-library/ingestion'
import {
    coreShelfMatch, coreShelfExecute
} from '../../src/library/core-shelf-routes'
import { collectSourceModuleGraph } from '../../scripts/audit-modules'

const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)
const remoteId = 'eh:123:abcdef1234'
const owned: Array<{ root: string; db: LibraryDatabase }> = []
async function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-shelf-routes-'))
    const library = path.join(root, 'library'), originals = path.join(root, 'originals')
    fs.mkdirSync(library); fs.mkdirSync(originals)
    fs.writeFileSync(path.join(originals, '01.png'), png)
    const db = new LibraryDatabase(path.join(library, 'library.db'))
    owned.push({ root, db })
    const importer = new LocalLibraryIngestion(db, library)
    const preview = await importer.preview(originals, 'folder')
    await importer.confirm(preview.token)
    db.importCatalog([{
        comicId: remoteId, providerId: 'eh',
        providerRemoteId: '123:abcdef1234',
        title: 'Synthetic remote catalogue', author: 'Fixture',
        tags: [], categories: [], finished: false
    }], 'eh:discover')
    return {
        root, db, localId: preview.comicId,
        shelves: new ShelfService(db, new LibraryQueryService(db))
    }
}
afterEach(() => {
    for (const { root, db } of owned.splice(0)) {
        db.close()
        fs.rmSync(root, { recursive: true, force: true })
    }
})
function act(service: ShelfService, method: string, route: string,
    body: unknown = {}, localOnly = false,
    recordUserEvents?: (events: any[]) => void,
    session?: { appSessionId?: string | null; contextId?: string | null }) {
    const match = coreShelfMatch(method, route)
    if (!match) throw new Error('Missing shelf route')
    return coreShelfExecute(match, service, body, {
        localOnly, recordUserEvents, ...session
    }) as any
}

describe('S3 shared production shelf CRUD and source-free local-only composition', () => {
    it('preserves the exact original HTTP verbs, route segments and body requirement', () => {
        for (const [method, pathname, action, body] of [
            ['GET', '/api/v1/shelves', 'list', false],
            ['POST', '/api/v1/shelves', 'create', true],
            ['GET', '/api/v1/shelves/abc-123', 'contents', false],
            ['PATCH', '/api/v1/shelves/abc-123', 'rename', true],
            ['DELETE', '/api/v1/shelves/abc-123', 'delete', false],
            ['POST', '/api/v1/shelves/abc-123/items', 'items', true],
            ['POST', '/api/v1/shelves/abc-123/remove', 'remove', true],
            ['POST', '/api/v1/shelves/abc-123/add-filtered', 'add-filtered', true]
        ] as const) {
            expect(coreShelfMatch(method, pathname)).toMatchObject({
                action, needsBody: body,
                ...(pathname.includes('/abc-123')
                    ? { shelfId: 'abc-123' } : {})
            })
        }
        expect(coreShelfMatch('POST', '/api/v1/shelves/abc-123')).toBeNull()
        expect(coreShelfMatch('GET', '/api/v1/shelves/abc-123/items')).toBeNull()
        expect(coreShelfMatch('GET', '/api/v1/source-hosts/abc')).toBeNull()
        expect(() => coreShelfMatch('GET',
            '/api/v1/shelves/%ZZ')).toThrow(URIError)
    })

    it('keeps legacy Desktop shelf metadata import, event source and duplicate event rows', async () => {
        const f = await fixture()
        const events: any[] = []
        const record = (items: any[]) => {
            events.push(...items); f.db.recordUserEvents(items)
        }
        const created = act(f.shelves, 'POST', '/api/v1/shelves', {
            name: '  Archive  '
        })
        expect(created.name).toBe('Archive')
        const url = '/api/v1/shelves/' + created.id
        const renamed = act(f.shelves, 'PATCH', url, { name: 'Favorites 2026' })
        expect(renamed.name).toBe('Favorites 2026')
        const newId = 'fixture-shelf-new'
        const added = act(f.shelves, 'POST', url + '/items', {
            comicIds: [f.localId, remoteId, f.localId, newId],
            records: [{
                comicId: newId, providerId: 'pica', title: 'Selected search result',
                author: 'Fixture', tags: [], categories: [], finished: false
            }]
        }, false, record, { appSessionId: 'session-demo', contextId: 'context-demo' })
        expect(added).toMatchObject({ added: 3, total: 3 })
        expect(f.db.getComic(newId)?.title).toBe('Selected search result')
        expect(events).toHaveLength(4)
        expect(events.map(item => item.eventType)).toEqual([
            'shelf_add', 'shelf_add', 'shelf_add', 'shelf_add'
        ])
        expect(events.every(item =>
            item.source === 'shelf' &&
            item.appSessionId === 'session-demo' &&
            item.contextId === 'context-demo' &&
            item.metadata.shelfId === created.id)).toBe(true)
        expect(f.db.listUserEvents({ eventType: 'shelf_add' })).toHaveLength(4)
        expect((act(f.shelves, 'GET', url) as any).items).toHaveLength(3)
        const removed = act(f.shelves, 'POST', url + '/remove', {
            comicIds: [f.localId]
        }, false, record)
        expect(removed).toMatchObject({ removed: 1, total: 2 })
        expect(events.at(-1)).toMatchObject({
            eventType: 'shelf_remove', comicId: f.localId,
            appSessionId: null, contextId: null
        })
        expect((act(f.shelves, 'GET', '/api/v1/shelves') as any[])[0].count).toBe(2)
        expect(act(f.shelves, 'DELETE', url)).toMatchObject({
            deleted: true, id: created.id
        })
        // Shelf membership changes do not erase the original comics.
        expect(f.db.getComic(remoteId)?.title).toBe('Synthetic remote catalogue')
    })

    it('allows only local IDs and local facet additions; never leaks remote shelf rows/counts', async () => {
        const f = await fixture()
        const old = f.shelves.create('Mixed old library shelf')
        f.shelves.add(old.id, [f.localId, remoteId])
        const oldUrl = '/api/v1/shelves/' + old.id
        const onlyLocal = act(f.shelves, 'GET', oldUrl, {}, true)
        expect(onlyLocal.items).toMatchObject([{
            comicId: f.localId, providerId: 'local'
        }])
        expect(onlyLocal.shelf.count).toBe(1)
        const listed = act(f.shelves, 'GET', '/api/v1/shelves', {}, true)
        expect(listed).toMatchObject([{ id: old.id, count: 1 }])
        const local = act(f.shelves, 'POST', '/api/v1/shelves', {
            name: ' Local QA '
        }, true)
        const url = '/api/v1/shelves/' + local.id
        const events: any[] = []
        const record = (items: any[]) => events.push(...items)
        expect(() => act(f.shelves, 'POST', url + '/items', {
            comicIds: [remoteId]
        }, true, record)).toThrow('Invalid local-only shelf request')
        expect(() => act(f.shelves, 'POST', url + '/items', {
            comicIds: [f.localId], records: []
        }, true, record)).toThrow('Invalid local-only shelf request')
        expect(() => act(f.shelves, 'POST', url + '/add-filtered', {
            query: { providerIds: ['eh'], scope: 'catalog' }
        }, true, record)).toThrow('Invalid local catalogue query')
        expect(f.shelves.contents(local.id)).toHaveLength(0)
        expect(events).toHaveLength(0)
        expect(act(f.shelves, 'POST', url + '/add-filtered', {
            query: { scope: 'catalog', text: 'originals' }
        }, true)).toMatchObject({ matched: 1 })
        expect(f.shelves.contents(local.id)).toMatchObject([
            { comicId: f.localId }
        ])
        expect(act(f.shelves, 'POST', url + '/remove', {
            comicIds: [f.localId]
        }, true, record)).toMatchObject({ removed: 1, total: 0 })
        expect(events).toMatchObject([{
            eventType: 'shelf_remove', comicId: f.localId,
            source: 'shelf', metadata: { shelfId: local.id }
        }])
        expect(f.db.getComic(remoteId)).toBeDefined()
        expect(f.db.getComic(f.localId)).toBeDefined()
        expect(f.db.getComic(f.localId)?.isFavorite).toBe(false)
    })

    it.each([
        { name: '' }, { name: '\nscript' }, { name: 'x'.repeat(81) },
        { name: 'Valid', records: [] }, { name: 123 },
        { comicIds: [remoteId] }, { comicIds: 'local:bad' },
        { comicIds: [] }, { comicIds: [123] },
        { comicIds: Array.from({ length: 101 }, () => 'local:' + 'a'.repeat(64)) }
    ])('rejects unsafe local-only name or membership inputs before mutation: %j',
        async input => {
            const f = await fixture()
            const id = f.shelves.create('Local').id
            const created = coreShelfMatch('POST', '/api/v1/shelves')!
            const add = coreShelfMatch('POST', '/api/v1/shelves/' + id + '/items')!
            if ('name' in input)
                expect(() => coreShelfExecute(created, f.shelves,
                    input, { localOnly: true })).toThrow()
            else
                expect(() => coreShelfExecute(add, f.shelves,
                    input, { localOnly: true })).toThrow()
            expect(f.db.listShelves()).toHaveLength(1)
            expect(f.shelves.contents(id)).toHaveLength(0)
        })

    it('does not import a provider SDK into the shared shelf controller or its type-only service', () => {
        const graph = collectSourceModuleGraph()
        const file = 'src/library/core-shelf-routes.ts'
        expect(graph.nodes).toContain(file)
        for (const caller of ['src/library/server.ts', 'src/offline-core/qa-http.ts'])
            expect(graph.edges).toContainEqual({
                from: caller, to: file, typeOnly: false
            })
        const runtime = graph.edges.filter(edge =>
            edge.from === file && !edge.typeOnly)
        expect(runtime).toEqual([{
            from: file, to: 'src/library/core-catalog-read.ts',
            typeOnly: false
        }])
    })
})
