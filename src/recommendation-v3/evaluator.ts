import type { StoredComic } from '../library/types'
import type { V3Recommendation } from './types'
import { recommendComics } from '../library/recommendation'
import { buildV3Profile } from './taste-model'
import { rankV3 } from './ranker'

function dcg(ids: string[], relevant: Set<string>, limit: number) {
    return ids
        .slice(0, limit)
        .reduce(
            (sum, id, index) =>
                sum + (relevant.has(id) ? 1 / Math.log2(index + 2) : 0),
            0
        )
}

export function evaluationMetrics(
    ranked: V3Recommendation[],
    heldOut: StoredComic[]
) {
    const ids = ranked.map((item) => item.comicId)
    const relevant = new Set(heldOut.map((item) => item.comicId))
    const recallAt = (n: number) =>
        ids.slice(0, n).filter((id) => relevant.has(id)).length /
        Math.max(1, relevant.size)
    const ideal = [...relevant].map(String)
    const ndcgAt = (n: number) =>
        dcg(ids, relevant, n) /
        Math.max(Number.EPSILON, dcg(ideal, relevant, n))
    const first = ids.findIndex((id) => relevant.has(id))
    const retrieved = ranked.map((item) => item.comicId)
    const authors = new Set(
        heldOut
            .filter((item) => retrieved.includes(item.comicId))
            .map((item) => item.canonicalAuthor ?? item.author)
    )
    const tags = new Set(
        heldOut
            .filter((item) => retrieved.includes(item.comicId))
            .flatMap((item) => item.tags)
    )
    return {
        candidateRecallAt100: recallAt(100),
        candidateRecallAt500: recallAt(500),
        recallAt12: recallAt(12),
        recallAt20: recallAt(20),
        recallAt50: recallAt(50),
        ndcgAt12: ndcgAt(12),
        ndcgAt20: ndcgAt(20),
        mrr: first < 0 ? 0 : 1 / (first + 1),
        catalogCoverage: new Set(ids).size,
        clusterCoverage: new Set(
            ranked
                .filter((item) => item.features.historicalClusterSimilarity > 0)
                .map((item) => item.comicId)
        ).size,
        authorDiversity: authors.size,
        tagDiversity: tags.size,
        combinationDiversity: new Set(
            heldOut
                .filter((item) => retrieved.includes(item.comicId))
                .flatMap((item) =>
                    item.tags.length >= 2
                        ? [item.tags.slice(0, 2).sort().join('|')]
                        : []
                )
        ).size,
        novelty: ranked.length
            ? ranked.filter((item) => item.features.novelty > 0).length /
              ranked.length
            : 0,
        popularityBias: ranked.length
            ? ranked.reduce((sum, item) => sum + item.features.popularity, 0) /
              ranked.length
            : 0
    }
}

export function deterministicHoldout(
    records: StoredComic[],
    kind: 'random' | 'author' | 'cluster' | 'long-tail',
    seed = 'v3'
) {
    const favorites = records
        .filter((item) => item.isFavorite)
        .sort((a, b) =>
            `${seed}:${a.comicId}`.localeCompare(`${seed}:${b.comicId}`)
        )
    const target = Math.max(1, Math.floor(favorites.length * 0.2))
    if (kind === 'author')
        return favorites
            .filter(
                (item, index) =>
                    index %
                        Math.max(2, Math.floor(favorites.length / target)) ===
                    0
            )
            .slice(0, target)
    if (kind === 'long-tail')
        return [...favorites]
            .sort(
                (a, b) =>
                    (a.totalLikes ?? 0) - (b.totalLikes ?? 0) ||
                    a.comicId.localeCompare(b.comicId)
            )
            .slice(0, target)
    if (kind === 'cluster')
        return favorites.filter((_, index) => index % 3 === 0).slice(0, target)
    return favorites.slice(0, target)
}

export function withoutHeldOut(records: StoredComic[], heldOut: StoredComic[]) {
    const removed = new Set(heldOut.map((item) => item.comicId))
    return records.filter((item) => !removed.has(item.comicId))
}

export function evaluateAblations(
    records: StoredComic[],
    candidateLimit = 500
) {
    const heldOut = deterministicHoldout(records, 'random', 'v3-ablation')
    const training = withoutHeldOut(records, heldOut)
    // Keep held-out items in the candidate catalog, but mark them non-favorite.
    // This prevents candidate omission while ensuring profile construction cannot
    // observe held-out preference labels.
    const heldOutIds = new Set(heldOut.map((item) => item.comicId))
    const catalog = records.map((item) =>
        heldOutIds.has(item.comicId) ? { ...item, isFavorite: false } : item
    )
    const profile = buildV3Profile(training, catalog)
    const base = rankV3(catalog.slice(0, candidateLimit), training, profile)
    const v2 = recommendComics(catalog, candidateLimit).recommendations.map(
        (item): V3Recommendation => ({
            comicId: item.comic.comicId,
            score: item.score,
            features: {
                historicalSimilarity: 0,
                historicalClusterSimilarity: 0,
                lifetimeSimilarity: 0,
                recentSimilarity: 0,
                sessionSimilarity: 0,
                authorAffinity: 0,
                singleTagAffinity: 0,
                circleAffinity: 0,
                categorySimilarity: 0,
                itemSimilarity: 0,
                relatedGraphScore: 0,
                positiveBehaviorSimilarity: 0,
                negativeBehaviorPenalty: 0,
                popularity: item.comic.totalLikes ? 1 : 0,
                novelty: 0,
                pairInteractionBonus: 0,
                tripleInteractionBonus: 0,
                previousImpressionCount: 0,
                recentExposurePenalty: 0,
                alreadyFavorite: false,
                alreadyDownloaded: item.comic.downloadedPictures > 0,
                alreadyRead: false,
                recallRouteSupport: 0
            },
            reasons: ['v2-baseline'],
            provenance: []
        })
    )
    const withoutCombinations = base
        .map((item) => ({
            ...item,
            score:
                item.score -
                item.features.pairInteractionBonus * 0.08 -
                item.features.tripleInteractionBonus * 0.04
        }))
        .sort((a, b) => b.score - a.score || a.comicId.localeCompare(b.comicId))
    const pairs = base
        .map((item) => ({
            ...item,
            score: item.score - item.features.tripleInteractionBonus * 0.04
        }))
        .sort((a, b) => b.score - a.score || a.comicId.localeCompare(b.comicId))
    return {
        heldOutIds: heldOut.map((item) => item.comicId),
        v2: evaluationMetrics(v2, heldOut),
        v3WithoutCombinations: evaluationMetrics(withoutCombinations, heldOut),
        v3WithPairs: evaluationMetrics(pairs, heldOut),
        v3WithPairsAndTriples: evaluationMetrics(base, heldOut)
    }
}
