import { createHash, randomUUID } from 'node:crypto'
import pLimit from 'p-limit'
import { OnlineReaderService, type OnlineReaderState, type OnlineReaderCache } from '../services/online-reader-service'
import type { SourceHostConnections, SourceHostRecord } from './connections'
import { object, sourceHostAbort, sourceHostRequest, SourceHostError } from './contract'
import { sourceHostGraphql, sourceHostBytes } from './http-body'
import { SUWAYOMI_QUERIES, sourceHostData, suwayomiServer, suwayomiSourceId } from './suwayomi'
import { HOST_READER_OPERATIONS, hostLibraryPage, hostMangaChapters, hostChapter, hostChapterPages, type HostChapter, type HostManga, type HostReaderOperation } from './reader-protocol'

type StatePort = OnlineReaderState
interface Book { comicId: string; connectionId: string; principal: string; sourceId: string; remoteId: number; urlDigest: string; title: string }
interface Session { id: string; host: SourceHostRecord; principal: string; controller: AbortController; expiresAt: number; timer: ReturnType<typeof setTimeout>; reader: OnlineReaderService; refs: Map<string, Book>; chapters: Map<string, HostChapter[]>; connection: ReturnType<typeof sourceHostRequest>['connection'] }
const BOOKS_KEY = 'host-reader-book-references-v1'
const TTL = 15 * 60 * 1000
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const comicPattern = /^hosted:[0-9a-f-]{36}:[0-9a-f]{64}$/
const episodePattern = /^host-chapter:[0-9a-f]{64}$/
function fields(value: Record<string, unknown>, allowed: string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) throw new SourceHostError('INVALID_SOURCE_HOST') }
function comicId(value: string) { if (!comicPattern.test(value)) throw new SourceHostError('INVALID_SOURCE_HOST'); return value }
function episodeId(value: string) { if (!episodePattern.test(value)) throw new SourceHostError('INVALID_SOURCE_HOST'); return value }
const chapterId = (comic: string, chapter: HostChapter) => 'host-chapter:' + digest(comic + '\n' + chapter.url)

