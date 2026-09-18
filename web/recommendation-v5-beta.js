const V5={snapshot:null,search:'',busy:false,signalById:new Map(),quickSignals:new Map()}

const V5_FACET_LABELS={"CREATOR_ENTITY":"作者","CATEGORY":"分类","FANDOM_IP":"作品 / IP","FANDOM_CHARACTER":"角色","GENRE_THEME":"题材 / 类型","STORY_TROPE":"剧情 / 设定","RELATIONSHIP":"人物关系","IDENTITY_ROLE":"身份 / 职业","SPECIES_FANTASY":"种族 / 幻想","APPEARANCE_OUTFIT":"外观 / 服装","BODY_ATTRIBUTE":"身体特征","SETTING_LOCATION":"场景 / 地点","SEXUAL_BEHAVIOR":"行为","FETISH_TROPE":"偏好 / 情境","PHYSIOLOGY_STATE":"生理状态","CONTROL_COERCION":"支配 / 控制","RAW_TAG":"其他标签","OTHER":"其他"}

const V5_FACET_ORDER=["CREATOR_ENTITY","CATEGORY","FANDOM_IP","FANDOM_CHARACTER","GENRE_THEME","STORY_TROPE","RELATIONSHIP","IDENTITY_ROLE","SPECIES_FANTASY","APPEARANCE_OUTFIT","BODY_ATTRIBUTE","SETTING_LOCATION","SEXUAL_BEHAVIOR","FETISH_TROPE","PHYSIOLOGY_STATE","CONTROL_COERCION","RAW_TAG","OTHER"]

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch])
}

function webNorm(value) {
    return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ')
}

function webClampLevel(value) {
    return Math.max(1, Math.min(10, Math.round(Number(value) || 1)))
}

