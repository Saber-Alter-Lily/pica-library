export const LITE_SCHEMA_VERSION = 1
export const LITE_BUNDLE_KIND = 'pica-library-bundle'

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
        queue: []
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
        records: structuredClone(
            requireArray(value.library.comics, 'Bundle library.comics')
        ),
        authors: structuredClone(requireArray(value.authors, 'Bundle authors')),
        profile:
            value.profile && typeof value.profile === 'object'
                ? structuredClone(value.profile)
                : null,
        recommendations: structuredClone(
            requireArray(value.recommendations, 'Bundle recommendations')
        ),
        queue: structuredClone(requireArray(value.queue, 'Bundle queue'))
    }
}

export function restoreLiteState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return emptyLiteState()
    rejectSensitiveFields(value)
    return {
        records: Array.isArray(value.records)
            ? structuredClone(value.records)
            : [],
        authors: Array.isArray(value.authors)
            ? structuredClone(value.authors)
            : [],
        profile:
            value.profile && typeof value.profile === 'object'
                ? structuredClone(value.profile)
                : null,
        recommendations: Array.isArray(value.recommendations)
            ? structuredClone(value.recommendations)
            : [],
        queue: Array.isArray(value.queue) ? structuredClone(value.queue) : []
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
