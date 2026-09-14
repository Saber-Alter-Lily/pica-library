const $ = (selector) => document.querySelector(selector)
let csrf = ''

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
            disclosure('官方账号 ▾', [login, register], 'account-action-group'),
            disclosure('账号功能 ▾', [verify, probe, sync, clear], 'account-action-group')
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
    summary.textContent = '筛选 ▾'
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
        const details = disclosure('批量操作 ▾', [add, clear], 'batch-action-disclosure')
        const parent = statusNode?.parentElement || add.parentElement
        if (!parent) continue
        parent.insertBefore(details, statusNode || null)
    }
    $('#recommend-next-batch')?.classList.add('primary')
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
            ? 'E-H 会话已加密保存；公共模式仍可独立使用。'
            : '未配置 E-H 会话；公共 E-H 功能可正常使用。'
    if (value.exHentai && $('#eh-account-message'))
        $('#eh-account-message').textContent = 'ExH: ' + value.exHentai
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

function clearInputs() {
    for (const id of ['#eh-member-id','#eh-pass-hash','#eh-igneous','#eh-cf-clearance']) {
        const input = $(id)
        if (input) input.value = ''
    }
}

compactEhAccountActions()
compactOnlineToolbar()
compactBatchActions()

$('#eh-account-save')?.addEventListener('click', async () => {
    const message = $('#eh-account-message')
    try {
        message.textContent = '正在验证 E-H 会话…'
        await action({
            ehAccountAction: 'save-session',
            memberId: $('#eh-member-id').value,
            passHash: $('#eh-pass-hash').value,
            igneous: $('#eh-igneous').value,
            cfClearance: $('#eh-cf-clearance').value
        })
        clearInputs()
        message.textContent = 'E-H 会话验证成功并已加密保存。'
    } catch (error) {
        message.textContent = error instanceof Error ? error.message : String(error)
    }
})
$('#eh-account-verify')?.addEventListener('click', async () => {
    const message = $('#eh-account-message')
    try { message.textContent = '正在验证…'; await action({ ehAccountAction: 'verify-session' }); message.textContent = 'E-H 会话有效。' }
    catch (error) { message.textContent = error instanceof Error ? error.message : String(error) }
})
$('#eh-exh-probe')?.addEventListener('click', async () => {
    const message = $('#eh-account-message')
    try { const value = await action({ ehAccountAction: 'probe-exh' }); message.textContent = 'ExH: ' + value.ehAccount.exHentai }
    catch (error) { message.textContent = error instanceof Error ? error.message : String(error) }
})
$('#eh-favorites-sync')?.addEventListener('click', async () => {
    const message = $('#eh-account-message')
    try { message.textContent = '正在同步 E-H 云收藏…'; const value = await action({ ehAccountAction: 'sync-favorites' }); message.textContent = 'E-H 云收藏已同步：' + Number(value.ehAccount.sync?.remoteFavoriteCount || 0) + ' 本。' }
    catch (error) { message.textContent = error instanceof Error ? error.message : String(error) }
})
$('#eh-account-clear')?.addEventListener('click', async () => {
    const message = $('#eh-account-message')
    try { await action({ ehAccountAction: 'clear-session' }); clearInputs(); message.textContent = 'E-H 会话已从本机删除；公共功能不受影响。' }
    catch (error) { message.textContent = error instanceof Error ? error.message : String(error) }
})

void status().catch(() => {})
