import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import {
    V050_HISTORY_QA_MARKER,
    V050_HISTORY_QA_MARKER_TEXT,
    qualifyV050HistoricalFixtureReadOnly
} from '../../src/desktop/v050-historical-fixture-gate'

const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')

const cleanup: string[] = []
afterEach(() => {
    for (const root of cleanup.splice(0))
        fs.rmSync(root, { recursive: true, force: true,
            maxRetries: 15, retryDelay: 100 })
})

function fixture() {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(),
        'pica-v050-history-qa-'))
    cleanup.push(sandbox)
    fs.writeFileSync(path.join(sandbox, V050_HISTORY_QA_MARKER),
        V050_HISTORY_QA_MARKER_TEXT, { flag: 'wx' })
    const profile = path.join(sandbox, 'profile')
    const data = path.join(profile, 'data')
    const configFolder = path.join(profile, 'config')
    fs.mkdirSync(data, { recursive: true })
    fs.mkdirSync(configFolder)
    const dbFile = path.join(data, 'library.db')
    const db = new LibraryDatabase(dbFile)
    db.close()
    // v0.5.0 release DesktopConfig only: *no* externalSources, mobileBridge
    // or readerSettings. The release creates a normal separate credential file.
    const config = {
        schemaVersion: 1,
        libraryDirectory: data,
        profile: 'balanced',
        openBrowser: true,
        preferredPort: 4789,
        proxyUrl: 'https://proxy.example.invalid'
    }
    const configFile = path.join(configFolder, 'config.json')
    const credentialFile = path.join(configFolder, 'credentials.dat')
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
    fs.writeFileSync(credentialFile,
        'SYNTHETIC_OPAQUE_DPAPI_BYTES_NEVER_PARSE')
    fs.writeFileSync(path.join(configFolder, 'remote-storage.json'),
        '{"synthetic":"opaque-remote-state"}')
    return { sandbox, profile, data, dbFile, configFile, configFolder,
        credentialFile, config }
}
function fingerprint(file: string) {
    const bytes = fs.readFileSync(file)
    const stat = fs.statSync(file)
    return {
        sha: createHash('sha256').update(bytes).digest('hex'),
        mtime: stat.mtimeMs, size: stat.size
    }
}
function gitBlobSha(file: string) {
    const bytes = fs.readFileSync(file)
    return createHash('sha1')
        .update(Buffer.from(`blob ${bytes.length}\0`))
        .update(bytes)
        .digest('hex')
}
function noSidecars(dbFile: string) {
    for (const ext of ['-wal', '-shm', '-journal'])
        expect(fs.existsSync(dbFile + ext)).toBe(false)
}

