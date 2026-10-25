import { describe, expect, it } from 'vitest'
import {
    initialSourcePolicy,
    normalizeSourcePolicy,
    SourceDisabledError,
    SourceRuntime
} from '../../src/sources/source-policy'
import { enabledFixtureSources } from "../helpers/source-runtime-fixture"

describe('installation-local source policy', () => {
    it('fresh installs are local-only and legacy choices are preserved explicitly', () => {
        expect(initialSourcePolicy().enabled).toEqual([])
        expect(initialSourcePolicy(true).enabled).toEqual(['pica', 'eh', 'jm'])
        for (const enabled of [['local'], ['exh'], ['jm', 'jm'], ['other']])
            expect(() =>
                normalizeSourcePolicy({
                    schemaVersion: 1,
                    revision: 0,
                    enabled
                })
            ).toThrow()
        expect(() =>
            normalizeSourcePolicy({
                schemaVersion: 1,
                revision: 0,
                enabled: [],
                password: 'secret'
            })
        ).toThrow()
    })
    it('prepares without applying and rejects stale UI saves', () => {
        const runtime = new SourceRuntime(initialSourcePolicy())
        const next = runtime.prepare(['jm'], 0)
        expect(() => runtime.acquire('jm')).toThrow(SourceDisabledError)
        runtime.apply(next)
        expect(runtime.acquire('jm').signal.aborted).toBe(false)
        expect(() => runtime.prepare([], 0)).toThrow('changed')
        const snapshot = runtime.snapshot()
        snapshot.enabled.length = 0
        expect(runtime.isEnabled('jm')).toBe(true)
    })
    it('disabling fences in-flight work and old leases remain invalid after reenabling', () => {
        const runtime = enabledFixtureSources()
        const jm = runtime.acquire('jm'),
            pica = runtime.acquire('pica')
        expect(runtime.apply(runtime.prepare(['pica', 'eh'], 0))).toEqual([
            'jm'
        ])
        expect(jm.signal.aborted).toBe(true)
        expect(() => jm.check()).toThrow(SourceDisabledError)
        expect(() => runtime.acquire('jm')).toThrow(SourceDisabledError)
        runtime.apply(runtime.prepare(['pica', 'eh', 'jm'], 1))
        expect(() => jm.check()).toThrow(SourceDisabledError)
        expect(runtime.acquire('jm').signal.aborted).toBe(false)
        expect(() => pica.check()).not.toThrow()
    })
    it('rejects malformed policy before any enabled source or lease changes', () => {
        const runtime = enabledFixtureSources(),
            lease = runtime.acquire('eh')
        expect(() =>
            runtime.apply({ schemaVersion: 1, revision: -1, enabled: [] })
        ).toThrow()
        expect(runtime.isEnabled('eh')).toBe(true)
        expect(lease.signal.aborted).toBe(false)
    })
})
