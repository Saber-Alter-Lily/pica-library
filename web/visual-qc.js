import { copy as a88t } from './locale-runtime.js'

const A88_RATINGS_KEY = 'pica-visual-qc-ratings-v1'
const A88_FAILURES_KEY = 'pica-visual-index-failures-v1'
const a88$ = (selector, root = document) => root.querySelector(selector)
const a88$$ = (selector, root = document) => [...root.querySelectorAll(selector)]
const a88Escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const a88Norm = (value) => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase()

const a88State = {
    status: null,
    comics: [],
    comicsById: new Map(),
    feedback: [],
    indexedIds: new Set(),
    indexedComics: [],
    similarCache: new Map(),
    anchorId: '',
    activeRunPending: [],
    lastFailureMessage: ''
}

function a88LoadJson(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || '')
        return value && typeof value === 'object' ? value : fallback
    } catch {
        return fallback
    }
}
function a88SaveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
}
function a88Ratings() { return a88LoadJson(A88_RATINGS_KEY, {}) }
function a88Failures() { return a88LoadJson(A88_FAILURES_KEY, {}) }
function a88Provider(comic) {
    return String(comic?.providerId || (String(comic?.comicId || '').startsWith('eh:') ? 'eh' : 'pica')).toUpperCase()
}
async function a88Api(path, options = {}) {
    const response = await fetch(path, { cache: 'no-store', ...options })
    let value = null
    try { value = await response.json() } catch { value = null }
    if (!response.ok) throw new Error(value?.error || `HTTP ${response.status}`)
    return value
}
async function a88Post(path, value) {
    return a88Api(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value)
    })
}

function a88InjectStyle() {
    if (a88$('#a88-visual-qc-style')) return
    const style = document.createElement('style')
    style.id = 'a88-visual-qc-style'
    style.textContent = `
#a88-visual-qc{margin-top:18px}
.a88-qc-head{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.a88-qc-actions,.a88-rating-actions,.a88-detail-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.a88-qc-search{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;margin:12px 0}
.a88-anchor-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin:10px 0}
.a88-anchor{display:flex;gap:8px;align-items:center;text-align:left;min-width:0}
.a88-anchor img{width:42px;height:58px;object-fit:cover;border-radius:6px;background:#eee}
.a88-anchor span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.a88-similar-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-top:12px}
.a88-similar-card{display:grid;grid-template-columns:82px minmax(0,1fr);gap:10px;padding:10px;border:1px solid var(--a83-line,#ddd7e4);border-radius:14px;background:var(--a83-surface,#fff)}
.a88-similar-card>img{width:82px;height:112px;object-fit:cover;border-radius:9px;background:#eee}
.a88-similar-copy{min-width:0}
.a88-similar-copy h4{margin:0 0 5px;font-size:.96rem;line-height:1.35}
.a88-meta{font-size:.8rem;color:var(--a83-muted,#68636e);line-height:1.5}
.a88-rating-actions button.active{outline:2px solid currentColor;font-weight:700}
.a88-reasons{margin-top:6px;font-size:.8rem}
.a88-reasons label{display:inline-flex;gap:4px;align-items:center;margin:3px 8px 3px 0}
.a88-failure-summary{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.a88-failure-pill{padding:5px 8px;border-radius:999px;background:var(--a83-accent-soft,#eee7fa);font-size:.8rem}
.a88-failure-list{display:grid;gap:6px;max-height:330px;overflow:auto}
.a88-failure-row{padding:8px 10px;border:1px solid var(--a83-line,#ddd7e4);border-radius:10px;font-size:.82rem}
.a88-detail-trigger{margin-top:8px}
#a88-comic-detail-dialog{border:0;border-radius:18px;max-width:min(820px,92vw);width:760px;padding:0;box-shadow:0 30px 80px #0004}
#a88-comic-detail-dialog::backdrop{background:#0007}
.a88-dialog-shell{padding:20px;max-height:82vh;overflow:auto}
.a88-dialog-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.a88-dialog-main{display:grid;grid-template-columns:150px minmax(0,1fr);gap:18px;margin-top:12px}
.a88-dialog-main>img{width:150px;max-height:220px;object-fit:cover;border-radius:10px;background:#eee}
.a88-loading{padding:16px;border:1px dashed var(--a83-line,#ddd7e4);border-radius:12px;color:var(--a83-muted,#68636e)}
.a88-qc-metrics{font-size:.84rem;color:var(--a83-muted,#68636e);margin-top:8px}
@media(max-width:700px){.a88-qc-search{grid-template-columns:1fr}.a88-dialog-main{grid-template-columns:1fr}.a88-dialog-main>img{width:120px}.a88-similar-grid{grid-template-columns:1fr}}
`
    document.head.appendChild(style)
}

