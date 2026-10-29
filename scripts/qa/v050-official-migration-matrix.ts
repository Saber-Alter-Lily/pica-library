/**
 * CORE-LIB-04c-02b-03b-02 — release-authored 5/11/13 -> 14 migration matrix.
 * Strictly GitHub CI and sentinel-owned disposable OS-temp SQLite/media.
 *
 * Original release migrations create the OLD schema and the ORIGINAL release
 * LibraryDatabase constructor upgrades it. The current gate only reads.
 * No account network, real profile, plugin, updater, DPAPI or backup service.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { verifyPinnedV050Checkout, V050_RELEASE_COMMIT } from './v050-release-identity'
import {
    qualifyV050HistoricalFixtureReadOnly,
    V050_HISTORY_QA_MARKER,
    V050_HISTORY_QA_MARKER_TEXT
} from '../../src/desktop/v050-historical-fixture-gate'
import { inventoryV050OwnedMediaSyntheticReadOnly } from
    '../../src/desktop/v050-owned-media-inventory-qa'

const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')

const starts = [5, 11, 13] as const
let activePhase = 'INIT'
let activeVersion = 0
const when = '2026-01-01T00:00:00.000Z'
type ReleaseMigrations = {
    migrations: Array<{version: number; name: string; up: string}>
    runMigrations(db: InstanceType<typeof DatabaseSync>,
        available?: Array<{version: number; name: string; up: string}>): void
}
type ReleaseConfig = {
    buildConfig(input: {account: string; password: string; libraryDirectory: string;
        profile: 'balanced'}): {config: {
            schemaVersion: 1; libraryDirectory: string; profile: string;
            openBrowser: boolean; preferredPort: number
        }}
    saveConfig(file: string, value: unknown): void
}
type ReleaseLibraryDb = {
    LibraryDatabase: new (file: string) => {close(): void}
}
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
function requireCondition(ok: unknown, code: string): asserts ok {
    if (!ok) throw new Error('V050_MIGRATION_QA_' + code)
}
function noSqliteSidecars(file: string) {
    for (const suffix of ['-wal', '-shm', '-journal'])
        requireCondition(!fs.existsSync(file + suffix),
            'ORIGINAL_DB_SIDECAR_UNEXPECTED')
}
function readOnlyDb(file: string) {
    const uri = pathToFileURL(file)
    uri.searchParams.set('immutable', '1')
    return new DatabaseSync(uri, {readOnly: true, allowExtension: false})
}
function result(root: string, expectedStatus: string, reason?: string) {
    const gate = qualifyV050HistoricalFixtureReadOnly(root)
    requireCondition(gate.status === expectedStatus &&
        (reason === undefined || gate.reason === reason),
        'CURRENT_GATE_STATUS_MISMATCH')
    requireCondition(gate.productionMigrationAuthorized === false &&
        gate.actualUserProfileTouched === false && gate.secretsRead === false &&
        gate.externalLibraryInspected === false && gate.backupCreated === false,
        'CURRENT_GATE_AUTHORITY_ESCALATION')
    requireCondition(!JSON.stringify(gate).includes(root), 'PRIVATE_PATH_LEAK')
    return gate
}
function knownRows(db: InstanceType<typeof DatabaseSync>, version: number) {
    const row = (sql: string) => db.prepare(sql).get() as Record<string, unknown>
    const present = (table: string) => Boolean(db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table))
    const names = db.prepare(
        'SELECT version, name FROM schema_migrations ORDER BY version'
    ).all() as Array<{version: number; name: string}>
    requireCondition(names.length === version &&
        names.every((entry, i) => Number(entry.version) === i + 1),
        'HISTORICAL_SCHEMA_SEQUENCE')
    const comic = row("SELECT title, is_favorite FROM comics WHERE id = 'historical:work'")
    const progress = row("SELECT page_index FROM reading_progress WHERE comic_id = 'historical:work'")
    const pic = row("SELECT local_path, byte_size FROM pictures WHERE id = 'historical:picture'")
    const shelf = row("SELECT COUNT(*) AS n FROM shelf_items WHERE comic_id='historical:work'")
    const job = row("SELECT status FROM download_jobs WHERE id='historical:job'")
    requireCondition(comic?.title === 'Historical Synthetic Work' &&
        comic?.is_favorite === 1 &&
        progress?.page_index === 1 && shelf?.n === 1 &&
        pic?.byte_size === 68 && typeof pic?.local_path === 'string' &&
        job?.status === 'DRAFT', 'HISTORICAL_USER_ROWS_CHANGED')
    requireCondition(
        (db.prepare('PRAGMA integrity_check').all() as
            Array<{integrity_check: string}>).every(x => x.integrity_check === 'ok') &&
        db.prepare('PRAGMA foreign_key_check').all().length === 0,
        'SQLITE_INTEGRITY_OR_FOREIGN_KEY')
    if (version >= 6)
        requireCondition(present('app_state') &&
            row("SELECT value_json FROM app_state WHERE key = 'history'")?.value_json ===
                '{"synthetic":true}', 'APP_STATE_NOT_PRESERVED')
    if (version >= 8)
        requireCondition(present('user_events') &&
            row("SELECT event_type FROM user_events WHERE id='historical:event'")?.event_type
            === 'fixture', 'EVENT_NOT_PRESERVED')
    if (version >= 12)
        requireCondition(present('canonical_works') &&
            row("SELECT preferred_title FROM canonical_works WHERE id='historical:canonical'")?.preferred_title
            === 'Historical Synthetic Work', 'WORK_IDENTITY_NOT_PRESERVED')
    return names
}
function seed(db: InstanceType<typeof DatabaseSync>, version: number,
    media: string) {
    db.prepare(`INSERT INTO comics
        (id, title, raw_author, categories_json, tags_json, is_favorite,
         pages_count, eps_count, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, '["fixture"]', '["historical"]', 1, 2, 1, ?, ?)`
    ).run('historical:work', 'Historical Synthetic Work', 'Test Author', when, when)
    db.prepare(`INSERT INTO episodes
        (id, comic_id, title, order_no, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, 1, ?, ?)`
    ).run('historical:episode', 'historical:work', 'Chapter', when, when)
    db.prepare(`INSERT INTO pictures
        (id, comic_id, episode_id, position, original_name, media_path,
         file_server, local_path, byte_size, status, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, 1, 'synthetic.png', 'synthetic/1', 'invalid.example',
                ?, 68, 'completed', ?, ?)`
    ).run('historical:picture','historical:work','historical:episode',media,when,when)
    db.prepare(`INSERT INTO shelves
        (id, name, normalized_name, created_at, updated_at)
        VALUES (?, 'Historical shelf', 'historical shelf', ?, ?)`
    ).run('historical:shelf',when,when)
    db.prepare(`INSERT INTO shelf_items
        (shelf_id, comic_id, added_at, position)
        VALUES ('historical:shelf', 'historical:work', ?, 0)`
    ).run(when)
    db.prepare(`INSERT INTO reading_progress
        (comic_id, episode_id, page_index, updated_at)
        VALUES ('historical:work', 'historical:episode', 1, ?)`
    ).run(when)
    db.prepare(`INSERT INTO download_jobs
        (id, comic_id, source, created_at, status)
        VALUES ('historical:job','historical:work','synthetic',?,'DRAFT')`
    ).run(when)
    if (version >= 6)
        db.prepare(`INSERT INTO app_state (key, value_json, updated_at)
            VALUES ('history','{"synthetic":true}',?)`).run(when)
    if (version >= 8)
        db.prepare(`INSERT INTO user_events
            (id, occurred_at, event_type, metadata_json, created_at)
            VALUES ('historical:event',?,'fixture','{}',?)`).run(when,when)
    if (version >= 12) {
        db.prepare(`INSERT INTO canonical_works
            (id, preferred_title, normalized_title, created_at, updated_at)
            VALUES ('historical:canonical','Historical Synthetic Work',
                'historical synthetic work',?,?)`).run(when,when)
    }
}

async function main() {
    activePhase = 'VERIFY_RELEASE'
    const source = verifyPinnedV050Checkout()
    activePhase = 'LOAD_RELEASE_MODULES'
    const migrationModule = await import(pathToFileURL(path.join(source,
        'src/storage/sqlite/migrations.ts')).href) as unknown as ReleaseMigrations
    const configModule = await import(pathToFileURL(path.join(source,
        'src/desktop/config.ts')).href) as unknown as ReleaseConfig
    const libraryModule = await import(pathToFileURL(path.join(source,
        'src/library/database.ts')).href) as unknown as ReleaseLibraryDb
    requireCondition(migrationModule.migrations.length === 14 &&
        typeof migrationModule.runMigrations === 'function' &&
        typeof configModule.saveConfig === 'function' &&
        typeof libraryModule.LibraryDatabase === 'function',
        'OFFICIAL_TAG_MODULES_UNAVAILABLE')

    let passed = 0
    for (const version of starts) {
        activeVersion = version
        activePhase = 'CREATE_SYNTHETIC_SANDBOX'
        const sandbox = fs.mkdtempSync(path.join(os.tmpdir(),
            'pica-v050-history-qa-'))
        try {
            fs.writeFileSync(path.join(sandbox, V050_HISTORY_QA_MARKER),
                V050_HISTORY_QA_MARKER_TEXT, {flag:'wx', mode:0o600})
            const profile = path.join(sandbox, 'profile')
            const data = path.join(profile, 'data')
            const configDir = path.join(profile, 'config')
            const downloaded = path.join(data, 'downloaded')
            fs.mkdirSync(downloaded, {recursive:true,mode:0o700})
            fs.mkdirSync(configDir,{recursive:true,mode:0o700})
            const pic = path.join(downloaded, 'page.png')
            // The image is synthetic, created within the fixture; bytes never
            // enter logs, migration reports or a distributable artifact.
            const png = Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
                'base64'
            )
            fs.writeFileSync(pic,png,{flag:'wx',mode:0o600})
            const mediaSha = digest(png)
            const dbFile = path.join(data,'library.db')
            activePhase = 'CREATE_PARTIAL_SCHEMA'
            const legacy = new DatabaseSync(dbFile)
            try {
                legacy.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE')
                migrationModule.runMigrations(legacy,
                    migrationModule.migrations.filter(x=>x.version<=version))
                activePhase = 'SEED_HISTORY'
                seed(legacy,version,pic)
                activePhase = 'VERIFY_OLD_ROWS'
                knownRows(legacy,version)
            } finally {legacy.close()}
            noSqliteSidecars(dbFile)
            const configFile = path.join(configDir,'config.json')
            const releaseConfig = configModule.buildConfig({
                account:'synthetic-only@invalid.example',password:'synthetic-only',
                libraryDirectory:data,profile:'balanced'
            })
            configModule.saveConfig(configFile,releaseConfig.config)
            const originalConfig = fs.readFileSync(configFile)
            activePhase = 'PREUPGRADE_GATE'
            result(sandbox,'REVIEW_REQUIRED','SCHEMA_MIGRATIONS_UNEXPECTED')
            requireCondition(
                inventoryV050OwnedMediaSyntheticReadOnly(sandbox).status
                    === 'REVIEW_REQUIRED',
                'BEFORE_MIGRATION_MEDIA_GATE_NOT_REJECTED')

            // Explicitly call the *tagged release constructor* to run its
            // real backupBeforeMigration + runMigrations lifecycle.
            activePhase = 'ORIGINAL_RELEASE_UPGRADE'
            const actualOld = new libraryModule.LibraryDatabase(dbFile)
            actualOld.close()
            noSqliteSidecars(dbFile)
            const preMigrationBackup = dbFile + '.pre-migration-v14.bak'
            requireCondition(fs.existsSync(preMigrationBackup),
                'OFFICIAL_PRE_MIGRATION_BACKUP_ABSENT')
            activePhase = 'VERIFY_RELEASE_BACKUP'
            const backup = readOnlyDb(preMigrationBackup)
            try {knownRows(backup,version)} finally {backup.close()}
            activePhase = 'VERIFY_UPGRADED_ROWS'
            const finalDb = readOnlyDb(dbFile)
            try {
                const history = knownRows(finalDb,14)
                requireCondition(history[13]?.name ===
                    'post_v0411_index_bundle','TARGET_RELEASE_SCHEMA_NOT_REACHED')
            } finally { finalDb.close() }
            activePhase = 'POSTUPGRADE_GATE'
            const qualified = result(sandbox,
                'QUALIFIED_SYNTHETIC_RELEASE_LAYOUT')
            requireCondition(qualified.expectedSchemaVersion === 14,
                'CURRENT_GATE_DID_NOT_ACCEPT_OFFICIAL_MIGRATION')
            activePhase = 'MEDIA_INVENTORY'
            const mediaInventory =
                inventoryV050OwnedMediaSyntheticReadOnly(sandbox)
            requireCondition(mediaInventory.status ===
                'SYNTHETIC_MEDIA_METADATA_ONLY' &&
                mediaInventory.referencedDownloadedPictures === 1 &&
                mediaInventory.fileContentsVerified === false &&
                mediaInventory.crossFileAtomicityProven === false &&
                mediaInventory.productionMigrationAuthorized === false,
                'MEDIA_INVENTORY_NOT_SAFE')
            activePhase = 'PRESERVATION_HASHES'
            requireCondition(
                fs.readFileSync(configFile).equals(originalConfig) &&
                digest(fs.readFileSync(pic))===mediaSha,
                'RELEASE_UPGRADE_MODIFIED_CONFIG_OR_MEDIA')
            passed++
        } finally {
            // The only removable folder is the one created by mkdtemp.
            fs.rmSync(sandbox,{recursive:true,force:true,
                maxRetries:15,retryDelay:100})
        }
    }
    process.stdout.write(JSON.stringify({
        status:'OFFICIAL_RELEASE_HISTORICAL_5_11_13_TO_14_PASS',
        originalTag:V050_RELEASE_COMMIT,
        historicalStartingVersions:starts,
        passed,
        releaseMigrationAndBackupActuallyExecuted:true,
        priorRowsSurvived:true,
        mediaContentReadOnlyVerification:false,
        productionMigrationAuthorized:false,
        realUserDataTouched:false,
        artifactsPublished:false
    })+'\n')
}
main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : ''
    const own = /^V050_MIGRATION_QA_[A-Z0-9_]+$/.test(message)
        ? message : ''
    const code = error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string' &&
        /^(?:SQLITE_|ERR_SQLITE_)/.test(error.code)
        ? error.code : 'NO_PUBLIC_CODE'
    // Only the synthetic test stage and a vetted error class are printed.
    process.stderr.write('OFFICIAL_RELEASE_HISTORICAL_MIGRATION_MATRIX_FAIL' +
        ' version=' + activeVersion + ' phase=' + activePhase +
        ' check=' + (own || code) + '\\n')
    process.exitCode = 1
})
