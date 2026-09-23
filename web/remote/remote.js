const $ = (selector) => document.querySelector(selector)

const COPY = {
  'zh-CN': {
    title: '远程书库',
    language: '语言',
    logout: '退出',
    signIn: '建立浏览器会话',
    signInHelp: '输入服务器管理员提供的 Remote API bearer。它只用于本次换取 HttpOnly 会话，不会写入浏览器存储。',
    bearer: 'Remote API bearer',
    connect: '连接',
    library: '书库',
    shelves: '书架',
    downloaded: '已下载',
    readOnly: '只读远程视图',
    searchPlaceholder: '搜索标题、作者或标签',
    search: '搜索',
    close: '关闭',
    details: '作品详情',
    readDownloaded: '阅读已下载章节',
    reader: '阅读器',
    chapter: '章节',
    previous: '上一页',
    next: '下一页',
    noPages: '该章节没有已下载页面。',
    readerNoWrite: '远程只读模式不会修改本地阅读进度。',
    connecting: '正在建立安全会话…',
    connected: '已连接。',
    authFailed: '无法建立会话。请检查 bearer 或服务器配置。',
    sessionExpired: '浏览器会话已失效，请重新连接。',
    loading: '正在加载…',
    emptyLibrary: '当前书库没有匹配作品。',
    emptyShelves: '当前没有书架。',
    emptyShelf: '这个书架为空。',
    emptyDownloaded: '当前没有已下载作品。',
    open: '查看',
    read: '阅读',
    unknownAuthor: '未知作者',
    pages: '已下载页面',
    chapters: '章节',
    downloadedPages: '已下载',
    total: '共 {count} 项',
    requestFailed: '请求失败。',
    noReadableChapters: '没有可远程阅读的已下载章节。',
    pagePosition: '{page} / {total}',
    finished: '完结',
    ongoing: '连载/未完结',
    yes: '是',
    no: '否'
  },
  en: {
    title: 'Remote Library',
    language: 'Language',
    logout: 'Sign out',
    signIn: 'Start browser session',
    signInHelp: 'Enter the Remote API bearer supplied by the server operator. It is used only to exchange for an HttpOnly session and is never written to browser storage.',
    bearer: 'Remote API bearer',
    connect: 'Connect',
    library: 'Library',
    shelves: 'Shelves',
    downloaded: 'Downloaded',
    readOnly: 'Read-only remote view',
    searchPlaceholder: 'Search title, author or tag',
    search: 'Search',
    close: 'Close',
    details: 'Details',
    readDownloaded: 'Read downloaded chapters',
    reader: 'Reader',
    chapter: 'Chapter',
    previous: 'Previous',
    next: 'Next',
    noPages: 'This chapter has no downloaded pages.',
    readerNoWrite: 'Read-only remote mode does not modify local reading progress.',
    connecting: 'Starting secure session…',
    connected: 'Connected.',
    authFailed: 'Could not start a session. Check the bearer or server configuration.',
    sessionExpired: 'Browser session expired. Connect again.',
    loading: 'Loading…',
    emptyLibrary: 'No matching works in the library.',
    emptyShelves: 'No shelves yet.',
    emptyShelf: 'This shelf is empty.',
    emptyDownloaded: 'No downloaded works yet.',
    open: 'Open',
    read: 'Read',
    unknownAuthor: 'Unknown author',
    pages: 'Downloaded pages',
    chapters: 'Chapters',
    downloadedPages: 'Downloaded',
    total: '{count} items',
    requestFailed: 'Request failed.',
    noReadableChapters: 'No downloaded chapters are available for remote reading.',
    pagePosition: '{page} / {total}',
    finished: 'Finished',
    ongoing: 'Ongoing',
    yes: 'Yes',
    no: 'No'
  },
  ja: {
    title: 'リモートライブラリ',
    language: '言語',
    logout: 'ログアウト',
    signIn: 'ブラウザーセッションを開始',
    signInHelp: 'サーバー管理者から受け取った Remote API bearer を入力してください。HttpOnly セッションへの交換にのみ使用し、ブラウザーストレージには保存しません。',
    bearer: 'Remote API bearer',
    connect: '接続',
    library: 'ライブラリ',
    shelves: '本棚',
    downloaded: 'ダウンロード済み',
    readOnly: '読み取り専用リモート表示',
    searchPlaceholder: 'タイトル・作者・タグを検索',
    search: '検索',
    close: '閉じる',
    details: '作品詳細',
    readDownloaded: 'ダウンロード済み章を読む',
    reader: 'リーダー',
    chapter: '章',
    previous: '前へ',
    next: '次へ',
    noPages: 'この章にはダウンロード済みページがありません。',
    readerNoWrite: '読み取り専用リモートモードではローカルの読書進捗を変更しません。',
    connecting: '安全なセッションを開始しています…',
    connected: '接続しました。',
    authFailed: 'セッションを開始できません。bearer またはサーバー設定を確認してください。',
    sessionExpired: 'ブラウザーセッションの有効期限が切れました。再接続してください。',
    loading: '読み込み中…',
    emptyLibrary: '一致する作品はありません。',
    emptyShelves: '本棚はありません。',
    emptyShelf: 'この本棚は空です。',
    emptyDownloaded: 'ダウンロード済み作品はありません。',
    open: '開く',
    read: '読む',
    unknownAuthor: '作者不明',
    pages: 'ダウンロード済みページ',
    chapters: '章',
    downloadedPages: 'ダウンロード済み',
    total: '{count}件',
    requestFailed: 'リクエストに失敗しました。',
    noReadableChapters: 'リモートで読めるダウンロード済み章がありません。',
    pagePosition: '{page} / {total}',
    finished: '完結',
    ongoing: '連載中',
    yes: 'はい',
    no: 'いいえ'
  }
}

