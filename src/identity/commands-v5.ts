import type { WorkIdentityQueriesV5 } from './queries-v5'
import type { WorkIdentityWritePortV5 } from './ports-v5'
import { WORK_IDENTITY_MATERIALIZATION_PREPARE_CONFIRMATION } from './ports-v5'
/** Explicit evidence/decision/preparation commands only; no automatic binding apply. */
export class WorkIdentityCommandsV5 {
    constructor(
        private readonly queries: WorkIdentityQueriesV5,
        private readonly write: WorkIdentityWritePortV5
    ) {}
    recommendationV5RefreshWorkIdentityEvidence(limit = 500) {
        const audit = this.queries.recommendationV5WorkIdentityAudit(limit)
        const saved = this.write.saveWorkIdentityEvidence(
            audit.candidates.map((candidate) => ({
                leftComicId: candidate.leftComicId,
                rightComicId: candidate.rightComicId,
                relation: candidate.relation,
                confidence: candidate.confidence,
                resolverVersion: candidate.resolverVersion,
                evidence: {
                    ...candidate.evidence,
                    leftProvider: candidate.leftProvider,
                    rightProvider: candidate.rightProvider,
                    crossProvider: candidate.crossProvider
                }
            }))
        )
        return {
            mode: 'EVIDENCE_ONLY' as const,
            resolverVersion: audit.resolverVersion,
            scannedComicCount: audit.scannedComicCount,
            candidateCount: audit.candidateCount,
            crossProviderCandidateCount: audit.crossProviderCandidateCount,
            saved,
            storage: this.write.workIdentityStorageStatus(),
            automaticBinding: false
        }
    }

    prepareRecommendationV5WorkIdentityMaterialization(
        input: Record<string, unknown>
    ) {
        const requestKey = String(input.requestKey ?? '').trim()
        const expectedPlanVersion = String(input.planVersion ?? '').trim()
        const expectedPlanDigest = String(input.planDigest ?? '')
            .trim()
            .toLowerCase()
        const confirmation = String(input.confirmation ?? '').trim()
        if (confirmation !== WORK_IDENTITY_MATERIALIZATION_PREPARE_CONFIRMATION)
            throw new Error(
                'Explicit materialization preparation confirmation is required'
            )

        const current =
            this.queries.recommendationV5WorkIdentityMaterializationPlan()
        if (expectedPlanVersion !== current.planVersion)
            throw new Error('Materialization plan version changed')
        if (expectedPlanDigest !== current.planDigest)
            throw new Error('Materialization plan digest changed')
        if (current.summary.workGroupCount < 1)
            throw new Error('No adjudicated work groups are ready to prepare')
        if (
            current.summary.blockedGroupCount > 0 ||
            current.summary.warningCount > 0 ||
            current.summary.fullBindingReadyCount !==
                current.summary.workGroupCount
        )
            throw new Error(
                'Materialization plan still contains blockers, warnings, or unresolved edition partitions'
            )

        const run = this.write.prepareWorkIdentityMaterializationRun({
            requestKey,
            planVersion: current.planVersion,
            planDigest: current.planDigest,
            plan: current
        })
        return {
            mode: 'PREPARED_ONLY' as const,
            executionEnabled: false,
            applyEndpoint: null,
            run,
            currentPlanDigest: current.planDigest
        }
    }

    updateRecommendationV5WorkIdentityDecision(input: Record<string, unknown>) {
        return this.write.atomic(() => {
            const leftComicId = String(input.leftComicId ?? '').trim()
            const rightComicId = String(input.rightComicId ?? '').trim()
            const rawDecision = String(input.decision ?? '')
                .trim()
                .toUpperCase()

            if (rawDecision === 'CLEAR') {
                this.write.clearWorkIdentityDecision(leftComicId, rightComicId)
                this.write.setExplicitDistinctPair(
                    leftComicId,
                    rightComicId,
                    false
                )
                return this.queries.recommendationV5WorkIdentityReview(
                    Number(input.limit ?? 200)
                )
            }

            if (
                !['SAME_WORK', 'EDITION_VARIANT', 'KEEP_SEPARATE'].includes(
                    rawDecision
                )
            )
                throw new Error('Unknown work identity decision')

            const decision = rawDecision as
                | 'SAME_WORK'
                | 'EDITION_VARIANT'
                | 'KEEP_SEPARATE'
            this.write.saveWorkIdentityDecision({
                leftComicId,
                rightComicId,
                decision,
                source: 'USER',
                note: String(input.note ?? '')
            })
            // Only KEEP_SEPARATE changes serving at this stage. SAME_WORK and
            // EDITION_VARIANT remain adjudicated evidence until a later binding
            // phase is explicitly enabled.
            this.write.setExplicitDistinctPair(
                leftComicId,
                rightComicId,
                decision === 'KEEP_SEPARATE'
            )
            return this.queries.recommendationV5WorkIdentityReview(
                Number(input.limit ?? 200)
            )
        })
    }
}
