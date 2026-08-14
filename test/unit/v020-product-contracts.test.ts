import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('v0.2.0 product UI and documentation contracts', () => {
    const app = read('web/app.js')
    const html = read('web/index.html')
    const css = read('web/styles.css')

    it('exposes author/tag facets, explicit tag semantics, chips and backend bulk action', () => {
        for (const id of [
            'filter-scope',
            'filter-author-input',
            'filter-author-options',
            'filter-tag',
            'filter-tag-options',
            'filter-tag-mode',
            'filter-chips',
            'library-add-filtered-shelf'
        ])
            expect(html).toContain(`id="${id}"`)
        expect(html).toContain('<option value="all">标签：全部匹配</option>')
        expect(html).toContain('<option value="any">标签：任一匹配</option>')
        expect(app).toContain('/add-filtered')
        expect(app).toContain('state.libraryQueryResult?.query')
    })

    it('shares selection semantics across library, recommendation, search and shelves', () => {
        for (const context of ['library', 'recommendation', 'search', 'shelf'])
            expect(app).toContain(`${context}: new Set()`)
        expect(app).toContain('data-selection-context')
        expect(html).toContain('id="recommend-add-shelf"')
        expect(html).toContain('id="search-add-shelf"')
    })

    it('advances recommendation sessions without wrapping batch 5 to batch 1', () => {
        expect(app).toContain("post('/api/v1/recommendation-sessions', {})")
        expect(app).toContain('state.recommendationSessionNo = value.sessionNo')
        expect(app).toContain('state.recommendationExhausted = value.exhausted')
        expect(app).toContain("action: 'restart'")
        expect(app).toContain('当前离线数据中的推荐已经看完。')
    })

    it('keeps recommendation previews user-triggered and bounded to three pages', () => {
        expect(app).toContain('count: 3')
        expect(app).toContain('data-detail-preview-more="true"')
        expect(app).not.toMatch(
            /recommendations\.forEach[\s\S]{0,500}previews\/prepare/
        )
        expect(html).toContain('id="recommend-detail-dialog"')
    })

    it('gates the remote favorite button on provider capability', () => {
        expect(app).toContain(
            'state.capabilities?.features?.providerFavoriteMutation'
        )
        expect(app).toContain('/api/v1/provider/favorites/')
        expect(app).not.toContain('document.querySelector("iframe")')
    })

    it('contains required reader modes, directions, fit, keyboard and resume flow', () => {
        for (const value of ['vertical', 'single', 'double', 'ltr', 'rtl'])
            expect(html).toContain(`value="${value}"`)
        expect(html).toContain('id="reader-fullscreen"')
        expect(app).toContain("event.key === 'ArrowLeft'")
        expect(app).toContain("event.key === 'PageDown'")
        expect(app).toContain("api('/api/v1/reader/progress')")
        expect(app).toContain('resume?.episodeId || readable[0].id')
        expect(css).toContain('body.reader-active')
    })

    it('contains explicit update staging, confirmation and real phase labels', () => {
        expect(html).toContain('id="update-dropzone"')
        expect(html).toContain('将 Pica Library 更新包拖到这里')
        expect(app).toContain("'/api/v1/update/stage'")
        expect(app).toContain("'/api/v1/update/apply'")
        for (const phase of [
            '校验更新包',
            '解压到临时目录',
            '准备备份',
            '等待应用退出',
            '替换文件',
            '启动新版本',
            '检查运行状态',
            '完成'
        ])
            expect(app).toContain(phase)
    })

    it('keeps responsive contracts for half-screen and mobile reader/library', () => {
        expect(css).toContain('@media (max-width: 980px)')
        expect(css).toContain('@media (max-width: 760px)')
        expect(css).toContain('@media (max-width: 700px)')
        expect(css).toContain('.reader-controls')
        expect(css).toContain('.facet-control')
        expect(css).not.toContain('min-width: 1200px')
    })

    it('ships every required v0.2.0 contract document', () => {
        for (const name of [
            'V0_2_0_ARCHITECTURE.md',
            'UPDATE_PACKAGE_SPEC_V1.md',
            'RECOMMENDATION_SESSION_V1.md',
            'SHELF_MODEL_V1.md',
            'READER_V1.md',
            'LIBRARY_QUERY_AND_FACETS_V1.md',
            'PICA_FAVORITE_MUTATION_CAPABILITY.md',
            'EXTERNAL_READER_CANDIDATE_REPORT.md',
            'PICA_LIBRARY_V0_2_0_DEV1_USER_TEST_GUIDE.md'
        ])
            expect(fs.existsSync(path.join(root, 'docs', name)), name).toBe(
                true
            )
    })
})
