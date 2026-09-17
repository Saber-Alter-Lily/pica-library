from pathlib import Path


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# 1) Server-backed QC persistence in SQLite app_state (no schema migration).
server = read('src/library/server.ts')
anchor = """            if (\n                url.pathname === '/api/v1/visual/prepare' &&\n                request.method === 'POST'\n            ) {\n"""
insert = """            if (\n                url.pathname === '/api/v1/visual/qc-state' &&\n                request.method === 'GET'\n            )\n                return json(\n                    response,\n                    200,\n                    options.database.getAppState<Record<string, unknown>>(\n                        'recommendation.visualQcState.v1'\n                    ) ?? { ratings: {}, failures: {}, lastAnchorId: '' }\n                )\n            if (\n                url.pathname === '/api/v1/visual/qc-state' &&\n                request.method === 'POST'\n            ) {\n                const input = await body(request)\n                const objectValue = (value: unknown) =>\n                    value && typeof value === 'object' && !Array.isArray(value)\n                        ? (value as Record<string, unknown>)\n                        : {}\n                const value = {\n                    ratings: objectValue(input.ratings),\n                    failures: objectValue(input.failures),\n                    lastAnchorId: String(input.lastAnchorId ?? '').slice(0, 512),\n                    updatedAt: new Date().toISOString()\n                }\n                options.database.setAppState(\n                    'recommendation.visualQcState.v1',\n                    value\n                )\n                return json(response, 200, value)\n            }\n"""
server = replace_once(server, anchor, insert + anchor, 'server visual prepare')
write('src/library/server.ts', server)

# 2) QC UI round 2.
qc = read('web/visual-qc-beta.js')
qc = replace_once(qc, """    lastFailureMessage: ''\n}\n""", """    lastFailureMessage: '',\n    qcState: { ratings: {}, failures: {}, lastAnchorId: '' },\n    qcStateLoaded: false,\n    qcPersistTimer: null\n}\n""", 'qc state')
qc = replace_once(qc, """function a88Ratings() { return a88LoadJson(A88_RATINGS_KEY, {}) }\nfunction a88Failures() { return a88LoadJson(A88_FAILURES_KEY, {}) }\n""", """function a88Ratings() { return a88State.qcState.ratings || {} }\nfunction a88Failures() { return a88State.qcState.failures || {} }\n""", 'qc local accessors')

persist_code = r'''
function a88MergeTimedRecords(remote, local) {
    const output = { ...(remote || {}) }
    for (const [key, value] of Object.entries(local || {})) {
        const previous = output[key]
        const priorTime = String(previous?.updatedAt || previous?.lastAttemptAt || '')
        const nextTime = String(value?.updatedAt || value?.lastAttemptAt || '')
        if (!previous || nextTime >= priorTime) output[key] = value
    }
    return output
}
async function a88LoadQcState() {
    if (a88State.qcStateLoaded) return a88State.qcState
    const localRatings = a88LoadJson(A88_RATINGS_KEY, {})
    const localFailures = a88LoadJson(A88_FAILURES_KEY, {})
    let remote = null
    try { remote = await a88Api('/api/v1/visual/qc-state') } catch { remote = null }
    a88State.qcState = {
        ratings: a88MergeTimedRecords(remote?.ratings, localRatings),
        failures: a88MergeTimedRecords(remote?.failures, localFailures),
        lastAnchorId: String(remote?.lastAnchorId || '')
    }
    a88State.qcStateLoaded = true
    a88SaveJson(A88_RATINGS_KEY, a88State.qcState.ratings)
    a88SaveJson(A88_FAILURES_KEY, a88State.qcState.failures)
    void a88PersistQcState()
    return a88State.qcState
}
function a88ScheduleQcPersist() {
    clearTimeout(a88State.qcPersistTimer)
    a88State.qcPersistTimer = setTimeout(() => void a88PersistQcState(), 120)
}
async function a88PersistQcState() {
    if (!a88State.qcStateLoaded) return
    a88SaveJson(A88_RATINGS_KEY, a88State.qcState.ratings)
    a88SaveJson(A88_FAILURES_KEY, a88State.qcState.failures)
    try {
        const saved = await a88Post('/api/v1/visual/qc-state', a88State.qcState)
        if (saved?.updatedAt) a88State.qcState.updatedAt = saved.updatedAt
    } catch {
        // Browser storage remains a fallback; the next refresh retries server persistence.
    }
}
'''
qc = replace_once(qc, """async function a88Post(path, value) {\n    return a88Api(path, {\n        method: 'POST',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify(value)\n    })\n}\n\nfunction a88InjectStyle() {\n""", """async function a88Post(path, value) {\n    return a88Api(path, {\n        method: 'POST',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify(value)\n    })\n}\n""" + persist_code + "\nfunction a88InjectStyle() {\n", 'qc persistence insertion')

