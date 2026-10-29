import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryQueryService } from '../../src/services/library-query-service'
import { LocalLibraryIngestion } from '../../src/local-library/ingestion'
import {
    coreCatalogueGet,
    coreCatalogueQuery,
    offlineLocalFacetQuery
} from '../../src/library/core-catalog-read'
import { collectSourceModuleGraph } from '../../scripts/audit-modules'

const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)
const remoteId = 'eh:123:abcdef1234'
async function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-catalog-read-'))
    const data = path.join(root, 'library')
    const original = path.join(root, 'original')
    fs.mkdirSync(data)
    fs.mkdirSync(original)
    fs.writeFileSync(path.join(original, '01.png'), png)
    const database = new LibraryDatabase(path.join(data, 'library.db'))
    const importer = new LocalLibraryIngestion(database, data)
    const preview = await importer.preview(original, 'folder')
    await importer.confirm(preview.token)
    database.importCatalog([{
        comicId: remoteId, providerId: 'eh',
        providerRemoteId: '123:abcdef1234',
        title: 'Remote fixture - never sent to offline core',
        author: 'No remote account',
        tags: [], categories: [], finished: false
    }], 'eh:discover')
    return {
        root, database, localId: preview.comicId,
        queries: new LibraryQueryService(database),
        close: () => {
            database.close()
            fs.rmSync(root, { recursive: true, force: true })
        }
    }
}

describe('S3 real catalogue read/query shared by old Desktop and source-free core', () => {
    it('preserves the full Desktop API while keeping source records invisible in local-only composition', async () => {
        const f = await fixture()
        try {
            const get = (route: string, localOnly = false) =>
                coreCatalogueGet(new URL(route, 'http://127.0.0.1:4789'),
                    f.database, { localOnly })
            const remoteDetail = '/api/v1/comics/' + encodeURIComponent(remoteId)
            const localDetail = '/api/v1/comics/' + encodeURIComponent(f.localId)
            const fullList = get('/api/v1/comics?limit=100')!
            expect(fullList.status).toBe(200)
            expect(fullList.value).toEqual(f.database.listComics({
                text: undefined, author: undefined, tags: [],
                categories: [], finished: undefined,
                sort: 'latest', limit: 100, offset: 0
            }))
            expect((fullList.value as any[]).some(item =>
                item.comicId === remoteId)).toBe(true)
            expect(get(remoteDetail)).toMatchObject({
                status: 200, value: { comicId: remoteId }
            })
            expect(get(remoteDetail, true)).toEqual({
                status: 404, value: { error: 'Comic not found' }
            })
            expect(get(localDetail, true)).toMatchObject({
                status: 200, value: { comicId: f.localId, providerId: 'local' }
            })
            expect(get('/api/v1/comics?limit=100', true)?.value)
                .toMatchObject([{ comicId: f.localId, providerId: 'local' }])
            expect(get('/api/v1/comics?limit=100&offset=1', true)?.value)
                .toEqual([])
            const downloaded = get('/api/v1/downloaded', true)
            expect(downloaded?.status).toBe(200)
            expect((downloaded?.value as any[]).every(item =>
                item.comicId.startsWith('local:'))).toBe(true)
            expect(get('/api/v1/comics/' + encodeURIComponent('eh:other'), true)
                ?.status).toBe(404)
            expect(get('/api/v1/comics/' + encodeURIComponent('local:unknown'),
                true)?.status).toBe(404)
            expect(get('/api/v1/desktop/status', true)).toBeNull()
        } finally { f.close() }
    })

    it('reuses the original facet service with explicit local-only filtering, not a second ranking implementation', async () => {
        const f = await fixture()
        try {
            const normal = coreCatalogueQuery({
                scope: 'catalog', sort: 'title', limit: 100
            }, f.queries)
            expect(normal).toEqual(f.queries.query({
                scope: 'catalog', sort: 'title', limit: 100
            }))
            expect(normal.total).toBe(2)
            const offline = coreCatalogueQuery({
                scope: 'catalog', sort: 'title', limit: 100
            }, f.queries, { localOnly: true })
            expect(offline.total).toBe(1)
            expect(offline.items[0]).toMatchObject({
                comicId: f.localId, providerId: 'local'
            })
            expect(offline.query.providerIds).toEqual(['local'])
            expect(coreCatalogueQuery({
                scope: 'catalog', text: 'Remote',
                limit: 100
            }, f.queries, { localOnly: true }).total).toBe(0)
            expect(coreCatalogueQuery({
                scope: 'catalog', sort: 'latest',
                providerIds: ['local'], limit: 100
            }, f.queries, { localOnly: true }).total).toBe(1)
        } finally { f.close() }
    })

    it.each([
        null, [], { providerIds: ['eh'] }, { providerIds: [] },
        { providerIds: ['local', 'eh'] }, { __proto__: null, unexpected: 'remote' },
        { text: '\n' }, { limit: 101 }, { limit: -1 },
        { offset: -1 }, { offset: 5001 }, { tags: ['valid', 1] },
        { scope: 'invalid' }, { sort: 'source' }, { download: 'drop' }
    ])('rejects unsafe or source-broadening offline query %j', input => {
        expect(() => offlineLocalFacetQuery(input)).toThrow('Invalid local catalogue query')
    })

    it('has no runtime import of provider SDK, old Desktop or LibraryService', () => {
        const graph = collectSourceModuleGraph()
        const core = 'src/library/core-catalog-read.ts'
        expect(graph.nodes).toContain(core)
        expect(graph.edges).toContainEqual({
            from: 'src/library/server.ts', to: core, typeOnly: false
        })
        expect(graph.edges).toContainEqual({
            from: 'src/offline-core/qa-http.ts', to: core, typeOnly: false
        })
        expect(graph.edges.filter(edge =>
            edge.from === core && !edge.typeOnly)).toEqual([])
    })
})
