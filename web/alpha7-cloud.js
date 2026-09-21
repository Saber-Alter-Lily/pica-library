import { copy as t } from './locale-runtime.js'

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
    targetLabel.textContent = t('已配置网盘','Configured storage','設定済みストレージ')
    const targetSelect = document.createElement('select')
    targetSelect.id = 'remote-target-select'
    targetLabel.append(targetSelect)

    const vendorLabel = document.createElement('label')
    vendorLabel.textContent = t('网盘类型','Storage type','ストレージ種別')
    const vendor = document.createElement('select')
    vendor.id = 'remote-vendor'
    vendorLabel.append(vendor)

    const nameLabel = document.createElement('label')
    nameLabel.textContent = t('显示名称','Display name','表示名')
    const name = document.createElement('input')
    name.id = 'remote-label'
    name.placeholder = t('例如：我的 123 云盘','For example: My 123 Cloud','例：My 123 Cloud')
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
    create.textContent = t('新增网盘配置','Add storage configuration','ストレージ設定を追加')
    tools.append(create)
    providerNote.insertAdjacentElement('afterend', tools)

    targetSelect.addEventListener('change', () => {
        selectedTargetId = targetSelect.value
        creatingTarget = false
        const target = remoteState.targets.find((item) => item.id === selectedTargetId)
        if (target) fillTarget(target)
        else clearTargetEditor()
        $('#remote-sync-plan').hidden = true
        message(selectedTargetId ? '' : t('请选择本次扫描/上传使用的目标网盘。','Choose the target storage for this scan/upload.','今回のスキャン/アップロード先を選択してください。'))
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
        option.textContent = t('尚未配置','Not configured','未設定')
        select.append(option)
        selectedTargetId = ''
        return
    }
    if (remoteState.targets.length > 1) {
        const placeholder = document.createElement('option')
        placeholder.value = ''
        placeholder.textContent = t('请选择目标网盘…','Choose target storage…','保存先を選択…')
        select.append(placeholder)
    }
    for (const target of remoteState.targets) {
        const option = document.createElement('option')
        option.value = target.id
        option.textContent = `${target.label} · ${target.vendor || 'generic'}`
        select.append(option)
    }
    if (!remoteState.targets.some((item) => item.id === selectedTargetId))
        selectedTargetId = remoteState.targets.length === 1 ? remoteState.targets[0].id : ''
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
    if (user) user.placeholder = `${preset.usernameHint || t('用户名','Username','ユーザー名')} · 留空沿用已保存值`
    if (password) password.placeholder = `${preset.passwordHint || t('密码','Password','パスワード')} · 留空沿用已保存值`
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

function clearTargetEditor() {
    $('#remote-label').value = ''
    $('#remote-vendor').value = 'generic'
    $('#remote-webdav-url').value = ''
    $('#remote-root').value = 'PicaLibrary'
    $('#remote-username').value = ''
    $('#remote-password').value = ''
    applyPreset(false)
}

function beginNewTarget() {
    creatingTarget = true
    selectedTargetId = ''
    $('#remote-target-select').value = ''
    clearTargetEditor()
    $('#remote-sync-plan').hidden = true
    message(t('正在新增网盘配置。填写后先“测试连接”，确认无误再保存。','Adding a storage configuration. Fill it in, test the connection, then save it.','ストレージ設定を追加中です。入力後に接続をテストし、問題なければ保存してください。'))
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
        throw new Error(t('请先选择并保存本次操作使用的网盘配置','Choose and save a storage configuration for this operation first.','この操作で使用するストレージ設定を選択して保存してください。'))
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
        <p><strong>${t('同步进度','Sync progress','同期の進捗')}</strong> <span id="remote-progress-phase" class="status"></span></p>
        <p class="status">${t('整库','Whole library','ライブラリ全体')} · <span id="remote-progress-overall-text">0/0 ${t('本','works','作品')} · 0/0 ${t('页','pages','ページ')} · 0 B</span></p>
        <progress id="remote-progress-overall" max="100" value="0" style="width:100%;height:14px"></progress>
        <p class="status" style="margin-top:8px">${t('当前','Current','現在')} · <strong id="remote-progress-current-title">${t('准备中','Preparing','準備中')}</strong> · <span id="remote-progress-current-text">0/0 ${t('页','pages','ページ')}</span></p>
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
    $('#remote-progress-overall-text').textContent = `${progress.completedComics || 0}/${progress.totalComics || 0} ${t('本','works','作品')} · ${progress.completedPages || 0}/${progress.totalPages || 0} ${t('页','pages','ページ')} · ${bytes(progress.uploadedBytes)}`
    $('#remote-progress-current-title').textContent = progress.currentComicTitle || t('准备中','Preparing','準備中')
    $('#remote-progress-current-text').textContent = progress.currentComicPages > 0 ? `${progress.currentComicCompletedPages || 0}/${progress.currentComicPages} ${t('页','pages','ページ')}` : (progress.message || '')
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
            ? `${t('跳过','Skip','スキップ')} · ${escapeHtml(comic.reason || t('本地文件不完整','Local files are incomplete','ローカルファイルが不完全です'))}`
            : `${comic.action === 'update' ? t('更新','Update','更新') : t('新增','New','新規')} · ${comic.pages || 0} ${t('页','pages','ページ')} · ${bytes(comic.bytes)}`
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
            const target = remoteState.targets.find((item) => item.id === selectedTargetId)
            if (target) fillTarget(target)
            else clearTargetEditor()
        } else {
            beginNewTarget()
        }
        $('#remote-storage-state').textContent = remoteState.targets.length
            ? t(`已配置 ${remoteState.targets.length} 个网盘 · 上传前请选择目标网盘`,`Configured ${remoteState.targets.length} storage targets · choose one before uploading`,`ストレージを ${remoteState.targets.length} 件設定済み · アップロード前に保存先を選択`)
            : t('尚未配置远程存储','Remote storage is not configured','リモートストレージは未設定')
        if (remoteState.targets.length > 1 && !selectedTargetId)
            message(t('已配置多个网盘，请先选择本次扫描/上传使用的目标网盘。','Multiple storage targets are configured. Choose the one to use for this scan/upload.','複数の保存先が設定されています。今回のスキャン/アップロード先を選択してください。'))
        renderProgress(remoteState.syncProgress)
    } catch (error) { message(t(`无法读取远程存储状态：${error.message}`,`Could not read remote storage status: ${error.message}`,`リモートストレージの状態を読み込めませんでした：${error.message}`), true) }
}

