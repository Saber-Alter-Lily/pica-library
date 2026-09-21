import { copy as ehT } from './locale-runtime.js'

const $ = (selector) => document.querySelector(selector)
let csrf = ''
let webLoginPoll = null

function setLabelPrefix(input, value) {
    const label = input?.closest('label')
    if (!label) return
    let textNode = label.firstChild
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
        textNode = document.createTextNode('')
        label.prepend(textNode)
    }
    textNode.textContent = value
}

function localizeStaticEhAccount() {
    const panel = $('#settings-eh-account')
    if (!panel) return
    const topSummary = panel.querySelector(':scope > summary')
    const strong = topSummary?.querySelector('strong')
    if (strong) strong.textContent = ehT('E-Hentai / ExHentai 账号','E-Hentai / ExHentai account','E-Hentai / ExHentai アカウント')
    if (topSummary) {
        for (const node of [...topSummary.childNodes]) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('·'))
                node.textContent = ehT(' · 可选增强 ',' · Optional enhancement ',' · オプション機能 ')
        }
    }
    const advanced = panel.querySelector('.account-advanced > summary')
    if (advanced) advanced.textContent = ehT('高级 · 手动导入官方站点会话','Advanced · manually import an official-site session','詳細 · 公式サイトのセッションを手動で取り込む')
    setLabelPrefix($('#eh-member-id'),'ipb_member_id')
    setLabelPrefix($('#eh-pass-hash'),'ipb_pass_hash')
    setLabelPrefix($('#eh-igneous'),ehT('igneous（可选）','igneous (optional)','igneous（任意）'))
    setLabelPrefix($('#eh-cf-clearance'),ehT('cf_clearance（仅遇到 Cloudflare 时可选）','cf_clearance (optional for Cloudflare)','cf_clearance（Cloudflare 利用時のみ任意）'))
    const copy = [
        ['#eh-web-login-start','网页登录（推荐）','Web login (recommended)','Web ログイン（推奨）'],
        ['#eh-web-login-cancel','取消网页登录','Cancel web login','Web ログインをキャンセル'],
        ['#eh-account-save','保存并验证会话','Save & verify session','セッションを保存して検証'],
        ['#eh-account-verify','重新验证','Verify again','再検証'],
        ['#eh-exh-probe','探测 ExH','Probe ExH','ExH を確認'],
        ['#eh-favorites-sync','同步 E-H 云收藏','Sync E-H cloud favorites','E-H クラウドお気に入りを同期'],
        ['#eh-account-clear','清除 E-H 会话','Clear E-H session','E-H セッションを消去']
    ]
    for (const [selector,zh,en,ja] of copy) {
        const node=$(selector)
        if(node) node.textContent=ehT(zh,en,ja)
    }
    const login=panel.querySelector('a[href*="act=Login"]')
    if(login) login.textContent=ehT('默认浏览器打开官方登录页（手动）','Open official login page in default browser (manual)','既定ブラウザで公式ログインページを開く（手動）')
    const register=panel.querySelector('a[href*="act=Reg"]')
    if(register) register.textContent=ehT('打开官方注册页','Open official registration page','公式登録ページを開く')
}

function disclosure(summaryText, nodes, className) {
    const details = document.createElement('details')
    details.className = className
    const summary = document.createElement('summary')
    summary.textContent = summaryText
    const body = document.createElement('div')
    body.className = 'compact-action-list'
    for (const node of nodes) if (node) body.append(node)
    details.append(summary, body)
    return details
}

function compactEhAccountActions() {
    const panel = $('#settings-eh-account')
    if (!panel || panel.dataset.compactActions === 'true') return
    const actions = panel.querySelector('.actions')
    const advanced = panel.querySelector('.account-advanced')
    const save = $('#eh-account-save')
    if (advanced && save) {
        const primary = document.createElement('div')
        primary.className = 'account-primary-action'
        primary.append(save)
        advanced.append(primary)
    }
    if (actions) {
        const login = actions.querySelector('a[href*="act=Login"]')
        const register = actions.querySelector('a[href*="act=Reg"]')
        const verify = $('#eh-account-verify')
        const probe = $('#eh-exh-probe')
        const sync = $('#eh-favorites-sync')
        const clear = $('#eh-account-clear')
        clear?.classList.add('danger-action')
        actions.append(
            disclosure(ehT('官方账号 ▾','Official account ▾','公式アカウント ▾'), [login, register], 'account-action-group'),
            disclosure(ehT('账号功能 ▾','Account actions ▾','アカウント操作 ▾'), [verify, probe, sync, clear], 'account-action-group')
        )
    }
    panel.dataset.compactActions = 'true'
}

