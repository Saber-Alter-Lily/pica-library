import type { UserEvent } from '../recommendation-v3/types'
import {
    itemCoverage,
    meanMetric,
    rankingMetrics,
    type RankingMetricSet
} from './evaluation-metrics'
import { normalizePreferenceKey } from './portable-policy'

export const RETROSPECTIVE_BENCHMARK_V5_VERSION =
    'retrospective-benchmark-v2-outcome-maturity'

export interface BenchmarkShadowRunV5 {
    modelVersion: string
    generatedAt: string
    candidateIds: string[]
    telemetry: Record<string, unknown>
}

const positiveEventTypes = new Set([
    'recommend_like',
    'favorite_add',
    'reader_complete'
])
const negativeEventTypes = new Set([
    'recommend_dislike'
])

function object(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {}
}

function array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
}

function number(value: unknown): number | null {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function round(value: number | null) {
    return value === null
        ? null
        : Math.round(value * 1_000_000) / 1_000_000
}

function median(values: Array<number | null>) {
    const finite = values
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b)
    if (!finite.length) return null
    const middle = Math.floor(finite.length / 2)
    return finite.length % 2
        ? finite[middle]
        : (finite[middle - 1] + finite[middle]) / 2
}

function rankedIds(run: BenchmarkShadowRunV5) {
    const rows = array(run.telemetry.rankedEvidence)
        .map(object)
        .filter((row) => String(row.comicId ?? '').trim())
        .sort(
            (a, b) =>
                (number(a.rank) ?? Number.MAX_SAFE_INTEGER) -
                    (number(b.rank) ?? Number.MAX_SAFE_INTEGER) ||
                String(a.comicId).localeCompare(String(b.comicId))
        )
        .map((row) => String(row.comicId))
    return rows.length ? rows : [...run.candidateIds]
}

function batchIds(run: BenchmarkShadowRunV5) {
    return array(run.telemetry.diversifiedBatch)
        .map(object)
        .filter((row) => String(row.comicId ?? '').trim())
        .sort(
            (a, b) =>
                (number(a.batchRank) ?? Number.MAX_SAFE_INTEGER) -
                    (number(b.batchRank) ?? Number.MAX_SAFE_INTEGER) ||
                String(a.comicId).localeCompare(String(b.comicId))
        )
        .map((row) => String(row.comicId))
}

function eventIds(
    events: UserEvent[],
    startMs: number,
    endMs: number,
    types: Set<string>
) {
    return [
        ...new Set(
            events.flatMap((event) => {
                if (!event.comicId || !types.has(event.eventType))
                    return []
                const time = Date.parse(event.occurredAt)
                if (
                    !Number.isFinite(time) ||
                    time <= startMs ||
                    time > endMs
                )
                    return []
                return [
                    normalizePreferenceKey(event.comicId)
                ]
            })
        )
    ].filter(Boolean)
}

function normalizedRanked(ids: string[]) {
    return ids.map(normalizePreferenceKey).filter(Boolean)
}

function negativeLeakage(
    ranked: string[],
    negativeIds: string[],
    limit: number
) {
    const negative = new Set(negativeIds)
    const hits = ranked
        .slice(0, limit)
        .filter((id) => negative.has(id)).length
    return {
        hits,
        rate:
            Math.min(limit, ranked.length) > 0
                ? round(
                      hits /
                          Math.min(limit, ranked.length)
                  ) ?? 0
                : 0
    }
}

function correctnessAudit(run: BenchmarkShadowRunV5) {
    const value = object(run.telemetry.correctnessAudit)
    if (!Object.keys(value).length) return null
    const ranked = object(value.rankedPool)
    const batch = object(value.diversifiedBatch)
    return {
        pass:
            value.pass === true &&
            number(ranked.totalLeakage) === 0 &&
            number(batch.totalLeakage) === 0,
        rankedLeakage: number(ranked.totalLeakage),
        batchLeakage: number(batch.totalLeakage)
    }
}