qc = qc.replace(".a88-qc-metrics{font-size:.84rem;color:var(--a83-muted,#68636e);margin-top:8px}\n", ".a88-qc-metrics{font-size:.84rem;color:var(--a83-muted,#68636e);margin-top:8px}\n.a88-anchor-summary{display:flex;gap:12px;align-items:center;margin:10px 0;padding:10px;border:1px solid var(--a83-line,#ddd7e4);border-radius:12px}\n.a88-anchor-summary img{width:64px;height:88px;object-fit:cover;border-radius:8px;background:#eee}\n#a88-sample-dialog{border:0;border-radius:18px;max-width:min(1100px,94vw);width:1000px;padding:0;box-shadow:0 30px 80px #0004}\n#a88-sample-dialog::backdrop{background:#0007}\n.a88-sample-shell{padding:20px;max-height:86vh;overflow:auto}\n.a88-sample-columns{display:grid;grid-template-columns:1fr 1fr;gap:18px}\n.a88-sample-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}\n.a88-sample-strip img{width:100%;max-height:360px;object-fit:contain;background:#eee;border-radius:8px}\n")
qc = qc.replace("@media(max-width:700px){.a88-qc-search{grid-template-columns:1fr}.a88-dialog-main{grid-template-columns:1fr}.a88-dialog-main>img{width:120px}.a88-similar-grid{grid-template-columns:1fr}}", "@media(max-width:700px){.a88-qc-search{grid-template-columns:1fr}.a88-dialog-main{grid-template-columns:1fr}.a88-dialog-main>img{width:120px}.a88-similar-grid{grid-template-columns:1fr}.a88-sample-columns{grid-template-columns:1fr}}")

qc = replace_once(qc, """async function a88LoadDataset(force = false) {\n    if (a88State.status && !force) return a88State\n""", """async function a88LoadDataset(force = false) {\n    if (!a88State.qcStateLoaded) await a88LoadQcState()\n    if (a88State.status && !force) return a88State\n""", 'load dataset qc state')
qc = qc.replace("if (changed) a88SaveJson(A88_FAILURES_KEY, failures)", "if (changed) a88ScheduleQcPersist()")

qc = qc.replace("<p>只读取已冻结的 Visual V1 embedding，不会重建或覆盖向量。人工评分：2=明显相似，1=部分相似，0=明显不相似。</p>", "<p>只读取已冻结的 Visual V1 embedding，不会重建或覆盖向量。不要强迫自己给分：2=整体明显相似，1=部分相似，0=明显不同，?=无法判断/跳过。正文样本对比只用于人工判断，不会重建 embedding。</p>")
qc = qc.replace("<div id=\"a88-qc-metrics\" class=\"a88-qc-metrics\"></div>\n      <div id=\"a88-anchor-list\"", "<div id=\"a88-qc-metrics\" class=\"a88-qc-metrics\"></div>\n      <div id=\"a88-anchor-summary\" class=\"a88-anchor-summary\" hidden></div>\n      <div id=\"a88-anchor-list\"")

