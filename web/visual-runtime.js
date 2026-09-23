export const VISUAL_RUNTIME = Object.freeze({
    libraryUrl: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm',
    modelId: 'onnx-community/dinov2-small',
    modelVersion: 'dinov2-small-transformersjs-4.2.0',
    samplingPolicyVersion: 'v1-spread-6-body-pages'
})

const MODEL_LOAD_TIMEOUT_MS = 120000
const PAGE_ANALYSIS_TIMEOUT_MS = 45000
let visualWorker = null
let visualRequestId = 0
let visualBusy = false

function l2(values) {
    const vector = Array.from(values, Number)
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
    if (!Number.isFinite(norm) || norm < 1e-8)
        throw new Error('视觉模型返回了无效向量')
    return vector.map((value) => value / norm)
}

function cosine(left, right) {
    if (!left.length || left.length !== right.length) return 0
    let value = 0
    for (let index = 0; index < left.length; index++)
        value += left[index] * right[index]
    return value
}

function mean(vectors) {
    if (!vectors.length) throw new Error('没有可聚合的视觉向量')
    const output = Array.from({ length: vectors[0].length }, () => 0)
    for (const vector of vectors) {
        if (vector.length !== output.length)
            throw new Error('视觉向量维度不一致')
        for (let index = 0; index < output.length; index++)
            output[index] += vector[index]
    }
    return l2(output.map((value) => value / vectors.length))
}

export function aggregateVisualPages(vectors) {
    const normalized = vectors.map(l2)
    if (normalized.length <= 2) return mean(normalized)
    const center = mean(normalized)
    const ranked = normalized
        .map((vector, index) => ({
            vector,
            index,
            similarity: cosine(vector, center)
        }))
        .sort((a, b) => a.similarity - b.similarity || a.index - b.index)
    const drop = Math.max(0, Math.floor(normalized.length * 0.2))
    return mean(ranked.slice(drop).map((row) => row.vector))
}

function tensorViews(output) {
    let value = output
    if (Array.isArray(value) && value.length === 1) value = value[0]
    const fromFlat = (flat, dimension, dims = []) => {
        if (!dimension || flat.length % dimension !== 0)
            throw new Error('视觉模型输出维度无法识别')
        const tokens = flat.length / dimension
        if (tokens <= 1) {
            const vector = l2(flat.slice(0, dimension))
            return { cls: vector, patchMean: vector, tokenCount: tokens, dims }
        }
        const cls = l2(flat.slice(0, dimension))
        const averaged = Array.from({ length: dimension }, () => 0)
        const count = tokens - 1
        for (let token = 1; token < tokens; token++)
            for (let index = 0; index < dimension; index++)
                averaged[index] += flat[token * dimension + index] / count
        return {
            cls,
            patchMean: l2(averaged),
            tokenCount: tokens,
            dims
        }
    }
    if (value?.data) {
        const data = Array.from(value.data, Number)
        const dims = Array.isArray(value.dims) ? value.dims.map(Number) : []
        const dimension = dims.at(-1) || 384
        return fromFlat(data, dimension, dims)
    }
    if (Array.isArray(value)) {
        const flat = value.flat(Infinity).map(Number)
        return fromFlat(
            flat,
            flat.length >= 384 && flat.length % 384 === 0
                ? 384
                : flat.length
        )
    }
    throw new Error('视觉模型没有返回可读取的 embedding')
}

function ensureVisualWorker() {
    if (visualWorker) return visualWorker
    if (typeof Worker === 'undefined')
        throw new Error('当前浏览器不支持后台画风分析')
    visualWorker = new Worker(new URL('./visual-worker.js', import.meta.url), {
        type: 'module'
    })
    return visualWorker
}

function terminateVisualWorker(target = visualWorker) {
    if (!target) return
    target.terminate()
    if (visualWorker === target) visualWorker = null
}

function abortError() {
    const error = new Error('画风分析已取消')
    error.name = 'AbortError'
    return error
}

function analysisResult(clsPages, patchMeanPages, tokenCount) {
    const patchMeanVector = aggregateVisualPages(patchMeanPages)
    const globalClsVector = aggregateVisualPages(clsPages)
    return {
        // Backward-compatible serving vector. Visual V1 has always used
        // patch-token mean per page followed by robust multi-page aggregation.
        vector: patchMeanVector,
        dimension: patchMeanVector.length,
        sampleCount: patchMeanPages.length,
        modelId: VISUAL_RUNTIME.modelId,
        modelVersion: VISUAL_RUNTIME.modelVersion,
        samplingPolicyVersion: VISUAL_RUNTIME.samplingPolicyVersion,
        representations: {
            version: 'visual-representation-v2-cls-patchmean-shadow',
            globalCls: {
                vector: globalClsVector,
                dimension: globalClsVector.length
            },
            patchMean: {
                vector: patchMeanVector,
                dimension: patchMeanVector.length
            },
            tokenCount
        }
    }
}

