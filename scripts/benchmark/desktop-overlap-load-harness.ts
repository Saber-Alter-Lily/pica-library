import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { Pica } from '../../src/sdk'
import type { StoredCredentials } from '../../src/desktop/types'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { RemoteStorageDesktopManager } from '../../src/remote-storage/desktop-manager'
import { RuntimeResourceCoordinator } from '../../src/runtime/resource-coordinator'
import {
    runHttpLatencyScenario,
    type ScenarioOptions
} from './http-latency-scenario'

interface Options {
    rounds: number
    iterations: number
    warmup: number
    intervalMs: number
    waitTimeoutMs: number
    downloadPages: number
    chunksPerPage: number
    chunkDelayMs: number
    bytesPerChunk: number
    webdavPages: number
    webdavBytesPerPage: number
    webdavRequestDelayMs: number
    output: string | null
}

function values(args = process.argv.slice(2)) {
    const result = new Map<string, string>()
    for (let index = 0; index < args.length; index += 1) {
        const token = args[index]
        if (!token.startsWith('--')) continue
        const separator = token.indexOf('=')
        if (separator >= 0) {
            result.set(token.slice(2, separator), token.slice(separator + 1))
            continue
        }
        const next = args[index + 1]
        if (next && !next.startsWith('--')) {
            result.set(token.slice(2), next)
            index += 1
        } else result.set(token.slice(2), 'true')
    }
    return result
}

function integer(
    map: Map<string, string>,
    key: string,
    fallback: number,
    minimum = 1
) {
    const raw = map.get(key)
    if (raw === undefined) return fallback
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed < minimum)
        throw new Error(`--${key} must be an integer >= ${minimum}`)
    return parsed
}

function options(args = process.argv.slice(2)): Options {
    const map = values(args)
    return {
        rounds: integer(map, 'rounds', 3),
        iterations: integer(map, 'iterations', 10),
        warmup: integer(map, 'warmup', 2, 0),
        intervalMs: integer(map, 'interval-ms', 25, 0),
        waitTimeoutMs: integer(map, 'wait-timeout-ms', 20_000, 100),
        downloadPages: integer(map, 'download-pages', 180),
        chunksPerPage: integer(map, 'chunks-per-page', 4),
        chunkDelayMs: integer(map, 'chunk-delay-ms', 20, 0),
        bytesPerChunk: integer(map, 'bytes-per-chunk', 16 * 1024, 1024),
        webdavPages: integer(map, 'webdav-pages', 360),
        webdavBytesPerPage: integer(map, 'webdav-bytes-per-page', 12 * 1024, 1024),
        webdavRequestDelayMs: integer(map, 'webdav-request-delay-ms', 25, 0),
        output: map.get('output')?.trim() || null
    }
}

function desktopController() {
    return {
        csrfToken: 'j11-overlap-fixture-csrf',
        configured: () => true,
        status: () => ({ benchmarkFixture: 'p2-j11-overlap-load' }),
        save: async () => ({}),
        testConnection: async () => ({}),
        chooseFolder: async () => null,
        exportBrowserLitePackage: async () => ({}),
        openDirectory: async () => {},
        shutdown: () => {}
    }
}

async function closeServer(server: import('node:http').Server) {
    server.closeIdleConnections()
    await new Promise<void>((resolve) => {
        let finished = false
        const done = () => {
            if (finished) return
            finished = true
            resolve()
        }
        server.close(done)
        setTimeout(() => {
            server.closeAllConnections()
            done()
        }, 1000).unref()
    })
}

async function freePort() {
    const server = net.createServer()
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string')
        throw new Error('Could not allocate local WebDAV port')
    const port = address.port
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
    )
    return port
}

