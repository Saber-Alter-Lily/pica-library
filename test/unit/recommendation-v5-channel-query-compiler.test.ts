import { describe, expect, it } from 'vitest'
import type {
    CandidateChannelV5,
    CandidateProviderAllocationV5
} from '../../src/recommendation-v5/candidate-channels'
import {
    CHANNEL_QUERY_COMPILER_VERSION,
    compileCandidateChannelQueriesV5
} from '../../src/recommendation-v5/channel-query-compiler'

function allocation(
    surface: CandidateProviderAllocationV5['surface'],
    strategy: CandidateProviderAllocationV5['strategy'],
    input: Partial<CandidateProviderAllocationV5> = {}
): CandidateProviderAllocationV5 {
    return {
        surface,
        eligible: input.eligible ?? true,
        plannedRequests: input.plannedRequests ?? (surface === 'local' ? 0 : 1),
        targetCandidates: input.targetCandidates ?? 30,
        strategy,
        failureIsolation: true,
        ...(input.disabledReason
            ? { disabledReason: input.disabledReason }
            : {})
    }
}

function channel(
    input: Partial<CandidateChannelV5> &
        Pick<CandidateChannelV5, 'channelId' | 'family'>
): CandidateChannelV5 {
    return {
        channelId: input.channelId,
        family: input.family,
        sourceLayer: input.sourceLayer ?? 'LIFETIME',
        priority: input.priority ?? 60,
        anchors: input.anchors ?? [],
        exploration: input.exploration ?? false,
        reasonCode: input.reasonCode ?? 'TEST',
        providerAllocations: input.providerAllocations ?? [],
        enabled: input.enabled ?? true,
        ...(input.disabledReason
            ? { disabledReason: input.disabledReason }
            : {}),
        ...(input.localCandidateIds
            ? { localCandidateIds: input.localCandidateIds }
            : {})
    }
}

