import type { StoredComic } from '../library/types'
import {
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION,
    cosineSimilarity,
    normalizeVector,
    type VisualEmbeddingRecord
} from '../recommendation-v4/visual-style'
import { normalizePreferenceKey } from './portable-policy'

export const VISUAL_REPRESENTATION_QC_V5_VERSION =
    'visual-representation-qc-v1'

interface IndexedVisualRowV5 {
    comic: StoredComic
    embedding: VisualEmbeddingRecord
    vector: number[]
    authorKey: string
    providerKey: string
    fandomKeys: string[]
}

interface SimilarityPairV5 {
    leftId: string
    rightId: string
    similarity: number
    sameProvider: boolean
    sameSourceKind: boolean
    pageCountDeltaRatio: number | null
}

function stableHash(value: string) {
    let hash = 2166136261
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

function quantile(values: number[], fraction: number) {
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    const position = Math.max(
        0,
        Math.min(sorted.length - 1, (sorted.length - 1) * fraction)
    )
    const lower = Math.floor(position)
    const upper = Math.ceil(position)
    if (lower === upper) return sorted[lower]
    const weight = position - lower
    return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function round(value: number | null, digits = 6) {
    if (value === null || !Number.isFinite(value)) return null
    const scale = 10 ** digits
    return Math.round(value * scale) / scale
}

function stats(values: number[]) {
    if (!values.length)
        return {
            count: 0,
            mean: null,
            median: null,
            p10: null,
            p90: null
        }
    const mean =
        values.reduce((sum, value) => sum + value, 0) / values.length
    return {
        count: values.length,
        mean: round(mean),
        median: round(quantile(values, 0.5)),
        p10: round(quantile(values, 0.1)),
        p90: round(quantile(values, 0.9))
    }
}

function difference(
    left: ReturnType<typeof stats>,
    right: ReturnType<typeof stats>
) {
    if (left.mean === null || right.mean === null) return null
    return round(left.mean - right.mean)
}

function preferredCurrentEmbeddings(
    embeddings: VisualEmbeddingRecord[]
) {
    const preferred = new Map<string, VisualEmbeddingRecord>()
    for (const embedding of embeddings) {
        if (
            embedding.modelId !== VISUAL_MODEL_ID ||
            embedding.modelVersion !== VISUAL_MODEL_VERSION ||
            embedding.samplingPolicyVersion !==
                VISUAL_SAMPLING_POLICY_VERSION
        )
            continue
        const previous = preferred.get(embedding.comicId)
        if (
            !previous ||
            (previous.embeddingKind === 'cover' &&
                embedding.embeddingKind === 'body')
        )
            preferred.set(embedding.comicId, embedding)
    }
    return preferred
}

function rawEhFandomKeys(comic: StoredComic) {
    const rawTags = Array.isArray(comic.providerMetadata?.rawTags)
        ? comic.providerMetadata.rawTags.map(String)
        : []
    return rawTags.flatMap((raw) => {
        const normalized = raw.normalize('NFKC').trim()
        const match = /^parody:(.+)$/i.exec(normalized)
        const value = match?.[1]?.trim()
        return value ? [normalizePreferenceKey(value)] : []
    })
}

function pageCountDeltaRatio(left: StoredComic, right: StoredComic) {
    const a = Math.max(0, Number(left.pagesCount ?? 0) || 0)
    const b = Math.max(0, Number(right.pagesCount ?? 0) || 0)
    if (!a || !b) return null
    return Math.abs(a - b) / Math.max(a, b)
}

function pair(
    left: IndexedVisualRowV5,
    right: IndexedVisualRowV5
): SimilarityPairV5 {
    return {
        leftId: left.comic.comicId,
        rightId: right.comic.comicId,
        similarity: cosineSimilarity(left.vector, right.vector),
        sameProvider: left.providerKey === right.providerKey,
        sameSourceKind:
            left.embedding.sourceKind === right.embedding.sourceKind,
        pageCountDeltaRatio: pageCountDeltaRatio(
            left.comic,
            right.comic
        )
    }
}

function groupedPairs(
    rows: IndexedVisualRowV5[],
    groupKey: (row: IndexedVisualRowV5) => string[],
    include: (
        left: IndexedVisualRowV5,
        right: IndexedVisualRowV5
    ) => boolean,
    maxPairs: number,
    maxPerGroup = 24
) {
    const groups = new Map<string, IndexedVisualRowV5[]>()
    for (const row of rows)
        for (const key of groupKey(row)) {
            if (!key) continue
            groups.set(key, [...(groups.get(key) ?? []), row])
        }

    const output: SimilarityPairV5[] = []
    const seen = new Set<string>()
    const orderedGroups = [...groups.entries()].sort(
        (a, b) =>
            stableHash(a[0]) - stableHash(b[0]) ||
            a[0].localeCompare(b[0])
    )
    for (const [, members] of orderedGroups) {
        const ordered = [...members].sort(
            (a, b) =>
                stableHash(a.comic.comicId) -
                    stableHash(b.comic.comicId) ||
                a.comic.comicId.localeCompare(b.comic.comicId)
        )
        let groupCount = 0
        for (let left = 0; left < ordered.length; left++) {
            for (
                let right = left + 1;
                right < ordered.length;
                right++
            ) {
                if (output.length >= maxPairs) return output
                if (groupCount >= maxPerGroup) break
                const a = ordered[left]
                const b = ordered[right]
                if (!include(a, b)) continue
                const pairKey = [a.comic.comicId, b.comic.comicId]
                    .sort()
                    .join('\u0000')
                if (seen.has(pairKey)) continue
                seen.add(pairKey)
                output.push(pair(a, b))
                groupCount++
            }
            if (groupCount >= maxPerGroup) break
        }
    }
    return output
}

function backgroundPairs(
    rows: IndexedVisualRowV5[],
    maxPairs: number
) {
    const ordered = [...rows].sort(
        (a, b) =>
            stableHash(a.comic.comicId) -
                stableHash(b.comic.comicId) ||
            a.comic.comicId.localeCompare(b.comic.comicId)
    )
    const output: SimilarityPairV5[] = []
    const seen = new Set<string>()
    if (ordered.length < 2) return output
    const offsets = [1, 7, 17, 37, 73, 149, 307]
    for (const offset of offsets) {
        for (let index = 0; index < ordered.length; index++) {
            if (output.length >= maxPairs) return output
            const otherIndex = (index + offset) % ordered.length
            if (index === otherIndex) continue
            const left = ordered[index]
            const right = ordered[otherIndex]
            if (
                left.authorKey &&
                right.authorKey &&
                left.authorKey === right.authorKey
            )
                continue
            const key = [left.comic.comicId, right.comic.comicId]
                .sort()
                .join('\u0000')
            if (seen.has(key)) continue
            seen.add(key)
            output.push(pair(left, right))
        }
    }
    return output
}

function topKDiagnostics(
    rows: IndexedVisualRowV5[],
    maxAnchors: number
) {
    const byAuthor = new Map<string, IndexedVisualRowV5[]>()
    const byFandom = new Map<string, IndexedVisualRowV5[]>()
    for (const row of rows) {
        if (row.authorKey)
            byAuthor.set(row.authorKey, [
                ...(byAuthor.get(row.authorKey) ?? []),
                row
            ])
        for (const key of row.fandomKeys)
            byFandom.set(key, [...(byFandom.get(key) ?? []), row])
    }

    const eligible = rows
        .filter((row) => {
            const authorEligible =
                Boolean(row.authorKey) &&
                (byAuthor.get(row.authorKey)?.length ?? 0) > 1
            const fandomEligible = row.fandomKeys.some((key) =>
                (byFandom.get(key) ?? []).some(
                    (other) =>
                        other.comic.comicId !== row.comic.comicId &&
                        other.authorKey !== row.authorKey
                )
            )
            return authorEligible || fandomEligible
        })
        .sort(
            (a, b) =>
                stableHash(a.comic.comicId) -
                    stableHash(b.comic.comicId) ||
                a.comic.comicId.localeCompare(b.comic.comicId)
        )
        .slice(0, maxAnchors)

    let authorEligible = 0
    let authorTop1 = 0
    let authorTop5 = 0
    let authorReciprocalRank = 0
    let crossProviderAuthorEligible = 0
    let crossProviderAuthorTop5 = 0
    let fandomEligible = 0
    let fandomTop5 = 0
    let top1SameProvider = 0
    let top1SameSourceKind = 0

    for (const anchor of eligible) {
        const ranked = rows
            .filter(
                (candidate) =>
                    candidate.comic.comicId !== anchor.comic.comicId
            )
            .map((candidate) => ({
                candidate,
                similarity: cosineSimilarity(
                    anchor.vector,
                    candidate.vector
                )
            }))
            .sort(
                (a, b) =>
                    b.similarity - a.similarity ||
                    a.candidate.comic.comicId.localeCompare(
                        b.candidate.comic.comicId
                    )
            )
        const top1 = ranked[0]?.candidate
        if (top1?.providerKey === anchor.providerKey)
            top1SameProvider++
        if (
            top1?.embedding.sourceKind ===
            anchor.embedding.sourceKind
        )
            top1SameSourceKind++

        const sameAuthor = Boolean(anchor.authorKey)
            ? ranked.filter(
                  (item) =>
                      item.candidate.authorKey === anchor.authorKey
              )
            : []
        if (sameAuthor.length) {
            authorEligible++
            const firstRank =
                ranked.findIndex(
                    (item) =>
                        item.candidate.authorKey === anchor.authorKey
                ) + 1
            if (firstRank === 1) authorTop1++
            if (firstRank > 0 && firstRank <= 5) authorTop5++
            if (firstRank > 0)
                authorReciprocalRank += 1 / firstRank

            const crossProvider = ranked.filter(
                (item) =>
                    item.candidate.authorKey === anchor.authorKey &&
                    item.candidate.providerKey !== anchor.providerKey
            )
            if (crossProvider.length) {
                crossProviderAuthorEligible++
                const firstCrossRank =
                    ranked.findIndex(
                        (item) =>
                            item.candidate.authorKey ===
                                anchor.authorKey &&
                            item.candidate.providerKey !==
                                anchor.providerKey
                    ) + 1
                if (firstCrossRank > 0 && firstCrossRank <= 5)
                    crossProviderAuthorTop5++
            }
        }

        const fandomMatch = ranked.filter((item) => {
            if (
                item.candidate.authorKey &&
                item.candidate.authorKey === anchor.authorKey
            )
                return false
            return item.candidate.fandomKeys.some((key) =>
                anchor.fandomKeys.includes(key)
            )
        })
        if (fandomMatch.length) {
            fandomEligible++
            const firstFandomRank =
                ranked.findIndex((item) => {
                    if (
                        item.candidate.authorKey &&
                        item.candidate.authorKey ===
                            anchor.authorKey
                    )
                        return false
                    return item.candidate.fandomKeys.some((key) =>
                        anchor.fandomKeys.includes(key)
                    )
                }) + 1
            if (firstFandomRank > 0 && firstFandomRank <= 5)
                fandomTop5++
        }
    }

    const rate = (value: number, denominator: number) =>
        denominator ? round(value / denominator) : null

    return {
        sampledAnchorCount: eligible.length,
        author: {
            eligibleAnchors: authorEligible,
            top1HitRate: rate(authorTop1, authorEligible),
            top5HitRate: rate(authorTop5, authorEligible),
            meanReciprocalRank: authorEligible
                ? round(authorReciprocalRank / authorEligible)
                : null,
            crossProviderEligibleAnchors:
                crossProviderAuthorEligible,
            crossProviderTop5HitRate: rate(
                crossProviderAuthorTop5,
                crossProviderAuthorEligible
            )
        },
        fandomDifferentAuthor: {
            eligibleAnchors: fandomEligible,
            top5HitRate: rate(fandomTop5, fandomEligible)
        },
        nuisance: {
            top1SameProviderRate: rate(
                top1SameProvider,
                eligible.length
            ),
            top1SameSourceKindRate: rate(
                top1SameSourceKind,
                eligible.length
            )
        }
    }
}

export function buildVisualRepresentationQcV5(input: {
    embeddings: VisualEmbeddingRecord[]
    catalog: StoredComic[]
    fandomKeysByComic?: Record<string, string[]>
    maxPairSamples?: number
    maxAnchors?: number
}) {
    const preferred = preferredCurrentEmbeddings(input.embeddings)
    const catalogById = new Map(
        input.catalog.map((comic) => [comic.comicId, comic])
    )
    const rows: IndexedVisualRowV5[] = [...preferred.values()]
        .flatMap((embedding) => {
            const comic = catalogById.get(embedding.comicId)
            if (!comic) return []
            const supplied =
                input.fandomKeysByComic?.[comic.comicId] ?? []
            const fandomKeys = [
                ...new Set(
                    [...supplied, ...rawEhFandomKeys(comic)]
                        .map(normalizePreferenceKey)
                        .filter(Boolean)
                )
            ].sort()
            return [
                {
                    comic,
                    embedding,
                    vector: normalizeVector(embedding.vector),
                    authorKey: normalizePreferenceKey(
                        comic.canonicalAuthor ?? comic.author
                    ),
                    providerKey:
                        comic.providerId ??
                        (comic.comicId.startsWith('eh:')
                            ? 'eh'
                            : 'pica'),
                    fandomKeys
                }
            ]
        })
        .sort((a, b) =>
            a.comic.comicId.localeCompare(b.comic.comicId)
        )

    const maxPairs = Math.max(
        100,
        Math.min(10000, input.maxPairSamples ?? 4000)
    )
    const sameAuthorPairs = groupedPairs(
        rows,
        (row) => (row.authorKey ? [row.authorKey] : []),
        () => true,
        maxPairs
    )
    const differentAuthorPairs = backgroundPairs(rows, maxPairs)
    const sameFandomDifferentAuthorPairs = groupedPairs(
        rows,
        (row) => row.fandomKeys,
        (left, right) =>
            !left.authorKey ||
            !right.authorKey ||
            left.authorKey !== right.authorKey,
        maxPairs
    )

    const sameAuthor = stats(
        sameAuthorPairs.map((row) => row.similarity)
    )
    const differentAuthor = stats(
        differentAuthorPairs.map((row) => row.similarity)
    )
    const sameFandomDifferentAuthor = stats(
        sameFandomDifferentAuthorPairs.map(
            (row) => row.similarity
        )
    )
    const sameAuthorSameProvider = stats(
        sameAuthorPairs
            .filter((row) => row.sameProvider)
            .map((row) => row.similarity)
    )
    const sameAuthorCrossProvider = stats(
        sameAuthorPairs
            .filter((row) => !row.sameProvider)
            .map((row) => row.similarity)
    )
    const sameAuthorSameSource = stats(
        sameAuthorPairs
            .filter((row) => row.sameSourceKind)
            .map((row) => row.similarity)
    )
    const sameAuthorMixedSource = stats(
        sameAuthorPairs
            .filter((row) => !row.sameSourceKind)
            .map((row) => row.similarity)
    )
    const sameAuthorNearPageCount = stats(
        sameAuthorPairs
            .filter(
                (row) =>
                    row.pageCountDeltaRatio !== null &&
                    row.pageCountDeltaRatio <= 0.1
            )
            .map((row) => row.similarity)
    )
    const sameAuthorFarPageCount = stats(
        sameAuthorPairs
            .filter(
                (row) =>
                    row.pageCountDeltaRatio !== null &&
                    row.pageCountDeltaRatio >= 0.3
            )
            .map((row) => row.similarity)
    )

    const favoriteIds = new Set(
        input.catalog
            .filter((comic) => comic.isFavorite)
            .map((comic) => comic.comicId)
    )
    const providerKeys = [
        ...new Set(
            input.catalog.map(
                (comic) =>
                    comic.providerId ??
                    (comic.comicId.startsWith('eh:')
                        ? 'eh'
                        : 'pica')
            )
        )
    ].sort()
    const sourceKinds = [
        'LOCAL_PAGES',
        'REMOTE_PAGES',
        'COVER_ONLY'
    ] as const

    const coverage = {
        catalogCount: input.catalog.length,
        favoriteCount: favoriteIds.size,
        indexedComicCount: rows.length,
        indexedFavoriteCount: rows.filter((row) =>
            favoriteIds.has(row.comic.comicId)
        ).length,
        catalogCoverage: input.catalog.length
            ? round(rows.length / input.catalog.length)
            : 0,
        favoriteCoverage: favoriteIds.size
            ? round(
                  rows.filter((row) =>
                      favoriteIds.has(row.comic.comicId)
                  ).length / favoriteIds.size
              )
            : 0,
        bodyPreferredCount: rows.filter(
            (row) => row.embedding.embeddingKind === 'body'
        ).length,
        coverPreferredCount: rows.filter(
            (row) => row.embedding.embeddingKind === 'cover'
        ).length,
        orphanEmbeddingCount: [...preferred.keys()].filter(
            (comicId) => !catalogById.has(comicId)
        ).length,
        byProvider: Object.fromEntries(
            providerKeys.map((provider) => {
                const total = input.catalog.filter(
                    (comic) =>
                        (comic.providerId ??
                            (comic.comicId.startsWith('eh:')
                                ? 'eh'
                                : 'pica')) === provider
                ).length
                const indexed = rows.filter(
                    (row) => row.providerKey === provider
                ).length
                return [
                    provider,
                    {
                        total,
                        indexed,
                        coverage: total
                            ? round(indexed / total)
                            : 0
                    }
                ]
            })
        ),
        bySourceKind: Object.fromEntries(
            sourceKinds.map((sourceKind) => [
                sourceKind,
                rows.filter(
                    (row) =>
                        row.embedding.sourceKind === sourceKind
                ).length
            ])
        )
    }

    const sampleCounts = rows.map(
        (row) => row.embedding.sampleCount
    )
    const confidences = rows.map(
        (row) => row.embedding.confidence
    )

    return {
        mode: 'READ_ONLY' as const,
        qcVersion: VISUAL_REPRESENTATION_QC_V5_VERSION,
        modelId: VISUAL_MODEL_ID,
        modelVersion: VISUAL_MODEL_VERSION,
        samplingPolicyVersion:
            VISUAL_SAMPLING_POLICY_VERSION,
        rebuildPerformed: false,
        servingImpact: false,
        coverage,
        embeddingQuality: {
            sampleCount: stats(sampleCounts),
            confidence: stats(confidences)
        },
        pairwise: {
            sameAuthor,
            differentAuthor,
            authorSeparation: difference(
                sameAuthor,
                differentAuthor
            ),
            sameFandomDifferentAuthor,
            fandomSeparation: difference(
                sameFandomDifferentAuthor,
                differentAuthor
            ),
            sameAuthorSameProvider,
            sameAuthorCrossProvider,
            providerEffectProxy: difference(
                sameAuthorSameProvider,
                sameAuthorCrossProvider
            ),
            sameAuthorSameSourceKind: sameAuthorSameSource,
            sameAuthorMixedSourceKind: sameAuthorMixedSource,
            sourceKindEffectProxy: difference(
                sameAuthorSameSource,
                sameAuthorMixedSource
            ),
            sameAuthorNearPageCount,
            sameAuthorFarPageCount,
            pageCountSensitivityProxy: difference(
                sameAuthorNearPageCount,
                sameAuthorFarPageCount
            )
        },
        knn: topKDiagnostics(
            rows,
            Math.max(
                10,
                Math.min(250, input.maxAnchors ?? 120)
            )
        ),
        sampling: {
            maxPairSamples: maxPairs,
            maxAnchors: Math.max(
                10,
                Math.min(250, input.maxAnchors ?? 120)
            ),
            deterministic: true
        },
        interpretation: {
            descriptiveOnly: true,
            providerEffectProxy:
                'Same-author same-provider minus same-author cross-provider similarity.',
            sourceKindEffectProxy:
                'Same-author same-source-kind minus mixed-source-kind similarity.',
            pageCountSensitivityProxy:
                'Same-author near-page-count minus far-page-count similarity.',
            noAutomaticActivation: true
        }
    }
}
