/**
 * Deliberately opt-in, SOURCE-FREE Desktop boot prototype. Unlike the legacy
 * src/desktop/main.ts this executable does not import LibraryService,
 * ProviderService, SourceRuntime, Host, any Pica/E-H/JM SDK or updater.
 *
 * Until v0.5.0 profile migration and production launcher are independently
 * accepted, it refuses ALL installed/user roots and can serve only a freshly
 * initialized, sentinel-owned OS-temp library with the original, hash-verified
 * full Web. This is NOT a release binary or a default Desktop entrypoint.
 */
import fs from 'node:fs'
import path from 'node:path'
import { LibraryDatabase } from '../library/database'
import { createCoreLocalRuntime } from '../library/core-runtime-composition'
import { startOfflineCoreHttp } from '../offline-core/qa-http'
import { assertTemporaryCorePreviewRoot } from '../offline-core/qa-ownership'
import { InstanceLock } from './instance'

function previewRoot(argv: string[]) {
    if (argv.length !== 3 || argv[0] !== '--owned-temp-root' ||
        argv[2] !== '--explicit-preview-only')
        throw new Error('Explicit owned temporary root and preview-only consent required')
    return assertTemporaryCorePreviewRoot(argv[1])
}
async function runCoreDesktopPreview(
    argv: string[] = process.argv.slice(2),
    entryFile: string = process.argv[1]
) {
    const root = previewRoot(argv)
    const webRoot = path.join(path.dirname(path.resolve(entryFile)), 'web')
    // A real full-page app is required. Never silently fall back to the
    // Reader-only QA shell or load a user-selected arbitrary Web directory.
    const fullManifest = path.join(webRoot, 'full-web-qa-manifest.json')
    const manifest = fs.lstatSync(fullManifest, { throwIfNoEntry: false })
    if (!manifest?.isFile() || manifest.isSymbolicLink() ||
        manifest.nlink !== 1)
        throw new Error('Original full Web QA manifest is required')
    const lock = new InstanceLock(
        path.join(root, 'runtime-state', 'core-preview.lock'),
        path.join(root, 'runtime-state', 'core-preview-instance.json'),
        { recoverStale: false }
    )
    if (!lock.acquire())
        throw new Error('Another owned core-only preview is already running')
    let database: LibraryDatabase | undefined
    let running: Awaited<ReturnType<typeof startOfflineCoreHttp>> | undefined
    try {
        database = new LibraryDatabase(path.join(root, 'library.db'))
        const coreRuntime = createCoreLocalRuntime({
            database, dataDir: root
            // Deliberately no Desktop OS opener and no sources.
        })
        running = await startOfflineCoreHttp({
            database,
            reader: coreRuntime.readerService,
            coreRuntime,
            webRoot
        })
        lock.publish(running.url)
        process.stdout.write(JSON.stringify({
            status: 'CORE_DESKTOP_PREVIEW_QA_ONLY',
            url: running.url,
            sourceCount: 0,
            userProfileOpened: false,
            defaultDesktopReplaced: false,
            publishAuthorized: false
        }) + '\n')
        await new Promise<void>(resolve => {
            process.once('SIGINT', () => resolve())
            process.once('SIGTERM', () => resolve())
        })
    } finally {
        try {
            await running?.close()
        } finally {
            try {
                database?.close()
            } finally {
                lock.release()
            }
        }
    }
}

// Explicit CLI. Importing the pure function for tests must not start a server.
if (process.argv[1] &&
    /(?:^|[/\\])desktop-core-preview\.(?:mjs|js)$/.test(process.argv[1]))
    void runCoreDesktopPreview().catch(error => {
        process.stderr.write('CORE_DESKTOP_PREVIEW_REJECTED: ' +
            (error instanceof Error ? error.message : String(error)) + '\n')
        process.exitCode = 1
    })
