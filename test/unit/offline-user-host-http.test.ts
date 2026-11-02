import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LocalLibraryIngestion } from '../../src/local-library/ingestion'
import { createCoreLocalRuntime } from '../../src/library/core-runtime-composition'
import { startOfflineCoreHttp } from '../../src/offline-core/qa-http'
import { stageOfflineFullWebQa } from '../../scripts/stage-offline-full-web-qa'
import { buildOfflineCoreCandidate } from '../../scripts/build-offline-core-candidate'
import { SourceHostInspector } from '../../src/source-hosts/inspector'
import { SourceHostConnections } from '../../src/source-hosts/connections'
import { sourceHostHttp } from '../../src/source-hosts/http-transport'
import { HostedLibraryReader } from '../../src/source-hosts/library-reader'
import { PreviewCacheManager } from '../../src/services/preview-cache-manager'

const HOST_ID = '64d223e0-5d29-4320-babb-5a2da654d345'
const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(16)
])
const tiny = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)
const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
    for (const close of cleanups.splice(0).reverse()) await close()
})
const manga = {
    id: 1, sourceId: '9007199254740993', url: '/owned/comic',
    title: 'Synthetic original Host book', inLibrary: true
}
const chapter = {
    id: 2, mangaId: 1, url: '/owned/chapter', name: 'Chapter 1',
    sourceOrder: 0, pageCount: 2, chapterNumber: 1
}

