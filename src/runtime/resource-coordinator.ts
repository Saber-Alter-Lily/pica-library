import { randomUUID } from 'node:crypto'

export const runtimeResourceClasses = [
    'provider-network',
    'media-network',
    'remote-storage-network',
    'cpu-model',
    'cpu-analysis',
    'filesystem-heavy',
    'sqlite-write-heavy'
] as const

export type RuntimeResourceClass = (typeof runtimeResourceClasses)[number]
export type RuntimeTaskPriority =
    | 'interactive'
    | 'background'
    | 'maintenance'

export interface RuntimeResourceClaimInput {
    taskId: string
    taskType: string
    priority: RuntimeTaskPriority
    resources: RuntimeResourceClass[]
}

export interface RuntimeResourceClaimSnapshot {
    leaseId: string
    taskId: string
    taskType: string
    priority: RuntimeTaskPriority
    resources: RuntimeResourceClass[]
    acquiredAt: string
}

export interface RuntimeResourceBlock {
    resource: RuntimeResourceClass
    capacity: number
    active: RuntimeResourceClaimSnapshot[]
}

export interface RuntimeResourceLease {
    claim: RuntimeResourceClaimSnapshot
    release(): void
}

export type RuntimeResourceAcquireResult =
    | {
          acquired: true
          lease: RuntimeResourceLease
      }
    | {
          acquired: false
          blockedBy: RuntimeResourceBlock[]
      }

const initialEnforcedCapacities: Partial<
    Record<RuntimeResourceClass, number>
> = {
    // P2-C1 deliberately enforces only the clearest contention case:
    // concurrent background filesystem scans/materialization. Other resource
    // classes remain observable until P2-J/K measurements justify limits.
    'filesystem-heavy': 1
}

function normalizedResources(resources: RuntimeResourceClass[]) {
    const allowed = new Set<RuntimeResourceClass>(runtimeResourceClasses)
    return [...new Set(resources)].filter((resource) => allowed.has(resource))
}

export class RuntimeResourceCoordinator {
    private readonly active = new Map<
        string,
        RuntimeResourceClaimSnapshot
    >()

    constructor(
        private readonly enforcedCapacities: Partial<
            Record<RuntimeResourceClass, number>
        > = initialEnforcedCapacities
    ) {}

    tryAcquire(input: RuntimeResourceClaimInput): RuntimeResourceAcquireResult {
        const resources = normalizedResources(input.resources)
        const blockedBy: RuntimeResourceBlock[] = []

        for (const resource of resources) {
            const capacity = this.enforcedCapacities[resource]
            if (!capacity) continue
            const active = [...this.active.values()].filter((claim) =>
                claim.resources.includes(resource)
            )
            if (active.length >= capacity)
                blockedBy.push({
                    resource,
                    capacity,
                    active
                })
        }

        if (blockedBy.length) return { acquired: false, blockedBy }

        const claim: RuntimeResourceClaimSnapshot = {
            leaseId: randomUUID(),
            taskId: String(input.taskId).trim(),
            taskType: String(input.taskType).trim(),
            priority: input.priority,
            resources,
            acquiredAt: new Date().toISOString()
        }
        this.active.set(claim.leaseId, claim)

        let released = false
        return {
            acquired: true,
            lease: {
                claim,
                release: () => {
                    if (released) return
                    released = true
                    this.active.delete(claim.leaseId)
                }
            }
        }
    }

    snapshot() {
        const active = [...this.active.values()].sort(
            (left, right) =>
                left.acquiredAt.localeCompare(right.acquiredAt) ||
                left.leaseId.localeCompare(right.leaseId)
        )
        const usage = Object.fromEntries(
            runtimeResourceClasses.map((resource) => [
                resource,
                active.filter((claim) => claim.resources.includes(resource))
                    .length
            ])
        ) as Record<RuntimeResourceClass, number>
        const enforcedCapacities = Object.fromEntries(
            Object.entries(this.enforcedCapacities).filter(
                ([, value]) => Number.isInteger(value) && Number(value) > 0
            )
        )

        return {
            schemaVersion: 1,
            mode: 'P2_C1_RESOURCE_LEASES',
            active,
            usage,
            policy: {
                enforcedCapacities,
                observeOnly: runtimeResourceClasses.filter(
                    (resource) => !(resource in enforcedCapacities)
                )
            }
        }
    }
}
