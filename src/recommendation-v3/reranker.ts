import type { StoredComic } from '../library/types'
import { itemFeature } from './features'
import type { V3Recommendation } from './types'
import type { TasteCluster } from './types'

export const RERANK_CONFIG = {
    diversityLambda: 0.72,
    maxAuthorPerBatch: 2,
    maxCirclePerBatch: 3,
    explorationRatio: 0.1
} as const

export function rerankV3(
    ranked: V3Recommendation[],
    comics: Map<string, StoredComic>,
    limit = 12,
    clusters: TasteCluster[] = []
) {
    const remaining = [...ranked]
    const selected: V3Recommendation[] = []
    const authors = new Map<string, number>()
    const circles = new Map<string, number>()
    const covered = new Set<string>()
    const explorationTarget = Math.min(
        limit,
        Math.max(0, Math.ceil(limit * RERANK_CONFIG.explorationRatio))
    )
    while (remaining.length && selected.length < limit) {
        remaining.sort((left, right) => {
            const value = (item: V3Recommendation) => {
                const comic = comics.get(item.comicId)
                if (!comic) return -Infinity
                const feature = itemFeature(comic)
                const penalty =
                    (authors.get(feature.author) ?? 0) * 0.25 +
                    (feature.circle
                        ? (circles.get(feature.circle) ?? 0) * 0.15
                        : 0)
                const novelty =
                    item.features.novelty * (1 - RERANK_CONFIG.diversityLambda)
                return (
                    item.score * RERANK_CONFIG.diversityLambda +
                    novelty -
                    penalty
                )
            }
            return (
                value(right) - value(left) ||
                left.comicId.localeCompare(right.comicId)
            )
        })
        const explorationNeeded = selected.length < explorationTarget
        const index = remaining.findIndex((item) => {
            const comic = comics.get(item.comicId)
            if (!comic) return false
            const feature = itemFeature(comic)
            const cluster = clusters.find(
                (c) =>
                    c.itemIds.some((id) => id === item.comicId) ||
                    c.tags.some((tag) => feature.tags.includes(tag))
            )
            const novel =
                item.features.novelty > 0 ||
                (cluster && !covered.has(cluster.clusterId))
            if (explorationNeeded && !novel) return false
            return (
                (authors.get(feature.author) ?? 0) <
                    RERANK_CONFIG.maxAuthorPerBatch &&
                (!feature.circle ||
                    (circles.get(feature.circle) ?? 0) <
                        RERANK_CONFIG.maxCirclePerBatch)
            )
        })
        const chosen = remaining.splice(index < 0 ? 0 : index, 1)[0]
        const comic = comics.get(chosen.comicId)
        if (!comic) continue
        const f = itemFeature(comic)
        authors.set(f.author, (authors.get(f.author) ?? 0) + 1)
        if (f.circle) circles.set(f.circle, (circles.get(f.circle) ?? 0) + 1)
        selected.push(chosen)
        const chosenFeature = itemFeature(comic)
        for (const cluster of clusters)
            if (cluster.tags.some((tag) => chosenFeature.tags.includes(tag)))
                covered.add(cluster.clusterId)
    }
    return selected
}
