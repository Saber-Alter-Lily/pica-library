import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P2 J8 controlled active-download latency harness', () => {
    it('reuses J2 measurement logic instead of duplicating latency semantics', () => {
        const j2 = fs.readFileSync(
            'scripts/benchmark/http-latency-scenario.ts',
            'utf8'
        )
        const j8 = fs.readFileSync(
            'scripts/benchmark/desktop-download-load-harness.ts',
            'utf8'
        )
        expect(j2).toContain('export async function runHttpLatencyScenario')
        expect(j2).toContain('export interface ScenarioOptions')
        expect(j8).toContain("from './http-latency-scenario'")
        expect(j8).toContain('runHttpLatencyScenario(scenario)')
        expect(j8).toContain("tasks: ['local-download-runner']")
        expect(j8).not.toContain('/api/v1/desktop/runtime/http-profile')
        expect(j8).not.toContain('validateWindow(')
    })

    it('uses the real download scheduler path with a fully local controlled provider', () => {
        const j8 = fs.readFileSync(
            'scripts/benchmark/desktop-download-load-harness.ts',
            'utf8'
        )
        expect(j8).toContain('new LibraryService(database, root, provider)')
        expect(j8).toContain("service.enqueueDownload({ comicId: 'j8-load-comic' })")
        expect(j8).toContain('service.startLocalDownloadQueue({')
        expect(j8).toContain('globalMediaConcurrency: 1')
        expect(j8).toContain('jobConcurrency: 1')
        expect(j8).toContain('fs.promises.appendFile(output, chunk)')
        expect(j8).toContain(
            'writesDuringMeasuredWindow: writesDuringWindow'
        )
        expect(j8).toContain(
            'J8 measurement window contained no real fixture file writes'
        )
        expect(j8).toContain('https://fixture.invalid')
        expect(j8).toContain('providerNetworkUsed: false')
        expect(j8).not.toContain('process.env.PICA_ACCOUNT')
        expect(j8).not.toContain('process.env.PICA_PASSWORD')
    })

    it('keeps J8 descriptive and machine-readable without inventing a budget', () => {
        const j8 = fs.readFileSync(
            'scripts/benchmark/desktop-download-load-harness.ts',
            'utf8'
        )
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
            scripts: Record<string, string>
        }

        expect(pkg.scripts['benchmark:desktop-download-load']).toBe(
            'tsx scripts/benchmark/desktop-download-load-harness.ts'
        )
        expect(j8).toContain(
            "benchmark: 'desktop-active-download-http-latency-p2-j8'"
        )
        expect(j8).toContain(
            'Controlled local active-transfer fixture.'
        )
        expect(j8).toContain('defines no release budget')
        expect(j8).toContain('output: map.get(\'output\')?.trim() || null')
        expect(j8).not.toContain('p95Budget')
        expect(j8).not.toContain('latencyThreshold')
    })
})
