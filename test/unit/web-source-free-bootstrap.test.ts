import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { translations } from '../../web/i18n.js'

const app = fs.readFileSync(path.resolve('web/app.js'), 'utf8')
const source = ts.createSourceFile(
    'web/app.js', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS
)

function actualFunction(name: string) {
    const result = source.statements.find(
        node => ts.isFunctionDeclaration(node) && node.name?.text === name
    )
    if (!result) throw new Error('Missing production Web function: ' + name)
    return result.getText(source)
}

type Capabilities = {
    features: { recommendationSessions: boolean }
}
function simulateDetect(capabilities: Capabilities | null) {
    const requests: string[] = []
    const posts: string[] = []
    const nodes = new Map<string, Record<string, unknown>>()
    const node = (selector: string) => {
        if (!nodes.has(selector)) nodes.set(selector, { value: 'latest', textContent: '' })
        return nodes.get(selector)!
    }
    const state = {
        mode: 'lite', capabilities, records: [], authors: [],
        recommendations: [], appSessionId: 'fixture-session'
    }
    const recommendationFeedback = vi.fn(async () => undefined)
    const render = vi.fn()
    const queries = vi.fn(async () => undefined)
    const api = vi.fn(async (url: string) => {
        requests.push(url)
        if (url === '/api/v1/status') return { summary: { comics: 1 } }
        if (url.startsWith('/api/v1/comics')) return [{ comicId: 'local:fixture' }]
        if (url === '/api/v1/authors') return []
        if (url === '/api/v1/recommendation-sessions/status?mode=final')
            return { activeCycleId: null, buildingCycleId: null }
        throw new Error('Unexpected production API request: ' + url)
    })
    const post = vi.fn(async (url: string) => {
        posts.push(url)
        return { activeCycleId: null }
    })
    const context = {
        state, api, post,
        URLSearchParams, location: { search: '' },
        document: { body: { classList: { add: vi.fn() } } },
        loadDesktop: vi.fn(async () => undefined),
        loadLiteState: vi.fn(async () => ({})),
        replaceLiteState: vi.fn(),
        loadRecommendationFeedback: recommendationFeedback,
        renderAll: render, loadLibraryQuery: queries,
        renderPreparedRecommendations: vi.fn(),
        showOperationToast: vi.fn(),
        ensureConnectedEngine: vi.fn(async () => false),
        deriveAuthors: vi.fn(), activateView: vi.fn(),
        loadChronicle: vi.fn(async () => undefined),
        applyManagedRecommendationBatch: vi.fn(),
        recommendationRequestId: vi.fn(() => 'fixture'),
        t: (key: string) => key,
        localizeError: (_lang: string, error: Error) => error.message,
        language: 'en',
        $: node, $$: vi.fn(() => [])
    }
    const factory = new Function('context', `
        const { state, api, post, URLSearchParams, location, document,
            loadDesktop, loadLiteState, replaceLiteState, loadRecommendationFeedback,
            renderAll, loadLibraryQuery, renderPreparedRecommendations,
            showOperationToast, ensureConnectedEngine, deriveAuthors, activateView,
            loadChronicle, applyManagedRecommendationBatch, recommendationRequestId,
            t, localizeError, language, $, $$ } = context;
        let desktop = { configured: true, picaAccount: { configured: false },
            ehAccount: { configured: false } };
        let activeView = 'home';
        return (${actualFunction('detect')});
    `) as (context: typeof context) => () => Promise<void>
    return {
        run: factory(context), requests, posts,
        state, nodes, queries, render, recommendationFeedback
    }
}

describe('real full Web application source-free bootstrap gate', () => {
    it('loads local SQLite catalogue and authors without touching any recommendation API in explicit core mode', async () => {
        const sample = simulateDetect({ features: { recommendationSessions: false } })
        await sample.run()
        expect(sample.state.mode).toBe('connected')
        expect(sample.requests).toEqual([
            '/api/v1/status', '/api/v1/comics?limit=5000', '/api/v1/authors'
        ])
        expect(sample.posts).toEqual([])
        expect(sample.queries).toHaveBeenCalledOnce()
        expect(sample.render).toHaveBeenCalled()
        expect(sample.recommendationFeedback).not.toHaveBeenCalled()
        expect(sample.nodes.get('#recommend-message')?.textContent)
            .toBe('message.coreOnlyRecommendations')
    })

    it('does not change provider-enabled Desktop recommendation initialization', async () => {
        const sample = simulateDetect({ features: { recommendationSessions: true } })
        await sample.run()
        expect(sample.requests).toContain(
            '/api/v1/recommendation-sessions/status?mode=final'
        )
        expect(sample.recommendationFeedback).toHaveBeenCalledOnce()
        expect(sample.nodes.get('#recommend-message')?.textContent)
            .not.toBe('message.coreOnlyRecommendations')
    })

    it('retains legacy Desktop initialization when capability data is absent', async () => {
        const sample = simulateDetect(null)
        await sample.run()
        expect(sample.recommendationFeedback).toHaveBeenCalledOnce()
        expect(sample.requests).toContain(
            '/api/v1/recommendation-sessions/status?mode=final'
        )
    })

    it('loads capabilities even when the standalone core does not provide Desktop host status', async () => {
        const requests: string[] = []
        const state: { capabilities: Capabilities | null } = {
            capabilities: null
        }
        const api = vi.fn(async (url: string) => {
            requests.push(url)
            if (url === '/api/v1/desktop/status')
                throw new Error('Not a Desktop-host runtime')
            if (url === '/api/v1/capabilities')
                return { features: { recommendationSessions: false } }
            throw new Error('Unexpected API')
        })
        const factory = new Function('state', 'api', `
            let desktop = null, readerSettingsEditVersion = 0;
            return {
                run: (${actualFunction('loadDesktop')}),
                getDesktop: () => desktop
            };
        `) as (state: typeof state, api: typeof api) => {
            run(): Promise<void>
            getDesktop(): unknown
        }
        const candidate = factory(state, api)
        await candidate.run()
        expect(requests).toEqual([
            '/api/v1/desktop/status', '/api/v1/capabilities'
        ])
        expect(candidate.getDesktop()).toBeNull()
        expect(state.capabilities?.features.recommendationSessions).toBe(false)
    })

    it('uses complete zh-CN, en and Japanese source-free guidance without raw fallback keys', () => {
        for (const language of ['zh-CN', 'en', 'ja'] as const) {
            const translation = translations[language]['message.coreOnlyRecommendations']
            expect(translation).toBeTruthy()
            expect(translation).not.toBe('message.coreOnlyRecommendations')
            expect(translation.length).toBeGreaterThan(20)
        }
    })
})
