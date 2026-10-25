import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { build } from 'esbuild'
import { describe, expect, it, vi } from 'vitest'
import { createReaderViewportTracker } from '../../web/reader-viewport.js'
import { recordReaderProgress } from '../../web/reader-progress.js'

function viewport(observer = true) {
    const frames = new Map<number, () => void>(),
        history: Array<() => void> = [],
        scroll = new Set<() => void>()
    let next = 0
    const pages = Array.from({ length: 10 }, (_, index) => ({
        dataset: { readerPage: String(index) },
        scrollIntoView: vi.fn(),
        closest() {
            return this
        }
    }))
    const target = {
        isConnected: true,
        contains: (page: unknown) =>
            pages.includes(page as (typeof pages)[number]),
        querySelector: (selector: string) =>
            pages[Number(selector.match(/"(\d+)"/)?.[1])],
        querySelectorAll: () => pages,
        getBoundingClientRect: () => ({ left: 0, width: 500 })
    }
    const observers: Array<{
        callback: (entries: unknown[]) => void
        observe: ReturnType<typeof vi.fn>
        disconnect: ReturnType<typeof vi.fn>
        options: unknown
    }> = []
    class Observer {
        observe = vi.fn()
        disconnect = vi.fn()
        constructor(
            public callback: (entries: unknown[]) => void,
            public options: unknown
        ) {
            observers.push(this)
        }
    }
    const browser = {
        innerHeight: 1000,
        requestAnimationFrame: vi.fn((callback: () => void) => {
            const id = next++
            frames.set(id, callback)
            history.push(callback)
            return id
        }),
        cancelAnimationFrame: vi.fn((id: number) => frames.delete(id)),
        addEventListener: vi.fn((_name: string, callback: () => void) =>
            scroll.add(callback)
        ),
        removeEventListener: vi.fn((_name: string, callback: () => void) =>
            scroll.delete(callback)
        ),
        ...(observer ? { IntersectionObserver: Observer } : {})
    }
    const document = { elementFromPoint: vi.fn(() => pages[2]) }
    const onPage = vi.fn(),
        scope = { current: true }
    const tracker = createReaderViewportTracker({
        window: browser as unknown as Window,
        document: document as unknown as Document,
        onPage
    })
    const options = {
        target: target as unknown as HTMLElement,
        resumePage: 4,
        pageCount: 10,
        isCurrent: () => scope.current
    }
    const tick = () => {
        const batch = [...frames.values()]
        frames.clear()
        batch.forEach((callback) => callback())
    }
    const entry = (index: number, top = 450, height = 100) => ({
        isIntersecting: true,
        target: pages[index],
        boundingClientRect: { top, height }
    })
    return {
        tracker,
        options,
        pages,
        target,
        browser,
        document,
        onPage,
        scope,
        observers,
        frames,
        history,
        scroll,
        tick,
        entry
    }
}

const app = fs.readFileSync('web/app.js', 'utf8')
const parsed = ts.createSourceFile(
    'app.js',
    app,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
)
const functions = new Map<string, string>()
for (const statement of parsed.statements)
    if (ts.isFunctionDeclaration(statement) && statement.name)
        functions.set(statement.name.text, statement.getText(parsed))
