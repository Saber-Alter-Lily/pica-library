import { describe, expect, it } from 'vitest'
import type {
    FavoriteRecord,
    StoredComic
} from '../../src/library/types'
import {
    applyCandidateHygieneV5,
    CANDIDATE_HYGIENE_V5_VERSION
} from '../../src/recommendation-v5/candidate-hygiene'
import { defaultPortablePolicyStateV5 } from '../../src/recommendation-v5/portable-policy'
import type { ShadowRetrievedCandidateV5 } from '../../src/recommendation-v5/shadow-retrieval'

const NOW = new Date('2026-09-17T12:00:00.000Z')

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
        providerId: input.providerId,
        providerRemoteId: input.providerRemoteId,
        providerMetadata: input.providerMetadata
    }
}

function stored(
    comicId: string,
    input: Partial<StoredComic> = {}
): StoredComic {
    return {
        ...record(comicId, input),
        canonicalAuthor:
            input.canonicalAuthor ?? input.author ?? 'Artist',
        circle: input.circle ?? null,
        authorId: input.authorId ?? null,
        isFavorite: input.isFavorite ?? false,
        firstSeenAt:
            input.firstSeenAt ?? '2026-01-01T00:00:00.000Z',
        lastSeenAt:
            input.lastSeenAt ?? '2026-01-01T00:00:00.000Z',
        knownEpisodes: input.knownEpisodes ?? 1,
        knownPictures:
            input.knownPictures ?? input.pagesCount ?? 100,
        downloadedPictures: input.downloadedPictures ?? 0,
        inLibrary: input.inLibrary ?? false
    } as StoredComic
}

function candidate(
    comicId: string,
    input: Partial<FavoriteRecord> = {}
): ShadowRetrievedCandidateV5 {
    return {
        comic: record(comicId, input),
        evidence: {
            routeIds: ['route'],
            channelIds: ['channel'],
            surfaces: ['pica'],
            families: ['TAG'],
            sourceLayers: ['LIFETIME'],
            precisions: ['PROVIDER_NATIVE'],
            maxPriority: 60
        }
    }
}