describe('Recommendation V5 channel query compiler', () => {
    it('compiles provider-specific author and fandom syntax without executing requests', () => {
        const plan = compileCandidateChannelQueriesV5({
            channels: [
                channel({
                    channelId: 'target-author',
                    family: 'TARGET',
                    sourceLayer: 'EXPLICIT_SESSION',
                    anchors: [
                        {
                            targetType: 'AUTHOR',
                            key: 'alice',
                            label: '"Alice"\n'
                        }
                    ],
                    providerAllocations: [
                        allocation('pica', 'AUTHOR'),
                        allocation('eh', 'AUTHOR'),
                        allocation('exh', 'AUTHOR', {
                            eligible: false,
                            plannedRequests: 0
                        })
                    ]
                }),
                channel({
                    channelId: 'fandom',
                    family: 'FANDOM',
                    anchors: [
                        {
                            targetType: 'FANDOM',
                            key: 'series x',
                            label: 'Series X',
                            facet: 'FANDOM_IP'
                        }
                    ],
                    providerAllocations: [
                        allocation('pica', 'KEYWORD'),
                        allocation('eh', 'KEYWORD')
                    ]
                })
            ]
        })

        expect(plan.mode).toBe('PLAN_ONLY')
        expect(plan.compilerVersion).toBe(
            CHANNEL_QUERY_COMPILER_VERSION
        )
        expect(plan.executionEnabled).toBe(false)
        expect(plan.persistenceEnabled).toBe(false)
        expect(plan.servingImpact).toBe(false)

        const picaAuthor = plan.queries.find(
            (item) =>
                item.channelId === 'target-author' &&
                item.surface === 'pica'
        )
        expect(picaAuthor).toMatchObject({
            kind: 'SEARCH',
            persist: false,
            compileReason: 'PICA_AUTHOR_KEYWORD',
            request: {
                keyword: 'Alice',
                page: 1
            }
        })

        const ehAuthor = plan.queries.find(
            (item) =>
                item.channelId === 'target-author' &&
                item.surface === 'eh'
        )
        expect(ehAuthor).toMatchObject({
            kind: 'SEARCH',
            persist: false,
            compileReason: 'EH_EXACT_NAMESPACED_TAG',
            request: {
                surface: 'eh',
                tags: ['artist:Alice']
            }
        })

        const picaFandom = plan.queries.find(
            (item) =>
                item.channelId === 'fandom' &&
                item.surface === 'pica'
        )
        expect(picaFandom?.request).toMatchObject({
            tags: ['Series X'],
            page: 1
        })

        const ehFandom = plan.queries.find(
            (item) =>
                item.channelId === 'fandom' &&
                item.surface === 'eh'
        )
        expect(ehFandom?.request).toMatchObject({
            surface: 'eh',
            tags: ['parody:Series X']
        })
        expect(plan.summary.bySurface.exh).toBe(0)
    })

    it('compiles category, exploration, related, and local rediscovery by provider capability', () => {
        const plan = compileCandidateChannelQueriesV5({
            channels: [
                channel({
                    channelId: 'category',
                    family: 'CATEGORY',
                    anchors: [
                        {
                            targetType: 'CATEGORY',
                            key: 'fantasy',
                            label: 'Fantasy'
                        }
                    ],
                    providerAllocations: [
                        allocation('pica', 'KEYWORD'),
                        allocation('eh', 'KEYWORD')
                    ]
                }),
                channel({
                    channelId: 'explore',
                    family: 'EXPLORATION',
                    sourceLayer: 'SYSTEM',
                    exploration: true,
                    anchors: [
                        {
                            targetType: 'TAG',
                            key: 'tail',
                            label: 'tail'
                        }
                    ],
                    providerAllocations: [
                        allocation('pica', 'POPULAR'),
                        allocation('eh', 'POPULAR')
                    ]
                }),
                channel({
                    channelId: 'related',
                    family: 'RELATED',
                    anchors: [
                        {
                            targetType: 'ITEM',
                            key: 'pica:seed',
                            label: 'Seed'
                        }
                    ],
                    providerAllocations: [
                        allocation('pica', 'RELATED'),
                        allocation('eh', 'RELATED', {
                            eligible: false,
                            plannedRequests: 0,
                            disabledReason:
                                'RELATED_RETRIEVER_NOT_IMPLEMENTED'
                        })
                    ]
                }),
                channel({
                    channelId: 'rediscovery',
                    family: 'REDISCOVERY',
                    sourceLayer: 'SYSTEM',
                    localCandidateIds: ['old-1', 'old-2'],
                    providerAllocations: [
                        allocation('local', 'LOCAL', {
                            plannedRequests: 0,
                            targetCandidates: 2
                        })
                    ]
                }),
                channel({
                    channelId: 'visual',
                    family: 'VISUAL',
                    sourceLayer: 'SYSTEM',
                    enabled: false,
                    disabledReason: 'P4_ACTIVATION_NOT_AUTHORIZED',
                    anchors: [
                        {
                            targetType: 'STYLE_FAMILY',
                            key: 'visual-v1',
                            label: 'Visual V1'
                        }
                    ],
                    providerAllocations: [
                        allocation('local', 'VISUAL', {
                            eligible: false,
                            plannedRequests: 0
                        })
                    ]
                })
            ]
        })

        expect(
            plan.queries.find(
                (item) =>
                    item.channelId === 'category' &&
                    item.surface === 'pica'
            )?.request
        ).toMatchObject({
            categories: ['Fantasy'],
            page: 1
        })
        expect(
            plan.queries.find(
                (item) =>
                    item.channelId === 'category' &&
                    item.surface === 'eh'
            )?.request
        ).toMatchObject({
            surface: 'eh',
            categories: ['Fantasy']
        })
        expect(
            plan.queries.find(
                (item) =>
                    item.channelId === 'explore' &&
                    item.surface === 'pica'
            )
        ).toMatchObject({
            compileReason: 'PICA_LOVED_CATALOG_EXPLORATION',
            request: { page: 1 }
        })
        expect(
            plan.queries.find(
                (item) =>
                    item.channelId === 'explore' &&
                    item.surface === 'eh'
            )
        ).toMatchObject({
            compileReason: 'EH_POPULAR_EXPLORATION',
            request: { surface: 'eh', ehMode: 'popular' }
        })
        expect(
            plan.queries.find(
                (item) => item.channelId === 'related'
            )
        ).toMatchObject({
            surface: 'pica',
            kind: 'RELATED',
            comicSeedId: 'pica:seed'
        })
        expect(
            plan.queries.filter(
                (item) => item.channelId === 'related'
            )
        ).toHaveLength(1)
        expect(
            plan.queries.find(
                (item) => item.channelId === 'rediscovery'
            )
        ).toMatchObject({
            surface: 'local',
            kind: 'LOCAL',
            localCandidateIds: ['old-1', 'old-2']
        })
        expect(
            plan.queries.some(
                (item) => item.channelId === 'visual'
            )
        ).toBe(false)
    })

    it('honors planned request counts and never turns query compilation into persistence', () => {
        const plan = compileCandidateChannelQueriesV5({
            channels: [
                channel({
                    channelId: 'paged-tag',
                    family: 'TAG',
                    anchors: [
                        {
                            targetType: 'TAG',
                            key: 'tag-a',
                            label: 'tag-a'
                        }
                    ],
                    providerAllocations: [
                        allocation('pica', 'KEYWORD', {
                            plannedRequests: 2,
                            targetCandidates: 40
                        })
                    ]
                })
            ]
        })
        expect(plan.queries).toHaveLength(2)
        expect(
            plan.queries.map((item) => item.request?.page)
        ).toEqual([1, 2])
        expect(
            plan.queries.every(
                (item) =>
                    item.persist === false &&
                    item.failureIsolation === true
            )
        ).toBe(true)
    })
})
