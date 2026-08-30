import type { StoredComic } from '../library/types'
import { itemFeature, normalizeFeatureValue } from './features'
import { residualCombinationBonus } from './tag-combinations'
import { profileConfidence } from './behavior-profile'
import type {
    UserEvent,
    V3Profile,
    V3RankingFeatures,
    V3Recommendation
} from './types'

export interface RankingContext {
    graphEdges?: Array<{
        sourceComicId: string
        targetComicId: string
        confidence?: number
        observationCount?: number
    }>
    routeFamilies?: Map<string, Set<string>>
}
type FavoriteIndex = {
    features: ReturnType<typeof itemFeature>[]
    authorCounts: Map<string, number>
    circleCounts: Map<string, number>
    categoryIndex: Map<string, ReturnType<typeof itemFeature>[]>
}

export const RANKING_CONFIG = {
    historicalSimilarity: 0.28,
    clusterSimilarity: 0.18,
    lifetimeSimilarity: 0.12,
    recentSimilarity: 0.12,
    sessionSimilarity: 0.16,
    authorAffinity: 0.18,
    circleAffinity: 0.08,
    singleTagAffinity: 0.2,
    // Pair evidence is retained for explanations/analytics; ablations did not
    // show stable ranking gains across author and cluster strata.
    pairResidual: 0,
    // Triple evidence remains available for analytics/profile display; the
    // real-user ablation found no incremental ranking gain, so default weight
    // is disabled until a larger unbiased background is available.
    tripleResidual: 0,
    categorySimilarity: 0.05,
    graph: 0.08,
    popularity: 0.025,
    novelty: 0.04,
    impressionPenalty: 0.06,
    favoriteRemovePenalty: 0.5
} as const

function tagScore(tags: string[], profile: V3Profile['historical']) {
    const wanted = new Set(tags.map(normalizeFeatureValue))
    return profile.tags
        .filter((item) => wanted.has(item.tag))
        .reduce((sum, item) => sum + item.score, 0)
}

function eventCount(events: UserEvent[], type: string, comicId: string) {
    return events.filter(
        (event) => event.eventType === type && event.comicId === comicId
    ).length
}

export function extractRankingFeatures(
    candidate: StoredComic,
    favorites: StoredComic[],
    profile: V3Profile,
    events: UserEvent[] = [],
    context: RankingContext = {},
    index?: FavoriteIndex
): V3RankingFeatures {
    const feature = itemFeature(candidate)
    const favoriteFeatures = index?.features ?? favorites.map(itemFeature)
    const residual = residualCombinationBonus(
        feature.tags,
        profile.historical.pairs,
        profile.historical.triples
    )
    const authorAffinity =
        (index?.authorCounts.get(feature.author) ??
            favoriteFeatures.filter((item) => item.author === feature.author)
                .length) / Math.max(1, favorites.length)
    const circleAffinity =
        (index?.circleCounts.get(feature.circle) ??
            favoriteFeatures.filter((item) => item.circle === feature.circle)
                .length) / Math.max(1, favorites.length)
    const categoryCandidates = index
        ? [
              ...new Set(
                  feature.categories.flatMap(
                      (category) => index.categoryIndex.get(category) ?? []
                  )
              )
          ]
        : favoriteFeatures
    const categorySimilarity = categoryCandidates.reduce(
        (best, item) =>
            Math.max(
                best,
                item.categories.filter((x) => feature.categories.includes(x))
                    .length /
                    Math.max(
                        1,
                        item.categories.length,
                        feature.categories.length
                    )
            ),
        0
    )
    const historicalClusterSimilarity = profile.historical.clusters.reduce(
        (best, cluster) =>
            Math.max(
                best,
                cluster.tags.filter((tag) => feature.tags.includes(tag))
                    .length /
                    Math.max(1, cluster.tags.length, feature.tags.length)
            ),
        0
    )
    const impressions = eventCount(
        events,
        'recommend_impression',
        candidate.comicId
    )
    const removed = eventCount(events, 'favorite_remove', candidate.comicId)
    const reads =
        eventCount(events, 'reader_open', candidate.comicId) +
        eventCount(events, 'reader_complete', candidate.comicId)
    const downloads = eventCount(events, 'download_complete', candidate.comicId)
    const confidence = profileConfidence(profile)
    const graph = (context.graphEdges ?? []).filter(
        (edge) => edge.targetComicId === candidate.comicId
    )
    const relatedGraphScore = Math.min(
        1,
        graph.reduce(
            (sum, edge) =>
                sum +
                Math.min(1, edge.confidence ?? 0.5) *
                    Math.min(1, (edge.observationCount ?? 1) / 3),
            0
        ) / 3
    )
    const routeSupport = context.routeFamilies
        ? Math.min(
              1,
              [...context.routeFamilies.values()].filter((ids) =>
                  ids.has(candidate.comicId)
              ).length / 3
          )
        : 0
    const historicalOrdinalSimilarity = 0
    return {
        historicalOrdinalSimilarity,
        historicalSimilarity:
            tagScore(feature.tags, profile.historical) * confidence.historical,
        historicalClusterSimilarity,
        lifetimeSimilarity:
            tagScore(feature.tags, profile.lifetime) * confidence.lifetime,
        recentSimilarity:
            tagScore(feature.tags, profile.recent) * confidence.recent,
        sessionSimilarity:
            tagScore(feature.tags, profile.session) * confidence.session,
        authorAffinity,
        circleAffinity,
        singleTagAffinity: tagScore(feature.tags, profile.historical),
        pairInteractionBonus: residual.pair,
        tripleInteractionBonus: residual.triple,
        categorySimilarity,
        itemSimilarity: historicalClusterSimilarity,
        relatedGraphScore,
        positiveBehaviorSimilarity: Math.min(1, (reads + downloads) / 3),
        negativeBehaviorPenalty: Math.min(1, removed),
        popularity:
            feature.popularityBucket === 'high'
                ? 1
                : feature.popularityBucket === 'medium'
                  ? 0.5
                  : 0,
        novelty: impressions ? 0 : 1,
        previousImpressionCount: impressions,
        recentExposurePenalty: Math.min(1, impressions / 3),
        alreadyFavorite: candidate.isFavorite,
        alreadyDownloaded: candidate.downloadedPictures > 0,
        alreadyRead: reads > 0,
        recallRouteSupport: routeSupport
    }
}

