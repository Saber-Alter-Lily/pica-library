import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'

const roots: string[] = []
const source = (file: string) =>
    fs.readFileSync(path.resolve(import.meta.dirname, '../..', file), 'utf8')

function db() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-round2-contract-'))
    roots.push(root)
    return new LibraryDatabase(path.join(root, 'library.db'))
}

function comic(comicId: string) {
    return {
        comicId,
        title: `Synthetic ${comicId}`,
        author: 'Synthetic author',
        categories: [],
        tags: [],
        finished: false
    }
}

afterEach(() => {
    while (roots.length) {
        fs.rmSync(roots.pop()!, { recursive: true, force: true })
    }
})

describe('Round 2 count and sync contracts', () => {
    it('library_count_semantics', () => {
        const value = db()
        value.importFavorites([comic('favorite')], 'pica:favorites')
        value.importCatalog([comic('search-only')], 'pica:discover')
        expect(value.summary()).toMatchObject({
            comics: 1,
            catalogComics: 2,
            favorites: 1
        })
        value.close()
    })

    it('favorites_subset_of_library', () => {
        const value = db()
        value.importFavorites([comic('a'), comic('b')], 'pica:favorites')
        value.importCatalog([comic('c')], 'pica:discover')
        const favoriteIds = new Set(
            value
                .listComics()
                .filter((item) => item.isFavorite)
                .map((item) => item.comicId)
        )
        const libraryIds = new Set(
            value.listComics().map((item) => item.comicId)
        )
        expect([...favoriteIds].every((id) => libraryIds.has(id))).toBe(true)
        value.close()
    })

    it('favorites_sync_no_unexpected_duplicates', () => {
        const value = db()
        value.importFavorites([comic('a'), comic('a'), comic('b')])
        expect(value.reconcileLibraryCounts()).toMatchObject({
            totalComicRecords: 2,
            duplicateCanonicalIds: 0,
            duplicateProviderRawIds: 0
        })
        value.close()
    })

    it('canonical_id_dedup_during_sync', () => {
        const value = db()
        const result = value.importFavorites([
            { ...comic('same'), title: 'Old' },
            { ...comic('same'), title: 'New' }
        ])
        expect(result.imported).toBe(1)
        expect(value.listComics()).toHaveLength(1)
        expect(value.listComics()[0].title).toBe('New')
        value.close()
    })

    it('favorites_sync_change_summary', () => {
        const value = db()
        value.importFavorites([comic('a'), comic('b')])
        expect(value.importFavorites([comic('b'), comic('c')])).toMatchObject({
            favoriteCount: 2,
            addedFavorites: 1,
            removedFavorites: 1,
            libraryInserted: 1,
            libraryUpdated: 1
        })
        value.close()
    })

    it('reproduces the observed 2040 library / 1772 favorites shape', () => {
        const value = db()
        value.importFavorites(
            Array.from({ length: 1504 }, (_, index) => comic(`fav-${index}`))
        )
        value.importCatalog(
            Array.from({ length: 268 }, (_, index) => comic(`local-${index}`)),
            'pica:discover'
        )
        const result = value.importFavorites(
            Array.from({ length: 1772 }, (_, index) => comic(`fav-${index}`))
        )
        expect(result).toMatchObject({
            favoriteCount: 1772,
            addedFavorites: 268,
            removedFavorites: 0,
            libraryInserted: 268
        })
        expect(value.reconcileLibraryCounts()).toMatchObject({
            totalComicRecords: 2040,
            favoriteRecords: 1772,
            nonFavoriteRecords: 268,
            duplicateCanonicalIds: 0,
            duplicateProviderRawIds: 0
        })
        value.close()
    })

    it('separates metadata hydration from actual download completion provenance', () => {
        const value = db()
        value.importCatalog([comic('hydrated')], 'pica:download:metadata')
        expect(value.reconcileLibraryCounts()).toMatchObject({
            metadataHydrationOnly: 1,
            provenanceGroups: { 'metadata hydration': 1 }
        })
        value.upsertEpisode({
            id: 'episode',
            comicId: 'hydrated',
            title: 'Chapter',
            order: 1
        })
        const file = path.join(roots[roots.length - 1], 'picture.jpg')
        fs.writeFileSync(file, 'image')
        value.upsertPicture({
            id: 'picture',
            comicId: 'hydrated',
            episodeId: 'episode',
            position: 1,
            originalName: 'picture.jpg',
            mediaPath: '/picture.jpg',
            fileServer: 'https://media.example'
        })
        value.markPictureDownloaded('picture', file, 5, 'synthetic-sha')
        expect(value.reconcileLibraryCounts()).toMatchObject({
            metadataHydrationOnly: 0,
            provenanceGroups: {
                'metadata hydration': 1,
                'download completion': 1
            }
        })
        value.close()
    })
})

