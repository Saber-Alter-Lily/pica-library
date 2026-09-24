import { describe, expect, it } from 'vitest'
import { AnalysisTimingRegistry } from '../../src/runtime/analysis-timing'

describe('analysis timing registry', () => {
    it('records bounded Visual analysis timings without inventing a foreground threshold', () => {
        const registry = new AnalysisTimingRegistry(3)
        for (let index = 0; index < 4; index++)
            registry.measure(
                'visual-representation-qc',
                {
                    catalogCount: 100 + index,
                    embeddingCount: 80 + index,
                    parameters: { maxAnchors: 20 }
                },
                () => index
            )

        const snapshot = registry.snapshot()
        expect(snapshot.mode).toBe('OBSERVE_ONLY')
        expect(snapshot.foregroundThresholdMs).toBeNull()
        expect(snapshot.disposition).toBe('MEASURE_BEFORE_THRESHOLD')
        expect(snapshot.sampleCount).toBe(3)
        expect(
            snapshot.byKind['visual-representation-qc'].count
        ).toBe(3)
        expect(
            snapshot.byKind['visual-representation-qc'].last?.catalogCount
        ).toBe(103)
        expect(snapshot.byKind['visual-author-atlas'].count).toBe(0)
    })

    it('records failures but rethrows them to preserve analysis semantics', () => {
        const registry = new AnalysisTimingRegistry()
        expect(() =>
            registry.measure(
                'visual-style-families',
                {
                    catalogCount: 12,
                    embeddingCount: 10
                },
                () => {
                    throw new Error('fixture failure')
                }
            )
        ).toThrow('fixture failure')

        const snapshot = registry.snapshot()
        expect(snapshot.recent[0]).toMatchObject({
            kind: 'visual-style-families',
            outcome: 'failed',
            error: 'fixture failure'
        })
        expect(snapshot.byKind['visual-style-families'].count).toBe(0)
    })
})
