import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'

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
            summary: { comics: 0 }
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
        const paused = await fetch(
            `${url}/api/v1/downloads/${job.id}/pause`,
            { method: 'POST' }
        )
        expect(await paused.json()).toMatchObject({ status: 'PAUSED' })
    })
})
