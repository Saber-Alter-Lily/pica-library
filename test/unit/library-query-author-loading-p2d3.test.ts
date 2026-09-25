import { describe, expect, it, vi } from 'vitest'
import type { LibraryDatabase } from '../../src/library/database'
import type { StoredComic } from '../../src/library/types'
import { LibraryQueryService } from '../../src/services/library-query-service'

function comic(input: Partial<StoredComic> = {}): StoredComic {
    return {
        comicId: 'comic-1',
        providerId: 'pica',
        providerRemoteId: 'comic-1',
        title: 'Example Work',
        author: 'Raw Creator',
        categories: [],
        tags: ['Example'],
        finished: false,
        canonicalAuthor: 'Canonical Creator',
        circle: null,
        authorId: 'author-1',
        isFavorite: true,
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: '2026-09-24T00:00:00.000Z',
        knownEpisodes: 0,
        knownPictures: 0,
        downloadedPictures: 0,
        inLibrary: true,
        ...input
    }
}

describe('P2 D3 Library query author metadata discipline', () => {
    it('does not load all author groups for ordinary non-text queries', () => {
        const listAuthors = vi.fn(() => {
            throw new Error('listAuthors should not run')
        })
        const database = {
            listAuthors,
            listComicsForLibraryQueryBase: () => [comic()]
        } as unknown as LibraryDatabase
        const query = new LibraryQueryService(database)

        const result = query.query({
            scope: 'library',
            tags: ['Example'],
            limit: 48
        })

        expect(listAuthors).not.toHaveBeenCalled()
        expect(result.items).toHaveLength(1)
        expect(result.facets.authors).toEqual([
            {
                value: 'author-1',
                label: 'Canonical Creator',
                count: 1
            }
        ])
    })

    it('still loads aliases for text search and preserves alias matching', () => {
        const listAuthors = vi.fn(() => [
            {
                id: 'author-1',
                canonicalName: 'Canonical Creator',
                normalizedKey: 'canonical creator',
                aliases: ['Hidden Alias'],
                circles: [],
                works: 1,
                confidence: 1,
                evidence: 'fixture',
                reviewStatus: 'approved'
            }
        ])
        const database = {
            listAuthors,
            listComicsForLibraryQueryBase: () => [comic()]
        } as unknown as LibraryDatabase
        const query = new LibraryQueryService(database)

        const result = query.query({
            scope: 'library',
            text: 'hidden alias',
            limit: 48
        })

        expect(listAuthors).toHaveBeenCalledTimes(1)
        expect(result.items.map((item) => item.comicId)).toEqual(['comic-1'])
        expect(result.facets.authors[0]?.label).toBe('Canonical Creator')
    })

    it('exposes the synthetic scaling harness without promoting a latency budget', () => {
        const script = require('node:fs').readFileSync(
            'scripts/benchmark/library-query-harness.ts',
            'utf8'
        )
        const pkg = JSON.parse(
            require('node:fs').readFileSync('package.json', 'utf8')
        ) as { scripts: Record<string, string> }

        expect(pkg.scripts['benchmark:library-query']).toBe(
            'tsx scripts/benchmark/library-query-harness.ts'
        )
        expect(script).toContain(
            'library-query-sqlite-scaling-p2-d3'
        )
        expect(script).toContain('[500, 2000, 5000]')
        expect(script).toContain(
            'Do not use CI/shared-runner wall time as a user-facing latency budget.'
        )
    })
})
