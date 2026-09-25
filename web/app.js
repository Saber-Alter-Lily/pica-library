import {
    addLiteQueueItems,
    clearLiteState,
    emptyLiteState,
    importLibraryBundle,
    loadLiteState,
    saveLiteState
} from './lite-state.js'
import { deriveLiteAuthors } from './author-state.js'
import { installAccountOnboarding } from './account-onboarding.js'
import { createDownloadedCloud } from './downloaded-cloud.js'
import { analyzeVisualSamples, VISUAL_RUNTIME } from './visual-runtime.js'
import {
    applyTranslations,
    localizeAuthorEvidence,
    localizeError,
    resolveLanguage,
    saveLanguage,
    translate
} from './i18n.js'
import {
    LIBRARY_PAGE_SIZE,
    buildTagFrequencyIndex,
    selectDisplayTags,
    trustedBrowserCoverUrl,
    visibleLibraryPage
} from './lite-state.js'

const state = {
    mode: 'lite',
    appSessionId: crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    recommendationContextId: null,
    recommendationCycleId: null,
    recommendationBatchId: null,
    recommendationManagedV3: false,
    recommendationPending: false,
    syncPending: false,
    searchPending: false,
    recommendationFeedback: {},
    recommendationFeedbackReasonsEnabled:
        localStorage.getItem('pica-recommend-feedback-reasons') === 'true',
    visualIndexRunning: false,
    visualIndexStopRequested: false,
    visualIndexPauseRequested: false,
    visualIndexPaused: false,
    visualIndexResume: null,
    visualIndexAbortController: null,
    searchContextId: null,
    visible: [],
    libraryPage: 1,
    libraryView: localStorage.getItem('pica-library-view') || 'grid',
    libraryGridSize: localStorage.getItem('pica-library-grid-size') || 'large',
    recommendationView:
        localStorage.getItem('pica-recommendation-view') || 'grid',
    recommendationGridSize:
        localStorage.getItem('pica-recommendation-grid-size') || 'large',
    downloadedView: localStorage.getItem('pica-downloaded-view') || 'grid',
    downloadedGridSize:
        localStorage.getItem('pica-downloaded-grid-size') || 'large',
    downloadedCoversEnabled:
        localStorage.getItem('pica-downloaded-covers-enabled') !== 'false',
    shelfView: localStorage.getItem('pica-shelf-view') || 'grid',
    shelfGridSize: localStorage.getItem('pica-shelf-grid-size') || 'large',
    shelfCoversEnabled:
        localStorage.getItem('pica-shelf-covers-enabled') !== 'false',
    coversEnabled: localStorage.getItem('pica-covers-enabled') !== 'false',
    recommendationBatch: 0,
    recommendationMaxVisibleBatches: 6,
    stagedUpdate: null,
    ...emptyLiteState(),
    capabilities: null,
    libraryQueryResult: null,
    libraryQuery: { scope: 'library', tags: [], tagMode: 'all' },
    selections: {
        library: new Set(),
        recommendation: new Set(),
        search: new Set(),
        shelf: new Set()
    },
    shelves: [],
    activeShelfId: null,
    searchResults: [],
    recommendationSessionNo: 1,
    recommendationExhausted: false,
    updateProgress: null,
    chronicleSnapshot: null,
    downloadRunnerRunning: false,
    downloadRecoveryNotified: false,
    reader: {
        comicId: null,
        episodeId: null,
        pageIndex: 0,
        chapters: [],
        originView: 'downloaded',
        dirty: false
    }
}
window.picaAppSessionId = state.appSessionId
let desktop = null
let language = resolveLanguage(
    localStorage,
    navigator.languages || [navigator.language]
)
let downloadPoll = null
let downloadPollBusy = false
let importPending = false
let activeView = 'home'
const viewScrollPositions = new Map()
let lastDocumentScrollY = Math.max(0, window.scrollY)
const dialogScrollOrigins = new WeakMap()

function installDialogScrollRestoration() {
    window.addEventListener(
        'scroll',
        () => {
            if (!document.querySelector('dialog[open]'))
                lastDocumentScrollY = Math.max(0, window.scrollY)
        },
        { passive: true }
    )
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            const dialog = record.target
            if (
                record.attributeName !== 'open' ||
                !(dialog instanceof HTMLDialogElement)
            )
                continue
            if (dialog.open) {
                if (!dialogScrollOrigins.has(dialog))
                    dialogScrollOrigins.set(dialog, {
                        y: lastDocumentScrollY,
                        view: activeView
                    })
                const origin = dialogScrollOrigins.get(dialog)
                requestAnimationFrame(() => {
                    if (origin && activeView === origin.view)
                        window.scrollTo(0, origin.y)
                })
                continue
            }
            const origin = dialogScrollOrigins.get(dialog)
            if (!origin) continue
            dialogScrollOrigins.delete(dialog)
            lastDocumentScrollY = origin.y
            requestAnimationFrame(() => {
                if (activeView === origin.view)
                    window.scrollTo(0, origin.y)
            })
        }
    })
    observer.observe(document.documentElement, {
        subtree: true,
        attributes: true,
        attributeFilter: ['open']
    })
}

installDialogScrollRestoration()
const t = (key, values) => translate(language, key, values)
const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]

const VISUAL_SETTINGS_CACHE_KEY = 'pica-visual-settings-confirmed-v1'
const AUTO_UPDATE_PROMPT_KEY = 'pica-auto-update-prompt-v1'
const AUTO_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const AUTO_UPDATE_PROMPT_INTERVAL_MS = 12 * 60 * 60 * 1000
let visualSettingsMutationVersion = 0

function readConfirmedVisualSettings() {
    try {
        const value = JSON.parse(
            localStorage.getItem(VISUAL_SETTINGS_CACHE_KEY) || 'null'
        )
        if (!value || typeof value !== 'object') return null
        return {
            enabled: Boolean(value.enabled),
            samplingMode: ['local_only', 'standard', 'cover_only'].includes(
                value.samplingMode
            )
                ? value.samplingMode
                : 'local_only',
            rerankMode: ['OFF', 'SHADOW', 'LIVE'].includes(value.rerankMode)
                ? value.rerankMode
                : 'SHADOW',
            strength: ['LIGHT', 'STANDARD', 'STRONG'].includes(value.strength)
                ? value.strength
                : 'STANDARD'
        }
    } catch {
        return null
    }
}

function visualSettingsFromControls() {
    return {
        enabled: Boolean($('#visual-enabled')?.checked),
        samplingMode: $('#visual-sampling-mode')?.value || 'local_only',
        rerankMode: $('#visual-rerank-mode')?.value || 'SHADOW',
        strength: $('#visual-strength')?.value || 'STANDARD'
    }
}

function applyVisualSettingsControls(settings) {
    if (!settings) return
    if ($('#visual-enabled'))
        $('#visual-enabled').checked = Boolean(settings.enabled)
    if ($('#visual-sampling-mode'))
        $('#visual-sampling-mode').value =
            settings.samplingMode || 'local_only'
    if ($('#visual-rerank-mode'))
        $('#visual-rerank-mode').value = settings.rerankMode || 'SHADOW'
    if ($('#visual-strength'))
        $('#visual-strength').value = settings.strength || 'STANDARD'
}

function cacheConfirmedVisualSettings(settings) {
    if (!settings) return
    localStorage.setItem(
        VISUAL_SETTINGS_CACHE_KEY,
        JSON.stringify({
            enabled: Boolean(settings.enabled),
            samplingMode: settings.samplingMode || 'local_only',
            rerankMode: settings.rerankMode || 'SHADOW',
            strength: settings.strength || 'STANDARD'
        })
    )
}

function showOperationToast(message, tone = 'neutral', timeout = 4600) {
    if (!message) return
    let stack = $('#operation-toast-stack')
    if (!stack) {
        stack = document.createElement('div')
        stack.id = 'operation-toast-stack'
        stack.setAttribute('role', 'status')
        stack.setAttribute('aria-live', 'polite')
        document.body.appendChild(stack)
    }
    const node = document.createElement('div')
    node.className =
        'operation-toast' + (tone === 'neutral' ? '' : ' ' + tone)
    node.textContent = message
    stack.appendChild(node)
    window.setTimeout(() => node.remove(), timeout)
}

function setBackgroundTaskIndicator(message = '') {
    let node = $('#background-task-indicator')
    if (!node) {
        node = document.createElement('div')
        node.id = 'background-task-indicator'
        node.setAttribute('role', 'status')
        node.setAttribute('aria-live', 'polite')
        node.hidden = true
        document.body.appendChild(node)
    }
    if (!message) {
        node.hidden = true
        node.textContent = ''
        return
    }
    node.textContent = message
    node.hidden = false
}

applyVisualSettingsControls(readConfirmedVisualSettings())

function askConfirm(message, title = t('common.confirmAction')) {
    const dialog = $('#app-confirm-dialog')
    if (!dialog) return Promise.resolve(window.confirm(message))
    if (dialog.open) dialog.close('cancel')
    $('#app-confirm-title').textContent = title
    $('#app-confirm-message').textContent = message
    dialog.returnValue = 'cancel'
    return new Promise((resolve) => {
        dialog.addEventListener(
            'close',
            () => resolve(dialog.returnValue === 'confirm'),
            { once: true }
        )
        dialog.showModal()
        requestAnimationFrame(() => $('#app-confirm-submit')?.focus())
    })
}

function askText(
    title,
    initialValue = '',
    label = t('common.name')
) {
    const dialog = $('#app-prompt-dialog')
    if (!dialog)
        return Promise.resolve(
            window.prompt(title, initialValue)?.trim() || null
        )
    if (dialog.open) dialog.close('cancel')
    $('#app-prompt-title').textContent = title || t('common.enterValue')
    const labelNode = $('#app-prompt-label')
    if (labelNode?.firstChild) labelNode.firstChild.textContent = label
    const input = $('#app-prompt-input')
    input.value = initialValue
    $('#app-prompt-message').textContent = ''
    dialog.returnValue = 'cancel'
    return new Promise((resolve) => {
        dialog.addEventListener(
            'close',
            () => {
                const value = input.value.trim()
                resolve(
                    dialog.returnValue === 'confirm' && value
                        ? value
                        : null
                )
            },
            { once: true }
        )
        dialog.showModal()
        requestAnimationFrame(() => {
            input.focus()
            input.select()
        })
    })
}

window.picaConfirmAction = askConfirm
window.picaPromptText = askText

async function withBusyButton(button, work) {
    if (!button || button.disabled) return undefined
    button.disabled = true
    try {
        return await work()
    } finally {
        button.disabled = false
    }
}

const escapeHtml = (value) =>
    String(value ?? '').replace(
        /[&<>"']/g,
        (character) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[character]
    )
const normalize = (value) =>
    String(value ?? '')
        .normalize('NFKC')
        .trim()
        .toLocaleLowerCase()
const splitList = (value) =>
    String(value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

function applyLanguage(nextLanguage, persist = false) {
    language = nextLanguage
    if (persist) language = saveLanguage(localStorage, language)
    $('#language-select').value = language
    applyTranslations(language)
    if (desktop) applyDesktopPlatformCapabilities()
    document.dispatchEvent(new Event('pica-language-change'))
    if (persist) {
        renderAll()
        void loadJobs()
        if (activeView === 'shelves') {
            void loadShelves().then(() => {
                if (state.activeShelfId) void openShelf(state.activeShelfId)
            })
        }
        if (activeView === 'downloaded') void loadDownloaded()
        if (activeView === 'settings') { void loadPreviewCacheStats(); void loadVisualStatus() }
        if (activeView === 'reader') {
            $('#reader .eyebrow').textContent = t(state.reader.online ? 'reader.online' : 'reader.eyebrow')
            renderReaderChapterHeading()
            renderReaderPages()
        }
        if (state.updateProgress) renderUpdateProgress(state.updateProgress)
    }
}

$('#language-select').onchange = (event) =>
    applyLanguage(event.target.value, true)
$('#mobile-bridge-refresh')?.addEventListener('click', async () => {
    try {
        await desktopPost('/api/v1/desktop/test-connection', { mobileBridgeAction: 'rotate' })
        await loadDesktop()
    } catch (error) {
        $('#mobile-bridge-state').textContent = localizeError(language, error)
    }
})
async function copyMobileBridgeValue(selector, successKey) {
    const value = $(selector)?.textContent?.trim()
    if (!value) return
    try {
        await navigator.clipboard.writeText(value)
        $('#mobile-bridge-state').textContent = t(successKey)
    } catch {
        $('#mobile-bridge-state').textContent = t('mobile.copyFailed')
    }
}
$('#mobile-bridge-copy-address')?.addEventListener('click', () =>
    void copyMobileBridgeValue('#mobile-bridge-address', 'mobile.copiedAddress')
)
$('#mobile-bridge-copy-code')?.addEventListener('click', () =>
    void copyMobileBridgeValue('#mobile-bridge-code', 'mobile.copiedCode')
)
$('#mobile-bridge-copy-link')?.addEventListener('click', () =>
    void copyMobileBridgeValue('#mobile-bridge-pair-link', 'mobile.copiedLink')
)
applyLanguage(language)

async function api(path, options) {
    const response = await fetch(path, options)
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`)
    return value
}

const post = (path, value) =>
    api(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value)
    })
// Legacy V2 contract remains intentionally discoverable:
// post('/api/v1/recommendation-sessions', {})
// api('/api/v1/recommendation-sessions/status')
// action: 'restart'
// recommendation.nextSessionReady

function recordRecommendationEvent(eventType, payload = {}) {
    if (state.mode !== 'connected') return
    const value = {
        eventType,
        appSessionId: state.appSessionId,
        recommendationContextId: state.recommendationContextId,
        recommendationCycleId: state.recommendationCycleId,
        ...payload
    }
    void post('/api/v1/recommendation-events', {
        ...value,
        contextId: payload.contextId || value.recommendationContextId || null
    }).catch(() => undefined)
}

const recommendationImpressionQueue = []
let recommendationImpressionFlushTimer = null

function flushRecommendationImpressions() {
    if (recommendationImpressionFlushTimer) {
        window.clearTimeout(recommendationImpressionFlushTimer)
        recommendationImpressionFlushTimer = null
    }
    if (!recommendationImpressionQueue.length) return
    const events = recommendationImpressionQueue.splice(0, 24)
    if (state.mode === 'connected') {
        void api('/api/v1/recommendation-events/batch', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ events }),
            keepalive: true
        }).catch(() => undefined)
    }
    if (recommendationImpressionQueue.length)
        recommendationImpressionFlushTimer = window.setTimeout(
            flushRecommendationImpressions,
            25
        )
}

function queueRecommendationImpression(payload = {}) {
    if (state.mode !== 'connected') return
    const value = {
        eventType: 'recommend_impression',
        occurredAt: new Date().toISOString(),
        appSessionId: state.appSessionId,
        recommendationCycleId: state.recommendationCycleId,
        ...payload
    }
    recommendationImpressionQueue.push({
        ...value,
        contextId:
            payload.contextId || state.recommendationContextId || null
    })
    if (recommendationImpressionQueue.length >= 24)
        return flushRecommendationImpressions()
    if (!recommendationImpressionFlushTimer)
        recommendationImpressionFlushTimer = window.setTimeout(
            flushRecommendationImpressions,
            25
        )
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden')
        flushRecommendationImpressions()
})

const mutate = (path, method, value = {}) =>
    api(path, {
        method,
        headers: {
            'content-type': 'application/json',
            ...(state.appSessionId
                ? { 'x-pica-app-session': state.appSessionId }
                : {}),
            ...(state.recommendationContextId
                ? { 'x-pica-context-id': state.recommendationContextId }
                : {}),
            ...(desktop?.csrfToken ? { 'x-pica-csrf': desktop.csrfToken } : {})
        },
        body: JSON.stringify(value)
    })

const desktopPost = (path, value = {}) =>
    api(path, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': desktop?.csrfToken || ''
        },
        body: JSON.stringify(value)
    })

window.picaDesktopPost = desktopPost

function setupValue(prefix) {
    return {
        account: $(`#${prefix}-account`).value,
        password: $(`#${prefix}-password`).value,
        libraryDirectory: $(`#${prefix}-directory`).value,
        profile: $(`#${prefix}-profile`).value,
        proxyUrl: $(`#${prefix}-proxy`).value
    }
}

function activateView(id) {
    const previousView = activeView
    if (previousView && previousView !== 'reader')
        viewScrollPositions.set(previousView, Math.max(0, window.scrollY))
    if (id === 'reader' && previousView !== 'reader')
        state.reader.originView = previousView
    activeView = id
    document.querySelectorAll('.view').forEach((view) =>
        view.classList.toggle('active', view.id === id)
    )
    document.querySelectorAll('nav button').forEach((item) =>
        item.classList.toggle('active', item.dataset.view === id)
    )
    document.body.classList.toggle('reader-active', id === 'reader')
    requestAnimationFrame(() => {
        if (id === 'reader') window.scrollTo(0, 0)
        else window.scrollTo(0, viewScrollPositions.get(id) ?? 0)
    })
}

function applyDesktopPlatformCapabilities() {
    const platform = desktop?.platform || {}
    const picker = desktop?.nativePicker || {}
    const folderPicker = Boolean(
        picker.folderPicker ?? platform.nativeFolderPicker
    )
    for (const [buttonId, inputId] of [
        ['#setup-folder', '#setup-directory'],
        ['#settings-folder', '#settings-directory']
    ]) {
        const button = $(buttonId)
        const input = $(inputId)
        if (button) button.hidden = !folderPicker
        if (input)
            input.title = folderPicker ? '' : t('setup.folderManual')
    }

    const backend = desktop?.credentialBackend || {}
    const security = $('#setup-security')
    if (security) {
        const key = backend.sessionOnly
            ? 'setup.securitySessionOnly'
            : backend.kind === 'macos-keychain'
              ? 'setup.securityMacos'
              : backend.kind === 'linux-secret-service'
                ? 'setup.securityLinux'
                : backend.kind === 'windows-dpapi'
                  ? 'setup.securityWindows'
                  : 'setup.security'
        security.textContent = t(key)
    }

    const managedEhWebLogin = platform.managedEhWebLogin !== false
    const ehLoginStart = $('#eh-web-login-start')
    const ehLoginCancel = $('#eh-web-login-cancel')
    if (!managedEhWebLogin) {
        if (ehLoginStart) ehLoginStart.hidden = true
        if (ehLoginCancel) ehLoginCancel.hidden = true
    }

    const updatePackages =
        state.capabilities?.features?.updatePackages !== false &&
        platform.selfUpdate !== false
    const softwareTab = document.querySelector(
        '#maintenance [data-tab="software-updates"]'
    )
    if (softwareTab) softwareTab.hidden = !updatePackages
    const softwarePanel = $('#software-updates')
    if (softwarePanel) softwarePanel.hidden = !updatePackages
    const updatePanel = $('#settings-update')
    if (updatePanel) updatePanel.hidden = !updatePackages
}

async function chooseFolder(prefix) {
    const value = await desktopPost('/api/v1/desktop/choose-folder')
    if (value.path) $(`#${prefix}-directory`).value = value.path
}

function renderMobileBridge() {
    const panel = $('#mobile-bridge-details')
    const stateLabel = $('#mobile-bridge-state')
    if (!panel || !stateLabel) return
    const mobile = desktop?.mobileBridge
    if (!mobile?.enabled) {
        panel.hidden = true
        stateLabel.textContent = t('mobile.bridgeStopped')
        return
    }
    panel.hidden = false
    stateLabel.textContent = t('mobile.bridgeStarted')
    const addresses = Array.isArray(mobile.addresses) ? mobile.addresses : []
    const address = addresses[0] || ''
    const pairingCode = mobile.pairingCode || ''
    $('#mobile-bridge-address').textContent =
        address || t('mobile.port', { port: mobile.port })
    $('#mobile-bridge-code').textContent = pairingCode || '------'
    const pairLink =
        address && pairingCode
            ? `picalibrary://pair?host=${encodeURIComponent(address)}&code=${encodeURIComponent(pairingCode)}`
            : ''
    const pairLinkNode = $('#mobile-bridge-pair-link')
    if (pairLinkNode) pairLinkNode.textContent = pairLink
    const qr = $('#mobile-bridge-qr')
    if (qr) {
        qr.replaceChildren()
        if (pairLink && typeof window.QRCode === 'function') {
            new window.QRCode(qr, {
                text: pairLink,
                width: 184,
                height: 184,
                correctLevel: window.QRCode.CorrectLevel.M
            })
        }
    }
    const expiry = mobile.pairingExpiresAt ? new Date(mobile.pairingExpiresAt) : null
    $('#mobile-bridge-expiry').textContent = expiry && Number.isFinite(expiry.getTime())
        ? t('mobile.expires', { time: expiry.toLocaleTimeString() })
        : ''
    const devices = Array.isArray(mobile.pairedDevices)
        ? mobile.pairedDevices
        : []
    const deviceCount = $('#mobile-bridge-device-count')
    if (deviceCount) deviceCount.textContent = String(devices.length)
    $('#mobile-bridge-devices').textContent = devices.length
        ? devices.map((item) => {
            const seen = item.lastSeenAt ? new Date(item.lastSeenAt) : null
            const suffix = seen && Number.isFinite(seen.getTime())
                ? ` · ${t('mobile.lastSeen', { time: seen.toLocaleString() })}`
                : ''
            return `${item.deviceName}${suffix}`
        }).join('；')
        : t('mobile.noDevices')
}

async function registerDesktopBrowserSession() {
    if (!desktop?.csrfToken) return
    try {
        await desktopPost('/api/v1/desktop/browser-session', {
            action: 'open',
            sessionId: state.appSessionId
        })
    } catch {
        // Browser-session cleanup is best-effort and must not block the UI.
    }
}

function closeDesktopBrowserSession() {
    if (!desktop?.csrfToken) return
    try {
        void fetch('/api/v1/desktop/browser-session', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-pica-csrf': desktop.csrfToken
            },
            body: JSON.stringify({
                action: 'close',
                sessionId: state.appSessionId
            }),
            keepalive: true
        })
    } catch {
        // The page is already leaving.
    }
}

async function loadDesktop() {
    try {
        desktop = await api('/api/v1/desktop/status')
        state.capabilities = await api('/api/v1/capabilities')
        $('#settings-nav').hidden = false
        $('#settings-version').textContent = `Pica Library ${desktop.version}`
        $('#update-current-version').textContent = `v${desktop.version}`
        $('#settings-directory').value = desktop.libraryDirectory || ''
        $('#settings-profile').value = desktop.profile || 'balanced'
        $('#settings-proxy').value = desktop.proxyUrl || ''
        $('#setup-directory').value = desktop.libraryDirectory || ''
        applyDesktopPlatformCapabilities()
        renderTimestamps()
        renderMobileBridge()
        void registerDesktopBrowserSession()
        if (!desktop.configured) {
            document.body.classList.add('onboarding')
            // Multi-provider onboarding must not hide E-H / ExH account access.
            // Pica setup remains available, but is no longer the gate to Settings.
            document.querySelector('nav').hidden = false
            activateView('setup')
        } else {
            document.body.classList.remove('onboarding')
            document.querySelector('nav').hidden = false
        }
    } catch {
        desktop = null
    }
}

const updatePhaseText = {
    downloading: 'update.phase.downloading',
    validating: 'update.phase.validating',
    extracting: 'update.phase.extracting',
    staged: 'update.phase.staged',
    'preparing-backup': 'update.phase.preparingBackup',
    'waiting-for-exit': 'update.phase.waitingExit',
    'replacing-files': 'update.phase.replacing',
    starting: 'update.phase.starting',
    'health-check': 'update.phase.health',
    complete: 'update.phase.complete',
    rollback: 'update.phase.rollback',
    failed: 'update.phase.failed'
}

