import { describe, expect, it } from 'vitest'
import {
    desktopRuntimeTaskDiagnostics
} from '../../src/runtime/desktop-task-diagnostics'
import type {
    RuntimeTaskDiagnosticSnapshot
} from '../../src/runtime/task-diagnostics'

function base(): RuntimeTaskDiagnosticSnapshot {
    return {
        schemaVersion: 1,
        capturedAt: '2026-09-25T00:00:00.000Z',
        tasks: [
            {
                taskKey: 'maintenance-update',
                taskId: null,
                taskType: 'maintenance-update-scan',
                owner: 'library-service',
                state: 'idle',
                active: false,
                phase: 'idle',
                done: 0,
                total: 0,
                startedAt: null,
                updatedAt: null,
                finishedAt: null,
                canPause: false,
                canResume: false,
                canCancel: false,
                canRetry: null,
                pauseSemantics: 'in_place',
                resourceClasses: ['provider-network'],
                resourceState: 'none',
                resourcePriority: null,
                resourceRequestedAt: null,
                resourceStartedAt: null,
                waitDurationMs: null,
                runDurationMs: null,
                retryCount: null,
                lastError: null,
                providerRoute: null,
                recoveryMode: 'restart_scan',
                commitBoundary: 'test'
            }
        ]
    }
}

describe('P2 I2 Desktop external task diagnostics', () => {
    it('merges WebDAV with the shared runtime resource lease', () => {
        const snapshot = desktopRuntimeTaskDiagnostics({
            base: base(),
            resources: {
                active: [
                    {
                        leaseId: 'lease-1',
                        taskType: 'remote-storage-sync',
                        priority: 'background',
                        resources: {
                            'remote-storage-network': 1,
                            'filesystem-heavy': 1
                        },
                        requestedAt: '2026-09-25T00:00:00.000Z',
                        startedAt: '2026-09-25T00:00:01.000Z'
                    }
                ]
            },
            remoteStorageProgress: {
                state: 'running',
                phase: 'uploading',
                completedPages: 7,
                totalPages: 20,
                updatedAt: '2026-09-25T00:00:04.000Z',
                canPause: true,
                canResume: false,
                canCancel: true
            },
            now: new Date('2026-09-25T00:00:06.000Z')
        })
        expect(snapshot.tasks.map((task) => task.taskKey)).toEqual([
            'browser-lite-export',
            'eh-managed-login',
            'maintenance-update',
            'remote-storage-sync',
            'software-update'
        ])
        expect(
            snapshot.tasks.find((task) => task.taskKey === 'remote-storage-sync')
        ).toMatchObject({
            state: 'running',
            active: true,
            phase: 'uploading',
            done: 7,
            total: 20,
            canPause: true,
            canCancel: true,
            providerRoute: 'webdav',
            resourceState: 'running',
            resourcePriority: 'background',
            resourceStartedAt: '2026-09-25T00:00:01.000Z',
            runDurationMs: 5000,
            recoveryMode: 'restart_sync_reuse_sha_objects'
        })
    })

    it('maps external owners without inventing unavailable timestamps or ids', () => {
        const snapshot = desktopRuntimeTaskDiagnostics({
            base: base(),
            resources: {},
            browserLiteExportProgress: {
                state: 'running',
                phase: 'generate-bundle'
            },
            ehWebLogin: {
                state: 'waiting',
                message: '请完成登录',
                startedAt: '2026-09-25T00:00:00.000Z'
            },
            updateProgress: {
                phase: 'staged',
                current: 10,
                total: 10,
                updatedAt: '2026-09-25T00:00:05.000Z'
            },
            now: new Date('2026-09-25T00:00:06.000Z')
        })

        const browser = snapshot.tasks.find(
            (task) => task.taskKey === 'browser-lite-export'
        )
        expect(browser).toMatchObject({
            taskId: null,
            state: 'running',
            startedAt: null,
            updatedAt: null,
            finishedAt: null,
            resourceState: 'none'
        })

        const eh = snapshot.tasks.find(
            (task) => task.taskKey === 'eh-managed-login'
        )
        expect(eh).toMatchObject({
            state: 'waiting',
            phase: 'waiting',
            startedAt: '2026-09-25T00:00:00.000Z',
            canCancel: true,
            providerRoute: 'eh-managed-browser',
            lastError: null
        })

        const update = snapshot.tasks.find(
            (task) => task.taskKey === 'software-update'
        )
        expect(update).toMatchObject({
            state: 'waiting',
            active: true,
            phase: 'staged',
            done: 10,
            total: 10,
            providerRoute: 'github-release',
            resourceState: 'none'
        })
    })

    it('sanitizes failed external-owner messages before returning diagnostics', () => {
        const snapshot = desktopRuntimeTaskDiagnostics({
            base: base(),
            resources: {},
            remoteStorageProgress: {
                state: 'failed',
                phase: 'failed',
                message:
                    'upload failed https://user:pass@example.test/private token=abc123',
                updatedAt: '2026-09-25T00:00:03.000Z'
            },
            ehWebLogin: {
                state: 'failed',
                message:
                    'C:\\Users\\Alice\\secret.txt password=hunter2',
                startedAt: '2026-09-25T00:00:00.000Z',
                completedAt: '2026-09-25T00:00:02.000Z'
            },
            updateProgress: {
                phase: 'failed',
                message:
                    'Bearer supersecret /home/alice/update/private/file.zip',
                updatedAt: '2026-09-25T00:00:04.000Z'
            }
        })

        const serialized = JSON.stringify(snapshot)
        expect(serialized).not.toContain('user:pass')
        expect(serialized).not.toContain('abc123')
        expect(serialized).not.toContain('hunter2')
        expect(serialized).not.toContain('supersecret')
        expect(serialized).not.toContain('Users\\\\Alice')
        expect(serialized).not.toContain('/home/alice')
        expect(serialized).toContain('[url]')
        expect(serialized).toContain('[path]')
        expect(serialized).toContain('[redacted]')
    })

    it('keeps Desktop aggregation on the local control plane only', async () => {
        const fs = await import('node:fs')
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        const main = fs.readFileSync('src/desktop/main.ts', 'utf8')
        const gateway = fs.readFileSync('src/remote-api/gateway.ts', 'utf8')

        expect(server).toContain('options.desktop.runtimeTasks?.()')
        expect(main).toContain('desktopRuntimeTaskDiagnostics({')
        expect(main).toContain('remoteStatus.syncProgress')
        expect(main).toContain('browserLiteExportProgress')
        expect(main).toContain('ehWebLogin: ehWebLogin?.status() ?? null')
        expect(main).toContain('updateProgress: updateManager.progress()')
        expect(gateway).not.toContain('/api/v1/desktop/runtime/tasks')
    })
})
