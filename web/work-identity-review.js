import { copy as wiT } from './locale-runtime.js'

const IDENTITY = {
    review: null,
    plan: null,
    busy: false,
    scanTask: null,
    scanPollGeneration: 0,
    catalog: null,
    catalogById: new Map()
}

const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[ch])

async function request(path, options = {}) {
    const response = await fetch(path, options)
    const value = await response.json().catch(() => ({}))
    if (!response.ok)
        throw new Error(value.error || `HTTP ${response.status}`)
    return value
}

const post = (path, body) =>
    request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    })

function ensureStyles() {
    if (document.querySelector('#v5-work-identity-style')) return
    const style = document.createElement('style')
    style.id = 'v5-work-identity-style'
    style.textContent = `
#settings-work-identity-v5{overflow:hidden}
.v5-id-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.v5-id-actions{display:flex;gap:8px;flex-wrap:wrap}
.v5-id-note{padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--a83-accent-soft,#eef0ff) 72%,transparent);line-height:1.5}
.v5-id-list{display:grid;gap:10px;margin-top:12px}
.v5-id-row{border:1px solid var(--a83-line,#ddd);border-radius:14px;padding:12px;display:grid;gap:9px}
.v5-id-pair{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center}
.v5-id-comic{min-width:0;display:grid;grid-template-columns:70px minmax(0,1fr);gap:10px;align-items:center}
.v5-id-comic img{width:70px;height:98px;object-fit:cover;border-radius:8px;background:#eee}
.v5-id-comic-copy{min-width:0}.v5-id-comic strong{display:block;overflow:hidden;text-overflow:ellipsis}
.v5-id-comic .v5-id-mini-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.v5-id-comic .v5-id-mini-actions button{min-height:32px;padding:5px 9px}
.v5-id-row.decided{opacity:.78}
#v5-id-detail-dialog{border:0;border-radius:18px;max-width:min(860px,92vw);width:780px;padding:0;box-shadow:0 30px 80px #0004}
#v5-id-detail-dialog::backdrop{background:#0007}
.v5-id-detail-shell{padding:20px;max-height:82vh;overflow:auto}
.v5-id-detail-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.v5-id-detail-main{display:grid;grid-template-columns:180px minmax(0,1fr);gap:18px;margin-top:12px}
.v5-id-detail-main>img{width:180px;max-height:260px;object-fit:cover;border-radius:10px;background:#eee}
.v5-id-detail-tags{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
.v5-id-detail-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.v5-id-arrow{opacity:.55;font-weight:700}
.v5-id-meta{display:flex;gap:8px;flex-wrap:wrap;font-size:.82rem;opacity:.76}
.v5-id-decision{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.v5-id-decision button{min-height:36px;padding:6px 10px}
.v5-id-badge{padding:4px 8px;border-radius:999px;background:var(--a83-accent-soft,#eef0ff);font-size:.78rem;font-weight:700}
.v5-id-badge.keep{color:#8a3e3e}.v5-id-badge.same{color:#2d6f46}.v5-id-badge.edition{color:#685391}
.v5-id-preview{margin-top:10px;padding:10px 12px;border:1px dashed var(--a83-line,#ddd);border-radius:12px}
.v5-id-preview strong{display:block;margin-bottom:4px}
.v5-id-preview-groups{display:grid;gap:6px;margin-top:8px}
.v5-id-preview-group{font-size:.84rem;line-height:1.45}
.v5-id-preview-group.conflict{color:#8a3e3e}
.v5-id-plan{margin-top:10px;padding:10px 12px;border:1px solid var(--a83-line,#ddd);border-radius:12px}
.v5-id-plan-groups{display:grid;gap:8px;margin-top:8px}
.v5-id-plan-group{padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--a83-accent-soft,#eef0ff) 42%,transparent);font-size:.84rem;line-height:1.5}
.v5-id-plan-group.blocked{color:#8a3e3e}
@media(max-width:760px){.v5-id-pair{grid-template-columns:1fr}.v5-id-arrow{display:none}.v5-id-detail-main{grid-template-columns:1fr}.v5-id-detail-main>img{width:140px}}
`
    document.head.appendChild(style)
}

