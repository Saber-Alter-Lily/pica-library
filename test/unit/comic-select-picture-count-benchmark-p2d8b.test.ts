import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'

const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')

const roots: string[] = []

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-p2d8b-'))
    roots.push(root)
    const indexed = path.join(root, 'indexed.db')
    const library = new LibraryDatabase(indexed)
    library.importCatalog(
        Array.from({ length: 12 }, (_, index) => ({
            comicId: `comic-${index}`,
            title: `Comic ${index}`,
            author: 'Author',
            categories: [],
            tags: [],
            finished: false
        })),
        'p2d8b-fixture'
    )
    for (let index = 0; index < 12; index += 1) {
        const episodeId = `episode-${index}`
        library.upsertEpisode({
            id: episodeId,
            comicId: `comic-${index}`,
            title: 'Episode',
            order: 1
        })
        for (let pictureIndex = 0; pictureIndex < 8; pictureIndex += 1) {
            library.upsertPicture({
                id: `picture-${index}-${pictureIndex}`,
                comicId: `comic-${index}`,
                episodeId,
                position: pictureIndex,
                originalName: `${pictureIndex}.jpg`,
                mediaPath: `/${pictureIndex}.jpg`,
                fileServer: 'https://media.example'
            })
        }
    }
    library.close()

    const withoutIndex = path.join(root, 'without-index.db')
    fs.copyFileSync(indexed, withoutIndex)
    const raw = new DatabaseSync(withoutIndex)
    raw.exec('DROP INDEX IF EXISTS idx_pictures_comic_status')
    raw.close()
    return { indexed, withoutIndex }
}

afterEach(() => {
    while (roots.length)
        fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

function snapshot(file: string) {
    const database = new LibraryDatabase(file)
    const detail = database.getComic('comic-11')
    const catalog = database
        .listComicsForLibraryQueryBase({ scope: 'catalog' })
        .map((comic) => ({
            comicId: comic.comicId,
            knownEpisodes: comic.knownEpisodes,
            knownPictures: comic.knownPictures,
            downloadedPictures: comic.downloadedPictures
        }))
    database.close()
    return {
        detail: detail
            ? {
                  comicId: detail.comicId,
                  knownEpisodes: detail.knownEpisodes,
                  knownPictures: detail.knownPictures,
                  downloadedPictures: detail.downloadedPictures
              }
            : null,
        catalog
    }
}

describe('P2 D8B comicSelect scaling evidence harness', () => {
    it('keeps query semantics identical with and without the D8A index', () => {
        const { indexed, withoutIndex } = fixture()
        expect(snapshot(indexed)).toEqual(snapshot(withoutIndex))
    })

    it('exposes an A/B scaling harness without defining a performance threshold', () => {
        const script = fs.readFileSync(
            'scripts/benchmark/comic-select-picture-count-harness.ts',
            'utf8'
        )
        const pkg = JSON.parse(
            fs.readFileSync('package.json', 'utf8')
        ) as { scripts: Record<string, string> }

        expect(pkg.scripts['benchmark:comic-select-picture-count']).toBe(
            'tsx scripts/benchmark/comic-select-picture-count-harness.ts'
        )
        expect(script).toContain(
            'comic-select-picture-count-index-scaling-p2-d8b'
        )
        expect(script).toContain(
            "DROP INDEX IF EXISTS idx_pictures_comic_status"
        )
        expect(script).toContain('relativeWithoutIndexOverIndexed')
        expect(script).toContain('[500, 2000, 5000]')
        expect(script).toContain(
            'Do not use these wall times as a user-facing latency budget or release threshold.'
        )
        expect(script).not.toContain('process.exitCode = 2')
    })
})
