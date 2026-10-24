import { describe, expect, it, vi } from 'vitest'
import { SourceHostInspector } from '../../src/source-hosts/inspector'
import { SourceHostError } from '../../src/source-hosts/contract'
import type { SourceHostOperation } from '../../src/source-hosts/suwayomi'

const input = { kind: 'suwayomi', endpoint: 'http://localhost:4567/', consent: true }
const info = { data: { aboutServer: { name: 'Suwayomi-Server', version: '2.4.2366' } } }
const page = { data: { sources: { nodes: [{ id: '9007199254740993', name: 'Synthetic', lang: 'en', supportsLatest: false }], pageInfo: { hasNextPage: false, hasPreviousPage: false }, totalCount: 1 } } }
const deferred = () => { let resolve!: (value: unknown) => void; const promise = new Promise<unknown>(r => { resolve = r }); return { promise, resolve } }

describe('ephemeral source-host inspection domain — injected transport only', () => {
    it('constructor/status do nothing and one explicit inspection uses exactly two bounded queries', async () => {
        const calls: unknown[] = [], factory = vi.fn(() => ({ read: vi.fn(async (operation: SourceHostOperation, variables: Record<string, number>) => { calls.push([operation, variables]); return operation === 'info' ? info : page }) }))
        const inspector = new SourceHostInspector(factory)
        expect(inspector.busy).toBe(false); expect(factory).not.toHaveBeenCalled()
        const result = await inspector.inspect(input)
        expect(calls).toEqual([['info', {}], ['sources', { first: 25, offset: 0 }]])
        expect(result.page.sources[0].id).toBe('9007199254740993')
        expect(result).toMatchObject({ persisted: false, capabilities: { sourceInspection: true, reader: false, libraryImport: false, extensionInstall: false } })
        expect(JSON.stringify(result)).not.toMatch(/localhost|password|authorization|cookie|graphql/i)
        expect(inspector.busy).toBe(false)
    })
    it('auth stays only in the one request factory, never in a returned connection or saved account', async () => {
        const connections: unknown[] = [], inspector = new SourceHostInspector(connection => { connections.push(connection); return { read: async operation => operation === 'info' ? info : page } })
        const result = await inspector.inspect({ ...input, auth: { mode: 'basic', username: 'synthetic-person', password: 'synthetic-secret' } })
        expect(connections).toMatchObject([{ auth: { username: 'synthetic-person', password: 'synthetic-secret' } }])
        expect(JSON.stringify(result)).not.toMatch(/synthetic-person|synthetic-secret/)
    })
    it('refuses invalid intent before constructing any transport', async () => {
        const factory = vi.fn(); const inspector = new SourceHostInspector(factory)
        await expect(inspector.inspect({ ...input, consent: false })).rejects.toMatchObject({ code: 'SOURCE_HOST_CONSENT_REQUIRED' })
        expect(factory).not.toHaveBeenCalled()
    })
    it('never reads sources after unsupported or partial info data', async () => {
        const read = vi.fn(async () => ({ data: { aboutServer: { name: 'Other', version: '3.0.0' } } }))
        const inspector = new SourceHostInspector(() => ({ read }))
        await expect(inspector.inspect(input)).rejects.toMatchObject({ code: 'SOURCE_HOST_UNSUPPORTED' })
        expect(read).toHaveBeenCalledTimes(1); expect(inspector.busy).toBe(false)
    })
    it('does not commit partial data and sanitizes unexpected remote errors', async () => {
        const inspector = new SourceHostInspector(() => ({ read: async operation => { if (operation === 'info') return info; throw new Error('password=remote-secret at https://host.invalid/account') } }))
        await expect(inspector.inspect(input)).rejects.toEqual(new SourceHostError('SOURCE_HOST_UNAVAILABLE'))
        expect(inspector.busy).toBe(false)
    })
    it('blocks concurrent work without queueing a second host request', async () => {
        const pending = deferred(), factory = vi.fn(() => ({ read: async (operation: SourceHostOperation) => operation === 'info' ? pending.promise : page }))
        const inspector = new SourceHostInspector(factory), first = inspector.inspect(input)
        expect(inspector.busy).toBe(true)
        await expect(inspector.inspect(input)).rejects.toMatchObject({ code: 'SOURCE_HOST_BUSY' })
        expect(factory).toHaveBeenCalledTimes(1); pending.resolve(info); await first
    })
    it('cancellation rejects and releases the slot even when a buggy port ignores its signal; late info is not used', async () => {
        const pending = deferred(), calls: string[] = [], controller = new AbortController()
        const inspector = new SourceHostInspector(() => ({ read: async operation => { calls.push(operation); return operation === 'info' ? pending.promise : page } }))
        const first = inspector.inspect(input, controller.signal); controller.abort()
        await expect(first).rejects.toMatchObject({ code: 'SOURCE_HOST_CANCELLED' })
        expect(inspector.busy).toBe(false); pending.resolve(info); await Promise.resolve(); await Promise.resolve()
        expect(calls).toEqual(['info'])
    })
    it('rejects a late source page after cancellation instead of publishing old data', async () => {
        const pending = deferred(), controller = new AbortController(), read = vi.fn(async (operation: SourceHostOperation) => operation === 'info' ? info : pending.promise)
        const inspector = new SourceHostInspector(() => ({ read })), first = inspector.inspect(input, controller.signal)
        await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2)); controller.abort()
        await expect(first).rejects.toMatchObject({ code: 'SOURCE_HOST_CANCELLED' }); pending.resolve(page)
        expect(inspector.busy).toBe(false)
    })
    it('close cancels active work and prevents future operations without changing user sources', async () => {
        const pending = deferred(), inspector = new SourceHostInspector(() => ({ read: async () => pending.promise }))
        const first = inspector.inspect(input); inspector.close()
        await expect(first).rejects.toMatchObject({ code: 'SOURCE_HOST_CANCELLED' })
        await expect(inspector.inspect(input)).rejects.toMatchObject({ code: 'SOURCE_HOST_CANCELLED' })
        pending.resolve(info); expect(inspector.busy).toBe(false)
    })
    it('does not open pre-cancelled calls and preserves timeout classification', async () => {
        for (const reason of [new DOMException('synthetic', 'AbortError'), new DOMException('synthetic', 'TimeoutError')]) {
            const factory = vi.fn(), controller = new AbortController(); controller.abort(reason)
            const inspector = new SourceHostInspector(factory)
            await expect(inspector.inspect(input, controller.signal)).rejects.toMatchObject({ code: reason.name === 'TimeoutError' ? 'SOURCE_HOST_TIMEOUT' : 'SOURCE_HOST_CANCELLED' })
            expect(factory).not.toHaveBeenCalled(); expect(inspector.busy).toBe(false)
        }
    })
})
