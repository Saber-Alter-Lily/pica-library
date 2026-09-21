import { copy as v5t } from './locale-runtime.js'

const V5={snapshot:null,timescales:null,channels:null,serving:null,search:'',busy:false,signalById:new Map(),quickSignals:new Map(),draftLevels:new Map(),manualSignal:null}

const V5_FACET_LABELS={
    "CREATOR_ENTITY":["作者","Author","作者"],"CATEGORY":["分类","Category","カテゴリ"],"FANDOM_IP":["作品 / IP","Work / IP","作品 / IP"],"FANDOM_CHARACTER":["角色","Character","キャラクター"],
    "GENRE_THEME":["题材 / 类型","Genre / theme","ジャンル / テーマ"],"STORY_TROPE":["剧情 / 设定","Story / setting","ストーリー / 設定"],"RELATIONSHIP":["人物关系","Relationship","人物関係"],
    "RELATIONSHIP_TROPE":["人物关系","Relationship","人物関係"],"IDENTITY_ROLE":["身份 / 职业","Identity / role","属性 / 役割"],"CHARACTER_IDENTITY_ROLE":["身份 / 职业","Identity / role","属性 / 役割"],
    "SPECIES_FANTASY":["种族 / 幻想","Species / fantasy","種族 / ファンタジー"],"APPEARANCE_TRAIT":["外观特征","Appearance trait","外見的特徴"],"APPEARANCE_OUTFIT":["外观 / 服装","Appearance / outfit","外見 / 服装"],
    "BODY_ATTRIBUTE":["身体特征","Body attribute","身体的特徴"],"CHARACTER_BODY_ATTRIBUTE":["身体 / 外观特征","Body / appearance","身体 / 外見"],"SETTING_LOCATION":["场景 / 地点","Setting / location","舞台 / 場所"],
    "SEXUAL_BEHAVIOR":["行为","Behavior","行動"],"CONTENT_BEHAVIOR":["行为","Behavior","行動"],"FETISH_TROPE":["偏好 / 情境","Preference / trope","嗜好 / シチュエーション"],
    "PHYSIOLOGY_STATE":["生理状态","Physiology / state","生理 / 状態"],"CONTROL_COERCION":["支配 / 控制","Control / coercion","支配 / 強制"],
    "AUDIENCE_ORIENTATION":["受众方向","Audience orientation","対象傾向"],"VISUAL_STYLE":["视觉风格","Visual style","ビジュアルスタイル"],"FORMAT":["作品形式","Format","形式"],
    "RAW_TAG":["其他标签","Other tags","その他のタグ"],"OTHER":["其他","Other","その他"]
}

const V5_FACET_SUPERGROUPS=[
    {id:"people",label:["人物与作品","People & works","人物と作品"],facets:["CREATOR_ENTITY","FANDOM_IP","FANDOM_CHARACTER","IDENTITY_ROLE","CHARACTER_IDENTITY_ROLE","SPECIES_FANTASY","RELATIONSHIP","RELATIONSHIP_TROPE","AUDIENCE_ORIENTATION"]},
    {id:"content",label:["内容与剧情","Content & story","内容とストーリー"],facets:["CATEGORY","GENRE_THEME","STORY_TROPE","SETTING_LOCATION","PHYSIOLOGY_STATE"]},
    {id:"appearance",label:["外观与画风","Appearance & visual style","外見と画風"],facets:["APPEARANCE_TRAIT","APPEARANCE_OUTFIT","BODY_ATTRIBUTE","CHARACTER_BODY_ATTRIBUTE","VISUAL_STYLE"]},
    {id:"behavior",label:["行为与偏好","Behavior & preferences","行動と嗜好"],facets:["SEXUAL_BEHAVIOR","CONTENT_BEHAVIOR","FETISH_TROPE","CONTROL_COERCION"]},
    {id:"format",label:["形式与其他","Format & other","形式とその他"],facets:["FORMAT","RAW_TAG","OTHER"]}
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
    const numeric = Number(value)
    return Math.max(0, Math.min(10, Math.round(Number.isFinite(numeric) ? numeric : 5)))
}
function v5Works(count){ return v5t(`${count} 本`,`${count} works`,`${count} 作品`) }
function v5Items(count){ return v5t(`${count} 项`,`${count} items`,`${count} 件`) }
function v5Channels(count){ return v5t(`${v5Channels(count)}`,`${count} channels`,`${count} チャンネル`) }

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

