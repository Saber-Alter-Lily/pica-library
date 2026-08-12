import { describe, expect, it } from 'vitest'
import {
    buildRecommendationProfile,
    recommendComics
} from '../../src/library/recommendation'
import type { StoredComic } from '../../src/library/types'

function comic(
    comicId: string,
    overrides: Partial<StoredComic> = {}
): StoredComic {
    return {
        comicId,
        title: comicId,
        author: '作者甲',
        categories: ['剧情'],
        tags: ['长篇'],
        finished: true,
        totalLikes: 100,
        totalViews: 1000,
        canonicalAuthor: '作者甲',
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

describe('personal recommendations', () => {
    it('builds a profile only from favorites', () => {
        const profile = buildRecommendationProfile([
            comic('favorite', { isFavorite: true, tags: ['剧情', '长篇'] }),
            comic('catalog', { tags: ['无关'] })
        ])
        expect(profile.favoriteCount).toBe(1)
        expect(profile.tags.map((item) => item.value)).toEqual(['剧情', '长篇'])
    })

    it('excludes favorites, explains ranking, and limits one author', () => {
        const records = [
            comic('favorite', {
                isFavorite: true,
                tags: ['剧情', '长篇'],
                author: '作者甲'
            }),
            comic('best', { tags: ['剧情'], author: '作者甲' }),
            comic('same-author-2', { tags: ['剧情'], author: '作者甲' }),
            comic('same-author-3', { tags: ['剧情'], author: '作者甲' }),
            comic('other', {
                tags: ['无关'],
                categories: ['其他'],
                author: '作者乙',
                canonicalAuthor: '作者乙',
                totalLikes: 0,
                totalViews: 0
            })
        ]
        const result = recommendComics(records, 10)
        expect(
            result.recommendations.map((item) => item.comic.comicId)
        ).toEqual(['best', 'same-author-2'])
        expect(result.recommendations[0].reasons).toContain('常看作者：作者甲')
        expect(
            result.recommendations.some((item) => item.comic.isFavorite)
        ).toBe(false)
    })
})
