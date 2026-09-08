const $ = (selector) => document.querySelector(selector)
let desktop = null
let progressTimer = null

async function api(path, init = {}) {
    const response = await fetch(path, { cache: 'no-store', ...init })
    const text = await response.text()
    let value = null
    try { value = text ? JSON.parse(text) : null } catch { value = { error: text } }
    if (!response.ok) throw new Error(value?.error || `HTTP ${response.status}`)
    return value
}

async function post(path, body) {
    if (!desktop) desktop = await api('/api/v1/desktop/status')
    return api(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-pica-csrf': desktop.csrfToken },
        body: JSON.stringify(body)
    })
}

function formValue(action) {
    return {
        remoteStorageAction: action,
        remoteStorage: {
            kind: 'webdav',
            baseUrl: $('#remote-webdav-url').value.trim(),
            root: $('#remote-root').value.trim() || 'PicaLibrary',
            username: $('#remote-username').value.trim(),
            password: $('#remote-password').value
        }
    }
}

function bytes(value) {
    const number = Number(value || 0)
    if (number < 1024) return `${number} B`
    if (number < 1024 ** 2) return `${(number / 1024).toFixed(1)} KB`
    if (number < 1024 ** 3) return `${(number / 1024 ** 2).toFixed(1)} MB`
    return `${(number / 1024 ** 3).toFixed(2)} GB`
}

