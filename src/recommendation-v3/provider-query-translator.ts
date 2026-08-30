import type { RecommendationIntentV3 } from './intent-planner-v3'

export const QUERY_TRANSLATOR_VERSION = '3.1.0-authority-only'

export interface RetrievalRouteV3 {
    routeId: string
    parentIntentId: string
    family: RecommendationIntentV3['type']
    routeType: 'KEYWORD' | 'AUTHOR' | 'RELATED'
    queryTerm?: string
    comicSeedId?: string
    page: number
    sort: 'loved'
    category?: string
    anchorKey: string
    anchorFacet?: string
    expectedPrecisionTier: string
}

export function translateIntentToRoutesV3(
    intent: RecommendationIntentV3
): RetrievalRouteV3[] {
    if (!intent.retrieval.providerEligible) return []
    if (intent.type === 'RELATED') {
        const seed = intent.anchors[0]?.canonicalKey
        return seed
            ? [
                  {
                      routeId: `${intent.intentId}:RELATED`,
                      parentIntentId: intent.intentId,
                      family: intent.type,
                      routeType: 'RELATED',
                      comicSeedId: seed,
                      page: 1,
                      sort: 'loved',
                      anchorKey: seed,
                      expectedPrecisionTier: 'AUXILIARY'
                  }
              ]
            : []
    }
    return intent.anchors.flatMap((anchor, index) => {
        const query = anchor.providerQueryLabel?.trim()
        if (!query) return []
        const routeType = intent.type === 'CREATOR' ? 'AUTHOR' : 'KEYWORD'
        return [
            {
                routeId: `${intent.intentId}:${routeType}:${index}`,
                parentIntentId: intent.intentId,
                family: intent.type,
                routeType,
                queryTerm: query,
                page: 1,
                sort: 'loved' as const,
                anchorKey: anchor.canonicalKey,
                anchorFacet: anchor.facet,
                expectedPrecisionTier: intent.retrieval.utilityTier
            }
        ]
    })
}

export function translateIntentPlanV3(intents: RecommendationIntentV3[]) {
    return intents
        .flatMap(translateIntentToRoutesV3)
        .sort(
            (a, b) =>
                a.parentIntentId.localeCompare(b.parentIntentId) ||
                a.routeId.localeCompare(b.routeId)
        )
}
