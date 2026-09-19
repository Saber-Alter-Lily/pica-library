import { describe, expect, it } from 'vitest'
import {
    applyConflictResolutionsV1,
    previewMobileRecommendationSyncV1
} from '../../src/recommendation-v5/mobile-sync'
import type { PreferenceControlV5 } from '../../src/recommendation-v5/portable-policy'

const control = (
    levelDelta: number,
    source: 'DESKTOP' | 'ANDROID' = 'DESKTOP'
): PreferenceControlV5 => ({
    targetType: 'TAG',
    key: 'big-breasts',
    label: '巨乳',
    direction: levelDelta > 0 ? 'MORE' : levelDelta < 0 ? 'LESS' : 'DEFAULT',
    levelDelta,
    scope: 'PERSISTENT',
    source,
    updatedAt: '2026-09-19T00:00:00.000Z'
})

describe('Recommendation V5 mobile three-way sync', () => {
    it('detects concurrent explicit preference divergence from the same base', () => {
        const preview = previewMobileRecommendationSyncV1({
            baseRevision: 10,
            desktopRevision: 12,
            baseControls: [control(3)],
            desktopControls: [control(4)],
            androidControls: [control(5, 'ANDROID')],
            feedback: [],
            events: []
        })
        expect(preview.conflicts).toHaveLength(1)
        expect(preview.conflicts[0]).toMatchObject({
            identity: 'TAG:big-breasts',
            label: '巨乳',
            base: { levelDelta: 3 },
            desktop: { levelDelta: 4 },
            android: { levelDelta: 5 }
        })
        expect(preview.hasPortableChanges).toBe(true)
    })

    it('does not treat an Android-only change as a conflict', () => {
        const preview = previewMobileRecommendationSyncV1({
            baseRevision: 10,
            desktopRevision: 10,
            baseControls: [control(3)],
            desktopControls: [control(3)],
            androidControls: [control(5, 'ANDROID')]
        })
        expect(preview.conflicts).toEqual([])
        expect(preview.androidControlChanges).toBe(1)
        expect(preview.desktopControlChanges).toBe(0)
    })

    it('keeps or drops the Android mutation according to an explicit conflict choice', () => {
        const preview = previewMobileRecommendationSyncV1({
            baseRevision: 10,
            desktopRevision: 12,
            baseControls: [control(3)],
            desktopControls: [control(4)],
            androidControls: [control(5, 'ANDROID')]
        })
        const useAndroid = applyConflictResolutionsV1({
            androidControls: [control(5, 'ANDROID')],
            conflicts: preview.conflicts,
            resolutions: [
                { identity: 'TAG:big-breasts', choice: 'ANDROID' }
            ]
        })
        expect(useAndroid.unresolved).toEqual([])
        expect(useAndroid.controls).toHaveLength(1)
        expect(useAndroid.controls[0].levelDelta).toBe(5)

        const useDesktop = applyConflictResolutionsV1({
            androidControls: [control(5, 'ANDROID')],
            conflicts: preview.conflicts,
            resolutions: [
                { identity: 'TAG:big-breasts', choice: 'DESKTOP' }
            ]
        })
        expect(useDesktop.unresolved).toEqual([])
        expect(useDesktop.controls).toEqual([])
    })

    it('requires an explicit resolution when a concurrent conflict is not adjudicated', () => {
        const preview = previewMobileRecommendationSyncV1({
            baseRevision: 10,
            desktopRevision: 12,
            baseControls: [control(3)],
            desktopControls: [control(4)],
            androidControls: [control(5, 'ANDROID')]
        })
        const result = applyConflictResolutionsV1({
            androidControls: [control(5, 'ANDROID')],
            conflicts: preview.conflicts
        })
        expect(result.controls).toHaveLength(1)
        expect(result.unresolved).toHaveLength(1)
    })

    it('counts feedback and portable behavior separately from explicit controls', () => {
        const preview = previewMobileRecommendationSyncV1({
            desktopRevision: 2,
            baseControls: [],
            desktopControls: [],
            androidControls: [],
            feedback: [{ comicId: 'a', sentiment: 'like' }],
            events: [
                { eventType: 'recommend_impression', comicId: 'b' },
                { eventType: 'reader_complete', comicId: 'c' }
            ],
            suppressComicIds: ['d'],
            tasteExcludedComicIds: ['e'],
            itemDispositions: [
                { comicId: 'f', reason: 'temporary', active: true }
            ]
        })
        expect(preview).toMatchObject({
            androidControlChanges: 0,
            desktopControlChanges: 0,
            feedbackChanges: 1,
            eventChanges: 2,
            suppressChanges: 1,
            tasteExclusionChanges: 1,
            dispositionChanges: 1,
            hasPortableChanges: true
        })
    })
})