function decisionLabel(decision) {
    return {
        SAME_WORK: wiT('已确认：同一作品','Confirmed: same work','確認済み：同一作品'),
        EDITION_VARIANT: wiT('已确认：不同版本','Confirmed: different edition','確認済み：別版'),
        KEEP_SEPARATE: wiT('已确认：保持分离','Confirmed: keep separate','確認済み：分離を維持')
    }[decision] || ''
}

function decisionClass(decision) {
    return decision === 'KEEP_SEPARATE'
        ? 'keep'
        : decision === 'EDITION_VARIANT'
          ? 'edition'
          : 'same'
}

function ensurePanel() {
    ensureStyles()
    if (document.querySelector('#settings-work-identity-v5')) return
    const anchor =
        document.querySelector('#settings-recommendation-v5') ||
        document.querySelector('#settings-recommendation-v4')
    if (!anchor) return
    const panel = document.createElement('article')
    panel.id = 'settings-work-identity-v5'
    panel.className = 'panel'
    panel.innerHTML = `
        <div class="v5-id-head">
            <div>
                <h3>${wiT('作品身份审计 · P2A Beta','Work identity review · P2A Beta','作品ID監査 · P2A Beta')}</h3>
                <p>${wiT('检查不同 Provider / 重传记录是否可能属于同一作品。当前阶段不会自动创建 Work/Edition 绑定。','Review whether records from different providers or reuploads may represent the same work. This stage never creates Work/Edition bindings automatically.','異なる Provider や再アップロード記録が同一作品かどうかを確認します。この段階では Work / Edition の紐付けを自動作成しません。')}</p>
            </div>
            <div class="v5-id-actions">
                <button id="v5-id-load" type="button">${wiT('读取现有证据','Load existing evidence','既存エビデンスを読み込む')}</button>
                <button id="v5-id-scan" type="button" class="primary">${wiT('扫描身份证据','Scan identity evidence','作品IDエビデンスをスキャン')}</button>
                <button id="v5-id-scan-pause" type="button" hidden>${wiT('暂停扫描','Pause scan','スキャンを一時停止')}</button>
                <button id="v5-id-scan-resume" type="button" hidden>${wiT('继续扫描','Resume scan','スキャンを再開')}</button>
                <button id="v5-id-scan-cancel" type="button" hidden>${wiT('取消扫描','Cancel scan','スキャンをキャンセル')}</button>
                <button id="v5-id-plan-btn" type="button">${wiT('生成 Dry-run 绑定计划','Generate dry-run binding plan','Dry-run 紐付け計画を生成')}</button>
            </div>
        </div>
        <div class="v5-id-note">
            <strong>${wiT('当前权限：','Current authority:','現在の権限：')}</strong>
            ${wiT(
                '“同一作品”和“不同版本”只保存人工裁决，暂不改变 serving；“保持分离”会立即成为高权限去重保护，防止自动规则把两条上传折叠。所有裁决都可以清除。',
                '“Same work” and “different edition” only save human decisions and do not change serving yet. “Keep separate” immediately becomes a high-authority deduplication protection that prevents automatic rules from collapsing two uploads. Every decision can be cleared.',
                '「同一作品」と「別版」は人手の裁定だけを保存し、まだ serving は変更しません。「分離を維持」は高権限の重複排除保護として即時反映され、自動ルールが2つのアップロードを統合するのを防ぎます。すべての裁定は解除できます。'
            )}
        </div>
        <p id="v5-id-status" class="status">${wiT('尚未主动扫描。已有证据也不会在后台自动扩充。','No active scan has been run yet. Existing evidence is not expanded automatically in the background.','まだ能動スキャンは実行されていません。既存エビデンスもバックグラウンドで自動拡張されません。')}</p>
        <div id="v5-id-preview" class="v5-id-preview" hidden></div>
        <div id="v5-id-plan" class="v5-id-plan" hidden></div>
        <div id="v5-id-list" class="v5-id-list"></div>
    `
    anchor.insertAdjacentElement('afterend', panel)
    panel.querySelector('#v5-id-load').addEventListener('click', () => {
        void loadReview()
    })
    panel.querySelector('#v5-id-scan').addEventListener('click', () => {
        void refreshEvidence()
    })
    panel.querySelector('#v5-id-scan-pause').addEventListener('click', () => {
        void controlEvidenceRefresh('pause')
    })
    panel.querySelector('#v5-id-scan-resume').addEventListener('click', () => {
        void controlEvidenceRefresh('resume')
    })
    panel.querySelector('#v5-id-scan-cancel').addEventListener('click', () => {
        void controlEvidenceRefresh('cancel')
    })
    panel.querySelector('#v5-id-plan-btn').addEventListener('click', () => {
        void loadMaterializationPlan()
    })
    void reattachEvidenceRefresh()
}

