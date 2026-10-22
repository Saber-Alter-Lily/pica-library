import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'

it('keeps JM credentials/import mutations inside the loopback Desktop CSRF boundary', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-jm-server-'))
    const database = new LibraryDatabase(path.join(dir, 'library.db'))
    const service = new LibraryService(database, dir)
    vi.spyOn(service, 'jmRuntimeAvailable').mockReturnValue(true)
    vi.spyOn(service, 'jmAccountStatus').mockResolvedValue({
        configured: true,
        username: 'Fixture'
    })
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
            username: 'Fixture'
        })
        const call = (action: string, csrf: string, origin = started.url) =>
            fetch(`${started.url}/api/v1/desktop/sources/jm/${action}`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-pica-csrf': csrf,
                    origin
                },
                body: JSON.stringify({ folderId: 0 })
            })
        expect((await call('preview', '')).status).toBe(403)
        expect(
            (await call('preview', 'fixture-csrf', 'https://not-local.example'))
                .status
        ).toBe(403)
        expect(preview).not.toHaveBeenCalled()
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
