const ux$ = (selector, root = document) => root.querySelector(selector)
const uxAll = (selector, root = document) => [...root.querySelectorAll(selector)]

const UX_COPY = {
    'zh-CN': {
        moreFilters: '更多筛选',
        bulkOrganize: '批量与整理',
        libraryMaintenance: '导入与完整校验',
        sourceFilters: '来源与筛选',
        downloadAdvanced: '性能与导出（高级）',
        downloadsIntro: '管理下载任务、进度、暂停与失败重试。',
        visualAdvanced: '画风推荐高级设置',
        settingsUtilities: '文件、日志与退出',
        localUpdate: '使用本地更新 ZIP',
        ehMore: '更多 E-H 操作',
        experimentTools: '实验与诊断（高级）',
        experimentIntro:
            '这里用于影子推荐、Visual QC 和作品身份审计。正常使用不需要操作；所有重计算仍需手动点击。',
        readerSettings: '阅读设置',
        readerEsc: 'Esc 退出',
        remoteFlow:
            '建议顺序：1 测试连接 → 2 保存设置 → 3 扫描同步计划 → 4 开始同步。',
        clearLite: '清除 Browser Lite 本地数据'
    },
    en: {
        moreFilters: 'More filters',
        bulkOrganize: 'Batch & organize',
        libraryMaintenance: 'Import & full verification',
        sourceFilters: 'Sources & filters',
        downloadAdvanced: 'Performance & export (advanced)',
        downloadsIntro: 'Manage download jobs, progress, pause/resume and failed retries.',
        visualAdvanced: 'Visual recommendation settings',
        settingsUtilities: 'Files, logs & exit',
        localUpdate: 'Use a local update ZIP',
        ehMore: 'More E-H actions',
        experimentTools: 'Experiments & diagnostics (advanced)',
        experimentIntro:
            'Shadow recommendations, Visual QC and work-identity review live here. Normal use does not require these tools; heavy work still runs only after explicit action.',
        readerSettings: 'Reader settings',
        readerEsc: 'Esc to exit',
        remoteFlow:
            'Recommended order: 1 Test → 2 Save → 3 Scan plan → 4 Sync.',
        clearLite: 'Clear Browser Lite local data'
    }
}

function uxLanguage() {
    return ux$('#language-select')?.value === 'en' ? 'en' : 'zh-CN'
}

function uxText(key) {
    return UX_COPY[uxLanguage()]?.[key] || UX_COPY['zh-CN'][key] || key
}

function moveNodes(target, nodes) {
    for (const node of nodes) if (node) target.appendChild(node)
}

function makeDetails(id, copyKey, className = 'ux-more') {
    let details = ux$('#' + id)
    if (details) return details
    details = document.createElement('details')
    details.id = id
    details.className = className
    const head = document.createElement('summary')
    head.dataset.uxCopy = copyKey
    head.textContent = uxText(copyKey)
    const body = document.createElement('div')
    body.className = 'ux-more-body'
    details.append(head, body)
    return details
}

function selectionHasItems(value) {
    const text = String(value || '').trim()
    const match = text.match(/(?:已选择|selected)\s*[:：]?\s*(\d+)/i)
    if (match) return Number(match[1]) > 0
    return Boolean(text) && !/未选择|none selected/i.test(text)
}

