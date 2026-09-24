import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Pica } from '../../src/sdk'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import type { Episode } from '../../src/types'

const directories: string[] = []

function record(comicId: string) {
    return {
        comicId,
        title: comicId,
        author: 'Author',
        categories: [],
        tags: [],
        finished: false
    }
}

function episode(comicId: string): Episode {
    return {
        id: `${comicId}-episode-1`,
        title: 'Episode 1',
        order: 1,
        updated_at: '2026-01-01T00:00:00.000Z'
    }
}

function setup(provider: Partial<Pica> = {}) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-maintenance-runtime-'))
    directories.push(dataDir)
    const database = new LibraryDatabase(path.join(dataDir, 'library.db'))
    const pica = {
        async episodesAll(comicId: string) {
            return [episode(comicId)]
        },
        ...provider
    } as unknown as Pica
    const service = new LibraryService(database, dataDir, pica)
    return { dataDir, database, service }
}

function addDownloadedComic(database: LibraryDatabase, comicId: string) {
    database.importCatalog([record(comicId)])
    const current = episode(comicId)
    database.upsertEpisode({
        id: current.id,
        comicId,
        title: current.title,
        order: current.order
    })
    database.upsertPicture({
        id: `${comicId}-picture-1`,
        comicId,
        episodeId: current.id,
        position: 1,
        originalName: '1.jpg',
        mediaPath: '/1.jpg',
        fileServer: 'https://example.test'
    })
    database.markPictureDownloaded(
        `${comicId}-picture-1`,
        path.join(os.tmpdir(), `${comicId}.jpg`),
        1,
        'sha'
    )
}

async function waitFor(
    predicate: () => boolean,
    timeoutMs = 2000
) {
    const started = Date.now()
    while (!predicate()) {
        if (Date.now() - started > timeoutMs)
            throw new Error('Timed out waiting for maintenance task state')
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
}

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('maintenance update runtime hardening', () => {
    it('discovers downloaded comics through a direct uncapped database query', async () => {
        const { database, service } = setup()
        addDownloadedComic(database, 'downloaded-1')
        database.importCatalog([record('favorite-only')])

        const originalListComics = database.listComics.bind(database)
        database.listComics = (() => {
            throw new Error('full catalog list must not be used for update scan discovery')
        }) as typeof database.listComics

        expect(database.listDownloadedComicIds()).toEqual(['downloaded-1'])
        await expect(service.checkUpdates()).resolves.toEqual([
            expect.objectContaining({
                comicId: 'downloaded-1',
                newEpisodeOrders: []
            })
        ])

        database.listComics = originalListComics
        database.close()
    })

    it('pauses after the active provider request before starting the next comic', async () => {
        let releaseFirst!: () => void
        const firstGate = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        const calls: string[] = []
        const { database, service } = setup({
            episodesAll: async (comicId: string) => {
                calls.push(comicId)
                if (calls.length === 1) await firstGate
                return [episode(comicId)]
            }
        })
        database.importCatalog([record('comic-1'), record('comic-2')])
        for (const comicId of ['comic-1', 'comic-2']) {
            const current = episode(comicId)
            database.upsertEpisode({
                id: current.id,
                comicId,
                title: current.title,
                order: current.order
            })
        }

        expect(
            service.startMaintenanceUpdateCheck(['comic-1', 'comic-2'])
        ).toMatchObject({
            started: true,
            state: 'running',
            total: 2
        })
        await waitFor(() => calls.length === 1)

        expect(service.maintenanceUpdateControl('pause')).toMatchObject({
            state: 'pausing'
        })
        releaseFirst()
        await waitFor(
            () => service.maintenanceUpdateStatus().state === 'paused'
        )

        expect(calls).toEqual(['comic-1'])
        expect(service.maintenanceUpdateStatus()).toMatchObject({
            state: 'paused',
            done: 1,
            total: 2,
            canResume: true
        })

        service.maintenanceUpdateControl('resume')
        await waitFor(
            () => service.maintenanceUpdateStatus().state === 'complete'
        )
        expect(calls).toEqual(['comic-1', 'comic-2'])
        expect(service.maintenanceUpdateStatus()).toMatchObject({
            state: 'complete',
            done: 2,
            total: 2,
            active: false
        })
        database.close()
    })

    it('cancels after the bounded active provider request without starting more work', async () => {
        let releaseFirst!: () => void
        const firstGate = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        const calls: string[] = []
        const { database, service } = setup({
            episodesAll: async (comicId: string) => {
                calls.push(comicId)
                if (calls.length === 1) await firstGate
                return [episode(comicId)]
            }
        })
        database.importCatalog([record('comic-a'), record('comic-b')])
        for (const comicId of ['comic-a', 'comic-b']) {
            const current = episode(comicId)
            database.upsertEpisode({
                id: current.id,
                comicId,
                title: current.title,
                order: current.order
            })
        }

        service.startMaintenanceUpdateCheck(['comic-a', 'comic-b'])
        await waitFor(() => calls.length === 1)
        expect(service.maintenanceUpdateControl('cancel')).toMatchObject({
            state: 'cancelling'
        })
        releaseFirst()
        await waitFor(
            () => service.maintenanceUpdateStatus().state === 'cancelled'
        )

        expect(calls).toEqual(['comic-a'])
        expect(service.maintenanceUpdateStatus()).toMatchObject({
            state: 'cancelled',
            done: 1,
            total: 2,
            active: false
        })
        database.close()
    })

    it('keeps the full maintenance scan detached from the request lifecycle', () => {
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        expect(server).toContain(
            "url.pathname === '/api/v1/maintenance/updates/status'"
        )
        expect(server).toContain(
            "url.pathname === '/api/v1/maintenance/updates/control'"
        )
        expect(server).toContain('options.service.startMaintenanceUpdateCheck()')
        expect(server).toContain('response,\n                        202')
    })
})