function renderUpdateProgress(progress) {
    state.updateProgress = progress
    const panel = $('#update-progress')
    if (!progress || progress.phase === 'idle') {
        panel.hidden = true
        return
    }
    panel.hidden = false
    $('#update-progress-phase').textContent = updatePhaseText[progress.phase]
        ? t(updatePhaseText[progress.phase])
        : progress.phase
    const bar = $('#update-progress-bar')
    if (progress.total > 0) {
        bar.max = progress.total
        bar.value = progress.current || 0
    } else {
        bar.removeAttribute('value')
    }
}

function renderStagedUpdate(value) {
    state.stagedUpdate = value
    const summary = $('#update-summary')
    summary.hidden = false
    summary.innerHTML = `<strong>${escapeHtml(value.targetVersion)}</strong><br>${t(
        'update.summary',
        {
            files: Number(value.fileCount),
            deletions: Number(value.deletionCount),
            schema: Number(value.databaseSchemaVersion),
            full: value.requiresFullInstall
                ? t('update.fullRequiredInline')
                : ''
        }
    )}`
    $('#update-apply').hidden = Boolean(value.requiresFullInstall)
    clearFullInstallGuide()
    $('#update-message').textContent = value.requiresFullInstall
        ? t('update.fullRequired')
        : t('update.staged')
    renderUpdateProgress({
        phase: 'staged',
        current: value.fileCount,
        total: value.fileCount
    })
    return value
}

async function stageUpdateFile(file) {
    if (!desktop) throw new Error(t('update.localOnly'))
    if (!file || !file.name.toLowerCase().endsWith('.zip'))
        throw new Error(t('update.chooseZip'))
    clearFullInstallGuide()
    $('#update-message').textContent = t('update.validating')
    renderUpdateProgress({ phase: 'validating' })
    const response = await fetch('/api/v1/update/stage', {
        method: 'POST',
        headers: {
            'content-type': 'application/zip',
            'x-pica-csrf': desktop.csrfToken,
            'x-update-filename': encodeURIComponent(file.name)
        },
        body: file
    })
    const value = await response.json()
    if (!response.ok)
        throw new Error(value.error || t('update.validationFailed'))
    return renderStagedUpdate(value)
}

async function applyStagedUpdate(
    value = state.stagedUpdate,
    skipConfirm = false
) {
    if (!value) return
    if (
        !skipConfirm &&
        !(await askConfirm(
            t('update.confirm', { version: value.targetVersion })
        ))
    )
        return
    await desktopPost('/api/v1/update/apply', { id: value.id })
    $('#update-message').textContent = t('update.applying')
    renderUpdateProgress({ phase: 'waiting-for-exit' })
}

function fullInstallDownloadUrl(version) {
    const encoded = encodeURIComponent(String(version || '').trim())
    return `https://github.com/Saber-Alter-Lily/pica-library/releases/download/v${encoded}/Pica-Library-v${encoded}-windows-x64.zip`
}

function renderFullInstallGuide(value) {
    const message = $('#update-message')
    const version = String(value?.version || '').trim()
    const releaseUrl =
        String(value?.releaseUrl || '').trim() ||
        `https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v${encodeURIComponent(version)}`
    message.classList.add('full-install-guide')
    message.innerHTML = t('update.fullGuide', {
        version: escapeHtml(version),
        downloadUrl: escapeHtml(fullInstallDownloadUrl(version)),
        releaseUrl: escapeHtml(releaseUrl)
    })
}

function clearFullInstallGuide() {
    $('#update-message')?.classList.remove('full-install-guide')
}

const updateDropzone = $('#update-dropzone')
;['dragenter', 'dragover'].forEach((name) =>
    updateDropzone.addEventListener(name, (event) => {
        event.preventDefault()
        updateDropzone.classList.add('dragover')
    })
)
;['dragleave', 'drop'].forEach((name) =>
    updateDropzone.addEventListener(name, (event) => {
        event.preventDefault()
        updateDropzone.classList.remove('dragover')
    })
)
updateDropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0]
    if (file)
        void stageUpdateFile(file).catch((error) => {
            $('#update-message').textContent = localizeError(language, error)
            renderUpdateProgress({ phase: 'failed' })
        })
})
$('#update-file').onchange = (event) => {
    const file = event.target.files?.[0]
    if (file)
        void stageUpdateFile(file).catch((error) => {
            $('#update-message').textContent = localizeError(language, error)
            renderUpdateProgress({ phase: 'failed' })
        })
}
$('#update-check').onclick = async (event) => {
    const message = $('#update-message')
    clearFullInstallGuide()
    if (!desktop) {
        message.textContent = t('update.localOnly')
        return
    }
    await withBusyButton(event.currentTarget, async () => {
        message.textContent = t('update.checking')
        try {
            const value = await api('/api/v1/update/check')
            if (value.status === 'current') {
                message.textContent = t('update.current')
                return
            }
            if (value.status === 'full-install') {
                renderFullInstallGuide(value)
                return
            }
            message.innerHTML = t('update.incrementalFound', {
                version: escapeHtml(value.version),
                url: escapeHtml(value.releaseUrl)
            })
        } catch (error) {
            message.textContent = localizeError(language, error)
        }
    })
}
$('#update-one-click').onclick = async () => {
    const button = $('#update-one-click')
    const message = $('#update-message')
    clearFullInstallGuide()
    if (!desktop) {
        message.textContent = t('update.localOnly')
        return
    }
    button.disabled = true
    try {
        message.textContent = t('update.checking')
        const available = await api('/api/v1/update/check')
        if (available.status === 'current') {
            message.textContent = t('update.current')
            return
        }
        if (available.status === 'full-install') {
            renderFullInstallGuide(available)
            return
        }
        if (
            !(await askConfirm(
                t('update.oneClickConfirm', { version: available.version })
            ))
        )
            return
        message.textContent = t('update.downloading', {
            version: available.version
        })
        renderUpdateProgress({ phase: 'downloading' })
        const staged = await desktopPost('/api/v1/update/prepare-latest')
        if (staged.status === 'current') {
            message.textContent = t('update.current')
            renderUpdateProgress({ phase: 'idle' })
            return
        }
        if (staged.status === 'full-install') {
            renderFullInstallGuide(staged)
            renderUpdateProgress({ phase: 'idle' })
            return
        }
        renderStagedUpdate(staged)
        await applyStagedUpdate(staged, true)
    } catch (error) {
        message.textContent = localizeError(language, error)
        renderUpdateProgress({ phase: 'failed' })
    } finally {
        button.disabled = false
    }
}
$('#update-apply').onclick = async () => {
    try {
        await applyStagedUpdate()
    } catch (error) {
        $('#update-message').textContent = localizeError(language, error)
        renderUpdateProgress({ phase: 'failed' })
    }
}

function readAutoUpdatePromptState() {
    try {
        const value = JSON.parse(localStorage.getItem(AUTO_UPDATE_PROMPT_KEY) || 'null')
        return value && typeof value === 'object' ? value : {}
    } catch {
        return {}
    }
}

function writeAutoUpdatePromptState(patch) {
    localStorage.setItem(
        AUTO_UPDATE_PROMPT_KEY,
        JSON.stringify({ ...readAutoUpdatePromptState(), ...patch })
    )
}

function automaticUpdateCheckDue() {
    const value = readAutoUpdatePromptState()
    return (
        Date.now() - Number(value.checkedAt || 0) >=
        AUTO_UPDATE_CHECK_INTERVAL_MS
    )
}

function updatePromptDue(version) {
    const value = readAutoUpdatePromptState()
    return (
        value.version !== version ||
        Date.now() - Number(value.promptedAt || 0) >=
            AUTO_UPDATE_PROMPT_INTERVAL_MS
    )
}

function markUpdatePrompted(version) {
    writeAutoUpdatePromptState({ version, promptedAt: Date.now() })
}

function showAvailableUpdateInSettings(value) {
    const message = $('#update-message')
    clearFullInstallGuide()
    if (value.status === 'full-install') {
        renderFullInstallGuide(value)
    } else if (message) {
        message.innerHTML = t('update.incrementalFound', {
            version: escapeHtml(value.version),
            url: escapeHtml(value.releaseUrl)
        })
    }
    activateView('settings')
    requestAnimationFrame(() => {
        const softwareHub = document.querySelector(
            '.a87-hub-nav button[data-hub-panel="software"]'
        )
        if (softwareHub) softwareHub.click()
        else
            $('#settings-update')?.scrollIntoView({
                block: 'start',
                behavior: 'smooth'
            })
    })
}

async function maybePromptForUpdate() {
    if (
        !desktop ||
        state.mode === 'lite' ||
        document.body.classList.contains('browser-lite-forced') ||
        state.capabilities?.features?.updatePackages === false ||
        desktop?.platform?.selfUpdate === false ||
        !automaticUpdateCheckDue()
    )
        return
    try {
        const available = await api('/api/v1/update/check')
        writeAutoUpdatePromptState({ checkedAt: Date.now() })
        if (!available || available.status === 'current') return
        const version = String(available.version || '').trim()
        if (!version || !updatePromptDue(version)) return
        markUpdatePrompted(version)
        if (!(await askConfirm(t('update.availablePrompt', { version })))) return
        showAvailableUpdateInSettings(available)
    } catch {
        // Startup update discovery is fail-open; manual update check remains available.
    }
}

function displayDate(value) {
    if (!value) return t('time.none')
    const date = new Date(value)
    return Number.isNaN(date.valueOf())
        ? t('time.none')
        : date.toLocaleString(language)
}

function renderTimestamps() {
    const syncedAt = desktop?.lastSync?.finishedAt ?? state.sourceSyncedAt
    const exportedAt = desktop?.lastExportAt ?? state.generatedAt
    $('#last-sync').textContent = t('time.lastSync', {
        time: displayDate(syncedAt)
    })
    $('#browser-lite-timestamps').textContent = t('time.syncExport', {
        sync: displayDate(syncedAt),
        export: displayDate(exportedAt)
    })
    $('#lite-snapshot-bar').hidden =
        state.mode !== 'lite' || state.records.length === 0
    $('#lite-snapshot-time').textContent = t('time.snapshot', {
        time: displayDate(state.generatedAt)
    })
}

function setProgress(element, phase, current, total) {
    if (!element) return
    element.hidden = false
    element
        .querySelector('span')
        ?.replaceChildren(document.createTextNode(phase))
    const progress = element.querySelector('progress')
    if (progress) {
        progress.hidden = !(total > 0)
        if (total > 0) {
            progress.max = total
            progress.value = Math.min(total, Math.max(0, current || 0))
        }
    }
}

function clearProgress(element) {
    if (element) element.hidden = true
}

async function waitForDesktopHealth(timeoutMs = 30000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
        try {
            const status = await api('/api/v1/status')
            if (
                status?.application === 'Pica Library' ||
                status?.status === 'Connected'
            )
                return status
        } catch {
            // The engine is expected to be briefly unavailable during restart.
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error('The local engine did not become healthy in time.')
}

async function testDesktop(prefix) {
    const button = $(`#${prefix}-test`)
    const message = $(`#${prefix}-message`)
    await withBusyButton(button, async () => {
        message.textContent = t('message.testing')
        try {
            await desktopPost(
                '/api/v1/desktop/test-connection',
                setupValue(prefix)
            )
            message.textContent = t('message.connectionSuccess')
            if (prefix === 'setup') $('#setup-next-step').hidden = false
        } catch (error) {
            message.textContent = localizeError(language, error)
        }
    })
}

$('#setup-folder').onclick = () => chooseFolder('setup')
$('#settings-folder').onclick = () => chooseFolder('settings')
installAccountOnboarding({ post: desktopPost, getDesktop: () => desktop, getLanguage: () => language })
$('#setup-open-settings').onclick = () => activateView('settings')
$('#setup-open-eh').onclick = () => {
    activateView('settings')
    const panel = $('#settings-eh-account')
    panel.open = true
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
const downloadedCloud = createDownloadedCloud({ post: desktopPost, getDesktop: () => desktop, getLanguage: () => language })
$('#setup-test').onclick = () => testDesktop('setup')
$('#settings-test').onclick = () => testDesktop('settings')
$('#setup-form').onsubmit = async (event) => {
    event.preventDefault()
    const button =
        event.submitter ||
        $('#setup-form button[type="submit"]')
    const message = $('#setup-message')
    await withBusyButton(button, async () => {
        try {
            await desktopPost('/api/v1/desktop/settings', setupValue('setup'))
            message.textContent = t('message.savedOpening')
            await waitForDesktopHealth()
            await loadDesktop()
            $('#setup-next-step').hidden = false
            message.textContent = t('settings.appliedSync')
        } catch (error) {
            message.textContent = localizeError(language, error)
        }
    })
}
$('#settings-form').onsubmit = async (event) => {
    event.preventDefault()
    const button =
        event.submitter ||
        $('#settings-form button[type="submit"]')
    const message = $('#settings-message')
    await withBusyButton(button, async () => {
        try {
            const value = setupValue('settings')
            if (!value.account) delete value.account
            if (!value.password) delete value.password
            const result = await desktopPost('/api/v1/desktop/settings', value)
            message.textContent = result.restarting
                ? t('message.savedRestarting')
                : t('message.settingsSaved')
            $('#settings-password').value = ''
        } catch (error) {
            message.textContent = localizeError(language, error)
        }
    })
}
async function openDesktopDirectory(kind, button, message) {
    await withBusyButton(button, async () => {
        try {
            await desktopPost('/api/v1/desktop/open-directory', { kind })
        } catch (error) {
            if (message)
                message.textContent = localizeError(language, error)
        }
    })
}
$('#open-data').onclick = (event) =>
    void openDesktopDirectory(
        'data',
        event.currentTarget,
        $('#settings-message')
    )
$('#open-logs').onclick = (event) =>
    void openDesktopDirectory(
        'logs',
        event.currentTarget,
        $('#settings-message')
    )
$('#export-browser-lite').onclick = async (event) => {
    const message = $('#browser-lite-export-message')
    await withBusyButton(event.currentTarget, async () => {
        message.textContent = t('message.browserLiteExporting')
        try {
            const result = await desktopPost(
                '/api/v1/desktop/export-browser-lite'
            )
            if (result.cancelled) {
                message.textContent = t('message.browserLiteExportCancelled')
                return
            }
            message.textContent = t('message.browserLiteExported')
            $('#open-browser-lite-export').hidden = false
            desktop.lastExportAt = result.generatedAt
            renderTimestamps()
        } catch (error) {
            message.textContent = String(error?.message || error).includes(
                'There is no library data to export yet'
            )
                ? t('message.browserLiteExportEmpty')
                : t('message.browserLiteExportFailed')
        }
    })
}
$('#sync-export-browser-lite').onclick = async (event) => {
    const button = event.currentTarget
    if (button.disabled) return
    button.disabled = true
    const message = $('#browser-lite-export-message')
    message.textContent = t('bundle.syncExporting')
    const phases = {
        'sync-favorites': 'bundle.phase.sync',
        'update-library': 'bundle.phase.library',
        'prepare-recommendations': 'bundle.phase.recommendations',
        'generate-bundle': 'bundle.phase.generate',
        'choose-save-location': 'bundle.phase.choose',
        'write-file': 'bundle.phase.write',
        complete: 'bundle.phase.complete'
    }
    const progressTimer = setInterval(async () => {
        try {
            const status = await api('/api/v1/desktop/status')
            const phase = status.browserLiteExportProgress?.phase
            setProgress(
                $('#download-operation'),
                phases[phase] ? t(phases[phase]) : t('bundle.preparing'),
                0,
                0
            )
        } catch {
            // The export request owns error reporting.
        }
    }, 600)
    try {
        const result = await desktopPost(
            '/api/v1/desktop/sync-export-browser-lite'
        )
        if (result.cancelled) {
            message.textContent = t('bundle.cancelled')
            return
        }
        message.textContent = t('bundle.complete')
        $('#open-browser-lite-export').hidden = false
        desktop.lastSync = { finishedAt: result.sourceSyncedAt }
        desktop.lastExportAt = result.generatedAt
        renderTimestamps()
    } catch (error) {
        message.textContent = localizeError(language, error)
    } finally {
        clearInterval(progressTimer)
        clearProgress($('#download-operation'))
        button.disabled = false
    }
}
$('#open-browser-lite-export').onclick = (event) =>
    void openDesktopDirectory(
        'browser-lite-export',
        event.currentTarget,
        $('#browser-lite-export-message')
    )
$('#open-browser-lite').onclick = async (event) => {
    await withBusyButton(event.currentTarget, async () => {
        try {
            await desktopPost('/api/v1/desktop/open-browser-lite')
        } catch (error) {
            $('#browser-lite-export-message').textContent =
                localizeError(language, error)
        }
    })
}
$('#detect-proxy').onclick = async (event) => {
    await withBusyButton(event.currentTarget, async () => {
        try {
            const result = await desktopPost(
                '/api/v1/desktop/detect-proxy',
                setupValue('setup')
            )
            $('#setup-message').textContent = result.candidates?.length
                ? `Detected ${result.candidates.map((item) => item.url).join(', ')}`
                : 'No local proxy detected.'
            if (
                result.candidates?.[0] &&
                !result.candidates[0].url.includes('***')
            )
                $('#setup-proxy').value = result.candidates[0].url
        } catch (error) {
            $('#setup-message').textContent = localizeError(language, error)
        }
    })
}
$('#settings-detect-proxy').onclick = async (event) => {
    const message = $('#settings-message')
    await withBusyButton(event.currentTarget, async () => {
        try {
            const value = setupValue('settings')
            if (!value.account) delete value.account
            if (!value.password) delete value.password
            const result = await desktopPost(
                '/api/v1/desktop/detect-proxy',
                value
            )
            const usable = result.candidates?.find((item) => item.usable)
            message.textContent = usable
                ? t('proxy.detected', { url: usable.url })
                : result.candidates?.length
                  ? t('proxy.localUnavailable')
                  : t('proxy.none')
            if (usable && !usable.url.includes('***'))
                $('#settings-proxy').value = usable.url
        } catch (error) {
            message.textContent = localizeError(language, error)
        }
    })
}
$('#exit-app').onclick = async (event) => {
    if (!(await askConfirm(t('settings.exitConfirm')))) return
    await withBusyButton(event.currentTarget, async () => {
        try {
            await desktopPost('/api/v1/desktop/shutdown')
            document.body.innerHTML =
                `<main><article class="notice"><strong>${t('message.stopped')}</strong><p>${t('message.closeTab')}</p></article></main>`
        } catch (error) {
            $('#settings-message').textContent =
                localizeError(language, error)
        }
    })
}

function replaceLiteState(value) {
    Object.assign(state, value)
}

async function persistLiteState() {
    if (state.mode !== 'lite') return
    await saveLiteState(state)
}

function parseCsv(text) {
    const rows = []
    let row = []
    let cell = ''
    let quoted = false
    text = text.replace(/^\uFEFF/, '')
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index]
        if (quoted) {
            if (character === '"' && text[index + 1] === '"') {
                cell += '"'
                index += 1
            } else if (character === '"') quoted = false
            else cell += character
        } else if (character === '"') quoted = true
        else if (character === ',') {
            row.push(cell)
            cell = ''
        } else if (character === '\n') {
            row.push(cell.replace(/\r$/, ''))
            if (row.some(Boolean)) rows.push(row)
            row = []
            cell = ''
        } else cell += character
    }
    if (cell || row.length) {
        row.push(cell)
        rows.push(row)
    }
    return rows
}

function csvRecords(text) {
    const rows = parseCsv(text)
    const headers = rows[0] || []
    const at = (row, ...names) => {
        for (const name of names) {
            const index = headers.indexOf(name)
            if (index >= 0) return row[index] || ''
        }
        return ''
    }
    return rows.slice(1).flatMap((row) => {
        const comicId = at(row, 'comic_id', '_id', 'id').trim()
        const title = at(row, 'title').trim()
        if (!comicId || !title) return []
        return [
            {
                comicId,
                title,
                author: at(row, 'author', 'author_raw'),
                tags: splitList(at(row, 'tags').replaceAll('|', ',')),
                categories: splitList(
                    at(row, 'categories').replaceAll('|', ',')
                ),
                totalLikes: Number(at(row, 'total_likes', 'totalLikes')) || 0,
                totalViews: Number(at(row, 'total_views', 'totalViews')) || 0,
                updatedAt: at(row, 'updated_at'),
                isFavorite: true
            }
        ]
    })
}

function deriveAuthors() {
    state.authors = deriveLiteAuthors(state.records, normalize)
}

function renderSummary(value = {}) {
    const items = [
        [t('common.comics'), value.comics ?? state.records.length],
        [t('common.favorites'), value.favorites ?? state.records.length],
        [t('common.authors'), value.authors ?? state.authors.length],
        [
            t('common.pendingAuthors'),
            value.authorsPendingReview ??
                state.authors.filter(
                    (author) => author.reviewStatus === 'pending'
                ).length
        ],
        [t('common.episodes'), value.episodes || 0],
        [t('common.downloadedComics'), value.downloadedComics || 0],
        [t('common.downloadedPictures'), value.downloadedPictures || 0],
        [t('common.litePlans'), state.queue.length]
    ]
    $('#summary').innerHTML = items
        .map(
            ([label, count]) =>
                `<div class="metric"><span>${label}</span><strong>${Number(count).toLocaleString()}</strong></div>`
        )
        .join('')
}

function setGridSize(scope, size) {
    const key = `${scope}GridSize`
    state[key] = size
    localStorage.setItem(`pica-${scope}-grid-size`, size)
    const target =
        scope === 'library'
            ? $('#comic-grid')
            : scope === 'recommendation'
              ? $('#recommend-results')
              : scope === 'downloaded'
                ? $('#downloaded-grid-items')
                : $('#shelf-items')
    if (target) {
        target.classList.remove(
            'grid-size-small',
            'grid-size-medium',
            'grid-size-large',
            'view-grid-size-small',
            'view-grid-size-medium',
            'view-grid-size-large'
        )
        target.classList.add(`grid-size-${size}`)
    }
    $$(`[data-size-scope="${scope}"]`).forEach((button) =>
        button.setAttribute(
            'aria-pressed',
            String(button.dataset.gridSize === size)
        )
    )
}

function mountOnlineReadButtons(container) {
    if (state.mode !== 'connected') return
    for (const selector of container.querySelectorAll('input[data-comic-id]')) {
        const card = selector.closest('article, tr')
        const target = card?.querySelector('.comic-card-body') || card?.querySelector('td:nth-child(2)')
        if (!target || target.querySelector('[data-online-comic]')) continue
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.onlineComic = selector.dataset.comicId
        button.textContent = t('reader.online')
        target.append(button)
    }
}
document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-online-comic]')
    if (button && state.mode === 'connected') void openReaderComic(button.dataset.onlineComic, true)
    const detail = event.target.closest('[data-library-detail]')
    if (detail) openRecommendationDetail(detail.dataset.libraryDetail, 'library')
})
document.addEventListener('pica-open-comic-detail', (event) => {
    void (async () => {
        let comic = event.detail?.comic || null
        const comicId = event.detail?.comicId || comic?.comicId
        if (!comicId) return
        if (!comic)
            comic =
                state.records.find((item) => item.comicId === comicId) ||
                state.searchResults
                    .map((item) => item.comic || item)
                    .find((item) => item.comicId === comicId) ||
                state.recommendations
                    .map((item) => item.comic || item)
                    .find((item) => item.comicId === comicId) ||
                null
        if (!comic && state.mode === 'connected') {
            try {
                comic = await api(
                    `/api/v1/comics/${encodeURIComponent(comicId)}`
                )
            } catch {
                comic = null
            }
        }
        if (comic) openRecommendationDetail(comicId, 'library', comic)
    })()
})

