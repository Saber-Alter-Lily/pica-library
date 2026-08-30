import type { StoredComic } from '../library/types'
import { localCreatorEntityResolver } from './creator-resolver'
import {
    loadTagRegistryV3,
    resolveTagV3,
    type TagRegistryV3,
    type TagResolutionV3
} from './tag-resolution-v3'

export type ProfileLayer = 'LIFETIME' | 'RECENT' | 'SESSION'

export interface ProfileInterestV3 {
    key: string
    label: string
    facet: string
    supportCount: number
    supportShare: number
    facetConditionalShare: number
    informativeness: number
    rawAffinity: number
    diversityAdjustedAffinity: number
    confidence: number
    supportingComicIds: string[]
    retrievalUtility: string
    recommendationEligible: boolean
}

export interface ResolvedItemProfileV3 {
    comicId: string
    tags: TagResolutionV3[]
    interests: ProfileInterestV3[]
    creators: string[]
}

export interface InterestClusterV3 {
    clusterId: string
    favoriteComicIds: string[]
    size: number
    dominantFandoms: string[]
    dominantCreators: string[]
    dominantFacets: string[]
    representativeTags: string[]
    clusterConfidence: number
}

export interface UserInterestProfileV3 {
    profileVersion: '3.0.0'
    sourceFavoriteCount: number
    resolvedFavoriteCount: number
    facetProfiles: Record<string, ProfileInterestV3[]>
    entityProfiles: ProfileInterestV3[]
    creatorProfiles: ProfileInterestV3[]
    interestClusters: InterestClusterV3[]
    unknownEvidenceSummary: {
        occurrenceCount: number
        comicCount: number
        examples: string[]
    }
    safetySummary: {
        excludedOccurrenceCount: number
        excludedComicCount: number
        characterProfileOnlyCount: number
    }
    layer: ProfileLayer
    generatedAt: string
    evidenceCutoff: string | null
    noFabricatedRecency: true
}

export interface ProfileBuilderOptionsV3 {
    registry?: TagRegistryV3
    registryDir?: string
    generatedAt?: string
    evidenceCutoff?: string | null
    layer?: ProfileLayer
    maxEvidencePerInterest?: number
}

type Evidence = {
    key: string
    label: string
    facet: string
    comicId: string
    informativeness: number
    retrievalUtility: string
    recommendationEligible: boolean
    role: string
    resolutionType: string
}

const profileRegistry = (options: ProfileBuilderOptionsV3) =>
    options.registry ??
    loadTagRegistryV3(
        options.registryDir ??
            // The production package is resolved from the process checkout.
            // Callers may provide an explicit directory for portable replay.
            'src/data/registry-v3-final'
    )

function finite(value: number) {
    return Number.isFinite(value) ? value : 0
}

function interestRows(
    evidence: Evidence[],
    totalFavorites: number,
    maxEvidencePerInterest: number
) {
    const grouped = new Map<string, Evidence[]>()
    for (const item of evidence) {
        const key = `${item.facet}\u0000${item.key}`
        const values = grouped.get(key) ?? []
        values.push(item)
        grouped.set(key, values)
    }
    const facetTotals = new Map<string, number>()
    for (const item of grouped.values()) {
        const facet = item[0]?.facet ?? 'UNKNOWN'
        facetTotals.set(
            facet,
            (facetTotals.get(facet) ?? 0) +
                new Set(item.map((x) => x.comicId)).size
        )
    }
    return [...grouped.values()]
        .map((items) => {
            const first = items[0]
            const comicIds = [
                ...new Set(items.map((item) => item.comicId))
            ].sort()
            const supportCount = comicIds.length
            const facetTotal = facetTotals.get(first.facet) ?? totalFavorites
            const informativeness = finite(
                items.reduce((sum, item) => sum + item.informativeness, 0) /
                    Math.max(1, items.length)
            )
            const supportShare = supportCount / Math.max(1, totalFavorites)
            const conditional = supportCount / Math.max(1, facetTotal)
            // This is an explainable lifetime affinity signal, not retrieval or rank weight.
            const rawAffinity =
                supportShare * (0.5 + 0.5 * Math.min(2, informativeness))
            const diversityAdjustedAffinity =
                rawAffinity /
                Math.sqrt(Math.max(1, facetTotal / Math.max(1, supportCount)))
            return {
                key: first.key,
                label: first.label,
                facet: first.facet,
                supportCount,
                supportShare,
                facetConditionalShare: conditional,
                informativeness,
                rawAffinity,
                diversityAdjustedAffinity,
                confidence: Math.min(
                    1,
                    Math.sqrt(supportCount / Math.max(1, totalFavorites))
                ),
                supportingComicIds: comicIds.slice(0, maxEvidencePerInterest),
                retrievalUtility: first.retrievalUtility,
                recommendationEligible: first.recommendationEligible
            } satisfies ProfileInterestV3
        })
        .sort(
            (a, b) =>
                b.diversityAdjustedAffinity - a.diversityAdjustedAffinity ||
                a.key.localeCompare(b.key)
        )
}

