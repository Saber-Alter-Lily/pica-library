/**
 * v0.5.0 Desktop profile inventory: READ-ONLY PREFLIGHT, not a migration.
 * No default-path lookup, credential read, SQLite connection, temp backup,
 * schema migration, downloader, updater or source SDK import.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

type FileIdentity = {
    bytes: number
    sha256: string
}
export type LegacyProfileReadiness =
    | {
        status: 'BLOCKED'
        reason: string
        migrationPerformed: false
    }
    | {
        status: 'REVIEW_REQUIRED'
        reason: string
        migrationPerformed: false
        credentialFilePresent?: boolean
    }
    | {
        status: 'READ_ONLY_INVENTORY_COMPLETE'
        format: 'PICA_V050_PROFILE_READONLY_PRECHECK_V1'
        config: FileIdentity
        database: FileIdentity
        libraryLocation: 'inside-profile'
        legacySourcePolicyPresent: boolean
        credentialFilePresent: boolean
        remoteStorageConfigPresent: boolean
        migrationPerformed: false
        backupCreated: false
        integrityCheckPerformed: false
    }

const missing = (target: string) =>
    fs.lstatSync(target, { throwIfNoEntry: false })

function hasRegularFile(pathname: string) {
    const status = missing(pathname)
    return Boolean(status?.isFile() && !status.isSymbolicLink() &&
        status.nlink === 1)
}
const same = (a: fs.Stats, b: fs.Stats) =>
    a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
    a.mtimeMs === b.mtimeMs

function checkedReadOnlyFile(
    filename: string, limit: number, capture: boolean
): FileIdentity & { raw?: Buffer; header: Buffer } {
    const initial = missing(filename)
    if (!initial?.isFile() || initial.isSymbolicLink() ||
        initial.nlink !== 1 || initial.size < 1 ||
        initial.size > limit)
        throw new Error('Legacy profile contains missing or unsafe file')
    const descriptor = fs.openSync(filename,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
    try {
        const opened = fs.fstatSync(descriptor)
        if (!same(initial, opened))
            throw new Error('Legacy profile file identity changed during open')
        const hash = createHash('sha256')
        const blocks: Buffer[] = []
        const chunk = Buffer.allocUnsafe(1024 * 1024)
        let position = 0
        let header = Buffer.alloc(0)
        while (position < initial.size) {
            const read = fs.readSync(descriptor, chunk, 0,
                Math.min(chunk.length, initial.size - position), position)
            if (read <= 0)
                throw new Error('Legacy profile file changed during read')
            const bytes = chunk.subarray(0, read)
            if (!header.length) header = Buffer.from(bytes.subarray(0, 16))
            hash.update(bytes)
            if (capture) blocks.push(Buffer.from(bytes))
            position += read
        }
        const last = missing(filename)
        if (!last || !same(initial, last) || !same(opened, last))
            throw new Error('Legacy profile changed during read-only inventory')
        return {
            bytes: initial.size,
            sha256: hash.digest('hex'),
            header,
            ...(capture ? { raw: Buffer.concat(blocks) } : {})
        }
    } finally {
        fs.closeSync(descriptor)
    }
}

function insideRoot(root: string, directory: string) {
    const relative = path.relative(root, directory)
    return !relative || (!relative.startsWith('..') &&
        !path.isAbsolute(relative))
}

/**
 * Only an explicitly selected root is inspected. No filesystem mutation or
 * automatic discovery is allowed. A successful return is NOT migration-ready.
 */
