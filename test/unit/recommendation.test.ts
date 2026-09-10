import { describe, expect, it } from 'vitest'
import {
    buildRecommendationProfile,
    mergeRecallCandidates,
    recommendComics,
    selectDiversifiedSeeds
} from '../../src/library/recommendation'
import type {
    RecommendationCandidate,
    StoredComic
} from '../../src/library/types'

function comic(
    comicId: string,
    overrides: Partial<StoredComic> = {}
): StoredComic {
    return {
        comicId,
        title: comicId,
        author: 'Author A',
        categories: ['Story'],
        tags: ['Long'],
        finished: true,
        totalLikes: 100,
        totalViews: 1000,
        canonicalAuthor: 'Author A',
        circle: null,
        authorId: null,
        isFavorite: false,
        firstSeenAt: '2026-01-01',
        lastSeenAt: '2026-01-01',
        knownEpisodes: 0,
        knownPictures: 0,
        downloadedPictures: 0,
        ...overrides
    }
}

function candidate(
    value: StoredComic,
    route: RecommendationCandidate['recalls'][number]['route'] = 'related',
    source = 'source',
    seedComicId?: string
): RecommendationCandidate {
    return { comic: value, recalls: [{ route, source, seedComicId }] }
}

describe('recommendation v2', () => {
    it('builds bounded normalized profile dimensions only from favorites', () => {
        const records = Array.from({ length: 30 }, (_, index) =>
            comic(`favorite-${index}`, {
                isFavorite: true,
                tags: [`tag-${index}`],
                author: index < 2 ? 'Alias A' : `Author ${index}`,
                canonicalAuthor: index < 2 ? 'Canonical A' : `Author ${index}`
            })
        )
        const profile = buildRecommendationProfile(records)
        expect(profile.favoriteCount).toBe(30)
        expect(profile.tags).toHaveLength(20)
        expect(profile.authors[0]).toMatchObject({
            value: 'Canonical A',
            count: 2
        })
    })

    it('selects deterministic diversified seeds under the bounded budget', () => {
        const favorites = [
            comic('a1', {
                isFavorite: true,
                canonicalAuthor: 'A',
                tags: ['x']
            }),
            comic('a2', {
                isFavorite: true,
                canonicalAuthor: 'A',
                tags: ['x']
            }),
            comic('b1', {
                isFavorite: true,
                canonicalAuthor: 'B',
                tags: ['y']
            }),
            comic('c1', { isFavorite: true, canonicalAuthor: 'C', tags: ['z'] })
        ]
        const first = selectDiversifiedSeeds(favorites, 3)
        const second = selectDiversifiedSeeds([...favorites].reverse(), 3)
        expect(first.map((item) => item.comicId)).toEqual(
            second.map((item) => item.comicId)
        )
        expect(new Set(first.map((item) => item.canonicalAuthor)).size).toBe(3)
    })

    it('deduplicates candidates and preserves multi-route provenance', () => {
        const value = comic('same')
        const merged = mergeRecallCandidates([
            candidate(value, 'related', 'seed', 'favorite'),
            candidate(value, 'tag', 'Long'),
            candidate(value, 'tag', 'Long')
        ])
        expect(merged).toHaveLength(1)
        expect(merged[0].recalls).toHaveLength(2)
        expect(merged[0].recalls.map((item) => item.route)).toEqual([
            'related',
            'tag'
        ])
    })

    it('excludes already-favorited candidates', () => {
        const favorite = comic('favorite', { isFavorite: true })
        const result = recommendComics([favorite], 10, [
            candidate(favorite, 'related', 'seed', 'favorite')
        ])
        expect(result.recommendations).toHaveLength(0)
        expect(result.audit.alreadyFavoriteExcludedCount).toBe(1)
    })

    it('lets strong personal affinity outrank generic popularity', () => {
        const favorite = comic('favorite', {
            isFavorite: true,
            canonicalAuthor: 'Preferred',
            tags: ['niche']
        })
        const personal = comic('personal', {
            canonicalAuthor: 'Preferred',
            tags: ['niche'],
            totalLikes: 5
        })
        const popular = comic('popular', {
            canonicalAuthor: 'Other',
            tags: ['generic'],
            categories: ['Other'],
            totalLikes: 10_000_000
        })
        const result = recommendComics([favorite, personal, popular], 10, [
            candidate(personal),
            candidate(popular, 'related', 'seed')
        ])
        expect(result.recommendations[0].comic.comicId).toBe('personal')
        expect(
            result.recommendations.some(
                (item) => item.comic.comicId === 'popular'
            )
        ).toBe(false)
    })

    it('prevents one author from dominating top N', () => {
        const favorite = comic('favorite', {
            isFavorite: true,
            tags: ['match']
        })
        const candidates = [
            comic('a1', { tags: ['match'], canonicalAuthor: 'A' }),
            comic('a2', { tags: ['match'], canonicalAuthor: 'A' }),
            comic('a3', { tags: ['match'], canonicalAuthor: 'A' }),
            comic('b1', { tags: ['match'], canonicalAuthor: 'B' })
        ]
        const result = recommendComics(
            [favorite, ...candidates],
            10,
            candidates.map((item) => candidate(item))
        )
        expect(result.audit.maxSameAuthorInTopN).toBeLessThanOrEqual(2)
        expect(
            result.recommendations.map((item) => item.comic.comicId)
        ).toContain('b1')
    })

    it('keeps exploration bounded and connected to the profile', () => {
        const favorite = comic('favorite', {
            isFavorite: true,
            tags: ['primary', 'adjacent']
        })
        const values = Array.from({ length: 20 }, (_, index) =>
            comic(`candidate-${index}`, {
                canonicalAuthor: `Author ${index}`,
                tags: [index < 15 ? 'primary' : 'adjacent'],
                totalLikes: index
            })
        )
        const result = recommendComics(
            [favorite, ...values],
            10,
            values.map((item) => candidate(item))
        )
        expect(result.audit.explorationCount).toBeLessThanOrEqual(2)
        expect(result.audit.explorationCount).toBeGreaterThan(0)
        expect(result.audit.explorationCount / 10).toBeLessThanOrEqual(0.15)
        expect(
            result.recommendations
                .filter((item) => item.exploration)
                .every((item) => item.matchedSignals.length > 0)
        ).toBe(true)
    })

    it('returns stable ordering regardless of candidate input order', () => {
        const favorite = comic('favorite', {
            isFavorite: true,
            tags: ['match']
        })
        const values = ['c', 'a', 'b'].map((id) =>
            comic(id, { tags: ['match'], canonicalAuthor: `Author ${id}` })
        )
        const run = (items: StoredComic[]) =>
            recommendComics(
                [favorite, ...values],
                10,
                items.map((item) => candidate(item))
            ).recommendations.map((item) => item.comic.comicId)
        expect(run(values)).toEqual(run([...values].reverse()))
    })
})
