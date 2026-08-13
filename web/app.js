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
    libraryView: 'grid',
    recommendationView:
        localStorage.getItem('pica-recommendation-view') || 'grid',
    coversEnabled: localStorage.getItem('pica-covers-enabled') !== 'false',
    recommendationBatch: 0,
    ...emptyLiteState()
}
let desktop = null
let language = resolveLanguage(
    localStorage,
    navigator.languages || [navigator.language]
)
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
        $('#settings-nav').hidden = false
        $('#settings-version').textContent = `Pica Library ${desktop.version}`
        $('#settings-directory').value = desktop.libraryDirectory || ''
        $('#settings-profile').value = desktop.profile || 'balanced'
        $('#settings-proxy').value = desktop.proxyUrl || ''
        $('#setup-directory').value = desktop.libraryDirectory || ''
        if (!desktop.configured) {
            document.body.classList.add('onboarding')
            document.querySelector('nav').hidden = true
            activateView('setup')
        }
    } catch {
        desktop = null
    }
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
        location.assign('/')
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
    } catch (error) {
        message.textContent = String(error?.message || error).includes(
            'There is no library data to export yet'
        )
            ? t('message.browserLiteExportEmpty')
            : t('message.browserLiteExportFailed')
    }
}
$('#open-browser-lite-export').onclick = () =>
    desktopPost('/api/v1/desktop/open-directory', {
        kind: 'browser-lite-export'
    })
$('#open-browser-lite').onclick = () =>
    window.open(`${location.origin}/?mode=browser-lite`, '_blank', 'noopener')
