import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P2 J9 controlled WebDAV foreground-latency harness', () => {
    it('reuses the J2 measurement authority and real remote-storage task owner', () => {
        const harness = fs.readFileSync(
            'scripts/benchmark/desktop-webdav-load-harness.ts',
            'utf8'
        )
        expect(harness).toContain("from './http-latency-scenario'")
        expect(harness).toContain('runHttpLatencyScenario(scenario)')
        expect(harness).toContain('new RemoteStorageDesktopManager(')
        expect(harness).toContain("tasks: ['remote-storage-sync']")
        expect(harness).not.toContain('/api/v1/desktop/runtime/http-profile')
        expect(harness).not.toContain('validateWindow(')
    })

    it('uses a pinned open-source local WebDAV server outside production dependencies', () => {
        const runner = fs.readFileSync(
            'scripts/run-desktop-webdav-load-harness.mjs',
            'utf8'
        )
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
            dependencies?: Record<string, string>
            devDependencies?: Record<string, string>
        }

        expect(runner).toContain("const WEBDAV_SERVER_VERSION = '2.6.2'")
        expect(runner).toContain('webdav-server@')
        expect(runner).toContain('PICA_WEBDAV_TOOL_ROOT')
        expect(pkg.dependencies?.['webdav-server']).toBeUndefined()
        expect(pkg.devDependencies?.['webdav-server']).toBeUndefined()
    })

    it('requires actual WebDAV traffic inside every accepted load run', () => {
        const harness = fs.readFileSync(
            'scripts/benchmark/desktop-webdav-load-harness.ts',
            'utf8'
        )
        expect(harness).toContain('webdavServer.beforeRequest')
        expect(harness).toContain('requestsDuringWindow')
        expect(harness).toContain(
            'J9 measurement window contained no real local WebDAV requests'
        )
        expect(harness).toContain("serverPackage: 'webdav-server'")
        expect(harness).toContain("serverVersion: '2.6.2'")
        expect(harness).toContain('providerNetworkUsed: false')
    })

    it('keeps J9 descriptive and threshold-free', () => {
        const harness = fs.readFileSync(
            'scripts/benchmark/desktop-webdav-load-harness.ts',
            'utf8'
        )
        expect(harness).toContain(
            "benchmark: 'desktop-webdav-foreground-latency-p2-j9'"
        )
        expect(harness).toContain('defines no release budget')
        expect(harness).not.toContain('p95Budget')
        expect(harness).not.toContain('latencyThreshold')
    })
})
