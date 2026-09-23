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
        cookie?: string
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
            cookie: request.headers.cookie,
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
    it('loads only strong token files with restricted POSIX permissions', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-remote-token-'))
        roots.push(root)
        const tokenFile = path.join(root, 'token')

        fs.writeFileSync(tokenFile, 'a'.repeat(48) + '\n', { mode: 0o600 })
        fs.chmodSync(tokenFile, 0o600)
        expect(readRemoteApiToken(tokenFile, 'linux')).toBe('a'.repeat(48))

        fs.chmodSync(tokenFile, 0o640)
        expect(() => readRemoteApiToken(tokenFile, 'linux')).toThrow(
            /accessible by group or other users/
        )
        fs.chmodSync(tokenFile, 0o644)
        expect(() => readRemoteApiToken(tokenFile, 'linux')).toThrow(
            /accessible by group or other users/
        )
        fs.chmodSync(tokenFile, 0o600)
        fs.writeFileSync(tokenFile, 'short')
        expect(() => readRemoteApiToken(tokenFile, 'linux')).toThrow(
            /between 32 and 512/
        )
        fs.writeFileSync(tokenFile, 'a'.repeat(32) + ' bad')
        expect(() => readRemoteApiToken(tokenFile, 'linux')).toThrow(
            /whitespace/
        )
        expect(() => readRemoteApiToken(root, 'linux')).toThrow(
            /regular file/
        )
    })

    it('requires an explicit TLS-terminated proxy declaration for non-loopback binding', () => {
        expect(remoteApiConfiguration(false, {})).toBeNull()
        expect(() => remoteApiConfiguration(true, {})).toThrow(
            /PICA_LIBRARY_REMOTE_TOKEN_FILE/
        )

        expect(
            remoteApiConfiguration(true, {
                PICA_LIBRARY_REMOTE_TOKEN_FILE: '/run/secrets/pica-token'
            })
        ).toEqual({
            host: '127.0.0.1',
            port: 8787,
            tokenFile: '/run/secrets/pica-token',
            allowedHosts: ['127.0.0.1', 'localhost', '::1'],
            allowedOrigins: [],
            webSessions: false,
            transportSecurity: 'loopback-http'
        })

        expect(() =>
            remoteApiConfiguration(true, {
                PICA_LIBRARY_REMOTE_TOKEN_FILE: '/run/secrets/pica-token',
                PICA_LIBRARY_REMOTE_HOST: '0.0.0.0',
                PICA_LIBRARY_REMOTE_ALLOWED_HOSTS: 'library.example'
            })
        ).toThrow(/TLS-terminating reverse proxy/)

        expect(() =>
            remoteApiConfiguration(true, {
                PICA_LIBRARY_REMOTE_TOKEN_FILE: '/run/secrets/pica-token',
                PICA_LIBRARY_REMOTE_HOST: '0.0.0.0',
                PICA_LIBRARY_REMOTE_BEHIND_TLS_PROXY: 'true'
            })
        ).toThrow(/REMOTE_ALLOWED_HOSTS/)

        expect(
            remoteApiConfiguration(true, {
                PICA_LIBRARY_REMOTE_TOKEN_FILE: '/run/secrets/pica-token',
                PICA_LIBRARY_REMOTE_HOST: '0.0.0.0',
                PICA_LIBRARY_REMOTE_PORT: '8787',
                PICA_LIBRARY_REMOTE_BEHIND_TLS_PROXY: 'true',
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
            allowedOrigins: ['https://reader.example'],
            webSessions: false,
            transportSecurity: 'tls-terminated-proxy'
        })

        expect(() =>
            remoteApiConfiguration(true, {
                PICA_LIBRARY_REMOTE_TOKEN_FILE: '/run/secrets/pica-token',
                PICA_LIBRARY_REMOTE_WEB_SESSIONS: 'true'
            })
        ).toThrow(/non-loopback gateway.*TLS-terminating proxy/)

        expect(() =>
            remoteApiConfiguration(true, {
                PICA_LIBRARY_REMOTE_TOKEN_FILE: '/run/secrets/pica-token',
                PICA_LIBRARY_REMOTE_HOST: '0.0.0.0',
                PICA_LIBRARY_REMOTE_BEHIND_TLS_PROXY: 'true',
                PICA_LIBRARY_REMOTE_ALLOWED_HOSTS: 'library.example',
                PICA_LIBRARY_REMOTE_WEB_SESSIONS: 'true'
            })
        ).toThrow(/REMOTE_ALLOWED_ORIGINS/)

        expect(() =>
            remoteApiConfiguration(true, {
                PICA_LIBRARY_REMOTE_TOKEN_FILE: '/run/secrets/pica-token',
                PICA_LIBRARY_REMOTE_HOST: '0.0.0.0',
                PICA_LIBRARY_REMOTE_BEHIND_TLS_PROXY: 'true',
                PICA_LIBRARY_REMOTE_ALLOWED_HOSTS: 'library.example',
                PICA_LIBRARY_REMOTE_ALLOWED_ORIGINS: 'http://library.example',
                PICA_LIBRARY_REMOTE_WEB_SESSIONS: 'true'
            })
        ).toThrow(/exact HTTPS origins/)

        expect(
            remoteApiConfiguration(true, {
                PICA_LIBRARY_REMOTE_TOKEN_FILE: '/run/secrets/pica-token',
                PICA_LIBRARY_REMOTE_HOST: '0.0.0.0',
                PICA_LIBRARY_REMOTE_BEHIND_TLS_PROXY: 'true',
                PICA_LIBRARY_REMOTE_ALLOWED_HOSTS: 'library.example',
                PICA_LIBRARY_REMOTE_ALLOWED_ORIGINS:
                    'https://library.example',
                PICA_LIBRARY_REMOTE_WEB_SESSIONS: 'true'
            })
        ).toEqual({
            host: '0.0.0.0',
            port: 8787,
            tokenFile: '/run/secrets/pica-token',
            allowedHosts: ['library.example'],
            allowedOrigins: ['https://library.example'],
            webSessions: true,
            transportSecurity: 'tls-terminated-proxy'
        })
    })

    it('keeps health minimal but requires bearer authentication for API routes', async () => {
        const target = await upstream()
        const gateway = await startRemoteApiGateway({
            targetBaseUrl: target.url,
            host: '127.0.0.1',
            port: 0,
            token: 't'.repeat(48),
            allowedHosts: ['127.0.0.1']
        })
        const base = `http://127.0.0.1:${gateway.port}`
        try {
            const health = await fetch(`${base}/healthz`)
            expect(health.status).toBe(200)
            expect(await health.json()).toEqual({
                status: 'ok',
                application: 'Pica Library',
                remoteApiVersion: 1
            })
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
        } finally {
            await gateway.close()
        }
    })

    it('rate-limits failed authentication attempts before token validation', async () => {
        const target = await upstream()
        const gateway = await startRemoteApiGateway({
            targetBaseUrl: target.url,
            host: '127.0.0.1',
            port: 0,
            token: 't'.repeat(48),
            allowedHosts: ['127.0.0.1'],
            rateLimit: 1,
            rateWindowMs: 60_000
        })
        const base = `http://127.0.0.1:${gateway.port}`
        try {
            expect(
                (
                    await fetch(`${base}/api/v1/capabilities`, {
                        headers: authorization('wrong'.repeat(10))
                    })
                ).status
            ).toBe(401)
            const limited = await fetch(`${base}/api/v1/capabilities`, {
                headers: authorization('wrong-again'.repeat(6))
            })
            expect(limited.status).toBe(429)
            expect(limited.headers.get('retry-after')).toBeTruthy()
        } finally {
            await gateway.close()
        }
    })

    it('exchanges bearer auth for an in-memory HttpOnly browser session with CSRF binding', async () => {
        const target = await upstream()
        const gateway = await startRemoteApiGateway({
            targetBaseUrl: target.url,
            host: '127.0.0.1',
            port: 0,
            token: 't'.repeat(48),
            allowedHosts: ['127.0.0.1'],
            allowedOrigins: ['https://reader.example'],
            webSessions: true,
            webSessionTtlMs: 60_000
        })
        const base = `http://127.0.0.1:${gateway.port}`
        try {
            expect(gateway.webSessionsEnabled).toBe(true)
            expect(gateway.activeWebSessions()).toBe(0)

            const unauthenticated = await fetch(
                `${base}/remote/v1/session/bootstrap`,
                {
                    method: 'POST',
                    headers: { origin: 'https://reader.example' }
                }
            )
            expect(unauthenticated.status).toBe(401)

            const bootstrap = await fetch(
                `${base}/remote/v1/session/bootstrap`,
                {
                    method: 'POST',
                    headers: {
                        ...authorization(),
                        origin: 'https://reader.example'
                    }
                }
            )
            expect(bootstrap.status).toBe(201)
            const setCookie = bootstrap.headers.get('set-cookie') ?? ''
            expect(setCookie).toMatch(/^__Host-pica_session=[A-Za-z0-9_-]+;/)
            expect(setCookie).toContain('Path=/')
            expect(setCookie).toContain('HttpOnly')
            expect(setCookie).toContain('Secure')
            expect(setCookie).toContain('SameSite=Strict')
            expect(setCookie).not.toMatch(/Domain=/i)
            const cookie = setCookie.split(';', 1)[0]
            const boot = (await bootstrap.json()) as {
                csrfToken: string
                authenticated: boolean
            }
            expect(boot.authenticated).toBe(true)
            expect(boot.csrfToken).toMatch(/^[A-Za-z0-9_-]+$/)
            expect(gateway.activeWebSessions()).toBe(1)

            const sessionStatus = await fetch(
                `${base}/remote/v1/session`,
                { headers: { cookie } }
            )
            expect(sessionStatus.status).toBe(200)
            expect(await sessionStatus.json()).toMatchObject({
                authenticated: true,
                csrfToken: boot.csrfToken
            })

            const cookieOnly = await fetch(
                `${base}/api/v1/capabilities`,
                { headers: { cookie } }
            )
            expect(cookieOnly.status).toBe(200)
            expect(target.requests.at(-1)).toMatchObject({
                authorization: undefined,
                origin: undefined,
                cookie: undefined
            })

            const noCsrf = await fetch(
                `${base}/api/v1/library/query`,
                {
                    method: 'POST',
                    headers: {
                        cookie,
                        'content-type': 'application/json',
                        origin: 'https://reader.example'
                    },
                    body: JSON.stringify({ text: 'fixture' })
                }
            )
            expect(noCsrf.status).toBe(403)

            const wrongOrigin = await fetch(
                `${base}/api/v1/library/query`,
                {
                    method: 'POST',
                    headers: {
                        cookie,
                        'content-type': 'application/json',
                        origin: 'https://attacker.example',
                        'x-pica-csrf': boot.csrfToken
                    },
                    body: JSON.stringify({ text: 'fixture' })
                }
            )
            expect(wrongOrigin.status).toBe(403)

            const accepted = await fetch(
                `${base}/api/v1/library/query`,
                {
                    method: 'POST',
                    headers: {
                        cookie,
                        'content-type': 'application/json',
                        origin: 'https://reader.example',
                        'x-pica-csrf': boot.csrfToken
                    },
                    body: JSON.stringify({ text: 'fixture' })
                }
            )
            expect(accepted.status).toBe(200)
            expect(target.requests.at(-1)).toMatchObject({
                authorization: undefined,
                origin: undefined,
                cookie: undefined
            })

            const logout = await fetch(
                `${base}/remote/v1/session/logout`,
                {
                    method: 'POST',
                    headers: {
                        cookie,
                        origin: 'https://reader.example',
                        'x-pica-csrf': boot.csrfToken
                    }
                }
            )
            expect(logout.status).toBe(200)
            expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
            expect(gateway.activeWebSessions()).toBe(0)

            expect(
                (
                    await fetch(`${base}/api/v1/capabilities`, {
                        headers: { cookie }
                    })
                ).status
            ).toBe(401)
        } finally {
            await gateway.close()
        }
    })

    it('serves only fixed Remote Web shell assets with a strict browser policy', async () => {
        const target = await upstream()
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-remote-web-'))
        roots.push(root)
        fs.writeFileSync(
            path.join(root, 'index.html'),
            '<!doctype html><script type="module" src="/remote/remote.js"></script>'
        )
        fs.writeFileSync(path.join(root, 'remote.js'), 'globalThis.remoteShell = true\n')
        fs.writeFileSync(path.join(root, 'remote.css'), 'body{margin:0}\n')

        const gateway = await startRemoteApiGateway({
            targetBaseUrl: target.url,
            host: '127.0.0.1',
            port: 0,
            token: 't'.repeat(48),
            allowedHosts: ['127.0.0.1'],
            allowedOrigins: ['https://reader.example'],
            webSessions: true,
            webRoot: root
        })
        const base = `http://127.0.0.1:${gateway.port}`
        try {
            expect(gateway.webShellEnabled).toBe(true)

            const redirect = await fetch(`${base}/remote`, {
                redirect: 'manual'
            })
            expect(redirect.status).toBe(308)
            expect(redirect.headers.get('location')).toBe('/remote/')

            const shell = await fetch(`${base}/remote/`)
            expect(shell.status).toBe(200)
            expect(shell.headers.get('content-type')).toContain('text/html')
            expect(shell.headers.get('cache-control')).toBe('no-store')
            expect(shell.headers.get('content-security-policy')).toContain(
                "default-src 'none'"
            )
            expect(shell.headers.get('content-security-policy')).toContain(
                "script-src 'self'"
            )
            expect(shell.headers.get('content-security-policy')).toContain(
                "object-src 'none'"
            )
            expect(shell.headers.get('x-frame-options')).toBe('DENY')
            expect(shell.headers.get('referrer-policy')).toBe('no-referrer')
            expect(shell.headers.get('permissions-policy')).toContain(
                'camera=()'
            )
            expect(await shell.text()).toContain('/remote/remote.js')

            const script = await fetch(`${base}/remote/remote.js`)
            expect(script.status).toBe(200)
            expect(script.headers.get('content-type')).toContain(
                'text/javascript'
            )
            expect(await script.text()).toContain('remoteShell')

            const css = await fetch(`${base}/remote/remote.css`)
            expect(css.status).toBe(200)
            expect(css.headers.get('content-type')).toContain('text/css')

            expect(
                (
                    await fetch(`${base}/remote/unknown.js`)
                ).status
            ).toBe(401)

            const bootstrap = await fetch(
                `${base}/remote/v1/session/bootstrap`,
                {
                    method: 'POST',
                    headers: {
                        ...authorization(),
                        origin: 'https://reader.example'
                    }
                }
            )
            expect(bootstrap.status).toBe(201)
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
                origin: undefined,
                cookie: undefined
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

    it('rejects unapproved Host and browser Origin before proxying', async () => {
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

            const blockedHost = await new Promise<number>((resolve, reject) => {
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
            expect(blockedHost).toBe(403)
            expect(target.requests).toHaveLength(0)
        } finally {
            await gateway.close()
        }
    })

    it('refuses to proxy into a non-loopback upstream', async () => {
        await expect(
            startRemoteApiGateway({
                targetBaseUrl: 'http://0.0.0.0:4789',
                host: '127.0.0.1',
                port: 0,
                token: 't'.repeat(48),
                allowedHosts: ['127.0.0.1']
            })
        ).rejects.toThrow(/target must remain loopback-only/)
    })
})