async function a88LoadDataset(force = false) {
    if (a88State.status && !force) return a88State
    const [status, comics, feedback] = await Promise.all([
        a88Api('/api/v1/visual/status'),
        a88Api('/api/v1/comics?limit=10000'),
        a88Api('/api/v1/recommendation-feedback').catch(() => [])
    ])
    a88State.status = status
    a88State.comics = Array.isArray(comics) ? comics : []
    a88State.feedback = Array.isArray(feedback) ? feedback : []
    a88State.comicsById = new Map(a88State.comics.map((comic) => [comic.comicId, comic]))
    const targetIds = new Set([
        ...a88State.comics.filter((comic) => comic.isFavorite).map((comic) => comic.comicId),
        ...a88State.feedback.map((item) => item.comicId)
    ])
    const pending = new Set(status?.pendingComicIds || [])
    a88State.indexedIds = new Set([...targetIds].filter((id) => !pending.has(id)))
    a88State.indexedComics = a88State.comics.filter((comic) => a88State.indexedIds.has(comic.comicId))
    a88CleanupResolvedFailures(pending)
    a88RenderPanelStatus()
    return a88State
}

function a88CleanupResolvedFailures(pending) {
    const failures = a88Failures()
    let changed = false
    for (const comicId of Object.keys(failures)) {
        if (!pending.has(comicId)) {
            delete failures[comicId]
            changed = true
        }
    }
    if (changed) a88SaveJson(A88_FAILURES_KEY, failures)
}

function a88RenderPanelStatus() {
    const el = a88$('#a88-qc-status')
    if (!el || !a88State.status) return
    const status = a88State.status
    el.textContent = `Visual V1 · ${status.indexedCount || 0}/${status.targetCount || 0} · Pending ${status.pendingComicIds?.length || 0} · ${status.samplingPolicyVersion || ''}`
    a88RenderFailureSummary()
}

function a88EnsurePanel() {
    const host = a88$('#settings-recommendation-v4') || a88$('#a87-recommendations-panel')
    if (!host || a88$('#a88-visual-qc')) return false
    const panel = document.createElement('article')
    panel.id = 'a88-visual-qc'
    panel.className = 'panel'
    panel.innerHTML = `
      <div class="a88-qc-head"><div><h3>Visual V1 QC · ${a88t('画风审计','Visual-style audit','画風監査')}</h3><p id="a88-qc-status" class="status">${a88t('正在读取 Visual V1…','Reading Visual V1…','Visual V1 を読み込み中…')}</p></div><div class="a88-qc-actions"><button id="a88-qc-refresh" type="button">${a88t('刷新','Refresh','更新')}</button><button id="a88-qc-export" type="button">${a88t('导出 QC JSON','Export QC JSON','QC JSONを書き出す')}</button></div></div>
      <p>${a88t('只读取已冻结的 Visual V1 embedding，不会重建或覆盖向量。人工评分：2=明显相似，1=部分相似，0=明显不相似。','Reads only the frozen Visual V1 embeddings and never rebuilds or overwrites vectors. Manual rating: 2=clearly similar, 1=partly similar, 0=clearly dissimilar.','凍結済みの Visual V1 embedding のみを読み取り、ベクトルの再構築や上書きは行いません。手動評価：2=明確に類似、1=一部類似、0=明確に非類似。')}</p>
      <div class="a88-qc-search"><input id="a88-qc-query" placeholder="${a88t('搜索已索引漫画或作者','Search indexed works or authors','インデックス済み作品または作者を検索')}"><button id="a88-qc-random" type="button">${a88t('随机 Anchor','Random Anchor','ランダム Anchor')}</button><button id="a88-qc-diagnose" type="button">${a88t('诊断 Pending','Diagnose Pending','Pending を診断')}</button></div>
      <div id="a88-qc-metrics" class="a88-qc-metrics"></div>
      <div id="a88-anchor-list" class="a88-anchor-list"></div>
      <div id="a88-qc-message" class="status"></div>
      <div id="a88-qc-results" class="a88-similar-grid"></div>
      <details id="a88-failure-details"><summary>Pending / ${a88t('失败原因','Failure reasons','失敗理由')}</summary><div id="a88-failure-summary" class="a88-failure-summary"></div><div id="a88-failure-list" class="a88-failure-list"></div></details>`
    host.appendChild(panel)
    a88$('#a88-qc-query').addEventListener('input', () => a88RenderAnchorList())
    a88$('#a88-qc-refresh').onclick = () => void a88RefreshPanel()
    a88$('#a88-qc-random').onclick = () => void a88RandomAnchor()
    a88$('#a88-qc-diagnose').onclick = () => void a88DiagnosePending()
    a88$('#a88-qc-export').onclick = () => a88ExportQc()
    a88$('#a88-qc-status').textContent =
        a88t('Visual V1 QC 尚未读取。点击“刷新”或“随机 Anchor”后才加载当前索引；打开设置页不会自动扫描。','Visual V1 QC is not loaded yet. Use Refresh or Random Anchor to load the current index; opening Settings never starts a scan.','Visual V1 QC はまだ読み込まれていません。「更新」または「ランダム Anchor」で現在のインデックスを読み込みます。設定画面を開くだけではスキャンしません。')
    return true
}

