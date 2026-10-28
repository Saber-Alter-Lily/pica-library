import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { SignedSourceDesktopReader } from '../../src/desktop/signed-source-reader'
import { ehPublicIdentityBridge } from '../../src/source-extensions/eh-public-bridge'
import { EH_PUBLIC_WORKER_ID } from '../../src/source-extensions/eh-public-identity'
import {
    SignedWorkerStore, sourceWorkerSignaturePayload
} from '../../src/source-extensions/signed-worker-store'
import { PreviewCacheManager } from '../../src/services/preview-cache-manager'

const legacyId = 'eh:123:abcdef1234'
/**
 * These responses replace the remote HTTP layer in the independently
 * bundled worker. Real EhProvider parser, chapter/page URL validation, IPC,
 * signature checks, cache and Reader run unchanged. No actual network or
 * account access is needed for the CI acceptance fixture.
 */
const fixtureBanner = String.raw`
globalThis.fetch = async (request, init) => {
    const url = String(request)
    if (new Headers(init && init.headers).has('cookie'))
        throw new Error('Public E-H worker must not send cookies')
    if (url === 'https://api.e-hentai.org/api.php')
        return new Response(JSON.stringify({gmetadata: [{
            gid: 123, token: 'abcdef1234', title: 'E-H IPC gallery',
            filecount: '1', category: 'Doujinshi', tags: []
        }]}), { status: 200, headers: {'content-type': 'application/json'} })
    if (url.startsWith('https://e-hentai.org/g/123/abcdef1234/'))
        return new Response('<a href="/s/abcdef/123-1">Page</a>', {status: 200})
    if (url === 'https://e-hentai.org/s/abcdef/123-1')
        return new Response('<img id="img" src="https://images.example.org/fixture.jpg">', {status: 200})
    if (url === 'https://images.example.org/fixture.jpg')
        return new Response(new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1]),
            {status: 200, headers: {'content-type': 'image/jpeg'}})
    throw new Error('Test worker denied network URL')
}
`

describe('S3 E-H existing Provider bundled in a real signed child process', () => {
    it('isolates provider parsing and retains original gallery IDs/owned progress across disable', async () => {
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-eh-worker-'))
        let controller: SignedSourceDesktopReader | undefined
        try {
            const outfile = path.join(folder, 'worker.cjs')
            const built = await build({
                entryPoints: ['src/source-extensions/workers/eh-public-worker.ts'],
                outfile,
                bundle: true,
                platform: 'node',
                format: 'cjs',
                target: 'node22',
                banner: { js: fixtureBanner },
                logLevel: 'silent'
            })
            expect(built.errors).toHaveLength(0)
            const bytes = fs.readFileSync(outfile)
            expect(bytes.length).toBeGreaterThan(1000)
            expect(bytes.length).toBeLessThan(1024 * 1024)
            const keys = generateKeyPairSync('ed25519')
            const payload = {
                schemaVersion: 1 as const,
                sourceId: EH_PUBLIC_WORKER_ID,
                version: '0.0.1-qa',
                size: bytes.length,
                sha256: createHash('sha256').update(bytes).digest('hex')
            }
            const store = new SignedWorkerStore({
                root: path.join(folder, 'installed'),
                publisherPublicKeyPem: keys.publicKey.export({
                    format: 'pem', type: 'spki'
                }).toString(),
                requestTimeoutMs: 8000
            })
            store.install({
                ...payload,
                signature: sign(null, sourceWorkerSignaturePayload(payload), keys.privateKey)
                    .toString('base64')
            }, bytes)
            const states = new Map<string, unknown>()
            controller = new SignedSourceDesktopReader(store, {
                getAppState<T>(key: string) {
                    return states.get(key) as T | undefined
                },
                setAppState(key: string, value: unknown) {
                    states.set(key, value)
                }
            }, () => new PreviewCacheManager(
                path.join(folder, 'cache'),
                { maxBytes: 4 * 1024 * 1024, ttlMs: 30_000 }
            ), new Map([[EH_PUBLIC_WORKER_ID, ehPublicIdentityBridge]]))

            expect(await controller.command({
                operation: 'status', sourceId: EH_PUBLIC_WORKER_ID
            })).toMatchObject({ activeVersion: null, revision: 0, connected: false })
            await expect(controller.command({
                operation: 'connect', sourceId: EH_PUBLIC_WORKER_ID
            })).rejects.toThrow('disabled')
            await controller.command({
                operation: 'activate', sourceId: EH_PUBLIC_WORKER_ID,
                version: '0.0.1-qa', expectedRevision: 0
            })
            const session = await controller.command({
                operation: 'connect', sourceId: EH_PUBLIC_WORKER_ID
            }) as { sessionId: string; connected: boolean }
            expect(session.connected).toBe(true)
            const chapters = await controller.read(session.sessionId, 'chapters', {
                comicId: legacyId
            }) as Array<{ id: string; title: string }>
            expect(chapters).toHaveLength(1)
            expect(chapters[0]).toMatchObject({ id: 'eh-123', title: 'E-H IPC gallery' })
            const chapter = await controller.read(session.sessionId, 'chapter', {
                comicId: legacyId, episodeId: 'eh-123'
            }) as { pages: Array<{ url: string }> }
            expect(chapter.pages).toHaveLength(1)
            expect(chapter.pages[0].url).toContain(encodeURIComponent(legacyId))
            expect(JSON.stringify(chapter)).not.toContain('eh-page:')
            const image = await controller.read(session.sessionId, 'picture', {
                comicId: legacyId, episodeId: 'eh-123', pageIndex: 0
            }) as { contentType: string; data: Buffer }
            expect(image.contentType).toBe('image/jpeg')
            expect([...image.data.slice(0, 3)]).toEqual([255, 216, 255])
            await expect(controller.read(session.sessionId, 'picture', {
                comicId: 'eh:124:abcdef1234', episodeId: 'eh-123', pageIndex: 0
            })).rejects.toThrow()
            const progress = await controller.read(session.sessionId, 'save-progress', {
                comicId: legacyId, episodeId: 'eh-123', pageIndex: 0
            }) as { comicId: string }
            expect(progress.comicId).toBe(legacyId)
            expect(states.has('online-reader-progress-v1')).toBe(false)
            expect(states.has('signed-source-progress-v1:' + EH_PUBLIC_WORKER_ID)).toBe(true)
            const library = controller.readingLibraryRows()
            expect(library).toHaveLength(1)
            expect(library[0]).toMatchObject({
                comicId: legacyId, channel: 'signed', sessionId: session.sessionId
            })
            await controller.command({
                operation: 'disable', sourceId: EH_PUBLIC_WORKER_ID,
                expectedRevision: 1
            })
            expect(controller.readingLibraryRows()).toEqual([])
            await expect(controller.read(session.sessionId, 'picture', {
                comicId: legacyId, episodeId: 'eh-123', pageIndex: 0
            })).rejects.toThrow()
            expect(states.has('signed-source-progress-v1:' + EH_PUBLIC_WORKER_ID)).toBe(true)
        } finally {
            controller?.close()
            // Immutable fixture generations can be read-only on Windows.
            const root = path.join(folder, 'installed', EH_PUBLIC_WORKER_ID, 'versions')
            if (fs.existsSync(root)) {
                for (const version of fs.readdirSync(root))
                    for (const name of ['worker.cjs', 'release.json']) {
                        const file = path.join(root, version, name)
                        if (fs.existsSync(file)) fs.chmodSync(file, 0o600)
                    }
            }
            fs.rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 })
        }
    }, 60_000)
})
