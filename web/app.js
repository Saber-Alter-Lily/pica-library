import {
    addLiteQueueItems,
    clearLiteState,
    emptyLiteState,
    importLibraryBundle,
    loadLiteState,
    saveLiteState
} from './lite-state.js'
import { deriveLiteAuthors } from './author-state.js'
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
    coversEnabled: localStorage.getItem('pica-covers-enabled') !== 'false',
    recommendationBatch: 0,
    stagedUpdate: null,
    ...emptyLiteState(),
    capabilities: null,
    libraryQueryResult: null,
    libraryQuery: { scope: 'all', tags: [], tagMode: 'all' },
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
    reader: { comicId: null, episodeId: null, pageIndex: 0, chapters: [] }
}
let desktop = null
let language = resolveLanguage(
    localStorage,
    navigator.languages || [navigator.language]
)
let downloadPoll = null
let downloadPollBusy = false
let activeView = 'home'
const t = (key, values) => translate(language, key, values)
const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]
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
    if (persist) {
        renderAll()
        void loadJobs()
    }
}

$('#language-select').onchange = (event) =>
    applyLanguage(event.target.value, true)
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

const mutate = (path, method, value = {}) =>
    api(path, {
        method,
        headers: {
            'content-type': 'application/json',
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
    activeView = id
    $$('.view').forEach((view) =>
        view.classList.toggle('active', view.id === id)
    )
    $$('nav button').forEach((item) =>
        item.classList.toggle('active', item.dataset.view === id)
    )
}

async function chooseFolder(prefix) {
    const value = await desktopPost('/api/v1/desktop/choose-folder')
    if (value.path) $(`#${prefix}-directory`).value = value.path
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
        renderTimestamps()
        if (!desktop.configured) {
            document.body.classList.add('onboarding')
            document.querySelector('nav').hidden = true
            activateView('setup')
        }
    } catch {
        desktop = null
    }
}

const updatePhaseText = {
    validating: '校验更新包',
    extracting: '解压到临时目录',
    staged: '已完成校验与暂存',
    'preparing-backup': '准备备份',
    'waiting-for-exit': '等待应用退出',
    'replacing-files': '替换文件',
    starting: '启动新版本',
    'health-check': '检查运行状态',
    complete: '完成',
    rollback: '更新失败，正在回滚',
    failed: '更新失败'
}

function renderUpdateProgress(progress) {
    const panel = $('#update-progress')
    if (!progress || progress.phase === 'idle') {
        panel.hidden = true
        return
    }
    panel.hidden = false
    $('#update-progress-phase').textContent =
        updatePhaseText[progress.phase] || progress.phase
    const bar = $('#update-progress-bar')
    if (progress.total > 0) {
        bar.max = progress.total
        bar.value = progress.current || 0
    } else {
        bar.removeAttribute('value')
    }
}

async function stageUpdateFile(file) {
    if (!desktop) throw new Error('更新仅在本地 Windows 版中可用')
    if (!file || !file.name.toLowerCase().endsWith('.zip'))
        throw new Error('请选择 ZIP 更新包')
    const message = $('#update-message')
    message.textContent = '正在校验更新包…'
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
    if (!response.ok) throw new Error(value.error || '更新包校验失败')
    state.stagedUpdate = value
    const summary = $('#update-summary')
    summary.hidden = false
    summary.innerHTML = `<strong>${escapeHtml(value.targetVersion)}</strong><br>${Number(value.fileCount)} 个变更文件 · ${Number(value.deletionCount)} 个删除项<br>数据库架构 v${Number(value.databaseSchemaVersion)}${value.requiresFullInstall ? '<br><strong>此更新需要完整安装包。</strong>' : ''}`
    $('#update-apply').hidden = Boolean(value.requiresFullInstall)
    message.textContent = value.requiresFullInstall
        ? '此更新需要完整安装包。请打开 GitHub Release。'
        : '更新包已验证并暂存。确认后可更新并重启。'
    renderUpdateProgress({
        phase: 'staged',
        current: value.fileCount,
        total: value.fileCount
    })
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
$('#update-check').onclick = () => {
    window.open(
        'https://github.com/Saber-Alter-Lily/pica-library/releases',
        '_blank',
        'noopener,noreferrer'
    )
}
$('#update-apply').onclick = async () => {
    if (!state.stagedUpdate) return
    if (
        !window.confirm(
            `确认更新到 ${state.stagedUpdate.targetVersion} 并重启？`
        )
    )
        return
    try {
        await desktopPost('/api/v1/update/apply', { id: state.stagedUpdate.id })
        $('#update-message').textContent = '应用即将退出并完成更新，请稍候…'
        renderUpdateProgress({ phase: 'waiting-for-exit' })
    } catch (error) {
        $('#update-message').textContent = localizeError(language, error)
        renderUpdateProgress({ phase: 'failed' })
    }
}

function displayDate(value) {
    if (!value) return '尚无记录'
    const date = new Date(value)
    return Number.isNaN(date.valueOf()) ? '尚无记录' : date.toLocaleString()
}

function renderTimestamps() {
    const syncedAt = desktop?.lastSync?.finishedAt ?? state.sourceSyncedAt
    const exportedAt = desktop?.lastExportAt ?? state.generatedAt
    $('#last-sync').textContent = `上次同步：${displayDate(syncedAt)}`
    $('#browser-lite-timestamps').textContent =
        `最近同步：${displayDate(syncedAt)} / 最近导出：${displayDate(exportedAt)}`
    $('#lite-snapshot-bar').hidden =
        state.mode !== 'lite' || state.records.length === 0
    $('#lite-snapshot-time').textContent =
        `当前数据包生成时间：${displayDate(state.generatedAt)}`
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
    const message = $(`#${prefix}-message`)
    message.textContent = t('message.testing')
    try {
        await desktopPost('/api/v1/desktop/test-connection', setupValue(prefix))
        message.textContent = t('message.connectionSuccess')
        if (prefix === 'setup') $('#setup-next-step').hidden = false
    } catch (error) {
        message.textContent = localizeError(language, error)
    }
}

$('#setup-folder').onclick = () => chooseFolder('setup')
$('#settings-folder').onclick = () => chooseFolder('settings')
$('#setup-test').onclick = () => testDesktop('setup')
$('#settings-test').onclick = () => testDesktop('settings')
$('#setup-form').onsubmit = async (event) => {
    event.preventDefault()
    const message = $('#setup-message')
    try {
        await desktopPost('/api/v1/desktop/settings', setupValue('setup'))
        message.textContent = t('message.savedOpening')
        await waitForDesktopHealth()
        await loadDesktop()
        $('#setup-next-step').hidden = false
        message.textContent = '设置已应用。下一步请同步收藏。'
    } catch (error) {
        message.textContent = localizeError(language, error)
    }
}
$('#settings-form').onsubmit = async (event) => {
    event.preventDefault()
    const message = $('#settings-message')
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
}
$('#open-data').onclick = () =>
    desktopPost('/api/v1/desktop/open-directory', { kind: 'data' })
$('#open-logs').onclick = () =>
    desktopPost('/api/v1/desktop/open-directory', { kind: 'logs' })
$('#export-browser-lite').onclick = async () => {
    const message = $('#browser-lite-export-message')
    message.textContent = t('message.browserLiteExporting')
    try {
        const result = await desktopPost('/api/v1/desktop/export-browser-lite')
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
}
$('#sync-export-browser-lite').onclick = async () => {
    const message = $('#browser-lite-export-message')
    message.textContent = '正在同步收藏并生成 Browser Lite 数据包…'
    const phases = {
        'sync-favorites': '同步收藏',
        'update-library': '更新漫画库',
        'prepare-recommendations': '准备推荐',
        'generate-bundle': '生成数据包',
        'choose-save-location': '等待选择保存位置',
        'write-file': '写入文件',
        complete: '完成'
    }
    const progressTimer = setInterval(async () => {
        try {
            const status = await api('/api/v1/desktop/status')
            const phase = status.browserLiteExportProgress?.phase
            setProgress(
                $('#download-operation'),
                phases[phase] || '正在准备…',
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
            message.textContent = '已取消导出。'
            return
        }
        message.textContent = '收藏同步完成，Browser Lite 数据包已导出。'
        $('#open-browser-lite-export').hidden = false
        desktop.lastSync = { finishedAt: result.sourceSyncedAt }
        desktop.lastExportAt = result.generatedAt
        renderTimestamps()
    } catch (error) {
        message.textContent = localizeError(language, error)
    } finally {
        clearInterval(progressTimer)
        clearProgress($('#download-operation'))
    }
}
$('#open-browser-lite-export').onclick = () =>
    desktopPost('/api/v1/desktop/open-directory', {
        kind: 'browser-lite-export'
    })
$('#open-browser-lite').onclick = () =>
    desktopPost('/api/v1/desktop/open-browser-lite')
$('#detect-proxy').onclick = async () => {
    try {
        const result = await desktopPost(
            '/api/v1/desktop/detect-proxy',
            setupValue('setup')
        )
        $('#setup-message').textContent = result.candidates?.length
            ? `Detected ${result.candidates.map((item) => item.url).join(', ')}`
            : 'No local proxy detected.'
        if (result.candidates?.[0] && !result.candidates[0].url.includes('***'))
            $('#setup-proxy').value = result.candidates[0].url
    } catch (error) {
        $('#setup-message').textContent = localizeError(language, error)
    }
}
$('#settings-detect-proxy').onclick = async () => {
    const message = $('#settings-message')
    try {
        const value = setupValue('settings')
        if (!value.account) delete value.account
        if (!value.password) delete value.password
        const result = await desktopPost('/api/v1/desktop/detect-proxy', value)
        const usable = result.candidates?.find((item) => item.usable)
        message.textContent = usable
            ? `已检测到可用代理：${usable.url}`
            : result.candidates?.length
              ? '检测到本地代理服务，但尚未找到可用于连接 Pica 的代理。'
              : '未检测到可用的本地代理。'
        if (usable && !usable.url.includes('***'))
            $('#settings-proxy').value = usable.url
    } catch (error) {
        message.textContent = localizeError(language, error)
    }
}
$('#exit-app').onclick = async () => {
    await desktopPost('/api/v1/desktop/shutdown')
    document.body.innerHTML = `<main><article class="notice"><strong>${t('message.stopped')}</strong><p>${t('message.closeTab')}</p></article></main>`
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
              : $('#downloaded-grid-items')
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
                ? `<img src="${escapeHtml(coverSource(comic))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove();this.parentElement.classList.add('cover-missing')" />`
                : ''
        }
        <span aria-hidden="true">P</span>
    </div>`
    $('#comic-grid').innerHTML = page
        .map(
            (comic) => `<article class="comic-card">
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
                </div>
            </article>`
        )
        .join('')
    $('#comic-rows').innerHTML = page
        .map(
            (comic) => `<tr>
                <td><input type="checkbox" data-selection-context="library" data-comic-id="${escapeHtml(comic.comicId)}" ${state.selections.library.has(comic.comicId) ? 'checked' : ''} /></td>
                <td><strong>${escapeHtml(comic.title)}</strong></td>
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
    $('#library-count').textContent = t('message.libraryCount', {
        shown: page.length,
        total: state.libraryQueryResult?.total ?? state.visible.length
    })
    $('#load-more').hidden = page.length >= state.visible.length
    setGridSize('library', state.libraryGridSize)
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

function renderResultCards(records, target, recommendation = false) {
    const tagFrequencies = buildTagFrequencyIndex(state.records)
    const context = recommendation ? 'recommendation' : 'search'
    $(target).innerHTML = (records || [])
        .map((item) => {
            const comic = item.comic || item
            return `<article class="result">
                <div class="cover-shell">
                    ${state.coversEnabled && (state.mode === 'connected' || trustedBrowserCoverUrl(comic.coverUrl)) ? `<img src="${escapeHtml(state.mode === 'connected' ? `/api/v1/covers/${encodeURIComponent(comic.comicId)}` : trustedBrowserCoverUrl(comic.coverUrl))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove();this.parentElement.classList.add('cover-missing')" />` : ''}
                    <span aria-hidden="true">P</span>
                </div>
                <div class="result-body"><h3>${escapeHtml(comic.title)}</h3>
                <label class="result-select"><input type="checkbox" data-selection-context="${context}" data-comic-id="${escapeHtml(comic.comicId)}" ${state.selections[context].has(comic.comicId) ? 'checked' : ''} /> 选择</label>
                <p>${escapeHtml(comic.canonicalAuthor || comic.author || t('common.unknownAuthor'))}</p>
                <div>${selectDisplayTags(comic, tagFrequencies)
                    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                    .join('')}</div>
                ${recommendation ? '' : `<p>${t('message.popularity', { likes: Number(comic.totalLikes || 0).toLocaleString(), views: Number(comic.totalViews || 0).toLocaleString() })}</p>`}
                <div class="detail-actions"><button data-result-detail="${escapeHtml(comic.comicId)}" data-result-context="${context}">详情 / 预览</button><button data-result-download="${escapeHtml(comic.comicId)}">${t('action.download')}</button>${state.mode === 'connected' && state.capabilities?.features?.providerFavoriteMutation ? `<button data-result-favorite="${escapeHtml(comic.comicId)}">加入 Pica 收藏</button>` : ''}</div>
                </div>
            </article>`
        })
        .join('')
}

function renderPreparedRecommendations() {
    $('#profile').innerHTML = ''
    const start = state.recommendationBatch * 12
    renderResultCards(
        state.recommendations.slice(start, start + 12),
        '#recommend-results',
        true
    )
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
    $('#recommend-next-batch').hidden = state.recommendations.length <= 12
    const batchCount = Math.max(1, Math.ceil(state.recommendations.length / 12))
    $('#recommend-batch').textContent =
        state.recommendations.length > 0
            ? `推荐会话 ${state.recommendationSessionNo} · ${t(
                  'message.recommendationBatch',
                  {
                      current: state.recommendationBatch + 1,
                      total: batchCount
                  }
              )}`
            : ''
    $('#recommend-selection-status').textContent =
        `已选择 ${state.selections.recommendation.size} 部`
    setGridSize('recommendation', state.recommendationGridSize)
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
        target.textContent = `已选择 ${state.selections[context].size} 部`
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
    if (query.scope && query.scope !== 'all')
        chips.push({
            key: 'scope',
            label: query.scope === 'favorites' ? 'Pica 收藏' : '已下载'
        })
    if (query.text) chips.push({ key: 'text', label: `搜索：${query.text}` })
    for (const authorId of query.authorIds || []) {
        const label =
            result.facets.authors.find((item) => item.value === authorId)
                ?.label || authorId
        chips.push({ key: 'author', label: `作者：${label}` })
    }
    for (const tag of query.tags || [])
        chips.push({ key: `tag:${tag}`, label: `标签：${tag}` })
    $('#filter-chips').innerHTML = chips
        .map(
            (chip) =>
                `<button class="filter-chip" data-filter-remove="${escapeHtml(chip.key)}">${escapeHtml(chip.label)} ×</button>`
        )
        .join('')
    if (chips.length)
        $('#filter-chips').insertAdjacentHTML(
            'beforeend',
            '<button class="filter-chip" data-filter-remove="all">清除全部</button>'
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
        $('#filter-scope').value = 'all'
        $('#filter-text').value = ''
        $('#filter-author-input').value = ''
        $('#filter-tag').value = ''
    } else if (key === 'scope') $('#filter-scope').value = 'all'
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
            '<article class="notice">书架需要本地 Windows 引擎。</article>'
        return
    }
    state.shelves = await api('/api/v1/shelves')
    $('#shelf-list').innerHTML =
        state.shelves
            .map(
                (shelf) =>
                    `<button class="shelf-card" data-shelf-open="${escapeHtml(shelf.id)}"><strong>${escapeHtml(shelf.name)}</strong><span>${Number(shelf.count)} 部</span></button>`
            )
            .join('') || '<article class="notice">还没有书架。</article>'
    $('#shelf-dialog-select').innerHTML = state.shelves
        .map(
            (shelf) =>
                `<option value="${escapeHtml(shelf.id)}">${escapeHtml(shelf.name)} · ${Number(shelf.count)} 部</option>`
        )
        .join('')
}

async function openShelf(shelfId) {
    const value = await api(`/api/v1/shelves/${encodeURIComponent(shelfId)}`)
    state.activeShelfId = shelfId
    const shelf = value.shelf
    if (!shelf) throw new Error('书架不存在')
    $('#shelf-detail').innerHTML =
        `<div class="page-heading"><div><h3>${escapeHtml(shelf.name)}</h3><p>${Number(value.items.length)} 部漫画</p></div><div class="actions"><button data-shelf-rename="${escapeHtml(shelf.id)}">重命名</button><button data-shelf-delete="${escapeHtml(shelf.id)}">删除书架</button></div></div><div class="comic-grid">${value.items
            .map(
                (comic) =>
                    `<article class="comic-card"><div class="comic-card-body"><label><input type="checkbox" data-selection-context="shelf" data-comic-id="${escapeHtml(comic.comicId)}" ${state.selections.shelf.has(comic.comicId) ? 'checked' : ''}/> 选择</label><h3>${escapeHtml(comic.title)}</h3><p>${escapeHtml(comic.canonicalAuthor || comic.author)}</p><div class="actions">${comic.downloadedPictures > 0 ? `<button data-shelf-read="${escapeHtml(comic.comicId)}">阅读</button>` : `<button data-shelf-download="${escapeHtml(comic.comicId)}">下载</button>`}</div></div></article>`
            )
            .join(
                ''
            )}</div><div class="actions"><button data-shelf-remove-selected="${escapeHtml(shelf.id)}">移出所选漫画</button></div>`
}

let pendingShelfAction = null
async function chooseShelf(count, action) {
    await loadShelves()
    if (!state.shelves.length) {
        const name = window.prompt('先创建一个书架：')
        if (!name) return
        await post('/api/v1/shelves', { name })
        await loadShelves()
    }
    pendingShelfAction = action
    $('#shelf-dialog-count').textContent = `将 ${count} 部漫画加入所选书架。`
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
            $('#job-list').innerHTML =
                state.queue
                    .map(
                        (job) =>
                            `<article class="list-item"><div class="grow"><strong>${escapeHtml(job.comicId)}</strong><p>${escapeHtml(job.source || 'library')} · ${t('message.litePlan')}</p></div></article>`
                    )
                    .join('') ||
                `<article class="notice">${t('message.emptyPlan')}</article>`
            return
        }
        const jobs = await api('/api/v1/downloads')
        const counts = {
            RUNNING: 0,
            PREPARING: 0,
            QUEUED: 0,
            RETRY_WAIT: 0,
            PAUSED: 0,
            FAILED: 0,
            COMPLETED: 0
        }
        jobs.forEach((job) => {
            if (counts[job.status] !== undefined) counts[job.status] += 1
        })
        $('#download-summary').innerHTML = [
            [t('downloads.inProgress'), counts.RUNNING + counts.PREPARING],
            [t('downloads.waiting'), counts.QUEUED + counts.RETRY_WAIT],
            [t('downloads.paused'), counts.PAUSED],
            [t('downloads.failed'), counts.FAILED],
            [t('downloads.completed'), counts.COMPLETED]
        ]
            .map(
                ([label, count]) =>
                    `<div class="metric"><span>${label}</span><strong>${count}</strong></div>`
            )
            .join('')
        $('#job-list').innerHTML =
            jobs
                .map((job) => {
                    const percent = job.progressTotal
                        ? Math.round(
                              (job.progressCompleted / job.progressTotal) * 100
                          )
                        : 0
                    const title =
                        job.comicTitle || t('downloads.placeholderTitle')
                    const chapter =
                        job.chapterTitle || t('downloads.placeholderChapter')
                    const speed = job.bytesPerSecond
                        ? `${formatBytes(job.bytesPerSecond)}/s`
                        : '—'
                    const eta =
                        job.bytesPerSecond && job.expectedBytes > job.bytes
                            ? `${Math.ceil((job.expectedBytes - job.bytes) / job.bytesPerSecond)}s`
                            : '—'
                    return `<article class="list-item download-job-card" data-job-status="${job.status}">
                    <div class="grow"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(chapter)} · ${escapeHtml(t(`status.${job.status}`))}</p><p>${t('message.pictures', { count: `${job.progressCompleted} / ${job.progressTotal || '—'}` })} · ${percent}% · ${formatBytes(job.bytes)}${job.expectedBytes ? ` / ${formatBytes(job.expectedBytes)}` : ''}</p><div class="progress"><span style="width:${percent}%"></span></div><p>${speed} · ${t('message.elapsed', { value: formatElapsed(job.startedAt) })} · ETA ${eta} · ${t('message.retryCount', { count: job.retryCount })}${job.error ? ` · ${escapeHtml(localizeError(language, job.error))}` : ''}</p></div>
                    <div class="actions">${['QUEUED', 'PREPARING', 'RUNNING'].includes(job.status) ? `<button data-job-action="pause" data-job-id="${job.id}">${t('action.pause')}</button>` : ''}${job.status === 'PAUSED' ? `<button data-job-action="resume" data-job-id="${job.id}">${t('action.resume')}</button>` : ''}${job.status === 'FAILED' ? `<button data-job-action="retry" data-job-id="${job.id}">${t('action.retry')}</button>` : ''}${!['COMPLETED', 'CANCELLED'].includes(job.status) ? `<button data-job-action="cancel" data-job-id="${job.id}">${t('action.cancel')}</button>` : ''}</div>
                </article>`
                })
                .join('') ||
            `<article class="notice">${t('message.emptyQueue')}</article>`
        if (
            jobs.some((job) =>
                ['QUEUED', 'PREPARING', 'RUNNING', 'RETRY_WAIT'].includes(
                    job.status
                )
            )
        ) {
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
        $('#preview-cache-stats').textContent =
            `当前占用：${formatBytes(value.bytes)} · 最大缓存：${formatBytes(value.maxBytes)} · 自动保留约 ${Math.round(value.ttlMs / 86400000)} 天`
    } catch (error) {
        $('#preview-cache-stats').textContent = localizeError(language, error)
    }
}

$('#preview-cache-clear').onclick = async () => {
    try {
        await post('/api/v1/previews/cache/clear', {})
        await loadPreviewCacheStats()
    } catch (error) {
        $('#preview-cache-stats').textContent = localizeError(language, error)
    }
}

function recommendationRecord(comicId, context) {
    const source =
        context === 'search' ? state.searchResults : state.recommendations
    const item = source.find(
        (candidate) => (candidate.comic || candidate).comicId === comicId
    )
    return item?.comic || item
}

function openRecommendationDetail(comicId, context = 'recommendation') {
    const comic = recommendationRecord(comicId, context)
    if (!comic) return
    const dialog = $('#recommend-detail-dialog')
    dialog.dataset.comicId = comicId
    dialog.dataset.context = context
    dialog.dataset.previewOffset = '0'
    $('#recommend-preview').innerHTML = ''
    $('#recommend-preview-message').textContent = ''
    $('#recommend-detail-content').innerHTML =
        `<h2>${escapeHtml(comic.title)}</h2><p><strong>${escapeHtml(comic.canonicalAuthor || comic.author || t('common.unknownAuthor'))}</strong></p><p>${escapeHtml(comic.description || '')}</p><div>${(comic.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div><p>${comic.finished ? '完结' : '连载或状态未知'} · 爱心 ${Number(comic.totalLikes || 0).toLocaleString()}</p><div class="detail-actions"><button data-detail-preview="true" class="primary">预览前几页</button><button data-detail-shelf="true">加入书架</button>${state.capabilities?.features?.providerFavoriteMutation ? '<button data-detail-favorite="true">加入 Pica 收藏</button>' : ''}<button data-detail-download="true">下载</button></div>`
    dialog.showModal()
}

async function loadRecommendationPreview(offset = 0) {
    const dialog = $('#recommend-detail-dialog')
    const comicId = dialog.dataset.comicId
    const message = $('#recommend-preview-message')
    message.textContent = '正在准备预览…'
    try {
        const value = await post('/api/v1/previews/prepare', {
            comicId,
            offset,
            count: 3
        })
        if (!value.pages.length) {
            message.textContent = '此漫画当前没有可用预览页。'
            return
        }
        dialog.dataset.previewOffset = String(offset + value.pages.length)
        $('#recommend-preview').insertAdjacentHTML(
            'beforeend',
            value.pages
                .map(
                    (page) =>
                        `<img src="${escapeHtml(page.url)}" alt="预览第 ${page.index + 1} 页" loading="lazy" />`
                )
                .join('')
        )
        message.innerHTML = `正在预览：${escapeHtml(value.episodeTitle || '首个可读章节')} · 已加载 ${offset + value.pages.length} 页${value.hasMore ? ' <button data-detail-preview-more="true">再加载 3 页</button>' : ''}`
        await loadPreviewCacheStats()
    } catch (error) {
        message.textContent = localizeError(language, error)
    }
}

$('#recommend-detail-close').onclick = () =>
    $('#recommend-detail-dialog').close()
$('#recommend-detail-dialog').onclick = async (event) => {
    const dialog = $('#recommend-detail-dialog')
    const comicId = dialog.dataset.comicId
    if (event.target.dataset.detailPreview) await loadRecommendationPreview(0)
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
            event.target.textContent = '★ 已收藏'
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

let readerObserver = null
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
    target.className = `reader-pages reader-${mode} direction-${direction} fit-${fit}`
    target.innerHTML = pages
        .map(
            (page, index) =>
                `<img src="${escapeHtml(page.url)}" data-reader-page="${mode === 'vertical' ? index : reader.pageIndex + index}" alt="第 ${(mode === 'vertical' ? index : reader.pageIndex + index) + 1} 页" />`
        )
        .join('')
    if (readerObserver) readerObserver.disconnect()
    if (mode === 'vertical') {
        readerObserver = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort(
                        (a, b) => b.intersectionRatio - a.intersectionRatio
                    )[0]
                if (visible)
                    void saveReaderProgress(
                        Number(visible.target.dataset.readerPage)
                    )
            },
            { threshold: [0.6] }
        )
        $$('[data-reader-page]').forEach((image) =>
            readerObserver.observe(image)
        )
    } else void saveReaderProgress(reader.pageIndex)
}

async function saveReaderProgress(pageIndex) {
    if (
        pageIndex === state.reader.pageIndex &&
        state.reader.progressSaved === pageIndex
    )
        return
    state.reader.pageIndex = pageIndex
    state.reader.progressSaved = pageIndex
    try {
        await post('/api/v1/reader/progress', {
            comicId: state.reader.comicId,
            episodeId: state.reader.episodeId,
            pageIndex
        })
    } catch {
        // Reader remains usable if progress persistence briefly fails.
    }
}

async function openReaderChapter(episodeId) {
    const chapter = await api(
        `/api/v1/reader/comics/${encodeURIComponent(state.reader.comicId)}/chapters/${encodeURIComponent(episodeId)}`
    )
    state.reader.episodeId = episodeId
    state.reader.chapter = chapter
    state.reader.pageIndex = Math.min(
        chapter.progress?.pageIndex || 0,
        Math.max(0, chapter.pages.length - 1)
    )
    state.reader.progressSaved = null
    $('#reader-chapter-title').textContent =
        `${chapter.episode.title} · ${chapter.pages.length} 页`
    renderReaderPages()
}

async function openReaderComic(comicId) {
    try {
        const [chapters, recentProgress] = await Promise.all([
            api(
                `/api/v1/reader/comics/${encodeURIComponent(comicId)}/chapters`
            ),
            api('/api/v1/reader/progress')
        ])
        const readable = chapters.filter((item) => item.downloadedPictures > 0)
        if (!readable.length) throw new Error('该漫画尚无已下载章节。')
        const resume = recentProgress.find(
            (item) =>
                item.comicId === comicId &&
                readable.some((chapter) => chapter.id === item.episodeId)
        )
        state.reader = {
            comicId,
            episodeId: null,
            pageIndex: 0,
            chapters,
            chapter: null
        }
        const comic = state.records.find((item) => item.comicId === comicId)
        $('#reader-title').textContent = comic?.title || '阅读'
        $('#reader-chapters').innerHTML = chapters
            .map(
                (chapter) =>
                    `<button data-reader-episode="${escapeHtml(chapter.id)}" ${chapter.downloadedPictures ? '' : 'disabled'}>${escapeHtml(chapter.title)} · ${chapter.downloadedPictures}/${chapter.knownPictures}</button>`
            )
            .join('')
        activateView('reader')
        document.body.classList.add('reader-active')
        await openReaderChapter(resume?.episodeId || readable[0].id)
    } catch (error) {
        $('#reader-message').textContent = localizeError(language, error)
    }
}

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
$('#reader-mode').onchange = renderReaderPages
$('#reader-direction').onchange = renderReaderPages
$('#reader-fit').onchange = renderReaderPages
$('#reader-fullscreen').onclick = () =>
    document.fullscreenElement
        ? document.exitFullscreen()
        : $('#reader').requestFullscreen()
$('#reader-export-cbz').onclick = async () => {
    try {
        const value = await post('/api/v1/reader/export-cbz', {
            comicId: state.reader.comicId,
            episodeId: state.reader.episodeId
        })
        const name = value.path.split(/[\\/]/).pop()
        $('#reader-message').textContent =
            `已导出 ${name} · ${value.pages} 页 · ${formatBytes(value.bytes)}`
        if (window.confirm('CBZ 已导出。用系统默认阅读器打开？'))
            await post('/api/v1/reader/open-default', { path: value.path })
    } catch (error) {
        $('#reader-message').textContent = localizeError(language, error)
    }
}
document.addEventListener('keydown', (event) => {
    if (activeView !== 'reader') return
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') moveReader(-1)
    if (event.key === 'ArrowRight' || event.key === 'PageDown') moveReader(1)
    if (event.key === 'Escape' && !document.fullscreenElement) {
        document.body.classList.remove('reader-active')
        activateView('downloaded')
    }
})

async function loadDownloaded() {
    if (state.mode === 'lite') return
    const records = await api('/api/v1/downloaded')
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
                    `<article class="comic-card"><div class="cover-shell">${coverSource(comic) ? `<img src="${coverSource(comic)}" loading="lazy" alt="" />` : ''}<span aria-hidden="true">P</span></div><div class="comic-card-body"><h3>${escapeHtml(comic.title)}</h3><p>${escapeHtml(comic.canonicalAuthor || comic.author)}</p><p>${comic.status === 'complete' ? t('downloaded.complete') : t('downloaded.partial')}</p><p>${t('downloaded.chapters', { downloaded: comic.downloadedChapters, known: comic.knownChapters || '—' })} · ${t('message.pictures', { count: comic.downloadedPictures })} · ${formatBytes(comic.localBytes)}</p><button data-read-comic="${escapeHtml(comic.comicId)}">阅读</button></div></article>`
            )
            .join('') ||
        `<article class="notice">${t('downloaded.empty')}</article>`
    $('#downloaded-rows').innerHTML = records
        .map(
            (comic) =>
                `<tr><td>${escapeHtml(comic.title)}<br><button data-read-comic="${escapeHtml(comic.comicId)}">阅读</button></td><td>${escapeHtml(comic.canonicalAuthor || comic.author)}</td><td>${comic.status === 'complete' ? t('downloaded.complete') : t('downloaded.partial')}</td><td>${comic.downloadedChapters}/${comic.knownChapters || '—'}</td><td>${comic.downloadedPictures}</td><td>${formatBytes(comic.localBytes)}</td><td>${escapeHtml(comic.lastDownloadedAt || '—')}</td></tr>`
        )
        .join('')
    setGridSize('downloaded', state.downloadedGridSize)
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
    renderSummary(summary)
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
        activeView = id
        $$('.view').forEach((view) =>
            view.classList.toggle('active', view.id === id)
        )
        $$('nav button').forEach((item) =>
            item.classList.toggle('active', item.dataset.view === id)
        )
        if (id === 'downloads') loadJobs()
        else if (downloadPoll) {
            clearInterval(downloadPoll)
            downloadPoll = null
        }
        if (id === 'downloaded') void loadDownloaded()
        if (id === 'shelves') void loadShelves()
        if (id === 'settings') void loadPreviewCacheStats()
        document.body.classList.toggle('reader-active', id === 'reader')
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
}
$('#downloaded-list').onclick = () => {
    state.downloadedView = 'list'
    localStorage.setItem('pica-downloaded-view', 'list')
    $('#downloaded-grid-items').hidden = true
    $('#downloaded-table').hidden = false
}
$('#cover-toggle').onchange = (event) => {
    state.coversEnabled = event.target.checked
    localStorage.setItem('pica-covers-enabled', String(state.coversEnabled))
    renderAll()
}
$('#recommend-next-batch').onclick = async () => {
    if ((state.recommendationBatch + 1) * 12 < state.recommendations.length) {
        state.recommendationBatch += 1
        renderPreparedRecommendations()
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
        $('#recommend-message').textContent =
            '当前离线数据中的推荐已经看完。重新同步并导出 Browser Lite 数据包可获得新的推荐。'
        return
    }
    try {
        const value = await post('/api/v1/recommendation-sessions', {})
        state.profile = value.profile
        state.recommendations = value.recommendations
        state.recommendationSessionNo = value.sessionNo
        state.recommendationExhausted = value.exhausted
        state.recommendationBatch = 0
        clearSelection('recommendation')
        renderPreparedRecommendations()
        if (value.exhausted) $('#recommend-message').textContent = value.message
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
    const file = $('#import-file').files[0]
    if (!file) return
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
    }
}
$('#import-button').onclick = importSelectedFile
$('#import-file').onchange = importSelectedFile
$('#onboarding-import').onclick = () => $('#import-file').click()
$('#lite-reimport').onclick = () => $('#import-file').click()
async function syncFavorites(message = $('#import-result')) {
    try {
        if (state.mode !== 'connected')
            throw new Error(t('message.syncNeedsEngine'))
        message.textContent = t('message.syncReading')
        setProgress($('#library-operation'), t('message.syncReading'), 0, 0)
        let progressTimer = setInterval(async () => {
            try {
                const progress = await api('/api/v1/sync/progress')
                if (progress.phase === 'reading') {
                    const text = progress.page
                        ? t('message.syncReadingPage', {
                              page: progress.page,
                              pages: progress.pages,
                              fetched: progress.fetched,
                              totalText: progress.total
                                  ? ` / ${progress.total}`
                                  : ''
                          })
                        : t('message.syncReading')
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
            result = await post('/api/v1/sync', {})
        } finally {
            clearInterval(progressTimer)
            progressTimer = null
        }
        desktop.lastSync = result.lastSync
        message.textContent = `${t('message.syncSummary', {
            favorites: result.favoriteCount,
            added: result.addedFavorites,
            removed: result.removedFavorites,
            inserted: result.libraryInserted,
            updated: result.libraryUpdated
        })} ${t('message.syncOtherRecords')}`
        clearProgress($('#library-operation'))
        await detect()
    } catch (error) {
        clearProgress($('#library-operation'))
        message.textContent = localizeError(language, error)
    }
}
$('#sync-button').onclick = () => syncFavorites()
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
            !window.confirm(
                `将 ${total} 部漫画加入书架“${shelf?.name || ''}”？`
            )
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
    const name = window.prompt('书架名称：')
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
        const name = window.prompt('新的书架名称：')
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
        if (!window.confirm('删除书架？漫画、下载和 Pica 收藏不会被删除。'))
            return
        await mutate(
            `/api/v1/shelves/${encodeURIComponent(removeShelf)}`,
            'DELETE'
        )
        state.activeShelfId = null
        $('#shelf-detail').innerHTML =
            '<article class="notice">书架已删除；漫画和下载仍然保留。</article>'
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
    try {
        if (state.mode !== 'connected')
            throw new Error(t('message.searchNeedsEngine'))
        const records = await post('/api/v1/search', {
            keyword: $('#search-keyword').value,
            tags: splitList($('#search-tags').value),
            sort: $('#search-sort').value,
            limit: 100
        })
        state.searchResults = records
        clearSelection('search')
        renderResultCards(records, '#search-results')
        $('#search-message').textContent = t('message.searchCount', {
            count: records.length
        })
    } catch (error) {
        $('#search-message').textContent = localizeError(language, error)
    }
}
$('#recommend-button').onclick = async () => {
    try {
        if (state.mode === 'connected') {
            const value = await post('/api/v1/recommendation-sessions', {})
            state.profile = value.profile
            state.recommendations = value.recommendations
            state.recommendationSessionNo = value.sessionNo
            state.recommendationExhausted = value.exhausted
            state.recommendationBatch = 0
            clearSelection('recommendation')
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
    }
}
$('#recommend-restart').onclick = async () => {
    if (!window.confirm('清除本轮已看记录并重新开始推荐？')) return
    try {
        const value = await post('/api/v1/recommendation-sessions', {
            action: 'restart'
        })
        state.profile = value.profile
        state.recommendations = value.recommendations
        state.recommendationSessionNo = value.sessionNo
        state.recommendationExhausted = value.exhausted
        state.recommendationBatch = 0
        clearSelection('recommendation')
        renderPreparedRecommendations()
    } catch (error) {
        $('#recommend-message').textContent = localizeError(language, error)
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
        const favoriteId = event.target.dataset.resultFavorite
        if (favoriteId) {
            try {
                await mutate(
                    `/api/v1/provider/favorites/${encodeURIComponent(favoriteId)}`,
                    'PUT'
                )
                event.target.textContent = '★ 已收藏'
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
$('#refresh-jobs').onclick = loadJobs
$('#performance-profile').onchange = () => {
    $('#custom-performance').hidden =
        $('#performance-profile').value !== 'custom'
}
$('#run-jobs').onclick = async () => {
    if (state.mode === 'lite') {
        downloadJson('download-plan.json', portablePlan())
        return
    }
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
}
$('#job-list').onclick = async (event) => {
    if (!event.target.dataset.jobAction || state.mode !== 'connected') return
    if (event.target.dataset.jobAction === 'cancel') {
        const job = await api('/api/v1/downloads').then((jobs) =>
            jobs.find((item) => item.id === event.target.dataset.jobId)
        )
        if (
            job &&
            !window.confirm(
                t('downloads.cancelConfirm', {
                    completed: job.progressCompleted,
                    total: job.progressTotal || '—'
                })
            )
        )
            return
    }
    await post(
        `/api/v1/downloads/${event.target.dataset.jobId}/${event.target.dataset.jobAction}`,
        {}
    )
    await loadJobs()
}
$('#check-updates').onclick = async () => {
    try {
        $('#update-result').textContent = JSON.stringify(
            await post('/api/v1/maintenance/updates', {}),
            null,
            2
        )
    } catch (error) {
        $('#update-result').textContent = localizeError(language, error)
    }
}
$('#scan-repair').onclick = async () => {
    try {
        $('#repair-result').textContent = JSON.stringify(
            await post('/api/v1/maintenance/repair', {}),
            null,
            2
        )
    } catch (error) {
        $('#repair-result').textContent = localizeError(language, error)
    }
}
$('#run-health').onclick = async () => {
    $('#health-result').textContent = JSON.stringify(
        state.mode === 'connected'
            ? await api('/api/v1/status')
            : {
                  mode: 'lite',
                  records: state.records.length,
                  recommendations: state.recommendations.length,
                  queue: state.queue.length,
                  storage: 'IndexedDB'
              },
        null,
        2
    )
}
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
        $('#mode').textContent = t('mode.connected')
        state.records = await api('/api/v1/comics?limit=5000')
        state.authors = await api('/api/v1/authors')
        await loadLibraryQuery({
            scope: 'all',
            tags: [],
            tagMode: 'all',
            sort: $('#sort-mode').value,
            limit: 5000,
            offset: 0
        })
        renderAll(status.summary)
    } catch {
        state.mode = 'lite'
        $('#mode').textContent = t('mode.lite')
        if (!state.authors.length && state.records.length) deriveAuthors()
        renderAll()
    }
    if (state.recommendations.length) renderPreparedRecommendations()
}

detect()