function seedRemoteSource(
    database: LibraryDatabase,
    root: string,
    pages: number,
    bytesPerPage: number
) {
    const comicId = 'j11-webdav-comic'
    const episodeId = 'j11-webdav-episode'
    database.importFavorites(
        [
            {
                comicId,
                title: 'J11 WebDAV overlap source',
                author: 'P2 J11 Fixture',
                description: 'Pre-downloaded WebDAV overlap source',
                categories: ['benchmark'],
                tags: ['p2-j11', 'webdav'],
                finished: true,
                updatedAt: '2026-09-26T00:00:00.000Z'
            }
        ],
        'benchmark:j11-webdav',
        true,
        true
    )
    database.upsertEpisode({
        id: episodeId,
        comicId,
        title: 'WebDAV overlap chapter',
        order: 1
    })

    const payload = Buffer.alloc(bytesPerPage, 0x57)
    for (let index = 0; index < pages; index += 1) {
        const pictureId = `j11-webdav-page-${index + 1}`
        const local = path.join(
            root,
            'j11-webdav-pages',
            `${String(index + 1).padStart(4, '0')}.jpg`
        )
        fs.mkdirSync(path.dirname(local), { recursive: true })
        fs.writeFileSync(local, payload)
        database.upsertPicture({
            id: pictureId,
            comicId,
            episodeId,
            position: index + 1,
            originalName: path.basename(local),
            mediaPath: path.basename(local),
            fileServer: 'https://fixture.invalid'
        })
        database.markPictureDownloaded(
            pictureId,
            local,
            payload.byteLength,
            `j11-webdav-${index + 1}`
        )
    }
    return comicId
}

async function waitForDownloadTerminal(
    service: LibraryService,
    database: LibraryDatabase,
    jobId: string,
    timeoutMs = 45_000
) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const job = database.getDownloadJob(jobId)
        if (
            job.status === 'COMPLETED' ||
            job.status === 'FAILED' ||
            job.status === 'CANCELLED'
        )
            return job
        await delay(25)
    }
    await service.quiesceLocalDownloads(2_000).catch(() => undefined)
    throw new Error('Timed out waiting for J11 download fixture')
}

