const EVAL = {
    summary: null,
    runs: [],
    versions: [],
    comparison: null,
    baselineVersion: '',
    candidateVersion: '',
    advancedGate: null,
    advancedDirection: 'LEARNING_TO_RANK',
    busy: false,
    runningShadow: false,
    comparing: false,
    evaluatingAdvanced: false
}

const evalEsc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[ch])

async function evalRequest(path, options = {}) {
    const response = await fetch(path, {
        cache: 'no-store',
        ...options
    })
    const value = await response.json().catch(() => ({}))
    if (!response.ok)
        throw new Error(value?.error || `HTTP ${response.status}`)
    return value
}

async function evalDesktopPost(path, body) {
    const status = await evalRequest('/api/v1/desktop/status')
    return evalRequest(path, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': status.csrfToken || ''
        },
        body: JSON.stringify(body)
    })
}

function evalEnsureStyles() {
    if (document.querySelector('#v5-eval-style')) return
    const style = document.createElement('style')
    style.id = 'v5-eval-style'
    style.textContent = `
#settings-recommendation-v5-evaluation{margin-top:18px;overflow:hidden}
.v5-eval-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.v5-eval-actions{display:flex;gap:8px;flex-wrap:wrap}
.v5-eval-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:12px}
.v5-eval-card{border:1px solid var(--a83-line,#ddd7e4);border-radius:14px;padding:12px;background:var(--a83-surface,#fff)}
.v5-eval-card h4{margin:0 0 8px;font-size:.92rem}
.v5-eval-value{font-size:1.3rem;font-weight:750;line-height:1.15}
.v5-eval-meta{font-size:.8rem;line-height:1.5;color:var(--a83-muted,#68636e);margin-top:5px}
.v5-eval-badge{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:.76rem;font-weight:700}
.v5-eval-badge.pass{background:#e8f6ed;color:#20643a}
.v5-eval-badge.fail{background:#fdeceb;color:#8a2f2c}
.v5-eval-badge.insufficient{background:#fff5d9;color:#735c12}
.v5-eval-badge.neutral{background:var(--a83-accent-soft,#eee7fa);color:inherit}
.v5-eval-section{margin-top:14px}
.v5-eval-criteria{display:grid;gap:7px}
.v5-eval-criterion{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 10px;border:1px solid var(--a83-line,#ddd7e4);border-radius:10px}
.v5-eval-criterion code{font-size:.72rem;overflow:hidden;text-overflow:ellipsis}
.v5-eval-runs{display:grid;gap:7px;max-height:340px;overflow:auto}
.v5-eval-run{display:grid;grid-template-columns:minmax(0,1.4fr) repeat(3,minmax(70px,.5fr));gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--a83-line,#ddd7e4);font-size:.82rem}
.v5-eval-run .mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.72rem;overflow:hidden;text-overflow:ellipsis}
.v5-eval-note{margin-top:10px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--a83-accent-soft,#eee7fa) 62%,transparent);line-height:1.55}
.v5-eval-user-note{margin:12px 0 4px;padding:12px 14px;border-radius:12px;background:#f7f8fc;color:#596071;line-height:1.65}
.v5-eval-technical{margin-top:14px;border:1px solid var(--a83-line,#ddd7e4);border-radius:14px;background:#fafbfe}
.v5-eval-technical>summary{padding:12px 14px;cursor:pointer;font-weight:750;color:#596071;list-style:none}
.v5-eval-technical>summary::-webkit-details-marker{display:none}
.v5-eval-technical>summary::after{content:'展开';float:right;color:#6a72c8;font-size:.82rem}
.v5-eval-technical[open]>summary::after{content:'收起'}
.v5-eval-technical-body{padding:0 12px 12px}
.v5-eval-run details{margin-top:5px}
.v5-eval-run code{white-space:normal;overflow-wrap:anywhere}
.v5-eval-compare-controls{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto;gap:8px;align-items:end}
.v5-eval-compare-controls label{display:grid;gap:5px;font-size:.8rem}
.v5-eval-compare-controls select{min-width:0}
.v5-eval-delta{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.82rem}
.v5-eval-delta.positive{color:#20643a}.v5-eval-delta.negative{color:#8a2f2c}
@media(max-width:720px){.v5-eval-compare-controls{grid-template-columns:1fr}.v5-eval-run{grid-template-columns:1fr 1fr}.v5-eval-run .mono{grid-column:1/-1}}
`
    document.head.appendChild(style)
}

