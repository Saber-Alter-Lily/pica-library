import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OnlineReaderService } from '../../src/services/online-reader-service'
import { bindExternalReader } from '../../src/source-extensions/desktop-reader-adapter'
import {
    SignedWorkerStore, sourceWorkerSignaturePayload,
    type SignedSourceWorkerRelease
} from '../../src/source-extensions/signed-worker-store'

const fixtureFile = fileURLToPath(new URL('../fixtures/s3-trusted-worker.cjs', import.meta.url))
const workerBytes = fs.readFileSync(fixtureFile)
const tempRoots: string[] = []
const stores: SignedWorkerStore[] = []
const manifest = {
    apiVersion: 1, id: 'demo',
    capabilities: { chapters: true, pages: true, media: true }
} as const

function fixture() {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'signed-source-worker-'))
    tempRoots.push(folder)
    const keys = generateKeyPairSync('ed25519')
    const root = path.join(folder, 'workers')
    const publisherPublicKeyPem = keys.publicKey.export({
        format: 'pem', type: 'spki'
    }).toString()
    const store = new SignedWorkerStore({
        root, publisherPublicKeyPem, requestTimeoutMs: 1500
    })
    stores.push(store)
    const signed = (version: string, data = workerBytes): SignedSourceWorkerRelease => {
        const unsigned = {
            schemaVersion: 1 as const, sourceId: 'demo',
            version, size: data.byteLength,
            sha256: createHash('sha256').update(data).digest('hex')
        }
        return {
            ...unsigned,
            signature: sign(null, sourceWorkerSignaturePayload(unsigned),
                keys.privateKey).toString('base64')
        }
    }
    return { folder, root, store, signed, keys, publisherPublicKeyPem }
}

afterEach(() => {
    vi.restoreAllMocks()
    for (const store of stores.splice(0)) store.close()
    for (const folder of tempRoots.splice(0))
        fs.rmSync(folder, { recursive: true, force: true })
})

