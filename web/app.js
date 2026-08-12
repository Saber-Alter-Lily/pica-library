import {
    addLiteQueueItems,
    clearLiteState,
    emptyLiteState,
    importLibraryBundle,
    loadLiteState,
    saveLiteState
} from './lite-state.js'
import {
    LIBRARY_PAGE_SIZE,
    selectDisplayTags,
    visibleLibraryPage
} from './lite-state.js'

const state = {
    mode: 'lite',
    visible: [],
    libraryPage: 1,
    libraryView: 'grid',
    ...emptyLiteState()
}
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
    const groups = new Map()
    for (const comic of state.records) {
        const raw = String(
            comic.canonicalAuthor || comic.author || '未知作者'
        ).trim()
        const match = raw.match(/^(.+?)\s*\(([^()]+)\)$/)
        const name = match ? match[2].trim() : raw
        const key = normalize(name)
        const group = groups.get(key) || {
            id: `lite_${key}`,
            canonicalName: name,
            aliases: new Set(),
            circles: new Set(),
            works: 0,
            confidence: match ? 0.8 : 1,
            reviewStatus: match ? 'pending' : 'approved',
            evidence: match
                ? '检测到“社团（作者）”格式，请确认作者实体。'
                : '规范化名称一致。'
        }
        group.works += 1
        group.aliases.add(raw)
        if (match) group.circles.add(match[1].trim())
        groups.set(key, group)
        comic.canonicalAuthor = name
    }
    state.authors = [...groups.values()]
        .map((group) => ({
            ...group,
            aliases: [...group.aliases],
            circles: [...group.circles]
        }))
        .sort((left, right) => right.works - left.works)
}

