import { copy as t } from './locale-runtime.js'

const $u = (selector) => document.querySelector(selector)
let cancelToken = null
let monitor = null
let lastSignature = ''
let lastChangedAt = 0
let observedBackendVersion = null
let reloadTriggered = false

async function request(path, init = {}) {
    const response = await fetch(path, { cache: 'no-store', ...init })
    const text = await response.text()
    let value = null
    try { value = text ? JSON.parse(text) : null } catch { value = { error: text } }
    if (!response.ok) throw new Error(value?.error || `HTTP ${response.status}`)
    return value
}
async function csrf() {
    const value = await request('/api/v1/desktop/status')
    return value.csrfToken || ''
}
async function reloadIfBackendChanged() {
    const status = await request('/api/v1/desktop/status')
    const version = String(status?.version || '')
    if (!version) return
    if (!observedBackendVersion) { observedBackendVersion = version; return }
    if (!reloadTriggered && version !== observedBackendVersion) {
        reloadTriggered = true
        location.reload()
    }
}
function prettyBytes(value) {
    const n = Number(value || 0)
    if (n < 1024) return `${n} B`
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`
    return `${(n / 1024 ** 3).toFixed(2)} GB`
}
function phaseLabel(phase) {
    return ({
        idle:t('空闲','Idle','待機中'),
        downloading:t('正在下载','Downloading','ダウンロード中'),
        validating:t('正在验证','Validating','検証中'),
        extracting:t('正在准备文件','Preparing files','ファイルを準備中'),
        staged:t('更新已准备好','Update ready','更新の準備完了'),
        'waiting-for-exit':t('等待程序退出','Waiting for the app to exit','アプリ終了待ち'),
        'preparing-backup':t('正在备份当前版本','Backing up the current version','現在のバージョンをバックアップ中'),
        'replacing-files':t('正在替换文件','Replacing files','ファイルを置換中'),
        starting:t('正在启动新版本','Starting the new version','新しいバージョンを起動中'),
        'health-check':t('正在验证新版本','Checking the new version','新しいバージョンを検証中'),
        applying:t('正在应用','Applying update','更新を適用中'),
        healthcheck:t('正在验证新版本','Checking the new version','新しいバージョンを検証中'),
        rollback:t('更新失败，正在回滚','Update failed; rolling back','更新に失敗したためロールバック中'),
        complete:t('更新完成','Update complete','更新完了'),
        failed:t('更新失败','Update failed','更新に失敗しました'),
        cancelled:t('下载已取消','Download cancelled','ダウンロードをキャンセルしました')
    })[phase] || phase
}

async function cancelDownload() {
    const button = $u('#a83-update-cancel')
    if (button) { button.disabled = true; button.textContent = t('正在终止…','Stopping…','停止中…') }
    try {
        const token = cancelToken || await csrf(); cancelToken = token
        await request('/api/v1/update/cancel', { method:'POST', headers:{'content-type':'application/json','x-pica-csrf':token}, body:'{}' })
        $u('#a83-update-live').textContent = t('下载任务已终止，可以重新检查并开始更新。','The download was stopped. You can check again and restart the update.','ダウンロードを停止しました。もう一度確認して更新を再開できます。')
    } catch (error) {
        $u('#a83-update-live').textContent = t(`终止失败：${error.message}`,`Could not stop the download: ${error.message}`,`ダウンロードを停止できませんでした：${error.message}`)
    } finally {
        if (button) { button.disabled = false; button.textContent = t('终止下载','Stop download','ダウンロードを停止') }
        poll()
    }
}

async function poll() {
    const live = $u('#a83-update-live'), cancel = $u('#a83-update-cancel')
    if (!live) return
    try {
        await reloadIfBackendChanged()
        if (reloadTriggered) return
        const p = await request('/api/v1/update/progress')
        const signature = JSON.stringify(p)
        if (signature !== lastSignature) { lastSignature = signature; lastChangedAt = Date.now() }
        const phase = String(p.phase || 'idle')
        const current = Number(p.current || 0), total = Number(p.total || 0)
        const download = phase === 'downloading'
        let detail = phaseLabel(phase)
        if (total > 0) detail += download ? ` · ${prettyBytes(current)} / ${prettyBytes(total)} · ${Math.round(current / total * 100)}%` : ` · ${current}/${total} · ${Math.round(current / total * 100)}%`
        else if (download && current > 0) detail += ` · ${prettyBytes(current)}`
        const problem = p.error || p.message
        if (problem) detail += ` · ${problem}`
        const active = ['downloading','validating','extracting','waiting-for-exit','preparing-backup','replacing-files','starting','health-check','applying','healthcheck','rollback'].includes(phase)
        if (active && lastChangedAt && Date.now() - lastChangedAt > 120000) detail += t(' · 状态长时间未变化',' · No progress for a while',' · しばらく進捗がありません')
        live.textContent = detail
        live.className = `a83-update-detail ${phase === 'failed' || phase === 'rollback' ? 'a83-bad' : phase === 'complete' || phase === 'staged' ? 'a83-good' : ''}`
        if (cancel) cancel.hidden = !download
        if (!active && monitor) { clearInterval(monitor); monitor = null }
    } catch (error) {
        live.textContent = t(`更新状态读取失败：${error.message}`,`Could not read update status: ${error.message}`,`更新状態を読み込めませんでした：${error.message}`)
    }
}

function startMonitor() {
    if (monitor) clearInterval(monitor)
    lastSignature = ''; lastChangedAt = Date.now(); reloadTriggered = false
    monitor = setInterval(poll, 500)
    poll()
}

function initUpdateUi() {
    const panel = $u('#settings-update')
    if (!panel || $u('#a83-update-live')) return
    const live = document.createElement('div')
    live.id = 'a83-update-live'; live.className = 'a83-update-detail'; live.textContent = t('更新状态：空闲','Update status: idle','更新状態：待機中')
    panel.appendChild(live)
    const cancel = document.createElement('button')
    cancel.id = 'a83-update-cancel'; cancel.type = 'button'; cancel.textContent = t('终止下载','Stop download','ダウンロードを停止'); cancel.hidden = true; cancel.addEventListener('click', cancelDownload)
    panel.querySelector('.actions')?.appendChild(cancel)
    $u('#update-one-click')?.addEventListener('click', startMonitor)
    $u('#update-apply')?.addEventListener('click', startMonitor)
    $u('#update-check')?.addEventListener('click', () => setTimeout(poll, 100))
    poll()
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUpdateUi)
else initUpdateUi()


document.addEventListener('pica-language-change', () => { if ($u('#a83-update-live')) void poll() })
