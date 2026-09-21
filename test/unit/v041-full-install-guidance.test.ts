import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('v0.4.1 full-package update guidance', () => {
    it('renders a dedicated full-install guide with the exact Windows asset', () => {
        const app = read('web/app.js')
        expect(app).toContain('function fullInstallDownloadUrl(version)')
        expect(app).toContain('Pica-Library-v${encoded}-windows-x64.zip')
        expect(app).toContain('function renderFullInstallGuide(value)')
        expect(app).toContain("t('update.fullGuide'")
        expect(app).toContain("if (value.status === 'full-install')")
        expect(app).toContain('renderFullInstallGuide(value)')
        expect(app).toContain("if (available.status === 'full-install')")
        expect(app).toContain('renderFullInstallGuide(available)')
    })

    it('explains data preservation and avoids claiming every update is automatic', () => {
        const i18n = read('web/i18n.js')
        const index = read('web/index.html')
        expect(i18n).toContain('%LOCALAPPDATA%\\\\Pica Library')
        expect(i18n).toContain('不需要卸载，也不需要重新导入')
        expect(i18n).toContain('检查并更新（兼容时自动）')
        expect(i18n).toContain('仅使用本页明确提供的更新 ZIP')
        expect(index).toContain('检查并更新（兼容时自动）')
        expect(index).toContain('完整包升级请按下方引导操作')
        expect(index).not.toContain('可直接检查并安装官方更新')
    })

    it('keeps the full-install message visually distinct and actionable', () => {
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
            expect(content).toContain('v0.4.6')
        }

        expect(guide).toContain('Pica-Library-v0.4.6-upgrade-assistant.zip')
        expect(quick).toContain('Pica-Library-v0.4.6-upgrade-assistant.zip')
        expect(guide).toContain('%LOCALAPPDATA%\\\\Pica Library')
        expect(quick).toContain('%LOCALAPPDATA%\\\\Pica Library')
        expect(quick).toContain('不需要卸载')

        expect(readme).not.toContain('v0.4.1 / v0.4.2 / v0.4.3 → v0.4.6')
        expect(quick).not.toContain('v0.4.1 / v0.4.2 / v0.4.3 → v0.4.6')
        expect(guide).not.toContain('### v0.4.1 / v0.4.2 / v0.4.3 → v0.4.6')

        // Historical assistant contracts remain testable even though they are not public guidance.
        expect(legacy).toContain("$RequiredSourceVersion = '0.4.0'")
        expect(legacy).toContain("$TargetVersion = '0.4.1'")
    })
})
