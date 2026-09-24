import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { RuntimeResourceCoordinator } from '../../src/runtime/resource-coordinator'

const directories: string[] = []

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('P2 C2B shared runtime resource observation', () => {
    it('lets LibraryService consume a process-shared coordinator instance', async () => {
        const dataDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-resource-shared-')
        )
        directories.push(dataDir)
        const database = new LibraryDatabase(path.join(dataDir, 'library.db'))
        const coordinator = new RuntimeResourceCoordinator({ mode: 'observe' })
        const service = new LibraryService(
            database,
            dataDir,
            undefined,
            undefined,
            coordinator
        )

        const lease = await coordinator.acquire({
            ownerId: 'external-component',
            taskType: 'remote-storage-sync',
            resources: { 'remote-storage-network': 1 }
        })

        expect(service.runtimeResourceProfile()).toMatchObject({
            mode: 'observe',
            usage: { 'remote-storage-network': 1 }
        })
        expect(service.runtimeResourceProfile().active).toContainEqual(
            expect.objectContaining({
                ownerId: 'external-component',
                taskType: 'remote-storage-sync'
            })
        )

        lease.release()
        expect(service.runtimeResourceProfile().usage['remote-storage-network']).toBe(0)
        database.close()
    })

    it('locks the second Desktop observation batch and shared WebDAV wiring', () => {
        const service = fs.readFileSync('src/library/service.ts', 'utf8')
        const remote = fs.readFileSync(
            'src/remote-storage/desktop-manager.ts',
            'utf8'
        )
        const desktop = fs.readFileSync('src/desktop/main.ts', 'utf8')

        expect(service).toContain("taskType: 'recommendation-v3-build'")
        expect(service).toContain("taskType: 'favorites-sync'")
        expect(service).toContain("taskType: 'local-download-runner'")
        expect(service).toContain("taskType: 'github-download-runner'")
        expect(remote).toContain("taskType: 'remote-storage-sync'")
        expect(remote).toContain("'remote-storage-network': 1")

        expect(desktop).toContain(
            "const runtimeResources = new RuntimeResourceCoordinator({"
        )
        expect(desktop).toContain(
            'new LibraryService(\n        database,\n        dataDir,\n        undefined,\n        undefined,\n        runtimeResources'
        )
        expect(desktop).toContain(
            '(value) => { credentials = value },\n        runtimeResources'
        )
    })
})
