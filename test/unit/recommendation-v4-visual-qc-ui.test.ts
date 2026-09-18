import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => fs.readFileSync(path, 'utf8')

describe('Visual V1 QC beta surface', () => {
    it('loads the additive QC surface without rebuilding embeddings on startup', () => {
        const runtime = read('web/visual-runtime.js')
        const qc = read('web/visual-qc-beta.js')
        expect(runtime).toContain("import('./visual-qc-beta.js')")
        expect(qc).toContain("a88Api('/api/v1/visual/status')")
        expect(qc).toContain('/api/v1/visual/similar/')
        expect(qc).toContain('只读取已冻结的 Visual V1 embedding')
        const ensurePanelBody =
            /function a88EnsurePanel\(\) \{([\s\S]*?)\n\}/.exec(qc)?.[1] ?? ''
        expect(ensurePanelBody).not.toContain('a88RefreshPanel()')
        expect(ensurePanelBody).toContain('打开设置页不会自动扫描')
        expect(qc).not.toContain("post('/api/v1/visual/embedding'")
    })

    it('makes current sampling policy part of index and similarity identity', () => {
        const service = read('src/library/service.ts')
        expect(service.match(/samplingPolicyVersion === VISUAL_SAMPLING_POLICY_VERSION/g)?.length).toBeGreaterThanOrEqual(1)
        expect(service).toContain('item.samplingPolicyVersion !== VISUAL_SAMPLING_POLICY_VERSION')
    })

    it('ranks embeddings before fetching comic metadata to avoid the N+1 hot path', () => {
        const service = read('src/library/service.ts')
        const method = service.slice(service.indexOf('similarVisualStyle('), service.indexOf('\n    constructor(', service.indexOf('similarVisualStyle(')))
        expect(method.indexOf('.slice(0, maxResults)')).toBeGreaterThan(0)
        expect(method.indexOf('.slice(0, maxResults)')).toBeLessThan(method.indexOf('this.database.getComic(item.embedding.comicId)'))
        expect(method).toContain('sampleCount: item.embedding.sampleCount')
    })

    it('provides actionable pending diagnostics and persistent human QC ratings', () => {
        const qc = read('web/visual-qc-beta.js')
        expect(qc).toContain('pica-visual-qc-ratings-v1')
        expect(qc).toContain('pica-visual-index-failures-v1')
        for (const category of ['READY_TO_RETRY','NETWORK_TRANSIENT','PROVIDER_ACCESS','NO_BODY_PAGES','IMAGE_INVALID','MODEL_FAILURE','SAVE_FAILURE'])
            expect(qc).toContain(category)
        expect(qc).toContain('P@${k}(≥1)')
        expect(qc).toContain('data-a88-details')
    })
})
