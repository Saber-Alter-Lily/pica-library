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

function tensorVector(output) {
    let value = output
    if (Array.isArray(value) && value.length === 1) value = value[0]
    if (value?.tolist && !value.data) value = value.tolist()
    if (value?.data) {
        const data = Array.from(value.data, Number)
        const dims = Array.isArray(value.dims) ? value.dims.map(Number) : []
        const dimension = dims.at(-1) || 384
        if (data.length === dimension) return l2(data)
        if (data.length % dimension !== 0)
            throw new Error('视觉模型输出维度无法识别')
        const tokens = data.length / dimension
        const averaged = Array.from({ length: dimension }, () => 0)
        // DINO output normally contains CLS plus patch tokens. Averaging patch tokens
        // reduces dependence on a single semantic object and better represents style.
        const firstToken = tokens > 1 ? 1 : 0
        const count = Math.max(1, tokens - firstToken)
        for (let token = firstToken; token < tokens; token++)
            for (let index = 0; index < dimension; index++)
                averaged[index] += data[token * dimension + index] / count
        return l2(averaged)
    }
    if (Array.isArray(value)) {
        const flat = value.flat(Infinity).map(Number)
        if (flat.length === 384) return l2(flat)
        if (flat.length > 384 && flat.length % 384 === 0) {
            const vectors = []
            for (let offset = 0; offset < flat.length; offset += 384)
                vectors.push(l2(flat.slice(offset, offset + 384)))
            return mean(vectors.slice(vectors.length > 1 ? 1 : 0))
        }
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
    const vectors = []
    for (let index = 0; index < usable.length; index++) {
        const sample = usable[index]
        onProgress?.({ phase: 'page', current: index + 1, total: usable.length, sample })
        const output = await extractor(new URL(sample.url, location.origin).toString())
        vectors.push(tensorVector(output))
    }
    const vector = aggregateVisualPages(vectors)
    return {
        vector,
        dimension: vector.length,
        sampleCount: vectors.length,
        modelId: VISUAL_RUNTIME.modelId,
        modelVersion: VISUAL_RUNTIME.modelVersion,
        samplingPolicyVersion: VISUAL_RUNTIME.samplingPolicyVersion
    }
}

export function resetVisualRuntimeForTest() {
    extractorPromise = null
}
