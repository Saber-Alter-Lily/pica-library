import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeRemoteStorageConfig } from '../../src/remote-storage/config'
import { WebDavStorageProvider } from '../../src/remote-storage/webdav'

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

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
        const fetcher = vi.fn(async () => new Response(null, { status: 207 }))
        vi.stubGlobal('fetch', fetcher)
        const provider = new WebDavStorageProvider({
            kind: 'webdav',
            baseUrl: 'https://webdav.123pan.cn',
            root: 'PicaLibrary'
        })

        await expect(provider.test()).resolves.toMatchObject({
            success: true,
            status: 207
        })
        expect(fetcher).toHaveBeenCalledTimes(1)
        expect(fetcher.mock.calls[0][0]).toBe(
            'https://webdav.123pan.cn/webdav'
        )
        expect(fetcher.mock.calls[0][1]?.method).toBe('PROPFIND')
    })

    it('accepts MKCOL 405 only after PROPFIND confirms the directory exists', async () => {
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
            baseUrl: 'https://webdav.123pan.cn',
            root: 'PicaLibrary'
        })

        await expect(provider.ensureDirectory('v1/control')).resolves.toBeUndefined()
        expect(calls).toEqual([
            {
                url: 'https://webdav.123pan.cn/webdav/PicaLibrary',
                method: 'MKCOL'
            },
            {
                url: 'https://webdav.123pan.cn/webdav/PicaLibrary',
                method: 'PROPFIND'
            },
            {
                url: 'https://webdav.123pan.cn/webdav/PicaLibrary/v1',
                method: 'MKCOL'
            },
            {
                url: 'https://webdav.123pan.cn/webdav/PicaLibrary/v1',
                method: 'PROPFIND'
            },
            {
                url: 'https://webdav.123pan.cn/webdav/PicaLibrary/v1/control',
                method: 'MKCOL'
            },
            {
                url: 'https://webdav.123pan.cn/webdav/PicaLibrary/v1/control',
                method: 'PROPFIND'
            }
        ])
    })

    it('does not mistake unsupported MKCOL for an existing directory', async () => {
        vi.stubGlobal('fetch', async (_url: string, init: RequestInit) =>
            new Response(null, {
                status: String(init.method) === 'MKCOL' ? 405 : 404
            })
        )
        const provider = new WebDavStorageProvider({
            kind: 'webdav',
            baseUrl: 'https://webdav.123pan.cn',
            root: 'PicaLibrary'
        })

        await expect(provider.ensureDirectory('v1')).rejects.toThrow(
            'MKCOL returned HTTP 405 and the directory does not exist'
        )
    })
})
