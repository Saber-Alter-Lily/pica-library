import { copy as t } from './locale-runtime.js'
import { GUIDE_VERSION, normalizeGuideState, shouldPromptDaily, updateGuideProgress } from './onboarding-state.js'
import { guideCatalog } from './guide-catalog.js'

const TOUR_VERSION = GUIDE_VERSION
const STATE_KEY = 'pica-onboarding-state-v1'
const SESSION_DISMISSED_KEY = 'pica-onboarding-session-dismissed-v1'
let activeDriver = null
let activeCleanup = null
let promptScheduled = false
let welcomeCheckTimer = null
let welcomeReadinessObserver = null
let activeGuide = { track: 'daily', chapter: null }
let dismissedInMemory = false

function readState() {
    try {
        const value = JSON.parse(localStorage.getItem(STATE_KEY) || '{}')
        return normalizeGuideState(value)
    } catch {
        return normalizeGuideState()
    }
}
function writeState(next) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(normalizeGuideState({ ...readState(), ...next }))) }
    catch { dismissedInMemory = true }
    renderSettingsPanel()
    if (!shouldPrompt()) stopWelcomeReadinessWatch()
}
function shouldPrompt() {
    let sessionDismissed = dismissedInMemory
    try { sessionDismissed ||= sessionStorage.getItem(SESSION_DISMISSED_KEY) === String(TOUR_VERSION) } catch { /* unavailable storage */ }
    return shouldPromptDaily(readState(), sessionDismissed)
}
function saveGuideProgress(patch) {
    writeState(updateGuideProgress(readState(), activeGuide.track, activeGuide.chapter, patch))
}
function closeGuide(driver) {
    const cleanup = activeCleanup
    driver.destroy()
    // Driver may omit onDestroyed when completing during its final animation.
    cleanup?.()
}
function appReadyForTour() {
    const disclaimer = document.querySelector('#pica-disclaimer-gate')
    if (disclaimer && !disclaimer.hidden && getComputedStyle(disclaimer).display !== 'none') return false
    const setup = document.querySelector('#setup')
    if (setup?.classList.contains('active')) return false
    return Boolean(document.querySelector('.app-nav, #home'))
}
const TOUR_TARGETS = [
    ['nav [data-view="library"]', 'library-nav'],
    ['#sync-button', 'library-sync'],
    ['#filter-text', 'library-filter'],
    ['nav [data-view="shelves"]', 'shelves-nav'],
    ['#shelf-create', 'shelf-create'],
    ['nav [data-view="discover"]', 'discover-nav'],
    ['#recommend-button', 'recommend-run'],
    ['nav [data-view="maintenance"]', 'settings-nav'],
    ['#a87-recommendations-tab', 'recommend-settings-tab'],
    [
        '#settings-recommendation-v5, #settings-recommendation-v4',
        'recommend-settings'
    ],
    ['#visual-rerank-mode', 'visual-mode'],
    ['#visual-strength', 'visual-strength'],
    ['#a87-connections-tab', 'connections-tab'],
    ['#a83-connections', 'connection-status'],
    ['#settings-eh-account', 'eh-account'],
    ['#settings-mobile-bridge', 'mobile-bridge'],
    ['#a87-language-panel', 'language-panel'],
    ['#software-updates', 'software-panel']
]

function targetWithin(root, selector) {
    if (root instanceof Element && root.matches(selector)) return root
    return root?.querySelector?.(selector) || null
}

function markTourTargets(root = document) {
    for (const [selector, name] of TOUR_TARGETS)
        targetWithin(root, selector)?.setAttribute('data-tour', name)
}

