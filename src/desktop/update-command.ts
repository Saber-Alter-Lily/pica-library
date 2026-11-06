export interface DesktopUpdateContext {
    desktopHomeRoot: string
    libraryDirectory: string
    currentUrl?: string
}
export interface DesktopUpdateApplyPort {
    apply(
        id: string,
        context: DesktopUpdateContext
    ): Promise<Record<string, unknown>>
}

/** The existing Desktop host may exit only after the helper acknowledged startup. */
const pendingByHost = new WeakMap<
    DesktopUpdateApplyPort,
    Map<string, Promise<Record<string, unknown>>>
>()
export function applyUpdateAndScheduleShutdown(
    commands: DesktopUpdateApplyPort,
    id: string,
    context: DesktopUpdateContext,
    shutdown: () => void | Promise<void>,
    /**
     * Optional synchronous update admission with a rollback release hook.
     * The acquired fence stays held after helper ACK and is restored ONLY if
     * the helper rejects, leaving the old working app alive.
     */
    preflight?: () => void | (() => void)
) {
    let pending = pendingByHost.get(commands)
    if (!pending) {
        pending = new Map()
        pendingByHost.set(commands, pending)
    }
    const existing = pending.get(id)
    if (existing) return existing
    const tasks = pending
    const result = (async () => {
        // Reject without invoking the existing helper when real Desktop work
        // or lock ownership is unsafe. Only the first request is admitted;
        // deduplicated callers receive the same in-flight promise.
        const restoreOnFailure = preflight?.()
        let accepted: Record<string, unknown>
        try {
            accepted = await commands.apply(id, context)
        } catch (error) {
            if (typeof restoreOnFailure === 'function')
                restoreOnFailure()
            throw error
        }
        // The accepted helper owns the upgrade; keep HTTP admission frozen
        // until the existing shutdown+process-exit transaction takes over.
        setTimeout(() => void shutdown(), 150)
        return accepted
    })().catch((error) => {
        tasks.delete(id)
        throw error
    })
    pending.set(id, result)
    return result
}