function installLibraryToolbar() {
    const toolbar = ux$('#library .toolbar[data-control-scope="library"]')
    if (!toolbar || toolbar.dataset.uxPolished) return
    toolbar.dataset.uxPolished = '1'

    const headingActions = ux$('#library .page-heading .actions')
    const syncButton = ux$('#sync-button')
    if (headingActions && syncButton) {
        syncButton.classList.add('primary')
        if (syncButton.parentElement !== headingActions)
            headingActions.appendChild(syncButton)
        if (!ux$('#ux-library-maintenance')) {
            const maintenance = makeDetails(
                'ux-library-maintenance',
                'libraryMaintenance'
            )
            moveNodes(maintenance.querySelector('.ux-more-body'), [
                ux$('#import-file'),
                ux$('#import-file-label'),
                ux$('#import-button'),
                ux$('#full-sync-button')
            ])
            headingActions.insertAdjacentElement('afterend', maintenance)
        }
    }
    toolbar.classList.add('ux-toolbar-shell')
    toolbar.classList.remove('toolbar', 'responsive-toolbar')

    const primary = document.createElement('div')
    primary.className = 'ux-toolbar-primary'
    moveNodes(primary, [
        ux$('#view-grid'),
        ux$('#view-list'),
        toolbar.querySelector('.grid-size-controls'),
        ux$('#cover-toggle')?.closest('label'),
        ux$('#filter-text'),
        ux$('#filter-scope'),
        ux$('#apply-filter')
    ])

    const filters = makeDetails('ux-library-filters', 'moreFilters')
    moveNodes(filters.querySelector('.ux-more-body'), [
        ux$('#filter-author-input')?.closest('label'),
        ux$('#filter-tag')?.closest('label'),
        ux$('#filter-tag-mode'),
        ux$('#sort-mode')
    ])

    const bulk = makeDetails('ux-library-bulk', 'bulkOrganize')
    moveNodes(bulk.querySelector('.ux-more-body'), [
        ux$('#queue-selected'),
        ux$('#library-add-shelf'),
        ux$('#library-add-filtered-shelf'),
        ux$('#export-plan')
    ])

    const selection = document.createElement('div')
    selection.id = 'ux-library-selection'
    selection.className = 'ux-selection-bar is-empty'
    moveNodes(selection, [
        ux$('#library-clear-selection'),
        ux$('#library-selection-status')
    ])

    toolbar.append(primary, filters, bulk, selection)
    const search = ux$('#filter-text')
    if (search && !search.dataset.uxEnterFilter) {
        search.dataset.uxEnterFilter = '1'
        search.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            ux$('#apply-filter')?.click()
        })
    }
    updateLibrarySelectionBar()
}

function updateLibrarySelectionBar() {
    const bar = ux$('#ux-library-selection')
    const status = ux$('#library-selection-status')
    if (!bar || !status) return
    const text = status.textContent || ''
    const hasSelection = selectionHasItems(text)
    bar.classList.toggle('is-empty', !hasSelection)
}

function installRecommendationToolbar() {
    const heading = ux$('#recommend .page-heading')
    const recommend = ux$('#recommend-button')
    const restart = ux$('#recommend-restart')
    if (heading && recommend && restart && !heading.querySelector('.ux-heading-actions')) {
        const actions = document.createElement('div')
        actions.className = 'ux-heading-actions'
        actions.append(recommend, restart)
        heading.appendChild(actions)
    }

    const batch = ux$('#recommend-batch')
    const next = ux$('#recommend-next-batch')
    if (batch && next && !ux$('#ux-recommend-pager')) {
        const pager = document.createElement('div')
        pager.id = 'ux-recommend-pager'
        pager.className = 'ux-recommend-pager'
        batch.before(pager)
        pager.append(batch, next)
    }

    if (!ux$('#ux-recommend-selection')) {
        const selection = document.createElement('div')
        selection.id = 'ux-recommend-selection'
        selection.className = 'ux-selection-bar is-empty'
        const results = ux$('#recommend-results')
        const add = ux$('#recommend-add-shelf')
        const clear = ux$('#recommend-clear-selection')
        const legacyDisclosure =
            add?.closest('.batch-action-disclosure') ||
            clear?.closest('.batch-action-disclosure')
        if (results) results.before(selection)
        moveNodes(selection, [
            add,
            clear,
            ux$('#recommend-selection-status')
        ])
        if (
            legacyDisclosure &&
            !legacyDisclosure.querySelector('button')
        )
            legacyDisclosure.remove()
    }
    updateRecommendationSelectionBar()
}

function updateRecommendationSelectionBar() {
    const bar = ux$('#ux-recommend-selection')
    const status = ux$('#recommend-selection-status')
    if (!bar || !status) return
    const text = status.textContent || ''
    const hasSelection = selectionHasItems(text)
    bar.classList.toggle('is-empty', !hasSelection)
}

