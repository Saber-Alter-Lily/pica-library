/**
 * CORE-LIB-04c-02b-02: CONSISTENT SNAPSHOT + ROLLBACK REHEARSAL, QA ONLY.
 *
 * Only operates on profile/ inside a brand-new OS-temp synthetic fixture
 * carrying the exact sentinel below. It cannot inspect the user's default
 * profile, replace an existing directory, run migrations, load credentials,
 * install a source or restore anything into a real application location.
 *
 * SQLite's native ONLINE BACKUP is used even with WAL present. A raw copy of
 * library.db is NOT a transactionally consistent SQLite snapshot in WAL mode.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'

// Vite 5 predates native node:sqlite; reuse the exact native-bridge approach
// already used by src/library/database.ts, not a SQLite/SQL.js replacement.
const { DatabaseSync, backup } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')

export const LEGACY_SNAPSHOT_QA_MARKER = '.pica-v050-rollback-fixture-v1'
export const LEGACY_SNAPSHOT_QA_MARKER_TEXT =
    'PICA_V050_ROLLBACK_SYNTHETIC_QA_ONLY\n'

type FileRecord = { path: string; bytes: number; sha256: string; kind: 'sqlite' | 'opaque' }
type SnapshotManifest = {
    format: 'PICA_V050_CONSISTENT_ROLLBACK_REHEARSAL_V1'
    files: FileRecord[]
    database: 'data/library.db'
    sqliteOnlineBackup: true
    sourceWalIntegrated: boolean
    excludedNonUserState: string[]
    secretsParsed: false
    sourceDatabaseAndWalVerifiedUnchanged: true
    crossFileAtomicityProven: false
    productionRestoreAuthorized: false
}
export type LegacySnapshotQaResult = {
    status: 'SYNTHETIC_SNAPSHOT_VERIFIED'
    manifestSha256: string
    fileCount: number
    sqliteOnlineBackup: true
    sourceWalIntegrated: boolean
    productionRestoreAuthorized: false
    actualUserProfileTouched: false
}
export type LegacyRestoreQaResult = {
    status: 'SYNTHETIC_ROLLBACK_VERIFIED'
    fileCount: number
    verifiedSqliteIntegrity: true
    sqliteOnlineBackup: true
    productionRestoreAuthorized: false
    existingRootOverwritten: false
    actualUserProfileTouched: false
}

const MAX_FILES = 240
const MAX_FILE = 64 * 1024 * 1024
const MAX_TOTAL = 192 * 1024 * 1024
const MAX_MANIFEST = 128 * 1024
const skipDir = new Set([
    'logs', 'runtime-state/upgrade-assistant', 'runtime-state/updates'
])
const skipFile = new Set([
    'runtime-state/instance.lock', 'runtime-state/instance.json'
])
const sqliteSidecars = new Set([
    'data/library.db-wal', 'data/library.db-shm',
    'data/library.db-journal'
])
const onlyTopLevel = new Set(['config', 'data', 'cache', 'packs', 'runtime-state', 'logs'])
const SHA = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
const status = (file: string) => fs.lstatSync(file, { throwIfNoEntry: false })
const ident = (a: fs.Stats, b: fs.Stats) =>
    a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
    a.mtimeMs === b.mtimeMs

function regular(file: string) {
    const info = status(file)
    if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1 ||
        info.size < 0 || info.size > MAX_FILE)
        throw new Error('SYNTHETIC_QA_FILE_UNSAFE')
    return info
}
function directory(file: string) {
    const info = status(file)
    if (!info?.isDirectory() || info.isSymbolicLink())
        throw new Error('SYNTHETIC_QA_DIRECTORY_UNSAFE')
    return info
}
function pathParts(value: string) {
    if (!value || value.length > 512 ||
        value.startsWith('/') || value.includes('\\') ||
        value.includes('\0') || /[\x00-\x1f\x7f]/.test(value))
        throw new Error('SYNTHETIC_QA_PATH_UNSAFE')
    const parts = value.split('/')
    if (parts.some(part => !part || part === '.' || part === '..' ||
        part.length > 255 || /[:<>|?*]/.test(part)))
        throw new Error('SYNTHETIC_QA_PATH_UNSAFE')
    return parts
}
/** Disallow symlinked intermediate directories, not just the leaf file. */
function nestedFile(root: string, relative: string) {
    const parts = pathParts(relative)
    let cursor = root
    for (const part of parts.slice(0, -1)) {
        cursor = path.join(cursor, part)
        directory(cursor)
    }
    return path.join(cursor, parts[parts.length - 1])
}
function inside(root: string, value: string) {
    const rel = path.relative(root, value)
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}
function qaRoot(folder: string) {
    if (typeof folder !== 'string' || !path.isAbsolute(folder))
        throw new Error('EXPLICIT_SYNTHETIC_QA_ROOT_REQUIRED')
    directory(folder)
    const dir = fs.realpathSync.native(folder)
    const temp = fs.realpathSync.native(os.tmpdir())
    if (!inside(temp, dir) ||
        !/^pica-v050-rollback-qa-[a-z0-9_-]+$/i.test(path.basename(dir)))
        throw new Error('REAL_PROFILE_AND_NON_TEMP_ROOT_FORBIDDEN')
    const marker = path.join(dir, LEGACY_SNAPSHOT_QA_MARKER)
    const bytes = regular(marker)
    if (bytes.size !== Buffer.byteLength(LEGACY_SNAPSHOT_QA_MARKER_TEXT) ||
        fs.readFileSync(marker, 'utf8') !== LEGACY_SNAPSHOT_QA_MARKER_TEXT)
        throw new Error('SYNTHETIC_QA_MARKER_REQUIRED')
    return dir
}
function sourceProfile(root: string) {
    const profile = path.join(root, 'profile')
    directory(profile)
    if (!inside(root, fs.realpathSync.native(profile)))
        throw new Error('EXTERNAL_PROFILE_FORBIDDEN')
    for (const fixed of ['config', 'data']) directory(path.join(profile, fixed))
    if (status(path.join(profile, 'runtime-state', 'instance.lock')))
        throw new Error('DESKTOP_INSTANCE_LOCK_PRESENT')
    const config = regular(path.join(profile, 'config', 'config.json'))
    if (config.size > 1024 * 1024)
        throw new Error('LEGACY_CONFIG_TOO_LARGE')
    const raw: unknown = JSON.parse(fs.readFileSync(
        path.join(profile, 'config', 'config.json'), 'utf8'
    ))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('LEGACY_CONFIG_INVALID')
    const settings = raw as Record<string, unknown>
    if (settings.schemaVersion !== 1 ||
        typeof settings.libraryDirectory !== 'string' ||
        !path.isAbsolute(settings.libraryDirectory) ||
        !['conservative', 'balanced', 'fast'].includes(String(settings.profile)))
        throw new Error('LEGACY_CONFIG_UNSUPPORTED')
    // A restore of a real custom/external library must require a separate
    // choice and complete media inventory. This rehearsal refuses it.
    const stated = fs.realpathSync.native(settings.libraryDirectory)
    if (stated !== fs.realpathSync.native(path.join(profile, 'data')))
        throw new Error('EXTERNAL_LIBRARY_NEEDS_SEPARATE_CONSENT')
    if (status(path.join(profile, 'data', 'library.db-journal')))
        throw new Error('HOT_SQLITE_JOURNAL_REQUIRES_REVIEW')
    regular(path.join(profile, 'data', 'library.db'))
    return profile
}
function walkFiles(profile: string) {
    const files: string[] = []
    const excluded: string[] = []
    function scan(folder: string, rel: string, depth: number) {
        if (depth > 12) throw new Error('SYNTHETIC_QA_DEPTH_LIMIT')
        for (const name of fs.readdirSync(folder).sort()) {
            pathParts(name)
            const relative = rel ? rel + '/' + name : name
            pathParts(relative)
            const file = path.join(folder, name)
            const info = status(file)
            if (!info || info.isSymbolicLink())
                throw new Error('SYNTHETIC_QA_SYMLINK_FORBIDDEN')
            if (!rel && !onlyTopLevel.has(name))
                throw new Error('UNREVIEWED_PROFILE_CONTENT: ' + name)
            if (skipDir.has(relative) && info.isDirectory()) {
                excluded.push(relative)
                continue
            }
            if (skipFile.has(relative) && info.isFile()) {
                excluded.push(relative)
                continue
            }
            if (info.isDirectory()) {
                scan(file, relative, depth + 1)
            } else if (info.isFile()) {
                if (sqliteSidecars.has(relative)) continue
                regular(file)
                files.push(relative)
                if (files.length > MAX_FILES)
                    throw new Error('SYNTHETIC_QA_FILE_COUNT_LIMIT')
            } else throw new Error('SYNTHETIC_QA_NONREGULAR_CONTENT')
        }
    }
    scan(profile, '', 0)
    if (!files.includes('config/config.json') ||
        !files.includes('data/library.db'))
        throw new Error('SYNTHETIC_QA_CORE_FILES_MISSING')
    return { files, excluded }
}
function exclusiveCopy(source: string, destination: string): FileRecord {
    const initial = regular(source)
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
    const descriptor = fs.openSync(source,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
    let output: number | null = null
    try {
        if (!ident(initial, fs.fstatSync(descriptor)))
            throw new Error('SOURCE_CHANGED_WHILE_OPENING')
        output = fs.openSync(destination, 'wx', 0o600)
        const buffer = Buffer.allocUnsafe(1024 * 1024)
        const digest = createHash('sha256')
        let copied = 0
        while (copied < initial.size) {
            const read = fs.readSync(descriptor, buffer, 0,
                Math.min(buffer.length, initial.size - copied), copied)
            if (read <= 0) throw new Error('SOURCE_CHANGED_WHILE_COPYING')
            let written = 0
            while (written < read) {
                const amount = fs.writeSync(output, buffer,
                    written, read - written)
                if (amount <= 0) throw new Error('SNAPSHOT_DESTINATION_WRITE_FAILED')
                written += amount
            }
            digest.update(buffer.subarray(0, read))
            copied += read
        }
        fs.fsyncSync(output)
        if (!ident(initial, fs.fstatSync(descriptor)) ||
            !ident(initial, regular(source)))
            throw new Error('SOURCE_CHANGED_AFTER_COPY')
        return { path: '', bytes: copied, sha256: digest.digest('hex'),
            kind: 'opaque' }
    } finally {
        if (output !== null) fs.closeSync(output)
        fs.closeSync(descriptor)
    }
}
function digestFile(file: string) {
    const stat = regular(file)
    const descriptor = fs.openSync(file,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
    try {
        if (!ident(stat, fs.fstatSync(descriptor)))
            throw new Error('FILE_CHANGED_ON_OPEN')
        const digest = createHash('sha256')
        const block = Buffer.allocUnsafe(1024 * 1024)
        let total = 0
        while (total < stat.size) {
            const read = fs.readSync(descriptor, block, 0,
                Math.min(block.length, stat.size - total), total)
            if (read <= 0) throw new Error('FILE_CHANGED_DURING_HASH')
            digest.update(block.subarray(0, read))
            total += read
        }
        if (!ident(stat, regular(file)))
            throw new Error('FILE_CHANGED_AFTER_HASH')
        return { bytes: total, sha256: digest.digest('hex') }
    } finally { fs.closeSync(descriptor) }
}
function integrityOfBackup(file: string, normalizeJournal: boolean) {
    const database = new DatabaseSync(file, {
        readOnly: !normalizeJournal, allowExtension: false
    })
    try {
        if (normalizeJournal) {
            // Only the new *destination* snapshot DB is ever normalized.
            // It removes any WAL dependency before a standalone rollback.
            const mode = database.prepare('PRAGMA journal_mode=DELETE').get() as
                Record<string, unknown>
            if (String(mode.journal_mode).toLowerCase() !== 'delete')
                throw new Error('SNAPSHOT_NOT_STANDALONE')
        }
        const rows = database.prepare('PRAGMA integrity_check').all() as
            Array<Record<string, unknown>>
        if (rows.length !== 1 || String(rows[0].integrity_check) !== 'ok')
            throw new Error('SQLITE_SNAPSHOT_INTEGRITY_FAILED')
    } finally { database.close() }
}
function assertManifest(raw: unknown): SnapshotManifest {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('UNTRUSTED_SNAPSHOT_MANIFEST')
    const value = raw as Record<string, unknown>
    if (value.format !== 'PICA_V050_CONSISTENT_ROLLBACK_REHEARSAL_V1' ||
        value.database !== 'data/library.db' ||
        value.sqliteOnlineBackup !== true ||
        value.secretsParsed !== false ||
        value.sourceDatabaseAndWalVerifiedUnchanged !== true ||
        value.crossFileAtomicityProven !== false ||
        value.productionRestoreAuthorized !== false ||
        typeof value.sourceWalIntegrated !== 'boolean' ||
        !Array.isArray(value.files) ||
        value.files.length < 2 || value.files.length > MAX_FILES ||
        !Array.isArray(value.excludedNonUserState))
        throw new Error('UNTRUSTED_SNAPSHOT_MANIFEST')
    const unique = new Set<string>()
    let total = 0
    for (const entry of value.files) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            throw new Error('UNTRUSTED_SNAPSHOT_ENTRY')
        const row = entry as Record<string, unknown>
        if (typeof row.path !== 'string' ||
            !Number.isSafeInteger(row.bytes) ||
            (row.bytes as number) < 0 || (row.bytes as number) > MAX_FILE ||
            typeof row.sha256 !== 'string' ||
            !/^[a-f0-9]{64}$/.test(row.sha256) ||
            !['opaque', 'sqlite'].includes(String(row.kind)))
            throw new Error('UNTRUSTED_SNAPSHOT_ENTRY')
        pathParts(row.path)
        if (unique.has(row.path)) throw new Error('DUPLICATE_SNAPSHOT_ENTRY')
        unique.add(row.path)
        total += row.bytes as number
        if (total > MAX_TOTAL) throw new Error('SNAPSHOT_BUDGET_EXCEEDED')
        if ((row.path === 'data/library.db') !== (row.kind === 'sqlite'))
            throw new Error('UNREVIEWED_SQLITE_SNAPSHOT_ROLE')
    }
    for (const required of ['data/library.db', 'config/config.json'])
        if (!unique.has(required))
            throw new Error('SNAPSHOT_CRITICAL_FILE_MISSING')
    return value as SnapshotManifest
}

/** Writes only to QA_ROOT/snapshot, never to the source or installed root. */
export async function snapshotLegacyFixtureProfile(
    sandbox: string
): Promise<LegacySnapshotQaResult> {
    const root = qaRoot(sandbox)
    const profile = sourceProfile(root)
    const { files, excluded } = walkFiles(profile)
    const target = path.join(root, 'snapshot')
    if (status(target)) throw new Error('SNAPSHOT_ALREADY_EXISTS')
    const total = files.reduce((size, rel) =>
        size + regular(path.join(profile, ...pathParts(rel))).size, 0)
    if (total > MAX_TOTAL) throw new Error('SYNTHETIC_QA_TOTAL_BYTES_LIMIT')
    const databasePath = path.join(profile, 'data', 'library.db')
    const originalDb = digestFile(databasePath)
    const walFile = databasePath + '-wal'
    const originalWal = status(walFile) ? digestFile(walFile) : null
    const dbBytes = fs.readFileSync(databasePath, { flag: 'r' })
    if (!dbBytes.subarray(0, 16).equals(
        Buffer.from('SQLite format 3\0', 'binary')))
        throw new Error('SOURCE_SQLITE_HEADER_INVALID')
    const entries: FileRecord[] = []
    fs.mkdirSync(target, { mode: 0o700 })
    try {
        for (const rel of files) {
            if (rel === 'data/library.db') continue
            const copy = exclusiveCopy(
                path.join(profile, ...pathParts(rel)),
                path.join(target, ...pathParts(rel))
            )
            entries.push({ ...copy, path: rel })
        }
        const destination = path.join(target, 'data', 'library.db')
        fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
        // For a checkpointed source with no WAL file, immutable=1 prevents
        // SQLite from creating even an empty -wal/-shm sidecar in the original
        // profile. For a genuinely pending WAL, immutable would IGNORE the
        // committed WAL frames; use read-only SQLite online backup instead.
        const sourceLocation = originalWal === null
            ? (() => {
                const uri = pathToFileURL(databasePath)
                uri.searchParams.set('immutable', '1')
                return uri
            })()
            : databasePath
        const src = new DatabaseSync(sourceLocation, {
            readOnly: true, allowExtension: false
        })
        try {
            await backup(src, destination, { source: 'main', target: 'main',
                rate: 100 })
        } finally { src.close() }
        fs.chmodSync(destination, 0o600)
        integrityOfBackup(destination, true)
        const copiedDb = digestFile(destination)
        entries.push({ path: 'data/library.db', kind: 'sqlite', ...copiedDb })
        const afterDb = digestFile(databasePath)
        const laterWal = status(walFile)
        // A newly-created empty WAL is still a source-profile mutation and
        // must NOT be ignored or reported as an unchanged original.
        if (Boolean(laterWal) !== Boolean(originalWal))
            throw new Error('SOURCE_SQLITE_SIDECARS_CHANGED_DURING_SNAPSHOT')
        const afterWal = laterWal ? digestFile(walFile) : null
        if (afterDb.sha256 !== originalDb.sha256 ||
            afterDb.bytes !== originalDb.bytes ||
            JSON.stringify(afterWal) !== JSON.stringify(originalWal))
            throw new Error('SOURCE_SQLITE_CHANGED_DURING_SNAPSHOT')
        const manifest: SnapshotManifest = {
            format: 'PICA_V050_CONSISTENT_ROLLBACK_REHEARSAL_V1',
            files: entries.sort((a, b) => a.path.localeCompare(b.path, 'en')),
            database: 'data/library.db',
            sqliteOnlineBackup: true,
            sourceWalIntegrated: originalWal !== null,
            excludedNonUserState: excluded,
            secretsParsed: false,
            sourceDatabaseAndWalVerifiedUnchanged: true,
            // Individual opaque files are stable at copy time, but SQLite and
            // the entire filesystem are not one atomic transaction. A future
            // production migration must establish an application-wide freeze.
            crossFileAtomicityProven: false,
            productionRestoreAuthorized: false
        }
        assertManifest(manifest)
        const json = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
        if (json.length > MAX_MANIFEST)
            throw new Error('SNAPSHOT_MANIFEST_BUDGET')
        const manifestPath = path.join(target, 'manifest.json')
        fs.writeFileSync(manifestPath, json, { flag: 'wx', mode: 0o600 })
        return {
            status: 'SYNTHETIC_SNAPSHOT_VERIFIED',
            manifestSha256: SHA(json),
            fileCount: entries.length,
            sqliteOnlineBackup: true,
            sourceWalIntegrated: originalWal !== null,
            productionRestoreAuthorized: false,
            actualUserProfileTouched: false
        }
    } catch (error) {
        // Only our newly-created disposable snapshot is ever removed.
        fs.rmSync(target, { recursive: true, force: true })
        throw error
    }
}

/**
 * Byte-exact rollback rehearsal into a NEW sandbox/restored directory.
 * Never replaces profile, Desktop data, credentials or installed programs.
 */
export function restoreLegacyFixtureSnapshot(
    sandbox: string, expectedManifestSha256: string
): LegacyRestoreQaResult {
    const root = qaRoot(sandbox)
    if (!/^[a-f0-9]{64}$/.test(expectedManifestSha256))
        throw new Error('EXPLICIT_SNAPSHOT_IDENTITY_REQUIRED')
    const snapshot = path.join(root, 'snapshot')
    directory(snapshot)
    const raw = fs.readFileSync(path.join(snapshot, 'manifest.json'))
    if (raw.length > MAX_MANIFEST || SHA(raw) !== expectedManifestSha256)
        throw new Error('SNAPSHOT_MANIFEST_IDENTITY_MISMATCH')
    const manifest = assertManifest(JSON.parse(raw.toString('utf8')))
    // Verify ALL inputs before creating even a synthetic restored folder.
    for (const row of manifest.files) {
        const file = nestedFile(snapshot, row.path)
        const actual = digestFile(file)
        if (actual.bytes !== row.bytes || actual.sha256 !== row.sha256)
            throw new Error('SNAPSHOT_FILE_INTEGRITY_MISMATCH')
    }
    const destination = path.join(root, 'restored')
    if (status(destination)) throw new Error('RESTORE_TARGET_MUST_BE_NEW')
    fs.mkdirSync(destination, { mode: 0o700 })
    try {
        for (const row of manifest.files) {
            const dst = path.join(destination, ...pathParts(row.path))
            const copied = exclusiveCopy(
                nestedFile(snapshot, row.path), dst
            )
            if (copied.bytes !== row.bytes || copied.sha256 !== row.sha256)
                throw new Error('ROLLBACK_COPY_MISMATCH')
        }
        integrityOfBackup(path.join(destination, 'data', 'library.db'), false)
        return {
            status: 'SYNTHETIC_ROLLBACK_VERIFIED',
            fileCount: manifest.files.length,
            verifiedSqliteIntegrity: true,
            sqliteOnlineBackup: true,
            productionRestoreAuthorized: false,
            existingRootOverwritten: false,
            actualUserProfileTouched: false
        }
    } catch (error) {
        fs.rmSync(destination, { recursive: true, force: true })
        throw error
    }
}
