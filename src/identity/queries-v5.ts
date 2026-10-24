import type { StoredComic } from '../library/types'
import { cosineSimilarity } from '../recommendation-v4/visual-style'
import {
    normalizePreferenceKey,
    workIdentitySignalsV2
} from '../recommendation-v5/portable-policy'
import {
    WORK_IDENTITY_RESOLVER_VERSION,
    buildWorkIdentityAuditV5,
    buildWorkIdentityMaterializationPlanV5,
    buildWorkIdentityMaterializationPreviewV5
} from '../recommendation-v5/work-identity-foundation'
import {
    WORK_IDENTITY_V3_RESOLVER_VERSION,
    workIdentityCreatorBucketKeysV3,
    workIdentityDetailEvidenceV3
} from '../recommendation-v5/work-identity-v3'
import type { WorkIdentityReadPortV5 } from './ports-v5'
/** Stored-fact views only; matching algorithms and thresholds remain unchanged. */
export class WorkIdentityQueriesV5 {
    constructor(private readonly read: WorkIdentityReadPortV5) {}
    workVariantsForComic(comicId: string, limit = 24) {
        const id = String(comicId ?? '').trim()
        const bounded = Math.max(1, Math.min(48, Math.floor(limit)))
        const catalog = this.read.catalog()
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

        const currentBinding = this.read.getWorkIdentityBinding(id)
        const workBindings = currentBinding
            ? this.read.listWorkIdentityBindingsForWork(currentBinding.workId)
            : []
        const decisions = this.read.listWorkIdentityDecisionsForComic(id)
        const probableEvidence =
            this.read.listWorkIdentityProbableEvidenceForComic(id, 0.94)
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
        const relatedBindings = this.read.listWorkIdentityBindingsByComicIds([
            ...relationshipComicIds
        ])
        const bindingByComic = new Map(
            relatedBindings.map(
                (binding) => [binding.comicId, binding] as const
            )
        )
        const decisionByPair = new Map(
            decisions.map(
                (item) =>
                    [
                        [item.leftComicId, item.rightComicId]
                            .sort()
                            .join('\u0000'),
                        item
                    ] as const
            )
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
                rating: Number.isFinite(Number(comic.rating))
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
            add(otherId, 'PROBABLE_SAME_WORK', Number(evidence.confidence || 0))
        }

        // Work Identity V3 detail funnel:
        // 1) resolve creator buckets first;
        // 2) compare titles only inside creator buckets;
        // 3) use exact-title fallback when creator metadata is incomplete;
        // 4) use cover identity only for unresolved metadata candidates.
        const policy = this.read.policy()
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
            if (creatorKeys.some((key) => currentCreatorKeys.has(key))) {
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

        for (const other of creatorCandidates) evaluate(other, 'CREATOR_BUCKET')
        for (const other of titleFallbackCandidates)
            if (!rows.has(other.comicId)) evaluate(other, 'TITLE_FALLBACK')

        // Stage 3 only touches covers for metadata candidates that remain
        // ambiguous. This keeps the normal path cheap while allowing a near-
        // duplicate cover to rescue translated/retitled editions.
        const rankedReviews = reviewCandidates
            .sort(
                (a, b) =>
                    b.evidence.confidence - a.evidence.confidence ||
                    b.evidence.titleSimilarity - a.evidence.titleSimilarity ||
                    a.comic.comicId.localeCompare(b.comic.comicId)
            )
            .slice(0, 96)

        if (rankedReviews.length) {
            const requestedIds = [
                id,
                ...rankedReviews.map((item) => item.comic.comicId)
            ]
            const coverEmbeddings = this.read
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
                    String(embedding.generatedAt) > String(existing.generatedAt)
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
                Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite)) ||
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
        const catalog = this.read.catalog()
        const state = this.read.policy()
        return {
            ...buildWorkIdentityAuditV5(catalog, state, limit),
            resolverVersion: WORK_IDENTITY_RESOLVER_VERSION,
            persistence: 'NONE' as const,
            automaticBinding: false
        }
    }

    recommendationV5WorkIdentityEvidence(limit = 200) {
        return {
            storage: this.read.workIdentityStorageStatus(),
            evidence: this.read.listWorkIdentityEvidence(limit),
            automaticBinding: false
        }
    }

    recommendationV5WorkIdentityReview(limit = 200) {
        const evidence = this.read.listWorkIdentityEvidence(limit)
        const decisions = this.read.listWorkIdentityDecisions(5000)
        const decisionCount =
            this.read.workIdentityStorageStatus().counts.decisions
        const authoritativeDecisions =
            decisionCount > decisions.length
                ? this.read.listAllWorkIdentityDecisions()
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
                    [item.leftComicId, item.rightComicId].sort().join('\u0000')
                ) ?? null
        }))
        const materializationPreview =
            buildWorkIdentityMaterializationPreviewV5(
                this.read.catalog(),
                authoritativeDecisions
            )
        return {
            mode: 'HUMAN_REVIEW' as const,
            storage: this.read.workIdentityStorageStatus(),
            evidence: rows,
            decisions,
            undecidedCount: rows.filter((item) => !item.decision).length,
            materializationPreview,
            automaticBinding: false
        }
    }

    recommendationV5WorkIdentityMaterializationPlan() {
        const catalog = this.read.catalog()
        const decisions = this.read.listAllWorkIdentityDecisions()
        const existingBindings = this.read.listAllWorkIdentityBindings()
        const plan = buildWorkIdentityMaterializationPlanV5(
            catalog,
            decisions,
            existingBindings
        )
        const planDigest = this.read.digestPlan(plan)
        return {
            ...plan,
            planDigest,
            storage: this.read.workIdentityStorageStatus()
        }
    }

    recommendationV5WorkIdentityMaterializationRuns(limit = 100) {
        return {
            executionEnabled: false,
            runs: this.read.listWorkIdentityMaterializationRuns(limit)
        }
    }
}
