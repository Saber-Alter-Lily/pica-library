import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) =>
    fs.readFileSync(path.join(root, file), 'utf8')

describe('V5 Web UX audit contract', () => {
    it('loads the dedicated cross-surface UX layer', () => {
        const index = read('web/index.html')
        expect(index).toContain('ui-polish-v5.css')
        expect(index).toContain('ui-polish-v5.js')
    })

    it('keeps library, search and downloads primary flows compact', () => {
        const polish = read('web/ui-polish-v5.js')
        expect(polish).toContain('installLibraryToolbar')
        expect(polish).toContain("makeDetails('ux-library-filters'")
        expect(polish).toContain("makeDetails('ux-library-bulk'")
        expect(polish).toContain('来源与筛选')
        expect(polish).toContain('性能与导出（高级）')
        expect(polish).toContain("ux$('#apply-filter')")
        expect(polish).toContain("event.key !== 'Enter'")
    })

    it('keeps Reader exit persistent and restores the origin scroll position', () => {
        const app = read('web/app.js')
        const polish = read('web/ui-polish-v5.js')
        const css = read('web/ui-polish-v5.css')
        expect(app).toContain('const viewScrollPositions = new Map()')
        expect(app).toContain("document.querySelectorAll('.view').forEach")
        expect(app).toContain("document.querySelectorAll('nav button').forEach")
        expect(app).toContain('viewScrollPositions.set(previousView')
        expect(app).toContain('window.scrollTo(0, viewScrollPositions.get(id) ?? 0)')
        expect(app).toContain("event.key === 'Escape'")
        expect(app).toContain('await document.exitFullscreen().catch')
        expect(polish).toContain('Esc 退出')
        expect(css).toContain('body.reader-active .reader-header')
        expect(css).toContain('position: fixed !important')
        const readerKeyHandlers = app.match(
            /document\.addEventListener\('keydown', \(event\) => \{/g
        ) ?? []
        expect(readerKeyHandlers).toHaveLength(1)
    })

    it('separates normal settings from experimental recommendation diagnostics', () => {
        const polish = read('web/ui-polish-v5.js')
        expect(polish).toContain('实验与诊断（高级）')
        expect(polish).toContain('#a88-visual-qc')
        expect(polish).toContain('#settings-work-identity-v5')
        expect(polish).toContain('#settings-recommendation-v5-evaluation')
        expect(polish).toContain('画风推荐高级设置')
        expect(polish).toContain('文件、日志与退出')
        expect(polish).toContain('使用本地更新 ZIP')
    })

    it('does not expose destructive Browser Lite reset during connected Desktop use', () => {
        const app = read('web/app.js')
        expect(app).toContain(
            "$('#clear-lite-state').hidden = state.mode !== 'lite'"
        )
    })

    it('treats unknown preferences as unknown rather than inferred dislike', () => {
        const controls = read('web/recommendation-v5-beta.js')
        expect(controls).toContain('baselineLevel: 5')
        expect(controls).toContain('systemUnknown: true')
        expect(controls).toContain('系统未判断 · 5/10 为中性起点')
        expect(controls).not.toContain('系统基准为 1/10')
    })

    it('keeps immature future outcomes out of formal accuracy', () => {
        const benchmark = read(
            'src/recommendation-v5/retrospective-benchmark.ts'
        )
        const dashboard = read(
            'web/recommendation-v5-evaluation.js'
        )
        expect(benchmark).toContain('outcomeWindowMature')
        expect(benchmark).toContain('immatureRunCount')
        expect(benchmark).toContain(
            'outcomeWindowMature &&'
        )
        expect(dashboard).toContain('30 天观察窗走完整之前')
        expect(dashboard).toContain('等待数据')
    })

    it('keeps dynamic UX copy bilingual and refresh-safe', () => {
        const polish = read('web/ui-polish-v5.js')
        const i18n = read('web/i18n.js')
        expect(polish).toContain("downloadAdvanced: '性能与导出（高级）'")
        expect(polish).toContain("downloadAdvanced: 'Performance & export (advanced)'")
        expect(polish).toContain(
            "for (const node of uxAll('[data-ux-copy]'))"
        )
        expect(polish).not.toContain(
            "for (const node of ux$('[data-ux-copy]'))"
        )
        expect(i18n).toContain("'recommend.feedbackLabel': '推荐反馈'")
        expect(i18n).toContain("'recommend.like': '喜欢'")
        expect(i18n).toContain("'visual.similarStyle': '相似画风'")
        expect(i18n).not.toContain(
            "'recommend.feedbackLabel': 'Recommendation feedback'"
        )
    })

    it('coalesces dynamic DOM polish instead of rerunning on every mutation', () => {
        const polish = read('web/ui-polish-v5.js')
        expect(polish).toContain('let polishQueued = false')
        expect(polish).toContain('requestAnimationFrame(() => {')
        expect(polish).toContain('scheduleDynamicPolish()')
        const observerBody =
            /const bodyObserver = new MutationObserver\(\(\) => \{([\s\S]*?)\n    \}\)/.exec(
                polish
            )?.[1] ?? ''
        expect(observerBody).toContain('scheduleDynamicPolish()')
        expect(observerBody).not.toContain('installExperimentHub()')
    })

    it('keeps heavy evaluation and Visual QA explicitly manual', () => {
        const evaluation = read(
            'web/recommendation-v5-evaluation.js'
        )
        const visual = read('web/visual-qc-beta.js')
        const installBody =
            /function evalInstall\(\) \{([\s\S]*?)\n\}/.exec(
                evaluation
            )?.[1] ?? ''
        expect(installBody).not.toContain('evalLoad(')
        const visualPanelBody =
            /function a88EnsurePanel\(\) \{([\s\S]*?)\n\}/.exec(
                visual
            )?.[1] ?? ''
        expect(visualPanelBody).toContain('打开设置页不会自动扫描')
        expect(visualPanelBody).not.toMatch(
            /\n\s*void a88RefreshPanel\(\)\s*\n/
        )
    })
})
