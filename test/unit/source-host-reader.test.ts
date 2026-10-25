import { afterEach, describe, expect, it, vi } from 'vitest'
import { HostedLibraryReader } from '../../src/source-hosts/library-reader'
import { SourceHostConnections } from '../../src/source-hosts/connections'
import { hostMangaChapters, hostChapterPages } from '../../src/source-hosts/reader-protocol'
import { OnlineReaderService } from '../../src/services/online-reader-service'
import type { Episode, Picture } from '../../src/types'

const HOST = '64d223e0-5d29-4320-babb-5a2da654d345', signal = () => new AbortController().signal
const cleanup: Array<() => void> = []
afterEach(() => { for (const close of cleanup.splice(0)) close() })
function fixture() {
    const manga = { id: 1, sourceId: '9007199254740993', url: '/own-comic/one', title: 'Synthetic host book' }
    const chapter = { id: 2, mangaId: 1, url: '/own-comic/chapter-1', name: 'Chapter 1', sourceOrder: 0, pageCount: 2, chapterNumber: 1 }
    let stored: unknown = null, clock = 1000, mode = 'normal', release = () => {}
    const state = new Map<string, unknown>([['online-reader-progress-v1', [{ comicId: 'legacy-comic', pageIndex: 9 }]], ['synthetic-private-canary', { favorite: true, visual: 'OFF' }]])
    const db = { getAppState: <T>(key: string): T | undefined => structuredClone(state.get(key)) as T | undefined, setAppState: vi.fn((key: string, value: unknown) => { state.set(key, structuredClone(value)) }) }
    const connections = new SourceHostConnections({ load: () => stored, save: value => { stored = structuredClone(value) } }, { inspect: async () => { throw Error('Not an inspection request') } }, () => HOST)
    connections.command({ action: 'save', kind: 'suwayomi', label: 'My synthetic host', endpoint: 'https://host.example/base/', authMode: 'none', allowInsecureLan: false, consent: true, scope: 'inspect-only' })
    connections.command({ action: 'set-enabled', id: HOST, expectedRevision: 0, enabled: true, consent: true })
    const calls: Array<{ url: string; operation: string; auth?: string; variables?: unknown }> = []
    const wire = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const value = init?.body ? JSON.parse(String(init.body)) : null, operation = value?.operationName ?? 'IMAGE'
        calls.push({ url: String(url), operation, auth: (init?.headers as Record<string, string>)?.authorization, variables: value?.variables })
        if (mode === 'stall-image' && operation === 'IMAGE') await new Promise<void>(resolve => { release = resolve })
        const data = operation === 'PicaSourceHostInfo' ? { aboutServer: { name: 'Suwayomi-Server', version: '2.4.2366' } } : operation === 'PicaHostLibrary' ? { mangas: { nodes: [manga], pageInfo: { hasNextPage: false } } } : operation === 'PicaHostManga' ? { manga: { ...manga, chapters: { nodes: [chapter] } } } : operation === 'PicaHostChapter' ? { chapter } : operation === 'PicaHostChapterPages' ? { fetchChapterPages: { chapter, pages: [0, 1].map(index => mode === 'bad-route' ? 'https://outside.example/secret' : `/api/v1/manga/1/chapter/0/page/${index}`) } } : null
        if (data) return new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' } })
        const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(16)])
        return new Response(mode === 'bad-image' ? Buffer.from('<html>not an image</html>') : png, { headers: { 'content-type': mode === 'svg' ? 'image/svg+xml' : 'image/png' } })
    })
    const imageCache = new Map<string, { data: Buffer; contentType: string; fingerprint?: string }>()
    const cache = { get: vi.fn((key: string, fingerprint?: string) => { const entry = imageCache.get(key); return entry && entry.fingerprint === fingerprint ? { ...entry, cached: true } : null }), put: vi.fn((key: string, data: Buffer, contentType: string, fingerprint?: string) => { imageCache.set(key, { data, contentType, fingerprint }); return { data, contentType, cached: false } }) }
    const reader = new HostedLibraryReader(connections, db, () => cache, wire, () => clock)
    cleanup.push(() => reader.close())
    const start = async (more: Record<string, unknown> = {}) => await reader.command({ action: 'start', id: HOST, expectedRevision: 1, consent: true, scope: 'library-read', acceptHostFetchSideEffects: true, ...more }, signal()) as { sessionId: string; history: Array<{ comicId: string; pageIndex: number }> }
    const select = async (sessionId: string) => {
        const page = await reader.command({ action: 'list', sessionId, offset: 0 }, signal()) as { books: Array<{ comicId: string }> }
        const comicId = page.books[0].comicId
        await reader.command({ action: 'select', sessionId, comicId }, signal())
        const chapters = await reader.read(sessionId, 'chapters', { comicId }, signal()) as Array<{ id: string }>
        return { comicId, episodeId: chapters[0].id }
    }
    return { reader, connections, db, state, cache, imageCache, wire, calls, manga, chapter, start, select, mode: (value: string) => { mode = value }, release: () => release(), advance: () => { clock += 16 * 60 * 1000 } }
}