qc = replace_once(qc, """        await a88LoadDataset(true)\n        a88RenderAnchorList()\n        if (message) message.textContent = ''\n""", """        await a88LoadDataset(true)\n        a88RenderAnchorList()\n        const remembered = String(a88State.qcState.lastAnchorId || '')\n        if (remembered && a88State.indexedIds.has(remembered)) {\n            const comic = a88State.comicsById.get(remembered)\n            if (comic) a88$('#a88-qc-query').value = comic.title\n            a88RenderAnchorList()\n            await a88RunQcAnchor(remembered)\n        } else if (message) message.textContent = ''\n""", 'restore anchor')

qc = replace_once(qc, """    if (!a88State.indexedIds.has(comicId)) {\n        if (message) message.textContent = '该漫画不在当前 Visual V1 索引中，不能作为 Anchor。'\n        if (target) target.innerHTML = ''\n        return\n    }\n    if (message) message.textContent = `正在从 ${a88State.status?.indexedCount || 0} 个 Visual V1 向量中检索：${comic?.title || comicId}`\n""", """    if (!a88State.indexedIds.has(comicId)) {\n        if (message) message.textContent = '该漫画不在当前 Visual V1 索引中，不能作为 Anchor。'\n        if (target) target.innerHTML = ''\n        return\n    }\n    a88State.qcState.lastAnchorId = comicId\n    a88ScheduleQcPersist()\n    const summary = a88$('#a88-anchor-summary')\n    if (summary) {\n        summary.hidden = false\n        summary.innerHTML = `<img src=\"/api/v1/covers/${encodeURIComponent(comicId)}\" alt=\"\"><div><strong>Anchor · ${a88Escape(comic?.title || comicId)}</strong><br><span class=\"a88-meta\">${a88Escape(comic?.canonicalAuthor || comic?.author || '')} · ${a88Provider(comic)}</span><br><button type=\"button\" data-a88-anchor-samples=\"${a88Escape(comicId)}\">查看 Anchor 正文样本</button></div>`\n        summary.querySelector('[data-a88-anchor-samples]')?.addEventListener('click', (event) => void a88ShowSampleCompare(comicId, '', event.currentTarget))\n    }\n    if (message) message.textContent = `正在从 ${a88State.status?.indexedCount || 0} 个 Visual V1 向量中检索：${comic?.title || comicId}`\n""", 'anchor summary')

old_reasons = """const A88_REASON_LABELS = {\n    same_author: '同作者',\n    same_ip: '同IP/角色',\n    same_topic: '同题材',\n    color: '同配色',\n    composition: '同构图',\n    source_effect: '扫描/来源效应'\n}\n"""
new_reasons = """const A88_REASON_LABELS = {\n    linework: '线条 / 勾线相似',\n    character_design: '人物造型 / 脸部比例相似',\n    tone_color: '网点 / 明暗 / 上色相似',\n    composition: '构图 / 背景密度相似',\n    same_author: '已知同作者',\n    same_ip: '同IP / 角色（内容混杂）',\n    same_topic: '同题材（内容混杂）',\n    source_effect: '扫描 / 来源效应'\n}\n"""
qc = replace_once(qc, old_reasons, new_reasons, 'reason labels')
qc = replace_once(qc, """    ratings[key] = { ...previous, ...patch, anchorId, candidateId, updatedAt: new Date().toISOString() }\n    a88SaveJson(A88_RATINGS_KEY, ratings)\n""", """    ratings[key] = { ...previous, ...patch, anchorId, candidateId, updatedAt: new Date().toISOString() }\n    a88ScheduleQcPersist()\n""", 'rating persistence')

