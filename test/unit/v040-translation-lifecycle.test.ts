import fs from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { runtimeChoiceBrowserRequestEvidence } from '../../scripts/lib/runtime-choice-fixture.mjs'

// Execute the whole shipped module, replacing only its locale import and browser
// ports. No browser, application, listener or real fetch is created by this test.
function fixture(enabled: string[] = []) {
    const nodes = new Map<string, FixtureElement>()
    const documentListeners = new Map<string, Array<(event: any) => unknown>>()
    const timers = new Map<number, () => void>()
    let timerId = 0
    class FixtureElement {
        id = ''
        value = ''
        hidden = false
        disabled = false
        textContent = ''
        title = ''
        dataset: Record<string, string> = {}
        classList = { add() {} }
        onclick: null | (() => unknown) = null
        onchange: unknown = null
        descendants: string[] = []
        listeners = new Map<string, Array<(event: any) => unknown>>()
        html = ''
        set innerHTML(value: string) {
            this.html = value
            for (const match of value.matchAll(/id="([^"]+)"/g)) {
                const node = new FixtureElement()
                node.id = match[1]
                nodes.set(node.id, node)
                this.descendants.push(node.id)
            }
        }
        get innerHTML() { return this.html }
        append(node: FixtureElement) { if (node.id) nodes.set(node.id, node) }
        remove() {
            nodes.delete(this.id)
            for (const id of this.descendants) nodes.delete(id)
        }
        matches() { return false }
        querySelector(selector: string): FixtureElement | null {
            return this.id === 'search' && selector === '.toolbar' ? toolbar : null
        }
        querySelectorAll(selector: string) {
            if (selector !== '[data-eh-mode]') return []
            return ['latest', 'popular', 'favorites', 'watched', 'toplist'].map(mode => {
                const node = new FixtureElement()
                node.dataset.ehMode = mode
                return node
            })
        }
        addEventListener(name: string, listener: (event: any) => unknown) {
            this.listeners.set(name, [...(this.listeners.get(name) || []), listener])
        }
        dispatch(name: string) {
            for (const listener of this.listeners.get(name) || []) listener({ target: this })
        }
        click() { return this.onclick?.() }
    }
    const toolbar = new FixtureElement()
    for (const id of ['search', 'search-provider', 'search-button']) {
        const node = new FixtureElement()
        node.id = id
        nodes.set(id, node)
    }
    nodes.get('search-provider')!.value = 'all'
    const document = {
        readyState: 'complete',
        body: new FixtureElement(),
        head: new FixtureElement(),
        querySelector: (selector: string) => selector.startsWith('#') ? nodes.get(selector.slice(1)) || null : null,
        querySelectorAll: (_selector: string) => [],
        getElementById: (id: string) => nodes.get(id) || null,
        createElement: (_name: string) => new FixtureElement(),
        addEventListener(name: string, listener: (event: any) => unknown) {
            documentListeners.set(name, [...(documentListeners.get(name) || []), listener])
        }
    }
    const dictionary = {
        data: [{
            namespace: 'female',
            data: Object.fromEntries(Array.from({ length: 1001 }, (_, i) => ['fixture-' + i, { name: '翻译-' + i }]))
        }]
    }
    const fetch = vi.fn(async (input: unknown, _init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/v1/capabilities')
            return new Response(JSON.stringify({ externalSources: { schemaVersion: 1, revision: 3, enabled } }))
        if (url.endsWith('/sha')) return new Response('a'.repeat(40))
        if (url.endsWith('/db.text.json')) return new Response(JSON.stringify(dictionary))
        throw Error('Unconfigured inert fetch: ' + url)
    })
    const context = vm.createContext({
        window: { fetch }, document, Element: FixtureElement,
        MutationObserver: class { observe() {} },
        t: (zh: string) => zh, currentLanguage: () => 'zh-CN',
        AbortController, DOMException,
        setTimeout: (fn: () => void) => { timers.set(++timerId, fn); return timerId },
        clearTimeout: (id: number) => timers.delete(id),
        requestAnimationFrame: (fn: () => void) => { fn(); return 1 }
    })
    const source = fs.readFileSync('web/v040-parity.js', 'utf8')
    const executable = source.replace(/^import \{ copy as t, currentLanguage \} from '\.\/locale-runtime\.js'\r?\n/, '')
    expect(executable).not.toBe(source)
    new vm.Script(executable, { filename: 'actual-v040-parity.js' }).runInContext(context)
    return {
        fetch, nodes, context, dictionary, timers,
        dispatch(name: string, detail?: unknown) {
            for (const listener of documentListeners.get(name) || []) listener({ detail })
        },
        select(value: string) {
            const provider = nodes.get('search-provider')!
            provider.value = value
            provider.dispatch('change')
        },
        externalCalls: () => fetch.mock.calls.filter(([url]) => /^https?:/.test(String(url)))
    }
}

