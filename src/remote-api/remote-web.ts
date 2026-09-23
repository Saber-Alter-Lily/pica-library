import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const REMOTE_WEB_SESSION_COOKIE = '__Host-pica_remote_session'
export const REMOTE_WEB_CSRF_HEADER = 'x-pica-csrf'

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000
const MAX_SESSIONS = 64
const MAX_LOGIN_BODY_BYTES = 4 * 1024

const STATIC_FILES = new Map<
    string,
    { file: string; type: string; cache: string }
>([
    ['/remote/', { file: 'index.html', type: 'text/html; charset=utf-8', cache: 'no-cache' }],
    ['/remote/app.js', { file: 'app.js', type: 'text/javascript; charset=utf-8', cache: 'no-cache' }],
    ['/remote/styles.css', { file: 'styles.css', type: 'text/css; charset=utf-8', cache: 'no-cache' }],
    ['/remote/manifest.webmanifest', { file: 'manifest.webmanifest', type: 'application/manifest+json; charset=utf-8', cache: 'no-cache' }],
    ['/remote/icon.svg', { file: 'icon.svg', type: 'image/svg+xml; charset=utf-8', cache: 'public, max-age=86400' }],
    ['/remote/sw.js', { file: 'sw.js', type: 'text/javascript; charset=utf-8', cache: 'no-cache' }]
])

interface SessionRecord {
    expiresAt: number
    csrfToken: string
}

export interface RemoteWebAuthorization {
    authorized: boolean
    status: 200 | 401 | 403
    error?: string
}

export interface RemoteWebController {
    serveStatic(
        request: IncomingMessage,
        response: ServerResponse,
        pathname: string
    ): number | null
    handleSession(
        request: IncomingMessage,
        response: ServerResponse,
        pathname: string
    ): Promise<number | null>
    authorizeApi(request: IncomingMessage): RemoteWebAuthorization
    clear(): void
}

function digest(value: string) {
    return createHash('sha256').update(value).digest()
}

function digestKey(value: string) {
    return createHash('sha256').update(value).digest('hex')
}

function secretMatches(value: string, expected: string | Buffer) {
    const expectedDigest =
        typeof expected === 'string' ? digest(expected) : expected
    return timingSafeEqual(digest(value), expectedDigest)
}

function parseCookies(request: IncomingMessage) {
    const result = new Map<string, string>()
    for (const pair of String(request.headers.cookie ?? '').split(';')) {
        const index = pair.indexOf('=')
        if (index <= 0) continue
        const name = pair.slice(0, index).trim()
        const value = pair.slice(index + 1).trim()
        if (name && value) result.set(name, value)
    }
    return result
}

function normalizedOrigin(value: string) {
    try {
        return new URL(value).origin
    } catch {
        return null
    }
}

async function jsonBody(request: IncomingMessage) {
    const contentType = String(request.headers['content-type'] ?? '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase()
    if (contentType !== 'application/json')
        throw Object.assign(
            new Error('Remote Web login requires application/json'),
            { statusCode: 415 }
        )

    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
        const value = Buffer.from(chunk)
        size += value.byteLength
        if (size > MAX_LOGIN_BODY_BYTES)
            throw Object.assign(
                new Error('Remote Web login body is too large'),
                { statusCode: 413 }
            )
        chunks.push(value)
    }
    if (!chunks.length) return {}
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
            string,
            unknown
        >
    } catch {
        throw Object.assign(new Error('Remote Web login body is invalid'), {
            statusCode: 400
        })
    }
}

function securityHeaders() {
    return {
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
        'permissions-policy':
            'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        'content-security-policy':
            "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; manifest-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'"
    }
}

function json(
    response: ServerResponse,
    status: number,
    value: unknown,
    headers: Record<string, string> = {}
) {
    response.writeHead(status, {
        ...securityHeaders(),
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...headers
    })
    response.end(JSON.stringify(value))
}

function cookieHeader(value: string, ttlSeconds: number) {
    return (
        REMOTE_WEB_SESSION_COOKIE +
        '=' +
        value +
        '; Path=/; Max-Age=' +
        ttlSeconds +
        '; HttpOnly; Secure; SameSite=Strict'
    )
}

function clearCookieHeader() {
    return (
        REMOTE_WEB_SESSION_COOKIE +
        '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict'
    )
}

function validatedRoot(root: string) {
    const resolved = fs.realpathSync(root)
    if (!fs.statSync(resolved).isDirectory())
        throw new Error('Remote Web root must be a directory')
    for (const value of STATIC_FILES.values()) {
        const file = path.join(resolved, value.file)
        if (!fs.existsSync(file) || !fs.statSync(file).isFile())
            throw new Error('Remote Web asset is missing: ' + value.file)
    }
    return resolved
}

