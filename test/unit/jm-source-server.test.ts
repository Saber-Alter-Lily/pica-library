import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'
import { enabledFixtureSources } from "../helpers/source-runtime-fixture"

it('keeps JM credentials/import mutations inside the loopback Desktop CSRF boundary', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-jm-server-'))
    const database = new LibraryDatabase(path.join(dir, 'library.db'))
    const service = new LibraryService(database, dir, undefined, undefined, undefined, enabledFixtureSources())
    vi.spyOn(service, 'jmRuntimeAvailable').mockReturnValue(true)
    vi.spyOn(service, 'jmAccountStatus').mockResolvedValue({
        configured: true,
        username: 'Fixture',
        enabled: true,
        remembered: true,
        verification: 'CACHED'
    })
    const connect = vi.spyOn(service, 'jmConnectAccount').mockResolvedValue({configured: true, username: 'Fixture'})
    const preview = vi
        .spyOn(service, 'jmPreviewFavorites')
        .mockResolvedValue({
            token: '00000000-0000-0000-0000-000000000001',
            providerId: 'jm',
            count: 1,
            pagesRead: 1,
            folderId: 0,
            sample: [],
            expiresInSeconds: 900,
            behavior: 'ADDITIVE_COLLECTION_IMPORT',
            explicitLikesCreated: 0
        })
    const save = vi.fn(async () => ({ configured: true }))
    const started = await startLibraryServer({
        database,
        service,
        host: '127.0.0.1',
        port: 0,
        desktop: {
            csrfToken: 'fixture-csrf',
            configured: () => true,
            status: () => ({}),
            save,
            testConnection: async () => ({}),
            chooseFolder: async () => null,
            exportBrowserLitePackage: async () => ({}),
            openDirectory: async () => {},
            shutdown: () => {}
        }
    })
    try {
        const status = await fetch(
            `${started.url}/api/v1/desktop/sources/jm/status`
        ).then((r) => r.json())
        expect(status).toEqual({
            available: true,
            configured: true,
            username: 'Fixture',
            enabled: true,
            remembered: true,
            verification: 'CACHED'
        })
        expect(connect).not.toHaveBeenCalled()
        const call = (action: string, csrf: string, origin = started.url, input: unknown = {folderId: 0}) =>
            fetch(`${started.url}/api/v1/desktop/sources/jm/${action}`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-pica-csrf': csrf,
                    origin
                },
                body: JSON.stringify(input)
            })
        expect((await call('preview', '')).status).toBe(403)
        expect(
            (await call('preview', 'fixture-csrf', 'https://not-local.example'))
                .status
        ).toBe(403)
        expect(preview).not.toHaveBeenCalled()
        expect((await call('connect', '', started.url, {})).status).toBe(403)
        expect((await call('connect', 'fixture-csrf', 'https://not-local.example', {})).status).toBe(403)
        expect((await call('connect', 'fixture-csrf', started.url, {enabled: ['jm']})).status).toBe(400)
        for (const input of [[], null, '', false])
            expect((await call('connect', 'fixture-csrf', started.url, input)).status).toBe(400)
        for (const [contentType, raw] of [['text/plain', '{}'], ['application/json', '{"password":"synthetic-private"'], ['application/json', ' '.repeat(4097)]]) {
            const invalid = await fetch(`${started.url}/api/v1/desktop/sources/jm/connect`, {
                method: 'POST', headers: {'content-type': contentType, 'x-pica-csrf': 'fixture-csrf', origin: started.url}, body: raw
            })
            expect(invalid.status).toBe(400)
            expect(await invalid.text()).not.toContain('synthetic-private')
        }
        expect(connect).not.toHaveBeenCalled()
        expect((await call('connect', 'fixture-csrf', started.url, {})).status).toBe(200)
        expect(connect).toHaveBeenCalledOnce()
        expect((await call('preview', 'fixture-csrf')).status).toBe(200)
        expect(preview).toHaveBeenCalledOnce()
        expect((await call('logout', 'fixture-csrf')).status).toBe(200)
        expect(save).toHaveBeenCalledWith({
            folderId: 0,
            jmAccountAction: 'logout'
        })
        expect(database.favoriteIds()).toEqual([])
    } finally {
        await new Promise<void>((resolve) =>
            started.server.close(() => resolve())
        )
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    }
})