describe('S3 signed source generations: real worker lifecycle', () => {
    it('rejects unsigned or forged metadata without writing or running anything', () => {
        const f = fixture()
        const good = f.signed('1.0.0')
        expect(() => f.store.install({ ...good, script: 'run-this' }, workerBytes))
            .toThrow('Invalid signed worker release')
        expect(() => f.store.install({ ...good, signature: 'A'.repeat(86) + '==' },
            workerBytes)).toThrow('publisher verification failed')
        expect(() => f.store.install(good, Buffer.from('tampered')))
            .toThrow('payload does not match release')
        const altered = { ...good, version: '2.0.0' }
        expect(() => f.store.install(altered, workerBytes))
            .toThrow('publisher verification failed')
        const wrongKey = generateKeyPairSync('ed25519')
        const otherSignature = sign(null, sourceWorkerSignaturePayload(good),
            wrongKey.privateKey).toString('base64')
        expect(() => f.store.install({ ...good, signature: otherSignature },
            workerBytes)).toThrow('publisher verification failed')
        expect(fs.existsSync(f.root)).toBe(false)
    })

    it('stages verified payload without activation and refuses replacing generations', () => {
        const f = fixture()
        const release = f.signed('1.0.0')
        expect(f.store.install(release, workerBytes)).toEqual({
            sourceId: 'demo', version: '1.0.0', installed: true
        })
        expect(f.store.state('demo')).toEqual({
            schemaVersion: 1, revision: 0, activeVersion: null
        })
        expect(f.store.install(release, workerBytes).installed).toBe(false)
        const installed = f.store.readInstalled('demo', '1.0.0')
        expect(installed.release.sha256).toBe(release.sha256)
        expect(path.basename(installed.workerPath)).toBe('worker.cjs')
        const poisoned = { ...release, signature: 'A'.repeat(86) + '==' }
        expect(() => f.store.install(poisoned, workerBytes)).toThrow()
        const inventory = fs.readdirSync(installed.folder).sort()
        expect(inventory).toEqual(['release.json', 'worker.cjs'])
        awaitNoWorkerRequired(f)
    })

    it('activates explicitly and runs the signed worker in the unchanged Reader', async () => {
        const f = fixture()
        f.store.install(f.signed('1.0.0'), workerBytes)
        await expect(f.store.openActive('demo')).rejects.toThrow('not enabled')
        expect(f.store.activate('demo', '1.0.0', 0)).toEqual({
            schemaVersion: 1, revision: 1, activeVersion: '1.0.0'
        })
        const worker = await f.store.openActive('demo')
        const memory = new Map<string, unknown>()
        const { source, contract } = bindExternalReader(manifest, worker, worker)
        const reader = new OnlineReaderService({
            getAppState<T>(key: string) { return memory.get(key) as T | undefined },
            setAppState(key: string, value: unknown) { memory.set(key, value) }
        }, source, {
            get() { return null },
            put() { return undefined }
        }, contract)
        expect(await reader.chapters('demo:book1')).toMatchObject([
            { id: 'chapter-1', title: 'Offline QA' }
        ])
        expect((await reader.chapter('demo:book1', 'chapter-1')).pages).toHaveLength(6)
        expect((await reader.picture('demo:book1', 'chapter-1', 0)).contentType)
            .toBe('image/png')
        await reader.saveProgress('demo:book1', 'chapter-1', 2)
        expect(reader.recentProgress()[0].pageIndex).toBe(2)
        await expect(f.store.openActive('demo')).rejects.toThrow('already running')
    })

    it('keeps signed prior generations, supports explicit rollback and blocks stale revisions', async () => {
        const f = fixture()
        f.store.install(f.signed('1.0.0'), workerBytes)
        f.store.activate('demo', '1.0.0', 0)
        const original = await f.store.openActive('demo')
        f.store.install(f.signed('1.1.0'), workerBytes)
        expect(f.store.state('demo').activeVersion).toBe('1.0.0')
        expect(() => f.store.activate('demo', '1.1.0', 0))
            .toThrow('selection changed')
        const upgraded = f.store.activate('demo', '1.1.0', 1)
        expect(upgraded).toMatchObject({ revision: 2, activeVersion: '1.1.0' })
        expect(() => original.assertEnabled()).toThrow('Source process is disabled')
        const second = await f.store.openActive('demo')
        expect(await second.episodes('demo:book1')).toHaveLength(1)
        const rolledBack = f.store.rollback('demo', '1.0.0', 2)
        expect(rolledBack).toMatchObject({ revision: 3, activeVersion: '1.0.0' })
        expect(() => second.assertEnabled()).toThrow('Source process is disabled')
        const restored = await f.store.openActive('demo')
        expect(restored.revision()).not.toBe(original.revision())
    })

    it('disables active worker before an in-flight request can publish a late image', async () => {
        const f = fixture()
        f.store.install(f.signed('1.0.0'), workerBytes)
        f.store.activate('demo', '1.0.0', 0)
        const worker = await f.store.openActive('demo')
        const pending = worker.media('demo:book1', 'slow')
        expect(f.store.disable('demo', 1)).toEqual({
            schemaVersion: 1, revision: 2, activeVersion: null
        })
        await expect(pending).rejects.toThrow('Source process is disabled')
        await expect(f.store.openActive('demo')).rejects.toThrow('not enabled')
        expect(f.store.state('demo').activeVersion).toBeNull()
    })

    it('detects an installed worker altered after signing; does not activate it', async () => {
        const f = fixture()
        f.store.install(f.signed('1.0.0'), workerBytes)
        const installed = f.store.readInstalled('demo', '1.0.0')
        fs.chmodSync(installed.workerPath, 0o600)
        fs.writeFileSync(installed.workerPath, 'console.log("tampered")')
        expect(() => f.store.readInstalled('demo', '1.0.0'))
            .toThrow('integrity check failed')
        expect(() => f.store.activate('demo', '1.0.0', 0))
            .toThrow('integrity check failed')
        expect(f.store.state('demo')).toEqual({
            schemaVersion: 1, revision: 0, activeVersion: null
        })
    })

    it('uses atomic pointer replacement and retains previous active version if it fails', () => {
        const f = fixture()
        f.store.install(f.signed('1.0.0'), workerBytes)
        f.store.install(f.signed('1.1.0'), workerBytes)
        f.store.activate('demo', '1.0.0', 0)
        const original = fs.renameSync
        const spy = vi.spyOn(fs, 'renameSync').mockImplementation((a, b) => {
            if (path.basename(String(b)) === 'active.json')
                throw new Error('simulated interruption before activation')
            return original(a, b)
        })
        expect(() => f.store.activate('demo', '1.1.0', 1))
            .toThrow('simulated interruption')
        spy.mockRestore()
        expect(f.store.state('demo')).toEqual({
            schemaVersion: 1, revision: 1, activeVersion: '1.0.0'
        })
        const activeFolder = path.join(f.root, 'demo')
        expect(fs.readdirSync(activeFolder).some(x => x.startsWith('.active-')))
            .toBe(false)
    })

    it('persists only the activation pointer; restart never auto-executes or auto-enables', async () => {
        const f = fixture()
        f.store.install(f.signed('1.0.0'), workerBytes)
        f.store.activate('demo', '1.0.0', 0)
        const second = new SignedWorkerStore({
            root: f.root, publisherPublicKeyPem: f.publisherPublicKeyPem,
            requestTimeoutMs: 1500
        })
        stores.push(second)
        expect(second.state('demo')).toMatchObject({
            revision: 1, activeVersion: '1.0.0'
        })
        const worker = await second.openActive('demo')
        expect(await worker.pages('demo:book1', 'chapter-1')).toHaveLength(6)
        second.disable('demo', 1)
        const third = new SignedWorkerStore({
            root: f.root, publisherPublicKeyPem: f.publisherPublicKeyPem
        })
        stores.push(third)
        await expect(third.openActive('demo')).rejects.toThrow('not enabled')
        expect(third.state('demo').revision).toBe(2)
    })

    it('rejects invalid source IDs, versions, manifest fields and signature algorithms', () => {
        const f = fixture()
        expect(() => sourceWorkerSignaturePayload({
            sourceId: 'pica', version: '1.0.0', size: 1,
            sha256: '0'.repeat(64)
        })).toThrow()
        expect(() => sourceWorkerSignaturePayload({
            sourceId: 'demo', version: '../escape', size: 1,
            sha256: '0'.repeat(64)
        })).toThrow()
        expect(() => f.store.install({
            ...f.signed('1.0.0'), sourceId: 'demo/escape'
        }, workerBytes)).toThrow()
        const forgedKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
        expect(() => new SignedWorkerStore({
            root: path.join(f.folder, 'bad'),
            publisherPublicKeyPem: forgedKey.publicKey.export({
                format: 'pem', type: 'spki'
            }).toString()
        })).toThrow('Ed25519')
    })
})

/** No implicit process spawn is part of install(). */
function awaitNoWorkerRequired(f: ReturnType<typeof fixture>) {
    expect(f.store.state('demo').activeVersion).toBeNull()
}
