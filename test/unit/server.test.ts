import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Server } from 'node:http'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'
import { Pica } from '../../src/sdk'

describe('local web server', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-server-'))
    const database = new LibraryDatabase(path.join(dir, 'library.db'))
    const service = new LibraryService(database, dir)
    let server: Server
    let url: string

    beforeAll(async () => {
        const started = await startLibraryServer({
            database,
            service,
            host: '127.0.0.1',
            port: 0
        })
        server = started.server
        url = started.url
    })

    afterAll(async () => {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
        )
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('serves the UI and status API', async () => {
        const page = await fetch(url)
        expect(page.status).toBe(200)
        expect(await page.text()).toContain('Pica Library')

        const status = await fetch(`${url}/api/v1/status`).then((response) =>
            response.json()
        )
        expect(status).toMatchObject({
            mode: 'connected',
            version: '0.2.0',
            summary: { comics: 0 }
        })
    })

    it('exposes explicit application capabilities', async () => {
        const capabilities = await fetch(`${url}/api/v1/capabilities`).then(
            (response) => response.json()
        )
        expect(capabilities).toMatchObject({
            appVersion: '0.2.0',
            appApiVersion: 2,
            databaseSchemaVersion: 7,
            updateManifestVersion: 1
        })
    })

    it('imports records through the local API', async () => {
        const response = await fetch(`${url}/api/v1/import`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                records: [
                    {
                        comicId: 'c1',
                        title: 'Work',
                        author: 'Alice',
                        categories: [],
                        tags: [],
                        finished: false
                    }
                ]
            })
        })
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ imported: 1 })
        const comics = await fetch(`${url}/api/v1/comics`).then((item) =>
            item.json()
        )
        expect(comics).toHaveLength(1)
    })

    it('uses the faceted query contract for complete filtered shelf actions', async () => {
        database.importFavorites([
            {
                comicId: 'facet-1',
                title: 'Facet Romance',
                author: 'Circle A (Alice)',
                categories: ['Drama'],
                tags: ['Romance', 'Color'],
                finished: true
            },
            {
                comicId: 'facet-2',
                title: 'Facet School',
                author: 'Bob',
                categories: ['Comedy'],
                tags: ['School'],
                finished: false
            }
        ])
        const query = {
            scope: 'favorites',
            text: 'alice',
            tags: ['Romance', 'Color'],
            tagMode: 'all',
            limit: 1
        }
        const filtered = await fetch(`${url}/api/v1/library/query`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(query)
        }).then((response) => response.json())
        expect(filtered).toMatchObject({ total: 1 })
        expect(filtered.facets.authors[0]).toMatchObject({
            label: 'Alice',
            count: 1
        })
        expect(filtered.facets.tags).toContainEqual(
            expect.objectContaining({ label: 'Romance', count: 1 })
        )

        const shelf = await fetch(`${url}/api/v1/shelves`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'API Shelf' })
        }).then((response) => response.json())
        const added = await fetch(
            `${url}/api/v1/shelves/${encodeURIComponent(shelf.id)}/add-filtered`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ query })
            }
        ).then((response) => response.json())
        expect(added).toMatchObject({ matched: 1, added: 1 })
        const contents = await fetch(
            `${url}/api/v1/shelves/${encodeURIComponent(shelf.id)}`
        ).then((response) => response.json())
        expect(
            contents.items.map((item: { comicId: string }) => item.comicId)
        ).toEqual(['facet-1'])
    })

    it('serves only registered downloaded reader pages and persists progress', async () => {
        const file = path.join(dir, 'downloads', 'reader-page.jpg')
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, 'reader-image')
        database.upsertEpisode({
            id: 'reader-api-episode',
            comicId: 'facet-1',
            title: 'Reader API chapter',
            order: 1
        })
        database.upsertPicture({
            id: 'reader-api-picture',
            comicId: 'facet-1',
            episodeId: 'reader-api-episode',
            position: 1,
            originalName: 'reader-page.jpg',
            mediaPath: 'reader-page.jpg',
            fileServer: 'https://media.example'
        })
        database.markPictureDownloaded(
            'reader-api-picture',
            file,
            fs.statSync(file).size,
            'hash'
        )
        const chapter = await fetch(
            `${url}/api/v1/reader/comics/facet-1/chapters/reader-api-episode`
        ).then((response) => response.json())
        expect(chapter.pages).toEqual([
            expect.objectContaining({
                id: 'reader-api-picture',
                url: '/api/v1/reader/pictures/reader-api-picture'
            })
        ])
        expect(JSON.stringify(chapter)).not.toContain(file)
        const image = await fetch(
            `${url}/api/v1/reader/pictures/reader-api-picture`
        )
        expect(image.headers.get('content-type')).toBe('image/jpeg')
        expect(await image.text()).toBe('reader-image')
        const progress = await fetch(`${url}/api/v1/reader/progress`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                comicId: 'facet-1',
                episodeId: 'reader-api-episode',
                pageIndex: 0
            })
        }).then((response) => response.json())
        expect(progress).toMatchObject({ pageIndex: 0 })
    })

    it('serves provider covers by comic id without accepting a caller URL', async () => {
        let fetches = 0
        const coverService = new LibraryService(database, dir, {
            fetchImage: async () => {
                fetches += 1
                return {
                    data: Buffer.from('safe-image'),
                    contentType: 'image/jpeg'
                }
            }
        } as unknown as Pica)
        database.importCatalog([
            {
                comicId: 'cover-comic',
                title: 'Cover work',
                author: 'Alice',
                categories: [],
                tags: [],
                finished: false,
                coverUrl: 'https://media.example/static/cover.jpg'
            }
        ])
        const isolated = await startLibraryServer({
            database,
            service: coverService,
            host: '127.0.0.1',
            port: 0
        })
        try {
            const first = await fetch(
                `${isolated.url}/api/v1/covers/cover-comic?url=https://attacker.example`
            )
            const second = await fetch(
                `${isolated.url}/api/v1/covers/cover-comic`
            )
            expect(first.status).toBe(200)
            expect(first.headers.get('content-type')).toBe('image/jpeg')
            expect(await first.text()).toBe('safe-image')
            expect(await second.text()).toBe('safe-image')
            expect(fetches).toBe(1)
        } finally {
            await new Promise<void>((resolve, reject) =>
                isolated.server.close((error) =>
                    error ? reject(error) : resolve()
                )
            )
        }
    })

    it('rejects cross-origin writes', async () => {
        const response = await fetch(`${url}/api/v1/import`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                origin: 'https://attacker.example'
            },
            body: JSON.stringify({ records: [] })
        })
        expect(response.status).toBe(403)
    })

    it('exposes durable download queue controls', async () => {
        const queued = await fetch(`${url}/api/v1/download`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                comicIds: ['c1'],
                source: 'library',
                run: false
            })
        })
        expect(queued.status).toBe(200)
        const [job] = (await queued.json()) as Array<{ id: string }>
        const jobs = await fetch(`${url}/api/v1/downloads`).then((response) =>
            response.json()
        )
        expect(jobs).toContainEqual(
            expect.objectContaining({ id: job.id, status: 'QUEUED' })
        )
        const paused = await fetch(`${url}/api/v1/downloads/${job.id}/pause`, {
            method: 'POST'
        })
        expect(await paused.json()).toMatchObject({ status: 'PAUSED' })
    })

    it('pauses a preparing job without returning HTTP 500', async () => {
        const job = database.createDownloadJob({ comicId: 'preparing-job' })
        database.transitionDownloadJob(job.id, 'QUEUED')
        database.transitionDownloadJob(job.id, 'PREPARING')
        const response = await fetch(
            `${url}/api/v1/downloads/${job.id}/pause`,
            { method: 'POST' }
        )
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ status: 'PAUSED' })
    })

    it('resets retry state through the retry API', async () => {
        const job = database.createDownloadJob({ comicId: 'failed-job' })
        database.transitionDownloadJob(job.id, 'QUEUED')
        database.transitionDownloadJob(job.id, 'PREPARING')
        database.transitionDownloadJob(job.id, 'FAILED', {
            retryCount: 3,
            error: 'failed'
        })
        const response = await fetch(
            `${url}/api/v1/downloads/${job.id}/retry`,
            { method: 'POST' }
        )
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            status: 'QUEUED',
            retryCount: 0,
            error: null
        })
    })

    it('validates custom performance settings through the Web API', async () => {
        const response = await fetch(`${url}/api/v1/downloads/run`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                profile: 'custom',
                jobConcurrency: 1,
                globalMediaConcurrency: 0,
                requestIntervalMs: 0,
                maxRetries: 0
            })
        })
        expect(response.status).toBe(500)
        expect(await response.json()).toMatchObject({
            error: expect.stringContaining('globalMediaConcurrency')
        })
    })
})

