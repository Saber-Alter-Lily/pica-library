/**
 * CORE-LIB-04c-02b-03a — v0.5.0 release-layout qualification, SYNTHETIC QA ONLY.
 *
 * This deliberately has no production entry point and cannot authorize a
 * migration. Only a new, explicitly named OS-temp fixture with a unique
 * marker is inspected. The installed profile, external libraries, secrets,
 * account sources, updater and source SDKs are never accessed.
 *
 * Historical authority (public v0.5.0 tag):
 *   src/storage/sqlite/migrations.ts git blob 4a98683fb29feec31970d3958385968f65af6365
 *   src/desktop/paths.ts      git blob f4cf5e3f6bf3d5b9603dbbcc295d8ff58659ae8d
 *   src/desktop/types.ts      git blob e63de26c3a592542ea1b0efc0c06b0fd50c70e72
 * Tests pin the identical migration/path blob hashes in the development tree.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { auditLegacyDesktopProfileReadOnly } from './legacy-profile-preflight'

const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')

export const V050_HISTORY_QA_MARKER = '.pica-v050-history-synthetic-only'
export const V050_HISTORY_QA_MARKER_TEXT = 'PICA_V050_HISTORY_SYNTHETIC_ONLY_V1\n'

const migrationNames = [
    'canonical_library',
    'lifecycle_state',
    'comic_cover_reference',
    'library_provenance_and_download_observability',
    'v020_local_product_state',
    'v020_application_state',
    'v020_fast_sync_and_library_membership',
    'recommendation_v3_additive',
    'provider_identity_metadata',
    'recommendation_v4_visual_style',
    'download_queue_scale_indexes',
    'canonical_work_identity_foundation',
    'work_identity_materialization_audit',
    'post_v0411_index_bundle'
] as const

/** A conservative *subset* of the release's tables, never a schema rewrite. */
const requiredColumns: Record<string, readonly string[]> = {
    schema_migrations: ['version', 'name', 'applied_at'],
    comics: ['id', 'title', 'is_favorite', 'pages_count'],
    episodes: ['id', 'comic_id', 'order_no'],
    pictures: ['id', 'comic_id', 'episode_id', 'local_path', 'status'],
    shelves: ['id', 'name'],
    shelf_items: ['shelf_id', 'comic_id'],
    reading_progress: ['comic_id', 'episode_id', 'page_index'],
    app_state: ['key', 'value_json'],
    download_jobs: ['id', 'status'],
    user_events: ['id', 'event_type'],
    recommendation_v3_profiles: ['id', 'model_version']
}

type GateStatus = 'QUALIFIED_SYNTHETIC_RELEASE_LAYOUT' | 'REVIEW_REQUIRED' | 'BLOCKED'
type GateReason =
    | 'EXPLICIT_QA_ROOT_REQUIRED'
    | 'UNTRUSTED_QA_ROOT'
    | 'QA_MARKER_MISSING'
    | 'PROFILE_DIRECTORY_UNSAFE'
    | 'CONFIG_FILE_UNSAFE'
    | 'CONFIG_SHAPE_REQUIRES_REVIEW'
    | 'POST_RELEASE_FIELDS_PRESENT'
    | 'LIBRARY_REFERENCE_REQUIRES_CONSENT'
    | 'DESKTOP_INSTANCE_LOCK_PRESENT'
    | 'SQLITE_SIDECAR_PRESENT'
    | 'PRECHECK_NOT_COMPLETE'
    | 'SCHEMA_MIGRATIONS_UNEXPECTED'
    | 'REQUIRED_SCHEMA_MISSING'
    | 'SQLITE_INTEGRITY_REQUIRES_REVIEW'
    | 'SOURCE_CHANGED_DURING_AUDIT'
    | 'SQLITE_READ_ONLY_OPEN_FAILED'

export type V050HistoricalFixtureGateResult = {
    status: GateStatus
    reason?: GateReason
    sourceTag: 'v0.5.0'
    expectedSchemaVersion: 14
    releaseMigrationAndPathsIdenticalToCurrentTree: true
    legacySourcePolicyFieldAbsent?: true
    verifiedTableCount?: number
    configSha256?: string
    databaseSha256?: string
    secretsRead: false
    externalLibraryInspected: false
    actualUserProfileTouched: false
    migrationPerformed: false
    backupCreated: false
    productionMigrationAuthorized: false
}

const base = {
    sourceTag: 'v0.5.0',
    expectedSchemaVersion: 14,
    releaseMigrationAndPathsIdenticalToCurrentTree: true,
    secretsRead: false,
    externalLibraryInspected: false,
    actualUserProfileTouched: false,
    migrationPerformed: false,
    backupCreated: false,
    productionMigrationAuthorized: false
} as const