function facetLabel(facet) { const row=V5_FACET_LABELS[facet]; return row ? v5t(...row) : (facet || v5t('其他','Other','その他')) }
function supergroupLabel(group){ return Array.isArray(group?.label) ? v5t(...group.label) : String(group?.label || '') }
function facetSupergroup(facet) {
    return V5_FACET_SUPERGROUPS.find((group) => group.facets.includes(facet)) ||
        V5_FACET_SUPERGROUPS.at(-1)
}
function infoButton(text, label=v5t('查看说明','View help','説明を見る')) {
    return `<button type="button" class="info-tip" aria-label="${esc(label)}" data-info-tip="${esc(text)}">!</button>`
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
            <div class="v5-heading-inline"><h3>${v5t('推荐偏好','Recommendation preferences','おすすめ設定')}</h3>${infoButton(v5t('系统会根据收藏和后续真实使用自动学习；只有判断不准确时才需要手动纠正。','The system learns from your collection and later real usage. Manual correction is only needed when its judgment is inaccurate.','システムはコレクションと実際の利用から学習します。判断が合わない場合だけ手動で調整してください。'))}</div>
            <div class="actions">
                <button id="v5-policy-refresh" type="button">${v5t('刷新','Refresh','更新')}</button>
                <button id="v5-audit-export" type="button">${v5t('导出推荐审计数据','Export recommendation audit','おすすめ監査データを書き出す')}</button>
                <button id="v5-policy-rebuild" type="button" class="primary">${v5t('重新生成推荐','Regenerate recommendations','おすすめを再生成')}</button>
            </div>
        </div>
        <p id="v5-policy-status" class="status">${v5t('正在读取推荐偏好…','Reading recommendation preferences…','おすすめ設定を読み込み中…')}</p>
        <details class="v5-policy-tech">
            <summary>${v5t('策略信息','Policy information','ポリシー情報')} ${infoButton(v5t('这里显示推荐策略版本和 revision，主要用于排障与审计。','Shows the recommendation policy version and revision for troubleshooting and audit.','おすすめポリシーのバージョンと revision を表示し、トラブルシュートや監査に使用します。'))}</summary>
            <code id="v5-policy-tech"></code>
        </details>
        <div class="v5-session-row">
            <span id="v5-session-status" class="status">${v5t('本次想看：默认','Session intent: default','今回見たいもの：既定')}</span>
            <button id="v5-session-reset" type="button" class="v5-compact">${v5t('清除本次想看','Clear session intent','今回の希望をクリア')}</button>
        </div>

        <details id="v5-profile-section" class="v5-overview-section">
            <summary>
                <strong>${v5t('你的推荐画像','Your recommendation profile','おすすめプロフィール')}</strong>
                <span id="v5-profile-summary" class="v5-summary-note"></span>
                ${infoButton(v5t('这里汇总长期兴趣、最近 30 天和当前会话。长期画像不会因为短期浏览被直接覆盖。','Summarizes long-term interests, the last 30 days and the current session. Short-term browsing does not overwrite the long-term profile.','長期的な興味、直近30日、現在のセッションをまとめます。短期的な閲覧で長期プロフィールを直接上書きしません。'))}
            </summary>
            <div id="v5-profile-overview" class="v5-overview-grid"></div>
        </details>

        <details id="v5-serving-section" class="v5-overview-section">
            <summary>
                <strong>${v5t('当前实际推荐构成','Current recommendation composition','現在のおすすめ構成')}</strong>
                <span id="v5-serving-summary" class="v5-summary-note"></span>
                ${infoButton(v5t('这里读取已经落盘并实际展示的 Final V3 当前批次，不会因为打开本页而重新分配推荐。','Reads the persisted Final V3 batch that is actually being shown. Opening this page does not redistribute recommendations.','実際に表示中で保存済みの Final V3 バッチを読み取ります。このページを開いてもおすすめの再割り当ては行いません。'))}
            </summary>
            <div id="v5-serving-overview" class="v5-compose-grid"></div>
        </details>

        <details id="v5-shadow-section" class="v5-overview-section">
            <summary>
                <strong>${v5t('V5 Shadow 规划（实验）','V5 Shadow plan (experimental)','V5 Shadow 計画（実験）')}</strong>
                <span id="v5-shadow-summary" class="v5-summary-note"></span>
                ${infoButton(v5t('这是 V5 候选召回实验规划，servingImpact=false；它不是当前实际展示给你的推荐批次。','This is the V5 experimental candidate-retrieval plan with servingImpact=false; it is not the batch currently shown to you.','servingImpact=false の V5 候補取得実験計画です。現在表示中のおすすめバッチではありません。'))}
            </summary>
            <div id="v5-composition-overview" class="v5-compose-grid"></div>
        </details>

        <div class="v5-heading-inline"><h4>${v5t('你的调整','Your adjustments','あなたの調整')}</h4>${infoButton(v5t('这里仅显示你主动覆盖系统判断的项目。屏蔽偏好和屏蔽具体作品会分别统计。','Only items you explicitly override are shown here. Blocked preferences and blocked works are counted separately.','ここにはシステム判断を明示的に上書きした項目だけを表示します。嗜好のブロックと作品のブロックは別々に集計します。'))}</div>
        <div id="v5-control-list" class="v5-control-list"></div>

        <div class="v5-heading-inline"><h4>${v5t('完整画像与微调 · 0–10 档','Full profile & tuning · 0–10','プロフィール全体と調整 · 0–10')}</h4>${infoButton(v5t('0 = 强烈减少，5 = 中性，10 = 非常喜欢。滑杆修改会先暂存，只有点击“保存调整”才写入长期偏好；0 仍是软偏好，不等同于“屏蔽”。','0 = strongly reduce, 5 = neutral, 10 = strongly prefer. Slider changes are staged until you choose Save adjustments; 0 is still a soft preference, not a block.','0 = 強く減らす、5 = 中立、10 = とても好き。スライダー変更は「調整を保存」するまで仮保存されます。0 はソフト嗜好で、ブロックとは異なります。'))}</div>
        <div class="v5-search-row">
            <label>${v5t('查找一个具体偏好','Find a specific preference','特定の嗜好を検索')}
                <input id="v5-policy-search" placeholder="${v5t('作者、IP、标签或分类，例如：巨乳','Author, IP, tag or category, e.g. a specific tag','作者、IP、タグ、カテゴリを検索')}" />
            </label>
            <button id="v5-policy-search-submit" type="button">${v5t('查找','Find','検索')}</button>
            <button id="v5-policy-search-clear" type="button">${v5t('清空','Clear','クリア')}</button>
        </div>
        <div id="v5-inferred-list" class="v5-facet-list"></div>
        <div id="v5-pending-bar" class="v5-pending-bar" hidden>
            <strong id="v5-pending-count">${v5t('已修改 0 项','0 changes','変更 0 件')}</strong>
            <div class="actions">
                <button id="v5-pending-discard" type="button">${v5t('撤销修改','Discard changes','変更を破棄')}</button>
                <button id="v5-pending-save" type="button" class="primary">${v5t('保存调整','Save adjustments','調整を保存')}</button>
            </div>
        </div>
    `
    anchor.insertAdjacentElement('afterend', panel)
    panel.querySelector('#v5-policy-refresh').addEventListener('click', loadPolicy)
    panel.querySelector('#v5-audit-export').addEventListener('click', async (event) => {
        const button = event.currentTarget
        if (button.disabled) return
        if (typeof window.picaDesktopPost !== 'function') {
            showToast(v5t('推荐审计导出仅在 Windows / Desktop 模式可用。','Recommendation audit export is available only in Windows / Desktop mode.','おすすめ監査の書き出しは Windows / Desktop モードでのみ利用できます。'), 'negative')
            return
        }
        button.disabled = true
        try {
            const result = await window.picaDesktopPost(
                '/api/v1/desktop/recommendation-v5/export-audit',
                { appSessionId: window.picaAppSessionId || null }
            )
            if (result?.cancelled) {
                showToast(v5t('已取消导出。','Export cancelled.','書き出しをキャンセルしました。'))
                return
            }
            showToast(
                `已导出 ${result?.fileName || v5t('推荐审计数据包','recommendation-audit-package','recommendation-audit-package')} · ${Math.round(Number(result?.sizeBytes || 0) / 1024)} KB`,
                'positive'
            )
        } catch (error) {
            showToast(v5t(`导出失败：${error.message}`,`Export failed: ${error.message}`,`書き出しに失敗しました：${error.message}`), 'negative')
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
            showToast(v5t('已清除“本次想看”，长期偏好调整保持不变。','Session intent cleared; long-term preference adjustments are unchanged.','今回の希望をクリアしました。長期嗜好の調整はそのままです。'))
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
        showToast(v5t('已撤销尚未保存的偏好修改。','Unsaved preference changes discarded.','未保存の嗜好変更を破棄しました。'))
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
        showToast(v5t(`调整失败：${error.message}`,`Adjustment failed: ${error.message}`,`調整に失敗しました：${error.message}`), 'negative')
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
                ? v5t(`「${signal.label}」已恢复为“系统未判断”，不再保留手动偏好。`,`“${signal.label}” is back to “no system judgment”; the manual preference was removed.`,`「${signal.label}」を「システム未判断」に戻し、手動嗜好を削除しました。`)
                : v5t(`「${signal.label}」已恢复系统基准 ${baseline}/10。`,`“${signal.label}” restored to the system baseline ${baseline}/10.`,`「${signal.label}」をシステム基準 ${baseline}/10 に戻しました。`),
            'positive'
        )
    else
        showToast(
            signal.manual
                ? v5t(`已将「${signal.label}」设为 ${desired}/10；系统此前没有稳定判断。`,`Set “${signal.label}” to ${desired}/10; the system previously had no stable judgment.`,`「${signal.label}」を ${desired}/10 に設定しました。システムには安定した判断がありませんでした。`)
                : v5t(`「${signal.label}」已从系统基准 ${baseline}/10 调到 ${desired}/10。`,`“${signal.label}” changed from the system baseline ${baseline}/10 to ${desired}/10.`,`「${signal.label}」をシステム基準 ${baseline}/10 から ${desired}/10 に変更しました。`),
            delta > 0 ? 'positive' : 'negative'
        )
}

async function setSession(signal) {
    try {
        V5.snapshot = await post('/api/v1/recommendation-v5/session', {
            mode: 'TARGET', targetType: signal.targetType, key: signal.key, label: signal.label
        })
        renderPolicy()
        showToast(v5t(`本次优先探索「${signal.label}」。`,`Prioritizing “${signal.label}” for this session.`,`このセッションでは「${signal.label}」を優先して探索します。`), 'positive')
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
    if (!window) return `<span class="status">${v5t('暂无足够行为证据','Not enough behavioral evidence yet','行動エビデンスがまだ十分ではありません')}</span>`
    const rows = [
        ...(window.positive?.authors || []).map((item) => ({ ...item, kind: v5t('作者','Author','作者') })),
        ...(window.positive?.tags || []).map((item) => ({ ...item, kind: v5t('标签','Tag','タグ') })),
        ...(window.positive?.categories || []).map((item) => ({ ...item, kind: v5t('分类','Category','カテゴリ') }))
    ]
        .sort((a,b) => Number(b.score || 0) - Number(a.score || 0) || Number(b.supportItems || 0) - Number(a.supportItems || 0))
        .slice(0, 8)
    if (!rows.length) return `<span class="status">${v5t('暂无足够行为证据','Not enough behavioral evidence yet','行動エビデンスがまだ十分ではありません')}</span>`
    return rows.map((item) =>
        `<span class="v5-interest-chip"><small>${esc(item.kind)}</small><strong>${esc(item.label)}</strong><span>${v5Works(Number(item.supportItems || 0))}</span></span>`
    ).join('')
}

function renderProfileOverview() {
    const target = document.querySelector('#v5-profile-overview')
    if (!target) return
    const inferred = V5.timescales?.layers?.inferred || {}
    const counts = V5.snapshot?.counts || {}
    const summary = document.querySelector('#v5-profile-summary')
    if (summary) {
        const topLifetime = [
            ...(inferred.lifetime?.positive?.authors || []),
            ...(inferred.lifetime?.positive?.tags || []),
            ...(inferred.lifetime?.positive?.categories || [])
        ]
            .sort((a,b) => Number(b.score || 0) - Number(a.score || 0) || Number(b.supportItems || 0) - Number(a.supportItems || 0))
            .filter((item,index,array) =>
                array.findIndex((other) => webNorm(other.label || other.key) === webNorm(item.label || item.key)) === index
            )
            .slice(0, 4)
            .map((item) => item.label || item.key)
        summary.textContent =
            v5t(`${Number(counts.favorites || 0)} 本收藏`,`${Number(counts.favorites || 0)} favorites`,`${Number(counts.favorites || 0)} 件のお気に入り`) +
            (topLifetime.length ? v5t(` · 主要：${topLifetime.join(' · ')}`,` · Top: ${topLifetime.join(' · ')}`,` · 主な傾向：${topLifetime.join(' · ')}`) : '')
    }
    const card = (title, help, window) => `
        <section class="v5-overview-card">
            <div class="v5-heading-inline"><h5>${esc(title)}</h5>${infoButton(help)}</div>
            <div class="v5-interest-chips">${preferenceWindowChips(window)}</div>
        </section>`
    target.innerHTML =
        `<section class="v5-overview-card">
            <div class="v5-heading-inline"><h5>${v5t('数据基础','Data foundation','データ基盤')}</h5>${infoButton(v5t('收藏用于长期画像；Ownership 用于避免把已经拥有的作品继续当作新作推荐；正向行为证据还可以来自 Like、阅读等真实使用。','Favorites build the long-term profile; Ownership prevents already-owned works from being recommended as new; positive evidence can also come from likes and reading behavior.','お気に入りは長期プロフィールに使い、Ownership は所有済み作品を新作として再推薦しないために使います。Like や閲覧などの実利用も正向きエビデンスになります。'))}</div>
            <p><strong>${Number(counts.favorites || 0)}</strong> ${v5t('本收藏','favorites','件のお気に入り')}</p>
            <p><strong>${Number(counts.owned || 0)}</strong> ${v5t('本已拥有 / 已入库','owned / in library','件所有済み / ライブラリ登録済み')}</p>
            <p><strong>${Number(inferred.lifetime?.positiveItemCount || 0)}</strong> ${v5t('本作品形成正向行为证据','works with positive behavioral evidence','作品が正向き行動エビデンスを形成')}</p>
        </section>` +
        card(v5t('长期兴趣','Long-term interests','長期的な興味'), v5t('累计收藏和历史行为形成的长期偏好层。','Long-term preferences formed from accumulated favorites and historical behavior.','蓄積したお気に入りと過去の行動から形成される長期嗜好層です。'), inferred.lifetime) +
        card(v5t('最近 30 天','Last 30 days','直近30日'), v5t('近期层用于识别最近兴趣变化，不会直接覆盖长期画像。','The recent layer detects current shifts without directly overwriting the long-term profile.','最近層は直近の興味変化を検出しますが、長期プロフィールを直接上書きしません。'), inferred.days30) +
        card(v5t('本次会话','Current session','現在のセッション'), v5t('只统计当前这次打开应用后、appSessionId 相同的有效行为。','Counts only valid behavior from the current app session with the same appSessionId.','同じ appSessionId の現在のアプリセッション内で発生した有効な行動だけを集計します。'), inferred.session)
}

function renderServingOverview() {
    const target = document.querySelector('#v5-serving-overview')
    const summary = document.querySelector('#v5-serving-summary')
    if (!target) return
    const serving = V5.serving
    if (!serving?.available) {
        if (summary) summary.textContent = v5t('尚无已落盘的当前批次','No persisted current batch yet','保存済みの現在バッチはまだありません')
        target.innerHTML = `<p class="status">${v5t('还没有可读取的实际 serving 批次。','No actual serving batch is available yet.','読み取れる実際の serving バッチはまだありません。')}</p>`
        return
    }
    const familyLabels = {
        FANDOM: v5t('作品 / IP','Work / IP','作品 / IP'),
        CREATOR: v5t('作者','Author','作者'),
        SEMANTIC_CONJUNCTION: v5t('组合偏好','Combined preference','組み合わせ嗜好'),
        SEMANTIC_ANCHOR: v5t('标签 / 题材','Tag / theme','タグ / テーマ'),
        EXPLORATION: v5t('探索','Exploration','探索'),
        RELATED: v5t('相似作品','Related works','類似作品'),
        UNATTRIBUTED: v5t('其他','Other','その他')
    }
    const families = Object.entries(serving.primaryFamilies || {})
        .filter(([,count]) => Number(count) > 0)
        .sort((a,b) => Number(b[1])-Number(a[1]))
    const chips = families.map(([key,count]) =>
        `<span class="v5-interest-chip"><strong>${esc(familyLabels[key] || key)}</strong><span>${v5Works(Number(count))}</span></span>`
    ).join('') || `<span class="status">${v5t('当前批次没有可用归因','No attribution is available for the current batch','現在のバッチに利用可能な帰属情報がありません')}</span>`
    const intents = Array.isArray(serving.primaryIntents)
        ? serving.primaryIntents.filter((item) => Number(item?.count || 0) > 0)
        : []
    const intentChips = intents.slice(0, 8).map((item) => {
        const labels = Array.isArray(item.anchors) ? item.anchors.filter(Boolean).slice(0, 3) : []
        const label = labels.length
            ? labels.join(' + ')
            : familyLabels[item.type] || item.type || v5t('其他','Other','その他')
        return `<span class="v5-interest-chip"><small>${esc(familyLabels[item.type] || item.type || v5t('来源','Source','配信元'))}</small><strong>${esc(label)}</strong><span>${v5Works(Number(item.count || 0))}</span></span>`
    }).join('') || `<span class="status">${v5t('当前批次没有可展示的具体意图锚点','No specific intent anchors are available for this batch','このバッチに表示できる具体的な意図アンカーはありません')}</span>`
    if (summary) {
        const intentSummary = intents.slice(0,3).map((item) => {
            const labels = Array.isArray(item.anchors) ? item.anchors.filter(Boolean) : []
            return labels[0] || familyLabels[item.type] || item.type || v5t('其他','Other','その他')
        }).filter(Boolean)
        summary.textContent =
            v5t(`第 ${Number(serving.batchIndex || 0) + 1} 批 · ${Number(serving.itemCount || 0)} 本`,`Batch ${Number(serving.batchIndex || 0) + 1} · ${Number(serving.itemCount || 0)} works`,`第 ${Number(serving.batchIndex || 0) + 1} バッチ · ${Number(serving.itemCount || 0)} 作品`) +
            (intentSummary.length ? v5t(` · 主要：${intentSummary.join(' · ')}`,` · Top: ${intentSummary.join(' · ')}`,` · 主な傾向：${intentSummary.join(' · ')}`) : '')
    }
    target.innerHTML = `
        <section class="v5-compose-card">
            <div class="v5-heading-inline"><h5>${v5t('当前批次','Current batch','現在のバッチ')}</h5>${infoButton(v5t('这是 Final V3 已经实际分配并落盘的当前 serving 批次；打开本页不会生成或切换批次。','This is the current Final V3 serving batch that has actually been assigned and persisted. Opening this page does not generate or switch batches.','実際に割り当て・保存された Final V3 の現在 serving バッチです。このページを開いても生成や切り替えは行いません。'))}</div>
            <p><strong>${v5t(`第 ${Number(serving.batchIndex || 0) + 1} 批`,`Batch ${Number(serving.batchIndex || 0) + 1}`,`第 ${Number(serving.batchIndex || 0) + 1} バッチ`)}</strong> · ${v5Works(Number(serving.itemCount || 0))}</p>
        </section>
        <section class="v5-compose-card">
            <div class="v5-heading-inline"><h5>${v5t('实际来源构成','Actual source composition','実際の配信元構成')}</h5>${infoButton(v5t('按当前批次每本作品的 primaryFamily 汇总，表示这批实际展示结果主要由哪些推荐意图贡献。','Summarized by each work’s primaryFamily in the current batch, showing which recommendation intents contributed most to the displayed results.','現在バッチの各作品の primaryFamily を集計し、表示結果に主に寄与したおすすめ意図を示します。'))}</div>
            <div class="v5-interest-chips">${chips}</div>
        </section>
        <section class="v5-compose-card">
            <div class="v5-heading-inline"><h5>${v5t('实际主要锚点','Actual primary anchors','実際の主要アンカー')}</h5>${infoButton(v5t('这些锚点来自当前 serving 批次真正使用的 primaryIntent，而不是 V5 Shadow 的实验规划。','These anchors come from the primaryIntent actually used by the current serving batch, not the V5 Shadow experimental plan.','これらのアンカーは現在の serving バッチで実際に使われた primaryIntent 由来で、V5 Shadow の実験計画ではありません。'))}</div>
            <div class="v5-interest-chips">${intentChips}</div>
        </section>`
}

function renderCompositionOverview() {
    const target = document.querySelector('#v5-composition-overview')
    const summary = document.querySelector('#v5-shadow-summary')
    if (!target) return
    const plan = V5.channels
    if (!plan) {
        if (summary) summary.textContent = v5t('暂无 Shadow 规划','No Shadow plan','Shadow 計画なし')
        target.innerHTML = `<p class="status">${v5t('当前没有可读取的 V5 Shadow 规划。','No V5 Shadow plan is available.','読み取れる V5 Shadow 計画はありません。')}</p>`
        return
    }
    const channels = Array.isArray(plan.channels)
        ? plan.channels.filter((item) => item.enabled)
        : []
    const sourceLabels = {
        EXPLICIT_SESSION: v5t('本次明确指定','Explicit session intent','今回の明示指定'),
        EXPLICIT_PERSISTENT: v5t('你的长期调整','Your persistent adjustments','長期調整'),
        SESSION: v5t('本次行为','Current-session behavior','今回の行動'),
        RECENT_7D: v5t('最近 7 天','Last 7 days','直近7日'),
        RECENT_30D: v5t('最近 30 天','Last 30 days','直近30日'),
        LIFETIME: v5t('长期兴趣','Long-term interests','長期的な興味'),
        SYSTEM: v5t('系统探索 / 重发现','System exploration / rediscovery','システム探索 / 再発見')
    }
    const familyLabels = {
        TARGET: v5t('定向目标','Targeted intent','定向ターゲット'), AUTHOR: v5t('作者','Author','作者'), FANDOM: v5t('作品 / IP','Work / IP','作品 / IP'),
        TAG: v5t('标签','Tag','タグ'), CATEGORY: v5t('分类','Category','カテゴリ'), RELATED: v5t('相似作品','Related works','類似作品'),
        EXPLORATION: v5t('探索','Exploration','探索'), REDISCOVERY: v5t('旧藏重发现','Rediscovery','旧作の再発見'), VISUAL: v5t('画风','Visual style','画風')
    }
    const sourceCounts = new Map()
    for (const channel of channels)
        sourceCounts.set(channel.sourceLayer, (sourceCounts.get(channel.sourceLayer) || 0) + 1)
    const sourceHtml = [...sourceCounts.entries()]
        .sort((a,b) => b[1]-a[1])
        .map(([key,count]) => `<p><strong>${esc(sourceLabels[key] || key)}</strong> · ${v5Channels(count)}</p>`)
        .join('') || `<p class="status">${v5t('暂无启用通道','No enabled channels','有効なチャンネルなし')}</p>`
    const familyEntries = Object.entries(plan.summary?.families || {})
        .filter(([,count]) => Number(count) > 0)
        .sort((a,b) => Number(b[1])-Number(a[1]))
    const familyHtml = familyEntries
        .map(([key,count]) => `<span class="v5-interest-chip"><strong>${esc(familyLabels[key] || key)}</strong><span>${Number(count)}</span></span>`)
        .join('') || `<span class="status">${v5t('暂无','None','なし')}</span>`
    const providerHtml = Object.entries(plan.providerBudgets || {})
        .map(([key,value]) => `<p><strong>${esc(key.toUpperCase())}</strong> · ${Number(value?.plannedRequests || 0)} / ${Number(value?.maxRequests || 0)} ${v5t('次请求',' requests',' リクエスト')}${value?.eligible ? '' : v5t(' · 当前不可用',' · unavailable',' · 現在利用不可')}</p>`)
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
        .join('') || `<span class="status">${v5t('暂无明确锚点','No clear anchors','明確なアンカーなし')}</span>`
    if (summary)
        summary.textContent =
            v5t(`${Number(plan.summary?.enabledChannelCount || channels.length)} 条实验通道 · servingImpact=${String(plan.servingImpact)}`,`${Number(plan.summary?.enabledChannelCount || channels.length)} experimental channels · servingImpact=${String(plan.servingImpact)}`,`${Number(plan.summary?.enabledChannelCount || channels.length)} 実験チャンネル · servingImpact=${String(plan.servingImpact)}`)
    target.innerHTML = `
        <section class="v5-compose-card"><h5>${v5t('来源层','Source layer','ソース層')}</h5>${sourceHtml}</section>
        <section class="v5-compose-card"><h5>${v5t('召回通道','Retrieval channels','取得チャンネル')}</h5><div class="v5-interest-chips">${familyHtml}</div></section>
        <section class="v5-compose-card"><h5>${v5t('Provider 预算','Provider budget','Provider 予算')}</h5>${providerHtml}</section>
        <section class="v5-compose-card"><h5>${v5t('实验主要锚点','Experimental primary anchors','実験の主要アンカー')}</h5><div class="v5-interest-chips">${anchors}</div></section>`
}

function updatePendingBar() {
    const bar = document.querySelector('#v5-pending-bar')
    const count = document.querySelector('#v5-pending-count')
    if (!bar || !count) return
    const pending = V5.draftLevels.size
    bar.hidden = pending === 0
    count.textContent = v5t(`已修改 ${pending} 项 · 尚未保存`,`${pending} changes · not saved`,`${pending} 件変更 · 未保存`)
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
        showToast(v5t('偏好调整已保存；后续完整重算会同时影响召回与排序。','Preference adjustments saved; the next full recomputation will affect both retrieval and ranking.','嗜好調整を保存しました。次回の完全再計算で取得と順位付けの両方に反映されます。'), 'positive')
        await loadPolicy()
    } catch (error) {
        showStatus(v5t(`保存偏好失败：${error.message}`,`Could not save preferences: ${error.message}`,`嗜好を保存できませんでした：${error.message}`), true)
        showToast(v5t(`保存失败：${error.message}`,`Save failed: ${error.message}`,`保存に失敗しました：${error.message}`), 'negative')
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
        <span class="status">${signal.manual ? v5t('系统尚未形成稳定判断','The system has no stable judgment yet','システムにはまだ安定した判断がありません') : signal.behaviorDerived ? v5t(`长期行为支持 ${Number(signal.supportCount || 0)} 本`,`Long-term behavior supports ${Number(signal.supportCount || 0)} works`,`長期行動による支持 ${Number(signal.supportCount || 0)} 作品`) : v5t(`收藏支持 ${Number(signal.supportCount || 0)} 本`,`Supported by ${Number(signal.supportCount || 0)} favorites`,`お気に入り ${Number(signal.supportCount || 0)} 件の支持`)}</span></div>
        <div class="v5-range-wrap">
            <input type="range" min="0" max="10" step="1" value="${level}" data-v5-level="${esc(signalId(signal))}" ${blocked ? 'disabled' : ''} />
            <span class="v5-range-value" data-v5-level-value="${esc(signalId(signal))}">${blocked ? v5t('已屏蔽','Blocked','ブロック済み') : `${level}/10`}</span>
            <span class="v5-range-meta">${signal.manual ? v5t('系统未判断 · 5/10 为中性起点','No system judgment · 5/10 is neutral','システム未判断 · 5/10 が中立') : v5t(`系统基准 ${baseline}/10`,`System baseline ${baseline}/10`,`システム基準 ${baseline}/10`)}${current && !blocked ? v5t(` · 你的调整 ${delta > 0 ? '+' : ''}${delta}`,` · Your adjustment ${delta > 0 ? '+' : ''}${delta}`,` · あなたの調整 ${delta > 0 ? '+' : ''}${delta}`) : ''}</span>
        </div>
        <div class="v5-row-actions">
            <button type="button" data-v5-session-target="${esc(signalId(signal))}">${v5t('本次想看','Want this now','今回見たい')}</button>
            ${current ? `<button type="button" data-v5-reset="${esc(signalId(signal))}">${v5t('恢复系统判断','Restore system judgment','システム判断に戻す')}</button>` : ''}
            <button type="button" data-v5-block="${esc(signalId(signal))}">${blocked ? v5t('已屏蔽','Blocked','ブロック済み') : v5t('屏蔽','Block','ブロック')}</button>
        </div>
    </div>`
}

