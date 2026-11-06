import { describe, expect, it, vi } from 'vitest'
import {
    probeUpdateReconnect,
    waitForUpdateReconnect
} from '../../web/update-reconnect.js'
const expected = { formatVersion: 1 as const, sourceRuntimes: ['jm' as const] }
function transport(composition: unknown, csrf = 'synthetic-new') {
    return vi.fn(async (url: RequestInfo | URL) => {
        if (String(url) === '/api/v1/capabilities')
            return new Response(JSON.stringify({ appVersion: '0.5.0' }))
        if (String(url).startsWith('/?'))
            return new Response(
                '<!doctype html><html><body>synthetic shell</body></html>'
            )
        if (String(url) === '/api/v1/desktop/status')
            return new Response(
                JSON.stringify({
                    csrfToken: csrf,
                    runtimeComposition: { status: 'declared', composition }
                })
            )
        throw Error('Unexpected fake probe')
    })
}
describe('same-version runtime replacement is not an already-running old server', () => {
    it('does not reconnect merely because the old server already has the same application version', async () => {
        const fetchFn = transport(
            { formatVersion: 1, sourceRuntimes: [] },
            'synthetic-old'
        )
        expect(
            await probeUpdateReconnect('0.5.0', {
                fetchFn,
                expectedRuntimeComposition: expected,
                previousCsrfToken: 'synthetic-old'
            })
        ).toBe(false)
    })
    it('requires a different current Desktop session even when runtime files already match', async () => {
        const fetchFn = transport(expected, 'synthetic-old')
        expect(
            await probeUpdateReconnect('0.5.0', {
                fetchFn,
                expectedRuntimeComposition: expected,
                previousCsrfToken: 'synthetic-old'
            })
        ).toBe(false)
    })
    it('accepts matching declared runtime, fresh Desktop session and real version/shell probes', async () => {
        const fetchFn = transport(expected)
        expect(
            await probeUpdateReconnect('0.5.0', {
                fetchFn,
                expectedRuntimeComposition: expected,
                previousCsrfToken: 'synthetic-old'
            })
        ).toBe(true)
        expect(fetchFn).toHaveBeenCalledTimes(3)
    })
    it('forwards runtime/session requirements through the default stabilization probe', async () => {
        const fetchFn = transport(expected)
        let now = 0
        expect(
            await waitForUpdateReconnect('0.5.0', {
                fetchFn,
                expectedRuntimeComposition: expected,
                previousCsrfToken: 'synthetic-old',
                now: () => now,
                sleepFn: async (ms) => {
                    now += ms
                },
                stabilityMs: 500,
                timeoutMs: 1000,
                pollMs: 250
            })
        ).toBe(true)
        expect(fetchFn).toHaveBeenCalledTimes(9)
    })
    it('bounds response-body reads as well as response headers', async () => {
        vi.useFakeTimers()
        try {
            const fetchFn = vi.fn(async (url: RequestInfo | URL) =>
                String(url) === '/api/v1/capabilities'
                    ? { ok: true, json: () => new Promise<unknown>(() => {}) }
                    : {
                          ok: true,
                          text: async () => '<!doctype html><html></html>'
                      }
            )
            const result = probeUpdateReconnect('0.5.0', {
                fetchFn: fetchFn as unknown as typeof fetch
            })
            await vi.advanceTimersByTimeAsync(2001)
            expect(await result).toBe(false)
        } finally {
            vi.useRealTimers()
        }
    })
})
