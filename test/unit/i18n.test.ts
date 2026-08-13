import { describe, expect, it } from 'vitest'
import {
    detectLanguage,
    languageStorageKey,
    missingTranslationKeys,
    resolveLanguage,
    saveLanguage,
    translate,
    translations
} from '../../web/i18n.js'

function memoryStorage(initial?: string) {
    const values = new Map<string, string>()
    if (initial) values.set(languageStorageKey, initial)
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value)
    }
}

describe('Web localization', () => {
    it.each([
        [['zh-CN'], 'zh-CN'],
        [['zh-Hans'], 'zh-CN'],
        [['zh-SG'], 'zh-CN'],
        [['zh'], 'zh-CN'],
        [['en-US'], 'en']
    ])('detects %j as %s', (languages, expected) => {
        expect(detectLanguage(languages)).toBe(expected)
    })

    it('lets a saved manual choice override browser detection after reload', () => {
        const storage = memoryStorage()
        expect(resolveLanguage(storage, ['en-US'])).toBe('en')
        expect(saveLanguage(storage, 'zh-CN')).toBe('zh-CN')
        expect(resolveLanguage(storage, ['en-US'])).toBe('zh-CN')
        expect(saveLanguage(storage, 'en')).toBe('en')
        expect(resolveLanguage(storage, ['zh-CN'])).toBe('en')
    })

    it('updates translated UI strings in both directions', () => {
        expect(translate('en', 'nav.library')).toBe('Library')
        expect(translate('zh-CN', 'nav.library')).toBe('漫画库')
        expect(translate('en', 'nav.library')).toBe('Library')
    })

    it('has complete Simplified Chinese coverage for ordinary UI keys', () => {
        expect(missingTranslationKeys('zh-CN')).toEqual([])
        expect(Object.keys(translations.en).length).toBeGreaterThan(100)
    })

    it('falls back to English and never exposes a raw key', () => {
        const key = 'test.englishOnly'
        translations.en[key] = 'English fallback'
        expect(translate('zh-CN', key)).toBe('English fallback')
        expect(translate('zh-CN', 'missing.raw.key')).toBe('')
        delete translations.en[key]
    })
})
