const state = {
    mode: 'lite',
    records: [],
    authors: [],
    visible: [],
    recommendationBundle: null,
    plannedIds: new Set()
}

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]
const splitList = (value) =>
    value
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
const normalized = (value) =>
    String(value || '')
        .normalize('NFKC')
        .trim()
        .toLocaleLowerCase()

function parseCsv(text) {
    text = text.replace(/^\uFEFF/, '')
    const rows = []
    let row = [],
        cell = '',
        quoted = false
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i]
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') {
                cell += '"'
                i += 1
            } else if (char === '"') quoted = false
            else cell += char
        } else if (char === '"') quoted = true
        else if (char === ',') {
            row.push(cell)
            cell = ''
        } else if (char === '\n') {
            row.push(cell.replace(/\r$/, ''))
            if (row.some(Boolean)) rows.push(row)
            row = []
            cell = ''
        } else cell += char
    }
    if (cell || row.length) {
        row.push(cell)
        rows.push(row)
    }
    return rows
}

function recordsFromCsv(text) {
    const rows = parseCsv(text)
    if (!rows.length) return []
    const headers = rows[0].map((x) => x.trim())
    const at = (row, ...names) => {
        for (const name of names) {
            const index = headers.indexOf(name)
            if (index >= 0) return row[index]
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
                author: at(row, 'author', 'author_raw').trim(),
                categories: at(row, 'categories')
                    .split(/\s*\|\s*/)
                    .filter(Boolean),
                tags: at(row, 'tags')
                    .split(/\s*\|\s*/)
                    .filter(Boolean),
                finished: ['true', '1', 'yes'].includes(
                    at(row, 'finished').toLowerCase()
                ),
                updatedAt: at(row, 'updated_at'),
                totalLikes:
                    Number(
                        at(row, 'totalLikes', 'total_likes', 'likesCount')
                    ) || 0,
                totalViews:
                    Number(
                        at(row, 'totalViews', 'total_views', 'viewsCount')
                    ) || 0
            }
        ]
    })
}

