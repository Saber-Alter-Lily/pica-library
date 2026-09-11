const hub$ = (selector) => document.querySelector(selector)

const copy = {
    'zh-CN': {
        nav: '设置',
        title: '连接与设置',
        subtitle: '',
        general: '基本设置',
        connections: '连接与同步',
        appearance: '外观与个性化',
        storage: '下载与存储',
        maintenance: '维护工具',
        software: '软件更新',
        storageTitle: '下载与存储',
        storageCopy: '',
        openDownloads: '打开下载任务',
        historyHidden: '已结束任务已收起',
        historyShown: '隐藏已结束任务',
        finishedCount: (count) => `已结束 ${count}`
    },
    en: {
        nav: 'Settings',
        title: 'Connections & Settings',
        subtitle: '',
        general: 'General',
        connections: 'Connections & Sync',
        appearance: 'Appearance',
        storage: 'Downloads & Storage',
        maintenance: 'Maintenance',
        software: 'Software Update',
        storageTitle: 'Downloads & Storage',
        storageCopy: '',
        openDownloads: 'Open Downloads',
        historyHidden: 'Finished tasks are collapsed',
        historyShown: 'Hide finished tasks',
        finishedCount: (count) => `${count} finished`
    }
}

function language() {
    return hub$('#language-select')?.value === 'en' ? 'en' : 'zh-CN'
}

function text() {
    return copy[language()]
}

function injectStyles() {
    if (hub$('#a87-desktop-hub-style')) return
    const style = document.createElement('style')
    style.id = 'a87-desktop-hub-style'
    style.textContent = `
#settings-nav{display:none!important}
#a87-settings-heading{margin-bottom:18px}
#a87-settings-subtitle:empty,#a87-storage-intro p:empty{display:none}
.a87-settings-hub>.tabs{margin:0}
.a87-hub-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:20px;align-items:start}
.a87-hub-nav{position:sticky;top:12px;display:flex;flex-direction:column;gap:7px;padding:8px;border:1px solid var(--a83-line,#ddd7e4);border-radius:20px;background:color-mix(in srgb,var(--a83-surface,#fff) 92%,transparent);box-shadow:0 10px 30px rgb(35 23 55 / .05)}
.a87-hub-nav button{width:100%;min-height:46px;text-align:left;justify-content:flex-start;padding:10px 14px;border-radius:14px!important;background:transparent!important;border:0!important;color:var(--a83-muted,#68636e)!important;font-weight:650;box-shadow:none!important}
.a87-hub-nav button:hover{background:var(--a83-accent-soft,#eee7fa)!important;color:var(--a83-text,#221e27)!important}
.a87-hub-nav button.active{background:var(--a83-accent-soft,#eee7fa)!important;color:var(--a83-accent,#7457b9)!important}
.a87-hub-content{min-width:0}
.a87-hub-panel{display:none;min-width:0}
.a87-hub-panel.active{display:block}
.a87-hub-panel>.panel,.a87-hub-panel>.tab,.a87-hub-panel>.settings-form{width:100%;max-width:none;box-sizing:border-box}
.a87-hub-panel>#software-updates{display:block!important}
#a87-maintenance-panel>.tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
#a87-maintenance-panel>.tabs button[data-tab="software-updates"]{display:none!important}
#a87-maintenance-panel>.tab:not(.active){display:none}
#a87-storage-intro{margin-bottom:14px}
#a87-download-history-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#a87-download-history-controls .a87-finished-count{font-size:.84rem;color:var(--a83-muted,#68636e);padding:0 4px}

/* Personalization is a full-width settings surface, never a squeezed form column. */
#a87-appearance-panel #a83-personalization{display:block!important;width:100%!important;max-width:none!important;min-width:0!important;grid-column:1/-1!important;box-sizing:border-box;margin:0!important}
#a87-appearance-panel .a86-star-hero{display:grid!important;grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr)!important;gap:28px!important;align-items:start!important;width:100%!important}
#a87-appearance-panel .a86-star-hero>div{min-width:0!important}
#a87-appearance-panel .a86-star-hero h3{font-size:1.45rem;margin:4px 0 10px}
#a87-appearance-panel .a86-star-hero p{max-width:68ch;line-height:1.7;margin:8px 0}
#a87-appearance-panel .a86-star-preview{display:inline-flex!important;width:auto!important;max-width:100%;white-space:normal;margin-top:10px;padding:8px 12px;border-radius:999px}
#a87-appearance-panel .a86-star-actions{display:grid!important;grid-template-columns:1fr!important;gap:10px!important;align-items:stretch!important;min-width:0!important}
#a87-appearance-panel .a86-star-actions button{width:100%!important;min-height:48px}
#a87-appearance-panel .a86-star-field{display:grid!important;grid-template-columns:1fr!important;gap:6px!important;width:100%!important;min-width:0!important}
#a87-appearance-panel .a86-star-field input{width:100%!important;min-width:0!important;box-sizing:border-box!important}
#a87-appearance-panel .a86-star-note{margin-top:14px!important}
#a87-appearance-panel .a85-workflow{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:18px!important}
#a87-appearance-panel .a85-box{min-width:0!important}
#a87-appearance-panel #a85-description{width:100%!important;box-sizing:border-box}

@media(max-width:1050px){
  .a87-hub-layout{grid-template-columns:1fr}
  .a87-hub-nav{position:static;display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
  .a87-hub-nav button{text-align:center;justify-content:center}
}
@media(max-width:820px){
  .a87-hub-nav{grid-template-columns:repeat(2,minmax(0,1fr))}
  #a87-appearance-panel .a86-star-hero,#a87-appearance-panel .a85-workflow{grid-template-columns:1fr!important}
}
@media(max-width:560px){.a87-hub-nav{grid-template-columns:1fr}}
`
    document.head.appendChild(style)
}

