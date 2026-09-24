import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RuntimeResourceCoordinator } from '../../src/runtime/resource-coordinator'

describe('P2 C1 runtime resource coordinator', () => {
    it('serializes the enforced background filesystem-heavy class', () => {
        const coordinator = new RuntimeResourceCoordinator()

        const first = coordinator.tryAcquire({
            taskId: 'repair',
            taskType: 'maintenance-repair-scan',
            priority: 'maintenance',
            resources: ['filesystem-heavy']
        })
        expect(first.acquired).toBe(true)
        if (!first.acquired) throw new Error('first lease was not acquired')

        const second = coordinator.tryAcquire({
            taskId: 'organize',
            taskType: 'library-organize-views',
            priority: 'maintenance',
            resources: ['filesystem-heavy']
        })
        expect(second.acquired).toBe(false)
        if (second.acquired) throw new Error('conflicting lease was acquired')
        expect(second.blockedBy).toEqual([
            expect.objectContaining({
                resource: 'filesystem-heavy',
                capacity: 1,
                active: [
                    expect.objectContaining({
                        taskId: 'repair'
                    })
                ]
            })
        ])

        first.lease.release()

        const retry = coordinator.tryAcquire({
            taskId: 'organize',
            taskType: 'library-organize-views',
            priority: 'maintenance',
            resources: ['filesystem-heavy']
        })
        expect(retry.acquired).toBe(true)
        if (retry.acquired) retry.lease.release()
    })

    it('observes but does not yet throttle unmeasured resource classes', () => {
        const coordinator = new RuntimeResourceCoordinator()
        const providerA = coordinator.tryAcquire({
            taskId: 'update',
            taskType: 'maintenance-update-scan',
            priority: 'maintenance',
            resources: ['provider-network', 'sqlite-write-heavy']
        })
        const providerB = coordinator.tryAcquire({
            taskId: 'download',
            taskType: 'download-queue',
            priority: 'background',
            resources: ['media-network', 'sqlite-write-heavy']
        })
        expect(providerA.acquired).toBe(true)
        expect(providerB.acquired).toBe(true)

        const snapshot = coordinator.snapshot()
        expect(snapshot.policy.enforcedCapacities).toEqual({
            'filesystem-heavy': 1
        })
        expect(snapshot.policy.observeOnly).toEqual(
            expect.arrayContaining([
                'provider-network',
                'media-network',
                'sqlite-write-heavy',
                'cpu-model',
                'cpu-analysis',
                'remote-storage-network'
            ])
        )
        expect(snapshot.usage['sqlite-write-heavy']).toBe(2)

        if (providerA.acquired) providerA.lease.release()
        if (providerB.acquired) providerB.lease.release()
        expect(coordinator.snapshot().active).toHaveLength(0)
    })

    it('keeps lease release idempotent', () => {
        const coordinator = new RuntimeResourceCoordinator()
        const result = coordinator.tryAcquire({
            taskId: 'repair',
            taskType: 'maintenance-repair-scan',
            priority: 'maintenance',
            resources: ['filesystem-heavy']
        })
        if (!result.acquired) throw new Error('lease was not acquired')
        result.lease.release()
        result.lease.release()
        expect(coordinator.snapshot().active).toEqual([])
    })

    it('wires H1 tasks and download runtime into the shared registry', () => {
        const service = fs.readFileSync('src/library/service.ts', 'utf8')
        const server = fs.readFileSync('src/library/server.ts', 'utf8')

        expect(service).toContain('new RuntimeResourceCoordinator()')
        expect(service).toContain("'maintenance-update-scan'")
        expect(service).toContain("['provider-network', 'sqlite-write-heavy']")
        expect(service).toContain("'maintenance-repair-scan'")
        expect(service).toContain("['filesystem-heavy']")
        expect(service).toContain("'library-organize-views'")
        expect(service).toContain("'download-queue'")
        expect(service).toContain("['media-network', 'sqlite-write-heavy']")
        expect(service).toContain('resources.lease.release()')

        expect(server).toContain(
            "url.pathname === '/api/v1/runtime/resources'"
        )
        expect(server).toContain(
            'runtimeResources: options.service.runtimeResourceStatus()'
        )
    })
})