$('#remote-test')?.addEventListener('click', async () => {
    const button = $('#remote-test')
    if (button.disabled) return
    button.disabled = true
    message(t('正在测试 WebDAV…','Testing WebDAV…','WebDAVをテスト中…'))
    try {
        const result = await post('/api/v1/desktop/test-connection', editableForm('test'))
        message(t(`连接成功 · ${result.label} · HTTP ${result.status} · ${result.root}`,`Connected · ${result.label} · HTTP ${result.status} · ${result.root}`,`接続成功 · ${result.label} · HTTP ${result.status} · ${result.root}`))
    } catch (error) {
        message(t(`连接失败：${error.message}`,`Connection failed: ${error.message}`,`接続に失敗しました：${error.message}`), true)
    } finally {
        button.disabled = false
    }
})

$('#remote-save')?.addEventListener('click', async () => {
    const button = $('#remote-save')
    if (button.disabled) return
    button.disabled = true
    message(t('正在保存网盘配置…','Saving storage configuration…','ストレージ設定を保存中…'))
    try {
        const result = await post('/api/v1/desktop/settings', editableForm('save'))
        $('#remote-password').value = ''
        selectedTargetId = result.targetId || selectedTargetId
        creatingTarget = false
        message(t('网盘配置已保存。密码已进入 Windows DPAPI 凭据存储。','Storage configuration saved. The password is stored in Windows DPAPI credential storage.','ストレージ設定を保存しました。パスワードはWindows DPAPIの資格情報ストレージに保存されます。'))
        await load(selectedTargetId)
    } catch (error) {
        message(t(`保存失败：${error.message}`,`Save failed: ${error.message}`,`保存に失敗しました：${error.message}`), true)
    } finally {
        button.disabled = false
    }
})

