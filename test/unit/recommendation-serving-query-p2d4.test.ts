import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import {
    defaultPortablePolicyStateV5,
    filterCandidatesAgainstOwnedV5
} from '../../src/recommendation-v5/portable-policy'

function comic(
    comicId: string,
    overrides: Partial<StoredComic> = {}
): StoredComic {
    return {
        comicId,
        title: comicId,
        author: 'Artist',
        canonicalAuthor: 'Artist',
        circle: null,
        authorId: 'author:artist',
        categories: [],
        tags: [],
        finished: true,
        isFavorite: false,
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: '2026-09-24T00:00:00.000Z',
        knownEpisodes: 0,
        knownPictures: 0,
        downloadedPictures: 0,
        inLibrary: false,
        ...overrides
    }
}

describe('P2 D4 serving query discipline', () => {
    it('keeps compact ownership filtering equivalent to an unrelated full catalog', () => {
        const owned = comic('owned', {
            title: 'Example Work',
            pagesCount: 24,
            isFavorite: true,
            inLibrary: true
        })
        const variant = comic('variant', {
            title: '[Chinese] Example Work',
            pagesCount: 25
        })
        const novel = comic('novel', {
            title: 'Different Work',
            author: 'Other Artist',
            canonicalAuthor: 'Other Artist',
            authorId: 'author:other',
            pagesCount: 80
        })
        const explicitOwnedCandidate = comic('manual-owned', {
            title: 'Manual Owned Work',
            author: 'Manual Artist',
            canonicalAuthor: 'Manual Artist',
            authorId: 'author:manual'
        })
        const unrelated = Array.from({ length: 100 }, (_, index) =>
            comic(`unrelated-${index}`, {
                title: `Unrelated ${index}`,
                author: `Other ${index}`,
                canonicalAuthor: `Other ${index}`,
                authorId: `author:unrelated-${index}`
            })
        )
        const state = {
            ...defaultPortablePolicyStateV5(),
            ownedComicIds: ['manual-owned']
        }
        const rows = [variant, novel, explicitOwnedCandidate].map((item) => ({
            comic: item,
            score: 1
        }))

        const full = filterCandidatesAgainstOwnedV5(
            rows,
            [owned, variant, novel, explicitOwnedCandidate, ...unrelated],
            state
        )
        const compact = filterCandidatesAgainstOwnedV5(
            rows,
            [owned, variant, novel, explicitOwnedCandidate],
            state
        )

        expect(compact).toEqual(full)
        expect(compact.rows.map((row) => row.comic.comicId)).toEqual([
            'novel'
        ])
        expect(compact.telemetry.workDuplicateRemoved).toBe(1)
        expect(compact.telemetry.exactOrOwnedRemoved).toBe(1)
    })

    it('keeps Final V3 serving and portable paths off 10000-row catalog materialization', () => {
        const coordinator = fs.readFileSync(
            'src/recommendation-v3/cycle-coordinator-v3.ts',
            'utf8'
        )
        const servingStart = coordinator.indexOf(
            'private servingSnapshot('
        )
        const servingEnd = coordinator.indexOf(
            '\n    private async completeBuild(',
            servingStart
        )
        const serving = coordinator.slice(servingStart, servingEnd)
        expect(serving).toContain('recommendationOwnershipState()')
        expect(serving).toContain('this.database.getComicsByIds([')
        expect(serving).toContain('this.database.favoriteIds()')
        expect(serving).not.toContain(
            'this.database.listComics({ limit: 10000 })'
        )

        const portableStart = coordinator.indexOf('    portable(')
        const portableEnd = coordinator.indexOf(
            '\n    current()',
            portableStart
        )
        const portable = coordinator.slice(portableStart, portableEnd)
        expect(portable).toContain('recommendationOwnershipState()')
        expect(portable).toContain('this.database.getComicsByIds([')
        expect(portable).not.toContain(
            'this.database.listComics({ limit: 10000 })'
        )
    })

    it('keeps serving composition scoped to owned and active-batch IDs', () => {
        const service = fs.readFileSync('src/library/service.ts', 'utf8')
        const start = service.indexOf(
            'recommendationServingCompositionV3()'
        )
        const end = service.indexOf(
            '\n    recommendationV5ShadowStatus()',
            start
        )
        const method = service.slice(start, end)

        expect(method).toContain('recommendationOwnershipState()')
        expect(method).toContain('this.database.getComicsByIds([')
        expect(method).toContain('...batch.itemIds')
        expect(method).not.toContain(
            'this.database.listComics({ limit: 10000 })'
        )
    })
})
