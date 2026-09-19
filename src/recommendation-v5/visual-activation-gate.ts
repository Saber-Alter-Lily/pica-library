import type { buildVisualAuthorAtlasV5 } from './visual-author-atlas'
import {
    VISUAL_CANDIDATE_COVERAGE_V5_VERSION
} from './visual-candidate-coverage'
import type { buildVisualRepresentationQcV5 } from './visual-representation-qc'
import type { buildVisualStyleFamiliesV5 } from './visual-style-families'

export const VISUAL_ACTIVATION_GATE_V5_VERSION =
    'visual-activation-gate-v1'

type RepresentationQcV5 = ReturnType<
    typeof buildVisualRepresentationQcV5
>
type AuthorAtlasV5 = ReturnType<
    typeof buildVisualAuthorAtlasV5
>
type StyleFamiliesV5 = ReturnType<
    typeof buildVisualStyleFamiliesV5
>

export interface VisualShadowRunV5 {
    modelVersion: string
    generatedAt: string
    telemetry: Record<string, unknown>
}

export type VisualGateCriterionStatusV5 =
    | 'PASS'
    | 'FAIL'
    | 'INSUFFICIENT'

export interface VisualGateCriterionV5 {
    id: string
    required: boolean
    status: VisualGateCriterionStatusV5
    actual: number | boolean | string | null
    threshold: string
    note: string
}

const thresholds = {
    minimumCoverageRuns: 3,
    minimumFavoriteCoverage: 0.85,
    minimumSameAuthorPairs: 30,
    minimumDifferentAuthorPairs: 100,
    minimumAuthorSeparation: 0.02,
    minimumAuthorKnnAnchors: 20,
    minimumAuthorTop5HitRate: 0.35,
    minimumMultiAuthorAtlasEntries: 10,
    maximumLargestFamilyPrototypeShare: 0.5,
    minimumMedianDiversifiedBatchCoverage: 0.4,
    minimumMedianPreparationReadyFraction: 0.3
} as const

function object(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {}
}