$('#remote-plan')?.addEventListener('click', async () => {
    const button = $('#remote-plan')
    if (button.disabled) return
    button.disabled = true
    message(t('正在扫描本地漫画与所选网盘目录…首次扫描会计算文件哈希。','Scanning local comics and the selected storage… The first scan calculates file hashes.','ローカル作品と選択した保存先をスキャン中…初回スキャンではファイルハッシュを計算します。'))
    try {
        const result = await post('/api/v1/desktop/test-connection', savedTargetRequest('plan'))
        renderPlan(result)
        const skipped = Number(result.skippedComicCount || 0)
        const target = remoteState.targets.find((item) => item.id === selectedTargetId)?.label || t('所选网盘','Selected storage','選択したストレージ')
        message(t(`${target} 扫描完成：${result.uploadComicCount || 0} 部需要上传/更新，预计 ${bytes(result.uploadBytes)}${skipped ? `；${skipped} 部因本地文件不完整将跳过。` : '。'}`,`${target} scan complete: ${result.uploadComicCount || 0} works need upload/update, about ${bytes(result.uploadBytes)}${skipped ? `; ${skipped} incomplete local works will be skipped.` : '.'}`,`${target} のスキャン完了：${result.uploadComicCount || 0} 作品をアップロード/更新、約 ${bytes(result.uploadBytes)}${skipped ? `；ローカルファイルが不完全な ${skipped} 作品はスキップします。` : '。'}`))
    } catch (error) {
        message(t(`扫描失败：${error.message}`,`Scan failed: ${error.message}`,`スキャンに失敗しました：${error.message}`), true)
    } finally {
        button.disabled = false
    }
})

$('#remote-sync')?.addEventListener('click', async () => {
    let request
    try { request = savedTargetRequest('sync') }
    catch (error) { message(error.message, true); return }
    const target = remoteState.targets.find((item) => item.id === selectedTargetId)?.label || t('所选网盘','Selected storage','選択したストレージ')
    const confirmed = window.picaConfirmAction
        ? await window.picaConfirmAction(
              t(`把已下载漫画增量同步到「${target}」？不会上传到其他已配置网盘。`,`Incrementally sync downloaded comics to “${target}”? Other configured storage targets will not be changed.`,`ダウンロード済み作品を「${target}」へ増分同期しますか？他の設定済みストレージにはアップロードしません。`)
          )
        : window.confirm(
              t(`把已下载漫画增量同步到「${target}」？不会上传到其他已配置网盘。`,`Incrementally sync downloaded comics to “${target}”? Other configured storage targets will not be changed.`,`ダウンロード済み作品を「${target}」へ増分同期しますか？他の設定済みストレージにはアップロードしません。`)
          )
    if (!confirmed) return
    message(t(`正在同步到「${target}」。页面会实时显示整库和当前漫画进度。`,`Syncing to “${target}”. Whole-library and current-work progress will update live.`,`「${target}」へ同期中です。ライブラリ全体と現在の作品の進捗をリアルタイムで表示します。`))
    const button = $('#remote-sync'); button.disabled = true; startProgressPolling()
    try {
        const result = await post('/api/v1/desktop/settings', request)
        await pollProgress()
        const skipped = Number(result.skippedComicCount || 0)
        message(t(`同步完成 · ${target} · 云端 ${result.comicCount || 0} 部 · 上传 ${result.uploadedObjects || 0} 个对象 · ${bytes(result.uploadedBytes)}${skipped ? ` · 跳过 ${skipped} 部` : ''}。`,`Sync complete · ${target} · ${result.comicCount || 0} cloud works · ${result.uploadedObjects || 0} objects uploaded · ${bytes(result.uploadedBytes)}${skipped ? ` · ${skipped} skipped` : ''}.`,`同期完了 · ${target} · クラウド ${result.comicCount || 0} 作品 · ${result.uploadedObjects || 0} オブジェクトをアップロード · ${bytes(result.uploadedBytes)}${skipped ? ` · ${skipped} 作品をスキップ` : ''}。`))
        $('#remote-sync-plan').hidden = true
        await load(selectedTargetId)
    } catch (error) { await pollProgress(); message(t(`同步失败：${error.message}`,`Sync failed: ${error.message}`,`同期に失敗しました：${error.message}`), true) }
    finally { stopProgressPolling(); button.disabled = false }
})

load()


document.addEventListener('pica-language-change', () => { void load(selectedTargetId) })
