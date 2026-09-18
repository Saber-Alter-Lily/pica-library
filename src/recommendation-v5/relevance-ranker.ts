import type { StoredComic } from '../library/types'
import type { ShadowRetrievedCandidateV5 } from './shadow-retrieval'
import {
    projectShadowCandidateV5
} from './candidate-hygiene'
import type {
    PreferenceWindowV5,
    buildPreferenceTimescalesV5
} from './preference-timescales'
import type { PortablePolicyStateV5 } from './portable-policy'
import {
    normalizePreferenceKey,
    preferenceAdjustmentV5
} from './portable-policy'

export const RELEVANCE_RANKER_V5_VERSION =
    'relevance-ranker-v1'

type PreferenceTimescalesV5 = ReturnType<
    typeof buildPreferenceTimescalesV5
>

export interface RelevanceFeaturesV5 {
    channelPriority: number
    routeCorroboration: number
    providerRankQuality: number
    providerPrecision: number
    exactItemEvidence: number
    lifetimeAffinity: number
    recent30Affinity: number
    recent7Affinity: number
    sessionAffinity: number
    explicitAdjustment: number
    popularity: number
}

export interface RankedShadowCandidateV5 {
    rank: number
    comic: ShadowRetrievedCandidateV5['comic']
    evidence: ShadowRetrievedCandidateV5['evidence']
    score: number
    features: RelevanceFeaturesV5
    reasons: string[]
}

function clamp(value: number, min = -1, max = 1) {
    return Math.max(min, Math.min(max, value))
}

function rounded(value: number) {
    return Math.round(value * 1_000_000) / 1_000_000
}

function dimensionScore(
    rows: Array<{
        key: string
        score: number
    }>,
    keys: Set<string>,
    maxMatches = 3
) {
    const matches = rows
        .filter((row) => keys.has(normalizePreferenceKey(row.key)))
        .map((row) => Number(row.score) || 0)
        .sort((a, b) => Math.abs(b) - Math.abs(a))
        .slice(0, maxMatches)
    return Math.tanh(matches.reduce((sum, value) => sum + value, 0))
}

function windowAffinity(
    window: PreferenceWindowV5,
    comic: StoredComic
) {
    const author = new Set([
        normalizePreferenceKey(
            comic.canonicalAuthor ?? comic.author
        )
    ])
    const tags = new Set(comic.tags.map(normalizePreferenceKey))
    const categories = new Set(
        comic.categories.map(normalizePreferenceKey)
    )
    const authorScore = dimensionScore(
        [
            ...window.positive.authors,
            ...window.negative.authors
        ],
        author,
        1
    )
    const tagScore = dimensionScore(
        [...window.positive.tags, ...window.negative.tags],
        tags,
        3
    )
    const categoryScore = dimensionScore(
        [
            ...window.positive.categories,
            ...window.negative.categories
        ],
        categories,
        2
    )
    return clamp(
        0.45 * authorScore +
            0.4 * tagScore +
            0.15 * categoryScore
    )
}

function exactItemEvidence(
    timescales: PreferenceTimescalesV5,
    comicId: string
) {
    const key = normalizePreferenceKey(comicId)
    const lookup = (window: PreferenceWindowV5) =>
        window.itemScores.find(
            (item) => normalizePreferenceKey(item.comicId) === key
        )?.score

    for (const window of [
        timescales.layers.inferred.session,
        timescales.layers.inferred.days7,
        timescales.layers.inferred.days30,
        timescales.layers.inferred.lifetime
    ]) {
        const value = lookup(window)
        if (value !== undefined && value !== 0)
            return clamp(Number(value) || 0)
    }
    return 0
}

function providerPrecision(
    candidate: ShadowRetrievedCandidateV5
) {
    const values = new Set(candidate.evidence.precisions)
    if (values.has('EXACT_CANONICAL')) return 1
    if (values.has('PROVIDER_NATIVE')) return 0.7
    if (values.has('LOCAL')) return 0.5
    if (values.has('FALLBACK_KEYWORD')) return 0.3
    return 0
}

function providerRankQuality(
    candidate: ShadowRetrievedCandidateV5
) {
    const rank = candidate.evidence.bestProviderRank
    if (!rank || rank < 1) return 0.5
    return clamp(1 / Math.sqrt(rank), 0, 1)
}

function popularity(comic: ShadowRetrievedCandidateV5['comic']) {
    const engagement =
        Math.max(0, Number(comic.totalLikes ?? 0)) +
        Math.max(0, Number(comic.totalViews ?? 0))
    const engagementScore = Math.tanh(
        Math.log1p(engagement) / 12
    )
    const rating = Number(comic.rating)
    const ratingScore = Number.isFinite(rating)
        ? clamp(rating / 5, 0, 1)
        : 0
    return clamp(
        0.75 * engagementScore + 0.25 * ratingScore,
        0,
        1
    )
}