describe('actual parity module keeps optional translation networking explicit', () => {
    it('boots a normal local-reader shell without translation, capability or provider requests', () => {
        const f = fixture()
        expect(f.fetch).not.toHaveBeenCalled()
    })
    it('does not make language changes or source selection grant network consent', () => {
        const f = fixture(['eh'])
        f.dispatch('pica-language-change')
        f.select('eh')
        f.select('exh')
        f.select('all')
        expect(f.fetch).not.toHaveBeenCalled()
    })
    it.each(['eh', 'exh'])('loads only after an explicit %s action and fresh enabled-source snapshot', async provider => {
        const f = fixture(['eh'])
        f.select(provider)
        await f.nodes.get('v040-eh-load-translations')!.click()
        expect(f.fetch.mock.calls.map(([url]) => url)).toEqual([
            '/api/v1/capabilities',
            'https://raw.githubusercontent.com/EhTagTranslation/DatabaseReleases/refs/heads/master/sha',
            'https://raw.githubusercontent.com/EhTagTranslation/DatabaseReleases/refs/heads/master/db.text.json'
        ])
        for (const [, options] of f.externalCalls()) {
            expect(options).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' })
            expect(options?.signal?.aborted).toBe(false)
        }
        expect(vm.runInContext('parityState.translationReady', f.context)).toBe(true)
        expect(f.nodes.get('v040-eh-load-translations')!.disabled).toBe(true)
        expect(f.timers.size).toBe(0)
        await f.nodes.get('v040-eh-load-translations')!.click()
        f.dispatch('pica-language-change')
        expect(f.fetch).toHaveBeenCalledTimes(3)
    })
    it('checks a disabled source locally but never downloads or activates it', async () => {
        const f = fixture()
        f.select('eh')
        await f.nodes.get('v040-eh-load-translations')!.click()
        expect(f.fetch).toHaveBeenCalledTimes(1)
        expect(f.externalCalls()).toHaveLength(0)
        expect(f.nodes.get('v040-eh-translation-state')!.textContent).toContain('启用 E-H')
        expect(vm.runInContext('parityState.translations.size', f.context)).toBe(0)
    })
    it.each([
        { schemaVersion: 2, revision: 0, enabled: ['eh'] },
        { schemaVersion: 1, revision: -1, enabled: ['eh'] },
        { schemaVersion: 1, revision: 0 },
        { schemaVersion: 1, revision: 0, enabled: ['unknown', 'eh'] }
    ])('fails closed for unknown or invalid source snapshots: %j', async policy => {
        const f = fixture()
        f.fetch.mockResolvedValue(new Response(JSON.stringify({ externalSources: policy })))
        f.select('eh')
        await f.nodes.get('v040-eh-load-translations')!.click()
        expect(f.externalCalls()).toHaveLength(0)
        expect(f.nodes.get('v040-eh-load-translations')!.disabled).toBe(false)
    })
    it('shares one pending explicit load instead of duplicating the downloads', async () => {
        const f = fixture(['eh'])
        const normal = f.fetch.getMockImplementation()!
        let resolvePolicy!: (response: Response) => void
        f.fetch.mockImplementation((input, init) => String(input) === '/api/v1/capabilities'
            ? new Promise<Response>(resolve => { resolvePolicy = resolve })
            : normal(input, init))
        f.select('eh')
        const first = f.nodes.get('v040-eh-load-translations')!.click()
        const second = f.nodes.get('v040-eh-load-translations')!.click()
        expect(first).toBe(second)
        expect(f.fetch).toHaveBeenCalledTimes(1)
        resolvePolicy(new Response(JSON.stringify({ externalSources: { schemaVersion: 1, revision: 3, enabled: ['eh'] } })))
        await first
        expect(f.externalCalls()).toHaveLength(2)
    })
    it('revokes before the permission response arrives without starting a download', async () => {
        const f = fixture(['eh'])
        let resolvePolicy!: (response: Response) => void
        f.fetch.mockImplementation(() => new Promise<Response>(resolve => { resolvePolicy = resolve }))
        f.select('eh')
        const pending = f.nodes.get('v040-eh-load-translations')!.click()
        f.dispatch('pica-source-choices-changed', { enabled: [] })
        expect(f.fetch.mock.calls[0][1]?.signal?.aborted).toBe(true)
        resolvePolicy(new Response(JSON.stringify({ externalSources: { schemaVersion: 1, revision: 3, enabled: ['eh'] } })))
        await pending
        expect(f.externalCalls()).toHaveLength(0)
        expect(f.timers.size).toBe(0)
    })
    it.each(['source-choice', 'provider-selection'])('aborts in-flight data and ignores late completion after %s', async change => {
        const f = fixture(['eh'])
        const normal = f.fetch.getMockImplementation()!
        let resolveData!: (response: Response) => void
        f.fetch.mockImplementation((input, init) => String(input).endsWith('/db.text.json')
            ? new Promise<Response>(resolve => { resolveData = resolve })
            : normal(input, init))
        f.select('eh')
        const pending = f.nodes.get('v040-eh-load-translations')!.click()
        await new Promise<void>(resolve => setImmediate(resolve))
        expect(resolveData).toBeTypeOf('function')
        if (change === 'source-choice') f.dispatch('pica-source-choices-changed', { enabled: [] })
        else f.select('local')
        expect(f.externalCalls().every(([, init]) => init?.signal?.aborted)).toBe(true)
        resolveData(new Response(JSON.stringify(f.dictionary)))
        await pending
        expect(vm.runInContext('parityState.translationReady', f.context)).toBe(false)
        expect(vm.runInContext('parityState.translations.size', f.context)).toBe(0)
        expect(f.timers.size).toBe(0)
    })
    it('cannot let an obsolete request replace a newer explicit result', async () => {
        const f = fixture(['eh'])
        const normal = f.fetch.getMockImplementation()!
        let resolveOld!: (response: Response) => void
        let holdFirst = true
        f.fetch.mockImplementation((input, init) => {
            if (String(input).endsWith('/db.text.json') && holdFirst) {
                holdFirst = false
                return new Promise<Response>(resolve => { resolveOld = resolve })
            }
            return normal(input, init)
        })
        f.select('eh')
        const old = f.nodes.get('v040-eh-load-translations')!.click()
        await new Promise<void>(resolve => setImmediate(resolve))
        expect(resolveOld).toBeTypeOf('function')
        f.dispatch('pica-source-choices-changed', { enabled: ['eh'], revision: 4 })
        await f.nodes.get('v040-eh-load-translations')!.click()
        expect(vm.runInContext('parityState.translationReady', f.context)).toBe(true)
        resolveOld(new Response(JSON.stringify({ data: [{ namespace: 'female', data: { old: { name: '迟到的结果' } } }] })))
        await old
        expect(vm.runInContext('parityState.translations.size', f.context)).toBe(1001)
        expect(vm.runInContext("parityState.translations.has('female:old')", f.context)).toBe(false)
        expect(f.nodes.get('v040-eh-translation-state')!.textContent).toContain('已加载')
    })
    it('bounds a pending load and leaves the original tags available after timeout', async () => {
        const f = fixture(['eh'])
        let resolvePolicy!: (response: Response) => void
        f.fetch.mockImplementation(() => new Promise<Response>(resolve => { resolvePolicy = resolve }))
        f.select('eh')
        const pending = f.nodes.get('v040-eh-load-translations')!.click()
        expect(f.timers.size).toBe(1)
        f.timers.values().next().value!()
        expect(f.fetch.mock.calls[0][1]?.signal?.aborted).toBe(true)
        resolvePolicy(new Response(JSON.stringify({ externalSources: { schemaVersion: 1, revision: 3, enabled: ['eh'] } })))
        await pending
        expect(f.externalCalls()).toHaveLength(0)
        expect(f.nodes.get('v040-eh-translation-state')!.textContent).toContain('超时')
        expect(f.nodes.get('v040-eh-load-translations')!.disabled).toBe(false)
    })
    it('does not partially publish a failed dictionary and retries only on a new action', async () => {
        const f = fixture(['eh'])
        const normal = f.fetch.getMockImplementation()!
        let fail = true
        f.fetch.mockImplementation((input, init) => String(input).endsWith('/db.text.json') && fail
            ? Promise.resolve(new Response('not valid JSON'))
            : normal(input, init))
        f.select('eh')
        await f.nodes.get('v040-eh-load-translations')!.click()
        expect(vm.runInContext('parityState.translations.size', f.context)).toBe(0)
        expect(f.nodes.get('v040-eh-translation-state')!.textContent).toContain('暂不可用')
        f.dispatch('pica-language-change')
        expect(f.fetch).toHaveBeenCalledTimes(3)
        fail = false
        await f.nodes.get('v040-eh-load-translations')!.click()
        expect(vm.runInContext('parityState.translationReady', f.context)).toBe(true)
        expect(f.fetch).toHaveBeenCalledTimes(6)
    })
})

