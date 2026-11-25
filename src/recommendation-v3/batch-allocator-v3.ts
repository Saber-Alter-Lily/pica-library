import type { RankedCandidateWithEvidenceV3 } from './ranker-adapter-v3'
import type { RecommendationIntentV3 } from './intent-planner-v3'
import {
    AUTHOR_BATCH_CAP,
    AUTHOR_ROLLING_CAP,
    batchAuthorKey
} from './batch-freshness-v3'

export const BATCH_ALLOCATOR_VERSION = '3.3.0-presented-batches'
export const FINAL_BATCH_SIZE = 12

export interface AllocatedCandidateV3 {
    comicId: string
    rawRank: number
    rawRankerScore: number
    allocationPass: 'A' | 'B' | 'C'
    primaryIntentId: string
    primaryFamily: RecommendationIntentV3['type']
    relatedOnly: boolean
    recentlyDisplayed: boolean
    authorLimitRelaxed: boolean
    reasonCodes: string[]
}

const familyPriority: RecommendationIntentV3['type'][] = [
    'FANDOM',
    'CREATOR',
    'SEMANTIC_CONJUNCTION',
    'SEMANTIC_ANCHOR',
    'EXPLORATION',
    'RELATED'
]
const evidencePriority = {
    VERIFIED_METADATA: 0,
    MULTI_ROUTE: 1,
    SINGLE_ROUTE: 2
} as const

function primaryIntent(
    candidate: RankedCandidateWithEvidenceV3,
    intents: Map<string, RecommendationIntentV3>
) {
    const values = candidate.evidence.originIntentIds
        .map((id) => intents.get(id))
        .filter((item): item is RecommendationIntentV3 => Boolean(item))
        .sort((a, b) => {
            const aEvidence = candidate.evidence.conjunctionEvidence.find(
                (item) => item.intentId === a.intentId
            )?.level
            const bEvidence = candidate.evidence.conjunctionEvidence.find(
                (item) => item.intentId === b.intentId
            )?.level
            return (
                familyPriority.indexOf(a.type) -
                    familyPriority.indexOf(b.type) ||
                (aEvidence ? evidencePriority[aEvidence] : 3) -
                    (bEvidence ? evidencePriority[bEvidence] : 3) ||
                Math.min(
                    ...(candidate.evidence.providerRanksByIntent?.[
                        a.intentId
                    ] ?? [Number.MAX_SAFE_INTEGER])
                ) -
                    Math.min(
                        ...(candidate.evidence.providerRanksByIntent?.[
                            b.intentId
                        ] ?? [Number.MAX_SAFE_INTEGER])
                    ) ||
                a.intentId.localeCompare(b.intentId)
            )
        })
    return (
        values[0] ?? {
            intentId: 'UNATTRIBUTED',
            type: candidate.evidence.primaryFamily
        }
    )
}

export function allocateRecommendationBatchV3(input: {
    ranked: RankedCandidateWithEvidenceV3[]
    intents: RecommendationIntentV3[]
    alreadyAllocated: Set<string>
    currentFavoriteIds?: Set<string>
    recentlyDisplayedComicIds?: Set<string>
    recentAuthorCounts?: ReadonlyMap<string, number>
    limit?: number
}) {
    const limit = input.limit ?? FINAL_BATCH_SIZE
    const intents = new Map(
        input.intents.map((intent) => [intent.intentId, intent])
    )
    const selected: AllocatedCandidateV3[] = []
    const selectedIds = new Set<string>()
    const fandomCounts = new Map<string, number>()
    const authorCounts = new Map<string, number>()
    const intentCounts = new Map<string, number>()
    let relatedOnlyCount = 0
    const recent = input.recentlyDisplayedComicIds ?? new Set<string>()
    const passes = [
        { name: 'A' as const, fandom: 4, author: 3, intent: 4, related: 2 },
        { name: 'B' as const, fandom: 5, author: 4, intent: 5, related: 3 },
        {
            name: 'C' as const,
            fandom: Number.POSITIVE_INFINITY,
            author: Number.POSITIVE_INFINITY,
            intent: Number.POSITIVE_INFINITY,
            related: Number.POSITIVE_INFINITY
        }
    ]

    // Never re-admit an owned, already allocated or recently presented work
    // just to fill the screen. Only author diversity is relaxed on starvation.
    const eligible = input.ranked
        .filter(
            ({ comicId }) =>
                !input.alreadyAllocated.has(comicId) &&
                !input.currentFavoriteIds?.has(comicId) &&
                !recent.has(comicId)
        )
        .map((candidate) => ({
            candidate,
            author: batchAuthorKey(candidate.comic),
            primary: primaryIntent(candidate, intents),
            fandoms: [...new Set(candidate.evidence.candidateFandomKeys ?? [])],
            relatedOnly: candidate.evidence.routeFamilies.every(
                (family) => family === 'RELATED'
            )
        }))
    for (const authorPolicy of ['rolling', 'batch', 'relaxed'] as const) {
        for (const pass of passes) {
            for (const {
                candidate,
                author,
                primary,
                fandoms,
                relatedOnly
            } of eligible) {
                if (selected.length >= limit) return selected
                const id = candidate.comicId
                if (selectedIds.has(id)) continue
                const inBatch = author ? authorCounts.get(author) ?? 0 : 0
                const acrossThree =
                    inBatch +
                    (author ? input.recentAuthorCounts?.get(author) ?? 0 : 0)
                if (
                    (authorPolicy !== 'relaxed' &&
                        inBatch >= AUTHOR_BATCH_CAP) ||
                    (authorPolicy === 'rolling' &&
                        acrossThree >= AUTHOR_ROLLING_CAP)
                )
                    continue
                if (
                    fandoms.some(
                        (key) => (fandomCounts.get(key) ?? 0) >= pass.fandom
                    ) ||
                    (author &&
                        (authorCounts.get(author) ?? 0) >= pass.author) ||
                    (intentCounts.get(primary.intentId) ?? 0) >= pass.intent ||
                    (relatedOnly && relatedOnlyCount >= pass.related)
                )
                    continue
                selectedIds.add(id)
                for (const key of fandoms)
                    fandomCounts.set(key, (fandomCounts.get(key) ?? 0) + 1)
                if (author)
                    authorCounts.set(
                        author,
                        (authorCounts.get(author) ?? 0) + 1
                    )
                intentCounts.set(
                    primary.intentId,
                    (intentCounts.get(primary.intentId) ?? 0) + 1
                )
                if (relatedOnly) relatedOnlyCount++
                selected.push({
                    comicId: id,
                    rawRank: candidate.rawRank,
                    rawRankerScore: candidate.score,
                    allocationPass: pass.name,
                    primaryIntentId: primary.intentId,
                    primaryFamily: primary.type,
                    relatedOnly,
                    recentlyDisplayed: false,
                    authorLimitRelaxed:
                        inBatch >= AUTHOR_BATCH_CAP ||
                        acrossThree >= AUTHOR_ROLLING_CAP,
                    reasonCodes: candidate.reasons.slice(0, 2)
                })
            }
        }
        if (selected.length >= limit) break
    }
    return selected
}