function welcomeCopy() {
    return {
        title: t('先学日常使用，进阶功能按需查看','Daily use first; advanced help when needed','日常操作から、高度な機能は必要な時に'),
        body: t(
            '日常版只介绍找书、阅读、推荐和下载。高级版按章节介绍账号、偏好、画风、连接和诊断；不会自动开始高级教程，也不会执行同步、下载或改变设置。两套指南都可从“设置 → 帮助与新手引导”重新查看。',
            'The daily tour covers finding, reading, recommendations and downloads. Advanced chapters explain accounts, preferences, visual style, connections and diagnostics. Advanced tours never start automatically; guides do not sync, download or change settings. Replay either from Settings → Help & Onboarding.',
            '日常ガイドは作品探し・閲覧・おすすめ・ダウンロードを紹介します。高度なガイドはアカウント・嗜好・画風・接続・診断を章ごとに紹介します。自動開始や同期・取得・設定変更は行いません。「設定 → ヘルプと初回ガイド」で再表示できます。'
        ),
        start: t('日常使用入门','Daily-use tour','日常操作ガイド'),
        later: t('稍后再看','Later','後で見る'),
        never: t('不再自动提示','Do not show automatically again','今後は自動表示しない')
    }
}

function ensureWelcomeDialog() {
    let dialog = document.querySelector('#pica-onboarding-welcome')
    if (!dialog) {
        dialog = document.createElement('dialog')
        dialog.id = 'pica-onboarding-welcome'
        dialog.addEventListener('cancel', (event) => {
            event.preventDefault()
            dismissWelcome(false)
        })
        document.body.appendChild(dialog)
    }
    const copy = welcomeCopy()
    dialog.innerHTML = `<div class="pica-onboarding-welcome-shell">
        <h2>${copy.title}</h2>
        <p>${copy.body}</p>
        <label class="pica-onboarding-checkbox"><input id="pica-onboarding-never" type="checkbox"><span>${copy.never}</span></label>
        <div class="pica-onboarding-welcome-actions">
            <button id="pica-onboarding-later" type="button">${copy.later}</button>
            <button id="pica-onboarding-advanced" type="button">${t('高级功能指南','Advanced feature guide','高度な機能ガイド')}</button>
            <button id="pica-onboarding-start" type="button" class="primary">${copy.start}</button>
        </div>
    </div>`
    dialog.querySelector('#pica-onboarding-later').onclick = () =>
        dismissWelcome(dialog.querySelector('#pica-onboarding-never').checked)
    dialog.querySelector('#pica-onboarding-start').onclick = () => {
        const never = dialog.querySelector('#pica-onboarding-never').checked
        if (never) writeState({ autoShow: false })
        dialog.close()
        startTour({ replay: false })
    }
    dialog.querySelector('#pica-onboarding-advanced').onclick = () => {
        dismissWelcome(dialog.querySelector('#pica-onboarding-never').checked)
        showAdvancedGuide()
    }
    return dialog
}

function dismissWelcome(neverAgain) {
    const dialog = document.querySelector('#pica-onboarding-welcome')
    if (neverAgain) writeState({ ...updateGuideProgress(readState(), 'daily', null, { dismissedVersion: TOUR_VERSION }), autoShow: false })
    else { dismissedInMemory = true; try { sessionStorage.setItem(SESSION_DISMISSED_KEY, String(TOUR_VERSION)) } catch { /* session only */ } }
    if (dialog?.open) dialog.close()
}

function promptWelcomeIfNeeded() {
    if (!shouldPrompt() || !appReadyForTour()) return false
    const dialog = ensureWelcomeDialog()
    if (!dialog.open) dialog.showModal()
    return true
}
function stopWelcomeReadinessWatch() {
    if (welcomeCheckTimer) window.clearTimeout(welcomeCheckTimer)
    welcomeCheckTimer = null
    welcomeReadinessObserver?.disconnect()
    welcomeReadinessObserver = null
    document.removeEventListener(
        'visibilitychange',
        onWelcomeVisibilityChange
    )
}

function runWelcomeReadinessCheck() {
    if (!shouldPrompt()) {
        stopWelcomeReadinessWatch()
        return
    }
    if (promptWelcomeIfNeeded()) stopWelcomeReadinessWatch()
}

