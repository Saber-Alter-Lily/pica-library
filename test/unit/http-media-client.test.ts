import axios, { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    HttpMediaClient,
    MEDIA_REQUEST_TIMEOUT_MS
} from '../../src/media/http-media-client'

function response(
    config: Parameters<AxiosAdapter>[0],
    data = Buffer.from('fixture'),
    headers: Record<string, string> = { 'content-type': 'image/jpeg' },
    status = 200
): AxiosResponse {
    return { config, data, headers, status, statusText: 'fixture' }
}
afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
})

describe('credential-free shared media transport', () => {
    it('does not inherit global API credentials or follow redirects automatically', async () => {
        const previous = axios.defaults.headers.common.Authorization
        axios.defaults.headers.common.Authorization = 'synthetic-api-token'
        try {
            const adapter: AxiosAdapter = async (config) => {
                expect(
                    JSON.stringify(config.headers).toLowerCase()
                ).not.toMatch(
                    /authorization|cookie|signature|api-key|nonce|synthetic-api-token/
                )
                expect(config.maxRedirects).toBe(0)
                expect(config.timeout).toBeGreaterThan(0)
                expect(config.timeout).toBeLessThanOrEqual(
                    MEDIA_REQUEST_TIMEOUT_MS
                )
                expect(config.maxContentLength).toBe(100)
                return response(config)
            }
            await expect(
                new HttpMediaClient({ adapter }).fetchImage(
                    'https://images.example.test/image.jpg',
                    100
                )
            ).resolves.toMatchObject({ contentType: 'image/jpeg' })
        } finally {
            if (previous === undefined)
                delete axios.defaults.headers.common.Authorization
            else axios.defaults.headers.common.Authorization = previous
        }
    })
    it('rejects unsafe initial targets before any request, regardless of legacy HTTP opt-in', async () => {
        vi.stubEnv('PICA_ALLOW_INSECURE_HTTP', 'true')
        const adapter = vi.fn(async (config) =>
            response(config)
        ) as unknown as AxiosAdapter
        const client = new HttpMediaClient({ adapter })
        for (const target of [
            'http://images.example.test/a.jpg',
            'file:///secret',
            'https://127.0.0.1/a.jpg',
            'https://localhost/a.jpg',
            'https://[::1]/a.jpg',
            'https://user:secret@images.example.test/a.jpg'
        ])
            await expect(client.fetchImage(target)).rejects.toThrow(
                /not trusted/
            )
        expect(adapter).not.toHaveBeenCalled()
    })
    it('revalidates relative and absolute redirect destinations on every hop', async () => {
        const urls: string[] = []
        const client = new HttpMediaClient({
            adapter: async (config) => {
                urls.push(String(config.url))
                return response(
                    config,
                    Buffer.alloc(0),
                    {
                        location:
                            urls.length === 1
                                ? '/next.jpg'
                                : 'https://10.0.0.1/private.jpg'
                    },
                    302
                )
            }
        })
        await expect(
            client.fetchImage('https://images.example.test/a.jpg')
        ).rejects.toThrow(/not trusted/)
        expect(urls).toEqual([
            'https://images.example.test/a.jpg',
            'https://images.example.test/next.jpg'
        ])
    })
    it('bounds redirects and rejects redirect responses without a location', async () => {
        let calls = 0
        const client = new HttpMediaClient({
            adapter: async (config) => {
                calls++
                return response(
                    config,
                    Buffer.alloc(0),
                    { location: '/loop.jpg' },
                    302
                )
            }
        })
        await expect(
            client.fetchImage('https://images.example.test/a.jpg')
        ).rejects.toThrow(/Too many/)
        expect(calls).toBe(6)
        await expect(
            new HttpMediaClient({
                adapter: async (config) =>
                    response(config, Buffer.alloc(0), {}, 302)
            }).fetchImage('https://images.example.test/a.jpg')
        ).rejects.toThrow(/no location/)
    })
    it('rejects empty, oversized, unsafe-MIME and invalid-limit images', async () => {
        for (const [data, type] of [
            [Buffer.alloc(0), 'image/jpeg'],
            [Buffer.alloc(4), 'image/jpeg'],
            [Buffer.from('x'), 'image/svg+xml'],
            [Buffer.from('x'), 'text/html']
        ] as const) {
            const client = new HttpMediaClient({
                adapter: async (config) =>
                    response(config, data, { 'content-type': type })
            })
            await expect(
                client.fetchImage('https://images.example.test/a.jpg', 2)
            ).rejects.toThrow(/empty|size limit|safe raster/)
        }
        const adapter = vi.fn()
        for (const limit of [0, -1, NaN, Infinity, 1.5])
            await expect(
                new HttpMediaClient({ adapter }).fetchImage(
                    'https://images.example.test/a.jpg',
                    limit
                )
            ).rejects.toThrow(/positive integer/)
        expect(adapter).not.toHaveBeenCalled()
    })
    it('uses only the explicit configured proxy and keeps proxy secrets out of errors', async () => {
        const client = new HttpMediaClient({
            proxyUrl: 'http://proxy-user:proxy-secret@127.0.0.1:7890',
            adapter: async (config) => {
                expect(config.proxy).toMatchObject({
                    host: '127.0.0.1',
                    port: 7890,
                    auth: { username: 'proxy-user', password: 'proxy-secret' }
                })
                throw new AxiosError(
                    'secret URL proxy-user:proxy-secret',
                    'ERR_BAD_RESPONSE',
                    config
                )
            }
        })
        await expect(
            client.fetchImage('https://images.example.test/a.jpg')
        ).rejects.toThrow('Provider media request failed')
        await expect(
            new HttpMediaClient({
                adapter: async (config) => {
                    expect(config.proxy).toBe(false)
                    return response(config)
                }
            }).fetchImage('https://images.example.test/a.jpg')
        ).resolves.toBeTruthy()
        expect(
            () => new HttpMediaClient({ proxyUrl: 'socks5://proxy.invalid' })
        ).toThrow(/HTTP or HTTPS/)
    })
    it('returns a bounded generic timeout instead of provider/credential configuration', async () => {
        const client = new HttpMediaClient({
            adapter: async (config) => {
                throw new AxiosError(
                    'synthetic secret timeout',
                    'ECONNABORTED',
                    config
                )
            }
        })
        await expect(
            client.fetchImage('https://images.example.test/a.jpg')
        ).rejects.toThrow('Provider media request timed out')
    })
})
