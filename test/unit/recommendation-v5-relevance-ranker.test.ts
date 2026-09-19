import { describe, expect, it } from 'vitest'
import type {
    FavoriteRecord,
    StoredComic
} from '../../src/library/types'
import type {
    UserEvent,
    V3EventType
} from '../../src/recommendation-v3/types'
import {
    buildPreferenceTimescalesV5
} from '../../src/recommendation-v5/preference-timescales'
import {
    rankShadowCandidatesV5,
    RELEVANCE_RANKER_V5_VERSION
} from '../../src/recommendation-v5/relevance-ranker'
import {
    defaultPortablePolicyStateV5
} from '../../src/recommendation-v5/portable-policy'
import type {
    ShadowRetrievedCandidateV5
} from '../../src/recommendation-v5/shadow-retrieval'

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

function stored(
    comicId: string,
    input: Partial<StoredComic> = {}
): StoredComic {
    return {
        comicId,
        title: input.title ?? comicId,
        author: input.author ?? 'Artist',
        canonicalAuthor:
            input.canonicalAuthor ?? input.author ?? 'Artist',
        circle: input.circle ?? null,
        authorId: input.authorId ?? null,
        tags: input.tags ?? [],
        categories: input.categories ?? [],
        finished: input.finished ?? true,
        isFavorite: input.isFavorite ?? false,
        firstSeenAt:
            input.firstSeenAt ?? '2026-01-01T00:00:00.000Z',
        lastSeenAt:
            input.lastSeenAt ?? '2026-09-17T00:00:00.000Z',
        knownEpisodes: input.knownEpisodes ?? 1,
        knownPictures: input.knownPictures ?? 0,
        downloadedPictures: input.downloadedPictures ?? 0,
        pagesCount: input.pagesCount ?? 0,
        inLibrary: input.inLibrary ?? false
    } as StoredComic
}

function record(
    comicId: string,
    input: Partial<FavoriteRecord> = {}
): FavoriteRecord {
    return {
        comicId,
        title: input.title ?? comicId,
        author: input.author ?? 'Artist',
        categories: input.categories ?? [],
        tags: input.tags ?? [],
        finished: input.finished ?? true,
        pagesCount: input.pagesCount ?? 100,
        totalLikes: input.totalLikes,
        totalViews: input.totalViews,
        rating: input.rating,
        providerId: input.providerId
    }
}

function candidate(
    comicId: string,
    input: Partial<FavoriteRecord> = {},
    evidence: Partial<
        ShadowRetrievedCandidateV5['evidence']
    > = {}
): ShadowRetrievedCandidateV5 {
    return {
        comic: record(comicId, input),
        evidence: {
            routeIds: evidence.routeIds ?? ['route-a'],
            channelIds: evidence.channelIds ?? ['channel-a'],
            surfaces: evidence.surfaces ?? ['pica'],
            families: evidence.families ?? ['TAG'],
            sourceLayers: evidence.sourceLayers ?? ['LIFETIME'],
            precisions:
                evidence.precisions ?? ['PROVIDER_NATIVE'],
            providerRanks: evidence.providerRanks ?? [5],
            bestProviderRank:
                evidence.bestProviderRank ?? 5,
            maxPriority: evidence.maxPriority ?? 60
        }
    }
}