function renderPolicy() {
    ensurePanel()
    if (!V5.snapshot) return
    const counts = V5.snapshot.counts || {}
    showStatus(
        v5t(`已拥有 ${Number(counts.owned || 0)} 本 · 收藏 ${Number(counts.favorites || 0)} 本 · 你调整 ${Number(counts.controls || 0)} 项 · 屏蔽偏好 ${Number(counts.blockedTargets || 0)} 项 · 屏蔽作品 ${Number(counts.hardSuppressed || 0)} 本`,`Owned ${Number(counts.owned || 0)} · Favorites ${Number(counts.favorites || 0)} · Your adjustments ${Number(counts.controls || 0)} · Blocked preferences ${Number(counts.blockedTargets || 0)} · Blocked works ${Number(counts.hardSuppressed || 0)}`,`所有済み ${Number(counts.owned || 0)} · お気に入り ${Number(counts.favorites || 0)} · あなたの調整 ${Number(counts.controls || 0)} · ブロック嗜好 ${Number(counts.blockedTargets || 0)} · ブロック作品 ${Number(counts.hardSuppressed || 0)}`)
    )
    const technical = document.querySelector('#v5-policy-tech')
    if (technical)
        technical.textContent =
            `${V5.snapshot.policyVersion || 'V5'} · revision ${Number(V5.snapshot.revision || 0)}`
    const sessionLabel = document.querySelector('#v5-session-status')
    if (sessionLabel) {
        const intent = V5.snapshot.sessionIntent || {}
        sessionLabel.textContent = intent.mode === 'TARGET'
            ? v5t(`本次想看：${intent.label || intent.key || ''}`,`Session intent: ${intent.label || intent.key || ''}`,`今回見たいもの：${intent.label || intent.key || ''}`) : v5t('本次想看：默认','Session intent: default','今回見たいもの：既定')
    }
    const inferred = lifetimeSignals()
    V5.signalById = new Map(inferred.map((item) => [signalId(item), item]))
    if (V5.manualSignal) V5.signalById.set(signalId(V5.manualSignal), V5.manualSignal)
    renderProfileOverview()
    renderServingOverview()
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
    const majorGroups = new Map()
    for (const [facet, rows] of groupRows) {
        const major = facetSupergroup(facet)
        const current = majorGroups.get(major.id) || {
            ...major,
            groups: []
        }
        current.groups.push([facet, rows])
        majorGroups.set(major.id, current)
    }
    const orderedMajors = V5_FACET_SUPERGROUPS
        .map((major) => majorGroups.get(major.id))
        .filter(Boolean)
    const inferredTarget = document.querySelector('#v5-inferred-list')
    if (inferredTarget) {
        if (orderedMajors.length) {
            inferredTarget.innerHTML = orderedMajors.map((major, majorIndex) => {
                const total = major.groups.reduce((sum,[,rows]) => sum + rows.length, 0)
                const hasAdjusted = major.groups.some(([,rows]) => rows.some(row => controlFor(row)))
                const searchHit = Boolean(V5.search)
                const facetsHtml = major.groups.map(([facet, rows], facetIndex) => {
                    rows.sort((a,b) => baselineLevel(b)-baselineLevel(a) || Number(b.supportCount||0)-Number(a.supportCount||0) || String(a.label).localeCompare(String(b.label)))
                    const facetAdjusted = rows.some(row => controlFor(row))
                    return `<details class="v5-facet-group" ${searchHit || facetAdjusted || (majorIndex===0 && facetIndex===0) ? 'open' : ''}>
                        <summary>${esc(facetLabel(facet))}<span class="v5-facet-count">${v5Items(rows.length)}</span></summary>
                        <div class="v5-facet-body"><div class="v5-facet-scroll">${rows.map(signalRow).join('')}</div></div>
                    </details>`
                }).join('')
                return `<details class="v5-major-group" ${searchHit || hasAdjusted || majorIndex===0 ? 'open' : ''}>
                    <summary>${esc(supergroupLabel(major))}<span class="v5-facet-count">${v5Items(total)}</span></summary>
                    <div class="v5-major-body">${facetsHtml}</div>
                </details>`
            }).join('')
        } else if (manualSignal) {
            inferredTarget.innerHTML =
                `<div class="v5-help"><strong>${v5t(`已确认把“${esc(V5.search)}”作为自定义标签微调。`,`Using “${esc(V5.search)}” as a custom tag preference.`,`「${esc(V5.search)}」をカスタムタグ嗜好として調整します。`)}</strong> ${v5t('5/10 是中性起点，可调整到 0–10；修改后仍需点击“保存调整”。','5/10 is the neutral starting point. Adjust from 0–10, then choose Save adjustments.','5/10 が中立の開始点です。0–10で調整し、「調整を保存」を選んでください。')}</div><div class="v5-facet-group"><div class="v5-facet-body"><div class="v5-facet-scroll">${signalRow(manualSignal)}</div></div></div>`
        } else if (V5.search) {
            inferredTarget.innerHTML =
                `<div class="v5-search-empty"><strong>${v5t(`没有找到“${esc(V5.search)}”`,`No match for “${esc(V5.search)}”`,`「${esc(V5.search)}」が見つかりません`)}</strong><button type="button" class="info-tip" data-info-tip="${v5t('系统不会因为输入文字就自动创建偏好。确认它确实是标签后再添加。','Typing text does not automatically create a preference. Add it only after confirming it is really a tag.','入力した文字だけで嗜好を自動作成しません。実際のタグであることを確認してから追加してください。')}">i</button><p><button type="button" data-v5-add-custom-tag>${v5t('作为标签添加','Add as tag','タグとして追加')}</button></p></div>`
        } else {
            inferredTarget.innerHTML = `<div class="v5-help"><strong>${v5t('还没有收藏画像也可以先配置推荐。','You can configure recommendations before a collection profile exists.','コレクションプロフィールがなくてもおすすめを設定できます。')}</strong> ${v5t('在上方搜索标签并“作为标签添加”，从 5/10 中性起点调整到 0–10；设置为 6–10 的标签可直接作为首轮推荐召回种子。','Search for a tag above, add it as a tag, and adjust from the neutral 5/10 starting point. Tags set to 6–10 can seed the first recommendation round.','上でタグを検索し「タグとして追加」して、5/10 の中立点から0–10で調整します。6–10にしたタグは最初のおすすめ取得の種として使えます。')}</div>`
        }
    }

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
        if(result) showToast(v5t(`已屏蔽「${signal.label}」，完整重算和后续展示都会硬排除。`,`Blocked “${signal.label}”; full recomputation and future display will exclude it.`,`「${signal.label}」をブロックしました。完全再計算と今後の表示から除外されます。`),'negative')
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
            const current=item.direction==='BLOCK'?v5t('屏蔽','Blocked','ブロック'):`${currentLevel(signal)}/10`
            return `<span class="v5-control-chip"><strong>${esc(item.label)}</strong><span>${esc(current)}</span><button type="button" data-v5-control-reset="${esc(signalId(signal))}">${v5t('恢复系统判断','Restore system judgment','システム判断に戻す')}</button></span>`
        }).join(''):`<p class="status">${v5t('目前没有手动覆盖，完全使用系统推断。','No manual overrides; using system inference only.','手動上書きはありません。システム推論のみを使用しています。')}</p>`
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
        const appSessionId = String(window.picaAppSessionId || '').trim()
        const query = new URLSearchParams({ limit: '5000' })
        if (appSessionId) query.set('appSessionId', appSessionId)
        const [snapshot, timescales, channels, serving] = await Promise.all([
            request('/api/v1/recommendation-v5'),
            request(`/api/v1/recommendation-v5/preference-timescales?${query}`),
            request(`/api/v1/recommendation-v5/candidate-channels?${query}`),
            request('/api/v1/recommendation-v5/serving-composition')
        ])
        V5.snapshot = snapshot
        V5.timescales = timescales
        V5.channels = channels
        V5.serving = serving
        renderPolicy()
        decorateRecommendationCards()
    } catch (error) { showStatus(v5t(`推荐控制中心暂不可用：${error.message}`,`Recommendation controls are unavailable: ${error.message}`,`おすすめ調整を利用できません：${error.message}`), true) }
}