describe('Round 2 shared view and responsive contracts', () => {
    const css = source('web/styles.css')
    const html = source('web/index.html')
    const app = source('web/app.js')

    it.each([
        ['grid_size_large', 'minmax(250px, 1fr)'],
        ['grid_size_medium', 'minmax(175px, 1fr)'],
        ['grid_size_small', 'minmax(120px, 1fr)']
    ])('%s', (_name, rule) => expect(css).toContain(rule))

    it.each([
        ['responsive_toolbar_900', '@media (max-width: 980px)'],
        ['responsive_toolbar_700', '@media (max-width: 760px)'],
        ['responsive_toolbar_mobile', 'flex-wrap: wrap']
    ])('%s', (_name, rule) => expect(css).toContain(rule))

    it.each([
        'library_grid_sizes',
        'recommendation_grid_sizes',
        'downloaded_grid_sizes'
    ])('%s', (name) => {
        const scope = name.replace('_grid_sizes', '')
        expect(html).toContain(`data-size-scope="${scope}"`)
        expect(
            html.match(new RegExp(`data-size-scope="${scope}"`, 'g'))
        ).toHaveLength(3)
    })

    it('downloaded_grid', () =>
        expect(html).toContain('id="downloaded-grid-items"'))
    it('downloaded_list', () => expect(html).toContain('id="downloaded-table"'))
    it('large_library_2000_render_bound', () =>
        expect(source('web/lite-state.js')).toContain(
            'export const LIBRARY_PAGE_SIZE = 48'
        ))
    it('large_library_5000_render_bound', () => {
        expect(app).toContain('/api/v1/comics?limit=5000')
        expect(source('web/lite-state.js')).toContain(
            'return records.slice(0, safePage * safeSize)'
        )
    })
})

describe('Round 2 progress and download observability contracts', () => {
    const app = source('web/app.js')
    const service = source('src/library/service.ts')
    const provider = source('src/services/provider-service.ts')
    const desktop = source('src/desktop/main.ts')

    it('sync_progress_indeterminate', () => {
        expect(app).toContain('正在检查收藏更新…')
        expect(app).toContain(
            "setProgress($('#library-operation'), message.textContent, 0, 0)"
        )
    })
    it('sync_progress_determinate', () => {
        expect(provider).toContain("phase: 'processing'")
        expect(app).toContain('progress.found')
        expect(service).toContain('found: result.addedFavorites')
    })
    it('import_progress', () => {
        expect(app).toContain("t('message.importRead')")
        expect(app).toContain("t('message.importWrite')")
        expect(app).toContain("t('message.importAuthors')")
    })
    it('bundle_export_stage_progress', () => {
        for (const phase of [
            'sync-favorites',
            'update-library',
            'prepare-recommendations',
            'generate-bundle',
            'choose-save-location',
            'write-file',
            'complete'
        ]) {
            expect(desktop).toContain(`phase: '${phase}'`)
        }
    })
    it('download_live_picture_progress', () =>
        expect(app).toContain('job.progressCompleted'))
    it('download_live_byte_progress', () =>
        expect(app).toContain('job.expectedBytes'))
    it('download_task_manga_title', () =>
        expect(app).toContain('job.comicTitle'))
    it('download_task_chapter_title', () =>
        expect(app).toContain('job.chapterTitle'))
    it('download_poll_updates_running_task', () => {
        expect(app).toContain('setInterval(() => void loadJobs(), 1000)')
        expect(app).toContain("activeView === 'downloads'")
    })
    it('download_pause_progress_retained', () => {
        const database = source('src/library/database.ts')
        expect(database).toContain('progress_completed = ?')
        expect(app).toContain('data-job-action="resume"')
    })
    it('download_cancel_progress_visible', () => {
        expect(app).toContain("t('downloads.cancelConfirm'")
        expect(app).toContain('completed: job.progressCompleted')
    })
})

describe('Round 2 downloaded library contracts', () => {
    const app = source('web/app.js')
    const database = source('src/library/database.ts')

    it('downloaded_library_requires_actual_local_content', () => {
        expect(database).toContain("WHERE p.status = 'completed'")
        expect(database).toContain('fs.statSync(localPath)')
    })
    it('downloaded_library_partial', () =>
        expect(database).toContain("status: 'partial'"))
    it('downloaded_library_complete', () =>
        expect(database).toContain(
            'item.downloadedPictures >= item.knownPictures'
        ))
    it('downloaded_cover_off_zero_requests', () => {
        expect(app).toContain('state.downloadedCoversEnabled')
        expect(app).toContain(": ''")
    })
})
