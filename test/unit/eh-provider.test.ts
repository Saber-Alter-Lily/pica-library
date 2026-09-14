import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    EhProvider,
    ehMetadataToComic,
    parseEhComicId,
    parseEhTag
} from '../../src/providers/eh-provider'

const originalFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
})

function metadata(overrides: Record<string, unknown> = {}) {
    return {
        gid: 123,
        token: 'abcdef1234',
        title: '[Circle] Example',
        title_jpn: '例',
        category: 'Doujinshi',
        thumb: 'https://ehgt.org/a/b.jpg',
        uploader: 'tester',
        posted: '1700000000',
        filecount: '2',
        filesize: 12345,
        expunged: false,
        rating: '4.75',
        torrentcount: '1',
        torrents: [],
        tags: [
            'artist:alice',
            'group:wonder circle',
            'parody:original',
            'language:english',
            'female:glasses'
        ],
        ...overrides
    }
}

describe('E-H provider mapping', () => {
    it('keeps provider identity, namespaced tags and unknown completion distinct from Pica fields', () => {
        const comic = ehMetadataToComic(metadata() as never)
        expect(comic.comicId).toBe('eh:123:abcdef1234')
        expect(comic.providerId).toBe('eh')
        expect(comic.author).toBe('alice')
        expect(comic.circle).toBe('wonder circle')
        expect(comic.completionStatus).toBe('UNKNOWN')
        expect(comic.rating).toBe(4.75)
        expect(comic.totalLikes).toBeUndefined()
        expect(comic.tags).toContain('original')
        expect(comic.canonicalTags).toContainEqual(
            expect.objectContaining({
                raw: 'parody:original',
                namespace: 'parody',
                facet: 'FANDOM_IP'
            })
        )
        expect(parseEhTag('character:foo')).toMatchObject({
            namespace: 'character',
            value: 'foo',
            facet: 'CHARACTER'
        })
        expect(parseEhComicId(comic.comicId)).toEqual({
            gid: 123,
            token: 'abcdef1234'
        })
    })

    it('discovers gallery identities from public search then hydrates with gdata', async () => {
        const mock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    '<a href="/g/123/abcdef1234/">one</a><a href="https://e-hentai.org/g/123/abcdef1234/">dup</a>',
                    { status: 200, headers: { 'content-type': 'text/html' } }
                )
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ gmetadata: [metadata()] }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                })
            )
        globalThis.fetch = mock as typeof fetch
        const result = await new EhProvider().search({ keyword: 'example' })
        expect(result).toHaveLength(1)
        expect(result[0].comicId).toBe('eh:123:abcdef1234')
        expect(mock).toHaveBeenCalledTimes(2)
        expect(String(mock.mock.calls[0][0])).toContain('f_search=example')
        const request = JSON.parse(String(mock.mock.calls[1][1]?.body))
        expect(request).toMatchObject({ method: 'gdata', namespace: 1 })
        expect(request.gidlist).toEqual([[123, 'abcdef1234']])
    })

    it('stores stable image-page locators and resolves temporary image URLs only at fetch time', async () => {
        const imageBytes = new Uint8Array([1, 2, 3, 4])
        const mock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ gmetadata: [metadata()] }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                })
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ gmetadata: [metadata()] }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                })
            )
            .mockResolvedValueOnce(
                new Response(
                    '<a href="/s/aaa111/123-1">p1</a><a href="https://e-hentai.org/s/bbb222/123-2">p2</a>',
                    { status: 200, headers: { 'content-type': 'text/html' } }
                )
            )
            .mockResolvedValueOnce(
                new Response('<img id="img" src="https://images.example.org/tmp.jpg">', {
                    status: 200,
                    headers: { 'content-type': 'text/html' }
                })
            )
            .mockResolvedValueOnce(
                new Response(imageBytes, {
                    status: 200,
                    headers: { 'content-type': 'image/jpeg' }
                })
            )
        globalThis.fetch = mock as typeof fetch
        const provider = new EhProvider()
        const [episode] = await provider.episodes('eh:123:abcdef1234')
        const pages = await provider.pages('eh:123:abcdef1234', episode)
        expect(pages).toHaveLength(2)
        expect(pages[0].url).toMatch(/^eh-page:/)
        expect(pages[0].url).not.toContain('images.example.org')
        const image = await provider.fetchPage(pages[0].url)
        expect(image.contentType).toBe('image/jpeg')
        expect([...image.data]).toEqual([1, 2, 3, 4])
        expect(String(mock.mock.calls[4][0])).toBe('https://images.example.org/tmp.jpg')
    })
})
