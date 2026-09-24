import { describe, expect, it } from 'vitest'
import {
    RuntimeResourceAcquireCancelledError,
    RuntimeResourceCoordinator
} from '../../src/runtime/resource-coordinator'

describe('runtime resource coordinator', () => {
    it('observes overlapping resource use without enforcing invented production budgets', async () => {
        const coordinator = new RuntimeResourceCoordinator({
            mode: 'observe',
            historyLimit: 10
        })
        const first = await coordinator.acquire({
            ownerId: 'maintenance-update',
            taskType: 'maintenance-update-scan',
            resources: {
                'provider-network': 1,
                'sqlite-write-heavy': 1
            }
        })
        const second = await coordinator.acquire({
            ownerId: 'shadow',
            taskType: 'recommendation-v5-shadow',
            resources: {
                'provider-network': 1,
                'cpu-analysis': 1
            }
        })

        const snapshot = coordinator.snapshot()
        expect(snapshot.mode).toBe('observe')
        expect(snapshot.enforcementEnabled).toBe(false)
        expect(snapshot.budgets['provider-network']).toBeNull()
        expect(snapshot.usage['provider-network']).toBe(2)
        expect(snapshot.peakUsage['provider-network']).toBe(2)
        expect(snapshot.active).toHaveLength(2)
        expect(snapshot.waiting).toHaveLength(0)

        first.release()
        second.release()
        expect(coordinator.snapshot().usage['provider-network']).toBe(0)
    })

    it('acquires multi-resource requests atomically in enforcement mode', async () => {
        const coordinator = new RuntimeResourceCoordinator({
            mode: 'enforce',
            budgets: {
                'cpu-analysis': 1,
                'sqlite-write-heavy': 1
            }
        })
        const first = await coordinator.acquire({
            ownerId: 'first',
            taskType: 'analysis',
            resources: {
                'cpu-analysis': 1
            }
        })

        let resolved = false
        const pending = coordinator
            .acquire({
                ownerId: 'second',
                taskType: 'analysis-persist',
                resources: {
                    'cpu-analysis': 1,
                    'sqlite-write-heavy': 1
                }
            })
            .then((lease) => {
                resolved = true
                return lease
            })

        await Promise.resolve()
        expect(resolved).toBe(false)
        expect(coordinator.snapshot().usage['sqlite-write-heavy']).toBe(0)
        expect(coordinator.snapshot().waiting).toHaveLength(1)

        first.release()
        const second = await pending
        expect(coordinator.snapshot().usage).toMatchObject({
            'cpu-analysis': 1,
            'sqlite-write-heavy': 1
        })
        second.release()
    })

    it('prefers foreground work over older background waiters without preempting active work', async () => {
        const coordinator = new RuntimeResourceCoordinator({
            mode: 'enforce',
            budgets: { 'cpu-analysis': 1 }
        })
        const active = await coordinator.acquire({
            ownerId: 'active',
            taskType: 'analysis',
            priority: 'background',
            resources: { 'cpu-analysis': 1 }
        })

        const order: string[] = []
        const background = coordinator
            .acquire({
                ownerId: 'background',
                taskType: 'analysis',
                priority: 'background',
                resources: { 'cpu-analysis': 1 }
            })
            .then((lease) => {
                order.push('background')
                return lease
            })
        const foreground = coordinator
            .acquire({
                ownerId: 'foreground',
                taskType: 'analysis',
                priority: 'foreground',
                resources: { 'cpu-analysis': 1 }
            })
            .then((lease) => {
                order.push('foreground')
                return lease
            })

        active.release()
        const foregroundLease = await foreground
        expect(order).toEqual(['foreground'])
        expect(coordinator.snapshot().waiting[0]?.ownerId).toBe('background')

        foregroundLease.release()
        const backgroundLease = await background
        expect(order).toEqual(['foreground', 'background'])
        backgroundLease.release()
    })

    it('removes a cancelled waiter without consuming capacity', async () => {
        const coordinator = new RuntimeResourceCoordinator({
            mode: 'enforce',
            budgets: { 'filesystem-heavy': 1 }
        })
        const active = await coordinator.acquire({
            ownerId: 'active',
            taskType: 'organize',
            resources: { 'filesystem-heavy': 1 }
        })
        const controller = new AbortController()
        const pending = coordinator.acquire({
            ownerId: 'waiting',
            taskType: 'repair',
            resources: { 'filesystem-heavy': 1 },
            signal: controller.signal
        })

        controller.abort()
        await expect(pending).rejects.toBeInstanceOf(
            RuntimeResourceAcquireCancelledError
        )
        expect(coordinator.snapshot().waiting).toHaveLength(0)
        expect(coordinator.snapshot().usage['filesystem-heavy']).toBe(1)

        active.release()
        expect(coordinator.snapshot().usage['filesystem-heavy']).toBe(0)
    })

    it('releases leases idempotently and bounds recent event history', async () => {
        const coordinator = new RuntimeResourceCoordinator({
            mode: 'observe',
            historyLimit: 2
        })
        const lease = await coordinator.acquire({
            ownerId: 'download',
            taskType: 'local-download',
            resources: { 'media-network': 1 }
        })
        lease.release()
        lease.release()

        const snapshot = coordinator.snapshot()
        expect(snapshot.active).toHaveLength(0)
        expect(snapshot.recent).toHaveLength(2)
        expect(snapshot.recent.map((item) => item.type)).toEqual([
            'started',
            'released'
        ])
    })

    it('rejects impossible or malformed resource requests before queueing them', async () => {
        const coordinator = new RuntimeResourceCoordinator({
            mode: 'enforce',
            budgets: { 'cpu-analysis': 1 }
        })

        await expect(
            coordinator.acquire({
                ownerId: 'too-large',
                taskType: 'analysis',
                resources: { 'cpu-analysis': 2 }
            })
        ).rejects.toThrow('exceeds capacity')

        expect(() =>
            coordinator.acquire({
                ownerId: 'bad-weight',
                taskType: 'analysis',
                resources: { 'cpu-analysis': 0 }
            })
        ).toThrow('positive integer')
    })
})
