/** Installation-local source choices. Credentials and library membership are separate. */
export const SOURCE_IDS = ['pica', 'eh', 'jm'] as const
export type SourceId = (typeof SOURCE_IDS)[number]

export interface SourcePolicyV1 {
    schemaVersion: 1
    revision: number
    enabled: SourceId[]
}

export class SourceDisabledError extends Error {
    readonly code = 'SOURCE_DISABLED'
    constructor(readonly sourceId: SourceId) {
        super(`Source is disabled: ${sourceId}`)
        this.name = 'SourceDisabledError'
    }
}

export function normalizeSourcePolicy(value: unknown): SourcePolicyV1 {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid source policy')
    const input = value as Record<string, unknown>
    if (
        Object.keys(input).some(
            (key) => !['schemaVersion', 'revision', 'enabled'].includes(key)
        ) ||
        input.schemaVersion !== 1 ||
        !Number.isSafeInteger(input.revision) ||
        Number(input.revision) < 0 ||
        !Array.isArray(input.enabled) ||
        input.enabled.length > SOURCE_IDS.length ||
        input.enabled.some((id) => !SOURCE_IDS.includes(id)) ||
        new Set(input.enabled).size !== input.enabled.length
    )
        throw new Error('Invalid source policy')
    const enabled = input.enabled as SourceId[]
    return {
        schemaVersion: 1,
        revision: Number(input.revision),
        enabled: SOURCE_IDS.filter((id) => enabled.includes(id))
    }
}

export function initialSourcePolicy(legacy = false): SourcePolicyV1 {
    return {
        schemaVersion: 1,
        revision: 0,
        enabled: legacy ? [...SOURCE_IDS] : []
    }
}

export interface SourceLease {
    readonly signal: AbortSignal
    check(): void
}
export type SourceAccess = (source: SourceId) => SourceLease

/** No persistence/network ownership. Standard abort signals fence existing requests. */
export class SourceRuntime {
    private policy: SourcePolicyV1
    private readonly controllers = new Map<SourceId, AbortController>()

    constructor(policy = initialSourcePolicy()) {
        this.policy = normalizeSourcePolicy(policy)
        for (const id of SOURCE_IDS)
            this.controllers.set(id, new AbortController())
    }

    snapshot() {
        return normalizeSourcePolicy(this.policy)
    }
    isEnabled(id: SourceId) {
        return this.policy.enabled.includes(id)
    }

    readonly acquire: SourceAccess = (id) => {
        const controller = this.controllers.get(id)
        if (!controller || !this.isEnabled(id))
            throw new SourceDisabledError(id)
        return {
            signal: controller.signal,
            check: () => {
                if (controller.signal.aborted || !this.isEnabled(id))
                    throw new SourceDisabledError(id)
            }
        }
    }

    async run<T>(id: SourceId, work: () => Promise<T>): Promise<T> {
        const lease = this.acquire(id)
        try {
            const result = await work()
            lease.check()
            return result
        } catch (error) {
            lease.check()
            throw error
        }
    }

    /** Validate a proposed write before persisting. Stale UI requests cannot overwrite newer choices. */
    prepare(enabled: unknown, expectedRevision: unknown) {
        if (expectedRevision !== this.policy.revision)
            throw new Error('Source choices changed; refresh before saving')
        return normalizeSourcePolicy({
            schemaVersion: 1,
            revision: this.policy.revision + 1,
            enabled
        })
    }

    /** The application persists first. This synchronous commit cannot leave a half-applied policy. */
    apply(value: SourcePolicyV1) {
        const next = normalizeSourcePolicy(value)
        const disabled = SOURCE_IDS.filter(
            (id) => this.isEnabled(id) && !next.enabled.includes(id)
        )
        this.policy = next
        for (const id of disabled) {
            this.controllers.get(id)!.abort(new SourceDisabledError(id))
            this.controllers.set(id, new AbortController())
        }
        return disabled
    }
}
