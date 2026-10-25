import { build } from 'esbuild'
import { describe, expect, it, vi } from 'vitest'
import { orderReaderProgress } from '../../src/reader/progress-writes'
import {
    OnlineReaderService,
    type OnlineReaderContract,
    type OnlineReaderState
} from '../../src/services/online-reader-service'

function deferred<T = void>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((done) => {
        resolve = done
    })
    return { promise, resolve }
}
function fixture() {
    const rows = new Map<string, unknown>()
    const state: OnlineReaderState = {
        getAppState: <T>(key: string) => rows.get(key) as T | undefined,
        setAppState: (key, value) => {
            rows.set(key, value)
        }
    }
    function reader(
        options: {
            slow?: Promise<void>
            started?: () => void
            scope?: () => string
            contract?: OnlineReaderContract
        } = {}
    ) {
        const provider = {
            cacheScope: options.scope ?? (() => 'same-session'),
            getEpisodes: vi.fn(async () => [
                {
                    id: 'episode',
                    title: 'chapter',
                    order: 1,
                    updated_at: '2026-10-25'
                }
            ]),
            getEpisodePages: vi.fn(async () => {
                options.started?.()
                await options.slow
                return [0, 1].map((index) => ({
                    id: String(index),
                    name: String(index),
                    path: String(index),
                    fileServer: 'https://fixture.invalid',
                    url: 'fixture:page' + index,
                    epTitle: 'chapter',
                    media: {
                        originalName: String(index),
                        path: String(index),
                        fileServer: 'https://fixture.invalid'
                    }
                }))
            }),
            fetchPage: vi.fn(async () => ({
                data: Buffer.from('fixture'),
                contentType: 'image/png'
            }))
        }
        return {
            service: new OnlineReaderService(
                state,
                provider,
                { get: () => null, put: () => {} },
                options.contract
            ),
            provider
        }
    }
    return { state, rows, reader }
}
describe('bounded Reader progress sequencing via the existing p-limit', () => {
    it('has only the existing limiter dependencies, never source, SQL, file, network or app imports', async () => {
        const result = await build({
            entryPoints: ['src/reader/progress-writes.ts'],
            bundle: true,
            platform: 'node',
            format: 'esm',
            write: false,
            metafile: true,
            logLevel: 'silent'
        })
        for (const name of Object.keys(result.metafile!.inputs))
            expect(
                name === 'src/reader/progress-writes.ts' ||
                    /node_modules\/(p-limit|yocto-queue)\//.test(name)
            ).toBe(true)
        for (const external of Object.values(result.metafile!.outputs).flatMap(
            (output) => output.imports
        ))
            expect(external.path).toBe('async_hooks')
    })
    it('runs one state namespace FIFO even if the newer job could finish immediately', async () => {
        const owner = {},
            gate = deferred(),
            started = deferred(),
            calls: number[] = []
        const first = orderReaderProgress(owner, 'progress', async () => {
            started.resolve()
            await gate.promise
            calls.push(1)
        })
        await started.promise
        const second = orderReaderProgress(owner, 'progress', async () => {
            calls.push(2)
        })
        await Promise.resolve()
        expect(calls).toEqual([])
        gate.resolve()
        await Promise.all([first, second])
        expect(calls).toEqual([1, 2])
    })
    it('does not serialize unrelated owners or namespaces behind a blocked writer', async () => {
        const owner = {},
            gate = deferred(),
            started = deferred()
        const first = orderReaderProgress(owner, 'A', async () => {
            started.resolve()
            await gate.promise
        })
        await started.promise
        await expect(
            orderReaderProgress(owner, 'B', async () => 2)
        ).resolves.toBe(2)
        await expect(orderReaderProgress({}, 'A', async () => 3)).resolves.toBe(
            3
        )
        gate.resolve()
        await first
    })
    it('allows the next save after a rejected effect without poisoning the lane', async () => {
        const owner = {}
        const first = orderReaderProgress(owner, 'progress', async () => {
            throw new Error('save failed')
        })
        const second = orderReaderProgress(
            owner,
            'progress',
            async () => 'latest'
        )
        await expect(first).rejects.toThrow('save failed')
        await expect(second).resolves.toBe('latest')
    })
    it('bounds the per-namespace queue without silently dropping an accepted write', async () => {
        const owner = {},
            gate = deferred(),
            completed: number[] = []
        const accepted = Array.from({ length: 64 }, (_, index) =>
            orderReaderProgress(owner, 'progress', async () => {
                await gate.promise
                completed.push(index)
            })
        )
        await expect(
            orderReaderProgress(owner, 'progress', async () => 'overflow')
        ).rejects.toThrow('busy')
        gate.resolve()
        await Promise.all(accepted)
        expect(completed).toEqual(
            Array.from({ length: 64 }, (_, index) => index)
        )
    })
    it('bounds all pending namespaces and reuses capacity after completion', async () => {
        const owner = {},
            gate = deferred()
        const accepted = Array.from({ length: 256 }, (_, index) =>
            orderReaderProgress(owner, 'p' + (index % 4), async () => {
                await gate.promise
            })
        )
        await expect(
            orderReaderProgress(owner, 'another', async () => 0)
        ).rejects.toThrow('busy')
        gate.resolve()
        await Promise.all(accepted)
        await expect(
            orderReaderProgress(owner, 'another', async () => 1)
        ).resolves.toBe(1)
    })
    it('evicts an idle namespace rather than growing its registry indefinitely', async () => {
        const owner = {}
        for (let index = 0; index < 140; index++)
            await expect(
                orderReaderProgress(owner, 'p' + index, async () => index)
            ).resolves.toBe(index)
    })
    it('rejects malformed namespaces before executing work', async () => {
        const write = vi.fn(async () => 1)
        for (const key of ['', 'a'.repeat(513), 'bad\0key'])
            await expect(orderReaderProgress({}, key, write)).rejects.toThrow(
                'Invalid'
            )
        expect(write).not.toHaveBeenCalled()
    })
})

