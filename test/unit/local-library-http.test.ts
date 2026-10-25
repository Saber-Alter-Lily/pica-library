import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'
import { startMobileBridge } from '../../src/mobile/bridge-server'
import { enabledFixtureSources } from "../helpers/source-runtime-fixture"

const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
    for (const close of cleanup.splice(0).reverse()) await close()
    vi.restoreAllMocks()
})
describe('local import HTTP and paired Reader boundary', () => {
    it('requires Desktop CSRF and picker selection; local reading/covers work across Web and authenticated LAN', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-local-http-'))
        const data = path.join(root, 'library'),
            original = path.join(root, 'my comic')
        fs.mkdirSync(data)
        fs.mkdirSync(original)
        fs.writeFileSync(path.join(original, '1.png'), png)
        const db = new LibraryDatabase(path.join(data, 'library.db'))
        const connect = vi
            .spyOn(LibraryService.prototype, 'connect')
            .mockRejectedValue(new Error('No provider allowed'))
        const service = new LibraryService(db, data, undefined, undefined, undefined, enabledFixtureSources())
        service.sources.apply({ schemaVersion: 1, revision: 1, enabled: [] })
        cleanup.push(async () => {
            db.close()
            fs.rmSync(root, { recursive: true, force: true })
        })
        const picker = vi.fn(async () => original)
        const server = await startLibraryServer({
            database: db,
            service,
            port: 0,
            desktop: {
                csrfToken: 'local-fixture-csrf',
                configured: () => true,
                status: () => ({
                    runtime: { mode: 'interactive' },
                    platform: { runtimeFoundation: true },
                    nativePicker: { folderPicker: true }
                }),
                save: async () => ({}),
                testConnection: async () => ({}),
                chooseFolder: async () => null,
                chooseLocalComic: picker,
                exportBrowserLitePackage: async () => ({}),
                openDirectory: async () => {},
                shutdown: () => {}
            }
        })
        cleanup.push(async () => {
            await new Promise<void>((resolve) =>
                server.server.close(() => resolve())
            )
        })
        const post = (
            operation: string,
            body: unknown,
            headers: Record<string, string> = {
                'x-pica-csrf': 'local-fixture-csrf'
            }
        ) =>
            fetch(server.url + '/api/v1/desktop/local-import/' + operation, {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...headers },
                body: JSON.stringify(body)
            })
        expect((await post('preview', { kind: 'folder' }, {})).status).toBe(403)
        expect(
            (
                await post(
                    'preview',
                    { kind: 'folder' },
                    {
                        'x-pica-csrf': 'local-fixture-csrf',
                        origin: 'https://evil.invalid'
                    }
                )
            ).status
        ).toBe(403)
        expect(
            (await post('preview', { kind: 'folder', path: root })).status
        ).toBe(400)
        expect(picker).not.toHaveBeenCalled()
        const capabilities = await fetch(
            server.url + '/api/v1/capabilities'
        ).then((r) => r.json())
        expect(capabilities.features.localFileImport).toBe(true)
        expect(capabilities.features.archiveReader).toBe(false)
        const preview = await post('preview', { kind: 'folder' }).then((r) =>
            r.json()
        )
        expect(picker).toHaveBeenCalledTimes(1)
        expect(db.listComics({})).toHaveLength(0)
        expect((await post('confirm', { token: 'wrong' })).ok).toBe(false)
        const imported = await post('confirm', { token: preview.token }).then(
            (r) => r.json()
        )
        const id = encodeURIComponent(imported.comicId)
        const cover = await fetch(server.url + '/api/v1/covers/' + id)
        expect(cover.headers.get('cache-control')).toBe('private, no-store')
        expect(Buffer.from(await cover.arrayBuffer())).toEqual(png)
        const chapters = await fetch(
            server.url + '/api/v1/reader/comics/' + id + '/chapters'
        ).then((r) => r.json())
        const chapter = await fetch(
            server.url +
                '/api/v1/reader/comics/' +
                id +
                '/chapters/' +
                encodeURIComponent(chapters[0].id)
        ).then((r) => r.json())
        expect(chapter.pages).toHaveLength(1)
        const webPageResponse = await fetch(server.url + chapter.pages[0].url)
        expect(Buffer.from(await webPageResponse.arrayBuffer())).toEqual(png)

        const bridge = await startMobileBridge({
            database: db,
            service,
            host: '127.0.0.1',
            port: 0,
            stateFile: path.join(root, 'paired.json')
        })
        cleanup.push(async () => bridge.close())
        const address = bridge.status().addresses[0]
        expect((await fetch(address + '/mobile/v1/library')).status).toBe(401)
        const paired = await fetch(address + '/mobile/v1/pair', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: bridge.status().pairingCode,
                deviceName: 'Synthetic local Reader'
            })
        }).then((r) => r.json())
        const headers = { authorization: 'Bearer ' + paired.token }
        const library = await fetch(
            address + '/mobile/v1/library?scope=library',
            { headers }
        ).then((r) => r.json())
        expect(library.items[0]).toMatchObject({
            comicId: imported.comicId,
            providerId: 'local',
            downloadedPictures: 1
        })
        expect(JSON.stringify(library)).not.toContain(original)
        const mobileCover = await fetch(address + library.items[0].coverPath, {
            headers
        })
        expect(mobileCover.headers.get('cache-control')).toBe(
            'private, no-store'
        )
        expect(Buffer.from(await mobileCover.arrayBuffer())).toEqual(png)
        const mobileChapter = await fetch(
            address +
                '/mobile/v1/comics/' +
                id +
                '/chapters/' +
                encodeURIComponent(chapters[0].id),
            { headers }
        ).then((r) => r.json())
        expect(mobileChapter.pages[0].url).toContain('?v=')
        const mobilePageResponse = await fetch(
            address + mobileChapter.pages[0].url,
            { headers }
        )
        expect(Buffer.from(await mobilePageResponse.arrayBuffer())).toEqual(png)
        expect(
            (
                await fetch(address + '/api/v1/desktop/local-import/preview', {
                    method: 'POST',
                    headers,
                    body: '{}'
                })
            ).ok
        ).toBe(false)
        expect(connect).not.toHaveBeenCalled()
    })
})