function message(text, bad = false) {
    const node = $('#remote-storage-message')
    if (!node) return
    node.textContent = text
    node.style.color = bad ? '#b42318' : ''
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function percent(value, total) {
    const t = Number(total || 0)
    return t > 0 ? Math.max(0, Math.min(100, Math.round((Number(value || 0) / t) * 100))) : 0
}

function ensureProgressBox() {
    let box = $('#remote-sync-progress')
    if (box) return box
    const anchor = $('#remote-storage-message')
    if (!anchor) return null
    box = document.createElement('div')
    box.id = 'remote-sync-progress'
    box.hidden = true
    box.style.margin = '12px 0'
    box.innerHTML = `
        <p><strong>同步进度</strong> <span id="remote-progress-phase" class="status"></span></p>
        <p class="status">整库 · <span id="remote-progress-overall-text">0/0 本 · 0/0 页 · 0 B</span></p>
        <progress id="remote-progress-overall" max="100" value="0" style="width:100%;height:14px"></progress>
        <p class="status" style="margin-top:8px">当前 · <strong id="remote-progress-current-title">准备中</strong> · <span id="remote-progress-current-text">0/0 页</span></p>
        <progress id="remote-progress-current" max="100" value="0" style="width:100%;height:14px"></progress>`
    anchor.insertAdjacentElement('afterend', box)
    return box
}

function renderProgress(progress) {
    const box = ensureProgressBox()
    if (!box || !progress) return
    const visible = ['scanning', 'uploading', 'publishing', 'complete', 'failed'].includes(progress.phase)
    box.hidden = !visible
    if (!visible) return
    $('#remote-progress-overall').value = percent(progress.completedPages, progress.totalPages)
    $('#remote-progress-current').value = percent(progress.currentComicCompletedPages, progress.currentComicPages)
    $('#remote-progress-overall-text').textContent = `${progress.completedComics || 0}/${progress.totalComics || 0} 本 · ${progress.completedPages || 0}/${progress.totalPages || 0} 页 · ${bytes(progress.uploadedBytes)}`
    $('#remote-progress-current-title').textContent = progress.currentComicTitle || '准备中'
    $('#remote-progress-current-text').textContent = progress.currentComicPages > 0 ? `${progress.currentComicCompletedPages || 0}/${progress.currentComicPages} 页` : (progress.message || '')
    $('#remote-progress-phase').textContent = progress.message || progress.phase || ''
}

async function pollProgress() {
    try {
        const status = await api('/api/v1/desktop/status')
        desktop = status
        renderProgress(status.remoteStorage?.syncProgress)
    } catch {}
}
function startProgressPolling() { stopProgressPolling(); pollProgress(); progressTimer = setInterval(pollProgress, 700) }
function stopProgressPolling() { if (progressTimer) clearInterval(progressTimer); progressTimer = null }

function renderPlan(plan) {
    const box = $('#remote-sync-plan')
    if (!box) return
    box.hidden = false
    $('#remote-plan-local').textContent = String(plan.localComicCount ?? 0)
    $('#remote-plan-remote').textContent = String(plan.remoteComicCount ?? 0)
    $('#remote-plan-upload').textContent = String(plan.uploadComicCount ?? 0)
    $('#remote-plan-unchanged').textContent = String(plan.unchangedComicCount ?? 0)
    $('#remote-plan-retained').textContent = String(plan.retainedRemoteOnlyCount ?? 0)
    $('#remote-plan-pages').textContent = String(plan.uploadPages ?? 0)
    $('#remote-plan-bytes').textContent = bytes(plan.uploadBytes)
    const list = $('#remote-plan-list'); list.innerHTML = ''
    for (const comic of (plan.comics || []).filter((item) => item.action !== 'unchanged').slice(0, 120)) {
        const row = document.createElement('div'); row.className = 'list-item'
        const detail = comic.action === 'skip'
            ? `跳过 · ${escapeHtml(comic.reason || '本地文件不完整')}`
            : `${comic.action === 'update' ? '更新' : '新增'} · ${comic.pages || 0} 页 · ${bytes(comic.bytes)}`
        row.innerHTML = `<div class="grow"><strong>${escapeHtml(comic.title || comic.comicId)}</strong><p>${detail}</p></div>`
        list.appendChild(row)
    }
}

async function load() {
    const panel = $('#settings-remote-storage'); if (!panel) return
    ensureProgressBox()
    try {
        desktop = await api('/api/v1/desktop/status')
        const remote = desktop.remoteStorage || {}
        $('#remote-webdav-url').value = remote.baseUrl || ''
        $('#remote-root').value = remote.root || 'PicaLibrary'
        $('#remote-username').value = ''; $('#remote-password').value = ''
        $('#remote-storage-state').textContent = remote.configured ? `已配置 ${remote.kind || 'webdav'} · ${remote.root || 'PicaLibrary'}` : '尚未配置远程存储'
        renderProgress(remote.syncProgress)
    } catch (error) { message(`无法读取远程存储状态：${error.message}`, true) }
}

$('#remote-test')?.addEventListener('click', async () => {
    message('正在测试 WebDAV…')
    try { const result = await post('/api/v1/desktop/test-connection', formValue('test')); message(`连接成功 · HTTP ${result.status} · ${result.root}`) }
    catch (error) { message(`连接失败：${error.message}`, true) }
})
$('#remote-save')?.addEventListener('click', async () => {
    message('正在保存远程存储设置…')
    try { await post('/api/v1/desktop/settings', formValue('save')); $('#remote-password').value = ''; message('远程存储设置已保存。密码已进入 Windows DPAPI 凭据存储。'); await load() }
    catch (error) { message(`保存失败：${error.message}`, true) }
})
$('#remote-plan')?.addEventListener('click', async () => {
    message('正在扫描本地漫画与云端目录…首次扫描会计算文件哈希。')
    try {
        const result = await post('/api/v1/desktop/test-connection', formValue('plan')); renderPlan(result)
        const skipped = Number(result.skippedComicCount || 0)
        message(`扫描完成：${result.uploadComicCount || 0} 部需要上传/更新，预计 ${bytes(result.uploadBytes)}${skipped ? `；${skipped} 部因本地文件不完整将跳过。` : '。'}`)
    } catch (error) { message(`扫描失败：${error.message}`, true) }
})
$('#remote-sync')?.addEventListener('click', async () => {
    if (!confirm('开始增量同步？首次同步会在每一本完整上传后发布一个可读 generation；不会暴露半本漫画。')) return
    message('正在同步到网盘。页面会实时显示整库和当前漫画进度。')
    const button = $('#remote-sync'); button.disabled = true; startProgressPolling()
    try {
        const result = await post('/api/v1/desktop/settings', formValue('sync')); $('#remote-password').value = ''; await pollProgress()
        const skipped = Number(result.skippedComicCount || 0)
        message(`同步完成 · 云端 ${result.comicCount || 0} 部 · 上传 ${result.uploadedObjects || 0} 个对象 · ${bytes(result.uploadedBytes)}${skipped ? ` · 跳过 ${skipped} 部` : ''}。`)
        $('#remote-sync-plan').hidden = true; await load()
    } catch (error) { await pollProgress(); message(`同步失败：${error.message}`, true) }
    finally { stopProgressPolling(); button.disabled = false }
})

load()