function ensureQuickDialog() {
    let dialog=document.querySelector('#v5-quick-control-dialog')
    if(dialog) return dialog
    dialog=document.createElement('dialog'); dialog.id='v5-quick-control-dialog'; dialog.className='app-dialog'
    dialog.innerHTML=`<div><h3>${v5t('调整这类推荐','Tune this recommendation','このおすすめを調整')}</h3><p class="status">${v5t('滑杆以你的收藏画像为基准；修改会先保存，完整重算后同时影响召回与排序。','The slider starts from your profile baseline. Changes are saved and affect retrieval and ranking after full recomputation.','スライダーはプロフィール基準から始まります。変更は保存され、完全再計算後に取得と順位付けの両方へ反映されます。')}</p><div id="v5-quick-control-body"></div><div class="actions"><button type="button" id="v5-quick-close">${v5t('关闭','Close','閉じる')}</button></div></div>`
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
    return found||{targetType,key:webNorm(key),label:label||key,supportCount:0,supportShare:0,facet:targetType==='AUTHOR'?'CREATOR_ENTITY':'OTHER',baselineLevel:5,manual:true,systemUnknown:true}
}

function quickSliderRow(signal) {
    const baseline=baselineLevel(signal), level=currentLevel(signal)
    return `<div class="v5-quick-row"><strong>${esc(signal.label)}</strong>
    <div class="v5-range-wrap"><input type="range" min="0" max="10" step="1" value="${level}" data-v5-quick-level="${esc(signalId(signal))}" />
    <span class="v5-range-value" data-v5-quick-value="${esc(signalId(signal))}">${level}/10</span>
    <span class="v5-range-meta">${v5t(`系统基准 ${baseline}/10 · 收藏支持 ${Number(signal.supportCount||0)} 本`,`System baseline ${baseline}/10 · supported by ${Number(signal.supportCount||0)} favorites`,`システム基準 ${baseline}/10 · お気に入り ${Number(signal.supportCount||0)} 件の支持`)}</span></div>
    <div class="v5-row-actions"><button type="button" data-v5-quick-session="${esc(signalId(signal))}">${v5t('本次想看','Want this now','今回見たい')}</button>
    ${signal.targetType==='AUTHOR'?`<button type="button" data-v5-quick-block="${esc(signalId(signal))}">${v5t('不推荐此作者','Do not recommend this author','この作者をおすすめしない')}</button>`:''}</div></div>`
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
        already_seen:v5t('已标记看过 · 当前作品将从新作推荐中隐藏','Marked as seen · hidden from new-work recommendations','閲覧済みに設定 · 新作おすすめから非表示'),
        already_owned:v5t('已标记已有 · 当前作品不再作为新作推荐','Marked as owned · no longer recommended as new','所有済みに設定 · 新作としておすすめしません'),
        duplicate:v5t('已标记重复反馈 · 当前上传将隐藏','Marked as duplicate · this upload will be hidden','重複として設定 · このアップロードを非表示'),
        temporary:v5t('已暂时隐藏当前作品 · 30 天后自动恢复','Temporarily hidden · automatically returns after 30 days','一時的に非表示 · 30日後に自動復帰')
    }[reason]||v5t('已隐藏当前作品','This work is hidden','この作品を非表示にしました')
}