export async function analyzeVisualSamples(
    samples,
    onProgress,
    { signal } = {}
) {
    const usable = (samples || []).filter((sample) => sample?.url).slice(0, 6)
    if (!usable.length) throw new Error('没有可用于画风分析的页面')
    if (signal?.aborted) throw abortError()
    if (visualBusy) throw new Error('画风分析任务正在运行')
    visualBusy = true
    try {
        const worker = ensureVisualWorker()
        const id = ++visualRequestId
        const clsPages = []
        const patchMeanPages = []
        let tokenCount = 0
        return await new Promise((resolve, reject) => {
            let timer = null
            let settled = false

            const clearTimer = () => {
                if (timer) window.clearTimeout(timer)
                timer = null
            }
            const cleanup = () => {
                clearTimer()
                worker.removeEventListener('message', onMessage)
                worker.removeEventListener('error', onWorkerError)
                worker.removeEventListener('messageerror', onMessageError)
                signal?.removeEventListener('abort', onAbort)
            }
            const fail = (error, terminate = false) => {
                if (settled) return
                settled = true
                cleanup()
                if (terminate) terminateVisualWorker(worker)
                reject(error)
            }
            const succeed = () => {
                if (settled) return
                settled = true
                cleanup()
                try {
                    resolve(
                        analysisResult(
                            clsPages,
                            patchMeanPages,
                            tokenCount
                        )
                    )
                } catch (error) {
                    reject(error)
                }
            }
            const armTimeout = (milliseconds, message) => {
                clearTimer()
                timer = window.setTimeout(
                    () => fail(new Error(message), true),
                    milliseconds
                )
            }
            const onAbort = () => fail(abortError(), true)
            const onWorkerError = (event) =>
                fail(
                    new Error(
                        event?.message || '画风分析后台线程异常停止'
                    ),
                    true
                )
            const onMessageError = () =>
                fail(new Error('画风分析后台线程返回了无效数据'), true)
            const onMessage = (event) => {
                const message = event.data || {}
                if (message.id !== id) return
                if (message.type === 'progress') {
                    onProgress?.(message.progress)
                    return
                }
                if (message.type === 'ready') {
                    clearTimer()
                    return
                }
                if (message.type === 'page-start') {
                    onProgress?.({
                        phase: 'page',
                        current: message.current,
                        total: message.total,
                        sample: message.sample
                    })
                    armTimeout(
                        PAGE_ANALYSIS_TIMEOUT_MS,
                        '单页画风分析超时，已停止当前后台推理'
                    )
                    return
                }
                if (message.type === 'page-result') {
                    clearTimer()
                    try {
                        const views = tensorViews(message.output)
                        clsPages.push(views.cls)
                        patchMeanPages.push(views.patchMean)
                        tokenCount = Math.max(
                            tokenCount,
                            Number(views.tokenCount || 0)
                        )
                    } catch (error) {
                        fail(error, true)
                    }
                    return
                }
                if (message.type === 'error') {
                    const error = new Error(
                        message.error?.message || '画风分析失败'
                    )
                    error.name = message.error?.name || 'Error'
                    fail(error, true)
                    return
                }
                if (message.type === 'complete') succeed()
            }

            worker.addEventListener('message', onMessage)
            worker.addEventListener('error', onWorkerError)
            worker.addEventListener('messageerror', onMessageError)
            signal?.addEventListener('abort', onAbort, { once: true })
            armTimeout(
                MODEL_LOAD_TIMEOUT_MS,
                '视觉模型加载超时，请检查网络后重试'
            )
            try {
                worker.postMessage({
                    id,
                    type: 'analyze',
                    runtime: VISUAL_RUNTIME,
                    samples: usable.map((sample) => ({
                        ...sample,
                        url: new URL(sample.url, location.origin).toString()
                    }))
                })
            } catch (error) {
                fail(error, true)
            }
        })
    } finally {
        visualBusy = false
    }
}

export function resetVisualRuntimeForTest() {
    terminateVisualWorker()
    visualBusy = false
}
// Visual V1 QC is an additive beta surface; it never rebuilds embeddings on load.
void import('./visual-qc.js').catch(() => undefined)