describe('server binding security', () => {
    it('rejects unsafe remote binding unless explicitly enabled', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-bind-'))
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        const service = new LibraryService(database, dir)
        await expect(
            startLibraryServer({ database, service, host: '0.0.0.0', port: 0 })
        ).rejects.toThrow('Remote binding is disabled')
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })
})

describe('desktop mutation security', () => {
    it('requires a local host, same origin and the current CSRF nonce', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-desktop-api-'))
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        const service = new LibraryService(database, dir)
        const save = vi.fn(async () => ({ success: true }))
        const started = await startLibraryServer({
            database,
            service,
            host: '127.0.0.1',
            port: 0,
            desktop: {
                csrfToken: 'current-nonce',
                configured: () => true,
                status: () => ({ profile: 'balanced' }),
                save,
                testConnection: async () => ({ success: true }),
                chooseFolder: async () => null,
                exportBrowserLitePackage: async () => ({ success: true }),
                openDirectory: async () => undefined,
                shutdown: () => undefined
            }
        })
        const payload = JSON.stringify({ password: 'not-returned' })
        try {
            const status = await fetch(
                `${started.url}/api/v1/desktop/status`
            ).then((response) => response.json())
            expect(status).toMatchObject({
                application: 'Pica Library',
                configured: true,
                csrfToken: 'current-nonce'
            })
            expect(JSON.stringify(status)).not.toContain('password')

            for (const headers of [
                { origin: started.url },
                {
                    origin: started.url,
                    'x-pica-csrf': 'stale-nonce'
                },
                {
                    origin: 'https://attacker.example',
                    'x-pica-csrf': 'current-nonce'
                }
            ]) {
                const requestHeaders = new Headers({
                    'content-type': 'application/json'
                })
                for (const [key, value] of Object.entries(headers))
                    if (value) requestHeaders.set(key, value)
                const response = await fetch(
                    `${started.url}/api/v1/desktop/settings`,
                    {
                        method: 'POST',
                        headers: requestHeaders,
                        body: payload
                    }
                )
                expect(response.status).toBe(403)
            }
            expect(save).not.toHaveBeenCalled()

            const accepted = await fetch(
                `${started.url}/api/v1/desktop/settings`,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        origin: started.url,
                        'x-pica-csrf': 'current-nonce'
                    },
                    body: payload
                }
            )
            expect(accepted.status).toBe(200)
            expect(save).toHaveBeenCalledTimes(1)
        } finally {
            await new Promise<void>((resolve, reject) =>
                started.server.close((error) =>
                    error ? reject(error) : resolve()
                )
            )
            database.close()
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })
})
