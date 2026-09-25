import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'

const roots: string[] = []

function workspace() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-p2h3a-'))
    roots.push(root)
    return {
        root,
        databaseFile: path.join(root, 'library.db')
    }
}

async function waitUntil(
    predicate: () => boolean,
    timeoutMs = 5000
) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (predicate()) return
        await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error('Timed out waiting for maintenance task state')
}

afterEach(() => {
    while (roots.length)
        fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('P2 H3A maintenance crash recovery', () => {
    it('turns active task snapshots into persistent restart-required tombstones', () => {
        const { root, databaseFile } = workspace()
        const first = new LibraryDatabase(databaseFile)
        const startedAt = '2026-09-24T20:00:00.000Z'
        const updatedAt = '2026-09-24T20:01:00.000Z'

        first.setAppState('runtime.maintenance-update.recovery.v1', {
            version: 1,
            task: 'maintenance-update',
            state: 'running',
            phase: 'checking',
            done: 3,
            total: 9,
            startedAt,
            updatedAt,
            summary: { findingCount: 3, updateCount: 1 }
        })
        first.setAppState('runtime.maintenance-repair.recovery.v1', {
            version: 1,
            task: 'maintenance-repair',
            state: 'paused',
            phase: 'paused',
            done: 4,
            total: 12,
            startedAt,
            updatedAt,
            summary: { issueCount: 2 }
        })
        first.setAppState('runtime.library-organize.recovery.v1', {
            version: 1,
            task: 'library-organize',
            state: 'cancelling',
            phase: 'organizing',
            done: 5,
            total: 20,
            startedAt,
            updatedAt,
            summary: {
                linked: 2,
                existing: 1,
                manifests: 1,
                skipped: 1
            }
        })
        first.close()

        const second = new LibraryDatabase(databaseFile)
        const recovered = new LibraryService(second, root)

        expect(recovered.maintenanceUpdateStatus()).toMatchObject({
            state: 'failed',
            phase: 'failed',
            active: false,
            done: 3,
            total: 9,
            findingCount: 3,
            updateCount: 1,
            recoveryMode: 'restart_required',
            recoveredState: 'running',
            findings: []
        })
        expect(recovered.maintenanceRepairStatus()).toMatchObject({
            state: 'failed',
            phase: 'failed',
            active: false,
            done: 4,
            total: 12,
            issueCount: 2,
            recoveryMode: 'restart_required',
            recoveredState: 'paused',
            issues: []
        })
        expect(recovered.libraryOrganizeStatus()).toMatchObject({
            state: 'failed',
            phase: 'failed',
            active: false,
            done: 5,
            total: 20,
            linked: 2,
            existing: 1,
            manifests: 1,
            skipped: 1,
            recoveryMode: 'restart_required',
            recoveredState: 'cancelling',
            result: null
        })

        for (const key of [
            'runtime.maintenance-update.recovery.v1',
            'runtime.maintenance-repair.recovery.v1',
            'runtime.library-organize.recovery.v1'
        ]) {
            const value = second.getAppState<{
                state: string
                recoveredState?: string
            }>(key)
            expect(value?.state).toBe('interrupted')
            expect(value?.recoveredState).toBeTruthy()
        }
        second.close()

        const third = new LibraryDatabase(databaseFile)
        const recoveredAgain = new LibraryService(third, root)
        expect(recoveredAgain.maintenanceUpdateStatus()).toMatchObject({
            state: 'failed',
            recoveryMode: 'restart_required',
            recoveredState: 'running'
        })
        expect(recoveredAgain.maintenanceRepairStatus()).toMatchObject({
            state: 'failed',
            recoveryMode: 'restart_required',
            recoveredState: 'paused'
        })
        expect(recoveredAgain.libraryOrganizeStatus()).toMatchObject({
            state: 'failed',
            recoveryMode: 'restart_required',
            recoveredState: 'cancelling'
        })
        third.close()
    })

    it('clears recovery tombstones after an explicit clean rerun reaches terminal state', async () => {
        const { root, databaseFile } = workspace()
        const database = new LibraryDatabase(databaseFile)
        for (const [key, task] of [
            ['runtime.maintenance-update.recovery.v1', 'maintenance-update'],
            ['runtime.maintenance-repair.recovery.v1', 'maintenance-repair'],
            ['runtime.library-organize.recovery.v1', 'library-organize']
        ] as const)
            database.setAppState(key, {
                version: 1,
                task,
                state: 'interrupted',
                recoveredState: 'running',
                phase: 'interrupted',
                done: 1,
                total: 2,
                updatedAt: '2026-09-24T20:01:00.000Z',
                summary: {}
            })

        const service = new LibraryService(database, root)

        service.startMaintenanceUpdateCheck([])
        await waitUntil(() => !service.maintenanceUpdateStatus().active)
        expect(service.maintenanceUpdateStatus().state).toBe('complete')
        expect(
            database.getAppState('runtime.maintenance-update.recovery.v1')
        ).toBeUndefined()

        service.startMaintenanceRepairScan()
        await waitUntil(() => !service.maintenanceRepairStatus().active)
        expect(service.maintenanceRepairStatus().state).toBe('complete')
        expect(
            database.getAppState('runtime.maintenance-repair.recovery.v1')
        ).toBeUndefined()

        service.startLibraryOrganize()
        await waitUntil(() => !service.libraryOrganizeStatus().active)
        expect(service.libraryOrganizeStatus().state).toBe('complete')
        expect(
            database.getAppState('runtime.library-organize.recovery.v1')
        ).toBeUndefined()

        database.close()
    })
})
