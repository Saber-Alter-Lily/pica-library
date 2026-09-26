import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P2 J7 controlled active-download latency harness', () => {
    it('reuses J2 measurement logic instead of duplicating latency semantics', () => {
        const j2 = fs.readFileSync(
            'scripts/benchmark/http-latency-scenario.ts',
            'utf8'
        )
        const j7 = fs.readFileSync(
            'scripts/benchmark/desktop-download-load-harness.ts',
            'utf8'
        )
        expect(j2).toContain('export async function runHttpLatencyScenario')
        expect(j2).toContain('export interface ScenarioOptions')
        expect(j7).toContain("from './http-latency-scenario'")
        expect(j7).toContain('runHttpLatencyScenario(scenario)')
        expect(j7).toContain("tasks: ['local-download-runner']")
        expect(j7).not.toContain('/api/v1/desktop/runtime/http-profile')
        expect(j7).not.toContain('validateWindow(')
    })

    it('uses the real download scheduler path with a fully local controlled provider', () => {
        const j7 = fs.readFileSync(
            'scripts/benchmark/desktop-download-load-harness.ts',
            'utf8'
        )
        expect(j7).toContain('new LibraryService(database, root, provider)')
        expect(j7).toContain("service.enqueueDownload({ comicId: 'j7-load-comic' })")
        expect(j7).toContain('service.startLocalDownloadQueue({')
        expect(j7).toContain('globalMediaConcurrency: 1')
        expect(j7).toContain('jobConcurrency: 1')
        expect(j7).toContain('fs.promises.appendFile(output, chunk)')
        expect(j7).toContain('writesDuringMeasuredWindow')
        expect(j7).toContain(
            'J7 measurement window contained no real fixture file writes'
        )
        expect(j7).toContain('https://fixture.invalid')
        expect(j7).toContain('providerNetworkUsed: false')
        expect(j7).not.toContain('process.env.PICA_ACCOUNT')
        expect(j7).not.toContain('process.env.PICA_PASSWORD')
    })

    it('keeps J7 descriptive and machine-readable without inventing a budget', () => {
        const j7 = fs.readFileSync(
            'scripts/benchmark/desktop-download-load-harness.ts',
            'utf8'
        )
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
            scripts: Record<string, string>
        }

        expect(pkg.scripts['benchmark:desktop-download-load']).toBe(
            'tsx scripts/benchmark/desktop-download-load-harness.ts'
        )
        expect(j7).toContain(
            "benchmark: 'desktop-active-download-http-latency-p2-j7'"
        )
        expect(j7).toContain(
            'Controlled local active-transfer fixture.'
        )
        expect(j7).toContain('defines no release budget')
        expect(j7).toContain('output: map.get(\'output\')?.trim() || null')
        expect(j7).not.toContain('p95Budget')
        expect(j7).not.toContain('latencyThreshold')
    })
})
