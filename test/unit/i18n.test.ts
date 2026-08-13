import { describe, expect, it } from 'vitest'
import { deriveLiteAuthors } from '../../web/author-state.js'
import {
    detectLanguage,
    languageStorageKey,
    localizeAuthorEvidence,
    localizeError,
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

    it('switches Browser Lite author evidence without persisting localized text', () => {
        const records = [
            { comicId: 'one', author: 'Circle (Alice)' },
            { comicId: 'two', author: 'Bob' }
        ]
        const authors = deriveLiteAuthors(records, (value) =>
            String(value).toLocaleLowerCase()
        )
        const circle = authors.find(
            (author) => author.canonicalName === 'Alice'
        )!
        const normalized = authors.find(
            (author) => author.canonicalName === 'Bob'
        )!
        expect(circle.evidenceKey).toBe('author.evidence.circlePattern')
        expect(normalized.evidenceKey).toBe('author.evidence.normalized')
        expect(circle).not.toHaveProperty('evidence')
        expect(localizeAuthorEvidence('zh-CN', circle)).toBe(
            '检测到“社团（作者）”格式，请确认作者实体。'
        )
        expect(localizeAuthorEvidence('en', circle)).toBe(
            'Detected a "circle (author)" pattern. Confirm the author identity.'
        )
        expect(localizeAuthorEvidence('zh-CN', circle)).toBe(
            '检测到“社团（作者）”格式，请确认作者实体。'
        )
        expect(localizeAuthorEvidence('en', normalized)).toBe(
            'The normalized name is consistent.'
        )
        expect(
            localizeAuthorEvidence('en', {
                evidence: '规范化名称一致。'
            })
        ).toBe('The normalized name is consistent.')
    })

    it.each(['zh-CN', 'en'])(
        'classifies secure credential storage before authentication in %s',
        (language) => {
            expect(
                localizeError(
                    language,
                    'Windows credential protection is unavailable'
                )
            ).toBe(translations[language]['error.credential'])
            expect(
                localizeError(
                    language,
                    'Secure credential persistence requires Windows DPAPI'
                )
            ).toBe(translations[language]['error.credential'])
            expect(localizeError(language, 'HTTP 401 rejected account')).toBe(
                translations[language]['error.auth']
            )
        }
    )
})
