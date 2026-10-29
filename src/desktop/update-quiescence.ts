/**
 * CORE-LIB-04c-02c-01: pre-handoff Desktop activity admission.
 *
 * Reuses the original InstanceLock.assertHeld() and the Desktop's existing
 * activeDesktopWorkLeases() inventory rather than starting a new scheduler.
 *
 * This is a synchronous, fail-closed check immediately BEFORE the existing
 * helper-start transaction. It does NOT freeze new requests, prove all
 * writers are observed, or authorize cross-file SQLite+media snapshots.
 * Application shutdown and helper process-proof are separate existing gates.
 */
import type { InstanceLock } from './instance'

export class DesktopUpgradeQuiescenceError extends Error {
    readonly code: 'DESKTOP_UPDATE_NOT_READY' | 'DESKTOP_UPDATE_ACTIVE_WORK'
    constructor(code: 'DESKTOP_UPDATE_NOT_READY' | 'DESKTOP_UPDATE_ACTIVE_WORK') {
        super(code === 'DESKTOP_UPDATE_ACTIVE_WORK'
            ? 'Finish, pause and fully stop active work before applying an update.'
            : 'Desktop upgrade cannot begin until the owned library is ready.')
        this.code = code
        this.name = 'DesktopUpgradeQuiescenceError'
    }
}

export interface DesktopUpgradeQuiescencePort {
    readonly ownership: Pick<InstanceLock, 'assertHeld'>
    /** The real Desktop state, not an inferred process or PID. */
    readonly engineReady: boolean
    readonly stopping: boolean
    readonly hasDatabase: boolean
    readonly hasService: boolean
    /**
     * Existing Desktop activity collector: local/download jobs,
     * remote WebDAV sync, source inspection, source-host Reader, mobile
     * bridge, recommendation/favorites/export and runtime resource leases.
     */
    readonly activeWorkLeases: () => readonly string[]
}

/**
 * Merge the EXISTING Desktop collector with the EXISTING LibraryService
 * task diagnostics and RuntimeResourceCoordinator snapshots. The older idle
 * browser detector does not necessarily include organize/maintenance/v5
 * shadow/work-identity tasks or resource acquisitions still waiting.
 *
 * No task names or error text escape from this function to the user.
 * Invalid/missing snapshots fail closed instead of silently meaning idle.
 */
export function collectDesktopUpgradeWorkLeases(
    existing: readonly string[],
    diagnosticInput: unknown,
    resourceInput: unknown
): string[] {
    const fail = () => {
        throw new DesktopUpgradeQuiescenceError('DESKTOP_UPDATE_NOT_READY')
    }
    if (!Array.isArray(existing) ||
        existing.some(item => typeof item !== 'string' || !item.trim()))
        return fail()
    if (!diagnosticInput || typeof diagnosticInput !== 'object' ||
        !('schemaVersion' in diagnosticInput) ||
        diagnosticInput.schemaVersion !== 1 ||
        !('tasks' in diagnosticInput) ||
        !Array.isArray(diagnosticInput.tasks))
        return fail()
    if (!resourceInput || typeof resourceInput !== 'object' ||
        !('active' in resourceInput) ||
        !Array.isArray(resourceInput.active) ||
        !('waiting' in resourceInput) ||
        !Array.isArray(resourceInput.waiting))
        return fail()
    const statuses = diagnosticInput.tasks as unknown[]
    const cleanStates = new Set(['idle', 'complete', 'cancelled'])
    const knownStates = new Set([
        ...cleanStates, 'waiting', 'running', 'pausing', 'paused',
        'cancelling', 'failed', 'unknown'
    ])
    let taskActive = false
    for (const item of statuses) {
        if (!item || typeof item !== 'object' ||
            !('taskKey' in item) || typeof item.taskKey !== 'string' ||
            !item.taskKey.trim() ||
            !('state' in item) || typeof item.state !== 'string' ||
            !knownStates.has(item.state) ||
            !('active' in item) || typeof item.active !== 'boolean' ||
            !('resourceState' in item) ||
            !['none', 'running', 'waiting'].includes(String(item.resourceState)))
            return fail()
        if (item.active || !cleanStates.has(item.state) ||
            item.resourceState !== 'none') taskActive = true
    }
    const resources = resourceInput as { active: unknown[]; waiting: unknown[] }
    return [
        ...existing,
        ...(taskActive ? ['library-task-not-idle'] : []),
        ...(resources.active.length || resources.waiting.length
            ? ['runtime-resource-not-drained'] : [])
    ]
}

/**
 * No operations on source files, PIDs, user data or update payloads.
 * The original owner must still hold its exact lock before and after
 * gathering the currently active work statuses.
 */
export function requireDesktopUpgradeQuiescence(
    port: DesktopUpgradeQuiescencePort
): void {
    port.ownership.assertHeld()
    if (!port.engineReady || port.stopping ||
        !port.hasDatabase || !port.hasService)
        throw new DesktopUpgradeQuiescenceError('DESKTOP_UPDATE_NOT_READY')
    let leases: readonly string[]
    try {
        leases = port.activeWorkLeases()
    } catch {
        throw new DesktopUpgradeQuiescenceError('DESKTOP_UPDATE_NOT_READY')
    }
    if (!Array.isArray(leases) ||
        leases.some(lease => typeof lease !== 'string' || !lease.trim()))
        throw new DesktopUpgradeQuiescenceError('DESKTOP_UPDATE_NOT_READY')
    // A future caller cannot claim "idle" by silently hiding bad data
    // behind a false/unknown status: this port expects the full original
    // Desktop collector, not a list read from the update UI.
    if (leases.length !== 0)
        throw new DesktopUpgradeQuiescenceError('DESKTOP_UPDATE_ACTIVE_WORK')
    port.ownership.assertHeld()
}
