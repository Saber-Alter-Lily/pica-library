import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P2 H2B Visual analysis runtime instrumentation', () => {
    it('measures Visual analysis without inventing a foreground threshold', () => {
        const service = fs.readFileSync('src/library/service.ts', 'utf8')
        const timing = fs.readFileSync(
            'src/runtime/analysis-timing.ts',
            'utf8'
        )
        const server = fs.readFileSync('src/library/server.ts', 'utf8')

        expect(service).toContain('visualAnalysisRuntimeProfile()')
        expect(service).toContain(
            "'visual-representation-qc'"
        )
        expect(service).toContain("'visual-author-atlas'")
        expect(service).toContain("'visual-style-families'")
        expect(timing).toContain('foregroundThresholdMs: null')
        expect(timing).toContain("'MEASURE_BEFORE_THRESHOLD'")
        expect(server).toContain(
            '/api/v1/desktop/visual/runtime-profile'
        )
        expect(server).toContain(
            "error: 'Desktop control plane is unavailable'"
        )
    })

    it('keeps H2B read-only and separate from Visual serving activation', () => {
        const service = fs.readFileSync('src/library/service.ts', 'utf8')
        const benchmark = fs.readFileSync(
            'scripts/benchmark/visual-analysis-harness.ts',
            'utf8'
        )

        expect(service).not.toContain(
            'visualAnalysisTimings.measure(\n            \'visual-style-families\',\n            {\n                servingImpact: true'
        )
        expect(benchmark).toContain(
            'Synthetic scaling evidence only'
        )
        expect(benchmark).toContain(
            'Do not use CI wall time as the user-facing foreground/background threshold.'
        )
    })
})
