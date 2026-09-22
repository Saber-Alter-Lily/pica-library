import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import {
    workIdentityDetailEvidenceV3,
    workIdentityTitleSimilarityV3
} from '../../src/recommendation-v5/work-identity-v3'

function comic(
    input: Partial<StoredComic> &
        Pick<StoredComic, 'comicId' | 'title' | 'author'>
): StoredComic {
    return {
        comicId: input.comicId,
        providerId: input.providerId ?? 'pica',
        providerRemoteId: input.providerRemoteId ?? input.comicId,
        title: input.title,
        alternateTitles: input.alternateTitles ?? [],
        author: input.author,
        canonicalAuthor: input.canonicalAuthor ?? input.author,
        authorId: input.authorId ?? null,
        circle: input.circle ?? null,
        description: input.description ?? '',
        chineseTeam: input.chineseTeam ?? '',
        categories: input.categories ?? [],
        tags: input.tags ?? [],
        finished: input.finished ?? true,
        completionStatus: input.completionStatus ?? 'FINISHED',
        pagesCount: input.pagesCount ?? 0,
        epsCount: input.epsCount ?? 1,
        isFavorite: input.isFavorite ?? false,
        firstSeenAt: input.firstSeenAt ?? '2026-01-01T00:00:00.000Z',
        lastSeenAt: input.lastSeenAt ?? '2026-01-01T00:00:00.000Z',
        knownEpisodes: input.knownEpisodes ?? 0,
        knownPictures: input.knownPictures ?? 0,
        downloadedPictures: input.downloadedPictures ?? 0,
        inLibrary: input.inLibrary ?? false
    }
}

describe('Work Identity V3 creator-title-cover funnel', () => {
    it('treats provider alternate titles as strong cross-language evidence', () => {
        const pica = comic({
            comicId: 'pica:stolen-wife',
            title: '盗まれた人妻。',
            author: '平つくね'
        })
        const eh = comic({
            comicId: 'eh:stolen-wife',
            providerId: 'eh',
            title: '[ROUTE1 (Taira Tsukune)] Nusumareta Hitozuma. - Stolen Wife [Digital]',
            alternateTitles: ['[ROUTE1 (平つくね)] 盗まれた人妻。[DL版]'],
            author: 'taira tsukune',
            canonicalAuthor: '平つくね'
        })

        const evidence = workIdentityDetailEvidenceV3(pica, eh)
        expect(evidence.relation).toBe('HIGH_CONFIDENCE_WORK')
        expect(evidence.creatorMatch).toBe(true)
        expect(evidence.titleSimilarity).toBeGreaterThanOrEqual(0.9)
    })

    it('uses fuzzy title matching only after creator resolution', () => {
        const left = comic({
            comicId: 'pica:a',
            title: 'Example Work Special Edition',
            author: 'Creator',
            authorId: 'creator-1'
        })
        const right = comic({
            comicId: 'eh:b',
            providerId: 'eh',
            title: 'Example Work',
            author: 'Creator Alias',
            canonicalAuthor: 'Creator',
            authorId: 'creator-1'
        })
        const evidence = workIdentityDetailEvidenceV3(left, right)
        expect(evidence.creatorMatch).toBe(true)
        expect(evidence.relation).not.toBe('DISTINCT_OR_UNKNOWN')
        expect(workIdentityTitleSimilarityV3(left, right)).toBeGreaterThan(0.68)
    })

    it('keeps same-creator same-page cross-language names for cover review instead of dropping them', () => {
        const left = comic({
            comicId: 'pica:a',
            title: '完全不同的本地标题',
            author: 'Creator',
            authorId: 'creator-1',
            pagesCount: 30
        })
        const right = comic({
            comicId: 'eh:b',
            providerId: 'eh',
            title: 'A Completely Different Translation',
            author: 'Creator',
            authorId: 'creator-1',
            pagesCount: 30
        })
        const evidence = workIdentityDetailEvidenceV3(left, right)
        expect(evidence.relation).toBe('REVIEW_CANDIDATE')
        expect(evidence.pageCountCompatible).toBe(true)
        expect(evidence.confidence).toBeLessThan(0.8)
    })

    it('does not turn unrelated same-author works into high-confidence matches', () => {
        const left = comic({
            comicId: 'pica:a',
            title: 'Blue Summer',
            author: 'Creator',
            pagesCount: 20
        })
        const right = comic({
            comicId: 'pica:b',
            title: 'Winter Classroom',
            author: 'Creator',
            pagesCount: 70
        })
        const evidence = workIdentityDetailEvidenceV3(left, right)
        expect(evidence.relation).toBe('DISTINCT_OR_UNKNOWN')
    })
})
