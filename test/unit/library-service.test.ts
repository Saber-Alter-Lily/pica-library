import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
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

function episode(order: number): Episode {
    return {
        id: `episode-${order}`,
        title: `Episode ${order}`,
        order,
        updated_at: '2026-01-01T00:00:00.000Z'
    }
}

function pictures(current: Episode, count: number): Picture[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `${current.id}-picture-${index + 1}`,
        name: `${index + 1}.jpg`,
        path: `/${current.id}/${index + 1}.jpg`,
        fileServer: 'https://media.example.test',
        url: `https://media.example.test/${current.id}/${index + 1}.jpg`,
        epTitle: current.title,
        media: {
            originalName: `${index + 1}.jpg`,
            path: `/${current.id}/${index + 1}.jpg`,
            fileServer: 'https://media.example.test'
        }
    }))
}

function setup(episodeCounts: number[]) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-service-'))
    directories.push(dataDir)
    const database = new LibraryDatabase(path.join(dataDir, 'library.db'))
    const remoteEpisodes = episodeCounts.map((_, index) => episode(index + 1))
    const provider = {
        episodes: remoteEpisodes,
        async comicInfo(comicId: string) {
            return comic(comicId)
        },
        async episodesAll() {
            return this.episodes
        },
        async picturesAll(_comicId: string, current: Episode) {
            return pictures(current, episodeCounts[current.order - 1] ?? 0)
        },
        async downloadToFile(_url: string, file: string) {
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
    return { database, provider, service }
}

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('LibraryService downloads and maintenance', () => {
    it('reports cumulative progress across multiple episodes', async () => {
        const { database, service } = setup([10, 20])
        const job = service.enqueueDownload({ comicId: 'comic-progress' })
        const progress: Array<[number, number]> = []
        await service.runDownloadQueue({
            profile: 'custom',
            custom: {
                jobConcurrency: 1,
                globalMediaConcurrency: 1,
                requestIntervalMs: 0,
                maxRetries: 0
            },
            onProgress: (value) => progress.push([value.completed, value.total])
        })
        expect(progress).toEqual(
            Array.from({ length: 30 }, (_, index) => [index + 1, 30])
        )
        expect(database.getDownloadJob(job.id)).toMatchObject({
            status: 'COMPLETED',
            progressCompleted: 30,
            progressTotal: 30
        })
        database.close()
    })

    it('preserves cumulative progress across pause and resume', async () => {
        const { database, service } = setup([3, 3])
        const job = service.enqueueDownload({ comicId: 'comic-resume' })
        await service.runDownloadQueue({
            profile: 'custom',
            custom: {
                jobConcurrency: 1,
                globalMediaConcurrency: 1,
                requestIntervalMs: 0,
                maxRetries: 0
            },
            onProgress: (value) => {
                if (value.completed === 2)
                    database.transitionDownloadJob(job.id, 'PAUSED')
            }
        })
        expect(database.getDownloadJob(job.id)).toMatchObject({
            status: 'PAUSED',
            progressCompleted: 2,
            progressTotal: 6,
            bytes: 2
        })

        database.transitionDownloadJob(job.id, 'QUEUED')
        const resumed: number[] = []
        await service.runDownloadQueue({
            profile: 'custom',
            custom: {
                jobConcurrency: 1,
                globalMediaConcurrency: 1,
                requestIntervalMs: 0,
                maxRetries: 0
            },
            onProgress: (value) => resumed.push(value.completed)
        })
        expect(resumed).toEqual([3, 4, 5, 6])
        expect(database.getDownloadJob(job.id)).toMatchObject({
            status: 'COMPLETED',
            progressCompleted: 6,
            progressTotal: 6,
            bytes: 6
        })
        await service.runDownloadQueue({ profile: 'balanced' })
        expect(database.getDownloadJob(job.id).bytes).toBe(6)
        database.close()
    })

    it('settles an entire media attempt before retrying and reuses successful files', async () => {
        const { database, provider, service } = setup([3])
        const events: string[] = []
        const calls = new Map<string, number>()
        let attempt = 0
        let secondStarted!: () => void
        let firstFailed!: () => void
        let releaseSecond!: () => void
        const secondStart = new Promise<void>((resolve) => {
            secondStarted = resolve
        })
        const failureObserved = new Promise<void>((resolve) => {
            firstFailed = resolve
        })
        const secondRelease = new Promise<void>((resolve) => {
            releaseSecond = resolve
        })
        provider.comicInfo = async (comicId: string) => {
            attempt += 1
            return comic(comicId)
        }
        provider.downloadToFile = async (url: string, file: string) => {
            const picture = path.basename(url)
            calls.set(picture, (calls.get(picture) ?? 0) + 1)
            events.push(`attempt-${attempt}:start-${picture}`)
            if (attempt === 1 && picture === '1.jpg') {
                await secondStart
                events.push('attempt-1:fail-1.jpg')
                firstFailed()
                throw new Error('early media failure')
            }
            if (attempt === 1 && picture === '2.jpg') {
                secondStarted()
                await secondRelease
            }
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.writeFileSync(file, 'x')
            events.push(`attempt-${attempt}:finish-${picture}`)
            return { bytes: 1, sha256: 'test-sha256' }
        }
        const job = service.enqueueDownload({ comicId: 'comic-quiescence' })

        const draining = service.runDownloadQueue({
            profile: 'custom',
            custom: {
                jobConcurrency: 1,
                globalMediaConcurrency: 2,
                requestIntervalMs: 0,
                maxRetries: 1
            }
        })
        await failureObserved
        expect(attempt).toBe(1)
        expect(events).not.toContain('attempt-2:start-1.jpg')
        releaseSecond()
        await draining

        expect(events.indexOf('attempt-1:finish-2.jpg')).toBeLessThan(
            events.indexOf('attempt-2:start-1.jpg')
        )
        expect(calls.get('2.jpg')).toBe(1)
        expect(database.getDownloadJob(job.id)).toMatchObject({
            status: 'COMPLETED',
            progressCompleted: 3,
            progressTotal: 3,
            bytes: 3,
            retryCount: 1
        })
        database.close()
    })

    it('stores the complete observed episode baseline before a partial download', async () => {
        const { database, provider, service } = setup([1, 1, 1])
        service.enqueueDownload({
            comicId: 'comic-partial',
            episodeOrders: [1]
        })
        await service.runDownloadQueue({
            profile: 'custom',
            custom: {
                jobConcurrency: 1,
                globalMediaConcurrency: 1,
                requestIntervalMs: 0,
                maxRetries: 0
            }
        })
        expect(database.listEpisodes('comic-partial')).toHaveLength(3)
        expect(await service.checkUpdates()).toEqual([
            expect.objectContaining({ newEpisodeOrders: [] })
        ])

        provider.episodes = [...provider.episodes, episode(4)]
        expect(await service.checkUpdates()).toEqual([
            expect.objectContaining({ newEpisodeOrders: [4] })
        ])
        database.close()
    })

    it('excludes favorite comics with no downloads from the default update scan', async () => {
        const { database, service } = setup([])
        database.importFavorites(
            [
                {
                    comicId: 'favorite-only',
                    title: 'Favorite only',
                    author: 'Author',
                    categories: [],
                    tags: [],
                    finished: false
                }
            ],
            'test'
        )
        expect(await service.checkUpdates()).toEqual([])
        database.close()
    })
})

describe('LibraryService recommendation recall bounds', () => {
    it('caps seed fanout and provider concurrency while preserving route evidence', async () => {
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-recall-'))
        directories.push(dataDir)
        const database = new LibraryDatabase(path.join(dataDir, 'library.db'))
        database.importFavorites(
            Array.from({ length: 30 }, (_, index) => ({
                comicId: `favorite-${index}`,
                title: `Favorite ${index}`,
                author: `Circle ${index % 5} (Author ${index % 10})`,
                categories: [`Category ${index % 4}`],
                tags: [`Tag ${index % 7}`],
                finished: index % 2 === 0,
                totalLikes: 30 - index
            }))
        )
        let active = 0
        let maxActive = 0
        const calls: string[] = []
        const load = async (route: string, source: string) => {
            calls.push(`${route}:${source}`)
            active += 1
            maxActive = Math.max(maxActive, active)
            await new Promise((resolve) => setTimeout(resolve, 5))
            active -= 1
            return [
                {
                    ...comic(`candidate-${route}-${source}`),
                    author: route === 'author' ? source : 'Candidate Author',
                    categories:
                        route === 'category'
                            ? [source]
                            : ['Candidate Category'],
                    tags: route === 'tag' ? [source] : ['Candidate Tag']
                }
            ]
        }
        const provider = {
            Order: { loved: 'ld' },
            related: (source: string) => load('related', source),
            comicsPage: async (category: string, tag: string) => ({
                docs: await load(tag ? 'tag' : 'category', tag || category)
            }),
            search: async (source: string) => ({
                docs: await load('author', source)
            })
        }
        const service = new LibraryService(
            database,
            dataDir,
            provider as unknown as Pica
        )
        const result = await service.recommendations({
            seedCount: 999,
            limit: 30
        })

        expect(
            calls.filter((call) => call.startsWith('related:'))
        ).toHaveLength(16)
        expect(calls.length).toBeLessThanOrEqual(24)
        expect(maxActive).toBeLessThanOrEqual(3)
        expect(result.audit.seedCount).toBe(16)
        expect(
            result.recommendations.every(
                (item) => item.recallSources.length > 0
            )
        ).toBe(true)
        database.close()
    })
})
