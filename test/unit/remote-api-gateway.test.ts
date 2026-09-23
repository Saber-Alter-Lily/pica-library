import fs from 'node:fs'
import http, { type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
    readRemoteApiToken,
    startRemoteApiGateway
} from '../../src/remote-api/gateway'
import { remoteApiConfiguration } from '../../src/remote-api/config'

const roots: string[] = []
const servers: Server[] = []

afterEach(async () => {
    await Promise.all(
        servers.splice(0).map(
            (server) =>
                new Promise<void>((resolve) =>
                    server.close(() => resolve())
                )
        )
    )
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

async function upstream() {
    const requests: Array<{
        method: string
        path: string
        authorization?: string
        origin?: string
        body: string
    }> = []
    const server = http.createServer(async (request, response) => {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(Buffer.from(chunk))
        requests.push({
            method: request.method ?? 'GET',
            path: request.url ?? '/',
            authorization: request.headers.authorization,
            origin: request.headers.origin,
            body: Buffer.concat(chunks).toString('utf8')
        })
        if (request.url === '/api/v1/reader/pictures/p1') {
            const body = Buffer.from('reader-page')
            response.writeHead(200, {
                'content-type': 'image/jpeg',
                'content-length': String(body.byteLength)
            })
            response.end(body)
            return
        }
        response.writeHead(200, {
            'content-type': 'application/json; charset=utf-8'
        })
        response.end(
            JSON.stringify({
                ok: true,
                path: request.url,
                method: request.method,
                body: Buffer.concat(chunks).toString('utf8')
            })
        )
    })
    await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve)
    )
    servers.push(server)
    const address = server.address()
    if (!address || typeof address === 'string')
        throw new Error('upstream did not bind')
    return {
        requests,
        url: `http://127.0.0.1:${address.port}`
    }
}

function authorization(token = 't'.repeat(48)) {
    return { authorization: `Bearer ${token}` }
}

