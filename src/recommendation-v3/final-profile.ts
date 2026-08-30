import { createHash } from 'node:crypto'
import type { StoredComic } from '../library/types'
import { localCreatorEntityResolver } from './creator-resolver'
import {
    loadTagRegistryV3,
    resolveTagV3,
    type TagRegistryV3
} from './tag-resolution-v3'

export const FINAL_PROFILE_VERSION = '3.1.0-lifetime-sparse'

export type EvidenceConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface FinalInterestEvidenceV3 {
    canonicalKey: string
    canonicalLabel: string
    facet: string
    supportCount: number
    supportShare: number
    facetComicCount: number
    facetConditionalShare: number
    confidence: EvidenceConfidence
    recommendationRole: string
    retrievalUtility: string
    recommendationEligible: boolean
    providerSamplePrior: null
    supportingComicIds: string[]
    providerObservedLabels: Array<{
        label: string
        supportComicCount: number
        occurrenceCount: number
    }>
}

export interface FinalCreatorEvidenceV3 {
    creatorId: string
    displayName: string
    providerQueryLabel: string | null
    supportCount: number
    supportShare: number
    confidence: EvidenceConfidence
    providerEligible: boolean
    supportingComicIds: string[]
}

export interface FinalLifetimeProfileV3 {
    schemaVersion: 1
    profileVersion: typeof FINAL_PROFILE_VERSION
    registryVersion: string
    favoriteFingerprint: string
    sourceFavoriteCount: number
    primaryInterests: FinalInterestEvidenceV3[]
    profileOnlyInterests: FinalInterestEvidenceV3[]
    modifierEvidence: FinalInterestEvidenceV3[]
    creatorProfiles: FinalCreatorEvidenceV3[]
    unresolvedEvidence: Array<{
        rawTag: string
        normalizedTag: string
        canonicalKey?: string
        canonicalLabel?: string
        facet?: string
        resolutionStatus?: string
        resolutionSource?: string
        comicIds: string[]
    }>
    generatedAt: string
    noFabricatedRecency: true
    providerSamplePriorEffect: 0
}

export interface FinalProfileBuildOptions {
    registry?: TagRegistryV3
    registryDir?: string
    generatedAt?: string
}

const confidence = (support: number): EvidenceConfidence =>
    support >= 10 ? 'HIGH' : support >= 5 ? 'MEDIUM' : 'LOW'

export function favoriteFingerprint(records: StoredComic[]) {
    const ids = [
        ...new Set(
            records
                .filter((comic) => comic.isFavorite)
                .map((comic) => comic.comicId)
        )
    ].sort()
    return createHash('sha256').update(ids.join('\n')).digest('hex')
}

const isPrimary = (role: string) => role === 'CORE' || role === 'SECONDARY'
const isProfileOnly = (role: string, utility: string) =>
    role === 'PROFILE_ONLY' || utility === 'PROFILE_ONLY'
const isModifier = (role: string) =>
    role === 'MODIFIER' || role === 'MODIFIER_ONLY'

