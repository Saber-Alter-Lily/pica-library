import type { StoredComic } from '../library/types'
import {
    featureSimilarity,
    itemFeature,
    normalizeFeatureValue
} from './features'
import { mineTagCombinations, mineTagPreferences } from './tag-combinations'
import type { TasteCluster, V3Profile } from './types'

function clusterKey(ids: string[]) {
    return ids.slice().sort().join(',')
}

function clusterFor(
    members: StoredComic[],
    index: number,
    totalItems: number
): TasteCluster {
    const all = members.flatMap((comic) =>
        comic.tags.map(normalizeFeatureValue)
    )
    const tags = [...new Set(all)].sort()
    const authors = [
        ...new Set(
            members
                .map((comic) =>
                    normalizeFeatureValue(comic.canonicalAuthor ?? comic.author)
                )
                .filter(Boolean)
        )
    ].sort()
    const circles = [
        ...new Set(
            members
                .map((comic) => normalizeFeatureValue(comic.circle))
                .filter(Boolean)
        )
    ].sort()
    const combinations = mineTagCombinations(members)
    return {
        clusterId: `cluster_${index + 1}_${clusterKey(members.map((item) => item.comicId)).slice(0, 18)}`,
        weight: members.length / Math.max(1, totalItems),
        size: members.length,
        itemIds: members.map((item) => item.comicId).sort(),
        authors: authors.slice(0, 30),
        circles: circles.slice(0, 30),
        tags: tags.slice(0, 30),
        tagPairs: combinations.pairs.slice(0, 30).map((item) => item.tags),
        tagTriples: combinations.triples.slice(0, 30).map((item) => item.tags),
        confidence: Math.min(1, members.length / 3)
    }
}

export function chooseClusterCount(records: StoredComic[]) {
    if (records.length < 8) return records.length ? 1 : 0
    return Math.max(1, Math.min(12, Math.round(Math.sqrt(records.length / 3))))
}

export function buildTasteClusters(records: StoredComic[]): TasteCluster[] {
    const items = records.filter((item) => item.isFavorite)
    const count = Math.min(chooseClusterCount(items), Math.max(1, items.length))
    if (!count) return []
    // Deterministic medoid-like assignment: each pass chooses the item with the
    // highest novelty against prior representatives, then assigns by similarity.
    const ordered = [...items].sort((a, b) =>
        a.comicId.localeCompare(b.comicId)
    )
    const representatives = [ordered[0]]
    while (representatives.length < count) {
        const next = ordered
            .filter((item) => !representatives.includes(item))
            .sort((a, b) => {
                const distance = (candidate: StoredComic) =>
                    Math.min(
                        ...representatives.map(
                            (rep) =>
                                1 -
                                featureSimilarity(
                                    itemFeature(candidate),
                                    itemFeature(rep)
                                )
                        )
                    )
                return (
                    distance(b) - distance(a) ||
                    a.comicId.localeCompare(b.comicId)
                )
            })[0]
        if (!next) break
        representatives.push(next)
    }
    const groups = representatives.map(() => [] as StoredComic[])
    for (const item of ordered) {
        const index = representatives
            .map((rep) =>
                featureSimilarity(itemFeature(item), itemFeature(rep))
            )
            .reduce(
                (best, value, current) =>
                    value >
                    representatives.map((r) =>
                        featureSimilarity(itemFeature(item), itemFeature(r))
                    )[best]
                        ? current
                        : best,
                0
            )
        groups[index].push(item)
    }
    return groups
        .filter((group) => group.length > 0)
        .map((group, index) => clusterFor(group, index, ordered.length))
}

export function buildV3Profile(
    records: StoredComic[],
    allCatalog: StoredComic[] = records,
    generatedAt = new Date().toISOString()
): V3Profile {
    const favorites = records.filter((item) => item.isFavorite)
    const tags = mineTagPreferences(favorites, allCatalog)
    const combinations = mineTagCombinations(favorites, allCatalog)
    const clusters = buildTasteClusters(records)
    const empty = {
        clusters: [],
        tags: [] as ReturnType<typeof mineTagPreferences>,
        pairs: [],
        triples: []
    }
    return {
        historical: { clusters, tags, ...combinations },
        lifetime: empty,
        recent: empty,
        session: empty,
        generatedAt,
        modelVersion: 'v3.0.0-local-explainable',
        evidenceCutoff: generatedAt
    }
}
