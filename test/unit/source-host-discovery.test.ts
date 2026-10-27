import fs from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceHostConnections } from '../../src/source-hosts/connections'
import { HostedLibraryReader } from '../../src/source-hosts/library-reader'
import { HOST_DISCOVERY_OPERATIONS, hostSearchPage, hostPreparedManga } from '../../src/source-hosts/reader-protocol'

const HOST = '64d223e0-5d29-4320-babb-5a2da654d345', SOURCE = '9007199254740993', OTHER = '-9223372036854775808'
const signal = () => new AbortController().signal, cleanups: Array<() => void> = []
afterEach(() => { for (const close of cleanups.splice(0)) close(); vi.restoreAllMocks() })
function fixture() {
    let saved: unknown = null, mode = '', release = () => {}, clock = 1000
    const state = new Map<string, unknown>([['protected-catalogue-events-tags-visual', { untouched: true }]])
    const db = { getAppState: <T>(key: string) => structuredClone(state.get(key)) as T | undefined,
        setAppState: vi.fn((key: string, value: unknown) => { state.set(key, structuredClone(value)) }) }
    const connections = new SourceHostConnections({ load: () => saved, save: value => { saved = structuredClone(value) } },
        { inspect: async () => { throw Error('Inspector must remain separate') } }, () => HOST)
    connections.command({ action: 'save', kind: 'suwayomi', label: 'My host', endpoint: 'https://user-host.invalid/base/',
        authMode: 'none', allowInsecureLan: false, consent: true, scope: 'inspect-only' })
    connections.command({ action: 'set-enabled', id: HOST, expectedRevision: 0, enabled: true, consent: true })
    const books = [SOURCE, OTHER].map((sourceId, index) => ({ id: index + 1, sourceId, url: '/same-remote-path', title: 'User source ' + index, inLibrary: false }))
    const chapter = (id: number) => ({ id: id + 10, mangaId: id, url: '/same-remote-path/chapter', name: 'One', sourceOrder: 0, pageCount: 1, chapterNumber: 1 })
    const calls: Array<{ operation: string; query: string; variables: any; url: string }> = []
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const input = init?.body ? JSON.parse(String(init.body)) : { operationName: 'IMAGE', variables: {} }
        calls.push({ operation: input.operationName, query: input.query, variables: input.variables, url: String(url) })
        if (input.operationName === 'PicaHostSourceSearch' && mode === 'stall-search') await new Promise<void>(resolve => { release = resolve })
        const id = Number(input.variables?.id ?? input.variables?.input?.id ?? 1), book = books.find(book => book.id === id)!
        let data: unknown
        if (input.operationName === 'PicaSourceHostInfo') data = { aboutServer: { name: 'Suwayomi-Server', version: '2.4.2366' } }
        else if (input.operationName === 'PicaSourceHostSources') data = { sources: { nodes: [SOURCE, OTHER].map(id => ({ id, name: '<inert source>', lang: 'zh', supportsLatest: true })), pageInfo: { hasNextPage: false, hasPreviousPage: false }, totalCount: 2 } }
        else if (input.operationName === 'PicaHostSourceSearch') data = { fetchSourceManga: { mangas: [books.find(book => book.sourceId === (mode === 'wrong-source' ? OTHER : input.variables.input.source))], hasNextPage: true } }
        else if (input.operationName === 'PicaHostPrepareManga') data = { fetchMangaAndChapters: { manga: mode === 'changed-prepare' ? { ...book, url: '/replaced-row' } : book, chapters: [chapter(id)] } }
        else if (input.operationName === 'PicaHostManga') data = { manga: { ...book, chapters: { nodes: [chapter(id)] } } }
        else if (input.operationName === 'PicaHostLibrary') data = { mangas: { nodes: books.filter(book => book.inLibrary), pageInfo: { hasNextPage: false } } }
        else if (input.operationName === 'PicaHostChapter') data = { chapter: chapter(Number(input.variables.id) - 10) }
        else if (input.operationName === 'PicaHostChapterPages') {
            const row = chapter(Number(input.variables.id) - 10)
            data = { fetchChapterPages: { chapter: row, pages: [`/api/v1/manga/${row.mangaId}/chapter/0/page/0`] } }
        } else if (input.operationName === 'IMAGE') return new Response(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(16)]), { headers: { 'content-type': 'image/png' } })
        else throw Error('Unexpected synthetic operation')
        return new Response(JSON.stringify({ data, ...(mode === 'partial-search' && input.operationName === 'PicaHostSourceSearch' ? { errors: [{ message: 'remote-secret-not-public' }] } : {}) }), { headers: { 'content-type': 'application/json' } })
    })
    const images = new Map<string, any>(), cache = { get: vi.fn((key: string) => images.get(key) ?? null), put: vi.fn((key: string, data: Buffer, contentType: string, fingerprint?: string) => { const value = { data, contentType, fingerprint, cached: false }; images.set(key, value); return value }) }
    const reader = new HostedLibraryReader(connections, db, () => cache, fetcher, () => clock)
    cleanups.push(() => reader.close())
    const command = (input: Record<string, unknown>) => reader.command(input, signal()) as Promise<any>
    const start = (extra: Record<string, unknown> = {}) => {
        const input: Record<string, unknown> = { action: 'start', id: HOST, expectedRevision: 1, consent: true,
            scope: 'source-search-read', acceptHostFetchSideEffects: true, acceptHostCatalogueSideEffects: true, ...extra }
        if (input.acceptHostCatalogueSideEffects === undefined) delete input.acceptHostCatalogueSideEffects
        return command(input)
    }
    const bind = async (sessionId: string, sourceId = SOURCE) => {
        await command({ action: 'sources', sessionId, offset: 0 })
        return command({ action: 'bind-source', sessionId, sourceId, consent: true })
    }
    const search = (sessionId: string, extra: Record<string, unknown> = {}) => command({ action: 'search', sessionId, query: 'test', page: 1, ...extra })
    const choose = async (sessionId: string, sourceId = SOURCE) => {
        await bind(sessionId, sourceId); const page = await search(sessionId), comicId = page.books[0].comicId
        await command({ action: 'select', sessionId, comicId })
        const chapters = await reader.read(sessionId, 'chapters', { comicId }, signal()) as Array<{ id: string }>
        return { comicId, episodeId: chapters[0].id }
    }
    return { reader, connections, db, state, cache, books, calls, fetcher, command, start, bind, search, choose,
        mode: (value: string) => { mode = value }, release: () => release(), expire: () => { clock += 16 * 60 * 1000 } }
}