function identity(raw) {
    const display = String(raw || '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim()
    const match = display.match(/^(.+?)\s*\(([^()]+)\)\s*$/u)
    const creator = match ? match[2].trim() : display || '(missing)'
    return {
        canonicalName: creator,
        normalizedKey: normalized(creator),
        circle: match ? match[1].trim() : null,
        confidence: match ? 0.8 : display ? 1 : 0,
        evidence: match ? '解析为“社团（作者）”，建议确认' : '单一规范化作者值',
        reviewStatus: match || !display ? 'pending' : 'approved'
    }
}

function deriveAuthors(records) {
    const groups = new Map()
    for (const comic of records) {
        const parsed = identity(comic.author)
        const canonicalName =
            comic.canonicalAuthorOverride || parsed.canonicalName
        const normalizedKey = normalized(canonicalName)
        const group = groups.get(normalizedKey) || {
            id: `lite_${normalizedKey}`,
            ...parsed,
            canonicalName,
            normalizedKey,
            works: 0,
            aliases: new Set(),
            circles: new Set()
        }
        group.works += 1
        group.aliases.add(comic.author)
        if (parsed.circle) group.circles.add(parsed.circle)
        if (
            !comic.canonicalAuthorOverride &&
            parsed.reviewStatus === 'pending'
        ) {
            group.reviewStatus = 'pending'
        }
        groups.set(normalizedKey, group)
        comic.canonicalAuthor = canonicalName
    }
    return [...groups.values()]
        .map((group) => ({
            ...group,
            aliases: [...group.aliases],
            circles: [...group.circles]
        }))
        .sort((a, b) => b.works - a.works)
}

function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('pica-library-lite', 1)
        request.onupgradeneeded = () =>
            request.result.createObjectStore('state')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

async function saveLite() {
    const db = await openDb()
    const transaction = db.transaction('state', 'readwrite')
    transaction.objectStore('state').put(state.records, 'records')
    transaction
        .objectStore('state')
        .put(state.recommendationBundle, 'recommendationBundle')
}

async function loadLite() {
    const db = await openDb()
    return new Promise((resolve) => {
        const store = db.transaction('state').objectStore('state')
        const recordsRequest = store.get('records')
        const bundleRequest = store.get('recommendationBundle')
        let records = []
        let bundle = null
        let completed = 0
        const finish = () => {
            completed += 1
            if (completed === 2) resolve({ records, bundle })
        }
        recordsRequest.onsuccess = () => {
            records = recordsRequest.result || []
            finish()
        }
        recordsRequest.onerror = finish
        bundleRequest.onsuccess = () => {
            bundle = bundleRequest.result || null
            finish()
        }
        bundleRequest.onerror = finish
    })
}

async function api(path, options) {
    const response = await fetch(path, options)
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`)
    return value
}

function renderSummary(summary) {
    const items = [
        ['漫画', summary.comics || 0],
        ['收藏', summary.favorites ?? summary.comics ?? 0],
        ['作者实体', summary.authors || 0],
        ['待审核作者', summary.authorsPendingReview || 0],
        ['章节', summary.episodes || 0],
        ['已下载图片', summary.downloadedPictures || 0]
    ]
    $('#summary').innerHTML = items
        .map(
            ([label, value]) =>
                `<div class="card"><span>${label}</span><strong>${Number(value).toLocaleString()}</strong></div>`
        )
        .join('')
}

function liteSummary() {
    state.authors = deriveAuthors(state.records)
    renderSummary({
        comics: state.records.length,
        favorites: state.records.length,
        authors: state.authors.length,
        authorsPendingReview: state.authors.filter(
            (a) => a.reviewStatus === 'pending'
        ).length
    })
}

function renderComics(records) {
    state.visible = records
    $('#comic-rows').innerHTML = records
        .map(
            (comic) => `
        <tr>
            <td><input type="checkbox" data-comic-id="${comic.comicId}" /></td>
            <td>${escapeHtml(comic.title)}</td>
            <td>${escapeHtml(comic.canonicalAuthor || comic.author || '')}</td>
            <td>${(comic.tags || [])
                .slice(0, 8)
                .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                .join('')}</td>
            <td>${Number(comic.totalLikes || 0).toLocaleString()}</td>
            <td>${Number(comic.totalViews || 0).toLocaleString()}</td>
            <td>${escapeHtml(comic.updatedAt || '')}</td>
            <td>${comic.knownPictures ? `${comic.downloadedPictures || 0}/${comic.knownPictures}` : '未索引'}</td>
        </tr>`
        )
        .join('')
}

function renderAuthors() {
    const pendingOnly = $('#pending-only').checked
    const container = $('#author-list')
    container.innerHTML = ''
    for (const author of state.authors.filter(
        (a) => !pendingOnly || a.reviewStatus === 'pending'
    )) {
        const element = $('#author-template').content.cloneNode(true)
        element.querySelector('.author-card').dataset.authorId = author.id
        element.querySelector('.author-select').value = author.id
        element.querySelector('.author-name').textContent = author.canonicalName
        element.querySelector('.author-meta').textContent =
            `${author.works} 部作品 · 社团：${(author.circles || []).join('、') || '无'} · ${Math.round(author.confidence * 100)}% · ${author.reviewStatus}`
        element.querySelector('.author-evidence').textContent = author.evidence
        container.append(element)
    }
}

function escapeHtml(value) {
    const div = document.createElement('div')
    div.textContent = String(value || '')
    return div.innerHTML
}

function showView(viewId) {
    $$('nav button').forEach((item) =>
        item.classList.toggle('active', item.dataset.view === viewId)
    )
    $$('.view').forEach((view) =>
        view.classList.toggle('active', view.id === viewId)
    )
}

function renderProfile(profile) {
    const items = [
        ...(profile.authors || [])
            .slice(0, 3)
            .map((item) => `作者 · ${item.value}`),
        ...(profile.tags || [])
            .slice(0, 5)
            .map((item) => `Tag · ${item.value}`),
        ...(profile.categories || [])
            .slice(0, 3)
            .map((item) => `分类 · ${item.value}`)
    ]
    $('#profile').innerHTML = items
        .map((item) => `<span class="preference">${escapeHtml(item)}</span>`)
        .join('')
}

function renderRecommendations(result) {
    renderProfile(result.profile)
    $('#recommend-results').innerHTML = result.recommendations
        .map(
            ({ comic, score, reasons }) => `
        <article class="result-card">
            <h3>${escapeHtml(comic.title)}</h3>
            <p>${escapeHtml(comic.canonicalAuthor || comic.author)}</p>
            <ul class="reason-list">${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
            <p class="muted">匹配分 ${score} · 爱心 ${Number(comic.totalLikes || 0).toLocaleString()}</p>
            <button data-result-download="${comic.comicId}">${state.mode === 'connected' ? '下载' : '加入下载计划'}</button>
        </article>`
        )
        .join('')
}

function downloadJson(name, value) {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    URL.revokeObjectURL(url)
}

async function refreshConnected() {
    const status = await api('/api/v1/status')
    renderSummary(status.summary)
    state.records = await api('/api/v1/comics?limit=5000')
    state.authors = await api('/api/v1/authors')
    renderComics(state.records)
    renderAuthors()
}

async function detectMode() {
    try {
        const status = await api('/api/v1/status')
        state.mode = 'connected'
        $('#mode').textContent = `● 完整模式 · ${status.version}`
        await refreshConnected()
    } catch {
        state.mode = 'lite'
        $('#mode').textContent = '● Lite 模式 · 数据仅保存在浏览器'
        $('#sync-button').disabled = true
        $('#search-message').textContent =
            '站内搜索需要运行 pica-library serve 连接本地引擎。'
        const saved = await loadLite()
        state.records = saved.records
        state.recommendationBundle = saved.bundle
        liteSummary()
        renderComics(state.records)
        renderAuthors()
    }
}

$$('nav button').forEach((button) =>
    button.addEventListener('click', () => showView(button.dataset.view))
)

$$('[data-go]').forEach((button) =>
    button.addEventListener('click', () => showView(button.dataset.go))
)
$('#show-setup').addEventListener('click', () => $('#setup-dialog').showModal())
$('.setup-close').addEventListener('click', () => $('#setup-dialog').close())
$('#first-use').addEventListener('click', () =>
    $('#first-use-dialog').showModal()
)
$('.first-use-close').addEventListener('click', () =>
    $('#first-use-dialog').close()
)

$('#import-button').addEventListener('click', async () => {
    const file = $('#import-file').files[0]
    if (!file) return
    const text = await file.text()
    const parsed = file.name.endsWith('.json') ? JSON.parse(text) : null
    const bundle =
        parsed?.kind === 'pica-library-bundle' &&
        Array.isArray(parsed.favorites)
            ? parsed
            : null
    const records = bundle
        ? bundle.favorites
        : parsed
          ? parsed
          : recordsFromCsv(text)
    if (!Array.isArray(records)) throw new Error('无法识别这个收藏数据文件。')
    state.recommendationBundle = bundle
    if (state.mode === 'connected') {
        const result = await api('/api/v1/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ records })
        })
        $('#import-result').textContent =
            `已导入 ${result.imported} 条，作者组 ${result.authorGroups}。`
        await refreshConnected()
    } else {
        state.records = records
        await saveLite()
        liteSummary()
        renderComics(records)
        renderAuthors()
        $('#import-result').textContent =
            `已在浏览器本地导入 ${records.length} 条${bundle ? `，包含 ${bundle.recommendations?.length || 0} 条推荐` : ''}。`
        if (bundle) {
            renderRecommendations(bundle)
            showView('recommendations')
        }
    }
})

$('#sync-button').addEventListener('click', async () => {
    $('#import-result').textContent = '正在同步…'
    const result = await api('/api/v1/sync', { method: 'POST' })
    $('#import-result').textContent = `同步完成：${result.imported} 条收藏。`
    await refreshConnected()
})

$('#apply-filter').addEventListener('click', async () => {
    const text = $('#filter-text').value
    const tags = splitList($('#filter-tag').value)
    const sort = $('#sort-mode').value
    if (state.mode === 'connected') {
        const params = new URLSearchParams({
            q: text,
            tags: tags.join(','),
            sort,
            limit: '5000'
        })
        renderComics(await api(`/api/v1/comics?${params}`))
    } else {
        let records = state.records.filter((comic) => {
            const haystack =
                `${comic.title}\n${comic.author}\n${comic.canonicalAuthor || ''}`.toLocaleLowerCase()
            return (
                (!text || haystack.includes(text.toLocaleLowerCase())) &&
                tags.every((tag) =>
                    (comic.tags || []).map(normalized).includes(normalized(tag))
                )
            )
        })
        records = records.sort((a, b) =>
            sort === 'likes'
                ? (b.totalLikes || 0) - (a.totalLikes || 0)
                : sort === 'views'
                  ? (b.totalViews || 0) - (a.totalViews || 0)
                  : sort === 'title'
                    ? a.title.localeCompare(b.title)
                    : String(b.updatedAt || '').localeCompare(
                          String(a.updatedAt || '')
                      )
        )
        renderComics(records)
    }
})

$('#refresh-authors').addEventListener('click', async () => {
    if (state.mode === 'connected') state.authors = await api('/api/v1/authors')
    renderAuthors()
})
$('#pending-only').addEventListener('change', renderAuthors)

$('#merge-authors').addEventListener('click', async () => {
    const selected = $$('.author-select:checked').map((input) => input.value)
    if (selected.length < 2) {
        window.alert('请至少选择两个作者。')
        return
    }
    const target = state.authors.find((author) => author.id === selected[0])
    const canonicalName = $('#merge-name').value.trim() || target.canonicalName
    if (state.mode === 'connected') {
        await api('/api/v1/authors/merge', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                targetAuthorId: selected[0],
                sourceAuthorIds: selected.slice(1),
                canonicalName
            })
        })
        await refreshConnected()
    } else {
        const selectedKeys = new Set(
            state.authors
                .filter((author) => selected.includes(author.id))
                .map((author) => author.normalizedKey)
        )
        for (const comic of state.records) {
            const key = normalized(
                comic.canonicalAuthor || identity(comic.author).canonicalName
            )
            if (selectedKeys.has(key))
                comic.canonicalAuthorOverride = canonicalName
        }
        await saveLite()
        liteSummary()
        renderComics(state.records)
        renderAuthors()
    }
})

$('#organize-library').addEventListener('click', async () => {
    if (state.mode !== 'connected') {
        window.alert('重建本地目录需要运行 pica-library serve。')
        return
    }
    const result = await api('/api/v1/organize', { method: 'POST' })
    window.alert(
        `目录已更新：新建 ${result.linked}，已有 ${result.existing}，未下载 ${result.skipped}。`
    )
})

$('#author-list').addEventListener('click', async (event) => {
    const decision = event.target.dataset.decision
    if (!decision) return
    const card = event.target.closest('.author-card')
    const author = state.authors.find(
        (item) => item.id === card.dataset.authorId
    )
    if (!author) return
    author.reviewStatus = decision
    if (state.mode === 'connected') {
        await api(`/api/v1/authors/${encodeURIComponent(author.id)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ reviewStatus: decision })
        })
    }
    renderAuthors()
})