function installSearchToolbar() {
    const toolbar = ux$('#search > .toolbar')
    if (!toolbar || toolbar.dataset.uxPolished) return
    toolbar.dataset.uxPolished = '1'
    const keyword = ux$('#search-keyword')
    const tags = ux$('#search-tags')
    const source = toolbar.querySelector('.source-picker')
    const sort = ux$('#search-sort')
    const button = ux$('#search-button')
    const primary = document.createElement('div')
    primary.className = 'ux-search-primary'
    moveNodes(primary, [keyword, button])
    const more = makeDetails('ux-search-filters', 'sourceFilters')
    moveNodes(more.querySelector('.ux-more-body'), [tags, source, sort])
    toolbar.replaceChildren(primary, more)
    if (keyword && !keyword.dataset.uxEnterSearch) {
        keyword.dataset.uxEnterSearch = '1'
        keyword.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            button?.click()
        })
    }

    if (!ux$('#ux-search-selection')) {
        const selection = document.createElement('div')
        selection.id = 'ux-search-selection'
        selection.className = 'ux-selection-bar is-empty'
        const results = ux$('#search-results')
        const add = ux$('#search-add-shelf')
        const clear = ux$('#search-clear-selection')
        const legacyDisclosure =
            add?.closest('.batch-action-disclosure') ||
            clear?.closest('.batch-action-disclosure')
        if (results) results.before(selection)
        moveNodes(selection, [
            add,
            clear,
            ux$('#search-selection-status')
        ])
        if (
            legacyDisclosure &&
            !legacyDisclosure.querySelector('button')
        )
            legacyDisclosure.remove()
    }
    updateSearchSelectionBar()
}

function updateSearchSelectionBar() {
    const bar = ux$('#ux-search-selection')
    const status = ux$('#search-selection-status')
    if (!bar || !status) return
    bar.classList.toggle(
        'is-empty',
        !selectionHasItems(status.textContent)
    )
}

function installDownloadsPage() {
    const section = ux$('#downloads')
    const heading = ux$('#downloads .page-heading')
    const actions = heading?.querySelector('.actions')
    if (!section || !heading || !actions) return

    let advanced = ux$('#ux-download-advanced')
    if (!advanced) {
        advanced = makeDetails(
            'ux-download-advanced',
            'downloadAdvanced'
        )
        heading.insertAdjacentElement('afterend', advanced)
        moveNodes(advanced.querySelector('.ux-more-body'), [
            ux$('#performance-profile'),
            ux$('#custom-performance'),
            ux$('#sync-export-browser-lite')
        ])
    }

    const refresh = ux$('#refresh-jobs')
    const run = ux$('#run-jobs')
    const history = ux$('#a87-download-history-controls')
    if (refresh && refresh.parentElement !== actions) actions.appendChild(refresh)
    if (run && run.parentElement !== actions) actions.appendChild(run)
    if (history && history.parentElement !== actions) actions.appendChild(history)

    const copy = heading.querySelector('p')
    if (copy) {
        copy.dataset.uxCopy = 'downloadsIntro'
        copy.textContent = uxText('downloadsIntro')
    }
}

function installCollectionToolbars() {
    ux$('#downloaded .view-controls')?.classList.add('ux-toolbar-primary')
    ux$('#shelf-view-controls')?.classList.add('ux-toolbar-primary')
}

function installVisualSettingsDisclosure() {
    const panel = ux$('#settings-recommendation-v4')
    if (!panel || panel.dataset.uxDisclosure) return
    panel.dataset.uxDisclosure = '1'
    const divider = panel.querySelector('hr')
    if (!divider) return
    const details = makeDetails(
        'ux-visual-settings',
        'visualAdvanced'
    )
    const body = details.querySelector('.ux-more-body')
    const movable = []
    let node = divider
    while (node) {
        const next = node.nextSibling
        movable.push(node)
        node = next
    }
    for (const item of movable) body.appendChild(item)
    panel.appendChild(details)
}

function installSettingsUtilities() {
    const form = ux$('#settings-form')
    const actions = form?.querySelector('.actions.wide')
    if (!form || !actions || ux$('#ux-settings-utilities')) return
    const details = makeDetails(
        'ux-settings-utilities',
        'settingsUtilities'
    )
    moveNodes(details.querySelector('.ux-more-body'), [
        ux$('#open-data'),
        ux$('#open-logs'),
        ux$('#exit-app')
    ])
    actions.insertAdjacentElement('afterend', details)
}

