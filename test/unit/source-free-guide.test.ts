import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { guideCatalog } from '../../web/guide-catalog.js'
import {
    GUIDE_VERSION,
    normalizeGuideState,
    shouldPromptDaily
} from '../../web/onboarding-state.js'
import {
    buildLocalConfig,
    sourcePolicyForConfig
} from '../../src/desktop/config'

const words = [
    {
        local: '无需登录',
        none: '不接入任何来源',
        optional: '可跳过',
        preview: '预览不写入',
        original: '原文件不变'
    },
    {
        local: 'No account',
        none: 'No provider is required',
        optional: 'optional',
        preview: 'Preview writes nothing',
        original: 'leaves originals untouched'
    },
    {
        local: 'アカウント不要',
        none: '配信元は不要',
        optional: '任意',
        preview: 'プレビューは書き込まず',
        original: '原本は変更しません'
    }
]
const catalog = (language: number) =>
    guideCatalog((...values: string[]) => values[language])
describe('source-free Desktop onboarding matches existing local reader controls', () => {
    for (const language of [0, 1, 2]) {
        it(`explains account-free folder/CBZ entry before online features in locale ${language}`, () => {
            const guide = catalog(language)
            expect(guide.daily[0].view).toBe('library')
            expect(guide.daily[0].body).toContain(words[language].local)
            expect(guide.daily[0].body).toContain('Desktop')
            expect(guide.daily[0].body).toContain('CBZ')
            expect(
                guide.daily.find((step) => step.view === 'discover')!.body
            ).toContain(words[language].optional)
            expect(guide.daily).toHaveLength(7)
        })
        it(`states that zero sources are valid in locale ${language}`, () => {
            const guide = catalog(language)
            expect(
                guide.chapters.find((chapter) => chapter.id === 'accounts')!
                    .steps[0].body
            ).toContain(words[language].none)
        })
        it(`documents real preview/copy limits without changing earlier storage positions in locale ${language}`, () => {
            const storage = catalog(language).chapters.find(
                (chapter) => chapter.id === 'storage'
            )!
            expect(
                storage.steps.slice(0, 2).map((step) => step.selector)
            ).toEqual(['nav [data-view="downloads"]', '#shelf-create'])
            const local = storage.steps[2]
            expect(local.selector).toBe('nav [data-view="library"]')
            expect(local.body).toContain(words[language].preview)
            expect(local.body).toContain(words[language].original)
            expect(local.body).toContain('CBR/PDF')
            expect(local.body).toContain('Desktop')
        })
    }
    it('matches source-free setup without writing a config, credentials or enabling sources', () => {
        const config = buildLocalConfig({
            libraryDirectory: path.resolve(
                'synthetic-not-created-guide-library'
            ),
            profile: 'balanced'
        })
        expect(sourcePolicyForConfig(config).enabled).toEqual([])
        expect(sourcePolicyForConfig(null).enabled).toEqual([])
        expect(config).not.toHaveProperty('account')
        expect(config).not.toHaveProperty('password')
        expect(fs.existsSync(config.libraryDirectory)).toBe(false)
    })
    it('does not reset completed guides or advance a prior storage chapter position', () => {
        expect(GUIDE_VERSION).toBe(3)
        const state = normalizeGuideState({
            daily: { completedVersion: 3, position: 6 },
            chapters: { storage: { position: 1, completedVersion: 3 } }
        })
        expect(shouldPromptDaily(state)).toBe(false)
        expect(state.chapters.storage.position).toBe(1)
        expect(state.chapters.storage.completedVersion).toBe(3)
    })
    it('references installed controls but never exposes an unavailable picker through the guide', () => {
        const markup = fs.readFileSync('web/index.html', 'utf8'),
            source = fs.readFileSync('web/local-import.js', 'utf8')
        expect(markup).toContain('id="local-comic-import"')
        expect(markup).toContain('data-local-kind="folder"')
        expect(markup).toContain('data-local-kind="cbz"')
        expect(source).toContain('host.hidden = !available()')
        for (const language of [0, 1, 2])
            expect(
                catalog(language).chapters.find(
                    (chapter) => chapter.id === 'storage'
                )!.steps[2].selector
            ).not.toContain('data-local-kind')
    })
})
