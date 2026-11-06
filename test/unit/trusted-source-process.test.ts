import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { OnlineReaderService } from '../../src/services/online-reader-service'
import { bindExternalReader } from '../../src/source-extensions/desktop-reader-adapter'
import {
    TrustedSourceProcess, type TrustedSourceWorker
} from '../../src/source-extensions/trusted-process'

const root = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(root, '../fixtures/s3-trusted-worker.cjs')
const manifest = {
    apiVersion: 1, id: 'demo',
    capabilities: { chapters: true, pages: true, media: true }
}
const sha = createHash('sha256').update(fs.readFileSync(fixture)).digest('hex')
const base: TrustedSourceWorker = {
    workerRoot: path.dirname(fixture),
    workerPath: fixture,
    expectedSha256: sha,
    requestTimeoutMs: 1500
}
const processes: TrustedSourceProcess[] = []

async function launch(options: Partial<TrustedSourceWorker> = {}, sourceId = 'demo') {
    const worker = await TrustedSourceProcess.open(
        { ...manifest, id: sourceId },
        { ...base, ...options }
    )
    processes.push(worker)
    return worker
}

function reader(process: TrustedSourceProcess) {
    const state = new Map<string, unknown>()
    const images = new Map<string, { data: Buffer; contentType: string; fingerprint?: string }>()
    const ports = bindExternalReader(manifest, process, process)
    const service = new OnlineReaderService({
        getAppState<T>(key: string): T | undefined { return state.get(key) as T | undefined },
        setAppState(key: string, value: unknown) { state.set(key, value) }
    }, ports.source, {
        get(key: string, fingerprint?: string) {
            const item = images.get(key)
            if (!item || item.fingerprint !== fingerprint) return null
            return { data: item.data, contentType: item.contentType }
        },
        put(key: string, data: Buffer, contentType: string, fingerprint?: string) {
            images.set(key, { data, contentType, fingerprint })
        }
    }, ports.contract)
    return { service, images, state }
}

afterEach(() => { for (const proc of processes.splice(0)) proc.close() })

describe('S3 actual trusted child-process source proof', () => {
    it('routes real IPC chapters/pages/media/progress through the unchanged Reader', async () => {
        const process = await launch()
        const { service, images, state } = reader(process)
        expect(await service.chapters('demo:book1')).toEqual([{
            id: 'chapter-1', title: 'Offline QA', order: 1, source: 'provider'
        }])
        const chapter = await service.chapter('demo:book1', 'chapter-1')
        expect(chapter.pages).toHaveLength(6)
        expect(JSON.stringify(chapter)).not.toContain('source-page:')
        const picture = await service.picture('demo:book1', 'chapter-1', 0)
        expect(picture.contentType).toBe('image/png')
        expect(picture.data.subarray(0, 8).equals(Buffer.from([
            137, 80, 78, 71, 13, 10, 26, 10
        ]))).toBe(true)
        expect(images.size).toBe(1)
        await service.picture('demo:book1', 'chapter-1', 0)
        expect(images.size).toBe(1)
        await service.saveProgress('demo:book1', 'chapter-1', 1)
        expect(service.recentProgress()[0]).toMatchObject({
            comicId: 'demo:book1', episodeId: 'chapter-1', pageIndex: 1
        })
        expect(state.has('online-reader-progress-v1')).toBe(true)
    })

    it('requires an exact pinned worker, denies path escapes and rejects wrong handshakes', async () => {
        await expect(TrustedSourceProcess.open(manifest, {
            ...base, expectedSha256: '0'.repeat(64)
        })).rejects.toThrow('hash mismatch')
        await expect(TrustedSourceProcess.open(manifest, {
            ...base, workerRoot: root
        })).rejects.toThrow('escaped its approved root')
        await expect(launch({}, 'foreign')).rejects.toThrow('handshake')
    })

    it('cannot inherit parent source credentials and rejects injected executable manifest hints', async () => {
        const old = process.env.PICA_SECRET_FOR_TEST
        process.env.PICA_SECRET_FOR_TEST = 'parent-only-secret'
        try {
            const worker = await launch()
            expect(Buffer.from((await worker.media('demo:book1', 'env')).bytes)
                .toString('utf8')).toBe('not-inherited')
        } finally {
            if (old === undefined) delete process.env.PICA_SECRET_FOR_TEST
            else process.env.PICA_SECRET_FOR_TEST = old
        }
        await expect(TrustedSourceProcess.open({
            ...manifest, entrypoint: 'https://untrusted.invalid/extension.js'
        }, base)).rejects.toThrow('Invalid or unsupported')
    })

    it('revokes a real in-flight IPC request and never publishes its late image', async () => {
        const worker = await launch()
        const { service, images } = reader(worker)
        await service.chapter('demo:book1', 'chapter-1')
        const pending = service.picture('demo:book1', 'chapter-1', 1)
        await new Promise((resolve) => setTimeout(resolve, 80))
        worker.revoke()
        await expect(pending).rejects.toThrow(/disabled|Source worker/)
        expect(images.size).toBe(0)
        await expect(service.picture('demo:book1', 'chapter-1', 0))
            .rejects.toThrow('Source process is disabled')
    })

    it('bounds hung requests, kills the worker and refuses silent restart', async () => {
        const worker = await launch({ requestTimeoutMs: 250 })
        await expect(worker.media('demo:book1', 'never'))
            .rejects.toThrow('timed out')
        await expect(worker.episodes('demo:book1'))
            .rejects.toThrow('Source process is disabled')
    })

    it('fails closed when a worker exits while a request is outstanding', async () => {
        const worker = await launch()
        await expect(worker.media('demo:book1', 'crash'))
            .rejects.toThrow(/exited|disconnected/)
        await expect(worker.media('demo:book1', 'p1'))
            .rejects.toThrow('Source process is disabled')
    })

    it('enforces media and metadata validators across a real IPC boundary', async () => {
        const worker = await launch()
        await expect(worker.media('demo:book1', 'invalid'))
            .rejects.toThrow('Invalid source worker media')
        await expect(worker.episodes('demo:bad-chapters'))
            .rejects.toThrow('Invalid external chapter')
        await expect(worker.pages('demo:bad-pages', 'chapter-1'))
            .rejects.toThrow('Invalid external page token')
        await expect(worker.episodes('other:book1'))
            .rejects.toThrow('Comic does not belong to this source')
        await expect(worker.media('demo:book1', '../escape'))
            .rejects.toThrow('Invalid source page token')
    })

    it('limits concurrent requests and revocation rejects all outstanding calls', async () => {
        const worker = await launch()
        const requests = Array.from({ length: 4 },
            () => worker.media('demo:book1', 'slow'))
        await expect(worker.media('demo:book1', 'slow'))
            .rejects.toThrow('Too many source worker requests')
        worker.revoke()
        const settled = await Promise.allSettled(requests)
        expect(settled).toHaveLength(4)
        expect(settled.every((entry) => entry.status === 'rejected')).toBe(true)
    })
})
