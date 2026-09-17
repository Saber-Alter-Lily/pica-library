const V5 = {
    snapshot: null,
    search: '',
    busy: false
}

const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

async function request(path, options = {}) {
    const response = await fetch(path, options)
    const value = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`)
    return value
}

const post = (path, body) =>
    request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    })

function ensurePanel() {
    if (document.querySelector('#settings-recommendation-v5')) return
    const anchor = document.querySelector('#settings-recommendation-v4')
    if (!anchor) return
    const panel = document.createElement('article')
    panel.id = 'settings-recommendation-v5'
    panel.className = 'panel'
    panel.innerHTML = `
        <h3>推荐控制中心 · V5 Beta</h3>
        <p>Desktop 负责主要画像与候选计算；你的“多一点 / 少一点 / 屏蔽”和本次意图独立保存，不会改写系统推断画像。手机配对时会同步同一份策略。</p>
        <p id="v5-policy-status" class="status">正在读取推荐策略…</p>
        <div class="actions">
            <button id="v5-policy-refresh" type="button">刷新策略</button>
            <button id="v5-policy-rebuild" type="button" class="primary">按当前策略重新生成推荐</button>
        </div>
        <hr />
        <div class="actions"><button id="v5-session-reset" type="button">清除本次意图</button><span id="v5-session-status" class="status"></span></div>
        <p class="status">在下面某个标签、作者或分类上点“本次想看”，只影响当前会话；多一点、少一点默认持续有效，随时可恢复系统判断。</p>
        <hr />
        <label>查找标签 / 作者 / 分类<input id="v5-policy-search" placeholder="输入名称，例如作者或标签" /></label>
        <div id="v5-inferred-list" class="list"></div>
        <h4>你主动调整的项目</h4>
        <div id="v5-control-list" class="list"></div>
    `
    anchor.insertAdjacentElement('afterend', panel)
    panel.querySelector('#v5-policy-refresh').addEventListener('click', loadPolicy)
    panel.querySelector('#v5-policy-rebuild').addEventListener('click', () => {
        const button = document.querySelector('#recommend-restart')
        if (button) button.click()
        document.querySelector('[data-view="discover"]')?.click()
    })
    panel.querySelector('#v5-session-reset').addEventListener('click', async () => {
        try {
            await post('/api/v1/recommendation-v5/session', { mode: 'DEFAULT' })
            await loadPolicy()
        } catch (error) {
            showStatus(error.message, true)
        }
    })
    panel.querySelector('#v5-policy-search').addEventListener('input', (event) => {
        V5.search = String(event.target.value || '').trim().toLocaleLowerCase()
        renderPolicy()
    })
}

function showStatus(message, bad = false) {
    const target = document.querySelector('#v5-policy-status')
    if (!target) return
    target.textContent = message
    target.classList.toggle('error', Boolean(bad))
}

async function setControl(signal, direction) {
    if (V5.busy) return
    V5.busy = true
    try {
        V5.snapshot = await post('/api/v1/recommendation-v5/control', {
            targetType: signal.targetType,
            key: signal.key,
            label: signal.label,
            direction,
            scope: 'PERSISTENT'
        })
        renderPolicy()
    } catch (error) {
        showStatus(error.message, true)
    } finally {
        V5.busy = false
    }
}

function signalRow(signal) {
    const current = (V5.snapshot?.controls || []).find(
        (item) => item.targetType === signal.targetType && item.key === signal.key
    )
    const direction = current?.direction || 'DEFAULT'
    const label = signal.targetType === 'AUTHOR' ? '作者' : signal.targetType === 'CATEGORY' ? '分类' : signal.targetType === 'FANDOM' ? 'IP' : '标签'
    return `<article class="list-item" data-v5-signal="${esc(signal.targetType)}:${esc(signal.key)}">
        <div class="grow"><strong>${esc(signal.label)}</strong><p class="status">${label} · 系统支持 ${Number(signal.supportCount || 0)} 本 · 当前：${esc(direction)}</p></div>
        <div class="actions">
            <button type="button" data-v5-direction="LESS">少一点</button>
            <button type="button" data-v5-direction="DEFAULT">默认</button>
            <button type="button" data-v5-direction="MORE">多一点</button>
            <button type="button" data-v5-direction="BLOCK">屏蔽</button>
            <button type="button" data-v5-session-target="true">本次想看</button>
        </div>
    </article>`
}

function renderPolicy() {
    ensurePanel()
    if (!V5.snapshot) return
    const counts = V5.snapshot.counts || {}
    showStatus(`策略版本 ${V5.snapshot.policyVersion || 'V5'} · rev ${Number(V5.snapshot.revision || 0)} · 已有 ${Number(counts.owned || 0)} · 手动调整 ${Number(counts.controls || 0)} · 硬屏蔽 ${Number(counts.hardSuppressed || 0)}`)
    const sessionLabel = document.querySelector('#v5-session-status')
    if (sessionLabel) {
        const intent = V5.snapshot.sessionIntent || {}
        sessionLabel.textContent = intent.mode === 'TARGET'
            ? `本次想看：${intent.label || intent.key || ''}`
            : '本次意图：默认'
    }
    const inferred = Array.isArray(V5.snapshot.inferred) ? V5.snapshot.inferred : []
    const filtered = inferred
        .filter((item) => !V5.search || `${item.label} ${item.key} ${item.targetType}`.toLocaleLowerCase().includes(V5.search))
        .slice(0, V5.search ? 40 : 18)
    const inferredTarget = document.querySelector('#v5-inferred-list')
    if (inferredTarget)
        inferredTarget.innerHTML = filtered.length ? filtered.map(signalRow).join('') : '<p class="status">没有匹配项。</p>'
    const controls = Array.isArray(V5.snapshot.controls) ? V5.snapshot.controls : []
    const controlTarget = document.querySelector('#v5-control-list')
    if (controlTarget)
        controlTarget.innerHTML = controls.length
            ? controls.map((item) => `<article class="list-item"><div class="grow"><strong>${esc(item.label)}</strong><p class="status">${esc(item.targetType)} · ${esc(item.direction)} · ${esc(item.scope)}</p></div><button type="button" data-v5-reset="${esc(item.targetType)}:${esc(item.key)}">恢复系统判断</button></article>`).join('')
            : '<p class="status">目前没有手动覆盖，完全使用系统推断。</p>'
    document.querySelectorAll('[data-v5-signal] [data-v5-direction]').forEach((button) => {
        button.addEventListener('click', () => {
            const holder = button.closest('[data-v5-signal]')
            const [targetType, ...rest] = holder.dataset.v5Signal.split(':')
            const key = rest.join(':')
            const signal = inferred.find((item) => item.targetType === targetType && item.key === key)
            if (signal) void setControl(signal, button.dataset.v5Direction)
        })
    })
    document.querySelectorAll('[data-v5-session-target]').forEach((button) => {
        button.addEventListener('click', async () => {
            const holder = button.closest('[data-v5-signal]')
            const [targetType, ...rest] = holder.dataset.v5Signal.split(':')
            const key = rest.join(':')
            const signal = inferred.find((item) => item.targetType === targetType && item.key === key)
            if (!signal) return
            try {
                V5.snapshot = await post('/api/v1/recommendation-v5/session', {
                    mode: 'TARGET',
                    targetType: signal.targetType,
                    key: signal.key,
                    label: signal.label
                })
                renderPolicy()
            } catch (error) {
                showStatus(error.message, true)
            }
        })
    })
    document.querySelectorAll('[data-v5-reset]').forEach((button) => {
        button.addEventListener('click', () => {
            const [targetType, ...rest] = button.dataset.v5Reset.split(':')
            const key = rest.join(':')
            const item = controls.find((row) => row.targetType === targetType && row.key === key)
            if (item) void setControl(item, 'DEFAULT')
        })
    })
}

async function loadPolicy() {
    ensurePanel()
    try {
        V5.snapshot = await request('/api/v1/recommendation-v5')
        renderPolicy()
    } catch (error) {
        showStatus(`推荐控制中心暂不可用：${error.message}`, true)
    }
}

function ensureQuickDialog() {
    let dialog = document.querySelector('#v5-quick-control-dialog')
    if (dialog) return dialog
    dialog = document.createElement('dialog')
    dialog.id = 'v5-quick-control-dialog'
    dialog.className = 'app-dialog'
    dialog.innerHTML = '<div><h3>调整这类推荐</h3><div id="v5-quick-control-body"></div><div class="actions"><button type="button" id="v5-quick-close">关闭</button></div></div>'
    document.body.appendChild(dialog)
    dialog.querySelector('#v5-quick-close').addEventListener('click', () => dialog.close())
    return dialog
}

function cardContext(card) {
    const body = card.querySelector('.result-body')
    const lines = [...body.querySelectorAll('p')]
    const author = lines[0]?.textContent?.trim() || ''
    const tags = [...body.querySelectorAll('.tag')].map((node) => node.textContent.trim()).filter(Boolean)
    return { comicId: card.dataset.comicId || '', author, tags }
}

function openQuickControl(card) {
    const dialog = ensureQuickDialog()
    const context = cardContext(card)
    const body = dialog.querySelector('#v5-quick-control-body')
    const rows = []
    if (context.author)
        rows.push(`<p><strong>作者：${esc(context.author)}</strong></p><div class="actions"><button data-v5-quick-type="AUTHOR" data-v5-quick-key="${esc(context.author)}" data-v5-quick-direction="MORE">多一点</button><button data-v5-quick-type="AUTHOR" data-v5-quick-key="${esc(context.author)}" data-v5-quick-direction="LESS">少一点</button><button data-v5-quick-type="AUTHOR" data-v5-quick-key="${esc(context.author)}" data-v5-quick-direction="BLOCK">不推荐此作者</button></div>`)
    for (const tag of context.tags.slice(0, 4))
        rows.push(`<p><strong>标签：${esc(tag)}</strong></p><div class="actions"><button data-v5-quick-type="TAG" data-v5-quick-key="${esc(tag)}" data-v5-quick-direction="MORE">多一点</button><button data-v5-quick-type="TAG" data-v5-quick-key="${esc(tag)}" data-v5-quick-direction="LESS">少一点</button></div>`)
    rows.push(`<hr/><p>这本不该作为新推荐出现：</p><div class="actions"><button data-v5-suppress-reason="already_seen">已经看过</button><button data-v5-suppress-reason="already_owned">已经拥有</button><button data-v5-suppress-reason="duplicate">重复上传</button><button data-v5-suppress-reason="temporary">暂时不想看</button></div>`)
    body.innerHTML = rows.join('')
    body.querySelectorAll('[data-v5-quick-direction]').forEach((button) => {
        button.addEventListener('click', async () => {
            await post('/api/v1/recommendation-v5/control', {
                targetType: button.dataset.v5QuickType,
                key: button.dataset.v5QuickKey,
                label: button.dataset.v5QuickKey,
                direction: button.dataset.v5QuickDirection,
                scope: 'PERSISTENT'
            })
            dialog.close()
            await loadPolicy()
        })
    })
    body.querySelectorAll('[data-v5-suppress-reason]').forEach((button) => {
        button.addEventListener('click', async () => {
            await post('/api/v1/recommendation-v5/suppress', {
                comicId: context.comicId,
                suppressed: true,
                reason: button.dataset.v5SuppressReason
            })
            card.remove()
            dialog.close()
            await loadPolicy()
        })
    })
    dialog.showModal()
}

function decorateRecommendationCards() {
    document.querySelectorAll('#recommend-results .result').forEach((card) => {
        if (card.querySelector('[data-v5-quick-control]')) return
        const body = card.querySelector('.result-body')
        if (!body) return
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.v5QuickControl = 'true'
        button.textContent = '⋯ 调节推荐'
        button.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            openQuickControl(card)
        })
        body.appendChild(button)
    })
}

const recommendationRoot = document.querySelector('#recommend-results')
if (recommendationRoot)
    new MutationObserver(decorateRecommendationCards).observe(recommendationRoot, { childList: true, subtree: true })

ensurePanel()
decorateRecommendationCards()
void loadPolicy()

document.addEventListener('pica-language-change', () => {
    ensurePanel()
    renderPolicy()
})