$('#export-aliases').addEventListener('click', () =>
    downloadJson('author-aliases.json', {
        schemaVersion: 1,
        authors: state.authors.map(
            ({ id, canonicalName, aliases, circles, reviewStatus }) => ({
                id,
                canonicalName,
                aliases,
                circles,
                reviewStatus
            })
        )
    })
)

$('#import-aliases').addEventListener('click', async () => {
    const file = $('#alias-file').files[0]
    if (!file) return
    const dictionary = JSON.parse(await file.text())
    if (state.mode === 'connected') {
        await api('/api/v1/authors/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(dictionary)
        })
        await refreshConnected()
        return
    }
    const aliasMap = new Map()
    for (const author of dictionary.authors || []) {
        for (const alias of [author.canonicalName, ...(author.aliases || [])]) {
            aliasMap.set(normalized(alias), author.canonicalName)
        }
    }
    for (const comic of state.records) {
        const parsed = identity(comic.author)
        const canonicalName = aliasMap.get(parsed.normalizedKey)
        if (canonicalName) comic.canonicalAuthorOverride = canonicalName
    }
    await saveLite()
    liteSummary()
    renderComics(state.records)
    renderAuthors()
})

$('#export-plan').addEventListener('click', () => {
    const selected = $$('[data-comic-id]:checked').map(
        (input) => input.dataset.comicId
    )
    const comics = state.visible.filter(
        (comic) => !selected.length || selected.includes(comic.comicId)
    )
    const comicIds = [
        ...new Set([
            ...comics.map((comic) => comic.comicId),
            ...state.plannedIds
        ])
    ]
    downloadJson('download-plan.json', {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        comicIds
    })
})

