export const P3_PROMOTION_GATE_V5_VERSION =
    'p3-promotion-gate-v1'

export type PromotionCriterionStatusV5 =
    | 'PASS'
    | 'FAIL'
    | 'INSUFFICIENT'

export interface ShadowAuditRunV5 {
    modelVersion: string
    generatedAt: string
    candidateIds: string[]
    telemetry: Record<string, unknown>
}

export interface PromotionCriterionV5 {
    id: string
    status: PromotionCriterionStatusV5
    actual: number | boolean | string | null
    threshold: string
    note: string
}

const thresholds = {
    minimumDefaultRuns: 3,
    minimumCandidatesPerRun: 12,
    minimumMedianRankedCandidates: 48,
    maximumMedianFailedRouteRate: 0.25,
    maximumMedianHygieneRemovalRate: 0.7,
    minimumBatchSelectedPerRun: 12,
    maximumMedianAuthorShare: 0.34,
    maximumMedianFandomShare: 0.5,
    maximumMedianTagShare: 0.67,
    minimumMedianRelevanceDelta: -0.12
} as const

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

function boolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null
}

function median(values: Array<number | null | undefined>) {
    const finite = values
        .filter((value): value is number =>
            typeof value === 'number' && Number.isFinite(value)
        )
        .sort((a, b) => a - b)
    if (!finite.length) return null
    const middle = Math.floor(finite.length / 2)
    return finite.length % 2
        ? finite[middle]
        : (finite[middle - 1] + finite[middle]) / 2
}

function round(value: number | null) {
    return value === null
        ? null
        : Math.round(value * 1_000_000) / 1_000_000
}

function sessionMode(run: ShadowAuditRunV5) {
    return String(run.telemetry.sessionMode ?? 'UNKNOWN').toUpperCase()
}

function routeFailureRate(run: ShadowAuditRunV5) {
    const retrieval = object(run.telemetry.retrievalTelemetry)
    const routes = array(retrieval.routes)
    if (!routes.length) return null
    const failed = routes.filter((row) => {
        const status = String(object(row).status ?? '')
        return status === 'FAILED'
    }).length
    return failed / routes.length
}

function hygieneRemovalRate(run: ShadowAuditRunV5) {
    const hygiene = object(run.telemetry.hygieneTelemetry)
    return number(hygiene.removalRate)
}

function diversifiedBatchSize(run: ShadowAuditRunV5) {
    return array(run.telemetry.diversifiedBatch).length
}

function selectedConcentration(run: ShadowAuditRunV5) {
    const diversity = object(run.telemetry.diversityTelemetry)
    return object(diversity.selectedConcentration)
}

function relevanceDelta(run: ShadowAuditRunV5) {
    const diversity = object(run.telemetry.diversityTelemetry)
    return number(diversity.meanRelevanceDelta)
}

function rankedCandidateCount(run: ShadowAuditRunV5) {
    return (
        number(run.telemetry.rankedCandidateCount) ??
        number(run.telemetry.hygienicCandidateCount) ??
        run.candidateIds.length
    )
}

function safeShadowInvariant(run: ShadowAuditRunV5) {
    return (
        boolean(run.telemetry.servingImpact) === false &&
        boolean(run.telemetry.persistCandidates) === false
    )
}

function criterion(
    id: string,
    status: PromotionCriterionStatusV5,
    actual: PromotionCriterionV5['actual'],
    threshold: string,
    note: string
): PromotionCriterionV5 {
    return { id, status, actual, threshold, note }
}

function coverage(runs: ShadowAuditRunV5[]) {
    return Object.fromEntries(
        ['DEFAULT', 'FAMILIAR', 'RECENT', 'EXPLORE', 'TARGET'].map(
            (mode) => [
                mode,
                runs.filter((run) => sessionMode(run) === mode).length
            ]
        )
    ) as Record<string, number>
}

