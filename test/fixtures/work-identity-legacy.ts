import type { StoredComic } from '../../src/library/types'
import { cosineSimilarity } from '../../src/recommendation-v4/visual-style'
import { normalizePreferenceKey, workIdentitySignalsV2 } from '../../src/recommendation-v5/portable-policy'
import { WORK_IDENTITY_RESOLVER_VERSION, buildWorkIdentityAuditV5, buildWorkIdentityAuditAsyncV5, buildWorkIdentityMaterializationPlanV5, buildWorkIdentityMaterializationPreviewV5 } from '../../src/recommendation-v5/work-identity-foundation'
import { WORK_IDENTITY_V3_RESOLVER_VERSION, workIdentityCreatorBucketKeysV3, workIdentityDetailEvidenceV3 } from '../../src/recommendation-v5/work-identity-v3'
import { createHash } from 'node:crypto'
import type { LibraryDatabase } from '../../src/library/database'
import type { WorkIdentityEvidenceRefreshTaskProgress } from '../../src/library/service'
import { RecommendationPolicyStoreV5 } from '../../src/recommendation-v5/policy-store'
export const IDENTITY_ORACLE_SOURCE_V5 = '2c3f7d647100441398b28fbdc0cc41a5e8ffd0cc'
const WORK_IDENTITY_MATERIALIZATION_PREPARE_CONFIRMATION =
    'PREPARE_CANONICAL_WORK_BINDING'