function evalPanelAnchor() {
    return (
        document.querySelector('#settings-work-identity-v5') ||
        document.querySelector('#settings-recommendation-v5') ||
        document.querySelector('#settings-recommendation-v4')
    )
}

function evalEnsurePanel() {
    evalEnsureStyles()
    if (document.querySelector('#settings-recommendation-v5-evaluation'))
        return true
    const anchor = evalPanelAnchor()
    if (!anchor) return false
    const panel = document.createElement('article')
    panel.id = 'settings-recommendation-v5-evaluation'
    panel.className = 'panel'
    panel.innerHTML = `
      <div class="v5-eval-head">
        <div>
          <h3>推荐系统评估 · V5 Development</h3>
          <p>“影子推荐（Shadow）”= 让新算法在后台模拟推荐一次，但不替换你现在看到的正式推荐。这里只记录它会召回、排序和选出哪些作品，用于后续比较新旧算法。</p>
        </div>
        <div class="v5-eval-actions">
          <button id="v5-eval-refresh" type="button">刷新评估</button>
          <button id="v5-eval-run-shadow" type="button">运行一次影子推荐</button>
        </div>
      </div>
      <p id="v5-eval-status" class="status">尚未读取评估数据。</p>
      <div id="v5-eval-summary"></div>
      <div id="v5-eval-runs" class="v5-eval-section"></div>
      <details class="v5-eval-technical">
        <summary>高级评估详情</summary>
        <div class="v5-eval-technical-body">
          <div id="v5-eval-technical-summary"></div>
          <div id="v5-eval-criteria" class="v5-eval-section"></div>
          <div id="v5-eval-comparison" class="v5-eval-section"></div>
          <div id="v5-eval-advanced" class="v5-eval-section"></div>
        </div>
      </details>
    `
    anchor.insertAdjacentElement('afterend', panel)
    panel.querySelector('#v5-eval-refresh').onclick = () => {
        void evalLoad(true)
    }
    panel.querySelector('#v5-eval-run-shadow').onclick = () => {
        void evalRunShadow()
    }
    return true
}

function evalStatus(message, bad = false) {
    const node = document.querySelector('#v5-eval-status')
    if (!node) return
    node.textContent = message
    node.classList.toggle('error', Boolean(bad))
}

function evalFmt(value, digits = 3) {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric.toFixed(digits) : '—'
}

function evalPct(value) {
    const numeric = Number(value)
    return Number.isFinite(numeric)
        ? `${(numeric * 100).toFixed(1)}%`
        : '—'
}

function evalBadge(status) {
    const value = String(status || 'UNKNOWN').toUpperCase()
    const className =
        value === 'PASS' ||
        value.includes('READY')
            ? 'pass'
            : value === 'FAIL' || value === 'NOT_READY'
              ? 'fail'
              : value === 'INSUFFICIENT' ||
                  value.includes('BUILDING')
                ? 'insufficient'
                : 'neutral'
    return `<span class="v5-eval-badge ${className}">${evalEsc(value)}</span>`
}

function evalMetricCard(title, value, meta = '') {
    return `<div class="v5-eval-card">
      <h4>${evalEsc(title)}</h4>
      <div class="v5-eval-value">${value}</div>
      ${meta ? `<div class="v5-eval-meta">${meta}</div>` : ''}
    </div>`
}

