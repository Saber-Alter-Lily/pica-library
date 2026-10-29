import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import {
    buildCoreLocalConfig, validateCoreLocalSetup,
    readCoreLocalConfig, writeCoreLocalConfig
} from '../../src/library/core-local-config'
import {
    buildLocalConfig, loadConfig, saveConfig, safeProxy
} from '../../src/desktop/config'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root =>
    fs.rmSync(root, { recursive: true, force: true })
))
const temp = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-core-settings-'))
    roots.push(root)
    return root
}
const localInput = (directory: string) => ({
    libraryDirectory: directory, profile: 'balanced' as const
})

describe('source-free local settings reused by the actual Desktop', () => {
    it('keeps original storage/profile validation without creating a database or user profile', () => {
        const root = temp()
        const target = path.join(root, 'library')
        expect(() => validateCoreLocalSetup(localInput('relative'))).toThrow(/absolute/)
        expect(() => validateCoreLocalSetup({
            libraryDirectory: target, profile: 'unknown'
        } as never)).toThrow(/profile/)
        validateCoreLocalSetup(localInput(target))
        const sourcePolicy = { schemaVersion: 1 as const, revision: 0, enabled: [] }
        const core = buildCoreLocalConfig(localInput(target), null, sourcePolicy)
        const desktop = buildLocalConfig(localInput(target))
        expect(core).toEqual(desktop)
        expect(core).toMatchObject({
            schemaVersion: 1, libraryDirectory: target,
            profile: 'balanced', openBrowser: true, preferredPort: 4789,
            externalSources: { schemaVersion: 1, revision: 0, enabled: [] }
        })
        expect(fs.existsSync(target)).toBe(false)
        expect(fs.readdirSync(root)).toEqual([])
    })

    it('round-trips real config.json in the same format while the legacy Desktop controls source policy', () => {
        const root = temp()
        const file = path.join(root, 'config', 'config.json')
        const directory = path.join(root, 'library')
        const base = buildLocalConfig(localInput(directory))
        const config = {
            ...base, openBrowser: false, preferredPort: 4971,
            mobileBridgeEnabled: false,
            readerSettings: {
                schemaVersion: 1 as const, mode: 'single' as const,
                direction: 'rtl' as const, fit: 'height' as const
            }
        }
        writeCoreLocalConfig(file, config)
        expect(readCoreLocalConfig(file, safeProxy)).toEqual(config)
        expect(loadConfig(file)).toEqual(config)
        expect(fs.existsSync(path.join(directory, 'library.db'))).toBe(false)
        saveConfig(file, config)
        expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(config)
        expect(fs.statSync(file).isFile()).toBe(true)
        const existing = {
            ...config, profile: 'fast' as const, openBrowser: false,
            proxyUrl: 'http://127.0.0.1:4789'
        }
        const updated = buildCoreLocalConfig(
            { libraryDirectory: directory, profile: 'fast' },
            existing, existing.externalSources
        )
        expect(updated).toEqual(existing)
    })

    it('rejects sensitive config fields and bad reader settings before any write', () => {
        const root = temp(), file = path.join(root, 'settings.json')
        const config = buildLocalConfig(localInput(path.join(root, 'library')))
        expect(() => writeCoreLocalConfig(file, {
            ...config, account: 'secret'
        } as never)).toThrow(/sensitive/)
        expect(() => writeCoreLocalConfig(file, {
            ...config, nested: { cookie: 'secret' }
        } as never)).toThrow(/sensitive/)
        expect(() => writeCoreLocalConfig(file, {
            ...config, proxyUrl: 'http://user:password@127.0.0.1:7890'
        })).toThrow(/proxy credentials/)
        expect(() => writeCoreLocalConfig(file, {
            ...config, mobileBridgeEnabled: 'yes'
        } as never)).toThrow(/Mobile Bridge/)
        expect(() => writeCoreLocalConfig(file, {
            ...config, readerSettings: { mode: 'made-up' }
        } as never)).toThrow(/reader settings/)
        expect(fs.existsSync(file)).toBe(false)
    })

    it('rejects malformed saved settings but normalizes old invalid reader choices as before', () => {
        const root = temp(), file = path.join(root, 'config.json')
        expect(readCoreLocalConfig(file, safeProxy)).toBeNull()
        for (const malformed of [null, {}, { schemaVersion: 1 }, {
            schemaVersion: 2, libraryDirectory: root, profile: 'balanced'
        }, { schemaVersion: 1, libraryDirectory: root, profile: 'other' }]) {
            fs.writeFileSync(file, JSON.stringify(malformed))
            expect(() => readCoreLocalConfig(file, safeProxy)).toThrow()
        }
        const legacy = {
            ...buildLocalConfig(localInput(path.join(root, 'library'))),
            readerSettings: { schemaVersion: 1, mode: 'unrecognized' }
        }
        fs.writeFileSync(file, JSON.stringify(legacy))
        expect(readCoreLocalConfig(file, safeProxy)?.readerSettings)
            .toEqual({ schemaVersion: 1, mode: 'vertical', direction: 'ltr', fit: 'width' })
        const untrustedProxy = {
            ...legacy, proxyUrl: 'ftp://example.invalid'
        }
        fs.writeFileSync(file, JSON.stringify(untrustedProxy))
        expect(() => readCoreLocalConfig(file, safeProxy)).toThrow(/HTTP/)
    })

    it('uses no source SDK/provider/Host implementation in the local config runtime import graph', () => {
        const text = fs.readFileSync(
            path.resolve('src/library/core-local-config.ts'), 'utf8'
        )
        const file = ts.createSourceFile('core-local-config.ts', text,
            ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
        const runtimeImports = file.statements
            .filter(ts.isImportDeclaration)
            .filter(item => !item.importClause?.isTypeOnly)
            .map(item => (item.moduleSpecifier as ts.StringLiteral).text)
        expect(runtimeImports).toEqual([
            'node:fs', 'node:path', '../../web/reader-settings.js',
            '../storage/sqlite/filename'
        ])
        expect(text).not.toMatch(/\b(?:ProviderService|LibraryService|SourceHostConnections)\b/)
    })
})
