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
    shutdown: () => void | Promise<void>
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
        const accepted = await commands.apply(id, context)
        setTimeout(() => void shutdown(), 150)
        return accepted
    })().catch((error) => {
        tasks.delete(id)
        throw error
    })
    pending.set(id, result)
    return result
}
