import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
    LocalHttpLatencyRegistry,
    classifyLocalHttpRoute
} from '../../src/runtime/http-latency'

describe('local HTTP latency registry', () => {
    it('classifies API traffic without retaining dynamic URL values', () => {
        expect(classifyLocalHttpRoute('POST', '/api/v1/library/query')).toBe(
            'library-query'
        )
        expect(
            classifyLocalHttpRoute(
                'GET',
                '/api/v1/comics/private-comic-id/work-variants'
            )
        ).toBe('comic')
        expect(
            classifyLocalHttpRoute(
                'GET',
                '/api/v1/reader/private-comic/private-episode/page/12'
            )
        ).toBe('reader')
        expect(
            classifyLocalHttpRoute(
                'GET',
                '/api/v1/desktop/recommendation-v5/evaluation/summary'
            )
        ).toBe('recommendation-v5')
        expect(classifyLocalHttpRoute('GET', '/remote/')).toBe('static')
    })

    it('summarizes idle and background-loaded latency with bounded recent samples', () => {
        const registry = new LocalHttpLatencyRegistry({ maxSamples: 20 })
        registry.record({
            at: '2026-09-24T00:00:00.000Z',
            method: 'POST',
            routeClass: 'library-query',
            statusCode: 200,
            durationMs: 10,
            activeTaskTypes: []
        })
        registry.record({
            at: '2026-09-24T00:00:01.000Z',
            method: 'POST',
            routeClass: 'library-query',
            statusCode: 200,
            durationMs: 30,
            activeTaskTypes: ['local-download-runner']
        })
        registry.record({
            at: '2026-09-24T00:00:02.000Z',
            method: 'GET',
            routeClass: 'reader',
            statusCode: 500,
            durationMs: 50,
            activeTaskTypes: ['remote-storage-sync']
        })

        const snapshot = registry.snapshot()
        expect(snapshot).toMatchObject({
            mode: 'OBSERVE_ONLY',
            persisted: false,
            uploaded: false,
            sampleCount: 3,
            overall: {
                count: 3,
                p50Ms: 30,
                p95Ms: 50,
                maxMs: 50,
                errorCount: 1
            },
            idle: {
                count: 1,
                p50Ms: 10
            },
            underLoad: {
                count: 2,
                p50Ms: 30,
                p95Ms: 50
            }
        })
        expect(snapshot.byRoute['library-query']).toMatchObject({
            count: 2,
            p50Ms: 10,
            p95Ms: 30
        })
        expect(snapshot.byTask['local-download-runner']).toMatchObject({
            count: 1,
            p50Ms: 30
        })
        expect(snapshot.recent).toHaveLength(3)
    })

    it('resets an observation window without carrying old samples forward', () => {
        const registry = new LocalHttpLatencyRegistry()
        registry.record({
            at: '2026-09-24T00:00:00.000Z',
            method: 'GET',
            routeClass: 'status',
            statusCode: 200,
            durationMs: 5,
            activeTaskTypes: []
        })
        expect(registry.snapshot().sampleCount).toBe(1)
        registry.reset()
        expect(registry.snapshot()).toMatchObject({
            sampleCount: 0,
            overall: { count: 0 },
            idle: { count: 0 },
            underLoad: { count: 0 }
        })
    })

    it('sanitizes task labels and does not expose request paths or query values', () => {
        const registry = new LocalHttpLatencyRegistry()
        registry.record({
            at: '2026-09-24T00:00:00.000Z',
            method: 'GET',
            routeClass: 'comic',
            statusCode: 200,
            durationMs: 1.23456,
            activeTaskTypes: [
                'recommendation-v3-build',
                'private value / should not survive'
            ]
        })
        const serialized = JSON.stringify(registry.snapshot())
        expect(serialized).toContain('recommendation-v3-build')
        expect(serialized).toContain('other-task')
        expect(serialized).not.toContain('private value')
        expect(serialized).not.toContain('comicId')
        expect(serialized).not.toContain('pathname')
        expect(serialized).not.toContain('query')
    })

    it('uses a one-shot request timer and records aborted responses once', async () => {
        const registry = new LocalHttpLatencyRegistry()
        const finish = registry.start({
            method: 'GET',
            pathname: '/api/v1/reader/example/page/1',
            activeTaskTypes: ['local-download-runner']
        })
        await new Promise((resolve) => setTimeout(resolve, 2))
        finish(499)
        finish(200)

        const snapshot = registry.snapshot()
        expect(snapshot.sampleCount).toBe(1)
        expect(snapshot.recent[0]).toMatchObject({
            method: 'GET',
            routeClass: 'reader',
            statusCode: 499,
            activeTaskTypes: ['local-download-runner']
        })
        expect(snapshot.recent[0].durationMs).toBeGreaterThanOrEqual(0)
    })

    it('keeps the runtime profile on the Desktop-only local control plane', () => {
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        const gateway = fs.readFileSync('src/remote-api/gateway.ts', 'utf8')

        expect(server).toContain(
            "url.pathname === '/api/v1/desktop/runtime/http-profile'"
        )
        expect(server).toContain(
            "url.pathname === '/api/v1/desktop/runtime/http-profile/reset'"
        )
        expect(server).toContain('return json(response, 200, httpLatency.snapshot())')
        expect(server).toContain('httpLatency.reset()')
        expect(server).toContain('const latencyDiagnostic =')
        expect(server).toContain(
            "error: 'Desktop control plane is unavailable'"
        )
        expect(server).toContain(
            'activeTaskTypes: options.service.runtimeActiveTaskTypes()'
        )
        expect(server).not.toContain(
            '.runtimeResourceProfile()\n                .active.map'
        )
        expect(gateway).not.toContain('/api/v1/desktop/runtime/http-profile')
        expect(gateway).not.toContain(
            '/api/v1/desktop/runtime/http-profile/reset'
        )
    })
})