async function main() {
    const config = options()
    const toolRoot = process.env.PICA_WEBDAV_TOOL_ROOT
    if (!toolRoot)
        throw new Error(
            'PICA_WEBDAV_TOOL_ROOT is required; use scripts/run-desktop-webdav-load-harness.mjs'
        )

    const requireFromTool = createRequire(path.join(toolRoot, 'package.json'))
    const loaded = requireFromTool('webdav-server') as {
        v2: {
            WebDAVServer: new (options?: Record<string, unknown>) => {
                beforeRequest(
                    listener: (
                        context: { request?: { method?: string } },
                        next: () => void
                    ) => void
                ): void
                start(callback: () => void): void
                stop(callback: () => void): void
            }
        }
    }
    const webdav = loaded.v2
    if (!webdav?.WebDAVServer)
        throw new Error('Temporary webdav-server tool did not expose v2.WebDAVServer')

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-j11-overlap-'))
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    const coordinator = new RuntimeResourceCoordinator({ mode: 'observe' })

    const downloadWrites: number[] = []
    let downloadBytesWritten = 0
    const chunk = Buffer.alloc(config.bytesPerChunk, 0x44)
    const provider = {
        comicInfo: async () => ({
            _id: 'j11-download-comic',
            title: 'J11 active download',
            author: 'P2 J11 Fixture',
            description: 'Controlled overlapping LOCAL download',
            chineseTeam: '',
            categories: ['benchmark'],
            tags: ['p2-j11', 'download'],
            finished: false,
            allowDownload: true
        }),
        episodesAll: async () => [
            {
                id: 'j11-download-episode',
                _id: 'j11-download-episode',
                title: 'Download overlap chapter',
                order: 1,
                updated_at: '2026-09-26T00:00:00.000Z'
            }
        ],
        picturesAll: async () =>
            Array.from({ length: config.downloadPages }, (_, index) => ({
                id: `j11-download-page-${index + 1}`,
                name: `${String(index + 1).padStart(4, '0')}.jpg`,
                url: `https://fixture.invalid/j11-download/${index + 1}.jpg`,
                media: {
                    path: `j11-download/${index + 1}.jpg`,
                    fileServer: 'https://fixture.invalid',
                    originalName: `${index + 1}.jpg`
                }
            })),
        downloadToFile: async (_url: string, output: string) => {
            await fs.promises.mkdir(path.dirname(output), { recursive: true })
            await fs.promises.writeFile(output, Buffer.alloc(0))
            const hash = createHash('sha256')
            let bytes = 0
            for (let index = 0; index < config.chunksPerPage; index += 1) {
                if (config.chunkDelayMs) await delay(config.chunkDelayMs)
                await fs.promises.appendFile(output, chunk)
                hash.update(chunk)
                bytes += chunk.byteLength
                downloadBytesWritten += chunk.byteLength
                downloadWrites.push(Date.now())
            }
            return { bytes, sha256: hash.digest('hex') }
        }
    } as unknown as Pica

    const service = new LibraryService(
        database,
        root,
        provider,
        undefined,
        coordinator
    )
    seedRemoteSource(
        database,
        root,
        config.webdavPages,
        config.webdavBytesPerPage
    )

    const started = await (
        await import('../../src/library/server')
    ).startLibraryServer({
        database,
        service,
        host: '127.0.0.1',
        port: 0,
        desktop: desktopController()
    })

    const port = await freePort()
    const webdavEvents: Array<{ at: number; method: string }> = []
    const webdavServer = new webdav.WebDAVServer({
        port,
        hostname: '127.0.0.1'
    })
    webdavServer.beforeRequest((context, next) => {
        webdavEvents.push({
            at: Date.now(),
            method: String(context.request?.method ?? 'UNKNOWN').toUpperCase()
        })
        if (config.webdavRequestDelayMs)
            setTimeout(next, config.webdavRequestDelayMs)
        else next()
    })
    await new Promise<void>((resolve) => webdavServer.start(resolve))

    let storedCredentials: StoredCredentials | null = null
    const credentialStore = {
        load: () => storedCredentials,
        save: (value: StoredCredentials) => {
            storedCredentials = value
        }
    }
    const manager = new RemoteStorageDesktopManager(
        path.join(root, 'remote-storage.json'),
        credentialStore,
        storedCredentials,
        database,
        root,
        (value) => {
            storedCredentials = value
        },
        coordinator
    )

    let syncPromise: Promise<Record<string, unknown>> | null = null
    let downloadJobId = ''
    try {
        const saved = manager.save({
            createNewTarget: true,
            remoteStorage: {
                kind: 'webdav',
                vendor: 'generic',
                label: 'J11 Local WebDAV Fixture',
                baseUrl: `http://127.0.0.1:${port}`,
                root: 'PicaLibrary'
            }
        }) as { targetId: string }

        // selectedComics() runs before the first await in sync(), so the
        // WebDAV workload is frozen to the pre-downloaded fixture before the
        // concurrently downloaded comic is enqueued.
        syncPromise = manager.sync({ remoteTargetId: saved.targetId })

        const job = service.enqueueDownload({ comicId: 'j11-download-comic' })
        downloadJobId = job.id
        const queue = service.startLocalDownloadQueue({
            profile: 'custom',
            custom: {
                jobConcurrency: 1,
                globalMediaConcurrency: 1,
                requestIntervalMs: 0,
                maxRetries: 0
            }
        })
        if (!queue.started) throw new Error('J11 LOCAL download queue did not start')

        const scenario: ScenarioOptions = {
            baseUrl: started.url,
            mode: 'load',
            tasks: ['local-download-runner', 'remote-storage-sync'],
            rounds: config.rounds,
            iterations: config.iterations,
            warmup: config.warmup,
            intervalMs: config.intervalMs,
            waitTimeoutMs: config.waitTimeoutMs
        }

        const measuredStart = Date.now()
        const foreground = await runHttpLatencyScenario(scenario)
        const measuredEnd = Date.now()

        if (foreground.rounds.some((round) => !round.valid))
            throw new Error(
                'J2 rejected one or more J11 overlapping-load measurement windows'
            )

        const writesDuringWindow = downloadWrites.filter(
            (timestamp) => timestamp >= measuredStart && timestamp <= measuredEnd
        )
        const webdavDuringWindow = webdavEvents.filter(
            (event) => event.at >= measuredStart && event.at <= measuredEnd
        )
        if (!writesDuringWindow.length)
            throw new Error(
                'J11 measured window contained no real LOCAL download file writes'
            )
        if (!webdavDuringWindow.length)
            throw new Error(
                'J11 measured window contained no real local WebDAV requests'
            )

        const [sync, terminal] = await Promise.all([
            syncPromise,
            waitForDownloadTerminal(service, database, job.id)
        ])
        if (terminal.status !== 'COMPLETED')
            throw new Error(
                `J11 download fixture ended in ${terminal.status}: ${terminal.error ?? 'unknown'}`
            )
        if (Array.isArray(sync.issues) && sync.issues.length)
            throw new Error(
                `J11 WebDAV fixture completed with ${sync.issues.length} issue(s)`
            )

        const webdavMethodCounts = Object.fromEntries(
            [...new Set(webdavDuringWindow.map((event) => event.method))]
                .sort()
                .map((method) => [
                    method,
                    webdavDuringWindow.filter((event) => event.method === method)
                        .length
                ])
        )

        const output = {
            benchmark: 'desktop-overlap-foreground-latency-p2-j11',
            warning:
                'Controlled local overlap of the real LOCAL DownloadScheduler and RemoteStorageDesktopManager WebDAV sync. This is contention-regression evidence only; no provider-throughput or P2-K budget claim is made.',
            environment: {
                node: process.version,
                platform: process.platform,
                arch: process.arch
            },
            overlap: {
                expectedTaskTypes: [
                    'local-download-runner',
                    'remote-storage-sync'
                ],
                allForegroundWindowsValid: true,
                downloadWritesDuringMeasuredWindow: writesDuringWindow.length,
                webDavRequestsDuringMeasuredWindow: webdavDuringWindow.length,
                measuredWebDavMethodCounts: webdavMethodCounts
            },
            download: {
                status: terminal.status,
                completed: terminal.progressCompleted,
                total: terminal.progressTotal,
                bytes: terminal.bytes,
                totalFixtureBytesWritten: downloadBytesWritten
            },
            webdav: {
                completed: true,
                issueCount: Array.isArray(sync.issues) ? sync.issues.length : null,
                uploadedObjects:
                    typeof sync.uploadedObjects === 'number'
                        ? sync.uploadedObjects
                        : null,
                uploadedBytes:
                    typeof sync.uploadedBytes === 'number'
                        ? sync.uploadedBytes
                        : null
            },
            foreground
        }

        const serialized = JSON.stringify(output, null, 2)
        if (config.output) {
            const target = path.resolve(config.output)
            fs.mkdirSync(path.dirname(target), { recursive: true })
            fs.writeFileSync(target, serialized + '\n', 'utf8')
        }
        console.log(serialized)
    } finally {
        if (downloadJobId && service.localDownloadRuntime().running)
            await service.quiesceLocalDownloads(2_000).catch(() => undefined)
        if (syncPromise) {
            const state = (manager.status().syncProgress as { state?: string }).state
            if (
                state === 'running' ||
                state === 'pausing' ||
                state === 'paused'
            )
                manager.syncControl('cancel')
            await syncPromise.catch(() => undefined)
        }
        await new Promise<void>((resolve) => webdavServer.stop(resolve))
        await closeServer(started.server)
        database.close()
        fs.rmSync(root, { recursive: true, force: true })
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