function status(message, bad = false) {
    const node = document.querySelector('#v5-id-status')
    if (!node) return
    node.textContent = message
    node.classList.toggle('error', Boolean(bad))
}

function renderMaterializationPreview(review) {
    const node = document.querySelector('#v5-id-preview')
    if (!node) return
    const preview = review?.materializationPreview
    if (!preview || preview.mode !== 'PREVIEW_ONLY') {
        node.hidden = true
        node.innerHTML = ''
        return
    }
    const groups = Array.isArray(preview.groups) ? preview.groups : []
    const visible = groups.slice(0, 12)
    node.hidden = false
    node.innerHTML = `
        <strong>${wiT('Work 物化预览','Work materialization preview','Work マテリアライズプレビュー')}</strong>
        <div>${wiT('Work 组','Work groups','Work グループ')} ${Number(preview.workGroupCount || 0)} · ${wiT('可进入后续绑定','ready for later binding','後続の紐付け可能')} ${Number(preview.readyGroupCount || 0)} · ${wiT('Upload 绑定候选','Upload binding candidates','Upload 紐付け候補')} ${Number(preview.proposedUploadBindingCount || 0)} · ${wiT('冲突','conflicts','競合')} ${Number(preview.conflictCount || 0)}</div>
        <div class="status">${wiT('仅预览，不写入 Work/Edition binding；存在“保持分离”冲突的组会被阻断。','Preview only; no Work/Edition binding is written. Groups with a “keep separate” conflict are blocked.','プレビューのみで Work / Edition binding は書き込みません。「分離を維持」と競合するグループはブロックされます。')}</div>
        ${visible.length ? `<div class="v5-id-preview-groups">${visible.map((group) => {
            const titles = Array.isArray(group.titles) ? group.titles.slice(0, 3).join(' / ') : ''
            const extra = Array.isArray(group.titles) && group.titles.length > 3
                ? ` +${group.titles.length - 3}`
                : ''
            const conflicts = Array.isArray(group.conflicts) ? group.conflicts.length : 0
            return `<div class="v5-id-preview-group ${conflicts ? 'conflict' : ''}">
                ${esc(titles)}${esc(extra)} · ${Number(group.comicIds?.length || 0)} uploads
                ${Number(group.editionVariantPairCount || 0) ? ` · edition variant ${Number(group.editionVariantPairCount || 0)}` : ''}
                ${conflicts ? ` · ${wiT('冲突','conflicts','競合')} ${conflicts}` : ` · ${wiT('无冲突','no conflict','競合なし')}`}
            </div>`
        }).join('')}</div>` : ''}
    `
}

