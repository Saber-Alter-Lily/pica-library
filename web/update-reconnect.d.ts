export const UPDATE_RECONNECT_POLL_MS: number
export const UPDATE_RECONNECT_STABILITY_MS: number
export const UPDATE_RECONNECT_PROBE_TIMEOUT_MS: number

export interface UpdateReconnectProbeOptions {
    fetchFn?: typeof fetch
    now?: () => number
    expectedRuntimeComposition?: import('../src/modules/runtime-composition').RuntimeComposition
    previousCsrfToken?: string
}

export interface WaitForUpdateReconnectOptions extends UpdateReconnectProbeOptions {
    timeoutMs?: number
    pollMs?: number
    stabilityMs?: number
    now?: () => number
    sleepFn?: (ms: number) => Promise<void>
    probe?: (targetVersion: unknown) => Promise<boolean>
}

export function probeUpdateReconnect(
    targetVersion: unknown,
    options?: UpdateReconnectProbeOptions
): Promise<boolean>

export function waitForUpdateReconnect(
    targetVersion: unknown,
    options?: WaitForUpdateReconnectOptions
): Promise<boolean>