function deferred() {
    let resolve!: (value?: unknown) => void
    const promise = new Promise<unknown>((done) => {
        resolve = done
    })
    return { promise, resolve }
}
function lifecycle() {
    const reader = {
        comicId: 'local:synthetic',
        episodeId: 'first',
        originView: 'library',
        pageIndex: 1,
        chapter: { pages: new Array(4) },
        progressSaved: 0,
        dirty: true
    }
    const frames: Array<() => void> = [],
        controls: Record<string, { value: string; textContent?: string }> = {
            '#reader-mode': { value: 'vertical' },
            '#reader-message': { value: '', textContent: '' }
        }
    const tracker = { start: vi.fn(), stop: vi.fn() },
        save = deferred(),
        flush = vi.fn(() => save.promise),
        scrollTop = vi.fn()
    const context = vm.createContext({
        state: { reader },
        activeView: 'reader',
        readingLibraryPanel: { refresh: vi.fn(async () => undefined) },
        readerComicRequest: 0,
        readerChapterRequest: 0,
        readerProgressTimer: null,
        readerViewportTracker: tracker,
        recordReaderProgress,
        flushReaderProgress: flush,
        scrollReaderViewportToTop: scrollTop,
        $: (selector: string) =>
            controls[selector] || {
                textContent: '',
                replaceChildren: vi.fn(),
                hidden: false
            },
        requestAnimationFrame: (callback: () => void) => frames.push(callback),
        viewScrollPositions: new Map(),
        window: { scrollY: 20, scrollTo: vi.fn() },
        document: {
            fullscreenElement: null,
            exitFullscreen: vi.fn(async () => undefined),
            querySelectorAll: () => [],
            body: { classList: { toggle: vi.fn(), add: vi.fn() } }
        },
        setTimeout: vi.fn(() => 123),
        clearTimeout: vi.fn(),
        api: vi.fn(),
        t: (key: string) => key,
        readerApiRoot: () => '/api/v1/reader',
        renderReaderChapterHeading: vi.fn(),
        renderReaderPages: vi.fn(),
        updateReaderChapterNavigation: vi.fn(),
        localizeError: () => 'error',
        language: 'zh-CN'
    })
    const actual = (name: string) => {
        const fn = vm.runInContext('(' + functions.get(name) + ')', context)
        context[name] = fn
        return fn
    }
    for (const name of [
        'resetReaderViewportTracking',
        'observeVerticalReaderProgress',
        'queueReaderViewportTop',
        'queueReaderProgress',
        'activateView',
        'exitReader',
        'openReaderChapter',
        'openReaderComic'
    ])
        actual(name)
    return {
        context,
        reader,
        frames,
        controls,
        tracker,
        save,
        flush,
        scrollTop
    }
}

describe('isolated browser viewport module with explicitly mocked browser APIs', () => {
    it('has no import dependency on source, account, storage, network or the app', async () => {
        const result = await build({
            entryPoints: ['web/reader-viewport.js'],
            bundle: true,
            platform: 'browser',
            format: 'esm',
            write: false,
            metafile: true,
            logLevel: 'silent'
        })
        expect(Object.keys(result.metafile!.inputs)).toEqual([
            'web/reader-viewport.js'
        ])
    })
    it('restores the saved page before installing the same centered observer', () => {
        const h = viewport()
        expect(h.tracker.start(h.options)).toBe(true)
        expect(h.onPage).not.toHaveBeenCalled()
        h.tick()
        expect(h.pages[4].scrollIntoView).toHaveBeenCalledWith({
            block: 'center'
        })
        expect(h.observers).toHaveLength(0)
        h.tick()
        expect(h.observers[0].options).toEqual({
            root: null,
            rootMargin: '-45% 0px -45% 0px',
            threshold: [0, 0.01]
        })
        expect(h.observers[0].observe).toHaveBeenCalledTimes(10)
        expect(h.onPage).toHaveBeenLastCalledWith(4)
        h.observers[0].callback([h.entry(2, 100), h.entry(7)])
        expect(h.onPage).toHaveBeenLastCalledWith(7)
    })
    it.each([0, 1])(
        'cancels queued restoration stage %s and rejects a callback already delivered for it',
        (stage) => {
            const h = viewport()
            h.tracker.start(h.options)
            if (stage) h.tick()
            const callback = h.history.at(-1)!
            h.tracker.stop()
            expect(h.frames.size).toBe(0)
            callback()
            expect(h.observers).toHaveLength(0)
            expect(h.onPage).not.toHaveBeenCalled()
            expect(h.browser.cancelAnimationFrame).toHaveBeenCalled()
        }
    )
    it('disconnects the old observer and ignores its already-queued callback without stopping the new owner', () => {
        const h = viewport()
        h.tracker.start(h.options)
        h.tick()
        h.tick()
        const old = h.observers[0]
        h.tracker.start({ ...h.options, resumePage: 1 })
        h.tick()
        h.tick()
        h.onPage.mockClear()
        old.callback([h.entry(9)])
        expect(old.disconnect).toHaveBeenCalledOnce()
        expect(h.observers[1].disconnect).not.toHaveBeenCalled()
        expect(h.onPage).not.toHaveBeenCalled()
        h.observers[1].callback([h.entry(3)])
        expect(h.onPage).toHaveBeenCalledWith(3)
    })
    it('disposes its own observer when the chapter/view predicate becomes stale', () => {
        const h = viewport()
        h.tracker.start(h.options)
        h.tick()
        h.tick()
        h.onPage.mockClear()
        h.scope.current = false
        h.observers[0].callback([h.entry(8)])
        expect(h.observers[0].disconnect).toHaveBeenCalledOnce()
        expect(h.onPage).not.toHaveBeenCalled()
    })
    it('does not write for a detached target or foreign/invalid observer page', () => {
        const h = viewport()
        h.tracker.start(h.options)
        h.tick()
        h.tick()
        h.onPage.mockClear()
        h.observers[0].callback([
            { ...h.entry(1), isIntersecting: false },
            { ...h.entry(1), target: { dataset: { readerPage: '3' } } }
        ])
        expect(h.onPage).not.toHaveBeenCalled()
        h.pages[1].dataset.readerPage = 'NaN'
        h.observers[0].callback([h.entry(1)])
        expect(h.onPage).not.toHaveBeenCalled()
        h.target.isConnected = false
        h.observers[0].callback([h.entry(2)])
        expect(h.observers[0].disconnect).toHaveBeenCalledOnce()
    })
    it('keeps the native passive-scroll fallback and coalesces its sampling per frame', () => {
        const h = viewport(false)
        h.tracker.start(h.options)
        h.tick()
        h.tick()
        expect(h.browser.addEventListener).toHaveBeenCalledWith(
            'scroll',
            expect.any(Function),
            { passive: true }
        )
        for (const callback of h.scroll) {
            callback()
            callback()
            callback()
        }
        expect(h.frames.size).toBe(1)
        h.tick()
        expect(h.onPage).toHaveBeenCalledOnce()
        expect(h.onPage).toHaveBeenCalledWith(2)
        expect(h.document.elementFromPoint).toHaveBeenCalledOnce()
    })
    it('removes fallback listeners, cancels their frame and rejects late scroll/frame delivery', () => {
        const h = viewport(false)
        h.tracker.start(h.options)
        h.tick()
        h.tick()
        const scroll = [...h.scroll][0],
            callback = h.history.at(-1)!
        h.tracker.stop()
        scroll()
        callback()
        expect(h.scroll.size).toBe(0)
        expect(h.frames.size).toBe(0)
        expect(h.onPage).not.toHaveBeenCalled()
        expect(h.browser.removeEventListener).toHaveBeenCalledOnce()
        h.tracker.stop()
        expect(h.browser.removeEventListener).toHaveBeenCalledOnce()
    })
    it('rejects empty/invalid chapters and resume indices without scheduling or writing', () => {
        const h = viewport()
        for (const override of [
            { pageCount: 0 },
            { pageCount: 1.5 },
            { pageCount: Infinity },
            { resumePage: -1 },
            { resumePage: 10 },
            { resumePage: NaN },
            { isCurrent: () => false }
        ])
            expect(h.tracker.start({ ...h.options, ...override })).toBe(false)
        expect(h.frames.size).toBe(0)
        expect(h.onPage).not.toHaveBeenCalled()
    })
})

