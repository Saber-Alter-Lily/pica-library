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
    jobConcurrency?: number
    maxRetries?: number
    retryBaseMs?: number
    retryDelay?: (milliseconds: number) => Promise<void>
}

export class DownloadScheduler {
    private stopped = false
    private stopWaiter: (() => void) | null = null
    private stopSignal = new Promise<void>((resolve) => {
        this.stopWaiter = resolve
    })
    private readonly jobConcurrency: number
    private readonly maxRetries: number
    private readonly retryBaseMs: number
    private readonly retryDelay: (milliseconds: number) => Promise<void>

    constructor(
        private readonly store: QueueStore,
        private readonly execute: (job: DownloadJob) => Promise<void>,
        options: SchedulerOptions = {}
    ) {
        this.jobConcurrency = Math.max(1, options.jobConcurrency ?? 2)
        this.maxRetries = Math.max(0, options.maxRetries ?? 2)
        this.retryBaseMs = Math.max(0, options.retryBaseMs ?? 1000)
        this.retryDelay = options.retryDelay ?? delay
    }

    stop() {
        this.stopped = true
        this.stopWaiter?.()
    }

    async drain(): Promise<void> {
        this.stopped = false
        this.stopSignal = new Promise<void>((resolve) => {
            this.stopWaiter = resolve
        })
        while (!this.stopped) {
            const jobs = this.store.nextDownloadJobs(this.jobConcurrency)
            if (jobs.length === 0) return
            await Promise.all(jobs.map((job) => this.run(job)))
        }
    }

    private async run(job: DownloadJob) {
        let current = this.store.transitionDownloadJob(job.id, 'PREPARING')
        try {
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
            const message =
                error instanceof Error ? error.message : String(error)
            const retryCount = current.retryCount + 1
            if (retryCount <= this.maxRetries) {
                this.store.transitionDownloadJob(job.id, 'RETRY_WAIT', {
                    error: message,
                    retryCount
                })
                if (this.retryBaseMs)
                    await Promise.race([
                        this.retryDelay(
                            this.retryBaseMs * 2 ** (retryCount - 1)
                        ),
                        this.stopSignal
                    ])
                if (this.stopped) return
                current = this.store.getDownloadJob(job.id)
                if (
                    current.status === 'CANCELLED' ||
                    current.status === 'PAUSED'
                )
                    return
                if (current.status !== 'RETRY_WAIT') return
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