qc = qc.replace("<div class=\"a88-detail-actions\"><button type=\"button\" data-a88-open=\"${a88Escape(comic.comicId)}\">详情</button></div>", "<div class=\"a88-detail-actions\"><button type=\"button\" data-a88-open=\"${a88Escape(comic.comicId)}\">详情</button><button type=\"button\" data-a88-samples=\"${a88Escape(comic.comicId)}\">正文样本对比</button></div>")
qc = qc.replace("<button type=\"button\" data-a88-rating=\"0\" class=\"${rating?.rating === 0 ? 'active' : ''}\">0 不像</button>", "<button type=\"button\" data-a88-rating=\"0\" class=\"${rating?.rating === 0 ? 'active' : ''}\">0 不像</button><button type=\"button\" data-a88-rating=\"uncertain\" class=\"${rating?.rating === 'uncertain' ? 'active' : ''}\">? 不确定</button>")
qc = qc.replace("a88$$('[data-a88-open]', target).forEach((button) => button.onclick = () => void a88OpenDetail(button.dataset.a88Open))", "a88$$('[data-a88-open]', target).forEach((button) => button.onclick = () => void a88OpenDetail(button.dataset.a88Open))\n    a88$$('[data-a88-samples]', target).forEach((button) => button.onclick = () => void a88ShowSampleCompare(anchorId, button.dataset.a88Samples, button))")
qc = replace_once(qc, """            a88SetRating(anchorId, card.dataset.a88Candidate, { rating: Number(button.dataset.a88Rating), rank: Number(card.dataset.a88Rank) })\n""", """            const rawRating = button.dataset.a88Rating\n            a88SetRating(anchorId, card.dataset.a88Candidate, { rating: rawRating === 'uncertain' ? 'uncertain' : Number(rawRating), rank: Number(card.dataset.a88Rank) })\n""", 'uncertain rating')

old_metric = """        const rated = values.filter((value) => Number.isInteger(value))\n        if (rated.length < Math.min(k, subset.length)) return `P@${k} 待完成 ${rated.length}/${Math.min(k, subset.length)}`\n        const broad = rated.filter((value) => value >= 1).length / rated.length\n        const strict = rated.filter((value) => value === 2).length / rated.length\n        return `P@${k}(≥1)=${broad.toFixed(2)} · strict(=2)=${strict.toFixed(2)}`\n"""
new_metric = """        const expected = Math.min(k, subset.length)\n        const rated = values.filter((value) => Number.isInteger(value))\n        const uncertain = values.filter((value) => value === 'uncertain').length\n        const completed = rated.length + uncertain\n        if (completed < expected) return `P@${k} 待完成 ${completed}/${expected}（不确定 ${uncertain}）`\n        if (uncertain) return `P@${k} 已完成 · 不确定 ${uncertain}/${expected}，正式 P@${k} 暂不计算`\n        const broad = rated.filter((value) => value >= 1).length / rated.length\n        const strict = rated.filter((value) => value === 2).length / rated.length\n        return `P@${k}(≥1)=${broad.toFixed(2)} · strict(=2)=${strict.toFixed(2)}`\n"""
qc = replace_once(qc, old_metric, new_metric, 'metrics uncertain')