function selectedConcentration(run: BenchmarkShadowRunV5) {
    return object(
        object(run.telemetry.diversityTelemetry)
            .selectedConcentration
    )
}

export function buildRetrospectiveBenchmarkV5(input: {
    runs: BenchmarkShadowRunV5[]
    events: UserEvent[]
    currentModelVersion: string
    catalogSize: number
    horizonDays?: number
    now?: Date
}) {
    const horizonDays = Math.max(
        1,
        Math.min(180, Math.floor(input.horizonDays ?? 30))
    )
    const horizonMs = horizonDays * 86_400_000
    const nowMs = input.now?.getTime() ?? Date.now()
    const runs = input.runs
        .filter(
            (run) =>
                run.modelVersion === input.currentModelVersion
        )
        .sort(
            (a, b) =>
                a.generatedAt.localeCompare(b.generatedAt)
        )

    const perRun = runs.map((run) => {
        const generatedMs = Date.parse(run.generatedAt)
        const validTime = Number.isFinite(generatedMs)
        const windowEndMs = validTime
            ? generatedMs + horizonMs
            : Number.NaN
        const outcomeWindowMature =
            validTime && nowMs >= windowEndMs
        const observedEndMs = validTime
            ? Math.min(windowEndMs, nowMs)
            : Number.NaN
        const positiveIds = validTime
            ? eventIds(
                  input.events,
                  generatedMs,
                  observedEndMs,
                  positiveEventTypes
              )
            : []
        const negativeIds = validTime
            ? eventIds(
                  input.events,
                  generatedMs,
                  observedEndMs,
                  negativeEventTypes
              )
            : []
        const ranked = normalizedRanked(rankedIds(run))
        const batch = normalizedRanked(batchIds(run))
        const rankedMetrics = rankingMetrics(
            ranked,
            positiveIds
        )
        const batchMetrics = rankingMetrics(
            batch,
            positiveIds
        )
        const mode = String(
            run.telemetry.sessionMode ?? 'UNKNOWN'
        ).toUpperCase()
        return {
            generatedAt: run.generatedAt,
            sessionMode: mode,
            candidateCount: run.candidateIds.length,
            rankedCount: ranked.length,
            batchCount: batch.length,
            outcomeWindowMature,
            outcomeWindowEndsAt: validTime
                ? new Date(windowEndMs).toISOString()
                : null,
            futurePositiveCount: positiveIds.length,
            futureNegativeCount: negativeIds.length,
            evaluable:
                outcomeWindowMature &&
                positiveIds.length > 0,
            rankedMetrics,
            batchMetrics,
            negativeLeakage12: negativeLeakage(
                ranked,
                negativeIds,
                12
            ),
            batchNegativeLeakage12: negativeLeakage(
                batch,
                negativeIds,
                12
            ),
            correctness: correctnessAudit(run),
            concentration: selectedConcentration(run),
            rankedIds: ranked,
            batchIds: batch
        }
    })

    const evaluable = perRun.filter((run) => run.evaluable)
    const correctnessRuns = perRun
        .map((run) => run.correctness)
        .filter(
            (
                value
            ): value is NonNullable<typeof value> =>
                value !== null
        )
    const authorShares = perRun.map((run) =>
        number(run.concentration.authorMaxShare)
    )
    const fandomShares = perRun.map((run) =>
        number(run.concentration.fandomMaxShare)
    )
    const tagShares = perRun.map((run) =>
        number(run.concentration.tagMaxShare)
    )
    const exploreRuns = evaluable.filter(
        (run) => run.sessionMode === 'EXPLORE'
    )
    const averageRanked = meanMetric(
        evaluable.map((run) => run.rankedMetrics)
    )
    const averageBatch = meanMetric(
        evaluable.map((run) => run.batchMetrics)
    )
    const coverage = itemCoverage(
        perRun.map((run) => run.batchIds),
        input.catalogSize
    )
    const average = (
        values: number[]
    ) =>
        values.length
            ? round(
                  values.reduce(
                      (sum, value) => sum + value,
                      0
                  ) / values.length
              ) ?? 0
            : null

    return {
        mode: 'READ_ONLY' as const,
        benchmarkVersion:
            RETROSPECTIVE_BENCHMARK_V5_VERSION,
        modelVersion: input.currentModelVersion,
        servingImpact: false,
        groundTruth:
            'FUTURE_LIKE_FAVORITE_OR_READER_COMPLETE',
        horizonDays,
        support: {
            exactRunCount: runs.length,
            matureRunCount: perRun.filter(
                (run) => run.outcomeWindowMature
            ).length,
            immatureRunCount: perRun.filter(
                (run) => !run.outcomeWindowMature
            ).length,
            evaluableRunCount: evaluable.length,
            runWithCorrectnessAuditCount:
                correctnessRuns.length,
            positiveEventCountAcrossWindows:
                perRun.reduce(
                    (sum, run) =>
                        sum + run.futurePositiveCount,
                    0
                ),
            maturePositiveEventCountAcrossWindows:
                perRun
                    .filter((run) => run.outcomeWindowMature)
                    .reduce(
                        (sum, run) =>
                            sum + run.futurePositiveCount,
                        0
                    ),
            negativeEventCountAcrossWindows:
                perRun.reduce(
                    (sum, run) =>
                        sum + run.futureNegativeCount,
                    0
                )
        },
        correctness: {
            auditedRunPassRate: correctnessRuns.length
                ? round(
                      correctnessRuns.filter(
                          (run) => run.pass
                      ).length / correctnessRuns.length
                  )
                : null,
            totalRankedLeakage:
                correctnessRuns.reduce(
                    (sum, run) =>
                        sum + (run.rankedLeakage ?? 0),
                    0
                ),
            totalBatchLeakage:
                correctnessRuns.reduce(
                    (sum, run) =>
                        sum + (run.batchLeakage ?? 0),
                    0
                ),
            meanNegativeLeakageAt12: average(
                perRun.map(
                    (run) =>
                        run.negativeLeakage12.rate
                )
            ),
            meanBatchNegativeLeakageAt12: average(
                perRun.map(
                    (run) =>
                        run.batchNegativeLeakage12.rate
                )
            )
        },
        accuracy: {
            ranked: averageRanked,
            diversifiedBatch: averageBatch
        },
        diversity: {
            medianAuthorMaxShare: round(
                median(authorShares)
            ),
            medianFandomMaxShare: round(
                median(fandomShares)
            ),
            medianTagMaxShare: round(
                median(tagShares)
            ),
            itemCoverage: coverage
        },
        discovery: {
            exploreEvaluableRunCount:
                exploreRuns.length,
            exploreHitRateAt12: exploreRuns.length
                ? round(
                      exploreRuns.reduce(
                          (sum, run) =>
                              sum +
                              run.batchMetrics.hit12,
                          0
                      ) / exploreRuns.length
                  )
                : null,
            serendipity:
                'NOT_YET_IDENTIFIABLE_WITH_CURRENT_LOGS',
            longTailCoverage:
                'NOT_YET_IDENTIFIABLE_WITH_CURRENT_LOGS'
        },
        limitations: [
            'Accuracy metrics exclude runs whose future-outcome horizon has not fully matured, preventing right-censoring from recent runs.',
            'Run-level future-event windows may overlap; aggregate metrics are descriptive means across mature evaluable runs.',
            'Future positives can arise outside recommendation exposure, so end-to-end recall measures interest recovery rather than causal recommendation effect.',
            'Serendipity and long-tail coverage remain unsupported until stable catalog popularity/exposure baselines are versioned.'
        ],
        perRun
    }
}
