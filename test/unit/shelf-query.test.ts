import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import type { FavoriteRecord } from '../../src/library/types'
import { LibraryQueryService } from '../../src/services/library-query-service'
import { ShelfService } from '../../src/services/shelf-service'

const directories: string[] = []
const databases: LibraryDatabase[] = []

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-shelves-'))
    directories.push(root)
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    databases.push(database)
    const queries = new LibraryQueryService(database)
    return {
        root,
        database,
        queries,
        shelves: new ShelfService(database, queries)
    }
}

function comic(index: number): FavoriteRecord {
    return {
        comicId: `comic-${index}`,
        title: `Synthetic Comic ${index}`,
        author: index % 2 ? 'Circle A (Alice)' : 'Bob',
        categories: [index % 2 ? 'Drama' : 'Comedy'],
        tags: [index % 3 ? 'Romance' : 'School', index % 5 ? 'Color' : 'Long'],
        finished: index % 2 === 0,
        totalLikes: index,
        updatedAt: new Date(2026, 0, 1 + (index % 20)).toISOString()
    }
}

afterEach(() => {
    for (const database of databases.splice(0)) {
        try {
            database.close()
        } catch {
            // Individual tests may already have closed the database.
        }
    }
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('Shelves and shared LibraryQueryService', () => {
    it('creates, renames and deletes local shelves without deleting comics', () => {
        const { database, shelves } = fixture()
        database.importFavorites([comic(1), comic(2)])
        const first = shelves.create('  待读  ')
        expect(first.name).toBe('待读')
        expect(() => shelves.create('待读')).toThrow(/同名/)
        expect(() => shelves.create('  ')).toThrow(/不能为空/)
        expect(shelves.rename(first.id, '稍后阅读').name).toBe('稍后阅读')
        expect(
            shelves.add(first.id, ['comic-1', 'comic-2', 'comic-2'])
        ).toMatchObject({
            added: 2,
            total: 2
        })
        const second = shelves.create('收藏精选')
        shelves.add(second.id, ['comic-1'])
        expect(shelves.contents(first.id)).toHaveLength(2)
        expect(shelves.contents(second.id)).toHaveLength(1)
        shelves.delete(first.id)
        expect(database.summary().comics).toBe(2)
        expect(shelves.contents(second.id)[0].comicId).toBe('comic-1')
        database.close()
    })

    it('uses one query contract for facets, typeahead, ALL/ANY and bulk shelf add', () => {
        const { database, queries, shelves } = fixture()
        database.importFavorites([comic(1), comic(2), comic(3), comic(4)])
        const alice = database
            .listAuthors()
            .find((author) => author.canonicalName === 'Alice')!
        const all = queries.query({
            scope: 'favorites',
            authorIds: [alice.id],
            tags: ['Romance', 'Color'],
            tagMode: 'all'
        })
        expect(all.total).toBe(1)
        expect(all.facets.authors).toContainEqual(
            expect.objectContaining({
                value: alice.id,
                label: 'Alice',
                count: 1
            })
        )
        expect(all.facets.tags).toContainEqual(
            expect.objectContaining({ label: 'Romance', count: 1 })
        )
        expect(
            queries.query({ tags: ['Romance', 'School'], tagMode: 'any' }).total
        ).toBeGreaterThan(all.total)
        expect(queries.query({ text: 'circle a' }).total).toBe(2)
        expect(queries.query({ text: 'alice' }).total).toBe(2)

        const shelf = shelves.create('纯爱')
        const added = shelves.addFiltered(shelf.id, all.query)
        expect(added.matched).toBe(all.total)
        expect(shelves.contents(shelf.id)).toHaveLength(all.total)
        database.close()
    })

    it('upserts minimum search metadata when selected search results enter a shelf', () => {
        const { database, shelves } = fixture()
        const shelf = shelves.create('搜索结果')
        shelves.add(
            shelf.id,
            ['search-1'],
            [{ ...comic(7), comicId: 'search-1', title: 'Search-only result' }]
        )
        expect(shelves.contents(shelf.id)[0]).toMatchObject({
            comicId: 'search-1',
            title: 'Search-only result',
            isFavorite: false
        })
        database.close()
    })

    it('supports downloaded scope through the shared query contract', () => {
        const { root, database, queries } = fixture()
        database.importFavorites([comic(1), comic(2)])
        database.upsertEpisode({
            id: 'downloaded-episode',
            comicId: 'comic-1',
            title: 'Downloaded chapter',
            order: 1
        })
        const file = path.join(root, 'downloads', 'page.jpg')
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, 'synthetic image')
        database.upsertPicture({
            id: 'downloaded-picture',
            comicId: 'comic-1',
            episodeId: 'downloaded-episode',
            position: 1,
            originalName: 'page.jpg',
            mediaPath: 'page.jpg',
            fileServer: 'https://media.example'
        })
        database.markPictureDownloaded(
            'downloaded-picture',
            file,
            fs.statSync(file).size,
            'synthetic-hash'
        )
        expect(queries.query({ scope: 'downloaded' }).items).toHaveLength(1)
        expect(queries.query({ download: 'complete' }).items).toHaveLength(1)
        expect(
            queries.query({ download: 'not-downloaded' }).items
        ).toHaveLength(1)
        database.close()
    })

    it('keeps 5,000 manga facets and 10,000 memberships bounded', () => {
        const { database, queries, shelves } = fixture()
        database.importFavorites(
            Array.from({ length: 5000 }, (_, index) => comic(index))
        )
        const queryStarted = performance.now()
        const result = queries.query({
            scope: 'favorites',
            tags: ['Romance', 'Color'],
            tagMode: 'all',
            limit: 48
        })
        const queryMs = performance.now() - queryStarted
        expect(result.items).toHaveLength(48)
        expect(result.total).toBeGreaterThan(1000)
        expect(queryMs).toBeLessThan(5000)

        const ids = Array.from({ length: 5000 }, (_, index) => `comic-${index}`)
        const scaleShelves = Array.from({ length: 100 }, (_, index) =>
            shelves.create(`Scale ${index + 1}`)
        )
        for (const [index, shelf] of scaleShelves.entries()) {
            const start = (index * 50) % ids.length
            const members = Array.from(
                { length: 100 },
                (_, offset) => ids[(start + offset) % ids.length]
            )
            expect(shelves.add(shelf.id, members).total).toBe(100)
        }
        expect(shelves.list()).toHaveLength(100)
        expect(shelves.list().reduce((sum, item) => sum + item.count, 0)).toBe(
            10_000
        )
        database.close()
    }, 30_000)
})
