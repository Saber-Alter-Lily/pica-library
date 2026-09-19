const V5={snapshot:null,timescales:null,channels:null,serving:null,search:'',busy:false,signalById:new Map(),quickSignals:new Map(),draftLevels:new Map(),manualSignal:null}

const V5_FACET_LABELS={
    "CREATOR_ENTITY":"作者","CATEGORY":"分类","FANDOM_IP":"作品 / IP","FANDOM_CHARACTER":"角色",
    "GENRE_THEME":"题材 / 类型","STORY_TROPE":"剧情 / 设定","RELATIONSHIP":"人物关系",
    "RELATIONSHIP_TROPE":"人物关系","IDENTITY_ROLE":"身份 / 职业","CHARACTER_IDENTITY_ROLE":"身份 / 职业",
    "SPECIES_FANTASY":"种族 / 幻想","APPEARANCE_TRAIT":"外观特征","APPEARANCE_OUTFIT":"外观 / 服装",
    "BODY_ATTRIBUTE":"身体特征","CHARACTER_BODY_ATTRIBUTE":"身体 / 外观特征","SETTING_LOCATION":"场景 / 地点",
    "SEXUAL_BEHAVIOR":"行为","CONTENT_BEHAVIOR":"行为","FETISH_TROPE":"偏好 / 情境",
    "PHYSIOLOGY_STATE":"生理状态","CONTROL_COERCION":"支配 / 控制",
    "AUDIENCE_ORIENTATION":"受众方向","VISUAL_STYLE":"视觉风格","FORMAT":"作品形式",
    "RAW_TAG":"其他标签","OTHER":"其他"
}

