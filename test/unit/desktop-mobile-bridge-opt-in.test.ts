import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { desktopRuntimeOptions } from '../../src/desktop/runtime-mode'
import {
    mobileBridgeOptIn,
    parseMobileBridgeChoice
} from '../../src/desktop/mobile-bridge-policy'

const text = fs.readFileSync('src/desktop/main.ts', 'utf8')
const parsed = ts.createSourceFile(
    'main.ts',
    text,
    ts.ScriptTarget.Latest,
    true
)
const functions = new Map<string, string>()
for (const node of parsed.statements)
    if (ts.isFunctionDeclaration(node) && node.name)
        functions.set(node.name.text, node.getText(parsed))
function harness() {
    const pairedDevices = [{ deviceId: 'synthetic-device' }]
    const controller = {
        close: vi.fn(async () => undefined),
        status: () => ({
            enabled: true,
            addresses: ['synthetic:7788'],
            port: 7788,
            pairedDevices
        })
    }
    const config = {
        schemaVersion: 1,
        libraryDirectory: 'synthetic-library',
        profile: 'balanced',
        externalSources: { schemaVersion: 1, revision: 0, enabled: [] }
    }
    const ctx = vm.createContext({
        config,
        service: {},
        database: {},
        engineReady: true,
        stopping: false,
        mobileBridge: null,
        mobileBridgeSettingsBusy: false,
        mobileBridgeEpoch: 0,
        paths: {
            config: 'synthetic/config.json',
            runtimeState: 'synthetic/runtime'
        },
        runtimeOptions: desktopRuntimeOptions([]),
        path,
        mobileBridgeOptIn,
        parseMobileBridgeChoice,
        saveConfig: vi.fn(),
        startMobileBridge: vi.fn(async () => controller),
        sources: { isEnabled: () => false },
        credentials: null,
        log: { write: vi.fn() }
    })
    for (const name of ['startSelectedMobileBridge', 'setMobileBridgeEnabled'])
        vm.runInContext(
            ts.transpileModule(functions.get(name)!, {
                compilerOptions: { target: ts.ScriptTarget.ES2022 }
            }).outputText,
            ctx
        )
    return { ctx, controller, config, pairedDevices }
}

