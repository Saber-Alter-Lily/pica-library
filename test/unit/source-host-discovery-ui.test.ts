import { afterEach, expect, it, vi } from 'vitest'
import { inertReadingDom } from '../helpers/fake-reading-dom'
import { inertHostWebModules } from '../helpers/inert-host-web-modules'

const HOST = '64d223e0-5d29-4320-babb-5a2da654d345', SESSION = '74d223e0-5d29-4320-babb-5a2da654d345', SOURCE = '9007199254740993'
const COMIC = 'hosted:' + HOST + ':' + 'a'.repeat(64)
class Event { constructor(readonly type: string, readonly options: { detail?: any } = {}) {} get detail() { return this.options.detail } }
const cleanup: Array<() => void> = []
afterEach(() => { for (const close of cleanup.splice(0)) close() })
function fixture(language = 1) {
    const dom = inertReadingDom(), exports: Record<string, any> = {}, timers = new Map<number, () => void>()
    let timer = 0, stalled = false, release = () => {}
    const opens: unknown[] = [], host = { id: HOST, revision: 1, enabled: true, label: 'My <host>', endpoint: 'https://user-host.invalid/', authMode: 'none' }
    const fetcher = vi.fn(async (url: string, init: any = {}) => {
        expect(url).toMatch(/^\/api\/v1\/desktop\//)
        if (url.endsWith('/status')) return { ok: true, json: async () => ({ configured: true, startupReady: true, csrfToken: 'local-only-csrf', hostedLibraryReader: { available: true }, hostedSourceBrowser: { available: true } }) }
        const input = JSON.parse(init.body)
        expect(init.headers['x-pica-csrf']).toBe('local-only-csrf')
        if (input.action === 'search' && stalled) await new Promise<void>(resolve => { release = resolve })
        const value = input.action === 'start' ? { sessionId: SESSION, expiresAt: Date.now() + 60000, capabilities: { libraryRead: input.scope === 'library-read', providerSearch: input.scope === 'source-search-read', libraryImport: false }, history: [] } :
            input.action === 'sources' ? { sources: [{ id: SOURCE, name: '<img inert>', language: 'zh' }], offset: input.offset, hasNext: false } :
            input.action === 'bind-source' ? { selectedSource: { id: input.sourceId, name: 'Chosen', language: 'zh' }, history: [] } :
            input.action === 'search' ? { sourceId: SOURCE, page: input.page, query: input.query, hasNext: input.page < 2, books: [{ comicId: COMIC, title: '<script>inert title</script>', sourceId: SOURCE }] } :
            input.action === 'select' ? { sessionId: SESSION, comicId: input.comicId, title: 'Selected' } :
            input.action === 'list' ? { books: [], offset: 0, hasNext: false } : input.action === 'close' ? { closed: true } : null
        if (!value) throw Error('Unexpected local command')
        return { ok: true, json: async () => value }
    })
    dom.document.addEventListener('pica-open-hosted-reader', event => opens.push(event.detail))
    const context = { exports, require: (name: string) => { expect(name).toBe('./locale-runtime.js'); return { copy: (...values: string[]) => values[language] } },
        document: dom.document, window: dom.window, fetch: fetcher, CustomEvent: Event, AbortController, DOMException, Date, Error,
        setTimeout: (action: () => void) => { timers.set(++timer, action); return timer }, clearTimeout: (id: number) => timers.delete(id) }
    Object.assign(exports, inertHostWebModules(context, (...values) => values[language])('web/host-library.js'))
    const get = (id: string) => dom.document.getElementById('host-library-' + id)!
    const configure = (scope = 'source') => dom.document.dispatchEvent(new Event('pica-host-' + scope + '-config', { detail: host }))
    configure()
    const commands = (action: string) => fetcher.mock.calls.filter(([, options]) => options?.body && JSON.parse(options.body).action === action).map(([, options]) => JSON.parse(options.body))
    const start = async () => { get('consent').checked = true; get('form').onsubmit?.({ preventDefault() {} }); await vi.waitFor(() => expect(get('bind-source').disabled).toBe(false)) }
    const bind = async () => { await get('bind-source').click(); await vi.waitFor(() => expect(get('query').disabled).toBe(false)) }
    const search = (query = 'sample') => { get('query').value = query; get('search-form').onsubmit?.({ preventDefault() {} }) }
    cleanup.push(() => dom.window.dispatchEvent(new Event('pagehide')))
    return { ...dom, get, configure, fetcher, commands, start, bind, search, opens, exports,
        stall: () => { stalled = true }, release: () => release() }
}

it.each([0, 1, 2])('actual localized UI has no boot/panel requests, and source choice does not auto-search (%s)', async language => {
    const f = fixture(language)
    expect(f.fetcher).not.toHaveBeenCalled()
    expect(f.get('heading').textContent).not.toBe('')
    expect(f.get('consent-text').textContent).not.toBe('')
    await f.start()
    expect(f.commands('start')[0]).toMatchObject({ scope: 'source-search-read', acceptHostCatalogueSideEffects: true })
    expect(f.get('source').value).toBe(SOURCE)
    expect(f.get('source').textContent).toContain('<img inert>')
    expect(f.commands('search')).toEqual([])
    await f.bind()
    expect(f.commands('bind-source')).toEqual([{ action: 'bind-source', sessionId: SESSION, sourceId: SOURCE, consent: true }])
    expect(f.commands('search')).toEqual([])
    expect(f.get('source').disabled).toBe(true)
})
it('explicit search/Enter/pagination use the committed query and then the existing main Reader event', async () => {
    const f = fixture(); await f.start(); await f.bind(); f.search('original')
    await vi.waitFor(() => expect(f.get('next').disabled).toBe(false))
    expect(f.get('books').textContent).toContain('<script>inert title</script>')
    f.get('query').value = 'not-submitted'
    await f.get('next').click()
    await vi.waitFor(() => expect(f.commands('search')).toHaveLength(2))
    await vi.waitFor(() => expect(f.get('next').disabled).toBe(true))
    await vi.waitFor(() => expect(f.get('read-' + COMIC).disabled).toBe(false))
    expect(f.commands('search')[1]).toMatchObject({ query: 'original', page: 2 })
    await f.get('read-' + COMIC).click()
    await vi.waitFor(() => expect(f.opens).toMatchObject([{ sessionId: SESSION, comicId: COMIC, csrfToken: 'local-only-csrf' }]))
    expect(f.commands('select')).toHaveLength(1)
})
it('busy search prevents repeat submits/read clicks; ending the session fences an ignored-abort late result', async () => {
    const f = fixture(); await f.start(); await f.bind(); f.stall(); f.search('pending'); f.search('duplicate')
    await vi.waitFor(() => expect(f.commands('search')).toHaveLength(1))
    expect(f.get('search').disabled).toBe(true)
    await f.get('end').click()
    expect(f.exports.currentHostedLibrarySession()).toBe(null)
    f.release(); await Promise.resolve(); await Promise.resolve()
    await vi.waitFor(() => expect(f.get('start').disabled).toBe(false))
    expect(f.get('books').textContent).toBe(''); expect(f.get('query').value).toBe(''); expect(f.opens).toEqual([])
})
it('switching back to library scope ends search authority and requires a new consent, never a background start', async () => {
    const f = fixture(); await f.start(); await f.bind()
    f.configure('library')
    expect(f.commands('close')).toHaveLength(1)
    expect(f.commands('start')).toHaveLength(1)
    expect(f.get('consent').checked).toBe(false)
    expect(f.get('search-form').hidden).toBe(true)
    expect(f.exports.currentHostedLibrarySession()).toBe(null)
})