$('#search-button').addEventListener('click', async () => {
    if (state.mode !== 'connected') return
    $('#search-message').textContent = '正在搜索…'
    try {
        const records = await api('/api/v1/search', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                keyword: $('#search-keyword').value,
                tags: splitList($('#search-tags').value),
                categories: splitList($('#search-categories').value),
                sort: $('#search-sort').value,
                limit: 100
            })
        })
        $('#search-message').textContent = `找到 ${records.length} 条结果。`
        $('#search-results').innerHTML = records
            .map(
                (comic) => `
            <article class="result-card">
                <h3>${escapeHtml(comic.title)}</h3>
                <p>${escapeHtml(comic.author)}</p>
                <p class="muted">爱心 ${Number(comic.totalLikes || 0).toLocaleString()} · 浏览 ${Number(comic.totalViews || 0).toLocaleString()}</p>
                <p>${(comic.tags || [])
                    .slice(0, 10)
                    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                    .join('')}</p>
                <button data-result-download="${comic.comicId}">下载</button>
            </article>`
            )
            .join('')
    } catch (error) {
        $('#search-message').textContent = error.message
    }
})

$('#search-results').addEventListener('click', async (event) => {
    const comicId = event.target.dataset.resultDownload
    if (!comicId) return
    event.target.disabled = true
    event.target.textContent = '下载中…'
    try {
        await api('/api/v1/download', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ comicIds: [comicId] })
        })
        event.target.textContent = '完成'
    } catch (error) {
        event.target.disabled = false
        event.target.textContent = error.message
    }
})

