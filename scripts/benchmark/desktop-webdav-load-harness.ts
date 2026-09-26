import { createRequire } from 'node:module'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { RemoteStorageDesktopManager } from '../../src/remote-storage/desktop-manager'
import { RuntimeResourceCoordinator } from '../../src/runtime/resource-coordinator'
import type { StoredCredentials } from '../../src/desktop/types'
import {
    runHttpLatencyScenario,
    type ScenarioOptions
} from './http-latency-scenario'

interface J9Options {
    rounds: number
    iterations: number
    warmup: number
    intervalMs: number
    waitTimeoutMs: number
    pages: number
    bytesPerPage: number
    requestDelayMs: number
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

function options(args = process.argv.slice(2)): J9Options {
    const map = values(args)
    return {
        rounds: integer(map, 'rounds', 3),
        iterations: integer(map, 'iterations', 10),
        warmup: integer(map, 'warmup', 2, 0),
        intervalMs: integer(map, 'interval-ms', 25, 0),
        waitTimeoutMs: integer(map, 'wait-timeout-ms', 15_000, 100),
        pages: integer(map, 'pages', 320),
        bytesPerPage: integer(map, 'bytes-per-page', 16 * 1024, 1024),
        requestDelayMs: integer(map, 'request-delay-ms', 25, 0),
        output: map.get('output')?.trim() || null
    }
}

function desktopController() {
    return {
        csrfToken: 'j9-local-webdav-fixture-csrf',
        configured: () => true,
        status: () => ({ benchmarkFixture: 'p2-j9-local-webdav-load' }),
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
        throw new Error('Could not allocate a local WebDAV fixture port')
    const port = address.port
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
    )
    return port
}

function seedDownloadedComic(
    database: LibraryDatabase,
    root: string,
    pages: number,
    bytesPerPage: number
) {
    const comicId = 'j9-webdav-comic'
    const episodeId = 'j9-webdav-episode'
    database.importFavorites(
        [
            {
                comicId,
                title: 'J9 WebDAV Controlled Load',
                author: 'P2 J9 Fixture',
                description: 'Local WebDAV foreground-latency fixture',
                categories: ['benchmark'],
                tags: ['p2-j9', 'webdav'],
                finished: true,
                updatedAt: '2026-09-26T00:00:00.000Z'
            }
        ],
        'benchmark:j9',
        true,
        true
    )
    database.upsertEpisode({
        id: episodeId,
        comicId,
        title: 'Controlled WebDAV Sync',
        order: 1
    })

    const payload = Buffer.alloc(bytesPerPage, 0x4a)
    for (let index = 0; index < pages; index += 1) {
        const pictureId = `j9-webdav-page-${index + 1}`
        const local = path.join(
            root,
            'benchmark-pages',
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
            `j9-${index + 1}`
        )
    }
    return { comicId, episodeId }
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

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-j9-webdav-load-'))
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    const coordinator = new RuntimeResourceCoordinator({ mode: 'observe' })
    const service = new LibraryService(
        database,
        root,
        undefined,
        undefined,
        coordinator
    )
    seedDownloadedComic(database, root, config.pages, config.bytesPerPage)

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
    const requestEvents: Array<{ at: number; method: string }> = []
    const webdavServer = new webdav.WebDAVServer({
        port,
        hostname: '127.0.0.1'
    })
    webdavServer.beforeRequest((context, next) => {
        requestEvents.push({
            at: Date.now(),
            method: String(context.request?.method ?? 'UNKNOWN').toUpperCase()
        })
        if (config.requestDelayMs) setTimeout(next, config.requestDelayMs)
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
    try {
        const saved = manager.save({
            createNewTarget: true,
            remoteStorage: {
                kind: 'webdav',
                vendor: 'generic',
                label: 'J9 Local WebDAV Fixture',
                baseUrl: `http://127.0.0.1:${port}`,
                root: 'PicaLibrary'
            }
        }) as { targetId: string }

        syncPromise = manager.sync({ remoteTargetId: saved.targetId })
        const scenario: ScenarioOptions = {
            baseUrl: started.url,
            mode: 'load',
            tasks: ['remote-storage-sync'],
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
                'J2 rejected one or more WebDAV active-load measurement windows'
            )

        const requestsDuringWindow = requestEvents.filter(
            (event) => event.at >= measuredStart && event.at <= measuredEnd
        )
        if (!requestsDuringWindow.length)
            throw new Error(
                'J9 measurement window contained no real local WebDAV requests'
            )

        const sync = await syncPromise
        const methodCounts = Object.fromEntries(
            [...new Set(requestEvents.map((event) => event.method))]
                .sort()
                .map((method) => [
                    method,
                    requestEvents.filter((event) => event.method === method).length
                ])
        )
        const measuredMethodCounts = Object.fromEntries(
            [...new Set(requestsDuringWindow.map((event) => event.method))]
                .sort()
                .map((method) => [
                    method,
                    requestsDuringWindow.filter((event) => event.method === method)
                        .length
                ])
        )

        const output = {
            benchmark: 'desktop-webdav-foreground-latency-p2-j9',
            warning:
                'Controlled local WebDAV workload. This measures foreground API responsiveness while the real RemoteStorageDesktopManager sync path is active; it is not hosted-provider throughput evidence and defines no release budget.',
            environment: {
                node: process.version,
                platform: process.platform,
                arch: process.arch
            },
            fixture: {
                localOnly: true,
                serverPackage: 'webdav-server',
                serverVersion: '2.6.2',
                providerNetworkUsed: false,
                resourceTaskType: 'remote-storage-sync',
                pages: config.pages,
                bytesPerPage: config.bytesPerPage,
                requestDelayMs: config.requestDelayMs,
                totalWebDavRequests: requestEvents.length,
                webDavRequestsDuringMeasuredWindow: requestsDuringWindow.length,
                methodCounts,
                measuredMethodCounts
            },
            sync: {
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
        if (syncPromise) {
            const status = manager.status().syncProgress as { state?: string }
            if (
                status.state === 'running' ||
                status.state === 'pausing' ||
                status.state === 'paused'
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
