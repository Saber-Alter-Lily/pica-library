import type { buildRetrospectiveBenchmarkV5 } from './retrospective-benchmark'

export const BENCHMARK_COMPARISON_V5_VERSION =
    'benchmark-comparison-v1'

type RetrospectiveBenchmarkV5 = ReturnType<
    typeof buildRetrospectiveBenchmarkV5
>

const minimumSupport = {
    exactRuns: 3,
    evaluableRuns: 3,
    correctnessRuns: 3
} as const

function finite(value: unknown) {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
}

function round(value: number | null) {
    return value === null
        ? null
        : Math.round(value * 1_000_000) / 1_000_000
}

function delta(candidate: unknown, baseline: unknown) {
    const right = finite(candidate)
    const left = finite(baseline)
    return right === null || left === null
        ? null
        : round(right - left)
}

function metricDelta(
    baseline: RetrospectiveBenchmarkV5,
    candidate: RetrospectiveBenchmarkV5,
    section: 'ranked' | 'diversifiedBatch',
    key:
        | 'precision12'
        | 'recall12'
        | 'ndcg12'
        | 'hit12'
        | 'mrr'
) {
    return {
        baseline: finite(
            baseline.accuracy[section]?.[key]
        ),
        candidate: finite(
            candidate.accuracy[section]?.[key]
        ),
        delta: delta(
            candidate.accuracy[section]?.[key],
            baseline.accuracy[section]?.[key]
        ),
        higherIsBetter: true
    }
}

function criterion(
    id: string,
    pass: boolean,
    actual: string | number | boolean,
    threshold: string,
    note: string
) {
    return {
        id,
        status: pass ? ('PASS' as const) : ('INSUFFICIENT' as const),
        actual,
        threshold,
        note
    }
}

