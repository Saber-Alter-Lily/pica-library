import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { build } from 'esbuild'
import { describe, expect, it, vi } from 'vitest'
import { normalizeUpdatePath } from '../../src/update/path-safety'
import {
    readerKeyboardAction,
    readerPageIndex
} from '../../web/reader-input.js'

const defaults = {
    active: true,
    blocked: false,
    fullscreen: false,
    mode: 'single'
}
const app = fs.readFileSync('web/app.js', 'utf8')
const source = ts.createSourceFile(
    'app.js',
    app,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
)
const callbacks: string[] = []
let movement = ''
function inspect(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'moveReader')
        movement = node.getText(source)
    if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === 'document.addEventListener' &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === 'keydown'
    )
        callbacks.push(node.arguments[1].getText(source))
    ts.forEachChild(node, inspect)
}
inspect(source)

class InputTarget {
    constructor(
        public selector = '',
        public isContentEditable = false
    ) {}
    closest = vi.fn((selector: string): InputTarget | null =>
        selector.split(', ').includes(this.selector) ? this : null
    )
}
function harness(
    options: {
        modal?: boolean
        guide?: boolean
        fullscreen?: boolean
        mode?: string
        direction?: string
        pageIndex?: number
        total?: number
        active?: boolean
    } = {}
) {
    const reader = {
        pageIndex: options.pageIndex ?? 3,
        chapter: { pages: new Array(options.total ?? 10) }
    }
    const renderReaderPages = vi.fn(),
        exitReader = vi.fn()
    const controls: Record<string, { value: string }> = {
        '#reader-mode': { value: options.mode ?? 'single' },
        '#reader-direction': { value: options.direction ?? 'ltr' }
    }
    const context = vm.createContext({
        state: { reader },
        activeView: options.active === false ? 'library' : 'reader',
        readerKeyboardAction,
        readerPageIndex,
        renderReaderPages,
        exitReader,
        Element: InputTarget,
        $: (selector: string) => controls[selector],
        document: {
            fullscreenElement: options.fullscreen ? {} : null,
            querySelector: vi.fn((selector: string) =>
                selector === 'dialog[open]' && options.modal ? {} : null
            ),
            body: {
                classList: {
                    contains: (name: string) =>
                        name === 'driver-active' && Boolean(options.guide)
                }
            }
        }
    })
    // Execute only the actual two Reader functions, never app.js startup or a browser.
    context.moveReader = vm.runInContext('(' + movement + ')', context)
    const listener = vm.runInContext('(' + callbacks[0] + ')', context)
    return {
        reader,
        renderReaderPages,
        exitReader,
        context,
        dispatch(key: string, fields: Record<string, unknown> = {}) {
            const event = {
                key,
                target: new InputTarget(),
                preventDefault: vi.fn(),
                ...fields
            }
            listener(event)
            return event
        }
    }
}

