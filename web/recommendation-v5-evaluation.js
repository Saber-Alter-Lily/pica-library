import { copy as evalT } from './locale-runtime.js'

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
.v5-eval-technical>summary::after{content:'+';float:right;color:#6a72c8;font-size:.9rem}
.v5-eval-technical[open]>summary::after{content:'−'}
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
          <h3>${evalT('推荐系统评估 · V5 Development','Recommendation system evaluation · V5 Development','おすすめシステム評価 · V5 Development')}</h3>
          <p>${evalT('“影子推荐（Shadow）”= 让新算法在后台模拟推荐一次，但不替换你现在看到的正式推荐。这里只记录它会召回、排序和选出哪些作品，用于后续比较新旧算法。','Shadow recommendations simulate one run of the new algorithm in the background without replacing the formal recommendations you currently see. This panel records what it retrieves, ranks and selects so old and new algorithms can be compared later.','Shadow おすすめは、新しいアルゴリズムをバックグラウンドで1回シミュレーションし、現在表示中の正式おすすめは置き換えません。取得・順位付け・選出した作品を記録し、後で新旧アルゴリズムを比較します。')}</p>
        </div>
        <div class="v5-eval-actions">
          <button id="v5-eval-refresh" type="button">${evalT('刷新评估','Refresh evaluation','評価を更新')}</button>
          <button id="v5-eval-run-shadow" type="button">${evalT('运行一次影子推荐','Run one shadow recommendation','Shadow おすすめを1回実行')}</button>
        </div>
      </div>
      <p id="v5-eval-status" class="status">${evalT('尚未读取评估数据。','Evaluation data has not been loaded yet.','評価データはまだ読み込まれていません。')}</p>
      <div id="v5-eval-summary"></div>
      <div id="v5-eval-runs" class="v5-eval-section"></div>
      <details class="v5-eval-technical">
        <summary>${evalT('高级评估详情','Advanced evaluation details','高度な評価の詳細')}</summary>
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
            evalT('基础测试进度','Baseline test progress','基礎テスト進捗'),
            `<strong>${Math.min(exactRuns, 3)}/3</strong>`,
            exactRuns >= 3
                ? evalT('基础影子推荐轮次已经够用','Enough baseline shadow runs have been collected.','基礎 Shadow おすすめの実行回数は十分です。')
                : evalT('隔一段时间再运行一次即可，不要连续重复点击','Run another shadow recommendation later; do not click repeatedly in succession.','時間を置いてもう一度 Shadow おすすめを実行してください。連続クリックは不要です。')
        )}
        ${evalMetricCard(
            evalT('安全检查','Safety check','安全チェック'),
            correctnessPass ? evalBadge('PASS') : evalBadge('FAIL'),
            correctnessPass
                ? evalT('没有把已拥有 / 已看过 / 硬屏蔽等内容漏进测试批次','Owned, already-viewed and hard-blocked items did not leak into the test batch.','所有済み・閲覧済み・ハードブロック済みの項目はテストバッチに混入していません。')
                : evalT('发现过滤泄漏，需要先修复','A filtering leak was found and must be fixed first.','フィルタ漏れが見つかりました。先に修正が必要です。')
        )}
        ${evalMetricCard(
            evalT('后续真实行为','Future real behavior','後続の実行動'),
            evaluableRuns
                ? `<strong>${evaluableRuns}/3</strong>`
                : `<strong>${evalT('等待积累','Collecting data','データ蓄積中')}</strong>`,
            evaluableRuns
                ? evalT(
                    `成熟观察窗 ${matureRuns} · 已观察到 ${Number(support.maturePositiveEventCountAcrossWindows || 0)} 个成熟正向行为`,
                    `Mature windows ${matureRuns} · ${Number(support.maturePositiveEventCountAcrossWindows || 0)} mature positive events observed`,
                    `成熟観察ウィンドウ ${matureRuns} · 成熟したポジティブ行動を ${Number(support.maturePositiveEventCountAcrossWindows || 0)} 件観測`
                  )
                : evalT(
                    `成熟观察窗 ${matureRuns} · 仍在观察 ${immatureRuns} 轮；继续正常使用即可`,
                    `Mature windows ${matureRuns} · ${immatureRuns} runs are still maturing; keep using the app normally.`,
                    `成熟観察ウィンドウ ${matureRuns} · ${immatureRuns} 回は観察中です。通常どおり利用してください。`
                  )
        )}
        ${evalMetricCard(
            evalT('正式推荐','Formal recommendations','正式おすすめ'),
            `<strong>${evalT('未改变','Unchanged','変更なし')}</strong>`,
            evalT('影子推荐只在后台模拟，不会替换你现在看到的正式推荐','Shadow recommendations only simulate in the background and never replace the formal recommendations you see.','Shadow おすすめはバックグラウンドでシミュレーションするだけで、表示中の正式おすすめは置き換えません。')
        )}
      </div>
      <div class="v5-eval-user-note">
        <strong>${evalT('你现在需要做的事：','What you need to do now:','今やること：')}</strong>
        ${evalT(
            '正常使用软件即可。隔一段时间再运行一次影子推荐；系统会自动记录后续真实收藏、Like 和阅读结果。30 天观察窗走完整之前只显示为“正在积累”，不会提前计算正式准确率。',
            'Use the app normally. Run another shadow recommendation after some time; the system will automatically record later favorites, Likes and reading outcomes. Until the 30-day observation window matures, the result stays in a collecting state and formal accuracy is not calculated early.',
            '通常どおりアプリを利用してください。時間を置いて Shadow おすすめを再実行すると、その後のお気に入り・Like・閲覧結果が自動記録されます。30日観察ウィンドウが完了するまでは「蓄積中」と表示し、正式な精度を早期計算しません。'
        )}
      </div>
    `

    technicalTarget.innerHTML = `
      <div class="v5-eval-grid">
        ${evalMetricCard(
            evalT('P5 基线状态','P5 baseline status','P5 ベースライン状態'),
            evalBadge(summary.status),
            `framework ${evalEsc(summary.frameworkVersion || '')}`
        )}
        ${evalMetricCard(
            evalT('P3 工程 Gate','P3 engineering gate','P3 エンジニアリング Gate'),
            evalBadge(p3.verdict),
            `exact shadow runs ${exactRuns}`
        )}
        ${evalMetricCard(
            'P4 Visual Gate',
            evalBadge(visual.verdict),
            evalT('Visual 仍不自动激活','Visual remains non-automatic.','Visual は引き続き自動有効化されません。')
        )}
        ${evalMetricCard(
            'Batch Precision@12',
            accuracyAvailable ? evalPct(batch.precision12) : evalT('等待数据','Waiting for data','データ待ち'),
            accuracyAvailable
                ? `Ranked P@12 ${evalPct(ranked.precision12)}`
                : evalT('没有成熟 future-outcome 时不把 0% 解释成模型失败','Do not interpret 0% as model failure when no mature future outcome exists.','成熟した future outcome がない段階では、0% をモデル失敗とは解釈しません。')
        )}
        ${evalMetricCard(
            'Batch Recall@12',
            accuracyAvailable ? evalPct(batch.recall12) : evalT('等待数据','Waiting for data','データ待ち'),
            accuracyAvailable
                ? `Ranked R@12 ${evalPct(ranked.recall12)}`
                : ''
        )}
        ${evalMetricCard(
            'Batch NDCG@12',
            accuracyAvailable ? evalFmt(batch.ndcg12) : evalT('等待数据','Waiting for data','データ待ち'),
            accuracyAvailable
                ? `Hit@12 ${evalPct(batch.hit12)} · MRR ${evalFmt(batch.mrr)}`
                : ''
        )}
        ${evalMetricCard(
            evalT('作者最大集中度','Maximum author concentration','作者最大集中度'),
            evalPct(diversity.medianAuthorMaxShare),
            `IP ${evalPct(diversity.medianFandomMaxShare)} · Tag ${evalPct(diversity.medianTagMaxShare)}`
        )}
        ${evalMetricCard(
            evalT('目录覆盖率','Catalog Coverage','カタログカバレッジ'),
            evalPct(diversity.itemCoverage?.coverage),
            `${Number(diversity.itemCoverage?.distinctRecommendedItems || 0)} distinct / ${Number(diversity.itemCoverage?.catalogSize || 0)} catalog`
        )}
        ${evalMetricCard(
            evalT('可调性','Steerability','ステアラビリティ'),
            steer.summary?.passRate === null ||
            steer.summary?.passRate === undefined
                ? evalT('等待数据','Waiting for data','データ待ち')
                : evalPct(steer.summary.passRate),
            `two-sided targets ${Number(steer.summary?.twoSidedTestableCount || 0)}`
        )}
        ${evalMetricCard(
            evalT('高级学习','Advanced learning','高度な学習'),
            evalBadge('DEFERRED'),
            `LTR=${Boolean(decisions.learningToRank)} · Bandit=${Boolean(decisions.contextualBandit)} · Active=${Boolean(decisions.activeLearning)}`
        )}
      </div>
      <div class="v5-eval-note">
        ${evalT(
            '当前评估只使用 exact current shadow modelVersion 和后续真实行为证据。',
            'The current evaluation uses only the exact current shadow modelVersion and subsequent real-behavior evidence.',
            '現在の評価では exact current shadow modelVersion と、その後の実行動エビデンスだけを使用します。'
        )}
        ${retrospective.discovery?.serendipity === 'NOT_YET_IDENTIFIABLE_WITH_CURRENT_LOGS'
            ? evalT('Serendipity / long-tail 仍缺可靠日志定义，因此不会补造指标。','Serendipity / long-tail still lacks a reliable log definition, so no metric is fabricated.','Serendipity / long-tail は信頼できるログ定義がまだないため、指標を捏造しません。')
            : ''}
        ${evalT('Advanced Learning 保持','Advanced Learning remains','Advanced Learning は')} ${evalEsc(decisions.advancedLearning || 'DEFERRED')}${evalT('。','.',' のままです。')}
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
        EXACT_SHADOW_RUN_SUPPORT: evalT('重复测试轮次','Repeated test runs','反復テスト回数'),
        CORRECTNESS_AUDIT_SUPPORT: evalT('安全审计轮次','Safety audit runs','安全監査回数'),
        FUTURE_OUTCOME_SUPPORT: evalT('后续真实行为支持','Future-outcome support','後続の実行動サポート'),
        STEERABILITY_TARGET_SUPPORT: evalT('偏好控制测试样本','Preference-control test samples','嗜好制御テストサンプル'),
        STEERABILITY_MONOTONICITY: evalT('偏好控制方向一致性','Preference-control direction consistency','嗜好制御方向の一貫性'),
        P3_SHADOW_ENGINEERING_GATE: evalT('新算法工程稳定性','New-algorithm engineering stability','新アルゴリズムのエンジニアリング安定性')
    }
    target.innerHTML = `
      <h4>${evalT('固定 Gate 条件（开发者）','Fixed gate conditions (developer)','固定 Gate 条件（開発者）')}</h4>
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
        `).join('') || `<p class="status">${evalT('当前没有可用 Gate 条件。','No gate conditions are available yet.','利用可能な Gate 条件はまだありません。')}</p>`}
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
            const label = `${item.current ? `[${evalT('当前','current','current')}] ` : ''}${item.modelVersion} · ${evalT('轮次','runs','実行回数')} ${Number(item.runCount || 0)}`
            return `<option value="${evalEsc(item.modelVersion)}" ${item.modelVersion === selected ? 'selected' : ''}>${evalEsc(label)}</option>`
        })
        .join('')
}

