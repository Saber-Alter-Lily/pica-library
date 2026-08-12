import { describe, expect, it } from 'vitest'
import {
    addLiteQueueItems,
    importLibraryBundle,
    restoreLiteState
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
})
