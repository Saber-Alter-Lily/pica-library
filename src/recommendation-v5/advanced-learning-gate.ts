import type { buildEvaluationFrameworkV5 } from './evaluation-framework'
import type { compareRetrospectiveBenchmarksV5 } from './benchmark-comparison'

export const ADVANCED_LEARNING_GATE_V5_VERSION =
    'advanced-learning-gate-v1'

type EvaluationFrameworkV5 = ReturnType<
    typeof buildEvaluationFrameworkV5
>
type BenchmarkComparisonV5 = ReturnType<
    typeof compareRetrospectiveBenchmarksV5
>

export type AdvancedLearningDirectionV5 =
    | 'LEARNING_TO_RANK'
    | 'CONTEXTUAL_BANDIT'
    | 'ACTIVE_LEARNING'

export function evaluateAdvancedLearningGateV5(input: {
    evaluation: EvaluationFrameworkV5
    comparison?: BenchmarkComparisonV5 | null
    direction?: AdvancedLearningDirectionV5 | null
}) {
    const direction = input.direction ?? null
    const baselineReady =
        input.evaluation.status ===
        'BASELINE_EVALUATION_READY'
    const comparisonReady =
        input.comparison?.status === 'COMPARISON_READY'

    const common = {
        mode: 'READ_ONLY' as const,
        gateVersion: ADVANCED_LEARNING_GATE_V5_VERSION,
        selectedDirection: direction,
        baselineReady,
        comparisonReady,
        trainingEnabled: false,
        servingMutationEnabled: false,
        autoExperimentCreation: false,
        autoModelSelection: false
    }

    if (!direction)
        return {
            ...common,
            verdict: 'DIRECTION_NOT_SELECTED' as const,
            designReady: false,
            missingRequirements: [
                'HUMAN_SELECTED_ADVANCED_LEARNING_DIRECTION'
            ],
            nextStage: 'HUMAN_DIRECTION_SELECTION' as const
        }

    if (!baselineReady)
        return {
            ...common,
            verdict: 'BASELINE_NOT_READY' as const,
            designReady: false,
            missingRequirements: [
                'BASELINE_EVALUATION_READY'
            ],
            nextStage: 'CONTINUE_FIXED_BASELINE_EVIDENCE' as const
        }

    if (direction === 'LEARNING_TO_RANK') {
        if (!comparisonReady)
            return {
                ...common,
                verdict: 'COMPARISON_NOT_READY' as const,
                designReady: false,
                missingRequirements: [
                    'EXACT_MODEL_VERSION_COMPARISON_READY'
                ],
                nextStage:
                    'COLLECT_COMPARABLE_MODEL_VERSION_EVIDENCE' as const
            }
        return {
            ...common,
            verdict: 'READY_FOR_EXPERIMENT_DESIGN' as const,
            designReady: true,
            missingRequirements: [],
            nextStage:
                'LTR_OFFLINE_EXPERIMENT_DESIGN' as const,
            constraints: {
                permitted: [
                    'offline feature export',
                    'offline train/validation/test split design',
                    'pairwise or listwise baseline experiment planning'
                ],
                prohibited: [
                    'automatic training from production state',
                    'serving replacement',
                    'automatic winner selection'
                ]
            }
        }
    }

    if (direction === 'CONTEXTUAL_BANDIT')
        return {
            ...common,
            verdict:
                'DEFERRED_MISSING_ONLINE_EXPERIMENT_LOGGING' as const,
            designReady: false,
            missingRequirements: [
                'POLICY_PROPENSITY_LOGGING',
                'RANDOMIZED_OR_CONTROLLED_ASSIGNMENT',
                'ONLINE_REWARD_ATTRIBUTION',
                'EXPLORATION_BUDGET_SAFETY_CONTRACT'
            ],
            nextStage:
                'DESIGN_ONLINE_EXPERIMENT_TELEMETRY_FIRST' as const
        }

    return {
        ...common,
        verdict:
            'DEFERRED_MISSING_UNCERTAINTY_LOGGING' as const,
        designReady: false,
        missingRequirements: [
            'MODEL_UNCERTAINTY_SIGNAL',
            'QUERY_VALUE_ESTIMATE',
            'QUESTION_BUDGET',
            'EXPLICIT_QUERY_RESPONSE_EVENTS'
        ],
        nextStage:
            'DESIGN_ACTIVE_LEARNING_TELEMETRY_FIRST' as const
    }
}