function evalRenderSummary() {
    const target = document.querySelector('#v5-eval-summary')
    const technicalTarget = document.querySelector(
        '#v5-eval-technical-summary'
    )
    if (!target || !technicalTarget || !EVAL.summary) return
    const summary = EVAL.summary
    const retrospective = summary.sections?.retrospective || {}
    const p3 = summary.sections?.p3EngineeringGate || {}
    const visual = summary.sections?.visualActivationGate || {}
    const steer = summary.sections?.steerability || {}
    const ranked = retrospective.accuracy?.ranked || {}
    const batch = retrospective.accuracy?.diversifiedBatch || {}
    const diversity = retrospective.diversity || {}
    const support = retrospective.support || {}
    const correctness = retrospective.correctness || {}
    const decisions = summary.decisions || {}
    const exactRuns = Number(support.exactRunCount || 0)
    const evaluableRuns = Number(support.evaluableRunCount || 0)
    const matureRuns = Number(support.matureRunCount || 0)
    const immatureRuns = Number(support.immatureRunCount || 0)
    const correctnessPass =
        Number(correctness.totalRankedLeakage || 0) === 0 &&
        Number(correctness.totalBatchLeakage || 0) === 0
    const accuracyAvailable = evaluableRuns > 0

    target.innerHTML = `
      <div class="v5-eval-grid">
        ${evalMetricCard(
            '基础测试进度',
            `<strong>${Math.min(exactRuns, 3)}/3</strong>`,
            exactRuns >= 3
                ? '基础影子推荐轮次已经够用'
                : '隔一段时间再运行一次即可，不要连续重复点击'
        )}
        ${evalMetricCard(
            '安全检查',
            correctnessPass ? evalBadge('PASS') : evalBadge('FAIL'),
            correctnessPass
                ? '没有把已拥有 / 已看过 / 硬屏蔽等内容漏进测试批次'
                : '发现过滤泄漏，需要先修复'
        )}
        ${evalMetricCard(
            '后续真实行为',
            evaluableRuns
                ? `<strong>${evaluableRuns}/3</strong>`
                : '<strong>等待积累</strong>',
            evaluableRuns
                ? `成熟观察窗 ${matureRuns} · 已观察到 ${Number(support.maturePositiveEventCountAcrossWindows || 0)} 个成熟正向行为`
                : `成熟观察窗 ${matureRuns} · 仍在观察 ${immatureRuns} 轮；继续正常使用即可`
        )}
        ${evalMetricCard(
            '正式推荐',
            '<strong>未改变</strong>',
            '影子推荐只在后台模拟，不会替换你现在看到的正式推荐'
        )}
      </div>
      <div class="v5-eval-user-note">
        <strong>你现在需要做的事：</strong>
        正常使用软件即可。隔一段时间再运行一次影子推荐；系统会自动记录后续真实收藏、Like 和阅读结果。30 天观察窗走完整之前只显示为“正在积累”，不会提前计算正式准确率。
      </div>
    `

    technicalTarget.innerHTML = `
      <div class="v5-eval-grid">
        ${evalMetricCard(
            'P5 基线状态',
            evalBadge(summary.status),
            `framework ${evalEsc(summary.frameworkVersion || '')}`
        )}
        ${evalMetricCard(
            'P3 工程 Gate',
            evalBadge(p3.verdict),
            `exact shadow runs ${exactRuns}`
        )}
        ${evalMetricCard(
            'P4 Visual Gate',
            evalBadge(visual.verdict),
            'Visual 仍不自动激活'
        )}
        ${evalMetricCard(
            'Batch Precision@12',
            accuracyAvailable ? evalPct(batch.precision12) : '等待数据',
            accuracyAvailable
                ? `Ranked P@12 ${evalPct(ranked.precision12)}`
                : '没有成熟 future-outcome 时不把 0% 解释成模型失败'
        )}
        ${evalMetricCard(
            'Batch Recall@12',
            accuracyAvailable ? evalPct(batch.recall12) : '等待数据',
            accuracyAvailable
                ? `Ranked R@12 ${evalPct(ranked.recall12)}`
                : ''
        )}
        ${evalMetricCard(
            'Batch NDCG@12',
            accuracyAvailable ? evalFmt(batch.ndcg12) : '等待数据',
            accuracyAvailable
                ? `Hit@12 ${evalPct(batch.hit12)} · MRR ${evalFmt(batch.mrr)}`
                : ''
        )}
        ${evalMetricCard(
            '作者最大集中度',
            evalPct(diversity.medianAuthorMaxShare),
            `IP ${evalPct(diversity.medianFandomMaxShare)} · Tag ${evalPct(diversity.medianTagMaxShare)}`
        )}
        ${evalMetricCard(
            'Catalog Coverage',
            evalPct(diversity.itemCoverage?.coverage),
            `${Number(diversity.itemCoverage?.distinctRecommendedItems || 0)} distinct / ${Number(diversity.itemCoverage?.catalogSize || 0)} catalog`
        )}
        ${evalMetricCard(
            'Steerability',
            steer.summary?.passRate === null ||
            steer.summary?.passRate === undefined
                ? '等待数据'
                : evalPct(steer.summary.passRate),
            `two-sided targets ${Number(steer.summary?.twoSidedTestableCount || 0)}`
        )}
        ${evalMetricCard(
            '高级学习',
            evalBadge('DEFERRED'),
            `LTR=${Boolean(decisions.learningToRank)} · Bandit=${Boolean(decisions.contextualBandit)} · Active=${Boolean(decisions.activeLearning)}`
        )}
      </div>
      <div class="v5-eval-note">
        当前评估只使用 exact current shadow modelVersion 和后续真实行为证据。
        ${retrospective.discovery?.serendipity === 'NOT_YET_IDENTIFIABLE_WITH_CURRENT_LOGS'
            ? 'Serendipity / long-tail 仍缺可靠日志定义，因此不会补造指标。'
            : ''}
        Advanced Learning 保持 ${evalEsc(decisions.advancedLearning || 'DEFERRED')}。
      </div>
    `
}

