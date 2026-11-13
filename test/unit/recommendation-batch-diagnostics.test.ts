import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    observeRecommendationBatchNetworkV1,
    collectRecommendationBatchFailureV1,
    writeRecommendationBatchFailureV1
} from '../../scripts/benchmark/recommendation-batch-diagnostics.mjs'
const roots: string[] = []
afterEach(() => {
    vi.useRealTimers()
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('bounded J7 failure diagnostics', () => {
    it('retains only allowed enums, booleans and counts even when browser/network values contain extras', async () => {
        const report = await collectRecommendationBatchFailureV1({
            page: {
                isClosed: () => false,
                evaluate: async () => ({
                    homeActive: true,
                    cardCount: 12,
                    comicId: 'CANARY_ID',
                    password: 'CANARY_PASSWORD',
                    nextButtonDisabled: 'CANARY_TEXT'
                })
            },
            sourceSha: 'b'.repeat(40),
            timeoutMs: 15000,
            phase: 'next-batch',
            round: 1,
            error: {
                name: 'TimeoutError',
                message: 'CANARY_ERROR',
                stack: 'CANARY_STACK'
            },
            network: {
                events: [
                    {
                        route: '/api/v1/recommendations',
                        event: 'response',
                        method: 'POST',
                        action: 'next',
                        status: 503,
                        password: 'CANARY_SECRET',
                        url: 'CANARY_URL'
                    },
                    { route: 'CANARY_ROUTE', event: 'response', status: 200 }
                ],
                dropped: 3
            }
        })
        expect(report.pageFlags?.homeActive).toBe(true)
        expect(report.pageFlags?.nextButtonDisabled).toBeNull()
        expect(report.network.events).toHaveLength(1)
        expect(report.network.events[0].status).toBe(503)
        expect(report.timeoutMs).toBe(15000)
        expect(JSON.stringify(report)).not.toContain('CANARY_')
    })
    it('does not hang forever observing a frozen page', async () => {
        vi.useFakeTimers()
        const pending = collectRecommendationBatchFailureV1({
            page: {
                isClosed: () => false,
                evaluate: () => new Promise(() => {})
            },
            timeoutMs: 15000,
            phase: 'next-batch',
            round: 1
        })
        await vi.advanceTimersByTimeAsync(1500)
        const report = await pending
        expect(report.pageStateStatus).toBe('UNAVAILABLE')
        expect(report.pageFlags).toBeNull()
        expect(report.cardCount).toBeNull()
    })
    it('bounds observations and removes only its own Playwright listeners', () => {
        const handlers = new Map<string, Function>(),
            removed: string[] = []
        const page = {
            on: (event: string, handler: Function) =>
                handlers.set(event, handler),
            removeListener: (event: string, handler: Function) => {
                expect(handlers.get(event)).toBe(handler)
                removed.push(event)
            }
        }
        const watch = observeRecommendationBatchNetworkV1(page)
        const request = {
            url: () =>
                'http://127.0.0.1:1234/api/v1/recommendations?token=CANARY_QUERY',
            method: () => 'POST',
            postDataJSON: () => ({ action: 'next', password: 'CANARY_BODY' })
        }
        for (let i = 0; i < 40; i++) handlers.get('request')!(request)
        const snapshot = watch.snapshot()
        expect(snapshot.events).toHaveLength(32)
        expect(snapshot.dropped).toBe(8)
        expect(JSON.stringify(snapshot)).not.toContain('CANARY_')
        watch.dispose()
        expect(removed.sort()).toEqual(['request', 'requestfailed', 'response'])
    })
    it('writes a fresh failure file without replacing prior evidence or exporting arbitrary options', async () => {
        const root = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-j7-diagnostic-')
        )
        roots.push(root)
        const options = {
            output: path.join(root, 'benchmark.json'),
            sourceSha: 'c'.repeat(40),
            phase: 'next-batch',
            round: 1,
            timeoutMs: 15000,
            password: 'CANARY_EXTRA',
            error: { name: 'TimeoutError', message: 'CANARY_ERROR' }
        }
        const first = await writeRecommendationBatchFailureV1(options),
            second = await writeRecommendationBatchFailureV1(options)
        expect(first).not.toBe(second)
        expect(fs.readdirSync(root)).toHaveLength(2)
        expect(fs.readFileSync(first, 'utf8')).not.toContain('CANARY_')
        expect(JSON.parse(fs.readFileSync(first, 'utf8')).pageStateStatus).toBe(
            'UNAVAILABLE'
        )
    })
    it('keeps the original 15-second/two-round benchmark contract and writes diagnostics only on failure', () => {
        const runner = fs.readFileSync(
                'scripts/benchmark/desktop-recommendation-batch-harness.mjs',
                'utf8'
            ),
            workflow = fs.readFileSync(
                '.github/workflows/desktop-recommendation-benchmark-harness.yml',
                'utf8'
            )
        expect(runner).toMatch(/catch\s*\(error\)/)
        expect(runner).toContain('throw error')
        expect(runner).toContain('writeRecommendationBatchFailureV1')
        expect(runner).toContain('15_000')
        expect(workflow).toContain('--rounds=2')
        expect(workflow).toContain('if: always()')
        expect(workflow).toContain('test-results/desktop-recommendation/')
    })
})