function queueWelcomeReadinessCheck(delay = 0) {
    if (!shouldPrompt()) {
        stopWelcomeReadinessWatch()
        return
    }
    if (welcomeCheckTimer) window.clearTimeout(welcomeCheckTimer)
    welcomeCheckTimer = window.setTimeout(() => {
        welcomeCheckTimer = null
        runWelcomeReadinessCheck()
    }, delay)
}

function onWelcomeVisibilityChange() {
    if (document.visibilityState === 'visible')
        queueWelcomeReadinessCheck()
}

function scheduleWelcome() {
    if (promptScheduled) return
    promptScheduled = true

    const setup = document.querySelector('#setup')
    if (setup) {
        welcomeReadinessObserver = new MutationObserver(() =>
            queueWelcomeReadinessCheck()
        )
        welcomeReadinessObserver.observe(setup, {
            attributes: true,
            attributeFilter: ['class', 'hidden', 'style']
        })
    }

    document.addEventListener(
        'visibilitychange',
        onWelcomeVisibilityChange
    )
    queueWelcomeReadinessCheck(650)
}


function visibleTarget(selector) {
    const element = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector
    if (!(element instanceof Element)) return null
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        rect.width <= 0 ||
        rect.height <= 0
    ) return null
    return element
}

function ensureView(id) {
    const view = document.querySelector('#' + id)
    if (!view?.classList.contains('active'))
        document.querySelector(`nav [data-view="${id}"]`)?.click()
}

function prepareViewOwner(viewId) {
    ensureView(viewId)
}

function prepareSettingsOwner(panelId, selector, disclosureSelector = null) {
    ensureView('maintenance')
    const panel = document.querySelector(`#a87-${panelId}-panel`)
    if (!panel?.classList.contains('active'))
        document.querySelector(`#a87-${panelId}-tab`)?.click()
    if (panelId === 'maintenance' && selector === '#software-updates') {
        const softwareTab = document.querySelector(
            '#a87-maintenance-panel > .tabs [data-tab="software-updates"]'
        )
        if (
            softwareTab &&
            !document.querySelector('#software-updates')?.classList.contains('active')
        )
            softwareTab.click()
    }
    if (disclosureSelector) {
        const disclosure = document.querySelector(disclosureSelector)
        if (disclosure instanceof HTMLDetailsElement) disclosure.open = true
    }
    for (let parent = document.querySelector(selector)?.parentElement; parent; parent = parent.parentElement)
        if (parent instanceof HTMLDetailsElement) parent.open = true
}

function viewStep(viewId, selector, popover, extra = {}) {
    return {
        element: selector,
        waitForElement: 2500,
        onHighlightStarted: () => prepareViewOwner(viewId),
        onHighlighted: (_element,_step,opts) => {
            if (!visibleTarget(selector)) opts.driver.refresh()
        },
        popover,
        ...extra
    }
}

function settingsStep(panelId, selector, popover, disclosureSelector = null, extra = {}) {
    return {
        element: selector,
        waitForElement: 3500,
        onHighlightStarted: () =>
            prepareSettingsOwner(panelId, selector, disclosureSelector),
        onHighlighted: (_element,_step,opts) => {
            if (!visibleTarget(selector)) opts.driver.refresh()
        },
        popover,
        ...extra
    }
}

function makeSteps(track = 'daily', chapter = null) {
    const catalog = guideCatalog(t)
    const definition = track === 'advanced'
        ? catalog.chapters.find((item) => item.id === chapter)?.steps
        : catalog.daily
    if (!definition) return []
    return [...definition.map((item, index) => {
        const popover = { title: item.title, description: item.body }
        const result = item.panel
            ? settingsStep(item.panel, item.selector, popover, item.disclosure)
            : viewStep(item.view, item.selector, popover)
        const prepare = result.onHighlightStarted
        result.onHighlightStarted = (element, step, opts) => {
            saveGuideProgress({ position: index })
            prepare?.(element, step, opts)
        }
        return result
    }), { popover: {
        title: track === 'daily' ? t('日常入门完成', 'Daily tour complete', '日常ガイド完了') : t('本章已读', 'Chapter read', 'この章は読了'),
        description: t('指南进度与实际配置分开记录。你可以从帮助中重看；读完不会启动任务，也不代表账号、同步或模型已配置成功。', 'Guide progress is separate from actual configuration. Replay from Help. Finishing starts no tasks and does not verify accounts, sync or models.', '読了状態と実際の設定は別管理です。ヘルプから再表示でき、読了してもタスクの開始やアカウント・同期・モデルの検証は行いません。'),
        onNextClick: (_e, _s, opts) => {
            saveGuideProgress({ completedVersion: TOUR_VERSION, dismissedVersion: 0, position: 0 })
            closeGuide(opts.driver)
        }
    } }]
}