function evalRenderCriteria() {
    const target = document.querySelector('#v5-eval-criteria')
    if (!target || !EVAL.summary) return
    const criteria = Array.isArray(EVAL.summary.criteria)
        ? EVAL.summary.criteria
        : []
    const labels = {
        EXACT_SHADOW_RUN_SUPPORT: '重复测试轮次',
        CORRECTNESS_AUDIT_SUPPORT: '安全审计轮次',
        FUTURE_OUTCOME_SUPPORT: '后续真实行为支持',
        STEERABILITY_TARGET_SUPPORT: '偏好控制测试样本',
        STEERABILITY_MONOTONICITY: '偏好控制方向一致性',
        P3_SHADOW_ENGINEERING_GATE: '新算法工程稳定性'
    }
    target.innerHTML = `
      <h4>固定 Gate 条件（开发者）</h4>
      <div class="v5-eval-criteria">
        ${criteria.map((item) => `
          <div class="v5-eval-criterion">
            ${evalBadge(item.status)}
            <div>
              <strong>${evalEsc(labels[item.id] || item.id)}</strong>
              <div class="v5-eval-meta"><code>${evalEsc(item.id)}</code> · ${evalEsc(item.note || '')}</div>
            </div>
            <code>${evalEsc(String(item.actual ?? '—'))} / ${evalEsc(item.threshold || '')}</code>
          </div>
        `).join('') || '<p class="status">当前没有可用 Gate 条件。</p>'}
      </div>
    `
}

