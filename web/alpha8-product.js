const $ = (selector) => document.querySelector(selector)
const THEME_KEY = 'pica-library-web-theme-v1'
let desktopStatus = null
let updateTimer = null
let lastUpdateProgress = ''
let lastUpdateChangeAt = 0

function injectStyles() {
    const style = document.createElement('style')
    style.id = 'alpha8-product-style'
    style.textContent = `
:root{--a83-bg:#f6f4fa;--a83-surface:#fff;--a83-nav:#f3f1f5;--a83-text:#201e24;--a83-muted:#68636e;--a83-line:#d8d2dc;--a83-accent:#6750a4;--a83-accent-soft:#eadcff;--a83-good:#267450;--a83-good-soft:#d9f0e2;--a83-warn:#a05a00;--a83-warn-soft:#fff0d6;--a83-bad:#b3261e;--a83-bad-soft:#f9dedc;--a83-action:#e7e4ea}
:root[data-pica-theme="dark"]{--a83-bg:#121116;--a83-surface:#1e1b23;--a83-nav:#18151d;--a83-text:#f4eff7;--a83-muted:#c7c1cc;--a83-line:#49454f;--a83-accent:#d0bcff;--a83-accent-soft:#4f378b;--a83-good:#8fd5ab;--a83-good-soft:#183a28;--a83-warn:#ffb86c;--a83-warn-soft:#4a2d0a;--a83-bad:#ffb4ab;--a83-bad-soft:#601410;--a83-action:#2b2730}
body{background:var(--a83-bg)!important;color:var(--a83-text)!important;transition:background .16s,color .16s}.app-header,.app-nav,.panel,.list-item,.comic-card,.metric,.toolbar,.settings-form,.update-dropzone,.app-dialog{border-color:var(--a83-line)!important}.app-header,.app-nav{background:var(--a83-nav)!important}.panel,.list-item,.comic-card,.metric,.settings-form,.app-dialog{background:var(--a83-surface)!important;color:var(--a83-text)!important}.status,.muted,.page-heading p,.panel p,.list-item p{color:var(--a83-muted)!important}input,select,textarea{background:var(--a83-surface)!important;color:var(--a83-text)!important;border-color:var(--a83-line)!important}button,.button-link,.button-control{min-height:44px!important;padding:.62rem .95rem!important;border-radius:12px!important;background:var(--a83-action)!important;color:var(--a83-accent)!important;border-color:var(--a83-line)!important}button.primary,.button-link.primary{background:var(--a83-accent)!important;color:#fff!important}.app-nav button.active,[aria-pressed="true"]{background:var(--a83-accent-soft)!important;color:var(--a83-text)!important}.a83-panel{margin-top:16px}.a83-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.a83-theme-button.active{background:var(--a83-accent-soft)!important;color:var(--a83-text)!important}.a83-support-grid{display:grid;grid-template-columns:repeat(2,minmax(0,240px));gap:14px;margin:14px 0}.a83-support-grid figure{margin:0;padding:10px;border:1px solid var(--a83-line);border-radius:16px;background:var(--a83-action);text-align:center}.a83-support-grid img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border-radius:10px}.a83-support-grid figcaption{padding-top:7px;font-weight:700}.a83-state{display:inline-flex;padding:5px 10px;border-radius:999px;font-size:.85rem;font-weight:700}.a83-good{background:var(--a83-good-soft);color:var(--a83-good)}.a83-warn{background:var(--a83-warn-soft);color:var(--a83-warn)}.a83-bad{background:var(--a83-bad-soft);color:var(--a83-bad)}.a83-muted{background:var(--a83-action);color:var(--a83-muted)}.a83-drop{padding:20px;border:1px dashed var(--a83-line);border-radius:16px;text-align:center;cursor:pointer;background:color-mix(in srgb,var(--a83-surface) 88%,var(--a83-accent) 12%)}.a83-drop.drag{outline:2px solid var(--a83-accent)}.a83-pack{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--a83-line)}.a83-update-detail{margin-top:10px;padding:10px 12px;border-radius:12px;background:var(--a83-action);color:var(--a83-muted)}@media(max-width:640px){.a83-support-grid{grid-template-columns:1fr 1fr}.a83-row>*{flex:1 1 auto}}
`
    document.head.appendChild(style)
}