async function request(path, options = {}) {
    const response = await fetch(path, options)
    const value = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`)
    return value
}

function post(path, body) {
    return request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    })
}

function ensureStyles() {
    if (document.querySelector('#v5-web-polish-style')) return
    const style = document.createElement('style')
    style.id = 'v5-web-polish-style'
    style.textContent = `
#settings-recommendation-v5{overflow:hidden}
#settings-recommendation-v5 .v5-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
#settings-recommendation-v5 .v5-head .actions{margin:0;display:flex;gap:8px;flex-wrap:wrap}
#settings-recommendation-v5 .v5-help{margin:10px 0;padding:11px 13px;border-radius:12px;background:color-mix(in srgb,var(--a83-accent-soft,#eef0ff) 70%,transparent);line-height:1.55}
#settings-recommendation-v5 .v5-session-row{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.v5-facet-list{display:grid;gap:10px;margin-top:12px}
.v5-facet-group{border:1px solid var(--a83-line,#ddd);border-radius:14px;overflow:hidden;background:color-mix(in srgb,var(--a83-surface,#fff) 97%,transparent)}
.v5-facet-group>summary{cursor:pointer;display:flex;gap:8px;align-items:center;padding:12px 14px;font-weight:700;list-style:none}
.v5-facet-group>summary::-webkit-details-marker{display:none}
.v5-facet-group>summary::after{content:'＋';margin-left:auto;opacity:.65}
.v5-facet-group[open]>summary::after{content:'－'}
.v5-facet-count{font-size:.78rem;font-weight:600;opacity:.6}
.v5-facet-body{padding:0 12px 10px}
.v5-signal-row{display:grid;grid-template-columns:minmax(150px,.8fr) minmax(270px,1.6fr) auto;gap:14px;align-items:center;padding:12px 2px;border-top:1px solid color-mix(in srgb,var(--a83-line,#ddd) 70%,transparent)}
.v5-signal-row:first-child{border-top:0}
.v5-signal-copy{min-width:0}.v5-signal-copy strong{display:block;overflow:hidden;text-overflow:ellipsis}
.v5-range-wrap{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
.v5-range-wrap input[type=range]{width:100%;min-width:170px;accent-color:var(--a83-accent,#7457b9)}
.v5-range-value{min-width:3.8em;text-align:right;font-weight:700}
.v5-range-meta{grid-column:1/-1;font-size:.78rem;opacity:.72;line-height:1.4}
.v5-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.v5-row-actions button,.v5-compact{min-height:36px;padding:6px 10px}
.v5-control-list{display:flex;gap:8px;flex-wrap:wrap}
.v5-control-chip{display:flex;gap:8px;align-items:center;padding:7px 9px;border:1px solid var(--a83-line,#ddd);border-radius:999px}
#v5-quick-control-body{display:grid;gap:12px;min-width:min(680px,84vw)}
.v5-quick-row{padding:10px 0;border-bottom:1px solid var(--a83-line,#ddd)}
.v5-quick-row:last-child{border-bottom:0}
.v5-suppress-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.v5-suppress-grid button{min-height:40px}
#recommend-results .detail-actions,#recommend-results .recommend-feedback{display:grid;grid-template-columns:repeat(auto-fit,minmax(108px,1fr));gap:8px}
#recommend-results .detail-actions button,#recommend-results .recommend-feedback button{min-height:38px;padding:7px 9px}
#recommend-results .result{position:relative;transition:opacity .2s ease,filter .2s ease}
.v5-taste-toggle{margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.v5-taste-toggle button{min-height:34px;padding:5px 9px}
.v5-taste-toggle .status{margin:0}
#recommend-results .result.v5-feedback-like{box-shadow:0 0 0 2px color-mix(in srgb,#2e9d63 38%,transparent)}
#recommend-results .result.v5-feedback-dislike .cover-shell img,
#recommend-results .result.v5-suppressed .cover-shell img{filter:blur(3px) grayscale(.55);opacity:.48}
#recommend-results .result.v5-feedback-dislike .result-body>h3,
#recommend-results .result.v5-feedback-dislike .result-body>p,
#recommend-results .result.v5-feedback-dislike .result-body>div:not(.recommend-feedback):not(.detail-actions):not(.v5-card-state),
#recommend-results .result.v5-suppressed .result-body>h3,
#recommend-results .result.v5-suppressed .result-body>p{opacity:.52}
.v5-card-state{margin:8px 0 0;padding:7px 9px;border-radius:9px;font-size:.82rem;font-weight:700;background:color-mix(in srgb,var(--a83-accent-soft,#eef0ff) 75%,transparent)}
.v5-card-state.positive{color:#187646}.v5-card-state.negative{color:#9b3b3b}
#v5-toast-stack{position:fixed;right:20px;bottom:22px;z-index:10000;display:grid;gap:8px;max-width:min(420px,calc(100vw - 32px))}
.v5-toast{padding:11px 14px;border-radius:12px;background:var(--a83-surface,#fff);border:1px solid var(--a83-line,#ddd);box-shadow:0 10px 30px rgba(0,0,0,.16);animation:v5toastin .18s ease-out}
.v5-toast.positive{border-color:color-mix(in srgb,#2e9d63 45%,var(--a83-line,#ddd))}
.v5-toast.negative{border-color:color-mix(in srgb,#c44b4b 45%,var(--a83-line,#ddd))}
@keyframes v5toastin{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}
@media(max-width:850px){.v5-signal-row{grid-template-columns:1fr}.v5-row-actions{justify-content:flex-start}.v5-range-wrap input[type=range]{min-width:120px}}
`
    document.head.appendChild(style)
}

function showToast(message, tone = 'neutral') {
    let stack = document.querySelector('#v5-toast-stack')
    if (!stack) {
        stack = document.createElement('div')
        stack.id = 'v5-toast-stack'
        document.body.appendChild(stack)
    }
    const toast = document.createElement('div')
    toast.className = `v5-toast ${tone}`
    toast.textContent = message
    stack.appendChild(toast)
    window.setTimeout(() => toast.remove(), 3200)
}

function showStatus(message, bad = false) {
    const target = document.querySelector('#v5-policy-status')
    if (!target) return
    target.textContent = message
    target.classList.toggle('error', Boolean(bad))
}

function baselineLevel(signal) {
    if (Number.isFinite(Number(signal?.baselineLevel)))
        return webClampLevel(signal.baselineLevel)
    const count = Math.max(0, Number(signal?.supportCount || 0))
    const share = Math.max(0, Math.min(1, Number(signal?.supportShare || 0)))
    if (!count) return 1
    const countStrength = 1 - Math.exp(-count / 12)
    const shareStrength = Math.sqrt(Math.min(1, share / 0.12))
    return webClampLevel(1 + 9 * (0.75 * countStrength + 0.25 * shareStrength))
}

function signalId(signal) { return `${signal.targetType}:${signal.key}` }

function controlFor(signal) {
    return (V5.snapshot?.controls || []).find(
        (item) => item.targetType === signal.targetType && webNorm(item.key) === webNorm(signal.key)
    )
}

function currentLevel(signal) {
    const baseline = webBaselineLevel(signal)
    const control = webControlFor(signal)
    if (!control || control.direction === 'DEFAULT' || control.direction === 'BLOCK') return baseline
    if (Number.isFinite(Number(control.levelDelta)))
        return webClampLevel(baseline + Number(control.levelDelta))
    return webClampLevel(baseline + (control.direction === 'MORE' ? 2 : control.direction === 'LESS' ? -2 : 0))
}

function facetLabel(facet) { return V5_FACET_LABELS[facet] || facet || '其他' }

function ensurePanel() {
    ensureStyles()
    if (document.querySelector('#settings-recommendation-v5')) return
    const anchor = document.querySelector('#settings-recommendation-v4')
    if (!anchor) return
    const panel = document.createElement('article')
    panel.id = 'settings-recommendation-v5'
    panel.className = 'panel'
    panel.innerHTML = `
        <div class="v5-head">
            <div><h3>推荐控制中心 · V5 Beta</h3>
            <p>系统先根据收藏生成基准画像；你只需要在判断不准确时修正，不必维护算法参数。</p></div>
            <div class="actions">
                <button id="v5-policy-refresh" type="button">刷新</button>
                <button id="v5-policy-rebuild" type="button" class="primary">重新生成推荐</button>
            </div>
        </div>
        <p id="v5-policy-status" class="status">正在读取推荐策略…</p>
        <div class="v5-help"><strong>10 档怎么理解：</strong>
        系统基准来自你的收藏支持数量与占比，不是固定 5 分。每离开基准 1 格会改变一档排序偏置；
        向右 = 多一点，向左 = 少一点；向上偏 2 格及以上会在完整重算时额外增加该方向的召回，
        向下偏 3 格及以上会抑制对应直接召回；“屏蔽”则是硬排除。</div>
        <div class="v5-session-row">
            <span id="v5-session-status" class="status">本次意图：默认</span>
            <button id="v5-session-reset" type="button" class="v5-compact">清除本次意图</button>
        </div>
        <label>查找标签 / 作者 / 分类
            <input id="v5-policy-search" placeholder="输入名称，例如作者或标签" />
        </label>
        <div id="v5-inferred-list" class="v5-facet-list"></div>
        <h4>你主动调整的项目</h4>
        <div id="v5-control-list" class="v5-control-list"></div>
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
            V5.snapshot = await post('/api/v1/recommendation-v5/session', { mode: 'DEFAULT' })
            renderPolicy()
            showToast('已清除“本次想看”，长期偏好调整保持不变。')
        } catch (error) { showStatus(error.message, true) }
    })
    panel.querySelector('#v5-policy-search').addEventListener('input', (event) => {
        V5.search = String(event.target.value || '').trim().toLocaleLowerCase()
        renderPolicy()
    })
}

async function setControl(signal, direction, levelDelta) {
    if (V5.busy) return null
    V5.busy = true
    try {
        V5.snapshot = await post('/api/v1/recommendation-v5/control', {
            targetType: signal.targetType, key: signal.key, label: signal.label,
            direction, ...(levelDelta === undefined ? {} : { levelDelta }), scope: 'PERSISTENT'
        })
        renderPolicy()
        return V5.snapshot
    } catch (error) {
        showStatus(error.message, true)
        showToast(`调整失败：${error.message}`, 'negative')
        return null
    } finally { V5.busy = false }
}

async function setLevel(signal, desiredLevel) {
    const baseline = baselineLevel(signal)
    const desired = webClampLevel(desiredLevel)
    const delta = desired - baseline
    const direction = delta > 0 ? 'MORE' : delta < 0 ? 'LESS' : 'DEFAULT'
    const result = await setControl(signal, direction, delta)
    if (!result) return
    if (!delta) showToast(`「${signal.label}」已恢复系统基准 ${baseline}/10。`, 'positive')
    else showToast(
        `「${signal.label}」已从系统基准 ${baseline}/10 调到 ${desired}/10；重新生成后会按档位影响召回与排序。`,
        delta > 0 ? 'positive' : 'negative'
    )
}

async function setSession(signal) {
    try {
        V5.snapshot = await post('/api/v1/recommendation-v5/session', {
            mode: 'TARGET', targetType: signal.targetType, key: signal.key, label: signal.label
        })
        renderPolicy()
        showToast(`本次优先探索「${signal.label}」。`, 'positive')
    } catch (error) { showStatus(error.message, true) }
}

function signalRow(signal) {
    const current = controlFor(signal)
    const baseline = baselineLevel(signal)
    const level = currentLevel(signal)
    const blocked = current?.direction === 'BLOCK'
    const legacyDelta = current?.direction === 'MORE' ? 2 : current?.direction === 'LESS' ? -2 : 0
    const delta = Number(current?.levelDelta ?? legacyDelta)
    return `<div class="v5-signal-row" data-v5-signal="${esc(signalId(signal))}">
        <div class="v5-signal-copy"><strong>${esc(signal.label)}</strong>
        <span class="status">收藏支持 ${Number(signal.supportCount || 0)} 本</span></div>
        <div class="v5-range-wrap">
            <input type="range" min="1" max="10" step="1" value="${level}" data-v5-level="${esc(signalId(signal))}" ${blocked ? 'disabled' : ''} />
            <span class="v5-range-value" data-v5-level-value="${esc(signalId(signal))}">${blocked ? '已屏蔽' : `${level}/10`}</span>
            <span class="v5-range-meta">系统基准 ${baseline}/10${current && !blocked ? ` · 手动偏移 ${delta > 0 ? '+' : ''}${delta}` : ''}</span>
        </div>
        <div class="v5-row-actions">
            <button type="button" data-v5-session-target="${esc(signalId(signal))}">本次想看</button>
            ${current ? `<button type="button" data-v5-reset="${esc(signalId(signal))}">恢复系统判断</button>` : ''}
            <button type="button" data-v5-block="${esc(signalId(signal))}">${blocked ? '已屏蔽' : '屏蔽'}</button>
        </div>
    </div>`
}

function renderPolicy() {
    ensurePanel()
    if (!V5.snapshot) return
    const counts = V5.snapshot.counts || {}
    showStatus(`策略 ${V5.snapshot.policyVersion || 'V5'} · rev ${Number(V5.snapshot.revision || 0)} · 已有 ${Number(counts.owned || 0)} · 手动调整 ${Number(counts.controls || 0)} · 硬屏蔽 ${Number(counts.hardSuppressed || 0)}`)
    const sessionLabel = document.querySelector('#v5-session-status')
    if (sessionLabel) {
        const intent = V5.snapshot.sessionIntent || {}
        sessionLabel.textContent = intent.mode === 'TARGET'
            ? `本次想看：${intent.label || intent.key || ''}` : '本次意图：默认'
    }
    const inferred = Array.isArray(V5.snapshot.inferred) ? V5.snapshot.inferred : []
    V5.signalById = new Map(inferred.map((item) => [signalId(item), item]))
    const filtered = inferred.filter((item) =>
        !V5.search || `${item.label} ${item.key} ${item.targetType} ${item.facet || ''}`.toLocaleLowerCase().includes(V5.search)
    )
    const groups = new Map()
    for (const item of filtered) {
        const facet = item.facet || (item.targetType === 'AUTHOR' ? 'CREATOR_ENTITY' : item.targetType === 'CATEGORY' ? 'CATEGORY' : 'OTHER')
        const rows = groups.get(facet) || []
        rows.push(item); groups.set(facet, rows)
    }
    const groupRows = [...groups.entries()].sort((a,b) => {
        const ai = V5_FACET_ORDER.indexOf(a[0]), bi = V5_FACET_ORDER.indexOf(b[0])
        return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || facetLabel(a[0]).localeCompare(facetLabel(b[0]))
    })
    const inferredTarget = document.querySelector('#v5-inferred-list')
    if (inferredTarget) inferredTarget.innerHTML = groupRows.length ? groupRows.map(([facet, rows], groupIndex) => {
        rows.sort((a,b) => baselineLevel(b)-baselineLevel(a) || Number(b.supportCount||0)-Number(a.supportCount||0) || String(a.label).localeCompare(String(b.label)))
        const visible = V5.search ? rows : rows.slice(0,12)
        const hasAdjusted = rows.some(row => controlFor(row))
        return `<details class="v5-facet-group" ${V5.search || hasAdjusted || groupIndex===0 ? 'open' : ''}>
        <summary>${esc(facetLabel(facet))}<span class="v5-facet-count">${rows.length} 项</span></summary>
        <div class="v5-facet-body">${visible.map(signalRow).join('')}
        ${visible.length < rows.length ? `<p class="status">另有 ${rows.length-visible.length} 项；可用上方搜索定位。</p>` : ''}</div></details>`
    }).join('') : '<p class="status">没有匹配项。</p>'

    document.querySelectorAll('[data-v5-level]').forEach((input) => {
        input.addEventListener('input', () => {
            const id=input.dataset.v5Level
            const output=document.querySelector(`[data-v5-level-value="${CSS.escape(id)}"]`)
            if(output) output.textContent=`${input.value}/10`
        })
        input.addEventListener('change', () => {
            const signal=V5.signalById.get(input.dataset.v5Level)
            if(signal) void setLevel(signal, Number(input.value))
        })
    })
    document.querySelectorAll('[data-v5-session-target]').forEach(button => button.addEventListener('click', () => {
        const signal=V5.signalById.get(button.dataset.v5SessionTarget); if(signal) void setSession(signal)
    }))
    document.querySelectorAll('[data-v5-reset]').forEach(button => button.addEventListener('click', () => {
        const signal=V5.signalById.get(button.dataset.v5Reset); if(signal) void setLevel(signal, baselineLevel(signal))
    }))
    document.querySelectorAll('[data-v5-block]').forEach(button => button.addEventListener('click', async () => {
        const signal=V5.signalById.get(button.dataset.v5Block); if(!signal) return
        const result=await setControl(signal,'BLOCK')
        if(result) showToast(`已屏蔽「${signal.label}」，完整重算和后续展示都会硬排除。`,'negative')
    }))

    const controls=Array.isArray(V5.snapshot.controls)?V5.snapshot.controls:[]
    const controlTarget=document.querySelector('#v5-control-list')
    if(controlTarget){
        controlTarget.innerHTML=controls.length?controls.map(item=>{
            const signal=V5.signalById.get(`${item.targetType}:${item.key}`)||{...item,supportCount:0,supportShare:0,baselineLevel:1}
            const current=item.direction==='BLOCK'?'屏蔽':`${currentLevel(signal)}/10`
            return `<span class="v5-control-chip"><strong>${esc(item.label)}</strong><span>${esc(current)}</span><button type="button" data-v5-control-reset="${esc(signalId(signal))}">恢复系统判断</button></span>`
        }).join(''):'<p class="status">目前没有手动覆盖，完全使用系统推断。</p>'
        document.querySelectorAll('[data-v5-control-reset]').forEach(button=>button.addEventListener('click',()=>{
            const signal=V5.signalById.get(button.dataset.v5ControlReset)||controls.filter(item=>`${item.targetType}:${item.key}`===button.dataset.v5ControlReset).map(item=>({...item,supportCount:0,supportShare:0,baselineLevel:1}))[0]
            if(signal) void setLevel(signal, baselineLevel(signal))
        }))
    }
}

async function loadPolicy() {
    ensurePanel()
    try {
        V5.snapshot = await request('/api/v1/recommendation-v5')
        renderPolicy(); decorateRecommendationCards()
    } catch (error) { showStatus(`推荐控制中心暂不可用：${error.message}`, true) }
}

function ensureQuickDialog() {
    let dialog=document.querySelector('#v5-quick-control-dialog')
    if(dialog) return dialog
    dialog=document.createElement('dialog'); dialog.id='v5-quick-control-dialog'; dialog.className='app-dialog'
    dialog.innerHTML='<div><h3>调整这类推荐</h3><p class="status">滑杆以你的收藏画像为基准；修改会先保存，完整重算后同时影响召回与排序。</p><div id="v5-quick-control-body"></div><div class="actions"><button type="button" id="v5-quick-close">关闭</button></div></div>'
    document.body.appendChild(dialog)
    dialog.querySelector('#v5-quick-close').addEventListener('click',()=>dialog.close())
    return dialog
}

function cardContext(card) {
    const body=card.querySelector('.result-body'), lines=[...body.querySelectorAll('p')]
    return {
        comicId:card.dataset.comicId||'',
        author:lines[0]?.textContent?.trim()||'',
        tags:[...body.querySelectorAll('.tag')].map(node=>node.textContent.trim()).filter(Boolean)
    }
}

function quickSignal(targetType,key,label) {
    const found=[...(V5.signalById?.values()||[])].find(item=>item.targetType===targetType&&(webNorm(item.key)===webNorm(key)||webNorm(item.label)===webNorm(label)))
    return found||{targetType,key:webNorm(key),label:label||key,supportCount:0,supportShare:0,facet:targetType==='AUTHOR'?'CREATOR_ENTITY':'OTHER',baselineLevel:1}
}

function quickSliderRow(signal) {
    const baseline=baselineLevel(signal), level=currentLevel(signal)
    return `<div class="v5-quick-row"><strong>${esc(signal.label)}</strong>
    <div class="v5-range-wrap"><input type="range" min="1" max="10" step="1" value="${level}" data-v5-quick-level="${esc(signalId(signal))}" />
    <span class="v5-range-value" data-v5-quick-value="${esc(signalId(signal))}">${level}/10</span>
    <span class="v5-range-meta">系统基准 ${baseline}/10 · 收藏支持 ${Number(signal.supportCount||0)} 本</span></div>
    <div class="v5-row-actions"><button type="button" data-v5-quick-session="${esc(signalId(signal))}">本次想看</button>
    ${signal.targetType==='AUTHOR'?`<button type="button" data-v5-quick-block="${esc(signalId(signal))}">不推荐此作者</button>`:''}</div></div>`
}

function setCardState(card,className,message,tone='neutral') {
    if(!card) return
    if(className) card.classList.add(className)
    let badge=card.querySelector('.v5-card-state')
    if(!badge){badge=document.createElement('div');badge.className='v5-card-state';card.querySelector('.result-body')?.appendChild(badge)}
    badge.classList.remove('positive','negative'); if(tone!=='neutral') badge.classList.add(tone); badge.textContent=message
}

function suppressionMessage(reason) {
    return {
        already_seen:'已标记看过 · 当前作品将从新作推荐中隐藏',
        already_owned:'已标记已有 · 当前作品不再作为新作推荐',
        duplicate:'已标记重复反馈 · 当前上传将隐藏',
        temporary:'已暂时隐藏当前作品 · 30 天后自动恢复'
    }[reason]||'已隐藏当前作品'
}

function openQuickControl(card) {
    const dialog=ensureQuickDialog(), context=cardContext(card), signals=[]
    if(context.author) signals.push(quickSignal('AUTHOR',context.author,context.author))
    for(const tag of context.tags.slice(0,4)) signals.push(quickSignal('TAG',tag,tag))
    V5.quickSignals=new Map(signals.map(item=>[signalId(item),item]))
    const body=dialog.querySelector('#v5-quick-control-body')
    body.innerHTML=signals.map(quickSliderRow).join('')+`<div class="v5-quick-row"><strong>这本作品不该作为新推荐出现</strong>
    <div class="v5-suppress-grid"><button data-v5-suppress-reason="already_seen">已经看过</button>
    <button data-v5-suppress-reason="already_owned">已经拥有</button><button data-v5-suppress-reason="duplicate">重复上传</button>
    <button data-v5-suppress-reason="temporary">暂时不想看（30天）</button></div></div>`
    body.querySelectorAll('[data-v5-quick-level]').forEach(input=>{
        input.addEventListener('input',()=>{const output=body.querySelector(`[data-v5-quick-value="${CSS.escape(input.dataset.v5QuickLevel)}"]`);if(output)output.textContent=`${input.value}/10`})
        input.addEventListener('change',async()=>{const signal=V5.quickSignals.get(input.dataset.v5QuickLevel);if(!signal)return;await setLevel(signal,Number(input.value));dialog.close()})
    })
    body.querySelectorAll('[data-v5-quick-session]').forEach(button=>button.addEventListener('click',async()=>{const signal=V5.quickSignals.get(button.dataset.v5QuickSession);if(!signal)return;await setSession(signal);dialog.close()}))
    body.querySelectorAll('[data-v5-quick-block]').forEach(button=>button.addEventListener('click',async()=>{const signal=V5.quickSignals.get(button.dataset.v5QuickBlock);if(!signal)return;const result=await setControl(signal,'BLOCK');if(result){showToast(`已屏蔽作者「${signal.label}」。`,'negative');dialog.close()}}))
    body.querySelectorAll('[data-v5-suppress-reason]').forEach(button=>button.addEventListener('click',async()=>{
        try{
            V5.snapshot=await post('/api/v1/recommendation-v5/suppress',{comicId:context.comicId,suppressed:true,reason:button.dataset.v5SuppressReason})
            const message=suppressionMessage(button.dataset.v5SuppressReason)
            setCardState(card,'v5-suppressed',message,'negative');showToast(message,'negative');dialog.close();renderPolicy()
        }catch(error){showToast(`操作失败：${error.message}`,'negative')}
    }))
    dialog.showModal()
}

function syncFeedbackVisual(card,announce=false) {
    if(!card)return
    const like=card.querySelector('[data-recommend-feedback="like"].active'), dislike=card.querySelector('[data-recommend-feedback="dislike"].active')
    const next=dislike?'dislike':like?'like':'', previous=card.dataset.v5FeedbackState||''
    card.dataset.v5FeedbackState=next
    card.classList.toggle('v5-feedback-like',next==='like');card.classList.toggle('v5-feedback-dislike',next==='dislike')
    if(next==='like')setCardState(card,'','已记录喜欢 · 将增加类似推荐','positive')
    else if(next==='dislike')setCardState(card,'','已记录不喜欢 · 将减少此类推荐','negative')
    else if(!card.classList.contains('v5-suppressed'))card.querySelector('.v5-card-state')?.remove()
    if(announce&&next&&next!==previous)showToast(next==='like'?'已记录喜欢，将增加类似推荐。':'已记录不喜欢，将减少此类推荐。',next==='like'?'positive':'negative')
}

function tasteExcluded(comicId) {
    return Array.isArray(V5.snapshot?.tasteExcludedComicIds) &&
        V5.snapshot.tasteExcludedComicIds.includes(comicId)
}

async function setTasteExclusion(comicId, excluded) {
    try {
        V5.snapshot = await post(
            '/api/v1/recommendation-v5/taste-exclusion',
            { comicId, excluded }
        )
        renderPolicy()
        decorateLibraryTasteToggles()
        showToast(
            excluded
                ? '收藏已保留，但这本不再参与推荐口味画像。'
                : '这本收藏已恢复参与推荐口味画像。',
            'positive'
        )
    } catch (error) {
        showToast('口味画像设置失败：' + error.message, 'negative')
    }
}

function decorateLibraryTasteToggles() {
    ensureStyles()
    document
        .querySelectorAll(
            '#comic-grid .comic-card[data-is-favorite="true"], #comic-rows tr[data-is-favorite="true"]'
        )
        .forEach((card) => {
            const comicId =
                card.dataset.comicId ||
                card.querySelector('[data-comic-id]')?.dataset.comicId
            if (!comicId) return
            const target =
                card.querySelector('.comic-card-body') ||
                card.querySelector('td:nth-child(2)')
            if (!target) return
            let holder = target.querySelector('.v5-taste-toggle')
            if (!holder) {
                holder = document.createElement('div')
                holder.className = 'v5-taste-toggle'
                target.appendChild(holder)
            }
            const excluded = tasteExcluded(comicId)
            holder.innerHTML =
                '<span class="status">推荐口味：' +
                (excluded ? '已排除' : '参与') +
                '</span><button type="button">' +
                (excluded
                    ? '恢复用于推荐口味'
                    : '保留收藏，但不用于推荐口味') +
                '</button>'
            holder.querySelector('button').addEventListener('click', () => {
                void setTasteExclusion(comicId, !excluded)
            })
        })
}

function decorateRecommendationCards() {
    ensureStyles()
    document.querySelectorAll('#recommend-results .result').forEach(card=>{
        const body=card.querySelector('.result-body');if(!body)return
        const detailActions=body.querySelector('.detail-actions')
        if(!card.querySelector('[data-v5-quick-control]')){
            const button=document.createElement('button');button.type='button';button.dataset.v5QuickControl='true';button.textContent='⚙ 调节推荐'
            button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openQuickControl(card)})
            ;(detailActions||body).appendChild(button)
        }
        syncFeedbackVisual(card,false)
        if(Array.isArray(V5.snapshot?.hardSuppressComicIds)&&V5.snapshot.hardSuppressComicIds.includes(card.dataset.comicId))
            setCardState(card,'v5-suppressed','已按你的设置隐藏 · 后续推荐将排除','negative')
    })
}


const libraryRoots = [
    document.querySelector('#comic-grid'),
    document.querySelector('#comic-rows')
].filter(Boolean)
for (const root of libraryRoots)
    new MutationObserver(() => decorateLibraryTasteToggles()).observe(root, {
        childList: true,
        subtree: true
    })

const recommendationRoot=document.querySelector('#recommend-results')
if(recommendationRoot)new MutationObserver(mutations=>{
    let needsDecorate=false
    for(const mutation of mutations){
        if(mutation.type==='childList')needsDecorate=true
        if(mutation.type==='attributes'&&mutation.target.matches?.('[data-recommend-feedback]'))
            syncFeedbackVisual(mutation.target.closest('.result'),true)
    }
    if(needsDecorate)decorateRecommendationCards()
}).observe(recommendationRoot,{childList:true,subtree:true,attributes:true,attributeFilter:['class']})

ensurePanel()
decorateRecommendationCards()
decorateLibraryTasteToggles()
void loadPolicy().then(() => decorateLibraryTasteToggles())
document.addEventListener('pica-language-change',()=>{ensurePanel();renderPolicy()})

void import('./work-identity-review-beta.js').catch(() => undefined)

void import('./recommendation-v5-evaluation.js').catch(() => undefined)