function evalRenderComparison() {
    const target = document.querySelector('#v5-eval-comparison')
    if (!target) return
    if (EVAL.versions.length < 2) {
        target.innerHTML = `
          <h4>${evalT('Model Version Comparison（开发者）','Model Version Comparison (developer)','Model Version Comparison（開発者）')}</h4>
          <p class="status">${evalT(
   `至少需要两个不同的 shadow modelVersion 才能做固定基线比较；当前只有 ${EVAL.versions.length} 个。`,
   `At least two different shadow modelVersions are required for a fixed-baseline comparison; only ${EVAL.versions.length} are available.`,
   `固定ベースライン比較には異なる shadow modelVersion が2つ以上必要です。現在は ${EVAL.versions.length} 個です。`
 )}</p>
        `
        return
    }
    const comparison = EVAL.comparison
    const metrics = comparison?.accuracy?.diversifiedBatch || {}
    const diversity = comparison?.diversity || {}
    target.innerHTML = `
      <h4>${evalT('Model Version Comparison（开发者）','Model Version Comparison (developer)','Model Version Comparison（開発者）')}</h4>
      <div class="v5-eval-compare-controls">
        <label>Baseline
          <select id="v5-eval-baseline-version">${evalVersionOptions(EVAL.baselineVersion)}</select>
        </label>
        <span>→</span>
        <label>Candidate
          <select id="v5-eval-candidate-version">${evalVersionOptions(EVAL.candidateVersion)}</select>
        </label>
        <button id="v5-eval-compare-btn" type="button">${evalT('比较版本','Compare versions','バージョンを比較')}</button>
      </div>
      ${comparison ? `
        <div class="v5-eval-grid">
          ${evalMetricCard('Comparison', evalBadge(comparison.status), evalT('不会自动选择 winner','No winner is selected automatically.','winner は自動選択しません。'))}
          ${evalMetricCard('Δ Precision@12', evalDeltaMarkup(metrics.precision12?.delta, true), 'candidate − baseline')}
          ${evalMetricCard('Δ Recall@12', evalDeltaMarkup(metrics.recall12?.delta, true), 'candidate − baseline')}
          ${evalMetricCard('Δ NDCG@12', evalDeltaMarkup(metrics.ndcg12?.delta, true), 'candidate − baseline')}
          ${evalMetricCard('Δ Hit@12', evalDeltaMarkup(metrics.hit12?.delta, true), 'candidate − baseline')}
          ${evalMetricCard('Δ MRR', evalDeltaMarkup(metrics.mrr?.delta, true), 'candidate − baseline')}
          ${evalMetricCard('Δ Author concentration', evalDeltaMarkup(diversity.authorMaxShare?.delta, false), evalT('越低越好','lower is better','低いほど良い'))}
          ${evalMetricCard('Δ Catalog coverage', evalDeltaMarkup(diversity.itemCoverage?.delta, true), evalT('越高越好','higher is better','高いほど良い'))}
        </div>
        <div class="v5-eval-note">
          baseline: <code>${evalEsc(comparison.baseline?.modelVersion || '')}</code><br>
          candidate: <code>${evalEsc(comparison.candidate?.modelVersion || '')}</code><br>
          ${evalT(
   'winner = null；这里只报告同口径描述性差值，不自动 promotion，不开启 LTR/Bandit/Active Learning。',
   'winner = null; this view reports descriptive deltas on the same basis only. It never auto-promotes or enables LTR, Bandit, or Active Learning.',
   'winner = null。ここでは同一条件の記述的な差分だけを表示し、自動 promotion や LTR / Bandit / Active Learning の有効化は行いません。'
 )}
        </div>
      ` : `<p class="status">${evalT('选择两个版本后点击“比较版本”。','Select two versions, then choose Compare versions.','2つのバージョンを選択して「バージョンを比較」を押してください。')}</p>`}
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
        evalStatus(evalT('Baseline 与 Candidate 必须是两个不同的 modelVersion。','Baseline and Candidate must be different modelVersions.','Baseline と Candidate には異なる modelVersion を指定してください。'), true)
        return
    }
    EVAL.comparing = true
    evalStatus(evalT('正在按同一 future-outcome benchmark 比较两个 exact modelVersion…','Comparing two exact modelVersions on the same future-outcome benchmark…','同じ future-outcome benchmark で2つの exact modelVersion を比較中…'))
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
            evalT(`版本比较完成：${EVAL.comparison.status || 'UNKNOWN'}。不会自动选择 winner 或改变 serving。`,`Version comparison complete: ${EVAL.comparison.status || 'UNKNOWN'}. No winner is selected automatically and serving is unchanged.`,`バージョン比較完了：${EVAL.comparison.status || 'UNKNOWN'}。winner の自動選択や serving の変更は行いません。`)
        )
    } catch (error) {
        evalStatus(evalT(`版本比较失败：${error.message}`,`Version comparison failed: ${error.message}`,`バージョン比較に失敗しました：${error.message}`), true)
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
      <h4>${evalT('Advanced Learning Decision Gate（开发者）','Advanced Learning Decision Gate (developer)','Advanced Learning Decision Gate（開発者）')}</h4>
      <div class="v5-eval-compare-controls">
        <label>${evalT('方向','Direction','方向')}
          <select id="v5-eval-advanced-direction">
            <option value="LEARNING_TO_RANK" ${EVAL.advancedDirection === 'LEARNING_TO_RANK' ? 'selected' : ''}>Learning-to-Rank</option>
            <option value="CONTEXTUAL_BANDIT" ${EVAL.advancedDirection === 'CONTEXTUAL_BANDIT' ? 'selected' : ''}>Contextual Bandit</option>
            <option value="ACTIVE_LEARNING" ${EVAL.advancedDirection === 'ACTIVE_LEARNING' ? 'selected' : ''}>Active Learning</option>
          </select>
        </label>
        <span></span>
        <div class="v5-eval-meta">
          ${evalT(
   'LTR 使用当前 baseline/candidate 比较；Bandit 需要 propensity/randomized assignment；Active Learning 需要 uncertainty/query-value 日志。',
   'LTR uses the current baseline/candidate comparison; Bandit requires propensity/randomized assignment; Active Learning requires uncertainty/query-value logs.',
   'LTR は現在の baseline/candidate 比較を使用します。Bandit には propensity / randomized assignment、Active Learning には uncertainty / query-value ログが必要です。'
 )}
        </div>
        <button id="v5-eval-advanced-btn" type="button">${evalT('评估实验门槛','Evaluate experiment gate','実験 Gate を評価')}</button>
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
          ${missing.length
    ? evalT(
        `缺失条件：${evalEsc(missing.join(' / '))}`,
        `Missing requirements: ${evalEsc(missing.join(' / '))}`,
        `不足条件：${evalEsc(missing.join(' / '))}`
      )
    : evalT(
        '当前只允许进入离线实验设计；仍不授权训练或 serving mutation。',
        'Only offline experiment design is allowed at this stage; training and serving mutation remain unauthorized.',
        '現段階ではオフライン実験設計のみ許可され、training と serving mutation は引き続き許可されません。'
      )}
        </div>
      ` : `<p class="status">${evalT('选择方向后点击“评估实验门槛”。不会自动训练或上线。','Choose a direction, then select Evaluate experiment gate. Nothing is trained or deployed automatically.','方向を選択して「実験 Gate を評価」を押してください。自動で学習や配信は行いません。')}</p>`}
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
    evalStatus(evalT('正在评估高级学习实验门槛；不会训练模型或改变 serving…','Evaluating the advanced-learning experiment gate; this will not train a model or change serving…','高度な学習の実験 Gate を評価中です。モデル学習や serving の変更は行いません…'))
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
            evalT(`高级学习门槛：${EVAL.advancedGate.verdict || 'UNKNOWN'}。trainingEnabled=false，servingMutationEnabled=false。`,`Advanced-learning gate: ${EVAL.advancedGate.verdict || 'UNKNOWN'}. trainingEnabled=false, servingMutationEnabled=false.`,`高度な学習 Gate：${EVAL.advancedGate.verdict || 'UNKNOWN'}。trainingEnabled=false、servingMutationEnabled=false。`)
        )
    } catch (error) {
        evalStatus(evalT(`高级学习门槛评估失败：${error.message}`,`Advanced-learning gate evaluation failed: ${error.message}`,`高度な学習 Gate の評価に失敗しました：${error.message}`), true)
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
        if (status === 'READY') return evalT('完成','Ready','完了')
        if (status === 'READY_DEGRADED') return evalT('完成（部分来源降级）','Ready (some sources degraded)','完了（一部ソース低下）')
        return status || '—'
    }
    target.innerHTML = `
      <h4>${evalT('最近影子推荐','Recent shadow recommendations','最近の Shadow おすすめ')}</h4>
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
                    <summary>${evalT('版本信息','Version information','バージョン情報')}</summary>
                    <code>${evalEsc(run.modelVersion)}</code>
                  </details>
                </div>
                <span>${evalEsc(readinessLabel(readiness))}</span>
                <span>${evalT('排序','Ranked','順位付け')} ${ranked}</span>
                <span>${evalT('最终','Final','最終')} ${batch}</span>
              </div>
            `
        }).join('') || `<p class="status">${evalT('还没有影子推荐记录。隔一段时间运行一次即可；不会改变正式推荐。','There are no shadow-recommendation records yet. Run one after some time; formal recommendations are unchanged.','Shadow おすすめの記録はまだありません。時間を置いて1回実行してください。正式おすすめは変更されません。')}</p>`}
      </div>
    `
}

async function evalLoad(force = false) {
    if (EVAL.busy && !force) return
    EVAL.busy = true
    evalEnsurePanel()
    evalStatus(evalT('正在读取 P3 / P4 / P5 评估数据…','Reading P3 / P4 / P5 evaluation data…','P3 / P4 / P5 評価データを読み込み中…'))
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
            evalT(`评估已刷新：基础影子推荐 ${Number(support.exactRunCount || 0)}/3；成熟观察窗 ${Number(support.matureRunCount || 0)}，可评估记录 ${Number(support.evaluableRunCount || 0)}/3。正式推荐未改变。`,`Evaluation refreshed: baseline shadow runs ${Number(support.exactRunCount || 0)}/3; mature windows ${Number(support.matureRunCount || 0)}, evaluable runs ${Number(support.evaluableRunCount || 0)}/3. Formal recommendations are unchanged.`,`評価を更新しました：基礎 Shadow 実行 ${Number(support.exactRunCount || 0)}/3、成熟観察ウィンドウ ${Number(support.matureRunCount || 0)}、評価可能な実行 ${Number(support.evaluableRunCount || 0)}/3。正式おすすめは変更されていません。`)
        )
    } catch (error) {
        evalStatus(evalT(`评估读取失败：${error.message}`,`Failed to read evaluation data: ${error.message}`,`評価データの読み込みに失敗しました：${error.message}`), true)
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
        evalT('正在后台模拟一次新算法推荐：不会改变当前正式推荐。正在召回候选、排序并生成 12 本测试批次…','Simulating one new-algorithm recommendation in the background. Formal recommendations stay unchanged while candidates are retrieved, ranked and a 12-work test batch is built…','新アルゴリズムのおすすめをバックグラウンドで1回シミュレーションしています。正式おすすめは変更せず、候補取得・順位付け・12作品のテストバッチを生成中です…')
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
            evalT(`影子推荐完成：原始候选 ${Number(result.rawCandidateCount || 0)} → 清洗后 ${Number(result.candidateCount || 0)} → 排序 ${Number(result.ranking?.candidateCount || 0)} → 最终测试批次 ${Number(result.diversity?.selectedCount || 0)}。正式推荐未改变。正在刷新评估…`,`Shadow recommendation complete: raw candidates ${Number(result.rawCandidateCount || 0)} → cleaned ${Number(result.candidateCount || 0)} → ranked ${Number(result.ranking?.candidateCount || 0)} → final test batch ${Number(result.diversity?.selectedCount || 0)}. Formal recommendations are unchanged. Refreshing evaluation…`,`Shadow おすすめ完了：元候補 ${Number(result.rawCandidateCount || 0)} → クリーン後 ${Number(result.candidateCount || 0)} → 順位付け ${Number(result.ranking?.candidateCount || 0)} → 最終テストバッチ ${Number(result.diversity?.selectedCount || 0)}。正式おすすめは変更されていません。評価を更新中…`)
        )
        await evalLoad(true)
    } catch (error) {
        evalStatus(evalT(`Shadow run 失败：${error.message}`,`Shadow run failed: ${error.message}`,`Shadow run に失敗しました：${error.message}`), true)
    } finally {
        EVAL.runningShadow = false
        if (button) button.disabled = false
    }
}

function evalInstall() {
    if (!evalEnsurePanel()) return
    evalStatus(evalT('评估尚未运行。点击“刷新评估”后才会读取 P3 / P4 / P5 数据；打开设置页不会自动执行重计算。','Evaluation has not run yet. Use Refresh evaluation to read P3 / P4 / P5 data; opening Settings never starts recomputation automatically.','評価はまだ実行されていません。「評価を更新」で P3 / P4 / P5 データを読み込みます。設定を開くだけでは再計算を自動実行しません。'))
}

evalInstall()
document.addEventListener('pica-language-change', () => {
    document.querySelector('#settings-recommendation-v5-evaluation')?.remove()
    evalEnsurePanel()
    if (EVAL.summary) {
        evalRenderSummary()
        evalRenderCriteria()
        evalRenderComparison()
        evalRenderAdvancedLearning()
        evalRenderRuns()
        const support = EVAL.summary.sections?.retrospective?.support || {}
        evalStatus(
            evalT(
                `评估已刷新：基础影子推荐 ${Number(support.exactRunCount || 0)}/3；成熟观察窗 ${Number(support.matureRunCount || 0)}，可评估记录 ${Number(support.evaluableRunCount || 0)}/3。正式推荐未改变。`,
                `Evaluation refreshed: baseline shadow runs ${Number(support.exactRunCount || 0)}/3; mature windows ${Number(support.matureRunCount || 0)}, evaluable runs ${Number(support.evaluableRunCount || 0)}/3. Formal recommendations are unchanged.`,
                `評価を更新しました：基礎 Shadow 実行 ${Number(support.exactRunCount || 0)}/3、成熟観察ウィンドウ ${Number(support.matureRunCount || 0)}、評価可能な実行 ${Number(support.evaluableRunCount || 0)}/3。正式おすすめは変更されていません。`
            )
        )
    } else {
        evalInstall()
    }
})
