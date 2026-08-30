import { randomUUID } from 'node:crypto'
import type { StoredComic } from '../library/types'
import {
    buildFinalLifetimeProfileV3,
    type FinalInterestEvidenceV3,
    type FinalLifetimeProfileV3,
    type FinalProfileBuildOptions
} from './final-profile'

export const TASTE_CHRONICLE_SNAPSHOT_VERSION = 2

const MAX_THEMES = 10
const MAX_FANDOM_THEMES = 3
const MAX_COMBINATION_THEMES = 5
const MAX_SINGLE_THEMES = 2
const MAX_FACET_INTERESTS = 8
const MIN_THEME_SUPPORT = 5
const MIN_COMBINATION_SUPPORT = 5
const MIN_COMBINATION_LIFT = 1.5

const THEME_FACETS = new Set([
    'FANDOM_IP',
    'RELATIONSHIP',
    'SEXUAL_BEHAVIOR',
    'CONTROL_COERCION',
    'FETISH_TROPE',
    'PHYSIOLOGY_STATE',
    'BODY_ATTRIBUTE',
    'APPEARANCE_TRAIT',
    'APPEARANCE_OUTFIT',
    'SPECIES_FANTASY',
    'STORY_TROPE',
    'GENRE_THEME',
    'SETTING_LOCATION',
    'IDENTITY_ROLE'
])

const SINGLE_THEME_FACETS = new Set([
    'RELATIONSHIP',
    'CONTROL_COERCION',
    'FETISH_TROPE',
    'APPEARANCE_TRAIT',
    'APPEARANCE_OUTFIT',
    'SPECIES_FANTASY',
    'STORY_TROPE',
    'GENRE_THEME',
    'SETTING_LOCATION',
    'IDENTITY_ROLE'
])

const EXCLUDED_DISPLAY_FACETS = new Set([
    'PUBLICATION_EVENT',
    'PUBLICATION_SOURCE',
    'LANGUAGE_EDITION',
    'META_ADMIN',
    'AGE_CODED_CHARACTER',
    'CREATOR_ENTITY',
    'UNKNOWN'
])

export type AtlasThemeType =
    | 'FANDOM'
    | 'SEMANTIC_COMBINATION'
    | 'SEMANTIC_SINGLE'

export interface AtlasInterest {
    canonicalKey: string
    label: string
    facet: string
    supportCount: number
    supportShare: number
    facetConditionalShare: number
    recommendationRole: string
    retrievalUtility: string
}

export interface AtlasTheme {
    themeId: string
    type: AtlasThemeType
    family: string
    displayName: string
    anchors: Array<{
        canonicalKey: string
        label: string
        facet: string
    }>
    supportCount: number
    supportShare: number
    lift: number | null
    itemIds: string[]
    representativeWorks: Array<{
        comicId: string
        title: string
        coverUrl?: string
    }>
}

export interface AtlasThemeEdge {
    sourceThemeId: string
    targetThemeId: string
    overlapCount: number
    jaccard: number
}

export interface AtlasFacetBand {
    facet: string
    comicCount: number
    interests: AtlasInterest[]
}

export interface StaticPreference {
    value: string
    supportCount: number
    supportShare: number
}

export interface AtlasCombination {
    tags: string[]
    facets: string[]
    canonicalKeys: string[]
    supportCount: number
    supportShare: number
    lift: number
}

export interface HistoricalTasteSnapshot {
    snapshotVersion: number
    snapshotId: string
    generatedAt: string
    favoriteCount: number
    hasFavoriteTimestamp: false
    historicalOrderUsedForPreference: false
    dataQuality: {
        level: 'LOW' | 'MEDIUM' | 'HIGH'
        semanticCoverage: number
    }
    globalStats: {
        authors: number
        circles: number
        rawTags: number
        canonicalInterests: number
        fandoms: number
        finishedRatio: number
    }
    facetBands: AtlasFacetBand[]
    themes: AtlasTheme[]
    themeEdges: AtlasThemeEdge[]
    authorPreferences: StaticPreference[]
    circlePreferences: StaticPreference[]
    fandomPreferences: AtlasInterest[]
    combinations: AtlasCombination[]
    collectionStyle: Array<{
        key: string
        label: string
        level: '低' | '中' | '较高' | '高'
        description: string
    }>
    reportNarratives: {
        summary: string
        privacy: string
    }
    recommendationModelNotes: {
        sharedRegistrySemantics: true
        historicalOrdinalUsedForPreference: false
        atlasFeedsRecommendation: false
        pairRanking: false
        tripleRanking: false
    }
}