class WorkIdentityEvidenceRefreshCancelledError extends Error {
    constructor() {
        super('Work Identity evidence refresh was cancelled')
        this.name = 'WorkIdentityEvidenceRefreshCancelledError'
    }
}
/** Frozen original method bodies and control fields; does not call replacement modules. */
export class FrozenWorkIdentityV5 {
constructor(private readonly database: LibraryDatabase, private readonly admission: () => Promise<{release(): void}> = async () => ({release(){}})) {}
private readonly runtimeResources = {acquire: (_request: unknown) => this.admission()}
private workIdentityEvidenceRefreshProgress: WorkIdentityEvidenceRefreshTaskProgress =
        {
            state: 'idle',
            phase: 'idle',
            done: 0,
            total: 0,
            candidateCount: 0,
            pairChecks: 0,
            savedCount: 0
        }
private workIdentityEvidenceRefreshPauseRequested = false
private workIdentityEvidenceRefreshCancelRequested = false
private workIdentityEvidenceRefreshResumePhase: WorkIdentityEvidenceRefreshTaskProgress['phase'] =
        'loading'
private readonly workIdentityEvidenceRefreshResumeWaiters = new Set<
        () => void
    >()
private workIdentityEvidenceRefreshRun: Promise<void> | null = null
private workIdentityEvidenceRefreshResult:
        | {
              scannedComicCount: number
              candidateCount: number
              crossProviderCandidateCount: number
              savedCount: number
          }
        | null = null
private allComicsForIdentity(): StoredComic[] {
        return this.database.listComics(
            {
                limit: Number.MAX_SAFE_INTEGER,
                sort: 'latest'
            },
            Number.MAX_SAFE_INTEGER
        )
    }

workVariantsForComic(comicId: string, limit = 24) {
        const id = String(comicId ?? '').trim()
        const bounded = Math.max(1, Math.min(48, Math.floor(limit)))
        const catalog = this.allComicsForIdentity()
        const catalogById = new Map(
            catalog.map((comic) => [comic.comicId, comic] as const)
        )
        const current = catalogById.get(id)
        if (!id || !current)
            return {
                comicId: id,
                count: 0,
                confirmedCount: 0,
                probableCount: 0,
                workId: null,
                editionId: null,
                favoriteCount: 0,
                downloadedCount: 0,
                items: []
            }

        const currentBinding = this.database.getWorkIdentityBinding(id)
        const workBindings = currentBinding
            ? this.database.listWorkIdentityBindingsForWork(
                  currentBinding.workId
              )
            : []
        const decisions =
            this.database.listWorkIdentityDecisionsForComic(id)
        const probableEvidence =
            this.database.listWorkIdentityProbableEvidenceForComic(id, 0.94)
        const relationshipComicIds = new Set<string>([
            id,
            ...workBindings.map((binding) => binding.comicId),
            ...decisions.flatMap((item) => [
                item.leftComicId,
                item.rightComicId
            ]),
            ...probableEvidence.flatMap((item) => [
                item.leftComicId,
                item.rightComicId
            ])
        ])
        const relatedBindings =
            this.database.listWorkIdentityBindingsByComicIds([
                ...relationshipComicIds
            ])
        const bindingByComic = new Map(
            relatedBindings.map(
                (binding) => [binding.comicId, binding] as const
            )
        )
        const decisionByPair = new Map(
            decisions.map((item) => [
                [item.leftComicId, item.rightComicId].sort().join('\u0000'),
                item
            ] as const)
        )
        const rows = new Map<string, Record<string, unknown>>()
        const relationPriority: Record<string, number> = {
            CONFIRMED_SAME_EDITION: 0,
            CONFIRMED_WORK_VARIANT: 1,
            ADJUDICATED_EDITION_VARIANT: 2,
            ADJUDICATED_SAME_WORK: 3,
            PROBABLE_SAME_WORK: 4
        }
        const add = (
            otherId: string,
            relation: string,
            confidence: number,
            binding = bindingByComic.get(otherId) ?? null,
            extraEvidence: Record<string, unknown> = {}
        ) => {
            if (!otherId || otherId === id) return
            const comic = catalogById.get(otherId)
            if (!comic) return
            const pairKey = [id, otherId].sort().join('\u0000')
            const decision = decisionByPair.get(pairKey)
            if (decision?.decision === 'KEEP_SEPARATE') return
            const existing = rows.get(otherId)
            const existingPriority = existing
                ? relationPriority[String(existing.relation)] ?? 99
                : 99
            const nextPriority = relationPriority[relation] ?? 99
            if (existing && existingPriority <= nextPriority) return
            rows.set(otherId, {
                comicId: comic.comicId,
                relation,
                confidence,
                workId: binding?.workId ?? null,
                editionId: binding?.editionId ?? null,
                editionLabel: binding?.editionLabel ?? '',
                editionLanguage: binding?.editionLanguage ?? null,
                editionKind: binding?.editionKind ?? null,
                title: comic.title,
                alternateTitles: comic.alternateTitles ?? [],
                author: comic.author,
                canonicalAuthor: comic.canonicalAuthor,
                description: comic.description ?? '',
                tags: comic.tags ?? [],
                categories: comic.categories ?? [],
                finished: Boolean(comic.finished),
                completionStatus: comic.completionStatus ?? 'UNKNOWN',
                totalLikes: Number(comic.totalLikes || 0),
                totalViews: Number(comic.totalViews || 0),
                pagesCount:
                    Number(comic.pagesCount || 0) ||
                    Number(comic.knownPictures || 0),
                providerId:
                    comic.providerId ||
                    (comic.comicId.startsWith('eh:') ? 'eh' : 'pica'),
                rating:
                    Number.isFinite(Number(comic.rating))
                        ? Number(comic.rating)
                        : null,
                chineseTeam: comic.chineseTeam ?? '',
                isFavorite: Boolean(comic.isFavorite),
                downloadedPictures: Number(comic.downloadedPictures || 0),
                knownPictures: Number(comic.knownPictures || 0),
                inLibrary: Boolean(comic.inLibrary),
                coverPath: `/api/v1/covers/${encodeURIComponent(comic.comicId)}`,
                identityEvidence: extraEvidence
            })
        }

        if (currentBinding) {
            for (const binding of workBindings) {
                if (binding.comicId === id) continue
                add(
                    binding.comicId,
                    binding.editionId &&
                        currentBinding.editionId &&
                        binding.editionId === currentBinding.editionId
                        ? 'CONFIRMED_SAME_EDITION'
                        : 'CONFIRMED_WORK_VARIANT',
                    Math.max(
                        Number(binding.confidence || 0),
                        Number(currentBinding.confidence || 0)
                    ),
                    binding
                )
            }
        }

        for (const decision of decisions) {
            if (decision.decision === 'KEEP_SEPARATE') continue
            const otherId =
                decision.leftComicId === id
                    ? decision.rightComicId
                    : decision.leftComicId
            add(
                otherId,
                decision.decision === 'EDITION_VARIANT'
                    ? 'ADJUDICATED_EDITION_VARIANT'
                    : 'ADJUDICATED_SAME_WORK',
                1
            )
        }

        for (const evidence of probableEvidence) {
            const otherId =
                evidence.leftComicId === id
                    ? evidence.rightComicId
                    : evidence.leftComicId
            add(
                otherId,
                'PROBABLE_SAME_WORK',
                Number(evidence.confidence || 0)
            )
        }

        // Work Identity V3 detail funnel:
        // 1) resolve creator buckets first;
        // 2) compare titles only inside creator buckets;
        // 3) use exact-title fallback when creator metadata is incomplete;
        // 4) use cover identity only for unresolved metadata candidates.
        const policy = new RecommendationPolicyStoreV5(this.database).state()
        const explicitDistinct = new Set(policy.explicitDistinctPairs)
        const currentCreatorKeys = new Set(
            workIdentityCreatorBucketKeysV3(current)
        )
        const creatorCandidates: StoredComic[] = []
        const titleFallbackCandidates: StoredComic[] = []

        for (const other of catalog) {
            if (other.comicId === id || rows.has(other.comicId)) continue
            const pairKey = [id, other.comicId].sort().join('\u0000')
            const portablePairKey = [id, other.comicId]
                .map(normalizePreferenceKey)
                .sort()
                .join('\u0000')
            if (
                decisionByPair.get(pairKey)?.decision === 'KEEP_SEPARATE' ||
                explicitDistinct.has(portablePairKey)
            )
                continue

            const creatorKeys = workIdentityCreatorBucketKeysV3(other)
            if (
                creatorKeys.some((key) => currentCreatorKeys.has(key))
            ) {
                creatorCandidates.push(other)
                continue
            }

            // Author identity is the primary funnel. When it is missing or uses
            // an unresolved cross-language alias, only exact/core title overlap
            // is allowed into the fallback pool. We deliberately do not run a
            // full-catalog fuzzy title search.
            const signals = workIdentitySignalsV2(current, other)
            if (
                signals.strictTitleMatch ||
                signals.trustedCoreTitleMatch ||
                signals.looseTitleMatch
            )
                titleFallbackCandidates.push(other)
        }

        const reviewCandidates: Array<{
            comic: StoredComic
            evidence: ReturnType<typeof workIdentityDetailEvidenceV3>
            source: 'CREATOR_BUCKET' | 'TITLE_FALLBACK'
        }> = []
        const evaluate = (
            other: StoredComic,
            source: 'CREATOR_BUCKET' | 'TITLE_FALLBACK'
        ) => {
            const evidence = workIdentityDetailEvidenceV3(current, other)
            const detailEvidence = {
                resolverVersion: WORK_IDENTITY_V3_RESOLVER_VERSION,
                funnelSource: source,
                ...evidence
            }
            if (evidence.relation === 'HIGH_CONFIDENCE_WORK') {
                add(
                    other.comicId,
                    'PROBABLE_SAME_WORK',
                    evidence.confidence,
                    undefined,
                    detailEvidence
                )
                return
            }
            if (evidence.relation === 'REVIEW_CANDIDATE')
                reviewCandidates.push({ comic: other, evidence, source })
        }

        for (const other of creatorCandidates)
            evaluate(other, 'CREATOR_BUCKET')
        for (const other of titleFallbackCandidates)
            if (!rows.has(other.comicId)) evaluate(other, 'TITLE_FALLBACK')

        // Stage 3 only touches covers for metadata candidates that remain
        // ambiguous. This keeps the normal path cheap while allowing a near-
        // duplicate cover to rescue translated/retitled editions.
        const rankedReviews = reviewCandidates
            .sort(
                (a, b) =>
                    b.evidence.confidence - a.evidence.confidence ||
                    b.evidence.titleSimilarity -
                        a.evidence.titleSimilarity ||
                    a.comic.comicId.localeCompare(b.comic.comicId)
            )
            .slice(0, 96)

        if (rankedReviews.length) {
            const requestedIds = [
                id,
                ...rankedReviews.map((item) => item.comic.comicId)
            ]
            const coverEmbeddings = this.database
                .listVisualEmbeddings(requestedIds)
                .filter((embedding) => embedding.embeddingKind === 'cover')
            const latestCover = new Map<
                string,
                (typeof coverEmbeddings)[number]
            >()
            for (const embedding of coverEmbeddings) {
                const existing = latestCover.get(embedding.comicId)
                if (
                    !existing ||
                    String(embedding.generatedAt) >
                        String(existing.generatedAt)
                )
                    latestCover.set(embedding.comicId, embedding)
            }

            const currentCover = latestCover.get(id)
            for (const item of rankedReviews) {
                if (rows.has(item.comic.comicId)) continue
                const otherCover = latestCover.get(item.comic.comicId)
                let comparableCover = false
                let similarity: number | null = null
                if (
                    currentCover &&
                    otherCover &&
                    otherCover.modelId === currentCover.modelId &&
                    otherCover.modelVersion === currentCover.modelVersion &&
                    otherCover.dimension === currentCover.dimension
                ) {
                    comparableCover = true
                    const value = cosineSimilarity(
                        currentCover.vector,
                        otherCover.vector
                    )
                    if (Number.isFinite(value)) similarity = value
                }

                if (similarity !== null && similarity >= 0.992) {
                    add(
                        item.comic.comicId,
                        'PROBABLE_SAME_WORK',
                        Math.max(
                            item.evidence.confidence,
                            Math.min(
                                0.985,
                                0.94 +
                                    (similarity - 0.992) * 4 +
                                    (item.evidence.creatorMatch ? 0.015 : 0) +
                                    (item.evidence.pageCountCompatible
                                        ? 0.01
                                        : 0)
                            )
                        ),
                        undefined,
                        {
                            resolverVersion: WORK_IDENTITY_V3_RESOLVER_VERSION,
                            funnelSource: item.source,
                            ...item.evidence,
                            coverIdentitySimilarity: similarity,
                            coverIdentityModel:
                                currentCover!.modelId +
                                '@' +
                                currentCover!.modelVersion,
                            coverIdentityStage: 'REVIEW_CONFIRMATION'
                        }
                    )
                    continue
                }

                // If no comparable cover exists, keep only stronger creator-
                // scoped metadata candidates visible as "possibly same work".
                // If a comparable cover exists and disagrees, do not surface it.
                const minimumWithoutCover = 0.8
                if (
                    !comparableCover &&
                    item.evidence.creatorMatch &&
                    item.evidence.confidence >= minimumWithoutCover
                )
                    add(
                        item.comic.comicId,
                        'PROBABLE_SAME_WORK',
                        item.evidence.confidence,
                        undefined,
                        {
                            resolverVersion: WORK_IDENTITY_V3_RESOLVER_VERSION,
                            funnelSource: item.source,
                            ...item.evidence,
                            coverIdentityStage: 'UNAVAILABLE'
                        }
                    )
            }
        }

        const rankedItems = [...rows.values()].sort(
            (a, b) =>
                (relationPriority[String(a.relation)] ?? 99) -
                    (relationPriority[String(b.relation)] ?? 99) ||
                Number(Boolean(b.isFavorite)) -
                    Number(Boolean(a.isFavorite)) ||
                Number(b.downloadedPictures || 0) -
                    Number(a.downloadedPictures || 0) ||
                String(a.title || '').localeCompare(String(b.title || ''))
        )
        const confirmedCount = rankedItems.filter((item) => {
            const relation = String(item.relation)
            return (
                relation.startsWith('CONFIRMED_') ||
                relation.startsWith('ADJUDICATED_')
            )
        }).length
        const favoriteCount = rankedItems.filter((item) =>
            Boolean(item.isFavorite)
        ).length
        const downloadedCount = rankedItems.filter(
            (item) => Number(item.downloadedPictures || 0) > 0
        ).length
        const items = rankedItems.slice(0, bounded)
        return {
            comicId: id,
            count: rankedItems.length,
            shownCount: items.length,
            confirmedCount,
            probableCount: rankedItems.length - confirmedCount,
            favoriteCount,
            downloadedCount,
            workId: currentBinding?.workId ?? null,
            editionId: currentBinding?.editionId ?? null,
            items
        }
    }

recommendationV5WorkIdentityAudit(limit = 200) {
        const catalog = this.allComicsForIdentity()
        const state = new RecommendationPolicyStoreV5(this.database).state()
        return {
            ...buildWorkIdentityAuditV5(catalog, state, limit),
            resolverVersion: WORK_IDENTITY_RESOLVER_VERSION,
            persistence: 'NONE' as const,
            automaticBinding: false
        }
    }

recommendationV5WorkIdentityEvidence(limit = 200) {
        return {
            storage: this.database.workIdentityStorageStatus(),
            evidence: this.database.listWorkIdentityEvidence(limit),
            automaticBinding: false
        }
    }

recommendationV5WorkIdentityReview(limit = 200) {
        const evidence = this.database.listWorkIdentityEvidence(limit)
        const decisions = this.database.listWorkIdentityDecisions(5000)
        const decisionCount =
            this.database.workIdentityStorageStatus().counts.decisions
        const authoritativeDecisions =
            decisionCount > decisions.length
                ? this.database.listAllWorkIdentityDecisions()
                : decisions
        const decisionByPair = new Map(
            authoritativeDecisions.map((item) => [
                [item.leftComicId, item.rightComicId].sort().join('\u0000'),
                item
            ])
        )
        const rows = evidence.map((item) => ({
            ...item,
            decision:
                decisionByPair.get(
                    [item.leftComicId, item.rightComicId]
                        .sort()
                        .join('\u0000')
                ) ?? null
        }))
        const materializationPreview =
            buildWorkIdentityMaterializationPreviewV5(
                this.allComicsForIdentity(),
                authoritativeDecisions
            )
        return {
            mode: 'HUMAN_REVIEW' as const,
            storage: this.database.workIdentityStorageStatus(),
            evidence: rows,
            decisions,
            undecidedCount: rows.filter((item) => !item.decision).length,
            materializationPreview,
            automaticBinding: false
        }
    }

recommendationV5WorkIdentityMaterializationPlan() {
        const catalog = this.allComicsForIdentity()
        const decisions = this.database.listAllWorkIdentityDecisions()
        const existingBindings = this.database.listAllWorkIdentityBindings()
        const plan = buildWorkIdentityMaterializationPlanV5(
            catalog,
            decisions,
            existingBindings
        )
        const planDigest = createHash('sha256')
            .update(JSON.stringify(plan))
            .digest('hex')
        return {
            ...plan,
            planDigest,
            storage: this.database.workIdentityStorageStatus()
        }
    }

recommendationV5WorkIdentityMaterializationRuns(limit = 100) {
        return {
            executionEnabled: false,
            runs: this.database.listWorkIdentityMaterializationRuns(limit)
        }
    }

recommendationV5RefreshWorkIdentityEvidence(limit = 500) {
        const audit = this.recommendationV5WorkIdentityAudit(limit)
        const saved = this.database.saveWorkIdentityEvidence(
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
            crossProviderCandidateCount:
                audit.crossProviderCandidateCount,
            saved,
            storage: this.database.workIdentityStorageStatus(),
            automaticBinding: false
        }
    }

prepareRecommendationV5WorkIdentityMaterialization(
        input: Record<string, unknown>
    ) {
        const requestKey = String(input.requestKey ?? '').trim()
        const expectedPlanVersion = String(
            input.planVersion ?? ''
        ).trim()
        const expectedPlanDigest = String(
            input.planDigest ?? ''
        )
            .trim()
            .toLowerCase()
        const confirmation = String(input.confirmation ?? '').trim()
        if (
            confirmation !==
            WORK_IDENTITY_MATERIALIZATION_PREPARE_CONFIRMATION
        )
            throw new Error(
                'Explicit materialization preparation confirmation is required'
            )

        const current =
            this.recommendationV5WorkIdentityMaterializationPlan()
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

        const run = this.database.prepareWorkIdentityMaterializationRun({
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

updateRecommendationV5WorkIdentityDecision(
        input: Record<string, unknown>
    ) {
        const leftComicId = String(input.leftComicId ?? '').trim()
        const rightComicId = String(input.rightComicId ?? '').trim()
        const rawDecision = String(input.decision ?? '').trim().toUpperCase()
        const store = new RecommendationPolicyStoreV5(this.database)

        if (rawDecision === 'CLEAR') {
            this.database.clearWorkIdentityDecision(
                leftComicId,
                rightComicId
            )
            store.setExplicitDistinctPair(
                leftComicId,
                rightComicId,
                false
            )
            return this.recommendationV5WorkIdentityReview(
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
        this.database.saveWorkIdentityDecision({
            leftComicId,
            rightComicId,
            decision,
            source: 'USER',
            note: String(input.note ?? '')
        })
        // Only KEEP_SEPARATE changes serving at this stage. SAME_WORK and
        // EDITION_VARIANT remain adjudicated evidence until a later binding
        // phase is explicitly enabled.
        store.setExplicitDistinctPair(
            leftComicId,
            rightComicId,
            decision === 'KEEP_SEPARATE'
        )
        return this.recommendationV5WorkIdentityReview(
            Number(input.limit ?? 200)
        )
    }

recommendationV5WorkIdentityEvidenceRefreshStatus() {
        const active = [
            'running',
            'pausing',
            'paused',
            'cancelling'
        ].includes(this.workIdentityEvidenceRefreshProgress.state)
        const terminal = [
            'complete',
            'failed',
            'cancelled'
        ].includes(this.workIdentityEvidenceRefreshProgress.state)
        return {
            ...this.workIdentityEvidenceRefreshProgress,
            active,
            canPause:
                this.workIdentityEvidenceRefreshProgress.state === 'running' ||
                this.workIdentityEvidenceRefreshProgress.state === 'pausing',
            canResume:
                this.workIdentityEvidenceRefreshProgress.state === 'paused',
            canCancel: active,
            result: terminal
                ? this.workIdentityEvidenceRefreshResult
                : undefined
        }
    }

recommendationV5WorkIdentityEvidenceRefreshControl(
        action: 'pause' | 'resume' | 'cancel'
    ) {
        if (action === 'pause') {
            if (this.workIdentityEvidenceRefreshProgress.state === 'running') {
                this.workIdentityEvidenceRefreshPauseRequested = true
                this.workIdentityEvidenceRefreshProgress = {
                    ...this.workIdentityEvidenceRefreshProgress,
                    state: 'pausing',
                    updatedAt: new Date().toISOString()
                }
            }
            return this.recommendationV5WorkIdentityEvidenceRefreshStatus()
        }
        if (action === 'resume') {
            this.workIdentityEvidenceRefreshPauseRequested = false
            if (
                this.workIdentityEvidenceRefreshProgress.state === 'paused' ||
                this.workIdentityEvidenceRefreshProgress.state === 'pausing'
            )
                this.workIdentityEvidenceRefreshProgress = {
                    ...this.workIdentityEvidenceRefreshProgress,
                    state: 'running',
                    phase: this.workIdentityEvidenceRefreshResumePhase,
                    updatedAt: new Date().toISOString()
                }
            for (const resolve of this.workIdentityEvidenceRefreshResumeWaiters)
                resolve()
            this.workIdentityEvidenceRefreshResumeWaiters.clear()
            return this.recommendationV5WorkIdentityEvidenceRefreshStatus()
        }
        this.workIdentityEvidenceRefreshCancelRequested = true
        this.workIdentityEvidenceRefreshPauseRequested = false
        for (const resolve of this.workIdentityEvidenceRefreshResumeWaiters)
            resolve()
        this.workIdentityEvidenceRefreshResumeWaiters.clear()
        if (
            this.workIdentityEvidenceRefreshProgress.state === 'running' ||
            this.workIdentityEvidenceRefreshProgress.state === 'pausing' ||
            this.workIdentityEvidenceRefreshProgress.state === 'paused'
        )
            this.workIdentityEvidenceRefreshProgress = {
                ...this.workIdentityEvidenceRefreshProgress,
                state: 'cancelling',
                updatedAt: new Date().toISOString()
            }
        return this.recommendationV5WorkIdentityEvidenceRefreshStatus()
    }

private async workIdentityEvidenceRefreshCheckpoint() {
        if (this.workIdentityEvidenceRefreshCancelRequested)
            throw new WorkIdentityEvidenceRefreshCancelledError()
        if (!this.workIdentityEvidenceRefreshPauseRequested) return
        this.workIdentityEvidenceRefreshResumePhase =
            this.workIdentityEvidenceRefreshProgress.phase === 'paused'
                ? this.workIdentityEvidenceRefreshResumePhase
                : this.workIdentityEvidenceRefreshProgress.phase
        this.workIdentityEvidenceRefreshProgress = {
            ...this.workIdentityEvidenceRefreshProgress,
            state: 'paused',
            phase: 'paused',
            updatedAt: new Date().toISOString()
        }
        await new Promise<void>((resolve) =>
            this.workIdentityEvidenceRefreshResumeWaiters.add(resolve)
        )
        if (this.workIdentityEvidenceRefreshCancelRequested)
            throw new WorkIdentityEvidenceRefreshCancelledError()
        this.workIdentityEvidenceRefreshProgress = {
            ...this.workIdentityEvidenceRefreshProgress,
            state: 'running',
            phase: this.workIdentityEvidenceRefreshResumePhase,
            updatedAt: new Date().toISOString()
        }
    }

private finishWorkIdentityEvidenceRefreshControl() {
        this.workIdentityEvidenceRefreshPauseRequested = false
        this.workIdentityEvidenceRefreshCancelRequested = false
        for (const resolve of this.workIdentityEvidenceRefreshResumeWaiters)
            resolve()
        this.workIdentityEvidenceRefreshResumeWaiters.clear()
        this.workIdentityEvidenceRefreshRun = null
    }

startRecommendationV5WorkIdentityEvidenceRefresh(requestedLimit = 500) {
        if (
            this.workIdentityEvidenceRefreshRun &&
            [
                'running',
                'pausing',
                'paused',
                'cancelling'
            ].includes(this.workIdentityEvidenceRefreshProgress.state)
        )
            return {
                started: false,
                ...this.recommendationV5WorkIdentityEvidenceRefreshStatus()
            }

        const limit = Math.max(
            1,
            Math.min(1000, Math.floor(Number(requestedLimit) || 500))
        )
        const now = new Date().toISOString()
        this.workIdentityEvidenceRefreshPauseRequested = false
        this.workIdentityEvidenceRefreshCancelRequested = false
        this.workIdentityEvidenceRefreshResumePhase = 'loading'
        this.workIdentityEvidenceRefreshResumeWaiters.clear()
        this.workIdentityEvidenceRefreshResult = null
        this.workIdentityEvidenceRefreshProgress = {
            state: 'running',
            phase: 'loading',
            done: 0,
            total: 0,
            candidateCount: 0,
            pairChecks: 0,
            savedCount: 0,
            startedAt: now,
            updatedAt: now
        }

        const run = (async () => {
            let releaseResources: () => void = () => undefined
            try {
                const lease = await this.runtimeResources.acquire({
                    ownerId: 'work-identity-evidence',
                    taskType: 'work-identity-evidence-refresh',
                    priority: 'background',
                    resources: {
                        'cpu-analysis': 1,
                        'sqlite-read-heavy': 1,
                        'sqlite-write-heavy': 1
                    }
                })
                releaseResources = () => lease.release()
                // Detach the first full-catalog read from the start request.
                await new Promise<void>((resolve) => setTimeout(resolve, 0))
                await this.workIdentityEvidenceRefreshCheckpoint()
                const catalog = this.allComicsForIdentity()
                const state = new RecommendationPolicyStoreV5(
                    this.database
                ).state()
                await this.workIdentityEvidenceRefreshCheckpoint()
                const audit = await buildWorkIdentityAuditAsyncV5(
                    catalog,
                    state,
                    limit,
                    {
                        checkpoint: () =>
                            this.workIdentityEvidenceRefreshCheckpoint(),
                        onProgress: (progress) => {
                            const controlState =
                                this.workIdentityEvidenceRefreshProgress.state
                            this.workIdentityEvidenceRefreshResumePhase =
                                progress.phase
                            this.workIdentityEvidenceRefreshProgress = {
                                ...this.workIdentityEvidenceRefreshProgress,
                                ...progress,
                                state:
                                    controlState === 'pausing' ||
                                    controlState === 'cancelling'
                                        ? controlState
                                        : 'running',
                                updatedAt: new Date().toISOString()
                            }
                        }
                    }
                )
                await this.workIdentityEvidenceRefreshCheckpoint()
                this.workIdentityEvidenceRefreshResumePhase = 'persisting'
                this.workIdentityEvidenceRefreshProgress = {
                    ...this.workIdentityEvidenceRefreshProgress,
                    state: 'running',
                    phase: 'persisting',
                    done: audit.scannedComicCount,
                    total: audit.scannedComicCount,
                    candidateCount: audit.candidateCount,
                    updatedAt: new Date().toISOString()
                }
                await this.workIdentityEvidenceRefreshCheckpoint()
                const saved = this.database.saveWorkIdentityEvidence(
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
                this.workIdentityEvidenceRefreshResult = {
                    scannedComicCount: audit.scannedComicCount,
                    candidateCount: audit.candidateCount,
                    crossProviderCandidateCount:
                        audit.crossProviderCandidateCount,
                    savedCount: saved.upserted
                }
                this.workIdentityEvidenceRefreshProgress = {
                    ...this.workIdentityEvidenceRefreshProgress,
                    state: 'complete',
                    phase: 'complete',
                    done: audit.scannedComicCount,
                    total: audit.scannedComicCount,
                    candidateCount: audit.candidateCount,
                    savedCount: saved.upserted,
                    updatedAt: new Date().toISOString()
                }
            } catch (error) {
                if (
                    error instanceof WorkIdentityEvidenceRefreshCancelledError
                )
                    this.workIdentityEvidenceRefreshProgress = {
                        ...this.workIdentityEvidenceRefreshProgress,
                        state: 'cancelled',
                        phase: 'cancelled',
                        updatedAt: new Date().toISOString()
                    }
                else
                    this.workIdentityEvidenceRefreshProgress = {
                        ...this.workIdentityEvidenceRefreshProgress,
                        state: 'failed',
                        phase: 'failed',
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        updatedAt: new Date().toISOString()
                    }
            } finally {
                releaseResources()
                this.finishWorkIdentityEvidenceRefreshControl()
            }
        })()
        this.workIdentityEvidenceRefreshRun = run
        void run.catch(() => {
            // The task records its authoritative terminal state above.
        })
        return {
            started: true,
            ...this.recommendationV5WorkIdentityEvidenceRefreshStatus()
        }
    }
}
