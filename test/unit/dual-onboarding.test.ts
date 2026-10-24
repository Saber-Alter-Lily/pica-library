import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ADVANCED_CHAPTER_IDS, GUIDE_VERSION, normalizeGuideState, shouldPromptDaily, updateGuideProgress } from '../../web/onboarding-state.js'
import { guideCatalog } from '../../web/guide-catalog.js'

describe('separate daily and advanced help state', () => {
    it('offers only daily onboarding to a new user', () => {
        expect(shouldPromptDaily({})).toBe(true)
        expect(shouldPromptDaily({}, true)).toBe(false)
        expect(shouldPromptDaily({ autoShow: false })).toBe(false)
    })
    it('inherits old mixed-tour completion and dismissal without another automatic prompt', () => {
        for (const legacy of [{ completedVersion: 2 }, { dismissedVersion: 2 }]) {
            expect(shouldPromptDaily(legacy)).toBe(false)
            const state = normalizeGuideState(legacy)
            expect(Object.values(state.chapters).every(p => p.completedVersion === 0)).toBe(true)
        }
    })
    it('advanced reading never completes or dismisses the daily tour', () => {
        const state = updateGuideProgress({}, 'advanced', 'visual', { completedVersion: GUIDE_VERSION, position: 2 })
        expect(state.daily.completedVersion).toBe(0)
        expect(state.daily.dismissedVersion).toBe(0)
        expect(shouldPromptDaily(state)).toBe(true)
        expect(state.chapters.accounts.position).toBe(0)
        expect(state.chapters.visual.position).toBe(2)
    })
    it('daily completion preserves all chapter progress and the auto-show preference', () => {
        const state = updateGuideProgress({ autoShow: false, chapters: { visual: { position: 1 } } }, 'daily', null, { completedVersion: GUIDE_VERSION })
        expect(state.chapters.visual.position).toBe(1)
        expect(state.completedVersion).toBe(GUIDE_VERSION)
        expect(state.autoShow).toBe(false)
    })
    it('persists independent resumable progress without mutating inputs', () => {
        const original = normalizeGuideState({})
        const next = updateGuideProgress(original, 'daily', null, { position: 4 })
        expect(original.daily.position).toBe(0)
        expect(normalizeGuideState(JSON.parse(JSON.stringify(next))).daily.position).toBe(4)
        expect(updateGuideProgress(next, 'advanced', '__proto__', { position: 10 })).toEqual(next)
    })
    it('bounds malformed progress and discards unrelated data', () => {
        const state = normalizeGuideState({ daily: { position: Infinity, completedVersion: 'invalid' }, token: 'not-help-data', chapters: { visual: { position: 999 } } })
        expect(state.daily.position).toBe(0)
        expect(state.chapters.visual.position).toBe(50)
        expect(JSON.stringify(state)).not.toContain('not-help-data')
        expect(normalizeGuideState(null).daily.position).toBe(0)
    })
})

describe('bounded localized feature guides', () => {
    for (const language of [0, 1, 2]) it(`keeps daily small and advanced chapters complete in language ${language}`, () => {
        const catalog = guideCatalog((...values) => values[language])
        expect(catalog.daily.length).toBeLessThanOrEqual(8)
        expect(catalog.chapters.map(c => c.id)).toEqual(ADVANCED_CHAPTER_IDS)
        expect(catalog.daily.every(s => !/visual-rerank|visual-strength|v5-shadow/.test(s.selector))).toBe(true)
        for (const step of [...catalog.daily, ...catalog.chapters.flatMap(c => c.steps)]) {
            expect(step.title.length).toBeGreaterThan(2)
            expect(step.body.length).toBeGreaterThan(35)
        }
    })
    it('distinguishes implemented tag controls from unimplemented automatic visual annotation', () => {
        const catalog = guideCatalog(zh => zh)
        const preferences = catalog.chapters.find(c => c.id === 'preferences')!
        expect(preferences.steps.some(s => s.selector === '#v5-tag-section > summary')).toBe(true)
        const text = preferences.steps.map(s => s.body).join(' ')
        expect(text).toContain('默认全开')
        expect(text).toContain('私人标签不是自动画风分类')
        expect(text).toContain('原始事实和冻结向量不改动')
        expect(text).toContain('手机离线改规则只重排缓存')
        expect(catalog.chapters.find(c => c.id === 'visual')!.steps[0].body).toContain('不等于可靠识别')
    })
    it('has no API, provider, generation or setting side effects in the content catalog', () => {
        const source = fs.readFileSync('web/guide-catalog.js', 'utf8')
        expect(source).not.toMatch(/fetch\(|localStorage|\.click\(|XMLHttpRequest|\.post\(/)
        const implementation = fs.readFileSync('web/onboarding-v1.js', 'utf8')
        expect(implementation).toContain('disableActiveInteraction: true')
        expect(implementation).toContain('for (const [element, open] of disclosures)')
    })
})