function renderMaterializationPlan(plan) {
    const node = document.querySelector('#v5-id-plan')
    if (!node) return
    if (!plan || plan.mode !== 'DRY_RUN') {
        node.hidden = true
        node.innerHTML = ''
        return
    }
    const summary = plan.summary || {}
    const groups = Array.isArray(plan.groups) ? plan.groups : []
    node.hidden = false
    node.innerHTML = `
        <strong>${wiT('P2A-5 Dry-run 绑定计划','P2A-5 dry-run binding plan','P2A-5 Dry-run 紐付け計画')}</strong>
        <div>${wiT('Work 组','Work groups','Work グループ')} ${Number(summary.workGroupCount || 0)} · ${wiT('Work 可绑定','Work-bindable','Work 紐付け可能')} ${Number(summary.workReadyCount || 0)} · ${wiT('完整绑定可执行','full binding ready','完全紐付け可能')} ${Number(summary.fullBindingReadyCount || 0)} · ${wiT('阻断组','blocked groups','ブロックグループ')} ${Number(summary.blockedGroupCount || 0)}</div>
        <div>${wiT('拟新建 Work','Create Work','Work 新規作成')} ${Number(summary.createWorkCount || 0)} · ${wiT('复用 Work','Reuse Work','Work 再利用')} ${Number(summary.reuseWorkCount || 0)} · ${wiT('Upload 变更','Upload changes','Upload 変更')} ${Number(summary.proposedUploadBindingCount || 0)} · ${wiT('警告','warnings','警告')} ${Number(summary.warningCount || 0)} · ${wiT('阻断项','blockers','ブロッカー')} ${Number(summary.blockerCount || 0)}</div>
        <div class="status">planVersion: ${esc(plan.planVersion || '')} · digest: ${esc(String(plan.planDigest || '').slice(0, 16))}… · ${wiT('writeEnabled=false。这里只计算执行与回滚计划，不写数据库。','writeEnabled=false. This computes execution and rollback plans only; the database is not written.','writeEnabled=false。実行・ロールバック計画を計算するだけで、データベースには書き込みません。')}</div>
        ${groups.length ? `<div class="v5-id-plan-groups">${groups.slice(0, 12).map((group) => {
            const blockers = Array.isArray(group.blockers) ? group.blockers : []
            const warnings = Array.isArray(group.warnings) ? group.warnings : []
            const uploads = Array.isArray(group.uploadBindings) ? group.uploadBindings : []
            const editions = Array.isArray(group.editionPlans) ? group.editionPlans : []
            return `<div class="v5-id-plan-group ${blockers.length ? 'blocked' : ''}">
                <strong>${esc(group.preferredTitle || group.planWorkKey || 'Work')}</strong>
                <div>${Number(group.comicIds?.length || 0)} uploads · ${esc(group.workAction || '')} · ${group.readyForFullBinding ? wiT('可完整执行','full binding ready','完全実行可能') : group.readyForWorkBinding ? wiT('仅 Work 层可执行','Work layer only','Work 層のみ実行可能') : wiT('已阻断','blocked','ブロック済み')}</div>
                <div>Edition clusters ${editions.length} · planned changes ${uploads.filter((item) => item.action !== 'NOOP').length}</div>
                ${blockers.length ? `<div>${wiT('阻断：','Blockers: ','ブロッカー：')}${esc(blockers.map((item) => item.type).join(' / '))}</div>` : ''}
                ${warnings.length ? `<div>${wiT('警告：','Warnings: ','警告：')}${esc(warnings.map((item) => item.type).join(' / '))}</div>` : ''}
            </div>`
        }).join('')}</div>` : `<p class="status">${wiT('尚没有足够的人工裁决形成可物化 Work 组。','There are not enough human decisions to form materializable Work groups yet.','マテリアライズ可能な Work グループを形成するための人手裁定がまだ十分ではありません。')}</p>`}
    `
}

async function loadCatalog() {
    if (IDENTITY.catalog) return IDENTITY.catalog
    const rows = await request('/api/v1/comics?limit=10000')
    IDENTITY.catalog = Array.isArray(rows) ? rows : []
    IDENTITY.catalogById = new Map(
        IDENTITY.catalog.map((comic) => [comic.comicId, comic])
    )
    return IDENTITY.catalog
}

function identityComic(comicId, fallbackTitle = '', fallbackProvider = '') {
    return (
        IDENTITY.catalogById.get(comicId) || {
            comicId,
            title: fallbackTitle || comicId,
            author: '',
            canonicalAuthor: '',
            providerId: fallbackProvider || '',
            tags: [],
            categories: []
        }
    )
}

function identityComicMarkup(comic, provider) {
    const author = comic.canonicalAuthor || comic.author || wiT('未知作者','Unknown author','作者不明')
    return `
        <div class="v5-id-comic">
            <img src="/api/v1/covers/${encodeURIComponent(comic.comicId)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <div class="v5-id-comic-copy">
                <strong>${esc(comic.title || comic.comicId)}</strong>
                <span class="status">${esc(author)} · ${esc(provider || comic.providerId || 'unknown')}</span>
                <span class="status">${esc(comic.comicId)}</span>
                <div class="v5-id-mini-actions">
                    <button type="button" data-v5-id-detail="${esc(comic.comicId)}">${wiT('详情','Details','詳細')}</button>
                    <button type="button" data-v5-id-read-online="${esc(comic.comicId)}">${wiT('在线阅读','Read online','オンラインで読む')}</button>
                </div>
            </div>
        </div>`
}

