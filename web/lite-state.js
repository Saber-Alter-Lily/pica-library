export const LITE_SCHEMA_VERSION = 1
export const LITE_BUNDLE_KIND = 'pica-library-bundle'
export const LIBRARY_PAGE_SIZE = 48

export function trustedBrowserCoverUrl(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return ''
    try {
        const url = new URL(raw)
        if (url.protocol !== 'https:' || url.username || url.password) return ''
        const hostname = url.hostname.toLowerCase()
        if (
            !hostname ||
            hostname === 'localhost' ||
            hostname.endsWith('.localhost') ||
            /^(127\.|10\.|192\.168\.|169\.254\.)/.test(hostname) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
            hostname === '[::1]' ||
            hostname === '::1' ||
            /^\[?(fc|fd|fe[89ab]|ff)/.test(hostname) ||
            /^\[?::ffff:/i.test(hostname)
        )
            return ''
        return url.toString()
    } catch {
        return ''
    }
}

function sanitizeComic(comic) {
    if (!comic || typeof comic !== 'object' || Array.isArray(comic))
        return comic
    const copy = structuredClone(comic)
    if ('coverUrl' in copy) {
        const safe = trustedBrowserCoverUrl(copy.coverUrl)
        if (safe) copy.coverUrl = safe
        else delete copy.coverUrl
    }
    return copy
}

function sanitizeRecommendations(items) {
    return items.map((item) => {
        const copy = structuredClone(item)
        if (copy?.comic) copy.comic = sanitizeComic(copy.comic)
        else return sanitizeComic(copy)
        return copy
    })
}

const DATABASE_NAME = 'pica-library-lite'
const DATABASE_VERSION = 1
const STORE_NAME = 'state'
const STATE_KEY = 'current'
const SENSITIVE_KEY =
    /^(account|email|password|passwd|token|authorization|cookie|secret|api[-_]?key)$/i

function rejectSensitiveFields(value, location = '$') {
    if (Array.isArray(value)) {
        value.forEach((item, index) =>
            rejectSensitiveFields(item, `${location}[${index}]`)
        )
        return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value)) {
        if (SENSITIVE_KEY.test(key))
            throw new Error(
                `Lite state contains a sensitive field at ${location}.${key}`
            )
        rejectSensitiveFields(item, `${location}.${key}`)
    }
}

export function emptyLiteState() {
    return {
        records: [],
        authors: [],
        profile: null,
        recommendations: [],
        recommendationSessions: [],
        queue: [],
        generatedAt: null,
        sourceSyncedAt: null
    }
}

function requireArray(value, name) {
    if (!Array.isArray(value)) throw new Error(`${name} must be an array`)
    return value
}

export function importLibraryBundle(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Bundle must be an object')
    if (value.schemaVersion !== LITE_SCHEMA_VERSION)
        throw new Error(
            `Unsupported bundle schemaVersion: ${String(value.schemaVersion)}`
        )
    if (value.kind !== LITE_BUNDLE_KIND) throw new Error('Invalid bundle kind')
    if (!value.library || typeof value.library !== 'object')
        throw new Error('Bundle library must be an object')
    rejectSensitiveFields(value)

    return {
        records: requireArray(
            value.library.comics,
            'Bundle library.comics'
        ).map(sanitizeComic),
        authors: structuredClone(requireArray(value.authors, 'Bundle authors')),
        profile:
            value.profile && typeof value.profile === 'object'
                ? structuredClone(value.profile)
                : null,
        recommendations: sanitizeRecommendations(
            requireArray(value.recommendations, 'Bundle recommendations')
        ),
        recommendationSessions: Array.isArray(value.recommendationSessions)
            ? value.recommendationSessions.map((session) =>
                  sanitizeRecommendations(
                      requireArray(session, 'Bundle recommendation session')
                  )
              )
            : [],
        queue: structuredClone(requireArray(value.queue, 'Bundle queue')),
        generatedAt:
            typeof value.generatedAt === 'string' ? value.generatedAt : null,
        sourceSyncedAt:
            typeof value.sourceSyncedAt === 'string'
                ? value.sourceSyncedAt
                : null
    }
}

export function restoreLiteState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return emptyLiteState()
    rejectSensitiveFields(value)
    return {
        records: Array.isArray(value.records)
            ? value.records.map(sanitizeComic)
            : [],
        authors: Array.isArray(value.authors)
            ? structuredClone(value.authors)
            : [],
        profile:
            value.profile && typeof value.profile === 'object'
                ? structuredClone(value.profile)
                : null,
        recommendations: Array.isArray(value.recommendations)
            ? sanitizeRecommendations(value.recommendations)
            : [],
        recommendationSessions: Array.isArray(value.recommendationSessions)
            ? value.recommendationSessions.map((session) =>
                  sanitizeRecommendations(Array.isArray(session) ? session : [])
              )
            : [],
        queue: Array.isArray(value.queue) ? structuredClone(value.queue) : [],
        generatedAt:
            typeof value.generatedAt === 'string' ? value.generatedAt : null,
        sourceSyncedAt:
            typeof value.sourceSyncedAt === 'string'
                ? value.sourceSyncedAt
                : null
    }
}