function librarySourceBindings(comic) {
    const values = []
    if ((comic?.providerId || '').toLowerCase() === 'pica' || (!comic?.providerId && !String(comic?.comicId || '').startsWith('eh:'))) values.push('Pica')
    const known = Array.isArray(comic?.providerMetadata?.knownSurfaces) ? comic.providerMetadata.knownSurfaces : []
    if ((comic?.providerId === 'eh' || String(comic?.comicId || '').startsWith('eh:')) && !known.length) values.push('E-H')
    if (known.includes('eh')) values.push('E-H')
    if (known.includes('exh')) values.push('ExH')
    return [...new Set(values)]
}

function libraryReplicaLabels(comic) {
    const values = []
    if (Number(comic?.downloadedPictures || 0) > 0) values.push(t('library.replica.windows'))
    return values
}

function libraryDetails(comic) {
    const sources = librarySourceBindings(comic)
    const replicas = libraryReplicaLabels(comic)
    const status = comic?.completionStatus === 'UNKNOWN' ? t('library.status.unknown') : comic?.completionStatus === 'FINISHED' ? t('library.status.finished') : t('library.status.ongoing')
    return `<div class="detail-actions"><button type="button" data-library-detail="${escapeHtml(comic.comicId)}">${escapeHtml(t('result.details'))}</button></div><details class="comic-bindings"><summary>${escapeHtml(t('library.bindings.summary'))}</summary><p><strong>${escapeHtml(t('library.bindings.version'))}</strong> · ${escapeHtml(status)}</p><p><strong>${escapeHtml(t('library.bindings.online'))}</strong> · ${escapeHtml(sources.join(' / ') || t('library.bindings.noneSource'))}</p><p><strong>${escapeHtml(t('library.bindings.replicas'))}</strong> · ${escapeHtml(replicas.join(' / ') || t('library.bindings.noneReplica'))}</p></details>`
}

function renderComics(records = state.records) {
    const query = normalize($('#filter-text').value)
    const tags = splitList($('#filter-tag').value).map(normalize)
    const sort = $('#sort-mode').value
    state.visible =
        state.mode === 'connected' && state.libraryQueryResult
            ? [...state.libraryQueryResult.items]
            : records.filter(
                  (comic) =>
                      (!query ||
                          normalize(
                              [
                                  comic.title,
                                  comic.author,
                                  comic.canonicalAuthor
                              ].join(' ')
                          ).includes(query)) &&
                      tags.every((tag) =>
                          (comic.tags || []).map(normalize).includes(tag)
                      )
              )
    state.visible.sort((left, right) => {
        if (sort === 'likes')
            return (right.totalLikes || 0) - (left.totalLikes || 0)
        if (sort === 'views')
            return (right.totalViews || 0) - (left.totalViews || 0)
        if (sort === 'title')
            return String(left.title).localeCompare(right.title)
        return String(right.updatedAt || '').localeCompare(left.updatedAt || '')
    })
    const page = visibleLibraryPage(
        state.visible,
        state.libraryPage,
        LIBRARY_PAGE_SIZE
    )
    const tagFrequencies = buildTagFrequencyIndex(state.records)
    const coverSource = (comic) => {
        if (!state.coversEnabled) return ''
        return state.mode === 'connected'
            ? `/api/v1/covers/${encodeURIComponent(comic.comicId)}`
            : trustedBrowserCoverUrl(comic.coverUrl)
    }
    const tagsFor = (comic) => selectDisplayTags(comic, tagFrequencies)
    const cover = (comic) => `<div class="cover-shell">
        ${
            coverSource(comic)
                ? `<img src="${escapeHtml(coverSource(comic))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentElement?.classList.add('cover-missing');this.remove()" />`
                : ''
        }
        <span aria-hidden="true">P</span>
    </div>`
    $('#comic-grid').innerHTML = page
        .map(
            (comic) => `<article class="comic-card" data-comic-id="${escapeHtml(comic.comicId)}" data-is-favorite="${comic.isFavorite ? 'true' : 'false'}">
                ${cover(comic)}
                <div class="comic-card-body">
                    <label class="comic-select"><input type="checkbox" data-selection-context="library" data-comic-id="${escapeHtml(comic.comicId)}" ${state.selections.library.has(comic.comicId) ? 'checked' : ''} /> ${t('action.select')}</label>
                    <h3>${escapeHtml(comic.title)}</h3>
                    <p>${escapeHtml(comic.canonicalAuthor || comic.author || t('common.unknownAuthor'))}</p>
                    <div>${tagsFor(comic)
                        .map(
                            (tag) =>
                                `<span class="tag">${escapeHtml(tag)}</span>`
                        )
                        .join('')}</div>
                    <p class="comic-meta">${t('message.comicProgress', { likes: Number(comic.totalLikes || 0).toLocaleString(), downloaded: Number(comic.downloadedPictures || 0), total: Number(comic.knownPictures || 0) })}</p>
                    ${libraryDetails(comic)}
                </div>
            </article>`
        )
        .join('')
    if (!page.length)
        $('#comic-grid').innerHTML =
            `<article class="ux-empty-state">${escapeHtml(
                state.records.length
                    ? t('library.noMatches')
                    : t('library.empty')
            )}</article>`
    $('#comic-rows').innerHTML = page
        .map(
            (comic) => `<tr data-comic-id="${escapeHtml(comic.comicId)}" data-is-favorite="${comic.isFavorite ? 'true' : 'false'}">
                <td><input type="checkbox" data-selection-context="library" data-comic-id="${escapeHtml(comic.comicId)}" ${state.selections.library.has(comic.comicId) ? 'checked' : ''} /></td>
                <td><strong>${escapeHtml(comic.title)}</strong><br><button type="button" data-library-detail="${escapeHtml(comic.comicId)}">${escapeHtml(t('result.details'))}</button></td>
                <td>${escapeHtml(comic.canonicalAuthor || comic.author || t('common.unknown'))}</td>
                <td>${tagsFor(comic)
                    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                    .join('')}</td>
                <td>${Number(comic.totalLikes || 0).toLocaleString()}</td>
                <td>${escapeHtml(comic.updatedAt || '')}</td>
                <td>${Number(comic.downloadedPictures || 0)}/${Number(comic.knownPictures || 0)}</td>
            </tr>`
        )
        .join('')
    if (!page.length)
        $('#comic-rows').innerHTML =
            `<tr><td colspan="7"><div class="ux-empty-state">${escapeHtml(
                state.records.length
                    ? t('library.noMatches')
                    : t('library.empty')
            )}</div></td></tr>`
    $('#library-count').textContent = t('message.libraryCount', {
        shown: page.length,
        total: state.libraryQueryResult?.total ?? state.visible.length
    })
    $('#load-more').hidden = page.length >= state.visible.length
    setGridSize('library', state.libraryGridSize)
    mountOnlineReadButtons($('#library'))
}

function renderAuthors() {
    const pendingOnly = $('#pending-only').checked
    const authors = state.authors.filter(
        (author) => !pendingOnly || author.reviewStatus === 'pending'
    )
    $('#author-list').innerHTML = ''
    for (const author of authors) {
        const node = $('#author-template').content.cloneNode(true)
        const item = node.querySelector('.list-item')
        item.dataset.authorId = author.id
        node.querySelector('.author-name').textContent = author.canonicalNameKey
            ? t(author.canonicalNameKey)
            : author.canonicalName || t('common.unknownAuthor')
        node.querySelector('.author-meta').textContent = t(
            'message.authorMeta',
            {
                works: author.works,
                aliases: (author.aliases || []).join(' / '),
                confidence: Math.round((author.confidence || 0) * 100)
            }
        )
        node.querySelector('.author-evidence').textContent =
            localizeAuthorEvidence(language, author)
        $('#author-list').append(node)
    }
}

function providerIdForComic(comic) {
    return comic?.providerId ||
        (String(comic?.comicId || '').startsWith('eh:') ? 'eh' : 'pica')
}

function providerLabelForComic(comic) {
    return providerIdForComic(comic) === 'eh' ? 'E-H' : 'Pica'
}

function providerPopularityForComic(comic) {
    if (providerIdForComic(comic) === 'eh') {
        const rating = Number(comic?.rating)
        return Number.isFinite(rating) && rating > 0
            ? `★ ${rating.toFixed(2)}`
            : t('provider.publicMetadata')
    }
    return t('message.popularity', {
        likes: Number(comic?.totalLikes || 0).toLocaleString(),
        views: Number(comic?.totalViews || 0).toLocaleString()
    })
}

function providerFavoriteLabel(comic) {
    return providerIdForComic(comic) === 'eh' ? t('provider.localFavorite') : t('result.favorite')
}

function renderResultCards(records, target, recommendation = false) {
    const tagFrequencies = buildTagFrequencyIndex(state.records)
    const context = recommendation ? 'recommendation' : 'search'
    $(target).innerHTML = (records || [])
        .map((item, rank) => {
            const comic = item.comic || item
            const providerMeta = recommendation
                ? providerLabelForComic(comic)
                : providerLabelForComic(comic) + ' · ' + providerPopularityForComic(comic)
            return `<article class="result" data-comic-id="${escapeHtml(comic.comicId)}" data-result-rank="${rank}">
                <div class="cover-shell">
                    ${state.coversEnabled && (state.mode === 'connected' || trustedBrowserCoverUrl(comic.coverUrl)) ? `<img src="${escapeHtml(state.mode === 'connected' ? `/api/v1/covers/${encodeURIComponent(comic.comicId)}` : trustedBrowserCoverUrl(comic.coverUrl))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentElement?.classList.add('cover-missing');this.remove()" />` : ''}
                    <span aria-hidden="true">P</span>
                </div>
                <div class="result-body"><h3>${escapeHtml(comic.title)}</h3>
                <label class="result-select"><input type="checkbox" data-selection-context="${context}" data-comic-id="${escapeHtml(comic.comicId)}" ${state.selections[context].has(comic.comicId) ? 'checked' : ''} /> ${t('action.select')}</label>
                <p>${escapeHtml(comic.canonicalAuthor || comic.author || t('common.unknownAuthor'))}</p>
                <div>${selectDisplayTags(comic, tagFrequencies)
                    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                    .join('')}</div>
                <p class="comic-meta">${escapeHtml(providerMeta)}</p>
                <div class="detail-actions"><button data-result-detail="${escapeHtml(comic.comicId)}" data-result-context="${context}">${t('result.details')}</button><button data-result-download="${escapeHtml(comic.comicId)}">${t('action.download')}</button>${state.mode === 'connected' && state.capabilities?.features?.providerFavoriteMutation ? `<button data-result-favorite="${escapeHtml(comic.comicId)}">${escapeHtml(providerFavoriteLabel(comic))}</button>` : ''}</div>
                ${recommendation && state.mode === 'connected' ? `<div class="recommend-feedback" aria-label="${escapeHtml(t('recommend.feedbackLabel'))}"><button type="button" data-recommend-feedback="like" class="${state.recommendationFeedback[comic.comicId]?.sentiment === 'like' ? 'active' : ''}">👍 ${escapeHtml(t('recommend.like'))}</button><button type="button" data-recommend-feedback="dislike" class="${state.recommendationFeedback[comic.comicId]?.sentiment === 'dislike' ? 'active' : ''}">👎 ${escapeHtml(t('recommend.dislike'))}</button></div>` : ''}
                </div>
            </article>`
        })
        .join('')
}

async function loadRecommendationFeedback() {
    if (state.mode !== 'connected') return
    try {
        const rows = await api('/api/v1/recommendation-feedback')
        state.recommendationFeedback = Object.fromEntries(
            (rows || []).map((item) => [item.comicId, item])
        )
    } catch {
        state.recommendationFeedback = {}
    }
}

let pendingRecommendationFeedback = null
async function submitRecommendationFeedback(button, sentiment) {
    if (state.mode !== 'connected') return
    const card = button.closest('.result')
    const comicId = card?.dataset.comicId
    if (!comicId || !['like', 'dislike'].includes(sentiment)) return
    const current = state.recommendationFeedback[comicId]
    if (current?.sentiment === sentiment) return
    const value = await post('/api/v1/recommendation-events', {
        eventType: sentiment === 'like' ? 'recommend_like' : 'recommend_dislike',
        comicId,
        source: 'recommendation_feedback',
        appSessionId: state.appSessionId,
        contextId: state.recommendationContextId,
        recommendationCycleId: state.recommendationCycleId,
        recommendationSessionId: String(state.recommendationSessionNo || ''),
        recommendationBatchIndex: state.recommendationBatch,
        rankPosition: Number(card.dataset.resultRank || 0)
    })
    state.recommendationFeedback[comicId] = {
        comicId,
        sentiment,
        feedbackEventId: value.id,
        occurredAt: value.occurredAt,
        reasons: [],
        reasonEventId: null
    }
    card.querySelectorAll('[data-recommend-feedback]').forEach((item) =>
        item.classList.toggle(
            'active',
            item.dataset.recommendFeedback === sentiment
        )
    )
    if (state.recommendationFeedbackReasonsEnabled) {
        pendingRecommendationFeedback = {
            comicId,
            sentiment,
            feedbackEventId: value.id
        }
        $('#recommend-feedback-dialog-title').textContent =
            sentiment === 'like'
                ? t('recommend.whyLike')
                : t('recommend.whyDislike')
        $$('#recommend-feedback-dialog input[type="checkbox"]').forEach(
            (input) => (input.checked = false)
        )
        $('#recommend-feedback-dialog').showModal()
    }
}

function renderPreparedRecommendations() {
    $('#profile').innerHTML = ''
    const start = state.recommendationManagedV3
        ? 0
        : state.recommendationBatch * 12
    renderResultCards(
        state.recommendations.slice(start, start + 12),
        '#recommend-results',
        true
    )
    recordRecommendationEvent('recommend_batch_presented', {
        contextId: state.recommendationContextId,
        recommendationCycleId: state.recommendationCycleId,
        recommendationBatchId: state.recommendationBatchId,
        recommendationBatchIndex: state.recommendationBatch,
        dedupeKey: `${state.recommendationCycleId || 'none'}:${state.recommendationBatchId || state.recommendationBatch}`,
        recommendationSessionId: state.recommendationSessionNo,
        metadata: {
            batchId: state.recommendationBatchId,
            itemIds: state.recommendations
                .slice(start, start + 12)
                .map((item) => (item.comic || item).comicId)
        }
    })
    $('#recommend-message').textContent = t('message.recommendationCount', {
        count: state.recommendations.length
    })
    $('#recommend-results').classList.toggle(
        'list-mode',
        state.recommendationView === 'list'
    )
    $('#recommend-grid').setAttribute(
        'aria-pressed',
        String(state.recommendationView === 'grid')
    )
    $('#recommend-list').setAttribute(
        'aria-pressed',
        String(state.recommendationView === 'list')
    )
    $('#recommend-next-batch').hidden = state.recommendationManagedV3
        ? state.recommendationExhausted
        : state.recommendations.length <= 12
    const batchCount = Math.max(1, Math.ceil(state.recommendations.length / 12))
    const batchLabel = state.recommendationManagedV3
        ? t('recommend.managedBatch', {
              current: state.recommendationBatch + 1,
              max: state.recommendationMaxVisibleBatches
          })
        : t('message.recommendationBatch', {
              current: state.recommendationBatch + 1,
              total: batchCount
          })
    $('#recommend-batch').textContent =
        state.recommendations.length > 0
            ? state.recommendationManagedV3
                ? t('recommend.managedRound', {
                      batch: batchLabel,
                      state: state.recommendationExhausted
                          ? t('recommend.roundFinished')
                          : ''
                  })
                : t('recommend.round', {
                      session: state.recommendationSessionNo,
                      batch: batchLabel,
                      next: state.recommendationNextReady
                          ? t('recommend.nextReady')
                          : state.recommendationBatch > 0
                            ? t('recommend.preparingNext')
                            : ''
                  })
            : ''
    $('#recommend-selection-status').textContent = t('library.selected', {
        count: state.selections.recommendation.size
    })
    setGridSize('recommendation', state.recommendationGridSize)
    observeRecommendationImpressions()
}

let recommendationImpressionObserver = null
const recommendationImpressionTimers = new Map()
function observeRecommendationImpressions() {
    recommendationImpressionObserver?.disconnect()
    for (const timer of recommendationImpressionTimers.values())
        window.clearTimeout(timer)
    recommendationImpressionTimers.clear()
    if (state.mode !== 'connected' || !('IntersectionObserver' in window))
        return
    recommendationImpressionObserver = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                const card = entry.target
                if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                    const timer = window.setTimeout(() => {
                        const rank = Number(card.dataset.resultRank || 0)
                        queueRecommendationImpression({
                            comicId: card.dataset.comicId,
                            contextId: state.recommendationContextId,
                            recommendationCycleId: state.recommendationCycleId,
                            recommendationBatchIndex: state.recommendationBatch,
                            rankPosition: rank,
                            dedupeKey: `${state.recommendationContextId || 'none'}:${state.recommendationBatch}:${card.dataset.comicId}`
                        })
                    }, 800)
                    recommendationImpressionTimers.set(card, timer)
                } else {
                    const timer = recommendationImpressionTimers.get(card)
                    if (timer) window.clearTimeout(timer)
                    recommendationImpressionTimers.delete(card)
                }
            }
        },
        { threshold: [0.5] }
    )
    $$('#recommend-results .result').forEach((card) =>
        recommendationImpressionObserver.observe(card)
    )
}

const recommendationRequestId = (action) =>
    `${action}:${state.appSessionId}:${Date.now()}:${crypto.randomUUID ? crypto.randomUUID() : Math.random()}`

function applyManagedRecommendationBatch(value) {
    state.recommendationManagedV3 = true
    state.recommendations = value.recommendations || []
    state.recommendationCycleId = value.cycleId || value.activeCycleId || null
    state.recommendationBatchId = value.batchId || null
    state.recommendationBatch = Number(value.batchIndex ?? 0)
    state.recommendationMaxVisibleBatches = Number(
        value.maxVisibleBatches ?? state.recommendationMaxVisibleBatches ?? 6
    )
    state.recommendationContextId = value.contextId || value.batchId || null
    state.recommendationExhausted = Boolean(value.exhausted)
    // Managed V3 does not pre-build a future cycle during ordinary paging.
    // A new cycle exists only after the user explicitly chooses regenerate.
    state.recommendationNextReady = false
    clearSelection('recommendation')
}

const recommendationStatusSignal = {
    status: null,
    observedAt: 0
}

document.addEventListener('pica-recommendation-status', (event) => {
    const status = event.detail?.status
    if (!status || typeof status !== 'object') return
    recommendationStatusSignal.status = status
    recommendationStatusSignal.observedAt = Number(
        event.detail?.observedAt || Date.now()
    )
})

function waitForRecommendationStatusSignal(timeoutMs) {
    return new Promise((resolve) => {
        let timer = null
        const finish = () => {
            document.removeEventListener(
                'pica-recommendation-status',
                onStatus
            )
            if (timer) window.clearTimeout(timer)
            resolve()
        }
        const onStatus = () => finish()
        document.addEventListener('pica-recommendation-status', onStatus)
        timer = window.setTimeout(finish, timeoutMs)
    })
}

function requestRecommendationStatusWatch() {
    recommendationStatusSignal.status = null
    recommendationStatusSignal.observedAt = 0
    document.dispatchEvent(new CustomEvent('pica-recommendation-watch'))
}

function finalCycleReady(status, previousCycleId) {
    return Boolean(
        status?.activeCycleId &&
            !status.buildingCycleId &&
            (!previousCycleId || status.activeCycleId !== previousCycleId)
    )
}

async function waitForFinalCycle(previousCycleId = null) {
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
        let status = recommendationStatusSignal.status
        const signalFresh =
            status &&
            Date.now() - recommendationStatusSignal.observedAt < 1500

        if (!signalFresh) {
            status = await api(
                '/api/v1/recommendation-sessions/status?mode=final'
            )
            recommendationStatusSignal.status = status
            recommendationStatusSignal.observedAt = Date.now()
        }

        if (status.buildProgress?.state === 'failed')
            throw new Error(t('recommend.buildFailed'))
        if (finalCycleReady(status, previousCycleId)) return status

        const remaining = Math.max(0, deadline - Date.now())
        if (!remaining) break
        await waitForRecommendationStatusSignal(
            Math.min(1500, remaining)
        )
    }
    throw new Error(t('recommend.buildTimeout'))
}

function downloadJson(name, value) {
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
    )
    anchor.download = name
    anchor.click()
    URL.revokeObjectURL(anchor.href)
}

function selectedIds(context = 'library') {
    return [...state.selections[context]]
}

function updateSelectionStatus(context) {
    const selectors = {
        library: '#library-selection-status',
        recommendation: '#recommend-selection-status',
        search: '#search-selection-status'
    }
    const target = $(selectors[context])
    if (target)
        target.textContent = t('library.selected', {
            count: state.selections[context].size
        })
}

document.querySelector('main').addEventListener('change', (event) => {
    const input = event.target.closest(
        '[data-selection-context][data-comic-id]'
    )
    if (!input) return
    const selection = state.selections[input.dataset.selectionContext]
    if (!selection) return
    if (input.checked) selection.add(input.dataset.comicId)
    else selection.delete(input.dataset.comicId)
    updateSelectionStatus(input.dataset.selectionContext)
})

function clearSelection(context) {
    state.selections[context].clear()
    $$(`[data-selection-context="${context}"]`).forEach(
        (input) => (input.checked = false)
    )
    updateSelectionStatus(context)
}

function libraryQueryFromControls() {
    const authorInput = normalize($('#filter-author-input').value)
    const author = state.libraryQueryResult?.facets?.authors?.find(
        (item) =>
            normalize(item.label) === authorInput ||
            normalize(item.value) === authorInput
    )
    const typedTags = splitList($('#filter-tag').value)
    return {
        scope: $('#filter-scope').value,
        text: $('#filter-text').value.trim(),
        authorIds: author ? [author.value] : [],
        tags: typedTags,
        tagMode: $('#filter-tag-mode').value,
        sort: $('#sort-mode').value,
        limit: 5000,
        offset: 0
    }
}

function renderFilterFacets() {
    const result = state.libraryQueryResult
    if (!result) return
    $('#filter-author-options').innerHTML = result.facets.authors
        .slice(0, 250)
        .map(
            (item) =>
                `<option value="${escapeHtml(item.label)}">${Number(item.count).toLocaleString()}</option>`
        )
        .join('')
    $('#filter-tag-options').innerHTML = result.facets.tags
        .slice(0, 500)
        .map(
            (item) =>
                `<option value="${escapeHtml(item.label)}">${Number(item.count).toLocaleString()}</option>`
        )
        .join('')
    const query = result.query
    const chips = []
    if (query.scope)
        chips.push({
            key: 'scope',
            label:
                {
                    library: t('library.scope.library'),
                    favorites: t('library.scope.favorites'),
                    downloaded: t('library.scope.downloaded'),
                    catalog: t('library.scope.catalog'),
                    all: t('library.scope.catalog')
                }[query.scope] || query.scope
        })
    if (query.text)
        chips.push({
            key: 'text',
            label: t('library.filterSearch', { value: query.text })
        })
    for (const authorId of query.authorIds || []) {
        const label =
            result.facets.authors.find((item) => item.value === authorId)
                ?.label || authorId
        chips.push({
            key: 'author',
            label: t('library.filterAuthor', { value: label })
        })
    }
    for (const tag of query.tags || [])
        chips.push({
            key: `tag:${tag}`,
            label: t('library.filterTag', { value: tag })
        })
    $('#filter-chips').innerHTML = chips
        .map(
            (chip) =>
                `<button class="filter-chip" data-filter-remove="${escapeHtml(chip.key)}">${escapeHtml(chip.label)} ×</button>`
        )
        .join('')
    if (chips.length)
        $('#filter-chips').insertAdjacentHTML(
            'beforeend',
            `<button class="filter-chip" data-filter-remove="all">${t('library.clearFilters')}</button>`
        )
}

