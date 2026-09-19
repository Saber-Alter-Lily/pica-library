import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import type {
    UserEvent,
    V3EventType
} from '../../src/recommendation-v3/types'
import {
    buildPreferenceTimescalesV5,
    PREFERENCE_TIMESCALE_VERSION
} from '../../src/recommendation-v5/preference-timescales'
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
            input.lastSeenAt ?? '2026-09-17T00:00:00.000Z',
        knownEpisodes: input.knownEpisodes ?? 1,
        knownPictures: input.knownPictures ?? 0,
        downloadedPictures: input.downloadedPictures ?? 0,
        pagesCount: input.pagesCount ?? 0,
        inLibrary: input.inLibrary ?? false
    } as StoredComic
}

describe('Recommendation V5 multi-timescale preference shadow', () => {
    it('keeps lifetime collection evidence separate from timestamped recent windows', () => {
        const state = defaultPortablePolicyStateV5()
        const result = buildPreferenceTimescalesV5(
            [
                event(
                    'reader_complete',
                    'recent-7',
                    '2026-09-14T12:00:00.000Z'
                ),
                event(
                    'favorite_add',
                    'recent-30',
                    '2026-08-28T12:00:00.000Z'
                ),
                event(
                    'reader_complete',
                    'recent-90',
                    '2026-07-19T12:00:00.000Z'
                )
            ],
            [
                comic('lifetime-only', {
                    isFavorite: true,
                    author: 'Lifetime Author',
                    tags: ['lifetime-tag']
                }),
                comic('recent-7', {
                    author: 'Seven Day Author',
                    tags: ['seven-day']
                }),
                comic('recent-30', {
                    author: 'Thirty Day Author',
                    tags: ['thirty-day']
                }),
                comic('recent-90', {
                    author: 'Ninety Day Author',
                    tags: ['ninety-day']
                })
            ],
            state,
            { now: NOW }
        )

        expect(result.preferenceVersion).toBe(
            PREFERENCE_TIMESCALE_VERSION
        )
        expect(result.mode).toBe('SHADOW')
        expect(result.rankingImpact).toBe(false)
        expect(
            result.layers.inferred.lifetime.itemScores.map(
                (item) => item.comicId
            )
        ).toContain('lifetime-only')
        expect(
            result.layers.inferred.days7.itemScores.map(
                (item) => item.comicId
            )
        ).toEqual(['recent-7'])
        expect(
            result.layers.inferred.days30.itemScores.map(
                (item) => item.comicId
            )
        ).toEqual(
            expect.arrayContaining(['recent-7', 'recent-30'])
        )
        expect(
            result.layers.inferred.days90.itemScores.map(
                (item) => item.comicId
            )
        ).toEqual(
            expect.arrayContaining([
                'recent-7',
                'recent-30',
                'recent-90'
            ])
        )
    })

    it('builds session intent from only the requested app session', () => {
        const result = buildPreferenceTimescalesV5(
            [
                event(
                    'reader_complete',
                    'session-a',
                    '2026-09-17T10:00:00.000Z',
                    { appSessionId: 'session-1' }
                ),
                event(
                    'reader_complete',
                    'session-b',
                    '2026-09-17T11:00:00.000Z',
                    { appSessionId: 'session-2' }
                )
            ],
            [
                comic('session-a', { tags: ['alpha'] }),
                comic('session-b', { tags: ['beta'] })
            ],
            defaultPortablePolicyStateV5(),
            {
                appSessionId: 'session-1',
                now: NOW
            }
        )
        expect(
            result.layers.inferred.session.itemScores
        ).toMatchObject([
            {
                comicId: 'session-a',
                score: 0.6
            }
        ])
        expect(
            result.layers.inferred.session.positive.tags.map(
                (item) => item.key
            )
        ).toContain('alpha')
        expect(
            result.layers.inferred.session.positive.tags.map(
                (item) => item.key
            )
        ).not.toContain('beta')
    })

    it('keeps explicit controls and hard constraints as independent layers', () => {
        const state = {
            ...defaultPortablePolicyStateV5(),
            controls: [
                {
                    targetType: 'TAG' as const,
                    key: 'romance',
                    label: 'Romance',
                    direction: 'MORE' as const,
                    scope: 'PERSISTENT' as const,
                    source: 'DESKTOP' as const,
                    updatedAt: NOW.toISOString(),
                    levelDelta: 3
                },
                {
                    targetType: 'AUTHOR' as const,
                    key: 'artist',
                    label: 'Artist',
                    direction: 'MORE' as const,
                    scope: 'SESSION' as const,
                    source: 'ANDROID' as const,
                    updatedAt: NOW.toISOString(),
                    levelDelta: 2
                },
                {
                    targetType: 'TAG' as const,
                    key: 'blocked-tag',
                    label: 'Blocked',
                    direction: 'BLOCK' as const,
                    scope: 'PERSISTENT' as const,
                    source: 'DESKTOP' as const,
                    updatedAt: NOW.toISOString()
                }
            ],
            hardSuppressComicIds: ['hard-comic'],
            temporarySuppressions: [
                {
                    comicId: 'temporary-comic',
                    createdAt: '2026-09-16T12:00:00.000Z',
                    expiresAt: '2026-10-16T12:00:00.000Z'
                }
            ],
            sessionIntent: {
                mode: 'RECENT' as const,
                source: 'DESKTOP' as const,
                updatedAt: NOW.toISOString()
            }
        }
        const result = buildPreferenceTimescalesV5(
            [],
            [],
            state,
            { now: NOW }
        )

        expect(
            result.layers.explicit.persistentControls
        ).toHaveLength(2)
        expect(result.layers.explicit.sessionControls).toHaveLength(1)
        expect(result.layers.explicit.sessionIntent.mode).toBe('RECENT')
        expect(
            result.layers.hardConstraints.blockedTargets
        ).toHaveLength(1)
        expect(
            result.layers.hardConstraints.hardSuppressComicIds
        ).toEqual(['hard-comic'])
        expect(
            result.layers.hardConstraints.activeTemporarySuppressions
        ).toHaveLength(1)
        expect(result.diagnostics.hardConstraintCount).toBe(3)
    })

    it('keeps explicit dislike visible across lifetime and recent windows without promoting it to a hard constraint', () => {
        const result = buildPreferenceTimescalesV5(
            [
                event(
                    'recommend_dislike',
                    'comic-a',
                    '2026-09-16T12:00:00.000Z'
                )
            ],
            [
                comic('comic-a', {
                    isFavorite: true,
                    author: 'Artist A',
                    tags: ['tag-a']
                })
            ],
            defaultPortablePolicyStateV5(),
            { now: NOW }
        )
        expect(
            result.layers.inferred.lifetime.itemScores[0]
        ).toMatchObject({
            comicId: 'comic-a',
            score: -1
        })
        expect(
            result.layers.inferred.days7.itemScores[0]
        ).toMatchObject({
            comicId: 'comic-a',
            score: -1
        })
        expect(
            result.layers.inferred.days7.negative.tags.map(
                (item) => item.key
            )
        ).toContain('tag-a')
        expect(result.diagnostics.hardConstraintCount).toBe(0)
    })
})