describe('optional user-owned Host in original source-free full Web (Draft only)', () => {
    it('keeps standard core physically Host-free and approves only a separate Host candidate', async () => {
        const ordinary = await buildOfflineCoreCandidate('desktop-core-preview')
        expect(ordinary.sourceInputs.some(name => name.startsWith('src/source-hosts/')))
            .toBe(false)
        expect(ordinary.sourceInputs.some(name => name.startsWith('src/providers/')))
            .toBe(false)
        expect(ordinary.sourceInputs).not.toContain(
            'src/desktop/core-user-host-preview-main.ts'
        )
        const optional = await buildOfflineCoreCandidate('desktop-core-host-preview')
        expect(optional.sourceInputs).toContain(
            'src/desktop/core-user-host-preview-main.ts'
        )
        expect(optional.sourceInputs).toContain('src/source-hosts/library-reader.ts')
        expect(optional.sourceInputs).toContain('src/source-hosts/connections.ts')
        expect(optional.sourceInputs.some(name => name.startsWith('src/providers/') ||
            name.startsWith('src/source-extensions/') ||
            name.startsWith('src/sdk'))).toBe(false)
        expect(optional.packageInputs.every(name =>
            name === 'package.json' ||
            /node_modules\/(?:adm-zip|p-limit|yocto-queue)\//.test(name)
        )).toBe(true)

        const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-user-host-assets-'))
        cleanups.push(() => fs.rmSync(parent, { recursive: true, force: true }))
        const plain = stageOfflineFullWebQa(path.join(parent, 'plain'))
        const hosted = stageOfflineFullWebQa(path.join(parent, 'host'), {
            userHost: true
        })
        expect(plain.userHostIncluded).toBeUndefined()
        expect(hosted.userHostIncluded).toBe(true)
        expect(plain.files.some(file =>
            ['source-hosts.js', 'saved-source-hosts.js'].includes(file.name)
        )).toBe(false)
        expect(hosted.files.map(item => item.name)).toEqual(
            expect.arrayContaining([
                'host-library.js', 'source-hosts.js', 'saved-source-hosts.js'
            ])
        )
        const original = fs.readFileSync(path.join(parent, 'plain', 'index.html'), 'utf8')
        const optIn = fs.readFileSync(path.join(parent, 'host', 'index.html'), 'utf8')
        expect(original).not.toContain('src="./source-hosts.js"')
        expect(optIn).toContain('src="./source-hosts.js"')
        expect(optIn).not.toContain('src="./eh-account.js"')
        expect(optIn).not.toContain('src="./jm-account.js"')
    }, 60_000)

    it('uses real local HTTP, old Host adapter and shared Reader with explicit consent and revocation', async () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-user-host-http-'))
        cleanups.push(() => fs.rmSync(home, { recursive: true, force: true }))
        const local = path.join(home, 'owned')
        const folder = path.join(home, 'input-pages')
        const web = path.join(home, 'web')
        fs.mkdirSync(local)
        fs.mkdirSync(folder)
        fs.writeFileSync(path.join(folder, '01.png'), tiny)
        const db = new LibraryDatabase(path.join(local, 'library.db'))
        cleanups.push(() => db.close())
        const runtime = createCoreLocalRuntime({ database: db, dataDir: local })
        const staged = await new LocalLibraryIngestion(db, local)
            .preview(folder, 'folder')
        const imported = await new LocalLibraryIngestion(db, local)
            .confirm(staged.token)
        const manifest = stageOfflineFullWebQa(web, { userHost: true })
        expect(manifest.sourceSdkIncluded).toBe(false)

        const connections = new SourceHostConnections(
            { load: () => null, save: () => {} },
            { inspect: async () => { throw Error('No inspection was authorized') } },
            () => HOST_ID
        )
        const inspector = new SourceHostInspector(sourceHostHttp)
        const requests: string[] = []
        const simulated = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
            const source = String(url)
            if (!source.startsWith('https://owned-host.example/base/'))
                throw new Error('Unexpected Host URL in offline synthetic fixture')
            const operation = init?.body
                ? JSON.parse(String(init.body)).operationName : 'IMAGE'
            requests.push(operation)
            const data = operation === 'PicaSourceHostInfo'
                ? { aboutServer: { name: 'Suwayomi-Server', version: '2.4.2366' } }
                : operation === 'PicaHostLibrary'
                ? { mangas: { nodes: [manga], pageInfo: { hasNextPage: false } } }
                : operation === 'PicaHostManga'
                ? { manga: { ...manga, chapters: { nodes: [chapter] } } }
                : operation === 'PicaHostChapter' ? { chapter }
                : operation === 'PicaHostChapterPages'
                ? { fetchChapterPages: {
                    chapter, pages: [0, 1].map(n =>
                        '/api/v1/manga/1/chapter/0/page/' + n)
                } } : null
            return data
                ? new Response(JSON.stringify({ data }), {
                    headers: { 'content-type': 'application/json' }
                }) : new Response(png, {
                    headers: { 'content-type': 'image/png' }
                })
        })
        const reader = new HostedLibraryReader(
            connections, db,
            () => new PreviewCacheManager(
                path.join(home, 'owned-cache'),
                { maxBytes: 1024 * 1024, ttlMs: 60_000 }
            ),
            simulated as typeof fetch
        )
        cleanups.push(() => reader.close())
        const server = await startOfflineCoreHttp({
            database: db, reader: runtime.readerService, coreRuntime: runtime,
            webRoot: web, userHost: { inspector, connections, reader }
        })
        cleanups.push(() => server.close())
        const origin = new URL(server.url).origin
        expect((await fetch(origin + '/api/v1/desktop/status')).status).toBe(403)
        const bootstrap = await fetch(server.url, { redirect: 'manual' })
        expect(bootstrap.status).toBe(303)
        const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0]
        const get = (route: string, extra: Record<string, string> = {}) =>
            fetch(origin + route, {
                headers: { cookie, ...extra }, cache: 'no-store'
            })
        const html = await (await get('/')).text()
        const token = /name="pica-core-qa-csrf" content="([a-f0-9]{64})"/
            .exec(html)?.[1]
        expect(token).toMatch(/^[a-f0-9]{64}$/)
        expect(html).toContain('src="./source-hosts.js"')
        const status = await (await get('/api/v1/desktop/status')).json()
        expect(status.hostedLibraryReader.available).toBe(true)
        expect(status.hostedSourceBrowser.available).toBe(true)
        expect(status.sourceHostConnections.available).toBe(true)
        expect(status.externalSources).toMatchObject({ enabled: [] })
        expect(requests).toEqual([])
        const command = (route: string, value: object,
                         headers: Record<string, string> = {}) =>
            fetch(origin + route, {
                method: 'POST', cache: 'no-store',
                headers: {
                    cookie, origin, 'x-pica-csrf': token!,
                    'content-type': 'application/json', ...headers
                },
                body: JSON.stringify(value)
            })
        const hosts = '/api/v1/desktop/source-hosts/connections'
        const route = '/api/v1/desktop/host-reader'
        expect((await command(hosts, { action: 'list' }, {
            origin: 'https://bad.example'
        })).status).toBe(403)
        expect((await command(route, {
            action: 'start', id: HOST_ID, scope: 'library-read'
        }, { 'x-pica-csrf': 'bad-token' })).status).toBe(403)
        const save = await command(hosts, {
            action: 'save', kind: 'suwayomi', label: 'My synthetic Host',
            endpoint: 'https://owned-host.example/base/',
            authMode: 'none', allowInsecureLan: false,
            scope: 'inspect-only', consent: true
        })
        expect(save.status).toBe(200)
        const records = await save.json()
        expect(records.hosts[0]).toMatchObject({
            id: HOST_ID, enabled: false, revision: 0
        })
        expect(requests).toEqual([])
        const enabled = await command(hosts, {
            action: 'set-enabled', id: HOST_ID, enabled: true,
            expectedRevision: 0, consent: true
        })
        expect(enabled.status).toBe(200)
        const start = await command(route, {
            action: 'start', id: HOST_ID, expectedRevision: 1,
            auth: { mode: 'none' }, consent: true, scope: 'library-read',
            acceptHostFetchSideEffects: true
        })
        expect(start.status).toBe(200)
        const session = await start.json()
        expect(session).toMatchObject({
            scope: 'library-read',
            capabilities: { libraryRead: true, providerSearch: false }
        })
        const listed = await command(route, {
            action: 'list', sessionId: session.sessionId, offset: 0
        })
        expect(listed.status).toBe(200)
        const books = (await listed.json()).books
        expect(books).toHaveLength(1)
        const comicId = books[0].comicId
        expect(comicId).toMatch(/^hosted:/)
        const selected = await command(route, {
            action: 'select', sessionId: session.sessionId, comicId
        })
        expect(selected.status).toBe(200)
        const root = route + '/' + session.sessionId + '/comics/' +
            encodeURIComponent(comicId) + '/chapters'
        const metadata = {
            referer: origin + '/', 'sec-fetch-site': 'same-origin',
            'x-pica-csrf': token!
        }
        const chapters = await get(root, metadata)
        expect(chapters.status).toBe(200)
        const episodeId = (await chapters.json())[0].id
        const actual = await get(root + '/' + encodeURIComponent(episodeId), metadata)
        expect(actual.status).toBe(200)
        const page = (await actual.json()).pages[0].url
        expect(page).toMatch(/^\/api\/v1\/desktop\/host-reader\//)
        expect((await get(page)).status).toBe(403)
        const image = await get(page, {
            referer: origin + '/',
            'sec-fetch-site': 'same-origin',
            'sec-fetch-dest': 'image'
        })
        expect(image.status).toBe(200)
        expect(Buffer.from(await image.arrayBuffer())).toEqual(png)
        const progress = await command(route + '/' + session.sessionId +
            '/progress', { comicId, episodeId, pageIndex: 1 })
        expect(progress.status).toBe(200)
        const latest = await get(route + '/' + session.sessionId + '/progress', metadata)
        expect(latest.status).toBe(200)
        expect((await latest.json())[0].pageIndex).toBe(1)

        const revoked = await command(hosts, {
            action: 'set-enabled', id: HOST_ID, enabled: false,
            expectedRevision: 1, consent: true
        })
        expect(revoked.status).toBe(200)
        const stale = await get(root, metadata)
        expect(stale.status).toBe(409)
        expect(db.getComic(imported.comicId)?.providerId).toBe('local')
        expect(fs.readFileSync(path.join(folder, '01.png'))).toEqual(tiny)
        expect((await get('/api/v1/comics?limit=5000')).status).toBe(200)
        expect(requests).toContain('PicaSourceHostInfo')
        expect(requests).toContain('PicaHostLibrary')
        expect(requests).toContain('IMAGE')
        expect(requests).not.toContain('INSTALL_EXTENSION')
    }, 75_000)
})