export function buildFinalLifetimeProfileV3(
    records: StoredComic[],
    options: FinalProfileBuildOptions = {}
): FinalLifetimeProfileV3 {
    const favorites = [
        ...new Map(
            records
                .filter((comic) => comic.isFavorite)
                .map((comic) => [comic.comicId, comic])
        ).values()
    ].sort((a, b) => a.comicId.localeCompare(b.comicId))
    const registry =
        options.registry ??
        loadTagRegistryV3(options.registryDir ?? 'src/data/registry-v3-final')

    type Row = {
        canonicalKey: string
        canonicalLabel: string
        facet: string
        comicId: string
        recommendationRole: string
        retrievalUtility: string
        recommendationEligible: boolean
        rawTag: string
    }
    const rows: Row[] = []
    const unresolved = new Map<
        string,
        {
            rawTag: string
            normalizedTag: string
            canonicalKey?: string
            canonicalLabel?: string
            facet?: string
            resolutionStatus?: string
            resolutionSource?: string
            comicIds: Set<string>
        }
    >()

    for (const comic of favorites) {
        const seen = new Set<string>()
        for (const rawTag of comic.tags) {
            const resolved = resolveTagV3(rawTag, registry)
            if (
                resolved.resolutionStatus !== 'RESOLVED' ||
                resolved.recommendationRole === 'UNRESOLVED' ||
                resolved.retrievalUtility === 'UNRESOLVED'
            ) {
                const key = `${resolved.normalizedTag}\u0000${resolved.rawTag}`
                const value = unresolved.get(key) ?? {
                    rawTag: resolved.rawTag,
                    normalizedTag: resolved.normalizedTag,
                    canonicalKey: resolved.canonicalKey || undefined,
                    canonicalLabel: resolved.canonicalLabel || undefined,
                    facet: resolved.facet || undefined,
                    resolutionStatus: resolved.resolutionStatus,
                    resolutionSource: resolved.resolutionSource,
                    comicIds: new Set<string>()
                }
                value.comicIds.add(comic.comicId)
                unresolved.set(key, value)
                continue
            }
            if (
                resolved.resolutionType === 'SAFETY' ||
                resolved.recommendationRole === 'SAFETY_EXCLUDE' ||
                resolved.recommendationRole === 'IGNORE' ||
                resolved.recommendationRole === 'EXCLUDE'
            )
                continue
            const identity = `${resolved.facet}\u0000${resolved.canonicalKey}`
            if (seen.has(identity)) continue
            seen.add(identity)
            rows.push({
                canonicalKey: resolved.canonicalKey,
                canonicalLabel: resolved.canonicalLabel,
                facet: resolved.facet,
                comicId: comic.comicId,
                recommendationRole: resolved.recommendationRole,
                retrievalUtility: resolved.retrievalUtility,
                recommendationEligible: resolved.recommendationEligible,
                rawTag: resolved.rawTag
            })
        }
    }

    const facetComicIds = new Map<string, Set<string>>()
    for (const row of rows) {
        if (
            !isPrimary(row.recommendationRole) &&
            !isProfileOnly(row.recommendationRole, row.retrievalUtility)
        )
            continue
        const ids = facetComicIds.get(row.facet) ?? new Set<string>()
        ids.add(row.comicId)
        facetComicIds.set(row.facet, ids)
    }
    const grouped = new Map<string, Row[]>()
    for (const row of rows) {
        const key = `${row.facet}\u0000${row.canonicalKey}`
        grouped.set(key, [...(grouped.get(key) ?? []), row])
    }
    const evidence = [...grouped.values()]
        .map((items): FinalInterestEvidenceV3 => {
            const first = items[0]
            const ids = [...new Set(items.map((item) => item.comicId))].sort()
            const facetCount = facetComicIds.get(first.facet)?.size ?? 0
            return {
                canonicalKey: first.canonicalKey,
                canonicalLabel: first.canonicalLabel,
                facet: first.facet,
                supportCount: ids.length,
                supportShare: ids.length / Math.max(1, favorites.length),
                facetComicCount: facetCount,
                facetConditionalShare: ids.length / Math.max(1, facetCount),
                confidence: confidence(ids.length),
                recommendationRole: first.recommendationRole,
                retrievalUtility: first.retrievalUtility,
                recommendationEligible: first.recommendationEligible,
                providerSamplePrior: null,
                supportingComicIds: ids,
                providerObservedLabels: [
                    ...new Map(
                        items.map((item) => [item.rawTag, item])
                    ).entries()
                ]
                    .map(([label]) => ({
                        label,
                        supportComicCount: new Set(
                            items
                                .filter((item) => item.rawTag === label)
                                .map((item) => item.comicId)
                        ).size,
                        occurrenceCount: items.filter(
                            (item) => item.rawTag === label
                        ).length
                    }))
                    .sort(
                        (a, b) =>
                            b.supportComicCount - a.supportComicCount ||
                            b.occurrenceCount - a.occurrenceCount ||
                            a.label.localeCompare(b.label)
                    )
            }
        })
        .sort(
            (a, b) =>
                a.facet.localeCompare(b.facet) ||
                b.supportCount - a.supportCount ||
                a.canonicalKey.localeCompare(b.canonicalKey)
        )

    const creatorGroups = new Map<
        string,
        { displayName: string; ids: Set<string>; providerEligible: boolean }
    >()
    for (const comic of favorites) {
        const creator = localCreatorEntityResolver.resolve(comic)
        if (!creator) continue
        const row = creatorGroups.get(creator.canonicalName) ?? {
            displayName: creator.canonicalName,
            ids: new Set<string>(),
            providerEligible: creator.confidence === 'HIGH'
        }
        row.ids.add(comic.comicId)
        row.providerEligible &&= creator.confidence === 'HIGH'
        creatorGroups.set(creator.canonicalName, row)
    }
    const creatorProfiles = [...creatorGroups]
        .map(
            ([creatorId, row]): FinalCreatorEvidenceV3 => ({
                creatorId,
                displayName: row.displayName,
                providerQueryLabel: row.providerEligible
                    ? row.displayName
                    : null,
                supportCount: row.ids.size,
                supportShare: row.ids.size / Math.max(1, favorites.length),
                confidence: confidence(row.ids.size),
                providerEligible: row.providerEligible,
                supportingComicIds: [...row.ids].sort()
            })
        )
        .sort(
            (a, b) =>
                b.supportCount - a.supportCount ||
                a.creatorId.localeCompare(b.creatorId)
        )

    return {
        schemaVersion: 1,
        profileVersion: FINAL_PROFILE_VERSION,
        registryVersion: registry.manifestSha256,
        favoriteFingerprint: favoriteFingerprint(favorites),
        sourceFavoriteCount: favorites.length,
        primaryInterests: evidence.filter((item) =>
            isPrimary(item.recommendationRole)
        ),
        profileOnlyInterests: evidence.filter((item) =>
            isProfileOnly(item.recommendationRole, item.retrievalUtility)
        ),
        modifierEvidence: evidence.filter((item) =>
            isModifier(item.recommendationRole)
        ),
        creatorProfiles,
        unresolvedEvidence: [...unresolved.values()]
            .map((item) => ({
                rawTag: item.rawTag,
                normalizedTag: item.normalizedTag,
                canonicalKey: item.canonicalKey,
                canonicalLabel: item.canonicalLabel,
                facet: item.facet,
                resolutionStatus: item.resolutionStatus,
                resolutionSource: item.resolutionSource,
                comicIds: [...item.comicIds].sort()
            }))
            .sort(
                (a, b) =>
                    a.normalizedTag.localeCompare(b.normalizedTag) ||
                    a.rawTag.localeCompare(b.rawTag)
            ),
        generatedAt: options.generatedAt ?? new Date().toISOString(),
        noFabricatedRecency: true,
        providerSamplePriorEffect: 0
    }
}