export function addLiteQueueItems(state, comicIds, source = 'library') {
    const next = restoreLiteState(state)
    const known = new Set(next.queue.map((item) => item.comicId))
    for (const comicId of comicIds) {
        if (!comicId || known.has(comicId)) continue
        next.queue.push({
            comicId,
            episodeOrders: [],
            source,
            runner: 'LOCAL',
            status: 'PLANNED'
        })
        known.add(comicId)
    }
    return next
}

export function visibleLibraryPage(
    records,
    page = 1,
    pageSize = LIBRARY_PAGE_SIZE
) {
    const safePage = Math.max(1, Math.trunc(page) || 1)
    const safeSize = Math.max(
        1,
        Math.min(100, Math.trunc(pageSize) || LIBRARY_PAGE_SIZE)
    )
    return records.slice(0, safePage * safeSize)
}

const GENERIC_TAGS = new Set([
    '全彩',
    '短篇',
    '長篇',
    '长篇',
    '連載中',
    '连载中',
    '完結',
    '完结',
    '漢化',
    '汉化'
])

export function buildTagFrequencyIndex(records) {
    const frequencies = new Map()
    for (const record of records) {
        for (const tag of new Set(record.tags || [])) {
            frequencies.set(tag, (frequencies.get(tag) || 0) + 1)
        }
    }
    return frequencies
}

export function selectDisplayTags(comic, frequencies, limit = 3) {
    return [...new Set(comic.tags || [])]
        .sort((left, right) => {
            const genericDifference =
                Number(GENERIC_TAGS.has(left)) - Number(GENERIC_TAGS.has(right))
            return (
                genericDifference ||
                (frequencies.get(left) || 0) - (frequencies.get(right) || 0) ||
                String(left).localeCompare(String(right))
            )
        })
        .slice(0, Math.max(0, limit))
}

function openDatabase(indexedDB) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME))
                request.result.createObjectStore(STORE_NAME)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

function transactionRequest(database, mode, operation) {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode)
        const request = operation(transaction.objectStore(STORE_NAME))
        let result
        request.onsuccess = () => {
            result = request.result
        }
        request.onerror = () => reject(request.error)
        transaction.oncomplete = () => {
            database.close()
            resolve(result)
        }
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
    })
}

export async function loadLiteState(indexedDB = globalThis.indexedDB) {
    if (!indexedDB) return emptyLiteState()
    const database = await openDatabase(indexedDB)
    const value = await transactionRequest(database, 'readonly', (store) =>
        store.get(STATE_KEY)
    )
    return restoreLiteState(value)
}

export async function saveLiteState(state, indexedDB = globalThis.indexedDB) {
    if (!indexedDB) return
    const database = await openDatabase(indexedDB)
    await transactionRequest(database, 'readwrite', (store) =>
        store.put(restoreLiteState(state), STATE_KEY)
    )
}

export async function clearLiteState(indexedDB = globalThis.indexedDB) {
    if (!indexedDB) return
    const database = await openDatabase(indexedDB)
    await transactionRequest(database, 'readwrite', (store) =>
        store.delete(STATE_KEY)
    )
}
