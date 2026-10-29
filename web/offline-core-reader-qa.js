/**
 * Offline-only QA adapter for the EXISTING Pica Reader markup and shared
 * Reader input/viewport/settings/progress modules. No provider, Host, login,
 * recommendations, original user profile or second content/DB implementation.
 *
 * The regular web/app.js remains the production UI. This is only a bounded
 * test shell for the source-free core HTTP route and browser interaction.
 */
import { readerKeyboardAction, readerPageIndex } from './reader-input.js'
import { recordReaderProgress, captureReaderProgress, acknowledgeReaderProgress } from './reader-progress.js'
import { createReaderViewportTracker } from './reader-viewport.js'
import { loadReaderSettings, cacheReaderSettings } from './reader-settings.js'

const byId = id => document.getElementById(id)
const boot = JSON.parse(byId('offline-qa-bootstrap').textContent)
const csrf = boot.csrf
const library = byId('qa-library'), bookSelect = byId('qa-book')
const readerView = byId('reader'), pagesTarget = byId('reader-pages')
const status = byId('reader-message'), libraryStatus = byId('qa-library-status')
const state = {
    book: null,
    chapters: [],
    chapter: null,
    episodeId: null,
    comicId: null,
    pageIndex: 0,
    dirty: false,
    progressRevision: 0,
    progressSaved: null
}
let requestId = 0, timer = null
const tracker = createReaderViewportTracker({
    window, document,
    onPage: index => queueProgress(index)
})
function assertLocalBook(value) {
    if (typeof value !== 'string' || !/^local:[0-9a-f]{64}$/.test(value))
        throw new Error('Not an owned local book')
    return value
}
async function readJson(url, options) {
    const response = await fetch(url, {
        credentials: 'same-origin', cache: 'no-store', ...options
    })
    if (!response.ok) throw new Error('Local QA request failed (' +
        response.status + ')')
    return await response.json()
}
function route(segment) {
    return '/api/v1/reader/' + segment
}
function restoreSettings() {
    const settings = loadReaderSettings(localStorage)
    byId('reader-mode').value = settings.mode
    byId('reader-direction').value = settings.direction
    byId('reader-fit').value = settings.fit
}
function saveSettings() {
    cacheReaderSettings(localStorage, {
        schemaVersion: 1, mode: byId('reader-mode').value,
        direction: byId('reader-direction').value,
        fit: byId('reader-fit').value
    })
}
function showLibrary() {
    tracker.stop()
    library.hidden = false
    readerView.hidden = true
    readerView.classList.remove('active')
    document.body.classList.remove('reader-active')
}
function showReader() {
    library.hidden = true
    readerView.hidden = false
    readerView.classList.add('active')
    document.body.classList.add('reader-active')
}
function chapterButtons() {
    const target = byId('reader-chapters')
    target.replaceChildren()
    for (const item of state.chapters) {
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.readerEpisode = item.id
        button.textContent = item.title + ' · ' +
            item.downloadedPictures + '/' + item.knownPictures
        button.disabled = !item.downloadedPictures
        button.addEventListener('click', () => void openChapter(item.id))
        target.append(button)
    }
}
function updateChapterArrows() {
    const items = state.chapters.filter(item => item.downloadedPictures)
    const at = items.findIndex(item => item.id === state.episodeId)
    byId('reader-prev-chapter').disabled = at <= 0
    byId('reader-next-chapter').disabled =
        at < 0 || at >= items.length - 1
}
function paint() {
    tracker.stop()
    const chapter = state.chapter
    if (!chapter) return
    const mode = byId('reader-mode').value
    const direction = byId('reader-direction').value
    const fit = byId('reader-fit').value
    pagesTarget.className = 'reader-pages reader-' + mode +
        ' direction-' + direction + ' fit-' + fit
    pagesTarget.replaceChildren()
    const selected = mode === 'vertical'
        ? chapter.pages : chapter.pages.slice(
            state.pageIndex, state.pageIndex + (mode === 'double' ? 2 : 1))
    for (let i = 0; i < selected.length; i++) {
        const page = selected[i]
        if (typeof page.url !== 'string' ||
            !/^\/api\/v1\/reader\/pictures\/[A-Za-z0-9_%:-]+(?:\?v=[a-f0-9]{64})?$/.test(page.url))
            throw new Error('Invalid local page URL')
        const image = document.createElement('img')
        image.src = page.url
        image.loading = mode === 'vertical' ? 'lazy' : 'eager'
        image.decoding = 'async'
        image.dataset.readerPage = String(mode === 'vertical'
            ? i : state.pageIndex + i)
        image.alt = 'Page ' + (Number(image.dataset.readerPage) + 1)
        image.addEventListener('error', () => {
            if (!image.isConnected) return
            const retry = document.createElement('button')
            retry.type = 'button'
            retry.textContent = '重试此页 · Retry'
            retry.addEventListener('click', () => {
                retry.remove()
                image.src = image.getAttribute('src')
            }, { once: true })
            image.after(retry)
        })
        pagesTarget.append(image)
    }
    byId('reader-chapter-title').textContent =
        chapter.episode.title + ' · ' + chapter.pages.length + ' pages'
    if (mode === 'vertical') {
        const chapterOwner = state.chapter
        tracker.start({
            target: pagesTarget,
            resumePage: state.pageIndex,
            pageCount: chapter.pages.length,
            isCurrent: () => state.chapter === chapterOwner &&
                !readerView.hidden && byId('reader-mode').value === 'vertical'
        })
    } else queueProgress(state.pageIndex)
}
function queueProgress(index) {
    if (!state.chapter || readerView.hidden ||
        !recordReaderProgress(state, index)) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flushProgress(), 400)
}
async function flushProgress(keepalive = false) {
    if (timer) clearTimeout(timer)
    timer = null
    const snapshot = captureReaderProgress(state)
    if (!snapshot) return true
    try {
        await readJson(route('progress'), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-pica-qa-csrf': csrf
            },
            body: JSON.stringify(snapshot.payload),
            ...(keepalive ? { keepalive: true } : {})
        })
        acknowledgeReaderProgress(state, snapshot)
        return true
    } catch {
        status.textContent = '阅读进度暂未保存 · Could not save progress'
        return false
    }
}
async function openChapter(id) {
    const ticket = ++requestId
    await flushProgress()
    if (ticket !== requestId) return
    status.textContent = '正在读取章节…'
    try {
        const value = await readJson(route(
            'comics/' + encodeURIComponent(state.comicId) +
            '/chapters/' + encodeURIComponent(id)))
        if (ticket !== requestId) return
        if (!value?.episode || !Array.isArray(value.pages) ||
            value.pages.length > 2000)
            throw new Error('Invalid local Reader chapter')
        state.chapter = value
        state.episodeId = id
        state.pageIndex = Math.min(
            Math.max(0, value.progress?.pageIndex || 0),
            Math.max(0, value.pages.length - 1))
        state.progressSaved = value.progress?.pageIndex ?? null
        state.dirty = false
        paint()
        updateChapterArrows()
        status.textContent = ''
    } catch {
        if (ticket === requestId)
            status.textContent = '本地章节不可读取 · Chapter unavailable'
    }
}
async function openBook(id) {
    const ticket = ++requestId
    await flushProgress()
    if (ticket !== requestId) return
    status.textContent = '正在读取本地作品…'
    try {
        assertLocalBook(id)
        const [chapters, progress] = await Promise.all([
            readJson(route('comics/' + encodeURIComponent(id) + '/chapters')),
            readJson(route('progress'))
        ])
        if (ticket !== requestId) return
        if (!Array.isArray(chapters) || !Array.isArray(progress) ||
            chapters.length > 2000)
            throw new Error('Invalid local Reader listing')
        state.comicId = id
        state.chapters = chapters
        state.chapter = null
        state.episodeId = null
        byId('reader-title').textContent = state.book?.title ?? '本地阅读'
        chapterButtons()
        showReader()
        const usable = chapters.filter(item => item.downloadedPictures)
        if (!usable.length) throw new Error('No downloaded pages')
        const recent = progress.find(row =>
            row.comicId === id &&
            usable.some(item => item.id === row.episodeId))
        await openChapter(recent?.episodeId ?? usable[0].id)
    } catch {
        if (ticket === requestId)
            status.textContent = '本地作品不可读取 · Book unavailable'
    }
}
async function loadBooks() {
    const search = byId('qa-library-search').value.trim()
    if (search.length > 200) return []
    libraryStatus.textContent = '正在查询本地书库…'
    try {
        // The very same LibraryQueryService powers the old Desktop library
        // filters. Only the existing local records are visible to this QA.
        const value = await readJson('/api/v1/library/query', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-pica-qa-csrf': csrf
            },
            body: JSON.stringify({
                scope: 'library', text: search,
                providerIds: ['local'], sort: 'title', limit: 100
            })
        })
        const comics = value.items
        if (!Array.isArray(comics) ||
            !Number.isSafeInteger(value.total) ||
            value.total < 0 || comics.length > 100 ||
            comics.some(row => row.providerId !== 'local'))
            throw new Error('Unexpected offline catalogue')
        bookSelect.replaceChildren()
        for (const comic of comics) {
            assertLocalBook(comic.comicId)
            const option = document.createElement('option')
            option.value = comic.comicId
            option.textContent = comic.title
            bookSelect.append(option)
        }
        byId('qa-open').disabled = !comics.length
        libraryStatus.textContent = comics.length ?
            value.total + ' 本本地作品 · Local books' :
            '无匹配作品 · No local matches'
        return comics
    } catch {
        libraryStatus.textContent = '本地书库暂不可读取。'
        byId('qa-open').disabled = true
        return []
    }
}
byId('qa-library-search-button').addEventListener('click',
    () => void loadBooks())
