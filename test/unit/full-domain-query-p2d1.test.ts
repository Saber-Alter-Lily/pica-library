import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { serializeBrowserLiteDataPackage } from '../../src/library/bundle-export'
import { validateLibraryBundle } from '../../src/types/bundle'

const temporaryDirectories: string[] = []

function database() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-p2d1-'))
    temporaryDirectories.push(directory)
    return new LibraryDatabase(path.join(directory, 'library.db'))
}

function record(index: number) {
    return {
        comicId: `full-domain-${index}`,
        title: `Full Domain Work ${index}`,
        author: `Author ${index % 41}`,
        categories: ['fixture'],
        tags: [`tag-${index % 17}`],
        finished: index % 2 === 0
    }
}

afterEach(() => {
    while (temporaryDirectories.length)
        fs.rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
})

describe('P2 D1 full-domain query discipline', () => {
    it('exports Browser Lite libraries beyond the legacy 5000-record cap', () => {
        const store = database()
        const count = 5007
        store.importCatalog(
            Array.from({ length: count }, (_, index) => record(index)),
            'p2-d1-large-library'
        )

        expect(store.listAllComics()).toHaveLength(count)

        const bundle = validateLibraryBundle(
            JSON.parse(serializeBrowserLiteDataPackage(store))
        )
        expect(bundle.library.comics).toHaveLength(count)
        const boundaryComicId = `full-domain-${count - 1}`
        expect(
            bundle.library.comics.some(
                (comic) => comic.comicId === boundaryComicId
            )
        ).toBe(true)

        const shelf = store.createShelf('Beyond 5000')
        store.addShelfItems(shelf.id, [boundaryComicId])
        expect(
            store.listShelfComics(shelf.id).map((comic) => comic.comicId)
        ).toEqual([boundaryComicId])
        expect(
            store
                .recommendationRecords([boundaryComicId])
                .map((item) => item.comic.comicId)
        ).toEqual([boundaryComicId])
        store.close()
    })

    it('keeps complete-domain CLI commands off fixed 5000-row list limits', () => {
        const cli = fs.readFileSync('src/library-cli.ts', 'utf8')
        const bundle = fs.readFileSync('src/library/bundle-export.ts', 'utf8')

        expect(bundle).toContain(
            'const comics = options.comics ?? database.listAllComics()'
        )
        expect(bundle).not.toContain('database.listComics({ limit: 5000 })')

        expect(cli).not.toContain('listComics({ limit: 5000 })')
        expect(cli).toContain('const comics = database.listAllComics()')
        expect(cli).toContain(
            'const selected = comicId ? database.getComic(comicId) : undefined'
        )
        expect(cli).toContain(
            ': database.listAllComics()'
        )
        expect(cli).toContain(
            '.listAllComics()\n                .filter((comic) => comic.isFavorite)'
        )
    })
})
