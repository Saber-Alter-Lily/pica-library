const $ = (selector) => document.querySelector(selector)

const state = {
  authenticated: false,
  activeView: 'downloaded',
  previousView: 'downloaded',
  currentComic: null
}

function setConnection(text, tone = 'neutral') {
  const node = $('#connection-state')
  node.textContent = text
  node.dataset.tone = tone
}

function setMessage(text = '', error = false) {
  const node = $('#global-message')
  node.textContent = text
  node.classList.toggle('error', error)
}

function showAuthenticated(authenticated) {
  state.authenticated = authenticated
  $('#login-panel').hidden = authenticated
  $('#app-shell').hidden = !authenticated
  $('#logout').hidden = !authenticated
  setConnection(authenticated ? 'Connected' : 'Locked')
}

function showLoginMessage(text = '', error = false) {
  const node = $('#login-message')
  node.textContent = text
  node.classList.toggle('error', error)
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.headers || {})
    }
  })
  if (response.status === 401) {
    showAuthenticated(false)
    throw new Error('会话已失效，请重新登录。')
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const value = await response.json()
      if (value?.error) message = String(value.error)
    } catch {}
    throw new Error(message)
  }
  const type = response.headers.get('content-type') || ''
  return type.includes('application/json') ? response.json() : response
}

function comicId(comic) {
  return String(comic?.comicId || comic?.id || '')
}

function comicAuthor(comic) {
  return String(comic?.canonicalAuthor || comic?.author || '')
}

function clear(node) {
  while (node.firstChild) node.firstChild.remove()
}

function empty(node, text) {
  clear(node)
  const value = document.createElement('div')
  value.className = 'empty'
  value.textContent = text
  node.append(value)
}

function comicCard(comic) {
  const id = comicId(comic)
  const card = document.createElement('article')
  card.className = 'card'
  card.tabIndex = 0
  card.setAttribute('role', 'button')

  const image = document.createElement('img')
  image.loading = 'lazy'
  image.alt = ''
  image.src = id ? `/api/v1/covers/${encodeURIComponent(id)}` : '/remote/icon.svg'
  image.addEventListener('error', () => {
    image.src = '/remote/icon.svg'
  }, { once: true })

  const body = document.createElement('div')
  body.className = 'card-body'
  const title = document.createElement('h3')
  title.className = 'card-title'
  title.textContent = String(comic?.title || 'Untitled')
  const meta = document.createElement('p')
  meta.className = 'card-meta'
  meta.textContent = comicAuthor(comic) || 'Unknown author'
  body.append(title, meta)
  card.append(image, body)

  const open = () => id && void openComic(id)
  card.addEventListener('click', open)
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open()
    }
  })
  return card
}

function renderComics(node, comics, emptyText) {
  clear(node)
  const values = Array.isArray(comics) ? comics : []
  if (!values.length) {
    empty(node, emptyText)
    return
  }
  for (const comic of values) node.append(comicCard(comic))
}

function showView(name) {
  state.activeView = name
  document.querySelectorAll('.view').forEach((view) => {
    view.hidden = view.id !== `${name}-view`
  })
  document.querySelectorAll('.tabs [data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === name)
  })
}

async function loadDownloaded() {
  setMessage('正在读取已下载内容…')
  try {
    const values = await api('/api/v1/downloaded')
    renderComics($('#downloaded-list'), values, 'Server 上还没有已下载内容。')
    setMessage('')
  } catch (error) {
    setMessage(error.message, true)
  }
}

async function searchLibrary(text = '') {
  setMessage('正在搜索书库…')
  try {
    const value = await api('/api/v1/library/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scope: 'favorites',
        text: String(text || '').trim(),
        limit: 60
      })
    })
    renderComics(
      $('#search-list'),
      value?.items || [],
      '没有匹配的收藏内容。'
    )
    setMessage('')
  } catch (error) {
    setMessage(error.message, true)
  }
}

async function loadShelves() {
  const host = $('#shelf-list')
  clear(host)
  empty($('#shelf-contents'), '选择一个书架查看内容。')
  setMessage('正在读取书架…')
  try {
    const shelves = await api('/api/v1/shelves')
    if (!Array.isArray(shelves) || !shelves.length) {
      const note = document.createElement('span')
      note.className = 'empty'
      note.textContent = '还没有书架。'
      host.append(note)
      setMessage('')
      return
    }
    for (const shelf of shelves) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = String(shelf?.name || 'Shelf')
      button.addEventListener('click', () => void openShelf(String(shelf?.id || '')))
      host.append(button)
    }
    setMessage('')
  } catch (error) {
    setMessage(error.message, true)
  }
}

async function openShelf(id) {
  if (!id) return
  setMessage('正在读取书架内容…')
  try {
    const value = await api(`/api/v1/shelves/${encodeURIComponent(id)}`)
    renderComics(
      $('#shelf-contents'),
      value?.items || [],
      '这个书架当前没有内容。'
    )
    setMessage('')
  } catch (error) {
    setMessage(error.message, true)
  }
}

function appendText(parent, tag, text, className) {
  const node = document.createElement(tag)
  if (className) node.className = className
  node.textContent = text
  parent.append(node)
  return node
}

