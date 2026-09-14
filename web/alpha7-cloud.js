const $ = (selector) => document.querySelector(selector)
let desktop = null
let progressTimer = null
let selectedTargetId = ''
let creatingTarget = false
let remoteState = { targets: [], presets: [] }

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

function ensureTargetUi() {
    const panel = $('#settings-remote-storage')
    const form = panel?.querySelector('.settings-form')
    if (!panel || !form || $('#remote-target-select')) return

    const targetLabel = document.createElement('label')
    targetLabel.textContent = '已配置网盘'
    const targetSelect = document.createElement('select')
    targetSelect.id = 'remote-target-select'
    targetLabel.append(targetSelect)

    const vendorLabel = document.createElement('label')
    vendorLabel.textContent = '网盘类型'
    const vendor = document.createElement('select')
    vendor.id = 'remote-vendor'
    vendorLabel.append(vendor)

    const nameLabel = document.createElement('label')
    nameLabel.textContent = '显示名称'
    const name = document.createElement('input')
    name.id = 'remote-label'
    name.placeholder = '例如：我的 123 云盘'
    nameLabel.append(name)

    form.prepend(nameLabel)
    form.prepend(vendorLabel)
    form.prepend(targetLabel)

    const providerNote = document.createElement('p')
    providerNote.id = 'remote-provider-note'
    providerNote.className = 'status'
    form.insertAdjacentElement('afterend', providerNote)

    const tools = document.createElement('div')
    tools.id = 'remote-target-tools'
    tools.className = 'actions'
    const create = document.createElement('button')
    create.type = 'button'
    create.id = 'remote-new-target'
    create.textContent = '新增网盘配置'
    tools.append(create)
    providerNote.insertAdjacentElement('afterend', tools)

    targetSelect.addEventListener('change', () => {
        selectedTargetId = targetSelect.value
        creatingTarget = false
        fillTarget(remoteState.targets.find((item) => item.id === selectedTargetId))
        $('#remote-sync-plan').hidden = true
        message('')
    })
    vendor.addEventListener('change', () => applyPreset(true))
    create.addEventListener('click', () => beginNewTarget())
}

function renderPresetOptions() {
    const select = $('#remote-vendor')
    if (!select) return
    const current = select.value
    select.innerHTML = ''
    for (const preset of remoteState.presets || []) {
        const option = document.createElement('option')
        option.value = preset.vendor
        option.textContent = preset.label
        select.append(option)
    }
    if ([...select.options].some((option) => option.value === current))
        select.value = current
}

function renderTargetOptions() {
    const select = $('#remote-target-select')
    if (!select) return
    select.innerHTML = ''
    if (!remoteState.targets.length) {
        const option = document.createElement('option')
        option.value = ''
        option.textContent = '尚未配置'
        select.append(option)
        return
    }
    for (const target of remoteState.targets) {
        const option = document.createElement('option')
        option.value = target.id
        option.textContent = `${target.label} · ${target.vendor || 'generic'}`
        select.append(option)
    }
    if (!remoteState.targets.some((item) => item.id === selectedTargetId))
        selectedTargetId = remoteState.targets[0].id
    select.value = selectedTargetId
}

function currentPreset() {
    return (remoteState.presets || []).find(
        (preset) => preset.vendor === ($('#remote-vendor')?.value || 'generic')
    )
}

function applyPreset(forceUrl = false) {
    const preset = currentPreset()
    if (!preset) return
    const url = $('#remote-webdav-url')
    const user = $('#remote-username')
    const password = $('#remote-password')
    if (url) {
        if (preset.defaultBaseUrl && (forceUrl || !url.value.trim()))
            url.value = preset.defaultBaseUrl
        url.placeholder = preset.urlHint || 'https://dav.example.com/path'
    }
    if (user) user.placeholder = `${preset.usernameHint || '用户名'} · 留空沿用已保存值`
    if (password) password.placeholder = `${preset.passwordHint || '密码'} · 留空沿用已保存值`
    const note = $('#remote-provider-note')
    if (note) note.textContent = preset.note || ''
}

function fillTarget(target) {
    if (!target) return
    $('#remote-label').value = target.label || ''
    $('#remote-vendor').value = target.vendor || 'generic'
    $('#remote-webdav-url').value = target.baseUrl || ''
    $('#remote-root').value = target.root || 'PicaLibrary'
    $('#remote-username').value = ''
    $('#remote-password').value = ''
    applyPreset(false)
}

function beginNewTarget() {
    creatingTarget = true
    selectedTargetId = ''
    $('#remote-target-select').value = ''
    $('#remote-label').value = ''
    $('#remote-vendor').value = 'generic'
    $('#remote-webdav-url').value = ''
    $('#remote-root').value = 'PicaLibrary'
    $('#remote-username').value = ''
    $('#remote-password').value = ''
    applyPreset(false)
    $('#remote-sync-plan').hidden = true
    message('正在新增网盘配置。填写后先“测试连接”，确认无误再保存。')
}

