import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { Pica } from '../../src/sdk'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import {
    runHttpLatencyScenario,
    type ScenarioOptions
} from './http-latency-scenario'

interface J7Options {
    rounds: number
    iterations: number
    warmup: number
    intervalMs: number
    waitTimeoutMs: number
    pages: number
    chunksPerPage: number
    chunkDelayMs: number
    bytesPerChunk: number
    output: string | null
}

function values(args = process.argv.slice(2)) {
    const result = new Map<string, string>()
    for (let i = 0; i < args.length; i += 1) {
        const token = args[i]
        if (!token.startsWith('--')) continue
        const split = token.indexOf('=')
        if (split >= 0) {
            result.set(token.slice(2, split), token.slice(split + 1))
            continue
        }
        const next = args[i + 1]
        if (next && !next.startsWith('--')) {
            result.set(token.slice(2), next)
            i += 1
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

function options(args = process.argv.slice(2)): J7Options {
    const map = values(args)
    return {
        rounds: integer(map, 'rounds', 3),
        iterations: integer(map, 'iterations', 10),
        warmup: integer(map, 'warmup', 2, 0),
        intervalMs: integer(map, 'interval-ms', 25, 0),
        waitTimeoutMs: integer(map, 'wait-timeout-ms', 15_000, 100),
        pages: integer(map, 'pages', 120),
        chunksPerPage: integer(map, 'chunks-per-page', 4),
        chunkDelayMs: integer(map, 'chunk-delay-ms', 20, 0),
        bytesPerChunk: integer(map, 'bytes-per-chunk', 32 * 1024, 1024),
        output: map.get('output')?.trim() || null
    }
}

function desktopController() {
    return {
        csrfToken: 'j7-local-fixture-csrf',
        configured: () => true,
        status: () => ({ benchmarkFixture: 'p2-j7-local-download-load' }),
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

async function waitForDownloadTerminal(
    service: LibraryService,
    database: LibraryDatabase,
    jobId: string,
    timeoutMs = 30_000
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
    throw new Error('Timed out waiting for J7 fixture download to finish')
}

async function main() {
    const config = options()
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-j7-download-load-'))
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    const writes: number[] = []
    let totalWritten = 0
    const chunk = Buffer.alloc(config.bytesPerChunk, 0x5a)

    const provider = {
        comicInfo: async () => ({
            _id: 'j7-load-comic',
            title: 'J7 Controlled Download Load',
            author: 'P2 J7 Fixture',
            description: 'Local controlled benchmark fixture',
            chineseTeam: '',
            categories: ['benchmark'],
            tags: ['p2-j7'],
            finished: false,
            allowDownload: true
        }),
        episodesAll: async () => [
            {
                id: 'j7-episode-1',
                _id: 'j7-episode-1',
                title: 'Controlled active transfer',
                order: 1,
                updated_at: '2026-09-26T00:00:00.000Z'
            }
        ],
        picturesAll: async () =>
            Array.from({ length: config.pages }, (_, index) => ({
                id: `j7-page-${index + 1}`,
                name: `${String(index + 1).padStart(4, '0')}.jpg`,
                url: `https://fixture.invalid/j7/${index + 1}.jpg`,
                media: {
                    path: `j7/${index + 1}.jpg`,
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
                totalWritten += chunk.byteLength
                writes.push(Date.now())
            }
            return { bytes, sha256: hash.digest('hex') }
        }
    } as unknown as Pica

    const service = new LibraryService(database, root, provider)
    const started = await (
        await import('../../src/library/server')
    ).startLibraryServer({
        database,
        service,
        host: '127.0.0.1',
        port: 0,
        desktop: desktopController()
    })

    let output: Record<string, unknown> | null = null
    let jobId = ''
    try {
        const job = service.enqueueDownload({ comicId: 'j7-load-comic' })
        jobId = job.id
        const queue = service.startLocalDownloadQueue({
            profile: 'custom',
            custom: {
                jobConcurrency: 1,
                globalMediaConcurrency: 1,
                requestIntervalMs: 0,
                maxRetries: 0
            }
        })
        if (!queue.started) throw new Error('J7 local download queue did not start')

        const scenario: ScenarioOptions = {
            baseUrl: started.url,
            mode: 'load',
            tasks: ['local-download-runner'],
            rounds: config.rounds,
            iterations: config.iterations,
            warmup: config.warmup,
            intervalMs: config.intervalMs,
            waitTimeoutMs: config.waitTimeoutMs
        }
        const measuredStart = Date.now()
        const j2 = await runHttpLatencyScenario(scenario)
        const measuredEnd = Date.now()
        const writesDuringWindow = writes.filter(
            (timestamp) =>
                timestamp >= measuredStart && timestamp <= measuredEnd
        ).length
        if (writesDuringWindow === 0)
            throw new Error(
                'J7 measurement window contained no real fixture file writes'
            )
        if (j2.rounds.some((round) => !round.valid))
            throw new Error('J2 rejected one or more active-download measurement windows')

        const terminal = await waitForDownloadTerminal(service, database, job.id)
        if (terminal.status !== 'COMPLETED')
            throw new Error(
                `J7 fixture download ended in ${terminal.status}: ${terminal.error ?? 'unknown error'}`
            )

        output = {
            benchmark: 'desktop-active-download-http-latency-p2-j7',
            warning:
                'Controlled local active-transfer fixture. This measures foreground API responsiveness under the real download scheduler/file/SQLite path; it is not Pica/provider throughput evidence and defines no release budget.',
            environment: {
                node: process.version,
                platform: process.platform,
                arch: process.arch
            },
            fixture: {
                localOnly: true,
                providerNetworkUsed: false,
                scheduler: 'DownloadScheduler',
                resourceTaskType: 'local-download-runner',
                pages: config.pages,
                chunksPerPage: config.chunksPerPage,
                bytesPerChunk: config.bytesPerChunk,
                chunkDelayMs: config.chunkDelayMs,
                totalBytesWritten: totalWritten,
                writesDuringMeasuredWindow
            },
            download: {
                status: terminal.status,
                completed: terminal.progressCompleted,
                total: terminal.progressTotal,
                bytes: terminal.bytes,
                retryCount: terminal.retryCount
            },
            foreground: j2
        }

        const serialized = JSON.stringify(output, null, 2)
        if (config.output) {
            const target = path.resolve(config.output)
            fs.mkdirSync(path.dirname(target), { recursive: true })
            fs.writeFileSync(target, serialized + '\n', 'utf8')
        }
        console.log(serialized)
    } finally {
        if (jobId && service.localDownloadRuntime().running)
            await service.quiesceLocalDownloads(2_000).catch(() => undefined)
        await closeServer(started.server)
        database.close()
        fs.rmSync(root, { recursive: true, force: true })
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