function evalDeltaMarkup(value, higherIsBetter = true) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return '<span class="v5-eval-delta">—</span>'
    const favorable = higherIsBetter ? numeric > 0 : numeric < 0
    const unfavorable = higherIsBetter ? numeric < 0 : numeric > 0
    const className = favorable
        ? 'positive'
        : unfavorable
          ? 'negative'
          : ''
    const sign = numeric > 0 ? '+' : ''
    return `<span class="v5-eval-delta ${className}">${sign}${numeric.toFixed(4)}</span>`
}

function evalVersionOptions(selected) {
    return EVAL.versions
        .map((item) => {
            const label = `${item.current ? '[current] ' : ''}${item.modelVersion} · runs ${Number(item.runCount || 0)}`
            return `<option value="${evalEsc(item.modelVersion)}" ${item.modelVersion === selected ? 'selected' : ''}>${evalEsc(label)}</option>`
        })
        .join('')
}

function evalRenderComparison() {
    const target = document.querySelector('#v5-eval-comparison')
    if (!target) return
    if (EVAL.versions.length < 2) {
        target.innerHTML = `
          <h4>Model Version Comparison（开发者）</h4>
          <p class="status">至少需要两个不同的 shadow modelVersion 才能做固定基线比较；当前只有 ${EVAL.versions.length} 个。</p>
        `
        return
    }
    const comparison = EVAL.comparison
    const metrics = comparison?.accuracy?.diversifiedBatch || {}
    const diversity = comparison?.diversity || {}
    target.innerHTML = `
      <h4>Model Version Comparison（开发者）</h4>
      <div class="v5-eval-compare-controls">
        <label>Baseline
          <select id="v5-eval-baseline-version">${evalVersionOptions(EVAL.baselineVersion)}</select>
        </label>
        <span>→</span>
        <label>Candidate
          <select id="v5-eval-candidate-version">${evalVersionOptions(EVAL.candidateVersion)}</select>
        </label>
        <button id="v5-eval-compare-btn" type="button">比较版本</button>
      </div>
      ${comparison ? `
        <div class="v5-eval-grid">
          ${evalMetricCard('Comparison', evalBadge(comparison.status), '不会自动选择 winner')}
          ${evalMetricCard('Δ Precision@12', evalDeltaMarkup(metrics.precision12?.delta, true), 'candidate − baseline')}
          ${evalMetricCard('Δ Recall@12', evalDeltaMarkup(metrics.recall12?.delta, true), 'candidate − baseline')}
          ${evalMetricCard('Δ NDCG@12', evalDeltaMarkup(metrics.ndcg12?.delta, true), 'candidate − baseline')}
          ${evalMetricCard('Δ Hit@12', evalDeltaMarkup(metrics.hit12?.delta, true), 'candidate − baseline')}
          ${evalMetricCard('Δ MRR', evalDeltaMarkup(metrics.mrr?.delta, true), 'candidate − baseline')}
          ${evalMetricCard('Δ Author concentration', evalDeltaMarkup(diversity.authorMaxShare?.delta, false), 'lower is better')}
          ${evalMetricCard('Δ Catalog coverage', evalDeltaMarkup(diversity.itemCoverage?.delta, true), 'higher is better')}
        </div>
        <div class="v5-eval-note">
          baseline: <code>${evalEsc(comparison.baseline?.modelVersion || '')}</code><br>
          candidate: <code>${evalEsc(comparison.candidate?.modelVersion || '')}</code><br>
          winner = null；这里只报告同口径描述性差值，不自动 promotion，不开启 LTR/Bandit/Active Learning。
        </div>
      ` : '<p class="status">选择两个版本后点击“比较版本”。</p>'}
    `
    const baseline = target.querySelector('#v5-eval-baseline-version')
    const candidate = target.querySelector('#v5-eval-candidate-version')
    const button = target.querySelector('#v5-eval-compare-btn')
    if (baseline)
        baseline.onchange = () => {
            EVAL.baselineVersion = baseline.value
            EVAL.comparison = null
            EVAL.advancedGate = null
            evalRenderComparison()
            evalRenderAdvancedLearning()
        }
    if (candidate)
        candidate.onchange = () => {
            EVAL.candidateVersion = candidate.value
            EVAL.comparison = null
            EVAL.advancedGate = null
            evalRenderComparison()
            evalRenderAdvancedLearning()
        }
    if (button) button.onclick = () => void evalCompareSelected()
}

