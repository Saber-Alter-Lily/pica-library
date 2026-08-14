import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const app = fs.readFileSync(path.join(root, 'web/app.js'), 'utf8')
const html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8')
const css = fs.readFileSync(path.join(root, 'web/styles.css'), 'utf8')

describe('dev.2 connected Web lifecycle contracts', () => {
    it('reader_exit_button', () => {
        expect(html).toContain('id="reader-exit"')
        expect(app).toContain("$('#reader-exit').onclick")
        expect(app).toContain('state.reader.originView')
    })

    it('reader_exit_returns_origin', () => {
        expect(app).toContain(
            "activateView(state.reader.originView || 'downloaded')"
        )
    })

    it.each([
        'reader_progress_vertical_center_page',
        'reader_progress_single_page',
        'reader_progress_double_page'
    ])('%s', () => {
        expect(app).toContain('getBoundingClientRect().top')
        expect(app).toContain('queueReaderProgress(reader.pageIndex)')
    })

    it('reader_progress_flush_on_exit', () => {
        expect(app).toMatch(
            /async function exitReader\(\)[\s\S]*await flushReaderProgress\(\)/
        )
    })

    it('reader_progress_flush_on_chapter_switch', () => {
        expect(app).toMatch(
            /async function openReaderChapter[\s\S]*await flushReaderProgress\(\)/
        )
    })

    it('reader_progress_pagehide_keepalive', () => {
        expect(app).toContain("window.addEventListener('pagehide'")
        expect(app).toContain('keepalive: true')
        expect(app).toContain("document.addEventListener('visibilitychange'")
    })

    it.each([
        'reader_resume_same_episode_page',
        'reader_resume_after_app_restart',
        'reader_resume_clamps_removed_page'
    ])('%s', () => {
        expect(app).toContain("api('/api/v1/reader/progress')")
        expect(app).toContain('chapter.progress?.pageIndex || 0')
        expect(app).toContain('Math.max(0, chapter.pages.length - 1)')
    })

    it('reader_vertical_resume_scrolls_to_saved_page_before_observing', () => {
        expect(app).toContain('const resumePage = reader.pageIndex')
        expect(app).toContain(
            '.querySelector(`[data-reader-page="${resumePage}"]`)'
        )
        expect(app).toContain("?.scrollIntoView({ block: 'center' })")
        expect(app).toContain('继续阅读：第 ${state.reader.pageIndex + 1} 页')
    })

    it.each([
        'shelf_grid_cover',
        'shelf_cover_lazy_loading',
        'shelf_cover_off_zero_requests'
    ])('%s', () => {
        expect(app).toContain('state.shelfCoversEnabled ?')
        expect(app).toContain(
            '/api/v1/covers/${encodeURIComponent(comic.comicId)}'
        )
        expect(app).toContain('loading="lazy"')
    })

    it.each([
        'shelf_list',
        'shelf_grid_small',
        'shelf_grid_medium',
        'shelf_grid_large',
        'shelf_selection_regression',
        'shelf_reader_action_regression'
    ])('%s', () => {
        expect(html).toContain('data-size-scope="shelf"')
        expect(html).toContain('id="shelf-list-view"')
        expect(css).toContain('.shelf-list-mode')
        expect(app).toContain('data-selection-context="shelf"')
        expect(app).toContain('data-shelf-read=')
    })

    it('quick and full sync controls are distinct', () => {
        expect(html).toContain('id="sync-button"')
        expect(html).toContain('id="full-sync-button"')
        expect(app).toContain("syncFavorites($('#import-result'), 'full')")
        expect(app).toContain("await post('/api/v1/sync', { mode })")
        expect(app).toContain('if (desktop) desktop.lastSync = result.lastSync')
    })

    it('restores and prewarms recommendation sessions without a start click', () => {
        expect(app).toContain("'/api/v1/recommendation-sessions/status'")
        expect(app).toContain("action: 'batch'")
        expect(app).toContain("action: 'next'")
        expect(app).toContain('recommendation.nextSessionReady')
    })

    it('shows durable, favorite, downloaded and advanced catalog scopes', () => {
        for (const scope of ['library', 'favorites', 'downloaded', 'catalog'])
            expect(html).toContain(`value="${scope}"`)
        expect(html).not.toContain('全部本地漫画')
    })

    it('makes ZIP the primary archive export while retaining CBZ', () => {
        expect(html).toContain('id="reader-export-zip"')
        expect(html).toContain('id="reader-export-cbz"')
        expect(html.indexOf('id="reader-export-zip"')).toBeLessThan(
            html.indexOf('id="reader-export-cbz"')
        )
    })
})