describe('pure shared Web Reader input policy', () => {
    it('uses the existing full-Web package copy and one application update allowlist', () => {
        expect(
            fs.readFileSync('scripts/build-windows-package.ps1', 'utf8')
        ).toContain(
            "Copy-Item -LiteralPath (Join-Path $root 'web') -Destination $stage -Recurse"
        )
        expect(normalizeUpdatePath('web/reader-input.js')).toBe(
            'web/reader-input.js'
        )
        expect(
            JSON.parse(
                fs.readFileSync('src/modules/runtime-contracts.json', 'utf8')
            ).apis.reader
        ).toBe(1)
    })
    it('bundles alone without DOM, provider, storage, network or a gesture library', async () => {
        const result = await build({
            entryPoints: ['web/reader-input.js'],
            bundle: true,
            platform: 'browser',
            format: 'esm',
            write: false,
            metafile: true,
            logLevel: 'silent'
        })
        expect(Object.keys(result.metafile!.inputs)).toEqual([
            'web/reader-input.js'
        ])
        expect(result.outputFiles).toHaveLength(1)
    })
    for (const mode of ['single', 'double'])
        for (const [key, delta] of [
            ['ArrowLeft', -1],
            ['PageUp', -1],
            ['ArrowRight', 1],
            ['PageDown', 1]
        ] as const)
            it(`${mode} maps ${key} to the existing physical ${delta} direction`, () => {
                expect(
                    readerKeyboardAction({ key }, { ...defaults, mode })
                ).toBe(delta)
            })
    for (const flag of [
        'defaultPrevented',
        'isComposing',
        'altKey',
        'ctrlKey',
        'metaKey',
        'shiftKey'
    ])
        it(`leaves ${flag} events to their owner`, () => {
            for (const key of [
                'ArrowLeft',
                'ArrowRight',
                'PageUp',
                'PageDown',
                'Escape'
            ])
                expect(
                    readerKeyboardAction({ key, [flag]: true }, defaults)
                ).toBeNull()
        })
    it('leaves legacy IME processing events alone', () => {
        expect(
            readerKeyboardAction({ key: 'ArrowRight', keyCode: 229 }, defaults)
        ).toBeNull()
    })
    it('does nothing outside the Reader or under another input owner', () => {
        for (const key of ['Escape', 'ArrowRight']) {
            expect(
                readerKeyboardAction({ key }, { ...defaults, active: false })
            ).toBeNull()
            expect(
                readerKeyboardAction({ key }, { ...defaults, blocked: true })
            ).toBeNull()
        }
    })
    it('retains continuous-scroll keys, ordinary keys and fullscreen Escape for the browser', () => {
        for (const key of ['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'])
            expect(
                readerKeyboardAction({ key }, { ...defaults, mode: 'vertical' })
            ).toBeNull()
        expect(
            readerKeyboardAction(
                { key: 'Escape' },
                { ...defaults, fullscreen: true }
            )
        ).toBeNull()
        for (const key of ['Tab', 'Enter', ' ', 'Home', 'End', 'x'])
            expect(readerKeyboardAction({ key }, defaults)).toBeNull()
        expect(
            readerKeyboardAction(
                { key: 'ArrowLeft' },
                { ...defaults, mode: 'unknown' }
            )
        ).toBeNull()
    })
    it('allows ordinary Escape in both paged and continuous reading', () => {
        for (const mode of ['single', 'double', 'vertical'])
            expect(
                readerKeyboardAction({ key: 'Escape' }, { ...defaults, mode })
            ).toBe('exit')
    })
    for (const mode of ['single', 'double'])
        for (const direction of ['ltr', 'rtl'])
            for (const delta of [-1, 1])
                it(`retains the prior bounded ${mode}/${direction}/${delta} calculation`, () => {
                    for (let total = 1; total <= 20; total++)
                        for (
                            let pageIndex = 0;
                            pageIndex < total;
                            pageIndex++
                        ) {
                            const prior = Math.max(
                                0,
                                Math.min(
                                    total - 1,
                                    pageIndex +
                                        delta *
                                            (mode === 'double' ? 2 : 1) *
                                            (direction === 'rtl' ? -1 : 1)
                                )
                            )
                            expect(
                                readerPageIndex(
                                    { pageIndex, total, mode, direction },
                                    delta
                                )
                            ).toBe(prior)
                        }
                })
    it('refuses invalid pages, counts, modes, direction and non-unit moves without mutation', () => {
        const normal = {
            pageIndex: 0,
            total: 10,
            mode: 'single',
            direction: 'ltr'
        }
        for (const overrides of [
            { pageIndex: -1 },
            { pageIndex: NaN },
            { pageIndex: 10 },
            { pageIndex: 0.5 },
            { total: 0 },
            { total: Infinity },
            { total: 1.2 },
            { mode: 'vertical' },
            { mode: 'bad' },
            { direction: 'bad' }
        ])
            expect(readerPageIndex({ ...normal, ...overrides }, 1)).toBeNull()
        for (const delta of [0, NaN, Infinity, 2])
            expect(readerPageIndex(normal, delta)).toBeNull()
        expect(normal).toEqual({
            pageIndex: 0,
            total: 10,
            mode: 'single',
            direction: 'ltr'
        })
    })
})