let showFinished = localStorage.getItem('pica-show-finished-downloads') === 'true'
let lastFinishedCount = 0
let fetchWrapped = false

function terminalForTaskPage(status) {
    return status === 'COMPLETED' || status === 'CANCELLED'
}

function updateFinishedControl() {
    const button = hub$('#a87-toggle-finished')
    const count = hub$('#a87-finished-count')
    if (button) {
        button.textContent = showFinished ? text().historyShown : text().historyHidden
        button.setAttribute('aria-pressed', String(showFinished))
    }
    if (count) count.textContent = text().finishedCount(lastFinishedCount)
}

function wrapDownloadFetch() {
    if (fetchWrapped) return
    fetchWrapped = true
    const nativeFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
        const response = await nativeFetch(input, init)
        try {
            const source = input instanceof Request ? input.url : String(input)
            const url = new URL(source, location.href)
            const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
            if (url.origin !== location.origin || url.pathname !== '/api/v1/downloads' || method !== 'GET' || !response.ok)
                return response
            const jobs = await response.clone().json()
            if (!Array.isArray(jobs)) return response
            lastFinishedCount = jobs.filter((job) => terminalForTaskPage(String(job?.status || ''))).length
            queueMicrotask(updateFinishedControl)
            if (showFinished) return response
            const visible = jobs.filter((job) => !terminalForTaskPage(String(job?.status || '')))
            const headers = new Headers(response.headers)
            headers.delete('content-length')
            headers.delete('content-encoding')
            return new Response(JSON.stringify(visible), {
                status: response.status,
                statusText: response.statusText,
                headers
            })
        } catch {
            return response
        }
    }
}

function installDownloadHistoryControl() {
    const refresh = hub$('#refresh-jobs')
    if (!refresh || hub$('#a87-toggle-finished')) return
    const host = refresh.parentElement
    if (!host) return
    const controls = document.createElement('span')
    controls.id = 'a87-download-history-controls'
    const button = document.createElement('button')
    button.id = 'a87-toggle-finished'
    button.type = 'button'
    const count = document.createElement('span')
    count.id = 'a87-finished-count'
    count.className = 'a87-finished-count'
    button.addEventListener('click', () => {
        showFinished = !showFinished
        localStorage.setItem('pica-show-finished-downloads', String(showFinished))
        updateFinishedControl()
        hub$('#refresh-jobs')?.click()
    })
    controls.append(button, count)
    refresh.insertAdjacentElement('beforebegin', controls)
    updateFinishedControl()
}

