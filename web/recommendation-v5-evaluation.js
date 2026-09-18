const EVAL = {
    summary: null,
    runs: [],
    busy: false,
    runningShadow: false
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
@media(max-width:720px){.v5-eval-run{grid-template-columns:1fr 1fr}.v5-eval-run .mono{grid-column:1/-1}}
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
          <p>汇总当前 shadow pipeline 的工程、准确性、多样性、控制性和 Visual readiness。这里只读评估，不会自动切换正式推荐算法。</p>
        </div>
        <div class="v5-eval-actions">
          <button id="v5-eval-refresh" type="button">刷新评估</button>
          <button id="v5-eval-run-shadow" type="button">运行一次 Shadow Benchmark</button>
        </div>
      </div>
      <p id="v5-eval-status" class="status">尚未读取评估数据。</p>
      <div id="v5-eval-summary"></div>
      <div id="v5-eval-criteria" class="v5-eval-section"></div>
      <div id="v5-eval-runs" class="v5-eval-section"></div>
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
    if (!target || !EVAL.summary) return
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

    target.innerHTML = `
      <div class="v5-eval-grid">
        ${evalMetricCard(
            'P5 基线状态',
            evalBadge(summary.status),
            `framework ${evalEsc(summary.frameworkVersion || '')}`
        )}
        ${evalMetricCard(
            'P3 工程 Gate',
            evalBadge(p3.verdict),
            `exact shadow runs ${Number(support.exactRunCount || 0)}`
        )}
        ${evalMetricCard(
            'P4 Visual Gate',
            evalBadge(visual.verdict),
            '仅允许进入人工 Shadow review，不自动激活'
        )}
        ${evalMetricCard(
            '未来行为可评估 Runs',
            String(Number(support.evaluableRunCount || 0)),
            `future positives ${Number(support.positiveEventCountAcrossWindows || 0)}`
        )}
        ${evalMetricCard(
            'Batch Precision@12',
            evalPct(batch.precision12),
            `Ranked P@12 ${evalPct(ranked.precision12)}`
        )}
        ${evalMetricCard(
            'Batch Recall@12',
            evalPct(batch.recall12),
            `Ranked R@12 ${evalPct(ranked.recall12)}`
        )}
        ${evalMetricCard(
            'Batch NDCG@12',
            evalFmt(batch.ndcg12),
            `Hit@12 ${evalPct(batch.hit12)} · MRR ${evalFmt(batch.mrr)}`
        )}
        ${evalMetricCard(
            'Correctness',
            correctness.totalRankedLeakage === 0 &&
            correctness.totalBatchLeakage === 0
                ? evalBadge('PASS')
                : evalBadge('FAIL'),
            `ranked leakage ${Number(correctness.totalRankedLeakage || 0)} · batch leakage ${Number(correctness.totalBatchLeakage || 0)}`
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
                ? '—'
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
    target.innerHTML = `
      <h4>固定 Gate 条件</h4>
      <div class="v5-eval-criteria">
        ${criteria.map((item) => `
          <div class="v5-eval-criterion">
            ${evalBadge(item.status)}
            <div>
              <strong>${evalEsc(item.id)}</strong>
              <div class="v5-eval-meta">${evalEsc(item.note || '')}</div>
            </div>
            <code>${evalEsc(String(item.actual ?? '—'))} / ${evalEsc(item.threshold || '')}</code>
          </div>
        `).join('') || '<p class="status">当前没有可用 Gate 条件。</p>'}
      </div>
    `
}

function evalRenderRuns() {
    const target = document.querySelector('#v5-eval-runs')
    if (!target) return
    const rows = EVAL.runs.slice(0, 30)
    target.innerHTML = `
      <h4>最近 Shadow Runs</h4>
      <div class="v5-eval-runs">
        ${rows.map((run) => {
            const telemetry = run.telemetry || {}
            const mode = telemetry.sessionMode || 'UNKNOWN'
            const readiness = telemetry.readiness || ''
            const ranked = Number(telemetry.rankedCandidateCount || run.candidateCount || 0)
            const batch = Array.isArray(telemetry.diversifiedBatch)
                ? telemetry.diversifiedBatch.length
                : 0
            return `
              <div class="v5-eval-run">
                <div>
                  <strong>${evalEsc(mode)}</strong>
                  <div class="mono" title="${evalEsc(run.modelVersion)}">${evalEsc(run.modelVersion)}</div>
                  <div class="v5-eval-meta">${evalEsc(new Date(run.generatedAt).toLocaleString())}</div>
                </div>
                <span>${evalEsc(readiness || '—')}</span>
                <span>ranked ${ranked}</span>
                <span>batch ${batch}</span>
              </div>
            `
        }).join('') || '<p class="status">暂无 shadow run。点击上方按钮可手动运行一次。</p>'}
      </div>
    `
}

async function evalLoad(force = false) {
    if (EVAL.busy && !force) return
    EVAL.busy = true
    evalEnsurePanel()
    evalStatus('正在读取 P3 / P4 / P5 评估数据…')
    try {
        const [summary, runData] = await Promise.all([
            evalRequest(
                '/api/v1/desktop/recommendation-v5/evaluation/summary?limit=200&horizonDays=30&steerabilityStep=3&steerabilityTargetLimit=30'
            ),
            evalRequest(
                '/api/v1/desktop/recommendation-v5/shadow-runs?limit=50'
            )
        ])
        EVAL.summary = summary
        EVAL.runs = Array.isArray(runData.runs)
            ? runData.runs
            : []
        evalRenderSummary()
        evalRenderCriteria()
        evalRenderRuns()
        evalStatus(
            `评估已刷新：${summary.status || 'UNKNOWN'} · shadow runs ${EVAL.runs.length} · 自动 promotion 关闭。`
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
        '正在手动运行一次 Shadow benchmark；候选不会进入正式 serving，也不会持久化 shadow 候选元数据…'
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
            `Shadow run 完成：ranked ${Number(result.ranking?.candidateCount || 0)} · batch ${Number(result.diversity?.selectedCount || 0)} · audit ${audit.poolId || 'recorded'}。正在重算评估…`
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
    void evalLoad()
}

evalInstall()
document.addEventListener('pica-language-change', () => {
    evalEnsurePanel()
    if (EVAL.summary) {
        evalRenderSummary()
        evalRenderCriteria()
        evalRenderRuns()
    }
})
