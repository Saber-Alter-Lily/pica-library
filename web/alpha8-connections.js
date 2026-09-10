const $c = (selector) => document.querySelector(selector)
let connectionCsrf = ''

async function requestJson(path, init = {}) {
    const response = await fetch(path, { cache: 'no-store', ...init })
    const text = await response.text()
    let value = null
    try { value = text ? JSON.parse(text) : null } catch { value = { error: text } }
    if (!response.ok) throw new Error(value?.error || `HTTP ${response.status}`)
    return value
}
async function postProbe(body) {
    if (!connectionCsrf) {
        const current = await requestJson('/api/v1/desktop/status')
        connectionCsrf = current.csrfToken || ''
    }
    return requestJson('/api/v1/desktop/test-connection', {
        method:'POST',
        headers:{'content-type':'application/json','x-pica-csrf':connectionCsrf},
        body:JSON.stringify(body)
    })
}
function pill(text, tone='muted') {
    return `<span class="a83-state a83-${tone}">${text}</span>`
}
function item(title, configured, current, currentTone) {
    return `<div class="a83-pack"><div><strong>${title}</strong><div class="status">配置状态</div></div><div class="a83-row">${pill(configured?'已配置':'未配置',configured?'good':'muted')}${pill(current,currentTone)}</div></div>`
}
async function renderConnections() {
    const settings = $c('#settings')
    if (!settings) return
    let panel = $c('#a83-connections')
    if (!panel) {
        panel = document.createElement('article')
        panel.id = 'a83-connections'; panel.className = 'panel a83-panel'
        panel.innerHTML = '<h3>连接状态</h3><div id="a83-connections-body"><p class="status">正在检查…</p></div>'
        const form = $c('#settings-form')
        if (form) form.insertAdjacentElement('beforebegin', panel)
        else settings.prepend(panel)
    }
    const body = panel.querySelector('#a83-connections-body')
    try {
        const current = await requestJson('/api/v1/desktop/status')
        connectionCsrf = current.csrfToken || ''
        const picaConfigured = Boolean(current.configured)
        const remoteConfigured = Boolean(current.remoteStorage?.configured)
        const mobileConfigured = Boolean(current.mobileBridge?.enabled)
        body.innerHTML = item('Pica',picaConfigured,picaConfigured?'检查中':'未连接',picaConfigured?'warn':'muted') + item('WebDAV',remoteConfigured,remoteConfigured?'检查中':'未连接',remoteConfigured?'warn':'muted') + item('手机局域网',mobileConfigured,mobileConfigured?'监听中':'未启动',mobileConfigured?'good':'muted')
        const rows = [...body.querySelectorAll('.a83-pack')]
        if (picaConfigured) postProbe({}).then(()=>{rows[0].querySelector('.a83-row').lastElementChild.outerHTML=pill('可用','good')}).catch(()=>{rows[0].querySelector('.a83-row').lastElementChild.outerHTML=pill('当前不可用','warn')})
        if (remoteConfigured) postProbe({remoteStorageAction:'test'}).then(()=>{rows[1].querySelector('.a83-row').lastElementChild.outerHTML=pill('可连接','good')}).catch(()=>{rows[1].querySelector('.a83-row').lastElementChild.outerHTML=pill('当前不可用','warn')})
    } catch (error) {
        body.innerHTML = `<p class="status">状态读取失败：${error.message}</p>`
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderConnections)
else renderConnections()