async function loadLibraryQuery(query = libraryQueryFromControls()) {
    if (state.mode !== 'connected') {
        state.libraryQueryResult = null
        renderComics()
        return
    }
    state.libraryQueryResult = await post('/api/v1/library/query', query)
    state.libraryQuery = state.libraryQueryResult.query
    state.libraryPage = 1
    renderFilterFacets()
    renderComics()
}

$('#filter-chips').onclick = (event) => {
    const key = event.target.dataset.filterRemove
    if (!key) return
    if (key === 'all') {
        $('#filter-scope').value = 'library'
        $('#filter-text').value = ''
        $('#filter-author-input').value = ''
        $('#filter-tag').value = ''
    } else if (key === 'scope') $('#filter-scope').value = 'library'
    else if (key === 'text') $('#filter-text').value = ''
    else if (key === 'author') $('#filter-author-input').value = ''
    else if (key.startsWith('tag:')) {
        const remove = normalize(key.slice(4))
        $('#filter-tag').value = splitList($('#filter-tag').value)
            .filter((tag) => normalize(tag) !== remove)
            .join(', ')
    }
    void loadLibraryQuery()
}

async function loadShelves() {
    if (state.mode !== 'connected') {
        $('#shelf-list').innerHTML =
            `<article class="notice">${t('shelf.engineRequired')}</article>`
        return
    }
    state.shelves = await api('/api/v1/shelves')
    $('#shelf-list').innerHTML =
        state.shelves
            .map(
                (shelf) =>
                    `<button class="shelf-card ${shelf.id === state.activeShelfId ? 'active' : ''}" aria-current="${shelf.id === state.activeShelfId ? 'true' : 'false'}" data-shelf-open="${escapeHtml(shelf.id)}"><strong>${escapeHtml(shelf.name)}</strong><span>${t('shelf.count', { count: Number(shelf.count) })}</span></button>`
            )
            .join('') || `<article class="notice">${t('shelf.empty')}</article>`
    $('#shelf-dialog-select').innerHTML = state.shelves
        .map(
            (shelf) =>
                `<option value="${escapeHtml(shelf.id)}">${escapeHtml(shelf.name)} · ${t('shelf.count', { count: Number(shelf.count) })}</option>`
        )
        .join('')
}

async function openShelf(shelfId) {
    const value = await api(`/api/v1/shelves/${encodeURIComponent(shelfId)}`)
    state.activeShelfId = shelfId
    $$('#shelf-list [data-shelf-open]').forEach((button) => {
        const active = button.dataset.shelfOpen === shelfId
        button.classList.toggle('active', active)
        button.setAttribute('aria-current', String(active))
    })
    const shelf = value.shelf
    if (!shelf) throw new Error(t('shelf.notFound'))
    $('#shelf-detail').innerHTML =
        `<div class="page-heading"><div><h3>${escapeHtml(shelf.name)}</h3><p>${t('shelf.count', { count: Number(value.items.length) })}</p></div><div class="actions"><button data-shelf-rename="${escapeHtml(shelf.id)}">${t('shelf.rename')}</button><button data-shelf-delete="${escapeHtml(shelf.id)}">${t('shelf.delete')}</button></div></div><div id="shelf-items" class="comic-grid ${state.shelfView === 'list' ? 'shelf-list-mode' : ''}">${value.items
            .map(
                (comic) =>
                    `<article class="comic-card">${state.shelfCoversEnabled ? `<div class="cover-shell"><img src="/api/v1/covers/${encodeURIComponent(comic.comicId)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="" onerror="this.parentElement?.classList.add('cover-missing');this.remove()"/><span aria-hidden="true">P</span></div>` : '<div class="cover-shell"><span aria-hidden="true">P</span></div>'}<div class="comic-card-body"><label><input type="checkbox" data-selection-context="shelf" data-comic-id="${escapeHtml(comic.comicId)}" ${state.selections.shelf.has(comic.comicId) ? 'checked' : ''}/> ${t('action.select')}</label><h3>${escapeHtml(comic.title)}</h3><p>${escapeHtml(comic.canonicalAuthor || comic.author)}</p><div>${(
                        comic.tags || []
                    )
                        .slice(0, 3)
                        .map(
                            (tag) =>
                                `<span class="tag">${escapeHtml(tag)}</span>`
                        )
                        .join(
                            ''
                        )}</div><p>${comic.downloadedPictures > 0 ? t('shelf.downloadedPictures', { count: comic.downloadedPictures }) : t('shelf.notDownloaded')}</p><div class="actions">${comic.downloadedPictures > 0 ? `<button data-shelf-read="${escapeHtml(comic.comicId)}">${t('downloaded.read')}</button>` : `<button data-shelf-download="${escapeHtml(comic.comicId)}">${t('action.download')}</button>`}</div></div></article>`
            )
            .join(
                ''
            )}</div><div class="actions"><button data-shelf-remove-selected="${escapeHtml(shelf.id)}">${t('shelf.removeSelected')}</button></div>`
    setGridSize('shelf', state.shelfGridSize)
    mountOnlineReadButtons($('#shelf-detail'))
}

let pendingShelfAction = null
async function chooseShelf(count, action) {
    await loadShelves()
    if (!state.shelves.length) {
        const name = await askText(t('shelf.createPrompt'))
        if (!name) return
        await post('/api/v1/shelves', { name })
        await loadShelves()
    }
    pendingShelfAction = action
    $('#shelf-dialog-count').textContent = t('shelf.addCount', { count })
    $('#shelf-dialog').showModal()
}

$('#shelf-dialog-confirm').onclick = async (event) => {
    event.preventDefault()
    if (!pendingShelfAction) return
    try {
        await pendingShelfAction($('#shelf-dialog-select').value)
        $('#shelf-dialog').close()
        pendingShelfAction = null
        await loadShelves()
    } catch (error) {
        $('#shelf-dialog-count').textContent = localizeError(language, error)
    }
}

function portablePlan() {
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        comicIds: state.queue.map((item) => item.comicId)
    }
}

async function loadJobs() {
    if (downloadPollBusy) return
    downloadPollBusy = true
    try {
        if (state.mode === 'lite') {
            state.downloadRunnerRunning = false
            const runButton = $('#run-jobs')
            if (runButton) runButton.disabled = false
            $('#job-list').innerHTML = state.queue.map((job) =>
                `<article class="list-item"><div class="grow"><strong>${escapeHtml(job.comicId)}</strong><p>${escapeHtml(job.source || 'library')} · ${t('message.litePlan')}</p></div></article>`
            ).join('') || `<article class="notice">${t('message.emptyPlan')}</article>`
            return
        }
        const showFinished = localStorage.getItem('pica-show-finished-downloads') === 'true'
        const visibleLimit = Math.max(100, Number(state.downloadVisibleLimit || 100))
        const [summary, page] = await Promise.all([
            api('/api/v1/downloads/summary'),
            api(`/api/v1/downloads/page?view=${showFinished ? 'all' : 'active'}&limit=${visibleLimit}&offset=0`)
        ])
        const jobs = Array.isArray(page.items) ? page.items : []
        const counts = summary.counts || {}
        const runtime = summary.runtime || {}
        state.downloadRunnerRunning = Boolean(runtime.running)
        const recovered = Number(runtime.recoveredOnStartup || 0)
        if (recovered > 0 && !state.downloadRecoveryNotified) {
            state.downloadRecoveryNotified = true
            showOperationToast(
                t('downloads.recoveredInterrupted', { count: recovered }),
                'warning',
                7000
            )
        }
        const runningCount =
            Number(counts.RUNNING || 0) + Number(counts.PREPARING || 0)
        const waitingCount =
            Number(counts.QUEUED || 0) + Number(counts.RETRY_WAIT || 0)
        if (state.downloadRunnerRunning)
            setProgress(
                $('#download-operation'),
                t('downloads.backgroundRunning', {
                    running: runningCount,
                    waiting: waitingCount
                }),
                0,
                0
            )
        else clearProgress($('#download-operation'))
        const runButton = $('#run-jobs')
        if (runButton) runButton.disabled = state.downloadRunnerRunning
        $('#download-summary').innerHTML = [
            [t('downloads.inProgress'), Number(counts.RUNNING || 0) + Number(counts.PREPARING || 0)],
            [t('downloads.waiting'), Number(counts.QUEUED || 0) + Number(counts.RETRY_WAIT || 0)],
            [t('downloads.paused'), Number(counts.PAUSED || 0)],
            [t('downloads.failed'), Number(counts.FAILED || 0)],
            [t('downloads.completed'), Number(counts.COMPLETED || 0)]
        ].map(([label, count]) =>
            `<div class="metric"><span>${label}</span><strong>${count}</strong></div>`
        ).join('')
        const cards = jobs.map((job) => {
            const percent = job.progressTotal ? Math.round((job.progressCompleted / job.progressTotal) * 100) : 0
            const title = job.comicTitle || t('downloads.placeholderTitle')
            const chapter = job.chapterTitle || t('downloads.placeholderChapter')
            const speed = job.bytesPerSecond ? `${formatBytes(job.bytesPerSecond)}/s` : '—'
            const eta = job.bytesPerSecond && job.expectedBytes > job.bytes
                ? `${Math.ceil((job.expectedBytes - job.bytes) / job.bytesPerSecond)}s` : '—'
            return `<article class="list-item download-job-card" data-job-id="${job.id}" data-job-status="${job.status}" data-progress-completed="${job.progressCompleted}" data-progress-total="${job.progressTotal || 0}">
                <div class="grow"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(chapter)} · ${escapeHtml(t(`status.${job.status}`))}</p><p>${t('message.pictures', { count: `${job.progressCompleted} / ${job.progressTotal || '—'}` })} · ${percent}% · ${formatBytes(job.bytes)}${job.expectedBytes ? ` / ${formatBytes(job.expectedBytes)}` : ''}</p><div class="progress"><span style="width:${percent}%"></span></div><p>${speed} · ${t('message.elapsed', { value: formatElapsed(job.startedAt) })} · ${t('downloads.eta', { value: eta })} · ${t('message.retryCount', { count: job.retryCount })}${job.error ? ` · ${escapeHtml(localizeError(language, job.error))}` : ''}</p></div>
                <div class="actions">${['QUEUED', 'PREPARING', 'RUNNING'].includes(job.status) ? `<button data-job-action="pause" data-job-id="${job.id}">${t('action.pause')}</button>` : ''}${job.status === 'PAUSED' ? `<button data-job-action="resume" data-job-id="${job.id}">${t('action.resume')}</button>` : ''}${job.status === 'FAILED' ? `<button data-job-action="retry" data-job-id="${job.id}">${t('action.retry')}</button>` : ''}${!['COMPLETED', 'CANCELLED'].includes(job.status) ? `<button data-job-action="cancel" data-job-id="${job.id}">${t('action.cancel')}</button>` : ''}</div>
            </article>`
        }).join('')
        $('#job-list').innerHTML = cards || `<article class="notice">${t('message.emptyQueue')}</article>`
        if (Number(page.total || 0) > jobs.length) {
            $('#job-list').insertAdjacentHTML('beforeend', `<button type="button" id="download-load-more">${t('library.loadMore')}（${jobs.length} / ${Number(page.total || 0)}）</button>`)
            $('#download-load-more').onclick = () => {
                state.downloadVisibleLimit = visibleLimit + 100
                void loadJobs()
            }
        }
        if (state.downloadRunnerRunning) {
            if (!downloadPoll && activeView === 'downloads')
                downloadPoll = setInterval(() => void loadJobs(), 1000)
        } else if (downloadPoll) {
            clearInterval(downloadPoll)
            downloadPoll = null
        }
    } finally {
        downloadPollBusy = false
    }
}

function formatBytes(bytes) {
    const value = Number(bytes || 0)
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
    if (value < 1024 * 1024 * 1024)
        return `${(value / 1024 / 1024).toFixed(1)} MB`
    return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatElapsed(startedAt) {
    const started = new Date(startedAt || '').getTime()
    if (!Number.isFinite(started)) return '—'
    const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000))
    const minutes = Math.floor(seconds / 60)
    const remainder = seconds % 60
    return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`
}

async function loadPreviewCacheStats() {
    if (state.mode !== 'connected') return
    try {
        const value = await api('/api/v1/previews/cache')
        $('#preview-cache-stats').textContent = t('preview.cacheStats', {
            current: formatBytes(value.bytes),
            maximum: formatBytes(value.maxBytes),
            days: Math.round(value.ttlMs / 86400000)
        })
    } catch (error) {
        $('#preview-cache-stats').textContent = localizeError(language, error)
    }
}

$('#preview-cache-clear').onclick = async (event) => {
    await withBusyButton(event.currentTarget, async () => {
        try {
            await post('/api/v1/previews/cache/clear', {})
            $('#preview-cache-stats').textContent = t('preview.cacheCleared')
            await loadPreviewCacheStats()
        } catch (error) {
            $('#preview-cache-stats').textContent =
                localizeError(language, error)
        }
    })
}

function recommendationRecord(comicId, context) {
    const dialog = $('#recommend-detail-dialog')
    if (
        dialog?.dataset.comicId === comicId &&
        dialog._comicRecord?.comicId === comicId
    )
        return dialog._comicRecord
    const source =
        context === 'library'
            ? state.libraryQueryResult?.items ?? state.records
            : context === 'search'
              ? state.searchResults
              : state.recommendations
    const item = source.find(
        (candidate) => (candidate.comic || candidate).comicId === comicId
    )
    return item?.comic || item
}

function workVariantRelationLabel(item) {
    const relation = String(item?.relation || '')
    if (relation.startsWith('CONFIRMED_'))
        return t('workVariants.confirmed')
    if (relation === 'ADJUDICATED_EDITION_VARIANT')
        return t('workVariants.editionVariant')
    if (relation === 'ADJUDICATED_SAME_WORK')
        return t('workVariants.adjudicated')
    return t('workVariants.probable')
}

function workVariantStatusCounts(value) {
    const items = Array.isArray(value?.items) ? value.items : []
    const numberOrFallback = (candidate, fallback) => {
        const parsed = Number(candidate)
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
    }
    return {
        count: numberOrFallback(value?.count, items.length),
        favoriteCount: numberOrFallback(
            value?.favoriteCount,
            items.filter((item) => Boolean(item?.isFavorite)).length
        ),
        downloadedCount: numberOrFallback(
            value?.downloadedCount,
            items.filter(
                (item) => Number(item?.downloadedPictures || 0) > 0
            ).length
        )
    }
}

function renderWorkVariantSummary(panel, value) {
    const summary = panel?.querySelector('summary')
    if (!summary) return
    const counts = workVariantStatusCounts(value)
    const badges = []
    if (counts.count > 0) {
        badges.push(
            counts.favoriteCount > 0
                ? `<span class="work-variant-summary-chip favorite">${escapeHtml(
                      t('workVariants.favoriteCount', {
                          count: counts.favoriteCount
                      })
                  )}</span>`
                : `<span class="work-variant-summary-chip muted">${escapeHtml(
                      t('workVariants.noFavorite')
                  )}</span>`
        )
        if (counts.downloadedCount > 0)
            badges.push(
                `<span class="work-variant-summary-chip downloaded">${escapeHtml(
                    t('workVariants.downloadedCount', {
                        count: counts.downloadedCount
                    })
                )}</span>`
            )
    }
    summary.innerHTML = `<span class="work-variant-summary-title">${escapeHtml(
        t('workVariants.summary', { count: counts.count })
    )}</span><span class="work-variant-summary-badges">${badges.join('')}</span>`
}

function renderWorkVariantList(panel) {
    const value = panel?._workVariantPayload
    const target = panel?.querySelector('[data-work-variants-list]')
    if (!target || !value) return
    const items = Array.isArray(value.items) ? value.items : []
    target.innerHTML = items.length
        ? items
              .map((item) => {
                  const meta = [
                      Number(item.pagesCount || 0) > 0
                          ? t('workVariants.pages', {
                                count: Number(item.pagesCount || 0)
                            })
                          : '',
                      item.providerId === 'eh' ? 'E-H' : 'Pica',
                      item.editionLanguage || '',
                      item.editionLabel || '',
                      item.chineseTeam || '',
                      Number(item.rating || 0) > 0
                          ? `★ ${Number(item.rating).toFixed(2)}`
                          : ''
                  ]
                      .filter(Boolean)
                      .join(' · ')
                  const favorite = Boolean(item.isFavorite)
                  const downloaded =
                      Number(item.downloadedPictures || 0) > 0
                  const badges = [
                      `<span class="work-variant-chip ${favorite ? 'favorite' : 'muted'}">${escapeHtml(
                          t(
                              favorite
                                  ? 'workVariants.favorite'
                                  : 'workVariants.notFavorite'
                          )
                      )}</span>`,
                      item.inLibrary
                          ? `<span class="work-variant-chip library">${escapeHtml(
                                t('workVariants.inLibrary')
                            )}</span>`
                          : '',
                      downloaded
                          ? `<span class="work-variant-chip downloaded">${escapeHtml(
                                t('workVariants.downloaded')
                            )}</span>`
                          : ''
                  ]
                      .filter(Boolean)
                      .join('')
                  const cover = item.coverPath
                      ? `<img src="${escapeHtml(item.coverPath)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
                      : '<span aria-hidden="true">P</span>'
                  const title = item.title || item.comicId
                  return `<article class="work-variant-card" data-work-variant-card="${escapeHtml(
                      item.comicId
                  )}" data-work-variant-open="${escapeHtml(
                      item.comicId
                  )}">
                      <div class="work-variant-cover">${cover}</div>
                      <div class="work-variant-copy">
                          <strong>${escapeHtml(title)}</strong>
                          <span>${escapeHtml(item.canonicalAuthor || item.author || t('common.unknownAuthor'))}</span>
                          <div class="work-variant-badges">${badges}</div>
                          <small>${escapeHtml(meta)}</small>
                          <small>${escapeHtml(workVariantRelationLabel(item))}</small>
                          <a href="#" class="work-variant-open-link" data-work-variant-open="${escapeHtml(item.comicId)}" aria-label="${escapeHtml(t('workVariants.openLabel', { title }))}">${escapeHtml(t('workVariants.open'))} →</a>
                      </div>
                  </article>`
              })
              .join('')
        : `<p class="status">${escapeHtml(t('workVariants.empty'))}</p>`
}

async function loadWorkVariantsForDetail(comicId) {
    const panel = $('#work-variants-panel')
    if (!panel) return
    try {
        const value =
            state.mode === 'connected'
                ? await api(
                      `/api/v1/comics/${encodeURIComponent(comicId)}/work-variants?limit=24`
                  )
                : { count: 0, favoriteCount: 0, downloadedCount: 0, items: [] }
        if ($('#recommend-detail-dialog')?.dataset.comicId !== comicId) return
        panel._workVariantPayload = value
        renderWorkVariantSummary(panel, value)
        panel.toggleAttribute('data-empty', Number(value.count || 0) === 0)
        if (panel.open) renderWorkVariantList(panel)
    } catch {
        const empty = {
            count: 0,
            favoriteCount: 0,
            downloadedCount: 0,
            items: []
        }
        renderWorkVariantSummary(panel, empty)
        panel._workVariantPayload = empty
    }
}

let recommendationPreviewRequestId = 0

function openRecommendationDetail(comicId, context = 'recommendation', comicOverride = null) {
    recommendationPreviewRequestId += 1
    const comic = comicOverride || recommendationRecord(comicId, context)
    if (!comic) return
    const dialog = $('#recommend-detail-dialog')
    dialog.dataset.comicId = comicId
    dialog.dataset.context = context
    dialog._comicRecord = comic
    dialog.dataset.previewOffset = '0'
    $('#recommend-preview').innerHTML = ''
    $('#recommend-preview-message').textContent = ''
    const favoriteButton = state.capabilities?.features?.providerFavoriteMutation
        ? `<button data-detail-favorite="true"${comic.isFavorite ? ' disabled' : ''}>${t(
              comic.isFavorite ? 'result.favorited' : 'result.favorite'
          )}</button>`
        : ''
    $('#recommend-detail-content').innerHTML =
        `<h2>${escapeHtml(comic.title)}</h2><p><strong>${escapeHtml(comic.canonicalAuthor || comic.author || t('common.unknownAuthor'))}</strong></p><p>${escapeHtml(comic.description || '')}</p><div>${(comic.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div><p>${comic.finished ? t('comic.finished') : t('comic.ongoing')} · ${t('comic.likes', { count: Number(comic.totalLikes || 0).toLocaleString() })}</p><div class="detail-actions"><button data-detail-preview="true" class="primary">${t('preview.action')}</button><button data-detail-shelf="true">${t('library.addShelf')}</button>${favoriteButton}<button data-detail-download="true">${t('action.download')}</button></div><details id="work-variants-panel" class="work-variants-panel"><summary>${escapeHtml(t('workVariants.loading'))}</summary><div data-work-variants-list></div></details>`
    if (state.mode === 'connected') {
        const button = document.createElement('button')
        button.dataset.detailOnline = 'true'
        button.textContent = t('reader.online')
        $('#recommend-detail-content .detail-actions').prepend(button)
    }
    if (state.mode === 'connected') {
        const styleButton = document.createElement('button')
        styleButton.type = 'button'
        styleButton.dataset.detailSimilarStyle = 'true'
        styleButton.textContent = t('visual.similarStyle')
        $('#recommend-detail-content .detail-actions').append(styleButton)
    }
    const variantsPanel = $('#work-variants-panel')
    if (variantsPanel)
        variantsPanel.addEventListener('toggle', () => {
            if (variantsPanel.open) renderWorkVariantList(variantsPanel)
        })
    if (!dialog.open) dialog.showModal()
    void loadWorkVariantsForDetail(comicId)
    recordRecommendationEvent(
        context === 'search' ? 'search_result_open' : 'recommend_detail_open',
        {
            comicId,
            contextId:
                context === 'search'
                    ? state.searchContextId
                    : state.recommendationContextId
        }
    )
}

async function loadRecommendationPreview(offset = 0) {
    const dialog = $('#recommend-detail-dialog')
    const comicId = dialog.dataset.comicId
    const requestId = ++recommendationPreviewRequestId
    const message = $('#recommend-preview-message')
    recordRecommendationEvent(offset > 0 ? 'preview_more' : 'preview_open', {
        comicId,
        contextId:
            dialog.dataset.context === 'search'
                ? state.searchContextId
                : state.recommendationContextId,
        metadata: { offset }
    })
    message.textContent = t('preview.preparing')
    try {
        const value = await post('/api/v1/previews/prepare', {
            comicId,
            offset,
            count: 3
        })
        if (
            requestId !== recommendationPreviewRequestId ||
            dialog.dataset.comicId !== comicId
        )
            return
        if (!value.pages.length) {
            message.textContent = t('preview.empty')
            return
        }
        dialog.dataset.previewOffset = String(offset + value.pages.length)
        $('#recommend-preview').insertAdjacentHTML(
            'beforeend',
            value.pages
                .map(
                    (page) =>
                        `<img src="${escapeHtml(page.url)}" alt="${t('preview.pageAlt', { page: page.index + 1 })}" loading="lazy" />`
                )
                .join('')
        )
        message.innerHTML = t('preview.status', {
            episode: escapeHtml(
                value.episodeTitle || t('preview.firstEpisode')
            ),
            count: offset + value.pages.length,
            more: value.hasMore
                ? ` <button data-detail-preview-more="true">${t('preview.more')}</button>`
                : ''
        })
        await loadPreviewCacheStats()
    } catch (error) {
        if (
            requestId !== recommendationPreviewRequestId ||
            dialog.dataset.comicId !== comicId
        )
            return
        message.textContent = localizeError(language, error)
    }
}

