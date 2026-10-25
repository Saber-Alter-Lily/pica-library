export interface ReaderSettings {
    schemaVersion: 1
    mode: 'vertical' | 'single' | 'double'
    direction: 'ltr' | 'rtl'
    fit: 'width' | 'height'
}
export const defaultReaderSettings: Readonly<ReaderSettings>
export function parseReaderSettings(value: unknown): ReaderSettings
export function normalizeReaderSettings(value: unknown): ReaderSettings
export function loadReaderSettings(storage: Pick<Storage, 'getItem'>): ReaderSettings
export function cacheReaderSettings(storage: Pick<Storage, 'setItem'>, value: unknown): boolean
export function createReaderSettingsWriter(write: (settings: ReaderSettings) => unknown | Promise<unknown>): {
    readonly pending: boolean
    save(value: unknown): Promise<unknown>
}
