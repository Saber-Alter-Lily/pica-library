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
import { shadowDatabaseState } from '../fixtures/recommendation-shadow-fixture'

const cleanup: (() => Promise<void>)[] = []
const route = '/api/v1/desktop/source-hosts/inspect'
const input = { kind: 'suwayomi', endpoint: 'http://127.0.0.1:4567/', consent: true }
const info = { data: { aboutServer: { name: 'Suwayomi-Server', version: '2.4.2366' } } }
const sources = { data: { sources: { nodes: [{ id: '9223372036854775807', name: 'Synthetic', lang: 'zh', supportsLatest: true }], pageInfo: { hasNextPage: false, hasPreviousPage: false }, totalCount: 1 } } }
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.restoreAllMocks() })

async function fixture(options: { configured?: boolean; desktop?: boolean } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-host-api-')), db = new LibraryDatabase(path.join(root, 'library.db'))
    const service = new LibraryService(db, root)
    service.sources.apply({ schemaVersion: 1, revision: 1, enabled: [] })
    db.setAppState('synthetic.source-host.private-canary', { password: 'not-for-host-export', tags: ['private'], preserved: true })
    let behavior = 'normal', signal: AbortSignal | undefined, resolveEntered!: () => void, resolveLate!: () => void
    const entered = new Promise<void>(r => { resolveEntered = r }), late = new Promise<void>(r => { resolveLate = r })
    const wire = vi.fn(async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        resolveEntered()
        if (behavior === 'throw') throw new Error('https://name:remote-secret@host.invalid/ Authorization: private')
        if (behavior === 'stall') await late
        const operation = JSON.parse(String(init?.body)).operationName
        return new Response(JSON.stringify(operation === 'PicaSourceHostInfo' ? info : sources), { headers: { 'content-type': 'application/json' } })
    })
    const inspector = new SourceHostInspector(connection => sourceHostHttp(connection, wire))
    const inspect = vi.fn((value: Record<string, unknown>, abort: AbortSignal) => { signal = abort; return inspector.inspect(value, abort) })
    const desktop: DesktopServerController = { csrfToken: 'synthetic-host-csrf', configured: () => options.configured !== false, status: () => ({ sourceHostInspection: { available: true } }), inspectSourceHost: inspect, save: async () => ({}), testConnection: async () => ({}), chooseFolder: async () => null, exportBrowserLitePackage: async () => ({}), openDirectory: async () => {}, shutdown: () => {} }
    const server = await startLibraryServer({ database: db, service, port: 0, desktop: options.desktop === false ? undefined : desktop })
    cleanup.push(async () => { inspector.close(); resolveLate(); server.server.closeAllConnections(); await new Promise<void>(resolve => server.server.close(() => resolve())); db.close(); const resolved = fs.realpathSync(root); if (path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) || !path.basename(resolved).startsWith('pica-host-api-') || fs.lstatSync(root).isSymbolicLink()) throw Error('Unsafe synthetic cleanup'); fs.rmSync(resolved, { recursive: true, force: true }) })
    const headers = { 'content-type': 'application/json', Origin: server.url, 'x-pica-csrf': desktop.csrfToken }
    const post = (value: unknown = input, override: Record<string, string> = {}) => fetch(server.url + route, { method: 'POST', headers: { ...headers, ...override }, body: JSON.stringify(value) })
    return { root, db, service, server, desktop, wire, inspector, inspect, headers, post, entered, release: resolveLate, getSignal: () => signal, behavior: (value: string) => { behavior = value } }
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
})
