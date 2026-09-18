import { parseEhTag } from '../providers/eh-provider'
import type {
    EhSurface,
    SearchRequest
} from '../providers/types'
import type { StoredComic } from '../library/types'
import { normalizePreferenceKey } from './portable-policy'
import type {
    CandidateChannelAnchorV5,
    CandidateChannelFamilyV5,
    CandidateChannelSourceV5,
    CandidateProviderSurfaceV5,
    buildCandidateChannelPlanV5
} from './candidate-channels'

export const PROVIDER_QUERY_COMPILER_V5_VERSION =
    'provider-query-compiler-v1'

type CandidateChannelPlanV5 = ReturnType<
    typeof buildCandidateChannelPlanV5
>

export type ProviderQueryPrecisionV5 =
    | 'EXACT_CANONICAL'
    | 'PROVIDER_NATIVE'
    | 'FALLBACK_KEYWORD'
    | 'LOCAL'

export interface CompiledProviderRouteV5 {
    routeId: string
    channelId: string
    family: CandidateChannelFamilyV5
    sourceLayer: CandidateChannelSourceV5
    priority: number
    surface: CandidateProviderSurfaceV5
    operation: 'SEARCH' | 'RELATED' | 'LOCAL'
    precision: ProviderQueryPrecisionV5
    requestBudget: number
    targetCandidates: number
    reasonCode: string
    searchRequest?: SearchRequest
    seedComicId?: string
    localCandidateIds?: string[]
    bindingSource:
        | 'OBSERVED_CANONICAL'
        | 'AUTHOR_NAMESPACE'
        | 'PROVIDER_NATIVE'
        | 'FALLBACK'
        | 'LOCAL'
}

export interface DroppedProviderRouteV5 {
    channelId: string
    surface: CandidateProviderSurfaceV5
    reason: string
}

export function deriveObservedEhCanonicalBindingsV5(
    catalog: StoredComic[]
) {
    const canonicalSets = new Map<string, Set<string>>()
    const facetSets = new Map<string, Set<string>>()

    for (const comic of catalog) {
        if (comic.providerId !== 'eh') continue
        const rawTags = Array.isArray(
            comic.providerMetadata?.rawTags
        )
            ? comic.providerMetadata.rawTags.map(String)
            : []
        for (const raw of rawTags) {
            const parsed = parseEhTag(raw)
            const key = normalizePreferenceKey(parsed.value)
            if (!key || !parsed.namespace) continue
            const canonicals =
                canonicalSets.get(key) ?? new Set<string>()
            canonicals.add(parsed.raw.trim())
            canonicalSets.set(key, canonicals)
            const facets = facetSets.get(key) ?? new Set<string>()
            if (parsed.facet) facets.add(parsed.facet)
            facetSets.set(key, facets)
        }
    }

    const canonicals: Record<string, string> = {}
    const facets: Record<string, string> = {}
    const ambiguousKeys: string[] = []
    for (const [key, values] of canonicalSets) {
        if (values.size === 1) canonicals[key] = [...values][0]
        else ambiguousKeys.push(key)
        const observedFacets = facetSets.get(key) ?? new Set<string>()
        if (values.size === 1 && observedFacets.size === 1)
            facets[key] = [...observedFacets][0]
    }

    return {
        canonicals,
        facets,
        ambiguousKeys: ambiguousKeys.sort()
    }
}

