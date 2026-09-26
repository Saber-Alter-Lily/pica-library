import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P2 J5 Desktop Detail/Shelf/Reader browser benchmark', () => {
    it('seeds a fully local fixture through LibraryDatabase APIs', () => {
        const seed = fs.readFileSync(
            'scripts/benchmark/seed-desktop-browser-detail-reader-fixture.ts',
            'utf8'
        )
        expect(seed).toContain('new LibraryDatabase(databaseFile)')
        expect(seed).toContain("database.importFavorites(comics, 'benchmark:j5'")
        expect(seed).toContain("database.createShelf('J5 基准书架')")
        expect(seed).toContain('database.addShelfItems')
        expect(seed).toContain('database.upsertEpisode')
        expect(seed).toContain('database.upsertPicture')
        expect(seed).toContain('database.markPictureDownloaded')
        expect(seed).toContain("path.join(root, 'benchmark-pages'")
        expect(seed).not.toContain('new DatabaseSync')
        expect(seed).not.toContain('INSERT INTO')
    })

    it('measures real Chromium detail, shelf and Reader readiness boundaries', () => {
        const source = fs.readFileSync(
            'scripts/benchmark/desktop-browser-detail-reader-harness.mjs',
            'utf8'
        )
        expect(source).toContain("require('@playwright/test')")
        expect(source).toContain("chromium.launch({ headless: true })")
        expect(source).toContain('[data-library-detail=')
        expect(source).toContain('#recommend-detail-dialog')
        expect(source).toContain('[data-shelf-open=')
        expect(source).toContain('#shelf-detail')
        expect(source).toContain('[data-shelf-read=')
        expect(source).toContain('#reader-title')
        expect(source).toContain('#reader-chapter-title')
        expect(source).toContain('#reader-pages img[data-reader-page]')
        expect(source).toContain('image.complete')
        expect(source).toContain('image.naturalWidth > 0')
        expect(source).toContain('#reader-next-chapter')
        expect(source).toContain('libraryDetailClickToUsableMs')
        expect(source).toContain('shelvesClickToListUsableMs')
        expect(source).toContain('shelfOpenClickToUsableMs')
        expect(source).toContain('shelfReadClickToReaderUsableMs')
        expect(source).toContain('readerNextChapterClickToUsableMs')
        expect(source).toContain('browserLaunchIncludedInMeasurement: false')
        expect(source).toContain('engineStartupIncludedInMeasurement: false')
    })

    it('keeps provider traffic out of the measured local foreground fixture', () => {
        const runner = fs.readFileSync(
            'scripts/run-desktop-browser-detail-reader-harness.mjs',
            'utf8'
        )
        expect(runner).toContain("const PLAYWRIGHT_VERSION = '1.63.0'")
        expect(runner).toContain("proxyUrl: 'http://127.0.0.1:9'")
        expect(runner).toContain("PICA_LIBRARY_DESKTOP_HOME: desktopHome")
        expect(runner).toContain('seed-desktop-browser-detail-reader-fixture.ts')
        expect(runner).toContain('PICA_PLAYWRIGHT_TOOL_ROOT: toolRoot')
        expect(runner).toContain('PLAYWRIGHT_BROWSERS_PATH: browsersPath')
        expect(runner).toContain("credentialBackend !== 'windows-dpapi'")
        expect(runner).toContain("credentialBackend !== 'session-memory'")
        expect(runner).toContain('/api/v1/desktop/shutdown')
    })

    it('keeps project dependencies unchanged and hosted timing non-promotional', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        const workflow = fs.readFileSync(
            '.github/workflows/desktop-browser-detail-reader-harness.yml',
            'utf8'
        )
        const source = fs.readFileSync(
            'scripts/benchmark/desktop-browser-detail-reader-harness.mjs',
            'utf8'
        )
        expect(pkg.devDependencies?.['@playwright/test']).toBeUndefined()
        expect(workflow).toContain('--harness-validation-only')
        expect(workflow).toContain('--rounds=2')
        expect(workflow).toContain('--with-deps')
        expect(workflow).toContain('github.event.repository.private == false')
        expect(source).toContain('harnessValidationOnly')
        expect(source).toContain(
            'It does not define a P2-K performance budget or release threshold.'
        )
        expect(source).not.toContain('budgetMs')
        expect(source).not.toContain('p95 <')
    })

    it('does not emit loopback URL, comic identity or temporary paths in reports', () => {
        const source = fs.readFileSync(
            'scripts/benchmark/desktop-browser-detail-reader-harness.mjs',
            'utf8'
        )
        expect(source).not.toContain('baseUrl: options.baseUrl')
        expect(source).not.toContain('comicId: options.fixture.comicId')
        expect(source).not.toContain('shelfId: options.fixture.shelfId')
        expect(source).not.toContain('fixtureFile:')
        expect(source).not.toContain('toolRoot:')
        expect(source).not.toContain('desktopHome:')
    })
})