describe('explicit user-host single-source search and existing Reader, inert HTTP/state/cache ports', () => {
    it('does nothing at construction and requires separate catalogue-side-effect consent before any RPC', async () => {
        const f = fixture()
        expect(f.calls).toEqual([]); expect(f.db.setAppState).not.toHaveBeenCalled()
        for (const extra of [{ consent: false }, { acceptHostCatalogueSideEffects: false }, { acceptHostFetchSideEffects: false }, { scope: 'browse-all' }])
            await expect(f.start(extra)).rejects.toThrow('SOURCE_HOST_READER_CONSENT_REQUIRED')
        expect(f.calls).toEqual([])
        const started = await f.start()
        expect(started.capabilities).toMatchObject({ providerSearch: true, libraryRead: false, downloads: false, native: false, libraryImport: false, extensionInstall: false })
        expect(f.calls.map(row => row.operation)).toEqual(['PicaSourceHostInfo'])
        expect(f.db.setAppState).not.toHaveBeenCalled()
    })
    it('cannot search until an actually listed source is explicitly bound once, preserving exact LongString', async () => {
        const f = fixture(), { sessionId } = await f.start()
        await expect(f.search(sessionId)).rejects.toThrow('SOURCE_HOST_SOURCE_SELECTION_REQUIRED')
        await expect(f.command({ action: 'bind-source', sessionId, sourceId: SOURCE, consent: true })).rejects.toThrow('SOURCE_HOST_STALE')
        await f.command({ action: 'sources', sessionId, offset: 0 })
        await expect(f.command({ action: 'bind-source', sessionId, sourceId: Number(SOURCE), consent: true })).rejects.toThrow('SOURCE_HOST_PROTOCOL')
        await expect(f.command({ action: 'bind-source', sessionId, sourceId: SOURCE, consent: false })).rejects.toThrow('SOURCE_HOST_CONSENT_REQUIRED')
        await f.command({ action: 'bind-source', sessionId, sourceId: SOURCE, consent: true })
        await expect(f.command({ action: 'bind-source', sessionId, sourceId: OTHER, consent: true })).rejects.toThrow('SOURCE_HOST_STALE')
        await f.search(sessionId, { query: '  sample  ', page: 2 })
        expect(f.calls.at(-1)?.variables).toEqual({ input: { source: SOURCE, type: 'SEARCH', page: 2, query: 'sample' } })
        expect(f.db.setAppState).not.toHaveBeenCalled()
    })
    it('library-only authority cannot list/bind/search sources or fetch unowned search references', async () => {
        const f = fixture(), { sessionId } = await f.start({ scope: 'library-read', acceptHostCatalogueSideEffects: undefined })
        for (const input of [{ action: 'sources', offset: 0 }, { action: 'bind-source', sourceId: SOURCE, consent: true }, { action: 'search', query: 'test', page: 1 }])
            await expect(f.command({ ...input, sessionId })).rejects.toThrow('SOURCE_HOST_SCOPE_REQUIRED')
        expect(f.calls.map(row => row.operation)).toEqual(['PicaSourceHostInfo'])
    })
    it('search/read/chapters/pages use the unchanged shared Reader without local catalogue/favorite imports', async () => {
        const f = fixture(), { sessionId } = await f.start(), ids = await f.choose(sessionId)
        const chapter = await f.reader.read(sessionId, 'chapter', ids, signal()) as { pages: Array<{ url: string }> }
        expect(chapter.pages[0].url).toContain('/api/v1/desktop/host-reader/' + sessionId)
        await f.reader.picture(sessionId, ids.comicId, ids.episodeId, 0, signal())
        await f.reader.read(sessionId, 'save-progress', { ...ids, pageIndex: 0 }, signal())
        expect(f.calls.find(row => row.operation === 'PicaHostPrepareManga')?.variables).toEqual({ input: { id: 1, fetchManga: true, fetchChapters: true } })
        expect(f.calls.every(row => row.url.startsWith('https://user-host.invalid/base/'))).toBe(true)
        expect(f.calls.some(row => /updateManga|install|enqueue|setSource/i.test(row.query ?? ''))).toBe(false)
        expect(f.state.get('protected-catalogue-events-tags-visual')).toEqual({ untouched: true })
        expect(f.db.setAppState.mock.calls.every(([key]) => key === 'host-reader-book-references-v1' || key.startsWith('host-reader-progress-v1:'))).toBe(true)
        expect(JSON.stringify([...f.state])).not.toContain('user-host.invalid')
    })
    it('selected-source scope fences other source IDs, stored books, progress and same-URL identities', async () => {
        const f = fixture(), a = await f.start(), aIds = await f.choose(a.sessionId)
        await f.reader.read(a.sessionId, 'save-progress', { ...aIds, pageIndex: 0 }, signal())
        const b = await f.start(), bIds = await f.choose(b.sessionId, OTHER)
        await f.reader.read(b.sessionId, 'save-progress', { ...bIds, pageIndex: 0 }, signal())
        expect(aIds.comicId).not.toBe(bIds.comicId)
        await expect(f.reader.read(a.sessionId, 'chapters', bIds, signal())).rejects.toThrow('SOURCE_HOST_STALE')
        await expect(f.command({ action: 'select', sessionId: a.sessionId, comicId: bIds.comicId })).rejects.toThrow('SOURCE_HOST_STALE')
        expect(await f.reader.read(a.sessionId, 'progress', {}, signal())).toMatchObject([{ comicId: aIds.comicId }])
        expect(f.reader.readingLibraryRows(b.sessionId).map(row => row.comicId)).toEqual([bIds.comicId])
    })
    it('saved search progress resumes only after new explicit source binding, without redoing recommendation state', async () => {
        const f = fixture(), first = await f.start(), ids = await f.choose(first.sessionId)
        await f.reader.read(first.sessionId, 'save-progress', { ...ids, pageIndex: 0 }, signal())
        await f.command({ action: 'close', sessionId: first.sessionId })
        const next = await f.start()
        expect(next.history).toEqual([]); expect(f.reader.readingLibraryRows(next.sessionId)).toEqual([])
        const bound = await f.bind(next.sessionId)
        expect(bound.history).toMatchObject([{ comicId: ids.comicId, pageIndex: 0 }])
        await f.command({ action: 'select', sessionId: next.sessionId, comicId: ids.comicId })
        expect((await f.reader.read(next.sessionId, 'chapter', ids, signal()) as any).progress.pageIndex).toBe(0)
    })
    it.each(['wrong-source', 'partial-search'])('rejects %s result before references/local state/prepare mutations', async mode => {
        const f = fixture(), { sessionId } = await f.start(); await f.bind(sessionId); f.mode(mode)
        await expect(f.search(sessionId)).rejects.toThrow('SOURCE_HOST_PROTOCOL')
        expect(f.db.setAppState).not.toHaveBeenCalled(); expect(f.calls.some(row => row.operation === 'PicaHostPrepareManga')).toBe(false)
    })
    it('revalidates a reused remote row before any explicit metadata fetch, and rejects changed prepare results', async () => {
        const f = fixture(), { sessionId } = await f.start(); await f.bind(sessionId)
        const page = await f.search(sessionId), comicId = page.books[0].comicId
        f.books[0].url = '/replaced-row'
        await expect(f.command({ action: 'select', sessionId, comicId })).rejects.toThrow('SOURCE_HOST_STALE')
        expect(f.calls.some(row => row.operation === 'PicaHostPrepareManga')).toBe(false)
        f.books[0].url = '/same-remote-path'; f.mode('changed-prepare')
        await expect(f.command({ action: 'select', sessionId, comicId })).rejects.toThrow('SOURCE_HOST_STALE')
        expect(f.db.setAppState).not.toHaveBeenCalled()
    })
    it('a library session cannot use persisted search refs or cached body bytes after library removal', async () => {
        const f = fixture(), searchSession = await f.start(), ids = await f.choose(searchSession.sessionId)
        const library = await f.start({ scope: 'library-read', acceptHostCatalogueSideEffects: undefined })
        await expect(f.command({ action: 'select', sessionId: library.sessionId, comicId: ids.comicId })).rejects.toThrow('SOURCE_HOST_SCOPE_REQUIRED')
        f.books[0].inLibrary = true
        await f.command({ action: 'select', sessionId: library.sessionId, comicId: ids.comicId })
        await f.reader.picture(library.sessionId, ids.comicId, ids.episodeId, 0, signal())
        const puts = f.cache.put.mock.calls.length; f.books[0].inLibrary = false
        await expect(f.reader.picture(library.sessionId, ids.comicId, ids.episodeId, 0, signal())).rejects.toThrow('SOURCE_HOST_SCOPE_REQUIRED')
        expect(f.cache.put).toHaveBeenCalledTimes(puts)
    })
    it('revocation cancels uncooperative pending searches and cannot publish late refs or clear personal state', async () => {
        const f = fixture(), { sessionId } = await f.start(); await f.bind(sessionId); f.mode('stall-search')
        const before = JSON.stringify([...f.state]), pending = f.search(sessionId), outcome = expect(pending).rejects.toThrow('SOURCE_HOST_CANCELLED')
        await vi.waitFor(() => expect(f.calls.some(row => row.operation === 'PicaHostSourceSearch')).toBe(true))
        f.connections.command({ action: 'set-enabled', id: HOST, expectedRevision: 1, enabled: false, consent: true })
        await outcome; f.release(); await Promise.resolve()
        expect(JSON.stringify([...f.state])).toBe(before); expect(f.db.setAppState).not.toHaveBeenCalled()
    })
    it('expiration and invalid/extra search fields reject without arbitrary GraphQL/URL/extension actions', async () => {
        const f = fixture(), { sessionId } = await f.start(); await f.bind(sessionId)
        const calls = f.calls.length
        for (const extra of [{ query: '' }, { query: 'a'.repeat(257) }, { query: 'a\n' }, { page: 0 }, { page: 201 }, { page: '2' }, { sourceId: OTHER }, { operation: 'installExtension' }, { url: 'https://foreign.invalid/' }])
            await expect(f.search(sessionId, extra)).rejects.toThrow()
        expect(f.calls).toHaveLength(calls)
        await expect(f.command({ action: ['search'], sessionId })).rejects.toThrow('INVALID_SOURCE_HOST')
        f.expire(); await expect(f.search(sessionId)).rejects.toThrow('SOURCE_HOST_CANCELLED')
    })
    it('binds only the reviewed fixed protocol to pinned official source facts, not a copied extension engine', () => {
        const authority = JSON.parse(fs.readFileSync('test/fixtures/source-host-discovery-authority.json', 'utf8'))
        expect(authority.commit).toBe('40bc5da57820324ed0ae724cbbc020cc4673b594')
        expect(authority.implementationCopied).toBe(false)
        expect(Object.keys(HOST_DISCOVERY_OPERATIONS)).toEqual(['search', 'prepare'])
        expect(HOST_DISCOVERY_OPERATIONS.search.query).toContain('FetchSourceMangaInput!')
        expect(HOST_DISCOVERY_OPERATIONS.prepare.query).toContain('FetchMangaAndChaptersInput!')
        expect(() => hostSearchPage({ data: { fetchSourceManga: { mangas: [], hasNextPage: 'yes' } } }, SOURCE)).toThrow()
        expect(() => hostPreparedManga({ data: { fetchMangaAndChapters: {} }, errors: [{ message: 'private' }] })).toThrow('SOURCE_HOST_PROTOCOL')
    })
    it('bounds complete metadata/search/chapter payloads and requires the actual inLibrary fact', () => {
        const f = fixture(), row = { ...f.books[0] }
        for (const mangas of [Array(101).fill(row), [row, row], [{ ...row, inLibrary: undefined }], [{ ...row, sourceId: OTHER }]])
            expect(() => hostSearchPage({ data: { fetchSourceManga: { mangas, hasNextPage: false } } }, SOURCE)).toThrow('SOURCE_HOST_PROTOCOL')
        expect(() => hostPreparedManga({ data: { fetchMangaAndChapters: { manga: row, chapters: Array(2001).fill({}) } } })).toThrow('SOURCE_HOST_TOO_LARGE')
    })
})
