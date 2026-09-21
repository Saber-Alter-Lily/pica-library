const hub$ = (selector) => document.querySelector(selector)

const copy = {
    'zh-CN': {
        nav: '设置',
        sectionsLabel: '设置分区',
        title: '连接与设置',
        subtitle: '',
        general: '基本设置',
        recommendations: '推荐与画风',
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
        finishedCount: (count) => `已结束 ${count}`,
        languageTitle: '语言与地区',
        languageHelp: '切换界面语言。修改会立即生效，并在下次启动时继续保持。'
    },
    ja: {
        nav: '設定',
        sectionsLabel: '設定セクション',
        title: '接続と設定',
        subtitle: '',
        general: '基本設定',
        recommendations: 'おすすめと画風',
        connections: '接続と同期',
        appearance: '外観とカスタマイズ',
        storage: 'ダウンロードと保存先',
        maintenance: 'メンテナンス',
        software: 'ソフトウェア更新',
        storageTitle: 'ダウンロードと保存先',
        storageCopy: '',
        openDownloads: 'ダウンロードを開く',
        historyHidden: '完了済みタスクを折りたたみ中',
        historyShown: '完了済みタスクを隠す',
        finishedCount: (count) => `完了 ${count}`,
        languageTitle: '言語と地域',
        languageHelp: '表示言語を切り替えます。変更はすぐに反映され、次回起動時も保持されます。'
    },
    en: {
        nav: 'Settings',
        sectionsLabel: 'Settings sections',
        title: 'Connections & Settings',
        subtitle: '',
        general: 'General',
        recommendations: 'Recommendations & Visual Style',
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
        finishedCount: (count) => `${count} finished`,
        languageTitle: 'Language & Region',
        languageHelp: 'Choose the interface language. Changes apply immediately and are kept for the next launch.'
    }
}

