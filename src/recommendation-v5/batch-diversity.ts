import type { RankedShadowCandidateV5 } from './relevance-ranker'
import { normalizePreferenceKey } from './portable-policy'

export const BATCH_DIVERSITY_V5_VERSION =
    'batch-diversity-v1'
export const DEFAULT_V5_BATCH_SIZE = 12

export interface CandidateSemanticDiversityV5 {
    fandomKeys?: string[]
    tagKeys?: string[]
    styleKeys?: string[]
}

export interface DiversifiedShadowCandidateV5
    extends RankedShadowCandidateV5 {
    batchRank: number
    relevanceRank: number
    allocationPass: 'A' | 'B' | 'C'
    diversityPenalty: number
    providerBalanceBonus: number
    selectionScore: number
    diversityReasons: string[]
}

const passes = [
    {
        pass: 'A' as const,
        authorCap: 2,
        fandomCap: 3,
        tagCap: 4
    },
    {
        pass: 'B' as const,
        authorCap: 3,
        fandomCap: 4,
        tagCap: 6
    },
    {
        pass: 'C' as const,
        authorCap: Number.POSITIVE_INFINITY,
        fandomCap: Number.POSITIVE_INFINITY,
        tagCap: Number.POSITIVE_INFINITY
    }
]

function round(value: number) {
    return Math.round(value * 1_000_000) / 1_000_000
}

