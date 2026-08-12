import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import type { FavoriteRecord } from '../../src/library/types'

const tempDirs: string[] = []

function createDatabase() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-library-'))
    tempDirs.push(dir)
    return new LibraryDatabase(path.join(dir, 'library.db'))
}

afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
        fs.rmSync(dir, { recursive: true, force: true })
    }
})

describe('library database', () => {
    it('groups aliases by normalized creator and supports filters', () => {
        const database = createDatabase()
        const records: FavoriteRecord[] = [
            {
                comicId: 'c1',
                title: 'First',
                author: 'Circle One (Alice)',
                categories: ['Drama'],
                tags: ['Long-running'],
                finished: false,
                totalLikes: 10,
                totalViews: 100,
                updatedAt: '2026-01-01'
            },
            {
                comicId: 'c2',
                title: 'Second',
                author: 'ALICE',
                categories: ['Drama'],
                tags: ['Complete'],
                finished: true,
                totalLikes: 50,
                totalViews: 200,
                updatedAt: '2026-02-01'
            }
        ]

        const result = database.importFavorites(records)
        expect(result).toMatchObject({
            imported: 2,
            inserted: 2,
            authorGroups: 1
        })
        expect(database.summary()).toMatchObject({
            comics: 2,
            favorites: 2,
            authors: 1
        })
        expect(database.listAuthors()[0]).toMatchObject({
            canonicalName: 'Alice',
            works: 2
        })
        expect(database.listComics({ author: 'alice' })).toHaveLength(2)
        expect(database.listComics({ tags: ['long-running'] })[0].comicId).toBe(
            'c1'
        )
        expect(database.listComics({ sort: 'likes' })[0].comicId).toBe('c2')

        const author = database.listAuthors()[0]
        database.setAuthorDecision(author.id, 'approved', 'Alice Example')
        expect(database.listAuthors()[0].canonicalName).toBe('Alice Example')
        database.close()
    })

    it('marks missing favorites only for complete snapshots', () => {
        const database = createDatabase()
        const base: FavoriteRecord = {
            comicId: 'c1',
            title: 'First',
            author: 'Alice',
            categories: [],
            tags: [],
            finished: false
        }
        database.importFavorites([base])
        database.importCatalog([{ ...base, comicId: 'c2', title: 'Second' }])
        expect(database.summary().favorites).toBe(1)
        database.importFavorites([{ ...base, comicId: 'c2', title: 'Second' }])
        expect(
            database.listComics().find((comic) => comic.comicId === 'c1')
                ?.isFavorite
        ).toBe(false)
        database.close()
    })

    it('merges manually confirmed aliases without losing comic links', () => {
        const database = createDatabase()
        database.importFavorites([
            {
                comicId: 'c1',
                title: 'First',
                author: 'Alice',
                categories: [],
                tags: [],
                finished: false
            },
            {
                comicId: 'c2',
                title: 'Second',
                author: 'Alice-sensei',
                categories: [],
                tags: [],
                finished: false
            }
        ])
        const [target, source] = database.listAuthors()
        database.mergeAuthors(target.id, [source.id], 'Alice')
        expect(database.listAuthors()).toHaveLength(1)
        expect(database.listAuthors()[0]).toMatchObject({
            canonicalName: 'Alice',
            works: 2,
            reviewStatus: 'approved'
        })
        expect(database.listComics({ author: 'Alice' })).toHaveLength(2)
        database.close()
    })

    it('applies an exported author dictionary', () => {
        const database = createDatabase()
        database.importFavorites([
            {
                comicId: 'c1',
                title: 'First',
                author: 'Alice',
                categories: [],
                tags: [],
                finished: false
            },
            {
                comicId: 'c2',
                title: 'Second',
                author: 'A. Lice',
                categories: [],
                tags: [],
                finished: false
            }
        ])
        expect(
            database.applyAuthorDictionary([
                { canonicalName: 'Alice', aliases: ['Alice', 'A. Lice'] }
            ])
        ).toMatchObject({ applied: 1, merged: 1 })
        expect(database.listAuthors()[0]).toMatchObject({ works: 2 })
        database.close()
    })

    it('re-imports the same snapshot without duplicate entities', () => {
        const database = createDatabase()
        const record: FavoriteRecord = {
            comicId: 'stable',
            title: 'Stable',
            author: 'Alice',
            categories: [],
            tags: [],
            finished: false
        }
        database.importFavorites([record])
        database.importFavorites([{ ...record, title: 'Stable Updated' }])
        expect(database.summary()).toMatchObject({ comics: 1, authors: 1 })
        expect(database.listComics()[0].title).toBe('Stable Updated')
        database.close()
    })

    it('persists pause, resume and cancel transitions', () => {
        const database = createDatabase()
        database.importCatalog([{ comicId: 'job-comic', title: 'Job', author: 'Alice', categories: [], tags: [], finished: false }])
        const job = database.createDownloadJob({ comicId: 'job-comic' })
        database.transitionDownloadJob(job.id, 'QUEUED')
        database.transitionDownloadJob(job.id, 'PAUSED')
        database.transitionDownloadJob(job.id, 'QUEUED')
        expect(database.transitionDownloadJob(job.id, 'CANCELLED')).toMatchObject({ status: 'CANCELLED', finishedAt: expect.any(String) })
        database.close()
    })
})
