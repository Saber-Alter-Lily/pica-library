import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pica } from '../../src/sdk'
import { EhProvider } from '../../src/providers/eh-provider'
import { JmProvider } from '../../src/providers/jm-provider'
import { ProviderService } from '../../src/services/provider-service'
import { LibraryDatabase } from '../../src/library/database'
import {
    SourceRuntime,
    initialSourcePolicy
} from '../../src/sources/source-policy'
import { HttpMediaClient } from '../../src/media/http-media-client'
import { enabledFixtureSources } from "../helpers/source-runtime-fixture"

const cleanups: Array<() => void> = []
afterEach(() => {
    for (const close of cleanups.splice(0).reverse()) close()
    vi.restoreAllMocks()
})
function fixture() {
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-source-lifecycle-')
    )
    const db = new LibraryDatabase(path.join(root, 'library.db'))
    cleanups.push(() => {
        db.close()
        fs.rmSync(root, { recursive: true, force: true })
    })
    const sources = enabledFixtureSources()
    const transport = {
        available: true,
        request: vi.fn(async () => ({ items: [] })),
        close: vi.fn()
    }
    const jm = new JmProvider(transport as never)
    const eh = new EhProvider()
    const doc = {
        _id: 'synthetic-result',
        title: 'Synthetic',
        author: 'Fixture',
        tags: [],
        categories: [],
        finished: false
    }
    const search = vi.fn(async () => ({ docs: [doc] }))
    const connect = vi.fn(
        async () => ({ Order: { loved: 'ld' }, search }) as unknown as Pica
    )
    const service = new ProviderService(connect, db, eh, jm, sources)
    return { db, sources, service, connect, search, doc, eh, jm, transport }
}
describe('source lifecycle at real call boundaries', () => {
    it('masks capabilities without mutating compiled adapter support; disabled search cannot connect and EH remains independent', async () => {
        const f = fixture()
        expect(f.service.providerStatus().pica.search).toBe(true)
        f.sources.apply(f.sources.prepare(['eh'], 0))
        expect(f.service.providerStatus().pica.search).toBe(false)
        expect(
            f.service.sourceModuleStatus().find((x) => x.id === 'eh')?.enabled
        ).toBe(true)
        await expect(
            f.service.search({ keyword: 'fixture', page: 1 }, ['pica'])
        ).rejects.toMatchObject({ code: 'SOURCE_DISABLED' })
        expect(f.connect).not.toHaveBeenCalled()
        const ehSearch = vi.spyOn(f.eh, 'search').mockResolvedValue([])
        await expect(
            f.service.search({ keyword: 'fixture', page: 1 }, ['eh'])
        ).resolves.toEqual([])
        expect(ehSearch).toHaveBeenCalledTimes(1)
        f.sources.apply(f.sources.prepare(['pica', 'eh'], 1))
        expect(f.service.providerStatus().pica.search).toBe(true)
        expect(
            await f.service.search({ keyword: 'fixture', page: 1 }, ['pica'])
        ).toHaveLength(1)
    })
    it('drops a late metadata result after disable/re-enable instead of importing it into the catalog', async () => {
        const f = fixture()
        let resolve!: (value: { docs: (typeof f.doc)[] }) => void
        f.search.mockImplementation(
            () =>
                new Promise((done) => {
                    resolve = done
                })
        )
        const pending = expect(
            f.service.search({ keyword: 'fixture', page: 1 }, ['pica'])
        ).rejects.toMatchObject({ code: 'SOURCE_DISABLED' })
        await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
        f.sources.apply(f.sources.prepare(['eh', 'jm'], 0))
        f.sources.apply(f.sources.prepare(['pica', 'eh', 'jm'], 1))
        resolve({ docs: [f.doc] })
        await pending
        expect(f.db.listComics({})).toEqual([])
    })
    it('disabled JM status never restores remembered credentials or starts the worker; active requests close and cannot revive', async () => {
        const f = fixture()
        f.jm.setRememberedCredentials('fixture', 'fixture')
        f.sources.apply(f.sources.prepare([], 0))
        expect(await f.jm.accountStatus()).toEqual({
            configured: true,
            enabled: false
        })
        expect(f.transport.request).not.toHaveBeenCalled()
        await expect(f.jm.search({ keyword: 'fixture' })).rejects.toMatchObject(
            { code: 'SOURCE_DISABLED' }
        )
        f.sources.apply(f.sources.prepare(['jm'], 1))
        f.jm.setRememberedCredentials()
        let resolve!: (value: { items: never[] }) => void
        f.transport.request.mockImplementation(
            () =>
                new Promise((done) => {
                    resolve = done
                })
        )
        const pending = expect(
            f.jm.search({ keyword: 'fixture' })
        ).rejects.toMatchObject({ code: 'SOURCE_DISABLED' })
        await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
        f.sources.apply(f.sources.prepare([], 2))
        expect(f.transport.close).toHaveBeenCalled()
        f.sources.apply(f.sources.prepare(['jm'], 3))
        resolve({ items: [] })
        await pending
    })
    it('gates Pica API directly even for an already retained client, and abort is never retried', async () => {
        const sources = new SourceRuntime(initialSourcePolicy())
        let resolve!: (value: unknown) => void
        let requestConfig: any
        const adapter = vi.fn(async (config: any) => {
            requestConfig = config
            return new Promise<any>((done) => {
                resolve = done
            })
        })
        const client = new Pica({
            apiAdapter: adapter,
            sourceAccess: sources.acquire
        })
        await expect(client.api.get('/fixture')).rejects.toMatchObject({
            code: 'SOURCE_DISABLED'
        })
        expect(adapter).not.toHaveBeenCalled()
        sources.apply(sources.prepare(['pica'], 0))
        const pending = expect(
            client.api.get('/fixture')
        ).rejects.toMatchObject({ code: 'SOURCE_DISABLED' })
        await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
        sources.apply(sources.prepare([], 1))
        sources.apply(sources.prepare(['pica'], 2))
        resolve({
            config: requestConfig,
            status: 200,
            statusText: 'OK',
            headers: {},
            data: { code: 200, data: {} }
        })
        await pending
        expect(adapter).toHaveBeenCalledTimes(1)
        expect(requestConfig.signal.aborted).toBe(true)
    })
    it('aborts an actual image HTTP connection through a synthetic loopback proxy', async () => {
        let entered!: () => void
        const received = new Promise<void>((resolve) => {
            entered = resolve
        })
        const server = http.createServer((_req, res) => {
            res.writeHead(200, { 'content-type': 'image/png' })
            res.write('partial')
            entered()
        })
        await new Promise<void>((resolve) =>
            server.listen(0, '127.0.0.1', resolve)
        )
        const sources = enabledFixtureSources()
        const lease = sources.acquire('jm')
        const media = new HttpMediaClient({
            proxyUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`
        })
        try {
            const pending = expect(
                media.fetchImage(
                    'https://synthetic.invalid/page.png',
                    1024,
                    lease.signal
                )
            ).rejects.toMatchObject({ code: 'SOURCE_DISABLED' })
            await received
            sources.apply(sources.prepare(['pica', 'eh'], 0))
            await pending
        } finally {
            server.closeAllConnections()
            await new Promise<void>((resolve) => server.close(() => resolve()))
        }
    })
    it('direct EH transport passes cancellation to fetch and rejects work when disabled', async () => {
        const sources = new SourceRuntime(initialSourcePolicy())
        const fetcher = vi
            .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
            .mockResolvedValue(
                new Response('fixture', {
                    headers: { 'content-type': 'image/png' }
                })
            )
        const eh = new EhProvider(null, fetcher)
        eh.setSourceAccess(sources.acquire)
        await expect(
            eh.fetchCover('https://ehgt.org/fixture.png')
        ).rejects.toMatchObject({ code: 'SOURCE_DISABLED' })
        expect(fetcher).not.toHaveBeenCalled()
        sources.apply(sources.prepare(['eh'], 0))
        expect(
            (
                await eh.fetchCover('https://ehgt.org/fixture.png')
            ).data.toString()
        ).toBe('fixture')
        const signal = fetcher.mock.calls[0][1]?.signal
        sources.apply(sources.prepare([], 1))
        expect(signal?.aborted).toBe(true)
    })
})