function compactOnlineToolbar() {
    const keyword = $('#search-keyword')
    const tags = $('#search-tags')
    const sort = $('#search-sort')
    const searchButton = $('#search-button')
    const toolbar = keyword?.closest('.toolbar')
    if (!toolbar || !tags || !sort || toolbar.querySelector('.search-filters')) return
    const filters = document.createElement('details')
    filters.className = 'search-filters'
    const summary = document.createElement('summary')
    summary.textContent = ehT('筛选 ▾','Filters ▾','絞り込み ▾')
    const body = document.createElement('div')
    body.className = 'compact-filter-panel'
    body.append(tags, sort)
    filters.append(summary, body)
    toolbar.insertBefore(filters, searchButton || null)
}

function compactBatchActions() {
    const groups = [
        ['#recommend-add-shelf', '#recommend-clear-selection', '#recommend-selection-status'],
        ['#search-add-shelf', '#search-clear-selection', '#search-selection-status']
    ]
    for (const [addSelector, clearSelector, statusSelector] of groups) {
        const add = $(addSelector)
        const clear = $(clearSelector)
        const statusNode = $(statusSelector)
        if (!add || !clear || add.closest('.batch-action-disclosure')) continue
        const details = disclosure(ehT('批量操作 ▾','Batch actions ▾','一括操作 ▾'), [add, clear], 'batch-action-disclosure')
        const parent = statusNode?.parentElement || add.parentElement
        if (!parent) continue
        parent.insertBefore(details, statusNode || null)
    }
    $('#recommend-next-batch')?.classList.add('primary')
}

function compactResultCardActions(root = document) {
    const actionRows = root.matches?.('.detail-actions')
        ? [root]
        : [...(root.querySelectorAll?.('.detail-actions') || [])]
    for (const actions of actionRows) {
        if (actions.dataset.compactActions === 'true') continue
        const detail = actions.querySelector('[data-result-detail]')
        const download = actions.querySelector('[data-result-download]')
        const favorite = actions.querySelector('[data-result-favorite]')
        if (!detail || (!download && !favorite)) continue
        detail.classList.add('primary')
        actions.append(disclosure(ehT('更多 ▾','More ▾','その他 ▾'), [download, favorite], 'result-action-menu'))
        actions.dataset.compactActions = 'true'
    }
}

function observeResultCardActions() {
    const roots = ['#search-results', '#recommend-results']
        .map((selector) => $(selector))
        .filter(Boolean)
    for (const root of roots) compactResultCardActions(root)
    if (!roots.length || typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations)
            for (const node of mutation.addedNodes)
                if (node instanceof Element) compactResultCardActions(node)
    })
    for (const root of roots) observer.observe(root, { childList: true, subtree: true })
}

function exhLabel(value, configured = true) {
    if (!configured) return ehT('需 E-H 登录','E-H login required','E-H ログインが必要')
    if (value === 'AVAILABLE') return ehT('当前可用','Available','利用可能')
    if (value === 'NETWORK_ERROR') return ehT('暂无法确认','Unable to confirm','確認できません')
    if (value === 'UNAVAILABLE') return ehT('当前不可访问','Unavailable','現在アクセス不可')
    return ehT('待检查','Not checked','未確認')
}

async function status() {
    const response = await fetch('/api/v1/desktop/status', { cache: 'no-store' })
    if (!response.ok) throw new Error('Desktop status unavailable')
    const value = await response.json()
    csrf = value.csrfToken || csrf
    render(value.ehAccount || { configured: false })
}

function render(value) {
    const configured = Boolean(value.configured)
    const state = $('#eh-account-state')
    if (state)
        state.textContent = configured
            ? ehT('E-H 会话已加密保存；公共模式仍可独立使用。','E-H session is encrypted and saved; public mode remains independently available.','E-H セッションは暗号化して保存されています。公開モードは引き続き単独で利用できます。')
            : ehT('未配置 E-H 会话；公共 E-H 功能可正常使用。','No E-H session is configured; public E-H features remain available.','E-H セッションは未設定です。公開 E-H 機能は通常どおり利用できます。')
    if ($('#eh-account-message'))
        $('#eh-account-message').textContent = ehT('ExH 扩展：','ExH extension: ','ExH 拡張：') + exhLabel(value.exHentai, configured)
}