$('#recommend-button').addEventListener('click', async () => {
    if (state.mode !== 'connected') {
        if (state.recommendationBundle) {
            renderRecommendations(state.recommendationBundle)
            $('#recommend-message').textContent =
                `数据包包含 ${state.recommendationBundle.recommendations?.length || 0} 条站内关联推荐。`
            return
        }
        $('#recommend-message').textContent =
            state.records.length === 0
                ? '先在概览导入收藏夹，再连接本地完整版获取站内候选。'
                : '收藏画像已就绪。连接本地完整版后可从站内关联作品生成推荐。'
        const favorites = state.records.map((comic) => ({
            ...comic,
            isFavorite: true
        }))
        const counts = (values) =>
            [
                ...values.reduce(
                    (map, value) => map.set(value, (map.get(value) || 0) + 1),
                    new Map()
                )
            ]
                .sort((a, b) => b[1] - a[1])
                .map(([value, count]) => ({ value, count }))
        renderProfile({
            authors: counts(
                favorites.map((comic) => comic.canonicalAuthor || comic.author)
            ),
            tags: counts(favorites.flatMap((comic) => comic.tags || [])),
            categories: counts(
                favorites.flatMap((comic) => comic.categories || [])
            )
        })
        return
    }
    $('#recommend-button').disabled = true
    $('#recommend-message').textContent = '正在读取收藏偏好和关联作品…'
    try {
        const result = await api('/api/v1/recommendations', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ limit: 30, seedCount: 8 })
        })
        renderRecommendations(result)
        $('#recommend-message').textContent = result.recommendations.length
            ? `已生成 ${result.recommendations.length} 条结果。`
            : '暂无候选。先同步收藏夹，或在站内搜索中加入更多候选。'
    } catch (error) {
        $('#recommend-message').textContent = error.message
    } finally {
        $('#recommend-button').disabled = false
    }
})

$('#recommend-results').addEventListener('click', (event) => {
    const comicId = event.target.dataset.resultDownload
    if (!comicId) return
    if (state.mode !== 'connected') {
        state.plannedIds.add(comicId)
        event.target.disabled = true
        event.target.textContent = '已加入计划'
        return
    }
    event.target.disabled = true
    event.target.textContent = '下载中…'
    api('/api/v1/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ comicIds: [comicId] })
    })
        .then(() => (event.target.textContent = '完成'))
        .catch((error) => {
            event.target.disabled = false
            event.target.textContent = error.message
        })
})

detectMode()
