import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import { LibraryDatabase } from '../../src/library/database'
import {
    defaultPortablePolicyStateV5,
    filterCandidatesAgainstOwnedV5,
    isAlreadyOwnedWorkV5,
    normalizeControlV5,
    portableInferredSignalsV5,
    preferenceAdjustmentV5,
    preferenceBaselineLevelV5,
    upsertControlV5,
    workIdentityEvidenceV5
} from '../../src/recommendation-v5/portable-policy'
import { RecommendationPolicyStoreV5 } from '../../src/recommendation-v5/policy-store'

function comic(input: Partial<StoredComic> & Pick<StoredComic, 'comicId' | 'title'>): StoredComic {
    return {
        ...input,
        comicId: input.comicId,
        title: input.title,
        author: input.author ?? '',
        canonicalAuthor: input.canonicalAuthor ?? input.author ?? '',
        circle: input.circle ?? null,
        authorId: input.authorId ?? null,
        tags: input.tags ?? [],
        categories: input.categories ?? [],
        finished: input.finished ?? true,
        isFavorite: input.isFavorite ?? false,
        firstSeenAt: input.firstSeenAt ?? new Date(0).toISOString(),
        lastSeenAt: input.lastSeenAt ?? new Date(0).toISOString(),
        knownEpisodes: input.knownEpisodes ?? 1,
        knownPictures: input.knownPictures ?? input.pagesCount ?? 0,
        downloadedPictures: input.downloadedPictures ?? 0,
        pagesCount: input.pagesCount ?? 0,
        inLibrary: input.inLibrary ?? false
    } as StoredComic
}