async function action(payload) {
    const response = await fetch('/api/v1/desktop/settings', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': csrf
        },
        body: JSON.stringify(payload)
    })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || 'E-H account action failed')
    render(value.ehAccount || {})
    return value
}

async function desktopLoginRequest(path, method = 'GET') {
    if (!csrf) await status()
    const response = await fetch(path, {
        method,
        headers: method === 'POST' ? { 'x-pica-csrf': csrf } : undefined,
        cache: 'no-store'
    })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || ehT('E-H 网页登录失败','E-H web login failed','E-H Web ログインに失敗しました'))
    return value
}

function stopWebLoginPoll() {
    if (webLoginPoll) clearInterval(webLoginPoll)
    webLoginPoll = null
}

function renderWebLoginState(value) {
    const message = $('#eh-account-message')
    const start = $('#eh-web-login-start')
    const cancel = $('#eh-web-login-cancel')
    const active = ['opening', 'waiting', 'verifying'].includes(value?.state)
    if (start) start.disabled = active
    if (cancel) cancel.hidden = !active
    if (message && value?.message) message.textContent = value.message
    if (value?.state === 'complete') {
        stopWebLoginPoll()
        void status().then(() => {
            if (message) message.textContent = ehT('E-H 登录成功，会话已自动验证并加密保存。','E-H login succeeded. The session was verified and encrypted automatically.','E-H ログインに成功しました。セッションは自動検証され、暗号化して保存されました。')
        })
    } else if (value?.state === 'failed' || value?.state === 'cancelled') {
        stopWebLoginPoll()
    }
}

async function pollWebLogin() {
    try {
        renderWebLoginState(
            await desktopLoginRequest('/api/v1/desktop/eh-web-login/status')
        )
    } catch (error) {
        stopWebLoginPoll()
        const message = $('#eh-account-message')
        if (message)
            message.textContent = error instanceof Error ? error.message : String(error)
    }
}

async function startWebLogin() {
    const message = $('#eh-account-message')
    try {
        if (message) message.textContent = ehT('正在打开 E-H 官方登录窗口…','Opening the official E-H login window…','E-H 公式ログインウィンドウを開いています…')
        renderWebLoginState(
            await desktopLoginRequest('/api/v1/desktop/eh-web-login/start', 'POST')
        )
        stopWebLoginPoll()
        webLoginPoll = setInterval(() => void pollWebLogin(), 900)
        void pollWebLogin()
    } catch (error) {
        if (message)
            message.textContent = error instanceof Error ? error.message : String(error)
    }
}

async function cancelWebLogin() {
    try {
        renderWebLoginState(
            await desktopLoginRequest('/api/v1/desktop/eh-web-login/cancel', 'POST')
        )
    } catch (error) {
        const message = $('#eh-account-message')
        if (message)
            message.textContent = error instanceof Error ? error.message : String(error)
    }
}

async function withBusyButton(button, work) {
    if (!button || button.disabled) return
    button.disabled = true
    try {
        await work()
    } finally {
        button.disabled = false
    }
}

function clearInputs() {
    for (const id of ['#eh-member-id','#eh-pass-hash','#eh-igneous','#eh-cf-clearance']) {
        const input = $(id)
        if (input) input.value = ''
    }
}

localizeStaticEhAccount()
compactEhAccountActions()
compactOnlineToolbar()
compactBatchActions()
observeResultCardActions()

