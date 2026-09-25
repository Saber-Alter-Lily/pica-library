import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'

const temporaryDirectories: string[] = []

function database() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-p2d2-'))
    temporaryDirectories.push(directory)
    return new LibraryDatabase(path.join(directory, 'library.db'))
}

function record(index: number) {
    return {
        comicId: `batched-${index}`,
        title: `Batched Work ${index}`,
        author: `Circle ${index % 9} [Author ${index % 23}]`,
        categories: ['fixture'],
        tags: [`tag-${index % 11}`],
        finished: false
    }
}

afterEach(() => {
    while (temporaryDirectories.length)
        fs.rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

describe('P2 D2 hot-query batching', () => {
    it('batches more than one SQLite parameter chunk and preserves requested order', () => {
        const store = database()
        store.importCatalog(
            Array.from({ length: 805 }, (_, index) => record(index)),
            'p2-d2-batched-ids'
        )

        const requested = [
            ...Array.from({ length: 402 }, (_, index) => `batched-${index}`),
            'missing-id',
            ...Array.from(
                { length: 403 },
                (_, index) => `batched-${804 - index}`
            )
        ]
        const comics = store.getComicsByIds(requested)
        expect(comics).toHaveLength(805)
        expect(comics[0].comicId).toBe('batched-0')
        expect(comics[401].comicId).toBe('batched-401')
        expect(comics[402].comicId).toBe('batched-804')
        expect(comics.at(-1)?.comicId).toBe('batched-402')
        store.close()
    })

    it('keeps shelf and recommendation lookups off full-catalog materialization', () => {
        const source = fs.readFileSync('src/library/database.ts', 'utf8')

        const shelfStart = source.indexOf(
            'listShelfComics(shelfId: string): StoredComic[]'
        )
        const shelfEnd = source.indexOf(
            '\n    listReaderEpisodes(',
            shelfStart
        )
        const shelf = source.slice(shelfStart, shelfEnd)
        expect(shelf).toContain('return this.getComicsByIds(ids)')
        expect(shelf).not.toContain('listComics(')

        const recommendationStart = source.indexOf(
            'recommendationRecords(comicIds: string[])'
        )
        const recommendationEnd = source.indexOf(
            '\n    saveRecommendationSession(',
            recommendationStart
        )
        const recommendation = source.slice(
            recommendationStart,
            recommendationEnd
        )
        expect(recommendation).toContain(
            'this.getComicsByIds(comicIds)'
        )
        expect(recommendation).not.toContain('listComics(')
    })

    it('loads author aliases and circles in fixed batch queries rather than 2N+1', () => {
        const source = fs.readFileSync('src/library/database.ts', 'utf8')
        const start = source.indexOf('listAuthors(): AuthorGroup[]')
        const end = source.indexOf('\n    setAuthorDecision(', start)
        const method = source.slice(start, end)

        expect(method).toContain('SELECT author_id, alias_display')
        expect(method).toContain('SELECT DISTINCT author_id, circle')
        expect(method).toContain('aliasesByAuthor')
        expect(method).toContain('circlesByAuthor')
        expect(method).not.toContain('WHERE author_id = ?')
    })
})
