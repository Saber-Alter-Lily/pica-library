export const VISUAL_RUNTIME = Object.freeze({
    libraryUrl: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm',
    modelId: 'onnx-community/dinov2-small',
    modelVersion: 'dinov2-small-transformersjs-4.2.0',
    samplingPolicyVersion: 'v1-spread-6-body-pages'
})

let extractorPromise = null

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
    for (let index = 0; index < left.length; index++) value += left[index] * right[index]
    return value
}

function mean(vectors) {
    if (!vectors.length) throw new Error('没有可聚合的视觉向量')
    const output = Array.from({ length: vectors[0].length }, () => 0)
    for (const vector of vectors) {
        if (vector.length !== output.length) throw new Error('视觉向量维度不一致')
        for (let index = 0; index < output.length; index++) output[index] += vector[index]
    }
    return l2(output.map((value) => value / vectors.length))
}

export function aggregateVisualPages(vectors) {
    const normalized = vectors.map(l2)
    if (normalized.length <= 2) return mean(normalized)
    const center = mean(normalized)
    const ranked = normalized
        .map((vector, index) => ({ vector, index, similarity: cosine(vector, center) }))
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
        return fromFlat(flat, flat.length >= 384 && flat.length % 384 === 0 ? 384 : flat.length)
    }
    throw new Error('视觉模型没有返回可读取的 embedding')
}
async function loadExtractor(onProgress) {
    if (!extractorPromise)
        extractorPromise = (async () => {
            const transformers = await import(VISUAL_RUNTIME.libraryUrl)
            const options = {
                progress_callback: (event) => onProgress?.({ phase: 'model', event })
            }
            try {
                return await transformers.pipeline(
                    'image-feature-extraction',
                    VISUAL_RUNTIME.modelId,
                    { ...options, dtype: 'q8' }
                )
            } catch {
                return transformers.pipeline(
                    'image-feature-extraction',
                    VISUAL_RUNTIME.modelId,
                    options
                )
            }
        })()
    return extractorPromise
}

export async function analyzeVisualSamples(samples, onProgress) {
    const usable = (samples || []).filter((sample) => sample?.url).slice(0, 6)
    if (!usable.length) throw new Error('没有可用于画风分析的页面')
    const extractor = await loadExtractor(onProgress)
    const clsPages = []
    const patchMeanPages = []
    let tokenCount = 0
    for (let index = 0; index < usable.length; index++) {
        const sample = usable[index]
        onProgress?.({ phase: 'page', current: index + 1, total: usable.length, sample })
        const output = await extractor(new URL(sample.url, location.origin).toString())
        const views = tensorViews(output)
        clsPages.push(views.cls)
        patchMeanPages.push(views.patchMean)
        tokenCount = Math.max(tokenCount, Number(views.tokenCount || 0))
    }
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

export function resetVisualRuntimeForTest() {
    extractorPromise = null
}
// Visual V1 QC is an additive beta surface; it never rebuilds embeddings on load.
void import('./visual-qc-beta.js').catch(() => undefined)
