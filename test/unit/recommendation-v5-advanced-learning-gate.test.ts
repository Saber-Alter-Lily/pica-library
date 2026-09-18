import { describe, expect, it } from 'vitest'
import {
    ADVANCED_LEARNING_GATE_V5_VERSION,
    evaluateAdvancedLearningGateV5
} from '../../src/recommendation-v5/advanced-learning-gate'

function evaluation(
    status:
        | 'BASELINE_EVALUATION_READY'
        | 'BASELINE_BUILDING'
) {
    return {
        status,
        frameworkVersion: 'recommendation-evaluation-framework-v1'
    } as any
}

function comparison(
    status:
        | 'COMPARISON_READY'
        | 'INSUFFICIENT_SUPPORT'
) {
    return {
        status,
        comparisonVersion: 'benchmark-comparison-v1'
    } as any
}

describe('Recommendation V5 advanced learning decision gate', () => {
    it('allows Learning-to-Rank to enter experiment design only after baseline and comparison are ready', () => {
        const gate = evaluateAdvancedLearningGateV5({
            evaluation: evaluation(
                'BASELINE_EVALUATION_READY'
            ),
            comparison: comparison('COMPARISON_READY'),
            direction: 'LEARNING_TO_RANK'
        })

        expect(gate.gateVersion).toBe(
            ADVANCED_LEARNING_GATE_V5_VERSION
        )
        expect(gate.verdict).toBe(
            'READY_FOR_EXPERIMENT_DESIGN'
        )
        expect(gate.designReady).toBe(true)
        expect(gate.nextStage).toBe(
            'LTR_OFFLINE_EXPERIMENT_DESIGN'
        )
        expect(gate.trainingEnabled).toBe(false)
        expect(gate.servingMutationEnabled).toBe(false)
        expect(gate.autoExperimentCreation).toBe(false)
        expect(gate.autoModelSelection).toBe(false)
    })

    it('keeps LTR blocked when the exact model comparison is not ready', () => {
        const gate = evaluateAdvancedLearningGateV5({
            evaluation: evaluation(
                'BASELINE_EVALUATION_READY'
            ),
            comparison: comparison('INSUFFICIENT_SUPPORT'),
            direction: 'LEARNING_TO_RANK'
        })
        expect(gate).toMatchObject({
            verdict: 'COMPARISON_NOT_READY',
            designReady: false,
            trainingEnabled: false,
            servingMutationEnabled: false
        })
        expect(gate.missingRequirements).toContain(
            'EXACT_MODEL_VERSION_COMPARISON_READY'
        )
    })

    it('keeps contextual bandit deferred until propensity and randomized assignment telemetry exists', () => {
        const gate = evaluateAdvancedLearningGateV5({
            evaluation: evaluation(
                'BASELINE_EVALUATION_READY'
            ),
            comparison: comparison('COMPARISON_READY'),
            direction: 'CONTEXTUAL_BANDIT'
        })
        expect(gate.verdict).toBe(
            'DEFERRED_MISSING_ONLINE_EXPERIMENT_LOGGING'
        )
        expect(gate.designReady).toBe(false)
        expect(gate.missingRequirements).toEqual(
            expect.arrayContaining([
                'POLICY_PROPENSITY_LOGGING',
                'RANDOMIZED_OR_CONTROLLED_ASSIGNMENT',
                'ONLINE_REWARD_ATTRIBUTION',
                'EXPLORATION_BUDGET_SAFETY_CONTRACT'
            ])
        )
    })

    it('keeps active learning deferred until uncertainty and query-value telemetry exists', () => {
        const gate = evaluateAdvancedLearningGateV5({
            evaluation: evaluation(
                'BASELINE_EVALUATION_READY'
            ),
            comparison: comparison('COMPARISON_READY'),
            direction: 'ACTIVE_LEARNING'
        })
        expect(gate.verdict).toBe(
            'DEFERRED_MISSING_UNCERTAINTY_LOGGING'
        )
        expect(gate.designReady).toBe(false)
        expect(gate.missingRequirements).toEqual(
            expect.arrayContaining([
                'MODEL_UNCERTAINTY_SIGNAL',
                'QUERY_VALUE_ESTIMATE',
                'QUESTION_BUDGET',
                'EXPLICIT_QUERY_RESPONSE_EVENTS'
            ])
        )
    })

    it('requires the fixed baseline evaluation before any advanced direction', () => {
        const gate = evaluateAdvancedLearningGateV5({
            evaluation: evaluation('BASELINE_BUILDING'),
            comparison: comparison('COMPARISON_READY'),
            direction: 'LEARNING_TO_RANK'
        })
        expect(gate.verdict).toBe('BASELINE_NOT_READY')
        expect(gate.designReady).toBe(false)
        expect(gate.missingRequirements).toEqual([
            'BASELINE_EVALUATION_READY'
        ])
    })

    it('does nothing until a human selects an advanced direction', () => {
        const gate = evaluateAdvancedLearningGateV5({
            evaluation: evaluation(
                'BASELINE_EVALUATION_READY'
            ),
            comparison: comparison('COMPARISON_READY')
        })
        expect(gate.verdict).toBe('DIRECTION_NOT_SELECTED')
        expect(gate.selectedDirection).toBeNull()
        expect(gate.trainingEnabled).toBe(false)
        expect(gate.servingMutationEnabled).toBe(false)
    })
})
