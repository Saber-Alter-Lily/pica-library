import type { RemoteStorageDesktopManager } from './desktop-manager'

/**
 * Existing Desktop WebDAV/remote-storage command surface, decoupled from the
 * provider-enabled Desktop composition root. This port NEVER creates a
 * provider, opens a network connection or touches credentials on import.
 *
 * The existing RemoteStorageDesktopManager is still the sole implementation
 * and authority for target scope, credential storage, sync leases, idempotency,
 * explicit destructive confirmation and durable library updates.
 */
export type CoreRemoteStoragePort = Pick<
    RemoteStorageDesktopManager,
    'save' | 'sync' | 'syncControl' | 'deleteCopies' | 'status'
>

export type CoreRemoteAction =
    | 'save'
    | 'sync'
    | 'pause-sync'
    | 'resume-sync'
    | 'cancel-sync'
    | 'delete-remote'

const ACTIONS = new Set<CoreRemoteAction>([
    'save', 'sync', 'pause-sync', 'resume-sync', 'cancel-sync', 'delete-remote'
])

export function coreRemoteStorageActionName(
    input: Record<string, unknown>
): CoreRemoteAction | null {
    const name = String(input.remoteStorageAction ?? '')
    return ACTIONS.has(name as CoreRemoteAction)
        ? name as CoreRemoteAction
        : null
}

export function coreRemoteStorageStatus(manager?: CoreRemoteStoragePort | null) {
    return manager?.status() ?? { configured: false, kind: 'webdav' as const }
}

export type CoreRemoteDispatch =
    | { handled: false }
    | { handled: true; value: Record<string, unknown> }

/**
 * Preserve the original Desktop save dispatch and all manager validation.
 * Unknown actions must continue to the old settings path unchanged.
 * Only a USER-initiated call to this method can initiate WebDAV I/O.
 */
export async function coreRemoteStorageDispatch(
    input: Record<string, unknown>,
    manager?: CoreRemoteStoragePort | null
): Promise<CoreRemoteDispatch> {
    const action = coreRemoteStorageActionName(input)
    if (!action) return { handled: false }
    if (!manager) throw new Error('Remote storage is not ready')
    if (action === 'save') return {
        handled: true, value: manager.save(input)
    }
    if (action === 'sync') return {
        handled: true, value: await manager.sync(input)
    }
    if (action === 'delete-remote') return {
        handled: true, value: await manager.deleteCopies(input)
    }
    return {
        handled: true,
        value: {
            success: true,
            syncProgress: manager.syncControl(
                action === 'pause-sync' ? 'pause'
                    : action === 'resume-sync' ? 'resume' : 'cancel'
            )
        }
    }
}
