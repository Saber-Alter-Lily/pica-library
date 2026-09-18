import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import type {
    UserEvent,
    V3EventType
} from '../../src/recommendation-v3/types'
import {
    BEHAVIOR_EVIDENCE_VERSION,
    buildBehaviorEvidenceLedgerV5,
    classifyBehaviorEventV5
} from '../../src/recommendation-v5/behavior-evidence'
import { defaultPortablePolicyStateV5 } from '../../src/recommendation-v5/portable-policy'

function event(
    eventType: V3EventType,
    comicId: string,
    input: Partial<UserEvent> = {}
): UserEvent {
    return {
        id: input.id ?? `${eventType}-${comicId}`,
        occurredAt:
            input.occurredAt ?? '2026-09-17T00:00:00.000Z',
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
        createdAt:
            input.createdAt ??
            input.occurredAt ??
            '2026-09-17T00:00:00.000Z'
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

describe('Recommendation V5 behavior evidence semantics', () => {
    it('keeps exposure neutral and separates download ownership from weak taste evidence', () => {
        const impression = classifyBehaviorEventV5(
            event('recommend_impression', 'comic-a')
        )
        expect(impression).toHaveLength(1)
        expect(impression[0]).toMatchObject({
            kind: 'EXPOSURE',
            polarity: 'NEUTRAL',
            strength: 'NONE'
        })

        const download = classifyBehaviorEventV5(
            event('download_complete', 'comic-a')
        )
        expect(download).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'OWNERSHIP',
                    strength: 'NONE'
                }),
                expect.objectContaining({
                    kind: 'TASTE',
                    polarity: 'POSITIVE',
                    strength: 'WEAK'
                })
            ])
        )
    })

    it('treats explicit feedback as authoritative taste evidence', () => {
        const ledger = buildBehaviorEvidenceLedgerV5(
            [
                event('recommend_like', 'comic-a', {
                    occurredAt: '2026-09-17T00:00:00.000Z'
                }),
                event('recommend_dislike', 'comic-a', {
                    id: 'dislike-later',
                    occurredAt: '2026-09-17T01:00:00.000Z'
                })
            ],
            [comic('comic-a', { isFavorite: true })],
            defaultPortablePolicyStateV5()
        )
        expect(ledger.evidenceVersion).toBe(BEHAVIOR_EVIDENCE_VERSION)
        expect(ledger.mode).toBe('SHADOW')
        expect(ledger.rankingImpact).toBe(false)
        expect(ledger.items[0]).toMatchObject({
            comicId: 'comic-a',
            explicitSentiment: 'DISLIKE',
            currentFavorite: true,
            tasteClass: 'EXPLICIT_NEGATIVE'
        })
    })

    it('upgrades repeated completed reading without treating a single open as strong preference', () => {
        const state = defaultPortablePolicyStateV5()
        const oneOpen = buildBehaviorEvidenceLedgerV5(
            [
                event('reader_open', 'comic-a', {
                    contextId: 'read-1'
                })
            ],
            [comic('comic-a')],
            state
        )
        expect(oneOpen.items[0].tasteClass).toBe('WEAK_POSITIVE')

        const oneComplete = buildBehaviorEvidenceLedgerV5(
            [
                event('reader_complete', 'comic-a', {
                    contextId: 'read-1'
                })
            ],
            [comic('comic-a')],
            state
        )
        expect(oneComplete.items[0]).toMatchObject({
            completedReadContexts: 1,
            tasteClass: 'POSITIVE'
        })

        const repeated = buildBehaviorEvidenceLedgerV5(
            [
                event('reader_complete', 'comic-a', {
                    id: 'complete-1',
                    contextId: 'read-1'
                }),
                event('reader_complete', 'comic-a', {
                    id: 'complete-2',
                    contextId: 'read-2',
                    occurredAt: '2026-09-18T00:00:00.000Z'
                })
            ],
            [comic('comic-a')],
            state
        )
        expect(repeated.items[0]).toMatchObject({
            completedReadContexts: 2,
            tasteClass: 'STRONG_POSITIVE'
        })
    })

    it('keeps ownership and taste-profile exclusion orthogonal', () => {
        const state = {
            ...defaultPortablePolicyStateV5(),
            ownedComicIds: ['comic-owned'],
            seenComicIds: ['comic-seen'],
            tasteExcludedComicIds: ['comic-favorite']
        }
        const ledger = buildBehaviorEvidenceLedgerV5(
            [
                event('recommend_impression', 'comic-seen', {
                    contextId: 'batch-1'
                })
            ],
            [
                comic('comic-owned'),
                comic('comic-seen'),
                comic('comic-favorite', {
                    isFavorite: true,
                    downloadedPictures: 12,
                    inLibrary: true
                })
            ],
            state
        )
        const byId = new Map(
            ledger.items.map((item) => [item.comicId, item])
        )
        expect(byId.get('comic-owned')).toMatchObject({
            ownership: true,
            tasteClass: 'UNKNOWN'
        })
        expect(byId.get('comic-seen')).toMatchObject({
            exposureCount: 2,
            tasteClass: 'UNKNOWN'
        })
        expect(byId.get('comic-favorite')).toMatchObject({
            ownership: true,
            currentFavorite: true,
            currentDownloaded: true,
            tasteExcluded: true,
            tasteClass: 'EXCLUDED'
        })
    })
})