function buildClusters(
    favorites: StoredComic[],
    itemProfiles: Map<string, ResolvedItemProfileV3>
): InterestClusterV3[] {
    const parent = new Map<string, string>(
        favorites.map((comic) => [comic.comicId, comic.comicId])
    )
    const find = (id: string): string => {
        const p = parent.get(id) ?? id
        if (p === id) return p
        const root = find(p)
        parent.set(id, root)
        return root
    }
    const union = (a: string, b: string) => {
        const ra = find(a),
            rb = find(b)
        if (ra !== rb) parent.set(rb, ra < rb ? ra : rb)
    }
    const index = new Map<string, string>()
    for (const comic of favorites) {
        const profile = itemProfiles.get(comic.comicId)
        const keys = new Set<string>()
        for (const tag of profile?.tags ?? []) {
            if (
                tag.resolutionStatus === 'RESOLVED' &&
                tag.recommendationRole !== 'IGNORE' &&
                tag.recommendationRole !== 'MODIFIER' &&
                tag.recommendationEligible
            )
                keys.add(`tag:${tag.facet}:${tag.canonicalKey}`)
        }
        const creator = localCreatorEntityResolver.resolve(comic)?.canonicalName
        if (creator) keys.add(`creator:${creator}`)
        for (const key of keys) {
            const previous = index.get(key)
            if (previous) union(comic.comicId, previous)
            else index.set(key, comic.comicId)
        }
    }
    const groups = new Map<string, StoredComic[]>()
    for (const comic of favorites) {
        const root = find(comic.comicId)
        const group = groups.get(root) ?? []
        group.push(comic)
        groups.set(root, group)
    }
    return [...groups.values()]
        .sort(
            (a, b) =>
                b.length - a.length || a[0].comicId.localeCompare(b[0].comicId)
        )
        .map((items, index) => {
            const tagCounts = new Map<string, number>(),
                facetCounts = new Map<string, number>(),
                fandomCounts = new Map<string, number>(),
                creatorCounts = new Map<string, number>()
            for (const comic of items) {
                for (const tag of itemProfiles.get(comic.comicId)?.tags ?? []) {
                    if (
                        tag.resolutionStatus !== 'RESOLVED' ||
                        !tag.recommendationEligible ||
                        tag.recommendationRole === 'MODIFIER' ||
                        tag.recommendationRole === 'IGNORE'
                    )
                        continue
                    tagCounts.set(
                        tag.canonicalLabel,
                        (tagCounts.get(tag.canonicalLabel) ?? 0) + 1
                    )
                    facetCounts.set(
                        tag.facet,
                        (facetCounts.get(tag.facet) ?? 0) + 1
                    )
                    if (tag.facet === 'FANDOM_IP')
                        fandomCounts.set(
                            tag.canonicalLabel,
                            (fandomCounts.get(tag.canonicalLabel) ?? 0) + 1
                        )
                }
                const creator =
                    localCreatorEntityResolver.resolve(comic)?.canonicalName
                if (creator)
                    creatorCounts.set(
                        creator,
                        (creatorCounts.get(creator) ?? 0) + 1
                    )
            }
            const top = (map: Map<string, number>, limit = 8) =>
                [...map]
                    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                    .slice(0, limit)
                    .map(([key]) => key)
            return {
                clusterId: `profile_v3_cluster_${String(index + 1).padStart(3, '0')}`,
                favoriteComicIds: items.map((x) => x.comicId).sort(),
                size: items.length,
                dominantFandoms: top(fandomCounts),
                dominantCreators: top(creatorCounts),
                dominantFacets: top(facetCounts),
                representativeTags: top(tagCounts),
                clusterConfidence: Math.min(1, Math.sqrt(items.length / 10))
            }
        })
}

