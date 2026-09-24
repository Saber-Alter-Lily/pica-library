import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Pica } from '../../src/sdk'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { scanRepairIssues } from '../../src/maintenance/repair'

const directories: string[] = []

function setup() {
    const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-repair-runtime-')
    )
    directories.push(dataDir)
    const database = new LibraryDatabase(path.join(dataDir, 'library.db'))
    database.importCatalog([
        {
            comicId: 'comic-1',
            title: 'Comic 1',
            author: 'Author',
            categories: [],
            tags: [],
            finished: false
        }
    ])
    database.upsertEpisode({
        id: 'episode-1',
        comicId: 'comic-1',
        title: 'Episode 1',
        order: 1
    })
    database.upsertPicture({
        id: 'picture-1',
        comicId: 'comic-1',
        episodeId: 'episode-1',
        position: 1,
        originalName: '1.jpg',
        mediaPath: '/1.jpg',
        fileServer: 'https://example.test'
    })
    const service = new LibraryService(
        database,
        dataDir,
        {} as unknown as Pica
    )
    return { database, service }
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000) {
    const started = Date.now()
    while (!predicate()) {
        if (Date.now() - started > timeoutMs)
            throw new Error('Timed out waiting for repair task state')
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
}

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('maintenance repair background runtime', () => {
    it('checks cancellation again after the active file inspection', async () => {
        const { database } = setup()
        let cancel = false
        const progress: Array<{ done: number; total: number }> = []

        await expect(
            scanRepairIssues(database, {
                onProgress: (value) => {
                    progress.push(value)
                    cancel = true
                },
                checkpoint: () => {
                    if (cancel) throw new Error('cancel after active stat')
                }
            })
        ).rejects.toThrow('cancel after active stat')

        expect(progress).toEqual([{ done: 1, total: 1 }])
        database.close()
    })

    it('publishes terminal issues through service-owned task state', async () => {
        const { database, service } = setup()
        expect(service.startMaintenanceRepairScan()).toMatchObject({
            started: true,
            state: 'running'
        })

        await waitFor(
            () => service.maintenanceRepairStatus().state === 'complete'
        )

        expect(service.maintenanceRepairStatus()).toMatchObject({
            state: 'complete',
            active: false,
            done: 1,
            total: 1,
            issueCount: 1,
            issues: [
                expect.objectContaining({
                    pictureId: 'picture-1',
                    reason: 'missing'
                })
            ]
        })
        database.close()
    })

    it('keeps the Web scan detached and controllable', () => {
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        const app = fs.readFileSync('web/app.js', 'utf8')

        expect(server).toContain(
            "url.pathname === '/api/v1/maintenance/repair/status'"
        )
        expect(server).toContain(
            "url.pathname === '/api/v1/maintenance/repair/control'"
        )
        expect(server).toContain(
            'options.service.startMaintenanceRepairScan()'
        )
        expect(server).not.toContain(
            'const issues = await scanRepairIssues(options.database)'
        )

        expect(app).toContain('runMaintenanceRepairScan')
        expect(app).toContain(
            "post('/api/v1/maintenance/repair/control'"
        )
        expect(app).toContain(
            "api('/api/v1/maintenance/repair/status')"
        )
    })
})