$('#recommend-detail-close').onclick = () =>
    $('#recommend-detail-dialog').close()
$('#recommend-detail-dialog').onclick = async (event) => {
    const dialog = $('#recommend-detail-dialog')
    const comicId = dialog.dataset.comicId
    const variantTrigger = event.target.closest?.('[data-work-variant-open]')
    if (variantTrigger) {
        event.preventDefault()
        const id = variantTrigger.dataset.workVariantOpen
        const payload = $('#work-variants-panel')?._workVariantPayload
        const item = (payload?.items || []).find((row) => row.comicId === id)
        if (item) openRecommendationDetail(id, 'work-variant', item)
        return
    }
    if (event.target.dataset.detailOnline) {
        dialog.close()
        await openReaderComic(comicId, true)
    }
    else if (event.target.dataset.detailPreview)
        await loadRecommendationPreview(0)
    else if (event.target.dataset.detailSimilarStyle) {
        try {
            const rows = await api(
                `/api/v1/visual/similar/${encodeURIComponent(comicId)}?limit=12`
            )
            $('#recommend-preview-message').textContent = rows.length
                ? t('visual.similarFound', { count: rows.length })
                : t('visual.similarEmpty')
            $('#recommend-preview').innerHTML = rows
                .map(
                    (item) =>
                        `<article class="visual-similar-item"><strong>${escapeHtml(item.comic.title)}</strong><span>${escapeHtml(item.comic.canonicalAuthor || item.comic.author || '')}</span></article>`
                )
                .join('')
        } catch (error) {
            $('#recommend-preview-message').textContent = localizeError(
                language,
                error
            )
        }
    }
    else if (event.target.dataset.detailPreviewMore)
        await loadRecommendationPreview(
            Number(dialog.dataset.previewOffset || 0)
        )
    else if (event.target.dataset.detailShelf)
        await chooseShelf(1, (shelfId) =>
            post(`/api/v1/shelves/${encodeURIComponent(shelfId)}/items`, {
                comicIds: [comicId],
                records: [recommendationRecord(comicId, dialog.dataset.context)]
            })
        )
    else if (event.target.dataset.detailFavorite) {
        try {
            await mutate(
                `/api/v1/provider/favorites/${encodeURIComponent(comicId)}`,
                'PUT'
            )
            event.target.textContent = t('result.favorited')
            event.target.disabled = true
        } catch (error) {
            $('#recommend-preview-message').textContent = localizeError(
                language,
                error
            )
        }
    } else if (event.target.dataset.detailDownload)
        await enqueue([comicId], dialog.dataset.context)
}

let readerProgressTimer = null
let readerScrollHandler = null
let readerPageObserver = null
let readerChapterRequest = 0
let readerComicRequest = 0
function readerApiRoot() {
    return state.reader.online ? '/api/v1/online-reader' : '/api/v1/reader'
}

function readerReadableChapters() {
    return (state.reader.chapters || []).filter(
        (item) => state.reader.online || item.downloadedPictures > 0
    )
}

function updateReaderChapterNavigation() {
    const readable = readerReadableChapters()
    const index = readable.findIndex(
        (item) => item.id === state.reader.episodeId
    )
    const previous = $('#reader-prev-chapter')
    const next = $('#reader-next-chapter')
    if (previous) previous.disabled = index <= 0
    if (next) next.disabled = index < 0 || index >= readable.length - 1
    $$('#reader-chapters [data-reader-episode]').forEach((button) => {
        const active = button.dataset.readerEpisode === state.reader.episodeId
        button.classList.toggle('active', active)
        button.setAttribute('aria-current', String(active))
    })
}

function scrollReaderViewportToTop() {
    const target = $('#reader-pages')
    if (!target) return
    target.scrollIntoView({ block: 'start' })
}

function resetReaderViewportTracking() {
    readerPageObserver?.disconnect()
    readerPageObserver = null
    if (readerScrollHandler)
        window.removeEventListener('scroll', readerScrollHandler)
    readerScrollHandler = null
}

function queueReaderProgressFromViewport(target) {
    const bounds = target.getBoundingClientRect()
    const centerY = window.innerHeight / 2
    const sampleXs = [
        bounds.left + bounds.width / 2,
        bounds.left + bounds.width * 0.35,
        bounds.left + bounds.width * 0.65
    ]
    const sampleYs = [
        centerY,
        Math.max(0, centerY - window.innerHeight * 0.08),
        Math.min(window.innerHeight - 1, centerY + window.innerHeight * 0.08)
    ]
    for (const y of sampleYs) {
        for (const x of sampleXs) {
            const element = document.elementFromPoint(x, y)
            const image = element?.closest?.('[data-reader-page]')
            if (image && target.contains(image)) {
                queueReaderProgress(Number(image.dataset.readerPage))
                return
            }
        }
    }
}

function observeVerticalReaderProgress(target, resumePage) {
    requestAnimationFrame(() => {
        target
            .querySelector(`[data-reader-page="${resumePage}"]`)
            ?.scrollIntoView({ block: 'center' })
        requestAnimationFrame(() => {
            if ('IntersectionObserver' in window) {
                readerPageObserver = new IntersectionObserver(
                    (entries) => {
                        const center = window.innerHeight / 2
                        const nearest = entries
                            .filter((entry) => entry.isIntersecting)
                            .map((entry) => ({
                                pageIndex: Number(
                                    entry.target.dataset.readerPage
                                ),
                                distance: Math.abs(
                                    entry.boundingClientRect.top +
                                        entry.boundingClientRect.height / 2 -
                                        center
                                )
                            }))
                            .sort((a, b) => a.distance - b.distance)[0]
                        if (nearest) queueReaderProgress(nearest.pageIndex)
                    },
                    {
                        root: null,
                        rootMargin: '-45% 0px -45% 0px',
                        threshold: [0, 0.01]
                    }
                )
                target
                    .querySelectorAll('[data-reader-page]')
                    .forEach((image) => readerPageObserver.observe(image))
                queueReaderProgress(resumePage)
                return
            }

            let queued = false
            readerScrollHandler = () => {
                if (queued) return
                queued = true
                requestAnimationFrame(() => {
                    queued = false
                    queueReaderProgressFromViewport(target)
                })
            }
            window.addEventListener('scroll', readerScrollHandler, {
                passive: true
            })
            readerScrollHandler()
        })
    })
}

function renderReaderPages() {
    const reader = state.reader
    if (!reader.chapter) return
    const mode = $('#reader-mode').value
    const direction = $('#reader-direction').value
    const fit = $('#reader-fit').value
    const target = $('#reader-pages')
    const allPages = reader.chapter.pages
    const pageCount = mode === 'double' ? 2 : 1
    const pages =
        mode === 'vertical'
            ? allPages
            : allPages.slice(reader.pageIndex, reader.pageIndex + pageCount)
    resetReaderViewportTracking()
    target.className = `reader-pages reader-${mode} direction-${direction} fit-${fit}`
    target.innerHTML = pages
        .map(
            (page, index) =>
                `<img src="${escapeHtml(page.url)}" loading="lazy" decoding="async" data-reader-page="${mode === 'vertical' ? index : reader.pageIndex + index}" alt="${t('reader.pageAlt', { page: (mode === 'vertical' ? index : reader.pageIndex + index) + 1 })}" />`
        )
        .join('')
    for (const image of target.querySelectorAll('img')) {
        image.addEventListener('error', () => {
            if (!image.isConnected) return
            const retry = document.createElement('button')
            retry.type = 'button'
            retry.textContent = t('reader.retryPage', { page: Number(image.dataset.readerPage) + 1 })
            retry.onclick = () => { retry.remove(); image.src = image.getAttribute('src') }
            image.after(retry)
        })
    }
    if (mode === 'vertical') {
        const resumePage = reader.pageIndex
        observeVerticalReaderProgress(target, resumePage)
    } else queueReaderProgress(reader.pageIndex)
}

function queueReaderProgress(pageIndex) {
    state.reader.pageIndex = pageIndex
    state.reader.dirty = state.reader.progressSaved !== pageIndex
    clearTimeout(readerProgressTimer)
    readerProgressTimer = setTimeout(() => void flushReaderProgress(), 400)
}

async function flushReaderProgress(keepalive = false) {
    clearTimeout(readerProgressTimer)
    readerProgressTimer = null
    if (!state.reader.dirty || !state.reader.comicId || !state.reader.episodeId)
        return true
    const payload = {
        comicId: state.reader.comicId,
        episodeId: state.reader.episodeId,
        pageIndex: state.reader.pageIndex
    }
    const reader = state.reader
    const root = readerApiRoot()
    try {
        if (keepalive) {
            const response = await fetch(`${root}/progress`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            })
            if (!response.ok) throw new Error('Progress not saved')
        }
        else await post(`${root}/progress`, payload)
        if (state.reader === reader && reader.episodeId === payload.episodeId && reader.pageIndex === payload.pageIndex) {
            reader.progressSaved = payload.pageIndex
            reader.dirty = false
        }
        return true
    } catch {
        // Reader remains usable if progress persistence briefly fails.
        return false
    }
}

async function openReaderChapter(episodeId) {
    const requestId = ++readerChapterRequest
    resetReaderViewportTracking()
    if (state.reader.episodeId && state.reader.episodeId !== episodeId)
        await flushReaderProgress()
    $('#reader-message').textContent = t('reader.loadingChapter')
    try {
    const chapter = await api(
        `${readerApiRoot()}/comics/${encodeURIComponent(state.reader.comicId)}/chapters/${encodeURIComponent(episodeId)}`
    )
    if (requestId !== readerChapterRequest) return
    state.reader.episodeId = episodeId
    state.reader.chapter = chapter
    state.reader.pageIndex = Math.min(
        chapter.progress?.pageIndex || 0,
        Math.max(0, chapter.pages.length - 1)
    )
    state.reader.progressSaved = null
    state.reader.dirty = false
    renderReaderChapterHeading()
    renderReaderPages()
    updateReaderChapterNavigation()
    if ($('#reader-mode').value !== 'vertical')
        requestAnimationFrame(() => scrollReaderViewportToTop())
    $('#reader-message').textContent = !chapter.pages.length ? t('reader.noPages') : state.reader.online ? t('reader.onlineNotice') : ''
    } catch (error) {
        if (requestId === readerChapterRequest)
            $('#reader-message').textContent = localizeError(language, error)
    }
}

function renderReaderChapterHeading() {
    const chapter = state.reader.chapter
    if (!chapter) return
    $('#reader-chapter-title').textContent =
        t('reader.chapter', {
            title: chapter.episode.title,
            pages: chapter.pages.length
        }) +
        (chapter.progress
            ? t('reader.resume', { page: state.reader.pageIndex + 1 })
            : '')
}

async function openReaderComic(comicId, online = false) {
    const requestId = ++readerComicRequest
    readerChapterRequest++
    try {
        await flushReaderProgress()
        if (requestId !== readerComicRequest) return
        resetReaderViewportTracking()
        const originView = activeView === 'reader' ? state.reader.originView : activeView
        state.reader = { comicId, online, episodeId: null, dirty: false, originView }
        const root = readerApiRoot()
        activateView('reader')
        document.body.classList.add('reader-active')
        $('#reader .eyebrow').textContent = t(online ? 'reader.online' : 'reader.eyebrow')
        $('#reader-pages').replaceChildren()
        $('#reader-chapters').replaceChildren()
        $('#reader-message').textContent = t('reader.loadingChapters')
        $('#reader-export-zip').hidden = online
        $('#reader-export-cbz').hidden = online
        const [chapters, recentProgress] = await Promise.all([
            api(
                `${root}/comics/${encodeURIComponent(comicId)}/chapters`
            ),
            api(`${root}/progress`)
        ])
        if (requestId !== readerComicRequest) return
        const readable = chapters.filter((item) => online || item.downloadedPictures > 0)
        if (!readable.length) throw new Error(t('reader.noChapters'))
        const resume = recentProgress.find(
            (item) =>
                item.comicId === comicId &&
                readable.some((chapter) => chapter.id === item.episodeId)
        )
        state.reader = {
            comicId,
            online,
            episodeId: null,
            pageIndex: 0,
            chapters,
            chapter: null,
            originView: state.reader.originView || 'downloaded',
            dirty: false
        }
        const comic = state.records.find((item) => item.comicId === comicId)
        $('#reader-title').textContent = comic?.title || t('reader.title')
        $('#reader-chapters').innerHTML = chapters
            .map(
                (chapter) =>
                    `<button data-reader-episode="${escapeHtml(chapter.id)}" ${online || chapter.downloadedPictures ? '' : 'disabled'}>${escapeHtml(chapter.title)}${online ? '' : ` · ${chapter.downloadedPictures}/${chapter.knownPictures}`}</button>`
            )
            .join('')
        activateView('reader')
        document.body.classList.add('reader-active')
        await openReaderChapter(resume?.episodeId || readable[0].id)
    } catch (error) {
        if (requestId === readerComicRequest) $('#reader-message').textContent = localizeError(language, error)
    }
}

document.addEventListener('pica-open-reader', (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null
    const comicId = String(detail?.comicId || '').trim()
    if (!comicId) return
    void openReaderComic(comicId, detail?.online !== false)
})

function moveReader(delta) {
    const total = state.reader.chapter?.pages?.length || 0
    if (!total || $('#reader-mode').value === 'vertical') return
    const step = $('#reader-mode').value === 'double' ? 2 : 1
    const direction = $('#reader-direction').value === 'rtl' ? -1 : 1
    state.reader.pageIndex = Math.max(
        0,
        Math.min(total - 1, state.reader.pageIndex + delta * step * direction)
    )
    renderReaderPages()
}

$('#reader-chapters').onclick = (event) => {
    const episodeId = event.target.dataset.readerEpisode
    if (episodeId) void openReaderChapter(episodeId)
}
$('#reader-prev-chapter').onclick = () => {
    const readable = readerReadableChapters()
    const index = readable.findIndex(
        (item) => item.id === state.reader.episodeId
    )
    if (index > 0) void openReaderChapter(readable[index - 1].id)
}
$('#reader-next-chapter').onclick = () => {
    const readable = readerReadableChapters()
    const index = readable.findIndex(
        (item) => item.id === state.reader.episodeId
    )
    if (index >= 0 && index < readable.length - 1)
        void openReaderChapter(readable[index + 1].id)
}
$('#reader-mode').onchange = () => {
    renderReaderPages()
    updateReaderChapterNavigation()
    if ($('#reader-mode').value !== 'vertical')
        requestAnimationFrame(() => scrollReaderViewportToTop())
}
$('#reader-direction').onchange = renderReaderPages
$('#reader-fit').onchange = renderReaderPages
$('#reader-fullscreen').onclick = () =>
    document.fullscreenElement
        ? document.exitFullscreen()
        : $('#reader').requestFullscreen()
async function exitReader() {
    readerComicRequest++
    readerChapterRequest++
    await flushReaderProgress()
    if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => undefined)
    resetReaderViewportTracking()
    activateView(state.reader.originView || 'downloaded')
}
$('#reader-exit').onclick = () => void exitReader()
document.addEventListener('keydown', (event) => {
    if (activeView !== 'reader') return
    const target = event.target
    if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
    )
        return
    if (event.key === 'Escape' && !document.fullscreenElement) {
        event.preventDefault()
        void exitReader()
        return
    }
    if ($('#reader-mode').value === 'vertical') return
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        moveReader(-1)
    } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault()
        moveReader(1)
    }
})
async function exportReaderArchive(format) {
    try {
        const value = await post(`/api/v1/reader/export-${format}`, {
            comicId: state.reader.comicId,
            episodeId: state.reader.episodeId
        })
        const name = value.path.split(/[\\/]/).pop()
        $('#reader-message').textContent = t('reader.exported', {
            name,
            pages: value.pages,
            bytes: formatBytes(value.bytes)
        })
        if (
            await askConfirm(
                t('reader.openExport', {
                    format: format.toUpperCase()
                })
            )
        )
            await post('/api/v1/reader/open-default', { path: value.path })
    } catch (error) {
        $('#reader-message').textContent = localizeError(language, error)
    }
}
$('#reader-export-zip').onclick = () => void exportReaderArchive('zip')
$('#reader-export-cbz').onclick = async () => {
    await exportReaderArchive('cbz')
}
window.addEventListener('pagehide', () => {
    void flushReaderProgress(true)
    closeDesktopBrowserSession()
})
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushReaderProgress(true)
})
async function loadDownloaded() {
    if (state.mode === 'lite') return
    const records = await api('/api/v1/downloaded')
    $('#downloaded-grid').setAttribute('aria-pressed', String(state.downloadedView === 'grid'))
    $('#downloaded-list').setAttribute('aria-pressed', String(state.downloadedView === 'list'))
    $('#downloaded-count').textContent = t('downloaded.count', {
        shown: records.length,
        total: records.length
    })
    const coverSource = (comic) =>
        state.downloadedCoversEnabled
            ? `/api/v1/downloaded/${encodeURIComponent(comic.comicId)}/cover`
            : ''
    $('#downloaded-grid-items').innerHTML =
        records
            .map(
                (comic) =>
                    `<article class="comic-card"><div class="cover-shell">${coverSource(comic) ? `<img src="${coverSource(comic)}" loading="lazy" alt="" />` : ''}<span aria-hidden="true">P</span></div><div class="comic-card-body"><h3>${escapeHtml(comic.title)}</h3><p>${escapeHtml(comic.canonicalAuthor || comic.author)}</p><p>${comic.status === 'complete' ? t('downloaded.complete') : t('downloaded.partial')}</p><p>${t('downloaded.chapters', { downloaded: comic.downloadedChapters, known: comic.knownChapters || '—' })} · ${t('message.pictures', { count: comic.downloadedPictures })} · ${formatBytes(comic.localBytes)}</p><button data-read-comic="${escapeHtml(comic.comicId)}">${t('downloaded.read')}</button></div></article>`
            )
            .join('') ||
        `<article class="notice">${t('downloaded.empty')}</article>`
    $('#downloaded-rows').innerHTML = records
        .map(
            (comic) =>
                `<tr><td>${escapeHtml(comic.title)}<br><button data-read-comic="${escapeHtml(comic.comicId)}">${t('downloaded.read')}</button></td><td>${escapeHtml(comic.canonicalAuthor || comic.author)}</td><td>${comic.status === 'complete' ? t('downloaded.complete') : t('downloaded.partial')}</td><td>${comic.downloadedChapters}/${comic.knownChapters || '—'}</td><td>${comic.downloadedPictures}</td><td>${formatBytes(comic.localBytes)}</td><td>${escapeHtml(comic.lastDownloadedAt || '—')}</td></tr>`
        )
        .join('')
    setGridSize('downloaded', state.downloadedGridSize)
    downloadedCloud.mount(records)
}

$('#downloaded').onclick = (event) => {
    const comicId = event.target.dataset.readComic
    if (comicId) void openReaderComic(comicId)
}

async function enqueue(ids, source) {
    if (!ids.length) return
    if (state.mode === 'connected') {
        await post('/api/v1/download', { comicIds: ids, source, run: false })
    } else {
        replaceLiteState(addLiteQueueItems(state, ids, source))
        await persistLiteState()
        renderSummary()
    }
    await loadJobs()
}

function renderAll(summary) {
    $('#browser-lite-onboarding').hidden =
        state.mode !== 'lite' || state.records.length > 0
    $('#home-mode-notice').hidden = state.mode !== 'lite'
    $('#clear-lite-state').hidden = state.mode !== 'lite'
    renderSummary(summary)
    renderFilterFacets()
    renderComics()
    renderAuthors()
    renderPreparedRecommendations()
    setLibraryView(state.libraryView)
    $('#cover-toggle').checked = state.coversEnabled
    $('#recommend-cover-toggle').checked = state.coversEnabled
    $('#downloaded-cover-toggle').checked = state.downloadedCoversEnabled
    $('#downloaded-grid-items').hidden = state.downloadedView !== 'grid'
    $('#downloaded-table').hidden = state.downloadedView !== 'list'
    $('#downloaded-grid').setAttribute(
        'aria-pressed',
        String(state.downloadedView === 'grid')
    )
    $('#downloaded-list').setAttribute(
        'aria-pressed',
        String(state.downloadedView === 'list')
    )
    setGridSize('downloaded', state.downloadedGridSize)
    renderTimestamps()
    updateSelectionStatus('library')
    updateSelectionStatus('recommendation')
    updateSelectionStatus('search')
}

$$('nav [data-view], [data-go]').forEach((button) =>
    button.addEventListener('click', () => {
        const id = button.dataset.view || button.dataset.go
        activateView(id)
        if (id === 'downloads') loadJobs()
        else if (downloadPoll) {
            clearInterval(downloadPoll)
            downloadPoll = null
        }
        if (id === 'downloaded') void loadDownloaded()
        if (id === 'shelves') void loadShelves()
        if (id === 'settings') void loadPreviewCacheStats()
        if (id === 'chronicle') void loadChronicle()
    })
)

$$('.tabs').forEach((tabs) =>
    tabs.addEventListener('click', (event) => {
        const id = event.target.dataset.tab
        if (!id) return
        tabs.querySelectorAll('button').forEach((button) =>
            button.classList.toggle('active', button === event.target)
        )
        const section = tabs.parentElement
        section
            .querySelectorAll(':scope > .tab')
            .forEach((tab) => tab.classList.toggle('active', tab.id === id))
        if (id === 'authors') renderAuthors()
    })
)

