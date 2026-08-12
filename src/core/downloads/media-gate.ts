import { setTimeout as delay } from 'node:timers/promises'

export class MediaRequestGate {
    private active = 0
    private lastStartedAt = 0
    private readonly waiters: Array<() => void> = []
    private spacingChain: Promise<void> = Promise.resolve()

    constructor(
        readonly concurrency: number,
        readonly requestIntervalMs: number
    ) {
        if (!Number.isInteger(concurrency) || concurrency < 1)
            throw new Error('Media concurrency must be a positive integer')
        if (!Number.isFinite(requestIntervalMs) || requestIntervalMs < 0)
            throw new Error('Request interval must be non-negative')
    }

    async run<T>(request: () => Promise<T>): Promise<T> {
        await this.acquire()
        try {
            await this.spaceStart()
            return await request()
        } finally {
            const next = this.waiters.shift()
            if (next) next()
            else this.active -= 1
        }
    }

    private async acquire() {
        if (this.active < this.concurrency) {
            this.active += 1
            return
        }
        await new Promise<void>((resolve) => this.waiters.push(resolve))
    }

    private async spaceStart() {
        const previous = this.spacingChain
        let release!: () => void
        this.spacingChain = new Promise<void>((resolve) => (release = resolve))
        await previous
        try {
            const wait = Math.max(
                0,
                this.lastStartedAt + this.requestIntervalMs - Date.now()
            )
            if (wait) await delay(wait)
            this.lastStartedAt = Date.now()
        } finally {
            release()
        }
    }
}