$('#eh-web-login-start')?.addEventListener('click', () => void startWebLogin())
$('#eh-web-login-cancel')?.addEventListener('click', () => void cancelWebLogin())
$('#eh-account-save')?.addEventListener('click', async (event) => {
    const button = event.currentTarget
    const message = $('#eh-account-message')
    await withBusyButton(button, async () => {
        try {
            message.textContent = ehT('正在验证 E-H 会话…','Verifying E-H session…','E-H セッションを検証中…')
            await action({
                ehAccountAction: 'save-session',
                memberId: $('#eh-member-id').value,
                passHash: $('#eh-pass-hash').value,
                igneous: $('#eh-igneous').value,
                cfClearance: $('#eh-cf-clearance').value
            })
            clearInputs()
            message.textContent = ehT('E-H 会话验证成功并已加密保存。','E-H session verified and encrypted successfully.','E-H セッションの検証に成功し、暗号化して保存しました。')
        } catch (error) {
            message.textContent =
                error instanceof Error ? error.message : String(error)
        }
    })
})
$('#eh-account-verify')?.addEventListener('click', async (event) => {
    const message = $('#eh-account-message')
    await withBusyButton(event.currentTarget, async () => {
        try {
            message.textContent = ehT('正在验证…','Verifying…','検証中…')
            await action({ ehAccountAction: 'verify-session' })
            message.textContent = ehT('E-H 会话有效。','E-H session is valid.','E-H セッションは有効です。')
        } catch (error) {
            message.textContent =
                error instanceof Error ? error.message : String(error)
        }
    })
})
$('#eh-exh-probe')?.addEventListener('click', async (event) => {
    const message = $('#eh-account-message')
    await withBusyButton(event.currentTarget, async () => {
        try {
            const value = await action({ ehAccountAction: 'probe-exh' })
            message.textContent =
                ehT('ExH 扩展：','ExH extension: ','ExH 拡張：') +
                exhLabel(
                    value.ehAccount.exHentai,
                    Boolean(value.ehAccount.configured)
                )
        } catch (error) {
            message.textContent =
                error instanceof Error ? error.message : String(error)
        }
    })
})
$('#eh-favorites-sync')?.addEventListener('click', async (event) => {
    const message = $('#eh-account-message')
    await withBusyButton(event.currentTarget, async () => {
        try {
            message.textContent = ehT('正在同步 E-H 云收藏…','Syncing E-H cloud favorites…','E-H クラウドお気に入りを同期中…')
            const value = await action({ ehAccountAction: 'sync-favorites' })
            message.textContent =
                ehT('E-H 云收藏已同步：','E-H cloud favorites synced: ','E-H クラウドお気に入りを同期しました：') +
                Number(value.ehAccount.sync?.remoteFavoriteCount || 0) +
                ehT(' 本。',' works.',' 作品。')
        } catch (error) {
            message.textContent =
                error instanceof Error ? error.message : String(error)
        }
    })
})
$('#eh-account-clear')?.addEventListener('click', async (event) => {
    const confirmed = window.picaConfirmAction
        ? await window.picaConfirmAction(
              ehT('清除本机保存的 E-H 会话？E-H 公共搜索和阅读仍可继续使用。','Clear the saved E-H session from this computer? Public E-H search and reading will remain available.','このPCに保存された E-H セッションを消去しますか？公開 E-H の検索と閲覧は引き続き利用できます。')
          )
        : window.confirm(
              ehT('清除本机保存的 E-H 会话？E-H 公共搜索和阅读仍可继续使用。','Clear the saved E-H session from this computer? Public E-H search and reading will remain available.','このPCに保存された E-H セッションを消去しますか？公開 E-H の検索と閲覧は引き続き利用できます。')
          )
    if (!confirmed) return
    const message = $('#eh-account-message')
    await withBusyButton(event.currentTarget, async () => {
        try {
            await action({ ehAccountAction: 'clear-session' })
            clearInputs()
            message.textContent =
                ehT('E-H 会话已从本机删除；公共功能不受影响。','The E-H session was removed from this computer; public features are unaffected.','E-H セッションをこのPCから削除しました。公開機能には影響しません。')
        } catch (error) {
            message.textContent =
                error instanceof Error ? error.message : String(error)
        }
    })
})

void status().then(() => pollWebLogin()).catch(() => {})
void import('./v040-parity.js').catch(() => {})


function localizeGeneratedEhDisclosures() {
    const panel=$('#settings-eh-account')
    const summaries=[...(panel?.querySelectorAll('.account-action-group > summary') || [])]
    if(summaries[0]) summaries[0].textContent=ehT('官方账号 ▾','Official account ▾','公式アカウント ▾')
    if(summaries[1]) summaries[1].textContent=ehT('账号功能 ▾','Account actions ▾','アカウント操作 ▾')
    const filters=$('.search-filters > summary')
    if(filters) filters.textContent=ehT('筛选 ▾','Filters ▾','絞り込み ▾')
    for(const summary of document.querySelectorAll('.batch-action-disclosure > summary'))
        summary.textContent=ehT('批量操作 ▾','Batch actions ▾','一括操作 ▾')
    for(const summary of document.querySelectorAll('.result-action-menu > summary'))
        summary.textContent=ehT('更多 ▾','More ▾','その他 ▾')
}

localizeGeneratedEhDisclosures()
document.addEventListener('pica-language-change',()=>{
    localizeStaticEhAccount()
    localizeGeneratedEhDisclosures()
})
