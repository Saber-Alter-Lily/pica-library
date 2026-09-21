import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'
import type { Pica } from '../../src/sdk'
import type { Comic, Episode, Picture } from '../../src/types'

const directories: string[] = []

function comic(id: string): Comic {
    return {
        _id: id,
        title: `Comic ${id}`,
        author: 'Author',
        description: '',
        chineseTeam: '',
        categories: [],
        tags: [],
        finished: false,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        totalLikes: 0,
        totalViews: 0,
        allowDownload: true
    }
}

function episode(): Episode {
    return {
        id: 'episode-1',
        title: 'Episode 1',
        order: 1,
        updated_at: '2026-01-01T00:00:00.000Z'
    }
}

function picture(current: Episode): Picture {
    return {
        id: 'picture-1',
        name: '1.jpg',
        path: '/episode-1/1.jpg',
        fileServer: 'https://media.example.test',
        url: 'https://media.example.test/episode-1/1.jpg',
        epTitle: current.title,
        media: {
            originalName: '1.jpg',
            path: '/episode-1/1.jpg',
            fileServer: 'https://media.example.test'
        }
    }
}

function setupBlockedDownload() {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-runtime-'))
    directories.push(dataDir)
    const database = new LibraryDatabase(path.join(dataDir, 'library.db'))
    const currentEpisode = episode()
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
        release = resolve
    })
    const provider = {
        async comicInfo(comicId: string) {
            return comic(comicId)
        },
        async episodesAll() {
            return [currentEpisode]
        },
        async picturesAll() {
            return [picture(currentEpisode)]
        },
        async downloadToFile(_url: string, file: string) {
            await blocked
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.writeFileSync(file, 'x')
            return { bytes: 1, sha256: 'test-sha256' }
        }
    }
    const service = new LibraryService(
        database,
        dataDir,
        provider as unknown as Pica
    )
    return { dataDir, database, service, release }
}