function systemDark() {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}
function storedTheme() {
    const value = localStorage.getItem(THEME_KEY)
    return ['system', 'light', 'dark'].includes(value) ? value : 'system'
}
function applyTheme(mode = storedTheme()) {
    localStorage.setItem(THEME_KEY, mode)
    const dark = mode === 'dark' || (mode === 'system' && systemDark())
    document.documentElement.dataset.picaTheme = dark ? 'dark' : 'light'
    document.querySelectorAll('.a83-theme-button').forEach((button) => {
        button.classList.toggle('active', button.dataset.theme === mode)
        button.textContent = `${button.dataset.theme === mode ? '✓ ' : ''}${button.dataset.label}`
    })
}

async function api(path, init = {}) {
    const response = await fetch(path, { cache: 'no-store', ...init })
    const text = await response.text()
    let value = null
    try { value = text ? JSON.parse(text) : null } catch { value = { error: text } }
    if (!response.ok) throw new Error(value?.error || `HTTP ${response.status}`)
    return value
}
async function status() {
    desktopStatus = await api('/api/v1/desktop/status')
    return desktopStatus
}
async function desktopPost(path, body) {
    if (!desktopStatus?.csrfToken) await status()
    return api(path, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': desktopStatus?.csrfToken || ''
        },
        body: JSON.stringify(body)
    })
}
function bytes(value) {
    const n = Number(value || 0)
    if (n < 1024) return `${n} B`
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
    return `${(n / 1024 ** 3).toFixed(2)} GB`
}
function readFileBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
        reader.onload = () => {
            const value = String(reader.result || '')
            resolve(value.slice(value.indexOf(',') + 1))
        }
        reader.readAsDataURL(file)
    })
}

function appearancePanel() {
    const settings = $('#settings')
    if (!settings || $('#a83-appearance')) return
    const panel = document.createElement('article')
    panel.id = 'a83-appearance'
    panel.className = 'panel a83-panel'
    panel.innerHTML = `<h3>外观</h3><div class="a83-row"></div>`
    const row = panel.querySelector('.a83-row')
    for (const [mode, label] of [['system','跟随系统'],['light','浅色'],['dark','深色']]) {
        const button = document.createElement('button')
        button.type = 'button'; button.className = 'a83-theme-button'; button.dataset.theme = mode; button.dataset.label = label
        button.onclick = () => applyTheme(mode)
        row.appendChild(button)
    }
    const form = $('#settings-form')
    form?.insertAdjacentElement('afterend', panel)
    applyTheme()
}

function supportPanel() {
    const settings = $('#settings')
    if (!settings || $('#a83-support')) return
    const panel = document.createElement('article')
    panel.id = 'a83-support'; panel.className = 'panel a83-panel'
    panel.innerHTML = `<h3>支持项目</h3><p>感谢你使用 Pica Library。</p><div class="a83-support-grid"><figure><img src="./support-wechat.svg" alt="微信支付收款码"><figcaption>微信支付</figcaption></figure><figure><img src="./support-alipay.svg" alt="支付宝收款码"><figcaption>支付宝</figcaption></figure></div><div class="a83-row"><button type="button" id="a83-star">⭐ 给项目 Star</button></div>`
    panel.querySelector('#a83-star').onclick = () => window.open('https://github.com/Saber-Alter-Lily/pica-library', '_blank', 'noopener')
    settings.appendChild(panel)
}

