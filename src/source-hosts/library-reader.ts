import { createHash, randomUUID } from 'node:crypto'
import pLimit from 'p-limit'
import { OnlineReaderService, type OnlineReaderState, type OnlineReaderCache } from '../services/online-reader-service'
import type { SourceHostConnections, SourceHostRecord } from './connections'
import { object, sourceHostAbort, sourceHostRequest, SourceHostError, type HostedSource } from './contract'
import { sourceHostGraphql, sourceHostBytes } from './http-body'
import { SUWAYOMI_QUERIES, sourceHostData, suwayomiServer, suwayomiSourceId, suwayomiSourcePage } from './suwayomi'
import { HOST_READER_OPERATIONS, HOST_DISCOVERY_OPERATIONS, hostSearchPage, hostPreparedManga, hostLibraryPage, hostMangaChapters, hostChapter, hostChapterPages, type HostChapter, type HostManga, type HostReaderOperation } from './reader-protocol'
import type { ReadingLibraryRow } from '../library/reading-library'
import { HostedLocalDownloads, type HostedLocalDownloadPorts } from './local-downloads'

type StatePort = OnlineReaderState
interface Book { comicId: string; connectionId: string; principal: string; sourceId: string; remoteId: number; urlDigest: string; title: string }
interface Session { id: string; host: SourceHostRecord; principal: string; scope: 'library-read' | 'source-search-read'; sourceId: string | null; sourceChoices: Map<string, HostedSource>; controller: AbortController; expiresAt: number; timer: ReturnType<typeof setTimeout>; reader: OnlineReaderService; refs: Map<string, Book>; chapters: Map<string, HostChapter[]>; connection: ReturnType<typeof sourceHostRequest>['connection'] }
const BOOKS_KEY = 'host-reader-book-references-v1'
const TTL = 15 * 60 * 1000
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const comicPattern = /^hosted:[0-9a-f-]{36}:[0-9a-f]{64}$/
const episodePattern = /^host-chapter:[0-9a-f]{64}$/
function fields(value: Record<string, unknown>, allowed: string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) throw new SourceHostError('INVALID_SOURCE_HOST') }
function comicId(value: string) { if (!comicPattern.test(value)) throw new SourceHostError('INVALID_SOURCE_HOST'); return value }
function episodeId(value: string) { if (!episodePattern.test(value)) throw new SourceHostError('INVALID_SOURCE_HOST'); return value }
const chapterId = (comic: string, chapter: HostChapter) => 'host-chapter:' + digest(comic + '\n' + chapter.url)

