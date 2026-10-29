/**
 * CORE-LIB-04c-02b-03b-02: bounded, metadata-only media inventory.
 *
 * Only qualifies a sentinel-owned synthetic OS-temp v0.5 profile that has
 * ALREADY passed the exact historical read-only SQLite/config gate.
 * Not a production media scanner, backup, consent, data migrator or updater.
 *
 * Use Node fs.lstat/readdir and SQLite's native immutable read-only handle;
 * do not copy, hash or read comic image bytes. Never stat or resolve an
 * external path supplied by config or by pictures.local_path.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { qualifyV050HistoricalFixtureReadOnly } from './v050-historical-fixture-gate'

const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')

const MAX_FILES = 1024
const MAX_DIRS = 128
const MAX_DEPTH = 10
const MAX_SINGLE_BYTES = 64 * 1024 * 1024
const MAX_TOTAL_BYTES = 256 * 1024 * 1024
const MAX_ENTRIES_PER_DIRECTORY = 1024

type InventoryReason =
    | 'HISTORICAL_GATE_NOT_QUALIFIED'
    | 'MEDIA_TREE_UNSAFE'
    | 'MEDIA_LINK_OR_HARDLINK_FORBIDDEN'
    | 'MEDIA_PATH_NAME_UNSAFE'
    | 'MEDIA_BUDGET_REQUIRES_REVIEW'
    | 'EXTERNAL_MEDIA_REFERENCE_NEEDS_CONSENT'
    | 'MEDIA_REFERENCE_MISSING'
    | 'MEDIA_SIZE_MISMATCH'
    | 'MEDIA_TREE_CHANGED'
    | 'MEDIA_SQLITE_READ_FAILED'

export type V050SyntheticMediaInventoryResult = {
    status: 'SYNTHETIC_MEDIA_METADATA_ONLY' | 'REVIEW_REQUIRED' | 'BLOCKED'
    reason?: InventoryReason
    mediaFileCount?: number
    referencedDownloadedPictures?: number
    metadataTotalBytes?: number
    auxiliarySqliteBackupFileCount?: number
    auxiliarySqliteBackupBytes?: number
    fileContentsVerified: false
    crossFileAtomicityProven: false
    externalMediaInspected: false
    realUserProfileTouched: false
    productionMigrationAuthorized: false
}

const common = {
    fileContentsVerified: false,
    crossFileAtomicityProven: false,
    externalMediaInspected: false,
    realUserProfileTouched: false,
    productionMigrationAuthorized: false
} as const

function failed(
    status: 'REVIEW_REQUIRED' | 'BLOCKED',
    reason: InventoryReason
): V050SyntheticMediaInventoryResult {
    return { ...common, status, reason }
}

class InventoryFailure extends Error {
    constructor(
        readonly status: 'REVIEW_REQUIRED' | 'BLOCKED',
        readonly reason: InventoryReason
    ) {
        super(reason)
    }
}

function reject(status: 'REVIEW_REQUIRED' | 'BLOCKED', reason: InventoryReason): never {
    throw new InventoryFailure(status, reason)
}
function metadata(pathname: string) {
    return fs.lstatSync(pathname, { throwIfNoEntry: false })
}
function key(value: string) {
    return process.platform === 'win32' ? value.toLowerCase() : value
}
function relativeIfInside(root: string, value: string) {
    // Path comparison is purely lexical; NO stat/realpath/open of value.
    const reference = key(path.resolve(value))
    const base = key(path.resolve(root))
    const relative = path.relative(base, reference)
    if (!relative || relative === '.' || path.isAbsolute(relative) ||
        relative === '..' || relative.startsWith('..' + path.sep))
        return null
    return relative
}
function checkName(name: string) {
    if (!name || name === '.' || name === '..' ||
        name.length > 255 ||
        /[\\/:<>|?*\x00-\x1f\x7f]/.test(name))
        reject('BLOCKED', 'MEDIA_PATH_NAME_UNSAFE')
}
function directoryOnly(file: string) {
    const st = metadata(file)
    if (!st || !st.isDirectory() || st.isSymbolicLink())
        reject('BLOCKED', 'MEDIA_TREE_UNSAFE')
}
function assertRegular(file: string, stat: fs.Stats) {
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1)
        reject('BLOCKED', 'MEDIA_LINK_OR_HARDLINK_FORBIDDEN')
    if (!Number.isSafeInteger(stat.size) || stat.size < 0 ||
        stat.size > MAX_SINGLE_BYTES)
        reject('REVIEW_REQUIRED', 'MEDIA_BUDGET_REQUIRES_REVIEW')
}
/**
 * Retains no private names or paths. A reference outside both lexically
 * acceptable spellings of sandbox-owned data is classified BEFORE any I/O
 * to the user-supplied destination.
 */
