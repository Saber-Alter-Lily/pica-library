import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it } from 'vitest'
import { buildLocalUpdatePackage } from '../../scripts/build-local-update-package'
import { MODULE_CONTRACT_PATH, runtimeModuleContracts } from '../../src/modules/contracts'

const directories: string[] = []

function fullPackage(
    directory: string,
    name: string,
    sha: string,
    app: string,
    extra: Record<string, string> = {}
) {
    const zip = new AdmZip()
    zip.addFile('SOURCE_SHA.txt', Buffer.from(`${sha}\n`))
    zip.addFile('web/app.js', Buffer.from(app))
    zip.addFile('runtime/node.exe', Buffer.from('same-runtime'))
    for (const [entry, value] of Object.entries(extra))
        zip.addFile(entry, Buffer.from(value))
    const file = path.join(directory, name)
    zip.writeZip(file)
    return file
}

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('local incremental update package builder', () => {
    it('adopts module metadata from the real target and binds it into the incremental manifest', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-module-adoption-')); directories.push(directory)
        const source = fullPackage(directory, 'Pica-Library-v0.5.0-dev.0-update-base-windows-x64.zip', '1'.repeat(40), 'old')
        const target = fullPackage(directory, 'Pica-Library-v0.5.0-dev.1-local-test-windows-x64.zip', '2'.repeat(40), 'new', { [MODULE_CONTRACT_PATH]: JSON.stringify(runtimeModuleContracts()) })
        const result = buildLocalUpdatePackage(source, target, path.join(directory, 'update.zip'))
        expect(result.manifest.moduleContracts).toEqual(runtimeModuleContracts())
        expect(result.manifest.files.map(file => file.path)).toContain(MODULE_CONTRACT_PATH)
        expect(result.manifest.requiresFullInstall).toBe(false)
    })
    it('refuses a module API mismatch or contract removal and directs it to the full one-click path', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-module-break-')); directories.push(directory)
        const source = fullPackage(directory, 'Pica-Library-v0.5.0-dev.0-update-base-windows-x64.zip', '1'.repeat(40), 'old', { [MODULE_CONTRACT_PATH]: JSON.stringify(runtimeModuleContracts()) })
        const incompatible = runtimeModuleContracts(); incompatible.apis.sources++
        const target = fullPackage(directory, 'Pica-Library-v0.5.0-dev.1-local-test-windows-x64.zip', '2'.repeat(40), 'new', { [MODULE_CONTRACT_PATH]: JSON.stringify(incompatible) })
        expect(() => buildLocalUpdatePackage(source, target, path.join(directory, 'update.zip'))).toThrow(/one-click full/)
        const legacy = fullPackage(directory, 'Pica-Library-v0.5.0-dev.legacy-update-base-windows-x64.zip', '1'.repeat(40), 'old')
        expect(() => buildLocalUpdatePackage(legacy, target, path.join(directory, 'legacy-incompatible.zip'))).toThrow(/one-click full/)
        const missing = fullPackage(directory, 'Pica-Library-v0.5.0-dev.2-local-test-windows-x64.zip', '3'.repeat(40), 'new')
        expect(() => buildLocalUpdatePackage(source, missing, path.join(directory, 'removed.zip'))).toThrow(/full application/)
        const wrongCase = fullPackage(directory, 'Pica-Library-v0.5.0-dev.3-local-test-windows-x64.zip', '4'.repeat(40), 'new', { 'app/MODULE-CONTRACTS.json': JSON.stringify(incompatible) })
        expect(() => buildLocalUpdatePackage(source, wrongCase, path.join(directory, 'wrong-case.zip'))).toThrow(/canonical path case/)
    })
    it('includes only changed allowlisted application files and no runtime', () => {
        const directory = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-update-build-')
        )
        directories.push(directory)
        const source = fullPackage(
            directory,
            'Pica-Library-v0.2.0-dev.0-update-base-windows-x64.zip',
            '1'.repeat(40),
            'old'
        )
        const target = fullPackage(
            directory,
            'Pica-Library-v0.2.0-dev.1-local-test-windows-x64.zip',
            '2'.repeat(40),
            'new'
        )
        const output = path.join(directory, 'update.zip')
        const result = buildLocalUpdatePackage(source, target, output)
        expect(result).toMatchObject({ fileCount: 2, fullPackageFileCount: 3 })
        expect(result.manifest).toMatchObject({
            sourceVersionRange: '=0.2.0-dev.0',
            targetVersion: '0.2.0-dev.1',
            targetPlatform: 'windows',
            targetArch: 'x64',
            requiresFullInstall: false
        })
        const names = new AdmZip(output)
            .getEntries()
            .map((entry) => entry.entryName)
        expect(names).toEqual(
            expect.arrayContaining([
                'update-manifest.json',
                'SOURCE_SHA.txt',
                'web/app.js'
            ])
        )
        expect(names).not.toContain('runtime/node.exe')
    })

    it('accepts an accepted local-test package as the next update baseline', () => {
        const directory = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-update-build-')
        )
        directories.push(directory)
        const source = fullPackage(
            directory,
            'Pica-Library-v0.2.0-dev.1-local-test-windows-x64.zip',
            '1'.repeat(40),
            'old'
        )
        const target = fullPackage(
            directory,
            'Pica-Library-v0.2.0-dev.2-local-test-windows-x64.zip',
            '2'.repeat(40),
            'new'
        )
        const result = buildLocalUpdatePackage(
            source,
            target,
            path.join(directory, 'update.zip')
        )
        expect(result.manifest).toMatchObject({
            sourceVersionRange: '=0.2.0-dev.1',
            targetVersion: '0.2.0-dev.2'
        })
    })

    it('includes immutable Registry V3 runtime assets in an incremental update', () => {
        const directory = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-update-build-')
        )
        directories.push(directory)
        const source = fullPackage(
            directory,
            'Pica-Library-v0.2.0-windows-x64.zip',
            '1'.repeat(40),
            'same'
        )
        const target = fullPackage(
            directory,
            'Pica-Library-v0.3.0-windows-x64.zip',
            '2'.repeat(40),
            'same',
            {
                'src/data/registry-v3-final/PICA_REGISTRY_V3_FINAL_MANIFEST.json':
                    '{"runtime_semantic_file":"PICA_TAG_REGISTRY_V3_RUNTIME.csv"}',
                'src/data/registry-v3-final/PICA_TAG_REGISTRY_V3_RUNTIME.csv':
                    'raw_tag,canonical_tag\n',
                'app/runtime-assets/registry-v3-final/PICA_REGISTRY_V3_FINAL_MANIFEST.json':
                    '{"runtime_semantic_file":"PICA_TAG_REGISTRY_V3_RUNTIME.csv"}',
                'app/runtime-assets/registry-v3-final/PICA_TAG_REGISTRY_V3_RUNTIME.csv':
                    'raw_tag,canonical_tag\n'
            }
        )
        const output = path.join(directory, 'update.zip')
        const result = buildLocalUpdatePackage(source, target, output)
        expect(result.manifest.sourceVersionRange).toBe('=0.2.0')
        const entries = new AdmZip(output)
            .getEntries()
            .map((entry) => entry.entryName)
        expect(entries).toEqual(
            expect.arrayContaining([
                'app/runtime-assets/registry-v3-final/PICA_REGISTRY_V3_FINAL_MANIFEST.json',
                'app/runtime-assets/registry-v3-final/PICA_TAG_REGISTRY_V3_RUNTIME.csv'
            ])
        )
        expect(entries.some((entry) => entry.startsWith('src/'))).toBe(false)
    })

    it('rejects runtime changes, updater self replacement and user data', () => {
        const directory = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-update-build-')
        )
        directories.push(directory)
        const source = fullPackage(
            directory,
            'Pica-Library-v0.2.0-dev.0-update-base-windows-x64.zip',
            '1'.repeat(40),
            'old'
        )
        const cases: Array<Record<string, string>> = [
            { 'runtime/node.exe': 'changed-runtime' },
            { 'app/updater.js': 'new-updater' },
            { 'data/library.db': 'user-data' }
        ]
        for (const [index, extra] of cases.entries()) {
            const target = fullPackage(
                directory,
                `Pica-Library-v0.2.0-dev.1-local-test-windows-x64.zip`,
                '2'.repeat(40),
                'new',
                extra
            )
            expect(() =>
                buildLocalUpdatePackage(
                    source,
                    target,
                    path.join(directory, `bad-${index}.zip`)
                )
            ).toThrow()
        }
    })

    it('rejects source and target packages from different OS/arch identities', () => {
        const directory = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-update-build-')
        )
        directories.push(directory)
        const source = fullPackage(
            directory,
            'Pica-Library-v0.2.0-dev.0-update-base-windows-x64.zip',
            '1'.repeat(40),
            'old'
        )
        const target = fullPackage(
            directory,
            'Pica-Library-v0.2.0-dev.1-local-test-macos-arm64.zip',
            '2'.repeat(40),
            'new'
        )
        expect(() =>
            buildLocalUpdatePackage(
                source,
                target,
                path.join(directory, 'mismatch.zip')
            )
        ).toThrow(/targets do not match.*windows-x64.*macos-arm64/i)
    })

    it('refuses to build an unusable direct incremental package from public v0.4.0 to the current schema', () => {
        const directory = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-update-build-')
        )
        directories.push(directory)
        const source = fullPackage(
            directory,
            'Pica-Library-v0.4.0-windows-x64.zip',
            '1'.repeat(40),
            'old'
        )
        const target = fullPackage(
            directory,
            'Pica-Library-v0.5.0-windows-x64.zip',
            '2'.repeat(40),
            'new'
        )
        expect(() =>
            buildLocalUpdatePackage(
                source,
                target,
                path.join(directory, 'v040-direct-update.zip')
            )
        ).toThrow(/public v0\.4\.0.*full application upgrade path/i)
    })

})
