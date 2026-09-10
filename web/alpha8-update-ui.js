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
    return ({idle:'空闲',downloading:'正在下载',validating:'正在验证',extracting:'正在准备文件',staged:'更新已准备好','waiting-for-exit':'等待程序退出','preparing-backup':'正在备份当前版本','replacing-files':'正在替换文件',starting:'正在启动新版本','health-check':'正在验证新版本',applying:'正在应用',healthcheck:'正在验证新版本',rollback:'更新失败，正在回滚',complete:'更新完成',failed:'更新失败',cancelled:'下载已取消'})[phase] || phase
}

async function cancelDownload() {
    const button = $u('#a83-update-cancel')
    if (button) { button.disabled = true; button.textContent = '正在终止…' }
    try {
        const token = cancelToken || await csrf(); cancelToken = token
        await request('/api/v1/update/cancel', { method:'POST', headers:{'content-type':'application/json','x-pica-csrf':token}, body:'{}' })
        $u('#a83-update-live').textContent = '下载任务已终止，可以重新检查并开始更新。'
    } catch (error) {
        $u('#a83-update-live').textContent = `终止失败：${error.message}`
    } finally {
        if (button) { button.disabled = false; button.textContent = '终止下载' }
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
        if (active && lastChangedAt && Date.now() - lastChangedAt > 120000) detail += ' · 状态长时间未变化'
        live.textContent = detail
        live.className = `a83-update-detail ${phase === 'failed' || phase === 'rollback' ? 'a83-bad' : phase === 'complete' || phase === 'staged' ? 'a83-good' : ''}`
        if (cancel) cancel.hidden = !download
        if (!active && monitor) { clearInterval(monitor); monitor = null }
    } catch (error) {
        live.textContent = `更新状态读取失败：${error.message}`
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
    live.id = 'a83-update-live'; live.className = 'a83-update-detail'; live.textContent = '更新状态：空闲'
    panel.appendChild(live)
    const cancel = document.createElement('button')
    cancel.id = 'a83-update-cancel'; cancel.type = 'button'; cancel.textContent = '终止下载'; cancel.hidden = true; cancel.addEventListener('click', cancelDownload)
    panel.querySelector('.actions')?.appendChild(cancel)
    $u('#update-one-click')?.addEventListener('click', startMonitor)
    $u('#update-apply')?.addEventListener('click', startMonitor)
    $u('#update-check')?.addEventListener('click', () => setTimeout(poll, 100))
    poll()
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUpdateUi)
else initUpdateUi()