function cleanText(value: unknown, max = 180) {
    return String(value ?? '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
}

function exactEhCanonical(raw: unknown) {
    const value = cleanText(raw, 220)
    if (
        !/^[a-z0-9_-]+:[^"'\r\n]{1,180}$/i.test(value) ||
        value.endsWith(':')
    )
        return null
    return value
}

function authorCanonical(label: string) {
    const value = cleanText(label, 150).replace(/\$$/, '')
    if (!value || /["'\r\n]/.test(value)) return null
    return `artist:${value}`
}

function limitFor(targetCandidates: number) {
    return Math.max(
        1,
        Math.min(100, Math.ceil(Number(targetCandidates) || 25))
    )
}

function picaSearch(
    anchor: CandidateChannelAnchorV5,
    limit: number
): SearchRequest | null {
    const label = cleanText(anchor.label || anchor.key)
    if (!label) return null
    if (anchor.targetType === 'AUTHOR')
        return { keyword: label, limit }
    if (
        anchor.targetType === 'TAG' ||
        anchor.targetType === 'FANDOM'
    )
        return { tags: [label], limit }
    if (anchor.targetType === 'CATEGORY')
        return { categories: [label], limit }
    return null
}

function ehSearch(
    anchor: CandidateChannelAnchorV5,
    surface: EhSurface,
    limit: number
): {
    request: SearchRequest
    precision: ProviderQueryPrecisionV5
    bindingSource:
        | 'OBSERVED_CANONICAL'
        | 'AUTHOR_NAMESPACE'
        | 'FALLBACK'
} | null {
    const label = cleanText(anchor.label || anchor.key)
    if (!label) return null

    if (anchor.targetType === 'AUTHOR') {
        const canonical = authorCanonical(label)
        if (canonical)
            return {
                request: {
                    tags: [canonical],
                    surface,
                    limit
                },
                precision: 'EXACT_CANONICAL',
                bindingSource: 'AUTHOR_NAMESPACE'
            }
        return {
            request: { keyword: label, surface, limit },
            precision: 'FALLBACK_KEYWORD',
            bindingSource: 'FALLBACK'
        }
    }

    if (
        anchor.targetType === 'TAG' ||
        anchor.targetType === 'FANDOM'
    ) {
        const observed = exactEhCanonical(
            anchor.providerCanonical?.[surface] ??
                anchor.providerCanonical?.eh
        )
        if (observed)
            return {
                request: {
                    tags: [observed],
                    surface,
                    limit
                },
                precision: 'EXACT_CANONICAL',
                bindingSource: 'OBSERVED_CANONICAL'
            }
        return {
            request: { keyword: label, surface, limit },
            precision: 'FALLBACK_KEYWORD',
            bindingSource: 'FALLBACK'
        }
    }

    // E-H category retrieval is intentionally not synthesized from a
    // generic keyword. The current provider does not expose category search
    // as a native retrieval primitive.
    return null
}

function surfaceRank(surface: CandidateProviderSurfaceV5) {
    return surface === 'pica'
        ? 0
        : surface === 'eh'
          ? 1
          : surface === 'exh'
            ? 2
            : 3
}

export function compileCandidateProviderRoutesV5(
    plan: CandidateChannelPlanV5
) {
    const routes: CompiledProviderRouteV5[] = []
    const dropped: DroppedProviderRouteV5[] = []

    for (const channel of plan.channels) {
        if (!channel.enabled) continue

        if (
            channel.family === 'REDISCOVERY' &&
            channel.localCandidateIds?.length
        ) {
            routes.push({
                routeId: `${channel.channelId}|local`,
                channelId: channel.channelId,
                family: channel.family,
                sourceLayer: channel.sourceLayer,
                priority: channel.priority,
                surface: 'local',
                operation: 'LOCAL',
                precision: 'LOCAL',
                requestBudget: 0,
                targetCandidates: channel.localCandidateIds.length,
                reasonCode: channel.reasonCode,
                localCandidateIds: [...channel.localCandidateIds],
                bindingSource: 'LOCAL'
            })
            continue
        }

        const anchor = channel.anchors[0]
        if (!anchor) continue

        for (const allocation of channel.providerAllocations) {
            if (
                allocation.surface === 'local' ||
                !allocation.eligible ||
                allocation.plannedRequests <= 0
            )
                continue

            const common = {
                routeId: `${channel.channelId}|${allocation.surface}`,
                channelId: channel.channelId,
                family: channel.family,
                sourceLayer: channel.sourceLayer,
                priority: channel.priority,
                surface: allocation.surface,
                requestBudget: allocation.plannedRequests,
                targetCandidates: allocation.targetCandidates,
                reasonCode: channel.reasonCode
            }

            if (channel.family === 'RELATED') {
                const seed = cleanText(anchor.key)
                if (
                    allocation.surface === 'pica' &&
                    seed &&
                    !seed.startsWith('eh:')
                ) {
                    routes.push({
                        ...common,
                        operation: 'RELATED',
                        precision: 'PROVIDER_NATIVE',
                        seedComicId: seed,
                        bindingSource: 'PROVIDER_NATIVE'
                    })
                } else
                    dropped.push({
                        channelId: channel.channelId,
                        surface: allocation.surface,
                        reason: 'RELATED_ROUTE_UNSUPPORTED'
                    })
                continue
            }

            const limit = limitFor(allocation.targetCandidates)
            if (allocation.surface === 'pica') {
                const request = picaSearch(anchor, limit)
                if (!request) {
                    dropped.push({
                        channelId: channel.channelId,
                        surface: allocation.surface,
                        reason: 'PICA_QUERY_UNSUPPORTED'
                    })
                    continue
                }
                routes.push({
                    ...common,
                    operation: 'SEARCH',
                    precision: 'PROVIDER_NATIVE',
                    searchRequest: request,
                    bindingSource: 'PROVIDER_NATIVE'
                })
                continue
            }

            const compiled = ehSearch(
                anchor,
                allocation.surface,
                limit
            )
            if (!compiled) {
                dropped.push({
                    channelId: channel.channelId,
                    surface: allocation.surface,
                    reason: 'EH_QUERY_UNSUPPORTED'
                })
                continue
            }
            routes.push({
                ...common,
                operation: 'SEARCH',
                precision: compiled.precision,
                searchRequest: compiled.request,
                bindingSource: compiled.bindingSource
            })
        }
    }

    routes.sort(
        (a, b) =>
            b.priority - a.priority ||
            surfaceRank(a.surface) - surfaceRank(b.surface) ||
            a.routeId.localeCompare(b.routeId)
    )
    dropped.sort(
        (a, b) =>
            a.channelId.localeCompare(b.channelId) ||
            surfaceRank(a.surface) - surfaceRank(b.surface)
    )

    return {
        mode: 'SHADOW' as const,
        compilerVersion: PROVIDER_QUERY_COMPILER_V5_VERSION,
        sourcePlannerVersion: plan.plannerVersion,
        sourceProviderBudgets: plan.providerBudgets,
        executionEnabled: false,
        servingImpact: false,
        summary: {
            routeCount: routes.length,
            exactCanonicalRouteCount: routes.filter(
                (route) => route.precision === 'EXACT_CANONICAL'
            ).length,
            providerNativeRouteCount: routes.filter(
                (route) => route.precision === 'PROVIDER_NATIVE'
            ).length,
            fallbackRouteCount: routes.filter(
                (route) => route.precision === 'FALLBACK_KEYWORD'
            ).length,
            localRouteCount: routes.filter(
                (route) => route.precision === 'LOCAL'
            ).length,
            droppedRouteCount: dropped.length,
            bySurface: {
                pica: routes.filter(
                    (route) => route.surface === 'pica'
                ).length,
                eh: routes.filter(
                    (route) => route.surface === 'eh'
                ).length,
                exh: routes.filter(
                    (route) => route.surface === 'exh'
                ).length,
                local: routes.filter(
                    (route) => route.surface === 'local'
                ).length
            }
        },
        routes,
        dropped
    }
}
