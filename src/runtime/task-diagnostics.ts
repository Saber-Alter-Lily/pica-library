export type RuntimeTaskDiagnosticState =
    | 'idle'
    | 'waiting'
    | 'running'
    | 'pausing'
    | 'paused'
    | 'cancelling'
    | 'complete'
    | 'failed'
    | 'cancelled'
    | 'unknown'

export type RuntimeTaskPauseSemantics =
    | 'in_place'
    | 'durable_safe_stop'
    | 'unsupported'

export type RuntimeTaskResourceState = 'running' | 'waiting' | 'none'

export interface RuntimeTaskDiagnostic {
    taskKey: string
    taskId: string | null
    taskType: string
    owner: string
    state: RuntimeTaskDiagnosticState
    active: boolean
    phase: string | null
    done: number | null
    total: number | null
    startedAt: string | null
    updatedAt: string | null
    finishedAt: string | null
    canPause: boolean | null
    canResume: boolean | null
    canCancel: boolean | null
    canRetry: boolean | null
    pauseSemantics: RuntimeTaskPauseSemantics | null
    resourceClasses: string[]
    resourceState: RuntimeTaskResourceState
    resourcePriority: string | null
    resourceRequestedAt: string | null
    resourceStartedAt: string | null
    waitDurationMs: number | null
    runDurationMs: number | null
    retryCount: number | null
    lastError: string | null
    providerRoute: string | null
    recoveryMode: string | null
    commitBoundary: string | null
}

interface ResourceLeaseLike {
    leaseId?: string
    taskType?: string
    priority?: string
    resources?: Record<string, number | undefined>
    requestedAt?: string
    startedAt?: string
}

export interface RuntimeTaskResourceSnapshotLike {
    active?: ResourceLeaseLike[]
    waiting?: ResourceLeaseLike[]
}

export interface RuntimeTaskDiagnosticInput {
    taskKey: string
    taskId?: unknown
    taskType: string
    owner?: string
    state?: unknown
    active?: boolean
    phase?: unknown
    done?: unknown
    total?: unknown
    startedAt?: unknown
    updatedAt?: unknown
    finishedAt?: unknown
    canPause?: unknown
    canResume?: unknown
    canCancel?: unknown
    canRetry?: unknown
    pauseSemantics?: RuntimeTaskPauseSemantics | null
    resourceClasses?: string[]
    retryCount?: unknown
    lastError?: unknown
    providerRoute?: string | null
    recoveryMode?: string | null
    commitBoundary?: string | null
}

const ACTIVE_STATES = new Set<RuntimeTaskDiagnosticState>([
    'waiting',
    'running',
    'pausing',
    'paused',
    'cancelling'
])

function stringOrNull(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed ? trimmed : null
}

