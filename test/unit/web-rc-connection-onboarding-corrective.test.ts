import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

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

    it('promotes Web onboarding to version 2 with task-oriented shelf, sync, recommendation and visual steps', () => {
        const onboarding = read('web/onboarding-v1.js')
        expect(onboarding).toContain('const TOUR_VERSION = 2')
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
        expect(onboarding).toContain('先同步收藏')
        expect(onboarding).toContain('建立书架')
        expect(onboarding).toContain('一个推荐周期会提前生成多批结果')
        expect(onboarding).toContain('OFF 表示完全不影响常规推荐')
        expect(onboarding).toContain('推荐的“网页登录并自动回传”')
    })
})
