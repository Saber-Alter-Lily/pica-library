import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inertReadingDom, ReadingElement } from '../helpers/fake-reading-dom'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })
function book(title = 'Owned local comic'): any { return { comicId: 'local:fixture', title, source: { key: 'catalogue:local', label: 'Local' }, routes: [{ channel: 'local', available: true, progress: { pageIndex: 2 } }] } }
function response(items: any[] = [book()], total = items.length): any { return { items, total, complete: true, sources: [...new Map(items.map(item => [item.source.key, { ...item.source, count: 1 }])).values()] } }
function fixture(locale = 1) {
    const dom = inertReadingDom(), target = new ReadingElement('section'); dom.body.append(target)
    let enabled = true, visible = true, scope: { sessionId: string; expiresAt: number } | null = null
    const query = vi.fn(async (_value: any, _signal: AbortSignal) => response()), openReader = vi.fn(async () => {}), openHosted = vi.fn(async () => {})
    const exports: Record<string, any> = {}, copy = vi.fn((...values: string[]) => values[locale])
    const source = fs.readFileSync('web/reading-library.js', 'utf8')
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(code, { exports, require: (name: string) => { expect(name).toBe('./locale-runtime.js'); return { copy } }, document: dom.document, window: dom.window, AbortController, setTimeout, clearTimeout }, { timeout: 1000 })
    const panel = exports.installReadingLibrary({ target, canQuery: () => enabled, isVisible: () => visible, query, hostSession: () => scope, openReader, openHosted }) as { refresh(): Promise<void>; dispose(): void }
    cleanups.push(() => panel.dispose())
    return { ...dom, panel, target, query, copy, openReader, openHosted, allow: (value: boolean) => { enabled = value }, visible: (value: boolean) => { visible = value }, scope: (value: typeof scope) => { scope = value }, changed: () => dom.document.dispatchEvent({ type: 'pica-hosted-reading-scope-changed' }) }
}
describe('actual reading-panel JavaScript with inert DOM/query ports only', () => {
    it('does not query on installation, in Browser Lite or while the Library view is not visible', async () => {
        const f = fixture()
        expect(f.query).not.toHaveBeenCalled()
        f.allow(false); await f.panel.refresh(); expect(f.target.hidden).toBe(true)
        f.allow(true); f.visible(false); await f.panel.refresh()
        expect(f.query).not.toHaveBeenCalled()
    })
    for (const [locale, caption] of [[0, '本地阅读'], [1, 'Read locally'], [2, 'ローカルで読む']] as const) {
        it('renders/resumes actual local records safely in locale ' + locale, async () => {
            const f = fixture(locale)
            f.query.mockResolvedValueOnce(response([book('<img src=x onerror=alert(1)>')]))
            await f.panel.refresh()
            const button = f.target.querySelectorAll('button').find(node => node.textContent.includes(caption))!
            expect(button.textContent).toContain('3')
            await button.click(); expect(f.openReader).toHaveBeenCalledWith('local:fixture', false)
            expect(f.target.textContent).toContain('<img src=x onerror=alert(1)>')
            expect(f.created).not.toContain('img'); expect(f.created).not.toContain('script')
            expect(f.query.mock.calls[0][0]).toEqual({ query: { text: '', sourceKey: '', limit: 12, offset: 0 } })
            expect(f.copy.mock.calls.every(values => values.length === 3 && Boolean(values[2]))).toBe(true)
        })
    }
    it('uses bounded real pagination and Enter search instead of silently truncating selected books', async () => {
        const f = fixture()
        f.query.mockResolvedValue(response([book()], 30))
        await f.panel.refresh()
        await f.target.querySelectorAll('button').find(node => node.textContent === 'Next')!.click()
        await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(2))
        expect(f.query.mock.calls[1][0].query.offset).toBe(12)
        const input = f.target.querySelectorAll('input')[0]; input.value = 'selected title'
        input.onkeydown?.({ key: 'Enter', preventDefault() {} })
        await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(3))
        expect(f.query.mock.calls[2][0].query).toMatchObject({ offset: 0, text: 'selected title' })
    })
    it('uses only the current volatile host scope and the existing hosted Reader callback', async () => {
        const f = fixture(), sessionId = '64d223e0-5d29-4320-babb-5a2da654d345'
        f.scope({ sessionId, expiresAt: Date.now() + 60000 })
        f.query.mockResolvedValueOnce(response([{ ...book(), comicId: 'hosted:fixture', routes: [{ channel: 'hosted', available: true }] }]))
        await f.panel.refresh()
        expect(f.query.mock.calls[0][0].hostSessionId).toBe(sessionId)
        const button = f.target.querySelectorAll('button').find(node => node.textContent === 'Read from your host')!
        await button.click(); expect(f.openHosted).toHaveBeenCalledWith('hosted:fixture', sessionId)
        expect(f.openReader).not.toHaveBeenCalled()
        f.scope(null); f.changed(); await button.click()
        expect(f.openHosted).toHaveBeenCalledOnce()
    })
    it('keeps an already displayed local Read button usable after a failed refresh', async () => {
        const f = fixture(); await f.panel.refresh()
        const button = f.target.querySelectorAll('button').find(node => node.textContent.startsWith('Read locally'))!
        f.query.mockRejectedValueOnce(new Error('synthetic failure'))
        await f.panel.refresh()
        expect(f.target.textContent).toContain('No data changed')
        await button.click()
        expect(f.openReader).toHaveBeenCalledWith('local:fixture', false)
    })
    it('evicts private host labels immediately on revocation and ignores an obsolete response', async () => {
        const f = fixture(), sessionId = '64d223e0-5d29-4320-babb-5a2da654d345'
        f.scope({ sessionId, expiresAt: Date.now() + 60000 })
        const privateBook = { ...book('synthetic-private-title'), source: { key: 'private-owner', label: 'synthetic-private-label' }, routes: [{ channel: 'hosted', available: true }] }
        f.query.mockResolvedValueOnce(response([privateBook])); await f.panel.refresh()
        let resolve!: (value: any) => void
        f.query.mockImplementationOnce(() => new Promise(done => { resolve = done }))
        const obsolete = f.panel.refresh()
        f.scope(null)
        let finishCurrent!: (value: any) => void
        f.query.mockImplementationOnce(() => new Promise(done => { finishCurrent = done }))
        f.changed()
        expect(f.target.textContent).not.toContain('synthetic-private')
        resolve(response([privateBook])); await obsolete
        expect(f.target.textContent).not.toContain('synthetic-private')
        finishCurrent(response([]))
        await vi.waitFor(() => expect(f.target.querySelectorAll('button').find(node => node.textContent === 'Refresh reading records')?.disabled).toBe(false))
    })
    it('does not publish a pending response after disposal', async () => {
        const f = fixture(); let resolve!: (value: any) => void
        f.query.mockImplementationOnce(() => new Promise(done => { resolve = done }))
        const pending = f.panel.refresh(); f.panel.dispose()
        resolve(response([book('late title')])); await pending
        expect(f.target.children).toHaveLength(0)
    })
})