/** Optional host adapter with separate library/selected-source grants, using the SAME shared Reader. */
export class HostedLibraryReader {
    private readonly sessions = new Map<string, Session>()
    private readonly network = pLimit(4)
    private readonly unsubscribe: () => void
    private closed = false
    private cache?: OnlineReaderCache
    private readonly downloads?: HostedLocalDownloads
    constructor(private readonly connections: Pick<SourceHostConnections, 'snapshot' | 'onInvalidate'>, private readonly database: StatePort, private readonly makeCache: () => OnlineReaderCache, private readonly fetcher: typeof fetch = globalThis.fetch, private readonly now = Date.now, local?: HostedLocalDownloadPorts) {
        if (local) this.downloads = new HostedLocalDownloads(local)
        this.unsubscribe = connections.onInvalidate(id => this.revoke(id))
    }
    get localDownloadsAvailable() { return Boolean(this.downloads) }
    get busy() { return this.network.activeCount > 0 || this.network.pendingCount > 0 || Boolean(this.downloads?.busy) }
    close() { this.closed = true; this.unsubscribe(); for (const id of [...this.sessions.keys()]) this.end(id); return this.downloads?.close() ?? Promise.resolve() }
    revoke(connectionId: string) { for (const session of [...this.sessions.values()]) if (session.host.id === connectionId) this.end(session.id) }
    private end(id: string) {
        const session = this.sessions.get(id)
        if (!session) return
        this.downloads?.revoke(id)
        session.controller.abort(); clearTimeout(session.timer); this.sessions.delete(id)
        if (session.connection.auth.mode === 'basic') { session.connection.auth.username = ''; session.connection.auth.password = '' }
    }
    private guard(session: Session) {
        const current = this.connections.snapshot().hosts.find(host => host.id === session.host.id)
        if (this.closed || this.sessions.get(session.id) !== session || this.now() >= session.expiresAt || !current?.enabled || current.revision !== session.host.revision || current.endpoint !== session.host.endpoint) { this.end(session.id); throw new SourceHostError('SOURCE_HOST_CANCELLED') }
        sourceHostAbort(session.controller.signal)
    }
    private session(id: string) { const session = this.sessions.get(id); if (!session) throw new SourceHostError('SOURCE_HOST_CANCELLED'); this.guard(session); return session }
    private async run<T>(session: Session, action: (signal: AbortSignal) => Promise<T>, requestSignal?: AbortSignal) {
        this.guard(session)
        if (this.network.pendingCount >= 32) throw new SourceHostError('SOURCE_HOST_BUSY')
        return this.network(async () => {
            this.guard(session)
            const standard = AbortSignal as typeof AbortSignal & { any(signals: AbortSignal[]): AbortSignal }
            const signal = standard.any([session.controller.signal, AbortSignal.timeout(15000), ...(requestSignal ? [requestSignal] : [])])
            let abort = () => {}
            const cancelled = new Promise<never>((_resolve, reject) => { abort = () => { try { sourceHostAbort(signal) } catch (error) { reject(error) } }; signal.addEventListener('abort', abort, { once: true }) })
            try { sourceHostAbort(signal); const result = await Promise.race([action(signal), cancelled]); sourceHostAbort(signal); this.guard(session); return result }
            finally { signal.removeEventListener('abort', abort) }
        })
    }
    private rpc(session: Session, operation: HostReaderOperation, variables: Record<string, unknown>, signal?: AbortSignal) {
        return this.run(session, abort => sourceHostGraphql(session.connection, HOST_READER_OPERATIONS[operation], variables, abort, this.fetcher), signal)
    }
    private book(session: Session, manga: HostManga): Book {
        const urlDigest = digest(manga.url)
        return { comicId: 'hosted:' + session.host.id + ':' + digest(JSON.stringify([session.principal, manga.sourceId, urlDigest])), connectionId: session.host.id, principal: session.principal, sourceId: manga.sourceId, remoteId: manga.id, urlDigest, title: manga.title }
    }
    private storedBooks(): Book[] {
        const value = this.database.getAppState<unknown>(BOOKS_KEY) ?? []
        if (!Array.isArray(value) || value.length > 500 || value.some(row => !row || typeof row !== 'object' || !comicPattern.test(row.comicId) || typeof row.principal !== 'string' || !/^[0-9a-f]{64}$/.test(row.principal) || !/^[0-9a-f]{64}$/.test(row.urlDigest) || typeof row.sourceId !== 'string' || !Number.isInteger(row.remoteId) || row.remoteId < 1 || row.remoteId > 2147483647 || typeof row.title !== 'string' || row.title.length > 500 || row.comicId !== 'hosted:' + row.connectionId + ':' + digest(JSON.stringify([row.principal, row.sourceId, row.urlDigest])))) throw new SourceHostError('SOURCE_HOST_STORAGE')
        try { for (const row of value) suwayomiSourceId(row.sourceId) } catch { throw new SourceHostError('SOURCE_HOST_STORAGE') }
        return value as Book[]
    }
    private findBook(session: Session, id: string) {
        comicId(id); this.guard(session)
        const book = session.refs.get(id) ?? this.storedBooks().find(row => row.comicId === id && row.connectionId === session.host.id && row.principal === session.principal)
        if (!book || book.principal !== session.principal || book.connectionId !== session.host.id || !this.scopeAllows(session, book)) throw new SourceHostError('SOURCE_HOST_STALE')
        return book
    }
    private scopeAllows(session: Session, book: Book) { return session.scope === 'library-read' || session.sourceId !== null && session.sourceId === book.sourceId }
    private remember(session: Session, mangas: HostManga[]) {
        for (const manga of mangas) { const book = this.book(session, manga); if (session.refs.size >= 128) session.refs.delete(session.refs.keys().next().value!); session.refs.set(book.comicId, book) }
        return mangas.map(manga => { const book = this.book(session, manga); return { comicId: book.comicId, title: book.title, sourceId: book.sourceId } })
    }
    private scopedProgress(session: Session) {
        const books = this.storedBooks().filter(book => book.connectionId === session.host.id && book.principal === session.principal && this.scopeAllows(session, book))
        return session.reader.recentProgress().filter(progress => books.some(book => book.comicId === progress.comicId))
    }
    private history(session: Session) {
        const books = this.storedBooks()
        return this.scopedProgress(session).flatMap(progress => { const book = books.find(book => book.comicId === progress.comicId); return book ? [{ ...progress, title: book.title }] : [] })
    }
    private async ensureComic(session: Session, id: string, signal?: AbortSignal) {
        const expected = this.findBook(session, id), result = hostMangaChapters(await this.rpc(session, 'manga', { id: expected.remoteId }, signal))
        if (result.manga.id !== expected.remoteId || result.manga.sourceId !== expected.sourceId || digest(result.manga.url) !== expected.urlDigest) throw new SourceHostError('SOURCE_HOST_STALE')
        // Persisted search references are not permission to expand an old library-only session.
        if (session.scope === 'library-read' && !result.manga.inLibrary) throw new SourceHostError('SOURCE_HOST_SCOPE_REQUIRED')
        if (!session.chapters.has(id) && session.chapters.size >= 20) session.chapters.delete(session.chapters.keys().next().value!)
        session.chapters.set(id, result.chapters)
        return result
    }
    private chapter(session: Session, comic: string, episode: string) {
        episodeId(episode)
        const chapter = session.chapters.get(comic)?.find(row => chapterId(comic, row) === episode)
        if (!chapter) throw new SourceHostError('SOURCE_HOST_STALE')
        return chapter
    }
    private async pageList(session: Session, comic: string, episode: string, signal?: AbortSignal) {
        const expected = this.chapter(session, comic, episode), fresh = hostChapter(sourceHostData(await this.rpc(session, 'chapter', { id: expected.id }, signal)).chapter)
        if (fresh.mangaId !== expected.mangaId || fresh.url !== expected.url || fresh.id !== expected.id || fresh.sourceOrder !== expected.sourceOrder) throw new SourceHostError('SOURCE_HOST_STALE')
        return hostChapterPages(await this.rpc(session, 'pages', { id: expected.id }, signal), fresh)
    }
    private async bodyPage(session: Session, comic: string, episode: string, index: number, signal?: AbortSignal, expected?: HostChapter) {
        await this.ensureComic(session, comic, signal)
        const chapter = this.chapter(session, comic, episode)
        if (!Number.isSafeInteger(index) || index < 0 || index >= chapter.pageCount || expected &&
            (expected.id !== chapter.id || expected.url !== chapter.url || expected.sourceOrder !== chapter.sourceOrder || expected.mangaId !== chapter.mangaId || expected.pageCount !== chapter.pageCount)) throw new SourceHostError('SOURCE_HOST_STALE')
        const image = await this.run(session, abort => sourceHostBytes(session.connection, `api/v1/manga/${chapter.mangaId}/chapter/${chapter.sourceOrder}/page/${index}`, undefined, abort, 20 * 1024 * 1024, true, this.fetcher), signal)
        const data = image.data, type = image.contentType
        const signature = type === 'image/png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : type === 'image/jpeg' ? data.length >= 4 && data[0] === 255 && data[1] === 216 && data[2] === 255 : type === 'image/gif' ? /^GIF8[79]a$/.test(data.toString('ascii',0,6)) : data.length >= 16 && data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP'
        if (!signature) throw new SourceHostError('SOURCE_HOST_PROTOCOL')
        return image
    }
    /** Already-selected references only. No RPC, credential export, catalogue import or write. */
    readingLibraryRows(id: string): ReadingLibraryRow[] {
        const session = this.session(id), progress = session.reader.recentProgress()
        if (!Array.isArray(progress) || progress.length > 100) throw new SourceHostError('SOURCE_HOST_STORAGE')
        const rows = this.storedBooks()
            .filter(book => book.connectionId === session.host.id && book.principal === session.principal && this.scopeAllows(session, book))
            .map(book => {
                const recent = progress.filter(row => row.comicId === book.comicId)
                    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]
                return {
                    source: { key: 'hosted-source:' + digest(JSON.stringify([book.connectionId, book.principal, book.sourceId])), label: session.host.label + ' · ' + book.sourceId },
                    comicId: book.comicId,
                    title: book.title,
                    channel: 'hosted' as const,
                    available: true,
                    ...(recent ? { progress: { episodeId: recent.episodeId, pageIndex: recent.pageIndex, updatedAt: recent.updatedAt } } : {})
                }
            })
        this.guard(session)
        return rows
    }
    async command(value: unknown, signal: AbortSignal) {
        const input = object(value)
        if (typeof input.action !== 'string') throw new SourceHostError('INVALID_SOURCE_HOST')
        if (input.action === 'start') {
            if (input.scope !== 'library-read' && input.scope !== 'source-search-read') throw new SourceHostError('SOURCE_HOST_READER_CONSENT_REQUIRED')
            const discovery = input.scope === 'source-search-read'
            fields(input, ['action', 'id', 'expectedRevision', 'auth', 'consent', 'scope', 'acceptHostFetchSideEffects', ...(discovery ? ['acceptHostCatalogueSideEffects'] : [])])
            if (input.consent !== true || input.acceptHostFetchSideEffects !== true ||
                discovery && input.acceptHostCatalogueSideEffects !== true) throw new SourceHostError('SOURCE_HOST_READER_CONSENT_REQUIRED')
            if (this.closed) throw new SourceHostError('SOURCE_HOST_CANCELLED')
            if (this.sessions.size >= 3) throw new SourceHostError('SOURCE_HOST_BUSY')
            const host = this.connections.snapshot().hosts.find(row => row.id === input.id)
            if (!host?.enabled) throw new SourceHostError('SOURCE_HOST_DISABLED')
            if (input.expectedRevision !== host.revision) throw new SourceHostError('SOURCE_HOST_STALE')
            const auth = object(input.auth ?? { mode: 'none' })
            if (auth.mode !== host.authMode) throw new SourceHostError('SOURCE_HOST_AUTH_REQUIRED')
            const connection = sourceHostRequest({ kind: host.kind, endpoint: host.endpoint, allowInsecureLan: host.allowInsecureLan, auth, consent: true }).connection
            const id = randomUUID(), principal = digest(host.id + '\n' + auth.mode + '\n' + (connection.auth.mode === 'basic' ? connection.auth.username : ''))
            const session = { id, host, principal, scope: input.scope, sourceId: null, sourceChoices: new Map(), controller: new AbortController(), expiresAt: this.now() + TTL, refs: new Map(), chapters: new Map(), connection } as Session
            this.sessions.set(id, session)
            session.timer = setTimeout(() => this.end(id), TTL); session.timer.unref?.()
            const disconnect = () => this.end(id)
            signal.addEventListener('abort', disconnect, { once: true })
            try {
                sourceHostAbort(signal)
                suwayomiServer(await this.run(session, abort => sourceHostGraphql(connection, SUWAYOMI_QUERIES.info, {}, abort, this.fetcher)))
                const provider = {
                    cacheScope: (comic: string) => { this.findBook(session, comic); return session.id },
                    prepareSource: async (comic: string) => { await this.ensureComic(session, comic) },
                    getEpisodes: async (comic: string) => [...(session.chapters.get(comic) ?? [])].sort((a, b) => a.chapterNumber - b.chapterNumber || b.sourceOrder - a.sourceOrder).map((chapter, i) => ({ id: chapterId(comic, chapter), title: chapter.name, order: i + 1, updated_at: '' })),
                    getEpisodePages: async (comic: string, episode: { id: string }) => {
                        const expected = this.chapter(session, comic, episode.id), pages = await this.pageList(session, comic, episode.id)
                        return pages.paths.map((_route, index) => ({ id: String(index), name: String(index), path: '', fileServer: '', url: JSON.stringify([comic, episode.id, index]), epTitle: expected.name, media: { originalName: '', path: '', fileServer: '' } }))
                    },
                    fetchPage: async (locator: string) => {
                        let row: unknown; try { row = JSON.parse(locator) } catch { throw new SourceHostError('INVALID_SOURCE_HOST') }
                        if (!Array.isArray(row) || row.length !== 3 || typeof row[0] !== 'string' || typeof row[1] !== 'string' || !Number.isSafeInteger(row[2]) || row[2] < 0) throw new SourceHostError('INVALID_SOURCE_HOST')
                        const pageIndex = Number(row[2])
                        return this.bodyPage(session, row[0], row[1], pageIndex)
                    }
                }
                this.cache ??= this.makeCache()
                const root = '/api/v1/desktop/host-reader/' + id
                session.reader = new OnlineReaderService(this.database, provider, this.cache, { comicId, episodeId, progressKey: 'host-reader-progress-v1:' + principal, assertAccess: () => this.guard(session), pageUrl: (comic, episode, index) => `${root}/comics/${encodeURIComponent(comic)}/chapters/${encodeURIComponent(episode)}/pages/${index}` })
                return { sessionId: id, expiresAt: session.expiresAt, scope: session.scope, selectedSource: null,
                    capabilities: { libraryRead: !discovery, providerSearch: discovery, libraryImport: false, extensionInstall: false, downloads: this.localDownloadsAvailable, native: false }, history: this.history(session) }
            } catch (error) { this.end(id); throw error }
            finally { signal.removeEventListener('abort', disconnect) }
        }
        if (['download-chapters', 'download-start', 'downloads', 'download-cancel'].includes(input.action)) {
            fields(input, ['action', 'sessionId', ...(input.action === 'download-chapters' ? ['comicId'] : input.action === 'download-start' ? ['comicId', 'episodeId', 'consent', 'acceptLocalCopy'] : input.action === 'download-cancel' ? ['jobId'] : [])])
            const session = this.session(String(input.sessionId))
            if (!this.downloads) throw new SourceHostError('SOURCE_HOST_UNSUPPORTED')
            return this.withSignal(session, signal, async () => {
                if (input.action === 'downloads') return { jobs: this.downloads!.snapshot(session.id), sessionBound: true }
                if (input.action === 'download-cancel') return this.downloads!.cancel(session.id, String(input.jobId))
                const comic = comicId(String(input.comicId)), book = this.findBook(session, comic)
                if (input.action === 'download-chapters') {
                    await this.command({ action: 'select', sessionId: session.id, comicId: comic }, signal)
                    return { chapters: await session.reader.chapters(comic) }
                }
                if (input.consent !== true || input.acceptLocalCopy !== true) throw new SourceHostError('SOURCE_HOST_DOWNLOAD_CONSENT_REQUIRED')
                const episode = episodeId(String(input.episodeId))
                // Require an actually listed chapter; never accept arbitrary URLs, raw IDs, paths or jobs.
                this.chapter(session, comic, episode)
                return this.downloads!.enqueue({ sessionId: session.id, comicId: comic, episodeId: episode, assertAccess: () => this.guard(session),
                    prepare: async abort => {
                        await this.ensureComic(session, comic, abort)
                        const pages = await this.pageList(session, comic, episode, abort), chapter = pages.chapter
                        if (!chapter.pageCount || chapter.pageCount > 2000 || Math.abs(chapter.chapterNumber) > 1e9) throw new SourceHostError('SOURCE_HOST_TOO_LARGE')
                        return { comicKey: digest(comic), chapterKey: digest(episode), title: book.title, chapterTitle: chapter.name, orderHint: chapter.chapterNumber, pageCount: chapter.pageCount,
                            readPage: async (index, abort) => {
                                const image = await this.bodyPage(session, comic, episode, index, abort, chapter)
                                const extensions: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }
                                const extension = extensions[image.contentType]
                                if (!extension) throw new SourceHostError('SOURCE_HOST_PROTOCOL')
                                return { data: image.data, extension }
                            } }
                    } })
            })
        }
        const allowed = input.action === 'list' || input.action === 'sources' ? ['action', 'sessionId', 'offset'] :
            input.action === 'bind-source' ? ['action', 'sessionId', 'sourceId', 'consent'] : input.action === 'search' ? ['action', 'sessionId', 'query', 'page'] : ['action', 'sessionId', 'comicId']
        fields(input, allowed)
        const session = this.session(String(input.sessionId))
        if (input.action === 'close') { this.end(session.id); return { closed: true } }
        return this.withSignal(session, signal, async () => {
        if (['sources', 'bind-source', 'search'].includes(String(input.action))) {
            if (session.scope !== 'source-search-read') throw new SourceHostError('SOURCE_HOST_SCOPE_REQUIRED')
            if (input.action === 'sources') {
                if (session.sourceId !== null) throw new SourceHostError('SOURCE_HOST_STALE')
                const offset = input.offset ?? 0
                if (!Number.isInteger(offset) || Number(offset) < 0 || Number(offset) > 5000 || Number(offset) % 25) throw new SourceHostError('INVALID_SOURCE_HOST')
                const page = suwayomiSourcePage(await this.run(session, abort => sourceHostGraphql(session.connection, SUWAYOMI_QUERIES.sources, { first: 25, offset }, abort, this.fetcher)), Number(offset))
                this.guard(session); session.sourceChoices = new Map(page.sources.map(source => [source.id, source]))
                return page
            }
            if (input.action === 'bind-source') {
                if (input.consent !== true) throw new SourceHostError('SOURCE_HOST_CONSENT_REQUIRED')
                const sourceId = suwayomiSourceId(input.sourceId), selected = session.sourceChoices.get(sourceId)
                if (session.sourceId !== null || !selected) throw new SourceHostError('SOURCE_HOST_STALE')
                session.sourceId = sourceId; session.sourceChoices.clear()
                return { selectedSource: selected, history: this.history(session) }
            }
            if (session.sourceId === null) throw new SourceHostError('SOURCE_HOST_SOURCE_SELECTION_REQUIRED')
            const query = input.query, page = input.page ?? 1
            if (typeof query !== 'string' || !query.trim() || query.length > 256 || /[\u0000-\u001f\u007f]/.test(query) ||
                !Number.isSafeInteger(page) || Number(page) < 1 || Number(page) > 200) throw new SourceHostError('INVALID_SOURCE_HOST')
            const result = hostSearchPage(await this.run(session, abort => sourceHostGraphql(session.connection, HOST_DISCOVERY_OPERATIONS.search,
                { input: { source: session.sourceId, type: 'SEARCH', page, query: query.trim() } }, abort, this.fetcher)), session.sourceId)
            this.guard(session)
            return { page, query: query.trim(), sourceId: session.sourceId, hasNext: result.hasNext, books: this.remember(session, result.mangas) }
        }
        if (input.action === 'list') {
            if (session.scope !== 'library-read') throw new SourceHostError('SOURCE_HOST_SCOPE_REQUIRED')
            const offset = input.offset ?? 0
            if (!Number.isInteger(offset) || Number(offset) < 0 || Number(offset) > 5000 || Number(offset) % 25) throw new SourceHostError('INVALID_SOURCE_HOST')
            const page = hostLibraryPage(await this.rpc(session, 'library', { offset }))
            return { offset, hasNext: page.hasNext, books: this.remember(session, page.mangas) }
        }
        if (input.action === 'select') {
            const comic = comicId(String(input.comicId)), book = this.findBook(session, comic)
            await this.ensureComic(session, comic); this.guard(session)
            if (session.scope === 'source-search-read') {
                const prepared = hostPreparedManga(await this.run(session, abort => sourceHostGraphql(session.connection, HOST_DISCOVERY_OPERATIONS.prepare,
                    { input: { id: book.remoteId, fetchManga: true, fetchChapters: true } }, abort, this.fetcher)))
                if (prepared.manga.id !== book.remoteId || prepared.manga.sourceId !== book.sourceId || digest(prepared.manga.url) !== book.urlDigest)
                    throw new SourceHostError('SOURCE_HOST_STALE')
                this.guard(session); session.chapters.set(comic, prepared.chapters)
            }
            this.database.setAppState(BOOKS_KEY, [book, ...this.storedBooks().filter(row => row.comicId !== comic)].slice(0, 500))
            return { sessionId: session.id, comicId: comic, title: book.title }
        }
        throw new SourceHostError('INVALID_SOURCE_HOST')
        })
    }
    private async withSignal<T>(session: Session, signal: AbortSignal, action: () => Promise<T>) {
        const abort = () => this.end(session.id)
        signal.addEventListener('abort', abort, { once: true })
        try { sourceHostAbort(signal); this.guard(session); return await action() }
        finally { signal.removeEventListener('abort', abort) }
    }
    async read(id: string, operation: 'chapters' | 'chapter' | 'progress' | 'save-progress', input: { comicId?: string; episodeId?: string; pageIndex?: unknown }, signal: AbortSignal) {
        const session = this.session(id)
        return this.withSignal(session, signal, async () => {
            const reader = session.reader
            if (operation === 'progress') return this.scopedProgress(session)
            const comic = comicId(String(input.comicId))
            this.findBook(session, comic)
            if (operation === 'chapters') return reader.chapters(comic)
            const episode = episodeId(String(input.episodeId))
            if (operation === 'chapter') return reader.chapter(comic, episode)
            if (!Number.isSafeInteger(input.pageIndex) || Number(input.pageIndex) < 0 || Number(input.pageIndex) >= 10000) throw new SourceHostError('INVALID_SOURCE_HOST')
            return reader.saveProgress(comic, episode, Number(input.pageIndex))
        })
    }
    async picture(id: string, comic: string, episode: string, index: number, signal: AbortSignal) {
        const session = this.session(id)
        if (!Number.isSafeInteger(index) || index < 0 || index >= 10000) throw new SourceHostError('INVALID_SOURCE_HOST')
        return this.withSignal(session, signal, () => session.reader.picture(comicId(comic), episodeId(episode), index))
    }
}
