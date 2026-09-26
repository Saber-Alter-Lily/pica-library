import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P2 J11 controlled overlapping-task foreground benchmark', () => {
    const source = () =>
        fs.readFileSync(
            'scripts/benchmark/desktop-overlap-load-harness.ts',
            'utf8'
        )

    it('runs two real production task owners through one shared coordinator', () => {
        const value = source()
        expect(value).toContain('new RuntimeResourceCoordinator({ mode: \'observe\' })')
        expect(value).toContain('new LibraryService(')
        expect(value).toContain('new RemoteStorageDesktopManager(')
        expect(value).toContain('service.startLocalDownloadQueue({')
        expect(value).toContain('manager.sync({ remoteTargetId: saved.targetId })')
        expect(value).toContain(
            "tasks: ['local-download-runner', 'remote-storage-sync']"
        )
    })

    it('requires both workload mechanisms to be physically active in the measurement window', () => {
        const value = source()
        expect(value).toContain('downloadWrites')
        expect(value).toContain('webdavEvents')
        expect(value).toContain(
            'J11 measured window contained no real LOCAL download file writes'
        )
        expect(value).toContain(
            'J11 measured window contained no real local WebDAV requests'
        )
        expect(value).toContain('downloadWritesDuringMeasuredWindow')
        expect(value).toContain('webDavRequestsDuringMeasuredWindow')
    })

    it('reuses J2 instead of cloning foreground latency semantics', () => {
        const value = source()
        expect(value).toContain("from './http-latency-scenario'")
        expect(value).toContain('runHttpLatencyScenario(scenario)')
        expect(value).not.toContain('/api/v1/desktop/runtime/http-profile')
        expect(value).not.toContain('validateWindow(')
    })

    it('keeps the workload local and threshold-free', () => {
        const value = source()
        expect(value).toContain("benchmark: 'desktop-overlap-foreground-latency-p2-j11'")
        expect(value).toContain('Controlled local overlap')
        expect(value).toContain('no provider-throughput or P2-K budget claim')
        expect(value).not.toContain('p95Budget')
        expect(value).not.toContain('latencyThreshold')
    })
})
