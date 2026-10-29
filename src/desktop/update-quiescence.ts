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
