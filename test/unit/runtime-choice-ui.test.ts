import fs from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
function fixture(locale = 0, accepted = true) {
    const nodes = new Map<string, any>(),
        get = (id: string) => {
            if (!nodes.has(id))
                nodes.set(id, {
                    disabled: false,
                    textContent: '',
                    handlers: {} as Record<string, () => void>,
                    addEventListener(name: string, fn: () => void) {
                        this.handlers[name] = fn
                    }
                })
            return nodes.get(id)!
        }
    const listeners: Record<string, () => void> = {},
        document = {
            getElementById: get,
            addEventListener(name: string, fn: () => void) {
                listeners[name] = fn
            }
        }
    const plan = {
        status: 'preview',
        id: '11111111-1111-4111-8111-111111111111',
        from: { formatVersion: 1, sourceRuntimes: [] },
        to: { formatVersion: 1, sourceRuntimes: ['jm'] },
        version: '0.5.1',
        archiveSha256: 'a'.repeat(64),
        bytes: 1048576,
        sourceEnablement: 'unchanged',
        accountsAndData: 'retained',
        replacement: 'complete-application'
    }
    const value = {
        id: 'synthetic-staged-id',
        mode: 'full-application',
        targetVersion: '0.5.1',
        archiveSha256: 'a'.repeat(64),
        expectedRuntimeComposition: plan.to
    }
    const post = vi.fn(async (url: string) =>
            url.endsWith('/plan') ? plan : value
        ),
        confirm = vi.fn(async () => accepted),
        staged = vi.fn(),
        apply = vi.fn(async () => {})
    const source = fs.readFileSync('web/runtime-choice.js', 'utf8'),
        ast = ts.createSourceFile(
            'runtime-choice.js',
            source,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.JS
        )
    const imports = ast.statements.filter(ts.isImportDeclaration)
    expect(imports).toHaveLength(1)
    expect((imports[0].moduleSpecifier as ts.StringLiteral).text).toBe(
        './locale-runtime.js'
    )
    const body = source
        .slice(imports[0].end)
        .replace(
            'export function installRuntimeChoice',
            'function installRuntimeChoice'
        )
    const install = new Function('t', body + '; return installRuntimeChoice;')(
        (...values: string[]) => values[locale]
    )
    const desktop = vi.fn(() => true),
        busy = vi.fn(() => false)
    install({
        post,
        confirm,
        isDesktop: desktop,
        isUpdateBusy: busy,
        staged,
        apply,
        document
    })
    return {
        get,
        post,
        confirm,
        staged,
        apply,
        desktop,
        busy,
        listeners,
        plan,
        value
    }
}
describe('actual runtime-choice UI with fake DOM/ports, no browser or server', () => {
    it.each([0, 1, 2])(
        'is passive at install and requires separate consent before prepare/apply in locale %s',
        async (locale) => {
            const f = fixture(locale)
            expect(f.post).not.toHaveBeenCalled()
            f.get('runtime-choice-jm').handlers.click()
            await vi.waitFor(() => expect(f.apply).toHaveBeenCalledTimes(1))
            expect(f.post.mock.calls.map((call) => call[0])).toEqual([
                '/api/v1/update/runtime-choice/plan',
                '/api/v1/update/runtime-choice/prepare'
            ])
            expect(f.confirm).toHaveBeenCalledTimes(1)
            expect(f.staged).toHaveBeenCalledWith(f.value)
            expect(f.apply).toHaveBeenCalledWith(f.value, true)
            expect(f.get('runtime-choice-help').textContent).toContain(
                [
                    '不会自动启用来源',
                    'does not enable a source',
                    '配信元の有効化'
                ][locale]
            )
            expect(f.get('runtime-choice-jm').disabled).toBe(false)
            expect(
                f.post.mock.calls.some((call) => call[0].includes('/sources/'))
            ).toBe(false)
        }
    )
    it('cancelled confirmation never downloads, stages, applies or enables a source', async () => {
        const f = fixture(0, false)
        f.get('runtime-choice-jm').handlers.click()
        await vi.waitFor(() =>
            expect(f.get('runtime-choice-message').textContent).toContain(
                '已取消'
            )
        )
        expect(f.post).toHaveBeenCalledTimes(1)
        expect(f.apply).not.toHaveBeenCalled()
        expect(f.staged).not.toHaveBeenCalled()
    })
    it('guards double clicks, wrong staged digest and non-Desktop callers', async () => {
        const f = fixture()
        f.value.archiveSha256 = 'b'.repeat(64)
        f.get('runtime-choice-jm').handlers.click()
        f.get('runtime-choice-core').handlers.click()
        await vi.waitFor(() =>
            expect(f.get('runtime-choice-message').textContent).toContain(
                'does not match'
            )
        )
        expect(f.post).toHaveBeenCalledTimes(2)
        expect(f.apply).not.toHaveBeenCalled()
        const g = fixture()
        g.desktop.mockReturnValue(false)
        g.get('runtime-choice-jm').handlers.click()
        expect(g.post).not.toHaveBeenCalled()
        expect(g.get('runtime-choice-message').textContent).toContain(
            '本机 Windows'
        )
    })
})