async function evalCompareSelected() {
    if (EVAL.comparing) return
    if (!EVAL.baselineVersion || !EVAL.candidateVersion) return
    if (EVAL.baselineVersion === EVAL.candidateVersion) {
        evalStatus('Baseline 与 Candidate 必须是两个不同的 modelVersion。', true)
        return
    }
    EVAL.comparing = true
    evalStatus('正在按同一 future-outcome benchmark 比较两个 exact modelVersion…')
    try {
        const params = new URLSearchParams({
            baselineVersion: EVAL.baselineVersion,
            candidateVersion: EVAL.candidateVersion,
            limit: '1000',
            horizonDays: '30'
        })
        EVAL.comparison = await evalRequest(
            `/api/v1/desktop/recommendation-v5/evaluation/compare?${params.toString()}`
        )
        EVAL.advancedGate = null
        evalRenderComparison()
        evalRenderAdvancedLearning()
        evalStatus(
            `版本比较完成：${EVAL.comparison.status || 'UNKNOWN'}。不会自动选择 winner 或改变 serving。`
        )
    } catch (error) {
        evalStatus(`版本比较失败：${error.message}`, true)
    } finally {
        EVAL.comparing = false
    }
}

function evalRenderAdvancedLearning() {
    const target = document.querySelector('#v5-eval-advanced')
    if (!target) return
    const gate = EVAL.advancedGate
    const missing = Array.isArray(gate?.missingRequirements)
        ? gate.missingRequirements
        : []
    target.innerHTML = `
      <h4>Advanced Learning Decision Gate（开发者）</h4>
      <div class="v5-eval-compare-controls">
        <label>方向
          <select id="v5-eval-advanced-direction">
            <option value="LEARNING_TO_RANK" ${EVAL.advancedDirection === 'LEARNING_TO_RANK' ? 'selected' : ''}>Learning-to-Rank</option>
            <option value="CONTEXTUAL_BANDIT" ${EVAL.advancedDirection === 'CONTEXTUAL_BANDIT' ? 'selected' : ''}>Contextual Bandit</option>
            <option value="ACTIVE_LEARNING" ${EVAL.advancedDirection === 'ACTIVE_LEARNING' ? 'selected' : ''}>Active Learning</option>
          </select>
        </label>
        <span></span>
        <div class="v5-eval-meta">
          LTR 使用当前 baseline/candidate 比较；Bandit 需要 propensity/randomized assignment；Active Learning 需要 uncertainty/query-value 日志。
        </div>
        <button id="v5-eval-advanced-btn" type="button">评估实验门槛</button>
      </div>
      ${gate ? `
        <div class="v5-eval-grid">
          ${evalMetricCard('Verdict', evalBadge(gate.verdict), `direction ${evalEsc(gate.selectedDirection || 'none')}`)}
          ${evalMetricCard('Baseline ready', evalBadge(gate.baselineReady ? 'PASS' : 'INSUFFICIENT'), evalEsc(gate.evidence?.evaluationStatus || ''))}
          ${evalMetricCard('Comparison ready', evalBadge(gate.comparisonReady ? 'PASS' : 'INSUFFICIENT'), evalEsc(gate.evidence?.comparisonStatus || 'not supplied'))}
          ${evalMetricCard('Design ready', evalBadge(gate.designReady ? 'PASS' : 'INSUFFICIENT'), evalEsc(gate.nextStage || ''))}
        </div>
        <div class="v5-eval-note">
          trainingEnabled=${String(Boolean(gate.trainingEnabled))} · servingMutationEnabled=${String(Boolean(gate.servingMutationEnabled))} · autoModelSelection=${String(Boolean(gate.autoModelSelection))}<br>
          ${missing.length ? `缺失条件：${evalEsc(missing.join(' / '))}` : '当前只允许进入离线实验设计；仍不授权训练或 serving mutation。'}
        </div>
      ` : '<p class="status">选择方向后点击“评估实验门槛”。不会自动训练或上线。</p>'}
    `
    const select = target.querySelector('#v5-eval-advanced-direction')
    const button = target.querySelector('#v5-eval-advanced-btn')
    if (select)
        select.onchange = () => {
            EVAL.advancedDirection = select.value
            EVAL.advancedGate = null
            evalRenderAdvancedLearning()
        }
    if (button)
        button.onclick = () => void evalEvaluateAdvancedLearning()
}

