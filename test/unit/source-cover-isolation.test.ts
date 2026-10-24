import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { ProviderService } from '../../src/services/provider-service'
import { JmProvider } from '../../src/providers/jm-provider'
import type { JmTransport } from '../../src/providers/jm-worker'
import { EhProvider } from '../../src/providers/eh-provider'
import { HttpMediaClient } from '../../src/media/http-media-client'
import type { Pica } from '../../src/sdk'
import { startLibraryServer } from '../../src/library/server'

const roots: string[] = [],
    databases: LibraryDatabase[] = []
function database() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-source-cover-'))
    roots.push(root)
    const db = new LibraryDatabase(path.join(root, 'library.db'))
    databases.push(db)
    return { root, db }
}
afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    for (const db of databases.splice(0)) db.close()
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('source-owned covers without unrelated accounts', () => {
    it('also rejects a cached read if the source scope changes while disk I/O is pending', async () => {
        const { db, root } = database()
        let session = 'before'
        const jm = new JmProvider({
            available: false,
            request: vi.fn(),
            close: vi.fn(),
            sessionKey: () => session
        })
        const source = new ProviderService(vi.fn(), db, new EhProvider(), jm)
        const image = vi
            .spyOn(HttpMediaClient.prototype, 'fetchImage')
            .mockResolvedValue({
                data: Buffer.from('old-scope'),
                contentType: 'image/png'
            })
        const library = new LibraryService(db, root)
        vi.spyOn(library, 'providerService').mockReturnValue(source)
        db.importCatalog([
            {
                comicId: 'jm:123',
                providerId: 'jm',
                providerRemoteId: '123',
                title: 'Synthetic',
                author: '',
                categories: [],
                tags: [],
                finished: false,
                coverUrl: 'https://cdn.example.test/jm.jpg'
            }
        ])
        await library.cover('jm:123')
        const read = fs.promises.readFile.bind(fs.promises)
        vi.spyOn(fs.promises, 'readFile').mockImplementation(
            async (...args: Parameters<typeof fs.promises.readFile>) => {
                const result = await read(...args)
                if (String(args[0]).endsWith('.bin')) session = 'after'
                return result
            }
        )
        await expect(library.cover('jm:123')).rejects.toThrow(/source changed/)
        expect(image).toHaveBeenCalledTimes(1)
        library.closeSources()
    })
    it('serves JM covers through the actual local HTTP API with no Pica account or caller-supplied URL', async () => {
        const { db, root } = database()
        vi.stubEnv('PICA_ACCOUNT', '')
        vi.stubEnv('PICA_PASSWORD', '')
        const image = vi
            .spyOn(HttpMediaClient.prototype, 'fetchImage')
            .mockResolvedValue({
                data: Buffer.from('synthetic-http-cover'),
                contentType: 'image/png'
            })
        const library = new LibraryService(db, root)
        const connect = vi
            .spyOn(library, 'connect')
            .mockRejectedValue(new Error('No Pica account'))
        db.importCatalog([
            {
                comicId: 'jm:123',
                providerId: 'jm',
                providerRemoteId: '123',
                title: 'Synthetic',
                author: '',
                categories: [],
                tags: [],
                finished: false,
                coverUrl: 'https://cdn.example.test/jm.jpg'
            }
        ])
        const started = await startLibraryServer({
            database: db,
            service: library,
            host: '127.0.0.1',
            port: 0
        })
        try {
            for (let i = 0; i < 2; i++) {
                const response = await fetch(
                    started.url +
                        '/api/v1/covers/jm%3A123?url=https://127.0.0.1/secret'
                )
                expect(response.status).toBe(200)
                expect(response.headers.get('content-type')).toBe('image/png')
                expect(await response.text()).toBe('synthetic-http-cover')
            }
            expect(image).toHaveBeenCalledTimes(1)
            expect(image).toHaveBeenCalledWith(
                'https://cdn.example.test/jm.jpg',
                20 * 1024 * 1024,
                expect.any(AbortSignal)
            )
            expect(connect).not.toHaveBeenCalled()
        } finally {
            await new Promise<void>((resolve) =>
                started.server.close(() => resolve())
            )
            library.closeSources()
        }
    })
    it('serializes concurrent cover writers and reuses the first cached result', async () => {
        const { db, root } = database()
        const image = vi
            .spyOn(HttpMediaClient.prototype, 'fetchImage')
            .mockResolvedValue({
                data: Buffer.from('synthetic-concurrent-cover'),
                contentType: 'image/png'
            })
        const library = new LibraryService(db, root)
        db.importCatalog([
            {
                comicId: 'jm:123',
                providerId: 'jm',
                providerRemoteId: '123',
                title: 'Synthetic',
                author: '',
                categories: [],
                tags: [],
                finished: false,
                coverUrl: 'https://cdn.example.test/jm.jpg'
            }
        ])
        const results = await Promise.all([
            library.cover('jm:123'),
            library.cover('jm:123'),
            library.cover('jm:123')
        ])
        expect(results.map((r) => r.cached)).toEqual([false, true, true])
        expect(image).toHaveBeenCalledTimes(1)
        expect(
            fs
                .readdirSync(path.join(root, 'cover-cache'))
                .some((name) => name.endsWith('.part'))
        ).toBe(false)
        library.closeSources()
    })
    it('rejects an in-flight cover when its account scope changes and does not cache those bytes', async () => {
        const { db, root } = database()
        let session = 'before'
        let entered!: () => void, release!: () => void
        const entering = new Promise<void>((resolve) => {
            entered = resolve
        })
        const delayed = new Promise<void>((resolve) => {
            release = resolve
        })
        const jm = new JmProvider({
            available: false,
            request: vi.fn(),
            close: vi.fn(),
            sessionKey: () => session
        })
        const source = new ProviderService(vi.fn(), db, new EhProvider(), jm)
        const image = vi
            .spyOn(HttpMediaClient.prototype, 'fetchImage')
            .mockImplementationOnce(async () => {
                entered()
                await delayed
                return {
                    data: Buffer.from('old-scope'),
                    contentType: 'image/png'
                }
            })
            .mockResolvedValue({
                data: Buffer.from('new-scope'),
                contentType: 'image/png'
            })
        const library = new LibraryService(db, root)
        vi.spyOn(library, 'providerService').mockReturnValue(source)
        db.importCatalog([
            {
                comicId: 'jm:123',
                providerId: 'jm',
                providerRemoteId: '123',
                title: 'Synthetic',
                author: '',
                categories: [],
                tags: [],
                finished: false,
                coverUrl: 'https://cdn.example.test/jm.jpg'
            }
        ])
        const first = library.cover('jm:123')
        await entering
        session = 'after'
        release()
        await expect(first).rejects.toThrow(/source changed/)
        expect(fs.existsSync(path.join(root, 'cover-cache'))).toBe(false)
        expect((await library.cover('jm:123')).data.toString()).toBe(
            'new-scope'
        )
        expect(image).toHaveBeenCalledTimes(2)
        library.closeSources()
    })
    it('loads a saved JM public cover without Pica login or any JM runtime operation', async () => {
        const { db } = database()
        const connect = vi.fn(async (): Promise<Pica> => {
            throw new Error('No Pica account')
        })
        const request = vi.fn()
        const transport: JmTransport = {
            available: false,
            request,
            close: vi.fn()
        }
        const jm = new JmProvider(
            transport,
            () =>
                new HttpMediaClient({
                    adapter: async (config) => ({
                        config,
                        data: Buffer.from('synthetic-cover'),
                        status: 200,
                        statusText: 'OK',
                        headers: { 'content-type': 'image/png' }
                    })
                })
        )
        const service = new ProviderService(connect, db, new EhProvider(), jm)
        expect(
            (
                await service.fetchCover(
                    'jm:123',
                    'https://cdn.example.test/123.jpg'
                )
            ).data.toString()
        ).toBe('synthetic-cover')
        expect(connect).not.toHaveBeenCalled()
        expect(request).not.toHaveBeenCalled()
        await expect(
            service.fetchCover(
                'raw-pica-id',
                'https://cdn.example.test/pica.jpg'
            )
        ).rejects.toThrow('No Pica account')
        expect(connect).toHaveBeenCalledTimes(1)
    })
    it('keeps E-H covers in the E-H adapter and rejects unknown identities before any request', async () => {
        const { db } = database()
        const connect = vi.fn()
        const eh = new EhProvider()
        const cover = vi.spyOn(eh, 'fetchCover').mockResolvedValue({
            data: Buffer.from('EH'),
            contentType: 'image/jpeg'
        })
        const service = new ProviderService(connect, db, eh)
        await service.fetchCover(
            'eh:123:abc',
            'https://cdn.example.test/eh.jpg',
            123
        )
        expect(cover).toHaveBeenCalledWith(
            'https://cdn.example.test/eh.jpg',
            123
        )
        expect(connect).not.toHaveBeenCalled()
        await expect(
            service.fetchCover('unknown:123', 'https://cdn.example.test/a.jpg')
        ).rejects.toThrow(/Unrecognized/)
        expect(cover).toHaveBeenCalledTimes(1)
    })
    it('reads current proxy configuration for each JM cover instead of retaining initial settings', async () => {
        const seen: unknown[] = []
        const create = vi
            .spyOn(HttpMediaClient.prototype, 'fetchImage')
            .mockImplementation(async () => ({
                data: Buffer.from('fixture'),
                contentType: 'image/jpeg'
            }))
        const jm = new JmProvider({
            available: false,
            request: vi.fn(),
            close: vi.fn()
        })
        // Assert actual Axios request config as well as lazy construction in the dedicated media tests.
        vi.stubEnv('PICA_PROXY', 'socks5://unsupported.invalid')
        await expect(
            jm.fetchCover('https://cdn.example.test/a.jpg')
        ).rejects.toThrow(/HTTP or HTTPS/)
        vi.stubEnv('PICA_PROXY', '')
        seen.push(await jm.fetchCover('https://cdn.example.test/a.jpg'))
        expect(seen).toHaveLength(1)
        expect(create).toHaveBeenCalledTimes(1)
    })
    it('partitions saved JM cover cache by JM session while unrelated Pica changes do not invalidate it', async () => {
        const { db, root } = database()
        let session = 'synthetic-jm-session-one'
        let calls = 0
        const jm = new JmProvider(
            {
                available: false,
                request: vi.fn(),
                close: vi.fn(),
                sessionKey: () => session
            },
            () =>
                new HttpMediaClient({
                    adapter: async (config) => ({
                        config,
                        data: Buffer.from('cover-' + ++calls),
                        status: 200,
                        statusText: 'OK',
                        headers: { 'content-type': 'image/jpeg' }
                    })
                })
        )
        const connect = vi.fn(async (): Promise<Pica> => {
            throw new Error('No Pica account')
        })
        const source = new ProviderService(connect, db, new EhProvider(), jm)
        const library = new LibraryService(db, root)
        vi.spyOn(library, 'providerService').mockReturnValue(source)
        db.importCatalog(
            [
                {
                    comicId: 'jm:123',
                    providerId: 'jm',
                    providerRemoteId: '123',
                    title: 'Synthetic Cover',
                    author: '',
                    categories: [],
                    tags: [],
                    finished: false,
                    coverUrl: 'https://cdn.example.test/jm.jpg'
                }
            ],
            'synthetic-fixture'
        )
        expect((await library.cover('jm:123')).cached).toBe(false)
        vi.stubEnv('PICA_ACCOUNT', 'unrelated-pica-account')
        expect((await library.cover('jm:123')).cached).toBe(true)
        session = 'synthetic-jm-session-two'
        const changed = await library.cover('jm:123')
        expect(changed.cached).toBe(false)
        expect(changed.data.toString()).toBe('cover-2')
        expect(calls).toBe(2)
        expect(connect).not.toHaveBeenCalled()
        const metadata = fs
            .readdirSync(path.join(root, 'cover-cache'))
            .filter((name) => name.endsWith('.json'))
            .map((name) =>
                fs.readFileSync(path.join(root, 'cover-cache', name), 'utf8')
            )
            .join('')
        expect(metadata).not.toMatch(
            /synthetic-jm-session|unrelated-pica-account|cdn.example/
        )
        library.closeSources()
    })
})
