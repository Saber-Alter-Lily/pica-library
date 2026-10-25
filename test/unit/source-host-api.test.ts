// CI-only runtime coverage. LOCAL_VALIDATION_SAFETY forbids running this listener suite on the user's PC.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer, type DesktopServerController } from '../../src/library/server'
import { SourceHostInspector } from '../../src/source-hosts/inspector'
import { sourceHostHttp } from '../../src/source-hosts/http-transport'
import { SourceHostConnections } from '../../src/source-hosts/connections'
import { sourceHostStore } from '../../src/desktop/source-host-store'
import { HostedLibraryReader } from '../../src/source-hosts/library-reader'
import { PreviewCacheManager } from '../../src/services/preview-cache-manager'
import { shadowDatabaseState } from '../fixtures/recommendation-shadow-fixture'
import { enabledFixtureSources } from "../helpers/source-runtime-fixture"

const cleanup: (() => Promise<void>)[] = []
const route = '/api/v1/desktop/source-hosts/inspect'
const input = { kind: 'suwayomi', endpoint: 'http://127.0.0.1:4567/', consent: true }
const info = { data: { aboutServer: { name: 'Suwayomi-Server', version: '2.4.2366' } } }
const sources = { data: { sources: { nodes: [{ id: '9223372036854775807', name: 'Synthetic', lang: 'zh', supportsLatest: true }], pageInfo: { hasNextPage: false, hasPreviousPage: false }, totalCount: 1 } } }
const hostBook = { id: 1, sourceId: '9223372036854775807', url: '/own-book', title: 'Synthetic own book' }
const hostChapter = { id: 2, mangaId: 1, url: '/own-book/chapter', name: 'One', sourceOrder: 0, chapterNumber: 1, pageCount: 1 }
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.restoreAllMocks() })

async function fixture(options: { configured?: boolean; desktop?: boolean } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-host-api-')), db = new LibraryDatabase(path.join(root, 'library.db'))
    const service = new LibraryService(db, root, undefined, undefined, undefined, enabledFixtureSources())
    service.sources.apply({ schemaVersion: 1, revision: 1, enabled: [] })
    db.setAppState('synthetic.source-host.private-canary', { password: 'not-for-host-export', tags: ['private'], preserved: true })
    let behavior = 'normal', signal: AbortSignal | undefined, resolveEntered!: () => void, resolveLate!: () => void
    const entered = new Promise<void>(r => { resolveEntered = r }), late = new Promise<void>(r => { resolveLate = r })
    const wire = vi.fn(async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        resolveEntered()
        if (behavior === 'throw') throw new Error('https://name:remote-secret@host.invalid/ Authorization: private')
        if (behavior === 'stall') await late
        if (!init?.body) return new Response(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(16)]), { headers: { 'content-type': 'image/png' } })
        const operation = JSON.parse(String(init.body)).operationName
        const value = operation === 'PicaSourceHostInfo' ? info : operation === 'PicaHostLibrary' ? { data: { mangas: { nodes: [hostBook], pageInfo: { hasNextPage: false } } } } : operation === 'PicaHostManga' ? { data: { manga: { ...hostBook, chapters: { nodes: [hostChapter] } } } } : operation === 'PicaHostChapter' ? { data: { chapter: hostChapter } } : operation === 'PicaHostChapterPages' ? { data: { fetchChapterPages: { chapter: hostChapter, pages: ['/api/v1/manga/1/chapter/0/page/0'] } } } : sources
        return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
    })
    const inspector = new SourceHostInspector(connection => sourceHostHttp(connection, wire))
    const connections = new SourceHostConnections(sourceHostStore(path.join(root, 'source-hosts.json')), inspector, () => '64d223e0-5d29-4320-babb-5a2da654d345')
    const hostedReader = new HostedLibraryReader(connections, db, () => new PreviewCacheManager(path.join(root, 'host-reader-cache')), wire)
    cleanup.push(async () => { hostedReader.close() })
    const inspect = vi.fn((value: Record<string, unknown>, abort: AbortSignal) => { signal = abort; return inspector.inspect(value, abort) })
    const desktop: DesktopServerController = { csrfToken: 'synthetic-host-csrf', hostedReader, configured: () => options.configured !== false, status: () => ({ sourceHostInspection: { available: true } }), inspectSourceHost: inspect, sourceHostConnections: value => connections.command(value), inspectSavedSourceHost: (value, signal) => connections.inspect(value, signal), save: async () => ({}), testConnection: async () => ({}), chooseFolder: async () => null, exportBrowserLitePackage: async () => ({}), openDirectory: async () => {}, shutdown: () => {} }
    const server = await startLibraryServer({ database: db, service, port: 0, desktop: options.desktop === false ? undefined : desktop })
    cleanup.push(async () => { inspector.close(); resolveLate(); server.server.closeAllConnections(); await new Promise<void>(resolve => server.server.close(() => resolve())); db.close(); const resolved = fs.realpathSync(root); if (path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) || !path.basename(resolved).startsWith('pica-host-api-') || fs.lstatSync(root).isSymbolicLink()) throw Error('Unsafe synthetic cleanup'); fs.rmSync(resolved, { recursive: true, force: true }) })
    const headers = { 'content-type': 'application/json', Origin: server.url, 'x-pica-csrf': desktop.csrfToken }
    const post = (value: unknown = input, override: Record<string, string> = {}) => fetch(server.url + route, { method: 'POST', headers: { ...headers, ...override }, body: JSON.stringify(value) })
    return { root, db, service, server, desktop, wire, inspector, connections, inspect, headers, post, entered, release: resolveLate, getSignal: () => signal, behavior: (value: string) => { behavior = value } }
}