export function buildUserInterestProfileV3(
    records: StoredComic[],
    options: ProfileBuilderOptionsV3 = {}
): { profile: UserInterestProfileV3; itemProfiles: ResolvedItemProfileV3[] } {
    const favorites = records.filter((comic) => comic.isFavorite)
    const registry = profileRegistry(options)
    const catalog = records.length ? records : favorites
    const globalCounts = new Map<string, number>()
    for (const comic of catalog) {
        const seen = new Set<string>()
        for (const raw of comic.tags) {
            const resolved = resolveTagV3(raw, registry)
            if (
                resolved.resolutionStatus === 'RESOLVED' &&
                resolved.canonicalKey &&
                !seen.has(resolved.canonicalKey)
            ) {
                seen.add(resolved.canonicalKey)
                globalCounts.set(
                    resolved.canonicalKey,
                    (globalCounts.get(resolved.canonicalKey) ?? 0) + 1
                )
            }
        }
    }
    const evidence: Evidence[] = [],
        unknownByComic = new Set<string>(),
        unknownExamples: string[] = [],
        itemProfiles: ResolvedItemProfileV3[] = []
    let unresolvedOccurrences = 0,
        safetyOccurrences = 0,
        characterProfileOnlyCount = 0
    const safetyComicIds = new Set<string>()
    for (const comic of favorites) {
        const tags: TagResolutionV3[] = [],
            interests: ProfileInterestV3[] = [],
            seen = new Set<string>()
        for (const raw of comic.tags) {
            const resolved = resolveTagV3(raw, registry)
            tags.push(resolved)
            if (resolved.resolutionStatus !== 'RESOLVED') {
                unresolvedOccurrences++
                unknownByComic.add(comic.comicId)
                if (unknownExamples.length < 20 && resolved.rawTag)
                    unknownExamples.push(resolved.rawTag)
                continue
            }
            if (
                resolved.resolutionType === 'SAFETY' ||
                resolved.recommendationRole === 'SAFETY_EXCLUDE' ||
                resolved.safetyStatus === 'BLOCK_MINOR_EXPLICIT'
            ) {
                safetyOccurrences++
                safetyComicIds.add(comic.comicId)
                continue
            }
            if (
                resolved.facet === 'FANDOM_CHARACTER' &&
                resolved.retrievalUtility === 'PROFILE_ONLY'
            )
                characterProfileOnlyCount++
            if (resolved.recommendationRole === 'IGNORE') {
                safetyOccurrences++
                safetyComicIds.add(comic.comicId)
                continue
            }
            const key = `${resolved.facet}\u0000${resolved.canonicalKey}`
            if (seen.has(key)) continue
            seen.add(key)
            const global = globalCounts.get(resolved.canonicalKey) ?? 0
            const informativeness = Math.log(
                (catalog.length + 1) / (global + 1)
            )
            evidence.push({
                key: resolved.canonicalKey,
                label: resolved.canonicalLabel,
                facet: resolved.facet,
                comicId: comic.comicId,
                informativeness,
                retrievalUtility: resolved.retrievalUtility,
                recommendationEligible: resolved.recommendationEligible,
                role: resolved.recommendationRole,
                resolutionType: resolved.resolutionType
            })
        }
        itemProfiles.push({
            comicId: comic.comicId,
            tags,
            interests,
            creators: [
                localCreatorEntityResolver.resolve(comic)?.canonicalName
            ].filter((x): x is string => Boolean(x))
        })
    }
    const rows = interestRows(
        evidence,
        favorites.length,
        options.maxEvidencePerInterest ?? 200
    )
    const byFacet: Record<string, ProfileInterestV3[]> = {}
    for (const row of rows) (byFacet[row.facet] ??= []).push(row)
    const interestByKey = new Map(
        rows.map((row) => [`${row.facet}\u0000${row.key}`, row])
    )
    for (const item of itemProfiles)
        item.interests = [
            ...new Set(
                item.tags
                    .filter(
                        (tag) =>
                            tag.resolutionStatus === 'RESOLVED' &&
                            tag.recommendationRole !== 'IGNORE'
                    )
                    .map((tag) =>
                        interestByKey.get(
                            `${tag.facet}\u0000${tag.canonicalKey}`
                        )
                    )
                    .filter((x): x is ProfileInterestV3 => Boolean(x))
            )
        ]
    const clusters = buildClusters(
        favorites,
        new Map(itemProfiles.map((x) => [x.comicId, x]))
    )
    const creatorEvidence: Evidence[] = favorites.flatMap((comic) => {
        const creator = localCreatorEntityResolver.resolve(comic)
        return creator
            ? [
                  {
                      key: creator.canonicalName,
                      label: creator.canonicalName,
                      facet: 'CREATOR_ENTITY',
                      comicId: comic.comicId,
                      informativeness: Math.log(
                          (catalog.length + 1) /
                              (catalog.filter(
                                  (x) =>
                                      localCreatorEntityResolver.resolve(x)
                                          ?.canonicalName ===
                                      creator.canonicalName
                              ).length +
                                  1)
                      ),
                      retrievalUtility: 'PROFILE_ONLY',
                      recommendationEligible: false,
                      role: 'CORE',
                      resolutionType: 'ENTITY'
                  }
              ]
            : []
    })
    const creatorProfiles = interestRows(
        creatorEvidence,
        favorites.length,
        options.maxEvidencePerInterest ?? 200
    )
    const generatedAt = options.generatedAt ?? new Date().toISOString()
    return {
        profile: {
            profileVersion: '3.0.0',
            sourceFavoriteCount: favorites.length,
            resolvedFavoriteCount: new Set(evidence.map((x) => x.comicId)).size,
            facetProfiles: byFacet,
            entityProfiles: rows.filter(
                (x) => x.facet === 'FANDOM_IP' || x.facet === 'FANDOM_CHARACTER'
            ),
            creatorProfiles,
            interestClusters: clusters,
            unknownEvidenceSummary: {
                occurrenceCount: unresolvedOccurrences,
                comicCount: unknownByComic.size,
                examples: [...new Set(unknownExamples)]
            },
            safetySummary: {
                excludedOccurrenceCount: safetyOccurrences,
                excludedComicCount: safetyComicIds.size,
                characterProfileOnlyCount
            },
            layer: options.layer ?? 'LIFETIME',
            generatedAt,
            evidenceCutoff: options.evidenceCutoff ?? null,
            noFabricatedRecency: true
        },
        itemProfiles
    }
}