$('#apply-filter').onclick = () => void loadLibraryQuery()
$('#load-more').onclick = () => {
    state.libraryPage += 1
    renderComics()
}
function setLibraryView(view) {
    state.libraryView = view
    $('#comic-grid').hidden = view !== 'grid'
    $('#comic-table').hidden = view !== 'list'
    $('#view-grid').setAttribute('aria-pressed', String(view === 'grid'))
    $('#view-list').setAttribute('aria-pressed', String(view === 'list'))
    localStorage.setItem('pica-library-view', view)
}
$('#view-grid').onclick = () => setLibraryView('grid')
$('#view-list').onclick = () => setLibraryView('list')
$$('[data-grid-size]').forEach((button) => {
    button.onclick = () =>
        setGridSize(button.dataset.sizeScope, button.dataset.gridSize)
})
$('#downloaded-grid').onclick = () => {
    state.downloadedView = 'grid'
    localStorage.setItem('pica-downloaded-view', 'grid')
    $('#downloaded-grid-items').hidden = false
    $('#downloaded-table').hidden = true
    $('#downloaded-grid').setAttribute('aria-pressed', 'true')
    $('#downloaded-list').setAttribute('aria-pressed', 'false')
}
$('#downloaded-list').onclick = () => {
    state.downloadedView = 'list'
    localStorage.setItem('pica-downloaded-view', 'list')
    $('#downloaded-grid-items').hidden = true
    $('#downloaded-table').hidden = false
    $('#downloaded-grid').setAttribute('aria-pressed', 'false')
    $('#downloaded-list').setAttribute('aria-pressed', 'true')
}
function setShelfView(view) {
    state.shelfView = view
    localStorage.setItem('pica-shelf-view', view)
    $('#shelf-grid').setAttribute('aria-pressed', String(view === 'grid'))
    $('#shelf-list-view').setAttribute('aria-pressed', String(view === 'list'))
    if (state.activeShelfId) void openShelf(state.activeShelfId)
}
$('#shelf-grid').onclick = () => setShelfView('grid')
$('#shelf-list-view').onclick = () => setShelfView('list')
$('#shelf-cover-toggle').onchange = (event) => {
    state.shelfCoversEnabled = event.target.checked
    localStorage.setItem(
        'pica-shelf-covers-enabled',
        String(state.shelfCoversEnabled)
    )
    if (state.activeShelfId) void openShelf(state.activeShelfId)
}
$('#shelf-cover-toggle').checked = state.shelfCoversEnabled
$('#shelf-grid').setAttribute(
    'aria-pressed',
    String(state.shelfView === 'grid')
)
$('#shelf-list-view').setAttribute(
    'aria-pressed',
    String(state.shelfView === 'list')
)
$('#cover-toggle').onchange = (event) => {
    state.coversEnabled = event.target.checked
    localStorage.setItem('pica-covers-enabled', String(state.coversEnabled))
    renderAll()
}
$('#recommend-next-batch').onclick = async () => {
    if (state.mode === 'connected' && state.recommendationManagedV3) {
        if (state.recommendationPending) return
        state.recommendationPending = true
        $('#recommend-next-batch').disabled = true
        try {
            const value = await post('/api/v1/recommendations', {
                action: 'next',
                requestId: recommendationRequestId('next'),
                appSessionId: state.appSessionId
            })
            applyManagedRecommendationBatch(value)
            renderPreparedRecommendations()
            if (value.exhausted)
                $('#recommend-message').textContent = t('recommend.exhausted')
        } catch (error) {
            $('#recommend-message').textContent = localizeError(language, error)
        } finally {
            state.recommendationPending = false
            $('#recommend-next-batch').disabled = false
        }
        return
    }
    if (
        state.mode === 'connected' &&
        state.capabilities?.features?.adaptiveRecommendationBatches
    ) {
        try {
            const value = await post('/api/v1/recommendation-sessions', {
                action: 'next',
                engine: 'v3',
                appSessionId: state.appSessionId
            })
            state.profile = value.profile
            state.recommendations = value.recommendations
            state.recommendationSessionNo = value.sessionNo
            state.recommendationBatch = value.currentBatchIndex
            state.recommendationContextId = value.contextId
            state.recommendationExhausted = value.exhausted
            clearSelection('recommendation')
            renderPreparedRecommendations()
        } catch (error) {
            $('#recommend-message').textContent = localizeError(language, error)
        }
        return
    }
    if ((state.recommendationBatch + 1) * 12 < state.recommendations.length) {
        state.recommendationBatch += 1
        renderPreparedRecommendations()
        if (state.mode === 'connected') {
            const status = await post('/api/v1/recommendation-sessions', {
                action: 'batch',
                batchIndex: state.recommendationBatch
            })
            state.recommendationNextReady = status.nextSessionReady
            renderPreparedRecommendations()
        }
        return
    }
    if (state.mode !== 'connected') {
        const nextSession =
            state.recommendationSessions?.[state.recommendationSessionNo]
        if (nextSession?.length) {
            state.recommendations = nextSession
            state.recommendationSessionNo += 1
            state.recommendationBatch = 0
            clearSelection('recommendation')
            renderPreparedRecommendations()
            return
        }
        $('#recommend-message').textContent = t('recommend.exhausted')
        return
    }
    try {
        const value = await post('/api/v1/recommendation-sessions', {
            action: 'next'
        })
        state.profile = value.profile
        state.recommendations = value.recommendations
        state.recommendationSessionNo = value.sessionNo
        state.recommendationExhausted = value.exhausted
        state.recommendationNextReady = value.nextSessionReady
        state.recommendationBatch = 0
        clearSelection('recommendation')
        renderPreparedRecommendations()
        if (value.exhausted)
            $('#recommend-message').textContent = t('recommend.exhausted')
    } catch (error) {
        $('#recommend-message').textContent = localizeError(language, error)
    }
}
function setRecommendationView(view) {
    state.recommendationView = view
    localStorage.setItem('pica-recommendation-view', view)
    renderPreparedRecommendations()
}
$('#recommend-grid').onclick = () => setRecommendationView('grid')
$('#recommend-list').onclick = () => setRecommendationView('list')
$('#recommend-cover-toggle').onchange = (event) => {
    state.coversEnabled = event.target.checked
    localStorage.setItem('pica-covers-enabled', String(state.coversEnabled))
    renderAll()
}
$('#downloaded-cover-toggle').onchange = (event) => {
    state.downloadedCoversEnabled = event.target.checked
    localStorage.setItem(
        'pica-downloaded-covers-enabled',
        String(state.downloadedCoversEnabled)
    )
    void loadDownloaded()
}
$('#pending-only').onchange = renderAuthors
async function importSelectedFile() {
    if (importPending) return
    const input = $('#import-file')
    const file = input.files[0]
    if (!file) return
    importPending = true
    input.disabled = true
    try {
        setProgress($('#library-operation'), t('message.importRead'), 0, 0)
        const text = await file.text()
        setProgress($('#library-operation'), t('message.importParse'), 0, 0)
        if (file.name.toLowerCase().endsWith('.csv')) {
            state.records = csvRecords(text)
            state.authors = []
            state.profile = null
            state.recommendations = []
            state.queue = []
        } else {
            replaceLiteState(importLibraryBundle(JSON.parse(text)))
        }
        setProgress(
            $('#library-operation'),
            t('message.importWrite'),
            0,
            state.records.length
        )
        const backendResult =
            state.mode === 'connected'
                ? await post('/api/v1/import', { records: state.records })
                : null
        setProgress(
            $('#library-operation'),
            t('message.importAuthors'),
            state.records.length,
            state.records.length
        )
        if (!state.authors.length) deriveAuthors()
        await persistLiteState()
        renderAll()
        $('#import-result').textContent = backendResult
            ? t('message.importSummary', backendResult)
            : t('message.imported', {
                  records: state.records.length,
                  recommendations: state.recommendations.length,
                  plans: state.queue.length
              })
        clearProgress($('#library-operation'))
    } catch (error) {
        clearProgress($('#library-operation'))
        $('#import-result').textContent = localizeError(language, error)
    } finally {
        importPending = false
        input.disabled = false
    }
}
$('#import-button').onclick = importSelectedFile
$('#import-file').onchange = importSelectedFile
$('#onboarding-import').onclick = () => $('#import-file').click()
$('#lite-reimport').onclick = () => $('#import-file').click()
function setFavoritesSyncTaskControls(progress = {}) {
    const box = $('#sync-task-actions')
    const pause = $('#sync-pause')
    const resume = $('#sync-resume')
    const cancel = $('#sync-cancel')
    if (!box || !pause || !resume || !cancel) return
    const active = Boolean(
        progress.canPause || progress.canResume || progress.canCancel
    )
    box.hidden = !active
    pause.hidden = !progress.canPause
    resume.hidden = !progress.canResume
    cancel.hidden = !progress.canCancel
}

async function controlFavoritesSync(action) {
    const buttons = [$('#sync-pause'), $('#sync-resume'), $('#sync-cancel')].filter(Boolean)
    buttons.forEach((button) => (button.disabled = true))
    try {
        const progress = await post('/api/v1/sync/control', { action })
        setFavoritesSyncTaskControls(progress)
        const message = $('#import-result')
        if (progress.state === 'pausing') message.textContent = t('sync.pausing')
        else if (progress.state === 'paused') message.textContent = t('sync.paused')
        else if (progress.state === 'running' && action === 'resume')
            message.textContent = t('sync.resuming')
        else if (progress.state === 'cancelling')
            message.textContent = t('sync.cancelling')
    } catch (error) {
        $('#import-result').textContent = localizeError(language, error)
    } finally {
        buttons.forEach((button) => (button.disabled = false))
    }
}

async function syncFavorites(message = $('#import-result'), mode = 'quick') {
    if (state.syncPending) return
    state.syncPending = true
    const syncButtons = [
        $('#sync-button'),
        $('#full-sync-button'),
        $('#home-sync'),
        $('#setup-sync')
    ].filter(Boolean)
    syncButtons.forEach((button) => (button.disabled = true))
    setFavoritesSyncTaskControls({
        canPause: true,
        canResume: false,
        canCancel: true
    })
    try {
        if (state.mode !== 'connected')
            throw new Error(t('message.syncNeedsEngine'))
        message.textContent =
            mode === 'full' ? t('sync.fullStarting') : t('sync.quickStarting')
        setProgress($('#library-operation'), message.textContent, 0, 0)
        let progressTimer = setInterval(async () => {
            try {
                const progress = await api('/api/v1/sync/progress')
                setFavoritesSyncTaskControls(progress)
                if (progress.state === 'paused') {
                    setProgress(
                        $('#library-operation'),
                        t('sync.paused'),
                        progress.fetched,
                        progress.total
                    )
                } else if (progress.state === 'pausing') {
                    setProgress(
                        $('#library-operation'),
                        t('sync.pausing'),
                        progress.fetched,
                        progress.total
                    )
                } else if (progress.state === 'cancelling') {
                    setProgress(
                        $('#library-operation'),
                        t('sync.cancelling'),
                        progress.fetched,
                        progress.total
                    )
                } else if (progress.phase === 'reading') {
                    const text = progress.fallbackReason
                        ? t('sync.fullFallback', {
                              page: progress.page || 0
                          })
                        : t('sync.quickProgress', {
                              page: progress.page || 0,
                              found: progress.found || 0
                          })
                    setProgress(
                        $('#library-operation'),
                        text,
                        progress.fetched,
                        progress.total
                    )
                } else if (progress.phase === 'processing') {
                    setProgress(
                        $('#library-operation'),
                        t('message.syncProcessing', progress),
                        progress.processed,
                        progress.total
                    )
                }
            } catch {
                // The main sync request owns error reporting.
            }
        }, 700)
        let result
        try {
            result = await post('/api/v1/sync', { mode })
        } finally {
            clearInterval(progressTimer)
            progressTimer = null
        }
        if (desktop) desktop.lastSync = result.lastSync
        message.textContent = `${result.syncMode === 'quick' ? t('sync.quickComplete', { pages: result.pagesChecked }) : t('sync.fullComplete', { pages: result.pagesChecked })} ${t(
            'message.syncSummary',
            {
                favorites: result.favoriteCount,
                added: result.addedFavorites,
                removed: result.removedFavorites,
                inserted: result.libraryInserted,
                updated: result.libraryUpdated
            }
        )} ${t('message.syncOtherRecords')}`
        clearProgress($('#library-operation'))
        await detect()
    } catch (error) {
        clearProgress($('#library-operation'))
        const reason = String(error?.message || error)
        message.textContent = /cancelled|canceled/i.test(reason)
            ? t('sync.cancelled')
            : localizeError(language, error)
    } finally {
        state.syncPending = false
        setFavoritesSyncTaskControls({})
        syncButtons.forEach((button) => (button.disabled = false))
    }
}
$('#sync-pause').onclick = () => void controlFavoritesSync('pause')
$('#sync-resume').onclick = () => void controlFavoritesSync('resume')
$('#sync-cancel').onclick = () => void controlFavoritesSync('cancel')
$('#sync-button').onclick = () => syncFavorites()
$('#full-sync-button').onclick = () =>
    syncFavorites($('#import-result'), 'full')
