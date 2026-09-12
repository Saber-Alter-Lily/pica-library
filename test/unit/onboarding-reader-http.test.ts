import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'
import type { Pica } from '../../src/sdk'

describe('account and online reader HTTP boundary (no external provider)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-onboarding-http-'))
    const database = new LibraryDatabase(path.join(dir, 'library.db'))
    const register = vi.fn(async () => ({ registered: true }))
    const fetchPage = vi.fn(async () => ({
        data: Buffer.from('fixture-image'),
        contentType: 'image/png'
    }))
    const sdk = {
        episodesAll: async () => [
            { id: 'ep-one', title: 'Fixture chapter', order: 1 }
        ],
        picturesAll: async () => [
            { id: 'page-one', url: 'https://fixture.invalid/page' }
        ],
        fetchImage: fetchPage
    } as unknown as Pica
    const service = new LibraryService(database, dir, sdk)
    let started: Awaited<ReturnType<typeof startLibraryServer>>
    beforeAll(async () => {
        started = await startLibraryServer({
            database,
            service,
            host: '127.0.0.1',
            port: 0,
            desktop: {
                csrfToken: 'fixture-csrf',
                configured: () => true,
                status: () => ({}),
                registerAccount: register,
                save: async () => ({}),
                testConnection: async () => ({}),
                chooseFolder: async () => null,
                exportBrowserLitePackage: async () => ({}),
                openDirectory: async () => {},
                shutdown: () => {}
            }
        })
    })
    afterAll(async () => {
        await new Promise<void>((resolve) =>
            started.server.close(() => resolve())
        )
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })
    it('rejects registration without CSRF or from another origin before reaching the controller', async () => {
        for (const headers of [
            {},
            {
                'x-pica-csrf': 'fixture-csrf',
                origin: 'https://untrusted.invalid'
            }
        ] as Array<Record<string, string>>) {
            const response = await fetch(
                `${started.url}/api/v1/desktop/register-account`,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', ...headers },
                    body: '{}'
                }
            )
            expect(response.status).toBe(403)
        }
        expect(register).not.toHaveBeenCalled()
    })
    it('runs an explicitly submitted registration once, without implicit provider login', async () => {
        const response = await fetch(
            `${started.url}/api/v1/desktop/register-account`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-pica-csrf': 'fixture-csrf'
                },
                body: '{}'
            }
        )
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ registered: true })
        expect(register).toHaveBeenCalledTimes(1)
    })
    it('returns local page URLs, streams a page on demand, and saves progress without downloaded rows', async () => {
        const chapters = await fetch(
            `${started.url}/api/v1/online-reader/comics/fixture-comic/chapters`
        ).then((r) => r.json())
        expect(chapters[0]).toMatchObject({ id: 'ep-one', source: 'provider' })
        const chapter = await fetch(
            `${started.url}/api/v1/online-reader/comics/fixture-comic/chapters/ep-one`
        ).then((r) => r.json())
        expect(fetchPage).not.toHaveBeenCalled()
        expect(JSON.stringify(chapter)).not.toContain('fixture.invalid')
        const image = await fetch(`${started.url}${chapter.pages[0].url}`)
        expect(image.status).toBe(200)
        expect(image.headers.get('content-type')).toContain('image/png')
        expect(await image.text()).toBe('fixture-image')
        const progress = await fetch(
            `${started.url}/api/v1/online-reader/progress`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    comicId: 'fixture-comic',
                    episodeId: 'ep-one',
                    pageIndex: 0
                })
            }
        )
        expect(progress.status).toBe(200)
        expect(database.getComic('fixture-comic')).toBeUndefined()
        expect(database.readingProgress()).toEqual([])
        const saved = await fetch(
            `${started.url}/api/v1/online-reader/progress`
        ).then((r) => r.json())
        expect(saved[0]).toMatchObject({
            comicId: 'fixture-comic',
            pageIndex: 0
        })
    })
})