export function inventoryV050OwnedMediaSyntheticReadOnly(
    requestedSandbox: string
): V050SyntheticMediaInventoryResult {
    const gate = qualifyV050HistoricalFixtureReadOnly(requestedSandbox)
    if (gate.status !== 'QUALIFIED_SYNTHETIC_RELEASE_LAYOUT')
        return failed(gate.status === 'BLOCKED' ? 'BLOCKED' : 'REVIEW_REQUIRED',
            'HISTORICAL_GATE_NOT_QUALIFIED')

    try {
        const sandbox = fs.realpathSync.native(requestedSandbox)
        const profile = path.join(sandbox, 'profile')
        const data = path.join(profile, 'data')
        const cache = path.join(profile, 'cache')
        directoryOnly(data)

        const media = new Map<string, number>()
        let dirs = 0
        let total = 0
        let mediaBytes = 0
        let backupFiles = 0
        let backupBytes = 0
        function scan(root: string, prefix: string, depth: number) {
            if (depth > MAX_DEPTH || ++dirs > MAX_DIRS)
                reject('REVIEW_REQUIRED', 'MEDIA_BUDGET_REQUIRES_REVIEW')
            directoryOnly(root)
            const entries = fs.readdirSync(root)
            if (entries.length > MAX_ENTRIES_PER_DIRECTORY)
                reject('REVIEW_REQUIRED', 'MEDIA_BUDGET_REQUIRES_REVIEW')
            for (const name of entries) {
                checkName(name)
                const file = path.join(root, name)
                const st = metadata(file)
                if (!st)
                    reject('BLOCKED', 'MEDIA_TREE_CHANGED')
                if (st.isSymbolicLink())
                    reject('BLOCKED', 'MEDIA_LINK_OR_HARDLINK_FORBIDDEN')
                if (st.isDirectory()) {
                    scan(file, prefix + name + '/', depth + 1)
                    continue
                }
                assertRegular(file, st)
                if (prefix === 'data/' && name === 'library.db')
                    continue // Main SQLite verified by the historical gate.
                // The *original release LibraryDatabase* writes its own
                // pre-migration SQLite backup. Inventory its size separately,
                // not as manga media, and never delete or open it. Unknown
                // backup spellings remain unclassified and need review.
                const taggedSqliteBackup = prefix === 'data/' &&
                    (/^library\.db\.pre-migration-v[0-9]{1,3}\.bak$/.test(name) ||
                     name === 'library.db.pre-unreleased-schema-reconcile.bak')
                if (total + st.size > MAX_TOTAL_BYTES)
                    reject('REVIEW_REQUIRED', 'MEDIA_BUDGET_REQUIRES_REVIEW')
                total += st.size
                if (taggedSqliteBackup) {
                    backupFiles++
                    backupBytes += st.size
                    continue
                }
                if (media.size >= MAX_FILES)
                    reject('REVIEW_REQUIRED', 'MEDIA_BUDGET_REQUIRES_REVIEW')
                mediaBytes += st.size
                media.set(key(prefix + name), st.size)
            }
        }
        scan(data, 'data/', 0)
        if (metadata(cache)) scan(cache, 'cache/', 0)

        const uri = pathToFileURL(path.join(data, 'library.db'))
        uri.searchParams.set('immutable', '1')
        const db = new DatabaseSync(uri, {
            readOnly: true, allowExtension: false
        })
        let referenced = 0
        try {
            const rows = db.prepare(
                "SELECT local_path, byte_size FROM pictures WHERE status = 'completed'"
            ).all() as Array<{ local_path: string | null; byte_size: number | null }>
            if (rows.length > MAX_FILES)
                reject('REVIEW_REQUIRED', 'MEDIA_BUDGET_REQUIRES_REVIEW')
            for (const row of rows) {
                referenced++
                if (typeof row.local_path !== 'string' ||
                    !path.isAbsolute(row.local_path))
                    reject('REVIEW_REQUIRED', 'MEDIA_REFERENCE_MISSING')

                // The original spelling and the OS canonical spelling may
                // differ on Windows (temp 8.3 path). Both refer only to the
                // already-verified owned sandbox/data; never resolve the
                // supplied media path or explore an external location.
                const originalData = path.join(requestedSandbox, 'profile', 'data')
                const relative = relativeIfInside(data, row.local_path) ??
                    relativeIfInside(originalData, row.local_path)
                if (!relative)
                    reject('REVIEW_REQUIRED',
                        'EXTERNAL_MEDIA_REFERENCE_NEEDS_CONSENT')
                const stored = media.get(key('data/' +
                    relative.split(path.sep).join('/')))
                if (stored === undefined)
                    reject('REVIEW_REQUIRED', 'MEDIA_REFERENCE_MISSING')
                if (row.byte_size !== null &&
                    Number(row.byte_size) !== stored)
                    reject('REVIEW_REQUIRED', 'MEDIA_SIZE_MISMATCH')
            }
        } finally {
            db.close()
        }
        // The SQLite and files cannot be an app-wide atomic snapshot. Even
        // success qualifies metadata only and cannot authorize restoration.
        return {
            ...common,
            status: 'SYNTHETIC_MEDIA_METADATA_ONLY',
            mediaFileCount: media.size,
            referencedDownloadedPictures: referenced,
            metadataTotalBytes: mediaBytes,
            auxiliarySqliteBackupFileCount: backupFiles,
            auxiliarySqliteBackupBytes: backupBytes
        }
    } catch (error) {
        if (error instanceof InventoryFailure)
            return failed(error.status, error.reason)
        // Never expose path, SQLite details, private metadata or credentials.
        return failed('BLOCKED', 'MEDIA_SQLITE_READ_FAILED')
    }
}
