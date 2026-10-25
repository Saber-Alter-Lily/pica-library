import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { build } from 'esbuild'
import { describe, expect, it, vi } from 'vitest'
import {
    recordReaderProgress,
    captureReaderProgress,
    acknowledgeReaderProgress,
    type ReaderProgressOwner
} from '../../web/reader-progress.js'

const reader = (): ReaderProgressOwner => ({
    comicId: 'local:fixture',
    episodeId: 'episode',
    chapter: { pages: new Array(8) },
    pageIndex: 3,
    progressSaved: 3,
    dirty: false
})
function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: Error) => void
    const promise = new Promise<T>((yes, no) => {
        resolve = yes
        reject = no
    })
    return { promise, resolve, reject }
}
const app = fs.readFileSync('web/app.js', 'utf8'),
    parsed = ts.createSourceFile(
        'app.js',
        app,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS
    )
const flush = parsed.statements
    .find(
        (node) =>
            ts.isFunctionDeclaration(node) &&
            node.name?.text === 'flushReaderProgress'
    )!
    .getText(parsed)
function adapter(hosted = false) {
    const owner = {
            ...reader(),
            hostedSessionId: hosted ? 'synthetic-session' : null,
            hostedCsrfToken: hosted ? 'synthetic-csrf' : null
        },
        response = deferred<unknown>()
    recordReaderProgress(owner, 4)
    const context = vm.createContext({
        state: { reader: owner },
        activeView: 'reader',
        readingLibraryPanel: { refresh: vi.fn(async () => undefined) },
        readerProgressTimer: null,
        captureReaderProgress,
        acknowledgeReaderProgress,
        clearTimeout: vi.fn(),
        readerApiRoot: () => (hosted ? '/owned-host' : '/owned-local'),
        fetch: vi.fn(() => response.promise),
        api: vi.fn(() => response.promise),
        post: vi.fn(() => response.promise),
        desktop: null
    })
    const actual = vm.runInContext('(' + flush + ')', context)
    return {
        owner,
        response,
        context,
        flush: actual as (keepalive?: boolean) => Promise<boolean>
    }
}
describe('source-free transient Reader progress state', () => {
    it('bundles with no DOM, source, transport or persistence dependency', async () => {
        const result = await build({
            entryPoints: ['web/reader-progress.js'],
            bundle: true,
            platform: 'browser',
            format: 'esm',
            write: false,
            metafile: true,
            logLevel: 'silent'
        })
        expect(Object.keys(result.metafile!.inputs)).toEqual([
            'web/reader-progress.js'
        ])
    })
    it('keeps an unchanged saved page clean and produces no request snapshot', () => {
        const owner = reader()
        expect(recordReaderProgress(owner, 3)).toBe(true)
        expect(owner.dirty).toBe(false)
        expect(captureReaderProgress(owner)).toBeNull()
    })
    it('does not treat a return to the last ACKed page as clean while another intent may still be in flight', () => {
        const owner = reader()
        recordReaderProgress(owner, 4)
        const writing4 = captureReaderProgress(owner)!
        recordReaderProgress(owner, 3)
        expect(owner.dirty).toBe(true)
        expect(acknowledgeReaderProgress(owner, writing4)).toBe(false)
        const writing3 = captureReaderProgress(owner)!
        expect(writing3.payload).toEqual({
            comicId: 'local:fixture',
            episodeId: 'episode',
            pageIndex: 3
        })
        expect(acknowledgeReaderProgress(owner, writing3)).toBe(true)
        expect(owner.dirty).toBe(false)
    })
    it('rejects an old same-page ACK after reading forward and back', () => {
        const owner = reader()
        owner.progressSaved = 0
        owner.dirty = true
        recordReaderProgress(owner, 3)
        const old = captureReaderProgress(owner)!
        recordReaderProgress(owner, 4)
        recordReaderProgress(owner, 3)
        expect(acknowledgeReaderProgress(owner, old)).toBe(false)
        expect(owner.dirty).toBe(true)
    })
    it.each(['owner', 'chapter', 'comic', 'episode'])(
        'cannot clear a changed %s with a previous snapshot',
        (change) => {
            let owner = reader()
            recordReaderProgress(owner, 4)
            const snapshot = captureReaderProgress(owner)!
            if (change === 'owner') owner = { ...owner }
            if (change === 'chapter') owner.chapter = { pages: new Array(8) }
            if (change === 'comic') owner.comicId = 'local:other'
            if (change === 'episode') owner.episodeId = 'another'
            expect(acknowledgeReaderProgress(owner, snapshot)).toBe(false)
            expect(owner.dirty).toBe(true)
        }
    )
    it('rejects invalid pages without changing state and keeps snapshots immutable', () => {
        const owner = reader(),
            before = JSON.stringify(owner)
        for (const index of [-1, 8, NaN, 0.5])
            expect(recordReaderProgress(owner, index)).toBe(false)
        expect(JSON.stringify(owner)).toBe(before)
        recordReaderProgress(owner, 4)
        const snapshot = captureReaderProgress(owner)!
        expect(Object.isFrozen(snapshot)).toBe(true)
        expect(Object.isFrozen(snapshot.payload)).toBe(true)
    })
})
describe('actual AST-extracted Web save transport with mocked ports', () => {
    it('preserves the local save payload/path and only ACKs its current intent', async () => {
        const h = adapter(),
            saving = h.flush()
        expect(h.context.post).toHaveBeenCalledWith('/owned-local/progress', {
            comicId: 'local:fixture',
            episodeId: 'episode',
            pageIndex: 4
        })
        h.response.resolve({})
        await expect(saving).resolves.toBe(true)
        expect(h.owner.progressSaved).toBe(4)
        expect(h.owner.dirty).toBe(false)
    })
    it('refreshes the common Library after a successful save only while that view is active', async () => {
        for (const activeView of ['reader', 'library']) {
            const h = adapter()
            h.context.activeView = activeView
            const saving = h.flush()
            h.response.resolve({})
            await expect(saving).resolves.toBe(true)
            expect(h.context.readingLibraryPanel.refresh).toHaveBeenCalledTimes(
                activeView === 'library' ? 1 : 0
            )
            expect(h.owner.progressSaved).toBe(4)
            expect(h.owner.dirty).toBe(false)
        }
    })
    it('does not clear newer edits when an earlier request returns', async () => {
        const h = adapter(),
            saving = h.flush()
        recordReaderProgress(h.owner, 5)
        h.response.resolve({})
        await saving
        expect(h.owner.dirty).toBe(true)
        expect(h.owner.pageIndex).toBe(5)
    })
    it('keeps failed saves dirty and the Reader usable', async () => {
        const h = adapter(),
            saving = h.flush()
        h.response.reject(new Error('offline'))
        await expect(saving).resolves.toBe(false)
        expect(h.owner.dirty).toBe(true)
    })
    it('keeps the existing hosted CSRF path without teaching the state module about sessions', async () => {
        const h = adapter(true),
            saving = h.flush()
        expect(h.context.api).toHaveBeenCalledWith(
            '/owned-host/progress',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-pica-csrf': 'synthetic-csrf'
                }
            })
        )
        h.response.resolve({})
        await saving
        expect(h.owner.dirty).toBe(false)
    })
    it('keeps the immediate keepalive request on pagehide and captures the old identity', async () => {
        const h = adapter(true),
            saving = h.flush(true)
        expect(h.context.fetch).toHaveBeenCalledWith(
            '/owned-host/progress',
            expect.objectContaining({
                keepalive: true,
                headers: {
                    'content-type': 'application/json',
                    'x-pica-csrf': 'synthetic-csrf'
                }
            })
        )
        h.context.state.reader = {
            ...reader(),
            comicId: 'local:next',
            dirty: true
        }
        h.response.resolve({ ok: true })
        await saving
        expect(h.context.state.reader.dirty).toBe(true)
    })
})
