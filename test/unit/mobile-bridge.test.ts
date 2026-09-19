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
            stateFile: path.join(root, 'mobile-state.json'),
            accountStatus: () => ({
                pica: { configured: true },
                eh: { configured: true }
            })
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
        const accountStatus = await fetch(
            `${host}/mobile/v1/accounts/status`,
            { headers }
        )
        expect(accountStatus.status).toBe(200)
        const accountValue = await accountStatus.json()
        expect(accountValue).toMatchObject({
            authority: 'desktop',
            pica: { configured: true },
            eh: { configured: true }
        })
        expect(JSON.stringify(accountValue)).not.toMatch(
            /password|passHash|cookie|token/i
        )

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

    it('collapses repeated pairing for the same stable Android device and revokes the old token', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-mobile-device-'))
        roots.push(root)
        const database = new LibraryDatabase(path.join(root, 'library.db'))
        const service = new LibraryService(database, root)
        const bridge = await startMobileBridge({
            database,
            service,
            host: '127.0.0.1',
            port: 0,
            stateFile: path.join(root, 'mobile-state.json')
        })
        bridges.push(bridge)
        const host = bridge.status().addresses[0]

        const pair = async (code: string) => {
            const response = await fetch(`${host}/mobile/v1/pair`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    code,
                    deviceId: 'android-stable-test-device',
                    deviceName: 'HONOR PTP-AN10'
                })
            })
            expect(response.status).toBe(200)
            return String(((await response.json()) as { token: string }).token)
        }

        const firstToken = await pair(bridge.status().pairingCode)
        expect(bridge.status().pairedDevices).toHaveLength(1)

        const secondToken = await pair(bridge.status().pairingCode)
        expect(secondToken).not.toBe(firstToken)
        expect(bridge.status().pairedDevices).toHaveLength(1)
        expect(bridge.status().pairedDevices[0].deviceName).toBe(
            'HONOR PTP-AN10'
        )

        const stale = await fetch(`${host}/mobile/v1/device`, {
            headers: { authorization: `Bearer ${firstToken}` }
        })
        expect(stale.status).toBe(401)

        const current = await fetch(`${host}/mobile/v1/device`, {
            headers: { authorization: `Bearer ${secondToken}` }
        })
        expect(current.status).toBe(200)

        database.close()
    })


    it('relays Pica through Desktop without exposing provider credentials', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-mobile-relay-'))
        roots.push(root)
        const database = new LibraryDatabase(path.join(root, 'library.db'))
        let favorite = false
        const fakePica = {
            Order: {
                default: 'ua',
                latest: 'dd',
                oldest: 'da',
                loved: 'ld',
                point: 'vd'
            },
            async search(keyword: string, page: number) {
                return {
                    page,
                    pages: 1,
                    total: 1,
                    docs: [
                        {
                            _id: 'relay-comic',
                            title: `Relay ${keyword}`,
                            author: 'Desktop Author',
                            description: '',
                            chineseTeam: '',
                            created_at: '',
                            updated_at: '',
                            finished: true,
                            totalViews: 5,
                            categories: ['短篇'],
                            totalLikes: 9,
                            tags: ['relay-tag'],
                            isFavourite: favorite
                        }
                    ]
                }
            },
            async comicInfo() {
                return {
                    _id: 'relay-comic',
                    title: 'Relay Comic',
                    author: 'Desktop Author',
                    description: '',
                    chineseTeam: '',
                    created_at: '',
                    updated_at: '',
                    finished: true,
                    totalViews: 5,
                    categories: ['短篇'],
                    totalLikes: 9,
                    tags: ['relay-tag'],
                    isFavourite: favorite
                }
            },
            async fav() {
                favorite = !favorite
                return {}
            }
        }
        const service = new LibraryService(
            database,
            root,
            fakePica as never
        )
        const bridge = await startMobileBridge({
            database,
            service,
            host: '127.0.0.1',
            port: 0,
            stateFile: path.join(root, 'mobile-state.json'),
            accountStatus: () => ({
                pica: { configured: true },
                eh: { configured: false }
            })
        })
        bridges.push(bridge)
        const host = bridge.status().addresses[0]

        const denied = await fetch(
            `${host}/mobile/v1/provider/pica/search`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ keyword: 'test', page: 1 })
            }
        )
        expect(denied.status).toBe(401)

        const paired = await fetch(`${host}/mobile/v1/pair`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: bridge.status().pairingCode,
                deviceId: 'relay-device',
                deviceName: 'Relay Android'
            })
        })
        const token = String(
            ((await paired.json()) as { token: string }).token
        )
        const headers = {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json'
        }

        const search = await fetch(
            `${host}/mobile/v1/provider/pica/search`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    keyword: 'test',
                    page: 1,
                    sort: 'ld',
                    categories: []
                })
            }
        )
        expect(search.status).toBe(200)
        const searchValue = await search.json()
        expect(searchValue).toMatchObject({
            authority: 'desktop',
            relay: true,
            comics: {
                page: 1,
                total: 1,
                docs: [
                    {
                        _id: 'relay-comic',
                        title: 'Relay test'
                    }
                ]
            }
        })
        expect(JSON.stringify(searchValue)).not.toMatch(
            /password|authorization|providerToken|cookie/i
        )

        const mutate = await fetch(
            `${host}/mobile/v1/provider/pica/favorite`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    comicId: 'relay-comic',
                    desired: true
                })
            }
        )
        expect(mutate.status).toBe(200)
        expect(await mutate.json()).toMatchObject({
            authority: 'desktop',
            relay: true,
            changed: true,
            isFavorite: true
        })
        expect(favorite).toBe(true)

        database.close()
    })

})