function openQuickControl(card) {
    const dialog=ensureQuickDialog(), context=cardContext(card), signals=[]
    if(context.author) signals.push(quickSignal('AUTHOR',context.author,context.author))
    for(const tag of context.tags.slice(0,4)) signals.push(quickSignal('TAG',tag,tag))
    V5.quickSignals=new Map(signals.map(item=>[signalId(item),item]))
    const body=dialog.querySelector('#v5-quick-control-body')
    body.innerHTML=signals.map(quickSliderRow).join('')+`<div class="v5-quick-row"><strong>${v5t('这本作品不该作为新推荐出现','This work should not appear as a new recommendation','この作品を新しいおすすめとして表示しない')}</strong>
    <div class="v5-suppress-grid"><button data-v5-suppress-reason="already_seen">${v5t('已经看过','Already seen','閲覧済み')}</button>
    <button data-v5-suppress-reason="already_owned">${v5t('已经拥有','Already owned','所有済み')}</button><button data-v5-suppress-reason="duplicate">${v5t('重复上传','Duplicate upload','重複アップロード')}</button>
    <button data-v5-suppress-reason="temporary">${v5t('暂时不想看（30天）','Hide temporarily (30 days)','一時的に非表示（30日）')}</button></div></div>`
    body.querySelectorAll('[data-v5-quick-level]').forEach(input=>{
        input.addEventListener('input',()=>{const output=body.querySelector(`[data-v5-quick-value="${CSS.escape(input.dataset.v5QuickLevel)}"]`);if(output)output.textContent=`${input.value}/10`})
        input.addEventListener('change',async()=>{const signal=V5.quickSignals.get(input.dataset.v5QuickLevel);if(!signal)return;await setLevel(signal,Number(input.value));dialog.close()})
    })
    body.querySelectorAll('[data-v5-quick-session]').forEach(button=>button.addEventListener('click',async()=>{const signal=V5.quickSignals.get(button.dataset.v5QuickSession);if(!signal)return;await setSession(signal);dialog.close()}))
    body.querySelectorAll('[data-v5-quick-block]').forEach(button=>button.addEventListener('click',async()=>{const signal=V5.quickSignals.get(button.dataset.v5QuickBlock);if(!signal)return;const result=await setControl(signal,'BLOCK');if(result){showToast(v5t(`已屏蔽作者「${signal.label}」。`,`Blocked author “${signal.label}”.`,`作者「${signal.label}」をブロックしました。`),'negative');dialog.close()}}))
    body.querySelectorAll('[data-v5-suppress-reason]').forEach(button=>button.addEventListener('click',async()=>{
        try{
            V5.snapshot=await post('/api/v1/recommendation-v5/suppress',{comicId:context.comicId,suppressed:true,reason:button.dataset.v5SuppressReason})
            const message=suppressionMessage(button.dataset.v5SuppressReason)
            setCardState(card,'v5-suppressed',message,'negative');showToast(message,'negative');dialog.close();renderPolicy()
        }catch(error){showToast(v5t(`操作失败：${error.message}`,`Operation failed: ${error.message}`,`操作に失敗しました：${error.message}`),'negative')}
    }))
    dialog.showModal()
}

