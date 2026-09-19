import { describe, expect, it } from 'vitest'
import {
    evaluateP3PromotionGateV5,
    P3_PROMOTION_GATE_V5_VERSION
} from '../../src/recommendation-v5/promotion-gate'

const MODEL =
    'v5-shadow/planner/session/compiler/retrieval/hygiene/ranker/allocator'

function goodRun(
    index: number,
    input: {
        mode?: string
        modelVersion?: string
        failedRoutes?: number
        removalRate?: number
        authorShare?: number
        fandomShare?: number
        tagShare?: number
        relevanceDelta?: number
        candidateCount?: number
        batchSize?: number
        servingImpact?: boolean
        persistCandidates?: boolean
    } = {}
) {
    const candidateCount = input.candidateCount ?? 60
    const failedRoutes = input.failedRoutes ?? 1
    const routeCount = 8
    return {
        modelVersion: input.modelVersion ?? MODEL,
        generatedAt: `2026-09-${String(10 + index).padStart(
            2,
            '0'
        )}T12:00:00.000Z`,
        candidateIds: Array.from(
            { length: candidateCount },
            (_, i) => `comic-${index}-${i}`
        ),
        telemetry: {
            sessionMode: input.mode ?? 'DEFAULT',
            servingImpact: input.servingImpact ?? false,
            persistCandidates: input.persistCandidates ?? false,
            rankedCandidateCount: candidateCount,
            retrievalTelemetry: {
                routes: Array.from({ length: routeCount }, (_, i) => ({
                    routeId: `route-${i}`,
                    status:
                        i < failedRoutes ? 'FAILED' : 'SUCCESS'
                }))
            },
            hygieneTelemetry: {
                removalRate: input.removalRate ?? 0.3
            },
            diversifiedBatch: Array.from(
                { length: input.batchSize ?? 12 },
                (_, i) => ({ comicId: `batch-${index}-${i}` })
            ),
            diversityTelemetry: {
                selectedConcentration: {
                    authorMaxShare: input.authorShare ?? 0.25,
                    fandomMaxShare: input.fandomShare ?? 0.4,
                    tagMaxShare: input.tagShare ?? 0.5
                },
                meanRelevanceDelta: input.relevanceDelta ?? -0.04
            }
        }
    }
}

describe('Recommendation V5 P3 promotion review gate', () => {
    it('stays NOT_READY when repeated DEFAULT shadow evidence is missing', () => {
        const result = evaluateP3PromotionGateV5([], MODEL)
        expect(result.gateVersion).toBe(
            P3_PROMOTION_GATE_V5_VERSION
        )
        expect(result.verdict).toBe('NOT_READY')
        expect(result.autoPromotion).toBe(false)
        expect(result.servingMutationEnabled).toBe(false)
        expect(result.defaultRunCount).toBe(0)
        expect(result.criteria).toEqual([
            expect.objectContaining({
                id: 'DEFAULT_RUN_COUNT',
                status: 'INSUFFICIENT',
                actual: 0
            })
        ])
    })

    it('can only advance a healthy exact-model shadow history to manual review', () => {
        const result = evaluateP3PromotionGateV5(
            [
                goodRun(1),
                goodRun(2),
                goodRun(3),
                goodRun(4, { mode: 'RECENT' }),
                goodRun(5, { mode: 'EXPLORE' }),
                goodRun(6, {
                    modelVersion: 'old-v5-shadow-model'
                })
            ],
            MODEL
        )
        expect(result.verdict).toBe(
            'READY_FOR_MANUAL_REVIEW'
        )
        expect(result.autoPromotion).toBe(false)
        expect(result.servingMutationEnabled).toBe(false)
        expect(result.exactRunCount).toBe(5)
        expect(result.defaultRunCount).toBe(3)
        expect(result.modeCoverage).toMatchObject({
            DEFAULT: 3,
            RECENT: 1,
            EXPLORE: 1
        })
        expect(
            result.criteria.every(
                (criterion) => criterion.status === 'PASS'
            )
        ).toBe(true)
    })

    it('rejects high provider failure, overconcentration, or excessive relevance loss', () => {
        const result = evaluateP3PromotionGateV5(
            [
                goodRun(1, {
                    failedRoutes: 4,
                    authorShare: 0.5,
                    fandomShare: 0.75,
                    tagShare: 0.8,
                    relevanceDelta: -0.25
                }),
                goodRun(2, {
                    failedRoutes: 4,
                    authorShare: 0.5,
                    fandomShare: 0.75,
                    tagShare: 0.8,
                    relevanceDelta: -0.25
                }),
                goodRun(3, {
                    failedRoutes: 4,
                    authorShare: 0.5,
                    fandomShare: 0.75,
                    tagShare: 0.8,
                    relevanceDelta: -0.25
                })
            ],
            MODEL
        )
        expect(result.verdict).toBe('NOT_READY')
        const byId = new Map(
            result.criteria.map((item) => [item.id, item])
        )
        expect(byId.get('MEDIAN_FAILED_ROUTE_RATE')?.status).toBe(
            'FAIL'
        )
        expect(byId.get('MEDIAN_AUTHOR_MAX_SHARE')?.status).toBe(
            'FAIL'
        )
        expect(byId.get('MEDIAN_FANDOM_MAX_SHARE')?.status).toBe(
            'FAIL'
        )
        expect(byId.get('MEDIAN_TAG_MAX_SHARE')?.status).toBe(
            'FAIL'
        )
        expect(byId.get('MEDIAN_RELEVANCE_DELTA')?.status).toBe(
            'FAIL'
        )
    })

    it('rejects shadow histories that mutated serving or candidate persistence', () => {
        const result = evaluateP3PromotionGateV5(
            [
                goodRun(1),
                goodRun(2),
                goodRun(3, {
                    servingImpact: true,
                    persistCandidates: true
                })
            ],
            MODEL
        )
        expect(result.verdict).toBe('NOT_READY')
        expect(
            result.criteria.find(
                (item) =>
                    item.id === 'SHADOW_SAFETY_INVARIANTS'
            )
        ).toMatchObject({
            status: 'FAIL',
            actual: false
        })
    })

    it('requires a complete diversified batch and enough post-hygiene candidates in every DEFAULT run', () => {
        const result = evaluateP3PromotionGateV5(
            [
                goodRun(1, {
                    candidateCount: 10,
                    batchSize: 10
                }),
                goodRun(2, {
                    candidateCount: 10,
                    batchSize: 10
                }),
                goodRun(3, {
                    candidateCount: 10,
                    batchSize: 10
                })
            ],
            MODEL
        )
        expect(result.verdict).toBe('NOT_READY')
        const byId = new Map(
            result.criteria.map((item) => [item.id, item])
        )
        expect(byId.get('MIN_CANDIDATES_EACH_RUN')?.status).toBe(
            'FAIL'
        )
        expect(
            byId.get('MEDIAN_RANKED_CANDIDATES')?.status
        ).toBe('FAIL')
        expect(
            byId.get('FULL_DIVERSIFIED_BATCH_EACH_RUN')?.status
        ).toBe('FAIL')
    })
})
