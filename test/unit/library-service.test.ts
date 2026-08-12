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
            progressTotal: 6
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
            progressTotal: 6
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