old_classify = """function a88ClassifyFailure(message) {\n    const text = String(message || '').toLowerCase()\n    if (/onnx|wasm|model|embedding|vector|视觉模型|向量/.test(text)) return 'MODEL_FAILURE'\n    if (/sqlite|database|disk|database is locked|no space|save|保存/.test(text)) return 'SAVE_FAILURE'\n    if (/401|403|forbidden|permission|login|session|exh|unavailable|权限|登录/.test(text)) return 'PROVIDER_ACCESS'\n    if (/no .*page|no page|no body|empty|episode.*(empty|missing)|没有可用|没有正文|章节为空/.test(text)) return 'NO_BODY_PAGES'\n    if (/decode|image|content-type|raster|too large|20 mb|图片|解码/.test(text)) return 'IMAGE_INVALID'\n    if (/timeout|timed out|network|fetch|econn|enotfound|429|50\\d|cloudflare|网络|超时/.test(text)) return 'NETWORK_TRANSIENT'\n    return 'UNKNOWN'\n}\nconst A88_FAILURE_META = {\n    READY_TO_RETRY: ['取样可用', '可以重试；准备阶段正常，之前更像瞬时图片/模型问题。'],\n    NETWORK_TRANSIENT: ['网络/限流', '稍后重试通常有意义。'],\n    PROVIDER_ACCESS: ['Provider/权限', '先检查登录、ExH 权限或来源可用性，再重试。'],\n    NO_BODY_PAGES: ['无可用正文', '重复运行通常无效；保持 pending 比强行封面补齐更合适。'],\n    IMAGE_INVALID: ['图片异常', '少量可重试；持续失败则建议跳过。'],\n    MODEL_FAILURE: ['模型推理', '重启桌面后可重试；若固定同一本失败需检查页面格式。'],\n    SAVE_FAILURE: ['数据库/保存', '停止重复运行，先检查磁盘和数据库状态。'],\n    UNKNOWN: ['未分类', '查看原始错误后决定。']\n}\n"""
new_classify = """function a88ClassifyFailure(message) {\n    const text = String(message || '').toLowerCase()\n    if (/onnx|wasm|model|embedding|vector|视觉模型|向量/.test(text)) return 'MODEL_FAILURE'\n    if (/sqlite|database|disk|database is locked|no space|save|保存/.test(text)) return 'SAVE_FAILURE'\n    if (/404|410|not found|gone|deleted|removed|不存在|已删除/.test(text)) return 'RESOURCE_MISSING'\n    if (/400|bad request|invalid (comic|gallery|id)|malformed|请求无效/.test(text)) return 'PROVIDER_BAD_REQUEST'\n    if (/401|403|forbidden|permission|login|session|exh|unavailable|权限|登录/.test(text)) return 'PROVIDER_ACCESS'\n    if (/no .*page|no page|no body|empty|episode.*(empty|missing)|没有可用|没有正文|章节为空/.test(text)) return 'NO_BODY_PAGES'\n    if (/decode|image|content-type|raster|too large|20 mb|图片|解码/.test(text)) return 'IMAGE_INVALID'\n    if (/timeout|timed out|network|fetch|econn|enotfound|429|50\\d|cloudflare|网络|超时/.test(text)) return 'NETWORK_TRANSIENT'\n    return 'UNKNOWN'\n}\nconst A88_FAILURE_META = {\n    READY_TO_RETRY: ['取样 + 模型可用', '正文取样和 DINO dry-run 均通过；再次建立索引有明确意义。'],\n    NETWORK_TRANSIENT: ['网络/限流', '稍后重试通常有意义。'],\n    PROVIDER_ACCESS: ['Provider/权限', '先检查登录、ExH 权限或来源可用性，再重试。'],\n    PROVIDER_BAD_REQUEST: ['Provider 请求无效', 'HTTP 400 / Bad Request 多为资源标识或章节接口问题；连续出现时重复运行意义较低。'],\n    RESOURCE_MISSING: ['资源缺失/已失效', '资源已删除、404/410 或标识失效时，重复运行通常无效。'],\n    NO_BODY_PAGES: ['无可用正文', '重复运行通常无效；保持 pending 比强行封面补齐更合适。'],\n    IMAGE_INVALID: ['图片异常', '少量可重试；持续失败则建议跳过。'],\n    MODEL_FAILURE: ['模型推理', '重启桌面后可重试；若固定同一本失败需检查页面格式。'],\n    SAVE_FAILURE: ['数据库/保存', '停止重复运行，先检查磁盘和数据库状态。'],\n    UNKNOWN: ['未分类', '查看原始错误后决定。']\n}\n"""
qc = replace_once(qc, old_classify, new_classify, 'failure classifier')
qc = qc.replace("a88SaveJson(A88_FAILURES_KEY, failures)\n    a88RenderFailureSummary()", "a88ScheduleQcPersist()\n    a88RenderFailureSummary()")