function installUpdatePanel() {
    const panel = ux$('#settings-update')
    if (!panel || ux$('#ux-local-update-package')) return
    const details = makeDetails(
        'ux-local-update-package',
        'localUpdate'
    )
    const body = details.querySelector('.ux-more-body')
    body.classList.add('ux-local-update-body')
    moveNodes(body, [
        ux$('#update-dropzone'),
        ux$('#update-summary'),
        ux$('#update-apply')
    ])
    const actions = panel.querySelector('.actions')
    if (actions) actions.insertAdjacentElement('afterend', details)
    else panel.appendChild(details)
}

function installEhAccountFlow() {
    const panel = ux$('#settings-eh-account')
    const actions = panel?.querySelector(':scope > .actions')
    if (!panel || !actions || panel.dataset.uxEhPolished) return
    panel.dataset.uxEhPolished = '1'

    const manual = panel.querySelector('.account-advanced')
    const saveSession = ux$('#eh-account-save')
    if (manual && saveSession) {
        let manualActions = manual.querySelector('.ux-eh-manual-actions')
        if (!manualActions) {
            manualActions = document.createElement('div')
            manualActions.className = 'actions ux-eh-manual-actions'
            manual.appendChild(manualActions)
        }
        manualActions.appendChild(saveSession)
    }

    const more = makeDetails('ux-eh-more', 'ehMore')
    moveNodes(more.querySelector('.ux-more-body'), [
        actions.querySelector(
            'a[href*="forums.e-hentai.org"][href*="act=Login"]'
        ),
        actions.querySelector(
            'a[href*="forums.e-hentai.org"][href*="act=Reg"]'
        ),
        ux$('#eh-account-verify'),
        ux$('#eh-exh-probe'),
        ux$('#eh-account-clear')
    ])
    actions.insertAdjacentElement('afterend', more)

    const login = ux$('#eh-web-login-start')
    const sync = ux$('#eh-favorites-sync')
    if (login) login.classList.add('primary')
    if (sync && sync.parentElement !== actions) actions.appendChild(sync)
}

function installRemoteStorageFlow() {
    const panel = ux$('#settings-remote-storage')
    if (!panel || panel.dataset.uxRemoteFlowHelp) return
    panel.dataset.uxRemoteFlowHelp = '1'
    const help = panel.querySelector('.info-tip[data-info-tip]')
    if (!help) return
    help.dataset.uxTipCopy = 'remoteFlow'
    const existing = help.dataset.infoTip || ''
    const flow = uxText('remoteFlow')
    help.dataset.infoTip = existing.includes(flow)
        ? existing
        : `${existing} ${flow}`.trim()
}

function installGlobalNavMetrics() {
    const nav = ux$('.app-nav')
    if (!nav || nav.dataset.uxMeasured) return
    nav.dataset.uxMeasured = '1'
    const update = () => {
        const height = Math.ceil(nav.getBoundingClientRect().height)
        document.documentElement.style.setProperty(
            '--ux-app-nav-height',
            height + 'px'
        )
    }
    update()
    if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(update)
        observer.observe(nav)
    }
}

function installReaderHeader() {
    const header = ux$('.reader-header')
    if (!header || header.dataset.uxPolished) return
    header.dataset.uxPolished = '1'
    const copy = header.firstElementChild
    if (copy) copy.classList.add('reader-header-copy')
    const controls = ux$('.reader-controls', header)
    const exit = ux$('#reader-exit')
    const previous = ux$('#reader-prev-chapter')
    const next = ux$('#reader-next-chapter')
    if (!controls || !exit || !previous || !next) return

    const essential = document.createElement('div')
    essential.className = 'reader-essential-actions'
    const options = document.createElement('details')
    options.className = 'reader-options'
    const summary = document.createElement('summary')
    summary.dataset.uxCopy = 'readerSettings'
    summary.textContent = uxText('readerSettings')
    options.append(summary, controls)
    essential.append(exit, previous, next, options)
    header.appendChild(essential)

    const hint = document.createElement('span')
    hint.className = 'reader-key-hint'
    hint.dataset.uxCopy = 'readerEsc'
    hint.textContent = uxText('readerEsc')
    essential.appendChild(hint)

    if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(() => {
            const height = Math.ceil(header.getBoundingClientRect().height)
            document.body.style.setProperty('--reader-header-height', height + 'px')
        })
        observer.observe(header)
    }
}