const panelDefinitions = [
    ['general', 'general'],
    ['connections', 'connections'],
    ['appearance', 'appearance'],
    ['storage', 'storage'],
    ['maintenance', 'maintenance'],
    ['software', 'software']
]

function createPanel(id) {
    const panel = document.createElement('div')
    panel.id = `a87-${id}-panel`
    panel.className = 'a87-hub-panel'
    return panel
}

function activateHubPanel(id) {
    document.querySelectorAll('.a87-hub-panel').forEach((panel) =>
        panel.classList.toggle('active', panel.id === `a87-${id}-panel`)
    )
    document.querySelectorAll('.a87-hub-nav button').forEach((button) =>
        button.classList.toggle('active', button.dataset.hubPanel === id)
    )
    localStorage.setItem('pica-settings-section', id)
    if (id === 'storage') void refreshPreviewStats()
    movePersonalization()
}

function movePersonalization() {
    const slot = hub$('#a87-appearance-panel')
    const personalization = hub$('#a83-personalization')
    if (slot && personalization && personalization.parentElement !== slot) {
        slot.appendChild(personalization)
        personalization.classList.add('a87-personalization')
    }
}

async function refreshPreviewStats() {
    const target = hub$('#preview-cache-stats')
    if (!target) return
    try {
        const response = await fetch('/api/v1/previews/cache', { cache: 'no-store' })
        if (!response.ok) return
        const value = await response.json()
        const bytes = Number(value?.bytes || value?.size || 0)
        const files = Number(value?.files || value?.count || 0)
        if (Number.isFinite(bytes) && bytes >= 0) {
            const size = bytes < 1024 * 1024
                ? `${(bytes / 1024).toFixed(1)} KB`
                : `${(bytes / 1024 / 1024).toFixed(1)} MB`
            target.textContent = language() === 'en' ? `${files} cached files · ${size}` : `缓存 ${files} 个文件 · ${size}`
        }
    } catch {
        // The existing cache controls retain their own error handling.
    }
}