async function openComic(id) {
  state.previousView = ['downloaded', 'search', 'shelves'].includes(state.activeView)
    ? state.activeView
    : state.previousView
  setMessage('正在读取详情…')
  try {
    const [comic, chapters] = await Promise.all([
      api(`/api/v1/comics/${encodeURIComponent(id)}`),
      api(`/api/v1/reader/comics/${encodeURIComponent(id)}/chapters`)
        .catch(() => [])
    ])
    state.currentComic = comic
    const host = $('#detail-content')
    clear(host)

    const hero = document.createElement('div')
    hero.className = 'detail-hero'
    const image = document.createElement('img')
    image.className = 'detail-cover'
    image.alt = ''
    image.src = `/api/v1/covers/${encodeURIComponent(id)}`
    image.addEventListener('error', () => {
      image.src = '/remote/icon.svg'
    }, { once: true })

    const info = document.createElement('div')
    appendText(info, 'h2', String(comic?.title || 'Untitled'))
    appendText(info, 'p', comicAuthor(comic) || 'Unknown author', 'detail-meta')
    if (comic?.description) appendText(info, 'p', String(comic.description))

    const tags = [
      ...(Array.isArray(comic?.categories) ? comic.categories : []),
      ...(Array.isArray(comic?.tags) ? comic.tags : [])
    ].slice(0, 30)
    if (tags.length) {
      const row = document.createElement('div')
      row.className = 'tag-row'
      for (const value of tags) appendText(row, 'span', String(value), 'tag')
      info.append(row)
    }

    hero.append(image, info)
    host.append(hero)

    const chapterHost = document.createElement('div')
    chapterHost.className = 'chapter-list'
    appendText(chapterHost, 'h3', '已下载章节')
    const values = Array.isArray(chapters) ? chapters : []
    if (!values.length) {
      appendText(chapterHost, 'p', '没有可远程阅读的已下载章节。', 'detail-meta')
    } else {
      for (const chapter of values) {
        const button = document.createElement('button')
        button.type = 'button'
        const count = Number(chapter?.downloadedPictures || 0)
        button.textContent = `${String(chapter?.title || 'Chapter')}${count ? ` · ${count} pages` : ''}`
        button.addEventListener('click', () =>
          void openChapter(id, String(chapter?.id || ''), String(chapter?.title || 'Chapter'))
        )
        chapterHost.append(button)
      }
    }
    host.append(chapterHost)
    showView('detail')
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'instant' })
  } catch (error) {
    setMessage(error.message, true)
  }
}

async function openChapter(comicIdValue, episodeId, title) {
  if (!episodeId) return
  setMessage('正在读取章节…')
  try {
    const chapter = await api(
      `/api/v1/reader/comics/${encodeURIComponent(comicIdValue)}/chapters/${encodeURIComponent(episodeId)}`
    )
    const pages = Array.isArray(chapter?.pages) ? chapter.pages : []
    const host = $('#reader-pages')
    clear(host)
    $('#reader-title').textContent = title
    if (!pages.length) {
      empty(host, '这个章节没有可读取页面。')
    } else {
      for (const page of pages) {
        const image = document.createElement('img')
        image.loading = 'lazy'
        image.decoding = 'async'
        image.alt = ''
        image.src = String(page?.url || '')
        host.append(image)
      }
    }
    showView('reader')
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'instant' })
  } catch (error) {
    setMessage(error.message, true)
  }
}

async function sessionStatus() {
  try {
    const response = await fetch('/remote/session', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' }
    })
    if (!response.ok) return false
    const value = await response.json()
    return value?.authenticated === true
  } catch {
    return false
  }
}

async function login(token) {
  const response = await fetch('/remote/session', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ token })
  })
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? '访问令牌无效。'
        : `登录失败（${response.status}）。`
    )
  }
}

async function logout() {
  try {
    await fetch('/remote/session', {
      method: 'DELETE',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' }
    })
  } finally {
    showAuthenticated(false)
    $('#access-token').value = ''
    showLoginMessage('已退出。')
  }
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const tokenInput = $('#access-token')
  const token = tokenInput.value
  tokenInput.value = ''
  showLoginMessage('正在建立安全会话…')
  try {
    await login(token)
    showAuthenticated(true)
    showLoginMessage('')
    showView('downloaded')
    await loadDownloaded()
  } catch (error) {
    showAuthenticated(false)
    showLoginMessage(error.message, true)
  }
})

$('#logout').addEventListener('click', () => void logout())
$('#refresh-downloaded').addEventListener('click', () => void loadDownloaded())
$('#refresh-shelves').addEventListener('click', () => void loadShelves())
$('#search-form').addEventListener('submit', (event) => {
  event.preventDefault()
  void searchLibrary($('#search-text').value)
})
$('#detail-back').addEventListener('click', () => showView(state.previousView))
$('#reader-back').addEventListener('click', () => showView('detail'))

document.querySelectorAll('.tabs [data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    const view = button.dataset.view
    showView(view)
    if (view === 'downloaded') void loadDownloaded()
    if (view === 'shelves') void loadShelves()
  })
})

window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/remote/sw.js', { scope: '/remote/' })
      .catch(() => undefined)
  }
})

;(async () => {
  const authenticated = await sessionStatus()
  showAuthenticated(authenticated)
  if (authenticated) {
    showView('downloaded')
    await loadDownloaded()
  } else {
    showLoginMessage(navigator.onLine ? '' : '当前离线。静态界面可打开，但私人书库需要重新联网。')
  }
})()
