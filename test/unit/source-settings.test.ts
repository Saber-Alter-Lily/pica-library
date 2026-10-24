import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
    buildConfig,
    buildLocalConfig,
    buildSettingsConfig,
    loadConfig,
    sourcePolicyForConfig
} from '../../src/desktop/config'
import { saveSourceChoices } from '../../src/desktop/source-settings'
import { SourceRuntime } from '../../src/sources/source-policy'

const roots: string[] = []
afterEach(() => {
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})
describe('source choices are independent from credentials and survive config edits', () => {
    it('defaults fresh local setup to none, explicit first-run Pica setup to Pica, and pre-policy upgrades to legacy-compatible choices', () => {
        const input = {
            libraryDirectory: path.resolve('synthetic-library'),
            profile: 'balanced' as const
        }
        const local = buildLocalConfig(input)
        expect(local.externalSources?.enabled).toEqual([])
        expect(
            buildConfig({
                ...input,
                account: 'synthetic',
                password: 'synthetic'
            }).config.externalSources?.enabled
        ).toEqual(['pica'])
        const legacy = { ...local }
        delete legacy.externalSources
        expect(sourcePolicyForConfig(legacy).enabled).toEqual([
            'pica',
            'eh',
            'jm'
        ])
        expect(
            buildLocalConfig(input, legacy).externalSources?.enabled
        ).toEqual(['pica', 'eh', 'jm'])
        expect(
            buildSettingsConfig(
                { ...input, account: 'new-account', password: 'new-password' },
                local
            ).config.externalSources?.enabled
        ).toEqual([])
        expect(sourcePolicyForConfig(null).enabled).toEqual([])
    })
    it('persists atomically before aborting requests, survives restart, rejects stale UI, and leaves the current policy unchanged on write failure', () => {
        const root = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-source-settings-')
        )
        roots.push(root)
        const file = path.join(root, 'config.json')
        const config = buildLocalConfig({
            libraryDirectory: path.join(root, 'library'),
            profile: 'balanced'
        })
        const runtime = new SourceRuntime(config.externalSources)
        const first = saveSourceChoices(file, config, runtime, ['eh'], 0)
        const lease = runtime.acquire('eh')
        let policyObservedAtAbort: unknown
        lease.signal.addEventListener('abort', () => {
            policyObservedAtAbort = loadConfig(file)?.externalSources
        })
        expect(() =>
            saveSourceChoices(file, first.config, runtime, [], 0)
        ).toThrow(/refresh/)
        expect(() =>
            saveSourceChoices(file, first.config, runtime, [], 1, () => {
                throw new Error('disk full')
            })
        ).toThrow('disk full')
        expect(runtime.snapshot()).toEqual(first.config.externalSources)
        expect(lease.signal.aborted).toBe(false)
        const second = saveSourceChoices(file, first.config, runtime, [], 1)
        expect(lease.signal.aborted).toBe(true)
        expect(policyObservedAtAbort).toEqual(second.config.externalSources)
        expect(sourcePolicyForConfig(loadConfig(file))).toEqual(
            runtime.snapshot()
        )
        expect(fs.readdirSync(root)).toEqual(['config.json'])
        expect(fs.readFileSync(file, 'utf8')).not.toMatch(
            /password|cookie|token/
        )
    })
})
