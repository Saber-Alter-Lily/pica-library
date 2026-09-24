import { randomUUID } from 'node:crypto'

export const RUNTIME_RESOURCE_CLASSES = [
    'provider-network',
    'media-network',
    'remote-storage-network',
    'cpu-model',
    'cpu-analysis',
    'filesystem-heavy',
    'sqlite-read-heavy',
    'sqlite-write-heavy'
] as const

export type RuntimeResourceClass = (typeof RUNTIME_RESOURCE_CLASSES)[number]
export type RuntimeResourcePriority = 'foreground' | 'user' | 'background'
export type RuntimeResourceMode = 'observe' | 'enforce'

export interface RuntimeResourceRequest {
    ownerId: string
    taskType: string
    priority?: RuntimeResourcePriority
    resources: Partial<Record<RuntimeResourceClass, number>>
    signal?: AbortSignal
}

export interface RuntimeResourceLease {
    readonly id: string
    readonly ownerId: string
    readonly taskType: string
    readonly priority: RuntimeResourcePriority
    readonly resources: Readonly<Partial<Record<RuntimeResourceClass, number>>>
    release(): void
}

interface NormalizedRequest {
    id: string
    ownerId: string
    taskType: string
    priority: RuntimeResourcePriority
    resources: Partial<Record<RuntimeResourceClass, number>>
    requestedAt: string
    sequence: number
}

interface ActiveLeaseRecord extends NormalizedRequest {
    startedAt: string
}

interface WaitingRecord {
    request: NormalizedRequest
    resolve: (lease: RuntimeResourceLease) => void
    reject: (error: Error) => void
    signal?: AbortSignal
    abortHandler?: () => void
}

interface RuntimeResourceEvent {
    type: 'started' | 'released' | 'cancelled'
    leaseId: string
    ownerId: string
    taskType: string
    priority: RuntimeResourcePriority
    resources: Partial<Record<RuntimeResourceClass, number>>
    at: string
}

export class RuntimeResourceAcquireCancelledError extends Error {
    constructor() {
        super('Runtime resource acquisition was cancelled')
        this.name = 'RuntimeResourceAcquireCancelledError'
    }
}

const PRIORITY_ORDER: Record<RuntimeResourcePriority, number> = {
    foreground: 3,
    user: 2,
    background: 1
}

function normalizedResources(
    input: RuntimeResourceRequest['resources']
): Partial<Record<RuntimeResourceClass, number>> {
    const result: Partial<Record<RuntimeResourceClass, number>> = {}
    for (const resource of RUNTIME_RESOURCE_CLASSES) {
        const value = input[resource]
        if (value === undefined) continue
        if (!Number.isInteger(value) || value < 1)
            throw new Error(
                `Runtime resource weight must be a positive integer: ${resource}`
            )
        result[resource] = value
    }
    if (!Object.keys(result).length)
        throw new Error('At least one runtime resource class is required')
    return result
}

function zeroUsage(): Record<RuntimeResourceClass, number> {
    return Object.fromEntries(
        RUNTIME_RESOURCE_CLASSES.map((resource) => [resource, 0])
    ) as Record<RuntimeResourceClass, number>
}

export class RuntimeResourceCoordinator {
    private readonly active = new Map<string, ActiveLeaseRecord>()
    private readonly waiting: WaitingRecord[] = []
    private readonly peakUsage = zeroUsage()
    private readonly recent: RuntimeResourceEvent[] = []
    private sequence = 0

    constructor(
        private readonly options: {
            mode?: RuntimeResourceMode
            budgets?: Partial<Record<RuntimeResourceClass, number>>
            historyLimit?: number
        } = {}
    ) {
        for (const [resource, capacity] of Object.entries(
            options.budgets ?? {}
        )) {
            if (!Number.isInteger(capacity) || Number(capacity) < 1)
                throw new Error(
                    `Runtime resource capacity must be a positive integer: ${resource}`
                )
        }
    }

    private get mode(): RuntimeResourceMode {
        return this.options.mode ?? 'observe'
    }

    private budget(resource: RuntimeResourceClass) {
        return this.options.budgets?.[resource] ?? null
    }

    private usage() {
        const usage = zeroUsage()
        for (const lease of this.active.values())
            for (const resource of RUNTIME_RESOURCE_CLASSES)
                usage[resource] += lease.resources[resource] ?? 0
        return usage
    }

    private canStart(request: NormalizedRequest) {
        if (this.mode === 'observe') return true
        const usage = this.usage()
        for (const resource of RUNTIME_RESOURCE_CLASSES) {
            const weight = request.resources[resource] ?? 0
            if (!weight) continue
            const capacity = this.budget(resource)
            if (capacity === null) continue
            if (weight > capacity)
                throw new Error(
                    `Runtime resource request exceeds capacity: ${resource}`
                )
            if (usage[resource] + weight > capacity) return false
        }
        return true
    }

    private record(event: RuntimeResourceEvent) {
        this.recent.push(event)
        const limit = Math.max(1, this.options.historyLimit ?? 80)
        if (this.recent.length > limit)
            this.recent.splice(0, this.recent.length - limit)
    }

