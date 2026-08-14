import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'

function database() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-round2-'))
    return {
        dir,
        value: new LibraryDatabase(path.join(dir, 'library.db'))
    }
}

function record(comicId: string, title = comicId) {
    return {
        comicId,
        title,
        author: 'Author',
        categories: [],
        tags: [],
        finished: false
    }
}

describe('v0.1.4 Round 2 library reconciliation', () => {
    it('deduplicates favorite IDs and exposes explicit count semantics', () => {
        const { value, dir } = database()
        const result = value.importFavorites(
            [record('same', 'First'), record('same', 'First updated')],
            'pica:favorites'
        )

        expect(result).toMatchObject({
            imported: 1,
            inserted: 1,
            favoriteCount: 1,
            addedFavorites: 1,
            removedFavorites: 0
        })
        expect(value.summary()).toMatchObject({
            comics: 1,
            favorites: 1,
            downloadedComics: 0
        })
        expect(value.listComics()[0].title).toBe('First updated')
        value.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('reconciles expected non-favorite records without treating them as duplicates', () => {
        const { value, dir } = database()
        value.importFavorites([record('favorite')], 'pica:favorites')
        value.importCatalog([record('search-only')], 'pica:discover')
        value.createDownloadJob({ comicId: 'queued-only', source: 'manual' })

        expect(value.reconcileLibraryCounts()).toMatchObject({
            totalComicRecords: 3,
            favoriteRecords: 1,
            nonFavoriteRecords: 2,
            distinctCanonicalComicIds: 3,
            distinctProviderRawIds: 3,
            duplicateCanonicalIds: 0,
            duplicateProviderRawIds: 0,
            favoriteIdsMissingComics: 0,
            sameMangaMultipleIds: 0
        })
        expect(value.reconcileLibraryCounts().provenanceGroups).toMatchObject({
            'favorites sync': 1,
            search: 1,
            'download enqueue': 1
        })
        value.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('requires real local files and distinguishes partial from complete downloads', () => {
        const { value, dir } = database()
        value.importCatalog([record('partial'), record('complete')])
        for (const comicId of ['partial', 'complete']) {
            value.upsertEpisode({
                id: `${comicId}-ep-1`,
                comicId,
                title: 'Chapter 1',
                order: 1
            })
            value.upsertEpisode({
                id: `${comicId}-ep-2`,
                comicId,
                title: 'Chapter 2',
                order: 2
            })
        }
        const partialFile = path.join(dir, 'partial.jpg')
        const completeOne = path.join(dir, 'complete-1.jpg')
        const completeTwo = path.join(dir, 'complete-2.jpg')
        fs.writeFileSync(partialFile, 'partial')
        fs.writeFileSync(completeOne, 'one')
        fs.writeFileSync(completeTwo, 'two')
        for (const [id, comicId, episodeId, file] of [
            ['partial-pic', 'partial', 'partial-ep-1', partialFile],
            ['complete-pic-1', 'complete', 'complete-ep-1', completeOne],
            ['complete-pic-2', 'complete', 'complete-ep-2', completeTwo]
        ] as const) {
            value.upsertPicture({
                id,
                comicId,
                episodeId,
                position: 1,
                originalName: `${id}.jpg`,
                mediaPath: file,
                fileServer: 'https://media.example'
            })
            value.markPictureDownloaded(id, file, fs.statSync(file).size, id)
        }
        value.upsertPicture({
            id: 'partial-pending',
            comicId: 'partial',
            episodeId: 'partial-ep-2',
            position: 1,
            originalName: 'pending.jpg',
            mediaPath: '/pending.jpg',
            fileServer: 'https://media.example'
        })

        expect(value.listDownloadedComics()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    comicId: 'partial',
                    status: 'partial',
                    downloadedPictures: 1
                }),
                expect.objectContaining({
                    comicId: 'complete',
                    status: 'complete',
                    downloadedPictures: 2
                })
            ])
        )
        fs.unlinkSync(partialFile)
        expect(
            value
                .listDownloadedComics()
                .some((item) => item.comicId === 'partial')
        ).toBe(false)
        value.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('keeps download task identity and persisted progress fields', () => {
        const { value, dir } = database()
        value.importCatalog([record('comic-1', 'Visible manga title')])
        const job = value.createDownloadJob({ comicId: 'comic-1' })
        value.transitionDownloadJob(job.id, 'QUEUED')
        value.transitionDownloadJob(job.id, 'PREPARING')
        value.transitionDownloadJob(job.id, 'RUNNING')
        value.updateDownloadProgress(job.id, {
            progressCompleted: 3,
            progressTotal: 8,
            bytes: 3072,
            chapterTitle: 'Chapter 12'
        })
        expect(value.getDownloadJob(job.id)).toMatchObject({
            comicTitle: 'Visible manga title',
            chapterTitle: 'Chapter 12',
            progressCompleted: 3,
            progressTotal: 8,
            bytes: 3072,
            progressUpdatedAt: expect.any(String)
        })
        value.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })
})

describe('v0.1.4 Round 2 bounded rendering contracts', () => {
    it('keeps library page rendering bounded for 2000 and 5000 records', () => {
        const source = fs.readFileSync(
            path.resolve(import.meta.dirname, '../../web/app.js'),
            'utf8'
        )
        expect(source).toContain('LIBRARY_PAGE_SIZE')
        expect(source).toContain('setGridSize')
        expect(source).toContain('limit=5000')
        expect(source).toContain('setInterval(() => void loadJobs(), 1000)')
    })

    it('defines shared grid sizes and responsive controls for all four views', () => {
        const html = fs.readFileSync(
            path.resolve(import.meta.dirname, '../../web/index.html'),
            'utf8'
        )
        const css = fs.readFileSync(
            path.resolve(import.meta.dirname, '../../web/styles.css'),
            'utf8'
        )
        expect(html.match(/data-grid-size="small"/g)?.length).toBe(4)
        expect(html.match(/data-grid-size="medium"/g)?.length).toBe(4)
        expect(html.match(/data-grid-size="large"/g)?.length).toBe(4)
        expect(css).toContain('.responsive-toolbar')
        expect(css).toContain('minmax(120px, 1fr)')
        expect(css).toContain('@media (max-width: 980px)')
        expect(css).toContain('@media (max-width: 760px)')
    })
})
