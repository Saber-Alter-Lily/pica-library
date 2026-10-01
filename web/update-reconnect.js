export const UPDATE_RECONNECT_POLL_MS = 250
export const UPDATE_RECONNECT_STABILITY_MS = 1_500
export const UPDATE_RECONNECT_PROBE_TIMEOUT_MS = 2_000

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchProbe(url, fetchFn) {
    const controller = new AbortController()
    const timer = setTimeout(
        () => controller.abort(),
        UPDATE_RECONNECT_PROBE_TIMEOUT_MS
    )
    try {
        return await fetchFn(url, {
            cache: 'no-store',
            signal: controller.signal
        })
    } finally {
        clearTimeout(timer)
    }
}

export async function probeUpdateReconnect(
    targetVersion,
    options = {}
) {
    const fetchFn = options.fetchFn ?? globalThis.fetch
    if (typeof fetchFn !== 'function') return false
    const now = options.now ?? (() => Date.now())
    const cacheBuster = encodeURIComponent(String(now()))
    try {
        const [capabilitiesResponse, shellResponse] = await Promise.all([
            fetchProbe('/api/v1/capabilities', fetchFn),
            fetchProbe(
                `/?pica-update-ready=${cacheBuster}`,
                fetchFn
            )
        ])
        if (!capabilitiesResponse.ok || !shellResponse.ok) return false
        const [capabilities, shell] = await Promise.all([
            capabilitiesResponse.json(),
            shellResponse.text()
        ])
        return (
            String(capabilities?.appVersion || '') ===
                String(targetVersion || '') &&
            /<!doctype html|<html(?:\s|>)/i.test(String(shell || ''))
        )
    } catch {
        return false
    }
}

export async function waitForUpdateReconnect(
    targetVersion,
    options = {}
) {
    const timeoutMs = options.timeoutMs ?? 90_000
    const pollMs = options.pollMs ?? UPDATE_RECONNECT_POLL_MS
    const stabilityMs =
        options.stabilityMs ?? UPDATE_RECONNECT_STABILITY_MS
    const now = options.now ?? (() => Date.now())
    const sleepFn = options.sleepFn ?? delay
    const probe =
        options.probe ??
        ((version) => probeUpdateReconnect(version))
    const started = now()
    let readySince = null

    while (now() - started < timeoutMs) {
        const ready = await probe(targetVersion)
        const observedAt = now()
        if (ready) {
            if (readySince === null) readySince = observedAt
            if (observedAt - readySince >= stabilityMs) return true
        } else {
            readySince = null
        }
        await sleepFn(pollMs)
    }
    return false
}