function skipCopy() {
    return {
        skip: t('跳过','Skip','スキップ'),
        title: t('跳过新手引导？','Skip onboarding?','初回ガイドをスキップしますか？'),
        body: t(
            '之后仍可在“设置 → 帮助与新手引导”重新查看。',
            'You can replay it later from Settings → Help & Onboarding.',
            '後から「設定 → ヘルプと初回ガイド」で再表示できます。'
        ),
        cancel: t('继续引导','Continue tour','ガイドを続ける'),
        confirm: t('跳过','Skip','スキップ')
    }
}
async function confirmSkip(driver) {
    const copy = skipCopy()
    const confirmed = window.picaConfirmAction
        ? await window.picaConfirmAction(copy.body, copy.title)
        : window.confirm(`${copy.title}\n\n${copy.body}`)
    if (!confirmed) return
    saveGuideProgress({ dismissedVersion: TOUR_VERSION })
    closeGuide(driver)
}

function addSkipButton(popover, opts) {
    const element = opts.driver.getActiveElement?.()
    if (element?.id === 'driver-dummy-element') {
        const description = popover.description || popover.wrapper.querySelector('.driver-popover-description')
        if (description && opts.driver.getActiveIndex() < opts.driver.getConfig().steps.length - 1)
            description.append(document.createTextNode(t(' 当前模式未显示此控件；本步骤只介绍用途，不代表功能已连接或可用。', ' This control is not shown in the current mode; this explanation does not mean it is connected or available.', ' 現在のモードでは操作項目が表示されていません。説明は接続済み・利用可能という意味ではありません。')))
    }
    if (popover.footerButtons.querySelector('.pica-tour-skip')) return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'pica-tour-skip'
    button.textContent = skipCopy().skip
    button.onclick = () => void confirmSkip(opts.driver)
    popover.footerButtons.prepend(button)
    popover.closeButton.setAttribute('aria-label', skipCopy().skip)
}

function startTour({ track = 'daily', chapter = null, restart = false } = {}) {
    ensureSettingsPanel()
    markTourTargets()
    const factory = window.driver?.js?.driver
    if (typeof factory !== 'function') return false
    if (activeDriver?.isActive?.()) return false
    if (!['daily', 'advanced'].includes(track)) return false
    if (track === 'advanced' && !guideCatalog(t).chapters.some((item) => item.id === chapter)) return false
    activeGuide = { track, chapter }
    const steps = makeSteps(track, chapter)
    const state = readState()
    const progress = track === 'daily' ? state.daily : state.chapters[chapter]
    const position = restart || progress.completedVersion >= TOUR_VERSION ? 0 : Math.min(progress.position, steps.length - 1)
    const originalView = document.querySelector('section.view.active')?.id
    const originalTab = document.querySelector('.a87-hub-nav [aria-selected="true"]')?.id
    const originalFocus = document.activeElement
    const disclosures = [...document.querySelectorAll('details')].map((element) => [element, element.open])
    let restored = false
    const cleanup = () => {
        if (restored) return
        restored = true
        activeDriver = null
        activeCleanup = null
        if (originalTab) document.getElementById(originalTab)?.click()
        if (originalView) ensureView(originalView)
        for (const [element, open] of disclosures) if (element.isConnected) element.open = open
        if (originalFocus instanceof HTMLElement && originalFocus.isConnected) originalFocus.focus({ preventScroll: true })
        renderSettingsPanel()
    }
    activeCleanup = cleanup
    activeDriver = factory({
        steps,
        animate: true,
        smoothScroll: true,
        allowClose: true,
        allowScroll: true,
        disableActiveInteraction: true,
        overlayClickBehavior: 'none',
        showProgress: true,
        progressText: t('{{current}} / {{total}}','{{current}} / {{total}}','{{current}} / {{total}}'),
        nextBtnText: t('下一步','Next','次へ'),
        prevBtnText: t('上一步','Back','戻る'),
        doneBtnText: t('完成','Done','完了'),
        popoverClass: 'pica-tour-popover',
        stagePadding: 8,
        stageRadius: 12,
        waitForElement: 2500,
        skipMissingElement: false,
        onPopoverRender: addSkipButton,
        onDestroyStarted: (_element,_step,opts) => void confirmSkip(opts.driver),
        onDestroyed: cleanup
    })
    dismissedInMemory = true
    try { sessionStorage.setItem(SESSION_DISMISSED_KEY, String(TOUR_VERSION)) } catch { /* optional help persistence */ }
    activeDriver.drive(position)
    return true
}