function renderSummary(value = {}) {
    const items = [
        ['漫画', value.comics ?? state.records.length],
        ['收藏', value.favorites ?? state.records.length],
        ['作者', value.authors ?? state.authors.length],
        [
            '待审核作者',
            value.authorsPendingReview ??
                state.authors.filter(
                    (author) => author.reviewStatus === 'pending'
                ).length
        ],
        ['章节', value.episodes || 0],
        ['已下载图片', value.downloadedPictures || 0],
        ['Lite 计划', state.queue.length]
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
    const coverSource = (comic) =>
        state.mode === 'connected'
            ? `/api/v1/covers/${encodeURIComponent(comic.comicId)}`
            : comic.coverUrl || ''
    const tagsFor = (comic) => selectDisplayTags(comic, state.records)
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
                    <label class="comic-select"><input type="checkbox" data-comic-id="${escapeHtml(comic.comicId)}" /> 选择</label>
                    <h3>${escapeHtml(comic.title)}</h3>
                    <p>${escapeHtml(comic.canonicalAuthor || comic.author || '未知作者')}</p>
                    <div>${tagsFor(comic)
                        .map(
                            (tag) =>
                                `<span class="tag">${escapeHtml(tag)}</span>`
                        )
                        .join('')}</div>
                    <p class="comic-meta">爱心 ${Number(comic.totalLikes || 0).toLocaleString()} · ${Number(comic.downloadedPictures || 0)}/${Number(comic.knownPictures || 0)} 已下载</p>
                </div>
            </article>`
        )
        .join('')
    $('#comic-rows').innerHTML = page
        .map(
            (comic) => `<tr>
                <td><input type="checkbox" data-comic-id="${escapeHtml(comic.comicId)}" /></td>
                <td><strong>${escapeHtml(comic.title)}</strong></td>
                <td>${escapeHtml(comic.canonicalAuthor || comic.author || '未知')}</td>
                <td>${tagsFor(comic)
                    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                    .join('')}</td>
                <td>${Number(comic.totalLikes || 0).toLocaleString()}</td>
                <td>${escapeHtml(comic.updatedAt || '')}</td>
                <td>${Number(comic.downloadedPictures || 0)}/${Number(comic.knownPictures || 0)}</td>
            </tr>`
        )
        .join('')
    $('#library-count').textContent =
        `已显示 ${page.length} / ${state.visible.length} 部作品`
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
        node.querySelector('.author-name').textContent = author.canonicalName
        node.querySelector('.author-meta').textContent =
            `${author.works} 部作品 · ${(author.aliases || []).join(' / ')} · 置信度 ${Math.round((author.confidence || 0) * 100)}%`
        node.querySelector('.author-evidence').textContent = author.evidence
        $('#author-list').append(node)
    }
}

function renderResultCards(records, target, withReasons = false) {
    $(target).innerHTML = (records || [])
        .map((item) => {
            const comic = item.comic || item
            return `<article class="result">
                <div class="cover-shell">
                    ${comic.coverUrl ? `<img src="${escapeHtml(state.mode === 'connected' ? `/api/v1/covers/${encodeURIComponent(comic.comicId)}` : comic.coverUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove();this.parentElement.classList.add('cover-missing')" />` : ''}
                    <span aria-hidden="true">P</span>
                </div>
                <div class="result-body"><h3>${escapeHtml(comic.title)}</h3>
                <p>${escapeHtml(comic.canonicalAuthor || comic.author || '未知作者')}</p>
                <div>${selectDisplayTags(comic, state.records)
                    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                    .join('')}</div>
                ${
                    withReasons
                        ? `<p>${(item.reasons || [])
                              .slice(0, 3)
                              .map((reason) =>
                                  escapeHtml(reason.value || reason)
                              )
                              .join(' · ')}</p>`
                        : ''
                }
                <p>爱心 ${Number(comic.totalLikes || 0).toLocaleString()} · 浏览 ${Number(comic.totalViews || 0).toLocaleString()}</p>
                <button data-result-download="${escapeHtml(comic.comicId)}">加入下载</button>
                </div>
            </article>`
        })
        .join('')
}

function renderPreparedRecommendations() {
    const preferences = [
        ...(state.profile?.authors || []),
        ...(state.profile?.tags || [])
    ].slice(0, 12)
    $('#profile').innerHTML = preferences
        .map(
            (item) =>
                `<span class="preference">${escapeHtml(item.value)} · ${item.count}</span>`
        )
        .join('')
    renderResultCards(state.recommendations, '#recommend-results', true)
    $('#recommend-message').textContent =
        `共 ${state.recommendations.length} 条推荐。`
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
                        `<article class="list-item"><div class="grow"><strong>${escapeHtml(job.comicId)}</strong><p>${escapeHtml(job.source || 'library')} · Browser Lite 计划</p></div></article>`
                )
                .join('') || '<article class="notice">下载计划为空。</article>'
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
                    <div class="grow"><strong>${escapeHtml(job.comicId)}</strong><p>${job.source} · ${job.runner} · ${job.status} · 重试 ${job.retryCount}</p><div class="progress"><span style="width:${percent}%"></span></div><p>${job.progressCompleted}/${job.progressTotal} · ${Number(job.bytes).toLocaleString()} bytes${job.error ? ` · ${escapeHtml(job.error)}` : ''}</p></div>
                    <div class="actions">${['QUEUED', 'PREPARING', 'RUNNING'].includes(job.status) ? `<button data-job-action="pause" data-job-id="${job.id}">暂停</button>` : ''}${job.status === 'PAUSED' ? `<button data-job-action="resume" data-job-id="${job.id}">恢复</button>` : ''}${job.status === 'FAILED' ? `<button data-job-action="retry" data-job-id="${job.id}">重试</button>` : ''}${!['COMPLETED', 'CANCELLED'].includes(job.status) ? `<button data-job-action="cancel" data-job-id="${job.id}">取消</button>` : ''}</div>
                </article>`
            })
            .join('') || '<article class="notice">队列为空。</article>'
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
    renderSummary(summary)
    renderComics()
    renderAuthors()
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
}
$('#view-grid').onclick = () => setLibraryView('grid')
$('#view-list').onclick = () => setLibraryView('list')
$('#pending-only').onchange = renderAuthors
$('#import-button').onclick = async () => {
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
        $('#import-result').textContent =
            `已导入 ${state.records.length} 条记录、${state.recommendations.length} 条推荐和 ${state.queue.length} 个计划。`
    } catch (error) {
        $('#import-result').textContent = error.message
    }
}
$('#sync-button').onclick = async () => {
    try {
        if (state.mode !== 'connected')
            throw new Error('同步收藏需要连接本地服务。')
        await post('/api/v1/sync', {})
        await detect()
    } catch (error) {
        $('#import-result').textContent = error.message
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
            throw new Error('站内搜索需要连接本地服务。')
        const records = await post('/api/v1/search', {
            keyword: $('#search-keyword').value,
            tags: splitList($('#search-tags').value),
            sort: $('#search-sort').value,
            limit: 100
        })
        renderResultCards(records, '#search-results')
        $('#search-message').textContent = `找到 ${records.length} 条结果。`
    } catch (error) {
        $('#search-message').textContent = error.message
    }
}
$('#recommend-button').onclick = async () => {
    try {
        if (state.mode === 'connected') {
            const value = await post('/api/v1/recommendations', {
                limit: 30,
                seedCount: 8
            })
            state.profile = value.profile
            state.recommendations = value.recommendations
        }
        if (!state.recommendations.length)
            throw new Error('请先导入包含推荐结果的数据包，或连接本地服务。')
        renderPreparedRecommendations()
    } catch (error) {
        $('#recommend-message').textContent = error.message
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
        $('#update-result').textContent = error.message
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
        $('#repair-result').textContent = error.message
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
    replaceLiteState(await loadLiteState())
    try {
        const status = await api('/api/v1/status')
        state.mode = 'connected'
        $('#mode').textContent = 'Connected'
        state.records = await api('/api/v1/comics')
        state.authors = await api('/api/v1/authors')
        renderAll(status.summary)
    } catch {
        state.mode = 'lite'
        $('#mode').textContent = 'Browser Lite'
        if (!state.authors.length && state.records.length) deriveAuthors()
        renderAll()
    }
    if (state.recommendations.length) renderPreparedRecommendations()
}

detect()
