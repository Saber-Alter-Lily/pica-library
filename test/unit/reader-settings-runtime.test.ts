import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { build } from 'esbuild'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    defaultReaderSettings,
    parseReaderSettings,
    normalizeReaderSettings,
    loadReaderSettings,
    cacheReaderSettings,
    createReaderSettingsWriter
} from '../../web/reader-settings.js'
import {
    buildLocalConfig,
    buildSettingsConfig,
    saveConfig,
    loadConfig
} from '../../src/desktop/config'

const settings = {
    schemaVersion: 1 as const,
    mode: 'single' as const,
    direction: 'rtl' as const,
    fit: 'height' as const
}
const directories: string[] = []
afterEach(() => {
    for (const dir of directories.splice(0)) {
        const resolved = path.resolve(dir),
            parent = path.resolve(os.tmpdir()) + path.sep
        if (
            !resolved.startsWith(parent) ||
            !path.basename(resolved).startsWith('pica-reader-display-')
        )
            throw Error('Unsafe fixture cleanup')
        fs.rmSync(resolved, { recursive: true, force: true })
    }
})

function saveHandler() {
    const text = fs.readFileSync('src/desktop/main.ts', 'utf8')
    const parsed = ts.createSourceFile(
        'main.ts',
        text,
        ts.ScriptTarget.Latest,
        true
    )
    const arrows: string[] = []
    const visit = (node: ts.Node) => {
        if (
            ts.isPropertyAssignment(node) &&
            node.name.getText(parsed) === 'save' &&
            ts.isArrowFunction(node.initializer)
        )
            arrows.push(node.initializer.getText(parsed))
        ts.forEachChild(node, visit)
    }
    visit(parsed)
    expect(arrows).toHaveLength(1)
    const config = buildLocalConfig({
        libraryDirectory: path.resolve('synthetic-library'),
        profile: 'balanced'
    })
    const ctx = vm.createContext({
        config,
        paths: { config: 'synthetic/config.json' },
        parseReaderSettings,
        saveConfig: vi.fn(),
        setMobileBridgeEnabled: vi.fn(async () => ({ success: true })),
        globalThis: undefined
    })
    vm.runInContext(
        ts.transpileModule('saveHandler = ' + arrows[0], {
            compilerOptions: { target: ts.ScriptTarget.ES2022 }
        }).outputText,
        ctx
    )
    return ctx
}