describe('actual hosted-library adapter + shared Reader — injected HTTP and state/cache ports only', () => {
    it('projects only explicitly selected references without network/cache/writes; records survive revocation', async () => {
        const f = fixture(), { sessionId } = await f.start()
        await f.reader.command({ action: 'list', sessionId, offset: 0 }, signal())
        const browsedCalls = f.calls.length
        expect(f.reader.readingLibraryRows(sessionId)).toEqual([])
        expect(f.calls).toHaveLength(browsedCalls)
        const ids = await f.select(sessionId)
        await f.reader.read(sessionId, 'save-progress', { ...ids, pageIndex: 1 }, signal())
        const before = JSON.stringify([...f.state]), writes = f.db.setAppState.mock.calls.length, calls = f.calls.length
        const rows = f.reader.readingLibraryRows(sessionId)
        expect(rows).toMatchObject([{ comicId: ids.comicId, channel: 'hosted', available: true, progress: { episodeId: ids.episodeId, pageIndex: 1 } }])
        expect(rows[0].source.key).toMatch(/^hosted-source:[a-f0-9]{64}$/)
        expect(JSON.stringify(rows)).not.toContain('host.example')
        expect(JSON.stringify(rows)).not.toContain('/own-comic/')
        expect(f.calls).toHaveLength(calls); expect(f.cache.get).not.toHaveBeenCalled(); expect(f.db.setAppState).toHaveBeenCalledTimes(writes)
        f.connections.command({ action: 'set-enabled', id: HOST, expectedRevision: 1, enabled: false, consent: true })
        expect(() => f.reader.readingLibraryRows(sessionId)).toThrow('SOURCE_HOST_CANCELLED')
        expect(JSON.stringify([...f.state])).toBe(before)
        expect(f.calls).toHaveLength(calls)
    })
    it('rejects expired or unknown projection scopes without restoring sessions or fetching a host', async () => {
        const f = fixture(), { sessionId } = await f.start()
        await f.select(sessionId)
        const calls = f.calls.length, before = JSON.stringify([...f.state])
        expect(() => f.reader.readingLibraryRows('unknown-session')).toThrow('SOURCE_HOST_CANCELLED')
        f.advance()
        expect(() => f.reader.readingLibraryRows(sessionId)).toThrow('SOURCE_HOST_CANCELLED')
        expect(f.calls).toHaveLength(calls); expect(JSON.stringify([...f.state])).toBe(before)
    })
    it('does not contact hosts or read personal state on construction; inspector consent cannot authorize reading', async () => {
        const f = fixture()
        expect(f.calls).toEqual([]); expect(f.db.setAppState).not.toHaveBeenCalled()
        for (const extra of [{ scope: 'inspect-only' }, { acceptHostFetchSideEffects: false }, { consent: false }, { expectedRevision: 0 }, { endpoint: 'https://unapproved.example' }]) await expect(f.start(extra)).rejects.toThrow()
        expect(f.calls).toEqual([])
    })
    it('browses only the chosen user host library with canonical LongString identity and no local import', async () => {
        const f = fixture(), session = await f.start()
        const page = await f.reader.command({ action: 'list', sessionId: session.sessionId, offset: 0 }, signal()) as { books: Array<{ comicId: string; sourceId: string }> }
        expect(page.books[0].sourceId).toBe('9007199254740993'); expect(page.books[0].comicId).toMatch(/^hosted:/)
        expect(f.calls.every(call => call.url === 'https://host.example/base/api/graphql')).toBe(true)
        expect(f.calls.map(call => call.operation)).toEqual(['PicaSourceHostInfo', 'PicaHostLibrary'])
        expect(f.db.setAppState).not.toHaveBeenCalled()
    })
    it('opens chapters/body pages through the shared Reader, serves only host-scoped raster bytes and reuses its cache', async () => {
        const f = fixture(), { sessionId } = await f.start(), ids = await f.select(sessionId)
        const chapter = await f.reader.read(sessionId, 'chapter', ids, signal()) as { pages: Array<{ url: string }> }
        expect(chapter.pages).toHaveLength(2); expect(chapter.pages[0].url).toContain('/api/v1/desktop/host-reader/' + sessionId)
        await Promise.all([f.reader.picture(sessionId, ids.comicId, ids.episodeId, 0, signal()), f.reader.picture(sessionId, ids.comicId, ids.episodeId, 0, signal())])
        await f.reader.picture(sessionId, ids.comicId, ids.episodeId, 0, signal())
        expect(f.calls.filter(call => call.operation === 'IMAGE')).toHaveLength(1)
        expect(f.calls.find(call => call.operation === 'IMAGE')?.url).toBe('https://host.example/base/api/v1/manga/1/chapter/0/page/0')
        expect(f.cache.put).toHaveBeenCalledTimes(1)
    })
    it('persists source-owned progress and restores it across a fresh session without touching legacy/catalogue/recommendation state', async () => {
        const f = fixture(), legacy = structuredClone(f.state.get('online-reader-progress-v1')), privateState = structuredClone(f.state.get('synthetic-private-canary'))
        const first = await f.start(), ids = await f.select(first.sessionId)
        await f.reader.read(first.sessionId, 'save-progress', { ...ids, pageIndex: 1 }, signal())
        await f.reader.command({ action: 'close', sessionId: first.sessionId }, signal())
        const second = await f.start()
        expect(second.history).toMatchObject([{ comicId: ids.comicId, pageIndex: 1 }])
        await f.reader.command({ action: 'select', sessionId: second.sessionId, comicId: ids.comicId }, signal())
        const chapter = await f.reader.read(second.sessionId, 'chapter', ids, signal()) as { progress?: { pageIndex: number } }
        expect(chapter.progress?.pageIndex).toBe(1)
        expect(f.state.get('online-reader-progress-v1')).toEqual(legacy); expect(f.state.get('synthetic-private-canary')).toEqual(privateState)
        expect(f.db.setAppState.mock.calls.every(([key]) => key.startsWith('host-reader-'))).toBe(true)
    })
    it('revalidates a reset/reused host manga row before serving even an already cached image or progress', async () => {
        const f = fixture(), { sessionId } = await f.start(), ids = await f.select(sessionId)
        await f.reader.picture(sessionId, ids.comicId, ids.episodeId, 0, signal())
        const writes = f.db.setAppState.mock.calls.length
        f.manga.url = '/different-comic/reused-row'
        await expect(f.reader.picture(sessionId, ids.comicId, ids.episodeId, 0, signal())).rejects.toThrow('SOURCE_HOST_STALE')
        await expect(f.reader.read(sessionId, 'save-progress', { ...ids, pageIndex: 1 }, signal())).rejects.toThrow('SOURCE_HOST_STALE')
        expect(f.db.setAppState).toHaveBeenCalledTimes(writes)
    })
    it('rejects foreign chapters, page redirects/URLs, SVG and invalid raster signatures before cache or progress writes', async () => {
        for (const mode of ['bad-route', 'svg', 'bad-image']) {
            const f = fixture(), { sessionId } = await f.start(), ids = await f.select(sessionId)
            f.mode(mode)
            await expect(f.reader.picture(sessionId, ids.comicId, ids.episodeId, 0, signal())).rejects.toThrow('SOURCE_HOST_PROTOCOL')
            expect(f.cache.put).not.toHaveBeenCalled()
        }
        const f = fixture(), { sessionId } = await f.start(), ids = await f.select(sessionId)
        f.chapter.url = '/another-chapter/reused-id'
        await expect(f.reader.read(sessionId, 'chapter', ids, signal())).rejects.toThrow('SOURCE_HOST_STALE')
    })
    it('revoking the connection cancels and fences a truly pending image even with an uncooperative injected fetch', async () => {
        const f = fixture(), { sessionId } = await f.start(), ids = await f.select(sessionId)
        await f.reader.read(sessionId, 'chapter', ids, signal()); f.mode('stall-image')
        const pending = f.reader.picture(sessionId, ids.comicId, ids.episodeId, 0, signal()), outcome = expect(pending).rejects.toThrow('SOURCE_HOST_CANCELLED')
        await vi.waitFor(() => expect(f.calls.some(call => call.operation === 'IMAGE')).toBe(true))
        f.connections.command({ action: 'set-enabled', id: HOST, expectedRevision: 1, enabled: false, consent: true })
        await outcome; f.release(); await Promise.resolve()
        expect(f.cache.put).not.toHaveBeenCalled()
        await expect(f.reader.read(sessionId, 'progress', {}, signal())).rejects.toThrow('SOURCE_HOST_CANCELLED')
    })
    it('request disconnect and session expiry stop access; new inspector/source permissions are not implied', async () => {
        const f = fixture(), { sessionId } = await f.start(), ids = await f.select(sessionId)
        await f.reader.read(sessionId, 'chapter', ids, signal()); f.mode('stall-image')
        const controller = new AbortController(), pending = f.reader.picture(sessionId, ids.comicId, ids.episodeId, 0, controller.signal), outcome = expect(pending).rejects.toThrow('SOURCE_HOST_CANCELLED')
        await vi.waitFor(() => expect(f.calls.some(call => call.operation === 'IMAGE')).toBe(true)); controller.abort(); await outcome; f.release()
        const next = await f.start(); f.advance()
        await expect(f.reader.read(next.sessionId, 'progress', {}, signal())).rejects.toThrow('SOURCE_HOST_CANCELLED')
        expect(f.connections.snapshot().capabilities.reader).toBe(false)
    })
    it('keeps Basic credentials session-only and uses a different principal for a different host username', async () => {
        const f = fixture()
        f.connections.command({ action: 'remove', id: HOST, expectedRevision: 1, consent: true })
        f.connections.command({ action: 'save', kind: 'suwayomi', label: 'My Basic host', endpoint: 'https://host.example/base/', authMode: 'basic', allowInsecureLan: false, consent: true, scope: 'inspect-only' })
        f.connections.command({ action: 'set-enabled', id: HOST, expectedRevision: 0, enabled: true, consent: true })
        const first = await f.start({ auth: { mode: 'basic', username: 'first-user', password: 'synthetic-secret' } }), a = await f.select(first.sessionId)
        const second = await f.start({ auth: { mode: 'basic', username: 'second-user', password: 'different-secret' } }), b = await f.select(second.sessionId)
        expect(a.comicId).not.toBe(b.comicId)
        expect(JSON.stringify([...f.state.values()])).not.toMatch(/first-user|second-user|synthetic-secret|different-secret/)
        expect(f.calls[0].auth).toBe('Basic ' + Buffer.from('first-user:synthetic-secret').toString('base64'))
        await expect(f.reader.read(second.sessionId, 'chapters', a, signal())).rejects.toThrow('SOURCE_HOST_STALE')
    })
    it('rejects invalid pages, pagination, IDs and unknown commands without arbitrary upstream operations', async () => {
        const f = fixture(), { sessionId } = await f.start(), ids = await f.select(sessionId)
        for (const pageIndex of [-1, 0.1, '1', 2]) await expect(f.reader.read(sessionId, 'save-progress', { ...ids, pageIndex }, signal())).rejects.toThrow()
        for (const offset of [-25, 1, 5025, '25']) await expect(f.reader.command({ action: 'list', sessionId, offset }, signal())).rejects.toThrow()
        await expect(f.reader.read(sessionId, 'chapters', { comicId: 'pica-id' }, signal())).rejects.toThrow()
        await expect(f.reader.command({ action: 'install', sessionId, repository: 'https://x.example' }, signal())).rejects.toThrow()
        expect(f.calls.every(call => ['PicaSourceHostInfo', 'PicaHostLibrary', 'PicaHostManga', 'PicaHostChapter', 'PicaHostChapterPages', 'IMAGE'].includes(call.operation))).toBe(true)
    })
    it('validates complete host payloads and rejects partial GraphQL errors or mismatched returned page ownership', () => {
        const f = fixture()
        expect(() => hostMangaChapters({ data: { manga: { ...f.manga, chapters: { nodes: [{ ...f.chapter, mangaId: 99 }] } } } })).toThrow()
        expect(() => hostMangaChapters({ data: { manga: { ...f.manga, chapters: { nodes: [f.chapter] } } }, errors: [{ message: 'remote-private' }] })).toThrow('SOURCE_HOST_PROTOCOL')
        expect(() => hostChapterPages({ data: { fetchChapterPages: { chapter: { ...f.chapter, url: '/foreign' }, pages: [] } } }, f.chapter)).toThrow('SOURCE_HOST_STALE')
    })
    it('preserves the legacy Reader identity/root/key contract and fences changed scopes before cached writes', async () => {
        const data = new Map<string, unknown>(), db = { getAppState: <T>(key: string) => data.get(key) as T | undefined, setAppState: (key: string, value: unknown) => { data.set(key, value) } }
        let scope = 'first', release!: (value: { data: Buffer; contentType: string }) => void
        const cache = { get: () => null, put: vi.fn() }, provider = { cacheScope: () => scope, getEpisodes: async () => [{ id: 'chapter', title: 'old', order: 1, updated_at: '' }] as Episode[], getEpisodePages: async () => [{ url: 'https://legacy.example/p.png' }] as Picture[], fetchPage: async () => await new Promise<{ data: Buffer; contentType: string }>(resolve => { release = resolve }) }
        const reader = new OnlineReaderService(db, provider, cache), chapter = await reader.chapter('legacy', 'chapter')
        expect(chapter.pages[0].url).toBe('/api/v1/online-reader/comics/legacy/chapters/chapter/pages/0')
        await reader.saveProgress('legacy', 'chapter', 0); expect(data.has('online-reader-progress-v1')).toBe(true)
        const pending = reader.picture('legacy', 'chapter', 0), outcome = expect(pending).rejects.toThrow('Reader source session changed')
        await vi.waitFor(() => expect(release).toBeTypeOf('function')); scope = 'changed'; release({ data: Buffer.from('synthetic'), contentType: 'image/png' }); await outcome
        expect(cache.put).not.toHaveBeenCalled()
        await expect(reader.chapters('hosted:' + HOST + ':' + 'a'.repeat(64))).rejects.toThrow('无效的漫画标识')
    })
})