describe('Recommendation V5 candidate hygiene', () => {
    it('removes exact owned uploads and high-confidence same-work variants', () => {
        const catalog = [
            stored('owned-a', {
                title: 'Work Title',
                author: 'Artist',
                pagesCount: 100,
                isFavorite: true
            })
        ]
        const result = applyCandidateHygieneV5(
            [
                candidate('owned-a', {
                    title: 'Work Title',
                    author: 'Artist',
                    pagesCount: 100
                }),
                candidate('eh-variant', {
                    title: '[Chinese] Work Title',
                    author: 'Artist',
                    pagesCount: 102,
                    providerId: 'eh'
                }),
                candidate('distinct', {
                    title: 'Different Work',
                    author: 'Artist',
                    pagesCount: 80
                })
            ],
            catalog,
            defaultPortablePolicyStateV5(),
            NOW
        )

        expect(result.hygieneVersion).toBe(
            CANDIDATE_HYGIENE_V5_VERSION
        )
        expect(result.mode).toBe('SHADOW')
        expect(result.servingImpact).toBe(false)
        expect(result.tasteNegativeHardFiltered).toBe(false)
        expect(
            result.candidates.map((item) => item.comic.comicId)
        ).toEqual(['distinct'])
        expect(result.telemetry.reasonCounts.OWNED_UPLOAD).toBe(1)
        expect(result.telemetry.reasonCounts.OWNED_WORK).toBe(1)
    })

    it('respects explicit keep-separate identity overrides', () => {
        const catalog = [
            stored('owned-a', {
                title: 'Same Work',
                author: 'Artist',
                pagesCount: 100,
                isFavorite: true
            })
        ]
        const state = {
            ...defaultPortablePolicyStateV5(),
            explicitDistinctPairs: ['candidate-b\u0000owned-a']
        }
        const result = applyCandidateHygieneV5(
            [
                candidate('candidate-b', {
                    title: 'Same Work',
                    author: 'Artist',
                    pagesCount: 100
                })
            ],
            catalog,
            state,
            NOW
        )
        expect(result.outputCandidateCount).toBe(1)
        expect(result.removals).toHaveLength(0)
    })

    it('keeps taste downweights soft while enforcing BLOCK and factual suppression', () => {
        const state = {
            ...defaultPortablePolicyStateV5(),
            seenComicIds: ['seen'],
            duplicateReportComicIds: ['duplicate'],
            hardSuppressComicIds: ['hard'],
            temporarySuppressions: [
                {
                    comicId: 'temporary',
                    createdAt: '2026-09-16T00:00:00.000Z',
                    expiresAt: '2026-10-16T00:00:00.000Z'
                },
                {
                    comicId: 'expired',
                    createdAt: '2026-08-01T00:00:00.000Z',
                    expiresAt: '2026-09-01T00:00:00.000Z'
                }
            ],
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
                    key: 'soft artist',
                    label: 'Soft Artist',
                    direction: 'LESS' as const,
                    scope: 'PERSISTENT' as const,
                    source: 'DESKTOP' as const,
                    updatedAt: NOW.toISOString(),
                    levelDelta: -5
                }
            ]
        }
        const result = applyCandidateHygieneV5(
            [
                candidate('seen'),
                candidate('duplicate'),
                candidate('hard'),
                candidate('temporary'),
                candidate('expired'),
                candidate('blocked', {
                    tags: ['blocked-tag']
                }),
                candidate('soft-less', {
                    author: 'Soft Artist'
                })
            ],
            [],
            state,
            NOW
        )

        expect(
            result.candidates.map((item) => item.comic.comicId)
        ).toEqual(
            expect.arrayContaining(['expired', 'soft-less'])
        )
        expect(
            result.candidates.map((item) => item.comic.comicId)
        ).not.toEqual(
            expect.arrayContaining([
                'seen',
                'duplicate',
                'hard',
                'temporary',
                'blocked'
            ])
        )
        expect(result.telemetry.reasonCounts.ALREADY_SEEN).toBe(1)
        expect(result.telemetry.reasonCounts.DUPLICATE_REPORT).toBe(1)
        expect(result.telemetry.reasonCounts.HARD_SUPPRESS).toBe(1)
        expect(
            result.telemetry.reasonCounts.TEMPORARY_SUPPRESSION
        ).toBe(1)
        expect(result.telemetry.reasonCounts.BLOCK_CONTROL).toBe(1)
    })

    it('deduplicates the shadow pool at work level while preserving stable first evidence', () => {
        const result = applyCandidateHygieneV5(
            [
                candidate('pica-a', {
                    title: 'Same Work',
                    author: 'Artist',
                    pagesCount: 100
                }),
                candidate('eh-b', {
                    title: '[English] Same Work',
                    author: 'Artist',
                    pagesCount: 102,
                    providerId: 'eh'
                }),
                candidate('other', {
                    title: 'Other',
                    author: 'Artist'
                })
            ],
            [],
            defaultPortablePolicyStateV5(),
            NOW
        )
        expect(
            result.candidates.map((item) => item.comic.comicId)
        ).toEqual(['pica-a', 'other'])
        expect(
            result.telemetry.reasonCounts.DUPLICATE_WORK_IN_POOL
        ).toBe(1)
        expect(result.removals[0]).toMatchObject({
            comicId: 'eh-b',
            reason: 'DUPLICATE_WORK_IN_POOL',
            matchedComicId: 'pica-a'
        })
    })

    it('filters explicit ownership even when the owned item is not yet present in the catalog', () => {
        const state = {
            ...defaultPortablePolicyStateV5(),
            ownedComicIds: ['remote-owned']
        }
        const result = applyCandidateHygieneV5(
            [candidate('remote-owned')],
            [],
            state,
            NOW
        )
        expect(result.outputCandidateCount).toBe(0)
        expect(result.removals[0]).toMatchObject({
            comicId: 'remote-owned',
            reason: 'EXPLICIT_OWNED'
        })
    })
})