$('#home-sync').onclick = () => syncFavorites($('#import-result'))
$('#setup-sync').onclick = async () => {
    await syncFavorites($('#setup-message'))
    document.body.classList.remove('onboarding')
    document.querySelector('nav').hidden = false
    activateView('library')
}
$('#setup-sync-later').onclick = () => location.assign('/')
$('#clear-lite-state').onclick = async () => {
    if (state.mode !== 'lite') return
    if (!(await askConfirm(t('home.clearConfirm')))) return
    await clearLiteState()
    replaceLiteState(emptyLiteState())
    renderAll()
    await loadJobs()
}
$('#export-plan').onclick = () => {
    const ids = selectedIds()
    const plan = ids.length
        ? {
              schemaVersion: 1,
              createdAt: new Date().toISOString(),
              comicIds: ids
          }
        : portablePlan()
    downloadJson('download-plan.json', plan)
}
$('#queue-selected').onclick = () => enqueue(selectedIds(), 'library')
$('#library-clear-selection').onclick = () => clearSelection('library')
$('#recommend-clear-selection').onclick = () => clearSelection('recommendation')
$('#search-clear-selection').onclick = () => clearSelection('search')
$('#library-add-shelf').onclick = () => {
    const ids = selectedIds('library')
    if (!ids.length) return
    void chooseShelf(ids.length, (shelfId) =>
        post(`/api/v1/shelves/${encodeURIComponent(shelfId)}/items`, {
            comicIds: ids
        })
    )
}
$('#library-add-filtered-shelf').onclick = () => {
    const total = state.libraryQueryResult?.total ?? state.visible.length
    if (!total) return
    void chooseShelf(total, async (shelfId) => {
        const shelf = state.shelves.find((item) => item.id === shelfId)
        if (
            !(await askConfirm(
                t('shelf.addFilteredConfirm', {
                    count: total,
                    name: shelf?.name || ''
                })
            ))
        )
            return
        return post(
            `/api/v1/shelves/${encodeURIComponent(shelfId)}/add-filtered`,
            {
                query:
                    state.libraryQueryResult?.query ??
                    libraryQueryFromControls()
            }
        )
    })
}
$('#recommend-add-shelf').onclick = () => {
    const ids = selectedIds('recommendation')
    if (!ids.length) return
    void chooseShelf(ids.length, (shelfId) =>
        post(`/api/v1/shelves/${encodeURIComponent(shelfId)}/items`, {
            comicIds: ids
        })
    )
}
$('#search-add-shelf').onclick = () => {
    const ids = selectedIds('search')
    if (!ids.length) return
    const records = state.searchResults.filter((item) =>
        ids.includes(item.comicId)
    )
    void chooseShelf(ids.length, (shelfId) =>
        post(`/api/v1/shelves/${encodeURIComponent(shelfId)}/items`, {
            comicIds: ids,
            records
        })
    )
}
$('#shelf-create').onclick = async () => {
    const name = await askText(t('shelf.namePrompt'))
    if (!name) return
    try {
        await post('/api/v1/shelves', { name })
        await loadShelves()
    } catch (error) {
        $('#shelf-message').textContent = localizeError(language, error)
    }
}
$('#shelf-list').onclick = (event) => {
    const id = event.target.closest('[data-shelf-open]')?.dataset.shelfOpen
    if (id) void openShelf(id)
}
$('#shelf-detail').onclick = async (event) => {
    const rename = event.target.dataset.shelfRename
    const removeShelf = event.target.dataset.shelfDelete
    const removeSelected = event.target.dataset.shelfRemoveSelected
    const read = event.target.dataset.shelfRead
    const download = event.target.dataset.shelfDownload
    if (rename) {
        const name = await askText(t('shelf.renamePrompt'))
        if (name) {
            await mutate(
                `/api/v1/shelves/${encodeURIComponent(rename)}`,
                'PATCH',
                {
                    name
                }
            )
            await loadShelves()
            await openShelf(rename)
        }
    } else if (removeShelf) {
        if (!(await askConfirm(t('shelf.deleteConfirm')))) return
        await mutate(
            `/api/v1/shelves/${encodeURIComponent(removeShelf)}`,
            'DELETE'
        )
        state.activeShelfId = null
        $('#shelf-detail').innerHTML =
            `<article class="notice">${t('shelf.deleted')}</article>`
        await loadShelves()
    } else if (removeSelected) {
        await post(
            `/api/v1/shelves/${encodeURIComponent(removeSelected)}/remove`,
            { comicIds: selectedIds('shelf') }
        )
        clearSelection('shelf')
        await openShelf(removeSelected)
        await loadShelves()
    } else if (read) void openReaderComic(read)
    else if (download) await enqueue([download], 'shelf')
}
$('#search-button').onclick = async () => {
    if (state.searchPending) return
    state.searchPending = true
    const searchButton = $('#search-button')
    searchButton.disabled = true
    $('#search-message').textContent = t('message.searching')
    try {
        if (state.mode !== 'connected')
            throw new Error(t('message.searchNeedsEngine'))
        state.searchContextId = crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`
        recordRecommendationEvent('search', {
            contextId: state.searchContextId,
            metadata: {
                keyword: $('#search-keyword').value,
                tags: splitList($('#search-tags').value)
            }
        })
        const providerChoice = $('#search-provider').value
        const providerLabels = { all: t('online.source.all'), pica: t('online.source.pica'), eh: t('online.source.eh'), exh: t('online.source.exh') }
        const providerLabel = $('#search-provider-label')
        if (providerLabel) providerLabel.textContent = providerLabels[providerChoice] || providerChoice
        const records = await post('/api/v1/search', {
            keyword: $('#search-keyword').value,
            tags: splitList($('#search-tags').value),
            providers:
                providerChoice === 'pica'
                    ? ['pica']
                    : providerChoice === 'eh'
                      ? ['eh']
                      : providerChoice === 'exh'
                        ? ['exh']
                        : ['pica', 'eh', 'exh'],
            sort: $('#search-sort').value,
            limit: 100
        })
        state.searchResults = records
        clearSelection('search')
        renderResultCards(records, '#search-results')
        if (!records.length)
            $('#search-results').innerHTML =
                `<article class="ux-empty-state">${escapeHtml(
                    t('search.empty')
                )}</article>`
        $('#search-message').textContent = t('message.searchCount', {
            count: records.length
        })
    } catch (error) {
        $('#search-message').textContent = localizeError(language, error)
    } finally {
        state.searchPending = false
        searchButton.disabled = false
    }
}
$('#recommend-button').onclick = async () => {
    try {
        if (state.mode === 'connected') {
            state.recommendationPending = true
            $('#recommend-button').disabled = true
            const started = await post('/api/v1/recommendation-sessions', {
                engine: 'v3',
                action: 'resume_or_create',
                requestId: recommendationRequestId('resume'),
                appSessionId: state.appSessionId
            })
            if (!started.activeCycleId) {
                $('#recommend-message').textContent = t('recommend.preparing')
                requestRecommendationStatusWatch()
                await waitForFinalCycle()
            }
            const value = await post('/api/v1/recommendations', {
                action: 'current',
                appSessionId: state.appSessionId
            })
            applyManagedRecommendationBatch(value)
        } else if (state.recommendationSessions?.length) {
            state.recommendations = state.recommendationSessions[0]
            state.recommendationSessionNo = 1
            state.recommendationBatch = 0
        }
        if (!state.recommendations.length)
            throw new Error(t('message.recommendNeedsData'))
        renderPreparedRecommendations()
    } catch (error) {
        $('#recommend-message').textContent = localizeError(language, error)
    } finally {
        state.recommendationPending = false
        $('#recommend-button').disabled = false
    }
}
$('#recommend-restart').onclick = async () => {
    if (!(await askConfirm(t('recommend.restartConfirm')))) return
    try {
        if (state.recommendationPending) return
        state.recommendationPending = true
        $('#recommend-restart').disabled = true
        const previousCycleId = state.recommendationCycleId
        await post('/api/v1/recommendation-sessions', {
            action: 'force_new',
            engine: 'v3',
            requestId: recommendationRequestId('force-new'),
            appSessionId: state.appSessionId
        })
        $('#recommend-message').textContent = t('recommend.rebuilding')
        requestRecommendationStatusWatch()
        await waitForFinalCycle(previousCycleId)
        const value = await post('/api/v1/recommendations', {
            action: 'current',
            appSessionId: state.appSessionId
        })
        applyManagedRecommendationBatch(value)
        renderPreparedRecommendations()
    } catch (error) {
        $('#recommend-message').textContent = localizeError(language, error)
    } finally {
        state.recommendationPending = false
        $('#recommend-restart').disabled = false
    }
}
;['#search-results', '#recommend-results'].forEach((selector) => {
    $(selector).onclick = async (event) => {
        const comicId = event.target.dataset.resultDownload
        if (comicId)
            await enqueue(
                [comicId],
                selector.includes('recommend') ? 'recommendation' : 'search'
            )
        const detailId = event.target.dataset.resultDetail
        if (detailId)
            openRecommendationDetail(
                detailId,
                event.target.dataset.resultContext
            )
        const feedback = event.target.dataset.recommendFeedback
        if (feedback) {
            try {
                await submitRecommendationFeedback(event.target, feedback)
            } catch (error) {
                $('#recommend-message').textContent = localizeError(
                    language,
                    error
                )
            }
        }
        const favoriteId = event.target.dataset.resultFavorite
        if (favoriteId) {
            try {
                await mutate(
                    `/api/v1/provider/favorites/${encodeURIComponent(favoriteId)}`,
                    'PUT'
                )
                event.target.textContent = t('result.favorited')
                event.target.disabled = true
            } catch (error) {
                $('#recommend-message').textContent = localizeError(
                    language,
                    error
                )
            }
        }
    }
})
$('#recommend-feedback-dialog-skip').onclick = () => {
    pendingRecommendationFeedback = null
    $('#recommend-feedback-dialog').close()
}
$('#recommend-feedback-dialog-save').onclick = async () => {
    if (!pendingRecommendationFeedback)
        return $('#recommend-feedback-dialog').close()
    const reasons = $$(
        '#recommend-feedback-dialog input[type="checkbox"]:checked'
    ).map((input) => input.value)
    if (reasons.length) {
        try {
            await post('/api/v1/recommendation-events', {
                eventType: 'recommend_feedback_reason',
                comicId: pendingRecommendationFeedback.comicId,
                source: 'recommendation_feedback',
                appSessionId: state.appSessionId,
                contextId: state.recommendationContextId,
                recommendationCycleId: state.recommendationCycleId,
                recommendationBatchIndex: state.recommendationBatch,
                metadata: {
                    parentFeedbackId:
                        pendingRecommendationFeedback.feedbackEventId,
                    sentiment: pendingRecommendationFeedback.sentiment,
                    reasons
                }
            })
            state.recommendationFeedback[
                pendingRecommendationFeedback.comicId
            ].reasons = reasons
        } catch (error) {
            $('#recommend-message').textContent = localizeError(language, error)
        }
    }
    pendingRecommendationFeedback = null
    $('#recommend-feedback-dialog').close()
}

async function loadVisualStatus() {
    if (state.mode !== 'connected') return null
    const requestVersion = visualSettingsMutationVersion
    try {
        const value = await api('/api/v1/visual/status')
        if (requestVersion === visualSettingsMutationVersion) {
            applyVisualSettingsControls(value.settings)
            cacheConfirmedVisualSettings(value.settings)
        }
        $('#visual-index-status').textContent = t('visual.indexStatus', {
            indexed: value.indexedCount || 0,
            target: value.targetCount || 0,
            pending: value.pendingComicIds?.length || 0
        })
        return value
    } catch (error) {
        $('#visual-index-status').textContent = localizeError(language, error)
        return null
    }
}

async function saveVisualSettings({ announce = true } = {}) {
    if (state.mode !== 'connected') return false
    const desired = visualSettingsFromControls()
    const previous = readConfirmedVisualSettings()
    const revision = ++visualSettingsMutationVersion
    const message = $('#visual-index-message')
    if (message && announce)
        message.textContent = t('visual.settingsSaving')
    try {
        const saved = await post('/api/v1/visual/settings', desired)
        if (revision === visualSettingsMutationVersion) {
            applyVisualSettingsControls(saved)
            cacheConfirmedVisualSettings(saved)
            if (message && announce)
                message.textContent = t('visual.settingsSaved')
        }
        return true
    } catch (error) {
        if (revision === visualSettingsMutationVersion && previous)
            applyVisualSettingsControls(previous)
        const failure = t('visual.settingsSaveFailed', {
            error: localizeError(language, error)
        })
        if (message) message.textContent = failure
        showOperationToast(failure, 'negative', 6500)
        return false
    }
}

function setVisualTaskControls(mode = 'idle') {
    const pause = $('#visual-index-pause')
    const resume = $('#visual-index-resume')
    const cancel = $('#visual-index-stop')
    if (!pause || !resume || !cancel) return
    pause.hidden = mode !== 'running'
    resume.hidden = mode !== 'paused' && mode !== 'pausing'
    cancel.hidden = mode === 'idle'
}

async function visualTaskCheckpoint(current, total) {
    if (state.visualIndexStopRequested) return false
    if (!state.visualIndexPauseRequested) return true
    state.visualIndexPaused = true
    setVisualTaskControls('paused')
    const message = $('#visual-index-message')
    const paused = t('visual.paused', { current, total })
    if (message) {
        message.textContent = paused
        delete message.dataset.busy
    }
    setBackgroundTaskIndicator(paused)
    await new Promise((resolve) => {
        state.visualIndexResume = resolve
    })
    state.visualIndexResume = null
    state.visualIndexPaused = false
    if (state.visualIndexStopRequested) return false
    if (message) {
        message.textContent = t('visual.resuming')
        message.dataset.busy = 'true'
    }
    setVisualTaskControls('running')
    return true
}

function resumeVisualTask() {
    state.visualIndexPauseRequested = false
    const resume = state.visualIndexResume
    state.visualIndexResume = null
    if (resume) resume()
    if (state.visualIndexRunning) setVisualTaskControls('running')
}

async function buildVisualIndex() {
    if (state.mode !== 'connected' || state.visualIndexRunning) return
    state.visualIndexRunning = true
    state.visualIndexStopRequested = false
    state.visualIndexPauseRequested = false
    state.visualIndexPaused = false
    state.visualIndexResume = null
    $('#visual-index-build').disabled = true
    setVisualTaskControls('running')
    const message = $('#visual-index-message')
    const progressBar = $('#visual-index-progress')
    let failures = 0
    try {
        if (!(await saveVisualSettings({ announce: false }))) return
        let status = await loadVisualStatus()
        if (!status) throw new Error(t('visual.statusUnavailable'))
        const pending = [...(status.pendingComicIds || [])]
        const total = pending.length
        if (!total) {
            const done = t('visual.noPending')
            if (message) message.textContent = done
            showOperationToast(done, 'positive')
            return
        }
        if (message) message.dataset.busy = 'true'
        if (progressBar) {
            progressBar.hidden = false
            progressBar.max = Math.max(1, total)
            progressBar.value = 0
        }
        for (let index = 0; index < pending.length; index++) {
            if (
                !(await visualTaskCheckpoint(index + 1, total)) ||
                state.visualIndexStopRequested
            )
                break
            const comicId = pending[index]
            if (progressBar) progressBar.value = index
            const background = t('visual.backgroundRunning', {
                current: index + 1,
                total
            })
            setBackgroundTaskIndicator(background)
            if (message)
                message.textContent = t('visual.processing', {
                    current: index + 1,
                    total
                })
            let visualController = null
            try {
                const prepared = await post('/api/v1/visual/prepare', {
                    comicId,
                    mode: $('#visual-sampling-mode').value,
                    limit: 6
                })
                if (!prepared.samples?.length)
                    throw new Error(t('visual.noSamples'))
                if (state.visualIndexStopRequested) break
                visualController = new AbortController()
                state.visualIndexAbortController = visualController
                const result = await analyzeVisualSamples(
                    prepared.samples,
                    (progress) => {
                        if (!message) return
                        if (progress.phase === 'page')
                            message.textContent = t(
                                'visual.processingPage',
                                {
                                    current: index + 1,
                                    total,
                                    page: progress.current,
                                    pages: progress.total
                                }
                            )
                        else if (progress.phase === 'model')
                            message.textContent = t('visual.loadingModel')
                    },
                    { signal: visualController.signal }
                )
                if (state.visualIndexStopRequested) break
                await post('/api/v1/visual/embedding', {
                    comicId,
                    ...result,
                    embeddingKind:
                        prepared.sourceKind === 'COVER_ONLY'
                            ? 'cover'
                            : 'body',
                    sourceKind: prepared.sourceKind,
                    confidence:
                        prepared.sourceKind === 'LOCAL_PAGES'
                            ? 1
                            : prepared.sourceKind === 'REMOTE_PAGES'
                              ? 0.85
                              : 0.5,
                    metadata: {
                        sampleIds: prepared.samples.map(
                            (item) => item.sampleId
                        ),
                        representations: result.representations || null
                    }
                })
            } catch (error) {
                if (
                    error?.name === 'AbortError' &&
                    state.visualIndexStopRequested
                )
                    break
                failures += 1
                if (message)
                    message.textContent = t('visual.itemFailed', {
                        current: index + 1,
                        total,
                        error: localizeError(language, error)
                    })
            } finally {
                if (state.visualIndexAbortController === visualController)
                    state.visualIndexAbortController = null
            }
        }
        if (progressBar)
            progressBar.value = state.visualIndexStopRequested
                ? Math.min(progressBar.value, total)
                : total
        status = await loadVisualStatus()
        const indexed = status?.indexedCount || 0
        let done
        let tone = 'positive'
        if (state.visualIndexStopRequested) {
            done = t('visual.cancelled')
            tone = 'neutral'
        } else if (failures > 0) {
            done = t('visual.finishedWithFailures', {
                indexed,
                failed: failures
            })
            tone = 'warning'
        } else {
            done = t('visual.finished', { indexed })
        }
        if (message) message.textContent = done
        showOperationToast(done, tone, failures ? 7000 : 4600)
    } catch (error) {
        const failure = t('visual.runFailed', {
            error: localizeError(language, error)
        })
        if (message) message.textContent = failure
        showOperationToast(failure, 'negative', 7000)
    } finally {
        if (message) delete message.dataset.busy
        setBackgroundTaskIndicator('')
        state.visualIndexAbortController?.abort()
        state.visualIndexAbortController = null
        state.visualIndexRunning = false
        state.visualIndexStopRequested = false
        state.visualIndexPauseRequested = false
        state.visualIndexPaused = false
        resumeVisualTask()
        $('#visual-index-build').disabled = false
        setVisualTaskControls('idle')
    }
}

$('#visual-enabled').onchange = () => void saveVisualSettings()
$('#visual-sampling-mode').onchange = () => void saveVisualSettings()
$('#visual-rerank-mode').onchange = () => void saveVisualSettings()
$('#visual-strength').onchange = () => void saveVisualSettings()
$('#visual-index-build').onclick = () => void buildVisualIndex()
$('#visual-index-pause').onclick = () => {
    if (!state.visualIndexRunning) return
    state.visualIndexPauseRequested = true
    setVisualTaskControls('pausing')
    const message = $('#visual-index-message')
    if (message) message.textContent = t('visual.pausePending')
}
$('#visual-index-resume').onclick = () => {
    if (!state.visualIndexRunning) return
    resumeVisualTask()
}
$('#visual-index-stop').onclick = () => {
    if (!state.visualIndexRunning) return
    state.visualIndexStopRequested = true
    state.visualIndexPauseRequested = false
    const resume = state.visualIndexResume
    state.visualIndexResume = null
    if (resume) resume()
    state.visualIndexAbortController?.abort()
    setVisualTaskControls('pausing')
    const message = $('#visual-index-message')
    if (message) message.textContent = t('visual.cancelling')
}

$('#recommend-feedback-reasons-toggle').checked =
    state.recommendationFeedbackReasonsEnabled
$('#recommend-feedback-reasons-toggle').onchange = (event) => {
    state.recommendationFeedbackReasonsEnabled = event.target.checked
    localStorage.setItem(
        'pica-recommend-feedback-reasons',
        String(event.target.checked)
    )
}

$('#refresh-jobs').onclick = loadJobs
$('#performance-profile').onchange = () => {
    $('#custom-performance').hidden =
        $('#performance-profile').value !== 'custom'
}
$('#run-jobs').onclick = async () => {
    const button = $('#run-jobs')
    if (button.disabled) return
    if (state.mode === 'lite') {
        downloadJson('download-plan.json', portablePlan())
        return
    }
    button.disabled = true
    setProgress(
        $('#download-operation'),
        t('downloads.starting'),
        0,
        0
    )
    try {
        const profile = $('#performance-profile').value
        const runtime = { profile }
        if (profile === 'custom') {
            Object.assign(runtime, {
                jobConcurrency: Number($('#custom-jobs').value),
                globalMediaConcurrency: Number($('#custom-media').value),
                requestIntervalMs: Number($('#custom-interval').value),
                maxRetries: Number($('#custom-retries').value)
            })
        }
        await post('/api/v1/downloads/run', runtime)
        await loadJobs()
    } finally {
        if (!state.downloadRunnerRunning)
            clearProgress($('#download-operation'))
        button.disabled = state.downloadRunnerRunning
    }
}
$('#job-list').onclick = async (event) => {
    if (!event.target.dataset.jobAction || state.mode !== 'connected') return
    if (event.target.dataset.jobAction === 'cancel') {
        const card = event.target.closest('.download-job-card')
        const completed = Number(card?.dataset.progressCompleted || 0)
        const total = Number(card?.dataset.progressTotal || 0)
        if (
            !(await askConfirm(
                t('downloads.cancelConfirm', {
                    completed,
                    total: total || '—'
                })
            ))
        )
            return
    }
    await post(
        `/api/v1/downloads/${event.target.dataset.jobId}/${event.target.dataset.jobAction}`,
        {}
    )
    await loadJobs()
}
async function runMaintenanceAction(button, output, work) {
    if (button.disabled) return
    button.disabled = true
    output.textContent = t('maintenance.working')
    try {
        output.textContent = JSON.stringify(await work(), null, 2)
    } catch (error) {
        output.textContent = localizeError(language, error)
    } finally {
        button.disabled = false
    }
}

let maintenanceUpdatePollGeneration = 0

function renderMaintenanceUpdateTask(status) {
    const controls = $('#maintenance-update-controls')
    const output = $('#update-result')
    if (!controls || !output) return
    controls.hidden = !status?.active
    $('#maintenance-update-pause').disabled = !status?.canPause
    $('#maintenance-update-resume').disabled = !status?.canResume
    $('#maintenance-update-cancel').disabled = !status?.canCancel
    output.textContent = JSON.stringify(status, null, 2)
}

async function controlMaintenanceUpdate(action) {
    const status = await post('/api/v1/maintenance/updates/control', {
        action
    })
    renderMaintenanceUpdateTask(status)
    return status
}

async function runMaintenanceUpdateScan() {
    const generation = ++maintenanceUpdatePollGeneration
    let status = await post('/api/v1/maintenance/updates', {})
    renderMaintenanceUpdateTask(status)
    while (
        generation === maintenanceUpdatePollGeneration &&
        status?.active
    ) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        status = await api('/api/v1/maintenance/updates/status')
        renderMaintenanceUpdateTask(status)
    }
    if (status?.state === 'failed')
        throw new Error(status.error || 'Maintenance update scan failed')
    return status
}

let maintenanceRepairPollGeneration = 0

function renderMaintenanceRepairTask(status) {
    const controls = $('#maintenance-repair-controls')
    const output = $('#repair-result')
    if (!controls || !output) return
    controls.hidden = !status?.active
    $('#maintenance-repair-pause').disabled = !status?.canPause
    $('#maintenance-repair-resume').disabled = !status?.canResume
    $('#maintenance-repair-cancel').disabled = !status?.canCancel
    output.textContent = JSON.stringify(status, null, 2)
}

async function controlMaintenanceRepair(action) {
    const status = await post('/api/v1/maintenance/repair/control', {
        action
    })
    renderMaintenanceRepairTask(status)
    return status
}

async function runMaintenanceRepairScan() {
    const generation = ++maintenanceRepairPollGeneration
    let status = await post('/api/v1/maintenance/repair', {})
    renderMaintenanceRepairTask(status)
    while (
        generation === maintenanceRepairPollGeneration &&
        status?.active
    ) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        status = await api('/api/v1/maintenance/repair/status')
        renderMaintenanceRepairTask(status)
    }
    if (status?.state === 'failed')
        throw new Error(status.error || 'Maintenance repair scan failed')
    return status
}

$('#maintenance-update-pause').onclick = () =>
    void controlMaintenanceUpdate('pause')
$('#maintenance-update-resume').onclick = () =>
    void controlMaintenanceUpdate('resume')
$('#maintenance-update-cancel').onclick = () =>
    void controlMaintenanceUpdate('cancel')
$('#maintenance-repair-pause').onclick = () =>
    void controlMaintenanceRepair('pause')
$('#maintenance-repair-resume').onclick = () =>
    void controlMaintenanceRepair('resume')
$('#maintenance-repair-cancel').onclick = () =>
    void controlMaintenanceRepair('cancel')

$('#check-updates').onclick = () =>
    void runMaintenanceAction(
        $('#check-updates'),
        $('#update-result'),
        runMaintenanceUpdateScan
    )
$('#scan-repair').onclick = () =>
    void runMaintenanceAction(
        $('#scan-repair'),
        $('#repair-result'),
        runMaintenanceRepairScan
    )
$('#run-health').onclick = () =>
    void runMaintenanceAction(
        $('#run-health'),
        $('#health-result'),
        async () =>
            state.mode === 'connected'
                ? api('/api/v1/status')
                : {
                      mode: 'lite',
                      records: state.records.length,
                      recommendations: state.recommendations.length,
                      queue: state.queue.length,
                      storage: 'IndexedDB'
                  }
    )
$('#author-list').onclick = async (event) => {
    const decision = event.target.dataset.decision
    if (!decision) return
    const item = event.target.closest('[data-author-id]')
    if (state.mode === 'connected') {
        await post(`/api/v1/authors/${item.dataset.authorId}/decision`, {
            reviewStatus: decision
        })
    } else {
        const author = state.authors.find(
            (candidate) => candidate.id === item.dataset.authorId
        )
        if (author) author.reviewStatus = decision
        await persistLiteState()
    }
    renderAuthors()
}

function chronicleEscape(value) {
    const node = document.createElement('span')
    node.textContent = String(value ?? '')
    return node.innerHTML
}

function chronicleTrend(value) {
    return (
        {
            STABLE: t('chronicle.stable'),
            RISING: t('chronicle.rising'),
            STRONGLY_RISING: t('chronicle.stronglyRising'),
            DECLINING: t('chronicle.declining'),
            DORMANT: t('chronicle.dormant'),
            EMERGING: t('chronicle.emerging'),
            INSUFFICIENT_DATA: t('chronicle.insufficient')
        }[value] || t('chronicle.changing')
    )
}

function renderChronicleLegacy(snapshot) {
    const content = $('#chronicle-content')
    if (!snapshot) return
    const metric = (label, value) =>
        `<div class="chronicle-metric"><strong>${chronicleEscape(value)}</strong><span>${chronicleEscape(label)}</span></div>`
    content.innerHTML = `<article class="chronicle-hero"><p class="eyebrow">Pica Library · ${t('chronicle.book')}</p><h2>${t('chronicle.hero')}</h2><p>${chronicleEscape(snapshot.reportNarratives.summary)}</p><div class="chronicle-metrics">${metric(t('chronicle.favoritesMetric'), snapshot.favoriteCount)}${metric(t('chronicle.authorsMetric'), snapshot.globalStats.authors)}${metric(t('chronicle.tagsMetric'), snapshot.globalStats.tags)}${metric(t('chronicle.interestsMetric'), snapshot.tasteClusters.length)}</div><small>${t('chronicle.local')}</small></article>
    <article class="chronicle-section chronicle-page"><h2>${t('chronicle.keywords')}</h2><div class="chronicle-tags">${snapshot.tagPreferences
        .slice(0, 20)
        .map(
            (tag) =>
                `<span class="chronicle-tag">${chronicleEscape(tag.value)} · ${chronicleTrend(tag.trend)}</span>`
        )
        .join('')}</div></article>
    <article class="chronicle-section chronicle-page"><h2>${t('chronicle.lines')}</h2><div class="chronicle-clusters">${snapshot.tasteClusters
        .map(
            (cluster, index) =>
                `<section class="chronicle-cluster"><small>${index < 3 ? t('chronicle.main') : t('chronicle.side')} ${String(index + 1).padStart(2, '0')} · ${chronicleTrend(cluster.trend)}</small><h3>${chronicleEscape(cluster.displayName)}</h3><p>${t('chronicle.share')} ${Math.round(cluster.weight * 100)}%</p><p>${cluster.authors.slice(0, 3).map(chronicleEscape).join(' · ')}</p><div class="chronicle-covers">${(
                    cluster.representativeWorks || []
                )
                    .slice(0, 4)
                    .map((work) =>
                        state.mode === 'connected' && work.coverUrl
                            ? `<figure><img src="/api/v1/covers/${encodeURIComponent(work.comicId)}" alt="" loading="lazy"><figcaption>${chronicleEscape(work.title)}</figcaption></figure>`
                            : `<figure class="cover-fallback"><span>◇</span><figcaption>${chronicleEscape(work.title)}</figcaption></figure>`
                    )
                    .join('')}</div></section>`
        )
        .join('')}</div></article>
    <article class="chronicle-section chronicle-page"><h2>${t('chronicle.universe')}</h2><p>${t('chronicle.universeNote')}</p><div class="chronicle-universe">${snapshot.tasteClusters
        .map((cluster, index) => {
            const angle =
                (Math.PI * 2 * index) /
                Math.max(1, snapshot.tasteClusters.length)
            const radius = 27 + (index % 3) * 7
            const x = 50 + Math.cos(angle) * radius
            const y = 50 + Math.sin(angle) * radius
            const size = 70 + Math.sqrt(cluster.weight) * 90
            const label =
                cluster.displayName.length > 18
                    ? `${cluster.displayName.slice(0, 17)}…`
                    : cluster.displayName
            return `<div class="universe-node" style="left:${x}%;top:${y}%;width:${size}px;height:${size}px"><span>${chronicleEscape(label)}</span></div>`
        })
        .join('')}</div></article>
    <article class="chronicle-section chronicle-page"><h2>${t('chronicle.familiar')}</h2><div class="chronicle-preference-grid"><section><h3>${t('chronicle.authors')}</h3>${snapshot.authorPreferences
        .slice(0, 12)
        .map(
            (item) =>
                `<p><strong>${chronicleEscape(item.value)}</strong><span>${chronicleTrend(item.trend)}</span></p>`
        )
        .join(
            ''
        )}</section><section><h3>${t('chronicle.circles')}</h3>${snapshot.circlePreferences
        .slice(0, 12)
        .map(
            (item) =>
                `<p><strong>${chronicleEscape(item.value)}</strong><span>${chronicleTrend(item.trend)}</span></p>`
        )
        .join('')}</section></div></article>
    <article class="chronicle-section chronicle-page"><h2>${t('chronicle.lifetimeRecent')}</h2><div class="chronicle-bars">${snapshot.tagPreferences
        .slice(0, 12)
        .map(
            (tag) =>
                `<div class="chronicle-double-bar"><span>${chronicleEscape(tag.value)}</span><i style="width:${Math.max(4, tag.lifetimeSupport * 100)}%"></i><b style="width:${Math.max(4, tag.recentWeightedSupport * 100)}%"></b></div>`
        )
        .join('')}</div><p>${t('chronicle.lifetimeRecentNote')}</p></article>
    <article class="chronicle-section chronicle-page"><h2>${t('chronicle.change')}</h2><div class="chronicle-bars">${snapshot.tagPreferences
        .slice(0, 12)
        .map(
            (tag) =>
                `<div class="chronicle-bar"><span>${chronicleEscape(tag.value)}</span><i style="width:${Math.max(5, Math.min(100, tag.lateSupport * 100))}%"></i></div>`
        )
        .join('')}</div><p>${t('chronicle.ordinalNote')}</p></article>
    <article class="chronicle-section chronicle-page"><h2>${t('chronicle.combinations')}</h2><div class="chronicle-tags">${snapshot.tagCombinations
        .slice(0, 16)
        .map(
            (item) =>
                `<span class="chronicle-tag">${item.tags.map(chronicleEscape).join(' + ')}</span>`
        )
        .join('')}</div><p>${t('chronicle.comboNote')}</p></article>
    <article class="chronicle-section chronicle-page"><h2>${t('chronicle.style')}</h2>${snapshot.collectionStyle.map((item) => `<h3>${chronicleEscape(item.label)} · ${chronicleEscape(item.level)}</h3><p>${chronicleEscape(item.description)}</p>`).join('')}</article>
    <article class="chronicle-section chronicle-page"><h2>${t('chronicle.popularity')}</h2><p>${t('chronicle.popularityNote', { finished: Math.round(snapshot.globalStats.finishedRatio * 100), clusters: snapshot.tasteClusters.length })}</p><div class="chronicle-tags">${snapshot.tasteClusters
        .slice()
        .sort((left, right) => left.weight - right.weight)
        .slice(0, 8)
        .map(
            (cluster) =>
                `<span class="chronicle-tag">${chronicleEscape(cluster.displayName)} · ${Math.round(cluster.weight * 100)}%</span>`
        )
        .join(
            ''
        )}</div><div class="chronicle-subsection"><h2>${t('chronicle.future')}</h2><p>${t('chronicle.futureNote')}</p><ol class="chronicle-flow"><li>${t('chronicle.futureLifetime')}</li><li>${t('chronicle.futureRecent')}</li><li>${t('chronicle.futureBalance')}</li></ol><p>${t('chronicle.futureSafety')}</p></div></article>
    <article class="chronicle-section chronicle-page"><h2>${t('chronicle.about')}</h2><p>${chronicleEscape(snapshot.reportNarratives.privacy)}</p><p>${t('chronicle.definition')}</p><small>Snapshot v${snapshot.snapshotVersion} · ${chronicleEscape(snapshot.generatedAt)} · ${t('chronicle.generatedLocally')}</small><h3>${t('chronicle.return')}</h3></article>`
}

function chronicleFacetLabel(facet) {
    const value = t(`chronicle.facet.${facet}`)
    return value || facet
}

function chronicleGroupForFacet(facet) {
    if (['FANDOM_IP', 'FANDOM_CHARACTER'].includes(facet)) return 'fandom'
    if (['RELATIONSHIP', 'STORY_TROPE', 'GENRE_THEME'].includes(facet))
        return 'story'
    if (
        [
            'IDENTITY_ROLE',
            'APPEARANCE_TRAIT',
            'APPEARANCE_OUTFIT',
            'BODY_ATTRIBUTE'
        ].includes(facet)
    )
        return 'appearance'
    if (
        [
            'SEXUAL_BEHAVIOR',
            'CONTROL_COERCION',
            'FETISH_TROPE',
            'PHYSIOLOGY_STATE'
        ].includes(facet)
    )
        return 'content'
    if (['SPECIES_FANTASY', 'SETTING_LOCATION'].includes(facet))
        return 'fantasy'
    return 'style'
}

function chronicleGroupLabel(group) {
    return t(`chronicle.group.${group}`)
}

function chronicleCover(work) {
    return state.mode === 'connected' && work.coverUrl
        ? `<figure><img src="/api/v1/covers/${encodeURIComponent(work.comicId)}" alt="" loading="lazy"><figcaption>${chronicleEscape(work.title)}</figcaption></figure>`
        : `<figure class="cover-fallback"><span>◇</span><figcaption>${chronicleEscape(work.title)}</figcaption></figure>`
}

function renderChronicleUniverse(snapshot) {
    const themes = snapshot.themes || []
    if (!themes.length)
        return `<div class="atlas-empty">${t('chronicle.noThemes')}</div>`
    const width = 1000
    const height = 560
    const positions = themes.map((theme, index) => {
        const angle =
            -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, themes.length)
        const ring = index % 2 === 0 ? 1 : 0.82
        return {
            theme,
            x: width / 2 + Math.cos(angle) * 360 * ring,
            y: height / 2 + Math.sin(angle) * 205 * ring,
            r: Math.max(
                34,
                Math.min(72, 34 + Math.sqrt(theme.supportShare || 0) * 115)
            )
        }
    })
    const byId = new Map(positions.map((item) => [item.theme.themeId, item]))
    const edges = (snapshot.themeEdges || [])
        .map((edge) => {
            const left = byId.get(edge.sourceThemeId)
            const right = byId.get(edge.targetThemeId)
            if (!left || !right) return ''
            const strength = Math.max(
                1,
                Math.min(6, 1 + Number(edge.jaccard || 0) * 14)
            )
            return `<line x1="${left.x}" y1="${left.y}" x2="${right.x}" y2="${right.y}" class="atlas-universe-edge" style="--edge-width:${strength}px" />`
        })
        .join('')
    const nodes = positions
        .map(({ theme, x, y, r }) => {
            const label =
                String(theme.displayName || '').length > 18
                    ? `${String(theme.displayName).slice(0, 17)}…`
                    : String(theme.displayName || '')
            const family = theme.type === 'FANDOM' ? 'fandom' : 'semantic'
            return `<g class="atlas-universe-node atlas-universe-node-${family}" transform="translate(${x} ${y})"><circle r="${r}"></circle><text text-anchor="middle" dominant-baseline="middle"><tspan x="0" dy="-0.15em">${chronicleEscape(label)}</tspan><tspan x="0" dy="1.35em" class="atlas-universe-count">${chronicleEscape(theme.supportCount)}</tspan></text></g>`
        })
        .join('')
    return `<div class="atlas-universe-wrap"><svg class="atlas-universe-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${chronicleEscape(t('chronicle.universe'))}">${edges}${nodes}</svg></div>`
}

function renderChronicleV2(snapshot) {
    const content = $('#chronicle-content')
    const metric = (label, value) =>
        `<div class="chronicle-metric"><strong>${chronicleEscape(value)}</strong><span>${chronicleEscape(label)}</span></div>`
    const bands = snapshot.facetBands || []
    const grouped = new Map()
    for (const band of bands) {
        const group = chronicleGroupForFacet(band.facet)
        grouped.set(group, [...(grouped.get(group) || []), band])
    }
    const groupOrder = [
        'fandom',
        'story',
        'appearance',
        'content',
        'fantasy',
        'style'
    ]
    const keywordGroups = groupOrder
        .filter((group) => grouped.has(group))
        .map((group) => {
            const interests = grouped
                .get(group)
                .flatMap((band) => band.interests || [])
                .sort(
                    (a, b) =>
                        Number(b.supportCount || 0) -
                            Number(a.supportCount || 0) ||
                        String(a.label).localeCompare(String(b.label))
                )
                .slice(0, 10)
            return `<section class="atlas-keyword-group atlas-group-${group}"><h3>${chronicleEscape(chronicleGroupLabel(group))}</h3><div class="atlas-chip-cloud">${interests
                .map((item) => {
                    const mix = Math.round(
                        16 +
                            Math.min(
                                1,
                                Number(item.facetConditionalShare || 0)
                            ) *
                                46
                    )
                    return `<span class="atlas-chip" style="--mix:${mix}%"><strong>${chronicleEscape(item.label)}</strong><small>${chronicleEscape(item.supportCount)}</small></span>`
                })
                .join('')}</div></section>`
        })
        .join('')
    const themes = (snapshot.themes || [])
        .map((theme, index) => {
            const detail =
                theme.type === 'SEMANTIC_COMBINATION' && theme.lift
                    ? `${t('chronicle.coverage', { count: theme.supportCount })} · ${t('chronicle.association', { value: Number(theme.lift).toFixed(2) })}`
                    : t('chronicle.coverage', { count: theme.supportCount })
            return `<section class="atlas-theme atlas-theme-${String(theme.family || '').toLowerCase()}"><small>${t('chronicle.theme')} ${String(index + 1).padStart(2, '0')}</small><h3>${chronicleEscape(theme.displayName)}</h3><p>${chronicleEscape(detail)}</p><div class="atlas-theme-anchors">${(
                theme.anchors || []
            )
                .map(
                    (anchor) =>
                        `<span>${chronicleEscape(chronicleFacetLabel(anchor.facet))} · ${chronicleEscape(anchor.label)}</span>`
                )
                .join('')}</div><div class="chronicle-covers">${(
                theme.representativeWorks || []
            )
                .slice(0, 4)
                .map(chronicleCover)
                .join('')}</div></section>`
        })
        .join('')
    const heatmap = bands
        .slice(0, 12)
        .map((band) => {
            const group = chronicleGroupForFacet(band.facet)
            return `<section class="atlas-heat-row atlas-group-${group}"><header><strong>${chronicleEscape(chronicleFacetLabel(band.facet))}</strong><span>${t('chronicle.facetCoverage', { count: band.comicCount })}</span></header><div class="atlas-heat-cells">${(
                band.interests || []
            )
                .slice(0, 8)
                .map((item) => {
                    const mix = Math.round(
                        14 +
                            Math.min(
                                1,
                                Number(item.facetConditionalShare || 0)
                            ) *
                                58
                    )
                    return `<span class="atlas-heat-cell" style="--mix:${mix}%"><b>${chronicleEscape(item.label)}</b><small>${Math.round(Number(item.facetConditionalShare || 0) * 100)}%</small></span>`
                })
                .join('')}</div></section>`
        })
        .join('')
    const preferenceList = (items) =>
        (items || [])
            .slice(0, 12)
            .map(
                (item) =>
                    `<p><strong>${chronicleEscape(item.label || item.value)}</strong><span>${t('chronicle.itemsCount', { count: item.supportCount })}</span></p>`
            )
            .join('')
    const combinations = (snapshot.combinations || [])
        .slice(0, 12)
        .map(
            (item) =>
                `<article class="atlas-combination"><h3>${item.tags.map(chronicleEscape).join(' × ')}</h3><p>${t('chronicle.comboStats', { count: item.supportCount, lift: Number(item.lift || 0).toFixed(2) })}</p><small>${item.facets.map((facet) => chronicleEscape(chronicleFacetLabel(facet))).join(' · ')}</small></article>`
        )
        .join('')
    const style = (snapshot.collectionStyle || [])
        .map(
            (item) =>
                `<article class="atlas-style-card"><div><strong>${chronicleEscape(item.label)}</strong><span>${chronicleEscape(item.level)}</span></div><p>${chronicleEscape(item.description)}</p></article>`
        )
        .join('')

    content.innerHTML = `<article class="chronicle-hero atlas-hero"><p class="eyebrow">Pica Library · ${t('chronicle.book')}</p><h2>${t('chronicle.heroV2')}</h2><p>${chronicleEscape(snapshot.reportNarratives.summary)}</p><div class="chronicle-metrics">${metric(t('chronicle.favoritesMetric'), snapshot.favoriteCount)}${metric(t('chronicle.authorsMetric'), snapshot.globalStats.authors)}${metric(t('chronicle.canonicalInterests'), snapshot.globalStats.canonicalInterests)}${metric(t('chronicle.themesMetric'), (snapshot.themes || []).length)}</div><small>${t('chronicle.localV2')}</small></article>
    <article class="chronicle-section chronicle-page"><div class="atlas-section-heading"><div><p class="eyebrow">01</p><h2>${t('chronicle.keywordsV2')}</h2></div></div><div class="atlas-keyword-groups">${keywordGroups}</div></article>
    <article class="chronicle-section chronicle-page"><div class="atlas-section-heading"><div><p class="eyebrow">02</p><h2>${t('chronicle.themes')}</h2></div><p>${t('chronicle.themesNote')}</p></div><div class="atlas-themes">${themes}</div></article>
    <article class="chronicle-section chronicle-page"><div class="atlas-section-heading"><div><p class="eyebrow">03</p><h2>${t('chronicle.universe')}</h2></div><p>${t('chronicle.universeNoteV2')}</p></div>${renderChronicleUniverse(snapshot)}</article>
    <article class="chronicle-section chronicle-page"><div class="atlas-section-heading"><div><p class="eyebrow">04</p><h2>${t('chronicle.preferenceMap')}</h2></div><p>${t('chronicle.preferenceMapNote')}</p></div><div class="atlas-heatmap">${heatmap}</div></article>
    <article class="chronicle-section chronicle-page"><div class="atlas-section-heading"><div><p class="eyebrow">05</p><h2>${t('chronicle.familiarV2')}</h2></div></div><div class="chronicle-preference-grid atlas-preference-grid"><section><h3>${t('chronicle.fandoms')}</h3>${preferenceList(snapshot.fandomPreferences)}</section><section><h3>${t('chronicle.authors')}</h3>${preferenceList(snapshot.authorPreferences)}</section><section><h3>${t('chronicle.circles')}</h3>${preferenceList(snapshot.circlePreferences)}</section></div></article>
    <article class="chronicle-section chronicle-page"><div class="atlas-section-heading"><div><p class="eyebrow">06</p><h2>${t('chronicle.combinationsV2')}</h2></div><p>${t('chronicle.combinationsNoteV2')}</p></div><div class="atlas-combinations">${combinations || `<div class="atlas-empty">${t('chronicle.noCombinations')}</div>`}</div></article>
    <article class="chronicle-section chronicle-page"><div class="atlas-section-heading"><div><p class="eyebrow">07</p><h2>${t('chronicle.styleV2')}</h2></div></div><div class="atlas-style-grid">${style}</div></article>
    <article class="chronicle-section chronicle-page atlas-about"><p>${chronicleEscape(snapshot.reportNarratives.privacy)}</p><small>Snapshot v${snapshot.snapshotVersion} · ${chronicleEscape(snapshot.generatedAt)} · ${t('chronicle.generatedLocally')}</small></article>`
}

function renderChronicle(snapshot) {
    if (!snapshot) return
    state.chronicleSnapshot = snapshot
    if (Number(snapshot.snapshotVersion || 0) >= 2 && snapshot.facetBands) {
        renderChronicleV2(snapshot)
        return
    }
    renderChronicleLegacy(snapshot)
}

async function loadChronicle() {
    if (state.mode !== 'connected') {
        $('#chronicle-status').textContent = t('chronicle.lite')
        return
    }
    try {
        const value = await api('/api/v1/recommendation/profile')
        renderChronicle(value.snapshot)
    } catch {
        $('#chronicle-status').textContent = t('chronicle.needSync')
    }
}

async function rebuildChronicle() {
    $('#chronicle-status').textContent = t('chronicle.building')
    try {
        const value = await post('/api/v1/recommendation/profile/rebuild', {})
        renderChronicle(value.snapshot)
        $('#chronicle-status').textContent = t('chronicle.ready')
    } catch (error) {
        $('#chronicle-status').textContent = localizeError(language, error)
    }
}

$('#chronicle-build').onclick = rebuildChronicle
$('#chronicle-refresh').onclick = rebuildChronicle

function chroniclePrintCover(work) {
    if (state.mode !== 'connected' || !work?.comicId || !work?.coverUrl)
        return `<div class="atlas-print-cover atlas-print-cover-fallback"><span>◇</span></div>`
    return `<div class="atlas-print-cover"><img src="/api/v1/covers/${encodeURIComponent(work.comicId)}" alt="" loading="eager"></div>`
}

function buildChroniclePrintV2(snapshot) {
    let root = $('#chronicle-print-document')
    if (!root) {
        root = document.createElement('div')
        root.id = 'chronicle-print-document'
        root.className = 'chronicle-print-document'
        document.body.append(root)
    }

    const bands = snapshot.facetBands || []
    const grouped = new Map()
    for (const band of bands) {
        const group = chronicleGroupForFacet(band.facet)
        grouped.set(group, [...(grouped.get(group) || []), band])
    }

    // PDF V4 is a purpose-built fixed result card, not a responsive Web layout.
    // Every region has a fixed A4-landscape box so the browser cannot reflow it
    // into overlapping or clipped sections during print.
    const groupOrder = ['story', 'appearance', 'fantasy', 'fandom', 'content']
    const palettes = {
        story: ['#fff4f7', '#fde7ee', '#fbd7e2', '#f5bed1', '#eda1bd'],
        appearance: ['#fff8ef', '#fceeda', '#f9dfc2', '#f2c998', '#eaae69'],
        fantasy: ['#f7f5ff', '#eeeafd', '#e0daf8', '#cfc5ef', '#b8a9e5'],
        fandom: ['#f3f5ff', '#e7ebff', '#d5dcfb', '#bdc7f6', '#9aa9ef'],
        content: ['#eefaf7', '#dbf3ed', '#c3e9df', '#9ddacb', '#72c7b4']
    }
    const semanticBands = groupOrder
        .filter((group) => grouped.has(group))
        .slice(0, 5)
        .map((group) => {
            const items = grouped
                .get(group)
                .flatMap((band) => band.interests || [])
                .sort(
                    (a, b) =>
                        Number(b.supportCount || 0) -
                            Number(a.supportCount || 0) ||
                        String(a.label).localeCompare(String(b.label))
                )
                .slice(0, 4)
            const max = Math.max(
                1,
                ...items.map((item) => Number(item.supportCount || 0))
            )
            const colors = palettes[group] || palettes.fandom
            return `<section class="rc-facet rc-facet-${group}"><header><strong>${chronicleEscape(chronicleGroupLabel(group))}</strong></header><div>${items
                .map((item) => {
                    const ratio = Number(item.supportCount || 0) / max
                    const tier = Math.max(0, Math.min(4, Math.round(ratio * 4)))
                    return `<span style="background:${colors[tier]} !important"><b>${chronicleEscape(item.label)}</b><small>${chronicleEscape(item.supportCount)}</small></span>`
                })
                .join('')}</div></section>`
        })
        .join('')

    const themes = (snapshot.themes || [])
        .slice(0, 4)
        .map((theme) => {
            const work = (theme.representativeWorks || [])[0]
            const detail =
                theme.type === 'SEMANTIC_COMBINATION' && theme.lift
                    ? `${t('chronicle.coverage', { count: theme.supportCount })} · ${Number(theme.lift).toFixed(2)}×`
                    : t('chronicle.coverage', { count: theme.supportCount })
            return `<article class="rc-theme rc-theme-${String(theme.family || '').toLowerCase()}">${chroniclePrintCover(work).replaceAll('atlas-print-cover', 'rc-cover')}<div class="rc-theme-copy"><h3>${chronicleEscape(theme.displayName)}</h3><p>${chronicleEscape(detail)}</p><div class="rc-theme-tags">${(
                theme.anchors || []
            )
                .slice(0, 2)
                .map(
                    (anchor) => `<span>${chronicleEscape(anchor.label)}</span>`
                )
                .join('')}</div></div></article>`
        })
        .join('')

    const orbitThemes = (snapshot.themes || []).slice(0, 6)
    const maxThemeSupport = Math.max(
        1,
        ...orbitThemes.map((theme) => Number(theme.supportCount || 0))
    )
    const positions = [
        { x: 150, y: 190 },
        { x: 78, y: 92 },
        { x: 225, y: 92 },
        { x: 62, y: 292 },
        { x: 238, y: 286 },
        { x: 150, y: 350 }
    ]
    const orbitSvg = (() => {
        if (!orbitThemes.length) return ''
        const center = positions[0]
        const lines = orbitThemes
            .slice(1)
            .map((_, index) => {
                const point = positions[index + 1]
                return `<line x1="${center.x}" y1="${center.y}" x2="${point.x}" y2="${point.y}" stroke="#d9deef" stroke-width="2" />`
            })
            .join('')
        const nodes = orbitThemes
            .map((theme, index) => {
                const point = positions[index]
                const support = Number(theme.supportCount || 0)
                const ratio = Math.sqrt(Math.max(0, support) / maxThemeSupport)
                const radius = Math.round(25 + ratio * 10)
                const family =
                    String(theme.family || '').toLowerCase() === 'semantic'
                        ? 'semantic'
                        : 'fandom'
                const rawLabel = String(theme.displayName || '')
                const label =
                    rawLabel.length > 18
                        ? `${rawLabel.slice(0, 17)}…`
                        : rawLabel
                const fill = family === 'semantic' ? '#eaf8f4' : '#eef1ff'
                const stroke = family === 'semantic' ? '#35a98f' : '#6675e8'
                return `<g class="rc-orbit-node rc-orbit-node-${family}" transform="translate(${point.x} ${point.y})"><circle r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2"></circle><text text-anchor="middle" fill="#2c3444" font-size="12" font-weight="800"><tspan x="0" dy="-2">${chronicleEscape(label)}</tspan><tspan x="0" dy="16" fill="#697283" font-size="10" font-weight="600">${chronicleEscape(support)}</tspan></text></g>`
            })
            .join('')
        return `<svg class="rc-orbit-svg" viewBox="0 0 300 410" preserveAspectRatio="xMidYMid meet"><g class="rc-orbit-lines">${lines}</g>${nodes}</svg>`
    })()

    const compactList = (items, limit = 3) =>
        (items || [])
            .slice(0, limit)
            .map(
                (item) =>
                    `<li><strong>${chronicleEscape(item.label || item.value)}</strong><span>${chronicleEscape(item.supportCount)}</span></li>`
            )
            .join('')

    const combos = (snapshot.combinations || [])
        .slice(0, 3)
        .map(
            (item, index) =>
                `<article class="rc-combo"><span>${index + 1}</span><div><h3>${item.tags.map(chronicleEscape).join(' × ')}</h3><p>${chronicleEscape(item.supportCount)} · ${Number(item.lift || 0).toFixed(2)}×</p></div></article>`
        )
        .join('')

    const styles = (snapshot.collectionStyle || [])
        .slice(0, 3)
        .map(
            (item) =>
                `<article class="rc-trait"><strong>${chronicleEscape(item.label)}</strong><span>${chronicleEscape(item.level)}</span></article>`
        )
        .join('')

    const profileResult =
        snapshot.collectionStyle?.[0]?.label ||
        t('chronicle.profileResultFallback')
    const profileDescription =
        snapshot.collectionStyle?.[0]?.description ||
        snapshot.reportNarratives?.summary ||
        ''
    const metric = (label, value) =>
        `<div class="rc-metric"><strong>${chronicleEscape(value)}</strong><span>${chronicleEscape(label)}</span></div>`

    root.innerHTML = `<section class="rc-sheet">
        <div class="rc-hero">
            <div class="rc-brand"><img src="./pica-library-icon.svg" alt=""><div><p>PICA LIBRARY · COLLECTION PROFILE</p><h1>${chronicleEscape(profileResult)}</h1><span>${chronicleEscape(profileDescription)}</span></div></div>
            <div class="rc-metrics">${metric(t('chronicle.favoritesMetric'), snapshot.favoriteCount)}${metric(t('chronicle.authorsMetric'), snapshot.globalStats.authors)}${metric(t('chronicle.canonicalInterests'), snapshot.globalStats.canonicalInterests)}${metric(t('chronicle.themesMetric'), (snapshot.themes || []).length)}</div>
        </div>

        <section class="rc-panel rc-semantic"><div class="rc-panel-title"><small>01</small><h2>${t('chronicle.preferenceMap')}</h2></div><div class="rc-facet-stack">${semanticBands}</div></section>
        <section class="rc-panel rc-universe"><div class="rc-panel-title"><small>02</small><h2>${t('chronicle.universe')}</h2></div><div class="rc-orbit">${orbitSvg}</div></section>
        <section class="rc-panel rc-signatures"><div class="rc-panel-title"><small>03</small><h2>${t('chronicle.themes')}</h2></div><div class="rc-theme-grid">${themes}</div></section>

        <section class="rc-footer-panel rc-footer-ip"><h2>${t('chronicle.fandoms')}</h2><ul>${compactList(snapshot.fandomPreferences)}</ul></section>
        <section class="rc-footer-panel rc-footer-author"><h2>${t('chronicle.authors')}</h2><ul>${compactList(snapshot.authorPreferences)}</ul></section>
        <section class="rc-footer-panel rc-footer-combos"><h2>${t('chronicle.combinationsV2')}</h2><div class="rc-combos">${combos}</div></section>
        <section class="rc-footer-panel rc-footer-traits"><h2>${t('chronicle.styleV2')}</h2><div class="rc-traits">${styles}</div></section>

        <div class="rc-meta"><span>Pica Library · ${t('chronicle.snapshotLabel')} v${chronicleEscape(snapshot.snapshotVersion)}</span><small>${chronicleEscape(String(snapshot.generatedAt || '').slice(0, 10))} · ${t('chronicle.generatedLocallyShort')}</small></div>
    </section>`
    return root
}