function number(value: unknown): number | null {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function boolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null
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

function round(value: number | null) {
    return value === null
        ? null
        : Math.round(value * 1_000_000) / 1_000_000
}

function criterion(
    id: string,
    required: boolean,
    status: VisualGateCriterionStatusV5,
    actual: VisualGateCriterionV5['actual'],
    threshold: string,
    note: string
): VisualGateCriterionV5 {
    return { id, required, status, actual, threshold, note }
}

function visualCoverage(run: VisualShadowRunV5) {
    const value = object(run.telemetry.visualCandidateCoverage)
    return String(value.coverageVersion ?? '') ===
        VISUAL_CANDIDATE_COVERAGE_V5_VERSION
        ? value
        : null
}

function batchCoverage(run: VisualShadowRunV5) {
    const coverage = visualCoverage(run)
    return coverage
        ? number(
              object(object(coverage.coverage).diversifiedBatch)
                  .coverage
          )
        : null
}

function preparationReadyFraction(run: VisualShadowRunV5) {
    const coverage = visualCoverage(run)
    return coverage
        ? number(object(coverage.budget).readyFraction)
        : null
}

export function evaluateVisualActivationGateV5(input: {
    representationQc: RepresentationQcV5
    authorAtlas: AuthorAtlasV5
    styleFamilies: StyleFamiliesV5
    shadowRuns: VisualShadowRunV5[]
    currentShadowModelVersion: string
}) {
    const exactRuns = input.shadowRuns
        .filter(
            (run) =>
                run.modelVersion === input.currentShadowModelVersion
        )
        .sort(
            (a, b) =>
                b.generatedAt.localeCompare(a.generatedAt) ||
                a.modelVersion.localeCompare(b.modelVersion)
        )
    const coverageRuns = exactRuns.filter(
        (run) => visualCoverage(run) !== null
    )
    const criteria: VisualGateCriterionV5[] = []

    const favoriteCoverage =
        input.representationQc.coverage.favoriteCoverage
    criteria.push(
        criterion(
            'FAVORITE_EMBEDDING_COVERAGE',
            true,
            favoriteCoverage === null
                ? 'INSUFFICIENT'
                : favoriteCoverage >= thresholds.minimumFavoriteCoverage
                  ? 'PASS'
                  : 'FAIL',
            favoriteCoverage,
            '>= ' + thresholds.minimumFavoriteCoverage,
            'Preference-side Visual evidence must cover most favorite items before any V5 Visual shadow feature is considered.'
        )
    )

    const sameAuthorPairs =
        input.representationQc.pairwise.sameAuthor.count
    criteria.push(
        criterion(
            'SAME_AUTHOR_PAIR_SUPPORT',
            true,
            sameAuthorPairs >= thresholds.minimumSameAuthorPairs
                ? 'PASS'
                : 'INSUFFICIENT',
            sameAuthorPairs,
            '>= ' + thresholds.minimumSameAuthorPairs,
            'Representation QC needs enough within-author comparisons to interpret author-style separation.'
        )
    )

    const backgroundPairs =
        input.representationQc.pairwise.differentAuthor.count
    criteria.push(
        criterion(
            'BACKGROUND_PAIR_SUPPORT',
            true,
            backgroundPairs >= thresholds.minimumDifferentAuthorPairs
                ? 'PASS'
                : 'INSUFFICIENT',
            backgroundPairs,
            '>= ' + thresholds.minimumDifferentAuthorPairs,
            'The comparison baseline must be large enough to avoid interpreting a small pair sample as global geometry.'
        )
    )

    const authorSeparation =
        input.representationQc.pairwise.authorSeparation
    criteria.push(
        criterion(
            'AUTHOR_REPRESENTATION_SEPARATION',
            true,
            authorSeparation === null
                ? 'INSUFFICIENT'
                : authorSeparation >= thresholds.minimumAuthorSeparation
                  ? 'PASS'
                  : 'FAIL',
            authorSeparation,
            '>= ' + thresholds.minimumAuthorSeparation,
            'Mean same-author cosine similarity should exceed the deterministic different-author background by a non-trivial margin.'
        )
    )

    const authorAnchors =
        input.representationQc.knn.author.eligibleAnchors
    criteria.push(
        criterion(
            'AUTHOR_KNN_SUPPORT',
            true,
            authorAnchors >= thresholds.minimumAuthorKnnAnchors
                ? 'PASS'
                : 'INSUFFICIENT',
            authorAnchors,
            '>= ' + thresholds.minimumAuthorKnnAnchors,
            'Author k-NN quality should be assessed on multiple independent anchors.'
        )
    )

    const authorTop5 =
        input.representationQc.knn.author.top5HitRate
    criteria.push(
        criterion(
            'AUTHOR_KNN_TOP5',
            true,
            authorTop5 === null
                ? 'INSUFFICIENT'
                : authorTop5 >= thresholds.minimumAuthorTop5HitRate
                  ? 'PASS'
                  : 'FAIL',
            authorTop5,
            '>= ' + thresholds.minimumAuthorTop5HitRate,
            'A useful frozen representation should recover same-author neighbors at a meaningful rate before it influences ranking.'
        )
    )

    const eligibleAuthors =
        input.authorAtlas.summary.eligibleAuthorCount
    criteria.push(
        criterion(
            'AUTHOR_ATLAS_SUPPORT',
            true,
            eligibleAuthors >= thresholds.minimumMultiAuthorAtlasEntries
                ? 'PASS'
                : 'INSUFFICIENT',
            eligibleAuthors,
            '>= ' + thresholds.minimumMultiAuthorAtlasEntries,
            'Style structure should be learned from multiple supported authors, not isolated singletons.'
        )
    )

    const prototypeNodes =
        input.styleFamilies.summary.prototypeNodeCount
    const largestFamily =
        input.styleFamilies.summary.largestFamilyPrototypeCount
    const largestFamilyShare = prototypeNodes
        ? round(largestFamily / prototypeNodes)
        : null
    criteria.push(
        criterion(
            'STYLE_GRAPH_NON_COLLAPSE',
            true,
            largestFamilyShare === null
                ? 'INSUFFICIENT'
                : largestFamilyShare <=
                    thresholds.maximumLargestFamilyPrototypeShare
                  ? 'PASS'
                  : 'FAIL',
            largestFamilyShare,
            '<= ' + thresholds.maximumLargestFamilyPrototypeShare,
            'A provisional mutual-kNN graph that collapses most prototypes into one component is not useful as a style-family basis.'
        )
    )

    criteria.push(
        criterion(
            'CANDIDATE_COVERAGE_RUNS',
            true,
            coverageRuns.length >= thresholds.minimumCoverageRuns
                ? 'PASS'
                : 'INSUFFICIENT',
            coverageRuns.length,
            '>= ' + thresholds.minimumCoverageRuns,
            'Candidate-side Visual coverage must be measured repeatedly on the exact current P3 shadow pipeline version.'
        )
    )

    const medianBatchCoverage = round(
        median(coverageRuns.map(batchCoverage))
    )
    criteria.push(
        criterion(
            'MEDIAN_DIVERSIFIED_BATCH_VISUAL_COVERAGE',
            true,
            medianBatchCoverage === null
                ? 'INSUFFICIENT'
                : medianBatchCoverage >=
                    thresholds.minimumMedianDiversifiedBatchCoverage
                  ? 'PASS'
                  : 'FAIL',
            medianBatchCoverage,
            '>= ' + thresholds.minimumMedianDiversifiedBatchCoverage,
            'A Visual feature cannot fairly rerank a display batch if most selected candidates lack current embeddings.'
        )
    )

    const medianReady = round(
        median(coverageRuns.map(preparationReadyFraction))
    )
    criteria.push(
        criterion(
            'MEDIAN_ANALYSIS_PREPARATION_READY',
            true,
            medianReady === null
                ? 'INSUFFICIENT'
                : medianReady >=
                    thresholds.minimumMedianPreparationReadyFraction
                  ? 'PASS'
                  : 'FAIL',
            medianReady,
            '>= ' + thresholds.minimumMedianPreparationReadyFraction,
            'The current architecture must be able to prepare a meaningful fraction of prioritized missing candidates without breaking the non-persist shadow contract.'
        )
    )

    const representationSafe =
        input.representationQc.mode === 'READ_ONLY' &&
        input.representationQc.rebuildPerformed === false &&
        input.representationQc.servingImpact === false
    const atlasSafe =
        input.authorAtlas.mode === 'READ_ONLY' &&
        input.authorAtlas.rebuildPerformed === false &&
        input.authorAtlas.servingImpact === false &&
        input.authorAtlas.visualRecallEnabled === false &&
        input.authorAtlas.styleFamilyServingEnabled === false
    const familySafe =
        input.styleFamilies.mode === 'READ_ONLY' &&
        input.styleFamilies.provisional === true &&
        input.styleFamilies.servingImpact === false &&
        input.styleFamilies.visualRecallEnabled === false &&
        input.styleFamilies.styleDiversityEnabled === false
    const runSafe = coverageRuns.every((run) => {
        const coverage = visualCoverage(run)
        return (
            coverage !== null &&
            boolean(coverage.servingImpact) === false &&
            boolean(coverage.embeddingGenerationEnabled) === false &&
            boolean(coverage.candidatePersistenceEnabled) === false
        )
    })
    const invariantsSafe =
        representationSafe &&
        atlasSafe &&
        familySafe &&
        runSafe
    criteria.push(
        criterion(
            'VISUAL_SHADOW_SAFETY_INVARIANTS',
            true,
            invariantsSafe ? 'PASS' : 'FAIL',
            invariantsSafe,
            'all analysis modules read-only; no serving, generation, or candidate persistence',
            'Promotion evidence is valid only if it was collected without mutating Visual V1 assets or Recommendation V5 serving.'
        )
    )

    const providerEffect =
        input.representationQc.pairwise.providerEffectProxy
    const sourceEffect =
        input.representationQc.pairwise.sourceKindEffectProxy
    criteria.push(
        criterion(
            'PROVIDER_EFFECT_DIAGNOSTIC',
            false,
            providerEffect === null ? 'INSUFFICIENT' : 'PASS',
            providerEffect,
            'descriptive',
            'Positive values indicate same-author same-provider pairs are more similar than same-author cross-provider pairs.'
        )
    )
    criteria.push(
        criterion(
            'SOURCE_KIND_EFFECT_DIAGNOSTIC',
            false,
            sourceEffect === null ? 'INSUFFICIENT' : 'PASS',
            sourceEffect,
            'descriptive',
            'Positive values indicate same-source-kind pairs are more similar than mixed-source-kind pairs.'
        )
    )

    const required = criteria.filter((item) => item.required)
    const ready = required.every(
        (item) => item.status === 'PASS'
    )

    return {
        gateVersion: VISUAL_ACTIVATION_GATE_V5_VERSION,
        currentShadowModelVersion:
            input.currentShadowModelVersion,
        verdict: ready
            ? ('READY_FOR_SHADOW_REVIEW' as const)
            : ('NOT_READY' as const),
        nextPermittedStage: ready
            ? ('SHADOW_REVIEW' as const)
            : ('OFF' as const),
        autoActivation: false,
        servingMutationEnabled: false,
        embeddingGenerationEnabled: false,
        visualRecallActivationEnabled: false,
        styleDiversityActivationEnabled: false,
        exactShadowRunCount: exactRuns.length,
        coverageRunCount: coverageRuns.length,
        criteria,
        summary: {
            passed: criteria.filter(
                (item) => item.status === 'PASS'
            ).length,
            failed: criteria.filter(
                (item) => item.status === 'FAIL'
            ).length,
            insufficient: criteria.filter(
                (item) => item.status === 'INSUFFICIENT'
            ).length,
            requiredPassed: required.filter(
                (item) => item.status === 'PASS'
            ).length,
            requiredTotal: required.length
        }
    }
}

export const VISUAL_ACTIVATION_GATE_V5_THRESHOLDS =
    thresholds
