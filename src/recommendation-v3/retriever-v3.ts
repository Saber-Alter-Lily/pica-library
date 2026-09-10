import type { StoredComic } from '../library/types'
import type { RecommendationIntentV3 } from './intent-planner-v3'
import type { RetrievalRouteV3 } from './provider-query-translator'

export const RETRIEVER_VERSION = '3.1.0-bounded-multiroute'
export const RETRIEVER_CONFIG = {
    targetPool: 250,
    maxProviderRequests: 24,
    maxPage: 3
} as const

export type PoolReadinessV3 =
    | 'READY'
    | 'READY_DEGRADED'
    | 'READY_LIMITED'
    | 'FAILED_INSUFFICIENT_POOL'

export interface CandidateEvidenceV3 {
    comicId: string
    originIntentIds: string[]
    originRouteIds: string[]
    routeFamilies: RecommendationIntentV3['type'][]
    primaryFamily: RecommendationIntentV3['type']
    routeHitCount: number
    intentHitCount: number
    providerBestRank: number | null
    providerRanks: number[]
    providerRanksByIntent?: Record<string, number[]>
    queryTerms: string[]
    conjunctionEvidence: Array<{
        intentId: string
        level: 'VERIFIED_METADATA' | 'MULTI_ROUTE' | 'SINGLE_ROUTE'
    }>
    relatedSeedIds: string[]
    exploration: boolean
    firstSeenAt: string
    candidateFandomKeys?: string[]
}

export interface RouteTelemetryV3 {
    routeId: string
    family: RecommendationIntentV3['type']
    requestCount: number
    pagesRequested: number[]
    rawReturned: number
    uniqueNew: number
    duplicateCount: number
    favoriteHitCount: number
    cycleSeenCount: number
    usableMetadataCount: number
    multiRouteSupport: number
    newYield: number
    productive: boolean
    exhausted: boolean
    failures: Array<{ stage: string; status?: number }>
}

export interface RetrieverProviderV3 {
    keyword(query: string, page: number): Promise<StoredComic[]>
    author(query: string, page: number): Promise<StoredComic[]>
    related(comicId: string): Promise<StoredComic[]>
}

export interface RetrievedCandidateV3 {
    comic: StoredComic
    evidence: CandidateEvidenceV3
}

export interface RetrieverResultV3 {
    candidates: RetrievedCandidateV3[]
    readiness: PoolReadinessV3
    telemetry: {
        providerRequestCount: number
        rawResultCount: number
        uniqueResultCount: number
        favoriteExcludedCount: number
        safetyExcludedCount: number
        duplicateCollapsedCount: number
        familyCandidateCounts: Record<string, number>
        familyCoverageCounts: Record<string, number>
        routeStats: RouteTelemetryV3[]
        stoppedBy: string
    }
}

const familyPriority: RecommendationIntentV3['type'][] = [
    'FANDOM',
    'CREATOR',
    'SEMANTIC_CONJUNCTION',
    'SEMANTIC_ANCHOR',
    'EXPLORATION',
    'RELATED'
]

const primaryFamily = (families: Set<RecommendationIntentV3['type']>) =>
    familyPriority.find((family) => families.has(family)) ?? 'RELATED'

const readiness = (count: number): PoolReadinessV3 =>
    count >= 180
        ? 'READY'
        : count >= 48
          ? 'READY_DEGRADED'
          : count >= 12
            ? 'READY_LIMITED'
            : 'FAILED_INSUFFICIENT_POOL'