describe('v0.5.0 historical release-layout fixture — QA-only, no migration', () => {
    it('pins the exact public release migration and Desktop path definitions', () => {
        // Real v0.5.0 tag blobs read back from GitHub, not a guessed schema.
        expect(gitBlobSha('src/storage/sqlite/migrations.ts'))
            .toBe('4a98683fb29feec31970d3958385968f65af6365')
        expect(gitBlobSha('src/desktop/paths.ts'))
            .toBe('f4cf5e3f6bf3d5b9603dbbcc295d8ff58659ae8d')
    })

    it('qualifies release-shaped config + actual 14-migration SQLite without touching source files', () => {
        const f = fixture()
        const protectedFiles = [f.configFile, f.dbFile, f.credentialFile]
        const before = protectedFiles.map(fingerprint)
        const result = qualifyV050HistoricalFixtureReadOnly(f.sandbox)
        expect(result).toMatchObject({
            status: 'QUALIFIED_SYNTHETIC_RELEASE_LAYOUT',
            sourceTag: 'v0.5.0',
            expectedSchemaVersion: 14,
            releaseMigrationAndPathsIdenticalToCurrentTree: true,
            legacySourcePolicyFieldAbsent: true,
            verifiedTableCount: 11,
            secretsRead: false,
            externalLibraryInspected: false,
            actualUserProfileTouched: false,
            migrationPerformed: false,
            backupCreated: false,
            productionMigrationAuthorized: false
        })
        expect(result.configSha256).toMatch(/^[a-f0-9]{64}$/)
        expect(result.databaseSha256).toMatch(/^[a-f0-9]{64}$/)
        expect(JSON.stringify(result)).not.toContain(f.sandbox)
        expect(JSON.stringify(result)).not.toContain('SYNTHETIC_OPAQUE_DPAPI')
        expect(JSON.stringify(result)).not.toContain('proxy.example.invalid')
        expect(protectedFiles.map(fingerprint)).toEqual(before)
        noSidecars(f.dbFile)
        expect(qualifyV050HistoricalFixtureReadOnly(f.sandbox)).toEqual(result)
    }, 60000)

    it('admits only original/canonical spellings of the same owned data directory', () => {
        const f = fixture()
        const canonical = fs.realpathSync.native(f.data)
        fs.writeFileSync(f.configFile, JSON.stringify({
            ...f.config, libraryDirectory: canonical
        }))
        expect(qualifyV050HistoricalFixtureReadOnly(f.sandbox))
            .toMatchObject({
                status: 'QUALIFIED_SYNTHETIC_RELEASE_LAYOUT',
                productionMigrationAuthorized: false
            })
        // The similarly named sibling is never probed, even if it ends in
        // profile/data: it is NOT the owned directory verified above.
        const sibling = path.join(path.dirname(f.sandbox),
            path.basename(f.sandbox) + '-other', 'profile', 'data')
        fs.writeFileSync(f.configFile, JSON.stringify({
            ...f.config, libraryDirectory: sibling
        }))
        expect(qualifyV050HistoricalFixtureReadOnly(f.sandbox))
            .toMatchObject({
                status: 'REVIEW_REQUIRED',
                reason: 'LIBRARY_REFERENCE_REQUIRES_CONSENT',
                externalLibraryInspected: false
            })
        expect(fs.existsSync(sibling)).toBe(false)
    })

    it('fails closed for schema history drift without repairing the SQLite database', () => {
        const f = fixture()
        const db = new DatabaseSync(f.dbFile)
        try {
            db.prepare('UPDATE schema_migrations SET name = ? WHERE version = 14')
                .run('unreviewed_legacy_name')
        } finally { db.close() }
        const before = fingerprint(f.dbFile)
        const answer = qualifyV050HistoricalFixtureReadOnly(f.sandbox)
        expect(answer).toMatchObject({
            status: 'REVIEW_REQUIRED',
            reason: 'SCHEMA_MIGRATIONS_UNEXPECTED',
            productionMigrationAuthorized: false
        })
        expect(fingerprint(f.dbFile)).toEqual(before)
        noSidecars(f.dbFile)
    }, 60000)

    it('does not read custom or external library targets, missing targets included', () => {
        const f = fixture()
        const external = path.join(os.tmpdir(),
            'pica-v050-unconsented-library-nonexistent')
        fs.writeFileSync(f.configFile, JSON.stringify({
            ...f.config, libraryDirectory: external
        }))
        const before = fingerprint(f.configFile)
        expect(qualifyV050HistoricalFixtureReadOnly(f.sandbox))
            .toMatchObject({
                status: 'REVIEW_REQUIRED',
                reason: 'LIBRARY_REFERENCE_REQUIRES_CONSENT',
                externalLibraryInspected: false
            })
        expect(fingerprint(f.configFile)).toEqual(before)
        expect(fs.existsSync(external)).toBe(false)
        // A custom directory INSIDE the profile is also not silently adopted.
        fs.writeFileSync(f.configFile, JSON.stringify({
            ...f.config, libraryDirectory: path.join(f.profile, 'other')
        }))
        expect(qualifyV050HistoricalFixtureReadOnly(f.sandbox))
            .toMatchObject({
                status: 'REVIEW_REQUIRED',
                reason: 'LIBRARY_REFERENCE_REQUIRES_CONSENT'
            })
    })

    it('distinguishes post-release config fields, malformed settings and missing config', () => {
        const f = fixture()
        fs.writeFileSync(f.configFile, JSON.stringify({
            ...f.config, externalSources: {
                schemaVersion: 1, revision: 0, enabled: ['pica']
            }
        }))
        expect(qualifyV050HistoricalFixtureReadOnly(f.sandbox))
            .toMatchObject({
                status: 'REVIEW_REQUIRED', reason: 'POST_RELEASE_FIELDS_PRESENT'
            })
        fs.writeFileSync(f.configFile, JSON.stringify({
            ...f.config, unknownFutureFlag: true
        }))
        expect(qualifyV050HistoricalFixtureReadOnly(f.sandbox))
            .toMatchObject({
                status: 'REVIEW_REQUIRED', reason: 'CONFIG_SHAPE_REQUIRES_REVIEW'
            })
        fs.writeFileSync(f.configFile, '{invalid json')
        expect(qualifyV050HistoricalFixtureReadOnly(f.sandbox))
            .toMatchObject({
                status: 'BLOCKED', reason: 'CONFIG_FILE_UNSAFE'
            })
        fs.unlinkSync(f.configFile)
        expect(qualifyV050HistoricalFixtureReadOnly(f.sandbox))
            .toMatchObject({
                status: 'BLOCKED', reason: 'CONFIG_FILE_UNSAFE'
            })
    })

    it('blocks lock, rejects WAL/SHM without opening the DB, and never deletes markers', () => {
        const f = fixture()
        const runtime = path.join(f.profile, 'runtime-state')
        fs.mkdirSync(runtime)
        const lock = path.join(runtime, 'instance.lock')
        fs.writeFileSync(lock, 'DONT_DELETE_STALE_LOCK')
        expect(qualifyV050HistoricalFixtureReadOnly(f.sandbox))
            .toMatchObject({
                status: 'BLOCKED', reason: 'DESKTOP_INSTANCE_LOCK_PRESENT'
            })
        expect(fs.readFileSync(lock, 'utf8')).toBe('DONT_DELETE_STALE_LOCK')
        fs.unlinkSync(lock)
        const wal = f.dbFile + '-wal'
        fs.writeFileSync(wal, 'SYNTHETIC_WAL_MUST_REMAIN_UNTOUCHED')
        expect(qualifyV050HistoricalFixtureReadOnly(f.sandbox))
            .toMatchObject({
                status: 'REVIEW_REQUIRED', reason: 'SQLITE_SIDECAR_PRESENT'
            })
        expect(fs.readFileSync(wal, 'utf8'))
            .toBe('SYNTHETIC_WAL_MUST_REMAIN_UNTOUCHED')
    })

    it('requires an explicit OS-temp sentinel and refuses symlinked profile paths', () => {
        const f = fixture()
        expect(qualifyV050HistoricalFixtureReadOnly('relative'))
            .toMatchObject({ status: 'BLOCKED',
                reason: 'EXPLICIT_QA_ROOT_REQUIRED' })
        const marker = path.join(f.sandbox, V050_HISTORY_QA_MARKER)
        fs.unlinkSync(marker)
        expect(qualifyV050HistoricalFixtureReadOnly(f.sandbox))
            .toMatchObject({ status: 'BLOCKED', reason: 'QA_MARKER_MISSING' })
        fs.writeFileSync(marker, V050_HISTORY_QA_MARKER_TEXT)
        if (process.platform !== 'win32') {
            const relocated = path.join(f.sandbox, 'profile-saved')
            fs.renameSync(f.profile, relocated)
            fs.symlinkSync(relocated, f.profile, 'dir')
            expect(qualifyV050HistoricalFixtureReadOnly(f.sandbox))
                .toMatchObject({
                    status: 'BLOCKED', reason: 'PROFILE_DIRECTORY_UNSAFE'
                })
        }
    })

    it('has no code path capable of writing, running migrations, or reading credentials', () => {
        const source = fs.readFileSync(
            'src/desktop/v050-historical-fixture-gate.ts', 'utf8')
        expect(source).not.toMatch(/fs\.(?:writeFile|appendFile|rename|unlink|mkdir|rm|copyFile)Sync\(/)
        expect(source).not.toMatch(/\b(?:runMigrations|backup|restoreLegacyFixtureSnapshot|new LibraryDatabase)\s*\(/)
        expect(source).not.toMatch(/readFileSync\([^)]*credentials/i)
        expect(source).not.toMatch(/from ['"][^'"]*(?:providers|provider-service|sdk|updater|source-hosts)/)
    })
})
