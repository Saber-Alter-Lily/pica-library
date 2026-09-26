import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Pica } from '../../src/sdk'
import type { Episode } from '../../src/types'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import {
    sanitizeRuntimeDiagnosticError,
    runtimeTaskDiagnostic
} from '../../src/runtime/task-diagnostics'

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
        path.join(os.tmpdir(), 'pica-task-diagnostics-')
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
            throw new Error('Timed out waiting for runtime task diagnostics')
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
}

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('P2 I1 unified runtime task diagnostics', () => {
    it('maps a live authoritative maintenance task and releases its resource lease', async () => {
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
                comicId: 'diagnostic-comic',
                title: 'Diagnostic Comic',
                author: 'Author',
                categories: [],
                tags: [],
                finished: false
            }
        ])
        database.upsertEpisode({
            id: 'diagnostic-comic-episode-1',
            comicId: 'diagnostic-comic',
            title: 'Episode 1',
            order: 1
        })

        service.startMaintenanceUpdateCheck(['diagnostic-comic'])
        await providerEntered

        const live = service.runtimeTaskDiagnostics()
        expect(live.schemaVersion).toBe(1)
        const update = live.tasks.find(
            (task) => task.taskKey === 'maintenance-update'
        )
        expect(update).toMatchObject({
            taskId: null,
            taskType: 'maintenance-update-scan',
            owner: 'library-service',
            state: 'running',
            active: true,
            phase: 'checking',
            canPause: true,
            canCancel: true,
            pauseSemantics: 'in_place',
            resourceState: 'running',
            resourcePriority: 'background',
            recoveryMode: 'restart_scan'
        })
        expect(update?.resourceClasses).toEqual(
            expect.arrayContaining([
                'provider-network',
                'sqlite-write-heavy'
            ])
        )
        expect(update?.resourceRequestedAt).toBeTruthy()
        expect(update?.resourceStartedAt).toBeTruthy()
        expect(update?.runDurationMs).not.toBeNull()
        expect(update?.waitDurationMs).toBeNull()

        releaseProvider()
        await waitFor(
            () => service.maintenanceUpdateStatus().state === 'complete'
        )

        const terminal = service.runtimeTaskDiagnostics().tasks.find(
            (task) => task.taskKey === 'maintenance-update'
        )
        expect(terminal).toMatchObject({
            state: 'complete',
            active: false,
            resourceState: 'none'
        })
        expect(terminal?.runDurationMs).toBeNull()
        database.close()
    })

    it('uses null instead of inventing unavailable task metadata', () => {
        const diagnostic = runtimeTaskDiagnostic(
            {
                taskKey: 'no-owner-id',
                taskType: 'test-task',
                state: 'running',
                phase: 'work',
                resourceClasses: ['cpu-analysis']
            },
            { active: [], waiting: [] },
            Date.parse('2026-09-25T00:00:00.000Z')
        )
        expect(diagnostic).toMatchObject({
            taskId: null,
            startedAt: null,
            updatedAt: null,
            finishedAt: null,
            canPause: null,
            canResume: null,
            canCancel: null,
            canRetry: null,
            retryCount: null,
            lastError: null,
            resourceState: 'none'
        })
    })

    it('redacts secret-bearing diagnostic error text', () => {
        const safe = sanitizeRuntimeDiagnosticError(
            'Bearer supersecret token=abc123 password=hunter2 ' +
                'https://user:pass@example.test/private?q=token ' +
                'C:\\Users\\Alice\\secret.txt /home/alice/private/file.txt'
        )
        expect(safe).not.toContain('supersecret')
        expect(safe).not.toContain('abc123')
        expect(safe).not.toContain('hunter2')
        expect(safe).not.toContain('user:pass')
        expect(safe).not.toContain('Users\\Alice')
        expect(safe).not.toContain('/home/alice')
        expect(safe).toContain('Bearer [redacted]')
        expect(safe).toContain('token=[redacted]')
        expect(safe).toContain('[url]')
        expect(safe).toContain('[path]')
    })

    it('keeps the unified task endpoint Desktop-only and out of Remote API', () => {
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        const gateway = fs.readFileSync('src/remote-api/gateway.ts', 'utf8')
        const service = fs.readFileSync('src/library/service.ts', 'utf8')

        expect(service).toContain('runtimeTaskDiagnostics()')
        expect(server).toContain(
            "url.pathname === '/api/v1/desktop/runtime/tasks'"
        )
        expect(server).toContain('options.service.runtimeTaskDiagnostics()')
        expect(server).toContain(
            "error: 'Desktop control plane is unavailable'"
        )
        expect(gateway).not.toContain('/api/v1/desktop/runtime/tasks')

        const diagnosticGuard = server.indexOf(
            "url.pathname === '/api/v1/desktop/runtime/tasks'"
        )
        const latencyStart = server.indexOf('const latencyDiagnostic =')
        expect(diagnosticGuard).toBeGreaterThan(latencyStart)
        expect(server.slice(latencyStart, diagnosticGuard)).toContain(
            "'/api/v1/desktop/runtime/tasks'"
        )
    })
})
