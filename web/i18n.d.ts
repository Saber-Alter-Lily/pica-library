export const supportedLanguages: readonly ['zh-CN', 'en']
export const languageStorageKey: string
export const translations: Record<string, Record<string, string>>

export function normalizeLanguage(value: unknown): 'zh-CN' | 'en'
export function detectLanguage(languages?: string[] | string): 'zh-CN' | 'en'
export function resolveLanguage(
    storage: Pick<Storage, 'getItem'> | undefined,
    languages: string[] | string
): 'zh-CN' | 'en'
export function saveLanguage(
    storage: Pick<Storage, 'setItem'> | undefined,
    language: string
): 'zh-CN' | 'en'
export function translate(
    language: string,
    key: string,
    values?: Record<string, unknown>
): string
export function missingTranslationKeys(language: string): string[]
export function localizeError(language: string, error: unknown): string
export function applyTranslations(language: string, root?: Document): void
