import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LocalLibraryIngestion } from '../../src/local-library/ingestion'
import {
    LEGACY_SNAPSHOT_QA_MARKER,
    LEGACY_SNAPSHOT_QA_MARKER_TEXT,
    snapshotLegacyFixtureProfile,
    restoreLegacyFixtureSnapshot
} from '../../src/desktop/legacy-profile-snapshot-qa'
import { auditLegacyDesktopProfileReadOnly } from
    '../../src/desktop/legacy-profile-preflight'

const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)
const cleanup: string[] = []
afterEach(() => {
    for (const root of cleanup.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true,
            maxRetries: 15, retryDelay: 100 })
    }
})
async function fixture() {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v050-rollback-qa-'))
    cleanup.push(sandbox)
    fs.writeFileSync(path.join(sandbox, LEGACY_SNAPSHOT_QA_MARKER),
        LEGACY_SNAPSHOT_QA_MARKER_TEXT, { flag: 'wx' })
    const profile = path.join(sandbox, 'profile')
    const data = path.join(profile, 'data')
    const config = path.join(profile, 'config')
    const originals = path.join(sandbox, 'originals')
    for (const folder of [data, config, originals])
        fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(originals, '01.png'), png)
    fs.writeFileSync(path.join(originals, '02.png'), png)
    const dbFile = path.join(data, 'library.db')
    const db = new LibraryDatabase(dbFile)
    const ingestion = new LocalLibraryIngestion(db, data)
    const preview = await ingestion.preview(originals, 'folder')
    const imported = await ingestion.confirm(preview.token)
    const shelf = db.createShelf('Old v0.5.0 shelf fixture')
    db.addShelfItems(shelf.id, [imported.comicId])
    const episode = db.listReaderEpisodes(imported.comicId)[0]
    db.saveReadingProgress(imported.comicId, episode.id, 1)
    db.close()
    const settings = {
        schemaVersion: 1, libraryDirectory: data,
        profile: 'balanced', preferredPort: 4789,
        openBrowser: true,
        externalSources: { schemaVersion: 1, revision: 0, enabled: ['pica'] }
    }
    fs.writeFileSync(path.join(config, 'config.json'),
        JSON.stringify(settings, null, 2))
    const opaque = Buffer.from('SYNTHETIC_ENCRYPTED_CREDENTIAL_BLOB_NOT_USER_DATA')
    fs.writeFileSync(path.join(config, 'credentials.dat'), opaque)
    fs.writeFileSync(path.join(config, 'remote-storage.json'),
        JSON.stringify({ fakeTarget: 'synthetic-only.invalid' }))
    fs.writeFileSync(path.join(config, 'source-hosts.json'),
        JSON.stringify({ detached: true }))
    const personalization = path.join(profile, 'runtime-state', 'personalization')
    fs.mkdirSync(personalization, { recursive: true })
    fs.writeFileSync(path.join(personalization, 'taste.json'),
        JSON.stringify({ fixture: 'user explicit preference', score: 8 }))
    const packs = path.join(profile, 'packs')
    const cache = path.join(profile, 'cache')
    const logs = path.join(profile, 'logs')
    const updater = path.join(profile, 'runtime-state', 'upgrade-assistant')
    for (const directory of [packs, cache, logs, updater])
        fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(packs, 'edition-map.json'),
        '{"fixture":"opaque"}')
    fs.writeFileSync(path.join(cache, 'cover.webp'), png)
    fs.writeFileSync(path.join(cache, 'empty-placeholder.flag'), Buffer.alloc(0))
    fs.writeFileSync(path.join(logs, 'old-log.txt'),
        'NOT_IN_ROLLBACK_BACKUP')
    fs.writeFileSync(path.join(updater, 'old-updater.exe'),
        'UNTRUSTED_OLD_UPDATER_NOT_COPIED')
    return { sandbox, profile, data, config, dbFile, imported,
        shelf, episode, opaque, settings, original: originals }
}

