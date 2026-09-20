import type { StoredComic } from '../library/types'
import {
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION,
    buildVisualPrototypes,
    cosineSimilarity,
    selectPreferredVisualEmbeddings,
    type VisualEmbeddingRecord,
    type VisualPrototype
} from '../recommendation-v4/visual-style'
import { normalizePreferenceKey } from './portable-policy'

export const VISUAL_AUTHOR_ATLAS_V5_VERSION =
    'visual-author-atlas-v1'

export interface VisualAuthorPrototypeV5 extends VisualPrototype {
    prototypeId: string
}

export interface VisualAuthorAtlasEntryV5 {
    authorKey: string
    displayName: string
    indexedWorkCount: number
    totalCatalogWorkCount: number
    indexedCoverage: number
    multiProvider: boolean
    providerCounts: Record<string, number>
    sourceKindCounts: Record<string, number>
    prototypeCount: number
    prototypes: VisualAuthorPrototypeV5[]
    cohesion: number | null
    substyleSpread: number | null
}

function round(value: number | null, digits = 6) {
    if (value === null || !Number.isFinite(value)) return null
    const scale = 10 ** digits
    return Math.round(value * scale) / scale
}

function mean(values: number[]) {
    return values.length
        ? values.reduce((sum, value) => sum + value, 0) /
              values.length
        : null
}

function providerKey(comic: StoredComic) {
    return (
        comic.providerId ??
        (comic.comicId.startsWith('eh:') ? 'eh' : 'pica')
    )
}

function pairwisePrototypeSpread(
    prototypes: VisualAuthorPrototypeV5[]
) {
    if (prototypes.length < 2) return null
    const distances: number[] = []
    for (let left = 0; left < prototypes.length; left++)
        for (
            let right = left + 1;
            right < prototypes.length;
            right++
        )
            distances.push(
                1 -
                    cosineSimilarity(
                        prototypes[left].vector,
                        prototypes[right].vector
                    )
            )
    return round(mean(distances))
}

function maxPrototypeSimilarity(
    left: VisualAuthorAtlasEntryV5,
    right: VisualAuthorAtlasEntryV5
) {
    let best = -1
    for (const a of left.prototypes)
        for (const b of right.prototypes)
            best = Math.max(
                best,
                cosineSimilarity(a.vector, b.vector)
            )
    return best
}