function settingsCopy() {
    return {
        title: t('帮助与新手引导','Help & Onboarding','ヘルプと初回ガイド'),
        text: t('日常版只介绍找书、阅读、推荐与下载；高级版分章节说明配置方法和边界。可随时跳过、继续或重新查看，不执行同步、下载、删除或模型任务。','The daily guide covers finding, reading, recommendations and downloads. Advanced chapters explain configuration and limits. Skip, continue or replay without executing sync, downloads, deletion or model jobs.','日常版は作品探し・閲覧・おすすめ・取得を紹介し、高度な版は設定手順と制約を章ごとに説明します。同期・取得・削除・モデル処理を実行せず、中断・再開・再表示できます。'),
        replay: t('日常使用入门','Daily-use tour','日常操作ガイド'),
        auto: t('首次自动提示日常引导','Offer the daily guide automatically','日常ガイドを自動案内')
    }
}
function showAdvancedGuide() {
    if (activeDriver?.isActive?.()) return
    let dialog = document.querySelector('#pica-advanced-guide')
    if (!dialog) {
        dialog = document.createElement('dialog')
        dialog.id = 'pica-advanced-guide'
        document.body.appendChild(dialog)
    }
    const state = readState()
    dialog.innerHTML = `<div class="pica-onboarding-welcome-shell">
        <h2>${t('高级功能指南', 'Advanced feature guide', '高度な機能ガイド')}</h2>
        <p>${t('选择需要的一章。阅读进度单独记录；已读不代表已配置。指南不会执行登录、同步、下载、更新、删除或模型任务。', 'Choose a chapter. Reading progress is separate from configuration. Guides never execute login, sync, downloads, updates, deletion or model jobs.', '必要な章を選択します。読了と設定状態は別で、ログイン・同期・取得・更新・削除・モデル処理は実行しません。')}</p>
        <div class="pica-guide-chapters">${guideCatalog(t).chapters.map((chapter) => {
            const entry = state.chapters[chapter.id]
            const completed = entry.completedVersion >= TOUR_VERSION
            const status = completed ? t('已读，可重看', 'Read · replay', '読了・再表示可能') : entry.position > 0
                ? t(`可继续 · 第 ${entry.position + 1} 步`, `Continue · step ${entry.position + 1}`, `再開・ステップ ${entry.position + 1}`)
                : t('尚未阅读', 'Not read yet', '未読')
            return `<button type="button" data-guide-chapter="${chapter.id}"><strong>${chapter.title}</strong><span>${status}</span></button>`
        }).join('')}</div>
        <div class="pica-onboarding-welcome-actions"><button id="pica-guide-close" type="button">${t('关闭', 'Close', '閉じる')}</button></div>
    </div>`
    dialog.querySelector('#pica-guide-close').onclick = () => dialog.close()
    for (const button of dialog.querySelectorAll('[data-guide-chapter]')) button.onclick = () => {
        dialog.close()
        startTour({ track: 'advanced', chapter: button.dataset.guideChapter, replay: true })
    }
    if (!dialog.open) dialog.showModal()
}
function ensureSettingsPanel() {
    const general = document.querySelector('#a87-general-panel')
    if (!general) return false
    let panel = document.querySelector('#a89-onboarding-panel')
    if (!panel) {
        panel = document.createElement('article')
        panel.id = 'a89-onboarding-panel'
        panel.className = 'panel'
        general.appendChild(panel)
    }
    renderSettingsPanel()
    return true
}
function renderSettingsPanel() {
    const panel = document.querySelector('#a89-onboarding-panel')
    if (!panel) return
    const copy = settingsCopy()
    const state = readState()
    panel.innerHTML = `<h3>${copy.title}</h3><p>${copy.text}</p>
        <div class="a89-actions">
            <button id="a89-onboarding-replay" type="button">${copy.replay}</button>
            <button id="a89-onboarding-advanced" type="button">${t('高级功能指南 · 按章节','Advanced guide · chapters','高度なガイド・章を選択')}</button>
            <label class="a89-auto"><input id="a89-onboarding-auto" type="checkbox" ${state.autoShow ? 'checked' : ''}><span>${copy.auto}</span></label>
        </div>`
    panel.querySelector('#a89-onboarding-replay').onclick = () => startTour({ replay: true })
    panel.querySelector('#a89-onboarding-advanced').onclick = showAdvancedGuide
    panel.querySelector('#a89-onboarding-auto').onchange = (event) => {
        writeState({ autoShow: event.target.checked })
    }
}

