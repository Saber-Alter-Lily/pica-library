import { randomUUID } from 'node:crypto'
import { SignedReaderInputError } from '../source-extensions/signed-reader-errors'
import type {
    OnlineReaderCache, OnlineReaderState, OnlineReaderContract
} from '../services/online-reader-service'
import { OnlineReaderService } from '../services/online-reader-service'
import { bindExternalReader } from '../source-extensions/desktop-reader-adapter'
import type { TrustedSourceProcess } from '../source-extensions/trusted-process'
import { SignedWorkerStore } from '../source-extensions/signed-worker-store'

interface SignedSession {
    id: string
    sourceId: string
    revision: number
    worker: TrustedSourceProcess
    reader: OnlineReaderService
}

const UUID = /^[0-9a-f-]{36}$/
const MAX_SESSIONS = 4
const READER_ROOT = '/api/v1/desktop/signed-reader'

export { SignedReaderInputError } from '../source-extensions/signed-reader-errors'

function exact(input: unknown, keys: string[]): input is Record<string, unknown> {
    return input !== null && typeof input === 'object' && !Array.isArray(input) &&
        Object.keys(input).sort().join(',') === [...keys].sort().join(',')
}
function field(value: unknown): string {
    if (typeof value !== 'string' || value.length > 150 || !value)
        throw new SignedReaderInputError()
    return value
}
function revision(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0)
        throw new SignedReaderInputError()
    return Number(value)
}

/**
 * A trusted, optional Desktop composition port. This is deliberately not
 * installed by default in desktop/main.ts: the formal application must first
 * have an audited, pinned publisher key and protected installation directory.
 *
 * HTTP can never supply a worker file, publisher key, executable path or
 * install URL. Only already-verified generations in SignedWorkerStore can be
 * explicitly selected/opened. Every reader call is bounded to one session and
 * the store's current source revision.
 */
export class SignedSourceDesktopReader {
    private readonly sessions = new Map<string, SignedSession>()

    constructor(
        private readonly store: SignedWorkerStore,
        private readonly state: OnlineReaderState,
        private readonly makeCache: () => OnlineReaderCache
    ) {}

    private drop(session: SignedSession) {
        this.sessions.delete(session.id)
        session.worker.revoke()
        this.store.stop(session.sourceId)
    }

    private forSession(id: string): SignedSession {
        if (!UUID.test(id)) throw new SignedReaderInputError()
        const session = this.sessions.get(id)
        if (!session) throw new Error('Signed source session is unavailable')
        const current = this.store.state(session.sourceId)
        if (current.revision !== session.revision || !current.activeVersion) {
            this.drop(session)
            throw new Error('Signed source session was revoked')
        }
        session.worker.assertEnabled()
        return session
    }

    private invalidateSource(sourceId: string) {
        for (const session of [...this.sessions.values()])
            if (session.sourceId === sourceId) this.drop(session)
    }