async function waitFor(
    predicate: () => boolean,
    timeoutMs = 3000
) {
    const started = Date.now()
    while (!predicate()) {
        if (Date.now() - started > timeoutMs)
            throw new Error('Timed out waiting for download runtime')
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('post-v0.4.7 Desktop download runtime stability', () => {
    it('recovers only interrupted LOCAL execution states on service startup', () => {
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-recover-'))
        directories.push(dataDir)
        let database = new LibraryDatabase(path.join(dataDir, 'library.db'))
        database.importCatalog(
            ['preparing', 'running', 'retry', 'paused'].map((id) => ({
                comicId: id,
                title: id,
                author: 'Author',
                categories: [],
                tags: [],
                finished: false
            }))
        )

        const preparing = database.createDownloadJob({ comicId: 'preparing' })
        database.transitionDownloadJob(preparing.id, 'QUEUED')
        database.transitionDownloadJob(preparing.id, 'PREPARING')

        const running = database.createDownloadJob({ comicId: 'running' })
        database.transitionDownloadJob(running.id, 'QUEUED')
        database.transitionDownloadJob(running.id, 'PREPARING')
        database.transitionDownloadJob(running.id, 'RUNNING')

        const retry = database.createDownloadJob({ comicId: 'retry' })
        database.transitionDownloadJob(retry.id, 'QUEUED')
        database.transitionDownloadJob(retry.id, 'PREPARING')
        database.transitionDownloadJob(retry.id, 'RUNNING')
        database.transitionDownloadJob(retry.id, 'RETRY_WAIT', {
            retryCount: 2,
            error: 'temporary'
        })

        const paused = database.createDownloadJob({ comicId: 'paused' })
        database.transitionDownloadJob(paused.id, 'QUEUED')
        database.transitionDownloadJob(paused.id, 'PAUSED')
        database.close()

        database = new LibraryDatabase(path.join(dataDir, 'library.db'))
        const service = new LibraryService(database, dataDir)

        expect(database.getDownloadJob(preparing.id)).toMatchObject({
            status: 'QUEUED',
            startedAt: null
        })
        expect(database.getDownloadJob(running.id)).toMatchObject({
            status: 'QUEUED',
            startedAt: null
        })
        expect(database.getDownloadJob(retry.id)).toMatchObject({
            status: 'QUEUED',
            startedAt: null,
            retryCount: 2,
            error: null
        })
        expect(database.getDownloadJob(paused.id).status).toBe('PAUSED')
        expect(service.localDownloadRuntime()).toMatchObject({
            running: false,
            recoveredOnStartup: 3
        })
        database.close()
    })

    it('starts only one LOCAL scheduler while a download run is active', async () => {
        const { database, service, release } = setupBlockedDownload()
        const job = service.enqueueDownload({ comicId: 'single-runner' })
        const options = {
            profile: 'custom' as const,
            custom: {
                jobConcurrency: 1,
                globalMediaConcurrency: 1,
                requestIntervalMs: 0,
                maxRetries: 0
            }
        }

        try {
            expect(service.startLocalDownloadQueue(options)).toMatchObject({
                started: true,
                running: true,
                schedulers: 1
            })
            expect(service.startLocalDownloadQueue(options)).toMatchObject({
                started: false,
                running: true,
                schedulers: 1
            })
        } finally {
            release()
        }

        await waitFor(() => !service.localDownloadRuntime().running)
        expect(database.getDownloadJob(job.id)).toMatchObject({
            status: 'COMPLETED',
            progressCompleted: 1,
            progressTotal: 1
        })
        database.close()
    })

    it('returns from the Web run endpoint while the background queue is still running', async () => {
        const { database, service, release } = setupBlockedDownload()
        service.enqueueDownload({ comicId: 'http-detached' })
        const started = await startLibraryServer({
            database,
            service,
            host: '127.0.0.1',
            port: 0
        })

        try {
            const request = {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    profile: 'custom',
                    jobConcurrency: 1,
                    globalMediaConcurrency: 1,
                    requestIntervalMs: 0,
                    maxRetries: 0
                })
            }
            const first = await Promise.race([
                fetch(`${started.url}/api/v1/downloads/run`, request),
                new Promise<never>((_, reject) =>
                    setTimeout(
                        () => reject(new Error('run endpoint stayed attached')),
                        500
                    )
                )
            ])
            expect(first.status).toBe(200)
            expect(await first.json()).toMatchObject({
                started: true,
                running: true,
                schedulers: 1
            })

            const second = await fetch(
                `${started.url}/api/v1/downloads/run`,
                request
            )
            expect(second.status).toBe(200)
            expect(await second.json()).toMatchObject({
                started: false,
                running: true,
                schedulers: 1
            })

            const summary = await fetch(
                `${started.url}/api/v1/downloads/summary`
            ).then((response) => response.json())
            expect(summary.runtime).toMatchObject({
                running: true,
                schedulers: 1
            })
        } finally {
            release()
            await waitFor(() => !service.localDownloadRuntime().running)
            await new Promise<void>((resolve, reject) =>
                started.server.close((error) =>
                    error ? reject(error) : resolve()
                )
            )
            database.close()
        }
    })

    it('keeps bounded APIs responsive with a 1500-job queue while one runner is active', async () => {
        const { database, service, release } = setupBlockedDownload()
        database.importCatalog(
            Array.from({ length: 1500 }, (_, index) => ({
                comicId: `stress-runtime-${index}`,
                title: `Stress runtime ${index}`,
                author: `Author ${index % 20}`,
                categories: [],
                tags: [],
                finished: false
            }))
        )
        const jobs = Array.from({ length: 1500 }, (_, index) => {
            const job = database.createDownloadJob({
                comicId: `stress-runtime-${index}`,
                runner: 'LOCAL'
            })
            return database.transitionDownloadJob(job.id, 'QUEUED')
        })
        for (const job of jobs.slice(0, 350)) {
            database.transitionDownloadJob(job.id, 'PREPARING')
            database.transitionDownloadJob(job.id, 'RUNNING')
            database.transitionDownloadJob(job.id, 'COMPLETED')
        }

        const started = await startLibraryServer({
            database,
            service,
            host: '127.0.0.1',
            port: 0
        })
        const request = {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                profile: 'custom',
                jobConcurrency: 1,
                globalMediaConcurrency: 1,
                requestIntervalMs: 0,
                maxRetries: 0
            })
        }
        const bounded = async (url: string) =>
            Promise.race([
                fetch(url).then(async (response) => ({
                    status: response.status,
                    body: await response.json()
                })),
                new Promise<never>((_, reject) =>
                    setTimeout(
                        () =>
                            reject(
                                new Error(
                                    `Large-queue API response exceeded 1500 ms: ${url}`
                                )
                            ),
                        1500
                    )
                )
            ])
        try {
            const first = await bounded(
                `${started.url}/api/v1/downloads/run`
            ).catch((error) => {
                throw error
            })
            // The helper above sends GET, so start explicitly with the POST
            // request and keep the bounded reads below separate.
            void first
        } catch {
            // Start is tested below with the correct POST request.
        }

        try {
            const run = await Promise.race([
                fetch(`${started.url}/api/v1/downloads/run`, request),
                new Promise<never>((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Large queue start stayed attached')),
                        1500
                    )
                )
            ])
            expect(run.status).toBe(200)
            expect(await run.json()).toMatchObject({
                started: true,
                running: true,
                schedulers: 1
            })

            const summary = await bounded(
                `${started.url}/api/v1/downloads/summary`
            )
            expect(summary.status).toBe(200)
            expect(summary.body).toMatchObject({
                total: 1500,
                finished: 350,
                runtime: { running: true, schedulers: 1 }
            })

            const page = await bounded(
                `${started.url}/api/v1/downloads/page?view=active&limit=100&offset=0`
            )
            expect(page.status).toBe(200)
            expect(page.body).toMatchObject({
                total: 1150,
                limit: 100,
                offset: 0
            })
            expect(page.body.items).toHaveLength(100)

            const health = await bounded(`${started.url}/api/v1/status`)
            expect(health.status).toBe(200)

            const duplicate = await Promise.race([
                fetch(`${started.url}/api/v1/downloads/run`, request),
                new Promise<never>((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Duplicate start stayed attached')),
                        1500
                    )
                )
            ])
            expect(await duplicate.json()).toMatchObject({
                started: false,
                running: true,
                schedulers: 1
            })
        } finally {
            release()
            await waitFor(() => !service.localDownloadRuntime().running, 5000)
            await new Promise<void>((resolve, reject) =>
                started.server.close((error) =>
                    error ? reject(error) : resolve()
                )
            )
            database.close()
        }
    }, 30000)

    it('keeps the Web task UI on bounded queue endpoints', () => {
        const app = fs.readFileSync('web/app.js', 'utf8')
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        const i18n = fs.readFileSync('web/i18n.js', 'utf8')
        expect(app).not.toContain("api('/api/v1/downloads').then")
        expect(app).toContain('data-progress-completed=')
        expect(app).toContain('runtime.recoveredOnStartup')
        expect(app).toContain("t('downloads.backgroundRunning'")
        expect(i18n).toContain("'downloads.recoveredInterrupted'")
        expect(server).toContain('startLocalDownloadQueue')
        expect(server).not.toContain('await options.service.runDownloadQueue')
    })
})
