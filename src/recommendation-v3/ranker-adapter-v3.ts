import type { StoredComic } from '../library/types'
import { rankV3, type RankingContext } from './ranker'
import type { V3Profile, V3Recommendation } from './types'
import type { RetrievedCandidateV3 } from './retriever-v3'

export const RANKER_ADAPTER_VERSION = '3.1.0-frozen-neutral'

export const RANKER_FEATURE_MAPPING_V3 = {
    historicalOrdinalSimilarity: 'NEUTRAL_NO_VALID_SOURCE',
    historicalSimilarity: 'NEUTRAL_NO_VALID_SOURCE',
    historicalClusterSimilarity: 'NEUTRAL_NO_VALID_SOURCE',
    lifetimeSimilarity: 'NEUTRAL_NO_VALID_SOURCE',
    recentSimilarity: 'NEUTRAL_NO_VALID_SOURCE',
    sessionSimilarity: 'NEUTRAL_NO_VALID_SOURCE',
    authorAffinity: 'DIRECTLY_AVAILABLE',
    circleAffinity: 'DIRECTLY_AVAILABLE',
    singleTagAffinity: 'NEUTRAL_NO_VALID_SOURCE',
    pairInteractionBonus: 'DEPRECATED_NOT_USED',
    tripleInteractionBonus: 'DEPRECATED_NOT_USED',
    categorySimilarity: 'DIRECTLY_AVAILABLE',
    itemSimilarity: 'NEUTRAL_NO_VALID_SOURCE',
    relatedGraphScore: 'DIRECTLY_AVAILABLE',
    positiveBehaviorSimilarity: 'TELEMETRY_ONLY_NOT_SCORED',
    negativeBehaviorPenalty: 'NEUTRAL_NO_VALID_SOURCE',
    popularity: 'DIRECTLY_AVAILABLE',
    novelty: 'NEUTRAL_CONSTANT_CURRENT_SEMANTICS',
    previousImpressionCount: 'NEUTRAL_NO_VALID_SOURCE',
    recentExposurePenalty: 'NEUTRAL_NO_VALID_SOURCE',
    alreadyFavorite: 'DIRECTLY_AVAILABLE',
    alreadyDownloaded: 'TELEMETRY_ONLY_NOT_SCORED',
    alreadyRead: 'TELEMETRY_ONLY_NOT_SCORED',
    recallRouteSupport: 'DIRECTLY_AVAILABLE'
} as const

function emptyWindow() {
    return { clusters: [], tags: [], pairs: [], triples: [] }
}

export function frozenNeutralProfileV3(): V3Profile {
    return {
        historical: emptyWindow(),
        lifetime: emptyWindow(),
        recent: emptyWindow(),
        session: emptyWindow(),
        generatedAt: new Date(0).toISOString(),
        modelVersion: RANKER_ADAPTER_VERSION,
        evidenceCutoff: new Date(0).toISOString()
    }
}

export interface RankedCandidateWithEvidenceV3 extends V3Recommendation {
    rawRank: number
    comic: StoredComic
    evidence: RetrievedCandidateV3['evidence']
}

export function rankCandidatesWithFrozenRankerV3(input: {
    candidates: RetrievedCandidateV3[]
    favorites: StoredComic[]
    graphEdges?: RankingContext['graphEdges']
}): RankedCandidateWithEvidenceV3[] {
    const routeFamilies = new Map<string, Set<string>>()
    for (const candidate of input.candidates)
        for (const family of candidate.evidence.routeFamilies) {
            const ids = routeFamilies.get(family) ?? new Set<string>()
            ids.add(candidate.comic.comicId)
            routeFamilies.set(family, ids)
        }
    const ranked = rankV3(
        input.candidates.map((item) => item.comic),
        input.favorites,
        frozenNeutralProfileV3(),
        [],
        { graphEdges: input.graphEdges, routeFamilies }
    )
    const byId = new Map(
        input.candidates.map((item) => [item.comic.comicId, item])
    )
    return ranked.map((item, index) => {
        const source = byId.get(item.comicId)!
        return {
            ...item,
            rawRank: index + 1,
            comic: source.comic,
            evidence: source.evidence
        }
    })
}
