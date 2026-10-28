import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'
import { PreviewCacheManager } from '../../src/services/preview-cache-manager'
import { SignedSourceDesktopReader } from '../../src/desktop/signed-source-reader'
import {
    SignedWorkerStore, sourceWorkerSignaturePayload
} from '../../src/source-extensions/signed-worker-store'

const workerFile = fileURLToPath(new URL('../fixtures/s3-trusted-worker.cjs', import.meta.url))
const workerBytes = fs.readFileSync(workerFile)

describe('S3 Desktop HTTP signed-worker integration: opt-in, localhost only', () => {
    let dir: string
    let db: LibraryDatabase
    let store: SignedWorkerStore
    let desktopReader: SignedSourceDesktopReader
    let server: Server
    let baseUrl: string
    const token = 'signed-source-fixture-csrf'
    const keys = generateKeyPairSync('ed25519')
    const publicPem = keys.publicKey.export({ format: 'pem', type: 'spki' }).toString()
    const signed = (version: string) => {
        const body = {
            schemaVersion: 1 as const,
            sourceId: 'demo',
            version,
            size: workerBytes.length,
            sha256: createHash('sha256').update(workerBytes).digest('hex')
        }
        return {
            ...body,
            signature: sign(null, sourceWorkerSignaturePayload(body), keys.privateKey)
                .toString('base64')
        }
    }

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3-desktop-signed-reader-'))
        db = new LibraryDatabase(path.join(dir, 'library.db'))
        const service = new LibraryService(db, dir)
        store = new SignedWorkerStore({
            root: path.join(dir, 'source-workers'),
            publisherPublicKeyPem: publicPem,
            requestTimeoutMs: 1500
        })
        store.install(signed('1.0.0'), workerBytes)
        store.install(signed('1.1.0'), workerBytes)
        desktopReader = new SignedSourceDesktopReader(
            store, db, () => new PreviewCacheManager(
                path.join(dir, 'signed-cache'),
                { maxBytes: 4 * 1024 * 1024, ttlMs: 30_000 }
            )
        )
        const result = await startLibraryServer({
            database: db,
            service,
            port: 0,
            host: '127.0.0.1',
            desktop: {
                csrfToken: token,
                signedSourceReader: desktopReader,
                configured: () => true,
                status: () => ({ startupReady: true }),
                save: async () => ({}),
                testConnection: async () => ({}),
                chooseFolder: async () => null,
                exportBrowserLitePackage: async () => ({}),
                openDirectory: async () => {},
                shutdown: () => {}
            }
        })
        server = result.server
        baseUrl = result.url
    })

    afterAll(async () => {
        desktopReader?.close()
        if (server) await new Promise<void>((resolve) =>
            server.close(() => resolve())
        )
        db?.close()
        // The test deliberately installs read-only worker generations.
        // Restore attributes for Windows fixture teardown, not production.
        const versions = path.join(dir, 'source-workers', 'demo', 'versions')
        if (fs.existsSync(versions)) for (const version of fs.readdirSync(versions))
            for (const name of ['worker.cjs', 'release.json']) {
                const file = path.join(versions, version, name)
                if (fs.existsSync(file)) fs.chmodSync(file, 0o600)
            }
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 })
    })

    const endpoint = '/api/v1/desktop/signed-reader'
    const authorized = () => ({
        origin: baseUrl,
        'x-pica-csrf': token
    })
    const post = async (path: string, input: object, extra: Record<string, string> = {}) =>
        fetch(baseUrl + path, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...authorized(),
                ...extra
            },
            body: JSON.stringify(input)
        })
    const get = (path: string, extra: Record<string, string> = {}) =>
        fetch(baseUrl + path, { headers: { ...authorized(), ...extra } })

    it('keeps signed endpoints unavailable in an ordinary Desktop server without an injected controller', async () => {
        const ordinary = await startLibraryServer({
            database: db,
            service: new LibraryService(db, dir),
            host: '127.0.0.1',
            port: 0
        })
        try {
            const command = await fetch(ordinary.url + endpoint, {
                method: 'POST',
                headers: {
                    origin: ordinary.url,
                    'content-type': 'application/json',
                    'x-pica-csrf': token
                },
                body: JSON.stringify({ operation: 'connect', sourceId: 'demo' })
            })
            expect(command.status).toBe(403)
            const page = await fetch(ordinary.url + endpoint +
                '/00000000-0000-0000-0000-000000000000/progress', {
                    headers: { origin: ordinary.url, 'x-pica-csrf': token }
                })
            expect(page.status).toBe(403)
            // Disallowed access must not alter the approved source state.
            expect(store.state('demo').activeVersion).toBeNull()
        } finally {
            await new Promise<void>((resolve) =>
                ordinary.server.close(() => resolve())
            )
        }
    })

    it('has an explicitly installed generation but no implicitly running source', async () => {
        const status = await post(endpoint, { operation: 'status', sourceId: 'demo' })
        expect(status.status).toBe(200)
        expect(await status.json()).toEqual({
            sourceId: 'demo', schemaVersion: 1,
            revision: 0, activeVersion: null, connected: false
        })
        expect(fs.existsSync(path.join(dir, 'source-workers', 'demo', 'active.json')))
            .toBe(false)
        const local = await fetch(baseUrl + '/api/v1/capabilities')
        expect(local.status).toBe(200)
    })

    it('fails closed without Desktop authority, exact origin and CSRF, including GET images', async () => {
        for (const headers of [
            { origin: baseUrl },
            { 'x-pica-csrf': token },
            { origin: 'https://evil.invalid', 'x-pica-csrf': token },
            { origin: baseUrl, 'x-pica-csrf': 'incorrect' }
        ] as Array<Record<string, string>>) {
            const reply = await fetch(baseUrl + endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...headers },
                body: JSON.stringify({ operation: 'activate', sourceId: 'demo',
                    version: '1.0.0', expectedRevision: 0 })
            })
            expect(reply.status).toBe(403)
        }
        const unauthRead = await fetch(baseUrl +
            endpoint + '/00000000-0000-0000-0000-000000000000/progress')
        expect(unauthRead.status).toBe(403)
        const status = await post(endpoint, { operation: 'status', sourceId: 'demo' })
        expect((await status.json()).activeVersion).toBeNull()
    })

    it('never accepts an executable upload, path or publisher key through Desktop HTTP', async () => {
        for (const command of [
            { operation: 'install', sourceId: 'demo', workerPath: workerFile },
            { operation: 'connect', sourceId: 'demo', script: 'worker.cjs' },
            { operation: 'activate', sourceId: 'demo', version: '1.0.0',
                expectedRevision: 0, publicKey: publicPem }
        ]) {
            const reply = await post(endpoint, command)
            expect(reply.status).toBe(400)
        }
        const malformed = await fetch(baseUrl + endpoint, {
            method: 'POST',
            headers: { ...authorized(), 'content-type': 'application/json' },
            body: '{bad-json'
        })
        expect(malformed.status).toBe(400)
        const unchanged = await post(endpoint, { operation: 'status', sourceId: 'demo' })
        expect((await unchanged.json()).revision).toBe(0)
    })

    it('explicitly activates and reads signed source through the real HTTP server', async () => {
        const activate = await post(endpoint, {
            operation: 'activate', sourceId: 'demo', version: '1.0.0', expectedRevision: 0
        })
        expect(activate.status).toBe(200)
        expect(await activate.json()).toMatchObject({ activeVersion: '1.0.0', revision: 1 })
        const connect = await post(endpoint, { operation: 'connect', sourceId: 'demo' })
        expect(connect.status).toBe(200)
        const connected = await connect.json() as {
            sessionId: string; revision: number; sourceId: string
        }
        expect(connected).toMatchObject({ revision: 1, sourceId: 'demo' })
        const root = endpoint + '/' + connected.sessionId
        const chaptersResponse = await get(root + '/comics/demo%3Abook1/chapters')
        expect(chaptersResponse.status).toBe(200)
        const chapters = await chaptersResponse.json()
        expect(chapters[0]).toMatchObject({ id: 'chapter-1' })
        const chapterResponse = await get(root + '/comics/demo%3Abook1/chapters/chapter-1')
        expect(chapterResponse.status).toBe(200)
        const chapter = await chapterResponse.json()
        expect(chapter.pages).toHaveLength(6)
        expect(chapter.pages[0].url).toContain('/desktop/signed-reader/')
        expect(JSON.stringify(chapter)).not.toContain('source-page:')
        const imageResponse = await get(chapter.pages[0].url)
        expect(imageResponse.status).toBe(200)
        expect(imageResponse.headers.get('content-type')).toBe('image/png')
        expect(imageResponse.headers.get('cache-control')).toContain('no-store')
        expect(Buffer.from(await imageResponse.arrayBuffer()).subarray(0, 8))
            .toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        // Browser GET fetch often sends no Origin; Referrer + Sec-Fetch
        // and the application CSRF token must still authorize it.
        const browserImage = await fetch(baseUrl + chapter.pages[0].url, {
            headers: {
                referer: baseUrl + '/reader',
                'sec-fetch-site': 'same-origin',
                'x-pica-csrf': token
            }
        })
        expect(browserImage.status).toBe(200)
        const forgedReferrer = await fetch(baseUrl + chapter.pages[0].url, {
            headers: {
                referer: 'https://evil.invalid/',
                'sec-fetch-site': 'same-origin',
                'x-pica-csrf': token
            }
        })
        expect(forgedReferrer.status).toBe(403)

        const progress = await post(root + '/progress', {
            comicId: 'demo:book1', episodeId: 'chapter-1', pageIndex: 1
        })
        expect(progress.status).toBe(200)
        const saved = await get(root + '/progress')
        expect(saved.status).toBe(200)
        expect((await saved.json())[0]).toMatchObject({
            comicId: 'demo:book1', pageIndex: 1
        })
        expect(db.readingProgress()).toEqual([])
        expect(db.listReaderEpisodes('demo:book1')).toEqual([])
        expect(db.getComic('demo:book1')).toBeUndefined()

        // The existing unified ReadingLibrary sees the signed source's
        // read-only progress without catalog import or provider credentials.
        const unified = await post('/api/v1/desktop/reading-library/query', {
            query: { sourceKey: 'signed-source:demo' }
        })
        expect(unified.status).toBe(200)
        const unifiedBody = await unified.json() as {
            total: number
            items: Array<{
                comicId: string
                title: string | null
                source: { key: string }
                routes: Array<{
                    channel: string
                    available: boolean
                    progress: { pageIndex: number }
                }>
            }>
        }
        expect(unifiedBody.total).toBe(1)
        expect(unifiedBody.items[0]).toMatchObject({
            comicId: 'demo:book1',
            title: null,
            source: { key: 'signed-source:demo' },
            routes: [{
                channel: 'online', available: true,
                progress: { pageIndex: 1 }
            }]
        })

        const foreign = await get(root + '/comics/pica-work/chapters')
        expect(foreign.status).not.toBe(200)
        const deniedPage = await get(chapter.pages[0].url, {
            origin: 'https://evil.invalid'
        })
        expect(deniedPage.status).toBe(403)
        const old = await post(endpoint, { operation: 'activate',
            sourceId: 'demo', version: '1.1.0', expectedRevision: 1 })
        expect((await old.json()).revision).toBe(2)
        expect((await get(chapter.pages[0].url)).status).toBe(409)
        expect(db.getAppState('signed-source-progress-v1:demo')).toBeDefined()

        const stale = await post(endpoint, { operation: 'rollback',
            sourceId: 'demo', version: '1.0.0', expectedRevision: 1 })
        expect(stale.status).toBe(409)
        const rollback = await post(endpoint, { operation: 'rollback',
            sourceId: 'demo', version: '1.0.0', expectedRevision: 2 })
        expect(rollback.status).toBe(200)
        expect((await rollback.json()).activeVersion).toBe('1.0.0')
        const disable = await post(endpoint, { operation: 'disable',
            sourceId: 'demo', expectedRevision: 3 })
        expect(disable.status).toBe(200)
        const cannotConnect = await post(endpoint, { operation: 'connect', sourceId: 'demo' })
        expect(cannotConnect.status).toBe(409)
        const afterDisable = await post(
            '/api/v1/desktop/reading-library/query',
            { query: { sourceKey: 'signed-source:demo' } }
        )
        expect(afterDisable.status).toBe(200)
        expect((await afterDisable.json()).total).toBe(0)
        expect(db.getAppState('signed-source-progress-v1:demo')).toBeDefined()
    })

    it('cleans up a crashed worker without automatic restart, then reconnects only on explicit command', async () => {
        const initial = await post(endpoint, { operation: 'status', sourceId: 'demo' })
        expect(initial.status).toBe(200)
        const state = await initial.json() as {
            revision: number; activeVersion: string | null
        }
        expect(state.activeVersion).toBeNull()
        const selected = await post(endpoint, {
            operation: 'activate',
            sourceId: 'demo', version: '1.0.0',
            expectedRevision: state.revision
        })
        expect(selected.status).toBe(200)
        const current = await selected.json() as { revision: number }
        const joined = await post(endpoint, { operation: 'connect', sourceId: 'demo' })
        expect(joined.status).toBe(200)
        const { sessionId } = await joined.json() as { sessionId: string }
        const root = endpoint + '/' + sessionId
        const chapter = await get(root + '/comics/demo%3Abook1/chapters/chapter-1')
        expect(chapter.status).toBe(200)
        const page = await chapter.json() as {
            pages: Array<{ url: string }>
        }

        // Selecting exactly the same signed version must not disconnect
        // an already healthy session or misreport connected=false.
        const noop = await post(endpoint, {
            operation: 'activate', sourceId: 'demo',
            version: '1.0.0', expectedRevision: current.revision
        })
        expect(noop.status).toBe(200)
        expect(await noop.json()).toMatchObject({
            revision: current.revision, connected: true
        })
        expect((await get(page.pages[0].url)).status).toBe(200)

        // The fixture's fourth page exits the child process deliberately.
        expect((await get(page.pages[3].url)).status).toBe(409)
        const inactive = await post(endpoint, { operation: 'status', sourceId: 'demo' })
        expect(inactive.status).toBe(200)
        expect(await inactive.json()).toMatchObject({
            revision: current.revision, connected: false
        })
        // Reconnect is never automatic. Old URLs are invalid.
        expect((await get(page.pages[0].url)).status).toBe(409)
        const rejoin = await post(endpoint, { operation: 'connect', sourceId: 'demo' })
        expect(rejoin.status).toBe(200)
        const fresh = await rejoin.json() as { sessionId: string }
        expect(fresh.sessionId).not.toBe(sessionId)
        const chapters = await get(endpoint + '/' + fresh.sessionId +
            '/comics/demo%3Abook1/chapters')
        expect(chapters.status).toBe(200)
        expect((await post(endpoint, {
            operation: 'disable', sourceId: 'demo',
            expectedRevision: current.revision
        })).status).toBe(200)
        expect((await get(endpoint + '/' + fresh.sessionId + '/progress')).status).toBe(409)
    })
})
