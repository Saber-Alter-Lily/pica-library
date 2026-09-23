import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryQueryService } from '../../src/services/library-query-service'
import type { FavoriteRecord, LibraryFacetQuery, StoredComic } from '../../src/library/types'
import { normalizeAuthorKey } from '../../src/library/author'

const roots: string[] = []

function comic(
    id: string,
    input: Partial<FavoriteRecord> = {}
): FavoriteRecord {
    return {
        comicId: id,
        providerId: input.providerId ?? 'pica',
        providerRemoteId: input.providerRemoteId ?? id,
        title: input.title ?? id,
        author: input.author ?? 'Creator A',
        categories: input.categories ?? [],
        tags: input.tags ?? [],
        finished: input.finished ?? false,
        ...input
    }
}

function setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-query-sql-'))
    roots.push(root)
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    return { root, database, query: new LibraryQueryService(database) }
}

function downloadState(comic: StoredComic) {
    if (comic.downloadedPictures === 0) return 'not-downloaded'
    if (
        comic.knownPictures > 0 &&
        comic.downloadedPictures >= comic.knownPictures
    )
        return 'complete'
    return 'partial'
}

function reference(
    database: LibraryDatabase,
    input: LibraryFacetQuery
) {
    const query = {
        scope: input.scope ?? 'library',
        providerIds: new Set(input.providerIds ?? []),
        authorIds: new Set(input.authorIds ?? []),
        finished: input.finished,
        download: input.download
    }
    return database.listAllComics().filter((item) => {
        if (query.scope === 'library' && !item.inLibrary) return false
        if (query.scope === 'favorites' && !item.isFavorite) return false
        if (query.scope === 'downloaded' && item.downloadedPictures === 0)
            return false
        if (
            query.providerIds.size &&
            !query.providerIds.has(item.providerId ?? 'pica')
        )
            return false
        if (
            query.authorIds.size &&
            (!item.authorId || !query.authorIds.has(item.authorId))
        )
            return false
        if (
            query.finished !== undefined &&
            item.finished !== query.finished
        )
            return false
        const state = downloadState(item)
        if (query.download === 'downloaded')
            return state !== 'not-downloaded'
        if (query.download && state !== query.download) return false
        return true
    })
}

afterEach(() => {
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('LibraryQueryService SQLite prefilter', () => {
    it('matches the prior in-memory semantics for common structural filters', () => {
        const { root, database, query } = setup()
        database.importFavorites(
            [
                comic('fav-pica', {
                    title: 'Alpha',
                    author: 'Creator A',
                    providerId: 'pica',
                    tags: ['tag-a'],
                    finished: true
                })
            ],
            'pica:favorites:full'
        )
        database.importCatalog(
            [
                comic('eh:101:abc', {
                    title: 'Beta',
                    author: 'Creator B',
                    providerId: 'eh',
                    providerRemoteId: '101:abc',
                    tags: ['tag-b'],
                    finished: false
                }),
                comic('partial-pica', {
                    title: 'Gamma',
                    author: 'Creator A',
                    providerId: 'pica',
                    tags: ['tag-a', 'tag-c'],
                    finished: false
                })
            ],
            'pica:discover'
        )
        const shelf = database.createShelf('Owned')
        database.addShelfItems(shelf.id, ['eh:101:abc', 'partial-pica'])

        for (const id of ['eh:101:abc', 'partial-pica']) {
            database.upsertEpisode({
                id: `ep-${id}`,
                comicId: id,
                title: 'Episode',
                order: 1
            })
            for (let position = 1; position <= 2; position++)
                database.upsertPicture({
                    id: `pic-${id}-${position}`,
                    comicId: id,
                    episodeId: `ep-${id}`,
                    position,
                    originalName: `${position}.jpg`,
                    mediaPath: `/${position}.jpg`,
                    fileServer: 'https://media.example'
                })
        }
        const downloaded = path.join(root, 'page.jpg')
        fs.writeFileSync(downloaded, 'page')
        database.markPictureDownloaded(
            'pic-partial-pica-1',
            downloaded,
            4,
            'hash'
        )
        for (let position = 1; position <= 2; position++) {
            const file = path.join(root, `eh-${position}.jpg`)
            fs.writeFileSync(file, 'page')
            database.markPictureDownloaded(
                `pic-eh:101:abc-${position}`,
                file,
                4,
                `hash-${position}`
            )
        }

        const creatorA = database
            .listAllComics()
            .find((item) => normalizeAuthorKey(item.author) === 'creator a')
            ?.authorId
        expect(creatorA).toBeTruthy()

        const cases: LibraryFacetQuery[] = [
            { scope: 'library' },
            { scope: 'favorites' },
            { scope: 'downloaded' },
            { scope: 'catalog', providerIds: ['eh'] },
            { scope: 'catalog', providerIds: ['pica'], finished: false },
            { scope: 'catalog', authorIds: [creatorA!] },
            { scope: 'catalog', download: 'not-downloaded' },
            { scope: 'catalog', download: 'partial' },
            { scope: 'catalog', download: 'complete' },
            {
                scope: 'library',
                providerIds: ['pica'],
                authorIds: [creatorA!],
                finished: false,
                download: 'partial'
            }
        ]

        for (const input of cases) {
            const actual = query
                .query({ ...input, limit: 5000, sort: 'title' })
                .items.map((item) => item.comicId)
                .sort()
            const expected = reference(database, input)
                .map((item) => item.comicId)
                .sort()
            expect(actual, JSON.stringify(input)).toEqual(expected)
        }
        database.close()
    })

    it('keeps Unicode text and tag matching above the SQL prefilter boundary', () => {
        const { database, query } = setup()
        database.importFavorites(
            [
                comic('unicode', {
                    title: '作品Ａ',
                    author: '作者Ａ',
                    tags: ['巨乳', 'Tag A']
                })
            ],
            'pica:favorites:full'
        )
        expect(
            query.query({
                scope: 'library',
                text: '作品A',
                tags: ['巨乳']
            }).items.map((item) => item.comicId)
        ).toEqual(['unicode'])
        database.close()
    })
})