function reasons(
    features: RelevanceFeaturesV5,
    candidate: ShadowRetrievedCandidateV5,
    explicitReasons: string[]
) {
    const out: string[] = []
    if (features.exactItemEvidence >= 0.5)
        out.push('EXACT_ITEM_POSITIVE')
    if (features.exactItemEvidence <= -0.5)
        out.push('EXACT_ITEM_NEGATIVE')
    if (features.sessionAffinity >= 0.15)
        out.push('SESSION_AFFINITY')
    if (features.sessionAffinity <= -0.15)
        out.push('SESSION_NEGATIVE_MATCH')
    if (features.recent7Affinity >= 0.15)
        out.push('RECENT_7D_AFFINITY')
    if (features.recent7Affinity <= -0.15)
        out.push('RECENT_7D_NEGATIVE_MATCH')
    if (features.recent30Affinity >= 0.15)
        out.push('RECENT_30D_AFFINITY')
    if (features.lifetimeAffinity >= 0.15)
        out.push('LIFETIME_AFFINITY')
    if (features.routeCorroboration > 0)
        out.push('MULTI_ROUTE_SUPPORT')
    if (
        candidate.evidence.precisions.includes(
            'EXACT_CANONICAL'
        )
    )
        out.push('EXACT_PROVIDER_BINDING')
    if (features.providerRankQuality >= 0.7)
        out.push('HIGH_PROVIDER_RANK')
    if (candidate.evidence.families.includes('EXPLORATION'))
        out.push('EXPLORATION_CHANNEL')
    if (candidate.evidence.families.includes('REDISCOVERY'))
        out.push('REDISCOVERY_CHANNEL')
    out.push(...explicitReasons)
    return [...new Set(out)]
}

export function rankShadowCandidatesV5(
    candidates: ShadowRetrievedCandidateV5[],
    timescales: PreferenceTimescalesV5,
    state: PortablePolicyStateV5,
    catalog: StoredComic[]
) {
    const catalogById = new Map(
        catalog.map((comic) => [
            normalizePreferenceKey(comic.comicId),
            comic
        ])
    )

    const rows = candidates.map((candidate) => {
        const projected = projectShadowCandidateV5(
            candidate.comic,
            catalogById.get(
                normalizePreferenceKey(candidate.comic.comicId)
            )
        )
        const explicit = preferenceAdjustmentV5(projected, state)
        const features: RelevanceFeaturesV5 = {
            channelPriority: clamp(
                candidate.evidence.maxPriority / 120,
                0,
                1
            ),
            routeCorroboration: clamp(
                Math.max(
                    0,
                    candidate.evidence.routeIds.length - 1
                ) / 3,
                0,
                1
            ),
            providerRankQuality:
                providerRankQuality(candidate),
            providerPrecision: providerPrecision(candidate),
            exactItemEvidence: exactItemEvidence(
                timescales,
                candidate.comic.comicId
            ),
            lifetimeAffinity: windowAffinity(
                timescales.layers.inferred.lifetime,
                projected
            ),
            recent30Affinity: windowAffinity(
                timescales.layers.inferred.days30,
                projected
            ),
            recent7Affinity: windowAffinity(
                timescales.layers.inferred.days7,
                projected
            ),
            sessionAffinity: windowAffinity(
                timescales.layers.inferred.session,
                projected
            ),
            explicitAdjustment: explicit.adjustment,
            popularity: popularity(candidate.comic)
        }

        // This is intentionally a transparent linear shadow baseline. Session
        // mode affects channel planning, not these weights, so the same
        // candidate features remain comparable across DEFAULT/RECENT/etc.
        const score =
            0.15 * features.channelPriority +
            0.05 * features.routeCorroboration +
            0.05 * features.providerRankQuality +
            0.03 * features.providerPrecision +
            0.3 * features.exactItemEvidence +
            0.1 * features.lifetimeAffinity +
            0.1 * features.recent30Affinity +
            0.12 * features.recent7Affinity +
            0.15 * features.sessionAffinity +
            0.8 * features.explicitAdjustment +
            0.03 * features.popularity

        return {
            rank: 0,
            comic: candidate.comic,
            evidence: candidate.evidence,
            score: rounded(score),
            features: Object.fromEntries(
                Object.entries(features).map(([key, value]) => [
                    key,
                    rounded(value)
                ])
            ) as unknown as RelevanceFeaturesV5,
            reasons: reasons(
                features,
                candidate,
                explicit.reasons
            )
        } satisfies RankedShadowCandidateV5
    })

    rows.sort(
        (a, b) =>
            b.score - a.score ||
            b.features.exactItemEvidence -
                a.features.exactItemEvidence ||
            b.evidence.routeIds.length -
                a.evidence.routeIds.length ||
            a.comic.comicId.localeCompare(b.comic.comicId)
    )
    rows.forEach((row, index) => {
        row.rank = index + 1
    })

    const featureMeans = Object.fromEntries(
        (
            [
                'channelPriority',
                'routeCorroboration',
                'providerRankQuality',
                'providerPrecision',
                'exactItemEvidence',
                'lifetimeAffinity',
                'recent30Affinity',
                'recent7Affinity',
                'sessionAffinity',
                'explicitAdjustment',
                'popularity'
            ] as Array<keyof RelevanceFeaturesV5>
        ).map((key) => [
            key,
            rounded(
                rows.length
                    ? rows.reduce(
                          (sum, row) =>
                              sum + row.features[key],
                          0
                      ) / rows.length
                    : 0
            )
        ])
    )

    return {
        mode: 'SHADOW' as const,
        rankerVersion: RELEVANCE_RANKER_V5_VERSION,
        servingImpact: false,
        learningToRank: false,
        visualFeatureEnabled: false,
        scoreSemantics: 'EXPLAINABLE_LINEAR_BASELINE' as const,
        candidateCount: rows.length,
        rows,
        telemetry: {
            topScore: rows[0]?.score ?? null,
            bottomScore: rows.at(-1)?.score ?? null,
            featureMeans,
            negativeExactItemCount: rows.filter(
                (row) => row.features.exactItemEvidence < 0
            ).length,
            multiRouteCandidateCount: rows.filter(
                (row) => row.evidence.routeIds.length > 1
            ).length,
            exactCanonicalCandidateCount: rows.filter(
                (row) =>
                    row.evidence.precisions.includes(
                        'EXACT_CANONICAL'
                    )
            ).length
        }
    }
}