const state = {
  language: 'zh-CN',
  csrfToken: '',
  authenticated: false,
  activeView: 'library',
  currentDetail: null,
  reader: {
    comicId: '',
    title: '',
    chapters: [],
    chapter: null,
    pageIndex: 0
  }
}

function t(key, values = {}) {
  const table = COPY[state.language] || COPY.en
  let value = table[key] || COPY.en[key] || key
  for (const [name, replacement] of Object.entries(values))
    value = value.replaceAll(`{${name}}`, String(replacement))
  return value
}

function applyLanguage() {
  document.documentElement.lang = state.language
  document.title = `Pica Library · ${t('title')}`
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n)
  })
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder)
  })
  if (state.authenticated) {
    void renderActiveView()
    if (!$('#detail-panel').hidden && state.currentDetail)
      renderDetail(state.currentDetail)
    if (!$('#reader-panel').hidden && state.reader.chapter)
      renderReaderPage()
  }
}

function setMessage(selector, message = '', error = false) {
  const node = $(selector)
  node.textContent = message
  node.classList.toggle('error', Boolean(error))
}

function showAuthenticated(authenticated) {
  state.authenticated = authenticated
  $('#auth-panel').hidden = authenticated
  $('#app-shell').hidden = !authenticated
  $('#logout').hidden = !authenticated
  if (!authenticated) {
    state.csrfToken = ''
    state.currentDetail = null
    $('#detail-panel').hidden = true
    $('#reader-panel').hidden = true
  }
}

function sessionCookieRequest(path, options = {}) {
  return fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options
  })
}

async function parseResponse(response) {
  const type = response.headers.get('content-type') || ''
  if (type.includes('application/json')) return response.json()
  return response.text()
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const method = String(options.method || 'GET').toUpperCase()
  if (!['GET', 'HEAD'].includes(method) && state.csrfToken)
    headers.set('x-pica-csrf', state.csrfToken)
  const response = await sessionCookieRequest(path, {
    ...options,
    method,
    headers
  })
  if (response.status === 401) {
    showAuthenticated(false)
    setMessage('#auth-message', t('sessionExpired'), true)
    throw new Error('SESSION_EXPIRED')
  }
  if (!response.ok) {
    const payload = await parseResponse(response).catch(() => null)
    const message =
      payload && typeof payload === 'object' && payload.error
        ? String(payload.error)
        : `${t('requestFailed')} HTTP ${response.status}`
    throw new Error(message)
  }
  return parseResponse(response)
}