describe('actual local host-inspection HTTP boundary — synthetic CI listener only', () => {
    it('executes the real inspector/HTTP adapter but changes no table, source choice or private state', async () => {
        const f = await fixture(), before = shadowDatabaseState(f.db), policy = f.service.sources.snapshot(), files = fs.readdirSync(f.root).sort()
        expect(f.wire).not.toHaveBeenCalled()
        const response = await f.post(), value = await response.json()
        expect(response.status).toBe(200); expect(value.page.sources[0].id).toBe('9223372036854775807')
        expect(value).toMatchObject({ persisted: false, capabilities: { sourceInspection: true, reader: false, libraryImport: false, extensionInstall: false } })
        expect(JSON.stringify(value)).not.toMatch(/not-for-host-export|private-canary|127\.0\.0\.1|authorization|password/)
        expect(f.wire).toHaveBeenCalledTimes(2)
        expect(shadowDatabaseState(f.db)).toEqual(before); expect(f.service.sources.snapshot()).toEqual(policy)
        expect(fs.readdirSync(f.root).sort()).toEqual(files)
    })
    it('requires local UI Origin/CSRF before parsing the request or constructing a remote transport', async () => {
        const f = await fixture()
        const denied: Record<string, string>[] = [{ ...f.headers, 'x-pica-csrf': 'wrong' }, { ...f.headers, Origin: 'https://foreign.invalid' }, { 'content-type': 'application/json', 'x-pica-csrf': 'synthetic-host-csrf' }]
        for (const headers of denied) {
            const response = await fetch(f.server.url + route, { method: 'POST', headers, body: JSON.stringify(input) }); expect(response.status).toBe(403)
        }
        expect(f.inspect).not.toHaveBeenCalled(); expect(f.wire).not.toHaveBeenCalled()
    })
    it('unconfigured Desktop and remote/headless shells have no host authority', async () => {
        for (const options of [{ configured: false }, { desktop: false }]) { const f = await fixture(options); expect((await f.post()).status).toBe(403); expect(f.inspect).not.toHaveBeenCalled(); expect(f.wire).not.toHaveBeenCalled() }
    })
    it('GET is never a probe; malformed JSON, MIME and URL parameters are rejected without echoing secrets', async () => {
        const f = await fixture()
        expect((await fetch(f.server.url + route)).status).toBe(405)
        const malformed = await fetch(f.server.url + route, { method: 'POST', headers: f.headers, body: '{"password":"remote-secret",bad}' })
        expect(malformed.status).toBe(400); expect(await malformed.text()).not.toContain('remote-secret')
        expect((await f.post(input, { 'content-type': 'text/plain' })).status).toBe(400)
        const query = await fetch(f.server.url + route + '?password=remote-secret', { method: 'POST', headers: f.headers, body: JSON.stringify(input) })
        expect(query.status).toBe(400); expect(await query.text()).not.toContain('remote-secret')
        expect(f.inspect).not.toHaveBeenCalled(); expect(f.wire).not.toHaveBeenCalled()
    })
    it('explicit intent, known fields and TLS/host-scope validation precede every network operation', async () => {
        const f = await fixture()
        for (const value of [{ ...input, consent: false }, { ...input, query: 'mutation { installExtension }' }, { ...input, endpoint: 'https://name:secret@host.invalid/' }, { ...input, endpoint: 'http://192.168.0.2:4567/', allowInsecureLan: true, auth: { mode: 'basic', username: 'u', password: 'p' } }]) {
            expect((await f.post(value)).status).toBe(400)
        } expect(f.wire).not.toHaveBeenCalled()
    })
    it('sanitizes unexpected failures, preserves state and never returns a partial source response', async () => {
        const f = await fixture(), before = shadowDatabaseState(f.db); f.behavior('throw')
        const response = await f.post(); expect(response.status).toBe(502)
        expect(await response.json()).toEqual({ code: 'SOURCE_HOST_UNAVAILABLE', error: 'SOURCE_HOST_UNAVAILABLE' })
        expect(shadowDatabaseState(f.db)).toEqual(before); expect(f.inspector.busy).toBe(false)
    })
    it('client disconnect aborts owned inspection and late data cannot trigger the next query', async () => {
        const f = await fixture(), controller = new AbortController(); f.behavior('stall')
        const pending = fetch(f.server.url + route, { method: 'POST', headers: f.headers, body: JSON.stringify(input), signal: controller.signal })
        await f.entered; controller.abort(); await expect(pending).rejects.toThrow()
        await vi.waitFor(() => expect(f.getSignal()?.aborted).toBe(true)); await vi.waitFor(() => expect(f.inspector.busy).toBe(false))
        f.release(); await Promise.resolve(); expect(f.wire).toHaveBeenCalledTimes(1)
    })
    it('bounds a stalled credential-bearing request body before invoking any inspector', async () => {
        const f = await fixture(), started = Date.now()
        await new Promise<void>((resolve, reject) => {
            const req = http.request(f.server.url + route, { method: 'POST', headers: { ...f.headers, 'content-length': '10000' } }, response => { response.resume(); reject(Error('Expected owned server body deadline to close the incomplete upload')) })
            const guard = setTimeout(() => { req.destroy(); reject(Error('Client guard, not the server, ended stalled input')) }, 8000)
            req.on('error', () => { clearTimeout(guard); resolve() }); req.write('{"kind":"suwayomi",')
        })
        expect(Date.now() - started).toBeGreaterThanOrEqual(4500); expect(Date.now() - started).toBeLessThan(7500)
        expect(f.inspect).not.toHaveBeenCalled(); expect(f.wire).not.toHaveBeenCalled()
    })
    it('persists only opt-in host metadata through the actual Desktop routes, never source/content/account state', async () => {
        const f = await fixture(), before = shadowDatabaseState(f.db)
        const connectionRoute = f.server.url + '/api/v1/desktop/source-hosts/connections'
        const command = (value: unknown) => fetch(connectionRoute, { method: 'POST', headers: f.headers, body: JSON.stringify(value) })
        const savedResponse = await command({ action: 'save', kind: 'suwayomi', label: '<img src=x onerror=alert(1)>', endpoint: input.endpoint, allowInsecureLan: false, authMode: 'none', consent: true, scope: 'inspect-only' })
        expect(savedResponse.status).toBe(200)
        const saved = await savedResponse.json(), host = saved.hosts[0]
        expect(host.enabled).toBe(false); expect(f.wire).not.toHaveBeenCalled()
        const enabledResponse = await command({ action: 'set-enabled', id: host.id, expectedRevision: 0, enabled: true, consent: true })
        expect(enabledResponse.status).toBe(200); expect(f.wire).not.toHaveBeenCalled()
        const read = await fetch(f.server.url + '/api/v1/desktop/source-hosts/inspect-saved', { method: 'POST', headers: f.headers, body: JSON.stringify({ id: host.id, expectedRevision: 1, consent: true }) })
        expect(read.status).toBe(200); expect((await read.json()).capabilities.reader).toBe(false)
        expect(f.wire).toHaveBeenCalledTimes(2)
        const removed = await command({ action: 'remove', id: host.id, expectedRevision: 1, consent: true })
        expect(removed.status).toBe(200); expect((await removed.json()).hosts).toEqual([])
        expect(shadowDatabaseState(f.db)).toEqual(before)
        expect(f.service.sources.snapshot().enabled).toEqual([])
    })
    it('applies the same method, local-origin, CSRF and bounded-input guards to saved-host routes', async () => {
        const f = await fixture()
        for (const name of ['connections', 'inspect-saved']) {
            const url = f.server.url + '/api/v1/desktop/source-hosts/' + name
            expect((await fetch(url)).status).toBe(405)
            for (const headers of [{ ...f.headers, Origin: 'https://outside.example' }, { ...f.headers, Origin: '' }, { ...f.headers, 'x-pica-csrf': 'wrong' }]) expect((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ action: 'list' }) })).status).toBe(403)
            expect((await fetch(url, { method: 'POST', headers: f.headers, body: JSON.stringify({ action: 'list', password: 'synthetic-secret' }) })).status).toBe(400)
        }
        expect(f.connections.snapshot().hosts).toEqual([]); expect(f.wire).not.toHaveBeenCalled()
        expect(fs.existsSync(path.join(f.root, 'source-hosts.json'))).toBe(false)
    })
    it('uses actual Reader endpoints with independent progress and denies cross-site ambient credential/media GETs', async () => {
        const f = await fixture(), endpoint = f.server.url + '/api/v1/desktop/host-reader'
        const hostId = '64d223e0-5d29-4320-babb-5a2da654d345'
        f.connections.command({ action: 'save', kind: 'suwayomi', label: 'Mine', endpoint: 'https://synthetic.example/', authMode: 'none', allowInsecureLan: false, consent: true, scope: 'inspect-only' })
        f.connections.command({ action: 'set-enabled', id: hostId, expectedRevision: 0, enabled: true, consent: true })
        const command = async (input: unknown) => { const response = await fetch(endpoint, { method: 'POST', headers: f.headers, body: JSON.stringify(input) }); expect(response.status).toBe(200); return response.json() }
        const session = await command({ action: 'start', id: hostId, expectedRevision: 1, consent: true, scope: 'library-read', acceptHostFetchSideEffects: true })
        const page = await command({ action: 'list', sessionId: session.sessionId, offset: 0 }), comicId = page.books[0].comicId
        await command({ action: 'select', sessionId: session.sessionId, comicId })
        const root = endpoint + '/' + session.sessionId, chaptersPath = root + '/comics/' + encodeURIComponent(comicId) + '/chapters'
        const before = f.wire.mock.calls.length
        const foreignHeaders: Array<Record<string, string>> = [{}, { Origin: 'https://outside.example' }, { 'sec-fetch-site': 'cross-site', referer: f.server.url, 'sec-fetch-dest': 'image' }]
        for (const headers of foreignHeaders) expect((await fetch(chaptersPath, { headers })).status).toBe(403)
        expect(f.wire).toHaveBeenCalledTimes(before)
        const ownHeaders = { 'sec-fetch-site': 'same-origin', referer: f.server.url + '/', 'sec-fetch-dest': 'empty' }
        const chaptersResponse = await fetch(chaptersPath, { headers: ownHeaders }); expect(chaptersResponse.status).toBe(200)
        const chapterId = (await chaptersResponse.json())[0].id
        const chapterResponse = await fetch(chaptersPath + '/' + encodeURIComponent(chapterId), { headers: ownHeaders }); expect(chapterResponse.status).toBe(200)
        const chapter = await chapterResponse.json(), image = await fetch(f.server.url + chapter.pages[0].url, { headers: { ...ownHeaders, 'sec-fetch-dest': 'image' } })
        expect(image.status).toBe(200); expect(image.headers.get('cross-origin-resource-policy')).toBe('same-origin'); expect(image.headers.get('content-type')).toBe('image/png')
        const saved = await fetch(root + '/progress', { method: 'POST', headers: f.headers, body: JSON.stringify({ comicId, episodeId: chapterId, pageIndex: 0 }) })
        expect(saved.status).toBe(200); expect(f.db.getAppState('online-reader-progress-v1')).toBeUndefined()
        const progress = await fetch(root + '/progress', { headers: ownHeaders }); expect((await progress.json())[0]).toMatchObject({ comicId, episodeId: chapterId, pageIndex: 0 })
        expect(f.db.getAppState('synthetic.source-host.private-canary')).toEqual({ password: 'not-for-host-export', tags: ['private'], preserved: true })
        expect(f.service.sources.snapshot().enabled).toEqual([])
        await command({ action: 'close', sessionId: session.sessionId })
        expect((await fetch(chaptersPath, { headers: ownHeaders })).status).toBe(409)
    })
})