async function evalEvaluateAdvancedLearning() {
    if (EVAL.evaluatingAdvanced) return
    EVAL.evaluatingAdvanced = true
    evalStatus('正在评估高级学习实验门槛；不会训练模型或改变 serving…')
    try {
        const params = new URLSearchParams({
            direction: EVAL.advancedDirection,
            limit: '1000',
            horizonDays: '30'
        })
        if (
            EVAL.baselineVersion &&
            EVAL.candidateVersion &&
            EVAL.baselineVersion !== EVAL.candidateVersion
        ) {
            params.set('baselineVersion', EVAL.baselineVersion)
            params.set('candidateVersion', EVAL.candidateVersion)
        }
        EVAL.advancedGate = await evalRequest(
            `/api/v1/desktop/recommendation-v5/evaluation/advanced-learning-gate?${params.toString()}`
        )
        evalRenderAdvancedLearning()
        evalStatus(
            `高级学习门槛：${EVAL.advancedGate.verdict || 'UNKNOWN'}。trainingEnabled=false，servingMutationEnabled=false。`
        )
    } catch (error) {
        evalStatus(`高级学习门槛评估失败：${error.message}`, true)
    } finally {
        EVAL.evaluatingAdvanced = false
    }
}

function evalRenderRuns() {
    const target = document.querySelector('#v5-eval-runs')
    if (!target) return
    const rows = EVAL.runs.slice(0, 12)
    const readinessLabel = (value) => {
        const status = String(value || '')
        if (status === 'READY') return '完成'
        if (status === 'READY_DEGRADED') return '完成（部分来源降级）'
        return status || '—'
    }
    target.innerHTML = `
      <h4>最近影子推荐</h4>
      <div class="v5-eval-runs">
        ${rows.map((run, index) => {
            const telemetry = run.telemetry || {}
            const mode = telemetry.sessionMode || 'DEFAULT'
            const readiness = telemetry.readiness || ''
            const ranked = Number(
                telemetry.rankedCandidateCount || run.candidateCount || 0
            )
            const batch = Array.isArray(telemetry.diversifiedBatch)
                ? telemetry.diversifiedBatch.length
                : 0
            return `
              <div class="v5-eval-run">
                <div>
                  <strong>#${index + 1} · ${evalEsc(mode)}</strong>
                  <div class="v5-eval-meta">${evalEsc(new Date(run.generatedAt).toLocaleString())}</div>
                  <details>
                    <summary>版本信息</summary>
                    <code>${evalEsc(run.modelVersion)}</code>
                  </details>
                </div>
                <span>${evalEsc(readinessLabel(readiness))}</span>
                <span>排序 ${ranked}</span>
                <span>最终 ${batch}</span>
              </div>
            `
        }).join('') || '<p class="status">还没有影子推荐记录。隔一段时间运行一次即可；不会改变正式推荐。</p>'}
      </div>
    `
}

