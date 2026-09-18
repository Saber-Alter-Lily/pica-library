import type { SearchRequest } from '../providers/types'
import type {
    CandidateChannelAnchorV5,
    CandidateChannelV5,
    CandidateProviderAllocationV5,
    CandidateProviderSurfaceV5
} from './candidate-channels'

export const CHANNEL_QUERY_COMPILER_VERSION =
    'channel-query-compiler-v1'

export type CompiledCandidateQueryKindV5 =
    | 'SEARCH'
    | 'RELATED'
    | 'LOCAL'

export interface CompiledCandidateQueryV5 {
    queryId: string
    channelId: string
    family: CandidateChannelV5['family']
    sourceLayer: CandidateChannelV5['sourceLayer']
    surface: CandidateProviderSurfaceV5
    kind: CompiledCandidateQueryKindV5
    requestIndex: number
    targetCandidates: number
    failureIsolation: true
    persist: false
    request?: SearchRequest
    comicSeedId?: string
    localCandidateIds?: string[]
    compileReason: string
}

function cleanTerm(value: unknown) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/["']/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160)
}

function firstAnchor(channel: CandidateChannelV5) {
    return channel.anchors[0] ?? null
}

function ehNamespacedTag(anchor: CandidateChannelAnchorV5) {
    const label = cleanTerm(anchor.label || anchor.key)
    if (!label) return null
    if (anchor.targetType === 'AUTHOR') return `artist:${label}`
    if (anchor.targetType === 'FANDOM') return `parody:${label}`
    if (anchor.facet === 'CHARACTER') return `character:${label}`
    if (anchor.facet === 'CREATOR') return `artist:${label}`
    if (anchor.facet === 'CIRCLE') return `group:${label}`
    if (anchor.facet === 'LANGUAGE') return `language:${label}`
    if (anchor.facet === 'LOCATION') return `location:${label}`
    return null
}

function searchRequestFor(
    channel: CandidateChannelV5,
    allocation: CandidateProviderAllocationV5,
    requestIndex: number
): { request: SearchRequest; compileReason: string } | null {
    const anchor = firstAnchor(channel)
    const limit = Math.max(
        1,
        Math.min(100, allocation.targetCandidates || 25)
    )
    const page = requestIndex + 1

    if (channel.family === 'EXPLORATION') {
        if (allocation.surface === 'pica')
            return {
                request: { limit, page },
                compileReason: 'PICA_LOVED_CATALOG_EXPLORATION'
            }
        if (
            allocation.surface === 'eh' ||
            allocation.surface === 'exh'
        )
            return {
                request: {
                    limit,
                    surface: allocation.surface,
                    ehMode: 'popular'
                },
                compileReason: 'EH_POPULAR_EXPLORATION'
            }
        return null
    }

    if (!anchor) return null
    const label = cleanTerm(anchor.label || anchor.key)
    if (!label) return null

    if (allocation.surface === 'pica') {
        if (
            channel.family === 'CATEGORY' ||
            anchor.targetType === 'CATEGORY'
        )
            return {
                request: {
                    categories: [label],
                    limit,
                    page
                },
                compileReason: 'PICA_CATEGORY'
            }
        if (
            channel.family === 'TAG' ||
            channel.family === 'FANDOM' ||
            anchor.targetType === 'TAG' ||
            anchor.targetType === 'FANDOM'
        )
            return {
                request: {
                    tags: [label],
                    limit,
                    page
                },
                compileReason:
                    anchor.targetType === 'FANDOM'
                        ? 'PICA_FANDOM_TAG'
                        : 'PICA_TAG'
            }
        return {
            request: {
                keyword: label,
                limit,
                page
            },
            compileReason:
                anchor.targetType === 'AUTHOR'
                    ? 'PICA_AUTHOR_KEYWORD'
                    : 'PICA_KEYWORD'
        }
    }

    if (
        allocation.surface === 'eh' ||
        allocation.surface === 'exh'
    ) {
        const base: SearchRequest = {
            limit,
            surface: allocation.surface
        }
        if (
            channel.family === 'CATEGORY' ||
            anchor.targetType === 'CATEGORY'
        )
            return {
                request: {
                    ...base,
                    categories: [label]
                },
                compileReason: 'EH_CATEGORY'
            }

        const exactTag = ehNamespacedTag(anchor)
        if (exactTag)
            return {
                request: {
                    ...base,
                    tags: [exactTag]
                },
                compileReason: 'EH_EXACT_NAMESPACED_TAG'
            }

        return {
            request: {
                ...base,
                keyword: label
            },
            compileReason: 'EH_KEYWORD_FALLBACK'
        }
    }

    return null
}

