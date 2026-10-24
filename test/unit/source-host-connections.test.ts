import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceHostConnections, sourceHostRegistry, type SourceHostRegistryStore } from '../../src/source-hosts/connections'
import { sourceHostStore } from '../../src/desktop/source-host-store'
import { SourceHostInspector } from '../../src/source-hosts/inspector'
import { sourceHostHttp } from '../../src/source-hosts/http-transport'

const ID = '64d223e0-5d29-4320-babb-5a2da654d345'
const ID2 = '64d223e0-5d29-4320-babb-5a2da654d346'
const save = (more: Record<string, unknown> = {}) => ({ action: 'save', kind: 'suwayomi', label: 'My own host', endpoint: 'https://user-host.example/base/', allowInsecureLan: false, authMode: 'none', scope: 'inspect-only', consent: true, ...more })
const result = { kind: 'suwayomi' as const, protocolVersion: 1 as const, server: { name: 'Suwayomi-Server', version: '2.4.2366' }, page: { offset: 0, size: 25, total: 0, hasNext: false, hasPrevious: false, sources: [] }, capabilities: { sourceInspection: true as const, reader: false as const, libraryImport: false as const, extensionInstall: false as const }, persisted: false as const }
function fixture() {
    let stored: unknown = null
    const store: SourceHostRegistryStore = { load: () => structuredClone(stored), save: vi.fn(value => { stored = structuredClone(value) }) }
    const inspect = vi.fn(async (_input: unknown, _signal: AbortSignal) => result)
    const manager = new SourceHostConnections(store, { inspect }, () => ID)
    const enable = (enabled = true, expectedRevision = 0) => manager.command({ action: 'set-enabled', id: ID, enabled, expectedRevision, consent: true })
    const read = (more: Record<string, unknown> = {}) => manager.inspect({ id: ID, expectedRevision: 1, consent: true, ...more }, new AbortController().signal)
    return { store, manager, inspect, enable, read, stored: () => structuredClone(stored) }
}
const roots: string[] = []
afterEach(() => {
    for (const root of roots.splice(0)) {
        const resolved = fs.realpathSync(root)
        if (path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) || !path.basename(resolved).startsWith('pica-host-settings-') || fs.lstatSync(root).isSymbolicLink()) throw Error('Unsafe synthetic cleanup')
        fs.rmSync(resolved, { recursive: true, force: true })
    }
})