function language() {
    const value = hub$('#language-select')?.value
    return ['zh-CN', 'ja', 'en'].includes(value) ? value : 'zh-CN'
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
#a87-language-panel .language-control{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(150px,220px);gap:14px;align-items:center;margin-top:10px}
#a87-language-panel .language-control select{width:100%;min-width:0}
#a87-language-panel p{margin:.35rem 0 0}
@media(max-width:560px){#a87-language-panel .language-control{grid-template-columns:1fr}}

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
            if (url.origin !== location.origin || method !== 'GET' || !response.ok)
                return response
            if (url.pathname === '/api/v1/downloads/summary') {
                const summary = await response.clone().json()
                lastFinishedCount = Number(summary?.finished || 0)
                queueMicrotask(updateFinishedControl)
                return response
            }
            if (url.pathname !== '/api/v1/downloads') return response
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
    ['recommendations', 'recommendations'],
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
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-labelledby', `a87-${id}-tab`)
    panel.tabIndex = 0
    return panel
}

function activateHubPanel(id, focus = false) {
    document.querySelectorAll('.a87-hub-panel').forEach((panel) => {
        const active = panel.id === `a87-${id}-panel`
        panel.classList.toggle('active', active)
        panel.hidden = !active
    })
    document.querySelectorAll('.a87-hub-nav button').forEach((button) => {
        const active = button.dataset.hubPanel === id
        button.classList.toggle('active', active)
        button.setAttribute('aria-selected', String(active))
        button.tabIndex = active ? 0 : -1
        if (active && focus) button.focus()
    })
    localStorage.setItem('pica-settings-section', id)
    if (id === 'storage') void refreshPreviewStats()
    movePersonalization()
}

function openSettingsHubPanel(id) {
    const navButton = hub$('nav button[data-view="maintenance"]')
    navButton?.click()
    activateHubPanel(id)
}

function moveProductSettingsPanels() {
    const general = hub$('#a87-general-panel')
    const appearanceSlot = hub$('#a87-appearance-panel')
    const support = hub$('#a83-support')
    const appearance = hub$('#a83-appearance')
    const languageControl = hub$('.language-control')
    let languagePanel = hub$('#a87-language-panel')
    if (general && languageControl) {
        if (!languagePanel) {
            languagePanel = document.createElement('article')
            languagePanel.id = 'a87-language-panel'
            languagePanel.className = 'panel'
            languagePanel.innerHTML = '<h3></h3><p></p>'
            general.prepend(languagePanel)
        }
        if (languageControl.parentElement !== languagePanel)
            languagePanel.appendChild(languageControl)
    }
    if (general && support && support.parentElement !== general) {
        general.appendChild(support)
        support.classList.add('a87-support-panel')
    }
    if (appearanceSlot && appearance && appearance.parentElement !== appearanceSlot) {
        appearanceSlot.prepend(appearance)
        appearance.classList.add('a87-appearance-panel')
    }
}

function movePersonalization() {
    const slot = hub$('#a87-appearance-panel')
    const personalization = hub$('#a83-personalization')
    if (slot && personalization && personalization.parentElement !== slot) {
        slot.appendChild(personalization)
        personalization.classList.add('a87-personalization')
    }
    moveProductSettingsPanels()
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
            target.textContent = language() === 'en'
                ? `${files} cached files · ${size}`
                : language() === 'ja'
                    ? `キャッシュ ${files} ファイル · ${size}`
                    : `缓存 ${files} 个文件 · ${size}`
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
    nav.setAttribute('role', 'tablist')
    nav.setAttribute('aria-orientation', 'vertical')
    nav.setAttribute('aria-label', text().sectionsLabel)
    nav.addEventListener('keydown', (event) => {
        if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key))
            return
        const buttons = [...nav.querySelectorAll('[role="tab"]')]
        if (!buttons.length) return
        const current = Math.max(0, buttons.indexOf(document.activeElement))
        let next = current
        if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = buttons.length - 1
        else if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
            next = (current + 1) % buttons.length
        else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
            next = (current - 1 + buttons.length) % buttons.length
        event.preventDefault()
        activateHubPanel(buttons[next].dataset.hubPanel, true)
    })
    const content = document.createElement('div')
    content.className = 'a87-hub-content'

    const panels = new Map()
    for (const [id] of panelDefinitions) {
        const button = document.createElement('button')
        button.type = 'button'
        button.id = `a87-${id}-tab`
        button.dataset.hubPanel = id
        button.setAttribute('role', 'tab')
        button.setAttribute('aria-controls', `a87-${id}-panel`)
        button.setAttribute('aria-selected', 'false')
        button.tabIndex = -1
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

    const ehAccount = hub$('#settings-eh-account')
    if (ehAccount) {
        ehAccount.open = true
        panels.get('general').appendChild(ehAccount)
    }

    const recommendationV4 = hub$('#settings-recommendation-v4')
    if (recommendationV4) panels.get('recommendations').appendChild(recommendationV4)

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
    moveProductSettingsPanels()
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
    const hubNav = hub$('.a87-hub-nav')
    if (hubNav) hubNav.setAttribute('aria-label', value.sectionsLabel)
    const title = hub$('#a87-settings-title')
    const subtitle = hub$('#a87-settings-subtitle')
    if (title) title.textContent = value.title
    if (subtitle) subtitle.textContent = value.subtitle
    for (const [id, key] of panelDefinitions) {
        const button = hub$(`.a87-hub-nav button[data-hub-panel="${id}"]`)
        if (button) button.textContent = value[key]
    }
    const languageTitle = hub$('#a87-language-panel h3')
    const languageHelp = hub$('#a87-language-panel p')
    if (languageTitle) languageTitle.textContent = value.languageTitle
    if (languageHelp) languageHelp.textContent = value.languageHelp
    const storageTitle = hub$('#a87-storage-intro h3')
    const storageCopy = hub$('#a87-storage-intro p')
    const openDownloads = hub$('#a87-open-downloads')
    if (storageTitle) storageTitle.textContent = value.storageTitle
    if (storageCopy) storageCopy.textContent = value.storageCopy
    if (openDownloads) openDownloads.textContent = value.openDownloads
    updateFinishedControl()
}

function installObservers() {
    let queued = false
    const schedule = () => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => {
            queued = false
            moveProductSettingsPanels()
            movePersonalization()
            const settingsNav = hub$('#settings-nav')
            if (settingsNav) settingsNav.style.display = 'none'
        })
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
}

function bootstrap() {
    injectStyles()
    wrapDownloadFetch()
    buildSettingsHub()
    installDownloadHistoryControl()
    installObservers()
    hub$('#setup-open-eh')?.addEventListener('click', () => setTimeout(() => { openSettingsHubPanel('general'); const panel = hub$('#settings-eh-account'); if (panel) { panel.open = true; panel.scrollIntoView({ behavior: 'smooth', block: 'start' }) } }, 0))
    hub$('#setup-open-settings')?.addEventListener('click', () => setTimeout(() => openSettingsHubPanel('general'), 0))
    hub$('#language-select')?.addEventListener('change', () => setTimeout(refreshHubLabels, 0))
    setTimeout(() => {
        buildSettingsHub()
        installDownloadHistoryControl()
        moveProductSettingsPanels()
        movePersonalization()
    }, 250)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap)
else bootstrap()
