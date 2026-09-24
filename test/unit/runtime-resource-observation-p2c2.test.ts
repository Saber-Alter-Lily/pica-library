import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Pica } from '../../src/sdk'
import type { Episode } from '../../src/types'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'

const directories: string[] = []

function episode(comicId: string): Episode {
    return {
        id: `${comicId}-episode-1`,
        title: 'Episode 1',
        order: 1,
        updated_at: '2026-01-01T00:00:00.000Z'
    }
}

function setup(provider: Partial<Pica> = {}) {
    const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-resource-observation-')
    )
    directories.push(dataDir)
    const database = new LibraryDatabase(path.join(dataDir, 'library.db'))
    const pica = {
        async episodesAll(comicId: string) {
            return [episode(comicId)]
        },
        ...provider
    } as unknown as Pica
    const service = new LibraryService(database, dataDir, pica)
    return { database, service }
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000) {
    const started = Date.now()
    while (!predicate()) {
        if (Date.now() - started > timeoutMs)
            throw new Error('Timed out waiting for runtime resource state')
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
}

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('P2 C2 observe-only runtime resource integration', () => {
    it('observes a live maintenance update lease and releases it at task completion', async () => {
        let releaseProvider!: () => void
        let enteredProvider!: () => void
        const providerGate = new Promise<void>((resolve) => {
            releaseProvider = resolve
        })
        const providerEntered = new Promise<void>((resolve) => {
            enteredProvider = resolve
        })
        const { database, service } = setup({
            episodesAll: async (comicId: string) => {
                enteredProvider()
                await providerGate
                return [episode(comicId)]
            }
        })

        database.importCatalog([
            {
                comicId: 'resource-comic',
                title: 'Resource Comic',
                author: 'Author',
                categories: [],
                tags: [],
                finished: false
            }
        ])
        database.upsertEpisode({
            id: 'resource-comic-episode-1',
            comicId: 'resource-comic',
            title: 'Episode 1',
            order: 1
        })

        expect(
            service.startMaintenanceUpdateCheck(['resource-comic'])
        ).toMatchObject({
            started: true,
            state: 'running'
        })
        await providerEntered

        const running = service.runtimeResourceProfile()
        expect(running.mode).toBe('observe')
        expect(running.enforcementEnabled).toBe(false)
        expect(running.active).toContainEqual(
            expect.objectContaining({
                ownerId: 'maintenance-update',
                taskType: 'maintenance-update-scan',
                priority: 'background',
                resources: {
                    'provider-network': 1,
                    'sqlite-write-heavy': 1
                }
            })
        )
        expect(running.usage).toMatchObject({
            'provider-network': 1,
            'sqlite-write-heavy': 1
        })

        releaseProvider()
        await waitFor(
            () => service.maintenanceUpdateStatus().state === 'complete'
        )

        const complete = service.runtimeResourceProfile()
        expect(complete.usage).toMatchObject({
            'provider-network': 0,
            'sqlite-write-heavy': 0
        })
        expect(
            complete.recent.some(
                (event) =>
                    event.type === 'released' &&
                    event.taskType === 'maintenance-update-scan'
            )
        ).toBe(true)
        database.close()
    })

    it('declares the first C2 task batch and keeps the resource endpoint Desktop-only', () => {
        const service = fs.readFileSync('src/library/service.ts', 'utf8')
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        const desktop = fs.readFileSync('src/desktop/main.ts', 'utf8')

        expect(service).toContain("taskType: 'maintenance-update-scan'")
        expect(service).toContain("taskType: 'maintenance-repair-scan'")
        expect(service).toContain("taskType: 'library-organize'")
        expect(service).toContain("taskType: 'recommendation-v5-shadow'")
        expect(service).toContain(
            "taskType: 'work-identity-evidence-refresh'"
        )
        expect(service).toContain('runtimeResourceProfile()')
        expect(server).toContain(
            "url.pathname === '/api/v1/desktop/runtime/resources'"
        )
        expect(server).toContain(
            'options.service.runtimeResourceProfile()'
        )
        expect(server).toContain(
            "error: 'Desktop control plane is unavailable'"
        )
        expect(desktop).toContain(
            'service?.runtimeResourceProfile().active ?? []'
        )
        expect(desktop).toContain('runtime:${task.taskType}')
    })
})