describe('optional LAN bridge policy and actual extracted commands, no real socket or process', () => {
    it.each([null, [], true, 'enabled'])(
        'rejects nonobject choices %j without a fallback action',
        (input) => {
            expect(() => parseMobileBridgeChoice(input)).toThrow(
                'Invalid Mobile Bridge choice'
            )
        }
    )
    it.each([true, false])(
        'refreshes actual UI status after a failed %s operation and retains its error',
        async (enabled) => {
            const app = ts.createSourceFile(
                'app.js',
                fs.readFileSync('web/app.js', 'utf8'),
                ts.ScriptTarget.Latest,
                true,
                ts.ScriptKind.JS
            )
            const fn = app.statements.find(
                (node) =>
                    ts.isFunctionDeclaration(node) &&
                    node.name?.text === 'changeMobileBridge'
            )!
            const label = { textContent: '' }
            const ctx = vm.createContext({
                desktop: { csrfToken: 'synthetic-csrf' },
                mobileBridgeUiBusy: false,
                renderMobileBridge: vi.fn(),
                askConfirm: vi.fn(async () => true),
                t: (key: string) => key,
                desktopPost: vi.fn(async () => {
                    throw Error('disk failed')
                }),
                loadDesktop: vi.fn(async () => undefined),
                localizeError: () => 'synthetic-save-error',
                language: 'en',
                $: () => label
            })
            vm.runInContext(fn.getText(app), ctx)
            await ctx.changeMobileBridge(enabled)
            expect(ctx.loadDesktop).toHaveBeenCalledOnce()
            expect(ctx.mobileBridgeUiBusy).toBe(false)
            expect(label.textContent).toBe('synthetic-save-error')
        }
    )
    it('does not enable LAN sharing when the explicit UI confirmation is cancelled', async () => {
        const app = ts.createSourceFile(
            'app.js',
            fs.readFileSync('web/app.js', 'utf8'),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.JS
        )
        const fn = app.statements.find(
            (node) =>
                ts.isFunctionDeclaration(node) &&
                node.name?.text === 'changeMobileBridge'
        )!
        const ctx = vm.createContext({
            desktop: { csrfToken: 'synthetic-csrf' },
            mobileBridgeUiBusy: false,
            renderMobileBridge: vi.fn(),
            askConfirm: vi.fn(async () => false),
            t: (key: string) => key,
            desktopPost: vi.fn(),
            loadDesktop: vi.fn(),
            $: () => ({ textContent: '' })
        })
        vm.runInContext(fn.getText(app), ctx)
        await ctx.changeMobileBridge(true)
        expect(ctx.desktopPost).not.toHaveBeenCalled()
        expect(ctx.loadDesktop).not.toHaveBeenCalled()
        expect(ctx.mobileBridgeUiBusy).toBe(false)
    })
    it('keeps new and legacy local installs off unless there is an explicit choice', () => {
        for (const config of [null, {}, { mobileBridgeEnabled: false }])
            expect(mobileBridgeOptIn(config)).toBe(false)
        expect(mobileBridgeOptIn({}, true)).toBe(true)
        expect(mobileBridgeOptIn({ mobileBridgeEnabled: false }, true)).toBe(
            false
        )
        expect(mobileBridgeOptIn({ mobileBridgeEnabled: true })).toBe(true)
        for (const args of [[], ['--no-open'], ['--headless']])
            expect(desktopRuntimeOptions(args).mobileBridge).toBe(false)
        expect(desktopRuntimeOptions(['--mobile-bridge']).mobileBridge).toBe(
            true
        )
        expect(
            mobileBridgeOptIn({ mobileBridgeEnabled: true }, false, 'headless')
        ).toBe(false)
        expect(
            mobileBridgeOptIn({ mobileBridgeEnabled: true }, true, 'headless')
        ).toBe(true)
    })
    it('rejects coercion, malformed actions and mixed source/credential changes', () => {
        expect(
            parseMobileBridgeChoice({
                mobileBridgeAction: 'set-enabled',
                enabled: false
            })
        ).toBe(false)
        for (const input of [
            { mobileBridgeAction: 'rotate', enabled: true },
            { mobileBridgeAction: 'set-enabled', enabled: 'true' },
            {
                mobileBridgeAction: 'set-enabled',
                enabled: true,
                account: 'unrelated'
            }
        ])
            expect(() => parseMobileBridgeChoice(input)).toThrow()
    })
    it('does not start from a passive policy/default state', async () => {
        const h = harness()
        await expect(h.ctx.startSelectedMobileBridge()).rejects.toThrow(
            /explicitly enabled/
        )
        expect(h.ctx.startMobileBridge).not.toHaveBeenCalled()
        expect(h.ctx.saveConfig).not.toHaveBeenCalled()
    })
    it('starts only after an explicit persisted choice and disables without deleting paired records or source choices', async () => {
        const h = harness()
        expect(
            await h.ctx.setMobileBridgeEnabled({
                mobileBridgeAction: 'set-enabled',
                enabled: true
            })
        ).toEqual({ success: true, enabled: true, running: true })
        expect(h.ctx.startMobileBridge).toHaveBeenCalledTimes(1)
        expect(h.ctx.config.mobileBridgeEnabled).toBe(true)
        expect(h.ctx.startMobileBridge.mock.calls[0][0].host).toBe('0.0.0.0')
        expect(
            await h.ctx.setMobileBridgeEnabled({
                mobileBridgeAction: 'set-enabled',
                enabled: false
            })
        ).toEqual({ success: true, enabled: false, running: false })
        expect(h.controller.close).toHaveBeenCalledOnce()
        expect(h.ctx.config.mobileBridgeEnabled).toBe(false)
        expect(h.ctx.config.externalSources).toEqual(h.config.externalSources)
        expect(h.pairedDevices).toEqual([{ deviceId: 'synthetic-device' }])
        expect(h.ctx.mobileBridge).toBeNull()
    })
    it('rejects overlapping changes and closes an activation completed after shutdown', async () => {
        const h = harness()
        let complete!: (value: unknown) => void
        h.ctx.startMobileBridge.mockImplementation(
            () =>
                new Promise((resolve) => {
                    complete = resolve
                })
        )
        const pending = h.ctx.setMobileBridgeEnabled({
            mobileBridgeAction: 'set-enabled',
            enabled: true
        })
        await expect(
            h.ctx.setMobileBridgeEnabled({
                mobileBridgeAction: 'set-enabled',
                enabled: false
            })
        ).rejects.toThrow(/already/)
        h.ctx.stopping = true
        h.ctx.mobileBridgeEpoch++
        complete(h.controller)
        await expect(pending).rejects.toThrow(/cancelled/)
        expect(h.ctx.mobileBridge).toBeNull()
        expect(h.controller.close).toHaveBeenCalledOnce()
        expect(h.ctx.mobileBridgeSettingsBusy).toBe(false)
    })
    it('does not open a listener if persisting consent fails', async () => {
        const h = harness()
        h.ctx.saveConfig.mockImplementation(() => {
            throw Error('disk failed')
        })
        await expect(
            h.ctx.setMobileBridgeEnabled({
                mobileBridgeAction: 'set-enabled',
                enabled: true
            })
        ).rejects.toThrow('disk failed')
        expect(h.ctx.startMobileBridge).not.toHaveBeenCalled()
        expect(h.ctx.config).toBe(h.config)
    })
    it('closes the current listener even if saving the disabled choice fails', async () => {
        const h = harness()
        await h.ctx.setMobileBridgeEnabled({
            mobileBridgeAction: 'set-enabled',
            enabled: true
        })
        h.ctx.saveConfig.mockImplementation(() => {
            throw Error('disk failed')
        })
        await expect(
            h.ctx.setMobileBridgeEnabled({
                mobileBridgeAction: 'set-enabled',
                enabled: false
            })
        ).rejects.toThrow('disk failed')
        expect(h.controller.close).toHaveBeenCalledOnce()
        expect(h.ctx.mobileBridge).toBeNull()
        expect(h.ctx.config.mobileBridgeEnabled).toBe(false)
    })
    it('preserves display and storage edits saved while an asynchronous disable is closing', async () => {
        const h = harness()
        await h.ctx.setMobileBridgeEnabled({ mobileBridgeAction: 'set-enabled', enabled: true })
        let close!: () => void
        h.controller.close.mockImplementationOnce(() => new Promise<undefined>(resolve => { close = () => resolve(undefined) }))
        const pending = h.ctx.setMobileBridgeEnabled({ mobileBridgeAction: 'set-enabled', enabled: false })
        const display = { schemaVersion: 1, mode: 'double', direction: 'rtl', fit: 'height' }
        h.ctx.config = { ...h.ctx.config, readerSettings: display, preferredPort: 4817 }
        close()
        await pending
        const persisted = h.ctx.saveConfig.mock.calls.at(-1)![1]
        expect(persisted.readerSettings).toEqual(display)
        expect(persisted.preferredPort).toBe(4817)
        expect(persisted.mobileBridgeEnabled).toBe(false)
    })
    it('keeps a failed close visible instead of reporting a listener as stopped', async () => {
        const h = harness()
        await h.ctx.setMobileBridgeEnabled({
            mobileBridgeAction: 'set-enabled',
            enabled: true
        })
        h.controller.close.mockRejectedValueOnce(Error('close failed'))
        await expect(
            h.ctx.setMobileBridgeEnabled({
                mobileBridgeAction: 'set-enabled',
                enabled: false
            })
        ).rejects.toThrow('close failed')
        expect(h.ctx.mobileBridge).toBe(h.controller)
        expect(h.ctx.mobileBridgeSettingsBusy).toBe(false)
    })
    it('does not silently expand a saved desktop choice into headless LAN listening', async () => {
        const h = harness()
        h.ctx.runtimeOptions = desktopRuntimeOptions(['--headless'])
        await expect(
            h.ctx.setMobileBridgeEnabled({
                mobileBridgeAction: 'set-enabled',
                enabled: true
            })
        ).rejects.toThrow(/--mobile-bridge/)
        expect(h.ctx.saveConfig).not.toHaveBeenCalled()
        expect(h.ctx.startMobileBridge).not.toHaveBeenCalled()
    })
    it('keeps visible opt-in separate from source login and default status reads', () => {
        const app = fs.readFileSync('web/app.js', 'utf8'),
            html = fs.readFileSync('web/index.html', 'utf8')
        expect(app).toContain("askConfirm(t('mobile.enableConfirm'))")
        expect(app).toContain("{ mobileBridgeAction: 'set-enabled', enabled }")
        expect(html).toContain('id="mobile-bridge-enable"')
        expect(html).toContain('id="mobile-bridge-disable"')
        expect(text).toContain(
            'mobileBridgePreference: mobileBridgeOptIn(config, runtimeOptions.mobileBridge, runtimeOptions.mode)'
        )
    })
})
