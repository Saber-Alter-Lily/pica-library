import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import {
    startMobileBridge,
    type MobileBridgeController
} from '../../src/mobile/bridge-server'

const roots: string[] = []
const bridges: MobileBridgeController[] = []

afterEach(async () => {
    while (bridges.length) await bridges.pop()?.close()
    while (roots.length)
        fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('Mobile Bridge', () => {
    it('pairs a device and returns favorite library and shelf data', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-mobile-'))
        roots.push(root)
        const database = new LibraryDatabase(path.join(root, 'library.db'))
        database.importFavorites(
            [
                {
                    comicId: 'comic-1',
                    title: 'Mobile Bridge Test',
                    author: 'Tester',
                    categories: ['短篇'],
                    tags: ['test-tag'],
                    finished: false
                }
            ],
            'test',
            true
        )
        const shelf = database.createShelf('Phone Shelf')
        database.addShelfItems(shelf.id, ['comic-1'])
        const service = new LibraryService(database, root)
        const bridge = await startMobileBridge({
            database,
            service,
            host: '127.0.0.1',
            port: 0,
            stateFile: path.join(root, 'mobile-state.json')
        })
        bridges.push(bridge)
        const status = bridge.status()
        const host = status.addresses[0]
        const paired = await fetch(`${host}/mobile/v1/pair`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: status.pairingCode,
                deviceName: 'test'
            })
        })
        expect(paired.status).toBe(200)
        const token = String(
            ((await paired.json()) as { token: string }).token
        )
        expect(token.length).toBeGreaterThan(20)
        const headers = { authorization: `Bearer ${token}` }
        const library = await fetch(
            `${host}/mobile/v1/library?scope=favorites&limit=20`,
            { headers }
        )
        expect(library.status).toBe(200)
        const value = (await library.json()) as {
            items: Array<{ comicId: string }>
        }
        expect(value.items.map((item) => item.comicId)).toContain('comic-1')

        const shelves = await fetch(`${host}/mobile/v1/shelves`, { headers })
        expect(shelves.status).toBe(200)
        const shelfValue = (await shelves.json()) as {
            shelves: Array<{
                id: string
                name: string
                items: Array<{
                    comicId: string
                    tags: string[]
                    categories: string[]
                }>
            }>
        }
        expect(shelfValue.shelves).toHaveLength(1)
        expect(shelfValue.shelves[0].name).toBe('Phone Shelf')
        expect(shelfValue.shelves[0].items[0]).toMatchObject({
            comicId: 'comic-1',
            tags: ['test-tag'],
            categories: ['短篇']
        })
        database.close()
    })
})