function syncFeedbackVisual(card,announce=false) {
    if(!card)return
    const like=card.querySelector('[data-recommend-feedback="like"].active'), dislike=card.querySelector('[data-recommend-feedback="dislike"].active')
    const next=dislike?'dislike':like?'like':'', previous=card.dataset.v5FeedbackState||''
    card.dataset.v5FeedbackState=next
    card.classList.toggle('v5-feedback-like',next==='like');card.classList.toggle('v5-feedback-dislike',next==='dislike')
    if(next==='like')setCardState(card,'',v5t('已记录喜欢 · 将增加类似推荐','Liked · similar recommendations will increase','好きとして記録 · 類似おすすめを増やします'),'positive')
    else if(next==='dislike')setCardState(card,'',v5t('已记录不喜欢 · 将减少此类推荐','Disliked · similar recommendations will decrease','苦手として記録 · この種類のおすすめを減らします'),'negative')
    else if(!card.classList.contains('v5-suppressed'))card.querySelector('.v5-card-state')?.remove()
    if(announce&&next&&next!==previous)showToast(next==='like'?v5t('已记录喜欢，将增加类似推荐。','Liked; similar recommendations will increase.','好きとして記録し、類似おすすめを増やします。'):v5t('已记录不喜欢，将减少此类推荐。','Disliked; similar recommendations will decrease.','苦手として記録し、この種類のおすすめを減らします。'),next==='like'?'positive':'negative')
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
                ? v5t('收藏已保留，但这本不再参与推荐口味画像。','Favorite kept, but this work no longer contributes to your recommendation profile.','お気に入りは保持しますが、この作品はおすすめプロフィールに反映しません。')
                : v5t('这本收藏已恢复参与推荐口味画像。','This favorite now contributes to your recommendation profile again.','このお気に入りをおすすめプロフィールに再び反映します。'),
            'positive'
        )
    } catch (error) {
        showToast(v5t('口味画像设置失败：' + error.message,'Preference-profile setting failed: ' + error.message,'嗜好プロフィール設定に失敗しました：' + error.message), 'negative')
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
                '<span class="status">' + v5t('推荐口味：','Recommendation profile: ','おすすめプロフィール：') +
                (excluded ? v5t('已排除','Excluded','除外') : v5t('参与','Included','参加')) +
                '</span><button type="button">' +
                (excluded
                    ? v5t('恢复用于推荐口味','Include in recommendation profile','おすすめプロフィールに戻す')
                    : v5t('保留收藏，但不用于推荐口味','Keep favorite, exclude from profile','お気に入りを保持し、プロフィールから除外')) +
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
            const button=document.createElement('button');button.type='button';button.dataset.v5QuickControl='true';button.textContent=v5t('⚙ 调节推荐','⚙ Tune recommendations','⚙ おすすめを調整')
            button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openQuickControl(card)})
            ;(detailActions||body).appendChild(button)
        }
        syncFeedbackVisual(card,false)
        if(Array.isArray(V5.snapshot?.hardSuppressComicIds)&&V5.snapshot.hardSuppressComicIds.includes(card.dataset.comicId))
            setCardState(card,'v5-suppressed',v5t('已按你的设置隐藏 · 后续推荐将排除','Hidden by your setting · excluded from future recommendations','設定により非表示 · 今後のおすすめから除外'),'negative')
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

void import('./work-identity-review.js').catch(() => undefined)

void import('./recommendation-v5-evaluation.js').catch(() => undefined)


document.addEventListener('pica-language-change', () => {
    const panel=document.querySelector('#settings-recommendation-v5')
    if(panel) panel.remove()
    ensurePanel()
    renderPolicy()
    decorateRecommendationCards()
    decorateLibraryTasteToggles()
})
