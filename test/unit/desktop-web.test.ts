import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('desktop setup and settings UI contract', () => {
    it('provides first-run, settings, folder picker and shutdown controls', () => {
        const html = read('web/index.html')
        for (const id of [
            'setup-form',
            'setup-password',
            'setup-folder',
            'setup-test',
            'settings-form',
            'settings-password',
            'settings-folder',
            'settings-test',
            'exit-app'
        ])
            expect(html).toContain(`id="${id}"`)
        expect(html).not.toMatch(
            /PICA_ACCOUNT|PICA_PASSWORD|SQLite|\.env\.local/
        )
    })

    it('never reads a saved password into the browser and protects mutations', () => {
        const app = read('web/app.js')
        expect(app).toContain("'x-pica-csrf': desktop?.csrfToken")
        expect(app).not.toMatch(/settings-password'\)\.value\s*=\s*desktop/)
        expect(app).toContain("$('#settings-password').value = ''")
    })

    it('packages one launcher with an official bundled runtime', () => {
        const build = read('scripts/build-windows-package.ps1')
        expect(build).toContain('Pica Library.exe')
        expect(build).toContain('node-v$nodeVersion-win-x64.zip')
        expect(build).not.toContain('npm publish')
        expect(build).not.toContain('gh release')
    })
})