describe('cloud request attribution remains blocking and contains no private URLs', () => {
    it.each([['sha', 'eh-translation-sha'], ['db.text.json', 'eh-translation-data']])('classifies the known translation endpoint %s', (file, requestClass) => {
        const result = runtimeChoiceBrowserRequestEvidence('https://raw.githubusercontent.com/EhTagTranslation/DatabaseReleases/refs/heads/master/' + file, 'fetch')
        expect(result).toEqual({ kind: 'EXTERNAL_BROWSER_REQUEST_BLOCKED', protocol: 'https:', resourceType: 'fetch', requestClass })
    })
    it.each([
        ['https://secret-user:secret-password@private.invalid/private-title?token=secret-token#private-work', 'https:'],
        ['file:///C:/Users/private-user/private-title', 'file:'],
        ['data:text/plain,private-title', 'data:'],
        ['not a URL private-title', 'invalid'],
        ['https://raw.githubusercontent.com.evil.invalid/EhTagTranslation/DatabaseReleases/refs/heads/master/sha', 'https:']
    ])('redacts arbitrary destinations and credentials: %s', (url, protocol) => {
        const result = runtimeChoiceBrowserRequestEvidence(url, 'private-resource')
        expect(result).toEqual({ kind: 'EXTERNAL_BROWSER_REQUEST_BLOCKED', protocol, resourceType: 'other', requestClass: 'unclassified' })
        expect(JSON.stringify(result)).not.toMatch(/private|secret|invalid\/|evil/)
    })
})
