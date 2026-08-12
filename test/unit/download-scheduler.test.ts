import { describe, expect, it } from 'vitest'
import { DownloadScheduler, type QueueStore } from '../../src/core/downloads/scheduler'
import { assertTransition } from '../../src/core/downloads/state-machine'
import type { DownloadJob } from '../../src/core/downloads/types'

function job(id: string): DownloadJob {
    return {
        id,
        comicId: `comic-${id}`,
        episodeOrders: [],
        source: 'manual',
        priority: 0,
        runner: 'LOCAL',
        status: 'QUEUED',
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        retryCount: 0,
        progressCompleted: 0,
        progressTotal: 0,
        bytes: 0,
        error: null
    }
}

function store(initial: DownloadJob[]): QueueStore & { jobs: DownloadJob[] } {
    return {
        jobs: initial,
        nextDownloadJobs(limit) {
            return this.jobs.filter((item) => item.status === 'QUEUED').slice(0, limit)
        },
        getDownloadJob(id) {
            return { ...this.jobs.find((candidate) => candidate.id === id)! }
        },
        transitionDownloadJob(id, status, patch = {}) {
            const item = this.jobs.find((candidate) => candidate.id === id)!
            assertTransition(item.status, status)
            Object.assign(item, patch, { status })
            return { ...item }
        }
    }
}

describe('global download scheduler', () => {
    it('never exceeds global concurrency', async () => {
        const queue = store([job('1'), job('2'), job('3'), job('4')])
        let active = 0
        let peak = 0
        const scheduler = new DownloadScheduler(
            queue,
            async () => {
                active += 1
                peak = Math.max(peak, active)
                await new Promise((resolve) => setTimeout(resolve, 5))
                active -= 1
            },
            { concurrency: 2, requestIntervalMs: 0 }
        )
        await scheduler.drain()
        expect(peak).toBe(2)
        expect(queue.jobs.every((item) => item.status === 'COMPLETED')).toBe(true)
    })

    it('requeues a transient failure and then completes', async () => {
        const queue = store([job('retry')])
        let attempts = 0
        const scheduler = new DownloadScheduler(
            queue,
            async () => {
                attempts += 1
                if (attempts === 1) throw new Error('temporary')
            },
            { requestIntervalMs: 0, retryBaseMs: 0, maxRetries: 1 }
        )
        await scheduler.drain()
        expect(attempts).toBe(2)
        expect(queue.jobs[0]).toMatchObject({ status: 'COMPLETED', retryCount: 1 })
    })

    it('does not overwrite a pause requested during execution', async () => {
        const queue = store([job('pause')])
        const scheduler = new DownloadScheduler(
            queue,
            async (running) => {
                queue.transitionDownloadJob(running.id, 'PAUSED')
            },
            { requestIntervalMs: 0 }
        )
        await scheduler.drain()
        expect(queue.jobs[0].status).toBe('PAUSED')
    })
})
