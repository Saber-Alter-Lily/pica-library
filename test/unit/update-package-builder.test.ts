import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it } from 'vitest'
import { buildLocalUpdatePackage } from '../../scripts/build-local-update-package'

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
})