old_diag = """            try {\n                const prepared = await a88Post('/api/v1/visual/prepare', { comicId, mode, limit: 6 })\n                if (prepared?.samples?.length) a88RecordFailure(comicId, 'READY_TO_RETRY', `prepare OK: ${prepared.sourceKind || 'unknown'} · ${prepared.samples.length} samples`, 'PREPARE_DIAGNOSTIC')\n                else a88RecordFailure(comicId, 'NO_BODY_PAGES', 'prepare returned no usable samples', 'PREPARE_DIAGNOSTIC')\n            } catch (error) {\n                a88RecordFailure(comicId, a88ClassifyFailure(error.message), error.message, 'PREPARE_DIAGNOSTIC')\n            }\n"""
new_diag = """            try {\n                const prepared = await a88Post('/api/v1/visual/prepare', { comicId, mode, limit: 6 })\n                if (!prepared?.samples?.length) {\n                    a88RecordFailure(comicId, 'NO_BODY_PAGES', 'prepare returned no usable samples', 'PREPARE_DIAGNOSTIC')\n                    continue\n                }\n                message.textContent = `深度诊断 ${index + 1}/${pending.length}：${comic?.title || comicId} · 正在运行 DINO dry-run（不会保存 embedding）`\n                try {\n                    const runtime = await import('./visual-runtime.js')\n                    const result = await runtime.analyzeVisualSamples(prepared.samples, (progress) => {\n                        if (progress?.phase === 'page') message.textContent = `深度诊断 ${index + 1}/${pending.length}：页面 ${progress.current}/${progress.total} · ${comic?.title || comicId}`\n                    })\n                    if (Array.isArray(result?.vector) && result.vector.length)\n                        a88RecordFailure(comicId, 'READY_TO_RETRY', `prepare + DINO OK: ${prepared.sourceKind || 'unknown'} · ${prepared.samples.length} samples · ${result.vector.length}D`, 'MODEL_DRY_RUN')\n                    else a88RecordFailure(comicId, 'MODEL_FAILURE', 'DINO dry-run returned no usable vector', 'MODEL_DRY_RUN')\n                } catch (error) {\n                    a88RecordFailure(comicId, a88ClassifyFailure(error.message), error.message, 'MODEL_DRY_RUN')\n                }\n            } catch (error) {\n                a88RecordFailure(comicId, a88ClassifyFailure(error.message), error.message, 'PREPARE_DIAGNOSTIC')\n            }\n"""
qc = replace_once(qc, old_diag, new_diag, 'deep diagnostic')
qc = qc.replace("Pending 诊断完成：${pending.length} 本。此操作未生成或覆盖任何 embedding。", "Pending 深度诊断完成：${pending.length} 本。正文取样与 DINO dry-run 均不会生成或覆盖 embedding。")

sample_code = r'''
async function a88PrepareQcSamples(comicId) {
    if (!comicId) return { comicId: '', samples: [] }
    return a88Post('/api/v1/visual/prepare', { comicId, mode: 'standard', limit: 3 })
}
function a88EnsureSampleDialog() {
    let dialog = a88$('#a88-sample-dialog')
    if (dialog) return dialog
    dialog = document.createElement('dialog')
    dialog.id = 'a88-sample-dialog'
    dialog.innerHTML = '<div class="a88-sample-shell"></div>'
    document.body.appendChild(dialog)
    return dialog
}
function a88SampleColumn(title, comic, prepared) {
    const samples = prepared?.samples || []
    return `<section><h3>${a88Escape(title)}</h3><p><strong>${a88Escape(comic?.title || prepared?.comicId || '')}</strong><br><span class="a88-meta">${a88Escape(comic?.canonicalAuthor || comic?.author || '')} · 当前重新抽样 ${a88Escape(prepared?.sourceKind || 'none')} · ${samples.length}页</span></p><div class="a88-sample-strip">${samples.map((sample) => `<img src="${a88Escape(sample.url)}" alt="正文样本" loading="lazy">`).join('')}</div>${samples.length ? '' : '<p class="status">当前无法取得正文样本。</p>'}</section>`
}
async function a88ShowSampleCompare(anchorId, candidateId, button) {
    const dialog = a88EnsureSampleDialog()
    button.disabled = true
    dialog.querySelector('.a88-sample-shell').innerHTML = '<div class="a88-loading">正在重新读取少量正文样本用于人工比较；不会修改 Visual V1…</div>'
    dialog.showModal()
    try {
        const [anchorPrepared, candidatePrepared] = await Promise.all([
            a88PrepareQcSamples(anchorId),
            candidateId ? a88PrepareQcSamples(candidateId) : Promise.resolve(null)
        ])
        const anchorComic = a88State.comicsById.get(anchorId)
        const candidateComic = candidateId ? a88State.comicsById.get(candidateId) : null
        dialog.querySelector('.a88-sample-shell').innerHTML = `<div class="a88-dialog-head"><div><h2>正文样本对比</h2><p class="a88-meta">这是当前重新抽取的代表性正文页，只用于帮助人工判断；不保证与冻结 embedding 当时的具体页完全相同，也不会重新运行或保存索引。</p></div><button type="button" data-a88-sample-close>关闭</button></div><div class="a88-sample-columns">${a88SampleColumn('Anchor', anchorComic, anchorPrepared)}${candidateId ? a88SampleColumn('Candidate', candidateComic, candidatePrepared) : ''}</div>`
        dialog.querySelector('[data-a88-sample-close]').onclick = () => dialog.close()
    } catch (error) {
        dialog.querySelector('.a88-sample-shell').innerHTML = `<button type="button" data-a88-sample-close>关闭</button><p class="status">正文样本读取失败：${a88Escape(error.message)}</p>`
        dialog.querySelector('[data-a88-sample-close]').onclick = () => dialog.close()
    } finally {
        button.disabled = false
    }
}
'''
qc = replace_once(qc, """function a88EnsureDetailDialog() {\n""", sample_code + "\nfunction a88EnsureDetailDialog() {\n", 'sample compare functions')