function compileAllocation(
    channel: CandidateChannelV5,
    allocation: CandidateProviderAllocationV5
): CompiledCandidateQueryV5[] {
    if (!channel.enabled || !allocation.eligible) return []
    if (allocation.surface === 'local') {
        if (
            channel.family !== 'REDISCOVERY' ||
            !channel.localCandidateIds?.length
        )
            return []
        return [
            {
                queryId: `${channel.channelId}|local`,
                channelId: channel.channelId,
                family: channel.family,
                sourceLayer: channel.sourceLayer,
                surface: 'local',
                kind: 'LOCAL',
                requestIndex: 0,
                targetCandidates: channel.localCandidateIds.length,
                failureIsolation: true,
                persist: false,
                localCandidateIds: [...channel.localCandidateIds],
                compileReason: 'LOCAL_REDISCOVERY'
            }
        ]
    }

    if (allocation.plannedRequests <= 0) return []
    if (channel.family === 'RELATED') {
        const seed = firstAnchor(channel)?.key
        if (!seed || allocation.surface !== 'pica') return []
        return Array.from(
            { length: allocation.plannedRequests },
            (_, requestIndex) => ({
                queryId: `${channel.channelId}|pica|related|${requestIndex + 1}`,
                channelId: channel.channelId,
                family: channel.family,
                sourceLayer: channel.sourceLayer,
                surface: 'pica' as const,
                kind: 'RELATED' as const,
                requestIndex,
                targetCandidates: allocation.targetCandidates,
                failureIsolation: true as const,
                persist: false as const,
                comicSeedId: seed,
                compileReason: 'PICA_NATIVE_RELATED'
            })
        )
    }

    const output: CompiledCandidateQueryV5[] = []
    for (
        let requestIndex = 0;
        requestIndex < allocation.plannedRequests;
        requestIndex++
    ) {
        const compiled = searchRequestFor(
            channel,
            allocation,
            requestIndex
        )
        if (!compiled) continue
        output.push({
            queryId: `${channel.channelId}|${allocation.surface}|search|${requestIndex + 1}`,
            channelId: channel.channelId,
            family: channel.family,
            sourceLayer: channel.sourceLayer,
            surface: allocation.surface,
            kind: 'SEARCH',
            requestIndex,
            targetCandidates: allocation.targetCandidates,
            failureIsolation: true,
            persist: false,
            request: compiled.request,
            compileReason: compiled.compileReason
        })
    }
    return output
}

export function compileCandidateChannelQueriesV5(input: {
    channels: CandidateChannelV5[]
}) {
    const queries = input.channels.flatMap((channel) =>
        channel.providerAllocations.flatMap((allocation) =>
            compileAllocation(channel, allocation)
        )
    )
    const network = queries.filter(
        (query) => query.surface !== 'local'
    )
    return {
        mode: 'PLAN_ONLY' as const,
        compilerVersion: CHANNEL_QUERY_COMPILER_VERSION,
        executionEnabled: false,
        persistenceEnabled: false,
        servingImpact: false,
        summary: {
            queryCount: queries.length,
            networkQueryCount: network.length,
            localQueryCount: queries.length - network.length,
            bySurface: {
                pica: queries.filter(
                    (query) => query.surface === 'pica'
                ).length,
                eh: queries.filter(
                    (query) => query.surface === 'eh'
                ).length,
                exh: queries.filter(
                    (query) => query.surface === 'exh'
                ).length,
                local: queries.filter(
                    (query) => query.surface === 'local'
                ).length
            },
            byKind: {
                SEARCH: queries.filter(
                    (query) => query.kind === 'SEARCH'
                ).length,
                RELATED: queries.filter(
                    (query) => query.kind === 'RELATED'
                ).length,
                LOCAL: queries.filter(
                    (query) => query.kind === 'LOCAL'
                ).length
            }
        },
        queries
    }
}
