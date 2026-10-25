import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { guideCatalog } from '../../web/guide-catalog.js'

const read = (path: string) => fs.readFileSync(path, 'utf8')

describe('Windows/Web RC connection and onboarding corrective batch', () => {
    it('keeps Desktop engine health separate from optional bootstrap failures', () => {
        const app = read('web/app.js')
        expect(app).toContain('async function ensureConnectedEngine(forceProbe = false)')
        expect(app).toContain("await api('/api/v1/status')")
        expect(app).toContain("if (state.mode !== 'connected' && !(await ensureConnectedEngine(true)))")
        expect(app).toContain("if (await ensureConnectedEngine(true))")
        expect(app).toContain("t('message.partialInit'")
        expect(app).toContain("t('message.engineRecovered')")
    })

    it('exposes E-H alongside Pica in the unified connection status surface', () => {
        const connections = read('web/alpha8-connections.js')
        expect(connections).toContain("item('eh', 'E-H / ExH'")
        expect(connections).toContain("ehAccountAction: 'verify-session'")
        expect(connections).toContain("setProbeResult('eh', text('checking')")
        expect(connections).toContain("text('exhAvailable')")
        expect(connections).toContain("document.addEventListener('pica-eh-status-change'")
    })

    it('closes the managed E-H login feedback loop without pretending manual links can callback', () => {
        const eh = read('web/eh-account.js')
        expect(eh).toContain('网页登录并自动回传（推荐）')
        expect(eh).toContain('手动打开官网登录页（不会自动回传状态）')
        expect(eh).toContain('✓ E-H 已连接 · 会话已加密保存')
        expect(eh).toContain('window.focus()')
        expect(eh).toContain('window.picaShowOperationToast?.(success')
        expect(eh).toContain("new CustomEvent('pica-eh-login-complete')")
    })

    it('separates v3 daily onboarding and optional task-oriented advanced chapters', () => {
        const onboarding = read('web/onboarding-v1.js')
        const catalog = read('web/guide-catalog.js')
        expect(onboarding).toContain('const TOUR_VERSION = GUIDE_VERSION')
        expect(read('web/onboarding-state.js')).toContain('GUIDE_VERSION = 3')
        for (const target of [
            "'library-sync'",
            "'shelves-nav'",
            "'shelf-create'",
            "'recommend-run'",
            "'visual-mode'",
            "'visual-strength'",
            "'connection-status'",
            "'eh-account'"
        ]) expect(onboarding).toContain(target)
        const guide = guideCatalog((zh: string) => zh)
        expect(guide.daily[0].view).toBe('library')
        expect(guide.daily[0].selector).toBe('nav [data-view="library"]')
        expect(guide.daily[0].body).toContain('无需登录也能阅读本地漫画')
        expect(guide.daily[0].body).toContain('已有漫画直接打开')
        expect(guide.daily.find((step) => step.selector === 'nav [data-view="discover"]')!.body)
            .toMatch(/(?:不必|不需要)每次重新生成/)
        expect(catalog).toContain('OFF 不参与排序')
        expect(catalog).toContain('普通官网登录链接不会自动回传')
        expect(onboarding).toContain('showAdvancedGuide')
    })
})
