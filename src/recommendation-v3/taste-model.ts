import type { StoredComic } from '../library/types'
import {
    featureSimilarity,
    itemFeature,
    normalizeFeatureValue
} from './features'
import { mineTagCombinations, mineTagPreferences } from './tag-combinations'
import {
    TAG_ALIAS_VERSION,
    TAG_ONTOLOGY_VERSION,
    semanticTagFeatures
} from './semantic-core'
import type { TasteCluster, V3Profile } from './types'

function clusterKey(ids: string[]) {
    return ids.slice().sort().join(',')
}

function clusterFor(
    members: StoredComic[],
    index: number,
    totalItems: number
): TasteCluster {
    const semantic = members.flatMap((comic) => semanticTagFeatures(comic))
    const all = semantic
        .filter(
            (feature) =>
                feature.eligibleForCluster &&
                feature.recommendationRole !== 'MODIFIER'
        )
        .map((feature) => feature.canonical)
    const tags = [...new Set(all)].sort()
    const modifiers = [
        ...new Set(
            semantic
                .filter((feature) => feature.recommendationRole === 'MODIFIER')
                .map((feature) => feature.canonical)
        )
    ].sort()
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
    // Cluster combinations are representative hints; global profile mining
    // computes the authoritative interactions once, avoiding quadratic work.
    const combinations = {
        pairs: [] as { tags: string[] }[],
        triples: [] as { tags: string[] }[]
    }
    return {
        clusterId: `cluster_${index + 1}_${clusterKey(members.map((item) => item.comicId)).slice(0, 18)}`,
        weight: members.length / Math.max(1, totalItems),
        size: members.length,
        itemIds: members.map((item) => item.comicId).sort(),
        authors: authors.slice(0, 30),
        circles: circles.slice(0, 30),
        tags: tags.slice(0, 30),
        modifiers: modifiers.slice(0, 12),
        tagPairs: combinations.pairs.slice(0, 30).map((item) => item.tags),
        tagTriples: combinations.triples.slice(0, 30).map((item) => item.tags),
        confidence: Math.min(1, members.length / 3)
    }
}

export function chooseClusterCount(records: StoredComic[]) {
    if (records.length < 8) return records.length ? 1 : 0
    const ordered = [...records].sort((a, b) =>
        a.comicId.localeCompare(b.comicId)
    )
    const sample = ordered
        .slice(0, Math.min(120, ordered.length))
        .map(itemFeature)
    const maxK = Math.min(
        12,
        Math.max(1, Math.floor(Math.sqrt(records.length)))
    )
    let bestK = 1,
        bestScore = -Infinity
    for (let k = 1; k <= maxK; k++) {
        const reps = sample.filter((_, i) => i % k === 0).slice(0, k)
        const groups = reps.map(() => [] as typeof sample)
        for (const item of sample) {
            const values = reps.map((rep) => featureSimilarity(item, rep))
            const i = values.reduce((a, v, j) => (v > values[a] ? j : a), 0)
            groups[i]?.push(item)
        }
        const cohesion =
            groups.reduce(
                (s, g, i) =>
                    s +
                    (g.length
                        ? g.reduce(
                              (x, item) => x + featureSimilarity(item, reps[i]),
                              0
                          ) / g.length
                        : 0),
                0
            ) / Math.max(1, groups.length)
        const penalty = groups.some((g) => g.length < 3) ? 0.08 : 0
        const score = cohesion - penalty - k * 0.002
        if (score > bestScore) {
            bestScore = score
            bestK = k
        }
    }
    return bestK
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
    const features = new Map(
        ordered.map((item) => [item.comicId, itemFeature(item)])
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
                                    features.get(candidate.comicId)!,
                                    features.get(rep.comicId)!
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
        const values = representatives.map((rep) =>
            featureSimilarity(
                features.get(item.comicId)!,
                features.get(rep.comicId)!
            )
        )
        const index = values.reduce(
            (best, value, current) => (value > values[best] ? current : best),
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
    const facetMaps = new Map<string, Map<string, number>>()
    for (const comic of favorites)
        for (const feature of semanticTagFeatures(comic)) {
            if (feature.recommendationRole === 'IGNORE') continue
            const values =
                facetMaps.get(feature.facet) ?? new Map<string, number>()
            values.set(
                feature.canonical,
                (values.get(feature.canonical) ?? 0) + 1
            )
            facetMaps.set(feature.facet, values)
        }
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
        evidenceCutoff: generatedAt,
        semantic: {
            ontologyVersion: TAG_ONTOLOGY_VERSION,
            aliasVersion: TAG_ALIAS_VERSION,
            facets: Object.fromEntries(
                [...facetMaps].map(([facet, values]) => [
                    facet,
                    [...values]
                        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                        .slice(0, 50)
                        .map(([value, count]) => ({
                            value,
                            count,
                            score: count / Math.max(1, favorites.length)
                        }))
                ])
            )
        }
    }
}
