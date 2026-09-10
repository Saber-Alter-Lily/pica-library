import type { StoredComic } from '../library/types'
import type {
    EvidenceConfidence,
    FinalInterestEvidenceV3,
    FinalLifetimeProfileV3
} from './final-profile'

export const INTENT_PLANNER_VERSION = '3.1.0-deterministic'
export const INTENT_CONFIG = {
    conjunctionMinCoSupport: 5,
    conjunctionMinLift: 1.5,
    maxIntents: 12,
    initialRouteCostTarget: 14,
    recentCycleWindow: 5,
    maxRelated: 1
} as const

export type IntentTypeV3 =
    | 'FANDOM'
    | 'CREATOR'
    | 'SEMANTIC_ANCHOR'
    | 'SEMANTIC_CONJUNCTION'
    | 'EXPLORATION'
    | 'RELATED'

export interface IntentAnchorV3 {
    canonicalKey: string
    canonicalLabel: string
    facet: string
    providerQueryLabel: string | null
    recommendationEligible: boolean
    retrievalUtility: string
}

export interface RecommendationIntentV3 {
    intentId: string
    type: IntentTypeV3
    anchors: IntentAnchorV3[]
    sourceLayer: 'LIFETIME'
    evidence: {
        supportCount: number
        supportShare: number
        coSupportCount?: number
        lift?: number
        confidence: EvidenceConfidence
    }
    retrieval: {
        providerEligible: boolean
        utilityTier: string
        estimatedRouteCost: number
    }
    planning: {
        familyRank: number
        recentUseCount: number
        lastUsedAt: string | null
        exploration: boolean
    }
    explanation: { reasonCode: string; shortReason: string }
}

export interface IntentCycleHistory {
    state:
        | 'READY'
        | 'READY_DEGRADED'
        | 'READY_LIMITED'
        | 'ACTIVE'
        | 'EXHAUSTED'
        | 'SUPERSEDED'
    completedAt: string
    intentIds: string[]
}

const confidenceRank: Record<EvidenceConfidence, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2
}
const utilityRank = (value: string) => {
    const order = [
        'HIGH_PRECISION_ANCHOR',
        'CONJUNCTION_ANCHOR',
        'STANDARD',
        'BROAD_RECALL',
        'PROFILE_ONLY'
    ]
    const found = order.indexOf(value)
    return found < 0 ? order.length : found
}
const highUtility = (value: string) =>
    value === 'HIGH_PRECISION_ANCHOR' || value === 'CONJUNCTION_ANCHOR'

function scheduleStats(intentId: string, history: IntentCycleHistory[]) {
    const latest = [...history]
        .filter(
            (item) => item.state === 'EXHAUSTED' || item.state === 'SUPERSEDED'
        )
        .sort(
            (a, b) =>
                b.completedAt.localeCompare(a.completedAt) ||
                a.intentIds.join('|').localeCompare(b.intentIds.join('|'))
        )
        .slice(0, INTENT_CONFIG.recentCycleWindow)
    const used = latest.filter((item) => item.intentIds.includes(intentId))
    return {
        recentUseCount: used.length,
        lastUsedAt:
            used
                .map((item) => item.completedAt)
                .sort()
                .at(-1) ?? null
    }
}

const anchor = (item: FinalInterestEvidenceV3): IntentAnchorV3 => ({
    canonicalKey: item.canonicalKey,
    canonicalLabel: item.canonicalLabel,
    facet: item.facet,
    providerQueryLabel:
        item.recommendationEligible && item.retrievalUtility !== 'PROFILE_ONLY'
            ? item.providerObservedLabels[0]?.label ?? null
            : null,
    recommendationEligible: item.recommendationEligible,
    retrievalUtility: item.retrievalUtility
})

function finish(
    intent: Omit<RecommendationIntentV3, 'planning'>,
    history: IntentCycleHistory[]
): RecommendationIntentV3 {
    return {
        ...intent,
        planning: {
            familyRank: 0,
            ...scheduleStats(intent.intentId, history),
            exploration: intent.type === 'EXPLORATION'
        }
    }
}