export function compareRetrospectiveBenchmarksV5(input: {
    baseline: RetrospectiveBenchmarkV5
    candidate: RetrospectiveBenchmarkV5
}) {
    const baseline = input.baseline
    const candidate = input.candidate
    const criteria = [
        criterion(
            'DISTINCT_MODEL_VERSIONS',
            baseline.modelVersion !== candidate.modelVersion,
            baseline.modelVersion === candidate.modelVersion
                ? false
                : true,
            'baselineVersion != candidateVersion',
            'A comparison requires two distinct exact model versions.'
        ),
        criterion(
            'MATCHED_BENCHMARK_VERSION',
            baseline.benchmarkVersion === candidate.benchmarkVersion,
            `${baseline.benchmarkVersion} / ${candidate.benchmarkVersion}`,
            'same retrospective benchmark version',
            'Metric definitions must be identical on both sides.'
        ),
        criterion(
            'MATCHED_HORIZON',
            baseline.horizonDays === candidate.horizonDays,
            `${baseline.horizonDays} / ${candidate.horizonDays}`,
            'same future-outcome horizon',
            'Future behavior windows must use the same horizon.'
        ),
        criterion(
            'BASELINE_EXACT_RUN_SUPPORT',
            baseline.support.exactRunCount >= minimumSupport.exactRuns,
            baseline.support.exactRunCount,
            `>= ${minimumSupport.exactRuns}`,
            'The baseline needs repeated exact-version shadow runs.'
        ),
        criterion(
            'CANDIDATE_EXACT_RUN_SUPPORT',
            candidate.support.exactRunCount >= minimumSupport.exactRuns,
            candidate.support.exactRunCount,
            `>= ${minimumSupport.exactRuns}`,
            'The candidate needs repeated exact-version shadow runs.'
        ),
        criterion(
            'BASELINE_EVALUABLE_SUPPORT',
            baseline.support.evaluableRunCount >=
                minimumSupport.evaluableRuns,
            baseline.support.evaluableRunCount,
            `>= ${minimumSupport.evaluableRuns}`,
            'The baseline needs multiple runs with future positive outcomes.'
        ),
        criterion(
            'CANDIDATE_EVALUABLE_SUPPORT',
            candidate.support.evaluableRunCount >=
                minimumSupport.evaluableRuns,
            candidate.support.evaluableRunCount,
            `>= ${minimumSupport.evaluableRuns}`,
            'The candidate needs multiple runs with future positive outcomes.'
        ),
        criterion(
            'BASELINE_CORRECTNESS_SUPPORT',
            baseline.support.runWithCorrectnessAuditCount >=
                minimumSupport.correctnessRuns,
            baseline.support.runWithCorrectnessAuditCount,
            `>= ${minimumSupport.correctnessRuns}`,
            'The baseline needs repeated correctness audits.'
        ),
        criterion(
            'CANDIDATE_CORRECTNESS_SUPPORT',
            candidate.support.runWithCorrectnessAuditCount >=
                minimumSupport.correctnessRuns,
            candidate.support.runWithCorrectnessAuditCount,
            `>= ${minimumSupport.correctnessRuns}`,
            'The candidate needs repeated correctness audits.'
        )
    ]
    const ready = criteria.every(
        (item) => item.status === 'PASS'
    )

    const ranked = {
        precision12: metricDelta(
            baseline,
            candidate,
            'ranked',
            'precision12'
        ),
        recall12: metricDelta(
            baseline,
            candidate,
            'ranked',
            'recall12'
        ),
        ndcg12: metricDelta(
            baseline,
            candidate,
            'ranked',
            'ndcg12'
        ),
        hit12: metricDelta(
            baseline,
            candidate,
            'ranked',
            'hit12'
        ),
        mrr: metricDelta(
            baseline,
            candidate,
            'ranked',
            'mrr'
        )
    }
    const batch = {
        precision12: metricDelta(
            baseline,
            candidate,
            'diversifiedBatch',
            'precision12'
        ),
        recall12: metricDelta(
            baseline,
            candidate,
            'diversifiedBatch',
            'recall12'
        ),
        ndcg12: metricDelta(
            baseline,
            candidate,
            'diversifiedBatch',
            'ndcg12'
        ),
        hit12: metricDelta(
            baseline,
            candidate,
            'diversifiedBatch',
            'hit12'
        ),
        mrr: metricDelta(
            baseline,
            candidate,
            'diversifiedBatch',
            'mrr'
        )
    }

    return {
        mode: 'READ_ONLY' as const,
        comparisonVersion: BENCHMARK_COMPARISON_V5_VERSION,
        status: ready
            ? ('COMPARISON_READY' as const)
            : ('INSUFFICIENT_SUPPORT' as const),
        autoPromotion: false,
        modelEscalationEnabled: false,
        baseline: {
            modelVersion: baseline.modelVersion,
            benchmarkVersion: baseline.benchmarkVersion,
            horizonDays: baseline.horizonDays,
            support: baseline.support
        },
        candidate: {
            modelVersion: candidate.modelVersion,
            benchmarkVersion: candidate.benchmarkVersion,
            horizonDays: candidate.horizonDays,
            support: candidate.support
        },
        criteria,
        accuracy: {
            ranked,
            diversifiedBatch: batch
        },
        correctness: {
            baseline: baseline.correctness,
            candidate: candidate.correctness,
            delta: {
                auditedRunPassRate: delta(
                    candidate.correctness.auditedRunPassRate,
                    baseline.correctness.auditedRunPassRate
                ),
                totalRankedLeakage: delta(
                    candidate.correctness.totalRankedLeakage,
                    baseline.correctness.totalRankedLeakage
                ),
                totalBatchLeakage: delta(
                    candidate.correctness.totalBatchLeakage,
                    baseline.correctness.totalBatchLeakage
                )
            },
            lowerLeakageIsBetter: true
        },
        diversity: {
            authorMaxShare: {
                baseline: baseline.diversity.medianAuthorMaxShare,
                candidate: candidate.diversity.medianAuthorMaxShare,
                delta: delta(
                    candidate.diversity.medianAuthorMaxShare,
                    baseline.diversity.medianAuthorMaxShare
                ),
                lowerIsBetter: true
            },
            fandomMaxShare: {
                baseline: baseline.diversity.medianFandomMaxShare,
                candidate: candidate.diversity.medianFandomMaxShare,
                delta: delta(
                    candidate.diversity.medianFandomMaxShare,
                    baseline.diversity.medianFandomMaxShare
                ),
                lowerIsBetter: true
            },
            tagMaxShare: {
                baseline: baseline.diversity.medianTagMaxShare,
                candidate: candidate.diversity.medianTagMaxShare,
                delta: delta(
                    candidate.diversity.medianTagMaxShare,
                    baseline.diversity.medianTagMaxShare
                ),
                lowerIsBetter: true
            },
            itemCoverage: {
                baseline: baseline.diversity.itemCoverage.coverage,
                candidate: candidate.diversity.itemCoverage.coverage,
                delta: delta(
                    candidate.diversity.itemCoverage.coverage,
                    baseline.diversity.itemCoverage.coverage
                ),
                higherIsBetter: true
            }
        },
        discovery: {
            exploreHitRateAt12: {
                baseline: baseline.discovery.exploreHitRateAt12,
                candidate: candidate.discovery.exploreHitRateAt12,
                delta: delta(
                    candidate.discovery.exploreHitRateAt12,
                    baseline.discovery.exploreHitRateAt12
                ),
                higherIsBetter: true
            },
            serendipity: 'UNSUPPORTED_IN_COMPARISON',
            longTailCoverage: 'UNSUPPORTED_IN_COMPARISON'
        },
        decision: {
            winner: null,
            automaticWinnerSelection: false,
            advancedLearning:
                'HUMAN_REVIEW_AFTER_COMPARISON',
            learningToRank: false,
            contextualBandit: false,
            activeLearning: false
        },
        limitations: [
            'This comparison is descriptive and does not select a winner automatically.',
            'Runs from different model versions may occur at different calendar times and are not necessarily paired on identical candidate opportunities.',
            'Future positive events are observational outcomes rather than causal recommendation conversions.',
            'Serendipity and long-tail comparison remain unsupported until stable exposure/popularity baselines are versioned.'
        ]
    }
}

export const BENCHMARK_COMPARISON_V5_MINIMUM_SUPPORT =
    minimumSupport