describe('actual OnlineReaderService write ordering with in-memory ports only', () => {
    it('shares a persisted namespace lane between separate service/session instances', async () => {
        const h = fixture(),
            gate = deferred(),
            started = deferred()
        const first = h.reader({
                slow: gate.promise,
                started: () => started.resolve()
            }),
            second = h.reader()
        const old = first.service.saveProgress('comic', 'episode', 0)
        await started.promise
        const latest = second.service.saveProgress('comic', 'episode', 1)
        await Promise.resolve()
        expect(second.provider.getEpisodes).not.toHaveBeenCalled()
        gate.resolve()
        await Promise.all([old, latest])
        expect(second.service.recentProgress()).toMatchObject([
            { comicId: 'comic', episodeId: 'episode', pageIndex: 1 }
        ])
        expect(first.provider.fetchPage).not.toHaveBeenCalled()
        expect(second.provider.fetchPage).not.toHaveBeenCalled()
    })
    it('does not bind a queued save to an account/session changed after submission', async () => {
        const h = fixture(),
            gate = deferred(),
            started = deferred()
        let scope = 'original'
        const first = h.reader({
                slow: gate.promise,
                started: () => started.resolve()
            }),
            next = h.reader({ scope: () => scope })
        const old = first.service.saveProgress('comic', 'episode', 0)
        await started.promise
        const stale = next.service.saveProgress('comic', 'episode', 1)
        const rejected = expect(stale).rejects.toThrow('session changed')
        scope = 'replacement'
        gate.resolve()
        await old
        await rejected
        expect(next.provider.getEpisodes).not.toHaveBeenCalled()
        expect(first.service.recentProgress()[0].pageIndex).toBe(0)
    })
    it('preserves a later valid save when an earlier page is invalid', async () => {
        const h = fixture(),
            { service } = h.reader()
        const invalid = service.saveProgress('comic', 'episode', 99)
        const valid = service.saveProgress('comic', 'episode', 1)
        await expect(invalid).rejects.toThrow('页码')
        await expect(valid).resolves.toMatchObject({ pageIndex: 1 })
        expect(service.recentProgress()).toHaveLength(1)
    })
    it('keeps declared hosted/private progress namespaces independent', async () => {
        const h = fixture(),
            gate = deferred(),
            started = deferred()
        const contract = (progressKey: string): OnlineReaderContract => ({
            progressKey,
            comicId: (value) => value,
            episodeId: (value) => value,
            pageUrl: () => '/owned-page',
            assertAccess: () => {}
        })
        const a = h.reader({
                slow: gate.promise,
                started: () => started.resolve(),
                contract: contract('principal-a')
            }),
            b = h.reader({ contract: contract('principal-b') })
        const blocked = a.service.saveProgress('owned', 'episode', 0)
        await started.promise
        await expect(
            b.service.saveProgress('owned', 'episode', 1)
        ).resolves.toMatchObject({ pageIndex: 1 })
        gate.resolve()
        await blocked
        expect(a.service.recentProgress()[0].pageIndex).toBe(0)
        expect(b.service.recentProgress()[0].pageIndex).toBe(1)
    })
})