describe('v0.5.0 synthetic consistency snapshot and rollback rehearsal', () => {
    it('copies old-profile preferences, reading progress, book pages and opaque credentials without migration', async () => {
        const f = await fixture()
        expect(auditLegacyDesktopProfileReadOnly(f.profile).status)
            .toBe('READ_ONLY_INVENTORY_COMPLETE')
        const beforeDb = fs.readFileSync(f.dbFile)
        const beforeConfig = fs.readFileSync(path.join(f.config, 'config.json'))
        const beforeCredentials = fs.readFileSync(path.join(
            f.config, 'credentials.dat'))
        const snapshot = await snapshotLegacyFixtureProfile(f.sandbox)
        expect(snapshot).toMatchObject({
            status: 'SYNTHETIC_SNAPSHOT_VERIFIED',
            sqliteOnlineBackup: true,
            sourceWalIntegrated: false,
            productionRestoreAuthorized: false,
            actualUserProfileTouched: false
        })
        expect(snapshot.manifestSha256).toMatch(/^[a-f0-9]{64}$/)
        const manifest = JSON.parse(fs.readFileSync(
            path.join(f.sandbox, 'snapshot', 'manifest.json'), 'utf8'))
        expect(manifest).toMatchObject({
            secretsParsed: false,
            sourceDatabaseAndWalVerifiedUnchanged: true,
            crossFileAtomicityProven: false,
            productionRestoreAuthorized: false,
            sqliteOnlineBackup: true,
            excludedNonUserState: expect.arrayContaining([
                'logs', 'runtime-state/upgrade-assistant'
            ])
        })
        const list = manifest.files.map((row: {path:string}) => row.path)
        for (const file of [
            'config/config.json', 'config/credentials.dat',
            'config/remote-storage.json', 'config/source-hosts.json',
            'data/library.db', 'runtime-state/personalization/taste.json',
            'packs/edition-map.json', 'cache/cover.webp',
            'cache/empty-placeholder.flag'
        ]) expect(list).toContain(file)
        expect(list).not.toContain('logs/old-log.txt')
        expect(list).not.toContain('runtime-state/upgrade-assistant/old-updater.exe')
        expect(JSON.stringify(snapshot)).not.toContain('SYNTHETIC_ENCRYPTED')
        expect(JSON.stringify(snapshot)).not.toContain(f.profile)
        const restored = restoreLegacyFixtureSnapshot(
            f.sandbox, snapshot.manifestSha256)
        expect(restored).toMatchObject({
            status: 'SYNTHETIC_ROLLBACK_VERIFIED',
            verifiedSqliteIntegrity: true, sqliteOnlineBackup: true,
            existingRootOverwritten: false,
            productionRestoreAuthorized: false, actualUserProfileTouched: false
        })
        expect(restored.fileCount).toBe(snapshot.fileCount)
        expect(fs.readFileSync(f.dbFile)).toEqual(beforeDb)
        expect(fs.existsSync(f.dbFile + '-wal')).toBe(false)
        expect(fs.existsSync(f.dbFile + '-shm')).toBe(false)
        expect(fs.statSync(path.join(restoredRoot, 'cache',
            'empty-placeholder.flag')).size).toBe(0)
        expect(fs.readFileSync(path.join(f.config, 'config.json')))
            .toEqual(beforeConfig)
        expect(fs.readFileSync(path.join(f.config, 'credentials.dat')))
            .toEqual(beforeCredentials)
        const restoredRoot = path.join(f.sandbox, 'restored')
        expect(fs.readFileSync(path.join(restoredRoot, 'config',
            'credentials.dat'))).toEqual(f.opaque)
        expect(fs.readFileSync(path.join(restoredRoot, 'config',
            'config.json'))).toEqual(beforeConfig)
        const reader = new DatabaseSync(path.join(restoredRoot, 'data',
            'library.db'), { readOnly: true })
        try {
            const shelves = reader.prepare(
                'SELECT COUNT(*) AS n FROM shelf_items').get() as Record<string, number>
            const progress = reader.prepare(
                'SELECT MAX(page_index) AS idx FROM reading_progress').get() as
                Record<string, number>
            expect(shelves.n).toBe(1)
            expect(progress.idx).toBe(1)
            expect(reader.prepare('PRAGMA integrity_check').all())
                .toEqual([expect.objectContaining({ integrity_check: 'ok' })])
        } finally { reader.close() }
        expect(fs.existsSync(path.join(restoredRoot, 'logs'))).toBe(false)
        expect(fs.existsSync(path.join(restoredRoot, 'runtime-state',
            'upgrade-assistant'))).toBe(false)
    }, 60000)

    it('integrates an actual uncheckpointed SQLite WAL transaction into a standalone backup', async () => {
        const f = await fixture()
        const source = new DatabaseSync(f.dbFile)
        try {
            source.exec('PRAGMA journal_mode=WAL')
            source.exec('CREATE TABLE qa_wal_evidence (id INTEGER PRIMARY KEY, text TEXT)')
            source.prepare('INSERT INTO qa_wal_evidence (text) VALUES (?)')
                .run('WAL-only committed synthetic row')
            expect(fs.existsSync(f.dbFile + '-wal')).toBe(true)
            expect(auditLegacyDesktopProfileReadOnly(f.profile))
                .toMatchObject({
                    status: 'REVIEW_REQUIRED', reason: 'SQLITE_SIDECAR_PRESENT'
                })
            // New snapshot engine deliberately verifies sqlite.backup with WAL.
            // It is NOT wired into the v0.5 preflight or real user updater.
            const snapshot = await snapshotLegacyFixtureProfile(f.sandbox)
            expect(snapshot.sourceWalIntegrated).toBe(true)
            const file = path.join(f.sandbox, 'snapshot', 'data', 'library.db')
            const read = new DatabaseSync(file, { readOnly: true })
            try {
                const row = read.prepare(
                    'SELECT text FROM qa_wal_evidence WHERE id = 1'
                ).get() as Record<string, string>
                expect(row.text).toBe('WAL-only committed synthetic row')
            } finally { read.close() }
            // The source writer remains functional and its existing data
            // untouched; the snapshot is standalone after mode normalization.
            expect(source.prepare('SELECT COUNT(*) AS n FROM qa_wal_evidence')
                .get()).toMatchObject({ n: 1 })
            const rollback = restoreLegacyFixtureSnapshot(
                f.sandbox, snapshot.manifestSha256)
            expect(rollback.verifiedSqliteIntegrity).toBe(true)
            const final = new DatabaseSync(path.join(f.sandbox, 'restored',
                'data', 'library.db'), { readOnly: true })
            try {
                expect(final.prepare('SELECT text FROM qa_wal_evidence').get())
                    .toMatchObject({ text: 'WAL-only committed synthetic row' })
            } finally { final.close() }
        } finally { source.close() }
    }, 60000)

    it('never replaces a source or existing restore; rejects changed snapshot bytes before creating restore', async () => {
        const f = await fixture()
        const snap = await snapshotLegacyFixtureProfile(f.sandbox)
        await expect(snapshotLegacyFixtureProfile(f.sandbox))
            .rejects.toThrow('SNAPSHOT_ALREADY_EXISTS')
        const copied = path.join(f.sandbox, 'snapshot', 'packs',
            'edition-map.json')
        fs.appendFileSync(copied, 'tampered')
        expect(() => restoreLegacyFixtureSnapshot(f.sandbox,
            snap.manifestSha256)).toThrow('SNAPSHOT_FILE_INTEGRITY_MISMATCH')
        expect(fs.existsSync(path.join(f.sandbox, 'restored'))).toBe(false)
        expect(fs.existsSync(path.join(f.profile, 'packs',
            'edition-map.json'))).toBe(true)
        const restoredSample = fs.readFileSync(path.join(f.profile,
            'packs', 'edition-map.json'), 'utf8')
        expect(restoredSample).toBe('{"fixture":"opaque"}')
    }, 60000)

    it('rejects a symlinked directory inserted under the staged snapshot before any restore', async () => {
        const f = await fixture()
        const snapshot = await snapshotLegacyFixtureProfile(f.sandbox)
        if (process.platform !== 'win32') {
            const folder = path.join(f.sandbox, 'snapshot', 'packs')
            const moved = path.join(f.sandbox, 'snapshot', 'packs.saved')
            fs.renameSync(folder, moved)
            fs.symlinkSync(moved, folder, 'dir')
            expect(() => restoreLegacyFixtureSnapshot(
                f.sandbox, snapshot.manifestSha256
            )).toThrow('SYNTHETIC_QA_DIRECTORY_UNSAFE')
            expect(fs.existsSync(path.join(f.sandbox, 'restored')))
                .toBe(false)
        }
    }, 60000)

    it('fails closed for active app lock, external library, symlink and arbitrary non-temp directory', async () => {
        const f = await fixture()
        const lock = path.join(f.profile, 'runtime-state', 'instance.lock')
        fs.writeFileSync(lock, '123456')
        await expect(snapshotLegacyFixtureProfile(f.sandbox))
            .rejects.toThrow('DESKTOP_INSTANCE_LOCK_PRESENT')
        expect(fs.existsSync(path.join(f.sandbox, 'snapshot'))).toBe(false)
        fs.unlinkSync(lock)
        const foreign = { ...f.settings,
            libraryDirectory: path.join(f.sandbox, 'originals') }
        const configFile = path.join(f.config, 'config.json')
        fs.writeFileSync(configFile, JSON.stringify(foreign))
        await expect(snapshotLegacyFixtureProfile(f.sandbox))
            .rejects.toThrow('EXTERNAL_LIBRARY_NEEDS_SEPARATE_CONSENT')
        fs.writeFileSync(configFile, JSON.stringify(f.settings))
        if (process.platform !== 'win32') {
            const link = path.join(f.profile, 'data', 'user-link')
            fs.symlinkSync(path.join(f.sandbox, 'originals', '01.png'), link)
            await expect(snapshotLegacyFixtureProfile(f.sandbox))
                .rejects.toThrow('SYNTHETIC_QA_SYMLINK_FORBIDDEN')
            fs.unlinkSync(link)
        }
        await expect(snapshotLegacyFixtureProfile(process.cwd()))
            .rejects.toThrow()
        expect(() => restoreLegacyFixtureSnapshot(f.sandbox,
            '0'.repeat(64))).toThrow()
        expect(fs.existsSync(path.join(f.sandbox, 'snapshot'))).toBe(false)
    }, 60000)

    it('never imports SDKs, default Desktop paths, legacy Database constructor or updater', () => {
        const text = fs.readFileSync(
            'src/desktop/legacy-profile-snapshot-qa.ts', 'utf8')
        expect(text).not.toMatch(/from ['"][^'"]*(?:\/sdk|provider-service|source-hosts|library\/service|update\/|desktop\/paths)/)
        expect(text).not.toContain('PICA_LIBRARY_DESKTOP_HOME')
        expect(text).not.toContain('defaultDesktopRoot')
        expect(text).not.toContain('process.env.APPDATA')
        expect(text).not.toContain('new LibraryDatabase(')
        expect(text).toContain('await backup(src, destination')
        expect(text).toContain("source: 'main', target: 'main'")
        expect(text).toContain('integrityOfBackup(destination, true)')
    })
})