describe('authenticated Remote API gateway', () => {
    it('loads only strong token-file values', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-remote-token-'))
        roots.push(root)
        const tokenFile = path.join(root, 'token')
        fs.writeFileSync(tokenFile, 'a'.repeat(48) + '\n')
        expect(readRemoteApiToken(tokenFile)).toBe('a'.repeat(48))

        fs.writeFileSync(tokenFile, 'short')
        expect(() => readRemoteApiToken(tokenFile)).toThrow(
            /between 32 and 512/
        )
        fs.writeFileSync(tokenFile, 'a'.repeat(32) + ' bad')
        expect(() => readRemoteApiToken(tokenFile)).toThrow(/whitespace/)
    })

    it('requires an explicit secret file and Host allowlist for non-loopback mode', () => {
        expect(remoteApiConfiguration(false, {})).toBeNull()
        expect(() => remoteApiConfiguration(true, {})).toThrow(
            /PICA_LIBRARY_REMOTE_TOKEN_FILE/
        )
        expect(() =>
            remoteApiConfiguration(true, {
                PICA_LIBRARY_REMOTE_TOKEN_FILE: '/run/secrets/pica-token',
                PICA_LIBRARY_REMOTE_HOST: '0.0.0.0'
            })
        ).toThrow(/REMOTE_ALLOWED_HOSTS/)

        expect(
            remoteApiConfiguration(true, {
                PICA_LIBRARY_REMOTE_TOKEN_FILE: '/run/secrets/pica-token',
                PICA_LIBRARY_REMOTE_HOST: '0.0.0.0',
                PICA_LIBRARY_REMOTE_PORT: '8787',
                PICA_LIBRARY_REMOTE_ALLOWED_HOSTS:
                    'library.example,192.0.2.10',
                PICA_LIBRARY_REMOTE_ALLOWED_ORIGINS:
                    'https://reader.example'
            })
        ).toEqual({
            host: '0.0.0.0',
            port: 8787,
            tokenFile: '/run/secrets/pica-token',
            allowedHosts: ['library.example', '192.0.2.10'],
            allowedOrigins: ['https://reader.example']
        })
    })

    it('keeps health public but requires the bearer token for API routes', async () => {
        const target = await upstream()
        const gateway = await startRemoteApiGateway({
            targetBaseUrl: target.url,
            host: '127.0.0.1',
            port: 0,
            token: 't'.repeat(48),
            allowedHosts: ['127.0.0.1'],
            allowedOrigins: ['https://reader.example']
        })
        const base = `http://127.0.0.1:${gateway.port}`
        try {
            expect((await fetch(`${base}/healthz`)).status).toBe(200)
            expect((await fetch(`${base}/api/v1/capabilities`)).status).toBe(
                401
            )
            expect(
                (
                    await fetch(`${base}/api/v1/capabilities`, {
                        headers: authorization('wrong'.repeat(10))
                    })
                ).status
            ).toBe(401)
            const accepted = await fetch(`${base}/api/v1/capabilities`, {
                headers: authorization()
            })
            expect(accepted.status).toBe(200)
            expect(await accepted.json()).toMatchObject({
                ok: true,
                path: '/api/v1/capabilities'
            })
        } finally {
            await gateway.close()
        }
    })

    it('proxies only the allowlisted library/reader surface and strips gateway credentials', async () => {
        const target = await upstream()
        const gateway = await startRemoteApiGateway({
            targetBaseUrl: target.url,
            host: '127.0.0.1',
            port: 0,
            token: 't'.repeat(48),
            allowedHosts: ['127.0.0.1'],
            allowedOrigins: ['https://reader.example']
        })
        const base = `http://127.0.0.1:${gateway.port}`
        try {
            const query = await fetch(`${base}/api/v1/library/query`, {
                method: 'POST',
                headers: {
                    ...authorization(),
                    'content-type': 'application/json',
                    origin: 'https://reader.example'
                },
                body: JSON.stringify({ text: 'fixture' })
            })
            expect(query.status).toBe(200)
            expect(await query.json()).toMatchObject({
                ok: true,
                method: 'POST',
                body: JSON.stringify({ text: 'fixture' })
            })
            expect(target.requests.at(-1)).toMatchObject({
                authorization: undefined,
                origin: undefined
            })

            const image = await fetch(
                `${base}/api/v1/reader/pictures/p1`,
                { headers: authorization() }
            )
            expect(image.status).toBe(200)
            expect(image.headers.get('content-type')).toBe('image/jpeg')
            expect(await image.text()).toBe('reader-page')

            expect(
                (
                    await fetch(`${base}/api/v1/desktop/status`, {
                        headers: authorization()
                    })
                ).status
            ).toBe(404)
            expect(
                (
                    await fetch(`${base}/api/v1/import`, {
                        method: 'POST',
                        headers: {
                            ...authorization(),
                            'content-type': 'application/json'
                        },
                        body: '{}'
                    })
                ).status
            ).toBe(404)
        } finally {
            await gateway.close()
        }
        expect(
            target.requests.some((request) =>
                request.path.startsWith('/api/v1/desktop/')
            )
        ).toBe(false)
        expect(
            target.requests.some((request) => request.path === '/api/v1/import')
        ).toBe(false)
    })

    it('rejects unapproved browser origins and enforces the remote rate limit', async () => {
        const target = await upstream()
        const gateway = await startRemoteApiGateway({
            targetBaseUrl: target.url,
            host: '127.0.0.1',
            port: 0,
            token: 't'.repeat(48),
            allowedHosts: ['127.0.0.1'],
            allowedOrigins: ['https://reader.example'],
            rateLimit: 1,
            rateWindowMs: 60_000
        })
        const base = `http://127.0.0.1:${gateway.port}`
        try {
            const blockedOrigin = await fetch(
                `${base}/api/v1/capabilities`,
                {
                    headers: {
                        ...authorization(),
                        origin: 'https://attacker.example'
                    }
                }
            )
            expect(blockedOrigin.status).toBe(403)

            expect(
                (
                    await fetch(`${base}/api/v1/capabilities`, {
                        headers: authorization()
                    })
                ).status
            ).toBe(200)
            const limited = await fetch(`${base}/api/v1/status`, {
                headers: authorization()
            })
            expect(limited.status).toBe(429)
            expect(limited.headers.get('retry-after')).toBeTruthy()
        } finally {
            await gateway.close()
        }
    })

    it('rejects invalid Host before authentication', async () => {
        const target = await upstream()
        const gateway = await startRemoteApiGateway({
            targetBaseUrl: target.url,
            host: '127.0.0.1',
            port: 0,
            token: 't'.repeat(48),
            allowedHosts: ['127.0.0.1']
        })
        try {
            const status = await new Promise<number>((resolve, reject) => {
                const request = http.request(
                    {
                        host: '127.0.0.1',
                        port: gateway.port,
                        path: '/api/v1/status',
                        headers: {
                            host: 'attacker.example',
                            ...authorization()
                        }
                    },
                    (response) => {
                        response.resume()
                        resolve(response.statusCode ?? 0)
                    }
                )
                request.on('error', reject)
                request.end()
            })
            expect(status).toBe(403)
            expect(target.requests).toHaveLength(0)
        } finally {
            await gateway.close()
        }
    })

    it('publishes no secret material through Desktop status wiring', () => {
        const main = fs.readFileSync('src/desktop/main.ts', 'utf8')
        expect(main).toContain('startRemoteApiGateway({')
        expect(main).toContain('readRemoteApiToken(remoteApiSettings.tokenFile)')
        expect(main).toContain('Authenticated Remote API started on')
        expect(main).toContain('remoteApi: remoteApiGateway')
        expect(main).not.toContain('remoteApi: remoteApiSettings')
        expect(main).not.toContain('token: remoteApiSettings')
    })
})
