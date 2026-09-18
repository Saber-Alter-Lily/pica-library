import type { buildRetrospectiveBenchmarkV5 } from './retrospective-benchmark'
import type { evaluateSteerabilityV5 } from './steerability-audit'
import type { evaluateP3PromotionGateV5 } from './promotion-gate'
import type { evaluateVisualActivationGateV5 } from './visual-activation-gate'

export const EVALUATION_FRAMEWORK_V5_VERSION =
    'recommendation-evaluation-framework-v1'

type RetrospectiveBenchmarkV5 = ReturnType<
    typeof buildRetrospectiveBenchmarkV5
>
type SteerabilityAuditV5 = ReturnType<
    typeof evaluateSteerabilityV5
>
type P3PromotionGateV5 = ReturnType<
    typeof evaluateP3PromotionGateV5
>
type VisualActivationGateV5 = ReturnType<
    typeof evaluateVisualActivationGateV5
>

const thresholds = {
    minimumExactShadowRuns: 3,
    minimumCorrectnessAuditRuns: 3,
    minimumEvaluableFutureRuns: 3,
    minimumTwoSidedSteerabilityTargets: 5,
    minimumSteerabilityPassRate: 1
} as const

export function buildEvaluationFrameworkV5(input: {
    p3Gate: P3PromotionGateV5
    visualGate: VisualActivationGateV5
    retrospective: RetrospectiveBenchmarkV5
    steerability: SteerabilityAuditV5
}) {
    const criteria = [
        {
            id: 'EXACT_SHADOW_RUN_SUPPORT',
            status:
                input.retrospective.support.exactRunCount >=
                thresholds.minimumExactShadowRuns
                    ? ('PASS' as const)
                    : ('INSUFFICIENT' as const),
            actual: input.retrospective.support.exactRunCount,
            threshold:
                '>= ' + thresholds.minimumExactShadowRuns,
            note: 'Evaluation should aggregate repeated runs from the exact current shadow pipeline version.'
        },
        {
            id: 'CORRECTNESS_AUDIT_SUPPORT',
            status:
                input.retrospective.support
                    .runWithCorrectnessAuditCount >=
                thresholds.minimumCorrectnessAuditRuns
                    ? ('PASS' as const)
                    : ('INSUFFICIENT' as const),
            actual:
                input.retrospective.support
                    .runWithCorrectnessAuditCount,
            threshold:
                '>= ' +
                thresholds.minimumCorrectnessAuditRuns,
            note: 'Correctness claims require repeated zero-leakage audits, not a single run.'
        },
        {
            id: 'FUTURE_OUTCOME_SUPPORT',
            status:
                input.retrospective.support.evaluableRunCount >=
                thresholds.minimumEvaluableFutureRuns
                    ? ('PASS' as const)
                    : ('INSUFFICIENT' as const),
            actual:
                input.retrospective.support.evaluableRunCount,
            threshold:
                '>= ' +
                thresholds.minimumEvaluableFutureRuns,
            note: 'Offline accuracy cannot be interpreted until multiple historical runs have later positive outcomes.'
        },
        {
            id: 'STEERABILITY_TARGET_SUPPORT',
            status:
                input.steerability.summary
                    .twoSidedTestableCount >=
                thresholds.minimumTwoSidedSteerabilityTargets
                    ? ('PASS' as const)
                    : ('INSUFFICIENT' as const),
            actual:
                input.steerability.summary
                    .twoSidedTestableCount,
            threshold:
                '>= ' +
                thresholds.minimumTwoSidedSteerabilityTargets,
            note: 'Control semantics should be tested on multiple independently matching targets.'
        },
        {
            id: 'STEERABILITY_MONOTONICITY',
            status:
                input.steerability.summary.passRate === null
                    ? ('INSUFFICIENT' as const)
                    : input.steerability.summary.passRate >=
                        thresholds.minimumSteerabilityPassRate
                      ? ('PASS' as const)
                      : ('FAIL' as const),
            actual: input.steerability.summary.passRate,
            threshold:
                '>= ' +
                thresholds.minimumSteerabilityPassRate,
            note: 'Every testable target should move matching candidates monotonically and keep BLOCK leakage/collateral at zero.'
        },
        {
            id: 'P3_SHADOW_ENGINEERING_GATE',
            status:
                input.p3Gate.verdict ===
                'READY_FOR_MANUAL_REVIEW'
                    ? ('PASS' as const)
                    : ('INSUFFICIENT' as const),
            actual: input.p3Gate.verdict,
            threshold: 'READY_FOR_MANUAL_REVIEW',
            note: 'The engineering shadow pipeline must be stable before accuracy metrics can drive model decisions.'
        }
    ]

    const requiredReady = criteria.every(
        (item) => item.status === 'PASS'
    )
    const discoveryComplete =
        input.retrospective.discovery.serendipity !==
            'NOT_YET_IDENTIFIABLE_WITH_CURRENT_LOGS' &&
        input.retrospective.discovery.longTailCoverage !==
            'NOT_YET_IDENTIFIABLE_WITH_CURRENT_LOGS'

    return {
        frameworkVersion: EVALUATION_FRAMEWORK_V5_VERSION,
        mode: 'READ_ONLY' as const,
        servingImpact: false,
        autoPromotion: false,
        modelEscalationEnabled: false,
        status: requiredReady
            ? ('BASELINE_EVALUATION_READY' as const)
            : ('BASELINE_BUILDING' as const),
        scientificCoverage: {
            correctness: true,
            accuracy:
                input.retrospective.support.evaluableRunCount > 0,
            diversity:
                input.retrospective.support.exactRunCount > 0,
            discovery: discoveryComplete,
            steerability:
                input.steerability.summary
                    .twoSidedTestableCount > 0,
            visualReadiness:
                input.visualGate.verdict ===
                'READY_FOR_SHADOW_REVIEW'
        },
        criteria,
        sections: {
            p3EngineeringGate: input.p3Gate,
            visualActivationGate: input.visualGate,
            retrospective: input.retrospective,
            steerability: input.steerability
        },
        decisions: {
            servingPromotion:
                'HUMAN_REVIEW_REQUIRED',
            visualActivation:
                input.visualGate.verdict,
            advancedLearning:
                'DEFERRED_UNTIL_BASELINE_COMPARISON',
            learningToRank: false,
            contextualBandit: false,
            activeLearning: false
        },
        limitations: [
            ...input.retrospective.limitations,
            'Steerability currently validates control-plane monotonicity rather than causal online user response.',
            'This framework does not authorize serving changes; it only reports whether the fixed benchmark has enough evidence to support comparison.'
        ]
    }
}

export const EVALUATION_FRAMEWORK_V5_THRESHOLDS =
    thresholds
