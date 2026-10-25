import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const source = fs.readFileSync('web/app.js', 'utf8')
const ast = ts.createSourceFile('app.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const load = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'loadDesktop')?.getText(ast)
let admission: string | undefined
function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'installReadingLibrary') {
        const options = node.arguments[0]
        if (options && ts.isObjectLiteralExpression(options)) {
            const property = options.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText(ast) === 'canQuery')
            if (property && ts.isPropertyAssignment(property)) admission = property.initializer.getText(ast)
        }
    }
    ts.forEachChild(node, visit)
}
visit(ast)
if (!load || !admission) throw Error('Actual shell and Library admission functions are required')

describe('actual shell authority with only synthetic bootstrap ports', () => {
    it.each([false, true])('retains fail-closed Library admission when capability success is %s', async capabilitiesAvailable => {
        const controls = new Map<string, { value: string; textContent: string; hidden: boolean }>()
        const register = vi.fn(async () => undefined)
        const api = vi.fn(async (path: string) => {
            if (path === '/api/v1/desktop/status') return { version: 'synthetic', configured: true, startupReady: true, csrfToken: 'synthetic-csrf' }
            if (path === '/api/v1/capabilities' && capabilitiesAvailable) return { features: {}, capabilityStates: {} }
            throw Error('synthetic503')
        })
        const context = vm.createContext({
            desktop: null,
            state: { mode: 'connected', capabilities: null },
            api,
            Event: class {},
            document: { dispatchEvent: vi.fn(), querySelector: () => ({ hidden: false }), body: { classList: { add: vi.fn(), remove: vi.fn() } } },
            $: (selector: string) => { if (!controls.has(selector)) controls.set(selector, { value: '', textContent: '', hidden: false }); return controls.get(selector) },
            applyDesktopPlatformCapabilities: vi.fn(),
            renderTimestamps: vi.fn(),
            renderMobileBridge: vi.fn(),
            registerDesktopBrowserSession: register,
            activateView: vi.fn()
        })
        await vm.runInContext('(' + load + ')', context)()
        expect(api.mock.calls.map(([path]) => path)).toEqual(['/api/v1/desktop/status', '/api/v1/capabilities'])
        expect(vm.runInContext('(' + admission + ')', context)()).toBe(capabilitiesAvailable)
        expect(register).toHaveBeenCalledTimes(capabilitiesAvailable ? 1 : 0)
        if (capabilitiesAvailable) expect(context.desktop).toMatchObject({ configured: true, csrfToken: 'synthetic-csrf' })
        else expect(context.desktop).toBeNull()
    })
})