async function a88RefreshPanel() {
    const message = a88$('#a88-qc-message')
    if (message) message.textContent = a88t('正在刷新 Visual V1 数据…','Refreshing Visual V1 data…','Visual V1 データを更新中…')
    try {
        await a88LoadDataset(true)
        a88RenderAnchorList()
        if (message) message.textContent = ''
    } catch (error) {
        if (message) message.textContent = a88t(`读取失败：${error.message}`,`Load failed: ${error.message}`,`読み込みに失敗しました：${error.message}`)
    }
}

function a88RenderAnchorList() {
    const target = a88$('#a88-anchor-list')
    if (!target) return
    const q = a88Norm(a88$('#a88-qc-query')?.value)
    const rows = a88State.indexedComics
        .filter((comic) => !q || a88Norm([comic.title, comic.canonicalAuthor, comic.author].join(' ')).includes(q))
        .slice(0, 24)
    target.innerHTML = rows.map((comic) => `
      <button type="button" class="a88-anchor" data-a88-anchor="${a88Escape(comic.comicId)}">
        <img src="/api/v1/covers/${encodeURIComponent(comic.comicId)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <span><strong>${a88Escape(comic.title)}</strong><br><small>${a88Escape(comic.canonicalAuthor || comic.author || '')} · ${a88Provider(comic)}</small></span>
      </button>`).join('') || `<p class="status">${a88t('没有匹配的已索引漫画。','No matching indexed works.','一致するインデックス済み作品がありません。')}</p>`
    a88$$('[data-a88-anchor]', target).forEach((button) => {
        button.onclick = () => void a88RunQcAnchor(button.dataset.a88Anchor)
    })
}

async function a88RandomAnchor() {
    await a88LoadDataset()
    if (!a88State.indexedComics.length) return
    const comic = a88State.indexedComics[Math.floor(Math.random() * a88State.indexedComics.length)]
    a88$('#a88-qc-query').value = comic.title
    a88RenderAnchorList()
    await a88RunQcAnchor(comic.comicId)
}

async function a88FetchSimilar(comicId) {
    if (a88State.similarCache.has(comicId)) return a88State.similarCache.get(comicId)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
        const rows = await a88Api(`/api/v1/visual/similar/${encodeURIComponent(comicId)}?limit=12`, { signal: controller.signal })
        const value = Array.isArray(rows) ? rows : []
        a88State.similarCache.set(comicId, value)
        return value
    } catch (error) {
        if (error?.name === 'AbortError') throw new Error(a88t('相似画风检索超过 20 秒，已停止等待；可稍后重试。','Visual-similarity search exceeded 20 seconds and was stopped; try again later.','画風類似検索が20秒を超えたため待機を停止しました。後でもう一度お試しください。'))
        throw error
    } finally {
        clearTimeout(timer)
    }
}

async function a88RunQcAnchor(comicId) {
    await a88LoadDataset()
    a88State.anchorId = comicId
    const comic = a88State.comicsById.get(comicId)
    const target = a88$('#a88-qc-results')
    const message = a88$('#a88-qc-message')
    if (!a88State.indexedIds.has(comicId)) {
        if (message) message.textContent = a88t('该漫画不在当前 Visual V1 索引中，不能作为 Anchor。','This work is not in the current Visual V1 index and cannot be used as an Anchor.','この作品は現在の Visual V1 インデックスに含まれておらず、Anchor として使えません。')
        if (target) target.innerHTML = ''
        return
    }
    if (message) message.textContent = a88t(`正在从 ${a88State.status?.indexedCount || 0} 个 Visual V1 向量中检索：${comic?.title || comicId}`,`Searching ${a88State.status?.indexedCount || 0} Visual V1 vectors for: ${comic?.title || comicId}`,`${a88State.status?.indexedCount || 0} 個の Visual V1 ベクトルから検索：${comic?.title || comicId}`)
    if (target) target.innerHTML = `<div class="a88-loading">${a88t('正在计算 cosine similarity 并读取 Top 12…','Calculating cosine similarity and loading Top 12…','cosine similarity を計算して Top 12 を読み込み中…')}</div>`
    try {
        const rows = await a88FetchSimilar(comicId)
        if (message) message.textContent = rows.length ? a88t(`Anchor：${comic?.title || comicId} · 返回 ${rows.length} 个候选`,`Anchor: ${comic?.title || comicId} · ${rows.length} candidates`,`Anchor：${comic?.title || comicId} · 候補 ${rows.length} 件`) : a88t('Anchor 有向量，但没有可比较结果。','The Anchor has a vector, but there are no comparable results.','Anchor にベクトルはありますが、比較可能な結果がありません。')
        a88RenderSimilar(comicId, rows, target, true)
    } catch (error) {
        if (message) message.textContent = a88t(`相似画风检索失败：${error.message}`,`Visual-similarity search failed: ${error.message}`,`画風類似検索に失敗しました：${error.message}`)
        if (target) target.innerHTML = ''
    }
}