function ensureIdentityDetailDialog() {
    let dialog = document.querySelector('#v5-id-detail-dialog')
    if (dialog) return dialog
    dialog = document.createElement('dialog')
    dialog.id = 'v5-id-detail-dialog'
    dialog.innerHTML = '<div class="v5-id-detail-shell"></div>'
    document.body.appendChild(dialog)
    return dialog
}

function openIdentityDetail(comicId) {
    const comic = identityComic(comicId)
    const dialog = ensureIdentityDetailDialog()
    const author = comic.canonicalAuthor || comic.author || wiT('未知作者','Unknown author','作者不明')
    const tags = Array.isArray(comic.tags) ? comic.tags : []
    const categories = Array.isArray(comic.categories) ? comic.categories : []
    dialog.querySelector('.v5-id-detail-shell').innerHTML = `
        <div class="v5-id-detail-head">
            <div><h2>${esc(comic.title || comic.comicId)}</h2><p>${esc(author)} · ${esc(String(comic.providerId || '').toUpperCase())}</p></div>
            <button type="button" data-v5-id-detail-close>${wiT('关闭','Close','閉じる')}</button>
        </div>
        <div class="v5-id-detail-main">
            <img src="/api/v1/covers/${encodeURIComponent(comic.comicId)}" alt="" onerror="this.style.visibility='hidden'">
            <div>
                <p>${esc(comic.description || wiT('暂无简介','No description','説明なし'))}</p>
                <p class="status">${wiT('页数','Pages','ページ数')} ${Number(comic.pagesCount || comic.knownPictures || 0)} · ${wiT('章节','Chapters','チャプター')} ${Number(comic.epsCount || comic.knownEpisodes || 0)} · ${comic.finished ? wiT('已完结','Completed','完結') : wiT('连载/未知','Ongoing / unknown','連載中 / 不明')}</p>
                <div class="v5-id-detail-tags">
                    ${categories.slice(0,8).map((x)=>`<span class="tag">${esc(x)}</span>`).join('')}
                    ${tags.slice(0,18).map((x)=>`<span class="tag">${esc(x)}</span>`).join('')}
                </div>
                <div class="v5-id-detail-actions">
                    <button type="button" data-v5-id-detail-local="${esc(comic.comicId)}">${wiT('本地阅读','Read locally','ローカルで読む')}</button>
                    <button type="button" data-v5-id-detail-online="${esc(comic.comicId)}">${wiT('在线阅读','Read online','オンラインで読む')}</button>
                </div>
            </div>
        </div>`
    dialog.querySelector('[data-v5-id-detail-close]').onclick = () => dialog.close()
    dialog.querySelector('[data-v5-id-detail-local]').onclick = () => {
        dialog.close()
        document.dispatchEvent(new CustomEvent('pica-open-reader', {
            detail: { comicId, online: false }
        }))
    }
    dialog.querySelector('[data-v5-id-detail-online]').onclick = () => {
        dialog.close()
        document.dispatchEvent(new CustomEvent('pica-open-reader', {
            detail: { comicId, online: true }
        }))
    }
    dialog.showModal()
}