function installObserver() {
    let queued = false
    let settingsPanelDirty = false
    let welcomeReadinessDirty = false
    const pendingRoots = new Set()
    const schedule = () => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => {
            queued = false
            const roots = [...pendingRoots]
            pendingRoots.clear()
            for (const root of roots) markTourTargets(root)
            if (
                settingsPanelDirty &&
                !document.querySelector('#a89-onboarding-panel')
            )
                ensureSettingsPanel()
            if (welcomeReadinessDirty)
                queueWelcomeReadinessCheck()
            settingsPanelDirty = false
            welcomeReadinessDirty = false
        })
    }
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                const root =
                    node instanceof Element ? node : node.parentElement
                if (!root) continue
                pendingRoots.add(root)
                if (
                    root.id === 'a87-general-panel' ||
                    root.querySelector?.('#a87-general-panel')
                )
                    settingsPanelDirty = true
                if (
                    root.id === 'pica-disclaimer-gate' ||
                    root.querySelector?.('#pica-disclaimer-gate')
                )
                    welcomeReadinessDirty = true
            }
            for (const node of mutation.removedNodes) {
                if (
                    node instanceof Element &&
                    (node.id === 'pica-disclaimer-gate' ||
                        node.querySelector?.('#pica-disclaimer-gate'))
                )
                    welcomeReadinessDirty = true
            }
        }
        if (
            pendingRoots.size ||
            settingsPanelDirty ||
            welcomeReadinessDirty
        )
            schedule()
    })
    observer.observe(document.body, { childList: true, subtree: true })
}

function bootstrap() {
    markTourTargets()
    ensureSettingsPanel()
    installObserver()
    scheduleWelcome()
    document.addEventListener('pica-language-change', () => {
        if (document.querySelector('#pica-onboarding-welcome')?.open) ensureWelcomeDialog()
        renderSettingsPanel()
    })
    window.picaOnboarding = {
        version: TOUR_VERSION,
        start: (options = {}) => startTour({ ...options, replay: true }),
        advanced: showAdvancedGuide,
        state: () => ({ ...readState() }),
        resetForTesting: () => {
            localStorage.removeItem(STATE_KEY)
            sessionStorage.removeItem(SESSION_DISMISSED_KEY)
            dismissedInMemory = false
        }
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap)
else bootstrap()