export function evaluateP3PromotionGateV5(
    runs: ShadowAuditRunV5[],
    currentModelVersion: string
) {
    const exactRuns = runs
        .filter((run) => run.modelVersion === currentModelVersion)
        .sort(
            (a, b) =>
                b.generatedAt.localeCompare(a.generatedAt) ||
                a.candidateIds.join('|').localeCompare(
                    b.candidateIds.join('|')
                )
        )
    const defaultRuns = exactRuns.filter(
        (run) => sessionMode(run) === 'DEFAULT'
    )

    const criteria: PromotionCriterionV5[] = []

    criteria.push(
        criterion(
            'DEFAULT_RUN_COUNT',
            defaultRuns.length >= thresholds.minimumDefaultRuns
                ? 'PASS'
                : 'INSUFFICIENT',
            defaultRuns.length,
            `>= ${thresholds.minimumDefaultRuns}`,
            'Promotion review requires repeated DEFAULT-mode evidence from the exact current pipeline version.'
        )
    )

    if (defaultRuns.length < thresholds.minimumDefaultRuns) {
        return {
            gateVersion: P3_PROMOTION_GATE_V5_VERSION,
            modelVersion: currentModelVersion,
            verdict: 'NOT_READY' as const,
            autoPromotion: false,
            servingMutationEnabled: false,
            exactRunCount: exactRuns.length,
            defaultRunCount: defaultRuns.length,
            modeCoverage: coverage(exactRuns),
            criteria,
            summary: {
                passed: criteria.filter((item) => item.status === 'PASS')
                    .length,
                failed: criteria.filter((item) => item.status === 'FAIL')
                    .length,
                insufficient: criteria.filter(
                    (item) => item.status === 'INSUFFICIENT'
                ).length
            }
        }
    }

    const candidateMinimum = Math.min(
        ...defaultRuns.map((run) => run.candidateIds.length)
    )
    criteria.push(
        criterion(
            'MIN_CANDIDATES_EACH_RUN',
            candidateMinimum >= thresholds.minimumCandidatesPerRun
                ? 'PASS'
                : 'FAIL',
            candidateMinimum,
            `>= ${thresholds.minimumCandidatesPerRun}`,
            'Every DEFAULT run must produce at least one full batch after hygiene/ranking.'
        )
    )

    const medianRanked = round(
        median(defaultRuns.map(rankedCandidateCount))
    )
    criteria.push(
        criterion(
            'MEDIAN_RANKED_CANDIDATES',
            medianRanked !== null &&
            medianRanked >= thresholds.minimumMedianRankedCandidates
                ? 'PASS'
                : 'FAIL',
            medianRanked,
            `>= ${thresholds.minimumMedianRankedCandidates}`,
            'The candidate pool should remain comfortably larger than one display batch.'
        )
    )

    const failedRouteRate = round(
        median(defaultRuns.map(routeFailureRate))
    )
    criteria.push(
        criterion(
            'MEDIAN_FAILED_ROUTE_RATE',
            failedRouteRate === null
                ? 'INSUFFICIENT'
                : failedRouteRate <=
                    thresholds.maximumMedianFailedRouteRate
                  ? 'PASS'
                  : 'FAIL',
            failedRouteRate,
            `<= ${thresholds.maximumMedianFailedRouteRate}`,
            'Provider/channel failures must stay bounded; one provider may fail without collapsing the pipeline.'
        )
    )

    const removalRate = round(
        median(defaultRuns.map(hygieneRemovalRate))
    )
    criteria.push(
        criterion(
            'MEDIAN_HYGIENE_REMOVAL_RATE',
            removalRate === null
                ? 'INSUFFICIENT'
                : removalRate <=
                    thresholds.maximumMedianHygieneRemovalRate
                  ? 'PASS'
                  : 'FAIL',
            removalRate,
            `<= ${thresholds.maximumMedianHygieneRemovalRate}`,
            'Excessive removal suggests retrieval is dominated by owned/duplicate/suppressed content.'
        )
    )

    const minimumSelected = Math.min(
        ...defaultRuns.map(diversifiedBatchSize)
    )
    criteria.push(
        criterion(
            'FULL_DIVERSIFIED_BATCH_EACH_RUN',
            minimumSelected >= thresholds.minimumBatchSelectedPerRun
                ? 'PASS'
                : 'FAIL',
            minimumSelected,
            `>= ${thresholds.minimumBatchSelectedPerRun}`,
            'Every DEFAULT run must yield a complete diversified batch.'
        )
    )

    const medianAuthorShare = round(
        median(
            defaultRuns.map((run) =>
                number(selectedConcentration(run).authorMaxShare)
            )
        )
    )
    criteria.push(
        criterion(
            'MEDIAN_AUTHOR_MAX_SHARE',
            medianAuthorShare === null
                ? 'INSUFFICIENT'
                : medianAuthorShare <=
                    thresholds.maximumMedianAuthorShare
                  ? 'PASS'
                  : 'FAIL',
            medianAuthorShare,
            `<= ${thresholds.maximumMedianAuthorShare}`,
            'The selected batch should not collapse onto one author.'
        )
    )

    const medianFandomShare = round(
        median(
            defaultRuns.map((run) =>
                number(selectedConcentration(run).fandomMaxShare)
            )
        )
    )
    criteria.push(
        criterion(
            'MEDIAN_FANDOM_MAX_SHARE',
            medianFandomShare === null
                ? 'INSUFFICIENT'
                : medianFandomShare <=
                    thresholds.maximumMedianFandomShare
                  ? 'PASS'
                  : 'FAIL',
            medianFandomShare,
            `<= ${thresholds.maximumMedianFandomShare}`,
            'FANDOM/IP saturation should remain bounded when reliable fandom evidence exists.'
        )
    )

    const medianTagShare = round(
        median(
            defaultRuns.map((run) =>
                number(selectedConcentration(run).tagMaxShare)
            )
        )
    )
    criteria.push(
        criterion(
            'MEDIAN_TAG_MAX_SHARE',
            medianTagShare === null
                ? 'INSUFFICIENT'
                : medianTagShare <= thresholds.maximumMedianTagShare
                  ? 'PASS'
                  : 'FAIL',
            medianTagShare,
            `<= ${thresholds.maximumMedianTagShare}`,
            'Semantic tag concentration should stay bounded after diversification.'
        )
    )

    const medianRelevanceDelta = round(
        median(defaultRuns.map(relevanceDelta))
    )
    criteria.push(
        criterion(
            'MEDIAN_RELEVANCE_DELTA',
            medianRelevanceDelta === null
                ? 'INSUFFICIENT'
                : medianRelevanceDelta >=
                    thresholds.minimumMedianRelevanceDelta
                  ? 'PASS'
                  : 'FAIL',
            medianRelevanceDelta,
            `>= ${thresholds.minimumMedianRelevanceDelta}`,
            'Diversity should not buy coverage by discarding too much relevance.'
        )
    )

    const invariantPass = defaultRuns.every(safeShadowInvariant)
    criteria.push(
        criterion(
            'SHADOW_SAFETY_INVARIANTS',
            invariantPass ? 'PASS' : 'FAIL',
            invariantPass,
            'servingImpact=false AND persistCandidates=false for every DEFAULT run',
            'Promotion evidence is valid only if it was collected without mutating serving or the catalog.'
        )
    )

    const allPass = criteria.every((item) => item.status === 'PASS')

    return {
        gateVersion: P3_PROMOTION_GATE_V5_VERSION,
        modelVersion: currentModelVersion,
        verdict: allPass
            ? ('READY_FOR_MANUAL_REVIEW' as const)
            : ('NOT_READY' as const),
        autoPromotion: false,
        servingMutationEnabled: false,
        exactRunCount: exactRuns.length,
        defaultRunCount: defaultRuns.length,
        modeCoverage: coverage(exactRuns),
        criteria,
        summary: {
            passed: criteria.filter((item) => item.status === 'PASS').length,
            failed: criteria.filter((item) => item.status === 'FAIL').length,
            insufficient: criteria.filter(
                (item) => item.status === 'INSUFFICIENT'
            ).length
        }
    }
}

export const P3_PROMOTION_GATE_V5_THRESHOLDS = thresholds
