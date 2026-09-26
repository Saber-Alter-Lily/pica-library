import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P2 J10 real Visual indexing foreground harness', () => {
    const harness = () => fs.readFileSync('scripts/benchmark/desktop-visual-index-harness.mjs','utf8')
    it('locks the actual product model/worker contract', () => {
        const runtime=fs.readFileSync('web/visual-runtime.js','utf8')
        const worker=fs.readFileSync('web/visual-worker.js','utf8')
        expect(runtime).toContain('@huggingface/transformers@4.2.0')
        expect(runtime).toContain("modelId: 'onnx-community/dinov2-small'")
        expect(runtime).toContain("new Worker(new URL('./visual-worker.js', import.meta.url)")
        expect(worker).toContain("'image-feature-extraction'")
        expect(harness()).toContain("productionWorker:'web/visual-worker.js'")
    })
    it('never fabricates a backend cpu-model task', () => {
        expect(harness()).not.toContain('RuntimeResourceCoordinator')
        expect(harness()).not.toContain("taskType:'cpu-model'")
        expect(harness()).toContain('noSyntheticCpuModelLease:true')
    })
    it('requires explicit real model network with no synthetic CI inference', () => {
        expect(harness()).toContain('--allow-model-network')
        expect(harness()).toContain('there is no synthetic inference mode')
        expect(harness()).toContain('without observing Transformers.js/model network traffic')
    })
    it('keeps foreground timing separate from bootstrap evidence and budgets', () => {
        expect(harness()).toContain('navSwitchToUsableMs')
        expect(harness()).toContain('rafIntervalMs')
        expect(harness()).toContain('firstEmbeddingElapsedMs')
        expect(harness()).toContain('no P2-K budget is selected')
    })
})