describe('actual app Reader keyboard adapter (isolated VM, not browser execution)', () => {
    it('has exactly one document listener and reuses the pure movement policy', () => {
        expect(callbacks).toHaveLength(1)
        expect(movement).toContain('readerPageIndex({')
        expect(callbacks[0]).toContain('readerKeyboardAction(event, {')
    })
    it('moves and prevents default only for an owned ordinary page key', () => {
        const h = harness(),
            event = h.dispatch('ArrowRight')
        expect(h.reader.pageIndex).toBe(4)
        expect(h.renderReaderPages).toHaveBeenCalledOnce()
        expect(h.exitReader).not.toHaveBeenCalled()
        expect(event.preventDefault).toHaveBeenCalledOnce()
    })
    for (const options of [{ modal: true }, { guide: true }, { active: false }])
        it(`does not move or exit behind another surface ${JSON.stringify(options)}`, () => {
            const h = harness(options)
            for (const key of ['ArrowRight', 'PageDown', 'Escape'])
                expect(h.dispatch(key).preventDefault).not.toHaveBeenCalled()
            expect(h.reader.pageIndex).toBe(3)
            expect(h.renderReaderPages).not.toHaveBeenCalled()
            expect(h.exitReader).not.toHaveBeenCalled()
        })
    for (const selector of [
        'input',
        'select',
        'textarea',
        '[role="textbox"]',
        '[role="slider"]',
        '[role="tablist"]'
    ])
        it(`leaves editing/widget target ${selector} untouched`, () => {
            const h = harness(),
                target = new InputTarget(selector)
            for (const key of ['ArrowLeft', 'Escape'])
                expect(
                    h.dispatch(key, { target }).preventDefault
                ).not.toHaveBeenCalled()
            expect(h.reader.pageIndex).toBe(3)
            expect(h.exitReader).not.toHaveBeenCalled()
            expect(target.closest).toHaveBeenCalled()
        })
    it('honors inherited editable state and a retargeted shadow-tree control', () => {
        const h = harness()
        expect(
            h.dispatch('ArrowRight', { target: new InputTarget('', true) })
                .preventDefault
        ).not.toHaveBeenCalled()
        expect(
            h.dispatch('ArrowRight', {
                composedPath: () => [
                    new InputTarget('input'),
                    new InputTarget()
                ]
            }).preventDefault
        ).not.toHaveBeenCalled()
        expect(h.reader.pageIndex).toBe(3)
    })
    it('retains browser defaults during composition, modifier chords and handled events', () => {
        const h = harness()
        for (const fields of [
            { isComposing: true },
            { keyCode: 229 },
            { defaultPrevented: true },
            { ctrlKey: true },
            { altKey: true },
            { metaKey: true },
            { shiftKey: true }
        ])
            expect(
                h.dispatch('ArrowRight', fields).preventDefault
            ).not.toHaveBeenCalled()
        expect(h.renderReaderPages).not.toHaveBeenCalled()
    })
    it('leaves vertical PageDown and fullscreen Escape to the browser', () => {
        const vertical = harness({ mode: 'vertical' }),
            full = harness({ fullscreen: true })
        expect(
            vertical.dispatch('PageDown').preventDefault
        ).not.toHaveBeenCalled()
        expect(vertical.reader.pageIndex).toBe(3)
        expect(full.dispatch('Escape').preventDefault).not.toHaveBeenCalled()
        expect(full.exitReader).not.toHaveBeenCalled()
        expect(
            vertical.dispatch('Escape').preventDefault
        ).toHaveBeenCalledOnce()
        expect(vertical.exitReader).toHaveBeenCalledOnce()
    })
    it('does not redraw or enqueue progress again at an unchanged page boundary', () => {
        const h = harness({ pageIndex: 0 })
        h.dispatch('ArrowLeft')
        expect(h.reader.pageIndex).toBe(0)
        expect(h.renderReaderPages).not.toHaveBeenCalled()
    })
    it('uses the same Reader path without examining any provider/session identity', () => {
        const h = harness({ mode: 'double', direction: 'rtl', pageIndex: 6 })
        for (const name of ['online', 'hostedSessionId', 'comicId'])
            Object.defineProperty(h.reader, name, {
                get() {
                    throw new Error('Source ownership leaked into input')
                }
            })
        h.dispatch('ArrowRight')
        expect(h.reader.pageIndex).toBe(4)
        expect(h.renderReaderPages).toHaveBeenCalledOnce()
    })
})
