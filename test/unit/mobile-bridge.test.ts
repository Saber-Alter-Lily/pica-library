import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { EhProvider } from '../../src/providers/eh-provider'
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


    it('relays E-H favorite organization without returning account cookies', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-mobile-eh-relay-'))
        roots.push(root)
        const database = new LibraryDatabase(path.join(root, 'library.db'))
        let call = 0
        const ehFetch = async () => {
            call += 1
            if (call === 1)
                return new Response(
                    '<input type="text" name="favorite_0" value="最喜欢"><input type="text" name="favorite_1" value="待看">',
                    { status: 200 }
                )
            if (call === 2)
                return new Response(
                    '<div id="posted_123" title="待看"></div><div id="favnote_123">稍后阅读</div><a href="/g/123/abcdef1234/">favorite</a>',
                    { status: 200 }
                )
            return new Response(
                JSON.stringify({
                    gmetadata: [
                        {
                            gid: 123,
                            token: 'abcdef1234',
                            title: 'Relay E-H',
                            category: 'Doujinshi',
                            uploader: 'tester',
                            posted: '1700000000',
                            filecount: '2',
                            rating: '4.5',
                            tags: ['artist:alice']
                        }
                    ]
                }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                }
            )
        }
        const ehProvider = new EhProvider(
            {
                memberId: '1',
                passHash: 'secret-hash'
            },
            ehFetch as typeof fetch
        )
        const service = new LibraryService(
            database,
            root,
            undefined,
            ehProvider
        )
        const bridge = await startMobileBridge({
            database,
            service,
            host: '127.0.0.1',
            port: 0,
            stateFile: path.join(root, 'mobile-state.json'),
            accountStatus: () => ({
                pica: { configured: false },
                eh: { configured: true }
            })
        })
        bridges.push(bridge)
        const host = bridge.status().addresses[0]
        const paired = await fetch(`${host}/mobile/v1/pair`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: bridge.status().pairingCode,
                deviceId: 'eh-relay-device',
                deviceName: 'E-H Relay Android'
            })
        })
        const token = String(
            ((await paired.json()) as { token: string }).token
        )
        const response = await fetch(
            `${host}/mobile/v1/provider/eh/favorites-snapshot`,
            {
                headers: {
                    authorization: `Bearer ${token}`
                }
            }
        )
        expect(response.status).toBe(200)
        const value = await response.json()
        expect(value).toMatchObject({
            authority: 'desktop',
            relay: true,
            items: [
                {
                    comicId: 'eh:123:abcdef1234',
                    slot: 1,
                    note: '稍后阅读'
                }
            ]
        })
        expect(value.categoryNames.slice(0, 2)).toEqual([
            '最喜欢',
            '待看'
        ])
        expect(value.categoryCounts[1]).toBe(1)
        const serialized = JSON.stringify(value)
        expect(serialized).not.toContain('secret-hash')
        expect(serialized).not.toMatch(
            /ipb_member_id|ipb_pass_hash|igneous|cf_clearance/i
        )
        expect(database.hasFavoriteMembership(
            'eh:123:abcdef1234',
            'eh-favorite'
        )).toBe(true)
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


    it('relays account-required E-H and ExH operations without copying cookies', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-mobile-eh-relay-'))
        roots.push(root)
        const database = new LibraryDatabase(path.join(root, 'library.db'))
        let favorite = false
        const comic = {
            providerId: 'eh',
            providerRemoteId: '123:aaaaaaaaaa',
            comicId: 'eh:123:aaaaaaaaaa',
            title: 'Desktop ExH Relay',
            alternateTitles: [],
            author: 'Relay Artist',
            authors: ['Relay Artist'],
            circle: null,
            description: '',
            chineseTeam: '',
            categories: ['Manga'],
            tags: ['relay'],
            canonicalTags: [
                {
                    raw: 'artist:relay artist',
                    namespace: 'artist',
                    value: 'relay artist',
                    facet: 'CREATOR'
                }
            ],
            completionStatus: 'UNKNOWN',
            pagesCount: 1,
            coverUrl: 'https://ehgt.org/example.jpg',
            rating: 4.5,
            uploader: 'tester',
            providerMetadata: {
                preferredSurface: 'exh',
                knownSurfaces: ['exh']
            }
        }
        const fakeEh = {
            hasSession: () => true,
            async search() {
                return [comic]
            },
            async probeExHentai() {
                return 'AVAILABLE'
            },
            async detailsOnSurface() {
                return comic
            },
            async episodesOnSurface() {
                return [
                    {
                        id: 'eh-123',
                        title: 'Desktop ExH Relay',
                        order: 1,
                        updated_at: ''
                    }
                ]
            },
            async pagesOnSurface() {
                return [
                    {
                        id: 'eh-123-1',
                        name: '0001.jpg',
                        path: 'https://exhentai.org/s/hash/123-1',
                        fileServer: 'https://exhentai.org',
                        url: 'eh-page:test-locator',
                        epTitle: 'Desktop ExH Relay',
                        media: {
                            originalName: '0001.jpg',
                            path: 'https://exhentai.org/s/hash/123-1',
                            fileServer: 'https://exhentai.org'
                        }
                    }
                ]
            },
            async fetchPage(locator: string) {
                expect(locator).toBe('eh-page:test-locator')
                return {
                    data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
                    contentType: 'image/jpeg'
                }
            },
            async setRemoteFavorite(
                _comicId: string,
                desired: boolean
            ) {
                favorite = desired
                return {
                    changed: true,
                    isFavorite: desired,
                    category: 0,
                    note: ''
                }
            }
        }
        const service = new LibraryService(
            database,
            root,
            undefined,
            fakeEh as never
        )
        const bridge = await startMobileBridge({
            database,
            service,
            host: '127.0.0.1',
            port: 0,
            stateFile: path.join(root, 'mobile-state.json'),
            accountStatus: () => ({
                pica: { configured: false },
                eh: { configured: true }
            })
        })
        bridges.push(bridge)
        const host = bridge.status().addresses[0]
        const paired = await fetch(`${host}/mobile/v1/pair`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: bridge.status().pairingCode,
                deviceId: 'eh-relay-device',
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
            `${host}/mobile/v1/provider/eh/search`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    surface: 'exh',
                    ehMode: 'watched',
                    keyword: '',
                    tags: [],
                    categories: [],
                    limit: 20
                })
            }
        )
        expect(search.status).toBe(200)
        const searchValue = await search.json()
        expect(searchValue).toMatchObject({
            authority: 'desktop',
            relay: true,
            surface: 'exh',
            comics: [
                {
                    comicId: 'eh:123:aaaaaaaaaa',
                    title: 'Desktop ExH Relay'
                }
            ]
        })
        expect(JSON.stringify(searchValue)).not.toMatch(
            /ipb_pass_hash|ipb_member_id|igneous|cf_clearance|cookie/i
        )

        const capability = await fetch(
            `${host}/mobile/v1/provider/eh/exh-capability`,
            { headers }
        )
        expect(await capability.json()).toMatchObject({
            authority: 'desktop',
            relay: true,
            capability: 'AVAILABLE'
        })

        const pages = await fetch(
            `${host}/mobile/v1/provider/eh/pages/${encodeURIComponent(
                'eh:123:aaaaaaaaaa'
            )}?surface=exh`,
            { headers }
        )
        expect(await pages.json()).toMatchObject({
            pages: [
                {
                    id: 'eh-123-1',
                    locator: 'eh-page:test-locator',
                    position: 0
                }
            ]
        })

        const image = await fetch(
            `${host}/mobile/v1/provider/eh/page-image?locator=${encodeURIComponent(
                'eh-page:test-locator'
            )}`,
            { headers: { authorization: `Bearer ${token}` } }
        )
        expect(image.status).toBe(200)
        expect(image.headers.get('content-type')).toBe('image/jpeg')
        expect(new Uint8Array(await image.arrayBuffer())).toEqual(
            new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
        )

        const mutate = await fetch(
            `${host}/mobile/v1/provider/eh/favorite`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    comicId: 'eh:123:aaaaaaaaaa',
                    desired: true,
                    category: 0,
                    note: ''
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