write('web/visual-qc-beta.js', qc)

# 3) Tests for the reported regressions.
test = read('test/unit/recommendation-v4-visual-qc-ui.test.ts')
test = test.replace("for (const category of ['READY_TO_RETRY','NETWORK_TRANSIENT','PROVIDER_ACCESS','NO_BODY_PAGES','IMAGE_INVALID','MODEL_FAILURE','SAVE_FAILURE'])", "for (const category of ['READY_TO_RETRY','NETWORK_TRANSIENT','PROVIDER_ACCESS','PROVIDER_BAD_REQUEST','RESOURCE_MISSING','NO_BODY_PAGES','IMAGE_INVALID','MODEL_FAILURE','SAVE_FAILURE'])")
test = test.replace("expect(qc).toContain('data-a88-details')", "expect(qc).toContain('data-a88-details')\n        expect(qc).toContain(\"a88Api('/api/v1/visual/qc-state')\")\n        expect(qc).toContain(\"a88Post('/api/v1/visual/qc-state'\")\n        expect(qc).toContain(\"rating: rawRating === 'uncertain'\")\n        expect(qc).toContain('正文样本对比')\n        expect(qc).toContain(\"await import('./visual-runtime.js')\")")
test = test.replace("})\n", "    it('persists QC state through the SQLite-backed local server API', () => {\n        const server = read('src/library/server.ts')\n        expect(server).toContain(\"url.pathname === '/api/v1/visual/qc-state'\")\n        expect(server).toContain(\"'recommendation.visualQcState.v1'\")\n        expect(server).toContain('options.database.setAppState')\n    })\n})\n", 1)
write('test/unit/recommendation-v4-visual-qc-ui.test.ts', test)

# 4) Docs.
docs = read('docs/RECOMMENDATION_V4_VISUAL_BETA.md').rstrip() + "\n\n## Visual V1 QC round 2\n\n- QC ratings, failure classifications and the last Anchor are mirrored into SQLite `app_state`, with browser storage retained only as a fallback, so refresh/restart/port changes do not discard the audit state.\n- Pending diagnostics now distinguish HTTP 400/bad-request and missing resources, and run a no-save DINO dry-run after successful sampling to separate provider/page failures from image/model failures.\n- Human QC adds an explicit uncertain/skip state plus on-demand side-by-side body-page samples; formal P@K is withheld when the top-K contains unresolved uncertain ratings.\n"
write('docs/RECOMMENDATION_V4_VISUAL_BETA.md', docs)

print('Visual V1 QC round 2 patch staged')
