import { describe, expect, it, vi } from 'vitest'
import { sourceHostHttp } from '../../src/source-hosts/http-transport'
import { sourceHostRequest, SOURCE_HOST_RESPONSE_BYTES } from '../../src/source-hosts/contract'

const connection = (auth?: unknown) => sourceHostRequest({ kind: 'suwayomi', endpoint: 'http://127.0.0.1:4567/prefix/', consent: true, auth }).connection
const signal = () => new AbortController().signal
const payload = { data: { aboutServer: { name: 'Suwayomi-Server', version: '2.4.2366' } } }
const response = (data: unknown = payload, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', ...headers } })

describe('source-host bounded HTTP adapter — injected fetch, never a socket', () => {
    it('posts only fixed query operations to the exact user-selected base path', async () => {
        const requests: RequestInit[] = [], urls: string[] = []
        const fake = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => { urls.push(String(url)); requests.push(init!); return response() })
        const client = sourceHostHttp(connection(), fake)
        expect(fake).not.toHaveBeenCalled()
        await expect(client.read('info', {}, signal())).resolves.toEqual(payload)
        expect(urls).toEqual(['http://127.0.0.1:4567/prefix/api/graphql'])
        expect(requests[0]).toMatchObject({ method: 'POST', redirect: 'manual', credentials: 'omit', cache: 'no-store' })
        expect(JSON.parse(String(requests[0].body))).toEqual({ operationName: 'PicaSourceHostInfo', query: 'query PicaSourceHostInfo { aboutServer { name version } }', variables: {} })
        expect(Object.keys(requests[0].headers!)).toEqual(['content-type', 'accept'])
    })
    it('scopes explicit Basic auth to this one host and never accepts response cookies as a session', async () => {
        const headers: unknown[] = [], fake = vi.fn(async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => { headers.push(init?.headers); return response(payload, { 'set-cookie': 'ambient-secret=synthetic' }) })
        const client = sourceHostHttp(connection({ mode: 'basic', username: 'synthetic-name', password: 'synthetic-password' }), fake)
        await client.read('info', {}, signal()); await client.read('sources', { first: 25, offset: 0 }, signal())
        expect(headers).toEqual(Array(2).fill({ 'content-type': 'application/json', accept: 'application/json, application/graphql-response+json', authorization: 'Basic ' + Buffer.from('synthetic-name:synthetic-password').toString('base64') }))
    })
    it('validates the finite operation/variable grammar before making any request', async () => {
        const fake = vi.fn(), client = sourceHostHttp(connection(), fake)
        await expect(client.read('toString' as never, {}, signal())).rejects.toMatchObject({ code: 'INVALID_SOURCE_HOST' })
        await expect(client.read('info', { mutation: 1 }, signal())).rejects.toMatchObject({ code: 'INVALID_SOURCE_HOST' })
        const invalid: Record<string, number>[] = [{ first: 26, offset: 0 }, { first: 25, offset: 1 }, { first: 25, offset: -25 }, { first: 25, offset: 5025 }, { first: 25, offset: 0, extra: 1 }]
        for (const variables of invalid) await expect(client.read('sources', variables, signal())).rejects.toMatchObject({ code: 'INVALID_SOURCE_HOST' })
        expect(fake).not.toHaveBeenCalled()
    })
    it.each([301, 302, 303, 307, 308])('refuses HTTP %i instead of forwarding credentials to a redirect', async status => {
        const fake = vi.fn(async () => new Response(null, { status, headers: { location: 'https://other.invalid/secret' } })), client = sourceHostHttp(connection({ mode: 'basic', username: 'a', password: 'b' }), fake)
        await expect(client.read('info', {}, signal())).rejects.toMatchObject({ code: 'SOURCE_HOST_REDIRECT', message: 'SOURCE_HOST_REDIRECT' }); expect(fake).toHaveBeenCalledTimes(1)
    })
    it.each([401, 403])('classifies HTTP %i without reading or returning the login error body', async status => {
        const fake = vi.fn(async () => new Response('secret remote error', { status }))
        await expect(sourceHostHttp(connection(), fake).read('info', {}, signal())).rejects.toMatchObject({ code: 'SOURCE_HOST_AUTH_REQUIRED', message: 'SOURCE_HOST_AUTH_REQUIRED' })
    })
    it.each(['text/html', 'text/plain', 'application/jsonp'])('refuses non-JSON response %s', async contentType => {
        const fake = vi.fn(async () => response(payload, { 'content-type': contentType }))
        await expect(sourceHostHttp(connection(), fake).read('info', {}, signal())).rejects.toMatchObject({ code: 'SOURCE_HOST_PROTOCOL' })
    })
    it('accepts the GraphQL JSON media type and valid UTF8 content', async () => {
        const value = { data: { label: '本地の synthetic' } }, fake = vi.fn(async () => response(value, { 'content-type': 'application/graphql-response+json; charset=utf-8' }))
        await expect(sourceHostHttp(connection(), fake).read('info', {}, signal())).resolves.toEqual(value)
    })
    it('rejects advertised size overflow before reading and actual overflow without a length header', async () => {
        const advertised = vi.fn(async () => response(payload, { 'content-length': String(SOURCE_HOST_RESPONSE_BYTES + 1) }))
        await expect(sourceHostHttp(connection(), advertised).read('info', {}, signal())).rejects.toMatchObject({ code: 'SOURCE_HOST_TOO_LARGE' })
        const cancel = vi.fn(), actual = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(SOURCE_HOST_RESPONSE_BYTES)); controller.enqueue(new Uint8Array(1)) }, cancel }), { headers: { 'content-type': 'application/json' } }))
        await expect(sourceHostHttp(connection(), actual).read('info', {}, signal())).rejects.toMatchObject({ code: 'SOURCE_HOST_TOO_LARGE' }); expect(cancel).toHaveBeenCalled()
    })
    it('rejects malformed JSON and invalid UTF8 without exposing body fragments', async () => {
        for (const bytes of ['{ "password": "remote-secret", not-json', new Uint8Array([0xff, 0xfe])]) {
            const fake = vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'application/json' } }))
            await expect(sourceHostHttp(connection(), fake).read('info', {}, signal())).rejects.toMatchObject({ code: 'SOURCE_HOST_PROTOCOL', message: 'SOURCE_HOST_PROTOCOL' })
        }
    })
    it('cancels an actually pending body read and releases the reader', async () => {
        const controller = new AbortController(), cancel = vi.fn()
        let reached!: () => void
        const pulled = new Promise<void>(resolve => { reached = resolve })
        const body = new ReadableStream<Uint8Array>({ start(stream) { stream.enqueue(new TextEncoder().encode('{"data":')) }, pull() { reached() }, cancel })
        const received = new Response(body, { headers: { 'content-type': 'application/json' } }), fake = vi.fn(async () => received)
        const pending = sourceHostHttp(connection(), fake).read('info', {}, controller.signal)
        await pulled; expect(received.body?.locked).toBe(true); controller.abort()
        await expect(pending).rejects.toMatchObject({ code: 'SOURCE_HOST_CANCELLED' }); expect(cancel).toHaveBeenCalled(); expect(received.body?.locked).toBe(false)
    })
    it('discards a received body if abort wins before acquiring its reader', async () => {
        const controller = new AbortController(), cancel = vi.fn()
        const fake = vi.fn(async () => { controller.abort(); return new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'application/json' } }) })
        await expect(sourceHostHttp(connection(), fake).read('info', {}, controller.signal)).rejects.toMatchObject({ code: 'SOURCE_HOST_CANCELLED' }); expect(cancel).toHaveBeenCalled()
    })
    it('honors a real standard timeout while the body is stalled, not only before headers', async () => {
        const cancel = vi.fn(), fake = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ cancel }), { headers: { 'content-type': 'application/json' } }))
        // Short timeout is supplied by this test caller, not a changed production deadline.
        const pending = sourceHostHttp(connection(), fake).read('info', {}, AbortSignal.timeout(10))
        await expect(pending).rejects.toMatchObject({ code: 'SOURCE_HOST_TIMEOUT' }); expect(cancel).toHaveBeenCalled()
    })
    it('sanitizes transport exceptions and does not open a pre-aborted request', async () => {
        const fake = vi.fn(async () => { throw new Error('Authorization: synthetic-secret https://name:password@host.invalid') })
        await expect(sourceHostHttp(connection(), fake).read('info', {}, signal())).rejects.toMatchObject({ code: 'SOURCE_HOST_UNAVAILABLE', message: 'SOURCE_HOST_UNAVAILABLE' })
        const aborted = new AbortController(); aborted.abort(); fake.mockClear()
        await expect(sourceHostHttp(connection(), fake).read('info', {}, aborted.signal)).rejects.toMatchObject({ code: 'SOURCE_HOST_CANCELLED' }); expect(fake).not.toHaveBeenCalled()
    })
})
