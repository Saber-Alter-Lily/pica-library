export const UPDATE_RECONNECT_POLL_MS = 250
export const UPDATE_RECONNECT_STABILITY_MS = 1_500
export const UPDATE_RECONNECT_PROBE_TIMEOUT_MS = 2_000

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchProbe(url, fetchFn, read) {
    const controller = new AbortController()
    let timer
    const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
            controller.abort()
            reject(new Error('Update readiness probe timed out'))
        }, UPDATE_RECONNECT_PROBE_TIMEOUT_MS)
    })
    try {
        return await Promise.race([
            (async () => {
                const response = await fetchFn(url, {
                    cache: 'no-store',
                    signal: controller.signal
                })
                return response.ok
                    ? { ok: true, value: await read(response) }
                    : { ok: false }
            })(),
            deadline
        ])
    } finally {
        clearTimeout(timer)
    }
}

function runtimeMatches(expected, actual) {
    const valid = (value) =>
        value?.formatVersion === 1 &&
        Array.isArray(value.sourceRuntimes) &&
        value.sourceRuntimes.length <= 1 &&
        value.sourceRuntimes.every((id) => id === 'jm')
    return (
        valid(expected) &&
        valid(actual) &&
        JSON.stringify(expected.sourceRuntimes) ===
            JSON.stringify(actual.sourceRuntimes)
    )
}

export async function probeUpdateReconnect(targetVersion, options = {}) {
    const fetchFn = options.fetchFn ?? globalThis.fetch
    if (typeof fetchFn !== 'function') return false
    const now = options.now ?? (() => Date.now())
    const cacheBuster = encodeURIComponent(String(now()))
    try {
        const [capabilitiesResponse, shellResponse, desktopResponse] =
            await Promise.all([
                fetchProbe('/api/v1/capabilities', fetchFn, (response) =>
                    response.json()
                ),
                fetchProbe(
                    `/?pica-update-ready=${cacheBuster}`,
                    fetchFn,
                    (response) => response.text()
                ),
                options.expectedRuntimeComposition === undefined
                    ? null
                    : fetchProbe(
                          '/api/v1/desktop/status',
                          fetchFn,
                          (response) => response.json()
                      )
            ])
        if (!capabilitiesResponse.ok || !shellResponse.ok) return false
        if (options.expectedRuntimeComposition !== undefined) {
            const desktop = desktopResponse?.value
            if (
                !desktopResponse?.ok ||
                desktop?.runtimeComposition?.status !== 'declared' ||
                !runtimeMatches(
                    options.expectedRuntimeComposition,
                    desktop.runtimeComposition.composition
                ) ||
                typeof options.previousCsrfToken !== 'string' ||
                !options.previousCsrfToken ||
                typeof desktop.csrfToken !== 'string' ||
                !desktop.csrfToken ||
                desktop.csrfToken === options.previousCsrfToken
            )
                return false
        }
        const capabilities = capabilitiesResponse.value,
            shell = shellResponse.value
        return (
            String(capabilities?.appVersion || '') ===
                String(targetVersion || '') &&
            /<!doctype html|<html(?:\s|>)/i.test(String(shell || ''))
        )
    } catch {
        return false
    }
}

export async function waitForUpdateReconnect(targetVersion, options = {}) {
    const timeoutMs = options.timeoutMs ?? 90_000
    const pollMs = options.pollMs ?? UPDATE_RECONNECT_POLL_MS
    const stabilityMs = options.stabilityMs ?? UPDATE_RECONNECT_STABILITY_MS
    const now = options.now ?? (() => Date.now())
    const sleepFn = options.sleepFn ?? delay
    const probe =
        options.probe ?? ((version) => probeUpdateReconnect(version, options))
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