function a88ReasonLabels() {
    return {
        same_author: a88t('同作者','Same author','同じ作者'),
        same_ip: a88t('同IP/角色','Same IP / character','同じIP / キャラクター'),
        same_topic: a88t('同题材','Same topic','同じ題材'),
        color: a88t('同配色','Similar colors','似た配色'),
        composition: a88t('同构图','Similar composition','似た構図'),
        source_effect: a88t('扫描/来源效应','Scan / source effect','スキャン / 配信元の影響')
    }
}

function a88RatingKey(anchorId, candidateId) { return `${anchorId}::${candidateId}` }
function a88Rating(anchorId, candidateId) { return a88Ratings()[a88RatingKey(anchorId, candidateId)] || null }
function a88SetRating(anchorId, candidateId, patch) {
    const ratings = a88Ratings()
    const key = a88RatingKey(anchorId, candidateId)
    const previous = ratings[key] || { anchorId, candidateId, reasons: [] }
    ratings[key] = { ...previous, ...patch, anchorId, candidateId, updatedAt: new Date().toISOString() }
    a88SaveJson(A88_RATINGS_KEY, ratings)
}

function a88RenderSimilar(anchorId, rows, target, ratingEnabled) {
    if (!target) return
    target.innerHTML = rows.map((item, index) => {
        const comic = item.comic || {}
        const rating = a88Rating(anchorId, comic.comicId)
        return `<article class="a88-similar-card" data-a88-candidate="${a88Escape(comic.comicId)}" data-a88-rank="${index + 1}">
          <img src="/api/v1/covers/${encodeURIComponent(comic.comicId || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <div class="a88-similar-copy"><h4>#${index + 1} ${a88Escape(comic.title || comic.comicId || '')}</h4>
            <div class="a88-meta">${a88Escape(comic.canonicalAuthor || comic.author || '')} · ${a88Provider(comic)}<br>cosine=${Number(item.similarity || 0).toFixed(4)} · ${a88Escape(item.sourceKind || '')} · n=${Number(item.sampleCount || 0)} · confidence=${Number(item.confidence || 0).toFixed(2)}</div>
            <div class="a88-detail-actions"><button type="button" data-a88-open="${a88Escape(comic.comicId)}">${a88t('详情','Details','詳細')}</button></div>
            ${ratingEnabled ? `<div class="a88-rating-actions"><button type="button" data-a88-rating="2" class="${rating?.rating === 2 ? 'active' : ''}">2 ${a88t('明显','Clear','明確')}</button><button type="button" data-a88-rating="1" class="${rating?.rating === 1 ? 'active' : ''}">1 ${a88t('部分','Partial','一部')}</button><button type="button" data-a88-rating="0" class="${rating?.rating === 0 ? 'active' : ''}">0 ${a88t('不像','No','非類似')}</button></div><details class="a88-reasons"><summary>${a88t('混杂/相似原因','Confounders / similarity reasons','交絡 / 類似理由')}</summary>${Object.entries(a88ReasonLabels()).map(([key,label]) => `<label><input type="checkbox" data-a88-reason="${key}" ${rating?.reasons?.includes(key) ? 'checked' : ''}>${label}</label>`).join('')}</details>` : ''}
          </div></article>`
    }).join('')
    a88$$('[data-a88-open]', target).forEach((button) => button.onclick = () => void a88OpenDetail(button.dataset.a88Open))
    if (ratingEnabled) {
        a88$$('[data-a88-rating]', target).forEach((button) => button.onclick = () => {
            const card = button.closest('[data-a88-candidate]')
            a88SetRating(anchorId, card.dataset.a88Candidate, { rating: Number(button.dataset.a88Rating), rank: Number(card.dataset.a88Rank) })
            a88RenderSimilar(anchorId, rows, target, true)
            a88RenderMetrics(anchorId, rows)
        })
        a88$$('[data-a88-reason]', target).forEach((input) => input.onchange = () => {
            const card = input.closest('[data-a88-candidate]')
            const reasons = a88$$('[data-a88-reason]:checked', card).map((node) => node.dataset.a88Reason)
            a88SetRating(anchorId, card.dataset.a88Candidate, { reasons, rank: Number(card.dataset.a88Rank) })
        })
        a88RenderMetrics(anchorId, rows)
    }
}

