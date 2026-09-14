import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeRemoteStorageConfig } from '../../src/remote-storage/config'
import { WebDavStorageProvider } from '../../src/remote-storage/webdav'

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

function flatName(logicalPath: string) {
    return `pica-library-${createHash('sha256').update(logicalPath, 'utf8').digest('hex')}.bin`
}

describe('123Pan WebDAV compatibility', () => {
    it('normalizes the 123Pan host root to the official /webdav endpoint', () => {
        expect(
            normalizeRemoteStorageConfig({
                kind: 'webdav',
                baseUrl: 'https://webdav.123pan.cn',
                root: 'PicaLibrary'
            })
        ).toMatchObject({
            baseUrl: 'https://webdav.123pan.cn/webdav',
            root: 'PicaLibrary'
        })

        expect(
            normalizeRemoteStorageConfig({
                kind: 'webdav',
                baseUrl: 'https://webdav.123pan.cn/webdav/',
                root: 'PicaLibrary'
            }).baseUrl
        ).toBe('https://webdav.123pan.cn/webdav')
    })

    it('tests the normalized 123Pan endpoint rather than the host root', async () => {
        const calls: Array<{ url: string; method: string }> = []
        vi.stubGlobal(
            'fetch',
            async (url: string | URL | Request, init?: RequestInit) => {
                calls.push({
                    url: String(url),
                    method: String(init?.method ?? 'GET')
                })
                return new Response(null, { status: 207 })
            }
        )
        const provider = new WebDavStorageProvider({
            kind: 'webdav',
            baseUrl: 'https://webdav.123pan.cn',
            root: 'PicaLibrary'
        })

        await expect(provider.test()).resolves.toMatchObject({
            success: true,
            status: 207
        })
        expect(calls).toEqual([
            {
                url: 'https://webdav.123pan.cn/webdav',
                method: 'PROPFIND'
            }
        ])
    })

    it('stores 123Pan objects flat and never calls MKCOL', async () => {
        const calls: Array<{ url: string; method: string }> = []
        vi.stubGlobal(
            'fetch',
            async (url: string | URL | Request, init?: RequestInit) => {
                const method = String(init?.method ?? 'GET')
                calls.push({ url: String(url), method })
                return new Response(null, { status: method === 'PUT' ? 201 : 404 })
            }
        )
        const provider = new WebDavStorageProvider({
            kind: 'webdav',
            baseUrl: 'https://webdav.123pan.cn',
            root: 'PicaLibrary'
        })

        await provider.put(
            'v1/control/current.json',
            Buffer.from('{"schemaVersion":1}', 'utf8'),
            'application/json'
        )
        expect(calls).toEqual([
            {
                url: `https://webdav.123pan.cn/webdav/${flatName('PicaLibrary/v1/control/current.json')}`,
                method: 'PUT'
            }
        ])
    })

    it('uses the same deterministic flat key for 123Pan reads', async () => {
        const payload = Buffer.from('{"generation":"g1"}', 'utf8')
        const calls: string[] = []
        vi.stubGlobal('fetch', async (url: string | URL | Request) => {
            calls.push(String(url))
            return new Response(payload, {
                status: 200,
                headers: { 'content-type': 'application/json' }
            })
        })
        const provider = new WebDavStorageProvider({
            kind: 'webdav',
            baseUrl: 'https://webdav.123pan.cn/webdav',
            root: 'PicaLibrary'
        })

        await expect(
            provider.getJson<{ generation: string }>('v1/control/current.json')
        ).resolves.toEqual({ generation: 'g1' })
        expect(calls).toEqual([
            `https://webdav.123pan.cn/webdav/${flatName('PicaLibrary/v1/control/current.json')}`
        ])
    })

    it('keeps hierarchical MKCOL behavior for ordinary WebDAV servers', async () => {
        const calls: Array<{ url: string; method: string }> = []
        vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
            const method = String(init.method)
            calls.push({ url, method })
            return new Response(null, {
                status: method === 'MKCOL' ? 201 : 200
            })
        })
        const provider = new WebDavStorageProvider({
            kind: 'webdav',
            baseUrl: 'https://dav.example',
            root: 'PicaLibrary'
        })

        await provider.ensureDirectory('v1/control')
        expect(calls).toEqual([
            { url: 'https://dav.example/PicaLibrary', method: 'MKCOL' },
            { url: 'https://dav.example/PicaLibrary/v1', method: 'MKCOL' },
            {
                url: 'https://dav.example/PicaLibrary/v1/control',
                method: 'MKCOL'
            }
        ])
    })

    it('accepts generic MKCOL 405 only after PROPFIND confirms the directory exists', async () => {
        const calls: Array<{ url: string; method: string }> = []
        vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
            const method = String(init.method)
            calls.push({ url, method })
            return new Response(null, {
                status: method === 'MKCOL' ? 405 : 207
            })
        })
        const provider = new WebDavStorageProvider({
            kind: 'webdav',
            baseUrl: 'https://dav.example',
            root: 'PicaLibrary'
        })

        await expect(provider.ensureDirectory('v1')).resolves.toBeUndefined()
        expect(calls).toEqual([
            { url: 'https://dav.example/PicaLibrary', method: 'MKCOL' },
            { url: 'https://dav.example/PicaLibrary', method: 'PROPFIND' },
            { url: 'https://dav.example/PicaLibrary/v1', method: 'MKCOL' },
            { url: 'https://dav.example/PicaLibrary/v1', method: 'PROPFIND' }
        ])
    })

    it('fails closed for remote deletion in 123Pan flat mode', async () => {
        const provider = new WebDavStorageProvider({
            kind: 'webdav',
            baseUrl: 'https://webdav.123pan.cn',
            root: 'PicaLibrary'
        })
        await expect(
            provider.withExclusiveLibraryWrite(async () => {})
        ).rejects.toThrow('暂不支持安全的远程单本删除')
    })
})
