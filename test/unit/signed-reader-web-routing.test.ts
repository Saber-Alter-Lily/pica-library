import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { isSignedReaderComicId } from '../../web/signed-reader-route.js'

const app = fs.readFileSync('web/app.js', 'utf8')
const parsed = ts.createSourceFile(
    'app.js', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS
)
const readerFunction = parsed.statements.find(node =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'openReaderComic'
)
if (!readerFunction)
    throw new Error('Actual Web Reader entrypoint was not found')

const session = '64d223e0-5d29-4320-babb-5a2da654d345'
const legacyId = 'eh:123:abcdef1234'
const signedRoot = '/api/v1/desktop/signed-reader/' + session

function actualWebReader() {
    const elements = new Map<string, Record<string, any>>()
    const $ = (selector: string) => {
        let element = elements.get(selector)
        if (!element) {
            element = {
                textContent: '', innerHTML: '', hidden: false,
                replaceChildren: vi.fn()
            }
            elements.set(selector, element)
        }
        return element
    }
    const api = vi.fn(async (url: string, options?: unknown) => {
        if (url === signedRoot + '/comics/' +
            encodeURIComponent(legacyId) + '/chapters')
            return [{ id: 'eh-123', title: 'Owned legacy E-H chapter' }]
        if (url === signedRoot + '/progress')
            return [{ comicId: legacyId, episodeId: 'eh-123', pageIndex: 1 }]
        throw new Error('Unexpected Reader API route: ' + url +
            ' ' + JSON.stringify(options))
    })
    const chapter = vi.fn(async (_episode: string) => undefined)
    const state = {
        reader: { originView: 'library' },
        records: [{ comicId: legacyId, title: 'Saved E-H gallery' }]
    }
    const context = {
        state,
        isSignedReaderComicId,
        activeView: 'library',
        readerComicRequest: 0, readerChapterRequest: 0,
        resetReaderViewportTracking: vi.fn(),
        flushReaderProgress: vi.fn(async () => true),
        readerApiRoot: () => {
            const active = (context.state.reader as any).signedSessionId
            return active ? '/api/v1/desktop/signed-reader/' + active
                : '/api/v1/online-reader'
        },
        activateView: vi.fn(),
        document: { body: { classList: { add: vi.fn() } } },
        $,
        api,
        t: (key: string) => key,
        desktop: { csrfToken: 'owned-test-csrf' },
        openReaderChapter: chapter,
        escapeHtml: (value: unknown) => String(value),
        localizeError: (_language: string, error: Error) => error.message,
        language: 'en'
    }
    const fn = vm.runInNewContext(
        '(' + readerFunction.getText(parsed) + ')', context
    ) as (comicId: string, online: boolean, hosted: null,
        signed: { sessionId: string; csrfToken: string }) => Promise<void>
    return { fn, context, api, chapter, $, state }
}

describe('real common Web Reader accepts signed source-neutral legacy IDs', () => {
    it.each([
        'demo:book1',
        'eh:123:abcdef1234',
        'eh:000123:ABCDEF1234',
        'my-source:opaque_23',
        'my-source:key_a:key_b'
    ])('accepts a bounded signed route identifier %s', id => {
        expect(isSignedReaderComicId(id)).toBe(true)
    })

    it.each([
        '', 'local:ownbook', 'hosted:session', 'http:host',
        'https:host', 'file:page', 'data:payload',
        'eh:', 'eh:123:', 'eh:123:part:extra',
        'demo:/etc/passwd', 'demo:book?token=1',
        'demo:book#fragment', 'demo:%2e%2e',
        'demo:bad.path', 'demo:space here',
        'demo:with\nline', 'demo:' + 'x'.repeat(129),
        'demo:part:' + 'x'.repeat(129)
    ])('rejects an invalid or unowned UI route string %s', id => {
        expect(isSignedReaderComicId(id)).toBe(false)
    })

    it('follows the actual signed Reader request chain using the unchanged old E-H ID', async () => {
        expect(app).toContain("from './signed-reader-route.js'")
        expect(app).toContain('!isSignedReaderComicId(comicId)')
        const h = actualWebReader()
        await h.fn(legacyId, true, null, {
            sessionId: session, csrfToken: 'owned-test-csrf'
        })
        expect(h.api).toHaveBeenCalledTimes(2)
        expect(h.api).toHaveBeenCalledWith(
            signedRoot + '/comics/eh%3A123%3Aabcdef1234/chapters',
            { headers: { 'x-pica-csrf': 'owned-test-csrf' } }
        )
        expect(h.api).toHaveBeenCalledWith(signedRoot + '/progress',
            { headers: { 'x-pica-csrf': 'owned-test-csrf' } })
        expect(h.chapter).toHaveBeenCalledExactlyOnceWith('eh-123')
        expect((h.state.reader as any).comicId).toBe(legacyId)
        expect((h.state.reader as any).signedSessionId).toBe(session)
        expect(h.$('#reader-title').textContent).toBe('Saved E-H gallery')
        expect(h.$('#reader-message').textContent)
            .not.toContain('Invalid signed')
    })

    it('rejects path-like identity and stale session before changing the Reader or making a request', async () => {
        const h = actualWebReader()
        await expect(h.fn('eh:123:abcdef1234/extra', true, null,
            { sessionId: session, csrfToken: 'owned-test-csrf' }))
            .rejects.toThrow('Invalid signed reading route')
        await expect(h.fn(legacyId, true, null,
            { sessionId: 'missing', csrfToken: 'owned-test-csrf' }))
            .rejects.toThrow('Invalid signed reading route')
        expect(h.api).not.toHaveBeenCalled()
        expect(h.context.resetReaderViewportTracking).not.toHaveBeenCalled()
        expect(h.context.activateView).not.toHaveBeenCalled()
    })
})