function primaryProvider(row: RankedShadowCandidateV5) {
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

function authorKey(row: RankedShadowCandidateV5) {
    return normalizePreferenceKey(row.comic.author)
}

function fallbackFandomKeys(row: RankedShadowCandidateV5) {
    const keys: string[] = []
    for (const channelId of row.evidence.channelIds) {
        if (!channelId.startsWith('FANDOM|')) continue
        for (const part of channelId.split('|').slice(2))
            if (part.startsWith('FANDOM:'))
                keys.push(
                    normalizePreferenceKey(
                        part.slice('FANDOM:'.length)
                    )
                )
    }
    return [...new Set(keys.filter(Boolean))].sort()
}

function keysFor(
    row: RankedShadowCandidateV5,
    semantic: Record<string, CandidateSemanticDiversityV5>
) {
    const configured =
        semantic[normalizePreferenceKey(row.comic.comicId)] ?? {}
    return {
        fandomKeys: [
            ...new Set(
                (
                    configured.fandomKeys?.length
                        ? configured.fandomKeys
                        : fallbackFandomKeys(row)
                )
                    .map(normalizePreferenceKey)
                    .filter(Boolean)
            )
        ].sort(),
        tagKeys: [
            ...new Set(
                (configured.tagKeys ?? [])
                    .map(normalizePreferenceKey)
                    .filter(Boolean)
            )
        ].sort(),
        styleKeys: [
            ...new Set(
                (configured.styleKeys ?? [])
                    .map(normalizePreferenceKey)
                    .filter(Boolean)
            )
        ].sort()
    }
}

function maxCount(
    counts: Map<string, number>,
    keys: string[]
) {
    return Math.max(
        0,
        ...keys.map((key) => counts.get(key) ?? 0)
    )
}

function withinCap(
    counts: Map<string, number>,
    keys: string[],
    cap: number
) {
    return keys.every((key) => (counts.get(key) ?? 0) < cap)
}

function concentration(
    rows: RankedShadowCandidateV5[],
    semantic: Record<string, CandidateSemanticDiversityV5>
) {
    const authors = new Map<string, number>()
    const fandoms = new Map<string, number>()
    const tags = new Map<string, number>()
    const providers = new Map<string, number>()
    for (const row of rows) {
        const author = authorKey(row)
        if (author)
            authors.set(author, (authors.get(author) ?? 0) + 1)
        const keys = keysFor(row, semantic)
        for (const key of keys.fandomKeys)
            fandoms.set(key, (fandoms.get(key) ?? 0) + 1)
        for (const key of keys.tagKeys)
            tags.set(key, (tags.get(key) ?? 0) + 1)
        const provider = primaryProvider(row)
        providers.set(
            provider,
            (providers.get(provider) ?? 0) + 1
        )
    }
    const maxShare = (counts: Map<string, number>) => {
        if (!rows.length || !counts.size) return 0
        return (
            Math.max(...counts.values()) /
            Math.max(1, rows.length)
        )
    }
    return {
        authorMaxShare: round(maxShare(authors)),
        fandomMaxShare: round(maxShare(fandoms)),
        tagMaxShare: round(maxShare(tags)),
        providerCounts: Object.fromEntries(
            [...providers.entries()].sort(([a], [b]) =>
                a.localeCompare(b)
            )
        )
    }
}

export function diversifyShadowBatchV5(
    ranked: RankedShadowCandidateV5[],
    semantic: Record<string, CandidateSemanticDiversityV5> = {},
    requestedBatchSize = DEFAULT_V5_BATCH_SIZE
) {
    const batchSize = Math.max(
        1,
        Math.min(50, Math.floor(requestedBatchSize))
    )
    const remaining = [...ranked]
    const selected: DiversifiedShadowCandidateV5[] = []
    const authorCounts = new Map<string, number>()
    const fandomCounts = new Map<string, number>()
    const tagCounts = new Map<string, number>()
    const providerCounts = new Map<string, number>()
    const availableProviders = new Set(
        ranked.map(primaryProvider).filter(Boolean)
    )

    const increment = (
        counts: Map<string, number>,
        keys: string[]
    ) => {
        for (const key of keys)
            counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    while (
        remaining.length &&
        selected.length < batchSize
    ) {
        let chosen:
            | {
                  index: number
                  row: RankedShadowCandidateV5
                  pass: (typeof passes)[number]
                  penalty: number
                  providerBonus: number
                  selectionScore: number
                  reasons: string[]
              }
            | undefined

        for (const pass of passes) {
            const eligible = remaining.flatMap((row, index) => {
                const author = authorKey(row)
                const keys = keysFor(row, semantic)
                if (
                    author &&
                    (authorCounts.get(author) ?? 0) >=
                        pass.authorCap
                )
                    return []
                if (
                    !withinCap(
                        fandomCounts,
                        keys.fandomKeys,
                        pass.fandomCap
                    )
                )
                    return []
                if (
                    !withinCap(
                        tagCounts,
                        keys.tagKeys,
                        pass.tagCap
                    )
                )
                    return []

                const authorSaturation = author
                    ? authorCounts.get(author) ?? 0
                    : 0
                const fandomSaturation = maxCount(
                    fandomCounts,
                    keys.fandomKeys
                )
                const tagSaturation = maxCount(
                    tagCounts,
                    keys.tagKeys
                )
                const provider = primaryProvider(row)
                const providerCount =
                    providerCounts.get(provider) ?? 0
                const minimumProviderCount = Math.min(
                    ...[...availableProviders].map(
                        (value) =>
                            providerCounts.get(value) ?? 0
                    )
                )
                const providerBonus =
                    availableProviders.size > 1 &&
                    providerCount === minimumProviderCount
                        ? 0.015
                        : 0
                const penalty =
                    0.06 * authorSaturation +
                    0.045 * fandomSaturation +
                    0.025 * tagSaturation +
                    0.015 * providerCount
                const reasons: string[] = []
                if (authorSaturation > 0)
                    reasons.push('AUTHOR_SATURATION')
                if (fandomSaturation > 0)
                    reasons.push('FANDOM_SATURATION')
                if (tagSaturation > 0)
                    reasons.push('TAG_SATURATION')
                if (providerBonus > 0)
                    reasons.push('PROVIDER_BALANCE')
                return [
                    {
                        index,
                        row,
                        pass,
                        penalty,
                        providerBonus,
                        selectionScore:
                            row.score -
                            penalty +
                            providerBonus,
                        reasons
                    }
                ]
            })

            if (!eligible.length) continue
            eligible.sort(
                (a, b) =>
                    b.selectionScore - a.selectionScore ||
                    b.row.score - a.row.score ||
                    a.row.rank - b.row.rank ||
                    a.row.comic.comicId.localeCompare(
                        b.row.comic.comicId
                    )
            )
            chosen = eligible[0]
            break
        }

        if (!chosen) break
        const [row] = remaining.splice(chosen.index, 1)
        const author = authorKey(row)
        const keys = keysFor(row, semantic)
        if (author)
            authorCounts.set(
                author,
                (authorCounts.get(author) ?? 0) + 1
            )
        increment(fandomCounts, keys.fandomKeys)
        increment(tagCounts, keys.tagKeys)
        const provider = primaryProvider(row)
        providerCounts.set(
            provider,
            (providerCounts.get(provider) ?? 0) + 1
        )

        selected.push({
            ...row,
            batchRank: selected.length + 1,
            relevanceRank: row.rank,
            allocationPass: chosen.pass.pass,
            diversityPenalty: round(chosen.penalty),
            providerBalanceBonus: round(
                chosen.providerBonus
            ),
            selectionScore: round(
                chosen.selectionScore
            ),
            diversityReasons: chosen.reasons
        })
    }

    const rawTop = ranked.slice(0, selected.length)
    const rawMeanScore = rawTop.length
        ? rawTop.reduce((sum, row) => sum + row.score, 0) /
          rawTop.length
        : 0
    const selectedMeanScore = selected.length
        ? selected.reduce((sum, row) => sum + row.score, 0) /
          selected.length
        : 0

    return {
        mode: 'SHADOW' as const,
        allocatorVersion: BATCH_DIVERSITY_V5_VERSION,
        method: 'GREEDY_SATURATION' as const,
        servingImpact: false,
        visualStyleDiversityEnabled: false,
        requestedBatchSize: batchSize,
        selectedCount: selected.length,
        rows: selected,
        telemetry: {
            passCounts: {
                A: selected.filter(
                    (row) => row.allocationPass === 'A'
                ).length,
                B: selected.filter(
                    (row) => row.allocationPass === 'B'
                ).length,
                C: selected.filter(
                    (row) => row.allocationPass === 'C'
                ).length
            },
            rawTopConcentration: concentration(
                rawTop,
                semantic
            ),
            selectedConcentration: concentration(
                selected,
                semantic
            ),
            meanRawTopRelevance: round(rawMeanScore),
            meanSelectedRelevance: round(
                selectedMeanScore
            ),
            meanRelevanceDelta: round(
                selectedMeanScore - rawMeanScore
            ),
            meanRankDisplacement: round(
                selected.length
                    ? selected.reduce(
                          (sum, row) =>
                              sum +
                              Math.max(
                                  0,
                                  row.relevanceRank -
                                      row.batchRank
                              ),
                          0
                      ) / selected.length
                    : 0
            )
        }
    }
}
