import { copy as t } from './locale-runtime.js'

let dialog, host = null, session = null, csrf = '', active = null, generation = 0, offset = 0, hasNext = false, expiryTimer = null
let scope = 'library-read', selectedSource = null, searchQuery = '', searchPage = 0
let downloadTarget = null, downloadPoll = null, downloadPending = false, downloadGeneration = 0
const $ = id => document.getElementById('host-library-' + id)
function node(tag, value) { const element = document.createElement(tag); element.textContent = value; return element }
function button(id, caption, action) { const element = node('button', caption); element.type = 'button'; element.id = 'host-library-' + id; element.onclick = action; return element }
function endOnExit() {
    active?.abort()
    if (session && csrf) void fetch('/api/v1/desktop/host-reader', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pica-csrf': csrf }, body: JSON.stringify({ action: 'close', sessionId: session.sessionId }), keepalive: true }).catch(() => {})
    session = null
    selectedSource = null; searchQuery = ''; searchPage = 0; offset = 0; hasNext = false
    clearTimeout(expiryTimer); expiryTimer = null
    resetDownloads()
    document.dispatchEvent(new CustomEvent('pica-hosted-reading-scope-changed'))
    if ($('password')) { $('password').value = ''; $('username').value = '' }
    if ($('query')) { $('query').value = ''; $('source').replaceChildren() }
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
    const heading = node('h2', ''); heading.id = 'host-library-heading'; dialog.append(heading)
    const title = node('p', ''); title.id = 'host-library-title'; dialog.append(title)
    dialog.append(node('p', t('内容来自你自行管理的宿主，不是本软件提供的目录。会话仅在本次 Desktop 中保留 15 分钟，凭据不保存或同步。', 'Content comes from your own host, not an app-operated catalogue. This Desktop-only session lasts 15 minutes; credentials are not saved or synced.', '本アプリの配信カタログではなく、自分で管理するホストの内容です。Desktop 専用セッションは15分で終了し、認証情報は保存・同期しません。')))
    const form = document.createElement('form'); form.id = 'host-library-form'; form.method = 'post'; form.className = 'settings-form'
    for (const [id, caption, type, max] of [['username', t('本次宿主用户名', 'Host username for this session', '今回のホストユーザー名'), 'text', 256], ['password', t('本次宿主密码', 'Host password for this session', '今回のホストパスワード'), 'password', 4096]]) {
        const label = document.createElement('label'), input = document.createElement('input'); input.id = 'host-library-' + id; input.type = type; input.maxLength = max; input.autocomplete = type === 'password' ? 'new-password' : 'off'; label.append(node('span', caption), input); form.append(label)
    }
    const consent = document.createElement('label'), check = document.createElement('input'); check.type = 'checkbox'; check.id = 'host-library-consent'; check.required = true
    const consentText = node('span', ''); consentText.id = 'host-library-consent-text'
    consent.className = 'wide'; consent.append(check, consentText)
    const start = button('start', t('建立本次阅读会话', 'Start this reading session', '今回の読書セッションを開始'), () => {}); start.type = 'submit'
    form.append(consent, start); form.onsubmit = event => { event.preventDefault(); if (form.reportValidity()) void startSession() }; dialog.append(form)
    const sourceControls = document.createElement('section'); sourceControls.id = 'host-library-source-controls'
    sourceControls.append(node('p', t('只列出你在宿主上已安装的来源。选定一个后本次会话不能换源；结束会话后可重新选择。不会安装扩展或修改来源设置。', 'Only sources already installed on your host are listed. This session is bound to one chosen source; end it to choose another. No extensions are installed or source settings changed.', '自分のホストに導入済みの配信元のみ表示します。選択後はこのセッションで変更できず、終了後に選び直せます。拡張機能の導入・配信元設定の変更は行いません。')))
    const sourceLabel = document.createElement('label'), sourceSelect = document.createElement('select'); sourceSelect.id = 'host-library-source'
    sourceLabel.append(node('span', t('本次来源', 'Source for this session', '今回の配信元')), sourceSelect)
    sourceControls.append(sourceLabel, button('bind-source', t('确认只使用所选来源', 'Confirm this source only', 'この配信元のみ使用を確認'), () => void bindSource()))
    dialog.append(sourceControls)
    const searchForm = document.createElement('form'); searchForm.id = 'host-library-search-form'; searchForm.method = 'post'
    const queryLabel = document.createElement('label'), query = document.createElement('input'); query.id = 'host-library-query'; query.maxLength = 256; query.required = true; query.autocomplete = 'off'
    queryLabel.append(node('span', t('在自己选择的来源中搜索', 'Search your chosen source', '自分で選んだ配信元を検索')), query)
    const search = button('search', t('搜索', 'Search', '検索'), () => {}); search.type = 'submit'
    searchForm.append(queryLabel, search); searchForm.onsubmit = event => { event.preventDefault(); if (searchForm.reportValidity()) void searchBooks(1, query.value.trim()) }
    dialog.append(searchForm)
    const status = node('p', ''); status.id = 'host-library-state'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); dialog.append(status)
    const books = document.createElement('div'); books.id = 'host-library-books'; dialog.append(books)
    makeDownloadPanel()
    dialog.append(button('previous', t('上一页', 'Previous page', '前のページ'), () => void navigate(-1)), button('next', t('下一页', 'Next page', '次のページ'), () => void navigate(1)), button('end', t('结束会话', 'End session', 'セッション終了'), () => { generation++; endOnExit(); books.replaceChildren(); controls(); status.textContent = t('会话已结束；阅读记录保留。', 'Session ended; reading records are retained.', 'セッションを終了しました。閲覧記録は保持します。') }), button('hide', t('关闭面板', 'Close panel', 'パネルを閉じる'), () => dialog.close()))
    dialog.addEventListener('close', () => { $('password').value = ''; $('username').value = ''; clearTimeout(downloadPoll); downloadPoll = null })
    document.body.append(dialog)
}
function controls() {
    const discovery = scope === 'source-search-read'
    $('source-controls').hidden = !discovery; $('search-form').hidden = !discovery || !selectedSource
    $('source').disabled = $('bind-source').disabled = Boolean(active) || !session || Boolean(selectedSource) || !$('source').value
    $('query').disabled = $('search').disabled = Boolean(active) || !session || !selectedSource
    for (const item of $('books').querySelectorAll('button')) item.disabled = Boolean(active) || !session
    for (const id of ['start', 'username', 'password', 'consent']) $(id).disabled = Boolean(active) || Boolean(session)
    $('username').required = $('password').required = host?.authMode === 'basic'
    $('username').closest('label').hidden = $('password').closest('label').hidden = host?.authMode !== 'basic'
    $('previous').disabled = Boolean(active) || !session || (discovery && selectedSource ? searchPage <= 1 : offset <= 0)
    $('next').disabled = Boolean(active) || !session || !hasNext || (discovery && selectedSource ? searchPage >= 200 : offset >= 5000)
    $('end').disabled = !session && !active
    if ($('download-start')) {
        for (const id of ['download-chapter', 'download-consent', 'download-start']) $(id).disabled = Boolean(active) || !session || !downloadTarget
        $('download-refresh').disabled = !session || downloadPending
    }
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
    $('state').textContent = t('正在处理本次操作…', 'Processing this action…', '今回の操作を処理中…')
    try { await action(); if (ticket === generation) $('state').textContent = t('仅处理你的自选宿主；搜索和章节读取可能更新其元数据/缓存。浏览不会自动保存本地内容，只有你单独确认的章节才会保存。', 'Only your chosen host is used; search/chapter requests may update its metadata/cache. Browsing never saves content locally; only separately confirmed chapters are saved.', '自分で選んだホストのみ使用し、検索・章取得でメタデータ・キャッシュが更新される場合があります。閲覧だけでローカル保存はせず、別途確認した章のみ保存します。'); return true }
    catch (error) { if (ticket === generation) { if (['SOURCE_HOST_CANCELLED', 'SOURCE_HOST_DISABLED'].includes(error.message)) { session = null; clearTimeout(expiryTimer); document.dispatchEvent(new CustomEvent('pica-hosted-reading-scope-changed')) } $('state').textContent = t('无法继续。请检查宿主、权限或重新建立会话。', 'Cannot continue. Check the host/permissions or start a new session.', '続行できません。ホスト・権限を確認するか、セッションを作り直してください。') + (/^SOURCE_HOST_[A-Z_]+$/.test(error.message || '') ? ` (${error.message})` : '') }; return false }
    finally { clearTimeout(timer); $('password').value = ''; $('username').value = ''; if (active === controller) active = null; controls() }
}
function render(value) {
    const discovery = scope === 'source-search-read'
    if (!Array.isArray(value.books) || value.books.length > (discovery ? 100 : 25) || typeof value.hasNext !== 'boolean' ||
        discovery && (value.sourceId !== selectedSource?.id || typeof value.query !== 'string' || !Number.isSafeInteger(value.page) || value.page < 1 || value.page > 200)) throw Error('SOURCE_HOST_PROTOCOL')
    if (discovery) { searchPage = value.page; searchQuery = value.query } else offset = value.offset
    hasNext = value.hasNext; $('books').replaceChildren()
    if (!value.books.length) $('books').append(node('p', discovery ? t('此来源本页没有搜索结果；可修改关键词，或结束会话后选择其他来源。', 'No search results on this page. Change the query, or end this session to choose another source.', 'このページに検索結果はありません。キーワードを変更するか、セッションを終了して別の配信元を選んでください。') : t('宿主书库本页没有作品。请在你自己的宿主中管理来源和书库。', 'No hosted-library items on this page. Manage sources and your library on your own host.', 'このページに作品はありません。配信元・書庫は自分のホストで管理してください。')))
    for (const book of value.books) {
        const card = document.createElement('article'); card.className = 'panel'; card.append(node('strong', book.title), node('p', t('宿主来源 ID：', 'Host source ID: ', 'ホスト配信元 ID: ') + book.sourceId))
        card.append(button('read-' + book.comicId, t('阅读', 'Read', '読む'), () => void working(async () => { const selected = await command({ action: 'select', sessionId: session.sessionId, comicId: book.comicId }); document.dispatchEvent(new CustomEvent('pica-open-hosted-reader', { detail: { ...selected, csrfToken: csrf } })); dialog.close() })))
        if (session?.capabilities?.downloads === true) card.append(button('save-' + book.comicId, t('保存章节到本地…', 'Save a chapter locally…', '章をローカルに保存…'), () => void chooseDownload(book)))
        $('books').append(card)
    }
}
async function startSession() {
    const auth = host.authMode === 'basic' ? { mode: 'basic', username: $('username').value, password: $('password').value } : { mode: 'none' }
    await working(async () => {
        const response = await fetch('/api/v1/desktop/status', { signal: active.signal, cache: 'no-store' }), status = await response.json()
        if (!response.ok || !status.configured || status.startupReady === false || !(scope === 'source-search-read' ? status.hostedSourceBrowser?.available : status.hostedLibraryReader?.available) || !status.csrfToken) throw Error('SOURCE_HOST_UNAVAILABLE')
        csrf = status.csrfToken
        const discovery = scope === 'source-search-read'
        const value = await command({ action: 'start', id: host.id, expectedRevision: host.revision, auth, consent: $('consent').checked, scope, acceptHostFetchSideEffects: $('consent').checked,
            ...(discovery ? { acceptHostCatalogueSideEffects: $('consent').checked } : {}) })
        if (!/^[0-9a-f-]{36}$/.test(value.sessionId || '') || (discovery ? value.capabilities?.providerSearch !== true : value.capabilities?.libraryRead !== true) || value.capabilities.libraryImport !== false) throw Error('SOURCE_HOST_PROTOCOL')
        session = value
        clearTimeout(expiryTimer)
        if (Number.isSafeInteger(value.expiresAt)) expiryTimer = setTimeout(() => { generation++; endOnExit(); $('books').replaceChildren(); controls(); $('state').textContent = t('本次阅读会话已到期；请重新明确授权。', 'This reading session expired. Authorize a new session explicitly.', '読書セッションの有効期限が切れました。改めて明示的に許可してください。') }, Math.max(0, value.expiresAt - Date.now()))
        document.dispatchEvent(new CustomEvent('pica-hosted-reading-scope-changed'))
        if (discovery) { renderSources(await command({ action: 'sources', sessionId: session.sessionId, offset: 0 })); return }
        render(await command({ action: 'list', sessionId: session.sessionId, offset: 0 }))
        renderHistory(value.history)
    })
}
function resetDownloads() {
    downloadGeneration++; downloadTarget = null; downloadPending = false
    clearTimeout(downloadPoll); downloadPoll = null
    if ($('download-panel')) { $('download-panel').hidden = true; $('download-chapter').replaceChildren(); $('download-consent').checked = false; $('download-jobs').replaceChildren(); $('download-title').textContent = '' }
}
function makeDownloadPanel() {
    const panel = document.createElement('section'); panel.id = 'host-library-download-panel'; panel.className = 'panel'; panel.hidden = true
    panel.append(node('h3', t('保存到我的本地书库', 'Save to my local library', '自分のローカル書庫に保存')))
    panel.append(node('p', t('只保存你确认的完整章节；不加入宿主的下载队列，也不会自动保存其他作品。任务仅在当前会话有效：结束会话或关闭程序会取消未完成任务，重启后不会自动联网恢复。已经保存的完整副本仍保留，之后可不依赖宿主离线阅读。', 'Only the confirmed complete chapter is saved. No host download queue or other books are added. Jobs belong to this session: ending it or closing the app cancels unfinished work; restarting never resumes network work automatically. Complete saved copies remain readable offline without the host.', '確認した完全な章のみ保存し、ホストのダウンロードキューや他の作品は追加しません。未完了の処理はセッション終了・アプリ終了で中止され、再起動時に自動接続しません。保存済みの完全なコピーはホストなしで読めます。')))
    const title = node('p', ''); title.id = 'host-library-download-title'; panel.append(title)
    const form = document.createElement('form'); form.id = 'host-library-download-form'; form.method = 'post'
    const label = document.createElement('label'), chapters = document.createElement('select'); chapters.id = 'host-library-download-chapter'
    label.append(node('span', t('本次章节', 'Chapter to save', '保存する章')), chapters)
    const consent = document.createElement('label'), check = document.createElement('input'); check.type = 'checkbox'; check.required = true; check.id = 'host-library-download-consent'
    consent.append(check, node('span', t('我确认保存所选章节为独立本地副本；已有同章副本会在完整保存成功后替换，取消不会删除已保存副本。', 'I confirm an independent local copy of this chapter. An existing copy is replaced only after a complete save; cancellation does not delete saved copies.', '選択した章を独立したローカルコピーとして保存します。既存の同じ章は完全な保存成功後のみ置き換え、中止しても保存済みコピーは削除しません。')))
    const save = button('download-start', t('确认保存所选章节', 'Confirm chapter save', '選択した章の保存を確認'), () => {}); save.type = 'submit'
    form.append(label, consent, save); form.onsubmit = event => { event.preventDefault(); if (check.checked && chapters.value) void queueDownload() }
    panel.append(form, button('download-refresh', t('刷新保存进度', 'Refresh save progress', '保存状況を更新'), () => void refreshDownloads()))
    const jobs = document.createElement('div'); jobs.id = 'host-library-download-jobs'; jobs.setAttribute('aria-live', 'polite'); panel.append(jobs)
    dialog.append(panel)
}
async function chooseDownload(book) {
    await working(async () => {
        const value = await command({ action: 'download-chapters', sessionId: session.sessionId, comicId: book.comicId })
        if (!Array.isArray(value.chapters) || value.chapters.length > 2000 || value.chapters.some(chapter => !/^host-chapter:[a-f0-9]{64}$/.test(chapter.id || '') || typeof chapter.title !== 'string')) throw Error('SOURCE_HOST_PROTOCOL')
        downloadGeneration++; downloadPending = false; clearTimeout(downloadPoll); downloadTarget = { comicId: book.comicId, title: book.title }
        $('download-title').textContent = book.title; $('download-panel').hidden = false; $('download-consent').checked = false; $('download-chapter').replaceChildren()
        for (const chapter of value.chapters) { const option = node('option', chapter.title); option.value = chapter.id; $('download-chapter').append(option) }
        if (!value.chapters.length) { downloadTarget = null; $('download-title').textContent = t('此作品暂无可保存章节。', 'No chapters are available to save.', '保存できる章がありません。') }
    })
}
async function queueDownload() {
    if (!downloadTarget || !$('download-consent').checked) return
    await working(async () => {
        await command({ action: 'download-start', sessionId: session.sessionId, comicId: downloadTarget.comicId, episodeId: $('download-chapter').value, consent: true, acceptLocalCopy: true })
        $('download-consent').checked = false
    })
    if (session) await refreshDownloads()
}
function renderDownloads(value) {
    if (value.sessionBound !== true || !Array.isArray(value.jobs) || value.jobs.length > 50 || value.jobs.some(job => !/^[a-f0-9-]{36}$/.test(job.id || '') || !['QUEUED', 'PREPARING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status) || !Number.isSafeInteger(job.progressCompleted) || !Number.isSafeInteger(job.progressTotal) || job.progressCompleted < 0 || job.progressTotal < 0)) throw Error('SOURCE_HOST_PROTOCOL')
    $('download-jobs').replaceChildren()
    const captions = { QUEUED: t('排队中', 'Queued', '待機中'), PREPARING: t('准备中', 'Preparing', '準備中'), RUNNING: t('保存中', 'Saving', '保存中'), COMPLETED: t('已完整保存，可离线阅读', 'Saved completely; ready offline', '保存完了・オフライン読書可能'), FAILED: t('保存失败；旧副本保留，可重新确认保存', 'Save failed; old copies retained. Confirm another save to retry.', '保存失敗・以前のコピーは保持。再確認して再試行できます。'), CANCELLED: t('已取消；已保存副本未删除', 'Cancelled; saved copies were not deleted', '中止・保存済みコピーは削除していません') }
    for (const job of value.jobs) {
        const row = document.createElement('article')
        const caption = job.status === 'RUNNING' && job.phase === 'waiting-resources' ? t('等待其他读写任务释放资源', 'Waiting for other disk tasks to release resources', '他の読み書き処理の完了待ち') : captions[job.status]
        row.append(node('p', (job.comicTitle || '') + ' · ' + (job.chapterTitle || '') + ' — ' + caption))
        row.append(node('p', t('已读取页面：', 'Pages fetched: ', '取得済みページ: ') + job.progressCompleted + '/' + job.progressTotal + (job.cancelRequested && !['COMPLETED', 'CANCELLED', 'FAILED'].includes(job.status) ? t(' · 正在取消，等待清理', ' · Cancelling; waiting for cleanup', ' · 中止・後処理中') : '')))
        if (!['COMPLETED', 'CANCELLED', 'FAILED'].includes(job.status)) {
            const cancel = button('download-cancel-' + job.id, t('取消此任务', 'Cancel this job', 'この処理を中止'), () => void working(async () => { await command({ action: 'download-cancel', sessionId: session.sessionId, jobId: job.id }); await refreshDownloads() }))
            cancel.disabled = job.cancelRequested; row.append(cancel)
        }
        if (job.status === 'COMPLETED') {
            if (!/^local:[a-f0-9]{64}$/.test(job.localComicId || '')) throw Error('SOURCE_HOST_PROTOCOL')
            if (job.cancelRequested) row.append(node('p', t('取消到达前已完整保存；已保存副本不会自动删除。', 'The complete save was accepted before cancellation; the saved copy is not deleted.', '中止前に保存が完了したため、保存済みコピーは削除しません。')))
            if (job.previousGenerationRetained) row.append(node('p', t('新副本已可用；旧临时副本暂未清理。', 'The new copy is available; an old temporary copy could not yet be removed.', '新しいコピーは利用可能ですが、古い一時コピーをまだ削除できていません。')))
            row.append(button('download-read-' + job.id, t('本地阅读', 'Read locally', 'ローカルで読む'), () => { document.dispatchEvent(new CustomEvent('pica-open-reader', { detail: { comicId: job.localComicId, online: false } })); dialog.close() }))
        }
        $('download-jobs').append(row)
    }
    return value.jobs.some(job => !['COMPLETED', 'CANCELLED', 'FAILED'].includes(job.status))
}
async function refreshDownloads() {
    if (!session || downloadPending) return
    const ticket = generation, selectedSession = session.sessionId, downloadTicket = downloadGeneration, controller = new AbortController()
    downloadPending = true; clearTimeout(downloadPoll); controls()
    const timer = setTimeout(() => controller.abort(), 19000)
    try {
        const response = await fetch('/api/v1/desktop/host-reader', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pica-csrf': csrf }, cache: 'no-store', signal: controller.signal, body: JSON.stringify({ action: 'downloads', sessionId: selectedSession }) }), value = await response.json()
        if (ticket !== generation || downloadTicket !== downloadGeneration || session?.sessionId !== selectedSession || controller.signal.aborted) return
        if (!response.ok) throw Error(value.code || 'SOURCE_HOST_UNAVAILABLE')
        const pending = renderDownloads(value)
        if (pending && dialog.open) downloadPoll = setTimeout(() => void refreshDownloads(), 1000)
    } catch (error) {
        if (ticket === generation && session?.sessionId === selectedSession) $('download-jobs').textContent = t('暂时无法读取保存进度。可手动刷新；请勿因此重复添加任务。', 'Save progress is unavailable. Refresh manually; do not add duplicate jobs.', '保存状況を取得できません。手動更新してください。重複追加は不要です。')
    } finally { clearTimeout(timer); if (ticket === generation && downloadTicket === downloadGeneration) { downloadPending = false; controls() } }
}
async function list(nextOffset) { await working(async () => render(await command({ action: 'list', sessionId: session.sessionId, offset: nextOffset }))) }
function renderHistory(history) {
    if (!Array.isArray(history) || !history.length) return
    $('books').append(node('h3', t('最近阅读（可继续）', 'Recent reading (resume)', '最近の閲覧（再開）')))
    for (const book of history.slice(0, 100)) $('books').append(button('resume-' + book.comicId, t('继续：', 'Resume: ', '再開: ') + book.title, () => void working(async () => { const selected = await command({ action: 'select', sessionId: session.sessionId, comicId: book.comicId }); document.dispatchEvent(new CustomEvent('pica-open-hosted-reader', { detail: { ...selected, csrfToken: csrf } })); dialog.close() })))
}
function renderSources(value) {
    if (!Array.isArray(value.sources) || value.sources.length > 25 || typeof value.hasNext !== 'boolean' || !Number.isSafeInteger(value.offset)) throw Error('SOURCE_HOST_PROTOCOL')
    offset = value.offset; hasNext = value.hasNext; $('source').replaceChildren(); $('books').replaceChildren()
    for (const source of value.sources) {
        if (typeof source.id !== 'string' || typeof source.name !== 'string' || typeof source.language !== 'string') throw Error('SOURCE_HOST_PROTOCOL')
        const option = node('option', source.name + ' · ' + source.language + ' · ' + source.id); option.value = source.id; $('source').append(option)
    }
    $('source').value = value.sources[0]?.id || ''
    if (!value.sources.length) $('books').append(node('p', t('本页没有已安装来源；请在你自己的宿主中管理扩展。软件不会安装或启用来源。', 'No installed sources on this page. Manage extensions on your own host; this app does not install or enable them.', 'このページに導入済み配信元はありません。拡張機能は自分のホストで管理してください。本アプリから導入・有効化はしません。')))
}
async function bindSource() {
    const sourceId = $('source').value
    await working(async () => {
        const value = await command({ action: 'bind-source', sessionId: session.sessionId, sourceId, consent: true })
        if (value.selectedSource?.id !== sourceId) throw Error('SOURCE_HOST_PROTOCOL')
        selectedSource = value.selectedSource; hasNext = false; searchPage = 0; $('books').replaceChildren(); renderHistory(value.history)
        document.dispatchEvent(new CustomEvent('pica-hosted-reading-scope-changed'))
    })
}
async function searchBooks(page, query) {
    if (!session || !selectedSource || !query) return
    await working(async () => render(await command({ action: 'search', sessionId: session.sessionId, query, page })))
}
async function navigate(direction) {
    if (scope === 'library-read') return list(Math.max(0, offset + direction * 25))
    if (selectedSource) return searchBooks(searchPage + direction, searchQuery)
    return working(async () => renderSources(await command({ action: 'sources', sessionId: session.sessionId, offset: Math.max(0, offset + direction * 25) })))
}
function configure(event, requestedScope) {
    const input = event instanceof CustomEvent ? event.detail : null
    if (!input || !/^[0-9a-f-]{36}$/.test(input.id || '') || !input.enabled) return
    if (!dialog) makeDialog()
    if (host?.id !== input.id || host?.revision !== input.revision || scope !== requestedScope) { generation++; endOnExit(); host = input; scope = requestedScope; $('books').replaceChildren(); $('consent').checked = false; offset = 0; hasNext = false }
    const discovery = scope === 'source-search-read'
    $('heading').textContent = discovery ? t('浏览我选择的来源', 'Browse my chosen source', '自分で選んだ配信元を閲覧') : t('我的宿主书库', 'My hosted library', '自分のホスト書庫')
    $('start').textContent = discovery ? t('授权并列出已安装来源', 'Authorize and list installed sources', '許可して導入済み配信元を表示') : t('建立本次阅读会话', 'Start this reading session', '今回の読書セッションを開始')
    $('consent-text').textContent = discovery ? t('我另行授权列出自己宿主已安装的来源，确认选定一个后搜索和阅读。搜索/取章节会更新宿主元数据并可能取回、缓存内容或执行宿主同步；不授权安装扩展、修改收藏/来源/设置或下载任务。', 'I separately authorize listing my host’s installed sources, then explicitly choosing one to search/read. Search/chapter requests update host metadata and may fetch/cache content or run host sync. No extension installation, favorites/source/settings changes or download jobs are authorized.', 'ホストに導入済み配信元の表示と、1つを明示選択した後の検索・読書を別途許可します。検索・章取得はホストのメタデータ更新・取得・キャッシュ・同期を伴う場合があります。拡張導入・お気に入り・配信元設定の変更・ダウンロードは許可しません。') : t('我授权读取自己宿主的书库和页面，并理解宿主可自行缓存内容、执行已配置的进度同步；不授权修改收藏、来源或设置。', 'I authorize reading my hosted library/pages and understand the host may cache content and run its configured progress sync. This does not authorize changes to favorites, sources or settings.', '自分のホスト書庫・ページの読み取りを許可し、ホスト独自のキャッシュ・設定済み進捗同期が動く場合があると理解します。お気に入り・配信元・設定の変更は許可しません。')
    $('title').textContent = host.label + ' · ' + host.endpoint; controls(); dialog.showModal()
}
document.addEventListener('pica-host-library-config', event => configure(event, 'library-read'))
document.addEventListener('pica-host-source-config', event => configure(event, 'source-search-read'))
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
