import { setTimeout as delay } from 'node:timers/promises'
import type { DownloadJob } from './types'

export interface QueueStore {
    nextDownloadJobs(limit: number): DownloadJob[]
    getDownloadJob(id: string): DownloadJob
    transitionDownloadJob(
        id: string,
        status: DownloadJob['status'],
        patch?: Partial<Pick<DownloadJob, 'error' | 'retryCount'>>
    ): DownloadJob
}

export interface SchedulerOptions {
    concurrency?: number
    requestIntervalMs?: number
    maxRetries?: number
    retryBaseMs?: number
}

export class DownloadScheduler {
    private stopped = false
    private readonly concurrency: number
    private readonly requestIntervalMs: number
    private readonly maxRetries: number
    private readonly retryBaseMs: number

    constructor(
        private readonly store: QueueStore,
        private readonly execute: (job: DownloadJob) => Promise<void>,
        options: SchedulerOptions = {}
    ) {
        this.concurrency = Math.max(1, options.concurrency ?? 2)
        this.requestIntervalMs = Math.max(0, options.requestIntervalMs ?? 250)
        this.maxRetries = Math.max(0, options.maxRetries ?? 2)
        this.retryBaseMs = Math.max(0, options.retryBaseMs ?? 1000)
    }

    stop() {
        this.stopped = true
    }

    async drain(): Promise<void> {
        this.stopped = false
        while (!this.stopped) {
            const jobs = this.store.nextDownloadJobs(this.concurrency)
            if (jobs.length === 0) return
            await Promise.all(jobs.map((job) => this.run(job)))
        }
    }

    private async run(job: DownloadJob) {
        let current = this.store.transitionDownloadJob(job.id, 'PREPARING')
        try {
            if (this.requestIntervalMs) await delay(this.requestIntervalMs)
            current = this.store.getDownloadJob(job.id)
            if (current.status === 'PAUSED' || current.status === 'CANCELLED')
                return
            current = this.store.transitionDownloadJob(job.id, 'RUNNING')
            await this.execute(current)
            current = this.store.getDownloadJob(job.id)
            if (current.status === 'PAUSED' || current.status === 'CANCELLED')
                return
            this.store.transitionDownloadJob(job.id, 'COMPLETED', {
                error: null
            })
        } catch (error) {
            current = this.store.getDownloadJob(job.id)
            if (current.status === 'PAUSED' || current.status === 'CANCELLED')
                return
            const message = error instanceof Error ? error.message : String(error)
            const retryCount = current.retryCount + 1
            if (retryCount <= this.maxRetries) {
                this.store.transitionDownloadJob(job.id, 'RETRY_WAIT', {
                    error: message,
                    retryCount
                })
                if (this.retryBaseMs)
                    await delay(this.retryBaseMs * 2 ** (retryCount - 1))
                this.store.transitionDownloadJob(job.id, 'QUEUED')
            } else {
                this.store.transitionDownloadJob(job.id, 'FAILED', {
                    error: message,
                    retryCount
                })
            }
        }
    }
}
