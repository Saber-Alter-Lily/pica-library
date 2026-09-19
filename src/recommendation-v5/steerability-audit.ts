import type { StoredComic } from '../library/types'
import {
    controlIdentityV5,
    matchesControlV5,
    preferenceAdjustmentV5,
    upsertControlV5,
    type PortablePolicyStateV5,
    type PreferenceTargetType
} from './portable-policy'

export const STEERABILITY_AUDIT_V5_VERSION =
    'steerability-audit-v1'

export interface SteerabilityTargetV5 {
    targetType: Exclude<PreferenceTargetType, 'STYLE_FAMILY'>
    key: string
    label: string
    baselineLevel: number
}

function round(value: number | null) {
    return value === null
        ? null
        : Math.round(value * 1_000_000) / 1_000_000
}

function mean(values: number[]) {
    return values.length
        ? values.reduce((sum, value) => sum + value, 0) /
              values.length
        : null
}

function stateWithoutTarget(
    state: PortablePolicyStateV5,
    target: SteerabilityTargetV5
) {
    const id = controlIdentityV5(
        target.targetType,
        target.key
    )
    return {
        ...state,
        controls: state.controls.filter(
            (control) =>
                controlIdentityV5(
                    control.targetType,
                    control.key
                ) !== id
        )
    }
}

export function evaluateSteerabilityV5(input: {
    catalog: StoredComic[]
    state: PortablePolicyStateV5
    targets: SteerabilityTargetV5[]
    requestedStep?: number
}) {
    const requestedStep = Math.max(
        1,
        Math.min(9, Math.round(input.requestedStep ?? 3))
    )
    const results = input.targets.map((target) => {
        const baselineLevel = Math.max(
            1,
            Math.min(10, Math.round(target.baselineLevel))
        )
        const highLevel = Math.min(
            10,
            baselineLevel + requestedStep
        )
        const lowLevel = Math.max(
            1,
            baselineLevel - requestedStep
        )
        const highDelta = highLevel - baselineLevel
        const lowDelta = lowLevel - baselineLevel
        const baseState = stateWithoutTarget(
            input.state,
            target
        )
        const moreState =
            highDelta > 0
                ? upsertControlV5(baseState, {
                      targetType: target.targetType,
                      key: target.key,
                      label: target.label,
                      direction: 'MORE',
                      levelDelta: highDelta,
                      scope: 'PERSISTENT',
                      source: 'DESKTOP',
                      updatedAt: baseState.updatedAt
                  })
                : baseState
        const lessState =
            lowDelta < 0
                ? upsertControlV5(baseState, {
                      targetType: target.targetType,
                      key: target.key,
                      label: target.label,
                      direction: 'LESS',
                      levelDelta: lowDelta,
                      scope: 'PERSISTENT',
                      source: 'DESKTOP',
                      updatedAt: baseState.updatedAt
                  })
                : baseState
        const blockState = upsertControlV5(baseState, {
            targetType: target.targetType,
            key: target.key,
            label: target.label,
            direction: 'BLOCK',
            scope: 'PERSISTENT',
            source: 'DESKTOP',
            updatedAt: baseState.updatedAt
        })

        const rows = input.catalog.map((comic) => {
            const matches = matchesControlV5(comic, {
                targetType: target.targetType,
                key: target.key,
                label: target.label,
                direction: 'DEFAULT',
                scope: 'PERSISTENT',
                source: 'DESKTOP',
                updatedAt: baseState.updatedAt
            })
            const baseline =
                preferenceAdjustmentV5(comic, baseState)
            const more =
                preferenceAdjustmentV5(comic, moreState)
            const less =
                preferenceAdjustmentV5(comic, lessState)
            const block =
                preferenceAdjustmentV5(comic, blockState)
            return {
                comicId: comic.comicId,
                matches,
                baseline,
                more,
                less,
                block
            }
        })
        const matching = rows.filter(
            (row) => row.matches && !row.baseline.blocked
        )
        const nonMatching = rows.filter(
            (row) => !row.matches
        )
        const moreDeltas = matching.map(
            (row) =>
                row.more.adjustment -
                row.baseline.adjustment
        )
        const lessDeltas = matching.map(
            (row) =>
                row.less.adjustment -
                row.baseline.adjustment
        )
        const nonMatchingChanges = nonMatching.flatMap(
            (row) => [
                Math.abs(
                    row.more.adjustment -
                        row.baseline.adjustment
                ),
                Math.abs(
                    row.less.adjustment -
                        row.baseline.adjustment
                )
            ]
        )
        const blockLeakage = matching.filter(
            (row) => !row.block.blocked
        ).length
        const blockCollateral = nonMatching.filter(
            (row) =>
                !row.baseline.blocked &&
                row.block.blocked
        ).length
        const meanMore = round(mean(moreDeltas))
        const meanLess = round(mean(lessDeltas))
        const maxNonMatchingChange =
            nonMatchingChanges.length
                ? round(Math.max(...nonMatchingChanges))
                : 0
        const twoSidedTestable =
            matching.length > 0 &&
            highDelta > 0 &&
            lowDelta < 0
        const pass =
            twoSidedTestable &&
            (meanMore ?? 0) > 0 &&
            (meanLess ?? 0) < 0 &&
            (maxNonMatchingChange ?? 0) <= 1e-12 &&
            blockLeakage === 0 &&
            blockCollateral === 0

        return {
            targetType: target.targetType,
            key: target.key,
            label: target.label,
            baselineLevel,
            highLevel,
            lowLevel,
            highDelta,
            lowDelta,
            matchingCandidateCount: matching.length,
            nonMatchingCandidateCount: nonMatching.length,
            twoSidedTestable,
            meanMatchingAdjustmentDeltaWhenRaised:
                meanMore,
            meanMatchingAdjustmentDeltaWhenLowered:
                meanLess,
            maxNonMatchingAdjustmentChange:
                maxNonMatchingChange,
            blockLeakage,
            blockCollateral,
            pass
        }
    })

    const testable = results.filter(
        (result) => result.twoSidedTestable
    )
    const passed = testable.filter(
        (result) => result.pass
    )

    return {
        mode: 'READ_ONLY' as const,
        auditVersion: STEERABILITY_AUDIT_V5_VERSION,
        servingImpact: false,
        policyMutationEnabled: false,
        requestedStep,
        summary: {
            targetCount: results.length,
            twoSidedTestableCount: testable.length,
            passedCount: passed.length,
            passRate: testable.length
                ? round(passed.length / testable.length)
                : null,
            totalBlockLeakage: results.reduce(
                (sum, result) =>
                    sum + result.blockLeakage,
                0
            ),
            totalBlockCollateral: results.reduce(
                (sum, result) =>
                    sum + result.blockCollateral,
                0
            )
        },
        targets: results,
        interpretation: {
            scope:
                'CONTROL_PLANE_MONOTONICITY_NOT_ONLINE_AB_TEST',
            expected:
                'Raising a target should increase only matching candidate adjustment; lowering should decrease it; BLOCK must hide every matching candidate without affecting non-matches.'
        }
    }
}
