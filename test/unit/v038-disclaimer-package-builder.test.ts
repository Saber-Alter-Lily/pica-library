import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it } from 'vitest'
import { buildLocalUpdatePackage } from '../../scripts/build-local-update-package'

const directories: string[] = []

function full(
    directory: string,
    version: string,
    sourceSha: string,
    entries: Record<string, string>
) {
    const zip = new AdmZip()
    zip.addFile('SOURCE_SHA.txt', Buffer.from(`${sourceSha}\n`))
    zip.addFile('app/updater.js', Buffer.from('stable-updater-helper'))
    zip.addFile('web/app.js', Buffer.from('stable-web-app'))
    for (const [name, value] of Object.entries(entries))
        zip.addFile(name, Buffer.from(value))
    const file = path.join(
        directory,
        `Pica-Library-v${version}-windows-x64.zip`
    )
    zip.writeZip(file)
    return file
}

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('v0.3.8 disclaimer incremental package', () => {
    it('ships root DISCLAIMER.md only in the full package while updating the actual web startup notice', () => {
        const directory = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-v038-disclaimer-')
        )
        directories.push(directory)
        const source = full(directory, '0.3.7', '1'.repeat(40), {})
        const target = full(directory, '0.3.8', '2'.repeat(40), {
            'DISCLAIMER.md': 'full-package legal/readme copy',
            'web/alpha8-disclaimer.js': 'versioned startup gate'
        })
        const output = path.join(directory, 'update.zip')
        const result = buildLocalUpdatePackage(source, target, output)

        expect(result.manifest.requiresFullInstall).toBe(false)
        expect(result.manifest.files.map((item) => item.path)).toContain(
            'web/alpha8-disclaimer.js'
        )
        expect(result.manifest.files.map((item) => item.path)).not.toContain(
            'DISCLAIMER.md'
        )
        expect(result.manifest.files.map((item) => item.path)).not.toContain(
            'app/updater.js'
        )

        const names = new AdmZip(output)
            .getEntries()
            .map((entry) => entry.entryName)
        expect(names).toContain('web/alpha8-disclaimer.js')
        expect(names).not.toContain('DISCLAIMER.md')
        expect(names).not.toContain('app/updater.js')

        const targetNames = new AdmZip(target)
            .getEntries()
            .map((entry) => entry.entryName)
        expect(targetNames).toContain('DISCLAIMER.md')
    })
})