describe('user-owned source-host permission lifecycle — injected transport/temp config only', () => {
    it('has no default host, network or persistence at construction/listing', () => {
        const f = fixture()
        expect(f.manager.command({ action: 'list' })).toMatchObject({ hosts: [], scope: 'inspect-only', credentials: 'per-request-not-stored', storage: 'available', capabilities: { reader: false, libraryImport: false, extensionInstall: false } })
        expect(f.store.save).not.toHaveBeenCalled(); expect(f.inspect).not.toHaveBeenCalled()
    })
    it('persists only selected public metadata, disabled by default; endpoint/auth changes cannot inherit an identity', () => {
        const f = fixture(), value = f.manager.command(save())
        expect(value.hosts).toEqual([{ id: ID, kind: 'suwayomi', label: 'My own host', endpoint: 'https://user-host.example/base/', allowInsecureLan: false, authMode: 'none', enabled: false, revision: 0 }])
        expect(f.inspect).not.toHaveBeenCalled()
        expect(() => f.manager.command(save())).toThrow('SOURCE_HOST_DUPLICATE')
        for (const extra of [{ id: ID }, { password: 'synthetic-secret' }, { enabled: true }, { reader: true }, { repositories: ['https://untrusted.example'] }, { scope: 'search-and-read' }, { consent: false }]) expect(() => f.manager.command(save(extra))).toThrow()
        expect(() => f.manager.command({ action: 'update', id: ID, endpoint: 'https://replacement.example' })).toThrow()
        expect(value.hosts[0].enabled).toBe(false)
    })
    it('requires separate explicit enabling and per-request consent; enabling/restart does not contact a host', async () => {
        const f = fixture(); f.manager.command(save())
        await expect(f.read({ expectedRevision: 0 })).rejects.toThrow('SOURCE_HOST_DISABLED')
        f.enable(); expect(f.inspect).not.toHaveBeenCalled()
        const restarted = new SourceHostConnections(f.store, { inspect: f.inspect }, () => ID2)
        expect(restarted.snapshot().hosts[0].enabled).toBe(true); expect(f.inspect).not.toHaveBeenCalled()
        await expect(f.read({ consent: false })).rejects.toThrow('SOURCE_HOST_CONSENT_REQUIRED')
        await f.read(); expect(f.inspect).toHaveBeenCalledTimes(1)
        expect(f.inspect.mock.calls[0][0]).toMatchObject({ endpoint: 'https://user-host.example/base/', consent: true, auth: { mode: 'none' }, offset: 0 })
    })
    it('uses only one-request Basic credentials and stores/returns none, including after restart', async () => {
        const f = fixture(); f.manager.command(save({ authMode: 'basic' })); f.enable()
        await expect(f.read()).rejects.toThrow('SOURCE_HOST_AUTH_REQUIRED')
        await f.read({ auth: { mode: 'basic', username: 'only-this-host', password: 'synthetic-secret' } })
        expect(JSON.stringify(f.stored())).not.toMatch(/only-this-host|synthetic-secret|password|username/)
        expect(JSON.stringify(f.manager.snapshot())).not.toMatch(/only-this-host|synthetic-secret|password|username/)
        const restarted = new SourceHostConnections(f.store, { inspect: f.inspect }, () => ID2)
        await expect(restarted.inspect({ id: ID, expectedRevision: 1, consent: true }, new AbortController().signal)).rejects.toThrow('SOURCE_HOST_AUTH_REQUIRED')
        expect(() => f.manager.command(save({ endpoint: 'http://192.168.1.2:4567/', allowInsecureLan: true, authMode: 'basic' }))).toThrow('SOURCE_HOST_INSECURE')
    })
    it('keeps stale tabs, undeclared operations/permissions and malformed IDs out', async () => {
        const f = fixture(); f.manager.command(save()); f.enable()
        await expect(f.read({ expectedRevision: 0 })).rejects.toThrow('SOURCE_HOST_STALE')
        expect(() => f.enable(false, 0)).toThrow('SOURCE_HOST_STALE')
        for (const extra of [{ expectedRevision: '1' }, { id: 'pica' }, { sourceId: '1' }, { endpoint: 'https://changed.example' }, { read: true }]) await expect(f.read(extra)).rejects.toThrow()
        expect(f.inspect).not.toHaveBeenCalled()
    })
    it('disabling and removing cancel a truly active inspection and fence a late uncooperative result', async () => {
        for (const remove of [false, true]) {
            const f = fixture(); f.manager.command(save()); f.enable()
            let release!: (value: typeof result) => void
            f.inspect.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
            const reading = f.read(); const outcome = expect(reading).rejects.toThrow('SOURCE_HOST_CANCELLED')
            expect(f.manager.busy).toBe(true)
            if (remove) f.manager.command({ action: 'remove', id: ID, expectedRevision: 1, consent: true })
            else f.enable(false, 1)
            release(result); await outcome
            expect(f.manager.busy).toBe(false)
            expect(f.manager.snapshot().hosts.length).toBe(remove ? 0 : 1)
            expect(f.store.save).toHaveBeenCalledTimes(3)
        }
    })
    it('disconnect/shutdown cancel and cannot publish late results or save after close', async () => {
        for (const close of [false, true]) {
            const f = fixture(); f.manager.command(save()); f.enable()
            let release!: (value: typeof result) => void
            f.inspect.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
            const caller = new AbortController()
            const reading = f.manager.inspect({ id: ID, expectedRevision: 1, consent: true }, caller.signal)
            const outcome = expect(reading).rejects.toThrow('SOURCE_HOST_CANCELLED')
            if (close) f.manager.close(); else caller.abort()
            release(result); await outcome
            if (close) expect(() => f.manager.command(save({ endpoint: 'https://other.example' }))).toThrow('SOURCE_HOST_CANCELLED')
        }
    })
    it('never grants on a failed durable write or silently resets a corrupt permission file', () => {
        const f = fixture(); f.manager.command(save())
        vi.mocked(f.store.save).mockImplementationOnce(() => { throw Error('sensitive-local-path') })
        expect(() => f.enable()).toThrow('SOURCE_HOST_STORAGE')
        expect(f.manager.snapshot().hosts[0].enabled).toBe(false)
        const store = { load: () => ({ invalid: 'private-canary' }), save: vi.fn() }
        const damaged = new SourceHostConnections(store, { inspect: f.inspect }, () => ID)
        expect(damaged.snapshot()).toMatchObject({ storage: 'unavailable', hosts: [] })
        expect(() => damaged.command(save())).toThrow('SOURCE_HOST_STORAGE'); expect(store.save).not.toHaveBeenCalled()
    })
    it('does not return mutable internal records or credentials from public snapshots', () => {
        const f = fixture(); const value = f.manager.command(save()); value.hosts[0].enabled = true; value.hosts.splice(0)
        expect(f.manager.snapshot().hosts).toHaveLength(1); expect(f.manager.snapshot().hosts[0].enabled).toBe(false)
    })
    it('stores the exact bounded module config atomically and leaves adjacent account/database/body canaries alone', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-host-settings-')); roots.push(root)
        const canaries = ['config.json', 'credentials.dat', 'library.db', 'page.jpg']
        for (const name of canaries) fs.writeFileSync(path.join(root, name), 'synthetic-preserve-' + name)
        const store = sourceHostStore(path.join(root, 'source-hosts.json')), f = fixture()
        expect(store.load()).toBeNull(); f.manager.command(save()); const value = sourceHostRegistry(f.stored()); store.save(value)
        expect(store.load()).toEqual(sourceHostRegistry(value))
        f.enable(); store.save(sourceHostRegistry(f.stored())); expect(sourceHostRegistry(store.load()).hosts[0].enabled).toBe(true)
        expect(fs.readdirSync(root).filter(name => name.includes('.tmp-'))).toEqual([])
        for (const name of canaries) expect(fs.readFileSync(path.join(root, name), 'utf8')).toBe('synthetic-preserve-' + name)
        fs.writeFileSync(path.join(root, 'source-hosts.json'), '{broken-private-canary')
        expect(() => store.load()).toThrow('SOURCE_HOST_STORAGE')
        expect(fs.readFileSync(path.join(root, 'source-hosts.json'), 'utf8')).toContain('broken-private-canary')
    })
    it('rejects secret/future fields, duplicate/unsafe endpoints, malformed records and excessive hosts', () => {
        const f = fixture(); f.manager.command(save()); const saved = sourceHostRegistry(f.stored())
        for (const value of [{ ...saved, token: 'secret' }, { ...saved, schemaVersion: 2 }, { ...saved, hosts: [{ ...saved.hosts[0], reader: true }] }, { ...saved, hosts: [saved.hosts[0], saved.hosts[0]] }, { ...saved, hosts: [{ ...saved.hosts[0], endpoint: 'https://user:pass@host.example/' }] }, { ...saved, hosts: Array(17).fill(saved.hosts[0]) }]) expect(() => sourceHostRegistry(value)).toThrow()
    })
    it('reuses the real inspector/HTTP body, abort and fixed-operation boundaries with only injected fake fetch', async () => {
        const wire = vi.fn(async (_url: unknown, init?: RequestInit) => new Response(JSON.stringify(JSON.parse(String(init?.body)).operationName === 'PicaSourceHostInfo' ? { data: { aboutServer: result.server } } : { data: { sources: { nodes: [], totalCount: 0, pageInfo: { hasNextPage: false, hasPreviousPage: false } } } }), { headers: { 'content-type': 'application/json' } }))
        const inspect = new SourceHostInspector(connection => sourceHostHttp(connection, wire)), f = fixture()
        const manager = new SourceHostConnections(f.store, inspect, () => ID)
        manager.command(save()); manager.command({ action: 'set-enabled', id: ID, expectedRevision: 0, enabled: true, consent: true })
        expect(wire).not.toHaveBeenCalled()
        await manager.inspect({ id: ID, expectedRevision: 1, consent: true }, new AbortController().signal)
        expect(wire).toHaveBeenCalledTimes(2)
        expect(wire.mock.calls.map(row => row[0])).toEqual(Array(2).fill('https://user-host.example/base/api/graphql'))
    })
})