describe('Recommendation V5 portable policy', () => {
    it('recognizes the exact upload identity', () => {
        const a = comic({ comicId: 'pica:1', title: 'A', author: 'X' })
        expect(workIdentityEvidenceV5(a, a).relation).toBe('EXACT_UPLOAD')
    })

    it('recognizes high-confidence cross-provider work identity', () => {
        const a = comic({ comicId: 'pica:1', title: 'Work Title', author: 'Artist', pagesCount: 24 })
        const b = comic({ comicId: 'eh:2', title: 'Work Title', author: 'Artist', pagesCount: 25 })
        expect(workIdentityEvidenceV5(a, b).relation).toBe('HIGH_CONFIDENCE_WORK')
    })

    it('removes common translation/upload noise only when page counts are compatible', () => {
        const a = comic({ comicId: 'pica:1', title: '[Chinese] Work Title', author: 'Artist', pagesCount: 24 })
        const b = comic({ comicId: 'eh:2', title: 'Work Title', author: 'Artist', pagesCount: 25 })
        expect(workIdentityEvidenceV5(a, b).relation).toBe('HIGH_CONFIDENCE_WORK')
        const c = comic({ comicId: 'eh:3', title: 'Work Title', author: 'Artist', pagesCount: 90 })
        expect(workIdentityEvidenceV5(a, c).relation).toBe('DISTINCT_OR_UNKNOWN')
    })

    it('does not merge same titles from different authors', () => {
        const a = comic({ comicId: 'a', title: 'Same', author: 'Artist A', pagesCount: 20 })
        const b = comic({ comicId: 'b', title: 'Same', author: 'Artist B', pagesCount: 20 })
        expect(workIdentityEvidenceV5(a, b).relation).toBe('DISTINCT_OR_UNKNOWN')
    })

    it('allows a user-confirmed distinct override to defeat an automatic match', () => {
        const a = comic({ comicId: 'a', title: 'Same', author: 'Artist', pagesCount: 20 })
        const b = comic({ comicId: 'b', title: 'Same', author: 'Artist', pagesCount: 20 })
        expect(workIdentityEvidenceV5(a, b, ['a\u0000b']).relation).toBe('DISTINCT_OR_UNKNOWN')
    })

    it('treats favorites, library membership and downloads as owned facts', () => {
        const owned = [
            comic({ comicId: 'fav', title: 'A', isFavorite: true }),
            comic({ comicId: 'lib', title: 'B', inLibrary: true }),
            comic({ comicId: 'down', title: 'C', downloadedPictures: 1 })
        ]
        for (const item of owned)
            expect(isAlreadyOwnedWorkV5(item, owned).owned).toBe(true)
    })

    it('filters cross-provider duplicates before ranking/serving', () => {
        const owned = comic({ comicId: 'pica:1', title: 'Work', author: 'Artist', pagesCount: 24, isFavorite: true })
        const duplicate = comic({ comicId: 'eh:2', title: '[Chinese] Work', author: 'Artist', pagesCount: 25 })
        const novel = comic({ comicId: 'eh:3', title: 'Other', author: 'Artist', pagesCount: 30 })
        const result = filterCandidatesAgainstOwnedV5(
            [{ comic: duplicate }, { comic: novel }],
            [owned],
            defaultPortablePolicyStateV5()
        )
        expect(result.rows.map((row) => row.comic.comicId)).toEqual(['eh:3'])
        expect(result.telemetry.workDuplicateRemoved).toBe(1)
    })

    it('collapses high-confidence duplicates inside the candidate set', () => {
        const a = comic({ comicId: 'a', title: 'Work', author: 'Artist', pagesCount: 20 })
        const b = comic({ comicId: 'b', title: 'Work', author: 'Artist', pagesCount: 21 })
        const result = filterCandidatesAgainstOwnedV5(
            [{ comic: a }, { comic: b }],
            [],
            defaultPortablePolicyStateV5()
        )
        expect(result.rows).toHaveLength(1)
        expect(result.rows[0].comic.comicId).toBe('a')
    })

    it('applies explicit more/less controls without replacing the inferred profile', () => {
        const target = comic({ comicId: 'x', title: 'X', author: 'Artist', tags: ['Tag A'] })
        let state = defaultPortablePolicyStateV5()
        state = upsertControlV5(state, normalizeControlV5({ targetType: 'TAG', key: 'Tag A', label: 'Tag A', direction: 'MORE', scope: 'PERSISTENT' }))
        expect(preferenceAdjustmentV5(target, state).adjustment).toBeGreaterThan(0)
        state = upsertControlV5(state, normalizeControlV5({ targetType: 'TAG', key: 'Tag A', label: 'Tag A', direction: 'LESS', scope: 'PERSISTENT' }))
        expect(preferenceAdjustmentV5(target, state).adjustment).toBeLessThan(0)
    })

    it('maps the 10-step control to a graded ranking adjustment', () => {
        const target = comic({
            comicId: 'x',
            title: 'X',
            tags: ['Tag A']
        })
        let state = defaultPortablePolicyStateV5()
        state = upsertControlV5(
            state,
            normalizeControlV5({
                targetType: 'TAG',
                key: 'Tag A',
                direction: 'MORE',
                levelDelta: 3
            })
        )
        expect(state.controls[0]).toMatchObject({
            direction: 'MORE',
            levelDelta: 3
        })
        expect(preferenceAdjustmentV5(target, state).adjustment).toBeCloseTo(
            0.09,
            6
        )
        state = upsertControlV5(
            state,
            normalizeControlV5({
                targetType: 'TAG',
                key: 'Tag A',
                direction: 'LESS',
                levelDelta: -2
            })
        )
        expect(preferenceAdjustmentV5(target, state).adjustment).toBeCloseTo(
            -0.06,
            6
        )
    })

    it('derives a nonlinear 1..10 baseline from collection evidence', () => {
        expect(preferenceBaselineLevelV5(0, 0)).toBe(1)
        expect(preferenceBaselineLevelV5(1, 0.001)).toBeLessThan(
            preferenceBaselineLevelV5(10, 0.03)
        )
        expect(preferenceBaselineLevelV5(10, 0.03)).toBeLessThanOrEqual(
            preferenceBaselineLevelV5(50, 0.1)
        )
        expect(preferenceBaselineLevelV5(50, 0.1)).toBeLessThanOrEqual(10)
    })

    it('keeps hard block separate from a soft negative', () => {
        const target = comic({ comicId: 'x', title: 'X', author: 'Artist' })
        let state = defaultPortablePolicyStateV5()
        state = upsertControlV5(state, normalizeControlV5({ targetType: 'AUTHOR', key: 'Artist', label: 'Artist', direction: 'BLOCK', scope: 'PERSISTENT' }))
        expect(preferenceAdjustmentV5(target, state).blocked).toBe(true)
    })

    it('removes an explicit override when direction returns to default', () => {
        let state = defaultPortablePolicyStateV5()
        state = upsertControlV5(state, normalizeControlV5({ targetType: 'TAG', key: 'A', direction: 'MORE' }))
        state = upsertControlV5(state, normalizeControlV5({ targetType: 'TAG', key: 'A', direction: 'DEFAULT' }))
        expect(state.controls).toHaveLength(0)
    })

    it('exports inferred signals without requiring user-maintained weights', () => {
        const signals = portableInferredSignalsV5([
            comic({ comicId: 'a', title: 'A', author: 'Artist', tags: ['T'], categories: ['C'], isFavorite: true }),
            comic({ comicId: 'b', title: 'B', author: 'Artist', tags: ['T'], categories: ['D'], inLibrary: true })
        ])
        expect(signals.find((item) => item.targetType === 'AUTHOR')?.supportCount).toBe(1)
        expect(signals.find((item) => item.targetType === 'TAG' && item.key === 't')?.supportCount).toBe(1)
    })

    it('keeps seen/owned/duplicate/temporary facts separate from taste feedback', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v5-facts-'))
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        database.importCatalog(
            [
                {
                    comicId: 'comic-seen',
                    title: 'Seen',
                    author: 'Artist',
                    tags: [],
                    categories: [],
                    finished: true
                },
                {
                    comicId: 'comic-owned',
                    title: 'Owned',
                    author: 'Artist',
                    tags: [],
                    categories: [],
                    finished: true
                }
            ],
            'test'
        )
        const store = new RecommendationPolicyStoreV5(database)
        store.setItemDisposition({
            comicId: 'comic-seen',
            reason: 'already_seen'
        })
        store.setItemDisposition({
            comicId: 'comic-owned',
            reason: 'already_owned'
        })
        store.setItemDisposition({
            comicId: 'comic-dup',
            reason: 'duplicate'
        })
        store.setItemDisposition({
            comicId: 'comic-temp',
            reason: 'temporary',
            durationDays: 30
        })
        const snapshot = store.snapshot()
        expect(snapshot.seenComicIds).toContain('comic-seen')
        expect(snapshot.ownedComicIds).toContain('comic-owned')
        expect(snapshot.duplicateReportComicIds).toContain('comic-dup')
        expect(snapshot.temporarySuppressions).toHaveLength(1)
        expect(database.recommendationFeedback()).toHaveLength(0)
        expect(
            database
                .listUserEvents({ limit: 50 })
                .filter(
                    (event) =>
                        event.eventType ===
                        'recommendation_item_disposition'
                )
        ).toHaveLength(4)
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('expires temporary suppression without turning it into a taste negative', () => {
        const target = comic({
            comicId: 'temporary',
            title: 'Temporary'
        })
        const state = {
            ...defaultPortablePolicyStateV5(),
            temporarySuppressions: [
                {
                    comicId: 'temporary',
                    createdAt: '2026-01-01T00:00:00.000Z',
                    expiresAt: '2026-01-02T00:00:00.000Z'
                }
            ]
        }
        expect(preferenceAdjustmentV5(target, state).blocked).toBe(false)
    })

    it('treats an ownership override as owned without changing the comic record', () => {
        const target = comic({
            comicId: 'manual-owned',
            title: 'Manual owned'
        })
        const state = {
            ...defaultPortablePolicyStateV5(),
            ownedComicIds: ['manual-owned']
        }
        const result = filterCandidatesAgainstOwnedV5(
            [{ comic: target }],
            [target],
            state
        )
        expect(result.rows).toHaveLength(0)
        expect(target.isFavorite).toBe(false)
        expect(target.inLibrary).toBe(false)
    })

    it('excludes selected favorites from inferred taste without changing ownership', () => {
        const favorite = comic({
            comicId: 'archive-favorite',
            title: 'Archive',
            author: 'Artist',
            tags: ['Archive Tag'],
            isFavorite: true
        })
        const signals = portableInferredSignalsV5(
            [favorite],
            120,
            ['archive-favorite']
        )
        expect(signals).toHaveLength(0)
        expect(favorite.isFavorite).toBe(true)
        expect(
            filterCandidatesAgainstOwnedV5(
                [{ comic: favorite }],
                [favorite],
                {
                    ...defaultPortablePolicyStateV5(),
                    tasteExcludedComicIds: ['archive-favorite']
                }
            ).rows
        ).toHaveLength(0)
    })

    it('persists and audits taste-profile exclusion independently', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-v5-taste-exclusion-')
        )
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        database.importFavorites(
            [
                {
                    comicId: 'favorite-a',
                    title: 'A',
                    author: 'Artist',
                    tags: ['T'],
                    categories: [],
                    finished: true
                }
            ],
            'test',
            false,
            true
        )
        const store = new RecommendationPolicyStoreV5(database)
        store.setTasteExclusion('favorite-a', true)
        expect(store.snapshot().tasteExcludedComicIds).toEqual(['favorite-a'])
        expect(store.snapshot().counts.tasteExcluded).toBe(1)
        expect(database.recommendationFeedback()).toHaveLength(0)
        expect(
            database.listUserEvents({
                eventType: 'recommendation_taste_exclusion',
                limit: 10
            })
        ).toHaveLength(1)
        store.setTasteExclusion('favorite-a', false)
        expect(store.snapshot().tasteExcludedComicIds).toEqual([])
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('persists controls and merges dirty mobile feedback using server-side events', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v5-policy-'))
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        database.importCatalog(
            [{ comicId: 'comic-a', title: 'A', author: 'Artist', tags: ['T'], categories: [], finished: true }],
            'test'
        )
        const store = new RecommendationPolicyStoreV5(database)
        store.setControl({ targetType: 'TAG', key: 'T', label: 'T', direction: 'MORE' })
        expect(store.snapshot().controls[0]).toMatchObject({ key: 't', direction: 'MORE' })
        const merged = store.mergeMobile({
            deviceId: 'android-test',
            mutationId: 'mutation-1',
            controls: [{ targetType: 'AUTHOR', key: 'Artist', label: 'Artist', direction: 'LESS' }],
            feedback: [{ comicId: 'comic-a', sentiment: 'like', reasons: ['author'] }]
        })
        expect(merged.snapshot.controls.some((item) => item.targetType === 'AUTHOR' && item.direction === 'LESS')).toBe(true)
        expect(database.recommendationFeedback()[0]).toMatchObject({ comicId: 'comic-a', sentiment: 'like', reasons: ['author'] })
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('makes repeated mobile sync idempotent for feedback mutation ids', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v5-idempotent-'))
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        database.importCatalog(
            [{ comicId: 'comic-a', title: 'A', author: 'Artist', tags: [], categories: [], finished: true }],
            'test'
        )
        const store = new RecommendationPolicyStoreV5(database)
        const payload = { deviceId: 'android-test', mutationId: 'same', feedback: [{ comicId: 'comic-a', sentiment: 'dislike', reasons: ['topic'] }] }
        store.mergeMobile(payload)
        store.mergeMobile(payload)
        expect(database.listUserEvents({ comicId: 'comic-a', limit: 50 })).toHaveLength(2)
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })
})
