import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P2 J2 repeatable Desktop latency scenario', () => {
    it('keeps the harness local, telemetry-driven and threshold-free', () => {
        const script = fs.readFileSync(
            'scripts/benchmark/http-latency-scenario.ts',
            'utf8'
        )
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
            scripts: Record<string, string>
        }

        expect(pkg.scripts['benchmark:http-latency-scenario']).toBe(
            'tsx scripts/benchmark/http-latency-scenario.ts'
        )
        expect(script).toContain(
            "'The J2 scenario harness only accepts a local loopback HTTP Desktop URL'"
        )
        expect(script).toContain("path: '/api/v1/desktop/status'")
        expect(script).toContain(
            "path: '/api/v1/desktop/runtime/http-profile/reset'"
        )
        expect(script).toContain("'x-pica-csrf': csrfToken")
        expect(script).toContain(
            "path: '/api/v1/desktop/runtime/http-profile'"
        )
        expect(script).toContain(
            "path: '/api/v1/desktop/runtime/resources'"
        )
        expect(script).toContain("path: '/api/v1/library/query'")
        expect(script).toContain("path: '/api/v1/reader/progress'")
        expect(script).toContain(
            'Reader detail belongs in the'
        )
        expect(script).toContain(
            'foreground set only after the normal local endpoint is readable.'
        )
        expect(script).toContain(
            "No latency threshold or release budget is selected by this harness."
        )
        expect(script).not.toContain('RuntimeResourceCoordinator')
        expect(script).not.toContain('startMaintenance')
        expect(script).not.toContain('startRecommendation')
        expect(script).not.toContain('startRemoteStorage')
    })

    it('requires clean idle windows or full expected-task coverage', () => {
        const script = fs.readFileSync(
            'scripts/benchmark/http-latency-scenario.ts',
            'utf8'
        )

        expect(script).toContain("options.mode === 'idle'")
        expect(script).toContain(
            'profile.idle.count === profile.overall.count'
        )
        expect(script).toContain('profile.underLoad.count === 0')
        expect(script).toContain(
            "(profile.byTask[task]?.count ?? 0) === profile.overall.count"
        )
        expect(script).toContain(
            'one or more expected tasks did not cover every foreground sample'
        )
    })

    it('documents the real-task measurement boundary', () => {
        const doc = fs.readFileSync(
            'docs/HTTP_LATENCY_SCENARIO_P2J2.md',
            'utf8'
        )

        expect(doc).toContain(
            'Start the real task from Pica Library first'
        )
        expect(doc).toContain('local-download-runner')
        expect(doc).toContain('remote-storage-sync')
        expect(doc).toContain('recommendation-v3-build')
        expect(doc).toContain(
            'This is only a **measurement-window validity rule**.'
        )
        expect(doc).toContain(
            'Only after real Desktop + Android evidence exists should P2-K define budgets or P2-C3 consider enforced capacities.'
        )
    })
})
