import type { StoredComic } from '../library/types'
import {
    selectPreferredVisualEmbeddings,
    type VisualEmbeddingRecord
} from '../recommendation-v4/visual-style'
import type { DiversifiedShadowCandidateV5 } from './batch-diversity'
import type { RankedShadowCandidateV5 } from './relevance-ranker'
import { normalizePreferenceKey } from './portable-policy'

export const VISUAL_CANDIDATE_COVERAGE_V5_VERSION =
    'visual-candidate-coverage-v1'

function round(value: number) {
    return Math.round(value * 1_000_000) / 1_000_000
}

function provider(row: RankedShadowCandidateV5) {
    if (row.comic.providerId === 'pica') return 'pica'
    if (row.comic.providerId === 'eh') {
        if (
            row.evidence.surfaces.includes('exh') &&
            !row.evidence.surfaces.includes('eh')
        )
            return 'exh'
        return 'eh'
    }
    return (
        row.evidence.surfaces.find(
            (surface) => surface !== 'local'
        ) ?? 'local'
    )
}

function coverage(
    rows: RankedShadowCandidateV5[],
    indexed: Set<string>
) {
    const unique = [
        ...new Map(
            rows.map((row) => [
                normalizePreferenceKey(row.comic.comicId),
                row
            ])
        ).values()
    ]
    const indexedCount = unique.filter((row) =>
        indexed.has(normalizePreferenceKey(row.comic.comicId))
    ).length
    const providers = [...new Set(unique.map(provider))].sort()
    return {
        candidateCount: unique.length,
        indexedCount,
        missingCount: unique.length - indexedCount,
        coverage: unique.length
            ? round(indexedCount / unique.length)
            : 0,
        byProvider: Object.fromEntries(
            providers.map((value) => {
                const subset = unique.filter(
                    (row) => provider(row) === value
                )
                const covered = subset.filter((row) =>
                    indexed.has(
                        normalizePreferenceKey(row.comic.comicId)
                    )
                ).length
                return [
                    value,
                    {
                        candidateCount: subset.length,
                        indexedCount: covered,
                        missingCount: subset.length - covered,
                        coverage: subset.length
                            ? round(covered / subset.length)
                            : 0
                    }
                ]
            })
        )
    }
}

export function buildVisualCandidateCoverageV5(input: {
    ranked: RankedShadowCandidateV5[]
    diversified: DiversifiedShadowCandidateV5[]
    embeddings: VisualEmbeddingRecord[]
    catalog: StoredComic[]
    analysisBudget?: number
}) {
    const budget = Math.max(
        0,
        Math.min(100, Math.floor(input.analysisBudget ?? 24))
    )
    const preferred = selectPreferredVisualEmbeddings(
        input.embeddings
    )
    const indexed = new Set(
        [...preferred.keys()].map(normalizePreferenceKey)
    )
    const catalogById = new Map(
        input.catalog.map((comic) => [
            normalizePreferenceKey(comic.comicId),
            comic
        ])
    )
    const batchById = new Map(
        input.diversified.map((row) => [
            normalizePreferenceKey(row.comic.comicId),
            row
        ])
    )
    const rankedById = new Map(
        input.ranked.map((row) => [
            normalizePreferenceKey(row.comic.comicId),
            row
        ])
    )

    const missing = [...rankedById.entries()]
        .filter(([comicId]) => !indexed.has(comicId))
        .map(([comicId, row]) => {
            const batch = batchById.get(comicId)
            const catalogComic = catalogById.get(comicId)
            const tier = batch
                ? ('DIVERSIFIED_BATCH' as const)
                : row.rank <= 50
                  ? ('TOP_50_RELEVANCE' as const)
                  : ('RANKED_POOL' as const)
            const priority =
                (batch
                    ? 3000 - batch.batchRank * 10
                    : row.rank <= 50
                      ? 2000 - row.rank
                      : 1000 - Math.min(999, row.rank)) +
                Math.max(-100, Math.min(100, row.score))
            const surface = provider(row)
            const preparationReady = Boolean(catalogComic)
            const localPageReady = Boolean(
                catalogComic &&
                    catalogComic.downloadedPictures >= 3
            )
            return {
                comicId: row.comic.comicId,
                provider: surface,
                priorityTier: tier,
                priority: round(priority),
                relevanceRank: row.rank,
                batchRank: batch?.batchRank ?? null,
                catalogPresent: Boolean(catalogComic),
                preparationReady,
                blockedReason: preparationReady
                    ? null
                    : 'SHADOW_CANDIDATE_NOT_PERSISTED',
                recommendedSamplingMode: localPageReady
                    ? ('local_only' as const)
                    : preparationReady &&
                        (surface === 'pica' ||
                            surface === 'eh' ||
                            surface === 'exh')
                      ? ('standard' as const)
                      : null
            }
        })
        .sort(
            (a, b) =>
                b.priority - a.priority ||
                a.relevanceRank - b.relevanceRank ||
                a.comicId.localeCompare(b.comicId)
        )

    const selected = missing.slice(0, budget)
    const ready = selected.filter(
        (item) => item.preparationReady
    )
    const blocked = selected.filter(
        (item) => !item.preparationReady
    )

    return {
        mode: 'PLAN_ONLY' as const,
        coverageVersion: VISUAL_CANDIDATE_COVERAGE_V5_VERSION,
        servingImpact: false,
        embeddingGenerationEnabled: false,
        candidatePersistenceEnabled: false,
        currentEmbeddingCount: preferred.size,
        coverage: {
            ranked: coverage(input.ranked, indexed),
            diversifiedBatch: coverage(
                input.diversified,
                indexed
            )
        },
        budget: {
            requested: budget,
            missingRankedCandidates: missing.length,
            selectedCount: selected.length,
            readyCount: ready.length,
            blockedCount: blocked.length,
            readyFraction: selected.length
                ? round(ready.length / selected.length)
                : 0
        },
        selectedForAnalysis: selected,
        diagnostics: {
            catalogPresentMissingCount: missing.filter(
                (item) => item.catalogPresent
            ).length,
            nonPersistedMissingCount: missing.filter(
                (item) => !item.catalogPresent
            ).length,
            nonPersistedBatchMissingCount: missing.filter(
                (item) =>
                    item.batchRank !== null &&
                    !item.catalogPresent
            ).length,
            requiresEphemeralPreparationSeam:
                blocked.length > 0
        }
    }
}