describe('Recommendation V5 explainable relevance ranker', () => {
    it('raises candidates matching current session and recent preference', () => {
        const catalog = [
            stored('session-seed', {
                author: 'Session Artist',
                tags: ['session-tag']
            }),
            stored('session-match', {
                author: 'Session Artist',
                tags: ['session-tag']
            }),
            stored('unrelated', {
                author: 'Other',
                tags: ['other-tag']
            })
        ]
        const state = defaultPortablePolicyStateV5()
        const timescales = buildPreferenceTimescalesV5(
            [
                event(
                    'reader_complete',
                    'session-seed',
                    '2026-09-17T10:00:00.000Z',
                    {
                        appSessionId: 'session-1',
                        contextId: 'read-session'
                    }
                )
            ],
            catalog,
            state,
            {
                appSessionId: 'session-1',
                now: NOW
            }
        )
        const result = rankShadowCandidatesV5(
            [
                candidate('unrelated', {
                    author: 'Other',
                    tags: ['other-tag']
                }),
                candidate('session-match', {
                    author: 'Session Artist',
                    tags: ['session-tag']
                })
            ],
            timescales,
            state,
            catalog
        )

        expect(result.rankerVersion).toBe(
            RELEVANCE_RANKER_V5_VERSION
        )
        expect(result.mode).toBe('SHADOW')
        expect(result.servingImpact).toBe(false)
        expect(result.learningToRank).toBe(false)
        expect(result.visualFeatureEnabled).toBe(false)
        expect(result.rows[0].comic.comicId).toBe(
            'session-match'
        )
        expect(result.rows[0].features.sessionAffinity).toBeGreaterThan(
            result.rows[1].features.sessionAffinity
        )
        expect(result.rows[0].reasons).toContain(
            'SESSION_AFFINITY'
        )
    })

    it('keeps MORE and LESS as explicit relevance corrections rather than filters', () => {
        const catalog = [
            stored('more', { author: 'More Artist' }),
            stored('less', { author: 'Less Artist' })
        ]
        const state = {
            ...defaultPortablePolicyStateV5(),
            controls: [
                {
                    targetType: 'AUTHOR' as const,
                    key: 'More Artist',
                    label: 'More Artist',
                    direction: 'MORE' as const,
                    scope: 'PERSISTENT' as const,
                    source: 'DESKTOP' as const,
                    updatedAt: NOW.toISOString(),
                    levelDelta: 4
                },
                {
                    targetType: 'AUTHOR' as const,
                    key: 'Less Artist',
                    label: 'Less Artist',
                    direction: 'LESS' as const,
                    scope: 'PERSISTENT' as const,
                    source: 'DESKTOP' as const,
                    updatedAt: NOW.toISOString(),
                    levelDelta: -4
                }
            ]
        }
        const timescales = buildPreferenceTimescalesV5(
            [],
            catalog,
            state,
            { now: NOW }
        )
        const result = rankShadowCandidatesV5(
            [
                candidate('less', { author: 'Less Artist' }),
                candidate('more', { author: 'More Artist' })
            ],
            timescales,
            state,
            catalog
        )

        expect(result.rows).toHaveLength(2)
        expect(result.rows[0].comic.comicId).toBe('more')
        expect(result.rows[0].features.explicitAdjustment).toBeGreaterThan(0)
        expect(result.rows[1].features.explicitAdjustment).toBeLessThan(0)
        expect(
            result.rows[0].reasons.some((reason) =>
                reason.startsWith('MORE_LEVEL:')
            )
        ).toBe(true)
        expect(
            result.rows[1].reasons.some((reason) =>
                reason.startsWith('LESS_LEVEL:')
            )
        ).toBe(true)
    })

    it('uses exact explicit dislike as strong negative item evidence without hard filtering it', () => {
        const catalog = [
            stored('disliked', {
                author: 'Artist',
                tags: ['tag-a']
            }),
            stored('neutral', {
                author: 'Artist',
                tags: ['tag-a']
            })
        ]
        const state = defaultPortablePolicyStateV5()
        const timescales = buildPreferenceTimescalesV5(
            [
                event(
                    'recommend_dislike',
                    'disliked',
                    '2026-09-17T11:00:00.000Z'
                )
            ],
            catalog,
            state,
            { now: NOW }
        )
        const result = rankShadowCandidatesV5(
            [
                candidate(
                    'disliked',
                    {
                        author: 'Artist',
                        tags: ['tag-a'],
                        totalLikes: 1_000_000,
                        totalViews: 5_000_000
                    },
                    {
                        bestProviderRank: 1,
                        providerRanks: [1],
                        maxPriority: 110,
                        precisions: ['EXACT_CANONICAL']
                    }
                ),
                candidate('neutral', {
                    author: 'Artist',
                    tags: ['tag-a']
                })
            ],
            timescales,
            state,
            catalog
        )

        const disliked = result.rows.find(
            (row) => row.comic.comicId === 'disliked'
        )!
        expect(disliked.features.exactItemEvidence).toBe(-1)
        expect(disliked.reasons).toContain(
            'EXACT_ITEM_NEGATIVE'
        )
        expect(result.rows).toHaveLength(2)
        expect(result.rows[0].comic.comicId).toBe('neutral')
    })

    it('rewards corroboration and exact provider binding only as bounded secondary evidence', () => {
        const catalog = [
            stored('corroborated'),
            stored('single')
        ]
        const state = defaultPortablePolicyStateV5()
        const timescales = buildPreferenceTimescalesV5(
            [],
            catalog,
            state,
            { now: NOW }
        )
        const result = rankShadowCandidatesV5(
            [
                candidate(
                    'single',
                    {},
                    {
                        routeIds: ['r1'],
                        precisions: ['FALLBACK_KEYWORD'],
                        bestProviderRank: 20,
                        providerRanks: [20]
                    }
                ),
                candidate(
                    'corroborated',
                    {},
                    {
                        routeIds: ['r1', 'r2', 'r3'],
                        surfaces: ['pica', 'eh'],
                        precisions: [
                            'PROVIDER_NATIVE',
                            'EXACT_CANONICAL'
                        ],
                        bestProviderRank: 2,
                        providerRanks: [2, 4, 6]
                    }
                )
            ],
            timescales,
            state,
            catalog
        )

        expect(result.rows[0].comic.comicId).toBe('corroborated')
        expect(result.rows[0].features.routeCorroboration).toBeGreaterThan(
            result.rows[1].features.routeCorroboration
        )
        expect(result.rows[0].features.providerPrecision).toBe(1)
        expect(result.rows[0].reasons).toContain(
            'MULTI_ROUTE_SUPPORT'
        )
        expect(result.rows[0].reasons).toContain(
            'EXACT_PROVIDER_BINDING'
        )
    })
})