export type TasteChronicleBuildOptions = FinalProfileBuildOptions

/**
 * Kept only for compatibility with older imports. Atlas V2 does not use
 * historical favorite order as preference evidence.
 */
export function buildFavoriteOrdinalEntries(ids: string[], pageSize = 20) {
    const unique = [...new Set(ids)]
    return unique.map((comicId, index) => ({
        comicId,
        ordinalRank: index + 1,
        normalizedRank: index / Math.max(1, unique.length - 1),
        sourcePage: Math.floor(index / Math.max(1, pageSize)) + 1,
        positionInPage: (index % Math.max(1, pageSize)) + 1
    }))
}

/** @deprecated Atlas V2 does not apply ordinal decay. */
export function ordinalWeight() {
    return 1
}

function setIntersection(left: string[], right: string[]) {
    const rightSet = new Set(right)
    return left.filter((value) => rightSet.has(value))
}

function staticPreference(
    favorites: StoredComic[],
    select: (comic: StoredComic) => string | null | undefined,
    limit = 12
): StaticPreference[] {
    const counts = new Map<string, number>()
    for (const comic of favorites) {
        const value = String(select(comic) ?? '').trim()
        if (!value) continue
        counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return [...counts]
        .map(([value, supportCount]) => ({
            value,
            supportCount,
            supportShare: supportCount / Math.max(1, favorites.length)
        }))
        .sort(
            (a, b) =>
                b.supportCount - a.supportCount ||
                a.value.localeCompare(b.value)
        )
        .slice(0, limit)
}

function atlasInterest(item: FinalInterestEvidenceV3): AtlasInterest {
    return {
        canonicalKey: item.canonicalKey,
        label: item.canonicalLabel,
        facet: item.facet,
        supportCount: item.supportCount,
        supportShare: item.supportShare,
        facetConditionalShare: item.facetConditionalShare,
        recommendationRole: item.recommendationRole,
        retrievalUtility: item.retrievalUtility
    }
}

function semanticProfileInterests(profile: FinalLifetimeProfileV3) {
    return [
        ...profile.primaryInterests,
        ...profile.profileOnlyInterests
    ].filter(
        (item) =>
            item.facet &&
            !EXCLUDED_DISPLAY_FACETS.has(item.facet) &&
            item.supportCount > 0
    )
}

function buildFacetBands(profile: FinalLifetimeProfileV3): AtlasFacetBand[] {
    const grouped = new Map<string, FinalInterestEvidenceV3[]>()
    for (const item of semanticProfileInterests(profile)) {
        const values = grouped.get(item.facet) ?? []
        values.push(item)
        grouped.set(item.facet, values)
    }
    return [...grouped]
        .map(([facet, items]) => ({
            facet,
            comicCount: Math.max(
                ...items.map((item) => item.facetComicCount),
                0
            ),
            interests: items
                .sort(
                    (a, b) =>
                        b.supportCount - a.supportCount ||
                        b.facetConditionalShare - a.facetConditionalShare ||
                        a.canonicalKey.localeCompare(b.canonicalKey)
                )
                .slice(0, MAX_FACET_INTERESTS)
                .map(atlasInterest)
        }))
        .sort(
            (a, b) =>
                b.comicCount - a.comicCount || a.facet.localeCompare(b.facet)
        )
}

function buildCombinations(
    profile: FinalLifetimeProfileV3
): AtlasCombination[] {
    const interests = profile.primaryInterests.filter(
        (item) =>
            THEME_FACETS.has(item.facet) &&
            item.facet !== 'FANDOM_IP' &&
            item.supportCount >= MIN_COMBINATION_SUPPORT
    )
    const combinations: AtlasCombination[] = []
    for (let left = 0; left < interests.length; left++) {
        for (let right = left + 1; right < interests.length; right++) {
            const a = interests[left]
            const b = interests[right]
            if (a.facet === b.facet) continue
            const itemIds = setIntersection(
                a.supportingComicIds,
                b.supportingComicIds
            )
            if (itemIds.length < MIN_COMBINATION_SUPPORT) continue
            const expected =
                (a.supportCount * b.supportCount) /
                Math.max(1, profile.sourceFavoriteCount)
            const lift = itemIds.length / Math.max(expected, Number.EPSILON)
            if (lift < MIN_COMBINATION_LIFT) continue
            const ordered = [a, b].sort(
                (x, y) =>
                    x.facet.localeCompare(y.facet) ||
                    x.canonicalKey.localeCompare(y.canonicalKey)
            )
            combinations.push({
                tags: ordered.map((item) => item.canonicalLabel),
                facets: ordered.map((item) => item.facet),
                canonicalKeys: ordered.map((item) => item.canonicalKey),
                supportCount: itemIds.length,
                supportShare:
                    itemIds.length / Math.max(1, profile.sourceFavoriteCount),
                lift
            })
        }
    }
    return combinations.sort(
        (a, b) =>
            b.supportCount - a.supportCount ||
            b.lift - a.lift ||
            a.canonicalKeys.join('|').localeCompare(b.canonicalKeys.join('|'))
    )
}

function representativeWorks(
    itemIds: string[],
    byId: Map<string, StoredComic>,
    limit = 4
) {
    return itemIds
        .flatMap((comicId) => {
            const comic = byId.get(comicId)
            return comic ? [comic] : []
        })
        .sort(
            (a, b) =>
                Number(b.totalLikes ?? 0) - Number(a.totalLikes ?? 0) ||
                Number(b.totalViews ?? 0) - Number(a.totalViews ?? 0) ||
                a.comicId.localeCompare(b.comicId)
        )
        .slice(0, limit)
        .map((comic) => ({
            comicId: comic.comicId,
            title: comic.title,
            coverUrl: comic.coverUrl
        }))
}

function buildThemes(
    profile: FinalLifetimeProfileV3,
    combinations: AtlasCombination[],
    byId: Map<string, StoredComic>
): AtlasTheme[] {
    const fandoms = profile.primaryInterests
        .filter(
            (item) =>
                item.facet === 'FANDOM_IP' &&
                item.supportCount >= MIN_THEME_SUPPORT
        )
        .sort(
            (a, b) =>
                b.supportCount - a.supportCount ||
                a.canonicalKey.localeCompare(b.canonicalKey)
        )
        .slice(0, MAX_FANDOM_THEMES)
        .map(
            (item): AtlasTheme => ({
                themeId: `FANDOM:${item.canonicalKey}`,
                type: 'FANDOM',
                family: 'FANDOM',
                displayName: item.canonicalLabel,
                anchors: [
                    {
                        canonicalKey: item.canonicalKey,
                        label: item.canonicalLabel,
                        facet: item.facet
                    }
                ],
                supportCount: item.supportCount,
                supportShare: item.supportShare,
                lift: null,
                itemIds: [...item.supportingComicIds],
                representativeWorks: representativeWorks(
                    item.supportingComicIds,
                    byId
                )
            })
        )

    const interestByIdentity = new Map(
        profile.primaryInterests.map((item) => [
            `${item.facet}\u0000${item.canonicalKey}`,
            item
        ])
    )
    const semanticCombinations = combinations
        .slice(0, MAX_COMBINATION_THEMES)
        .flatMap((combination): AtlasTheme[] => {
            const anchors = combination.canonicalKeys.flatMap(
                (canonicalKey, index) => {
                    const facet = combination.facets[index]
                    const item = interestByIdentity.get(
                        `${facet}\u0000${canonicalKey}`
                    )
                    return item ? [item] : []
                }
            )
            if (anchors.length !== 2) return []
            const itemIds = setIntersection(
                anchors[0].supportingComicIds,
                anchors[1].supportingComicIds
            ).sort()
            const orderedAnchors = anchors
                .slice()
                .sort(
                    (a, b) =>
                        a.facet.localeCompare(b.facet) ||
                        a.canonicalKey.localeCompare(b.canonicalKey)
                )
            return [
                {
                    themeId: `SEMCONJ:${orderedAnchors
                        .map((item) => `${item.facet}/${item.canonicalKey}`)
                        .join('|')}`,
                    type: 'SEMANTIC_COMBINATION',
                    family: 'SEMANTIC',
                    displayName: orderedAnchors
                        .map((item) => item.canonicalLabel)
                        .join(' × '),
                    anchors: orderedAnchors.map((item) => ({
                        canonicalKey: item.canonicalKey,
                        label: item.canonicalLabel,
                        facet: item.facet
                    })),
                    supportCount: itemIds.length,
                    supportShare:
                        itemIds.length /
                        Math.max(1, profile.sourceFavoriteCount),
                    lift: combination.lift,
                    itemIds,
                    representativeWorks: representativeWorks(itemIds, byId)
                }
            ]
        })

    const usedKeys = new Set(
        [...fandoms, ...semanticCombinations].flatMap((theme) =>
            theme.anchors.map(
                (anchor) => `${anchor.facet}\u0000${anchor.canonicalKey}`
            )
        )
    )
    const singles = profile.primaryInterests
        .filter(
            (item) =>
                SINGLE_THEME_FACETS.has(item.facet) &&
                item.supportCount >= MIN_THEME_SUPPORT &&
                item.retrievalUtility !== 'BROAD_RECALL' &&
                !usedKeys.has(`${item.facet}\u0000${item.canonicalKey}`)
        )
        .sort(
            (a, b) =>
                b.supportCount - a.supportCount ||
                b.facetConditionalShare - a.facetConditionalShare ||
                a.canonicalKey.localeCompare(b.canonicalKey)
        )
        .slice(0, MAX_SINGLE_THEMES)
        .map(
            (item): AtlasTheme => ({
                themeId: `SEMANTIC:${item.facet}/${item.canonicalKey}`,
                type: 'SEMANTIC_SINGLE',
                family: 'SEMANTIC',
                displayName: item.canonicalLabel,
                anchors: [
                    {
                        canonicalKey: item.canonicalKey,
                        label: item.canonicalLabel,
                        facet: item.facet
                    }
                ],
                supportCount: item.supportCount,
                supportShare: item.supportShare,
                lift: null,
                itemIds: [...item.supportingComicIds],
                representativeWorks: representativeWorks(
                    item.supportingComicIds,
                    byId
                )
            })
        )

    return [...fandoms, ...semanticCombinations, ...singles].slice(
        0,
        MAX_THEMES
    )
}

function buildThemeEdges(themes: AtlasTheme[]): AtlasThemeEdge[] {
    const edges: AtlasThemeEdge[] = []
    for (let left = 0; left < themes.length; left++) {
        for (let right = left + 1; right < themes.length; right++) {
            const a = themes[left]
            const b = themes[right]
            const overlapCount = setIntersection(a.itemIds, b.itemIds).length
            if (!overlapCount) continue
            const union = new Set([...a.itemIds, ...b.itemIds]).size
            const jaccard = overlapCount / Math.max(1, union)
            if (jaccard < 0.08 && overlapCount < 5) continue
            edges.push({
                sourceThemeId: a.themeId,
                targetThemeId: b.themeId,
                overlapCount,
                jaccard
            })
        }
    }
    return edges
        .sort(
            (a, b) =>
                b.jaccard - a.jaccard ||
                b.overlapCount - a.overlapCount ||
                `${a.sourceThemeId}|${a.targetThemeId}`.localeCompare(
                    `${b.sourceThemeId}|${b.targetThemeId}`
                )
        )
        .slice(0, 18)
}

function levelByCount(value: number, thresholds: [number, number, number]) {
    if (value >= thresholds[2]) return '高' as const
    if (value >= thresholds[1]) return '较高' as const
    if (value >= thresholds[0]) return '中' as const
    return '低' as const
}

function collectionStyle(
    profile: FinalLifetimeProfileV3,
    themes: AtlasTheme[],
    combinations: AtlasCombination[]
): HistoricalTasteSnapshot['collectionStyle'] {
    const topCreatorShare = profile.creatorProfiles[0]?.supportShare ?? 0
    const topFandom = profile.primaryInterests
        .filter((item) => item.facet === 'FANDOM_IP')
        .sort((a, b) => b.facetConditionalShare - a.facetConditionalShare)[0]
    const longTailCount = profile.primaryInterests.filter(
        (item) => item.supportCount >= 3 && item.supportShare < 0.03
    ).length
    return [
        {
            key: 'multi-interest',
            label: '多兴趣收藏',
            level: levelByCount(themes.length, [3, 5, 8]),
            description: '多个语义方向都有稳定收藏证据。'
        },
        {
            key: 'long-tail',
            label: '长尾探索',
            level: levelByCount(longTailCount, [8, 16, 28]),
            description: '头部偏好之外仍保留不少规模较小的兴趣。'
        },
        {
            key: 'author-dispersion',
            label: '作者分散度',
            level:
                topCreatorShare < 0.03
                    ? '高'
                    : topCreatorShare < 0.06
                      ? '较高'
                      : topCreatorShare < 0.1
                        ? '中'
                        : '低',
            description: '数值越高，收藏越不集中在少数作者。'
        },
        {
            key: 'fandom-concentration',
            label: 'IP 集中度',
            level:
                (topFandom?.facetConditionalShare ?? 0) >= 0.25
                    ? '高'
                    : (topFandom?.facetConditionalShare ?? 0) >= 0.12
                      ? '较高'
                      : (topFandom?.facetConditionalShare ?? 0) >= 0.05
                        ? '中'
                        : '低',
            description: '反映收藏是否集中在少数明确作品系列。'
        },
        {
            key: 'semantic-cooccurrence',
            label: '元素组合度',
            level: levelByCount(combinations.length, [3, 8, 16]),
            description: '部分不同语义维度会反复共同出现在收藏中。'
        }
    ]
}

export function generateTasteNarratives(
    snapshot: Pick<HistoricalTasteSnapshot, 'favoriteCount' | 'themes'>
) {
    return {
        summary: `基于 ${snapshot.favoriteCount.toLocaleString('zh-CN')} 本收藏，整理出 ${snapshot.themes.length} 个较清晰的语义主题。`,
        privacy: '全部分析在本地完成；历史收藏顺序不会被当作真实近期偏好。'
    }
}

export function buildHistoricalTasteSnapshot(
    records: StoredComic[],
    _orderIds: string[] = [],
    generatedAt = new Date().toISOString(),
    options: TasteChronicleBuildOptions = {}
): HistoricalTasteSnapshot {
    void _orderIds
    const favorites = [
        ...new Map(
            records
                .filter((comic) => comic.isFavorite)
                .map((comic) => [comic.comicId, comic])
        ).values()
    ]
    const profile = buildFinalLifetimeProfileV3(records, {
        ...options,
        generatedAt
    })
    const byId = new Map(records.map((comic) => [comic.comicId, comic]))
    const combinations = buildCombinations(profile)
    const themes = buildThemes(profile, combinations, byId)
    const resolvedComicIds = new Set(
        [...profile.primaryInterests, ...profile.profileOnlyInterests].flatMap(
            (item) => item.supportingComicIds
        )
    )
    const base: HistoricalTasteSnapshot = {
        snapshotVersion: TASTE_CHRONICLE_SNAPSHOT_VERSION,
        snapshotId: randomUUID(),
        generatedAt,
        favoriteCount: favorites.length,
        hasFavoriteTimestamp: false,
        historicalOrderUsedForPreference: false,
        dataQuality: {
            level:
                favorites.length >= 100 &&
                resolvedComicIds.size / Math.max(1, favorites.length) >= 0.8
                    ? 'HIGH'
                    : favorites.length >= 20
                      ? 'MEDIUM'
                      : 'LOW',
            semanticCoverage:
                resolvedComicIds.size / Math.max(1, favorites.length)
        },
        globalStats: {
            authors: new Set(
                favorites
                    .map((comic) => comic.canonicalAuthor ?? comic.author)
                    .filter(Boolean)
            ).size,
            circles: new Set(
                favorites.map((comic) => comic.circle).filter(Boolean)
            ).size,
            rawTags: new Set(favorites.flatMap((comic) => comic.tags)).size,
            canonicalInterests: new Set(
                [
                    ...profile.primaryInterests,
                    ...profile.profileOnlyInterests
                ].map((item) => `${item.facet}\u0000${item.canonicalKey}`)
            ).size,
            fandoms: profile.primaryInterests.filter(
                (item) => item.facet === 'FANDOM_IP'
            ).length,
            finishedRatio:
                favorites.filter((comic) => comic.finished).length /
                Math.max(1, favorites.length)
        },
        facetBands: buildFacetBands(profile),
        themes,
        themeEdges: buildThemeEdges(themes),
        authorPreferences: profile.creatorProfiles.slice(0, 12).map((item) => ({
            value: item.displayName,
            supportCount: item.supportCount,
            supportShare: item.supportShare
        })),
        circlePreferences: staticPreference(
            favorites,
            (comic) => comic.circle,
            12
        ),
        fandomPreferences: profile.primaryInterests
            .filter((item) => item.facet === 'FANDOM_IP')
            .sort(
                (a, b) =>
                    b.supportCount - a.supportCount ||
                    a.canonicalKey.localeCompare(b.canonicalKey)
            )
            .slice(0, 12)
            .map(atlasInterest),
        combinations: combinations.slice(0, 12),
        collectionStyle: collectionStyle(profile, themes, combinations),
        reportNarratives: {
            summary: '',
            privacy: ''
        },
        recommendationModelNotes: {
            sharedRegistrySemantics: true,
            historicalOrdinalUsedForPreference: false,
            atlasFeedsRecommendation: false,
            pairRanking: false,
            tripleRanking: false
        }
    }
    base.reportNarratives = generateTasteNarratives(base)
    return base
}
