import { describe, expect, it } from 'vitest'
import {
    EVALUATION_FRAMEWORK_V5_VERSION,
    buildEvaluationFrameworkV5
} from '../../src/recommendation-v5/evaluation-framework'

function readyInput() {
    return {
        p3Gate: {
            verdict: 'READY_FOR_MANUAL_REVIEW'
        },
        visualGate: {
            verdict: 'READY_FOR_SHADOW_REVIEW'
        },
        retrospective: {
            support: {
                exactRunCount: 5,
                runWithCorrectnessAuditCount: 5,
                evaluableRunCount: 4
            },
            discovery: {
                serendipity:
                    'NOT_YET_IDENTIFIABLE_WITH_CURRENT_LOGS',
                longTailCoverage:
                    'NOT_YET_IDENTIFIABLE_WITH_CURRENT_LOGS'
            },
            limitations: ['future-event overlap']
        },
        steerability: {
            summary: {
                twoSidedTestableCount: 10,
                passRate: 1
            }
        }
    }
}

describe('Recommendation V5 evaluation framework', () => {
    it('can declare the fixed baseline evaluable without authorizing promotion or advanced models', () => {
        const result = buildEvaluationFrameworkV5(
            readyInput() as unknown as Parameters<
                typeof buildEvaluationFrameworkV5
            >[0]
        )
        expect(result.frameworkVersion).toBe(
            EVALUATION_FRAMEWORK_V5_VERSION
        )
        expect(result.mode).toBe('READ_ONLY')
        expect(result.status).toBe(
            'BASELINE_EVALUATION_READY'
        )
        expect(result.servingImpact).toBe(false)
        expect(result.autoPromotion).toBe(false)
        expect(result.modelEscalationEnabled).toBe(false)
        expect(result.decisions).toMatchObject({
            servingPromotion: 'HUMAN_REVIEW_REQUIRED',
            advancedLearning:
                'DEFERRED_UNTIL_BASELINE_COMPARISON',
            learningToRank: false,
            contextualBandit: false,
            activeLearning: false
        })
        expect(result.scientificCoverage).toMatchObject({
            correctness: true,
            accuracy: true,
            diversity: true,
            discovery: false,
            steerability: true,
            visualReadiness: true
        })
    })

    it('stays in baseline-building state when future outcomes and steerability support are insufficient', () => {
        const input = readyInput()
        input.retrospective.support.evaluableRunCount = 0
        input.steerability.summary.twoSidedTestableCount = 2
        input.steerability.summary.passRate = null as unknown as number
        const result = buildEvaluationFrameworkV5(
            input as unknown as Parameters<
                typeof buildEvaluationFrameworkV5
            >[0]
        )
        expect(result.status).toBe('BASELINE_BUILDING')
        expect(
            result.criteria.find(
                (item) => item.id === 'FUTURE_OUTCOME_SUPPORT'
            )?.status
        ).toBe('INSUFFICIENT')
        expect(
            result.criteria.find(
                (item) =>
                    item.id ===
                    'STEERABILITY_TARGET_SUPPORT'
            )?.status
        ).toBe('INSUFFICIENT')
        expect(result.autoPromotion).toBe(false)
    })
})