function renderReview() {
    ensurePanel()
    const target = document.querySelector('#v5-id-list')
    if (!target || !IDENTITY.review) return
    const review = IDENTITY.review
    const rows = (Array.isArray(review.evidence) ? [...review.evidence] : []).sort(
        (a, b) =>
            Number(Boolean(a.decision)) - Number(Boolean(b.decision)) ||
            Number(b.confidence || 0) - Number(a.confidence || 0)
    )
    const counts = review.storage?.counts || {}
    renderMaterializationPreview(review)
    status(
        wiT(
            `证据 ${Number(counts.evidence || rows.length)} · 人工裁决 ${Number(counts.decisions || 0)} · 待裁决 ${Number(review.undecidedCount || 0)} · Work binding ${Number(counts.bindings || 0)}`,
            `Evidence ${Number(counts.evidence || rows.length)} · human decisions ${Number(counts.decisions || 0)} · undecided ${Number(review.undecidedCount || 0)} · Work bindings ${Number(counts.bindings || 0)}`,
            `エビデンス ${Number(counts.evidence || rows.length)} · 人手裁定 ${Number(counts.decisions || 0)} · 未裁定 ${Number(review.undecidedCount || 0)} · Work binding ${Number(counts.bindings || 0)}`
        )
    )
    if (!rows.length) {
        target.innerHTML =
            `<p class="status">${wiT('当前没有已保存的高置信身份证据。可点击“扫描身份证据”。','No saved high-confidence identity evidence is available. Choose Scan identity evidence.','保存済みの高信頼度作品IDエビデンスはありません。「作品IDエビデンスをスキャン」を実行してください。')}</p>`
        return
    }
    target.innerHTML = rows.slice(0, 80).map((item) => {
        const decision = item.decision?.decision || ''
        const evidence = item.evidence || {}
        const leftProvider = evidence.leftProvider || 'unknown'
        const rightProvider = evidence.rightProvider || 'unknown'
        const pages =
            evidence.leftPages || evidence.rightPages
                ? `${Number(evidence.leftPages || 0)} ↔ ${Number(evidence.rightPages || 0)} ${wiT('页','pages','ページ')}`
                : ''
        const leftComic = identityComic(item.leftComicId, item.leftTitle, leftProvider)
        const rightComic = identityComic(item.rightComicId, item.rightTitle, rightProvider)
        return `<article class="v5-id-row ${decision ? 'decided' : ''}"
            data-left-id="${esc(item.leftComicId)}"
            data-right-id="${esc(item.rightComicId)}">
            <div class="v5-id-pair">
                ${identityComicMarkup(leftComic, leftProvider)}
                <span class="v5-id-arrow">↔</span>
                ${identityComicMarkup(rightComic, rightProvider)}
            </div>
            <div class="v5-id-meta">
                <span>${wiT('置信度','Confidence','信頼度')} ${Number(item.confidence || 0).toFixed(2)}</span>
                <span>${evidence.titleMatch === 'STRICT' ? wiT('标题严格一致','Strict title match','タイトル完全一致') : wiT('去噪标题一致','Normalized title match','正規化タイトル一致')}</span>
                ${pages ? `<span>${esc(pages)}</span>` : ''}
                <span>${evidence.crossProvider ? wiT('跨 Provider','Cross-provider','Provider 横断') : wiT('同 Provider','Same provider','同一 Provider')}</span>
            </div>
            <div class="v5-id-decision">
                ${decision ? `<span class="v5-id-badge ${decisionClass(decision)}">${esc(decisionLabel(decision))}</span>` : `<span class="status">${wiT('尚未人工裁决','No human decision yet','人手裁定なし')}</span>`}
                <button type="button" data-v5-id-decision="SAME_WORK">${wiT('同一作品','Same work','同一作品')}</button>
                <button type="button" data-v5-id-decision="EDITION_VARIANT">${wiT('不同版本','Different edition','別版')}</button>
                <button type="button" data-v5-id-decision="KEEP_SEPARATE">${wiT('保持分离','Keep separate','分離を維持')}</button>
                ${decision ? `<button type="button" data-v5-id-decision="CLEAR">${wiT('清除裁决','Clear decision','裁定を解除')}</button>` : ''}
            </div>
        </article>`
    }).join('')

    target.querySelectorAll('[data-v5-id-detail]').forEach((button) => {
        button.addEventListener('click', () => openIdentityDetail(button.dataset.v5IdDetail))
    })
    target.querySelectorAll('[data-v5-id-read-online]').forEach((button) => {
        button.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('pica-open-reader', {
                detail: { comicId: button.dataset.v5IdReadOnline, online: true }
            }))
        })
    })

    target.querySelectorAll('[data-v5-id-decision]').forEach((button) => {
        button.addEventListener('click', () => {
            const row = button.closest('.v5-id-row')
            if (!row) return
            void saveDecision(
                row.dataset.leftId,
                row.dataset.rightId,
                button.dataset.v5IdDecision
            )
        })
    })
}

