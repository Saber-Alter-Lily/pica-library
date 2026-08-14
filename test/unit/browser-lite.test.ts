import { describe, expect, it } from 'vitest'
import {
    addLiteQueueItems,
    buildTagFrequencyIndex,
    importLibraryBundle,
    restoreLiteState,
    selectDisplayTags,
    trustedBrowserCoverUrl,
    visibleLibraryPage
} from '../../web/lite-state.js'

function bundle() {
    return {
        schemaVersion: 1,
        kind: 'pica-library-bundle',
        library: { comics: [{ comicId: 'comic-1', title: 'Work' }] },
        authors: [{ id: 'author-1', canonicalName: 'Author' }],
        profile: { authors: [{ value: 'Author', count: 1 }] },
        recommendations: [
            {
                comic: { comicId: 'comic-2', title: 'Recommendation' },
                reasons: ['Same author']
            }
        ],
        recommendationSessions: [
            [
                {
                    comic: { comicId: 'comic-2', title: 'Recommendation' },
                    reasons: ['Same author']
                }
            ],
            [
                {
                    comic: { comicId: 'comic-4', title: 'New session' },
                    reasons: ['New session']
                }
            ]
        ],
        queue: [{ comicId: 'comic-3', status: 'QUEUED' }]
    }
}

describe('Browser Lite state contract', () => {
    it('restores prepared recommendations and portable queue data', () => {
        const state = importLibraryBundle(bundle())
        expect(state.records).toHaveLength(1)
        expect(state.authors).toHaveLength(1)
        expect(state.profile).toEqual(bundle().profile)
        expect(state.recommendations[0]).toMatchObject({
            comic: { comicId: 'comic-2' }
        })
        expect(state.recommendationSessions[1][0]).toMatchObject({
            comic: { comicId: 'comic-4' }
        })
        expect(state.queue).toEqual(bundle().queue)
    })

    it('rejects invalid bundle schemas and kinds', () => {
        expect(() =>
            importLibraryBundle({ ...bundle(), schemaVersion: 2 })
        ).toThrow('schemaVersion')
        expect(() =>
            importLibraryBundle({ ...bundle(), kind: 'other' })
        ).toThrow('kind')
        expect(() =>
            importLibraryBundle({
                ...bundle(),
                profile: { nested: { token: 'must-not-persist' } }
            })
        ).toThrow('sensitive field')
    })

    it('round trips persisted Lite state and preserves author decisions', () => {
        const imported = importLibraryBundle(bundle())
        imported.authors[0].reviewStatus = 'approved'
        const restored = restoreLiteState(JSON.parse(JSON.stringify(imported)))
        expect(restored).toEqual(imported)
        expect(restored.authors[0].reviewStatus).toBe('approved')
    })

    it('creates deduplicated portable download plan entries', () => {
        const initial = importLibraryBundle(bundle())
        const next = addLiteQueueItems(
            initial,
            ['comic-3', 'comic-4', 'comic-4'],
            'recommendation'
        )
        expect(next.queue).toHaveLength(2)
        expect(next.queue[1]).toEqual({
            comicId: 'comic-4',
            episodeOrders: [],
            source: 'recommendation',
            runner: 'LOCAL',
            status: 'PLANNED'
        })
    })

    it('bounds initial rendering for a 1770-item library', () => {
        const records = Array.from({ length: 1770 }, (_, comicId) => ({
            comicId: String(comicId)
        }))
        expect(visibleLibraryPage(records)).toHaveLength(48)
        expect(visibleLibraryPage(records, 2)).toHaveLength(96)
        expect(visibleLibraryPage(records, 99)).toHaveLength(1770)
    })

    it('selects deterministic discriminative tags before generic tags', () => {
        const comic = { tags: ['全彩', 'common', 'rare', 'other'] }
        const records = [
            comic,
            { tags: ['common'] },
            { tags: ['common'] },
            { tags: ['other'] }
        ]
        const index = buildTagFrequencyIndex(records)
        expect(selectDisplayTags(comic, index, 3)).toEqual([
            'rare',
            'other',
            'common'
        ])
    })

    it('builds the tag frequency index once for repeated render selection', () => {
        const records = [{ tags: ['a', 'b'] }, { tags: ['a'] }]
        const index = buildTagFrequencyIndex(records)
        expect(index.get('a')).toBe(2)
        expect(selectDisplayTags(records[0], index, 1)).toEqual(['b'])
    })

    it('drops untrusted cover URLs from imported and restored Lite state', () => {
        const value = bundle() as ReturnType<typeof bundle> & {
            library: { comics: Array<{ coverUrl?: string }> }
            recommendations: Array<{ comic: { coverUrl?: string } }>
        }
        value.library.comics[0].coverUrl = 'http://127.0.0.1/private.svg'
        value.recommendations[0].comic.coverUrl =
            'https://user:password@example.test/cover.jpg'
        const imported = importLibraryBundle(value)
        expect(imported.records[0]).not.toHaveProperty('coverUrl')
        expect(imported.recommendations[0].comic).not.toHaveProperty('coverUrl')
        expect(trustedBrowserCoverUrl('https://media.example/cover.jpg')).toBe(
            'https://media.example/cover.jpg'
        )
        expect(trustedBrowserCoverUrl('https://localhost/cover.jpg')).toBe('')
        expect(trustedBrowserCoverUrl('https://[fd00::1]/cover.jpg')).toBe('')
    })
})