async function postJson(path, payload) {
  return api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

async function restoreSession() {
  try {
    const response = await sessionCookieRequest('/remote/v1/session')
    if (!response.ok) {
      showAuthenticated(false)
      return
    }
    const session = await response.json()
    state.csrfToken = String(session.csrfToken || '')
    if (!state.csrfToken) {
      showAuthenticated(false)
      return
    }
    showAuthenticated(true)
    await renderActiveView()
  } catch {
    showAuthenticated(false)
  }
}

async function bootstrapSession(bearer) {
  const response = await sessionCookieRequest('/remote/v1/session/bootstrap', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearer}`
    }
  })
  if (!response.ok) throw new Error('AUTH_FAILED')
  const session = await response.json()
  if (!session.authenticated || !session.csrfToken)
    throw new Error('AUTH_FAILED')
  state.csrfToken = String(session.csrfToken)
  showAuthenticated(true)
}

function createText(tag, text, className = '') {
  const node = document.createElement(tag)
  if (className) node.className = className
  node.textContent = text
  return node
}

function authorOf(comic) {
  return String(comic.canonicalAuthor || comic.author || t('unknownAuthor'))
}

function countOf(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function cardForComic(comic, options = {}) {
  const article = document.createElement('article')
  article.className = 'card'

  const image = document.createElement('img')
  image.className = 'card-cover'
  image.loading = 'lazy'
  image.decoding = 'async'
  image.referrerPolicy = 'no-referrer'
  image.alt = ''
  image.src = `/api/v1/covers/${encodeURIComponent(comic.comicId)}`
  image.addEventListener('error', () => {
    image.removeAttribute('src')
    image.alt = 'Pica Library'
  })
  article.append(image)

  const body = document.createElement('div')
  body.className = 'card-body'
  body.append(
    createText('h3', String(comic.title || comic.comicId)),
    createText('p', authorOf(comic))
  )
  if (options.statusText)
    body.append(createText('p', options.statusText))

  const actions = document.createElement('div')
  const open = createText('button', t('open'))
  open.type = 'button'
  open.addEventListener('click', () => void openDetail(comic.comicId))
  actions.append(open)

  if (options.readable) {
    const read = createText('button', t('read'))
    read.type = 'button'
    read.addEventListener('click', () =>
      void openReader(comic.comicId, String(comic.title || comic.comicId))
    )
    actions.append(read)
  }
  body.append(actions)
  article.append(body)
  return article
}

function renderCards(container, comics, emptyKey, options = () => ({})) {
  container.replaceChildren()
  if (!comics.length) {
    container.append(createText('p', t(emptyKey), 'muted'))
    return
  }
  for (const comic of comics)
    container.append(cardForComic(comic, options(comic)))
}

async function loadLibrary() {
  const container = $('#library-results')
  container.replaceChildren(createText('p', t('loading'), 'muted'))
  const result = await postJson('/api/v1/library/query', {
    scope: 'library',
    text: $('#search-input').value.trim() || undefined,
    tags: [],
    tagMode: 'all',
    limit: 80
  })
  const items = Array.isArray(result.items) ? result.items : []
  $('#library-count').textContent = t('total', {
    count: Number(result.total ?? items.length)
  })
  renderCards(container, items, 'emptyLibrary', (comic) => ({
    readable: countOf(comic.downloadedPictures) > 0,
    statusText:
      countOf(comic.downloadedPictures) > 0
        ? `${t('downloadedPages')}: ${countOf(comic.downloadedPictures)}`
        : ''
  }))
}

async function loadShelves() {
  const list = $('#shelf-list')
  const items = $('#shelf-items')
  list.replaceChildren(createText('p', t('loading'), 'muted'))
  items.replaceChildren()
  const shelves = await api('/api/v1/shelves')
  list.replaceChildren()
  if (!Array.isArray(shelves) || !shelves.length) {
    list.append(createText('p', t('emptyShelves'), 'muted'))
    return
  }

  const openShelf = async (shelf, button) => {
    list.querySelectorAll('button').forEach((node) =>
      node.classList.toggle('active', node === button)
    )
    items.replaceChildren(createText('p', t('loading'), 'muted'))
    const result = await api(
      `/api/v1/shelves/${encodeURIComponent(shelf.id)}`
    )
    const comics = Array.isArray(result.items) ? result.items : []
    renderCards(items, comics, 'emptyShelf', (comic) => ({
      readable: countOf(comic.downloadedPictures) > 0,
      statusText:
        countOf(comic.downloadedPictures) > 0
          ? `${t('downloadedPages')}: ${countOf(comic.downloadedPictures)}`
          : ''
    }))
  }

  shelves.forEach((shelf, index) => {
    const button = createText(
      'button',
      `${shelf.name} · ${Number(shelf.count || 0)}`
    )
    button.type = 'button'
    button.addEventListener('click', () => void openShelf(shelf, button))
    list.append(button)
    if (index === 0) void openShelf(shelf, button)
  })
}

async function loadDownloaded() {
  const container = $('#downloaded-results')
  container.replaceChildren(createText('p', t('loading'), 'muted'))
  const records = await api('/api/v1/downloaded')
  const comics = Array.isArray(records) ? records : []
  $('#downloaded-count').textContent = t('total', { count: comics.length })
  renderCards(container, comics, 'emptyDownloaded', (comic) => ({
    readable: countOf(comic.downloadedPictures) > 0,
    statusText:
      `${t('chapters')}: ${countOf(comic.downloadedChapters)} · ${t('pages')}: ${countOf(comic.downloadedPictures)}`
  }))
}

async function renderActiveView() {
  setMessage('#app-message')
  try {
    if (state.activeView === 'library') await loadLibrary()
    else if (state.activeView === 'shelves') await loadShelves()
    else await loadDownloaded()
  } catch (error) {
    if (error.message !== 'SESSION_EXPIRED')
      setMessage('#app-message', error.message || t('requestFailed'), true)
  }
}

function selectView(view) {
  state.activeView = view
  document.querySelectorAll('.tabs [data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view)
  })
  for (const name of ['library', 'shelves', 'downloaded'])
    $(`#view-${name}`).hidden = name !== view
  $('#detail-panel').hidden = true
  $('#reader-panel').hidden = true
  void renderActiveView()
}

function appendMeta(list, key, value) {
  if (value === undefined || value === null || value === '') return
  list.append(createText('dt', key), createText('dd', String(value)))
}

function renderDetail(comic) {
  state.currentDetail = comic
  $('#detail-title').textContent = String(comic.title || comic.comicId)
  $('#detail-author').textContent = authorOf(comic)
  $('#detail-cover').src =
    `/api/v1/covers/${encodeURIComponent(comic.comicId)}`

  const tags = $('#detail-tags')
  tags.replaceChildren()
  for (const tag of Array.isArray(comic.tags) ? comic.tags.slice(0, 20) : [])
    tags.append(createText('span', String(tag), 'tag'))

  const meta = $('#detail-meta')
  meta.replaceChildren()
  appendMeta(meta, t('pages'), countOf(comic.downloadedPictures))
  appendMeta(meta, t('chapters'), countOf(comic.knownChapters || comic.episodesCount || comic.epsCount))
  if (typeof comic.finished === 'boolean')
    appendMeta(meta, t('finished'), comic.finished ? t('yes') : t('no'))

  const read = $('#detail-read')
  read.disabled = countOf(comic.downloadedPictures) <= 0
  read.onclick = () =>
    void openReader(comic.comicId, String(comic.title || comic.comicId))
  $('#detail-panel').hidden = false
  $('#detail-panel').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function openDetail(comicId) {
  setMessage('#app-message', t('loading'))
  try {
    const comic = await api(
      `/api/v1/comics/${encodeURIComponent(comicId)}`
    )
    renderDetail(comic)
    setMessage('#app-message')
  } catch (error) {
    if (error.message !== 'SESSION_EXPIRED')
      setMessage('#app-message', error.message || t('requestFailed'), true)
  }
}

async function openReader(comicId, title) {
  setMessage('#app-message', t('loading'))
  try {
    const chapters = await api(
      `/api/v1/reader/comics/${encodeURIComponent(comicId)}/chapters`
    )
    const readable = (Array.isArray(chapters) ? chapters : []).filter(
      (chapter) => countOf(chapter.downloadedPictures) > 0
    )
    if (!readable.length) throw new Error(t('noReadableChapters'))
    state.reader = {
      comicId,
      title,
      chapters: readable,
      chapter: null,
      pageIndex: 0
    }
    $('#reader-title').textContent = title
    const select = $('#reader-chapter')
    select.replaceChildren()
    for (const chapter of readable) {
      const option = document.createElement('option')
      option.value = chapter.id
      option.textContent = String(chapter.title || chapter.id)
      select.append(option)
    }
    $('#reader-panel').hidden = false
    $('#detail-panel').hidden = true
    await loadReaderChapter(readable[0].id)
    $('#reader-panel').scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMessage('#app-message')
  } catch (error) {
    if (error.message !== 'SESSION_EXPIRED')
      setMessage('#app-message', error.message || t('requestFailed'), true)
  }
}

async function loadReaderChapter(episodeId) {
  const chapter = await api(
    `/api/v1/reader/comics/${encodeURIComponent(state.reader.comicId)}/chapters/${encodeURIComponent(episodeId)}`
  )
  state.reader.chapter = chapter
  state.reader.pageIndex = 0
  $('#reader-chapter').value = episodeId
  renderReaderPage()
}

function renderReaderPage() {
  const chapter = state.reader.chapter
  const pages = Array.isArray(chapter?.pages) ? chapter.pages : []
  const index = Math.max(
    0,
    Math.min(state.reader.pageIndex, Math.max(0, pages.length - 1))
  )
  state.reader.pageIndex = index
  const image = $('#reader-image')
  const empty = $('#reader-empty')
  if (!pages.length) {
    image.removeAttribute('src')
    image.hidden = true
    empty.hidden = false
    $('#reader-position').textContent = t('pagePosition', { page: 0, total: 0 })
  } else {
    image.hidden = false
    empty.hidden = true
    image.src = pages[index].url
    $('#reader-position').textContent = t('pagePosition', {
      page: index + 1,
      total: pages.length
    })
  }
  $('#reader-prev').disabled = !pages.length || index <= 0
  $('#reader-next').disabled = !pages.length || index >= pages.length - 1
}

$('#language-select').addEventListener('change', (event) => {
  state.language = COPY[event.target.value] ? event.target.value : 'en'
  applyLanguage()
})

$('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const input = $('#bearer-input')
  const bearer = input.value.trim()
  if (!bearer) return
  setMessage('#auth-message', t('connecting'))
  try {
    await bootstrapSession(bearer)
    input.value = ''
    setMessage('#auth-message')
    setMessage('#app-message', t('connected'))
    await renderActiveView()
  } catch {
    input.value = ''
    showAuthenticated(false)
    setMessage('#auth-message', t('authFailed'), true)
  }
})

$('#logout').addEventListener('click', async () => {
  try {
    if (state.authenticated && state.csrfToken)
      await api('/remote/v1/session/logout', { method: 'POST' })
  } catch {
    // Local UI must still clear even when the server session is already gone.
  }
  showAuthenticated(false)
  setMessage('#auth-message')
})

document.querySelectorAll('.tabs [data-view]').forEach((button) => {
  button.addEventListener('click', () => selectView(button.dataset.view))
})

$('#search-form').addEventListener('submit', (event) => {
  event.preventDefault()
  if (state.activeView === 'library') void loadLibrary()
})

$('#detail-close').addEventListener('click', () => {
  $('#detail-panel').hidden = true
})

$('#reader-close').addEventListener('click', () => {
  $('#reader-panel').hidden = true
  state.reader.chapter = null
  $('#reader-image').removeAttribute('src')
})

$('#reader-chapter').addEventListener('change', (event) => {
  void loadReaderChapter(event.target.value).catch((error) => {
    if (error.message !== 'SESSION_EXPIRED')
      setMessage('#app-message', error.message || t('requestFailed'), true)
  })
})

$('#reader-prev').addEventListener('click', () => {
  state.reader.pageIndex -= 1
  renderReaderPage()
})

$('#reader-next').addEventListener('click', () => {
  state.reader.pageIndex += 1
  renderReaderPage()
})

async function registerPwaShell() {
  if (!('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/remote/sw.js', {
      scope: '/remote/'
    })
  } catch {
    // PWA installation is optional; the online Remote Web shell stays usable.
  }
}

applyLanguage()
void registerPwaShell()
void restoreSession()