const scheduleCompare = (
    a: RecommendationIntentV3,
    b: RecommendationIntentV3
) =>
    a.planning.recentUseCount - b.planning.recentUseCount ||
    Number(a.planning.lastUsedAt !== null) -
        Number(b.planning.lastUsedAt !== null) ||
    (a.planning.lastUsedAt ?? '').localeCompare(b.planning.lastUsedAt ?? '') ||
    a.intentId.localeCompare(b.intentId)

export function buildRecommendationIntentsV3(input: {
    profile: FinalLifetimeProfileV3
    favorites: StoredComic[]
    history?: IntentCycleHistory[]
}) {
    const history = input.history ?? []
    const total = Math.max(1, input.profile.sourceFavoriteCount)
    const eligible = input.profile.primaryInterests.filter(
        (item) => item.recommendationEligible
    )
    const families = new Map<IntentTypeV3, RecommendationIntentV3[]>()
    const put = (intent: RecommendationIntentV3) =>
        families.set(intent.type, [
            ...(families.get(intent.type) ?? []),
            intent
        ])

    for (const item of eligible.filter(
        (value) => value.facet === 'FANDOM_IP'
    )) {
        const id = `FANDOM:${item.canonicalKey}`
        put(
            finish(
                {
                    intentId: id,
                    type: 'FANDOM',
                    anchors: [anchor(item)],
                    sourceLayer: 'LIFETIME',
                    evidence: {
                        supportCount: item.supportCount,
                        supportShare: item.supportShare,
                        confidence: item.confidence
                    },
                    retrieval: {
                        providerEligible: Boolean(
                            anchor(item).providerQueryLabel
                        ),
                        utilityTier: item.retrievalUtility,
                        estimatedRouteCost: 1
                    },
                    explanation: {
                        reasonCode: 'FANDOM_MATCH',
                        shortReason: `常收藏题材：${item.canonicalLabel}`
                    }
                },
                history
            )
        )
    }
    for (const creator of input.profile.creatorProfiles.filter(
        (item) => item.providerEligible && item.providerQueryLabel
    )) {
        const id = `CREATOR:${creator.creatorId}`
        put(
            finish(
                {
                    intentId: id,
                    type: 'CREATOR',
                    anchors: [
                        {
                            canonicalKey: creator.creatorId,
                            canonicalLabel: creator.displayName,
                            facet: 'CREATOR_ENTITY',
                            providerQueryLabel: creator.providerQueryLabel,
                            recommendationEligible: true,
                            retrievalUtility: 'HIGH_PRECISION_ANCHOR'
                        }
                    ],
                    sourceLayer: 'LIFETIME',
                    evidence: {
                        supportCount: creator.supportCount,
                        supportShare: creator.supportShare,
                        confidence: creator.confidence
                    },
                    retrieval: {
                        providerEligible: true,
                        utilityTier: 'HIGH_PRECISION_ANCHOR',
                        estimatedRouteCost: 1
                    },
                    explanation: {
                        reasonCode: 'CREATOR_REPEAT',
                        shortReason: `常收藏作者：${creator.displayName}`
                    }
                },
                history
            )
        )
    }

    const semantic = eligible.filter(
        (item) =>
            item.facet !== 'FANDOM_IP' &&
            item.retrievalUtility !== 'BROAD_RECALL'
    )
    for (let left = 0; left < semantic.length; left++)
        for (let right = left + 1; right < semantic.length; right++) {
            const a = semantic[left]
            const b = semantic[right]
            if (a.facet === b.facet) continue
            if (
                !highUtility(a.retrievalUtility) &&
                !highUtility(b.retrievalUtility)
            )
                continue
            const aIds = new Set(a.supportingComicIds)
            const coSupport = b.supportingComicIds.filter((id) =>
                aIds.has(id)
            ).length
            const expected = (a.supportCount * b.supportCount) / total
            const lift = expected > 0 ? coSupport / expected : 0
            if (
                coSupport < INTENT_CONFIG.conjunctionMinCoSupport ||
                lift < INTENT_CONFIG.conjunctionMinLift
            )
                continue
            const anchors = [anchor(a), anchor(b)].sort(
                (x, y) =>
                    x.facet.localeCompare(y.facet) ||
                    x.canonicalKey.localeCompare(y.canonicalKey)
            )
            const id = `SEMCONJ:${anchors.map((x) => `${x.facet}/${x.canonicalKey}`).join('|')}`
            put(
                finish(
                    {
                        intentId: id,
                        type: 'SEMANTIC_CONJUNCTION',
                        anchors,
                        sourceLayer: 'LIFETIME',
                        evidence: {
                            supportCount: coSupport,
                            supportShare: coSupport / total,
                            coSupportCount: coSupport,
                            lift,
                            confidence:
                                confidenceRank[a.confidence] >
                                confidenceRank[b.confidence]
                                    ? a.confidence
                                    : b.confidence
                        },
                        retrieval: {
                            providerEligible: anchors.every((x) =>
                                Boolean(x.providerQueryLabel)
                            ),
                            utilityTier: highUtility(a.retrievalUtility)
                                ? a.retrievalUtility
                                : b.retrievalUtility,
                            estimatedRouteCost: 2
                        },
                        explanation: {
                            reasonCode: 'SEMANTIC_CONJUNCTION',
                            shortReason: `${a.canonicalLabel} × ${b.canonicalLabel}`
                        }
                    },
                    history
                )
            )
        }

    for (const item of semantic.filter((value) =>
        highUtility(value.retrievalUtility)
    )) {
        const id = `SEMANTIC_ANCHOR:${item.facet}/${item.canonicalKey}`
        put(
            finish(
                {
                    intentId: id,
                    type: 'SEMANTIC_ANCHOR',
                    anchors: [anchor(item)],
                    sourceLayer: 'LIFETIME',
                    evidence: {
                        supportCount: item.supportCount,
                        supportShare: item.supportShare,
                        confidence: item.confidence
                    },
                    retrieval: {
                        providerEligible: Boolean(
                            anchor(item).providerQueryLabel
                        ),
                        utilityTier: item.retrievalUtility,
                        estimatedRouteCost: 1
                    },
                    explanation: {
                        reasonCode: 'MULTI_ROUTE_SUPPORT',
                        shortReason: `语义兴趣：${item.canonicalLabel}`
                    }
                },
                history
            )
        )
    }
    for (const item of [...eligible]
        .filter((value) => value.facet !== 'FANDOM_IP')
        .sort(
            (a, b) =>
                a.supportCount - b.supportCount ||
                a.canonicalKey.localeCompare(b.canonicalKey)
        )) {
        const id = `EXPLORATION:${item.facet}/${item.canonicalKey}`
        put(
            finish(
                {
                    intentId: id,
                    type: 'EXPLORATION',
                    anchors: [anchor(item)],
                    sourceLayer: 'LIFETIME',
                    evidence: {
                        supportCount: item.supportCount,
                        supportShare: item.supportShare,
                        confidence: item.confidence
                    },
                    retrieval: {
                        providerEligible: Boolean(
                            anchor(item).providerQueryLabel
                        ),
                        utilityTier: item.retrievalUtility,
                        estimatedRouteCost: 1
                    },
                    explanation: {
                        reasonCode: 'PROFILE_TAIL_EXPLORATION',
                        shortReason: `探索较少使用的兴趣：${item.canonicalLabel}`
                    }
                },
                history
            )
        )
    }
    const favoriteSeed = [...input.favorites]
        .filter((comic) => comic.isFavorite)
        .sort((a, b) => a.comicId.localeCompare(b.comicId))[0]
    if (favoriteSeed) {
        const id = `RELATED:${favoriteSeed.comicId}`
        put(
            finish(
                {
                    intentId: id,
                    type: 'RELATED',
                    anchors: [
                        {
                            canonicalKey: favoriteSeed.comicId,
                            canonicalLabel: favoriteSeed.title,
                            facet: 'ITEM',
                            providerQueryLabel: null,
                            recommendationEligible: true,
                            retrievalUtility: 'AUXILIARY'
                        }
                    ],
                    sourceLayer: 'LIFETIME',
                    evidence: {
                        supportCount: 1,
                        supportShare: 1 / total,
                        confidence: 'LOW'
                    },
                    retrieval: {
                        providerEligible: true,
                        utilityTier: 'AUXILIARY',
                        estimatedRouteCost: 1
                    },
                    explanation: {
                        reasonCode: 'RELATED_AUX',
                        shortReason: '基于一部收藏的辅助关联'
                    }
                },
                history
            )
        )
    }

    const compareByType: Record<
        IntentTypeV3,
        (a: RecommendationIntentV3, b: RecommendationIntentV3) => number
    > = {
        FANDOM: (a, b) =>
            utilityRank(a.retrieval.utilityTier) -
                utilityRank(b.retrieval.utilityTier) ||
            b.evidence.supportCount - a.evidence.supportCount ||
            b.evidence.supportShare - a.evidence.supportShare ||
            confidenceRank[a.evidence.confidence] -
                confidenceRank[b.evidence.confidence] ||
            scheduleCompare(a, b),
        CREATOR: (a, b) =>
            confidenceRank[a.evidence.confidence] -
                confidenceRank[b.evidence.confidence] ||
            b.evidence.supportCount - a.evidence.supportCount ||
            b.evidence.supportShare - a.evidence.supportShare ||
            scheduleCompare(a, b),
        SEMANTIC_CONJUNCTION: (a, b) =>
            (b.evidence.coSupportCount ?? 0) -
                (a.evidence.coSupportCount ?? 0) ||
            (b.evidence.lift ?? 0) - (a.evidence.lift ?? 0) ||
            utilityRank(a.retrieval.utilityTier) -
                utilityRank(b.retrieval.utilityTier) ||
            scheduleCompare(a, b),
        SEMANTIC_ANCHOR: (a, b) =>
            utilityRank(a.retrieval.utilityTier) -
                utilityRank(b.retrieval.utilityTier) ||
            b.evidence.supportCount - a.evidence.supportCount ||
            scheduleCompare(a, b),
        EXPLORATION: scheduleCompare,
        RELATED: scheduleCompare
    }
    for (const [type, values] of families)
        families.set(
            type,
            values
                .filter((intent) => intent.retrieval.providerEligible)
                .sort(compareByType[type])
        )

    const targets: Record<IntentTypeV3, number> = {
        FANDOM: 3,
        CREATOR: 3,
        SEMANTIC_CONJUNCTION: 3,
        SEMANTIC_ANCHOR: 1,
        EXPLORATION: 1,
        RELATED: 1
    }
    const order: IntentTypeV3[] = [
        'FANDOM',
        'CREATOR',
        'SEMANTIC_CONJUNCTION',
        'SEMANTIC_ANCHOR',
        'EXPLORATION',
        'RELATED'
    ]
    const selected: RecommendationIntentV3[] = []
    let cost = 0
    for (let round = 0; round < 3; round++)
        for (const type of order) {
            if (selected.length >= INTENT_CONFIG.maxIntents) break
            if (
                selected.filter((item) => item.type === type).length >=
                targets[type]
            )
                continue
            const candidate = families.get(type)?.[round]
            if (!candidate) continue
            if (
                cost + candidate.retrieval.estimatedRouteCost >
                INTENT_CONFIG.initialRouteCostTarget
            )
                continue
            candidate.planning.familyRank = selected.filter(
                (item) => item.type === type
            ).length
            selected.push(candidate)
            cost += candidate.retrieval.estimatedRouteCost
        }
    return selected
}