function deny(status: Exclude<GateStatus, 'QUALIFIED_SYNTHETIC_RELEASE_LAYOUT'>,
    reason: GateReason): V050HistoricalFixtureGateResult {
    return { ...base, status, reason }
}
function stat(file: string) {
    return fs.lstatSync(file, { throwIfNoEntry: false })
}
function safeDirectory(file: string) {
    const info = stat(file)
    return Boolean(info?.isDirectory() && !info.isSymbolicLink())
}
function safeFile(file: string, maxSize: number) {
    const info = stat(file)
    return Boolean(info?.isFile() && !info.isSymbolicLink() &&
        info.nlink === 1 && info.size > 0 && info.size <= maxSize)
}
function readConfigWithoutFollowingLinks(file: string) {
    if (!safeFile(file, 1024 * 1024))
        throw new Error('CONFIG_FILE_UNSAFE')
    const fd = fs.openSync(file, fs.constants.O_RDONLY |
        (fs.constants.O_NOFOLLOW ?? 0))
    try {
        const before = fs.fstatSync(fd)
        if (!before.isFile() || before.nlink !== 1 ||
            before.size < 1 || before.size > 1024 * 1024)
            throw new Error('CONFIG_FILE_UNSAFE')
        const bytes = Buffer.alloc(before.size)
        let read = 0
        while (read < bytes.length) {
            const count = fs.readSync(fd, bytes, read, bytes.length - read, read)
            if (count <= 0) throw new Error('CONFIG_FILE_UNSAFE')
            read += count
        }
        const after = fs.fstatSync(fd)
        if (before.dev !== after.dev || before.ino !== after.ino ||
            before.size !== after.size || before.mtimeMs !== after.mtimeMs)
            throw new Error('CONFIG_FILE_UNSAFE')
        const parsed: unknown = JSON.parse(bytes.toString('utf8'))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            throw new Error('CONFIG_FILE_UNSAFE')
        return parsed as Record<string, unknown>
    } finally {
        fs.closeSync(fd)
    }
}

/**
 * Inspect only a new fixture created immediately under os.tmpdir(). The
 * synthetic fixture's *profile/* has the v0.5.0 release's config and SQLite
 * layout, not a transplanted real user's data. No network or write operation.
 */
