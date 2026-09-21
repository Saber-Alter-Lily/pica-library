const $c = (selector) => document.querySelector(selector)
let connectionCsrf = ''
let connectionSnapshot = null
let checkingConnections = false

const COPY = {
    'zh-CN': {
        title: '连接状态',
        config: '配置状态',
        configured: '已配置',
        unconfigured: '未配置',
        notChecked: '尚未检查',
        disconnected: '未连接',
        listening: '监听中',
        stopped: '未启动',
        available: '可用',
        reachable: '可连接',
        unavailable: '当前不可用',
        checking: '正在检查…',
        check: '检查连接状态',
        failed: '状态读取失败',
        probeHelp: '网络探测只会在你点击检查时运行。'
    },
    ja: {
        title: '接続状態',
        config: '設定状態',
        configured: '設定済み',
        unconfigured: '未設定',
        notChecked: '未確認',
        disconnected: '未接続',
        listening: '待受中',
        stopped: '停止中',
        available: '利用可能',
        reachable: '接続可能',
        unavailable: '現在利用不可',
        checking: '確認中…',
        check: '接続状態を確認',
        failed: '状態を読み込めませんでした',
        probeHelp: 'ネットワーク確認は「確認」を押したときだけ実行します。'
    },
    en: {
        title: 'Connection status',
        config: 'Configuration',
        configured: 'Configured',
        unconfigured: 'Not configured',
        notChecked: 'Not checked',
        disconnected: 'Disconnected',
        listening: 'Listening',
        stopped: 'Stopped',
        available: 'Available',
        reachable: 'Reachable',
        unavailable: 'Currently unavailable',
        checking: 'Checking…',
        check: 'Check connections',
        failed: 'Failed to read status',
        probeHelp: 'Network checks run only when requested.'
    }
}

function language() {
    const value=$c('#language-select')?.value
    return ['zh-CN','ja','en'].includes(value) ? value : 'zh-CN'
}
function text(key) {
    return COPY[language()]?.[key] || COPY['zh-CN'][key] || key
}

async function requestJson(path, init = {}) {
    const response = await fetch(path, { cache: 'no-store', ...init })
    const raw = await response.text()
    let value = null
    try { value = raw ? JSON.parse(raw) : null } catch { value = { error: raw } }
    if (!response.ok) throw new Error(value?.error || `HTTP ${response.status}`)
    return value
}
async function postProbe(body) {
    if (!connectionCsrf) {
        const current = await requestJson('/api/v1/desktop/status')
        connectionCsrf = current.csrfToken || ''
    }
    return requestJson('/api/v1/desktop/test-connection', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': connectionCsrf
        },
        body: JSON.stringify(body)
    })
}
function pill(value, tone = 'muted') {
    return `<span class="a83-state a83-${tone}">${value}</span>`
}
function item(id, title, configured, current, currentTone) {
    return `<div class="a83-pack" data-connection-row="${id}">
        <div><strong>${title}</strong><div class="status">${text('config')}</div></div>
        <div class="a83-row">
            ${pill(configured ? text('configured') : text('unconfigured'), configured ? 'good' : 'muted')}
            ${pill(current, currentTone)}
        </div>
    </div>`
}

function ensurePanel() {
    const settings = $c('#settings')
    if (!settings) return null
    let panel = $c('#a83-connections')
    if (!panel) {
        panel = document.createElement('article')
        panel.id = 'a83-connections'
        panel.className = 'panel a83-panel'
        const form = $c('#settings-form')
        if (form) form.insertAdjacentElement('beforebegin', panel)
        else settings.prepend(panel)
    }
    return panel
}

function renderConfigured(snapshot = connectionSnapshot) {
    const panel = ensurePanel()
    if (!panel) return
    if (!snapshot) {
        panel.innerHTML = `<div class="a83-connection-head"><h3>${text('title')}</h3></div><p class="status">${text('checking')}</p>`
        return
    }
    const picaConfigured = Boolean(snapshot.configured)
    const remoteConfigured = Boolean(snapshot.remoteStorage?.configured)
    const mobileConfigured = Boolean(snapshot.mobileBridge?.enabled)
    panel.innerHTML = `
        <div class="a83-connection-head">
            <div class="help-heading">
                <h3>${text('title')}</h3>
                <button type="button" class="info-tip" aria-label="${text('title')}" data-info-tip="${text('probeHelp')}">!</button>
            </div>
            <button type="button" id="a83-check-connections" ${checkingConnections ? 'disabled' : ''}>
                ${checkingConnections ? text('checking') : text('check')}
            </button>
        </div>
        <div id="a83-connections-body">
            ${item('pica', 'Pica', picaConfigured, picaConfigured ? text('notChecked') : text('disconnected'), picaConfigured ? 'muted' : 'muted')}
            ${item('webdav', 'WebDAV', remoteConfigured, remoteConfigured ? text('notChecked') : text('disconnected'), remoteConfigured ? 'muted' : 'muted')}
            ${item('mobile', language() === 'en' ? 'Phone LAN' : language() === 'ja' ? 'スマートフォンLAN' : '手机局域网', mobileConfigured, mobileConfigured ? text('listening') : text('stopped'), mobileConfigured ? 'good' : 'muted')}
        </div>
    `
    panel.querySelector('#a83-check-connections')?.addEventListener(
        'click',
        () => void checkConnections()
    )
}

function setProbeResult(id, value, tone) {
    const row = $c(`[data-connection-row="${id}"] .a83-row`)
    if (!row?.lastElementChild) return
    row.lastElementChild.outerHTML = pill(value, tone)
}

async function loadConnectionConfiguration() {
    try {
        connectionSnapshot = await requestJson('/api/v1/desktop/status')
        connectionCsrf = connectionSnapshot.csrfToken || ''
        renderConfigured()
    } catch (error) {
        const panel = ensurePanel()
        if (panel)
            panel.innerHTML = `<h3>${text('title')}</h3><p class="status">${text('failed')}：${error.message}</p>`
    }
}

async function checkConnections() {
    if (checkingConnections) return
    checkingConnections = true
    renderConfigured()
    try {
        connectionSnapshot = await requestJson('/api/v1/desktop/status')
        connectionCsrf = connectionSnapshot.csrfToken || ''
        renderConfigured()
        const picaConfigured = Boolean(connectionSnapshot.configured)
        const remoteConfigured = Boolean(connectionSnapshot.remoteStorage?.configured)
        if (picaConfigured) {
            setProbeResult('pica', text('checking'), 'warn')
            try {
                await postProbe({})
                setProbeResult('pica', text('available'), 'good')
            } catch {
                setProbeResult('pica', text('unavailable'), 'warn')
            }
        }
        if (remoteConfigured) {
            setProbeResult('webdav', text('checking'), 'warn')
            try {
                await postProbe({ remoteStorageAction: 'test' })
                setProbeResult('webdav', text('reachable'), 'good')
            } catch {
                setProbeResult('webdav', text('unavailable'), 'warn')
            }
        }
    } finally {
        checkingConnections = false
        const button = $c('#a83-check-connections')
        if (button) {
            button.disabled = false
            button.textContent = text('check')
        }
    }
}

document.addEventListener('pica-language-change', () => {
    renderConfigured()
})
if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => void loadConnectionConfiguration())
else void loadConnectionConfiguration()