function editableForm(action) {
    return {
        remoteStorageAction: action,
        ...(selectedTargetId && !creatingTarget ? { remoteTargetId: selectedTargetId } : {}),
        ...(creatingTarget ? { createNewTarget: true } : {}),
        remoteStorage: {
            kind: 'webdav',
            vendor: $('#remote-vendor').value || 'generic',
            label: $('#remote-label').value.trim(),
            baseUrl: $('#remote-webdav-url').value.trim(),
            root: $('#remote-root').value.trim() || 'PicaLibrary',
            username: $('#remote-username').value.trim(),
            password: $('#remote-password').value
        }
    }
}

function savedTargetRequest(action) {
    if (creatingTarget || !selectedTargetId)
        throw new Error('请先保存当前网盘配置，再执行扫描或上传')
    return { remoteStorageAction: action, remoteTargetId: selectedTargetId }
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
    const target = progress.targetLabel ? ` · ${progress.targetLabel}` : ''
    $('#remote-progress-phase').textContent = `${progress.message || progress.phase || ''}${target}`
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

async function load(preferredTargetId = '') {
    const panel = $('#settings-remote-storage'); if (!panel) return
    ensureTargetUi()
    ensureProgressBox()
    try {
        desktop = await api('/api/v1/desktop/status')
        remoteState = desktop.remoteStorage || { targets: [], presets: [] }
        if (preferredTargetId) selectedTargetId = preferredTargetId
        renderPresetOptions()
        renderTargetOptions()
        if (remoteState.targets.length) {
            creatingTarget = false
            fillTarget(remoteState.targets.find((item) => item.id === selectedTargetId))
        } else {
            beginNewTarget()
        }
        $('#remote-storage-state').textContent = remoteState.targets.length
            ? `已配置 ${remoteState.targets.length} 个网盘 · 上传前请选择目标网盘`
            : '尚未配置远程存储'
        renderProgress(remoteState.syncProgress)
    } catch (error) { message(`无法读取远程存储状态：${error.message}`, true) }
}

$('#remote-test')?.addEventListener('click', async () => {
    message('正在测试 WebDAV…')
    try {
        const result = await post('/api/v1/desktop/test-connection', editableForm('test'))
        message(`连接成功 · ${result.label} · HTTP ${result.status} · ${result.root}`)
    } catch (error) { message(`连接失败：${error.message}`, true) }
})

$('#remote-save')?.addEventListener('click', async () => {
    message('正在保存网盘配置…')
    try {
        const result = await post('/api/v1/desktop/settings', editableForm('save'))
        $('#remote-password').value = ''
        selectedTargetId = result.targetId || selectedTargetId
        creatingTarget = false
        message('网盘配置已保存。密码已进入 Windows DPAPI 凭据存储。')
        await load(selectedTargetId)
    } catch (error) { message(`保存失败：${error.message}`, true) }
})

$('#remote-plan')?.addEventListener('click', async () => {
    message('正在扫描本地漫画与所选网盘目录…首次扫描会计算文件哈希。')
    try {
        const result = await post('/api/v1/desktop/test-connection', savedTargetRequest('plan'))
        renderPlan(result)
        const skipped = Number(result.skippedComicCount || 0)
        const target = remoteState.targets.find((item) => item.id === selectedTargetId)?.label || '所选网盘'
        message(`${target} 扫描完成：${result.uploadComicCount || 0} 部需要上传/更新，预计 ${bytes(result.uploadBytes)}${skipped ? `；${skipped} 部因本地文件不完整将跳过。` : '。'}`)
    } catch (error) { message(`扫描失败：${error.message}`, true) }
})

$('#remote-sync')?.addEventListener('click', async () => {
    let request
    try { request = savedTargetRequest('sync') }
    catch (error) { message(error.message, true); return }
    const target = remoteState.targets.find((item) => item.id === selectedTargetId)?.label || '所选网盘'
    if (!confirm(`把已下载漫画增量同步到「${target}」？不会上传到其他已配置网盘。`)) return
    message(`正在同步到「${target}」。页面会实时显示整库和当前漫画进度。`)
    const button = $('#remote-sync'); button.disabled = true; startProgressPolling()
    try {
        const result = await post('/api/v1/desktop/settings', request)
        await pollProgress()
        const skipped = Number(result.skippedComicCount || 0)
        message(`同步完成 · ${target} · 云端 ${result.comicCount || 0} 部 · 上传 ${result.uploadedObjects || 0} 个对象 · ${bytes(result.uploadedBytes)}${skipped ? ` · 跳过 ${skipped} 部` : ''}。`)
        $('#remote-sync-plan').hidden = true
        await load(selectedTargetId)
    } catch (error) { await pollProgress(); message(`同步失败：${error.message}`, true) }
    finally { stopProgressPolling(); button.disabled = false }
})

load()
