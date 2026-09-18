import { describe, expect, it } from 'vitest'
import type { UserEvent } from '../../src/recommendation-v3/types'
import {
    RETROSPECTIVE_BENCHMARK_V5_VERSION,
    buildRetrospectiveBenchmarkV5,
    type BenchmarkShadowRunV5
} from '../../src/recommendation-v5/retrospective-benchmark'

function event(
    eventType: UserEvent['eventType'],
    comicId: string,
    occurredAt: string
): UserEvent {
    return {
        id: eventType + ':' + comicId + ':' + occurredAt,
        occurredAt,
        eventType,
        comicId,
        source: 'test',
        appSessionId: null,
        contextId: null,
        recommendationCycleId: null,
        recommendationSessionId: null,
        recommendationBatchIndex: null,
        rankPosition: null,
        metadata: {},
        dedupeKey: null,
        createdAt: occurredAt
    }
}

function run(
    generatedAt: string,
    modelVersion = 'v5-shadow/current'
): BenchmarkShadowRunV5 {
    return {
        modelVersion,
        generatedAt,
        candidateIds: ['a', 'b', 'c', 'd'],
        telemetry: {
            sessionMode: 'DEFAULT',
            rankedEvidence: [
                { comicId: 'a', rank: 1 },
                { comicId: 'b', rank: 2 },
                { comicId: 'c', rank: 3 },
                { comicId: 'd', rank: 4 }
            ],
            diversifiedBatch: [
                { comicId: 'a', batchRank: 1 },
                { comicId: 'b', batchRank: 2 },
                { comicId: 'd', batchRank: 3 }
            ],
            correctnessAudit: {
                pass: true,
                rankedPool: { totalLeakage: 0 },
                diversifiedBatch: { totalLeakage: 0 }
            },
            diversityTelemetry: {
                selectedConcentration: {
                    authorMaxShare: 0.33,
                    fandomMaxShare: 0.33,
                    tagMaxShare: 0.67
                }
            }
        }
    }
}

describe('Recommendation V5 retrospective benchmark', () => {
    it('uses only future positive evidence within the horizon and excludes old model runs', () => {
        const result = buildRetrospectiveBenchmarkV5({
            runs: [
                run('2026-09-01T00:00:00.000Z'),
                run(
                    '2026-09-01T00:00:00.000Z',
                    'v5-shadow/old'
                )
            ],
            events: [
                event(
                    'favorite_add',
                    'b',
                    '2026-09-02T00:00:00.000Z'
                ),
                event(
                    'recommend_dislike',
                    'a',
                    '2026-09-03T00:00:00.000Z'
                ),
                event(
                    'recommend_like',
                    'c',
                    '2026-10-15T00:00:00.000Z'
                ),
                event(
                    'favorite_add',
                    'd',
                    '2026-08-31T23:59:59.000Z'
                )
            ],
            currentModelVersion: 'v5-shadow/current',
            catalogSize: 100,
            horizonDays: 30
        })

        expect(result.benchmarkVersion).toBe(
            RETROSPECTIVE_BENCHMARK_V5_VERSION
        )
        expect(result.mode).toBe('READ_ONLY')
        expect(result.servingImpact).toBe(false)
        expect(result.support).toMatchObject({
            exactRunCount: 1,
            evaluableRunCount: 1,
            positiveEventCountAcrossWindows: 1,
            negativeEventCountAcrossWindows: 1
        })
        expect(result.accuracy.ranked).toMatchObject({
            hit5: 1,
            recall5: 1,
            precision5: 0.25
        })
        expect(
            result.accuracy.ranked.ndcg5
        ).toBeCloseTo(1 / Math.log2(3), 6)
        expect(
            result.correctness.meanNegativeLeakageAt12
        ).toBe(0.25)
        expect(
            result.correctness.meanBatchNegativeLeakageAt12
        ).toBeCloseTo(1 / 3, 6)
        expect(result.correctness.auditedRunPassRate).toBe(1)
        expect(result.diversity.itemCoverage).toMatchObject({
            distinctRecommendedItems: 3,
            catalogSize: 100,
            coverage: 0.03
        })
    })

    it('reports insufficient future support without inventing accuracy or discovery evidence', () => {
        const result = buildRetrospectiveBenchmarkV5({
            runs: [run('2026-09-01T00:00:00.000Z')],
            events: [],
            currentModelVersion: 'v5-shadow/current',
            catalogSize: 100
        })
        expect(result.support.evaluableRunCount).toBe(0)
        expect(result.accuracy.ranked.hit12).toBe(0)
        expect(result.discovery.exploreHitRateAt12).toBeNull()
        expect(result.discovery.serendipity).toBe(
            'NOT_YET_IDENTIFIABLE_WITH_CURRENT_LOGS'
        )
        expect(result.discovery.longTailCoverage).toBe(
            'NOT_YET_IDENTIFIABLE_WITH_CURRENT_LOGS'
        )
    })

    it('reports EXPLORE acceptance only from evaluable explore runs', () => {
        const explore = run('2026-09-01T00:00:00.000Z')
        explore.telemetry.sessionMode = 'EXPLORE'
        const result = buildRetrospectiveBenchmarkV5({
            runs: [explore],
            events: [
                event(
                    'reader_complete',
                    'b',
                    '2026-09-02T00:00:00.000Z'
                )
            ],
            currentModelVersion: 'v5-shadow/current',
            catalogSize: 10
        })
        expect(result.discovery).toMatchObject({
            exploreEvaluableRunCount: 1,
            exploreHitRateAt12: 1
        })
    })
})
