/**
 * CORE-LIB-04c-02b-03b-01: true v0.5.0 tagged-source-to-current-reader fixture.
 *
 * CI-only. The v0.5.0 release implementation (not the development copy of
 * LibraryDatabase or buildConfig) WRITES a new synthetic OS-temp fixture.
 * Then the current migration admission gate READS it without mutation.
 *
 * This does not install, migrate, open or enumerate any user's real profile.
 * The generated fixture is never archived or uploaded to CI artifacts.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { verifyPinnedV050Checkout, V050_RELEASE_COMMIT } from './v050-release-identity'
import { qualifyV050HistoricalFixtureReadOnly, V050_HISTORY_QA_MARKER, V050_HISTORY_QA_MARKER_TEXT } from '../../src/desktop/v050-historical-fixture-gate'

type ReleaseComic = {
    comicId: string
    title: string
    author: string
    categories: string[]
    tags: string[]
    finished: boolean
    pagesCount: number
    epsCount: number
}
type ReleaseDatabase = {
    importFavorites(records: ReleaseComic[], source: string, completeSnapshot: boolean, markFavorite: boolean): unknown
    upsertEpisode(value: {id: string; comicId: string; title: string; order: number}): void
    upsertPicture(value: {id: string; comicId: string; episodeId: string; position: number; originalName: string; mediaPath: string; fileServer: string}): void
    markPictureDownloaded(id: string, file: string, bytes: number, sha: string): void
    createShelf(name: string): {id: string}
    addShelfItems(shelfId: string, comicIds: string[]): unknown
    saveReadingProgress(comicId: string, episodeId: string, pageIndex: number): unknown
    close(): void
}
type ReleaseConfig = {
    schemaVersion: 1
    libraryDirectory: string
    profile: string
    openBrowser: boolean
    preferredPort: number
    proxyUrl?: string
}
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
function check(condition: unknown, label: string): asserts condition {
    if (!condition) throw new Error('V050_RELEASE_FIXTURE_' + label)
}
function fingerprint(file: string) {
    const data = fs.readFileSync(file)
    const st = fs.statSync(file)
    return {sha: hash(data), size: st.size, mtimeMs: st.mtimeMs}
}
function absentSQLiteSidecars(file: string) {
    for (const suffix of ['-wal', '-shm', '-journal'])
        check(!fs.existsSync(file + suffix), 'SQLITE_SIDECAR_CREATED')
}
function resultStatus(root: string, expectedStatus: string, reason?: string) {
    const observed = qualifyV050HistoricalFixtureReadOnly(root)
    check(observed.status === expectedStatus, 'UNEXPECTED_STATUS')
    if (reason !== undefined)
        check(observed.reason === reason, 'UNEXPECTED_REASON')
    check(observed.productionMigrationAuthorized === false &&
        observed.actualUserProfileTouched === false &&
        observed.externalLibraryInspected === false &&
        observed.secretsRead === false && observed.backupCreated === false,
        'UNSAFE_RESULT')
    check(!JSON.stringify(observed).includes(root), 'PATH_LEAKED')
    return observed
}
async function main() {
    const source = verifyPinnedV050Checkout()
    const releaseDb = await import(pathToFileURL(path.join(source,
        'src/library/database.ts')).href) as unknown as {
        LibraryDatabase: new (file: string) => ReleaseDatabase
    }
    const releaseConfig = await import(pathToFileURL(path.join(source,
        'src/desktop/config.ts')).href) as unknown as {
        buildConfig(input: {account: string; password: string;
            libraryDirectory: string; profile: 'conservative' | 'balanced' | 'fast';
            proxyUrl?: string}): {config: ReleaseConfig}
        saveConfig(file: string, config: ReleaseConfig): void
        loadConfig(file: string): ReleaseConfig | null
    }
    check(typeof releaseDb.LibraryDatabase === 'function' &&
        typeof releaseConfig.buildConfig === 'function' &&
        typeof releaseConfig.saveConfig === 'function' &&
        typeof releaseConfig.loadConfig === 'function', 'OFFICIAL_MODULES_UNAVAILABLE')

    // mkdtemp is the ONLY root creator; nothing is based on installed paths,
    // PICA_LIBRARY_DESKTOP_HOME, user HOME, app profiles, or source accounts.
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(),
        'pica-v050-history-qa-'))
    const tempRoot = fs.realpathSync.native(os.tmpdir())
    const canonicalRoot = fs.realpathSync.native(sandbox)
    check(path.dirname(canonicalRoot).toLowerCase() === tempRoot.toLowerCase(),
        'SYNTHETIC_ROOT_ESCAPED')
    try {
        fs.writeFileSync(path.join(sandbox, V050_HISTORY_QA_MARKER),
            V050_HISTORY_QA_MARKER_TEXT, {flag: 'wx', mode: 0o600})
        const profile = path.join(sandbox, 'profile')
        const dataDir = path.join(profile, 'data')
        const configDir = path.join(profile, 'config')
        fs.mkdirSync(dataDir, {recursive: true, mode: 0o700})
        fs.mkdirSync(configDir, {recursive: true, mode: 0o700})
        const dbFile = path.join(dataDir, 'library.db')
        const configFile = path.join(configDir, 'config.json')
        const fakeCredentials = path.join(configDir, 'credentials.dat')
        const mediaDir = path.join(dataDir, 'downloaded')
        fs.mkdirSync(mediaDir, {recursive: true, mode: 0o700})
        const mediaFile = path.join(mediaDir, 'pica-fixture-page.png')
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=', 'base64')
        fs.writeFileSync(mediaFile, png, {flag: 'wx', mode: 0o600})

        // This is the ACTUAL release implementation. The synthetic login is
        // held only in memory; no real DPAPI, account authentication or network.
        const build = releaseConfig.buildConfig({
            account: 'synthetic-fixture@invalid.example', password: 'fixture-only',
            libraryDirectory: dataDir, profile: 'balanced'
        })
        check(!('externalSources' in build.config) &&
            !('mobileBridgeEnabled' in build.config) &&
            !('readerSettings' in build.config), 'NOT_V050_CONFIG')
        releaseConfig.saveConfig(configFile, build.config)
        check(releaseConfig.loadConfig(configFile)?.schemaVersion === 1,
            'RELEASE_CONFIG_ROUNDTRIP')
        fs.writeFileSync(fakeCredentials,
            Buffer.from('OPAQUE_SYNTHETIC_SECRET_NOT_A_REAL_DPAPI_BLOB'),
            {flag: 'wx', mode: 0o600})

        const comicId = 'v050:synthetic:comic-01'
        const episodeId = 'v050:synthetic:episode-01'
        const pictureId = 'v050:synthetic:picture-01'
        const db = new releaseDb.LibraryDatabase(dbFile)
        try {
            db.importFavorites([{
                comicId, title: 'Synthetic v0.5 release work',
                author: 'Synthetic Author', categories: ['QA'], tags: ['fixture'],
                finished: false, pagesCount: 1, epsCount: 1
            }], 'fixture:release-import', true, true)
            db.upsertEpisode({id: episodeId, comicId, title: 'Synthetic chapter', order: 1})
            db.upsertPicture({id: pictureId, comicId, episodeId, position: 1,
                originalName: 'pica-fixture-page.png', mediaPath: 'synthetic/1',
                fileServer: 'invalid.example'})
            db.markPictureDownloaded(pictureId, mediaFile, png.length, hash(png))
            const shelf = db.createShelf('Old release synthetic shelf')
            const shelfChange = db.addShelfItems(shelf.id, [comicId]) as
                {added: number}
            check(shelfChange.added === 1, 'LEGACY_SHELF_OPERATION_FAILED')
            db.saveReadingProgress(comicId, episodeId, 0)
        } finally {
            db.close()
        }
        absentSQLiteSidecars(dbFile)
        const protectedFiles = [configFile, dbFile, fakeCredentials, mediaFile]
        const before = protectedFiles.map(fingerprint)
        const positive = resultStatus(sandbox, 'QUALIFIED_SYNTHETIC_RELEASE_LAYOUT')
        check(positive.expectedSchemaVersion === 14 &&
            positive.verifiedTableCount === 11 &&
            positive.legacySourcePolicyFieldAbsent === true,
            'RELEASE_SCHEMA_NOT_QUALIFIED')
        check(JSON.stringify(positive).indexOf('OPAQUE_SYNTHETIC_SECRET') < 0,
            'SECRET_LEAK')
        check(JSON.stringify(before) === JSON.stringify(protectedFiles.map(fingerprint)),
            'READ_ONLY_GATE_MODIFIED_SOURCE')
        absentSQLiteSidecars(dbFile)

        // Original release code supports all three download profiles. Validate
        // those shapes with the current read-only gate, not new config builders.
        for (const legacyProfile of ['conservative', 'fast'] as const) {
            const alternate = releaseConfig.buildConfig({
                account: 'synthetic-fixture@invalid.example',
                password: 'fixture-only', libraryDirectory: dataDir,
                profile: legacyProfile
            })
            releaseConfig.saveConfig(configFile, alternate.config)
            resultStatus(sandbox, 'QUALIFIED_SYNTHETIC_RELEASE_LAYOUT')
        }
        const oldProxy = releaseConfig.buildConfig({
            account: 'synthetic-fixture@invalid.example',
            password: 'fixture-only', libraryDirectory: dataDir,
            profile: 'balanced', proxyUrl: 'https://proxy.invalid'
        })
        releaseConfig.saveConfig(configFile, oldProxy.config)
        resultStatus(sandbox, 'QUALIFIED_SYNTHETIC_RELEASE_LAYOUT')
        // The normal baseline must be restored before the negative cases.
        releaseConfig.saveConfig(configFile, build.config)

        // The same release-created fixture must fail closed when edited to
        // refer to an external/custom library; never open that target.
        const originalConfig = fs.readFileSync(configFile)
        const unconsented = path.join(os.tmpdir(),
            'pica-v050-foreign-nonexistent-' + path.basename(sandbox))
        check(!fs.existsSync(unconsented), 'EXTERNAL_TEST_LOCATION_NOT_EMPTY')
        try {
            const sourceConfig = JSON.parse(originalConfig.toString('utf8')) as
                Record<string, unknown>
            fs.writeFileSync(configFile, JSON.stringify({
                ...sourceConfig, libraryDirectory: unconsented
            }))
            resultStatus(sandbox, 'REVIEW_REQUIRED',
                'LIBRARY_REFERENCE_REQUIRES_CONSENT')
            check(!fs.existsSync(unconsented), 'EXTERNAL_PATH_ACCESSED')
            fs.writeFileSync(configFile, JSON.stringify({
                ...sourceConfig, externalSources: {schemaVersion: 1,
                    revision: 0, enabled: ['pica']}
            }))
            resultStatus(sandbox, 'REVIEW_REQUIRED',
                'POST_RELEASE_FIELDS_PRESENT')
            // The release's own loadConfig accepted omitted GUI preferences,
            // even though its buildConfig normally wrote them. We keep these
            // unusual on-disk states at REVIEW_REQUIRED rather than guessing.
            const noUiFields = {...sourceConfig}
            delete noUiFields.openBrowser
            delete noUiFields.preferredPort
            fs.writeFileSync(configFile, JSON.stringify(noUiFields))
            check(releaseConfig.loadConfig(configFile) !== null,
                'OFFICIAL_CONFIG_LOADS_OPTIONAL_GUI_FIELDS')
            resultStatus(sandbox, 'REVIEW_REQUIRED',
                'CONFIG_SHAPE_REQUIRES_REVIEW')
        } finally {
            fs.writeFileSync(configFile, originalConfig)
        }
        resultStatus(sandbox, 'QUALIFIED_SYNTHETIC_RELEASE_LAYOUT')
        // Separate non-mutating preflight denial paths: old lock and WAL
        // markers must not be deleted or interpreted as offline-ready.
        const runtime = path.join(profile, 'runtime-state')
        fs.mkdirSync(runtime, {recursive: true, mode: 0o700})
        const lock = path.join(runtime, 'instance.lock')
        fs.writeFileSync(lock, 'synthetic-locked-instance', {flag: 'wx'})
        resultStatus(sandbox, 'BLOCKED', 'DESKTOP_INSTANCE_LOCK_PRESENT')
        check(fs.readFileSync(lock, 'utf8') === 'synthetic-locked-instance',
            'LOCK_WAS_REMOVED')
        fs.unlinkSync(lock)
        const wal = dbFile + '-wal'
        fs.writeFileSync(wal, 'synthetic-pending-WAL-not-a-valid-database',
            {flag: 'wx'})
        resultStatus(sandbox, 'REVIEW_REQUIRED', 'SQLITE_SIDECAR_PRESENT')
        check(fs.readFileSync(wal, 'utf8') ===
            'synthetic-pending-WAL-not-a-valid-database',
            'WAL_MARKER_CHANGED')
        fs.unlinkSync(wal)
        const final = resultStatus(sandbox,
            'QUALIFIED_SYNTHETIC_RELEASE_LAYOUT')
        check(final.databaseSha256 === before[1].sha &&
            final.configSha256 === before[0].sha, 'FINAL_SOURCE_CONTENT_CHANGED')
        absentSQLiteSidecars(dbFile)
        const summary = {
            status: 'OFFICIAL_TAG_SYNTHETIC_INTEROPERABILITY_PASS',
            tag: 'v0.5.0',
            tagSha: V050_RELEASE_COMMIT,
            legacyImplementationExecuted: true,
            actualTaggedConfigAndSqliteUsed: true,
            scenarioCount: 9,
            historicalSchemaVersion: 14,
            sourceDataUntouchedAfterReadOnlyGate: true,
            externalLibraryInspected: false,
            productionMigrationAuthorized: false,
            realUserProfileTouched: false,
            secretsRead: false,
            artifactPublished: false
        }
        process.stdout.write(JSON.stringify(summary) + '\n')
    } finally {
        // Exclusively remove our own mkdtemp fixture; never touch the release
        // checkout, any installed app or an unrelated file-tree.
        fs.rmSync(sandbox, {recursive: true, force: true,
            maxRetries: 15, retryDelay: 100})
    }
}
main().catch(() => {
    // Do not print path, config, synthetic credentials or stack from dynamic
    // release modules. The CI job result is the unambiguous failure signal.
    process.stderr.write('OFFICIAL_TAG_SYNTHETIC_INTEROPERABILITY_FAIL\n')
    process.exitCode = 1
})