    async command(raw: unknown): Promise<unknown> {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            throw new SignedReaderInputError()
        const op = (raw as Record<string, unknown>).operation
        if (op === 'status') {
            if (!exact(raw, ['operation', 'sourceId']))
                throw new SignedReaderInputError()
            const id = field(raw.sourceId)
            const state = this.store.state(id)
            return {
                sourceId: id,
                ...state,
                connected: [...this.sessions.values()].some(s =>
                    s.sourceId === id && s.revision === state.revision)
            }
        }
        if (op === 'activate' || op === 'rollback') {
            if (!exact(raw, ['operation', 'sourceId', 'version', 'expectedRevision']))
                throw new SignedReaderInputError()
            const id = field(raw.sourceId)
            const version = field(raw.version)
            const expected = revision(raw.expectedRevision)
            const state = op === 'activate'
                ? this.store.activate(id, version, expected)
                : this.store.rollback(id, version, expected)
            // Invalid commands cannot tear down a running source.
            if (state.revision !== expected) this.invalidateSource(id)
            return { sourceId: id, ...state, connected: false }
        }
        if (op === 'disable') {
            if (!exact(raw, ['operation', 'sourceId', 'expectedRevision']))
                throw new SignedReaderInputError()
            const id = field(raw.sourceId)
            const expected = revision(raw.expectedRevision)
            const state = this.store.disable(id, expected)
            if (state.revision !== expected) this.invalidateSource(id)
            return { sourceId: id, ...state, connected: false }
        }
        if (op === 'connect') {
            if (!exact(raw, ['operation', 'sourceId']))
                throw new SignedReaderInputError()
            const id = field(raw.sourceId)
            if (this.sessions.size >= MAX_SESSIONS ||
                [...this.sessions.values()].some(s => s.sourceId === id))
                throw new Error('Signed source reader is busy')
            const selected = this.store.state(id)
            if (!selected.activeVersion)
                throw new Error('Signed source is disabled')
            const worker = await this.store.openActive(id)
            try {
                if (this.store.state(id).revision !== selected.revision)
                    throw new Error('Signed source revision changed')
                const sessionId = randomUUID()
                const manifest = {
                    apiVersion: 1 as const,
                    id,
                    capabilities: { chapters: true as const, pages: true as const, media: true as const }
                }
                const bound = bindExternalReader(manifest, worker, worker)
                const contract: OnlineReaderContract = {
                    ...bound.contract,
                    progressKey: 'signed-source-progress-v1:' + id,
                    pageUrl(comicId, episodeId, index) {
                        bound.contract.comicId(comicId)
                        bound.contract.episodeId(episodeId)
                        if (!Number.isSafeInteger(index) || index < 0 ||
                            index > 9999) throw new SignedReaderInputError()
                        return READER_ROOT + '/' + sessionId +
                            '/comics/' + encodeURIComponent(comicId) +
                            '/chapters/' + encodeURIComponent(episodeId) +
                            '/pages/' + index
                    }
                }
                const reader = new OnlineReaderService(
                    this.state, bound.source, this.makeCache(), contract
                )
                this.sessions.set(sessionId, {
                    id: sessionId, sourceId: id, revision: selected.revision,
                    worker, reader
                })
                return {
                    sessionId, sourceId: id, revision: selected.revision,
                    connected: true
                }
            } catch (error) {
                worker.revoke()
                this.store.stop(id)
                throw error
            }
        }
        if (op === 'disconnect') {
            if (!exact(raw, ['operation', 'sessionId']))
                throw new SignedReaderInputError()
            const session = this.forSession(field(raw.sessionId))
            this.drop(session)
            return { disconnected: true }
        }
        // Deliberately no "install" operation or arbitrary file/URL/key path.
        throw new SignedReaderInputError()
    }

    async read(
        sessionId: string,
        operation: 'chapters' | 'chapter' | 'picture' | 'progress' | 'save-progress',
        input: { comicId?: string; episodeId?: string; pageIndex?: number }
    ): Promise<unknown> {
        const session = this.forSession(sessionId)
        const reader = session.reader
        if (operation === 'progress') {
            return reader.recentProgress().filter(row =>
                row.comicId.startsWith(session.sourceId + ':'))
        }
        const comicId = field(input.comicId)
        if (operation === 'chapters')
            return reader.chapters(comicId)
        const episodeId = field(input.episodeId)
        if (operation === 'chapter')
            return reader.chapter(comicId, episodeId)
        if (operation === 'picture') {
            if (!Number.isSafeInteger(input.pageIndex) ||
                Number(input.pageIndex) < 0)
                throw new SignedReaderInputError()
            return reader.picture(comicId, episodeId, Number(input.pageIndex))
        }
        if (operation === 'save-progress') {
            if (!Number.isSafeInteger(input.pageIndex) ||
                Number(input.pageIndex) < 0)
                throw new SignedReaderInputError()
            return reader.saveProgress(comicId, episodeId, Number(input.pageIndex))
        }
        throw new SignedReaderInputError()
    }

    close() {
        for (const session of [...this.sessions.values()]) this.drop(session)
        this.store.close()
    }
}
