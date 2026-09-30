import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('v0.4.1 full-package update guidance', () => {
    it('uses the manual full-install guide only when a verified one-click full asset is unavailable', () => {
        const app = read('web/app.js')
        expect(app).toContain('function fullInstallDownloadUrl(version)')
        expect(app).toContain('Pica-Library-v${encoded}-windows-x64.zip')
        expect(app).toContain('function renderFullInstallGuide(value)')
        expect(app).toContain("t('update.fullGuide'")
        expect(app).toContain("available.status === 'full-install'")
        expect(app).toContain('!available.oneClick')
        expect(app).toContain("staged.status === 'full-install'")
        expect(app).toContain('!staged.id')
        expect(app).toContain("t('update.fullOneClickFound'")
    })

    it('makes both incremental and full application releases one-click while preserving user data authority', () => {
        const i18n = read('web/i18n.js')
        const index = read('web/index.html')
        const app = read('web/app.js')
        expect(i18n).toContain('%LOCALAPPDATA%\\\\Pica Library')
        expect(i18n).toContain('不需要卸载，也不需要重新导入')
        expect(i18n).toContain('一键检查并更新')
        expect(i18n).toContain('大规模架构升级都可以直接一键完成')
        expect(i18n).toContain('完整程序升级，但仍可直接一键完成')
        expect(index).toContain('一键检查并更新')
        expect(index).toContain('高级/故障恢复入口')
        expect(index).not.toContain('检查并更新（兼容时自动）')
        expect(app).toContain('async function reconnectAfterUpdate(')
        expect(app).toContain('window.location.reload()')
    })

    it('keeps the manual fallback visually distinct without making it the normal upgrade path', () => {
        const css = read('web/styles.css')
        expect(css).toContain('#update-message.full-install-guide')
        expect(css).toContain('.full-install-actions')
        expect(css).toContain('.full-install-actions a:first-child')
    })

    it('keeps v0.4.0 as the public upgrade baseline and points directly to the latest assistant', () => {
        const guide = read('docs/windows-distribution.zh-CN.md')
        const quick = read('docs/quick-start.zh-CN.md')
        const readme = read('README.md')
        const legacy = read('packaging/windows/upgrade-assistant-v041/Upgrade-Pica-Library-v0.4.1.ps1')

        for (const content of [guide, quick, readme]) {
            expect(content).toContain('v0.4.0')
            expect(content).toContain('v0.4.11')
        }

        expect(guide).toContain('Pica-Library-v0.4.11-upgrade-assistant.zip')
        expect(quick).toContain('Pica-Library-v0.4.11-upgrade-assistant.zip')
        expect(guide).toContain('%LOCALAPPDATA%\\\\Pica Library')
        expect(quick).toContain('%LOCALAPPDATA%\\\\Pica Library')
        expect(quick).toContain('不需要卸载')

        expect(readme).not.toContain('v0.4.1 / v0.4.2 / v0.4.3 → v0.4.11')
        expect(quick).not.toContain('v0.4.1 / v0.4.2 / v0.4.3 → v0.4.11')
        expect(guide).not.toContain('### v0.4.1 / v0.4.2 / v0.4.3 → v0.4.11')

        // Historical assistant contracts remain testable even though they are not public guidance.
        expect(legacy).toContain("$RequiredSourceVersion = '0.4.0'")
        expect(legacy).toContain("$TargetVersion = '0.4.1'")
    })
})