function a88RenderMetrics(anchorId, rows) {
    const target = a88$('#a88-qc-metrics')
    if (!target) return
    const ratingMap = a88Ratings()
    const metric = (k) => {
        const subset = rows.slice(0, k)
        const values = subset.map((item) => ratingMap[a88RatingKey(anchorId, item.comic?.comicId)]?.rating)
        const rated = values.filter((value) => Number.isInteger(value))
        if (rated.length < Math.min(k, subset.length)) return a88t(`P@${k} 待完成 ${rated.length}/${Math.min(k, subset.length)}`,`P@${k} pending ${rated.length}/${Math.min(k, subset.length)}`,`P@${k} 未完了 ${rated.length}/${Math.min(k, subset.length)}`)
        const broad = rated.filter((value) => value >= 1).length / rated.length
        const strict = rated.filter((value) => value === 2).length / rated.length
        return `P@${k}(≥1)=${broad.toFixed(2)} · strict(=2)=${strict.toFixed(2)}`
    }
    target.textContent = `${metric(5)} · ${metric(10)}`
}

function a88ClassifyFailure(message) {
    const text = String(message || '').toLowerCase()
    if (/onnx|wasm|model|embedding|vector|视觉模型|向量/.test(text)) return 'MODEL_FAILURE'
    if (/sqlite|database|disk|database is locked|no space|save|保存/.test(text)) return 'SAVE_FAILURE'
    if (/401|403|forbidden|permission|login|session|exh|unavailable|权限|登录/.test(text)) return 'PROVIDER_ACCESS'
    if (/no .*page|no page|no body|empty|episode.*(empty|missing)|没有可用|没有正文|章节为空/.test(text)) return 'NO_BODY_PAGES'
    if (/decode|image|content-type|raster|too large|20 mb|图片|解码/.test(text)) return 'IMAGE_INVALID'
    if (/timeout|timed out|network|fetch|econn|enotfound|429|50\d|cloudflare|网络|超时/.test(text)) return 'NETWORK_TRANSIENT'
    return 'UNKNOWN'
}
function a88FailureMeta(category) {
    const rows = {
        READY_TO_RETRY: [a88t('取样可用','Sampling ready','サンプリング可能'), a88t('可以重试；准备阶段正常，之前更像瞬时图片/模型问题。','Retry is reasonable; preparation is normal and the previous issue looks transient.','再試行可能です。準備段階は正常で、前回は一時的な画像/モデル問題の可能性があります。')],
        NETWORK_TRANSIENT: [a88t('网络/限流','Network / rate limit','ネットワーク / レート制限'), a88t('稍后重试通常有意义。','Retrying later is usually worthwhile.','時間を置いて再試行する価値があります。')],
        PROVIDER_ACCESS: [a88t('Provider/权限','Provider / access','Provider / 権限'), a88t('先检查登录、ExH 权限或来源可用性，再重试。','Check login, ExH access or source availability before retrying.','ログイン、ExH 権限、配信元の利用可否を確認してから再試行してください。')],
        NO_BODY_PAGES: [a88t('无可用正文','No body pages','本文ページなし'), a88t('重复运行通常无效；保持 pending 比强行封面补齐更合适。','Repeated runs usually do not help; keeping it pending is safer than forcing a cover fallback.','繰り返し実行しても改善しにくいため、表紙で無理に補完せず pending のままにする方が適切です。')],
        IMAGE_INVALID: [a88t('图片异常','Image issue','画像異常'), a88t('少量可重试；持续失败则建议跳过。','A small number can be retried; skip persistent failures.','少数なら再試行できますが、継続して失敗する場合はスキップを推奨します。')],
        MODEL_FAILURE: [a88t('模型推理','Model inference','モデル推論'), a88t('重启桌面后可重试；若固定同一本失败需检查页面格式。','Retry after restarting Desktop; repeated failure on the same work suggests a page-format issue.','Desktop 再起動後に再試行できます。同じ作品で繰り返し失敗する場合はページ形式を確認してください。')],
        SAVE_FAILURE: [a88t('数据库/保存','Database / save','データベース / 保存'), a88t('停止重复运行，先检查磁盘和数据库状态。','Stop repeated runs and check disk/database status first.','繰り返し実行せず、先にディスクとデータベース状態を確認してください。')],
        UNKNOWN: [a88t('未分类','Unclassified','未分類'), a88t('查看原始错误后决定。','Review the original error before deciding.','元のエラーを確認して判断してください。')]
    }
    return rows[category] || rows.UNKNOWN
}

function a88RecordFailure(comicId, category, error, stage = 'INDEX') {
    if (!comicId) return
    const failures = a88Failures()
    const previous = failures[comicId] || {}
    failures[comicId] = {
        comicId,
        category,
        stage,
        error: String(error || ''),
        attempts: Number(previous.attempts || 0) + 1,
        lastAttemptAt: new Date().toISOString()
    }
    a88SaveJson(A88_FAILURES_KEY, failures)
    a88RenderFailureSummary()
}

