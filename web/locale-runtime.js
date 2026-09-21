import { translations } from './i18n.js'

const reverseJa = new Map()
const ambiguousJa = new Set()

function offer(source, value) {
    if (!source || !value || source === value || ambiguousJa.has(source)) return
    const existing = reverseJa.get(source)
    if (existing && existing !== value) {
        reverseJa.delete(source)
        ambiguousJa.add(source)
        return
    }
    reverseJa.set(source, value)
}

for (const key of Object.keys(translations.en)) {
    offer(translations['zh-CN'][key], translations.ja[key])
    offer(translations.en[key], translations.ja[key])
}

export function currentLanguage() {
    const select = document.querySelector('#language-select')
    const value = select?.value || document.documentElement.lang || 'zh-CN'
    if (String(value).toLowerCase().startsWith('ja')) return 'ja'
    if (String(value).toLowerCase().startsWith('en')) return 'en'
    return 'zh-CN'
}

function missingSet() {
    if (!window.__picaRuntimeTranslationMissing)
        window.__picaRuntimeTranslationMissing = new Set()
    return window.__picaRuntimeTranslationMissing
}

export function copy(zh, en, ja = '') {
    const language = currentLanguage()
    if (language === 'zh-CN') return zh
    if (language === 'en') return en
    if (ja) return ja
    const inferred = reverseJa.get(zh) || reverseJa.get(en)
    if (inferred) return inferred
    missingSet().add(`${zh} || ${en}`)
    return en
}

export function localizedLiteral(source) {
    const language = currentLanguage()
    if (language === 'zh-CN') return source
    const catalog = translations[language]
    for (const key of Object.keys(translations.en)) {
        if (translations['zh-CN'][key] === source || translations.en[key] === source)
            return catalog[key] || source
    }
    if (language === 'ja') missingSet().add(String(source))
    return source
}

export function runtimeTranslationMissing() {
    return [...missingSet()]
}

export function clearRuntimeTranslationMissing() {
    missingSet().clear()
}