export function auditLegacyDesktopProfileReadOnly(
    requestedRoot: string
): LegacyProfileReadiness {
    if (typeof requestedRoot !== 'string' ||
        !path.isAbsolute(requestedRoot))
        return { status: 'BLOCKED', reason: 'EXPLICIT_ABSOLUTE_ROOT_REQUIRED',
            migrationPerformed: false }
    const rootStat = missing(requestedRoot)
    if (!rootStat?.isDirectory() || rootStat.isSymbolicLink())
        return { status: 'BLOCKED', reason: 'PROFILE_ROOT_UNSAFE',
            migrationPerformed: false }
    const root = fs.realpathSync.native(requestedRoot)
    const lock = path.join(root, 'runtime-state', 'instance.lock')
    // Even a stale-looking lock is a hard stop. Never try to recover/migrate
    // another profile from this read-only preflight.
    if (missing(lock))
        return { status: 'BLOCKED', reason: 'DESKTOP_INSTANCE_LOCK_PRESENT',
            migrationPerformed: false }

    const configFolder = path.join(root, 'config')
    const folderStat = missing(configFolder)
    if (!folderStat?.isDirectory() || folderStat.isSymbolicLink() ||
        !insideRoot(root, fs.realpathSync.native(configFolder)))
        return { status: 'BLOCKED', reason: 'CONFIG_ROOT_UNSAFE',
            migrationPerformed: false }
    const configFile = path.join(configFolder, 'config.json')
    let configFileInfo: ReturnType<typeof checkedReadOnlyFile>
    try {
        configFileInfo = checkedReadOnlyFile(configFile, 1024 * 1024, true)
    } catch {
        return { status: 'BLOCKED', reason: 'CONFIG_READ_UNSAFE',
            migrationPerformed: false }
    }
    let config: Record<string, unknown>
    try {
        const value: unknown = JSON.parse(configFileInfo.raw!.toString('utf8'))
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Not a config object')
        config = value as Record<string, unknown>
    } catch {
        return { status: 'BLOCKED', reason: 'CONFIG_PARSE_INVALID',
            migrationPerformed: false }
    }
    if (config.schemaVersion !== 1 ||
        typeof config.libraryDirectory !== 'string' ||
        !path.isAbsolute(config.libraryDirectory) ||
        !['conservative', 'balanced', 'fast'].includes(
            String(config.profile ?? '')
        ))
        return { status: 'BLOCKED', reason: 'CONFIG_SCHEMA_UNSUPPORTED',
            migrationPerformed: false }
    const credentialFilePresent = Boolean(missing(
        path.join(configFolder, 'credentials.dat')
    ))
    const directory = path.resolve(config.libraryDirectory)
    const libraryStat = missing(directory)
    if (!libraryStat?.isDirectory() || libraryStat.isSymbolicLink())
        return { status: 'REVIEW_REQUIRED', reason: 'LIBRARY_DIRECTORY_MISSING_OR_UNSAFE',
            migrationPerformed: false, credentialFilePresent }
    const realLibrary = fs.realpathSync.native(directory)
    // Never inspect an external/custom library directory without a separate,
    // explicit consent gate in a later migration stage.
    if (!insideRoot(root, realLibrary))
        return { status: 'REVIEW_REQUIRED', reason: 'EXTERNAL_LIBRARY_NEEDS_CONSENT',
            migrationPerformed: false, credentialFilePresent }
    const databaseFile = path.join(realLibrary, 'library.db')
    // An uncheckpointed WAL/SHM/journal can invalidate a bare SQLite file copy.
    // Do not claim a consistent snapshot or read the DB while present.
    if (['-wal', '-shm', '-journal'].some(ext =>
        missing(databaseFile + ext)))
        return { status: 'REVIEW_REQUIRED', reason: 'SQLITE_SIDECAR_PRESENT',
            migrationPerformed: false, credentialFilePresent }
    let db: ReturnType<typeof checkedReadOnlyFile>
    try {
        db = checkedReadOnlyFile(databaseFile, 2 * 1024 * 1024 * 1024, false)
    } catch {
        return { status: 'BLOCKED', reason: 'DATABASE_READ_UNSAFE',
            migrationPerformed: false }
    }
    if (db.header.toString('binary') !== 'SQLite format 3\0')
        return { status: 'BLOCKED', reason: 'DATABASE_HEADER_INVALID',
            migrationPerformed: false }
    // Avoid checking credential values, remote WebDAV secrets, source cookies,
    // raw comics, downloaded pages or any other source data.
    const remoteStorageConfigPresent = hasRegularFile(path.join(
        configFolder, 'remote-storage.json'
    ))
    return {
        status: 'READ_ONLY_INVENTORY_COMPLETE',
        format: 'PICA_V050_PROFILE_READONLY_PRECHECK_V1',
        config: {
            bytes: configFileInfo.bytes,
            sha256: configFileInfo.sha256
        },
        database: { bytes: db.bytes, sha256: db.sha256 },
        libraryLocation: 'inside-profile',
        legacySourcePolicyPresent: Object.prototype.hasOwnProperty.call(
            config, 'externalSources'
        ),
        credentialFilePresent,
        remoteStorageConfigPresent,
        migrationPerformed: false,
        backupCreated: false,
        integrityCheckPerformed: false
    }
}
