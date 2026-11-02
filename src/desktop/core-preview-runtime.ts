/**
 * Reusable SOURCE-FREE Desktop composition for isolated QA candidates. Unlike the legacy
 * src/desktop/main.ts this executable does not import LibraryService,
 * ProviderService, SourceRuntime, Host, any Pica/E-H/JM SDK or updater.
 *
 * The existing OS-temp QA preview remains unchanged. A separately opted-in
 * Windows local-only mode uses its own persistent, marked profile and never
 * migrates or opens the installed v0.5.0 profile. Neither is a formal release
 * or the default Desktop entrypoint.
 */
import fs from 'node:fs'
import path from 'node:path'
import { LibraryDatabase } from '../library/database'
import { createCoreLocalRuntime } from '../library/core-runtime-composition'
import { startOfflineCoreHttp } from '../offline-core/qa-http'
import { assertTemporaryCorePreviewRoot } from '../offline-core/qa-ownership'
import { InstanceLock } from './instance'
import { DesktopNativePicker } from './pickers'
import { openWindowsLocalProfile } from './core-local-profile'
import { launchBrowser } from './child-process'
import type { CoreLocalPicker } from '../library/core-local-import'
import type { CoreUserHostPorts } from '../offline-core/qa-http'

/** Runtime-injected optional user Host, NOT linked into default source-free bundle. */
export type CoreUserHostFactory = (root: string, database: LibraryDatabase) =>
    CoreUserHostPorts

function previewRoot(argv: string[]) {
    if (argv.length !== 3 || argv[0] !== '--owned-temp-root' ||
        argv[2] !== '--explicit-preview-only')
        throw new Error('Explicit owned temporary root and preview-only consent required')
    return assertTemporaryCorePreviewRoot(argv[1])
}
export async function runCoreDesktopPreview(
    argv: string[] = process.argv.slice(2),
    entryFile: string = process.argv[1],
    userHostFactory?: CoreUserHostFactory
) {
    // A separate, audited executable must explicitly pass this flag and an
    // app-owned factory. The existing source-free preview and CLI have none.
    const userHostRequested = argv[argv.length - 1] ===
        '--explicit-user-host-preview'
    const baseline = userHostRequested ? argv.slice(0, -1) : argv
    if (Boolean(userHostFactory) !== userHostRequested)
        throw new Error('User Host preview needs its separate explicit entrypoint')
    const persistentLocal = baseline.length === 1 &&
        baseline[0] === '--persistent-local-profile'
    // Preserve original disposable-preview validation order. The persistent
    // root is created only after a complete application Web stage is proven.
    const temporaryRoot = persistentLocal ? undefined : previewRoot(baseline)
    const webRoot = path.join(path.dirname(path.resolve(entryFile)), 'web')
    // A real full-page app is required. Never silently fall back to the
    // Reader-only QA shell or load a user-selected arbitrary Web directory.
    const fullManifest = path.join(webRoot, 'full-web-qa-manifest.json')
    const manifest = fs.lstatSync(fullManifest, { throwIfNoEntry: false })
    if (!manifest?.isFile() || manifest.isSymbolicLink() ||
        manifest.nlink !== 1)
        throw new Error('Original full Web QA manifest is required')
    const root = persistentLocal
        ? openWindowsLocalProfile()
        : temporaryRoot!
    const lock = new InstanceLock(
        path.join(root, 'runtime-state', 'core-preview.lock'),
        path.join(root, 'runtime-state', 'core-preview-instance.json'),
        { recoverStale: true }
    )
    if (!lock.acquire())
        throw new Error('Another owned core-only preview is already running')
    let database: LibraryDatabase | undefined
    let running: Awaited<ReturnType<typeof startOfflineCoreHttp>> | undefined
    let host: CoreUserHostPorts | undefined
    try {
        database = new LibraryDatabase(path.join(root, 'library.db'))
        host = userHostFactory?.(root, database)
        const coreRuntime = createCoreLocalRuntime({
            database, dataDir: root
            // Deliberately no Desktop OS opener and no sources.
        })
        // The existing native picker is the only filesystem selection
        // authority; browser requests never contain an arbitrary local path.
        const nativePicker = new DesktopNativePicker()
        const localPicker: CoreLocalPicker | undefined =
            nativePicker.status.folderPicker ? {
                configured: () => true,
                status: () => ({
                    runtime: { mode: 'interactive' },
                    platform: { runtimeFoundation: true },
                    nativePicker: {
                        folderPicker: true,
                        savePicker: nativePicker.status.savePicker
                    }
                }),
                chooseLocalComic: kind => kind === 'folder'
                    ? nativePicker.chooseFolder('选择漫画文件夹 / Choose comic folder')
                    : nativePicker.chooseComicArchive(),
                // Reuse the original OS Save As dialog for the same Reader ZIP/CBZ.
                chooseSaveArchive: nativePicker.status.savePicker
                    ? ({ format, defaultName }) => nativePicker.chooseSaveFile({
                        title: '保存漫画档案 / Save comic archive',
                        defaultName,
                        extension: format
                    })
                    : undefined
            } : undefined
        running = await startOfflineCoreHttp({
            database,
            reader: coreRuntime.readerService,
            coreRuntime,
            localPicker,
            webRoot,
            userHost: host
        })
        lock.publish(running.url)
        process.stdout.write(JSON.stringify({
            status: persistentLocal
                ? 'CORE_DESKTOP_LOCAL_DRAFT_ONLY'
                : 'CORE_DESKTOP_PREVIEW_QA_ONLY',
            url: running.url,
            sourceCount: 0,
            userHostPreview: Boolean(host),
            userProfileOpened: persistentLocal,
            legacyProfileOpened: false,
            persistentLibrary: persistentLocal,
            defaultDesktopReplaced: false,
            publishAuthorized: false
        }) + '\n')
        if (persistentLocal)
            launchBrowser(running.url, error =>
                process.stderr.write('Local-only browser launch failed: ' +
                    String(error) + '\n'))
        await new Promise<void>(resolve => {
            process.once('SIGINT', () => resolve())
            process.once('SIGTERM', () => resolve())
        })
    } finally {
        try {
            await running?.close()
            await host?.reader.close()
            host?.connections.close()
            host?.inspector.close()
        } finally {
            try {
                database?.close()
            } finally {
                lock.release()
            }
        }
    }
}