byId('qa-library-search').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault()
        void loadBooks()
    }
})
byId('qa-open').addEventListener('click', async () => {
    const id = bookSelect.value
    if (!id) return
    state.book = { comicId: id,
        title: bookSelect.selectedOptions[0]?.textContent || '本地阅读' }
    await openBook(id)
})
for (const [id, delta] of [
    ['reader-prev-chapter', -1],
    ['reader-next-chapter', 1]
]) byId(id).addEventListener('click', () => {
    const usable = state.chapters.filter(item => item.downloadedPictures)
    const at = usable.findIndex(item => item.id === state.episodeId)
    if (at >= 0 && usable[at + delta])
        void openChapter(usable[at + delta].id)
})
function move(delta) {
    const next = readerPageIndex({
        pageIndex: state.pageIndex,
        total: state.chapter?.pages?.length || 0,
        mode: byId('reader-mode').value,
        direction: byId('reader-direction').value
    }, delta)
    if (next === null || next === state.pageIndex) return
    state.pageIndex = next
    paint()
}
for (const name of ['mode', 'direction', 'fit'])
    byId('reader-' + name).addEventListener('change', () => {
        saveSettings()
        paint()
    })
byId('reader-fullscreen').addEventListener('click', () => {
    void (document.fullscreenElement
        ? document.exitFullscreen()
        : readerView.requestFullscreen())
})
byId('reader-exit').addEventListener('click', async () => {
    ++requestId
    tracker.stop()
    await flushProgress()
    showLibrary()
    if (document.fullscreenElement) await document.exitFullscreen()
})
for (const id of ['reader-export-zip', 'reader-export-cbz'])
    byId(id).hidden = true // Read-only QA never writes an export file.
document.addEventListener('keydown', event => {
    const editing = event.target?.closest?.(
        'input, select, textarea, button, [contenteditable="true"]')
    const action = readerKeyboardAction(event, {
        active: !readerView.hidden,
        blocked: Boolean(editing),
        mode: byId('reader-mode').value,
        fullscreen: Boolean(document.fullscreenElement)
    })
    if (action === null) return
    event.preventDefault()
    if (action === 'exit') byId('reader-exit').click()
    else move(action)
})
window.addEventListener('pagehide', () => {
    tracker.stop()
    void flushProgress(true)
})
restoreSettings()
showLibrary()
void loadBooks()
