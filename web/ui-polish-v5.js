const ux$ = (selector, root = document) => root.querySelector(selector)
const ux$$ = (selector, root = document) => [...root.querySelectorAll(selector)]

function moveNodes(target, nodes) {
    for (const node of nodes) if (node) target.appendChild(node)
}

function makeDetails(id, summary, className = 'ux-more') {
    let details = ux$('#' + id)
    if (details) return details
    details = document.createElement('details')
    details.id = id
    details.className = className
    const head = document.createElement('summary')
    head.textContent = summary
    const body = document.createElement('div')
    body.className = 'ux-more-body'
    details.append(head, body)
    return details
}

function installLibraryToolbar() {
    const toolbar = ux$('#library .toolbar[data-control-scope="library"]')
    if (!toolbar || toolbar.dataset.uxPolished) return
    toolbar.dataset.uxPolished = '1'
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
        ux$('#filter-scope')
    ])

    const filters = makeDetails('ux-library-filters', '更多筛选')
    moveNodes(filters.querySelector('.ux-more-body'), [
        ux$('#filter-author-input')?.closest('label'),
        ux$('#filter-tag')?.closest('label'),
        ux$('#filter-tag-mode'),
        ux$('#sort-mode'),
        ux$('#apply-filter')
    ])

    const bulk = makeDetails('ux-library-bulk', '批量与整理')
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
    updateLibrarySelectionBar()
}

function updateLibrarySelectionBar() {
    const bar = ux$('#ux-library-selection')
    const status = ux$('#library-selection-status')
    if (!bar || !status) return
    const text = status.textContent || ''
    const hasSelection =
        !/0\s*(部|项|本)?/.test(text) &&
        !/未选择|none selected/i.test(text) &&
        Boolean(text.trim())
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
        if (results) results.before(selection)
        moveNodes(selection, [
            ux$('#recommend-add-shelf'),
            ux$('#recommend-clear-selection'),
            ux$('#recommend-selection-status')
        ])
    }
    updateRecommendationSelectionBar()
}

function updateRecommendationSelectionBar() {
    const bar = ux$('#ux-recommend-selection')
    const status = ux$('#recommend-selection-status')
    if (!bar || !status) return
    const text = status.textContent || ''
    const hasSelection =
        !/0\s*(部|项|本)?/.test(text) &&
        !/未选择|none selected/i.test(text) &&
        Boolean(text.trim())
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
    const more = makeDetails('ux-search-filters', '来源与筛选')
    moveNodes(more.querySelector('.ux-more-body'), [tags, source, sort])
    toolbar.replaceChildren(primary, more)
}

function installReaderHeader() {
    const header = ux$('.reader-header')
    if (!header || header.dataset.uxPolished) return
    header.dataset.uxPolished = '1'
    const copy = header.firstElementChild
    if (copy) copy.classList.add('reader-header-copy')
    const controls = ux$('.reader-controls', header)
    const exit = ux$('#reader-exit')
    if (!controls || !exit) return

    const essential = document.createElement('div')
    essential.className = 'reader-essential-actions'
    const options = document.createElement('details')
    options.className = 'reader-options'
    const summary = document.createElement('summary')
    summary.textContent = '阅读设置'
    options.append(summary, controls)
    essential.append(exit, options)
    header.appendChild(essential)

    const hint = document.createElement('span')
    hint.className = 'reader-key-hint'
    hint.textContent = 'Esc 退出'
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
        summary.textContent = '实验与诊断（高级）'
        const intro = document.createElement('p')
        intro.className = 'ux-experiment-intro'
        intro.textContent =
            '这里用于影子推荐、Visual QC 和作品身份审计。正常使用不需要操作；所有重计算仍需手动点击。'
        const body = document.createElement('div')
        body.className = 'ux-experiment-body'
        details.append(summary, intro, body)
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
        if (/清空本地数据/.test(clear.textContent || ''))
            clear.textContent = '清除 Browser Lite 本地数据'
    }
    for (const node of ux$$('.status'))
        if (!node.hasAttribute('aria-live')) node.setAttribute('aria-live', 'polite')
}

function installDialogBehavior() {
    for (const dialog of ux$$('dialog')) {
        if (dialog.dataset.uxBackdropClose) continue
        dialog.dataset.uxBackdropClose = '1'
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) dialog.close()
        })
    }
}

function installObservers() {
    for (const selector of [
        '#library-selection-status',
        '#recommend-selection-status'
    ]) {
        const node = ux$(selector)
        if (!node) continue
        new MutationObserver(() => {
            updateLibrarySelectionBar()
            updateRecommendationSelectionBar()
        }).observe(node, { childList: true, characterData: true, subtree: true })
    }

    const bodyObserver = new MutationObserver(() => {
        installExperimentHub()
        installDialogBehavior()
    })
    bodyObserver.observe(document.body, { childList: true, subtree: true })
}

function installUxPolish() {
    installLibraryToolbar()
    installRecommendationToolbar()
    installSearchToolbar()
    installReaderHeader()
    installExperimentHub()
    normalizeDangerAndStatus()
    installDialogBehavior()
    installObservers()
}

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', installUxPolish, { once: true })
else
    installUxPolish()