describe('Reader display settings, no application or listener startup', () => {
    it('keeps the shared settings codec independent of DOM, source, recommendation and storage implementations', async () => {
        const result = await build({
            entryPoints: ['web/reader-settings.js'],
            bundle: true,
            platform: 'neutral',
            format: 'esm',
            write: false,
            metafile: true,
            logLevel: 'silent'
        })
        expect(Object.keys(result.metafile!.inputs)).toEqual([
            'web/reader-settings.js'
        ])
    })
    it('round-trips a strict minimal versioned schema without source or progress fields', () => {
        expect(parseReaderSettings(settings)).toEqual(settings)
        for (const bad of [
            null,
            [],
            { ...settings, schemaVersion: 2 },
            { ...settings, mode: 'html' },
            { ...settings, direction: 'auto' },
            { ...settings, fit: 'script' },
            { ...settings, comicId: 'local:private' }
        ])
            expect(() => parseReaderSettings(bad)).toThrow(/settings/)
        expect(normalizeReaderSettings({ mode: 'single' })).toEqual(
            defaultReaderSettings
        )
    })
    it('tolerates corrupt or unavailable browser storage and keeps the cache free of book identity', () => {
        const values = new Map<string, string>(),
            storage = {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => values.set(key, value)
            }
        expect(loadReaderSettings(storage)).toEqual(defaultReaderSettings)
        expect(cacheReaderSettings(storage, settings)).toBe(true)
        expect(loadReaderSettings(storage)).toEqual(settings)
        expect([...values.values()]).toEqual([JSON.stringify(settings)])
        values.set('pica-reader-settings-v1', '{bad')
        expect(loadReaderSettings(storage)).toEqual(defaultReaderSettings)
        expect(
            loadReaderSettings({
                getItem() {
                    throw Error('blocked')
                }
            })
        ).toEqual(defaultReaderSettings)
        expect(
            cacheReaderSettings(
                {
                    setItem() {
                        throw Error('full')
                    }
                },
                settings
            )
        ).toBe(false)
    })
    it('serializes edits and continues after a failed write without falsely acknowledging it', async () => {
        let finish!: () => void
        const first = new Promise<void>((resolve) => {
            finish = resolve
        })
        const writes = vi
            .fn()
            .mockImplementationOnce(() => first)
            .mockRejectedValueOnce(Error('disk failed'))
            .mockResolvedValueOnce(undefined)
        const writer = createReaderSettingsWriter(writes)
        const a = writer.save(settings),
            b = writer.save({ ...settings, fit: 'width' }),
            c = writer.save({ ...settings, mode: 'double' })
        const rejected = expect(b).rejects.toThrow('disk failed')
        await Promise.resolve()
        expect(writer.pending).toBe(true)
        expect(writes).toHaveBeenCalledTimes(1)
        finish()
        await a
        await rejected
        await c
        expect(
            writes.mock.calls.map(([value]) => value.mode + ':' + value.fit)
        ).toEqual(['single:height', 'single:width', 'double:height'])
        expect(writer.pending).toBe(false)
    })
    it('persists across config reload and unrelated library/profile settings without credentials or a DB migration', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-reader-display-')
        )
        directories.push(dir)
        const file = path.join(dir, 'config.json')
        const config = {
            ...buildLocalConfig({
                libraryDirectory: path.join(dir, 'library'),
                profile: 'balanced'
            }),
            readerSettings: settings,
            mobileBridgeEnabled: false
        }
        saveConfig(file, config)
        expect(loadConfig(file)).toEqual(config)
        const edited = buildSettingsConfig(
            {
                account: '',
                password: '',
                libraryDirectory: config.libraryDirectory,
                profile: 'fast'
            },
            loadConfig(file)
        ).config
        expect(edited.readerSettings).toEqual(settings)
        expect(edited.mobileBridgeEnabled).toBe(false)
        expect(fs.readdirSync(dir)).toEqual(['config.json'])
        expect(() =>
            saveConfig(file, {
                ...config,
                readerSettings: { ...settings, mode: 'invalid' } as never
            })
        ).toThrow(/settings/)
        expect(loadConfig(file)).toEqual(config)
    })
    it('runs the actual settings save branch with unrelated credential/source machinery absent', async () => {
        const ctx = saveHandler(),
            original = ctx.config
        expect(
            await ctx.saveHandler({
                readerSettingsAction: 'save',
                readerSettings: settings
            })
        ).toEqual({ success: true, readerSettings: settings })
        expect(ctx.config.readerSettings).toEqual(settings)
        expect(ctx.config.libraryDirectory).toBe(original.libraryDirectory)
        expect(ctx.config.externalSources).toEqual(original.externalSources)
        expect(ctx.saveConfig).toHaveBeenCalledTimes(1)
        await expect(
            ctx.saveHandler({
                readerSettingsAction: 'save',
                readerSettings: settings,
                account: 'unrelated'
            })
        ).rejects.toThrow()
        expect(ctx.saveConfig).toHaveBeenCalledTimes(1)
    })
    it('wires cached display controls, durable desktop writes and stale-status guards into the real app', () => {
        const app = fs.readFileSync('web/app.js', 'utf8')
        expect(app).toContain(
            'applyReaderSettingsControls(loadReaderSettings(localStorage))'
        )
        expect(app).toContain(
            "{ readerSettingsAction: 'save', readerSettings: settings }"
        )
        expect(app).toContain(
            'settingsVersion === readerSettingsEditVersion && !readerSettingsWriter.pending'
        )
        expect(app).toContain("activeView !== 'reader'")
        expect(app).toContain('persistReaderSettings()')
        expect(fs.readFileSync('web/styles.css', 'utf8')).toContain(
            'aspect-ratio: auto 2 / 3'
        )
    })
})