async function loadReview() {
    if (IDENTITY.busy) return
    IDENTITY.busy = true
    status(wiT('正在读取已保存身份证据…','Reading saved identity evidence…','保存済み作品IDエビデンスを読み込み中…'))
    try {
        const [review] = await Promise.all([
            request('/api/v1/recommendation-v5/work-identity/review?limit=300'),
            loadCatalog()
        ])
        IDENTITY.review = review
        renderReview()
    } catch (error) {
        status(wiT(`读取失败：${error.message}`,`Load failed: ${error.message}`,`読み込みに失敗しました：${error.message}`), true)
    } finally {
        IDENTITY.busy = false
    }
}

function renderEvidenceTask(task) {
    IDENTITY.scanTask = task
    const scan = document.querySelector('#v5-id-scan')
    const pause = document.querySelector('#v5-id-scan-pause')
    const resume = document.querySelector('#v5-id-scan-resume')
    const cancel = document.querySelector('#v5-id-scan-cancel')
    if (scan) scan.disabled = Boolean(task?.active)
    if (pause) pause.hidden = !task?.canPause
    if (resume) resume.hidden = !task?.canResume
    if (cancel) cancel.hidden = !task?.canCancel
    if (!task) return

    const phase = {
        loading: wiT('读取完整目录','Loading full catalog','全カタログを読み込み中'),
        bucketing: wiT('建立候选桶','Building candidate buckets','候補バケットを構築中'),
        comparing: wiT('比较候选','Comparing candidates','候補を比較中'),
        persisting: wiT('保存证据','Saving evidence','エビデンスを保存中'),
        paused: wiT('已暂停','Paused','一時停止中')
    }[task.phase] || task.phase

    if (task.active) {
        const progress = Number(task.total || 0)
            ? ` ${Number(task.done || 0)}/${Number(task.total || 0)}`
            : ''
        status(
            `${phase}${progress} · ${wiT('候选','candidates','候補')} ${Number(task.candidateCount || 0)} · pair checks ${Number(task.pairChecks || 0)}`
        )
        return
    }
    if (task.state === 'failed') {
        status(
            wiT(
                `扫描失败：${task.error || 'unknown error'}`,
                `Scan failed: ${task.error || 'unknown error'}`,
                `スキャンに失敗しました：${task.error || 'unknown error'}`
            ),
            true
        )
        return
    }
    if (task.state === 'cancelled') {
        status(
            wiT(
                '扫描已取消；未完成结果没有写入新的证据批次。',
                'Scan cancelled; incomplete results were not committed as a new evidence batch.',
                'スキャンをキャンセルしました。未完了の結果は新しいエビデンスとして保存されていません。'
            )
        )
    }
}

async function reloadReviewAfterEvidenceRefresh() {
    const [review] = await Promise.all([
        request('/api/v1/recommendation-v5/work-identity/review?limit=300'),
        loadCatalog()
    ])
    IDENTITY.review = review
    renderReview()
}