export function createRemoteWebController(options: {
    root: string
    token: string
    allowedOrigins: string[]
    sessionTtlMs?: number
}): RemoteWebController {
    const root = validatedRoot(options.root)
    const expectedToken = digest(options.token)
    const allowedOrigins = new Set(
        options.allowedOrigins
            .map((value) => normalizedOrigin(value))
            .filter((value): value is string => Boolean(value))
    )
    if (!allowedOrigins.size)
        throw new Error('Remote Web requires at least one allowed HTTPS Origin')
    for (const origin of allowedOrigins)
        if (new URL(origin).protocol !== 'https:')
            throw new Error('Remote Web allowed Origins must use HTTPS')

    const sessionTtlMs = Math.max(
        60_000,
        Math.min(
            options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS,
            24 * 60 * 60 * 1000
        )
    )
    const sessions = new Map<string, SessionRecord>()

    const prune = (now = Date.now()) => {
        for (const [key, value] of sessions)
            if (value.expiresAt <= now) sessions.delete(key)
        while (sessions.size > MAX_SESSIONS) {
            const oldest = sessions.keys().next().value as string | undefined
            if (!oldest) break
            sessions.delete(oldest)
        }
    }

    const sessionFor = (request: IncomingMessage) => {
        const raw = parseCookies(request).get(REMOTE_WEB_SESSION_COOKIE)
        if (!raw) return null
        const key = digestKey(raw)
        const value = sessions.get(key)
        if (!value) return null
        if (value.expiresAt <= Date.now()) {
            sessions.delete(key)
            return null
        }
        return { key, value }
    }

    const mutationOriginAllowed = (request: IncomingMessage) => {
        const origin = normalizedOrigin(String(request.headers.origin ?? ''))
        return Boolean(origin && allowedOrigins.has(origin))
    }

    const csrfAllowed = (
        request: IncomingMessage,
        session: SessionRecord
    ) => {
        const value = request.headers[REMOTE_WEB_CSRF_HEADER]
        return (
            typeof value === 'string' &&
            Boolean(value) &&
            secretMatches(value, session.csrfToken)
        )
    }

    const authorizeApi = (
        request: IncomingMessage
    ): RemoteWebAuthorization => {
        const session = sessionFor(request)
        if (!session)
            return {
                authorized: false,
                status: 401,
                error: 'Authentication required'
            }

        const method = request.method ?? 'GET'
        if (method === 'GET' || method === 'HEAD')
            return { authorized: true, status: 200 }

        if (!mutationOriginAllowed(request))
            return {
                authorized: false,
                status: 403,
                error: 'Remote Web mutation Origin is not allowed'
            }
        if (!csrfAllowed(request, session.value))
            return {
                authorized: false,
                status: 403,
                error: 'Remote Web CSRF validation failed'
            }
        return { authorized: true, status: 200 }
    }

    return {
        serveStatic(request, response, pathname) {
            if (request.method !== 'GET' && request.method !== 'HEAD')
                return null
            if (pathname === '/remote') {
                response.writeHead(308, {
                    ...securityHeaders(),
                    location: '/remote/',
                    'cache-control': 'no-store'
                })
                response.end()
                return 308
            }
            const asset = STATIC_FILES.get(pathname)
            if (!asset) return null
            const file = path.join(root, asset.file)
            const data = fs.readFileSync(file)
            const headers: Record<string, string> = {
                ...securityHeaders(),
                'content-type': asset.type,
                'content-length': String(data.byteLength),
                'cache-control': asset.cache
            }
            if (pathname === '/remote/sw.js')
                headers['service-worker-allowed'] = '/remote/'
            response.writeHead(200, headers)
            if (request.method === 'HEAD') response.end()
            else response.end(data)
            return 200
        },

        async handleSession(request, response, pathname) {
            if (pathname !== '/remote/session') return null
            prune()
            const method = request.method ?? 'GET'
            const session = sessionFor(request)

            if (method === 'GET') {
                if (!session) {
                    json(response, 200, { authenticated: false })
                    return 200
                }
                json(response, 200, {
                    authenticated: true,
                    csrfToken: session.value.csrfToken,
                    expiresInSeconds: Math.max(
                        0,
                        Math.floor(
                            (session.value.expiresAt - Date.now()) / 1_000
                        )
                    )
                })
                return 200
            }

            if (method === 'DELETE') {
                if (!session) {
                    json(
                        response,
                        200,
                        { authenticated: false },
                        { 'set-cookie': clearCookieHeader() }
                    )
                    return 200
                }
                if (!mutationOriginAllowed(request)) {
                    json(response, 403, {
                        error: 'Remote Web mutation Origin is not allowed'
                    })
                    return 403
                }
                if (!csrfAllowed(request, session.value)) {
                    json(response, 403, {
                        error: 'Remote Web CSRF validation failed'
                    })
                    return 403
                }
                sessions.delete(session.key)
                json(
                    response,
                    200,
                    { authenticated: false },
                    { 'set-cookie': clearCookieHeader() }
                )
                return 200
            }

            if (method !== 'POST') {
                json(response, 405, { error: 'Method not allowed' })
                return 405
            }

            if (!mutationOriginAllowed(request)) {
                json(response, 403, {
                    error: 'Remote Web login Origin is not allowed'
                })
                return 403
            }

            const input = await jsonBody(request)
            const token = typeof input.token === 'string' ? input.token : ''
            if (!token || !secretMatches(token, expectedToken)) {
                json(response, 401, { error: 'Authentication required' })
                return 401
            }

            if (session) sessions.delete(session.key)
            const rawSession = randomBytes(32).toString('base64url')
            const csrfToken = randomBytes(32).toString('base64url')
            const record: SessionRecord = {
                expiresAt: Date.now() + sessionTtlMs,
                csrfToken
            }
            sessions.set(digestKey(rawSession), record)
            prune()

            json(
                response,
                200,
                {
                    authenticated: true,
                    csrfToken,
                    expiresInSeconds: Math.floor(sessionTtlMs / 1_000)
                },
                {
                    'set-cookie': cookieHeader(
                        rawSession,
                        Math.floor(sessionTtlMs / 1_000)
                    )
                }
            )
            return 200
        },

        authorizeApi,

        clear() {
            sessions.clear()
        }
    }
}