describe('actual AST-extracted app lifecycle functions, not app/browser startup', () => {
    it.each(['reader', 'chapter', 'episode', 'mode', 'view'])(
        'binds viewport callbacks to the actual %s owner',
        (change) => {
            const h = lifecycle()
            h.context.observeVerticalReaderProgress({}, 1)
            const options = h.tracker.start.mock.calls[0][0]
            expect(options.isCurrent()).toBe(true)
            expect(options.pageCount).toBe(4)
            if (change === 'reader') h.context.state.reader = { ...h.reader }
            else if (change === 'chapter')
                h.reader.chapter = { pages: new Array(2) }
            else if (change === 'episode') h.reader.episodeId = 'second'
            else if (change === 'mode')
                h.controls['#reader-mode'].value = 'single'
            else h.context.activeView = 'library'
            expect(options.isCurrent()).toBe(false)
        }
    )
    it('invalidates pending comic/chapter requests, stops tracking and flushes when navigating away', () => {
        const h = lifecycle()
        h.context.activateView('library')
        expect(h.context.readerComicRequest).toBe(1)
        expect(h.context.readerChapterRequest).toBe(1)
        expect(h.tracker.stop).toHaveBeenCalledOnce()
        expect(h.flush).toHaveBeenCalledOnce()
        expect(h.context.activeView).toBe('library')
        expect(h.context.readingLibraryPanel.refresh).toHaveBeenCalledOnce()
        h.context.activateView('discover')
        expect(h.context.readingLibraryPanel.refresh).toHaveBeenCalledOnce()
    })
    it('does not render a chapter request completed after navigation', async () => {
        const h = lifecycle(),
            response = deferred(),
            started = deferred()
        h.flush.mockResolvedValue(true)
        h.context.api.mockImplementation(() => {
            started.resolve()
            return response.promise
        })
        const opening = h.context.openReaderChapter('second')
        await started.promise
        expect(h.context.api).toHaveBeenCalledOnce()
        h.context.activateView('library')
        response.resolve({ pages: [{}], episode: { id: 'second' } })
        await opening
        expect(h.reader.episodeId).toBe('first')
        expect(h.context.renderReaderPages).not.toHaveBeenCalled()
        expect(h.context.activeView).toBe('library')
    })
    it('does not reactivate the Reader from a comic-open request completed after navigation', async () => {
        const h = lifecycle(),
            response = deferred(),
            started = deferred()
        h.flush.mockResolvedValue(true)
        h.context.api.mockImplementation((url: string) => {
            if (url.endsWith('/chapters')) {
                started.resolve()
                return response.promise
            }
            return Promise.resolve([])
        })
        const opening = h.context.openReaderComic('local:next')
        await started.promise
        h.context.activateView('library')
        response.resolve([{ id: 'second', downloadedPictures: 1 }])
        await opening
        expect(h.context.activeView).toBe('library')
        expect(h.context.renderReaderPages).not.toHaveBeenCalled()
    })
    it('keeps ordinary exit/save/origin restoration working', async () => {
        const h = lifecycle()
        const exit = h.context.exitReader()
        expect(h.tracker.stop).toHaveBeenCalledOnce()
        h.save.resolve(true)
        await exit
        expect(h.context.activeView).toBe('library')
    })
    it.each(['reader', 'chapterRequest', 'view'])(
        'does not let an old pending exit close a changed %s',
        async (change) => {
            const h = lifecycle()
            const exit = h.context.exitReader()
            if (change === 'reader') {
                h.context.state.reader = { ...h.reader, comicId: 'local:new' }
                h.context.readerComicRequest++
            } else if (change === 'chapterRequest')
                h.context.readerChapterRequest++
            else h.context.activeView = 'discover'
            h.save.resolve(true)
            await exit
            expect(h.context.activeView).toBe(
                change === 'view' ? 'discover' : 'reader'
            )
            expect(h.context.document.exitFullscreen).not.toHaveBeenCalled()
        }
    )
    it('rechecks exit ownership after awaiting browser fullscreen exit', async () => {
        const h = lifecycle(),
            fullscreen = deferred()
        h.flush.mockResolvedValue(true)
        h.context.document.fullscreenElement = {}
        h.context.document.exitFullscreen.mockReturnValue(fullscreen.promise)
        const exit = h.context.exitReader()
        await Promise.resolve()
        h.context.state.reader = { ...h.reader, comicId: 'local:new' }
        h.context.readerComicRequest++
        fullscreen.resolve()
        await exit
        expect(h.context.activeView).toBe('reader')
    })
    it('guards delayed paged-scroll positioning after view/chapter/mode changes', () => {
        for (const change of ['view', 'chapter', 'mode', 'none']) {
            const h = lifecycle()
            h.controls['#reader-mode'].value = 'single'
            h.context.queueReaderViewportTop()
            if (change === 'view') h.context.activeView = 'library'
            if (change === 'chapter') h.reader.chapter = { pages: [] }
            if (change === 'mode') h.controls['#reader-mode'].value = 'vertical'
            h.frames[0]()
            expect(h.scrollTop).toHaveBeenCalledTimes(change === 'none' ? 1 : 0)
        }
    })
    it('rejects stale/invalid progress while preserving valid debounce and saved-page semantics', () => {
        const h = lifecycle()
        for (const index of [-1, 4, NaN, 0.5])
            h.context.queueReaderProgress(index)
        expect(h.reader.pageIndex).toBe(1)
        expect(h.context.setTimeout).not.toHaveBeenCalled()
        h.context.queueReaderProgress(2)
        expect(h.reader.pageIndex).toBe(2)
        expect(h.reader.dirty).toBe(true)
        expect(h.context.setTimeout).toHaveBeenCalledWith(
            expect.any(Function),
            400
        )
        h.context.activeView = 'library'
        h.context.queueReaderProgress(3)
        expect(h.reader.pageIndex).toBe(2)
    })
    it('stops previous tracking before an async comic-save boundary', () => {
        const opening = functions.get('openReaderComic')!
        expect(opening.indexOf('resetReaderViewportTracking()')).toBeLessThan(
            opening.indexOf('await flushReaderProgress()')
        )
    })
})
