import { afterEach, describe, expect, it, vi } from 'vitest'
import { EhProvider } from '../../src/providers/eh-provider'
import { OnlineReaderService, type OnlineReaderState } from '../../src/services/online-reader-service'
import {
    EH_PUBLIC_WORKER_ID,
    fromEhPublicWorkerId,
    ownsLegacyEhId,
    toEhPublicWorkerId
} from '../../src/source-extensions/eh-public-identity'
import { ehPublicIdentityBridge } from '../../src/source-extensions/eh-public-bridge'
import { createEhPublicReaderTransport } from '../../src/source-extensions/eh-public-reader-transport'

const legacyId = 'eh:123:abcdef1234'
const album = toEhPublicWorkerId(legacyId)
const originalFetch = globalThis.fetch
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1])
const release = {
    apiVersion: 1 as const,
    id: EH_PUBLIC_WORKER_ID,
    capabilities: { chapters: true as const, pages: true as const, media: true as const }
}

afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
})

function fixtureFetch() {
    return vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
        const url = String(request)
        if (url === 'https://api.e-hentai.org/api.php') {
            expect(init?.method).toBe('POST')
            expect(new Headers(init?.headers).has('cookie')).toBe(false)
            return new Response(JSON.stringify({
                gmetadata: [{
                    gid: 123, token: 'abcdef1234', title: 'Anonymous test gallery',
                    filecount: '1', category: 'Doujinshi', tags: []
                }]
            }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        if (url.startsWith('https://e-hentai.org/g/123/abcdef1234/'))
            return new Response('<a href="/s/abcdef/123-1">Page</a>', { status: 200 })
        if (url === 'https://e-hentai.org/s/abcdef/123-1')
            return new Response('<img id="img" src="https://images.example.org/fixture.jpg">', { status: 200 })
        if (url === 'https://images.example.org/fixture.jpg')
            return new Response(jpeg, {
                status: 200, headers: { 'content-type': 'image/jpeg' }
            })
        throw new Error('Test fixture denies unexpected external URL: ' + url)
    })
}

describe('S3 first real existing-Provider extraction (no account)', () => {
    it('retains old E-H identity without exposing an incompatible ID in the Reader', () => {
        expect(album).toBe('eh-public-reader:123_abcdef1234')
        expect(fromEhPublicWorkerId(album)).toBe(legacyId)
        expect(ownsLegacyEhId(legacyId)).toBe(true)
        for (const bad of [
            'eh:0:abcdef1234', 'eh:123:xyz', 'pica:123:abcdef1234',
            'eh:900719925474099:abcdef1234', 'eh:-1:abcdef1234'
        ]) {
            expect(ownsLegacyEhId(bad)).toBe(false)
            expect(() => toEhPublicWorkerId(bad)).toThrow()
        }
        expect(() => fromEhPublicWorkerId('another:123_abcdef1234')).toThrow()
        expect(() => fromEhPublicWorkerId('eh-public-reader:123_fake')).toThrow()
    })

    it('uses real E-H provider gallery/page parser but never passes a locator over IPC', async () => {
        const fakeFetch = fixtureFetch()
        const provider = new EhProvider(undefined, fakeFetch as typeof fetch)
        const transport = createEhPublicReaderTransport(provider)
        const chapters = await transport.episodes(album)
        expect(chapters).toEqual([{ id: 'eh-123', title: 'Anonymous test gallery', order: 1 }])
        const pages = await transport.pages(album, chapters[0].id)
        expect(pages).toHaveLength(1)
        expect(pages[0].key).toMatch(/^[A-Za-z0-9_-]{32}$/)
        expect(JSON.stringify(pages)).not.toContain('eh-page:')
        expect(JSON.stringify(pages)).not.toContain('images.example.org')
        expect(await transport.pages(album, chapters[0].id)).toEqual(pages)
        const image = await transport.media(album, pages[0].key)
        expect(image.contentType).toBe('image/jpeg')
        expect([...image.bytes]).toEqual([...jpeg])
        await expect(transport.media(
            toEhPublicWorkerId('eh:124:abcdef1234'), pages[0].key
        )).rejects.toThrow(/not belong/)
        await expect(transport.media(album, 'unknown')).rejects.toThrow()
        await expect(transport.pages(album, 'eh-999')).rejects.toThrow()
        expect(fakeFetch.mock.calls.length).toBeGreaterThanOrEqual(5)
    })

    it('runs the existing Reader with legacy IDs, independent signed progress and fail-closed revocation', async () => {
        const fakeFetch = fixtureFetch()
        const transport = createEhPublicReaderTransport(
            new EhProvider(undefined, fakeFetch as typeof fetch)
        )
        let enabled = true
        const bound = ehPublicIdentityBridge.bind(release, transport, {
            assertEnabled() { if (!enabled) throw new Error('Disabled source') },
            revision: () => 'ephemeral-1'
        })
        const values = new Map<string, unknown>()
        const state: OnlineReaderState = {
            getAppState<T>(key: string) { return values.get(key) as T | undefined },
            setAppState(key: string, value: unknown) { values.set(key, value) }
        }
        const cached = new Map<string, { data: Buffer; contentType: string }>()
        const reader = new OnlineReaderService(state, bound.source, {
            get(key, fingerprint) {
                return cached.get(key + ':' + fingerprint) ?? null
            },
            put(key, data, contentType, fingerprint) {
                cached.set(key + ':' + fingerprint, { data, contentType })
            }
        }, {
            ...bound.contract,
            pageUrl(comicId, episodeId, index) {
                return '/app/signed-reader/' + encodeURIComponent(comicId) +
                    '/' + episodeId + '/' + index
            }
        })
        expect(await reader.chapters(legacyId)).toEqual([{
            id: 'eh-123', title: 'Anonymous test gallery', order: 1,
            source: 'provider'
        }])
        const chapter = await reader.chapter(legacyId, 'eh-123')
        expect(chapter.pages[0].url).toContain('eh%3A123%3Aabcdef1234')
        expect(JSON.stringify(chapter)).not.toContain('eh-page:')
        expect((await reader.picture(legacyId, 'eh-123', 0)).contentType).toBe('image/jpeg')
        await expect(reader.picture(
            'eh:124:abcdef1234', 'eh-123', 0
        )).rejects.toThrow()
        const progress = await reader.saveProgress(legacyId, 'eh-123', 0)
        expect(progress.comicId).toBe(legacyId)
        expect(reader.recentProgress()[0].comicId).toBe(legacyId)
        expect(values.has('online-reader-progress-v1')).toBe(false)
        expect(values.has('signed-source-progress-v1:' + EH_PUBLIC_WORKER_ID)).toBe(true)
        enabled = false
        await expect(reader.picture(legacyId, 'eh-123', 0)).rejects.toThrow('Disabled source')
        await expect(reader.chapters(legacyId)).rejects.toThrow('Disabled source')
        // Revocation never wipes the separate saved history.
        expect(values.has('signed-source-progress-v1:' + EH_PUBLIC_WORKER_ID)).toBe(true)
    })
})