function authorDisplay(
    comics: StoredComic[],
    fallback: string
) {
    const counts = new Map<string, number>()
    for (const comic of comics) {
        const value = String(
            comic.canonicalAuthor ?? comic.author ?? ''
        ).trim()
        if (!value) continue
        counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return (
        [...counts.entries()].sort(
            (a, b) =>
                b[1] - a[1] ||
                a[0].localeCompare(b[0])
        )[0]?.[0] ?? fallback
    )
}

export function buildVisualAuthorAtlasV5(input: {
    embeddings: VisualEmbeddingRecord[]
    catalog: StoredComic[]
    minWorksPerAuthor?: number
    maximumPrototypesPerAuthor?: number
    maxGraphAuthors?: number
    neighborLimit?: number
}) {
    const minWorks = Math.max(
        2,
        Math.min(20, input.minWorksPerAuthor ?? 2)
    )
    const maxPrototypes = Math.max(
        1,
        Math.min(5, input.maximumPrototypesPerAuthor ?? 5)
    )
    const maxGraphAuthors = Math.max(
        10,
        Math.min(1000, input.maxGraphAuthors ?? 600)
    )
    const neighborLimit = Math.max(
        1,
        Math.min(30, input.neighborLimit ?? 8)
    )

    const preferred = selectPreferredVisualEmbeddings(
        input.embeddings
    )
    const catalogByAuthor = new Map<string, StoredComic[]>()
    for (const comic of input.catalog) {
        const key = normalizePreferenceKey(
            comic.canonicalAuthor ?? comic.author
        )
        if (!key) continue
        catalogByAuthor.set(key, [
            ...(catalogByAuthor.get(key) ?? []),
            comic
        ])
    }

    const indexedByAuthor = new Map<
        string,
        Array<{
            comic: StoredComic
            embedding: VisualEmbeddingRecord
        }>
    >()
    const comicById = new Map(
        input.catalog.map((comic) => [comic.comicId, comic])
    )
    for (const embedding of preferred.values()) {
        const comic = comicById.get(embedding.comicId)
        if (!comic) continue
        const key = normalizePreferenceKey(
            comic.canonicalAuthor ?? comic.author
        )
        if (!key) continue
        indexedByAuthor.set(key, [
            ...(indexedByAuthor.get(key) ?? []),
            { comic, embedding }
        ])
    }

    const entries: VisualAuthorAtlasEntryV5[] = []
    let authorsBelowMinimum = 0
    for (const [authorKey, indexed] of indexedByAuthor) {
        if (indexed.length < minWorks) {
            authorsBelowMinimum++
            continue
        }
        const catalogComics =
            catalogByAuthor.get(authorKey) ?? indexed.map(
                (row) => row.comic
            )
        const providerCounts: Record<string, number> = {}
        const sourceKindCounts: Record<string, number> = {}
        for (const row of indexed) {
            const provider = providerKey(row.comic)
            providerCounts[provider] =
                (providerCounts[provider] ?? 0) + 1
            sourceKindCounts[row.embedding.sourceKind] =
                (sourceKindCounts[row.embedding.sourceKind] ?? 0) +
                1
        }

        const prototypes = buildVisualPrototypes(
            indexed.map((row) => ({
                comicId: row.comic.comicId,
                vector: row.embedding.vector,
                weight: Math.max(
                    0.05,
                    Number(row.embedding.confidence) || 0
                )
            })),
            maxPrototypes
        ).map((prototype, index) => ({
            ...prototype,
            prototypeId: `${authorKey}#${index + 1}`
        }))

        const cohesionValues = indexed.flatMap((row) => {
            if (!prototypes.length) return []
            return [
                Math.max(
                    ...prototypes.map((prototype) =>
                        cosineSimilarity(
                            row.embedding.vector,
                            prototype.vector
                        )
                    )
                )
            ]
        })

        entries.push({
            authorKey,
            displayName: authorDisplay(
                catalogComics,
                authorKey
            ),
            indexedWorkCount: indexed.length,
            totalCatalogWorkCount: catalogComics.length,
            indexedCoverage: round(
                indexed.length /
                    Math.max(1, catalogComics.length)
            ) ?? 0,
            multiProvider:
                Object.keys(providerCounts).length > 1,
            providerCounts,
            sourceKindCounts,
            prototypeCount: prototypes.length,
            prototypes,
            cohesion: round(mean(cohesionValues)),
            substyleSpread: pairwisePrototypeSpread(prototypes)
        })
    }

    entries.sort(
        (a, b) =>
            b.indexedWorkCount - a.indexedWorkCount ||
            a.authorKey.localeCompare(b.authorKey)
    )

    const graphAuthors = entries.slice(0, maxGraphAuthors)
    const neighbors = new Map<
        string,
        Array<{
            authorKey: string
            similarity: number
        }>
    >()
    const edgeMap = new Map<
        string,
        {
            leftAuthorKey: string
            rightAuthorKey: string
            similarity: number
        }
    >()

    for (let left = 0; left < graphAuthors.length; left++) {
        for (
            let right = left + 1;
            right < graphAuthors.length;
            right++
        ) {
            const a = graphAuthors[left]
            const b = graphAuthors[right]
            const similarity = maxPrototypeSimilarity(a, b)
            if (!Number.isFinite(similarity)) continue
            const value = round(similarity) ?? 0
            neighbors.set(a.authorKey, [
                ...(neighbors.get(a.authorKey) ?? []),
                { authorKey: b.authorKey, similarity: value }
            ])
            neighbors.set(b.authorKey, [
                ...(neighbors.get(b.authorKey) ?? []),
                { authorKey: a.authorKey, similarity: value }
            ])
        }
    }

    for (const entry of graphAuthors) {
        const top = [...(neighbors.get(entry.authorKey) ?? [])]
            .sort(
                (a, b) =>
                    b.similarity - a.similarity ||
                    a.authorKey.localeCompare(b.authorKey)
            )
            .slice(0, neighborLimit)
        for (const neighbor of top) {
            const [leftAuthorKey, rightAuthorKey] = [
                entry.authorKey,
                neighbor.authorKey
            ].sort()
            const key = `${leftAuthorKey}\u0000${rightAuthorKey}`
            const previous = edgeMap.get(key)
            if (
                !previous ||
                neighbor.similarity > previous.similarity
            )
                edgeMap.set(key, {
                    leftAuthorKey,
                    rightAuthorKey,
                    similarity: neighbor.similarity
                })
        }
    }

    const edges = [...edgeMap.values()].sort(
        (a, b) =>
            b.similarity - a.similarity ||
            a.leftAuthorKey.localeCompare(b.leftAuthorKey) ||
            a.rightAuthorKey.localeCompare(b.rightAuthorKey)
    )

    return {
        mode: 'READ_ONLY' as const,
        atlasVersion: VISUAL_AUTHOR_ATLAS_V5_VERSION,
        modelId: VISUAL_MODEL_ID,
        modelVersion: VISUAL_MODEL_VERSION,
        samplingPolicyVersion:
            VISUAL_SAMPLING_POLICY_VERSION,
        rebuildPerformed: false,
        servingImpact: false,
        visualRecallEnabled: false,
        styleFamilyServingEnabled: false,
        parameters: {
            minWorksPerAuthor: minWorks,
            maximumPrototypesPerAuthor: maxPrototypes,
            maxGraphAuthors,
            neighborLimit
        },
        summary: {
            currentEmbeddingCount: preferred.size,
            authorsWithEmbeddings: indexedByAuthor.size,
            eligibleAuthorCount: entries.length,
            authorsBelowMinimum,
            multiPrototypeAuthorCount: entries.filter(
                (entry) => entry.prototypeCount > 1
            ).length,
            multiProviderAuthorCount: entries.filter(
                (entry) => entry.multiProvider
            ).length,
            graphAuthorCount: graphAuthors.length,
            graphEdgeCount: edges.length
        },
        authors: entries,
        graph: {
            nodes: graphAuthors.map((entry) => ({
                authorKey: entry.authorKey,
                displayName: entry.displayName,
                indexedWorkCount: entry.indexedWorkCount,
                prototypeCount: entry.prototypeCount,
                multiProvider: entry.multiProvider
            })),
            edges
        }
    }
}
