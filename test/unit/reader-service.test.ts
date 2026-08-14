import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { ReaderService } from '../../src/services/reader-service'

const directories: string[] = []

function fixture(pages = 3) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-reader-'))
    directories.push(root)
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    database.importCatalog([
        {
            comicId: 'reader-comic',
            title: 'Reader Comic',
            author: 'Alice',
            categories: [],
            tags: [],
            finished: false
        }
    ])
    database.upsertEpisode({
        id: 'episode-1',
        comicId: 'reader-comic',
        title: 'Chapter 1',
        order: 1
    })
    for (let index = 0; index < pages; index++) {
        const file = path.join(root, 'downloads', `${index + 1}.jpg`)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, `page-${index + 1}`)
        database.upsertPicture({
            id: `picture-${index}`,
            comicId: 'reader-comic',
            episodeId: 'episode-1',
            position: index + 1,
            originalName: `${index + 1}.jpg`,
            mediaPath: `${index + 1}.jpg`,
            fileServer: 'https://media.example'
        })
        database.markPictureDownloaded(
            `picture-${index}`,
            file,
            fs.statSync(file).size,
            'safe-hash'
        )
    }
    return { root, database, reader: new ReaderService(database, root) }
}

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('ReaderService', () => {
    it('reads downloaded chapters and persists resume position', () => {
        const { database, reader } = fixture()
        expect(reader.chapters('reader-comic')[0]).toMatchObject({
            downloadedPictures: 3,
            knownPictures: 3
        })
        expect(reader.chapter('reader-comic', 'episode-1').pages).toHaveLength(
            3
        )
        expect(reader.picture('picture-0')).toMatchObject({
            contentType: 'image/jpeg'
        })
        reader.saveProgress('reader-comic', 'episode-1', 2)
        expect(
            reader.chapter('reader-comic', 'episode-1').progress
        ).toMatchObject({
            pageIndex: 2
        })
        expect(() =>
            reader.saveProgress('reader-comic', 'episode-1', 3)
        ).toThrow(/页码无效/)
        database.close()
    })

    it('rejects undownloaded chapters and local path escape', () => {
        const { root, database, reader } = fixture(0)
        expect(() => reader.chapter('reader-comic', 'episode-1')).toThrow(
            /尚未下载/
        )
        const outside = path.join(path.dirname(root), 'outside-reader.jpg')
        fs.writeFileSync(outside, 'outside')
        database.upsertPicture({
            id: 'escape',
            comicId: 'reader-comic',
            episodeId: 'episode-1',
            position: 1,
            originalName: 'escape.jpg',
            mediaPath: 'escape.jpg',
            fileServer: 'https://media.example'
        })
        database.markPictureDownloaded('escape', outside, 7, 'hash')
        expect(() => reader.picture('escape')).toThrow(/escaped/)
        fs.rmSync(outside, { force: true })
        database.close()
    })

    it('exports ordered CBZ pages without credentials or metadata secrets', () => {
        const { database, reader } = fixture(12)
        const result = reader.exportCbz('reader-comic', 'episode-1')
        expect(result).toMatchObject({ pages: 12 })
        const zip = new AdmZip(result.path)
        const names = zip.getEntries().map((entry) => entry.entryName)
        expect(names[0]).toBe('01.jpg')
        expect(names.at(-1)).toBe('12.jpg')
        const combined = Buffer.concat(
            zip.getEntries().map((entry) => entry.getData())
        )
            .toString('utf8')
            .toLowerCase()
        expect(combined).not.toMatch(
            /authorization|bearer|cookie|pica_password/
        )
        database.close()
    })

    it('handles chapters with hundreds of pages without unbounded reader state', () => {
        const { database, reader } = fixture(300)
        const chapter = reader.chapter('reader-comic', 'episode-1')
        expect(chapter.pages).toHaveLength(300)
        expect(JSON.stringify(chapter)).not.toContain('localPath')
        database.close()
    }, 20_000)
})
