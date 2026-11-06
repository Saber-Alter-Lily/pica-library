import { buildRecommendationIntentsV3 } from '../recommendation-v3/intent-planner-v3'
import { translateIntentPlanV3 } from '../recommendation-v3/provider-query-translator'
import { retrieveCandidatesV3 } from '../recommendation-v3/retriever-v3'
import { rankCandidatesWithFrozenRankerV3 } from '../recommendation-v3/ranker-adapter-v3'
import {
    buildVisualPreferenceProfile,
    metadataFeedbackAdjustment,
    rerankWithVisualStyle
} from '../recommendation-v4/visual-style'
import {
    filterCandidatesAgainstOwnedV5,
    preferenceAdjustmentV5
} from '../recommendation-v5/portable-policy'
import { applyIntentPolicyV5 } from '../recommendation-v5/intent-policy'
import {
    inferredPrivateTagIntentsV1,
    restrictTagIntentsV1
} from '../recommendation-v5/tag-intents'
import { projectComicTagSignalsV1, normalizeTagPolicyV1 } from '../tags/policy'
import type { RecommendationBuildPortsV3 } from './build-ports'

/** Existing ordered pipeline; storage/provider/session/registry I/O enter only through ports. */
export async function buildRecommendationCycleV3(
    cycleId: string,
    ports: RecommendationBuildPortsV3
) {
    await ports.checkpoint()
    const provider = await ports.openProvider()
    const catalog = ports.evidence.catalog()
    const recommendationV5State = ports.evidence.policy()
    const tasteExcludedIds = new Set(
        recommendationV5State.tasteExcludedComicIds
    )
    const readingIds = new Set(ports.evidence.readingComicIds())
    const explicitFavoriteIds = new Set(
        catalog
            .filter(
                (comic) =>
                    comic.isFavorite && !tasteExcludedIds.has(comic.comicId)
            )
            .map((comic) => comic.comicId)
    )
    const recommendationFeedback = ports.evidence.feedback()
    const latestFeedback = new Map(
        recommendationFeedback.map((item) => [item.comicId, item])
    )
    const dislikedIds = new Set(
        recommendationFeedback
            .filter((item) => item.sentiment === 'dislike')
            .map((item) => item.comicId)
    )
    const likedIds = new Set(
        recommendationFeedback
            .filter((item) => item.sentiment === 'like')
            .map((item) => item.comicId)
    )
    const favorites = catalog
        .filter(
            (comic) =>
                !tasteExcludedIds.has(comic.comicId) &&
                !dislikedIds.has(comic.comicId) &&
                (comic.isFavorite || likedIds.has(comic.comicId))
        )
        .map((comic) => ({ ...comic, isFavorite: true }))
    const semantics = ports.loadSemantics()
    const profile = semantics.profile(
        favorites.map((comic) =>
            projectComicTagSignalsV1(comic, recommendationV5State, false)
        )
    )
    await ports.checkpoint()
    ports.progress('intents')
    const history = ports.evidence.intentHistory()
    const baseIntents = buildRecommendationIntentsV3({
        profile,
        favorites,
        history
    })
    const intents = restrictTagIntentsV1(
        applyIntentPolicyV5(
            [
                ...baseIntents,
                ...inferredPrivateTagIntentsV1(favorites, recommendationV5State)
            ],
            recommendationV5State,
            5,
            catalog
        ),
        recommendationV5State,
        catalog,
        (raw) => semantics.resolve(raw).canonicalKey
    )
    await ports.checkpoint()
    ports.progress('routes')
    const routes = translateIntentPlanV3(intents)
    await ports.checkpoint()
    ports.progress('providers')
    await provider.prepare()
    await ports.checkpoint()
    ports.progress('retrieve')
    const retrieved = await retrieveCandidatesV3({
        provider: provider.provider,
        routes,
        intents,
        favoriteIds: new Set(favorites.map((comic) => comic.comicId)),
        isSafetyExcluded: (comic) =>
            comic.tags.some((tag) => {
                const resolved = semantics.resolve(tag)
                return (
                    resolved.resolutionType === 'SAFETY' ||
                    resolved.recommendationRole === 'SAFETY_EXCLUDE'
                )
            }),
        candidateFandomKeys: (comic) =>
            projectComicTagSignalsV1(
                comic,
                recommendationV5State,
                false
            ).tags.flatMap((tag) => {
                const resolved = semantics.resolve(tag)
                return resolved.facet === 'FANDOM_IP' &&
                    resolved.resolutionStatus === 'RESOLVED'
                    ? [resolved.canonicalKey]
                    : []
            })
    })
    ports.assertSourcesCurrent()
    if (retrieved.readiness === 'FAILED_INSUFFICIENT_POOL')
        throw new Error(
            'Recommendation generation could not retrieve enough candidates; previous recommendations were kept'
        )
    await ports.checkpoint()
    ports.progress('rank')
    const v5Filtered = filterCandidatesAgainstOwnedV5(
        retrieved.candidates,
        catalog,
        recommendationV5State
    )
    const ranked = rankCandidatesWithFrozenRankerV3({
        candidates: v5Filtered.rows,
        favorites,
        graphEdges: ports.evidence.graphEdges()
    })
    const tasteCatalogById = new Map(
        catalog.map((comic) => [
            comic.comicId,
            projectComicTagSignalsV1(comic, recommendationV5State)
        ])
    )
    const feedbackAdjusted = ranked
        .filter((candidate) => !latestFeedback.has(candidate.comicId))
        .map((candidate, index) => {
            const feedbackAdjustment = metadataFeedbackAdjustment({
                candidate: projectComicTagSignalsV1(
                    candidate.comic,
                    recommendationV5State
                ),
                feedback: recommendationFeedback,
                catalogById: tasteCatalogById
            })
            const baselinePercentile =
                ranked.length <= 1 ? 1 : 1 - index / (ranked.length - 1)
            return {
                ...candidate,
                feedbackAdjustment,
                __feedbackRankScore: baselinePercentile + feedbackAdjustment
            }
        })
        .sort(
            (a, b) =>
                b.__feedbackRankScore - a.__feedbackRankScore ||
                a.rawRank - b.rawRank ||
                a.comicId.localeCompare(b.comicId)
        )
        .map(({ __feedbackRankScore: _score, ...candidate }) => candidate)
    const policyAdjusted = feedbackAdjusted
        .map((candidate, index) => {
            const policy = preferenceAdjustmentV5(
                candidate.comic,
                recommendationV5State
            )
            const baselinePercentile =
                feedbackAdjusted.length <= 1
                    ? 1
                    : 1 - index / (feedbackAdjusted.length - 1)
            return {
                ...candidate,
                v5Adjustment: policy.adjustment,
                v5Reasons: policy.reasons,
                __v5RankScore: baselinePercentile + policy.adjustment
            }
        })
        .filter(
            (candidate) =>
                !preferenceAdjustmentV5(candidate.comic, recommendationV5State)
                    .blocked
        )
        .sort(
            (a, b) =>
                b.__v5RankScore - a.__v5RankScore ||
                a.rawRank - b.rawRank ||
                a.comicId.localeCompare(b.comicId)
        )
        .map(({ __v5RankScore: _score, ...candidate }) => candidate)
    await ports.checkpoint()
    ports.progress('visual')
    const { settings: visualSettings, embeddings: visualEmbeddings } =
        ports.evidence.visualInput()
    const visualProfile = buildVisualPreferenceProfile({
        embeddings: visualEmbeddings,
        favoriteComicIds: explicitFavoriteIds,
        feedback: recommendationFeedback,
        catalogSize: Math.max(1, explicitFavoriteIds.size + likedIds.size)
    })
    const reranked = rerankWithVisualStyle({
        ranked: policyAdjusted,
        embeddings: visualEmbeddings,
        profile: visualProfile,
        mode: visualSettings.enabled ? visualSettings.rerankMode : 'OFF',
        strength: visualSettings.strength
    })
    ports.assertSourcesCurrent()
    ports.progress('complete')
    return {
        profile,
        intents,
        routes,
        ranked: reranked,
        readiness: retrieved.readiness,
        telemetry: {
            ...retrieved.telemetry,
            cycleId,
            recommendationV5: {
                policyVersion: recommendationV5State.policyVersion,
                revision: recommendationV5State.revision,
                controlCount: recommendationV5State.controls.length,
                hardSuppressCount:
                    recommendationV5State.hardSuppressComicIds.length,
                tasteExcludedCount:
                    recommendationV5State.tasteExcludedComicIds.length,
                portableBaseline: {
                    tagPolicy: normalizeTagPolicyV1(
                        recommendationV5State.tagPolicy
                    ),
                    schemaVersion: recommendationV5State.schemaVersion,
                    policyVersion: recommendationV5State.policyVersion,
                    revision: recommendationV5State.revision,
                    controls: recommendationV5State.controls,
                    sessionIntent: recommendationV5State.sessionIntent,
                    hardSuppressComicIds:
                        recommendationV5State.hardSuppressComicIds
                },
                ownedOrDuplicateRemoved:
                    v5Filtered.telemetry.exactOrOwnedRemoved +
                    v5Filtered.telemetry.workDuplicateRemoved,
                workDuplicateRemoved: v5Filtered.telemetry.workDuplicateRemoved,
                hardBlockedRemoved: v5Filtered.telemetry.hardBlockedRemoved,
                policyAdjustedCount: policyAdjusted.filter(
                    (item) =>
                        Number(
                            (item as { v5Adjustment?: number }).v5Adjustment ??
                                0
                        ) !== 0
                ).length
            },
            recommendationV4: {
                feedbackCount: recommendationFeedback.length,
                likedCount: likedIds.size,
                dislikedCount: dislikedIds.size,
                exactFeedbackItemsSuppressed:
                    ranked.length - feedbackAdjusted.length,
                visual: {
                    settings: visualSettings,
                    profileAvailable: Boolean(visualProfile),
                    profileCoverage: visualProfile?.coverage ?? 0,
                    positivePrototypeCount:
                        visualProfile?.positivePrototypes.length ?? 0,
                    negativePrototypeCount:
                        visualProfile?.negativePrototypes.length ?? 0,
                    candidateEmbeddingCount: reranked.filter((item) =>
                        Boolean(
                            item.visual &&
                                typeof item.visual === 'object' &&
                                (item.visual as { available?: boolean })
                                    .available
                        )
                    ).length,
                    shadowMoveCount: reranked.filter((item) => {
                        const visual = item.visual as
                            | { shadowRank?: number | null }
                            | undefined
                        return Boolean(
                            visual?.shadowRank &&
                                visual.shadowRank !== item.rawRank
                        )
                    }).length
                }
            },
            providerSources: {
                ...provider.telemetry(),
                ehCandidates: retrieved.candidates.filter(
                    (item) =>
                        item.comic.providerId === 'eh' ||
                        item.comic.comicId.startsWith('eh:')
                ).length,
                preferenceSignals: {
                    explicitFavorites: explicitFavoriteIds.size,
                    collectionSeeds: favorites.length,
                    readingSeeds: readingIds.size,
                    downloadedSeeds: favorites.filter(
                        (comic) => comic.downloadedPictures > 0
                    ).length
                },
                picaCandidates: retrieved.candidates.filter(
                    (item) =>
                        item.comic.providerId !== 'eh' &&
                        !item.comic.comicId.startsWith('eh:')
                ).length
            }
        },
        versions: {
            ...ports.versions,
            registryVersion: profile.registryVersion
        }
    }
}
