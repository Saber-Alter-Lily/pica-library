import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) =>
    fs.readFileSync(path.join(root, file), 'utf8')

describe('Recommendation V5 evaluation dashboard', () => {
    it('loads evaluation data automatically but never auto-runs shadow retrieval', () => {
        const dashboard = read(
            'web/recommendation-v5-evaluation.js'
        )
        expect(dashboard).toContain('void evalLoad()')
        expect(dashboard).toContain('async function evalRunShadow()')
        expect(dashboard).not.toContain('void evalRunShadow()')
        expect(dashboard).toContain(
            "panel.querySelector('#v5-eval-run-shadow').onclick"
        )
    })

    it('requires Desktop CSRF and explicit shadow confirmation for manual runs', () => {
        const dashboard = read(
            'web/recommendation-v5-evaluation.js'
        )
        expect(dashboard).toContain(
            "evalRequest('/api/v1/desktop/status')"
        )
        expect(dashboard).toContain("'x-pica-csrf'")
        expect(dashboard).toContain(
            "'RUN_RECOMMENDATION_V5_SHADOW_RETRIEVAL'"
        )
        expect(dashboard).toContain(
            '/api/v1/desktop/recommendation-v5/shadow-retrieval'
        )
    })

    it('surfaces the fixed P3/P4/P5 evidence instead of an opaque score', () => {
        const dashboard = read(
            'web/recommendation-v5-evaluation.js'
        )
        expect(dashboard).toContain('P3 工程 Gate')
        expect(dashboard).toContain('P4 Visual Gate')
        expect(dashboard).toContain('Batch Precision@12')
        expect(dashboard).toContain('Batch Recall@12')
        expect(dashboard).toContain('Batch NDCG@12')
        expect(dashboard).toContain('Correctness')
        expect(dashboard).toContain('Catalog Coverage')
        expect(dashboard).toContain('Steerability')
        expect(dashboard).toContain('高级学习')
    })
})
