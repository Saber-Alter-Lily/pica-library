import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import ts from 'typescript'

function screen(locale: number, initial: object) {
    const nodes = new Map<string, any>()
    const node = (id: string) => {
        if (!nodes.has(id)) nodes.set(id, {textContent: '', disabled: false, hidden: false, value: '', checked: false, handlers: {} as Record<string, () => void>, addEventListener(name: string, callback: () => void) {this.handlers[name] = callback}})
        return nodes.get(id)!
    }
    const summary = {childNodes: [{nodeType: 3, textContent: ''}]}
    const panel = {...node('panel'), open: true,
        querySelector: (selector: string) => selector === 'summary' ? summary : node(selector),
        querySelectorAll: (selector: string) => selector === ':scope > p' ? [node('p0'), node('p1')] : []}
    const document = {querySelector: () => panel, getElementById: node, addEventListener: vi.fn()}
    let snapshot = initial
    const calls: Array<{url: string; options: any}> = []
    const fetcher = vi.fn(async (url: string, options: any = {}) => {
        calls.push({url, options})
        if (url.endsWith('/desktop/status')) return {ok: true, json: async () => ({csrfToken: 'synthetic-csrf'})}
        if (url.endsWith('/jm/connect')) {
            snapshot = {available: true, enabled: true, configured: true, remembered: true, username: 'fixture-user', verification: 'CACHED'}
            return {ok: true, json: async () => ({configured: true})}
        }
        return {ok: true, json: async () => snapshot}
    })
    const source = fs.readFileSync('web/jm-account.js', 'utf8')
    const ast = ts.createSourceFile('jm-account.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const imports = ast.statements.filter(ts.isImportDeclaration)
    expect(imports).toHaveLength(1)
    expect((imports[0].moduleSpecifier as ts.StringLiteral).text).toBe('./locale-runtime.js')
    const code = source.slice(0, imports[0].getStart(ast)) + source.slice(imports[0].end)
    const actual = new Function('t', 'document', 'fetch', 'Node', 'window', code + '\nreturn {refresh, run, busy: () => busy};')(
        (...values: string[]) => values[locale], document, fetcher, {TEXT_NODE: 3}, {dispatchEvent: vi.fn()}
    ) as {refresh(): Promise<void>; run(task: () => Promise<void>): Promise<void>; busy(): boolean}
    return {actual, node, panel, calls}
}

describe('actual JM settings module with fake DOM/transport, no browser/server', () => {
    for (const locale of [0, 1, 2]) {
        it(`shows remembered state without connecting; explicit connect posts CSRF once in locale ${locale}`, async () => {
            const f = screen(locale, {available: true, enabled: true, configured: false, remembered: true, verification: 'NOT_CHECKED'})
            expect(f.calls).toHaveLength(0)
            f.panel.handlers.toggle()
            await vi.waitFor(() => expect(f.actual.busy()).toBe(false))
            expect(f.calls.map(call => call.url)).toEqual(['/api/v1/desktop/status', '/api/v1/desktop/sources/jm/status'])
            expect(f.calls.every(call => call.options.method !== 'POST')).toBe(true)
            expect(f.node('jm-account-state').textContent).toContain(['已保存登录', 'Sign-in saved', 'ログイン保存済み'][locale])
            f.node('jm-connect').handlers.click()
            // Duplicate click while active is ignored by the actual run() busy boundary.
            f.node('jm-connect').handlers.click()
            await vi.waitFor(() => expect(f.actual.busy()).toBe(false))
            const posts = f.calls.filter(call => call.options.method === 'POST')
            expect(posts).toHaveLength(1)
            expect(posts[0].url).toBe('/api/v1/desktop/sources/jm/connect')
            expect(posts[0].options.headers['x-pica-csrf']).toBe('synthetic-csrf')
            expect(posts[0].options.body).toBe('{}')
            expect(f.node('jm-account-state').textContent).toContain(['本地缓存状态', 'Cached locally', '端末内の記録'][locale])
            expect(f.calls.some(call => call.url.endsWith('/login'))).toBe(false)
        })
    }
    it('keeps disabled/missing/anonymous states distinct and binds a real button', async () => {
        for (const [snapshot, text] of [
            [{available: true, enabled: false, remembered: true}, '来源已关闭'],
            [{available: false, enabled: true}, '尚未包含 JM'],
            [{available: true, enabled: true, configured: false}, '尚未登录']
        ] as const) {
            const f = screen(0, snapshot)
            await f.actual.run(f.actual.refresh)
            expect(f.node('jm-account-state').textContent).toContain(text)
            expect(f.calls.some(call => call.options.method === 'POST')).toBe(false)
        }
        expect(fs.readFileSync('web/index.html', 'utf8')).toContain('id="jm-connect"')
        const api = fs.readFileSync('src/library/server.ts', 'utf8')
        const status = api.slice(api.indexOf("if (action === 'status'"), api.indexOf("if (request.method === 'POST')", api.indexOf("if (action === 'status'")))
        expect(status).toContain('jmAccountStatus()')
        expect(status).not.toContain('jmConnectAccount')
        expect(api).toContain("if (action === 'connect')")
        expect(api).toContain('JM connect accepts no credential or source-choice fields')
    })
})
