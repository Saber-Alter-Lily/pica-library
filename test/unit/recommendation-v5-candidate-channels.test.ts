import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import type {
    UserEvent,
    V3EventType
} from '../../src/recommendation-v3/types'
import {
    buildCandidateChannelPlanV5,
    CANDIDATE_CHANNEL_PLANNER_VERSION
} from '../../src/recommendation-v5/candidate-channels'
import { buildPreferenceTimescalesV5 } from '../../src/recommendation-v5/preference-timescales'
import { defaultPortablePolicyStateV5 } from '../../src/recommendation-v5/portable-policy'

const NOW = new Date('2026-09-17T12:00:00.000Z')

function event(
    eventType: V3EventType,
    comicId: string,
    occurredAt: string,
    input: Partial<UserEvent> = {}
): UserEvent {
    return {
        id: input.id ?? `${eventType}-${comicId}-${occurredAt}`,
        occurredAt,
        eventType,
        comicId,
        source: input.source ?? 'test',
        appSessionId: input.appSessionId ?? null,
        contextId: input.contextId ?? null,
        recommendationCycleId:
            input.recommendationCycleId ?? null,
        recommendationSessionId:
            input.recommendationSessionId ?? null,
        recommendationBatchIndex:
            input.recommendationBatchIndex ?? null,
        rankPosition: input.rankPosition ?? null,
        metadata: input.metadata ?? {},
        dedupeKey: input.dedupeKey ?? null,
        createdAt: input.createdAt ?? occurredAt
    }
}

function comic(
    comicId: string,
    input: Partial<StoredComic> = {}
): StoredComic {
    return {
        comicId,
        title: input.title ?? comicId,
        author: input.author ?? 'Author',
        canonicalAuthor:
            input.canonicalAuthor ?? input.author ?? 'Author',
        circle: input.circle ?? null,
        authorId: input.authorId ?? null,
        tags: input.tags ?? [],
        categories: input.categories ?? [],
        finished: input.finished ?? true,
        isFavorite: input.isFavorite ?? false,
        firstSeenAt:
            input.firstSeenAt ?? '2026-01-01T00:00:00.000Z',
        lastSeenAt:
            input.lastSeenAt ?? '2026-01-01T00:00:00.000Z',
        knownEpisodes: input.knownEpisodes ?? 1,
        knownPictures: input.knownPictures ?? 0,
        downloadedPictures: input.downloadedPictures ?? 0,
        pagesCount: input.pagesCount ?? 0,
        inLibrary: input.inLibrary ?? false
    } as StoredComic
}