function installExperimentHub() {
    const host =
        ux$('#a87-recommendations-panel') ||
        ux$('#settings')
    if (!host) return
    let details = ux$('#v5-experiment-tools')
    if (!details) {
        details = document.createElement('details')
        details.id = 'v5-experiment-tools'
        const summary = document.createElement('summary')
        const label = document.createElement('span')
        label.dataset.uxCopy = 'experimentTools'
        label.textContent = uxText('experimentTools')
        const help = document.createElement('button')
        help.type = 'button'
        help.className = 'info-tip'
        help.textContent = '!'
        help.setAttribute('aria-label', uxText('experimentTools'))
        help.dataset.uxTipCopy = 'experimentIntro'
        help.dataset.infoTip = uxText('experimentIntro')
        summary.append(label, help)
        const body = document.createElement('div')
        body.className = 'ux-experiment-body'
        details.append(summary, body)
        host.appendChild(details)
    }
    const body = details.querySelector('.ux-experiment-body')
    for (const selector of [
        '#a88-visual-qc',
        '#settings-work-identity-v5',
        '#settings-recommendation-v5-evaluation'
    ]) {
        const panel = ux$(selector)
        if (panel && panel.parentElement !== body) body.appendChild(panel)
    }
}

function normalizeDangerAndStatus() {
    const clear = ux$('#clear-lite-state')
    if (clear) {
        clear.classList.add('danger-action')
        clear.dataset.uxCopy = 'clearLite'
        clear.textContent = uxText('clearLite')
    }
    for (const node of uxAll('.status'))
        if (!node.hasAttribute('aria-live')) node.setAttribute('aria-live', 'polite')
}

function installDialogBehavior() {
    for (const dialog of uxAll('dialog')) {
        if (dialog.dataset.uxBackdropClose) continue
        dialog.dataset.uxBackdropClose = '1'
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) dialog.close()
        })
    }
}

function refreshUxCopy() {
    for (const node of uxAll('[data-ux-copy]'))
        node.textContent = uxText(node.dataset.uxCopy)
    for (const node of uxAll('[data-ux-tip-copy]'))
        node.dataset.infoTip = uxText(node.dataset.uxTipCopy)
}

function installObservers() {
    for (const selector of [
        '#library-selection-status',
        '#recommend-selection-status',
        '#search-selection-status'
    ]) {
        const node = ux$(selector)
        if (!node) continue
        new MutationObserver(() => {
            updateLibrarySelectionBar()
            updateRecommendationSelectionBar()
            updateSearchSelectionBar()
        }).observe(node, { childList: true, characterData: true, subtree: true })
    }

    let polishQueued = false
    const scheduleDynamicPolish = () => {
        if (polishQueued) return
        polishQueued = true
        requestAnimationFrame(() => {
            polishQueued = false
            installExperimentHub()
            installDownloadsPage()
            installVisualSettingsDisclosure()
            installSettingsUtilities()
            installUpdatePanel()
            installEhAccountFlow()
            installRemoteStorageFlow()
            installDialogBehavior()
        })
    }
    const bodyObserver = new MutationObserver(() => {
        scheduleDynamicPolish()
    })
    bodyObserver.observe(document.body, { childList: true, subtree: true })
}

function installUxPolish() {
    installLibraryToolbar()
    installRecommendationToolbar()
    installSearchToolbar()
    installDownloadsPage()
    installCollectionToolbars()
    installVisualSettingsDisclosure()
    installSettingsUtilities()
    installUpdatePanel()
    installEhAccountFlow()
    installRemoteStorageFlow()
    installGlobalNavMetrics()
    installReaderHeader()
    installExperimentHub()
    normalizeDangerAndStatus()
    installDialogBehavior()
    installObservers()
}

document.addEventListener('pica-language-change', () => {
    refreshUxCopy()
})

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', installUxPolish, { once: true })
else
    installUxPolish()