export function rankV3(
    candidates: StoredComic[],
    favorites: StoredComic[],
    profile: V3Profile,
    events: UserEvent[] = [],
    context: RankingContext = {}
): V3Recommendation[] {
    const favoriteFeatures = favorites.map(itemFeature)
    const authorCounts = new Map<string, number>(),
        circleCounts = new Map<string, number>()
    for (const item of favoriteFeatures) {
        if (item.author)
            authorCounts.set(
                item.author,
                (authorCounts.get(item.author) ?? 0) + 1
            )
        if (item.circle)
            circleCounts.set(
                item.circle,
                (circleCounts.get(item.circle) ?? 0) + 1
            )
    }
    const categoryIndex = new Map<string, ReturnType<typeof itemFeature>[]>()
    for (const item of favoriteFeatures)
        for (const category of item.categories)
            categoryIndex.set(category, [
                ...(categoryIndex.get(category) ?? []),
                item
            ])
    const index: FavoriteIndex = {
        features: favoriteFeatures,
        authorCounts,
        circleCounts,
        categoryIndex
    }
    return candidates
        .filter((item) => !item.isFavorite)
        .map((candidate) => {
            const f = extractRankingFeatures(
                candidate,
                favorites,
                profile,
                events,
                context,
                index
            )
            const score =
                f.historicalSimilarity * RANKING_CONFIG.historicalSimilarity +
                f.historicalClusterSimilarity *
                    RANKING_CONFIG.clusterSimilarity +
                f.lifetimeSimilarity * RANKING_CONFIG.lifetimeSimilarity +
                f.recentSimilarity * RANKING_CONFIG.recentSimilarity +
                f.sessionSimilarity * RANKING_CONFIG.sessionSimilarity +
                f.authorAffinity * RANKING_CONFIG.authorAffinity +
                f.circleAffinity * RANKING_CONFIG.circleAffinity +
                f.singleTagAffinity * RANKING_CONFIG.singleTagAffinity +
                f.pairInteractionBonus * RANKING_CONFIG.pairResidual +
                f.tripleInteractionBonus * RANKING_CONFIG.tripleResidual +
                f.categorySimilarity * RANKING_CONFIG.categorySimilarity +
                f.relatedGraphScore * RANKING_CONFIG.graph +
                f.recallRouteSupport * 0.06 +
                f.popularity * RANKING_CONFIG.popularity +
                f.novelty * RANKING_CONFIG.novelty -
                f.recentExposurePenalty * RANKING_CONFIG.impressionPenalty -
                f.negativeBehaviorPenalty * RANKING_CONFIG.favoriteRemovePenalty
            const reasons = [
                f.pairInteractionBonus > 0 ? '匹配你的多标签组合兴趣' : '',
                f.authorAffinity > 0 ? '匹配常收藏作者' : '',
                f.historicalClusterSimilarity > 0 ? '来自你的稳定兴趣簇' : '',
                f.recentSimilarity > 0 ? '匹配近期兴趣' : ''
            ].filter(Boolean)
            return {
                comicId: candidate.comicId,
                score: Number(score.toFixed(6)),
                features: f,
                reasons,
                provenance: []
            }
        })
        .sort((a, b) => b.score - a.score || a.comicId.localeCompare(b.comicId))
}
