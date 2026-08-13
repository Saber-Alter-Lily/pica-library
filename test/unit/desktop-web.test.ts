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

    it('persists only the non-sensitive Browser Lite export timestamp', () => {
        const main = read('src/desktop/main.ts')
        const paths = read('src/desktop/paths.ts')
        expect(paths).toContain('browser-lite-export.json')
        expect(main).toContain('saveExportState(generatedAt)')
        expect(main).toContain('JSON.stringify({ generatedAt })')
    })

    it('packages one launcher with an official bundled runtime', () => {
        const build = read('scripts/build-windows-package.ps1')
        expect(build).toContain('Pica Library.exe')
        expect(build).toContain('node-v$nodeVersion-win-x64.zip')
        expect(build).toContain('licenses\\Node.js-LICENSE.txt')
        expect(build).toContain('licenses\\THIRD_PARTY_LICENSES.txt')
        const rollup = read('rollup.config.js')
        expect(rollup).toContain('this.getModuleIds()')
        expect(rollup).toContain('THIRD_PARTY_LICENSES.txt')
        expect(build).not.toContain('npm publish')
        expect(build).not.toContain('gh release')
        expect(build).toContain('README-WINDOWS.txt')
        expect(build).toContain('README-WINDOWS.zh-CN.txt')
        expect(build).toContain('[Convert]::FromBase64String')
        expect(read('scripts/test-windows-artifact.ps1')).toContain(
            "@('README-WINDOWS.txt','README-WINDOWS.zh-CN.txt')"
        )
    })

    it('keeps native Windows recovery paths bilingual and secret-free', () => {
        const main = read('src/desktop/main.ts')
        const child = read('src/desktop/child-process.ts')
        expect(main).toContain('Pica Library 无法启动 / could not start.')
        expect(main).toContain(
            '请查看诊断日志后重试 / See the diagnostic log and try again:'
        )
        expect(main).toContain('选择 Pica Library 漫画保存目录')
        expect(main).toContain('Choose the Pica Library folder')
        expect(child).toContain('Pica Library 已启动 / is running at:')
        expect(child).toContain('地址已复制到剪贴板。')
        expect(child).toContain('The address has been copied to the clipboard.')
        for (const source of [main, child]) {
            expect(source).not.toMatch(/PICA_ACCOUNT实际|PICA_PASSWORD实际/)
            expect(source).not.toContain('${credentials.account}')
            expect(source).not.toContain('${credentials.password}')
        }
    })
})