    private updatePeaks() {
        const usage = this.usage()
        for (const resource of RUNTIME_RESOURCE_CLASSES)
            this.peakUsage[resource] = Math.max(
                this.peakUsage[resource],
                usage[resource]
            )
    }

    private lease(record: ActiveLeaseRecord): RuntimeResourceLease {
        let released = false
        return {
            id: record.id,
            ownerId: record.ownerId,
            taskType: record.taskType,
            priority: record.priority,
            resources: Object.freeze({ ...record.resources }),
            release: () => {
                if (released) return
                released = true
                if (!this.active.delete(record.id)) return
                this.record({
                    type: 'released',
                    leaseId: record.id,
                    ownerId: record.ownerId,
                    taskType: record.taskType,
                    priority: record.priority,
                    resources: { ...record.resources },
                    at: new Date().toISOString()
                })
                this.drain()
            }
        }
    }

    private start(request: NormalizedRequest) {
        const record: ActiveLeaseRecord = {
            ...request,
            startedAt: new Date().toISOString()
        }
        this.active.set(record.id, record)
        this.updatePeaks()
        this.record({
            type: 'started',
            leaseId: record.id,
            ownerId: record.ownerId,
            taskType: record.taskType,
            priority: record.priority,
            resources: { ...record.resources },
            at: record.startedAt
        })
        return this.lease(record)
    }

    private removeWaiting(record: WaitingRecord) {
        const index = this.waiting.indexOf(record)
        if (index >= 0) this.waiting.splice(index, 1)
        if (record.signal && record.abortHandler)
            record.signal.removeEventListener('abort', record.abortHandler)
    }

    private orderedWaiting() {
        return [...this.waiting].sort(
            (left, right) =>
                PRIORITY_ORDER[right.request.priority] -
                    PRIORITY_ORDER[left.request.priority] ||
                left.request.sequence - right.request.sequence
        )
    }

    private drain() {
        if (this.mode === 'observe') return
        let advanced = true
        while (advanced) {
            advanced = false
            for (const waiting of this.orderedWaiting()) {
                if (!this.waiting.includes(waiting)) continue
                if (!this.canStart(waiting.request)) continue
                this.removeWaiting(waiting)
                waiting.resolve(this.start(waiting.request))
                advanced = true
                break
            }
        }
    }

    async acquire(input: RuntimeResourceRequest): Promise<RuntimeResourceLease> {
        if (!input.ownerId.trim()) throw new Error('Runtime resource ownerId is required')
        if (!input.taskType.trim()) throw new Error('Runtime resource taskType is required')
        if (input.signal?.aborted)
            throw new RuntimeResourceAcquireCancelledError()

        const request: NormalizedRequest = {
            id: randomUUID(),
            ownerId: input.ownerId,
            taskType: input.taskType,
            priority: input.priority ?? 'background',
            resources: normalizedResources(input.resources),
            requestedAt: new Date().toISOString(),
            sequence: this.sequence++
        }

        if (this.canStart(request)) return this.start(request)

        return await new Promise<RuntimeResourceLease>((resolve, reject) => {
            const waiting: WaitingRecord = {
                request,
                resolve,
                reject,
                signal: input.signal
            }
            if (input.signal) {
                waiting.abortHandler = () => {
                    this.removeWaiting(waiting)
                    this.record({
                        type: 'cancelled',
                        leaseId: request.id,
                        ownerId: request.ownerId,
                        taskType: request.taskType,
                        priority: request.priority,
                        resources: { ...request.resources },
                        at: new Date().toISOString()
                    })
                    reject(new RuntimeResourceAcquireCancelledError())
                }
                input.signal.addEventListener('abort', waiting.abortHandler, {
                    once: true
                })
            }
            this.waiting.push(waiting)
        })
    }

    async withLease<T>(
        input: RuntimeResourceRequest,
        work: () => Promise<T>
    ): Promise<T> {
        const lease = await this.acquire(input)
        try {
            return await work()
        } finally {
            lease.release()
        }
    }

    snapshot() {
        const usage = this.usage()
        return {
            mode: this.mode,
            enforcementEnabled: this.mode === 'enforce',
            budgets: Object.fromEntries(
                RUNTIME_RESOURCE_CLASSES.map((resource) => [
                    resource,
                    this.budget(resource)
                ])
            ) as Record<RuntimeResourceClass, number | null>,
            usage,
            peakUsage: { ...this.peakUsage },
            active: [...this.active.values()]
                .sort(
                    (left, right) =>
                        left.startedAt.localeCompare(right.startedAt) ||
                        left.sequence - right.sequence
                )
                .map((lease) => ({
                    leaseId: lease.id,
                    ownerId: lease.ownerId,
                    taskType: lease.taskType,
                    priority: lease.priority,
                    resources: { ...lease.resources },
                    requestedAt: lease.requestedAt,
                    startedAt: lease.startedAt
                })),
            waiting: this.orderedWaiting().map((item) => ({
                leaseId: item.request.id,
                ownerId: item.request.ownerId,
                taskType: item.request.taskType,
                priority: item.request.priority,
                resources: { ...item.request.resources },
                requestedAt: item.request.requestedAt
            })),
            recent: this.recent.map((event) => ({
                ...event,
                resources: { ...event.resources }
            }))
        }
    }
}