const V5_FACET_SUPERGROUPS=[
    {id:"people",label:"人物与作品",facets:["CREATOR_ENTITY","FANDOM_IP","FANDOM_CHARACTER","IDENTITY_ROLE","CHARACTER_IDENTITY_ROLE","SPECIES_FANTASY","RELATIONSHIP","RELATIONSHIP_TROPE","AUDIENCE_ORIENTATION"]},
    {id:"content",label:"内容与剧情",facets:["CATEGORY","GENRE_THEME","STORY_TROPE","SETTING_LOCATION","PHYSIOLOGY_STATE"]},
    {id:"appearance",label:"外观与画风",facets:["APPEARANCE_TRAIT","APPEARANCE_OUTFIT","BODY_ATTRIBUTE","CHARACTER_BODY_ATTRIBUTE","VISUAL_STYLE"]},
    {id:"behavior",label:"行为与偏好",facets:["SEXUAL_BEHAVIOR","CONTENT_BEHAVIOR","FETISH_TROPE","CONTROL_COERCION"]},
    {id:"format",label:"形式与其他",facets:["FORMAT","RAW_TAG","OTHER"]}
]
const V5_FACET_ORDER=V5_FACET_SUPERGROUPS.flatMap((group)=>group.facets)

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
.v5-overview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:12px 0 18px}
.v5-overview-card{border:1px solid var(--a83-line,#ddd);border-radius:14px;padding:12px;background:color-mix(in srgb,var(--a83-surface,#fff) 97%,transparent)}
.v5-overview-card h5{margin:0 0 8px;font-size:.96rem}.v5-overview-card p{margin:5px 0}
.v5-interest-chips{display:flex;gap:6px;flex-wrap:wrap}.v5-interest-chip{display:inline-flex;gap:5px;align-items:center;padding:5px 8px;border-radius:999px;background:color-mix(in srgb,var(--a83-accent-soft,#eef0ff) 70%,transparent);font-size:.82rem}
.v5-compose-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:10px 0 18px}
.v5-compose-card{border:1px solid var(--a83-line,#ddd);border-radius:12px;padding:10px 12px}.v5-compose-card p{margin:4px 0}
.v5-search-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:end}.v5-search-row label{margin:0}
.v5-pending-bar{position:sticky;bottom:12px;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:14px 0 0;padding:11px 13px;border:1px solid color-mix(in srgb,var(--a83-accent,#7457b9) 45%,var(--a83-line,#ddd));border-radius:14px;background:color-mix(in srgb,var(--a83-surface,#fff) 94%,var(--a83-accent-soft,#eef0ff));box-shadow:0 8px 28px rgba(0,0,0,.12)}
.v5-pending-bar[hidden]{display:none}.v5-pending-bar .actions{margin:0}
.v5-section-heading{display:flex;align-items:end;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:18px}
.v5-search-empty{padding:12px;border:1px dashed var(--a83-line,#ddd);border-radius:12px}
.v5-overview-section,.v5-major-group{border:1px solid var(--a83-line,#ddd);border-radius:14px;margin:10px 0;background:color-mix(in srgb,var(--a83-surface,#fff) 98%,transparent)}
.v5-overview-section>summary,.v5-major-group>summary{cursor:pointer;display:flex;align-items:center;gap:8px;padding:12px 14px;list-style:none;font-weight:700}
.v5-overview-section>summary::-webkit-details-marker,.v5-major-group>summary::-webkit-details-marker{display:none}
.v5-overview-section>summary::after,.v5-major-group>summary::after{content:'＋';margin-left:auto;opacity:.62}
.v5-overview-section[open]>summary::after,.v5-major-group[open]>summary::after{content:'－'}
.v5-overview-section>.v5-overview-grid,.v5-overview-section>.v5-compose-grid{margin:0;padding:0 12px 12px}
.v5-major-body{display:grid;gap:8px;padding:0 10px 10px}
.v5-facet-scroll{max-height:430px;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;touch-action:pan-y;padding-right:4px}
.v5-summary-note{font-size:.82rem;font-weight:500;opacity:.78;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:min(58vw,680px)}
.v5-heading-inline{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
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
    const draft = V5.draftLevels.get(signalId(signal))
    if (Number.isFinite(Number(draft))) return webClampLevel(draft)
    const baseline = baselineLevel(signal)
    const control = controlFor(signal)
    if (!control || control.direction === 'DEFAULT' || control.direction === 'BLOCK') return baseline
    if (Number.isFinite(Number(control.levelDelta)))
        return webClampLevel(baseline + Number(control.levelDelta))
    return webClampLevel(baseline + (control.direction === 'MORE' ? 2 : control.direction === 'LESS' ? -2 : 0))
}

function facetLabel(facet) { return V5_FACET_LABELS[facet] || facet || '其他' }
function facetSupergroup(facet) {
    return V5_FACET_SUPERGROUPS.find((group) => group.facets.includes(facet)) ||
        V5_FACET_SUPERGROUPS.at(-1)
}
function infoButton(text, label='查看说明') {
    return `<button type="button" class="info-tip" aria-label="${esc(label)}" data-info-tip="${esc(text)}">i</button>`
}

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
            <div><h3>推荐偏好</h3>
            <p>系统会根据收藏和后续使用自动学习；只有判断不准确时才需要手动纠正。</p></div>
            <div class="actions">
                <button id="v5-policy-refresh" type="button">刷新</button>
                <button id="v5-audit-export" type="button">导出推荐审计数据</button>
                <button id="v5-policy-rebuild" type="button" class="primary">重新生成推荐</button>
            </div>
        </div>
        <p id="v5-policy-status" class="status">正在读取推荐偏好…</p>
        <details class="v5-policy-tech">
            <summary>策略信息</summary>
            <code id="v5-policy-tech"></code>
        </details>
        <div class="v5-session-row">
            <span id="v5-session-status" class="status">本次想看：默认</span>
            <button id="v5-session-reset" type="button" class="v5-compact">清除本次想看</button>
        </div>
        <div class="v5-section-heading"><div><h4>你的推荐画像</h4><p class="status">先看系统目前如何理解你的长期、近期与本次兴趣，再决定是否需要微调。</p></div></div>
        <div id="v5-profile-overview" class="v5-overview-grid"></div>
        <div class="v5-section-heading"><div><h4>当前推荐构成</h4><p class="status">展示当前规划实际启用的来源层、召回通道和 Provider 请求预算；不使用虚构百分比。</p></div></div>
        <div id="v5-composition-overview" class="v5-compose-grid"></div>
        <h4>你的调整</h4>
        <div id="v5-control-list" class="v5-control-list"></div>
        <details class="v5-help v5-help-details">
            <summary><strong>1–10 档怎么理解？</strong></summary>
            <p><strong>1 = 尽量少推荐，10 = 非常喜欢。</strong> 不修改时由系统根据收藏与后续行为自动判断；“本次想看”只影响当前会话，“屏蔽”则是硬排除。</p>
            <p class="status">详细页的滑杆先进入待保存状态，可一次修改多项后统一保存或撤销。</p>
        </details>
        <div class="v5-section-heading"><div><h4>完整画像与微调 · 1–10 档</h4><p class="status">默认按作者、IP、标签和分类分组浏览；也可以明确查找某个偏好。</p></div></div>
        <div class="v5-search-row">
            <label>查找一个具体偏好
                <input id="v5-policy-search" placeholder="作者、IP、标签或分类，例如：巨乳" />
            </label>
            <button id="v5-policy-search-submit" type="button">查找</button>
            <button id="v5-policy-search-clear" type="button">清空</button>
        </div>
        <div id="v5-inferred-list" class="v5-facet-list"></div>
        <div id="v5-pending-bar" class="v5-pending-bar" hidden>
            <strong id="v5-pending-count">已修改 0 项</strong>
            <div class="actions">
                <button id="v5-pending-discard" type="button">撤销修改</button>
                <button id="v5-pending-save" type="button" class="primary">保存调整</button>
            </div>
        </div>
    `
    anchor.insertAdjacentElement('afterend', panel)
    panel.querySelector('#v5-policy-refresh').addEventListener('click', loadPolicy)
    panel.querySelector('#v5-audit-export').addEventListener('click', async (event) => {
        const button = event.currentTarget
        if (button.disabled) return
        if (typeof window.picaDesktopPost !== 'function') {
            showToast('推荐审计导出仅在 Windows / Desktop 模式可用。', 'negative')
            return
        }
        button.disabled = true
        try {
            const result = await window.picaDesktopPost(
                '/api/v1/desktop/recommendation-v5/export-audit',
                {}
            )
            if (result?.cancelled) {
                showToast('已取消导出。')
                return
            }
            showToast(
                `已导出 ${result?.fileName || '推荐审计数据包'} · ${Math.round(Number(result?.sizeBytes || 0) / 1024)} KB`,
                'positive'
            )
        } catch (error) {
            showToast(`导出失败：${error.message}`, 'negative')
        } finally {
            button.disabled = false
        }
    })
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
    const searchInput = panel.querySelector('#v5-policy-search')
    const commitSearch = () => {
        V5.search = String(searchInput.value || '').trim().toLocaleLowerCase()
        V5.manualSignal = null
        renderPolicy()
    }
    panel.querySelector('#v5-policy-search-submit').addEventListener('click', commitSearch)
    panel.querySelector('#v5-policy-search-clear').addEventListener('click', () => {
        searchInput.value = ''
        V5.search = ''
        V5.manualSignal = null
        renderPolicy()
    })
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault()
            commitSearch()
        }
    })
    panel.querySelector('#v5-pending-discard').addEventListener('click', () => {
        V5.draftLevels.clear()
        V5.manualSignal = null
        renderPolicy()
        showToast('已撤销尚未保存的偏好修改。')
    })
    panel.querySelector('#v5-pending-save').addEventListener('click', () => void saveDraftLevels())
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
    if (!delta)
        showToast(
            signal.manual
                ? `「${signal.label}」已恢复为“系统未判断”，不再保留手动偏好。`
                : `「${signal.label}」已恢复系统基准 ${baseline}/10。`,
            'positive'
        )
    else
        showToast(
            signal.manual
                ? `已将「${signal.label}」设为 ${desired}/10；系统此前没有稳定判断。`
                : `「${signal.label}」已从系统基准 ${baseline}/10 调到 ${desired}/10。`,
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

function lifetimeSignals() {
    const inferred = Array.isArray(V5.snapshot?.inferred)
        ? V5.snapshot.inferred.map((item) => ({ ...item }))
        : []
    const byId = new Map(inferred.map((item) => [signalId(item), item]))
    const lifetime = V5.timescales?.layers?.inferred?.lifetime
    const total = Math.max(1, Number(lifetime?.positiveItemCount || 0))
    const add = (targetType, facet, rows) => {
        for (const row of Array.isArray(rows) ? rows : []) {
            const item = {
                targetType,
                key: row.key,
                label: row.label || row.key,
                supportCount: Number(row.supportItems || 0),
                supportShare: Number(row.supportItems || 0) / total,
                facet,
                behaviorDerived: true,
                behaviorScore: Number(row.score || 0)
            }
            const id = signalId(item)
            if (!byId.has(id)) byId.set(id, item)
        }
    }
    add('AUTHOR', 'CREATOR_ENTITY', lifetime?.positive?.authors)
    add('TAG', 'RAW_TAG', lifetime?.positive?.tags)
    add('CATEGORY', 'CATEGORY', lifetime?.positive?.categories)
    return [...byId.values()]
}

function preferenceWindowChips(window) {
    if (!window) return '<span class="status">暂无足够行为证据</span>'
    const rows = [
        ...(window.positive?.authors || []).map((item) => ({ ...item, kind: '作者' })),
        ...(window.positive?.tags || []).map((item) => ({ ...item, kind: '标签' })),
        ...(window.positive?.categories || []).map((item) => ({ ...item, kind: '分类' }))
    ]
        .sort((a,b) => Number(b.score || 0) - Number(a.score || 0) || Number(b.supportItems || 0) - Number(a.supportItems || 0))
        .slice(0, 8)
    if (!rows.length) return '<span class="status">暂无足够行为证据</span>'
    return rows.map((item) =>
        `<span class="v5-interest-chip"><small>${esc(item.kind)}</small><strong>${esc(item.label)}</strong><span>${Number(item.supportItems || 0)} 本</span></span>`
    ).join('')
}

function renderProfileOverview() {
    const target = document.querySelector('#v5-profile-overview')
    if (!target) return
    const inferred = V5.timescales?.layers?.inferred || {}
    const counts = V5.snapshot?.counts || {}
    const card = (title, note, window) => `
        <section class="v5-overview-card">
            <h5>${esc(title)}</h5>
            <p class="status">${esc(note)}</p>
            <div class="v5-interest-chips">${preferenceWindowChips(window)}</div>
        </section>`
    target.innerHTML =
        `<section class="v5-overview-card"><h5>数据基础</h5>
            <p><strong>${Number(counts.favorites || 0)}</strong> 本收藏参与长期画像</p>
            <p><strong>${Number(counts.owned || 0)}</strong> 本已拥有 / 已入库用于去重与 Ownership</p>
            <p><strong>${Number(inferred.lifetime?.positiveItemCount || 0)}</strong> 本作品形成正向行为证据</p>
        </section>` +
        card('长期兴趣', '收藏 + 历史行为的累计理解', inferred.lifetime) +
        card('最近 30 天', '用于识别近期兴趣变化，不覆盖长期偏好', inferred.days30) +
        card('本次会话', '仅反映本次打开应用后的有效行为', inferred.session)
}

function renderCompositionOverview() {
    const target = document.querySelector('#v5-composition-overview')
    if (!target) return
    const plan = V5.channels
    if (!plan) {
        target.innerHTML = '<p class="status">当前没有可读取的推荐规划。</p>'
        return
    }
    const channels = Array.isArray(plan.channels)
        ? plan.channels.filter((item) => item.enabled)
        : []
    const sourceLabels = {
        EXPLICIT_SESSION: '本次明确指定',
        EXPLICIT_PERSISTENT: '你的长期调整',
        SESSION: '本次行为',
        RECENT_7D: '最近 7 天',
        RECENT_30D: '最近 30 天',
        LIFETIME: '长期兴趣',
        SYSTEM: '系统探索 / 重发现'
    }
    const familyLabels = {
        TARGET: '定向目标', AUTHOR: '作者', FANDOM: '作品 / IP',
        TAG: '标签', CATEGORY: '分类', RELATED: '相似作品',
        EXPLORATION: '探索', REDISCOVERY: '旧藏重发现', VISUAL: '画风'
    }
    const sourceCounts = new Map()
    for (const channel of channels)
        sourceCounts.set(channel.sourceLayer, (sourceCounts.get(channel.sourceLayer) || 0) + 1)
    const sourceHtml = [...sourceCounts.entries()]
        .sort((a,b) => b[1]-a[1])
        .map(([key,count]) => `<p><strong>${esc(sourceLabels[key] || key)}</strong> · ${count} 条通道</p>`)
        .join('') || '<p class="status">暂无启用通道</p>'
    const familyHtml = Object.entries(plan.summary?.families || {})
        .filter(([,count]) => Number(count) > 0)
        .sort((a,b) => Number(b[1])-Number(a[1]))
        .map(([key,count]) => `<span class="v5-interest-chip"><strong>${esc(familyLabels[key] || key)}</strong><span>${Number(count)}</span></span>`)
        .join('') || '<span class="status">暂无</span>'
    const providerHtml = Object.entries(plan.providerBudgets || {})
        .map(([key,value]) => `<p><strong>${esc(key.toUpperCase())}</strong> · ${Number(value?.plannedRequests || 0)} / ${Number(value?.maxRequests || 0)} 次请求${value?.eligible ? '' : ' · 当前不可用'}</p>`)
        .join('')
    const anchors = channels
        .flatMap((channel) => (channel.anchors || []).map((anchor) => ({
            label: anchor.label || anchor.key,
            family: channel.family,
            priority: Number(channel.priority || 0)
        })))
        .sort((a,b) => b.priority-a.priority)
        .filter((item,index,array) => array.findIndex((other) => webNorm(other.label)===webNorm(item.label))===index)
        .slice(0,8)
        .map((item) => `<span class="v5-interest-chip"><small>${esc(familyLabels[item.family] || item.family)}</small><strong>${esc(item.label)}</strong></span>`)
        .join('') || '<span class="status">暂无明确锚点</span>'
    target.innerHTML = `
        <section class="v5-compose-card"><h5>来源层</h5>${sourceHtml}</section>
        <section class="v5-compose-card"><h5>召回通道</h5><div class="v5-interest-chips">${familyHtml}</div></section>
        <section class="v5-compose-card"><h5>Provider 预算</h5>${providerHtml}</section>
        <section class="v5-compose-card"><h5>本轮主要锚点</h5><div class="v5-interest-chips">${anchors}</div></section>`
}

function updatePendingBar() {
    const bar = document.querySelector('#v5-pending-bar')
    const count = document.querySelector('#v5-pending-count')
    if (!bar || !count) return
    const pending = V5.draftLevels.size
    bar.hidden = pending === 0
    count.textContent = `已修改 ${pending} 项 · 尚未保存`
}

async function saveDraftLevels() {
    if (V5.busy || !V5.draftLevels.size) return
    V5.busy = true
    const button = document.querySelector('#v5-pending-save')
    if (button) button.disabled = true
    try {
        for (const [id, desiredValue] of V5.draftLevels) {
            const signal = V5.signalById.get(id)
            if (!signal) continue
            const baseline = baselineLevel(signal)
            const desired = webClampLevel(desiredValue)
            const delta = desired - baseline
            const direction = delta > 0 ? 'MORE' : delta < 0 ? 'LESS' : 'DEFAULT'
            V5.snapshot = await post('/api/v1/recommendation-v5/control', {
                targetType: signal.targetType,
                key: signal.key,
                label: signal.label,
                direction,
                levelDelta: delta,
                scope: 'PERSISTENT'
            })
        }
        V5.draftLevels.clear()
        V5.manualSignal = null
        showToast('偏好调整已保存；后续完整重算会同时影响召回与排序。', 'positive')
        await loadPolicy()
    } catch (error) {
        showStatus(`保存偏好失败：${error.message}`, true)
        showToast(`保存失败：${error.message}`, 'negative')
    } finally {
        V5.busy = false
        if (button) button.disabled = false
        updatePendingBar()
    }
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
        <span class="status">${signal.manual ? '系统尚未形成稳定判断' : signal.behaviorDerived ? `长期行为支持 ${Number(signal.supportCount || 0)} 本` : `收藏支持 ${Number(signal.supportCount || 0)} 本`}</span></div>
        <div class="v5-range-wrap">
            <input type="range" min="1" max="10" step="1" value="${level}" data-v5-level="${esc(signalId(signal))}" ${blocked ? 'disabled' : ''} />
            <span class="v5-range-value" data-v5-level-value="${esc(signalId(signal))}">${blocked ? '已屏蔽' : `${level}/10`}</span>
            <span class="v5-range-meta">${signal.manual ? '系统未判断 · 5/10 为中性起点' : `系统基准 ${baseline}/10`}${current && !blocked ? ` · 你的调整 ${delta > 0 ? '+' : ''}${delta}` : ''}</span>
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
    showStatus(
        `已拥有 ${Number(counts.owned || 0)} 本 · 收藏 ${Number(counts.favorites || 0)} 本 · 你调整 ${Number(counts.controls || 0)} 项 · 已屏蔽 ${Number(counts.hardSuppressed || 0)} 项`
    )
    const technical = document.querySelector('#v5-policy-tech')
    if (technical)
        technical.textContent =
            `${V5.snapshot.policyVersion || 'V5'} · revision ${Number(V5.snapshot.revision || 0)}`
    const sessionLabel = document.querySelector('#v5-session-status')
    if (sessionLabel) {
        const intent = V5.snapshot.sessionIntent || {}
        sessionLabel.textContent = intent.mode === 'TARGET'
            ? `本次想看：${intent.label || intent.key || ''}` : '本次想看：默认'
    }
    const inferred = lifetimeSignals()
    V5.signalById = new Map(inferred.map((item) => [signalId(item), item]))
    if (V5.manualSignal) V5.signalById.set(signalId(V5.manualSignal), V5.manualSignal)
    renderProfileOverview()
    renderCompositionOverview()
    const filtered = inferred.filter((item) =>
        !V5.search || `${item.label} ${item.key} ${item.targetType} ${item.facet || ''}`.toLocaleLowerCase().includes(V5.search)
    )
    const groups = new Map()
    for (const item of filtered) {
        const facet = item.facet || (item.targetType === 'AUTHOR' ? 'CREATOR_ENTITY' : item.targetType === 'CATEGORY' ? 'CATEGORY' : 'OTHER')
        const rows = groups.get(facet) || []
        rows.push(item); groups.set(facet, rows)
    }
    const manualSignal =
        V5.manualSignal &&
        V5.search &&
        webNorm(V5.manualSignal.key) === webNorm(V5.search)
            ? V5.manualSignal
            : null
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
    }).join('') : manualSignal
        ? `<div class="v5-help"><strong>已确认把“${esc(V5.search)}”作为自定义标签微调。</strong> 5/10 是中性起点；修改后仍需点击“保存调整”。</div><div class="v5-facet-group"><div class="v5-facet-body">${signalRow(manualSignal)}</div></div>`
        : V5.search
          ? `<div class="v5-search-empty"><strong>没有找到“${esc(V5.search)}”</strong><p class="status">系统不会因为输入文字就自动创建偏好。确认它确实是标签后再添加。</p><button type="button" data-v5-add-custom-tag>作为标签添加</button></div>`
          : '<p class="status">当前还没有可展示的系统画像。收藏和真实使用行为会继续积累；也可以稍后刷新查看。</p>'

    document.querySelectorAll('[data-v5-level]').forEach((input) => {
        input.addEventListener('input', () => {
            const id=input.dataset.v5Level
            const signal=V5.signalById.get(id)
            const output=document.querySelector(`[data-v5-level-value="${CSS.escape(id)}"]`)
            if(output) output.textContent=`${input.value}/10`
            if(signal) {
                const persisted = (() => {
                    const draft = V5.draftLevels.get(id)
                    V5.draftLevels.delete(id)
                    const value = currentLevel(signal)
                    if (draft !== undefined) V5.draftLevels.set(id, draft)
                    return value
                })()
                const next = Number(input.value)
                if (next === persisted) V5.draftLevels.delete(id)
                else V5.draftLevels.set(id, next)
                updatePendingBar()
            }
        })
    })
    document.querySelectorAll('[data-v5-session-target]').forEach(button => button.addEventListener('click', () => {
        const signal=V5.signalById.get(button.dataset.v5SessionTarget); if(signal) void setSession(signal)
    }))
    document.querySelectorAll('[data-v5-reset]').forEach(button => button.addEventListener('click', () => {
        const signal=V5.signalById.get(button.dataset.v5Reset)
        if (!signal) return
        V5.draftLevels.set(signalId(signal), baselineLevel(signal))
        renderPolicy()
    }))
    document.querySelectorAll('[data-v5-block]').forEach(button => button.addEventListener('click', async () => {
        const signal=V5.signalById.get(button.dataset.v5Block); if(!signal) return
        const result=await setControl(signal,'BLOCK')
        if(result) showToast(`已屏蔽「${signal.label}」，完整重算和后续展示都会硬排除。`,'negative')
    }))

    document.querySelector('[data-v5-add-custom-tag]')?.addEventListener('click', () => {
        V5.manualSignal = {
            targetType: 'TAG',
            key: webNorm(V5.search),
            label: V5.search,
            supportCount: 0,
            supportShare: 0,
            facet: 'RAW_TAG',
            baselineLevel: 5,
            manual: true,
            systemUnknown: true
        }
        V5.signalById.set(signalId(V5.manualSignal), V5.manualSignal)
        renderPolicy()
    })
    updatePendingBar()

    const controls=Array.isArray(V5.snapshot.controls)?V5.snapshot.controls:[]
    const controlTarget=document.querySelector('#v5-control-list')
    if(controlTarget){
        controlTarget.innerHTML=controls.length?controls.map(item=>{
            const signal=V5.signalById.get(`${item.targetType}:${item.key}`)||{...item,supportCount:0,supportShare:0,baselineLevel:5,manual:true,systemUnknown:true}
            const current=item.direction==='BLOCK'?'屏蔽':`${currentLevel(signal)}/10`
            return `<span class="v5-control-chip"><strong>${esc(item.label)}</strong><span>${esc(current)}</span><button type="button" data-v5-control-reset="${esc(signalId(signal))}">恢复系统判断</button></span>`
        }).join(''):'<p class="status">目前没有手动覆盖，完全使用系统推断。</p>'
        document.querySelectorAll('[data-v5-control-reset]').forEach(button=>button.addEventListener('click',()=>{
            const signal=V5.signalById.get(button.dataset.v5ControlReset)||controls.filter(item=>`${item.targetType}:${item.key}`===button.dataset.v5ControlReset).map(item=>({...item,supportCount:0,supportShare:0,baselineLevel:5,manual:true}))[0]
            if(!signal) return
            V5.signalById.set(signalId(signal),signal)
            V5.draftLevels.set(signalId(signal), baselineLevel(signal))
            renderPolicy()
        }))
    }
}

async function loadPolicy() {
    ensurePanel()
    try {
        const [snapshot, timescales, channels] = await Promise.all([
            request('/api/v1/recommendation-v5'),
            request('/api/v1/recommendation-v5/preference-timescales?limit=5000'),
            request('/api/v1/recommendation-v5/candidate-channels?limit=5000')
        ])
        V5.snapshot = snapshot
        V5.timescales = timescales
        V5.channels = channels
        renderPolicy()
        decorateRecommendationCards()
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
    if(className && !card.classList.contains(className)) card.classList.add(className)
    let badge=card.querySelector('.v5-card-state')
    if(!badge){badge=document.createElement('div');badge.className='v5-card-state';card.querySelector('.result-body')?.appendChild(badge)}
    badge.classList.toggle('positive',tone==='positive')
    badge.classList.toggle('negative',tone==='negative')
    if(badge.textContent!==message) badge.textContent=message
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
            const excluded = tasteExcluded(comicId)
            const renderState = excluded ? 'excluded' : 'included'
            if (
                holder?.dataset.v5TasteState === renderState &&
                holder.querySelector('button')
            )
                return
            if (!holder) {
                holder = document.createElement('div')
                holder.className = 'v5-taste-toggle'
                target.appendChild(holder)
            }
            holder.dataset.v5TasteState = renderState
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
let libraryTasteDecorationQueued = false
function queueLibraryTasteDecoration() {
    if (libraryTasteDecorationQueued) return
    libraryTasteDecorationQueued = true
    queueMicrotask(() => {
        libraryTasteDecorationQueued = false
        decorateLibraryTasteToggles()
    })
}
for (const root of libraryRoots)
    new MutationObserver(() => queueLibraryTasteDecoration()).observe(root, {
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
