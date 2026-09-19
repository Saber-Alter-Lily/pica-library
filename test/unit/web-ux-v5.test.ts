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
        expect(app).toContain("$('#reader-prev-chapter').onclick")
        expect(app).toContain("$('#reader-next-chapter').onclick")
        expect(app).toContain('updateReaderChapterNavigation()')
        expect(polish).toContain("ux$('#reader-prev-chapter')")
        expect(polish).toContain("ux$('#reader-next-chapter')")
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
        const zh = i18n.slice(i18n.indexOf("'zh-CN':"))
        expect(polish).toContain("downloadAdvanced: '性能与导出（高级）'")
        expect(polish).toContain("downloadAdvanced: 'Performance & export (advanced)'")
        expect(polish).toContain(
            "for (const node of uxAll('[data-ux-copy]'))"
        )
        expect(polish).not.toContain(
            "for (const node of ux$('[data-ux-copy]'))"
        )
        expect(zh).toContain("'recommend.feedbackLabel': '推荐反馈'")
        expect(zh).toContain("'recommend.like': '喜欢'")
        expect(zh).toContain("'visual.similarStyle': '相似画风'")
        expect(zh).not.toContain(
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

    it('keeps connection probes explicit and avoids duplicate update polling', () => {
        const connections = read('web/alpha8-connections.js')
        const product = read('web/alpha8-product.js')
        const update = read('web/alpha8-update-ui.js')
        expect(connections).toContain('id="a83-check-connections"')
        expect(connections).toContain('async function checkConnections()')
        const configurationBody =
            /async function loadConnectionConfiguration\(\) \{([\s\S]*?)\n\}/.exec(
                connections
            )?.[1] ?? ''
        expect(configurationBody).not.toContain('postProbe(')
        expect(product).not.toContain('function updateEnhancement()')
        expect(product).not.toContain('/api/v1/update/progress')
        expect(update).toContain('/api/v1/update/progress')
    })

    it('keeps destructive actions visually distinct across theme overrides', () => {
        const css = read('web/ui-polish-v5.css')
        expect(css).toContain('.danger-action')
        expect(css).toContain('var(--a83-bad')
        expect(css).toContain('!important')
        expect(css).toContain('#eh-account-clear')
        expect(css).toContain('#exit-app')
    })

    it('prevents duplicate WebDAV and ordinary long-running actions', () => {
        const cloud = read('web/alpha7-cloud.js')
        const app = read('web/app.js')
        expect(cloud).toContain("const button = $('#remote-test')")
        expect(cloud).toContain("const button = $('#remote-save')")
        expect(cloud).toContain("const button = $('#remote-plan')")
        expect(cloud).toContain('if (button.disabled) return')
        expect(app).toContain('syncPending: false')
        expect(app).toContain('searchPending: false')
        expect(app).toContain('async function runMaintenanceAction')
        expect(app).toContain("t('maintenance.working')")
    })

    it('renders explicit empty states for library and online search', () => {
        const app = read('web/app.js')
        const i18n = read('web/i18n.js')
        expect(app).toContain("t('library.noMatches')")
        expect(app).toContain("t('library.empty')")
        expect(app).toContain("t('search.empty')")
        expect(i18n).toContain("'library.noMatches'")
        expect(i18n).toContain("'search.empty'")
    })

    it('keeps mobile pairing and library maintenance secondary actions discoverable', () => {
        const index = read('web/index.html')
        const polish = read('web/ui-polish-v5.js')
        const app = read('web/app.js')
        expect(index).toContain('mobile-bridge-copy-address')
        expect(index).toContain('mobile-bridge-copy-code')
        expect(app).toContain('copyMobileBridgeValue')
        expect(polish).toContain('libraryMaintenance')
        expect(polish).toContain("'ux-library-maintenance'")
    })

    it('keeps product-wide DOM observers coalesced', () => {
        const product = read('web/alpha8-product.js')
        const polish = read('web/ui-polish-v5.js')
        expect(product).toContain('let cleanupQueued = false')
        expect(product).toContain('requestAnimationFrame(() => {')
        expect(product).toContain(
            'const observer = new MutationObserver(scheduleSourceCleanup)'
        )
        expect(polish).toContain('let polishQueued = false')
        expect(polish).toContain('scheduleDynamicPolish()')
    })

    it('uses app-native confirmation and prompt dialogs for ordinary web flows', () => {
        const index = read('web/index.html')
        const app = read('web/app.js')
        const cloud = read('web/alpha7-cloud.js')
        const eh = read('web/eh-account.js')
        expect(index).toContain('id="app-confirm-dialog"')
        expect(index).toContain('id="app-prompt-dialog"')
        expect(app).toContain('function askConfirm(')
        expect(app).toContain('function askText(')
        expect(app).toContain('window.picaConfirmAction = askConfirm')
        expect(app).toContain("await askText(t('shelf.namePrompt'))")
        expect(app).toContain(
            "await askConfirm(t('recommend.restartConfirm'))"
        )
        expect(cloud).toContain('window.picaConfirmAction')
        expect(eh).toContain('window.picaConfirmAction')
        expect(eh).toContain('withBusyButton')
    })

    it('exposes the settings hub as a keyboard-accessible tab interface', () => {
        const hub = read('web/alpha8-7-desktop-hub.js')
        expect(hub).toContain("nav.setAttribute('role', 'tablist')")
        expect(hub).toContain("button.setAttribute('role', 'tab')")
        expect(hub).toContain("panel.setAttribute('role', 'tabpanel')")
        expect(hub).toContain("button.setAttribute('aria-selected'")
        expect(hub).toContain("nav.addEventListener('keydown'")
        expect(hub).toContain("'ArrowDown'")
        expect(hub).toContain("'Home'")
        expect(hub).toContain('sectionsLabel')
    })

    it('lets main app own scroll restoration and reduces theme polling', () => {
        const theme = read('web/alpha8-theme-help.js')
        expect(theme).not.toContain('const viewScroll = new Map()')
        expect(theme).not.toContain('lastActiveView')
        expect(theme).toContain('function scheduleThemeDecoration()')
        expect(theme).toContain(
            'progressTimer = setInterval(scheduleThemeDecoration, 2500)'
        )
        expect(theme).toContain(
            "attributeFilter: ['class', 'hidden', 'style', 'value']"
        )
    })

    it('coalesces Visual QC and Settings Hub global DOM observers', () => {
        const visual = read('web/visual-qc-beta.js')
        const hub = read('web/alpha8-7-desktop-hub.js')
        expect(visual).toContain('let queued = false')
        expect(visual).toContain('const observer = new MutationObserver(schedule)')
        expect(visual).toContain('requestAnimationFrame(() => {')
        expect(hub).toContain('let queued = false')
        expect(hub).toContain('const observer = new MutationObserver(schedule)')
        expect(hub).toContain('requestAnimationFrame(() => {')
    })

    it('uses one-step import and guards long Desktop operations', () => {
        const index = read('web/index.html')
        const i18n = read('web/i18n.js')
        const app = read('web/app.js')
        expect(index).toContain('id="import-button" class="primary" hidden')
        expect(i18n).toContain(
            "'library.selectFile': '选择并导入数据文件'"
        )
        expect(i18n).toContain(
            "'library.selectFile': 'Choose & import data file'"
        )
        expect(app).toContain('let importPending = false')
        expect(app).toContain('if (importPending) return')
        expect(app).toContain('async function withBusyButton(')
        expect(app).toContain("$('#update-check').onclick = async (event)")
        expect(app).toContain(
            "$('#settings-detect-proxy').onclick = async (event)"
        )
        expect(app).toContain(
            "$('#export-browser-lite').onclick = async (event)"
        )
    })

    it('gives settings utilities explicit feedback and safe exit confirmation', () => {
        const app = read('web/app.js')
        const i18n = read('web/i18n.js')
        expect(app).toContain('async function openDesktopDirectory(')
        expect(app).toContain("askConfirm(t('settings.exitConfirm'))")
        expect(app).toContain(
            "$('#preview-cache-clear').onclick = async (event)"
        )
        expect(i18n).toContain("'settings.exitConfirm'")
        expect(i18n).toContain("'preview.cacheCleared'")
    })

    it('uses querySelectorAll for every multi-element app binding', () => {
        const app = read('web/app.js')
        expect(app).toContain(
            "$$('nav [data-view], [data-go]').forEach((button) =>"
        )
        expect(app).toContain(
            "$$('#shelf-list [data-shelf-open]').forEach((button) =>"
        )
        expect(app).toContain(
            "$$('#reader-chapters [data-reader-episode]').forEach((button) =>"
        )
        expect(app).not.toMatch(/(^|[^$])\$\([^\n]*\)\.forEach\(/m)
    })

    it('shows an inspectable recommendation profile before explicit batch edits', () => {
        const controls = read('web/recommendation-v5-beta.js')
        expect(controls).toContain('你的推荐画像')
        expect(controls).toContain('当前推荐构成')
        expect(controls).toContain('完整画像与微调')
        expect(controls).toContain('id="v5-policy-search-submit"')
        expect(controls).toContain('id="v5-pending-save"')
        expect(controls).toContain('id="v5-pending-discard"')
        expect(controls).toContain('async function saveDraftLevels()')
        expect(controls).toContain(
            "/api/v1/recommendation-v5/preference-timescales?limit=5000"
        )
        expect(controls).toContain(
            "/api/v1/recommendation-v5/candidate-channels?limit=5000"
        )
        expect(controls).toContain('作为标签添加')
        expect(controls).not.toContain(
            "webBaselineLevel(signal)"
        )
        expect(controls).not.toContain(
            "webControlFor(signal)"
        )
        expect(controls).not.toContain(
            "panel.querySelector('#v5-policy-search').addEventListener('input'"
        )
    })

    it('exports a credential-free recommendation audit bundle on explicit request', () => {
        const main = read('src/desktop/main.ts')
        const server = read('src/library/server.ts')
        const controls = read('web/recommendation-v5-beta.js')
        expect(main).toContain('exportRecommendationAudit: async () =>')
        expect(main).toContain("'behavior_evidence_v5.json'")
        expect(main).toContain("'user_events.json'")
        expect(main).toContain("'shadow_runs.json'")
        expect(main).toContain("'evaluation_snapshot.json'")
        expect(main).toContain("'catalog_minimal.json'")
        expect(main).toContain("'pica_password'")
        expect(main).toContain("'eh_cookies'")
        expect(server).toContain(
            "'/api/v1/desktop/recommendation-v5/export-audit'"
        )
        expect(controls).toContain('导出推荐审计数据')
        expect(controls).toContain('window.picaDesktopPost')
    })

    it('builds pairing QR locally from the existing deep-link protocol', () => {
        const index = read('web/index.html')
        const app = read('web/app.js')
        const license = read('web/vendor/qrcodejs-LICENSE.txt')
        expect(index).toContain('./vendor/qrcode.min.js')
        expect(index).toContain('id="mobile-bridge-qr"')
        expect(index).toContain('id="mobile-bridge-pair-link"')
        expect(app).toContain('picalibrary://pair?host=')
        expect(app).toContain('new window.QRCode')
        expect(app).not.toMatch(
            /api\.qrserver|chart\.googleapis|quickchart.*qr/i
        )
        expect(license).toContain('The MIT License')
        expect(license).toContain('Copyright (c) 2012 davidshimjs')
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