$('#detect-proxy').onclick = async () => {
    try {
        const result = await desktopPost('/api/v1/desktop/detect-proxy')
        $('#setup-message').textContent = result.candidates?.length
            ? `Detected ${result.candidates.map((item) => item.url).join(', ')}`
            : 'No local proxy detected.'
        if (result.candidates?.[0])
            $('#setup-proxy').value = result.candidates[0].url
    } catch (error) {
        $('#setup-message').textContent = localizeError(language, error)
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

function renderComics(records = state.records) {
    const query = normalize($('#filter-text').value)
    const tags = splitList($('#filter-tag').value).map(normalize)
    const sort = $('#sort-mode').value
    state.visible = records.filter(
        (comic) =>
            (!query ||
                normalize(
                    [comic.title, comic.author, comic.canonicalAuthor].join(' ')
                ).includes(query)) &&
            tags.every((tag) => (comic.tags || []).map(normalize).includes(tag))
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
                    <label class="comic-select"><input type="checkbox" data-comic-id="${escapeHtml(comic.comicId)}" /> ${t('action.select')}</label>
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
                <td><input type="checkbox" data-comic-id="${escapeHtml(comic.comicId)}" /></td>
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
        total: state.visible.length
    })
    $('#load-more').hidden = page.length >= state.visible.length
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
    $(target).innerHTML = (records || [])
        .map((item) => {
            const comic = item.comic || item
            return `<article class="result">
                <div class="cover-shell">
                    ${state.coversEnabled && (state.mode === 'connected' || trustedBrowserCoverUrl(comic.coverUrl)) ? `<img src="${escapeHtml(state.mode === 'connected' ? `/api/v1/covers/${encodeURIComponent(comic.comicId)}` : trustedBrowserCoverUrl(comic.coverUrl))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove();this.parentElement.classList.add('cover-missing')" />` : ''}
                    <span aria-hidden="true">P</span>
                </div>
                <div class="result-body"><h3>${escapeHtml(comic.title)}</h3>
                <p>${escapeHtml(comic.canonicalAuthor || comic.author || t('common.unknownAuthor'))}</p>
                <div>${selectDisplayTags(comic, tagFrequencies)
                    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                    .join('')}</div>
                ${recommendation ? '' : `<p>${t('message.popularity', { likes: Number(comic.totalLikes || 0).toLocaleString(), views: Number(comic.totalViews || 0).toLocaleString() })}</p>`}
                <button data-result-download="${escapeHtml(comic.comicId)}">${t('action.download')}</button>
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

function selectedIds() {
    return $$('[data-comic-id]:checked').map((input) => input.dataset.comicId)
}

function portablePlan() {
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        comicIds: state.queue.map((item) => item.comicId)
    }
}

async function loadJobs() {
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
    $('#job-list').innerHTML =
        jobs
            .map((job) => {
                const percent = job.progressTotal
                    ? Math.round(
                          (job.progressCompleted / job.progressTotal) * 100
                      )
                    : 0
                return `<article class="list-item">
                    <div class="grow"><strong>${escapeHtml(job.comicId)}</strong><p>${escapeHtml(job.source)} · ${escapeHtml(job.runner)} · ${t(`status.${job.status}`)} · ${t('message.retryCount', { count: job.retryCount })}</p><div class="progress"><span style="width:${percent}%"></span></div><p>${job.progressCompleted}/${job.progressTotal} · ${t('message.bytes', { count: Number(job.bytes).toLocaleString() })}${job.error ? ` · ${escapeHtml(localizeError(language, job.error))}` : ''}</p></div>
                    <div class="actions">${['QUEUED', 'PREPARING', 'RUNNING'].includes(job.status) ? `<button data-job-action="pause" data-job-id="${job.id}">${t('action.pause')}</button>` : ''}${job.status === 'PAUSED' ? `<button data-job-action="resume" data-job-id="${job.id}">${t('action.resume')}</button>` : ''}${job.status === 'FAILED' ? `<button data-job-action="retry" data-job-id="${job.id}">${t('action.retry')}</button>` : ''}${!['COMPLETED', 'CANCELLED'].includes(job.status) ? `<button data-job-action="cancel" data-job-id="${job.id}">${t('action.cancel')}</button>` : ''}</div>
                </article>`
            })
            .join('') ||
        `<article class="notice">${t('message.emptyQueue')}</article>`
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
}

$$('nav [data-view], [data-go]').forEach((button) =>
    button.addEventListener('click', () => {
        const id = button.dataset.view || button.dataset.go
        $$('.view').forEach((view) =>
            view.classList.toggle('active', view.id === id)
        )
        $$('nav button').forEach((item) =>
            item.classList.toggle('active', item.dataset.view === id)
        )
        if (id === 'downloads') loadJobs()
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

$('#apply-filter').onclick = () => {
    state.libraryPage = 1
    renderComics()
}
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
$('#cover-toggle').onchange = (event) => {
    state.coversEnabled = event.target.checked
    localStorage.setItem('pica-covers-enabled', String(state.coversEnabled))
    renderAll()
}
$('#recommend-next-batch').onclick = () => {
    state.recommendationBatch =
        (state.recommendationBatch + 1) * 12 >= state.recommendations.length
            ? 0
            : state.recommendationBatch + 1
    renderPreparedRecommendations()
}
$('#pending-only').onchange = renderAuthors
async function importSelectedFile() {
    const file = $('#import-file').files[0]
    if (!file) return
    try {
        const text = await file.text()
        if (file.name.toLowerCase().endsWith('.csv')) {
            state.records = csvRecords(text)
            state.authors = []
            state.profile = null
            state.recommendations = []
            state.queue = []
        } else {
            replaceLiteState(importLibraryBundle(JSON.parse(text)))
        }
        if (state.mode === 'connected')
            await post('/api/v1/import', { records: state.records })
        if (!state.authors.length) deriveAuthors()
        await persistLiteState()
        renderAll()
        $('#import-result').textContent = t('message.imported', {
            records: state.records.length,
            recommendations: state.recommendations.length,
            plans: state.queue.length
        })
    } catch (error) {
        $('#import-result').textContent = localizeError(language, error)
    }
}
$('#import-button').onclick = importSelectedFile
$('#import-file').onchange = importSelectedFile
$('#onboarding-import').onclick = () => $('#import-file').click()
$('#sync-button').onclick = async () => {
    try {
        if (state.mode !== 'connected')
            throw new Error(t('message.syncNeedsEngine'))
        await post('/api/v1/sync', {})
        await detect()
    } catch (error) {
        $('#import-result').textContent = localizeError(language, error)
    }
}
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
            const value = await post('/api/v1/recommendations', {
                limit: 30
            })
            state.profile = value.profile
            state.recommendations = value.recommendations
        }
        if (!state.recommendations.length)
            throw new Error(t('message.recommendNeedsData'))
        renderPreparedRecommendations()
    } catch (error) {
        $('#recommend-message').textContent = localizeError(language, error)
    }
}
;['#search-results', '#recommend-results'].forEach((selector) => {
    $(selector).onclick = (event) => {
        const comicId = event.target.dataset.resultDownload
        if (comicId)
            enqueue(
                [comicId],
                selector.includes('recommend') ? 'recommendation' : 'search'
            )
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
        state.records = await api('/api/v1/comics')
        state.authors = await api('/api/v1/authors')
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