describe('Recommendation V5 candidate channel planner', () => {
    it('plans independent multi-channel retrieval from P2C layers without serving impact', () => {
        const catalog = [
            comic('fav-old', {
                title: 'Old Favorite',
                author: 'Alice',
                tags: ['Series X', 'tag-a'],
                categories: ['Fantasy'],
                isFavorite: true,
                inLibrary: true
            }),
            comic('recent-1', {
                title: 'Recent Read',
                author: 'Bob',
                tags: ['tag-b'],
                categories: ['Drama']
            })
        ]
        const state = {
            ...defaultPortablePolicyStateV5(),
            controls: [
                {
                    targetType: 'TAG' as const,
                    key: 'Series X',
                    label: 'Series X',
                    direction: 'MORE' as const,
                    scope: 'PERSISTENT' as const,
                    source: 'DESKTOP' as const,
                    updatedAt: NOW.toISOString(),
                    levelDelta: 3
                }
            ],
            sessionIntent: {
                mode: 'TARGET' as const,
                targetType: 'AUTHOR' as const,
                key: 'Alice',
                label: 'Alice',
                source: 'DESKTOP' as const,
                updatedAt: NOW.toISOString()
            }
        }
        const timescales = buildPreferenceTimescalesV5(
            [
                event(
                    'reader_complete',
                    'recent-1',
                    '2026-09-16T12:00:00.000Z',
                    {
                        appSessionId: 'session-1',
                        contextId: 'reader-session'
                    }
                )
            ],
            catalog,
            state,
            {
                now: NOW,
                appSessionId: 'session-1'
            }
        )
        const plan = buildCandidateChannelPlanV5({
            timescales,
            policy: state,
            catalog,
            tagFacets: {
                'series x': 'FANDOM_IP'
            },
            providerEligibility: {
                pica: true,
                eh: true,
                exh: false
            },
            visualEligible: true
        })

        expect(plan.mode).toBe('SHADOW')
        expect(plan.plannerVersion).toBe(
            CANDIDATE_CHANNEL_PLANNER_VERSION
        )
        expect(plan.servingImpact).toBe(false)
        expect(plan.providerFailureIsolation).toBe(true)
        expect(plan.summary.families.TARGET).toBe(1)
        expect(plan.summary.families.FANDOM).toBeGreaterThan(0)
        expect(plan.summary.families.AUTHOR).toBeGreaterThan(0)
        expect(plan.summary.families.RELATED).toBeGreaterThan(0)
        expect(plan.summary.families.REDISCOVERY).toBe(1)
        expect(plan.providerBudgets.pica.plannedRequests).toBeGreaterThan(0)
        expect(plan.providerBudgets.eh.plannedRequests).toBeGreaterThan(0)
        expect(plan.providerBudgets.exh.plannedRequests).toBe(0)

        const target = plan.channels.find(
            (channel) => channel.family === 'TARGET'
        )
        expect(target?.providerAllocations.find(
            (item) => item.surface === 'pica'
        )?.strategy).toBe('AUTHOR')

        const visual = plan.channels.find(
            (channel) => channel.family === 'VISUAL'
        )
        expect(visual).toMatchObject({
            enabled: false,
            disabledReason: 'P4_ACTIVATION_NOT_AUTHORIZED'
        })
        expect(
            plan.channels.flatMap(
                (channel) => channel.providerAllocations
            ).every((item) => item.failureIsolation)
        ).toBe(true)
    })

    it('keeps provider budgets isolated when one provider is disabled', () => {
        const catalog = [
            comic('fav', {
                author: 'Alice',
                tags: ['tag-a', 'tag-b'],
                categories: ['Fantasy'],
                isFavorite: true
            })
        ]
        const state = defaultPortablePolicyStateV5()
        const timescales = buildPreferenceTimescalesV5(
            [],
            catalog,
            state,
            { now: NOW }
        )
        const withEh = buildCandidateChannelPlanV5({
            timescales,
            policy: state,
            catalog,
            providerEligibility: {
                pica: true,
                eh: true,
                exh: false
            }
        })
        const withoutEh = buildCandidateChannelPlanV5({
            timescales,
            policy: state,
            catalog,
            providerEligibility: {
                pica: true,
                eh: false,
                exh: false
            }
        })

        expect(withoutEh.providerBudgets.eh).toMatchObject({
            eligible: false,
            plannedRequests: 0
        })
        expect(withoutEh.providerBudgets.pica.plannedRequests).toBe(
            withEh.providerBudgets.pica.plannedRequests
        )
        expect(withoutEh.providerBudgets.pica.plannedRequests).toBeLessThanOrEqual(
            withoutEh.providerBudgets.pica.maxRequests
        )
    })

    it('applies BLOCK as a hard retrieval constraint and LESS only as a soft downweight', () => {
        const catalog = [
            comic('fav', {
                author: 'Artist',
                tags: ['blocked-tag', 'boost-tag'],
                isFavorite: true
            })
        ]
        const state = {
            ...defaultPortablePolicyStateV5(),
            controls: [
                {
                    targetType: 'TAG' as const,
                    key: 'blocked-tag',
                    label: 'Blocked',
                    direction: 'BLOCK' as const,
                    scope: 'PERSISTENT' as const,
                    source: 'DESKTOP' as const,
                    updatedAt: NOW.toISOString()
                },
                {
                    targetType: 'AUTHOR' as const,
                    key: 'Artist',
                    label: 'Artist',
                    direction: 'LESS' as const,
                    scope: 'PERSISTENT' as const,
                    source: 'DESKTOP' as const,
                    updatedAt: NOW.toISOString(),
                    levelDelta: -3
                },
                {
                    targetType: 'TAG' as const,
                    key: 'boost-tag',
                    label: 'Boost',
                    direction: 'MORE' as const,
                    scope: 'PERSISTENT' as const,
                    source: 'DESKTOP' as const,
                    updatedAt: NOW.toISOString(),
                    levelDelta: 2
                }
            ]
        }
        const timescales = buildPreferenceTimescalesV5(
            [],
            catalog,
            state,
            { now: NOW }
        )
        const plan = buildCandidateChannelPlanV5({
            timescales,
            policy: state,
            catalog
        })

        expect(plan.controlEffects.hardBlockedTargets).toContain(
            'TAG:blocked-tag'
        )
        expect(plan.controlEffects.softDownweights).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    targetType: 'AUTHOR',
                    key: 'artist',
                    levelDelta: -3
                })
            ])
        )
        expect(
            plan.channels.some((channel) =>
                channel.anchors.some(
                    (anchor) => anchor.key === 'blocked-tag'
                )
            )
        ).toBe(false)
        expect(
            plan.channels.some((channel) =>
                channel.anchors.some(
                    (anchor) => anchor.key === 'boost-tag'
                )
            )
        ).toBe(true)
    })

    it('raises exploration above lifetime channels only in EXPLORE mode', () => {
        const catalog = [
            comic('fav-a', {
                author: 'Alice',
                tags: ['tail-a', 'common'],
                isFavorite: true
            }),
            comic('fav-b', {
                author: 'Alice',
                tags: ['common'],
                isFavorite: true
            })
        ]
        const state = {
            ...defaultPortablePolicyStateV5(),
            sessionIntent: {
                mode: 'EXPLORE' as const,
                source: 'DESKTOP' as const,
                updatedAt: NOW.toISOString()
            }
        }
        const timescales = buildPreferenceTimescalesV5(
            [],
            catalog,
            state,
            { now: NOW }
        )
        const plan = buildCandidateChannelPlanV5({
            timescales,
            policy: state,
            catalog
        })
        const exploration = plan.channels.find(
            (channel) => channel.family === 'EXPLORATION'
        )
        const lifetime = plan.channels.find(
            (channel) =>
                channel.sourceLayer === 'LIFETIME' &&
                channel.family === 'TAG'
        )
        expect(exploration).toBeTruthy()
        expect(lifetime).toBeTruthy()
        expect(exploration!.priority).toBeGreaterThan(
            lifetime!.priority
        )
    })

    it('keeps rediscovery local and excludes recently active or taste-excluded favorites', () => {
        const catalog = [
            comic('old-favorite', {
                isFavorite: true,
                inLibrary: true,
                lastSeenAt: '2025-01-01T00:00:00.000Z'
            }),
            comic('recent-favorite', {
                isFavorite: true,
                inLibrary: true,
                lastSeenAt: '2026-09-16T00:00:00.000Z'
            }),
            comic('excluded-favorite', {
                isFavorite: true,
                inLibrary: true,
                lastSeenAt: '2025-02-01T00:00:00.000Z'
            })
        ]
        const state = {
            ...defaultPortablePolicyStateV5(),
            tasteExcludedComicIds: ['excluded-favorite']
        }
        const timescales = buildPreferenceTimescalesV5(
            [
                event(
                    'reader_complete',
                    'recent-favorite',
                    '2026-09-16T12:00:00.000Z'
                )
            ],
            catalog,
            state,
            { now: NOW }
        )
        const plan = buildCandidateChannelPlanV5({
            timescales,
            policy: state,
            catalog
        })
        const rediscovery = plan.channels.find(
            (channel) => channel.family === 'REDISCOVERY'
        )
        expect(rediscovery?.providerAllocations).toEqual([
            expect.objectContaining({
                surface: 'local',
                strategy: 'LOCAL',
                plannedRequests: 0
            })
        ])
        expect(rediscovery?.localCandidateIds).toContain('old-favorite')
        expect(rediscovery?.localCandidateIds).not.toContain(
            'recent-favorite'
        )
        expect(rediscovery?.localCandidateIds).not.toContain(
            'excluded-favorite'
        )
    })
})
