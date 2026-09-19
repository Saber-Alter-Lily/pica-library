import { describe, expect, it } from 'vitest'
import {
    BENCHMARK_COMPARISON_V5_VERSION,
    compareRetrospectiveBenchmarksV5
} from '../../src/recommendation-v5/benchmark-comparison'

function metrics(input: {
    precision12: number
    recall12: number
    ndcg12: number
    hit12: number
    mrr: number
}) {
    return {
        precision5: 0,
        precision12: input.precision12,
        precision20: 0,
        precision50: 0,
        recall5: 0,
        recall12: input.recall12,
        recall20: 0,
        recall50: 0,
        hit5: 0,
        hit12: input.hit12,
        hit20: 0,
        hit50: 0,
        ndcg5: 0,
        ndcg12: input.ndcg12,
        ndcg20: 0,
        ndcg50: 0,
        mrr: input.mrr,
        meanRank: 0,
        medianRank: 0
    }
}

function benchmark(
    modelVersion: string,
    input: {
        exactRuns?: number
        evaluableRuns?: number
        correctnessRuns?: number
        precision12?: number
        recall12?: number
        ndcg12?: number
        hit12?: number
        mrr?: number
        authorShare?: number
        fandomShare?: number
        tagShare?: number
        coverage?: number
        exploreHit?: number | null
    } = {}
) {
    const score = metrics({
        precision12: input.precision12 ?? 0.2,
        recall12: input.recall12 ?? 0.3,
        ndcg12: input.ndcg12 ?? 0.4,
        hit12: input.hit12 ?? 0.5,
        mrr: input.mrr ?? 0.25
    })
    return {
        mode: 'READ_ONLY',
        benchmarkVersion: 'retrospective-benchmark-v1',
        modelVersion,
        servingImpact: false,
        groundTruth: 'FUTURE_LIKE_FAVORITE_OR_READER_COMPLETE',
        horizonDays: 30,
        support: {
            exactRunCount: input.exactRuns ?? 3,
            evaluableRunCount: input.evaluableRuns ?? 3,
            runWithCorrectnessAuditCount:
                input.correctnessRuns ?? 3,
            positiveEventCountAcrossWindows: 6,
            negativeEventCountAcrossWindows: 1
        },
        correctness: {
            auditedRunPassRate: 1,
            totalRankedLeakage: 0,
            totalBatchLeakage: 0,
            meanNegativeLeakageAt12: 0,
            meanBatchNegativeLeakageAt12: 0
        },
        accuracy: {
            ranked: score,
            diversifiedBatch: score
        },
        diversity: {
            medianAuthorMaxShare: input.authorShare ?? 0.25,
            medianFandomMaxShare: input.fandomShare ?? 0.35,
            medianTagMaxShare: input.tagShare ?? 0.45,
            itemCoverage: {
                distinctRecommendedItems: 100,
                catalogSize: 1000,
                coverage: input.coverage ?? 0.1
            }
        },
        discovery: {
            exploreEvaluableRunCount: 1,
            exploreHitRateAt12: input.exploreHit ?? 0.4,
            serendipity: 'NOT_YET_IDENTIFIABLE_WITH_CURRENT_LOGS',
            longTailCoverage: 'NOT_YET_IDENTIFIABLE_WITH_CURRENT_LOGS'
        },
        limitations: [],
        perRun: []
    } as any
}

describe('Recommendation V5 benchmark comparison', () => {
    it('reports descriptive deltas only when both exact versions have adequate support', () => {
        const baseline = benchmark('v5-shadow/baseline', {
            precision12: 0.2,
            recall12: 0.3,
            ndcg12: 0.4,
            hit12: 0.5,
            mrr: 0.25,
            authorShare: 0.35,
            coverage: 0.08,
            exploreHit: 0.3
        })
        const candidate = benchmark('v5-shadow/candidate', {
            precision12: 0.24,
            recall12: 0.36,
            ndcg12: 0.45,
            hit12: 0.6,
            mrr: 0.3,
            authorShare: 0.28,
            coverage: 0.12,
            exploreHit: 0.5
        })
        const comparison = compareRetrospectiveBenchmarksV5({
            baseline,
            candidate
        })

        expect(comparison.comparisonVersion).toBe(
            BENCHMARK_COMPARISON_V5_VERSION
        )
        expect(comparison.mode).toBe('READ_ONLY')
        expect(comparison.status).toBe('COMPARISON_READY')
        expect(
            comparison.criteria.every(
                (item) => item.status === 'PASS'
            )
        ).toBe(true)
        expect(
            comparison.accuracy.diversifiedBatch.precision12.delta
        ).toBeCloseTo(0.04)
        expect(
            comparison.accuracy.diversifiedBatch.recall12.delta
        ).toBeCloseTo(0.06)
        expect(
            comparison.accuracy.diversifiedBatch.ndcg12.delta
        ).toBeCloseTo(0.05)
        expect(
            comparison.diversity.authorMaxShare.delta
        ).toBeCloseTo(-0.07)
        expect(
            comparison.diversity.itemCoverage.delta
        ).toBeCloseTo(0.04)
        expect(
            comparison.discovery.exploreHitRateAt12.delta
        ).toBeCloseTo(0.2)
        expect(comparison.decision).toMatchObject({
            winner: null,
            automaticWinnerSelection: false,
            learningToRank: false,
            contextualBandit: false,
            activeLearning: false
        })
        expect(comparison.autoPromotion).toBe(false)
        expect(comparison.modelEscalationEnabled).toBe(false)
    })

    it('stays insufficient when future-outcome support is missing', () => {
        const comparison = compareRetrospectiveBenchmarksV5({
            baseline: benchmark('v5-shadow/baseline'),
            candidate: benchmark('v5-shadow/candidate', {
                evaluableRuns: 2
            })
        })
        expect(comparison.status).toBe('INSUFFICIENT_SUPPORT')
        expect(
            comparison.criteria.find(
                (item) =>
                    item.id === 'CANDIDATE_EVALUABLE_SUPPORT'
            )
        ).toMatchObject({
            status: 'INSUFFICIENT',
            actual: 2
        })
        expect(comparison.decision.winner).toBeNull()
    })

    it('does not treat the same exact model version as a valid comparison', () => {
        const same = benchmark('v5-shadow/same')
        const comparison = compareRetrospectiveBenchmarksV5({
            baseline: same,
            candidate: same
        })
        expect(comparison.status).toBe('INSUFFICIENT_SUPPORT')
        expect(
            comparison.criteria.find(
                (item) => item.id === 'DISTINCT_MODEL_VERSIONS'
            )?.status
        ).toBe('INSUFFICIENT')
        expect(comparison.decision.winner).toBeNull()
    })
})