async function personalizationPanel() {
    const existing = $('#a83-personalization')
    if (existing) existing.remove()
    let value
    try { value = await status() } catch { return }
    const p = value.personalization || {}
    const enabled = p.starUnlocked === true && Number(p.starUserId || 0) > 0 && p.starAuthMethod === 'github-account-device-flow'
    if (!enabled) return
    const settings = $('#settings')
    if (!settings) return
    const panel = document.createElement('article')
    panel.id = 'a83-personalization'; panel.className = 'panel a83-panel'
    panel.innerHTML = `<div class="section-heading"><div><h3>个性化装扮</h3></div><span class="a83-state a83-good">已解锁</span></div><label class="a83-drop" id="a83-theme-drop"><strong>拖入 Pica Theme Pack</strong><br><span>或点击选择 .pica-theme / .zip</span><input id="a83-theme-file" type="file" accept=".pica-theme,.zip,application/zip" hidden></label><p id="a83-theme-message" class="status"></p><div id="a83-theme-list"></div>`
    settings.appendChild(panel)
    const drop = panel.querySelector('#a83-theme-drop')
    const input = panel.querySelector('#a83-theme-file')
    const message = panel.querySelector('#a83-theme-message')
    const render = (packs = []) => {
        const list = panel.querySelector('#a83-theme-list'); list.innerHTML = '<h4>已安装装扮</h4>'
        if (!packs.length) { list.insertAdjacentHTML('beforeend','<p class="status">暂时没有装扮包。</p>'); return }
        for (const pack of packs) {
            const row = document.createElement('div'); row.className = 'a83-pack'
            row.innerHTML = `<div><strong>${String(pack.name || pack.id)}</strong><div class="status">${String(pack.author || '')} · ${String(pack.version || '')}</div></div><span class="status">${bytes(pack.size)}</span>`
            list.appendChild(row)
        }
    }
    render(p.themePacks || [])
    async function install(file) {
        if (!file) return
        if (file.size > 7 * 1024 * 1024) { message.textContent = '装扮包过大；请控制在 7 MB 以内。'; return }
        message.textContent = '正在校验并安装装扮包…'
        try {
            const dataBase64 = await readFileBase64(file)
            const result = await desktopPost('/api/v1/desktop/settings', { personalizationAction:'import-theme', fileName:file.name, dataBase64 })
            message.textContent = `已安装：${result.themePack?.name || file.name}。手机连上电脑后可同步。`
            desktopStatus = null
            const fresh = await status(); render(fresh.personalization?.themePacks || [])
        } catch (error) { message.textContent = `安装失败：${error.message}` }
        input.value = ''
    }
    input.onchange = () => install(input.files?.[0])
    for (const name of ['dragenter','dragover']) drop.addEventListener(name,(event)=>{event.preventDefault();drop.classList.add('drag')})
    for (const name of ['dragleave','drop']) drop.addEventListener(name,(event)=>{event.preventDefault();drop.classList.remove('drag')})
    drop.addEventListener('drop',(event)=>install(event.dataTransfer?.files?.[0]))
}

function updateEnhancement() {
    const panel = $('#settings-update')
    if (!panel || $('#a83-update-detail')) return
    const detail = document.createElement('div')
    detail.id = 'a83-update-detail'; detail.className = 'a83-update-detail'; detail.textContent = '可在网页内完成检查、下载校验、应用和重启。'
    $('#update-message')?.insertAdjacentElement('afterend', detail)
    const retry = document.createElement('button')
    retry.type = 'button'; retry.textContent = '重新检查'; retry.id = 'a83-update-retry'
    retry.onclick = () => $('#update-check')?.click()
    panel.querySelector('.actions')?.appendChild(retry)
    const start = () => {
        if (updateTimer) clearInterval(updateTimer)
        lastUpdateProgress = ''; lastUpdateChangeAt = Date.now()
        updateTimer = setInterval(pollUpdate, 650)
        pollUpdate()
    }
    $('#update-one-click')?.addEventListener('click', start)
    $('#update-apply')?.addEventListener('click', start)
    async function pollUpdate() {
        try {
            const progress = await api('/api/v1/update/progress')
            const signature = JSON.stringify(progress)
            if (signature !== lastUpdateProgress) { lastUpdateProgress = signature; lastUpdateChangeAt = Date.now() }
            const phase = String(progress.phase || 'idle')
            const current = Number(progress.current || 0), total = Number(progress.total || 0)
            const suffix = total > 0 ? ` · ${current}/${total} · ${Math.round(current/total*100)}%` : ''
            detail.textContent = `更新状态：${phase}${suffix}`
            detail.className = `a83-update-detail ${phase === 'failed' ? 'a83-bad' : phase === 'ready' || phase === 'complete' ? 'a83-good' : ''}`
            const active = ['validating','extracting','applying','downloading'].includes(phase)
            if (!active && updateTimer) { clearInterval(updateTimer); updateTimer = null }
            if (active && Date.now() - lastUpdateChangeAt > 120000) detail.textContent += ' · 状态长时间未变化，可重新检查；程序不会覆盖用户数据。'
        } catch (error) {
            detail.textContent = `更新状态暂不可读：${error.message}`
        }
    }
}

function removeSourceEntryPoints() {
    document.querySelectorAll('a,button').forEach((node) => {
        const text = (node.textContent || '').trim()
        if (/查看源码|source code|open source/i.test(text)) node.remove()
    })
}

async function init() {
    injectStyles(); applyTheme(); appearancePanel(); supportPanel(); updateEnhancement(); removeSourceEntryPoints(); await personalizationPanel()
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (storedTheme() === 'system') applyTheme('system') })
    const observer = new MutationObserver(removeSourceEntryPoints)
    observer.observe(document.body, { childList:true, subtree:true })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
else init()