export async function retrieveCandidatesV3(input: {
    provider: RetrieverProviderV3
    routes: RetrievalRouteV3[]
    intents: RecommendationIntentV3[]
    favoriteIds: Set<string>
    cycleSeenIds?: Set<string>
    isSafetyExcluded?: (comic: StoredComic) => boolean
    now?: () => string
    candidateFandomKeys?: (comic: StoredComic) => string[]
}): Promise<RetrieverResultV3> {
    const routes = [...input.routes].sort(
        (a, b) =>
            familyPriority.indexOf(a.family) -
                familyPriority.indexOf(b.family) ||
            a.routeId.localeCompare(b.routeId)
    )
    const intentById = new Map(
        input.intents.map((intent) => [intent.intentId, intent])
    )
    const stats = new Map<string, RouteTelemetryV3>()
    const candidates = new Map<
        string,
        {
            comic: StoredComic
            families: Set<RecommendationIntentV3['type']>
            evidence: CandidateEvidenceV3
        }
    >()
    let requestCount = 0
    let rawResultCount = 0
    let favoriteExcludedCount = 0
    let safetyExcludedCount = 0
    let duplicateCollapsedCount = 0
    let stoppedBy = 'ROUTES_EXHAUSTED'

    const load = async (route: RetrievalRouteV3, page: number) => {
        if (route.routeType === 'RELATED')
            return input.provider.related(route.comicSeedId ?? '')
        if (route.routeType === 'AUTHOR')
            return input.provider.author(route.queryTerm ?? '', page)
        return input.provider.keyword(route.queryTerm ?? '', page)
    }
    const run = async (route: RetrievalRouteV3, page: number) => {
        const stat =
            stats.get(route.routeId) ??
            ({
                routeId: route.routeId,
                family: route.family,
                requestCount: 0,
                pagesRequested: [],
                rawReturned: 0,
                uniqueNew: 0,
                duplicateCount: 0,
                favoriteHitCount: 0,
                cycleSeenCount: 0,
                usableMetadataCount: 0,
                multiRouteSupport: 0,
                newYield: 0,
                productive: true,
                exhausted: false,
                failures: []
            } satisfies RouteTelemetryV3)
        stats.set(route.routeId, stat)
        requestCount++
        stat.requestCount++
        stat.pagesRequested.push(page)
        let docs: StoredComic[]
        try {
            docs = await load(route, page)
        } catch (error) {
            const status =
                typeof error === 'object' && error && 'status' in error
                    ? Number((error as { status?: unknown }).status)
                    : undefined
            stat.failures.push({
                stage:
                    status === 401 || status === 403
                        ? 'AUTH_OR_ACCESS'
                        : 'ROUTE',
                status: Number.isFinite(status) ? status : undefined
            })
            stat.productive = false
            stat.exhausted = true
            if (status === 401 || status === 403) throw error
            return
        }
        rawResultCount += docs.length
        stat.rawReturned += docs.length
        let pageUniqueNew = 0
        for (let rank = 0; rank < docs.length; rank++) {
            const comic = docs[rank]
            if (!comic?.comicId) continue
            if (input.favoriteIds.has(comic.comicId)) {
                favoriteExcludedCount++
                stat.favoriteHitCount++
                continue
            }
            if (input.cycleSeenIds?.has(comic.comicId)) {
                stat.cycleSeenCount++
                continue
            }
            if (input.isSafetyExcluded?.(comic)) {
                safetyExcludedCount++
                continue
            }
            if (comic.title || comic.tags.length || comic.author)
                stat.usableMetadataCount++
            const existing = candidates.get(comic.comicId)
            if (existing) {
                duplicateCollapsedCount++
                stat.duplicateCount++
                existing.families.add(route.family)
                existing.evidence.originIntentIds = [
                    ...new Set([
                        ...existing.evidence.originIntentIds,
                        route.parentIntentId
                    ])
                ].sort()
                existing.evidence.originRouteIds = [
                    ...new Set([
                        ...existing.evidence.originRouteIds,
                        route.routeId
                    ])
                ].sort()
                existing.evidence.routeFamilies = [
                    ...new Set([
                        ...existing.evidence.routeFamilies,
                        route.family
                    ])
                ].sort(
                    (a, b) =>
                        familyPriority.indexOf(a) - familyPriority.indexOf(b)
                )
                existing.evidence.routeHitCount =
                    existing.evidence.originRouteIds.length
                existing.evidence.intentHitCount =
                    existing.evidence.originIntentIds.length
                existing.evidence.providerRanks.push(rank + 1)
                const byIntent = existing.evidence.providerRanksByIntent ?? {}
                byIntent[route.parentIntentId] = [
                    ...(byIntent[route.parentIntentId] ?? []),
                    rank + 1
                ]
                existing.evidence.providerRanksByIntent = byIntent
                existing.evidence.providerBestRank = Math.min(
                    existing.evidence.providerBestRank ?? rank + 1,
                    rank + 1
                )
                if (route.queryTerm)
                    existing.evidence.queryTerms = [
                        ...new Set([
                            ...existing.evidence.queryTerms,
                            route.queryTerm
                        ])
                    ].sort()
                if (route.comicSeedId)
                    existing.evidence.relatedSeedIds = [
                        ...new Set([
                            ...existing.evidence.relatedSeedIds,
                            route.comicSeedId
                        ])
                    ].sort()
                existing.evidence.primaryFamily = primaryFamily(
                    existing.families
                )
                continue
            }
            pageUniqueNew++
            const intent = intentById.get(route.parentIntentId)
            const conjunctionEvidence =
                intent?.type === 'SEMANTIC_CONJUNCTION'
                    ? [
                          {
                              intentId: intent.intentId,
                              level: 'SINGLE_ROUTE' as const
                          }
                      ]
                    : []
            candidates.set(comic.comicId, {
                comic,
                families: new Set([route.family]),
                evidence: {
                    comicId: comic.comicId,
                    originIntentIds: [route.parentIntentId],
                    originRouteIds: [route.routeId],
                    routeFamilies: [route.family],
                    primaryFamily: route.family,
                    routeHitCount: 1,
                    intentHitCount: 1,
                    providerBestRank: rank + 1,
                    providerRanks: [rank + 1],
                    providerRanksByIntent: {
                        [route.parentIntentId]: [rank + 1]
                    },
                    queryTerms: route.queryTerm ? [route.queryTerm] : [],
                    conjunctionEvidence,
                    relatedSeedIds: route.comicSeedId
                        ? [route.comicSeedId]
                        : [],
                    exploration: route.family === 'EXPLORATION',
                    firstSeenAt: input.now?.() ?? new Date().toISOString(),
                    candidateFandomKeys: [
                        ...new Set(input.candidateFandomKeys?.(comic) ?? [])
                    ].sort()
                }
            })
        }
        stat.uniqueNew += pageUniqueNew
        stat.newYield = stat.rawReturned ? stat.uniqueNew / stat.rawReturned : 0
        stat.productive = pageUniqueNew > 0
        stat.exhausted =
            route.routeType === 'RELATED' ||
            docs.length === 0 ||
            pageUniqueNew === 0
    }

    for (const route of routes) {
        if (requestCount >= RETRIEVER_CONFIG.maxProviderRequests) break
        await run(route, 1)
        if (candidates.size >= RETRIEVER_CONFIG.targetPool) {
            stoppedBy = 'TARGET_REACHED'
            break
        }
    }
    while (
        candidates.size < RETRIEVER_CONFIG.targetPool &&
        requestCount < RETRIEVER_CONFIG.maxProviderRequests
    ) {
        const familyCounts = new Map<string, number>()
        for (const value of candidates.values())
            familyCounts.set(
                value.evidence.primaryFamily,
                (familyCounts.get(value.evidence.primaryFamily) ?? 0) + 1
            )
        const next = routes
            .filter((route) => {
                const stat = stats.get(route.routeId)
                const last = Math.max(0, ...(stat?.pagesRequested ?? []))
                return (
                    route.routeType !== 'RELATED' &&
                    !stat?.exhausted &&
                    last < RETRIEVER_CONFIG.maxPage
                )
            })
            .sort((a, b) => {
                const as = stats.get(a.routeId)!
                const bs = stats.get(b.routeId)!
                const aUnder = (familyCounts.get(a.family) ?? 0) < 25
                const bUnder = (familyCounts.get(b.family) ?? 0) < 25
                return (
                    Number(bUnder) - Number(aUnder) ||
                    Number(bs.productive) - Number(as.productive) ||
                    bs.newYield - as.newYield ||
                    bs.uniqueNew - as.uniqueNew ||
                    as.requestCount - bs.requestCount ||
                    a.routeId.localeCompare(b.routeId)
                )
            })[0]
        if (!next) {
            stoppedBy = 'NO_PRODUCTIVE_ROUTE'
            break
        }
        const page = Math.max(...stats.get(next.routeId)!.pagesRequested) + 1
        await run(next, page)
    }
    if (requestCount >= RETRIEVER_CONFIG.maxProviderRequests)
        stoppedBy = 'REQUEST_BUDGET'
    else if (candidates.size >= RETRIEVER_CONFIG.targetPool)
        stoppedBy = 'TARGET_REACHED'

    for (const value of candidates.values()) {
        for (const conjunction of value.evidence.conjunctionEvidence) {
            const matching = value.evidence.originRouteIds.filter((routeId) =>
                routeId.startsWith(`${conjunction.intentId}:`)
            ).length
            conjunction.level = matching >= 2 ? 'MULTI_ROUTE' : 'SINGLE_ROUTE'
        }
        value.evidence.primaryFamily = primaryFamily(value.families)
    }
    for (const stat of stats.values())
        stat.multiRouteSupport = [...candidates.values()].filter(
            (value) =>
                value.evidence.originRouteIds.includes(stat.routeId) &&
                value.evidence.routeHitCount > 1
        ).length
    const familyCandidateCounts: Record<string, number> = {}
    const familyCoverageCounts: Record<string, number> = {}
    for (const value of candidates.values()) {
        familyCandidateCounts[value.evidence.primaryFamily] =
            (familyCandidateCounts[value.evidence.primaryFamily] ?? 0) + 1
        for (const family of value.evidence.routeFamilies)
            familyCoverageCounts[family] =
                (familyCoverageCounts[family] ?? 0) + 1
    }
    const output = [...candidates.values()].map(({ comic, evidence }) => ({
        comic,
        evidence
    }))
    return {
        candidates: output,
        readiness: readiness(output.length),
        telemetry: {
            providerRequestCount: requestCount,
            rawResultCount,
            uniqueResultCount: output.length,
            favoriteExcludedCount,
            safetyExcludedCount,
            duplicateCollapsedCount,
            familyCandidateCounts,
            familyCoverageCounts,
            routeStats: [...stats.values()].sort((a, b) =>
                a.routeId.localeCompare(b.routeId)
            ),
            stoppedBy
        }
    }
}
