/** Standard AbortController fan-in with explicit listener lifetime, for the project's current TS lib. */
export function createUpdateAbortScope(
    signals: Array<AbortSignal | undefined>
) {
    const controller = new AbortController()
    const listeners: Array<{ signal: AbortSignal; abort: () => void }> = []
    for (const signal of signals) {
        if (!signal) continue
        const abort = () => controller.abort()
        if (signal.aborted) controller.abort()
        else {
            signal.addEventListener('abort', abort, { once: true })
            listeners.push({ signal, abort })
        }
    }
    return {
        signal: controller.signal,
        dispose() {
            for (const { signal, abort } of listeners)
                signal.removeEventListener('abort', abort)
        }
    }
}
