const IDENTITY = {
    review: null,
    busy: false
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
.v5-id-comic{min-width:0}.v5-id-comic strong{display:block;overflow:hidden;text-overflow:ellipsis}
.v5-id-arrow{opacity:.55;font-weight:700}
.v5-id-meta{display:flex;gap:8px;flex-wrap:wrap;font-size:.82rem;opacity:.76}
.v5-id-decision{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.v5-id-decision button{min-height:36px;padding:6px 10px}
.v5-id-badge{padding:4px 8px;border-radius:999px;background:var(--a83-accent-soft,#eef0ff);font-size:.78rem;font-weight:700}
.v5-id-badge.keep{color:#8a3e3e}.v5-id-badge.same{color:#2d6f46}.v5-id-badge.edition{color:#685391}
@media(max-width:760px){.v5-id-pair{grid-template-columns:1fr}.v5-id-arrow{display:none}}
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
            </div>
        </div>
        <div class="v5-id-note">
            <strong>当前权限：</strong>
            “同一作品”和“不同版本”只保存人工裁决，暂不改变 serving；
            “保持分离”会立即成为高权限去重保护，防止自动规则把两条上传折叠。
            所有裁决都可以清除。
        </div>
        <p id="v5-id-status" class="status">尚未主动扫描。已有证据也不会在后台自动扩充。</p>
        <div id="v5-id-list" class="v5-id-list"></div>
    `
    anchor.insertAdjacentElement('afterend', panel)
    panel.querySelector('#v5-id-load').addEventListener('click', () => {
        void loadReview()
    })
    panel.querySelector('#v5-id-scan').addEventListener('click', () => {
        void refreshEvidence()
    })
}

function status(message, bad = false) {
    const node = document.querySelector('#v5-id-status')
    if (!node) return
    node.textContent = message
    node.classList.toggle('error', Boolean(bad))
}

function renderReview() {
    ensurePanel()
    const target = document.querySelector('#v5-id-list')
    if (!target || !IDENTITY.review) return
    const review = IDENTITY.review
    const rows = Array.isArray(review.evidence) ? review.evidence : []
    const counts = review.storage?.counts || {}
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
        return `<article class="v5-id-row"
            data-left-id="${esc(item.leftComicId)}"
            data-right-id="${esc(item.rightComicId)}">
            <div class="v5-id-pair">
                <div class="v5-id-comic">
                    <strong>${esc(item.leftTitle || item.leftComicId)}</strong>
                    <span class="status">${esc(leftProvider)} · ${esc(item.leftComicId)}</span>
                </div>
                <span class="v5-id-arrow">↔</span>
                <div class="v5-id-comic">
                    <strong>${esc(item.rightTitle || item.rightComicId)}</strong>
                    <span class="status">${esc(rightProvider)} · ${esc(item.rightComicId)}</span>
                </div>
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
        IDENTITY.review = await request(
            '/api/v1/recommendation-v5/work-identity/review?limit=300'
        )
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
        renderReview()
    } catch (error) {
        status(`扫描失败：${error.message}`, true)
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