function a88RenderFailureSummary() {
    const summary = a88$('#a88-failure-summary')
    const list = a88$('#a88-failure-list')
    if (!summary || !list) return
    const pending = new Set(a88State.status?.pendingComicIds || [])
    const failures = Object.values(a88Failures()).filter((item) => !pending.size || pending.has(item.comicId))
    const counts = new Map()
    for (const item of failures) counts.set(item.category, (counts.get(item.category) || 0) + 1)
    summary.innerHTML = [...counts.entries()].map(([category,count]) => `<span class="a88-failure-pill">${a88Escape(a88FailureMeta(category)[0])} ${count}</span>`).join('') || `<span class="status">${a88t('尚无失败分类记录；可运行“诊断 Pending”。','No classified failures yet; you can run Diagnose Pending.','分類済みの失敗記録はありません。「Pending を診断」を実行できます。')}</span>`
    list.innerHTML = failures.sort((a,b) => String(b.lastAttemptAt).localeCompare(String(a.lastAttemptAt))).map((item) => {
        const comic = a88State.comicsById.get(item.comicId)
        const meta = a88FailureMeta(item.category)
        return `<div class="a88-failure-row"><strong>${a88Escape(comic?.title || item.comicId)}</strong> · ${a88Escape(meta[0])}<br><span>${a88Escape(meta[1])}</span><br><small>${a88Escape(item.error || '')}</small></div>`
    }).join('')
}

async function a88DiagnosePending() {
    const button = a88$('#a88-qc-diagnose')
    const message = a88$('#a88-qc-message')
    button.disabled = true
    try {
        await a88LoadDataset(true)
        const pending = [...(a88State.status?.pendingComicIds || [])]
        if (!pending.length) { message.textContent = a88t('当前没有 Pending。','There are no Pending items.','Pending 項目はありません。'); return }
        const mode = a88State.status?.settings?.samplingMode || 'standard'
        for (let index = 0; index < pending.length; index++) {
            const comicId = pending[index]
            const comic = a88State.comicsById.get(comicId)
            message.textContent = a88t(`诊断 Pending ${index + 1}/${pending.length}：${comic?.title || comicId}（不会保存 embedding）`,`Diagnosing Pending ${index + 1}/${pending.length}: ${comic?.title || comicId} (embedding will not be saved)`,`Pending 診断 ${index + 1}/${pending.length}：${comic?.title || comicId}（embedding は保存しません）`)
            try {
                const prepared = await a88Post('/api/v1/visual/prepare', { comicId, mode, limit: 6 })
                if (prepared?.samples?.length) a88RecordFailure(comicId, 'READY_TO_RETRY', `prepare OK: ${prepared.sourceKind || 'unknown'} · ${prepared.samples.length} samples`, 'PREPARE_DIAGNOSTIC')
                else a88RecordFailure(comicId, 'NO_BODY_PAGES', 'prepare returned no usable samples', 'PREPARE_DIAGNOSTIC')
            } catch (error) {
                a88RecordFailure(comicId, a88ClassifyFailure(error.message), error.message, 'PREPARE_DIAGNOSTIC')
            }
        }
        message.textContent = a88t(`Pending 诊断完成：${pending.length} 本。此操作未生成或覆盖任何 embedding。`,`Pending diagnosis complete: ${pending.length} works. No embeddings were generated or overwritten.`,`Pending 診断完了：${pending.length} 作品。この操作では embedding を生成・上書きしていません。`)
        a88RenderFailureSummary()
        a88$('#a88-failure-details').open = true
    } finally {
        button.disabled = false
    }
}

