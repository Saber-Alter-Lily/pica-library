/** Runtime-neutral settings codec. No DOM, account, source or network dependencies. */
export const defaultReaderSettings = Object.freeze({
    schemaVersion: 1,
    mode: 'vertical',
    direction: 'ltr',
    fit: 'width'
})

export function parseReaderSettings(value) {
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).some(
            (key) =>
                !['schemaVersion', 'mode', 'direction', 'fit'].includes(key)
        ) ||
        value.schemaVersion !== 1 ||
        !['vertical', 'single', 'double'].includes(value.mode) ||
        !['ltr', 'rtl'].includes(value.direction) ||
        !['width', 'height'].includes(value.fit)
    )
        throw new Error('Invalid reader settings')
    return {
        schemaVersion: 1,
        mode: value.mode,
        direction: value.direction,
        fit: value.fit
    }
}

export function normalizeReaderSettings(value) {
    try {
        return parseReaderSettings(value)
    } catch {
        return { ...defaultReaderSettings }
    }
}

const storageKey = 'pica-reader-settings-v1'
export function loadReaderSettings(storage) {
    try {
        return normalizeReaderSettings(
            JSON.parse(storage.getItem(storageKey) || 'null')
        )
    } catch {
        return { ...defaultReaderSettings }
    }
}

export function cacheReaderSettings(storage, value) {
    const settings = parseReaderSettings(value)
    try {
        storage.setItem(storageKey, JSON.stringify(settings))
        return true
    } catch {
        return false
    }
}

/** Serialize rapid display edits without coupling Reader navigation to persistence. */
export function createReaderSettingsWriter(write) {
    let tail = Promise.resolve(),
        pending = 0
    return {
        get pending() {
            return pending > 0
        },
        save(value) {
            const settings = parseReaderSettings(value)
            pending++
            const result = tail.then(() => write(settings))
            tail = result.catch(() => undefined)
            return result.finally(() => {
                pending--
            })
        }
    }
}
