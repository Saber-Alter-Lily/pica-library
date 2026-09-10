import type { RankedCandidateWithEvidenceV3 } from './ranker-adapter-v3'
import type { RecommendationIntentV3 } from './intent-planner-v3'

export const BATCH_ALLOCATOR_VERSION = '3.2.0-soft-cap-cooldown'
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

    // First fill only with comics the user has not been shown in the recent
    // completed cycles. If that cannot fill a 12-item batch, repeat the same
    // deterministic soft-cap passes while allowing recently shown items back in.
    for (const allowRecent of recent.size ? [false, true] : [true]) {
        for (const pass of passes) {
            for (const candidate of input.ranked) {
                if (selected.length >= limit) break
                const id = candidate.comicId
                if (
                    input.alreadyAllocated.has(id) ||
                    input.currentFavoriteIds?.has(id) ||
                    selectedIds.has(id) ||
                    (!allowRecent && recent.has(id))
                )
                    continue
                const primary = primaryIntent(candidate, intents)
                const fandoms = candidate.evidence.candidateFandomKeys ?? []
                const author =
                    candidate.comic.authorId ?? candidate.comic.canonicalAuthor
                const relatedOnly = candidate.evidence.routeFamilies.every(
                    (family) => family === 'RELATED'
                )
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
                for (const key of new Set(fandoms))
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
                    recentlyDisplayed: recent.has(id),
                    reasonCodes: candidate.reasons.slice(0, 2)
                })
            }
        }
        if (selected.length >= limit) break
    }
    return selected
}