async function evalLoad(force = false) {
    if (EVAL.busy && !force) return
    EVAL.busy = true
    evalEnsurePanel()
    evalStatus('正在读取 P3 / P4 / P5 评估数据…')
    try {
        const [summary, runData, versionData] = await Promise.all([
            evalRequest(
                '/api/v1/desktop/recommendation-v5/evaluation/summary?limit=200&horizonDays=30&steerabilityStep=3&steerabilityTargetLimit=30'
            ),
            evalRequest(
                '/api/v1/desktop/recommendation-v5/shadow-runs?limit=50'
            ),
            evalRequest(
                '/api/v1/desktop/recommendation-v5/evaluation/versions?limit=1000'
            )
        ])
        EVAL.summary = summary
        EVAL.runs = Array.isArray(runData.runs)
            ? runData.runs
            : []
        EVAL.versions = Array.isArray(versionData.versions)
            ? versionData.versions
            : []
        const currentVersion = versionData.currentModelVersion || ''
        if (!EVAL.candidateVersion || !EVAL.versions.some((item) => item.modelVersion === EVAL.candidateVersion))
            EVAL.candidateVersion =
                EVAL.versions.find((item) => item.modelVersion === currentVersion)?.modelVersion ||
                EVAL.versions[0]?.modelVersion ||
                ''
        if (!EVAL.baselineVersion || !EVAL.versions.some((item) => item.modelVersion === EVAL.baselineVersion))
            EVAL.baselineVersion =
                EVAL.versions.find((item) => item.modelVersion !== EVAL.candidateVersion)?.modelVersion ||
                EVAL.candidateVersion
        evalRenderSummary()
        evalRenderCriteria()
        evalRenderComparison()
        evalRenderAdvancedLearning()
        evalRenderRuns()
        const support = summary.sections?.retrospective?.support || {}
        evalStatus(
            `评估已刷新：基础影子推荐 ${Number(support.exactRunCount || 0)}/3；成熟观察窗 ${Number(support.matureRunCount || 0)}，可评估记录 ${Number(support.evaluableRunCount || 0)}/3。正式推荐未改变。`
        )
    } catch (error) {
        evalStatus(`评估读取失败：${error.message}`, true)
    } finally {
        EVAL.busy = false
    }
}

async function evalRunShadow() {
    if (EVAL.runningShadow) return
    EVAL.runningShadow = true
    const button = document.querySelector('#v5-eval-run-shadow')
    if (button) button.disabled = true
    evalStatus(
        '正在后台模拟一次新算法推荐：不会改变当前正式推荐。正在召回候选、排序并生成 12 本测试批次…'
    )
    try {
        const result = await evalDesktopPost(
            '/api/v1/desktop/recommendation-v5/shadow-retrieval',
            {
                confirmation:
                    'RUN_RECOMMENDATION_V5_SHADOW_RETRIEVAL',
                limit: 5000,
                maxCandidates: 500,
                batchSize: 12,
                visualAnalysisBudget: 24
            }
        )
        const audit = result.audit || {}
        evalStatus(
            `影子推荐完成：原始候选 ${Number(result.rawCandidateCount || 0)} → 清洗后 ${Number(result.candidateCount || 0)} → 排序 ${Number(result.ranking?.candidateCount || 0)} → 最终测试批次 ${Number(result.diversity?.selectedCount || 0)}。正式推荐未改变。正在刷新评估…`
        )
        await evalLoad(true)
    } catch (error) {
        evalStatus(`Shadow run 失败：${error.message}`, true)
    } finally {
        EVAL.runningShadow = false
        if (button) button.disabled = false
    }
}

function evalInstall() {
    if (!evalEnsurePanel()) return
    evalStatus('评估尚未运行。点击“刷新评估”后才会读取 P3 / P4 / P5 数据；打开设置页不会自动执行重计算。')
}

evalInstall()
document.addEventListener('pica-language-change', () => {
    evalEnsurePanel()
    if (EVAL.summary) {
        evalRenderSummary()
        evalRenderCriteria()
        evalRenderComparison()
        evalRenderAdvancedLearning()
        evalRenderRuns()
    }
})