/** Optional user-host library adapter. Uses the actual shared Reader, not a parallel Reader engine. */
export class HostedLibraryReader {
    private readonly sessions = new Map<string, Session>()
    private readonly network = pLimit(4)
    private readonly unsubscribe: () => void
    private closed = false
    private cache?: OnlineReaderCache
    constructor(private readonly connections: Pick<SourceHostConnections, 'snapshot' | 'onInvalidate'>, private readonly database: StatePort, private readonly makeCache: () => OnlineReaderCache, private readonly fetcher: typeof fetch = globalThis.fetch, private readonly now = Date.now) {
        this.unsubscribe = connections.onInvalidate(id => this.revoke(id))
    }
    get busy() { return this.network.activeCount > 0 || this.network.pendingCount > 0 }
    close() { this.closed = true; this.unsubscribe(); for (const id of [...this.sessions.keys()]) this.end(id) }
    revoke(connectionId: string) { for (const session of [...this.sessions.values()]) if (session.host.id === connectionId) this.end(session.id) }
    private end(id: string) {
        const session = this.sessions.get(id)
        if (!session) return
        session.controller.abort(); clearTimeout(session.timer); this.sessions.delete(id)
        if (session.connection.auth.mode === 'basic') { session.connection.auth.username = ''; session.connection.auth.password = '' }
    }
    private guard(session: Session) {
        const current = this.connections.snapshot().hosts.find(host => host.id === session.host.id)
        if (this.closed || this.sessions.get(session.id) !== session || this.now() >= session.expiresAt || !current?.enabled || current.revision !== session.host.revision || current.endpoint !== session.host.endpoint) { this.end(session.id); throw new SourceHostError('SOURCE_HOST_CANCELLED') }
        sourceHostAbort(session.controller.signal)
    }
    private session(id: string) { const session = this.sessions.get(id); if (!session) throw new SourceHostError('SOURCE_HOST_CANCELLED'); this.guard(session); return session }
    private async run<T>(session: Session, action: (signal: AbortSignal) => Promise<T>) {
        this.guard(session)
        if (this.network.pendingCount >= 32) throw new SourceHostError('SOURCE_HOST_BUSY')
        return this.network(async () => {
            this.guard(session)
            const standard = AbortSignal as typeof AbortSignal & { any(signals: AbortSignal[]): AbortSignal }
            const signal = standard.any([session.controller.signal, AbortSignal.timeout(15000)])
            let abort = () => {}
            const cancelled = new Promise<never>((_resolve, reject) => { abort = () => { try { sourceHostAbort(signal) } catch (error) { reject(error) } }; signal.addEventListener('abort', abort, { once: true }) })
            try { sourceHostAbort(signal); const result = await Promise.race([action(signal), cancelled]); sourceHostAbort(signal); this.guard(session); return result }
            finally { signal.removeEventListener('abort', abort) }
        })
    }
    private rpc(session: Session, operation: HostReaderOperation, variables: Record<string, unknown>) {
        return this.run(session, signal => sourceHostGraphql(session.connection, HOST_READER_OPERATIONS[operation], variables, signal, this.fetcher))
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
        if (!book || book.principal !== session.principal || book.connectionId !== session.host.id) throw new SourceHostError('SOURCE_HOST_STALE')
        return book
    }
    private async ensureComic(session: Session, id: string) {
        const expected = this.findBook(session, id), result = hostMangaChapters(await this.rpc(session, 'manga', { id: expected.remoteId }))
        if (result.manga.id !== expected.remoteId || result.manga.sourceId !== expected.sourceId || digest(result.manga.url) !== expected.urlDigest) throw new SourceHostError('SOURCE_HOST_STALE')
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
    async command(value: unknown, signal: AbortSignal) {
        const input = object(value)
        if (input.action === 'start') {
            fields(input, ['action', 'id', 'expectedRevision', 'auth', 'consent', 'scope', 'acceptHostFetchSideEffects'])
            if (input.consent !== true || input.scope !== 'library-read' || input.acceptHostFetchSideEffects !== true) throw new SourceHostError('SOURCE_HOST_READER_CONSENT_REQUIRED')
            if (this.closed) throw new SourceHostError('SOURCE_HOST_CANCELLED')
            if (this.sessions.size >= 3) throw new SourceHostError('SOURCE_HOST_BUSY')
            const host = this.connections.snapshot().hosts.find(row => row.id === input.id)
            if (!host?.enabled) throw new SourceHostError('SOURCE_HOST_DISABLED')
            if (input.expectedRevision !== host.revision) throw new SourceHostError('SOURCE_HOST_STALE')
            const auth = object(input.auth ?? { mode: 'none' })
            if (auth.mode !== host.authMode) throw new SourceHostError('SOURCE_HOST_AUTH_REQUIRED')
            const connection = sourceHostRequest({ kind: host.kind, endpoint: host.endpoint, allowInsecureLan: host.allowInsecureLan, auth, consent: true }).connection
            const id = randomUUID(), principal = digest(host.id + '\n' + auth.mode + '\n' + (connection.auth.mode === 'basic' ? connection.auth.username : ''))
            const session = { id, host, principal, controller: new AbortController(), expiresAt: this.now() + TTL, refs: new Map(), chapters: new Map(), connection } as Session
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
                        const expected = this.chapter(session, comic, episode.id), fresh = hostChapter(sourceHostData(await this.rpc(session, 'chapter', { id: expected.id })).chapter)
                        if (fresh.mangaId !== expected.mangaId || fresh.url !== expected.url || fresh.id !== expected.id || fresh.sourceOrder !== expected.sourceOrder) throw new SourceHostError('SOURCE_HOST_STALE')
                        const pages = hostChapterPages(await this.rpc(session, 'pages', { id: expected.id }), fresh)
                        return pages.paths.map((_route, index) => ({ id: String(index), name: String(index), path: '', fileServer: '', url: JSON.stringify([comic, episode.id, index]), epTitle: expected.name, media: { originalName: '', path: '', fileServer: '' } }))
                    },
                    fetchPage: async (locator: string) => {
                        let row: unknown; try { row = JSON.parse(locator) } catch { throw new SourceHostError('INVALID_SOURCE_HOST') }
                        if (!Array.isArray(row) || row.length !== 3 || typeof row[0] !== 'string' || typeof row[1] !== 'string' || !Number.isSafeInteger(row[2]) || row[2] < 0) throw new SourceHostError('INVALID_SOURCE_HOST')
                        const pageIndex = Number(row[2])
                        await this.ensureComic(session, row[0])
                        const chapter = this.chapter(session, row[0], row[1])
                        if (pageIndex >= chapter.pageCount) throw new SourceHostError('SOURCE_HOST_STALE')
                        const image = await this.run(session, abort => sourceHostBytes(connection, `api/v1/manga/${chapter.mangaId}/chapter/${chapter.sourceOrder}/page/${pageIndex}`, undefined, abort, 20 * 1024 * 1024, true, this.fetcher))
                        const data = image.data, type = image.contentType
                        const signature = type === 'image/png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : type === 'image/jpeg' ? data.length >= 4 && data[0] === 255 && data[1] === 216 && data[2] === 255 : type === 'image/gif' ? /^GIF8[79]a$/.test(data.toString('ascii',0,6)) : data.length >= 16 && data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP'
                        if (!signature) throw new SourceHostError('SOURCE_HOST_PROTOCOL')
                        return image
                    }
                }
                this.cache ??= this.makeCache()
                const root = '/api/v1/desktop/host-reader/' + id
                session.reader = new OnlineReaderService(this.database, provider, this.cache, { comicId, episodeId, progressKey: 'host-reader-progress-v1:' + principal, assertAccess: () => this.guard(session), pageUrl: (comic, episode, index) => `${root}/comics/${encodeURIComponent(comic)}/chapters/${encodeURIComponent(episode)}/pages/${index}` })
                return { sessionId: id, expiresAt: session.expiresAt, capabilities: { libraryRead: true, providerSearch: false, libraryImport: false, extensionInstall: false }, history: session.reader.recentProgress().flatMap(progress => { const book = this.storedBooks().find(book => book.comicId === progress.comicId && book.principal === principal); return book ? [{ ...progress, title: book.title }] : [] }) }
            } catch (error) { this.end(id); throw error }
            finally { signal.removeEventListener('abort', disconnect) }
        }
        fields(input, input.action === 'list' ? ['action', 'sessionId', 'offset'] : ['action', 'sessionId', 'comicId'])
        const session = this.session(String(input.sessionId))
        if (input.action === 'close') { this.end(session.id); return { closed: true } }
        return this.withSignal(session, signal, async () => {
        if (input.action === 'list') {
            const offset = input.offset ?? 0
            if (!Number.isInteger(offset) || Number(offset) < 0 || Number(offset) > 5000 || Number(offset) % 25) throw new SourceHostError('INVALID_SOURCE_HOST')
            const page = hostLibraryPage(await this.rpc(session, 'library', { offset }))
            for (const manga of page.mangas) { const book = this.book(session, manga); if (session.refs.size >= 128) session.refs.delete(session.refs.keys().next().value!); session.refs.set(book.comicId, book) }
            return { offset, hasNext: page.hasNext, books: page.mangas.map(manga => { const book = this.book(session, manga); return { comicId: book.comicId, title: book.title, sourceId: book.sourceId } }) }
        }
        if (input.action === 'select') {
            const comic = comicId(String(input.comicId)), book = this.findBook(session, comic)
            await this.ensureComic(session, comic); this.guard(session)
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
            if (operation === 'progress') return reader.recentProgress()
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