async function waitForChroniclePrintImages(root) {
    const images = [...root.querySelectorAll('img')]
    for (const image of images) image.loading = 'eager'
    await Promise.race([
        Promise.allSettled(
            images.map(async (image) => {
                if (!image.complete)
                    await new Promise((resolve) => {
                        image.addEventListener('load', resolve, { once: true })
                        image.addEventListener('error', resolve, { once: true })
                    })
                if (image.decode) await image.decode().catch(() => undefined)
            })
        ),
        new Promise((resolve) => setTimeout(resolve, 3500))
    ])
}

$('#chronicle-print').onclick = async () => {
    const previousTitle = document.title
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '')
    document.title = `${t('chronicle.filename')}-${day}`
    const snapshot = state.chronicleSnapshot
    if (
        snapshot &&
        Number(snapshot.snapshotVersion || 0) >= 2 &&
        snapshot.facetBands
    ) {
        const root = buildChroniclePrintV2(snapshot)
        await waitForChroniclePrintImages(root)
    }
    window.print()
    setTimeout(() => {
        document.title = previousTitle
    }, 500)
}

async function detect() {
    if (new URLSearchParams(location.search).get('mode') === 'browser-lite') {
        document.body.classList.add('browser-lite-forced')
        state.mode = 'lite'
        $('#mode').textContent = t('mode.lite')
        replaceLiteState(await loadLiteState())
        renderAll()
        return
    }
    await loadDesktop()
    if (desktop && !desktop.configured) return
    replaceLiteState(await loadLiteState())
    try {
        const status = await api('/api/v1/status')
        state.mode = 'connected'
        await loadRecommendationFeedback()
        $('#mode').textContent = t('mode.connected')
        state.records = await api('/api/v1/comics?limit=5000')
        state.authors = await api('/api/v1/authors')
        await loadLibraryQuery({
            scope: 'library',
            tags: [],
            tagMode: 'all',
            sort: $('#sort-mode').value,
            limit: 5000,
            offset: 0
        })
        renderAll(status.summary)
        let recommendation = await api(
            '/api/v1/recommendation-sessions/status?mode=final'
        )
        if (!recommendation.activeCycleId && !recommendation.buildingCycleId) {
            recommendation = await post('/api/v1/recommendation-sessions', {
                engine: 'v3',
                action: 'resume_or_create',
                requestId: recommendationRequestId('initial'),
                appSessionId: state.appSessionId
            })
        }
        if (recommendation.activeCycleId) {
            const current = await post('/api/v1/recommendations', {
                action: 'current',
                appSessionId: state.appSessionId
            })
            applyManagedRecommendationBatch(current)
            if (state.recommendations.length) renderPreparedRecommendations()
        } else if (recommendation.buildingCycleId) {
            $('#recommend-message').textContent = t('recommend.preparing')
        }
    } catch {
        state.mode = 'lite'
        $('#mode').textContent = t('mode.lite')
        if (!state.authors.length && state.records.length) deriveAuthors()
        renderAll()
    }
    if (state.recommendations.length) renderPreparedRecommendations()
    if (new URLSearchParams(location.search).get('view') === 'chronicle') {
        activeView = 'chronicle'
        $$('.view').forEach((view) =>
            view.classList.toggle('active', view.id === 'chronicle')
        )
        await loadChronicle()
    }
}

void detect().then(() => {
    setTimeout(() => void maybePromptForUpdate(), 1400)
})
