import type { FavoriteRecord, StoredComic } from '../library/types'
import type { OnlineSource, SearchRequest } from '../providers/types'
import type {
    CompiledProviderRouteV5,
    compileCandidateProviderRoutesV5
} from './provider-query-compiler'

export const SHADOW_RETRIEVAL_V5_VERSION =
    'shadow-retrieval-v1'

type CompiledProviderPlanV5 = ReturnType<
    typeof compileCandidateProviderRoutesV5
>

export interface ShadowRetrievalAdapterV5 {
    search(
        surface: OnlineSource,
        request: SearchRequest,
        route: CompiledProviderRouteV5
    ): Promise<FavoriteRecord[]>
    relatedPica(
        comicId: string,
        route: CompiledProviderRouteV5
    ): Promise<FavoriteRecord[]>
}

export interface ShadowCandidateEvidenceV5 {
    routeIds: string[]
    channelIds: string[]
    surfaces: string[]
    families: string[]
    sourceLayers: string[]
    precisions: string[]
    maxPriority: number
}

export interface ShadowRetrievedCandidateV5 {
    comic: FavoriteRecord
    evidence: ShadowCandidateEvidenceV5
}

export interface ShadowRouteTelemetryV5 {
    routeId: string
    channelId: string
    surface: string
    family: string
    precision: string
    plannedRequests: number
    executedRequests: number
    failedRequests: number
    rawReturned: number
    uniqueNew: number
    duplicateCount: number
    latencyMs: number
    status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'LOCAL'
    errorClasses: string[]
}

function errorClass(error: unknown) {
    const text =
        error instanceof Error ? error.message : String(error ?? '')
    if (/401|403|auth|account|session|access/i.test(text))
        return 'AUTH_OR_ACCESS'
    if (/timeout|network|ECONN|ENOTFOUND|fetch/i.test(text))
        return 'NETWORK'
    return 'ROUTE'
}

function readiness(count: number) {
    return count >= 180
        ? ('READY' as const)
        : count >= 48
          ? ('READY_DEGRADED' as const)
          : count >= 12
            ? ('READY_LIMITED' as const)
            : ('INSUFFICIENT_POOL' as const)
}

function evidenceFromRoute(
    route: CompiledProviderRouteV5
): ShadowCandidateEvidenceV5 {
    return {
        routeIds: [route.routeId],
        channelIds: [route.channelId],
        surfaces: [route.surface],
        families: [route.family],
        sourceLayers: [route.sourceLayer],
        precisions: [route.precision],
        maxPriority: route.priority
    }
}

function mergeEvidence(
    previous: ShadowCandidateEvidenceV5,
    route: CompiledProviderRouteV5
) {
    return {
        routeIds: [...new Set([...previous.routeIds, route.routeId])].sort(),
        channelIds: [
            ...new Set([...previous.channelIds, route.channelId])
        ].sort(),
        surfaces: [...new Set([...previous.surfaces, route.surface])].sort(),
        families: [...new Set([...previous.families, route.family])].sort(),
        sourceLayers: [
            ...new Set([...previous.sourceLayers, route.sourceLayer])
        ].sort(),
        precisions: [
            ...new Set([...previous.precisions, route.precision])
        ].sort(),
        maxPriority: Math.max(previous.maxPriority, route.priority)
    }
}

