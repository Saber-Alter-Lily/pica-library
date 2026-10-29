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
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { qualifyV050HistoricalFixtureReadOnly, V050_HISTORY_QA_MARKER, V050_HISTORY_QA_MARKER_TEXT } from '../../src/desktop/v050-historical-fixture-gate'

const RELEASE_COMMIT = 'bec7f9f31828e8c57e0a2c103b6b1206c22c37cf'
const RELEASE_BLOBS = {
    'src/library/database.ts': '649f19b65ca67996b934b9e15535135f8889b96f',
    'src/desktop/config.ts': '58792d6f15315b6000cd28db20319132f5bba91b',
    'src/desktop/types.ts': 'e63de26c3a592542ea1b0efc0c06b0fd50c70e72',
    'src/desktop/paths.ts': 'f4cf5e3f6bf3d5b9603dbbcc295d8ff58659ae8d',
    'src/storage/sqlite/migrations.ts': '4a98683fb29feec31970d3958385968f65af6365'
} as const

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
const gitBlob = (bytes: Buffer) =>
    createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0'))
        .update(bytes).digest('hex')
const isWin = process.platform === 'win32'
function check(condition: unknown, label: string): asserts condition {
    if (!condition) throw new Error('V050_RELEASE_FIXTURE_' + label)
}
function fixedCheckout() {
    check(process.env.GITHUB_ACTIONS === 'true' &&
        process.env.GITHUB_REPOSITORY === 'Saber-Alter-Lily/pica-library',
        'CI_ONLY')
    const project = fs.realpathSync.native(process.cwd())
    const checkout = path.join(project, 'release-v050')
    const st = fs.lstatSync(checkout, {throwIfNoEntry: false})
    check(st?.isDirectory() && !st.isSymbolicLink(), 'RELEASE_CHECKOUT_MISSING')
    const real = fs.realpathSync.native(checkout)
    check(path.dirname(real).toLowerCase() === project.toLowerCase(),
        'RELEASE_CHECKOUT_NOT_OWNED')
    const rev = execFileSync('git', ['-C', real, 'rev-parse', 'HEAD'],
        {encoding: 'utf8'}).trim()
    check(rev === RELEASE_COMMIT, 'RELEASE_COMMIT_MISMATCH')
    const modified = execFileSync('git', ['-C', real, 'status', '--porcelain'],
        {encoding: 'utf8'}).trim()
    check(modified === '', 'RELEASE_TREE_DIRTY')
    for (const [name, sha] of Object.entries(RELEASE_BLOBS)) {
        const actual = gitBlob(fs.readFileSync(path.join(real, ...name.split('/'))))
        check(actual === sha, 'RELEASE_BLOB_MISMATCH')
    }
    return real
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
    const source = fixedCheckout()
    const releaseDb = await import(pathToFileURL(path.join(source,
        'src/library/database.ts')).href) as unknown as {
        LibraryDatabase: new (file: string) => ReleaseDatabase
    }
    const releaseConfig = await import(pathToFileURL(path.join(source,
        'src/desktop/config.ts')).href) as unknown as {
        buildConfig(input: {account: string; password: string;
            libraryDirectory: string; profile: 'balanced'}): {config: ReleaseConfig}
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
        } finally {
            fs.writeFileSync(configFile, originalConfig)
        }
        resultStatus(sandbox, 'QUALIFIED_SYNTHETIC_RELEASE_LAYOUT')
        const summary = {
            status: 'OFFICIAL_TAG_SYNTHETIC_INTEROPERABILITY_PASS',
            tag: 'v0.5.0',
            tagSha: RELEASE_COMMIT,
            legacyImplementationExecuted: true,
            actualTaggedConfigAndSqliteUsed: true,
            scenarioCount: 3,
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
