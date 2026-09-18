const IDENTITY = {
    review: null,
    plan: null,
    busy: false,
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
        SAME_WORK: '已确认：同一作品',
        EDITION_VARIANT: '已确认：不同版本',
        KEEP_SEPARATE: '已确认：保持分离'
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
                <h3>作品身份审计 · P2A Beta</h3>
                <p>检查不同 Provider / 重传记录是否可能属于同一作品。当前阶段不会自动创建 Work/Edition 绑定。</p>
            </div>
            <div class="v5-id-actions">
                <button id="v5-id-load" type="button">读取现有证据</button>
                <button id="v5-id-scan" type="button" class="primary">扫描身份证据</button>
                <button id="v5-id-plan-btn" type="button">生成 Dry-run 绑定计划</button>
            </div>
        </div>
        <div class="v5-id-note">
            <strong>当前权限：</strong>
            “同一作品”和“不同版本”只保存人工裁决，暂不改变 serving；
            “保持分离”会立即成为高权限去重保护，防止自动规则把两条上传折叠。
            所有裁决都可以清除。
        </div>
        <p id="v5-id-status" class="status">尚未主动扫描。已有证据也不会在后台自动扩充。</p>
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
    panel.querySelector('#v5-id-plan-btn').addEventListener('click', () => {
        void loadMaterializationPlan()
    })
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
        <strong>Work 物化预览</strong>
        <div>Work 组 ${Number(preview.workGroupCount || 0)} · 可进入后续绑定 ${Number(preview.readyGroupCount || 0)} · Upload 绑定候选 ${Number(preview.proposedUploadBindingCount || 0)} · 冲突 ${Number(preview.conflictCount || 0)}</div>
        <div class="status">仅预览，不写入 Work/Edition binding；存在“保持分离”冲突的组会被阻断。</div>
        ${visible.length ? `<div class="v5-id-preview-groups">${visible.map((group) => {
            const titles = Array.isArray(group.titles) ? group.titles.slice(0, 3).join(' / ') : ''
            const extra = Array.isArray(group.titles) && group.titles.length > 3
                ? ` +${group.titles.length - 3}`
                : ''
            const conflicts = Array.isArray(group.conflicts) ? group.conflicts.length : 0
            return `<div class="v5-id-preview-group ${conflicts ? 'conflict' : ''}">
                ${esc(titles)}${esc(extra)} · ${Number(group.comicIds?.length || 0)} uploads
                ${Number(group.editionVariantPairCount || 0) ? ` · edition variant ${Number(group.editionVariantPairCount || 0)}` : ''}
                ${conflicts ? ` · 冲突 ${conflicts}` : ' · 无冲突'}
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
        <strong>P2A-5 Dry-run 绑定计划</strong>
        <div>Work 组 ${Number(summary.workGroupCount || 0)} · Work 可绑定 ${Number(summary.workReadyCount || 0)} · 完整绑定可执行 ${Number(summary.fullBindingReadyCount || 0)} · 阻断组 ${Number(summary.blockedGroupCount || 0)}</div>
        <div>拟新建 Work ${Number(summary.createWorkCount || 0)} · 复用 Work ${Number(summary.reuseWorkCount || 0)} · Upload 变更 ${Number(summary.proposedUploadBindingCount || 0)} · 警告 ${Number(summary.warningCount || 0)} · 阻断项 ${Number(summary.blockerCount || 0)}</div>
        <div class="status">planVersion: ${esc(plan.planVersion || '')} · digest: ${esc(String(plan.planDigest || '').slice(0, 16))}… · writeEnabled=false。这里只计算执行与回滚计划，不写数据库。</div>
        ${groups.length ? `<div class="v5-id-plan-groups">${groups.slice(0, 12).map((group) => {
            const blockers = Array.isArray(group.blockers) ? group.blockers : []
            const warnings = Array.isArray(group.warnings) ? group.warnings : []
            const uploads = Array.isArray(group.uploadBindings) ? group.uploadBindings : []
            const editions = Array.isArray(group.editionPlans) ? group.editionPlans : []
            return `<div class="v5-id-plan-group ${blockers.length ? 'blocked' : ''}">
                <strong>${esc(group.preferredTitle || group.planWorkKey || 'Work')}</strong>
                <div>${Number(group.comicIds?.length || 0)} uploads · ${esc(group.workAction || '')} · ${group.readyForFullBinding ? '可完整执行' : group.readyForWorkBinding ? '仅 Work 层可执行' : '已阻断'}</div>
                <div>Edition clusters ${editions.length} · planned changes ${uploads.filter((item) => item.action !== 'NOOP').length}</div>
                ${blockers.length ? `<div>阻断：${esc(blockers.map((item) => item.type).join(' / '))}</div>` : ''}
                ${warnings.length ? `<div>警告：${esc(warnings.map((item) => item.type).join(' / '))}</div>` : ''}
            </div>`
        }).join('')}</div>` : '<p class="status">尚没有足够的人工裁决形成可物化 Work 组。</p>'}
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
    const author = comic.canonicalAuthor || comic.author || '未知作者'
    return `
        <div class="v5-id-comic">
            <img src="/api/v1/covers/${encodeURIComponent(comic.comicId)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <div class="v5-id-comic-copy">
                <strong>${esc(comic.title || comic.comicId)}</strong>
                <span class="status">${esc(author)} · ${esc(provider || comic.providerId || 'unknown')}</span>
                <span class="status">${esc(comic.comicId)}</span>
                <div class="v5-id-mini-actions">
                    <button type="button" data-v5-id-detail="${esc(comic.comicId)}">详情</button>
                    <button type="button" data-v5-id-read-online="${esc(comic.comicId)}">在线阅读</button>
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
    const author = comic.canonicalAuthor || comic.author || '未知作者'
    const tags = Array.isArray(comic.tags) ? comic.tags : []
    const categories = Array.isArray(comic.categories) ? comic.categories : []
    dialog.querySelector('.v5-id-detail-shell').innerHTML = `
        <div class="v5-id-detail-head">
            <div><h2>${esc(comic.title || comic.comicId)}</h2><p>${esc(author)} · ${esc(String(comic.providerId || '').toUpperCase())}</p></div>
            <button type="button" data-v5-id-detail-close>关闭</button>
        </div>
        <div class="v5-id-detail-main">
            <img src="/api/v1/covers/${encodeURIComponent(comic.comicId)}" alt="" onerror="this.style.visibility='hidden'">
            <div>
                <p>${esc(comic.description || '暂无简介')}</p>
                <p class="status">页数 ${Number(comic.pagesCount || comic.knownPictures || 0)} · 章节 ${Number(comic.epsCount || comic.knownEpisodes || 0)} · ${comic.finished ? '已完结' : '连载/未知'}</p>
                <div class="v5-id-detail-tags">
                    ${categories.slice(0,8).map((x)=>`<span class="tag">${esc(x)}</span>`).join('')}
                    ${tags.slice(0,18).map((x)=>`<span class="tag">${esc(x)}</span>`).join('')}
                </div>
                <div class="v5-id-detail-actions">
                    <button type="button" data-v5-id-detail-local="${esc(comic.comicId)}">本地阅读</button>
                    <button type="button" data-v5-id-detail-online="${esc(comic.comicId)}">在线阅读</button>
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
        `证据 ${Number(counts.evidence || rows.length)} · 人工裁决 ${Number(counts.decisions || 0)} · 待裁决 ${Number(review.undecidedCount || 0)} · Work binding ${Number(counts.bindings || 0)}`
    )
    if (!rows.length) {
        target.innerHTML =
            '<p class="status">当前没有已保存的高置信身份证据。可点击“扫描身份证据”。</p>'
        return
    }
    target.innerHTML = rows.slice(0, 80).map((item) => {
        const decision = item.decision?.decision || ''
        const evidence = item.evidence || {}
        const leftProvider = evidence.leftProvider || 'unknown'
        const rightProvider = evidence.rightProvider || 'unknown'
        const pages =
            evidence.leftPages || evidence.rightPages
                ? `${Number(evidence.leftPages || 0)} ↔ ${Number(evidence.rightPages || 0)} 页`
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
                <span>置信度 ${Number(item.confidence || 0).toFixed(2)}</span>
                <span>${evidence.titleMatch === 'STRICT' ? '标题严格一致' : '去噪标题一致'}</span>
                ${pages ? `<span>${esc(pages)}</span>` : ''}
                <span>${evidence.crossProvider ? '跨 Provider' : '同 Provider'}</span>
            </div>
            <div class="v5-id-decision">
                ${decision ? `<span class="v5-id-badge ${decisionClass(decision)}">${esc(decisionLabel(decision))}</span>` : '<span class="status">尚未人工裁决</span>'}
                <button type="button" data-v5-id-decision="SAME_WORK">同一作品</button>
                <button type="button" data-v5-id-decision="EDITION_VARIANT">不同版本</button>
                <button type="button" data-v5-id-decision="KEEP_SEPARATE">保持分离</button>
                ${decision ? '<button type="button" data-v5-id-decision="CLEAR">清除裁决</button>' : ''}
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
    status('正在读取已保存身份证据…')
    try {
        const [review] = await Promise.all([
            request('/api/v1/recommendation-v5/work-identity/review?limit=300'),
            loadCatalog()
        ])
        IDENTITY.review = review
        renderReview()
    } catch (error) {
        status(`读取失败：${error.message}`, true)
    } finally {
        IDENTITY.busy = false
    }
}

async function refreshEvidence() {
    if (IDENTITY.busy) return
    IDENTITY.busy = true
    status('正在扫描本地目录中的高置信同作品候选；不会自动绑定…')
    try {
        const result = await post(
            '/api/v1/recommendation-v5/work-identity/evidence/refresh',
            { limit: 500 }
        )
        status(
            `扫描完成：发现 ${Number(result.candidateCount || 0)} 对候选，其中跨 Provider ${Number(result.crossProviderCandidateCount || 0)} 对；Work binding 仍为 ${Number(result.storage?.counts?.bindings || 0)}。`
        )
        IDENTITY.review = await request(
            '/api/v1/recommendation-v5/work-identity/review?limit=300'
        )
        await loadCatalog()
        renderReview()
    } catch (error) {
        status(`扫描失败：${error.message}`, true)
    } finally {
        IDENTITY.busy = false
    }
}

async function loadMaterializationPlan() {
    if (IDENTITY.busy) return
    IDENTITY.busy = true
    status('正在生成只读 Work / Edition / Upload 绑定计划…')
    try {
        IDENTITY.plan = await request(
            '/api/v1/recommendation-v5/work-identity/materialization-plan'
        )
        renderMaterializationPlan(IDENTITY.plan)
        const summary = IDENTITY.plan.summary || {}
        status(
            `Dry-run 完成：Work 组 ${Number(summary.workGroupCount || 0)}，完整可执行 ${Number(summary.fullBindingReadyCount || 0)}，阻断组 ${Number(summary.blockedGroupCount || 0)}。未写入任何 binding。`
        )
    } catch (error) {
        status(`Dry-run 失败：${error.message}`, true)
    } finally {
        IDENTITY.busy = false
    }
}

async function saveDecision(leftComicId, rightComicId, decision) {
    if (IDENTITY.busy) return
    IDENTITY.busy = true
    const labels = {
        SAME_WORK: '同一作品',
        EDITION_VARIANT: '不同版本',
        KEEP_SEPARATE: '保持分离',
        CLEAR: '清除裁决'
    }
    status(`正在保存：${labels[decision] || decision}…`)
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
        status(`保存失败：${error.message}`, true)
    } finally {
        IDENTITY.busy = false
    }
}

ensurePanel()
document.addEventListener('pica-language-change', () => {
    ensurePanel()
    if (IDENTITY.review) renderReview()
})
