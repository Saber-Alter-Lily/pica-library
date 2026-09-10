import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryQueryService } from '../../src/services/library-query-service'
import type { FavoriteRecord } from '../../src/library/types'

const roots: string[] = []

function record(id: string): FavoriteRecord {
    return {
        comicId: id,
        title: `Comic ${id}`,
        author: `Author ${Number(id.replace(/\D/g, '')) % 20}`,
        categories: [],
        tags: [`Tag ${Number(id.replace(/\D/g, '')) % 10}`],
        finished: false
    }
}

function setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-membership-'))
    roots.push(root)
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    return { root, database, query: new LibraryQueryService(database) }
}

afterEach(() => {
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('catalog and durable Library membership', () => {
    it('separates 1773 favorites from recommendation/search catalog cache', () => {
        const { database, query } = setup()
        database.importFavorites(
            Array.from({ length: 1773 }, (_, index) => record(`fav-${index}`)),
            'pica:favorites:full'
        )
        database.importCatalog(
            Array.from({ length: 187 }, (_, index) => record(`cache-${index}`)),
            'pica:recommendations'
        )
        expect(database.summary()).toMatchObject({
            comics: 1773,
            favorites: 1773,
            catalogComics: 1960
        })
        expect(query.query({ scope: 'library', limit: 5000 }).total).toBe(1773)
        expect(query.query({ scope: 'favorites', limit: 5000 }).total).toBe(
            1773
        )
        expect(query.query({ scope: 'catalog', limit: 5000 }).total).toBe(1960)
        database.close()
    }, 30_000)

    it('recommendation_catalog_no_library_inflation', () => {
        const { database, query } = setup()
        database.importCatalog(
            [record('recommendation-only')],
            'pica:recommendations'
        )
        database.importCatalog([record('search-only')], 'pica:discover')
        database.importCatalog([record('details-only')], 'pica:details')
        expect(query.query({ scope: 'library' }).total).toBe(0)
        expect(query.query({ scope: 'catalog' }).total).toBe(3)
        database.close()
    })

    it('derives membership from favorites, shelves, downloads and explicit imports', () => {
        const { root, database, query } = setup()
        database.importFavorites([record('favorite')], 'pica:favorites:full')
        database.importCatalog(
            [record('shelved'), record('downloaded')],
            'pica:recommendations'
        )
        database.importFavorites(
            [record('imported')],
            'web:import',
            false,
            false
        )
        const shelf = database.createShelf('Shelf')
        database.addShelfItems(shelf.id, ['shelved'])
        database.upsertEpisode({
            id: 'episode',
            comicId: 'downloaded',
            title: 'Episode',
            order: 1
        })
        database.upsertPicture({
            id: 'picture',
            comicId: 'downloaded',
            episodeId: 'episode',
            position: 1,
            originalName: '001.jpg',
            mediaPath: '/001.jpg',
            fileServer: 'https://media.example'
        })
        const file = path.join(root, '001.jpg')
        fs.writeFileSync(file, 'page')
        database.markPictureDownloaded('picture', file, 4, 'hash')
        expect(query.query({ scope: 'library' }).total).toBe(4)
        database.deleteShelf(shelf.id)
        expect(query.query({ scope: 'library' }).total).toBe(3)
        expect(database.getComic('shelved')).toBeDefined()
        database.close()
    })

    it('migration_regression_preserves_catalog_and_existing_durable_state', () => {
        const { database, query } = setup()
        database.importFavorites([record('fav')], 'pica:favorites:full')
        database.importCatalog([record('cache')], 'pica:discover')
        const shelf = database.createShelf('Preserved')
        database.addShelfItems(shelf.id, ['cache'])
        expect(
            query.query({ scope: 'library' }).items.map((item) => item.comicId)
        ).toEqual(expect.arrayContaining(['fav', 'cache']))
        expect(query.query({ scope: 'catalog' }).total).toBe(2)
        database.close()
    })
})