function numberOrNull(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function booleanOrNull(value: unknown) {
    return typeof value === 'boolean' ? value : null
}

function stateValue(value: unknown): RuntimeTaskDiagnosticState {
    const state = String(value ?? '').trim().toLowerCase()
    if (
        state === 'idle' ||
        state === 'waiting' ||
        state === 'running' ||
        state === 'pausing' ||
        state === 'paused' ||
        state === 'cancelling' ||
        state === 'complete' ||
        state === 'failed' ||
        state === 'cancelled'
    )
        return state
    return 'unknown'
}

function durationMs(from: string | null, toMs: number) {
    if (!from) return null
    const started = Date.parse(from)
    if (!Number.isFinite(started)) return null
    return Math.max(0, toMs - started)
}

export function sanitizeRuntimeDiagnosticError(value: unknown) {
    const original = stringOrNull(value)
    if (!original) return null
    return original
        .slice(0, 800)
        .replace(/https?:\/\/[^\s]+/gi, '[url]')
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
        .replace(
            /\b(password|token|cookie|authorization)\s*[:=]\s*[^\s,;]+/gi,
            '$1=[redacted]'
        )
        .replace(/[A-Za-z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n]*/g, '[path]')
        .replace(/\/(?:[^/\s]+\/){2,}[^/\s]*/g, '[path]')
}

function resourceObservation(
    taskType: string,
    declared: string[],
    snapshot: RuntimeTaskResourceSnapshotLike,
    nowMs: number
) {
    const active = (snapshot.active ?? []).filter(
        (item) => item.taskType === taskType
    )
    const waiting = (snapshot.waiting ?? []).filter(
        (item) => item.taskType === taskType
    )
    const current = active[0] ?? waiting[0] ?? null
    const observed = new Set(declared)
    for (const item of [...active, ...waiting])
        for (const [resource, weight] of Object.entries(item.resources ?? {}))
            if (Number(weight) > 0) observed.add(resource)

    const resourceState: RuntimeTaskResourceState =
        active.length > 0 ? 'running' : waiting.length > 0 ? 'waiting' : 'none'
    const requestedAt = stringOrNull(current?.requestedAt)
    const startedAt = stringOrNull(active[0]?.startedAt)

    return {
        resourceClasses: [...observed].sort(),
        resourceState,
        resourcePriority: stringOrNull(current?.priority),
        resourceRequestedAt: requestedAt,
        resourceStartedAt: startedAt,
        waitDurationMs:
            resourceState === 'waiting' ? durationMs(requestedAt, nowMs) : null,
        runDurationMs:
            resourceState === 'running' ? durationMs(startedAt, nowMs) : null
    }
}

export function runtimeTaskDiagnostic(
    input: RuntimeTaskDiagnosticInput,
    resources: RuntimeTaskResourceSnapshotLike,
    nowMs = Date.now()
): RuntimeTaskDiagnostic {
    const state = stateValue(input.state)
    const observation = resourceObservation(
        input.taskType,
        input.resourceClasses ?? [],
        resources,
        nowMs
    )
    const explicitActive =
        typeof input.active === 'boolean' ? input.active : undefined

    return {
        taskKey: input.taskKey,
        taskId: stringOrNull(input.taskId),
        taskType: input.taskType,
        owner: input.owner ?? 'library-service',
        state,
        active: explicitActive ?? ACTIVE_STATES.has(state),
        phase: stringOrNull(input.phase),
        done: numberOrNull(input.done),
        total: numberOrNull(input.total),
        startedAt: stringOrNull(input.startedAt),
        updatedAt: stringOrNull(input.updatedAt),
        finishedAt: stringOrNull(input.finishedAt),
        canPause: booleanOrNull(input.canPause),
        canResume: booleanOrNull(input.canResume),
        canCancel: booleanOrNull(input.canCancel),
        canRetry: booleanOrNull(input.canRetry),
        pauseSemantics: input.pauseSemantics ?? null,
        ...observation,
        retryCount: numberOrNull(input.retryCount),
        lastError: sanitizeRuntimeDiagnosticError(input.lastError),
        providerRoute: input.providerRoute ?? null,
        recoveryMode: input.recoveryMode ?? null,
        commitBoundary: input.commitBoundary ?? null
    }
}

export interface RuntimeTaskDiagnosticSnapshot {
    schemaVersion: 1
    capturedAt: string
    tasks: RuntimeTaskDiagnostic[]
}

export function runtimeTaskDiagnosticSnapshot(
    inputs: RuntimeTaskDiagnosticInput[],
    resources: RuntimeTaskResourceSnapshotLike,
    now = new Date()
): RuntimeTaskDiagnosticSnapshot {
    const capturedAt = now.toISOString()
    const nowMs = now.getTime()
    return {
        schemaVersion: 1 as const,
        capturedAt,
        tasks: inputs
            .map((input) => runtimeTaskDiagnostic(input, resources, nowMs))
            .sort((left, right) => left.taskKey.localeCompare(right.taskKey))
    }
}
