import { describe, expect, it } from 'vitest'
import {
    VISUAL_CANDIDATE_COVERAGE_V5_VERSION
} from '../../src/recommendation-v5/visual-candidate-coverage'
import {
    VISUAL_ACTIVATION_GATE_V5_VERSION,
    evaluateVisualActivationGateV5
} from '../../src/recommendation-v5/visual-activation-gate'

function coverageTelemetry(
    batchCoverage: number,
    readyFraction: number
) {
    return {
        coverageVersion:
            VISUAL_CANDIDATE_COVERAGE_V5_VERSION,
        servingImpact: false,
        embeddingGenerationEnabled: false,
        candidatePersistenceEnabled: false,
        coverage: {
            diversifiedBatch: {
                coverage: batchCoverage
            }
        },
        budget: {
            readyFraction
        }
    }
}

function readyInput() {
    return {
        representationQc: {
            mode: 'READ_ONLY',
            rebuildPerformed: false,
            servingImpact: false,
            coverage: {
                favoriteCoverage: 0.95
            },
            pairwise: {
                sameAuthor: { count: 80 },
                differentAuthor: { count: 500 },
                authorSeparation: 0.08,
                providerEffectProxy: 0.01,
                sourceKindEffectProxy: 0.02
            },
            knn: {
                author: {
                    eligibleAnchors: 60,
                    top5HitRate: 0.6
                }
            }
        },
        authorAtlas: {
            mode: 'READ_ONLY',
            rebuildPerformed: false,
            servingImpact: false,
            visualRecallEnabled: false,
            styleFamilyServingEnabled: false,
            summary: {
                eligibleAuthorCount: 40
            }
        },
        styleFamilies: {
            mode: 'READ_ONLY',
            provisional: true,
            servingImpact: false,
            visualRecallEnabled: false,
            styleDiversityEnabled: false,
            summary: {
                prototypeNodeCount: 60,
                largestFamilyPrototypeCount: 12
            }
        },
        currentShadowModelVersion: 'v5-shadow/current',
        shadowRuns: [
            {
                modelVersion: 'v5-shadow/current',
                generatedAt: '2026-09-17T03:00:00.000Z',
                telemetry: {
                    visualCandidateCoverage:
                        coverageTelemetry(0.5, 0.4)
                }
            },
            {
                modelVersion: 'v5-shadow/current',
                generatedAt: '2026-09-17T02:00:00.000Z',
                telemetry: {
                    visualCandidateCoverage:
                        coverageTelemetry(0.6, 0.5)
                }
            },
            {
                modelVersion: 'v5-shadow/current',
                generatedAt: '2026-09-17T01:00:00.000Z',
                telemetry: {
                    visualCandidateCoverage:
                        coverageTelemetry(0.45, 0.35)
                }
            },
            {
                modelVersion: 'v5-shadow/old',
                generatedAt: '2026-09-16T01:00:00.000Z',
                telemetry: {
                    visualCandidateCoverage:
                        coverageTelemetry(1, 1)
                }
            }
        ]
    }
}

describe('Visual V1 activation review gate', () => {
    it('can only become ready for manual shadow review and never activates serving', () => {
        const result = evaluateVisualActivationGateV5(
            readyInput() as unknown as Parameters<
                typeof evaluateVisualActivationGateV5
            >[0]
        )
        expect(result.gateVersion).toBe(
            VISUAL_ACTIVATION_GATE_V5_VERSION
        )
        expect(result.verdict).toBe(
            'READY_FOR_SHADOW_REVIEW'
        )
        expect(result.nextPermittedStage).toBe(
            'SHADOW_REVIEW'
        )
        expect(result.autoActivation).toBe(false)
        expect(result.servingMutationEnabled).toBe(false)
        expect(result.embeddingGenerationEnabled).toBe(false)
        expect(result.visualRecallActivationEnabled).toBe(false)
        expect(result.styleDiversityActivationEnabled).toBe(false)
        expect(result.exactShadowRunCount).toBe(3)
        expect(result.coverageRunCount).toBe(3)
        expect(result.summary.requiredPassed).toBe(
            result.summary.requiredTotal
        )
        expect(
            result.criteria
                .filter((item) => item.required)
                .every((item) => item.status === 'PASS')
        ).toBe(true)
    })

    it('refuses review readiness when exact current coverage evidence is missing', () => {
        const input = readyInput()
        input.shadowRuns = input.shadowRuns.filter(
            (run) => run.modelVersion === 'v5-shadow/old'
        )
        const result = evaluateVisualActivationGateV5(
            input as unknown as Parameters<
                typeof evaluateVisualActivationGateV5
            >[0]
        )
        expect(result.verdict).toBe('NOT_READY')
        expect(result.nextPermittedStage).toBe('OFF')
        expect(result.coverageRunCount).toBe(0)
        expect(
            result.criteria.find(
                (item) => item.id === 'CANDIDATE_COVERAGE_RUNS'
            )
        ).toMatchObject({
            status: 'INSUFFICIENT',
            actual: 0
        })
        expect(
            result.criteria.find(
                (item) =>
                    item.id ===
                    'MEDIAN_DIVERSIFIED_BATCH_VISUAL_COVERAGE'
            )?.status
        ).toBe('INSUFFICIENT')
        expect(result.servingMutationEnabled).toBe(false)
    })

    it('fails safe when a supposedly shadow coverage run mutates serving', () => {
        const input = readyInput()
        input.shadowRuns[0].telemetry.visualCandidateCoverage = {
            ...coverageTelemetry(0.5, 0.4),
            servingImpact: true
        }
        const result = evaluateVisualActivationGateV5(
            input as unknown as Parameters<
                typeof evaluateVisualActivationGateV5
            >[0]
        )
        expect(result.verdict).toBe('NOT_READY')
        expect(
            result.criteria.find(
                (item) =>
                    item.id ===
                    'VISUAL_SHADOW_SAFETY_INVARIANTS'
            )
        ).toMatchObject({
            status: 'FAIL',
            actual: false
        })
    })
})
