import type { StoredComic } from '../library/types'
import type { DiversifiedShadowCandidateV5 } from './batch-diversity'
import {
    applyCandidateHygieneV5,
    type CandidateHygieneReasonV5
} from './candidate-hygiene'
import type { PortablePolicyStateV5 } from './portable-policy'
import type { ShadowRetrievedCandidateV5 } from './shadow-retrieval'

export const CORRECTNESS_AUDIT_V5_VERSION =
    'correctness-audit-v1'

const ownershipReasons = new Set<CandidateHygieneReasonV5>([
    'EXPLICIT_OWNED',
    'OWNED_UPLOAD',
    'OWNED_WORK'
])
const duplicateReasons = new Set<CandidateHygieneReasonV5>([
    'DUPLICATE_REPORT',
    'DUPLICATE_UPLOAD_IN_POOL',
    'DUPLICATE_WORK_IN_POOL'
])
const hardConstraintReasons = new Set<CandidateHygieneReasonV5>([
    'HARD_SUPPRESS',
    'TEMPORARY_SUPPRESSION',
    'BLOCK_CONTROL'
])

function summarize(
    removals: Array<{
        reason: CandidateHygieneReasonV5
    }>,
    denominator: number
) {
    const count = (
        reasons: Set<CandidateHygieneReasonV5>
    ) =>
        removals.filter((item) =>
            reasons.has(item.reason)
        ).length
    const alreadySeen = removals.filter(
        (item) => item.reason === 'ALREADY_SEEN'
    ).length
    return {
        totalLeakage: removals.length,
        leakageRate:
            denominator > 0
                ? Math.round(
                      (removals.length / denominator) *
                          1_000_000
                  ) / 1_000_000
                : 0,
        ownershipLeakage: count(ownershipReasons),
        duplicateLeakage: count(duplicateReasons),
        hardConstraintLeakage: count(
            hardConstraintReasons
        ),
        repeatedExposureLeakage: alreadySeen,
        pass: removals.length === 0
    }
}

export function auditShadowCorrectnessV5(input: {
    candidates: ShadowRetrievedCandidateV5[]
    diversified: DiversifiedShadowCandidateV5[]
    catalog: StoredComic[]
    state: PortablePolicyStateV5
    now?: Date
}) {
    const now = input.now ?? new Date()
    const rankedSecondPass = applyCandidateHygieneV5(
        input.candidates,
        input.catalog,
        input.state,
        now
    )
    const batchCandidates: ShadowRetrievedCandidateV5[] =
        input.diversified.map((row) => ({
            comic: row.comic,
            evidence: row.evidence
        }))
    const batchSecondPass = applyCandidateHygieneV5(
        batchCandidates,
        input.catalog,
        input.state,
        now
    )

    const ranked = summarize(
        rankedSecondPass.removals,
        input.candidates.length
    )
    const batch = summarize(
        batchSecondPass.removals,
        batchCandidates.length
    )

    return {
        mode: 'SHADOW_AUDIT' as const,
        auditVersion: CORRECTNESS_AUDIT_V5_VERSION,
        servingImpact: false,
        catalogMutationEnabled: false,
        policyMutationEnabled: false,
        tasteNegativeHardFiltered: false,
        rankedPool: {
            inputCount: input.candidates.length,
            ...ranked,
            reasonCounts:
                rankedSecondPass.telemetry.reasonCounts
        },
        diversifiedBatch: {
            inputCount: batchCandidates.length,
            ...batch,
            reasonCounts:
                batchSecondPass.telemetry.reasonCounts
        },
        pass: ranked.pass && batch.pass
    }
}