export async function executeShadowRetrievalV5(
    plan: CompiledProviderPlanV5,
    adapter: ShadowRetrievalAdapterV5,
    catalog: StoredComic[],
    options: {
        maxCandidates?: number
        now?: () => number
    } = {}
) {
    const maxCandidates = Math.max(
        12,
        Math.min(2000, Math.floor(options.maxCandidates ?? 1000))
    )
    const now = options.now ?? Date.now
    const candidates = new Map<string, ShadowRetrievedCandidateV5>()
    const telemetry = new Map<string, ShadowRouteTelemetryV5>()
    const catalogById = new Map(
        catalog.map((comic) => [comic.comicId, comic])
    )

    const addRecords = (
        route: CompiledProviderRouteV5,
        records: FavoriteRecord[],
        row: ShadowRouteTelemetryV5
    ) => {
        row.rawReturned += records.length
        for (const comic of records) {
            if (!comic?.comicId) continue
            const existing = candidates.get(comic.comicId)
            if (existing) {
                existing.evidence = mergeEvidence(
                    existing.evidence,
                    route
                )
                row.duplicateCount++
                continue
            }
            if (candidates.size >= maxCandidates) continue
            candidates.set(comic.comicId, {
                comic,
                evidence: evidenceFromRoute(route)
            })
            row.uniqueNew++
        }
    }

    // Local rediscovery does not use provider network budget.
    for (const route of plan.routes.filter(
        (item) => item.operation === 'LOCAL'
    )) {
        const row: ShadowRouteTelemetryV5 = {
            routeId: route.routeId,
            channelId: route.channelId,
            surface: route.surface,
            family: route.family,
            precision: route.precision,
            plannedRequests: 0,
            executedRequests: 0,
            failedRequests: 0,
            rawReturned: 0,
            uniqueNew: 0,
            duplicateCount: 0,
            latencyMs: 0,
            status: 'LOCAL',
            errorClasses: []
        }
        const records = (route.localCandidateIds ?? [])
            .map((id) => catalogById.get(id))
            .filter((comic): comic is StoredComic => Boolean(comic))
        addRecords(route, records, row)
        telemetry.set(route.routeId, row)
    }

    const runSurface = async (
        surface: Exclude<OnlineSource, never>
    ) => {
        const routes = plan.routes.filter(
            (route) =>
                route.surface === surface &&
                route.operation !== 'LOCAL'
        )
        for (const route of routes) {
            const startedAt = now()
            const row: ShadowRouteTelemetryV5 = {
                routeId: route.routeId,
                channelId: route.channelId,
                surface,
                family: route.family,
                precision: route.precision,
                plannedRequests: route.requestBudget,
                executedRequests: 0,
                failedRequests: 0,
                rawReturned: 0,
                uniqueNew: 0,
                duplicateCount: 0,
                latencyMs: 0,
                status: 'SUCCESS',
                errorClasses: []
            }
            const attempts =
                surface === 'pica'
                    ? Math.max(1, route.requestBudget)
                    : 1
            for (let requestIndex = 0; requestIndex < attempts; requestIndex++) {
                try {
                    let records: FavoriteRecord[]
                    if (route.operation === 'RELATED') {
                        if (!route.seedComicId)
                            throw new Error('Related route has no seed')
                        records = await adapter.relatedPica(
                            route.seedComicId,
                            route
                        )
                    } else {
                        if (!route.searchRequest)
                            throw new Error('Search route has no request')
                        records = await adapter.search(
                            surface,
                            {
                                ...route.searchRequest,
                                ...(surface === 'pica'
                                    ? { page: requestIndex + 1 }
                                    : {})
                            },
                            route
                        )
                    }
                    row.executedRequests++
                    addRecords(route, records, row)
                    if (candidates.size >= maxCandidates) break
                } catch (error) {
                    row.executedRequests++
                    row.failedRequests++
                    row.errorClasses.push(errorClass(error))
                }
            }
            row.errorClasses = [...new Set(row.errorClasses)].sort()
            row.latencyMs = Math.max(0, now() - startedAt)
            row.status =
                row.failedRequests === 0
                    ? 'SUCCESS'
                    : row.failedRequests < row.executedRequests
                      ? 'PARTIAL'
                      : 'FAILED'
            telemetry.set(route.routeId, row)
        }
    }

    // Provider pipelines are isolated from one another. Routes within a
    // provider remain sequential so provider-native pacing/rate limits are
    // respected, while one failed provider cannot abort the other providers.
    await Promise.all([
        runSurface('pica'),
        runSurface('eh'),
        runSurface('exh')
    ])

    const rows = [...candidates.values()].sort(
        (a, b) =>
            b.evidence.maxPriority - a.evidence.maxPriority ||
            b.evidence.routeIds.length - a.evidence.routeIds.length ||
            a.comic.comicId.localeCompare(b.comic.comicId)
    )
    const routeRows = [...telemetry.values()].sort(
        (a, b) =>
            b.uniqueNew - a.uniqueNew ||
            a.routeId.localeCompare(b.routeId)
    )

    const providerSummary = Object.fromEntries(
        ['pica', 'eh', 'exh', 'local'].map((surface) => {
            const values = routeRows.filter(
                (row) => row.surface === surface
            )
            return [
                surface,
                {
                    routeCount: values.length,
                    successfulRoutes: values.filter(
                        (row) =>
                            row.status === 'SUCCESS' ||
                            row.status === 'LOCAL'
                    ).length,
                    failedRoutes: values.filter(
                        (row) => row.status === 'FAILED'
                    ).length,
                    partialRoutes: values.filter(
                        (row) => row.status === 'PARTIAL'
                    ).length,
                    executedRequests: values.reduce(
                        (sum, row) => sum + row.executedRequests,
                        0
                    ),
                    rawReturned: values.reduce(
                        (sum, row) => sum + row.rawReturned,
                        0
                    ),
                    uniqueNew: values.reduce(
                        (sum, row) => sum + row.uniqueNew,
                        0
                    ),
                    latencyMs: values.reduce(
                        (sum, row) => sum + row.latencyMs,
                        0
                    )
                }
            ]
        })
    )

    return {
        mode: 'SHADOW' as const,
        retrievalVersion: SHADOW_RETRIEVAL_V5_VERSION,
        servingImpact: false,
        persistCandidates: false,
        providerFailureIsolation: true,
        readiness: readiness(rows.length),
        candidateCount: rows.length,
        candidates: rows,
        telemetry: {
            providers: providerSummary,
            routes: routeRows,
            failedRouteCount: routeRows.filter(
                (row) => row.status === 'FAILED'
            ).length,
            partialRouteCount: routeRows.filter(
                (row) => row.status === 'PARTIAL'
            ).length,
            rawResultCount: routeRows.reduce(
                (sum, row) => sum + row.rawReturned,
                0
            ),
            duplicateCount: routeRows.reduce(
                (sum, row) => sum + row.duplicateCount,
                0
            )
        }
    }
}