export function qualifyV050HistoricalFixtureReadOnly(
    requestedSandbox: string
): V050HistoricalFixtureGateResult {
    if (typeof requestedSandbox !== 'string' ||
        !path.isAbsolute(requestedSandbox))
        return deny('BLOCKED', 'EXPLICIT_QA_ROOT_REQUIRED')

    try {
        if (!safeDirectory(requestedSandbox))
            return deny('BLOCKED', 'UNTRUSTED_QA_ROOT')
        const root = fs.realpathSync.native(requestedSandbox)
        const temp = fs.realpathSync.native(os.tmpdir())
        if (path.dirname(root) !== temp ||
            !/^pica-v050-history-qa-[a-z0-9_-]+$/i.test(path.basename(root)))
            return deny('BLOCKED', 'UNTRUSTED_QA_ROOT')
        const marker = path.join(root, V050_HISTORY_QA_MARKER)
        if (!safeFile(marker, 128) ||
            fs.readFileSync(marker, 'utf8') !== V050_HISTORY_QA_MARKER_TEXT)
            return deny('BLOCKED', 'QA_MARKER_MISSING')

        const profile = path.join(root, 'profile')
        const configFolder = path.join(profile, 'config')
        const data = path.join(profile, 'data')
        if (![profile, configFolder, data].every(safeDirectory) ||
            fs.realpathSync.native(profile) !== profile ||
            fs.realpathSync.native(configFolder) !== configFolder ||
            fs.realpathSync.native(data) !== data)
            return deny('BLOCKED', 'PROFILE_DIRECTORY_UNSAFE')
        if (stat(path.join(profile, 'runtime-state', 'instance.lock')))
            return deny('BLOCKED', 'DESKTOP_INSTANCE_LOCK_PRESENT')
        const configFile = path.join(configFolder, 'config.json')
        let config: Record<string, unknown>
        try {
            config = readConfigWithoutFollowingLinks(configFile)
        } catch {
            return deny('BLOCKED', 'CONFIG_FILE_UNSAFE')
        }
        const releaseFields = new Set([
            'schemaVersion', 'libraryDirectory', 'profile',
            'openBrowser', 'preferredPort', 'proxyUrl'
        ])
        if (['externalSources', 'mobileBridgeEnabled', 'readerSettings']
            .some(field => Object.prototype.hasOwnProperty.call(config, field)))
            return deny('REVIEW_REQUIRED', 'POST_RELEASE_FIELDS_PRESENT')
        if (Object.keys(config).some(key => !releaseFields.has(key)) ||
            config.schemaVersion !== 1 ||
            !['conservative', 'balanced', 'fast'].includes(String(config.profile)) ||
            typeof config.openBrowser !== 'boolean' ||
            !Number.isSafeInteger(config.preferredPort) ||
            Number(config.preferredPort) < 1 ||
            Number(config.preferredPort) > 65535 ||
            (config.proxyUrl !== undefined && typeof config.proxyUrl !== 'string') ||
            typeof config.libraryDirectory !== 'string' ||
            !path.isAbsolute(config.libraryDirectory))
            return deny('REVIEW_REQUIRED', 'CONFIG_SHAPE_REQUIRES_REVIEW')

        // Compare the *lexical* reference before any stat/realpath/open. Never
        // even inspect a custom/external library until there is separate consent.
        // The Windows temp fixture can differ by drive/directory case after
        // fs.realpathSync.native(), while referring to the same lexical path.
        // This comparison never probes the supplied external path. The
        // explicitly created data/ directory was already realpath-verified.
        const configured = path.resolve(config.libraryDirectory)
        // On Windows the OS-temp root can be returned through either its
        // original/8.3 spelling or its canonical long name. Both candidates
        // refer exclusively to the already-verified sandbox-owned data folder.
        // No file-system operation is performed on the config-supplied path.
        const expectedSpelling = path.resolve(
            requestedSandbox, 'profile', 'data')
        const sameLexicalLocation = [expectedSpelling, data].some(expected =>
            process.platform === 'win32'
                ? configured.toLowerCase() === expected.toLowerCase()
                : configured === expected)
        if (!sameLexicalLocation)
            return deny('REVIEW_REQUIRED', 'LIBRARY_REFERENCE_REQUIRES_CONSENT')

        const databaseFile = path.join(data, 'library.db')
        if (['-wal', '-shm', '-journal'].some(suffix =>
            stat(databaseFile + suffix)))
            return deny('REVIEW_REQUIRED', 'SQLITE_SIDECAR_PRESENT')
        const pre = auditLegacyDesktopProfileReadOnly(profile)
        if (pre.status !== 'READ_ONLY_INVENTORY_COMPLETE')
            return deny('REVIEW_REQUIRED', 'PRECHECK_NOT_COMPLETE')

        let schemaReason: GateReason | undefined
        const immutable = pathToFileURL(databaseFile)
        immutable.searchParams.set('immutable', '1')
        // Node's native read-only immutable SQLite handle cannot initialize or
        // migrate the database. It also does not create empty WAL/SHM sidecars.
        const db = new DatabaseSync(immutable, {
            readOnly: true, allowExtension: false
        })
        try {
            const history = db.prepare(
                'SELECT version, name FROM schema_migrations ORDER BY version'
            ).all() as Array<{ version: number; name: string }>
            if (history.length !== migrationNames.length ||
                history.some((row, index) =>
                    Number(row.version) !== index + 1 ||
                    String(row.name) !== migrationNames[index]))
                schemaReason = 'SCHEMA_MIGRATIONS_UNEXPECTED'
            if (!schemaReason) {
                const tables = new Set((db.prepare(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).all() as Array<{ name: string }>).map(row => String(row.name)))
                for (const [table, columns] of Object.entries(requiredColumns)) {
                    if (!tables.has(table)) {
                        schemaReason = 'REQUIRED_SCHEMA_MISSING'
                        break
                    }
                    // Fixed table names come from release source, not input.
                    const existing = new Set((db.prepare(
                        `PRAGMA table_info("${table}")`
                    ).all() as Array<{ name: string }>).map(row => String(row.name)))
                    if (columns.some(column => !existing.has(column))) {
                        schemaReason = 'REQUIRED_SCHEMA_MISSING'
                        break
                    }
                }
            }
            if (!schemaReason) {
                const integrity = db.prepare('PRAGMA integrity_check').all() as
                    Array<{ integrity_check: string }>
                if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' ||
                    db.prepare('PRAGMA foreign_key_check').all().length !== 0)
                    schemaReason = 'SQLITE_INTEGRITY_REQUIRES_REVIEW'
            }
        } finally {
            db.close()
        }

        const after = auditLegacyDesktopProfileReadOnly(profile)
        if (after.status !== 'READ_ONLY_INVENTORY_COMPLETE' ||
            after.config.sha256 !== pre.config.sha256 ||
            after.database.sha256 !== pre.database.sha256 ||
            ['-wal', '-shm', '-journal'].some(suffix =>
                stat(databaseFile + suffix)))
            return deny('BLOCKED', 'SOURCE_CHANGED_DURING_AUDIT')
        if (schemaReason)
            return deny('REVIEW_REQUIRED', schemaReason)
        return {
            ...base,
            status: 'QUALIFIED_SYNTHETIC_RELEASE_LAYOUT',
            legacySourcePolicyFieldAbsent: true,
            verifiedTableCount: Object.keys(requiredColumns).length,
            configSha256: pre.config.sha256,
            databaseSha256: pre.database.sha256
        }
    } catch {
        // Do not return filesystem paths, SQLite details or private settings.
        return deny('BLOCKED', 'SQLITE_READ_ONLY_OPEN_FAILED')
    }
}