function buildSettingsHub() {
    const maintenance = hub$('#maintenance')
    const settings = hub$('#settings')
    const maintenanceNav = hub$('nav button[data-view="maintenance"]')
    const settingsNav = hub$('#settings-nav')
    if (!maintenance || !settings || !maintenanceNav || hub$('#a87-hub-layout')) return

    maintenance.classList.add('a87-settings-hub')
    maintenanceNav.textContent = text().nav
    maintenanceNav.dataset.view = 'maintenance'
    if (settingsNav) settingsNav.style.display = 'none'
    document.querySelectorAll('[data-go="settings"]').forEach((node) => {
        node.dataset.go = 'maintenance'
    })

    const oldToolTabs = maintenance.querySelector(':scope > .tabs')
    const updateTabButton = oldToolTabs?.querySelector('[data-tab="software-updates"]')
    updateTabButton?.remove()

    const heading = document.createElement('div')
    heading.id = 'a87-settings-heading'
    heading.className = 'page-heading'
    const headingCopy = document.createElement('div')
    const title = document.createElement('h2')
    title.id = 'a87-settings-title'
    const subtitle = document.createElement('p')
    subtitle.id = 'a87-settings-subtitle'
    headingCopy.append(title, subtitle)
    const version = hub$('#settings-version')
    heading.append(headingCopy)
    if (version) heading.append(version)

    const layout = document.createElement('div')
    layout.id = 'a87-hub-layout'
    layout.className = 'a87-hub-layout'
    const nav = document.createElement('aside')
    nav.className = 'a87-hub-nav'
    nav.setAttribute('aria-label', 'Settings sections')
    const content = document.createElement('div')
    content.className = 'a87-hub-content'

    const panels = new Map()
    for (const [id] of panelDefinitions) {
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.hubPanel = id
        button.addEventListener('click', () => activateHubPanel(id))
        nav.appendChild(button)
        const panel = createPanel(id)
        panels.set(id, panel)
        content.appendChild(panel)
    }
    layout.append(nav, content)

    const settingsHeading = settings.querySelector(':scope > .page-heading')
    settingsHeading?.remove()
    const settingsForm = hub$('#settings-form')
    if (settingsForm) panels.get('general').appendChild(settingsForm)

    for (const id of ['settings-mobile-bridge', 'settings-remote-storage', 'settings-browser-lite']) {
        const node = hub$(`#${id}`)
        if (node) panels.get('connections').appendChild(node)
    }

    const storage = panels.get('storage')
    const storageIntro = document.createElement('article')
    storageIntro.id = 'a87-storage-intro'
    storageIntro.className = 'panel'
    storageIntro.innerHTML = `<h3>${text().storageTitle}</h3><p>${text().storageCopy}</p><button type="button" id="a87-open-downloads">${text().openDownloads}</button>`
    storage.appendChild(storageIntro)
    const preview = settings.querySelector('.preview-cache-panel')
    if (preview) storage.appendChild(preview)
    storageIntro.querySelector('#a87-open-downloads')?.addEventListener('click', () =>
        hub$('nav button[data-view="downloads"]')?.click()
    )

    const maintenancePanel = panels.get('maintenance')
    if (oldToolTabs) maintenancePanel.appendChild(oldToolTabs)
    for (const id of ['updates', 'repair', 'authors', 'health']) {
        const node = hub$(`#${id}`)
        if (node) maintenancePanel.appendChild(node)
    }

    const software = hub$('#software-updates')
    if (software) {
        software.classList.add('active')
        panels.get('software').appendChild(software)
    }

    maintenance.replaceChildren(heading, layout)
    settings.hidden = true
    movePersonalization()
    refreshHubLabels()

    const requested = localStorage.getItem('pica-settings-section')
    const valid = panelDefinitions.some(([id]) => id === requested)
    activateHubPanel(valid ? requested : 'general')
}

function refreshHubLabels() {
    const value = text()
    const maintenanceNav = hub$('nav button[data-view="maintenance"]')
    if (maintenanceNav) maintenanceNav.textContent = value.nav
    const title = hub$('#a87-settings-title')
    const subtitle = hub$('#a87-settings-subtitle')
    if (title) title.textContent = value.title
    if (subtitle) subtitle.textContent = value.subtitle
    for (const [id, key] of panelDefinitions) {
        const button = hub$(`.a87-hub-nav button[data-hub-panel="${id}"]`)
        if (button) button.textContent = value[key]
    }
    const storageTitle = hub$('#a87-storage-intro h3')
    const storageCopy = hub$('#a87-storage-intro p')
    const openDownloads = hub$('#a87-open-downloads')
    if (storageTitle) storageTitle.textContent = value.storageTitle
    if (storageCopy) storageCopy.textContent = value.storageCopy
    if (openDownloads) openDownloads.textContent = value.openDownloads
    updateFinishedControl()
}

function installObservers() {
    const observer = new MutationObserver(() => {
        movePersonalization()
        const settingsNav = hub$('#settings-nav')
        if (settingsNav) settingsNav.style.display = 'none'
    })
    observer.observe(document.body, { childList: true, subtree: true })
}

function bootstrap() {
    injectStyles()
    wrapDownloadFetch()
    buildSettingsHub()
    installDownloadHistoryControl()
    installObservers()
    hub$('#language-select')?.addEventListener('change', () => setTimeout(refreshHubLabels, 0))
    setTimeout(() => {
        buildSettingsHub()
        installDownloadHistoryControl()
        movePersonalization()
    }, 250)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap)
else bootstrap()
