import { copy as t } from './locale-runtime.js'

let dialog, host = null, session = null, csrf = '', active = null, generation = 0, offset = 0, hasNext = false, expiryTimer = null
const $ = id => document.getElementById('host-library-' + id)
function node(tag, value) { const element = document.createElement(tag); element.textContent = value; return element }
function button(id, caption, action) { const element = node('button', caption); element.type = 'button'; element.id = 'host-library-' + id; element.onclick = action; return element }
function endOnExit() {
    active?.abort()
    if (session && csrf) void fetch('/api/v1/desktop/host-reader', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pica-csrf': csrf }, body: JSON.stringify({ action: 'close', sessionId: session.sessionId }), keepalive: true }).catch(() => {})
    session = null
    clearTimeout(expiryTimer); expiryTimer = null
    document.dispatchEvent(new CustomEvent('pica-hosted-reading-scope-changed'))
    if ($('password')) { $('password').value = ''; $('username').value = '' }
}
/** Volatile authority only; never publish credentials or persist the session in a library row. */
export function currentHostedLibrarySession() {
    return session && Number.isSafeInteger(session.expiresAt) && session.expiresAt > Date.now()
        ? { sessionId: session.sessionId, expiresAt: session.expiresAt }
        : null
}
export async function resumeHostedLibraryComic(comicId, expectedSessionId) {
    if (currentHostedLibrarySession()?.sessionId !== expectedSessionId) throw Error('SOURCE_HOST_CANCELLED')
    const success = await working(async () => {
        const selected = await command({ action: 'select', sessionId: expectedSessionId, comicId })
        document.dispatchEvent(new CustomEvent('pica-open-hosted-reader', { detail: { ...selected, csrfToken: csrf } }))
        dialog.close()
    })
    if (!success) throw Error('SOURCE_HOST_UNAVAILABLE')
}
function makeDialog() {
    dialog = document.createElement('dialog'); dialog.id = 'host-library-dialog'; dialog.style.maxWidth = 'min(900px, 96vw)'; dialog.style.overflowWrap = 'anywhere'
    dialog.append(node('h2', t('我的宿主书库', 'My hosted library', '自分のホスト書庫')))
    const title = node('p', ''); title.id = 'host-library-title'; dialog.append(title)
    dialog.append(node('p', t('内容来自你自行管理的宿主，不是本软件提供的目录。会话仅在本次 Desktop 中保留 15 分钟，凭据不保存或同步。', 'Content comes from your own host, not an app-operated catalogue. This Desktop-only session lasts 15 minutes; credentials are not saved or synced.', '本アプリの配信カタログではなく、自分で管理するホストの内容です。Desktop 専用セッションは15分で終了し、認証情報は保存・同期しません。')))
    const form = document.createElement('form'); form.id = 'host-library-form'; form.method = 'post'; form.className = 'settings-form'
    for (const [id, caption, type, max] of [['username', t('本次宿主用户名', 'Host username for this session', '今回のホストユーザー名'), 'text', 256], ['password', t('本次宿主密码', 'Host password for this session', '今回のホストパスワード'), 'password', 4096]]) {
        const label = document.createElement('label'), input = document.createElement('input'); input.id = 'host-library-' + id; input.type = type; input.maxLength = max; input.autocomplete = type === 'password' ? 'new-password' : 'off'; label.append(node('span', caption), input); form.append(label)
    }
    const consent = document.createElement('label'), check = document.createElement('input'); check.type = 'checkbox'; check.id = 'host-library-consent'; check.required = true
    consent.className = 'wide'; consent.append(check, node('span', t('我授权读取自己宿主的书库和页面，并理解宿主可自行缓存内容、执行已配置的进度同步；不授权修改收藏、来源或设置。', 'I authorize reading my hosted library/pages and understand the host may cache content and run its configured progress sync. This does not authorize changes to favorites, sources or settings.', '自分のホスト書庫・ページの読み取りを許可し、ホスト独自のキャッシュ・設定済み進捗同期が動く場合があると理解します。お気に入り・配信元・設定の変更は許可しません。')))
    const start = button('start', t('建立本次阅读会话', 'Start this reading session', '今回の読書セッションを開始'), () => {}); start.type = 'submit'
    form.append(consent, start); form.onsubmit = event => { event.preventDefault(); if (form.reportValidity()) void startSession() }; dialog.append(form)
    const status = node('p', ''); status.id = 'host-library-state'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); dialog.append(status)
    const books = document.createElement('div'); books.id = 'host-library-books'; dialog.append(books)
    dialog.append(button('previous', t('上一页', 'Previous page', '前のページ'), () => void list(Math.max(0, offset - 25))), button('next', t('下一页', 'Next page', '次のページ'), () => void list(offset + 25)), button('end', t('结束会话', 'End session', 'セッション終了'), () => { generation++; endOnExit(); books.replaceChildren(); controls(); status.textContent = t('会话已结束；阅读记录保留。', 'Session ended; reading records are retained.', 'セッションを終了しました。閲覧記録は保持します。') }), button('hide', t('关闭面板', 'Close panel', 'パネルを閉じる'), () => dialog.close()))
    dialog.addEventListener('close', () => { $('password').value = ''; $('username').value = '' })
    document.body.append(dialog)
}
function controls() {
    for (const item of $('books').querySelectorAll('button')) item.disabled = Boolean(active) || !session
    for (const id of ['start', 'username', 'password', 'consent']) $(id).disabled = Boolean(active) || Boolean(session)
    $('username').required = $('password').required = host?.authMode === 'basic'
    $('username').closest('label').hidden = $('password').closest('label').hidden = host?.authMode !== 'basic'
    $('previous').disabled = Boolean(active) || !session || offset <= 0
    $('next').disabled = Boolean(active) || !session || !hasNext || offset >= 5000
    $('end').disabled = !session && !active
}
async function command(input) {
    const controller = active, ticket = generation
    const response = await fetch('/api/v1/desktop/host-reader', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pica-csrf': csrf }, body: JSON.stringify(input), signal: active.signal, cache: 'no-store' })
    const value = await response.json()
    if (controller.signal.aborted || ticket !== generation) throw new DOMException('Cancelled', 'AbortError')
    if (!response.ok) throw new Error(value.code || 'SOURCE_HOST_UNAVAILABLE')
    return value
}
async function working(action) {
    if (active) return
    const ticket = generation, controller = new AbortController(); active = controller; controls()
    const timer = setTimeout(() => controller.abort(), 19000)
    $('state').textContent = t('正在读取你的宿主…', 'Reading your host…', '自分のホストを読み取り中…')
    try { await action(); if (ticket === generation) $('state').textContent = t('仅显示你的宿主书库；没有导入到本地书库。', 'Showing your hosted library only; nothing imported into the local catalogue.', '自分のホスト書庫のみ表示しています。ローカル書庫には取り込んでいません。'); return true }
    catch (error) { if (ticket === generation) { if (['SOURCE_HOST_CANCELLED', 'SOURCE_HOST_DISABLED'].includes(error.message)) { session = null; clearTimeout(expiryTimer); document.dispatchEvent(new CustomEvent('pica-hosted-reading-scope-changed')) } $('state').textContent = t('无法继续。请检查宿主、权限或重新建立会话。', 'Cannot continue. Check the host/permissions or start a new session.', '続行できません。ホスト・権限を確認するか、セッションを作り直してください。') + (/^SOURCE_HOST_[A-Z_]+$/.test(error.message || '') ? ` (${error.message})` : '') }; return false }
    finally { clearTimeout(timer); $('password').value = ''; $('username').value = ''; if (active === controller) active = null; controls() }
}
function render(value) {
    if (!Array.isArray(value.books) || value.books.length > 25 || typeof value.hasNext !== 'boolean') throw Error('SOURCE_HOST_PROTOCOL')
    offset = value.offset; hasNext = value.hasNext; $('books').replaceChildren()
    if (!value.books.length) $('books').append(node('p', t('宿主书库本页没有作品。请在你自己的宿主中管理来源和书库。', 'No hosted-library items on this page. Manage sources and your library on your own host.', 'このページに作品はありません。配信元・書庫は自分のホストで管理してください。')))
    for (const book of value.books) {
        const card = document.createElement('article'); card.className = 'panel'; card.append(node('strong', book.title), node('p', t('宿主来源 ID：', 'Host source ID: ', 'ホスト配信元 ID: ') + book.sourceId))
        card.append(button('read-' + book.comicId, t('阅读', 'Read', '読む'), () => void working(async () => { const selected = await command({ action: 'select', sessionId: session.sessionId, comicId: book.comicId }); document.dispatchEvent(new CustomEvent('pica-open-hosted-reader', { detail: { ...selected, csrfToken: csrf } })); dialog.close() })))
        $('books').append(card)
    }
}
async function startSession() {
    const auth = host.authMode === 'basic' ? { mode: 'basic', username: $('username').value, password: $('password').value } : { mode: 'none' }
    await working(async () => {
        const response = await fetch('/api/v1/desktop/status', { signal: active.signal, cache: 'no-store' }), status = await response.json()
        if (!response.ok || !status.configured || status.startupReady === false || !status.hostedLibraryReader?.available || !status.csrfToken) throw Error('SOURCE_HOST_UNAVAILABLE')
        csrf = status.csrfToken
        const value = await command({ action: 'start', id: host.id, expectedRevision: host.revision, auth, consent: $('consent').checked, scope: 'library-read', acceptHostFetchSideEffects: $('consent').checked })
        if (!/^[0-9a-f-]{36}$/.test(value.sessionId || '') || value.capabilities?.libraryRead !== true || value.capabilities.libraryImport !== false) throw Error('SOURCE_HOST_PROTOCOL')
        session = value
        clearTimeout(expiryTimer)
        if (Number.isSafeInteger(value.expiresAt)) expiryTimer = setTimeout(() => { generation++; endOnExit(); $('books').replaceChildren(); controls(); $('state').textContent = t('本次阅读会话已到期；请重新明确授权。', 'This reading session expired. Authorize a new session explicitly.', '読書セッションの有効期限が切れました。改めて明示的に許可してください。') }, Math.max(0, value.expiresAt - Date.now()))
        document.dispatchEvent(new CustomEvent('pica-hosted-reading-scope-changed'))
        render(await command({ action: 'list', sessionId: session.sessionId, offset: 0 }))
        if (Array.isArray(value.history) && value.history.length) {
            $('books').prepend(node('h3', t('最近阅读（可继续）', 'Recent reading (resume)', '最近の閲覧（再開）')))
            for (const book of value.history.slice(0, 100)) $('books').append(button('resume-' + book.comicId, t('继续：', 'Resume: ', '再開: ') + book.title, () => void working(async () => { const selected = await command({ action: 'select', sessionId: session.sessionId, comicId: book.comicId }); document.dispatchEvent(new CustomEvent('pica-open-hosted-reader', { detail: { ...selected, csrfToken: csrf } })); dialog.close() })))
        }
    })
}
async function list(nextOffset) { await working(async () => render(await command({ action: 'list', sessionId: session.sessionId, offset: nextOffset }))) }
document.addEventListener('pica-host-library-config', event => {
    const input = event instanceof CustomEvent ? event.detail : null
    if (!input || !/^[0-9a-f-]{36}$/.test(input.id || '') || !input.enabled) return
    if (!dialog) makeDialog()
    if (host?.id !== input.id || host?.revision !== input.revision) { generation++; endOnExit(); host = input; $('books').replaceChildren(); $('consent').checked = false; offset = 0; hasNext = false }
    $('title').textContent = host.label + ' · ' + host.endpoint; controls(); dialog.showModal()
})
document.addEventListener('pica-host-connections-snapshot', event => {
    const values = event instanceof CustomEvent ? event.detail?.hosts : null
    if (!host || !session || !Array.isArray(values) || values.length > 16 || values.some(value => !value || typeof value.id !== 'string' || !Number.isSafeInteger(value.revision) || typeof value.enabled !== 'boolean')) return
    const current = values.find(value => value.id === host.id)
    if (!current?.enabled || current.revision !== host.revision) {
        generation++; endOnExit(); $('books').replaceChildren(); controls()
        $('state').textContent = t('宿主权限已改变；请重新明确授权。阅读记录未删除。', 'Host permissions changed. Authorize a new session explicitly; reading records were not deleted.', 'ホストの権限が変更されました。改めて明示的に許可してください。読書記録は削除していません。')
    }
})
window.addEventListener('pagehide', endOnExit)