async function watchEvidenceRefresh() {
    const generation = ++IDENTITY.scanPollGeneration
    while (generation === IDENTITY.scanPollGeneration) {
        let task
        try {
            task = await request(
                '/api/v1/recommendation-v5/work-identity/evidence/refresh/status'
            )
        } catch (error) {
            status(
                wiT(
                    `读取扫描状态失败：${error.message}`,
                    `Failed to read scan status: ${error.message}`,
                    `スキャン状態の取得に失敗しました：${error.message}`
                ),
                true
            )
            return
        }
        renderEvidenceTask(task)
        if (!task.active) {
            if (task.state === 'complete')
                await reloadReviewAfterEvidenceRefresh()
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
    }
}

async function reattachEvidenceRefresh() {
    try {
        const task = await request(
            '/api/v1/recommendation-v5/work-identity/evidence/refresh/status'
        )
        renderEvidenceTask(task)
        if (task.active) void watchEvidenceRefresh()
    } catch {
        // Status probing is read-only and must not make Settings unusable.
    }
}

async function controlEvidenceRefresh(action) {
    try {
        const task = await post(
            '/api/v1/recommendation-v5/work-identity/evidence/refresh/control',
            { action }
        )
        renderEvidenceTask(task)
        if (action === 'resume' && task.active) void watchEvidenceRefresh()
    } catch (error) {
        status(
            wiT(
                `扫描控制失败：${error.message}`,
                `Scan control failed: ${error.message}`,
                `スキャン制御に失敗しました：${error.message}`
            ),
            true
        )
    }
}

async function refreshEvidence() {
    if (IDENTITY.scanTask?.active) {
        void watchEvidenceRefresh()
        return
    }
    status(
        wiT(
            '正在启动身份证据后台扫描；不会自动绑定…',
            'Starting the identity-evidence background scan; nothing is bound automatically…',
            '作品IDエビデンスのバックグラウンドスキャンを開始しています。自動で紐付けることはありません…'
        )
    )
    try {
        const task = await post(
            '/api/v1/recommendation-v5/work-identity/evidence/refresh',
            { limit: 500 }
        )
        renderEvidenceTask(task)
        void watchEvidenceRefresh()
    } catch (error) {
        status(
            wiT(
                `扫描启动失败：${error.message}`,
                `Failed to start scan: ${error.message}`,
                `スキャンの開始に失敗しました：${error.message}`
            ),
            true
        )
    }
}

async function loadMaterializationPlan() {
    if (IDENTITY.busy) return
    IDENTITY.busy = true
    status(wiT('正在生成只读 Work / Edition / Upload 绑定计划…','Generating a read-only Work / Edition / Upload binding plan…','読み取り専用の Work / Edition / Upload 紐付け計画を生成中…'))
    try {
        IDENTITY.plan = await request(
            '/api/v1/recommendation-v5/work-identity/materialization-plan'
        )
        renderMaterializationPlan(IDENTITY.plan)
        const summary = IDENTITY.plan.summary || {}
        status(
            wiT(
                `Dry-run 完成：Work 组 ${Number(summary.workGroupCount || 0)}，完整可执行 ${Number(summary.fullBindingReadyCount || 0)}，阻断组 ${Number(summary.blockedGroupCount || 0)}。未写入任何 binding。`,
                `Dry-run complete: Work groups ${Number(summary.workGroupCount || 0)}, full-binding ready ${Number(summary.fullBindingReadyCount || 0)}, blocked groups ${Number(summary.blockedGroupCount || 0)}. No binding was written.`,
                `Dry-run 完了：Work グループ ${Number(summary.workGroupCount || 0)}、完全実行可能 ${Number(summary.fullBindingReadyCount || 0)}、ブロックグループ ${Number(summary.blockedGroupCount || 0)}。binding は一切書き込んでいません。`
            )
        )
    } catch (error) {
        status(wiT(`Dry-run 失败：${error.message}`,`Dry-run failed: ${error.message}`,`Dry-run に失敗しました：${error.message}`), true)
    } finally {
        IDENTITY.busy = false
    }
}

async function saveDecision(leftComicId, rightComicId, decision) {
    if (IDENTITY.busy) return
    IDENTITY.busy = true
    const labels = {
        SAME_WORK: wiT('同一作品','Same work','同一作品'),
        EDITION_VARIANT: wiT('不同版本','Different edition','別版'),
        KEEP_SEPARATE: wiT('保持分离','Keep separate','分離を維持'),
        CLEAR: wiT('清除裁决','Clear decision','裁定を解除')
    }
    status(wiT(`正在保存：${labels[decision] || decision}…`,`Saving: ${labels[decision] || decision}…`,`保存中：${labels[decision] || decision}…`))
    try {
        IDENTITY.review = await post(
            '/api/v1/recommendation-v5/work-identity/decision',
            {
                leftComicId,
                rightComicId,
                decision,
                limit: 300
            }
        )
        renderReview()
    } catch (error) {
        status(wiT(`保存失败：${error.message}`,`Save failed: ${error.message}`,`保存に失敗しました：${error.message}`), true)
    } finally {
        IDENTITY.busy = false
    }
}

ensurePanel()
document.addEventListener('pica-language-change', () => {
    document.querySelector('#v5-id-detail-dialog')?.remove()
    document.querySelector('#settings-work-identity-v5')?.remove()
    ensurePanel()
    if (IDENTITY.review) renderReview()
    if (IDENTITY.plan) renderMaterializationPlan(IDENTITY.plan)
})
