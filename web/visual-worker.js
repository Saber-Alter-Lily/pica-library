let extractorPromise = null
let extractorKey = ''

function post(id, type, payload = {}, transfer = []) {
    self.postMessage({ id, type, ...payload }, transfer)
}

function errorPayload(error) {
    return {
        name: String(error?.name || 'Error'),
        message: String(error?.message || error || 'Visual worker failed')
    }
}

async function loadExtractor(runtime, id) {
    const key = [runtime.libraryUrl, runtime.modelId].join('\n')
    if (extractorKey !== key) {
        extractorPromise = null
        extractorKey = key
    }
    if (!extractorPromise) {
        extractorPromise = (async () => {
            const transformers = await import(runtime.libraryUrl)
            const options = {
                progress_callback: () =>
                    post(id, 'progress', { progress: { phase: 'model' } })
            }
            try {
                return await transformers.pipeline(
                    'image-feature-extraction',
                    runtime.modelId,
                    { ...options, dtype: 'q8' }
                )
            } catch {
                return transformers.pipeline(
                    'image-feature-extraction',
                    runtime.modelId,
                    options
                )
            }
        })().catch((error) => {
            extractorPromise = null
            extractorKey = ''
            throw error
        })
    }
    return extractorPromise
}

function serializableOutput(output) {
    let value = output
    if (Array.isArray(value) && value.length === 1) value = value[0]
    if (value?.data) {
        const data = Float32Array.from(value.data, Number)
        return {
            value: {
                data,
                dims: Array.isArray(value.dims) ? value.dims.map(Number) : []
            },
            transfer: [data.buffer]
        }
    }
    if (Array.isArray(value)) return { value, transfer: [] }
    throw new Error('视觉模型没有返回可读取的 embedding')
}

self.addEventListener('message', async (event) => {
    const input = event.data || {}
    if (input.type !== 'analyze' || !input.id) return
    const id = input.id
    try {
        const extractor = await loadExtractor(input.runtime, id)
        post(id, 'ready')
        const samples = Array.isArray(input.samples) ? input.samples : []
        for (let index = 0; index < samples.length; index++) {
            const sample = samples[index]
            post(id, 'page-start', {
                current: index + 1,
                total: samples.length,
                sample
            })
            const output = await extractor(sample.url)
            const serialized = serializableOutput(output)
            post(
                id,
                'page-result',
                {
                    current: index + 1,
                    total: samples.length,
                    output: serialized.value
                },
                serialized.transfer
            )
        }
        post(id, 'complete')
    } catch (error) {
        post(id, 'error', { error: errorPayload(error) })
    }
})