function a88ExportQc() {
    const payload = {
        exportedAt: new Date().toISOString(),
        visual: a88State.status,
        ratings: Object.values(a88Ratings()),
        failures: Object.values(a88Failures())
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `pica-visual-v1-qc-${new Date().toISOString().replace(/[:.]/g,'-')}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

function a88EnsureDetailDialog() {
    let dialog = a88$('#a88-comic-detail-dialog')
    if (dialog) return dialog
    dialog = document.createElement('dialog')
    dialog.id = 'a88-comic-detail-dialog'
    dialog.innerHTML = '<div class="a88-dialog-shell"></div>'
    document.body.appendChild(dialog)
    return dialog
}

async function a88OpenDetail(comicId) {
    await a88LoadDataset()
    const comic = a88State.comicsById.get(comicId)
    if (!comic) return
    const dialog = a88EnsureDetailDialog()
    const indexed = a88State.indexedIds.has(comicId)
    dialog.querySelector('.a88-dialog-shell').innerHTML = `
      <div class="a88-dialog-head"><div><h2>${a88Escape(comic.title)}</h2><p>${a88Escape(comic.canonicalAuthor || comic.author || '')} · ${a88Provider(comic)}</p></div><button type="button" data-a88-close>${a88t('关闭','Close','閉じる')}</button></div>
      <div class="a88-dialog-main"><img src="/api/v1/covers/${encodeURIComponent(comicId)}" alt=""><div><p>${a88Escape(comic.description || a88t('暂无简介','No description','説明なし'))}</p><p class="a88-meta">${a88t('页数','Pages','ページ数')} ${Number(comic.pagesCount || comic.knownPictures || 0)} · ${a88t('章节','Chapters','チャプター')} ${Number(comic.epsCount || comic.knownEpisodes || 0)} · ${comic.finished ? a88t('已完结','Completed','完結') : a88t('连载/未知','Ongoing / unknown','連載中 / 不明')}</p><div>${(comic.categories || []).slice(0,6).map((tag) => `<span class="tag">${a88Escape(tag)}</span>`).join(' ')} ${(comic.tags || []).slice(0,18).map((tag) => `<span class="tag">${a88Escape(tag)}</span>`).join(' ')}</div><p class="a88-meta">Visual V1：${indexed ? a88t('已索引，可比较','Indexed, comparable','インデックス済み・比較可能') : (a88State.status?.pendingComicIds || []).includes(comicId) ? 'Pending' : a88t('未纳入当前索引','Not in current index','現在のインデックス対象外')}</p><div class="a88-detail-actions"><button type="button" data-a88-similar="${a88Escape(comicId)}" ${indexed ? '' : 'disabled'}>${a88t('相似画风','Similar visual style','似た画風')}</button><button type="button" data-a88-local-read="${a88Escape(comicId)}">${a88t('本地阅读','Read locally','ローカルで読む')}</button><button type="button" data-a88-online-read="${a88Escape(comicId)}">${a88t('在线阅读','Read online','オンラインで読む')}</button></div></div></div>
      <p id="a88-detail-message" class="status"></p><div id="a88-detail-results" class="a88-similar-grid"></div>`
    dialog.querySelector('[data-a88-close]').onclick = () => dialog.close()
    dialog.querySelector('[data-a88-similar]')?.addEventListener('click', (event) => void a88RunDetailSimilar(comicId, event.currentTarget))
    dialog.querySelector('[data-a88-local-read]').onclick = () => {
        dialog.close()
        document.dispatchEvent(new CustomEvent('pica-open-reader', {
            detail: { comicId, online: false }
        }))
    }
    dialog.querySelector('[data-a88-online-read]').onclick = () => {
        dialog.close()
        document.dispatchEvent(new CustomEvent('pica-open-reader', {
            detail: { comicId, online: true }
        }))
    }
    dialog.showModal()
}

async function a88RunDetailSimilar(comicId, button) {
    const message = a88$('#a88-detail-message')
    const target = a88$('#a88-detail-results')
    button.disabled = true
    message.textContent = a88t(`正在从 ${a88State.status?.indexedCount || 0} 个 Visual V1 向量中检索…`,`Searching ${a88State.status?.indexedCount || 0} Visual V1 vectors…`,`${a88State.status?.indexedCount || 0} 個の Visual V1 ベクトルから検索中…`)
    target.innerHTML = `<div class="a88-loading">${a88t('正在读取 Top 12…','Loading Top 12…','Top 12 を読み込み中…')}</div>`
    try {
        const rows = await a88FetchSimilar(comicId)
        message.textContent = rows.length ? a88t(`找到 ${rows.length} 个画风相近候选。`,`Found ${rows.length} visually similar candidates.`,`画風が近い候補を ${rows.length} 件見つけました。`) : a88t('当前 Anchor 没有可比较结果。','The current Anchor has no comparable results.','現在の Anchor に比較可能な結果はありません。')
        a88RenderSimilar(comicId, rows, target, false)
    } catch (error) {
        message.textContent = a88t(`检索失败：${error.message}`,`Search failed: ${error.message}`,`検索に失敗しました：${error.message}`)
        target.innerHTML = ''
    } finally {
        button.disabled = false
    }
}

function a88ComicIdFromCard(card) {
    return card?.querySelector('input[data-comic-id]')?.dataset.comicId || card?.querySelector('[data-read-comic]')?.dataset.readComic || card?.querySelector('[data-online-comic]')?.dataset.onlineComic || ''
}
function a88InstallDetailButtons() {
    for (const root of ['#library', '#downloaded', '#shelves']) {
        const section = a88$(root)
        if (!section) continue
        for (const card of a88$$('article.comic-card, tr', section)) {
            if (card.querySelector('.a88-detail-trigger')) continue
            const comicId = a88ComicIdFromCard(card)
            if (!comicId) continue
            const host = card.querySelector('.comic-card-body') || card.querySelector('td:nth-child(2)') || card.querySelector('td:first-child')
            if (!host) continue
            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'a88-detail-trigger'
            button.dataset.a88Details = comicId
            button.textContent = a88t('详情','Details','詳細')
            host.appendChild(button)
        }
    }
}

async function a88HandleExistingSimilar(button) {
    const dialog = button.closest('#recommend-detail-dialog')
    const comicId = dialog?.dataset.comicId
    if (!comicId) return
    await a88LoadDataset()
    const message = a88$('#recommend-preview-message')
    const target = a88$('#recommend-preview')
    if (!a88State.indexedIds.has(comicId)) {
        message.textContent = a88t('这本漫画没有当前 Visual V1 向量；请从 Visual V1 QC 中选择已索引 Anchor。','This work has no current Visual V1 vector; choose an indexed Anchor from Visual V1 QC.','この作品には現在の Visual V1 ベクトルがありません。Visual V1 QC からインデックス済み Anchor を選択してください。')
        target.innerHTML = ''
        return
    }
    button.disabled = true
    message.textContent = a88t(`正在从 ${a88State.status?.indexedCount || 0} 个 Visual V1 向量中检索…`,`Searching ${a88State.status?.indexedCount || 0} Visual V1 vectors…`,`${a88State.status?.indexedCount || 0} 個の Visual V1 ベクトルから検索中…`)
    target.innerHTML = `<div class="a88-loading">${a88t('正在计算并读取 Top 12…','Calculating and loading Top 12…','計算して Top 12 を読み込み中…')}</div>`
    try {
        const rows = await a88FetchSimilar(comicId)
        message.textContent = rows.length ? a88t(`找到 ${rows.length} 个画风相近候选。`,`Found ${rows.length} visually similar candidates.`,`画風が近い候補を ${rows.length} 件見つけました。`) : a88t('没有可比较结果。','No comparable results.','比較可能な結果がありません。')
        a88RenderSimilar(comicId, rows, target, false)
    } catch (error) {
        message.textContent = a88t(`相似画风检索失败：${error.message}`,`Visual-similarity search failed: ${error.message}`,`画風類似検索に失敗しました：${error.message}`)
        target.innerHTML = ''
    } finally {
        button.disabled = false
    }
}

function a88InstallIndexFailureCapture() {
    const build = a88$('#visual-index-build')
    const message = a88$('#visual-index-message')
    if (!build || !message || build.dataset.a88FailureCapture) return
    build.dataset.a88FailureCapture = '1'
    build.addEventListener('click', () => {
        void a88LoadDataset(true).then(() => {
            a88State.activeRunPending = [...(a88State.status?.pendingComicIds || [])]
            a88State.lastFailureMessage = ''
        })
    }, true)
    const observer = new MutationObserver(() => {
        const value = message.textContent.trim()
        if (!value || value === a88State.lastFailureMessage) return
        const match = value.match(/(?:第|Item\s+)(\d+)\/(\d+).*?(?:失败|failed)[:：]\s*(.+)$/i)
        if (match) {
            a88State.lastFailureMessage = value
            const comicId = a88State.activeRunPending[Number(match[1]) - 1]
            a88RecordFailure(comicId, a88ClassifyFailure(match[3]), match[3], 'INDEX_RUN')
        }
        if (/本轮完成|complete for this run|已停止|stopped/i.test(value)) {
            setTimeout(() => void a88LoadDataset(true), 300)
        }
    })
    observer.observe(message, { childList: true, characterData: true, subtree: true })
}

function a88InstallObservers() {
    let queued = false
    const schedule = () => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => {
            queued = false
            a88EnsurePanel()
            a88InstallDetailButtons()
            a88InstallIndexFailureCapture()
        })
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
}

function a88Bootstrap() {
    a88InjectStyle()
    a88EnsurePanel()
    a88InstallDetailButtons()
    a88InstallIndexFailureCapture()
    a88InstallObservers()
    document.addEventListener('click', (event) => {
        const existing = event.target.closest?.('[data-detail-similar-style]')
        if (existing) {
            event.preventDefault()
            event.stopImmediatePropagation()
            void a88HandleExistingSimilar(existing)
            return
        }
        const detail = event.target.closest?.('[data-a88-details]')
        if (detail) {
            event.preventDefault()
            event.stopImmediatePropagation()
            void a88LoadDataset().then(() => {
                const comicId = detail.dataset.a88Details
                document.dispatchEvent(
                    new CustomEvent('pica-open-comic-detail', {
                        detail: {
                            comicId,
                            comic: a88State.comicsById.get(comicId) || null
                        }
                    })
                )
            })
        }
    }, true)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', a88Bootstrap)
else a88Bootstrap()


document.addEventListener('pica-language-change', () => {
    a88$('#a88-visual-qc')?.remove()
    a88EnsurePanel()
    if (a88State.status) {
        a88RenderPanelStatus()
        a88RenderAnchorList()
        a88RenderFailureSummary()
    }
    a88$$('.a88-detail-trigger').forEach((button) => { button.textContent = a88t('详情','Details','詳細') })
})
