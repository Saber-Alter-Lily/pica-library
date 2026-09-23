import { createHash, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import http, {
    type IncomingMessage,
    type Server,
    type ServerResponse
} from 'node:http'
import { Readable } from 'node:stream'

export const REMOTE_API_VERSION = 1
const DEFAULT_RATE_LIMIT = 300
const DEFAULT_RATE_WINDOW_MS = 60_000
const MAX_REQUEST_BODY_BYTES = 1024 * 1024
const FORWARDED_RESPONSE_HEADERS = new Set([
    'cache-control',
    'content-length',
    'content-type',
    'etag',
    'last-modified',
    'x-content-type-options'
])

export interface RemoteApiGatewayOptions {
    targetBaseUrl: string
    host: string
    port: number
    token: string
    allowedHosts: string[]
    allowedOrigins?: string[]
    rateLimit?: number
    rateWindowMs?: number
    onAudit?: (event: {
        remoteAddress: string
        method: string
        path: string
        status: number
    }) => void
}

export interface RemoteApiGateway {
    server: Server
    host: string
    port: number
    close(): Promise<void>
}

interface RateWindow {
    startedAt: number
    count: number
}

function json(response: ServerResponse, status: number, value: unknown) {
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
    })
    response.end(JSON.stringify(value))
}

function normalizedHost(value: string) {
    const raw = value.trim()
    if (!raw) return null
    if (raw === '::1') return '::1'
    try {
        return new URL(`http://${raw}`)
            .hostname.toLowerCase()
            .replace(/^\[|\]$/g, '')
    } catch {
        return null
    }
}

function normalizedOrigin(value: string) {
    try {
        return new URL(value).origin
    } catch {
        return null
    }
}

function tokenDigest(value: string) {
    return createHash('sha256').update(value).digest()
}

function bearerToken(request: IncomingMessage) {
    const value = request.headers.authorization
    if (!value?.startsWith('Bearer ')) return null
    const token = value.slice('Bearer '.length).trim()
    return token || null
}

function isAuthorized(request: IncomingMessage, expectedDigest: Buffer) {
    const token = bearerToken(request)
    if (!token) return false
    return timingSafeEqual(tokenDigest(token), expectedDigest)
}

function allowlistedRoute(method: string, pathname: string) {
    if (method === 'GET' && pathname === '/api/v1/status') return true
    if (method === 'GET' && pathname === '/api/v1/capabilities') return true
    if (method === 'POST' && pathname === '/api/v1/library/query') return true
    if (method === 'GET' && pathname === '/api/v1/downloaded') return true
    if (method === 'GET' && pathname === '/api/v1/shelves') return true
    if (method === 'GET' && /^\/api\/v1\/shelves\/[^/]+$/.test(pathname))
        return true
    if (method === 'GET' && /^\/api\/v1\/comics\/[^/]+$/.test(pathname))
        return true
    if (method === 'GET' && /^\/api\/v1\/covers\/[^/]+$/.test(pathname))
        return true
    if (
        method === 'GET' &&
        /^\/api\/v1\/reader\/comics\/[^/]+\/chapters(?:\/[^/]+)?$/.test(
            pathname
        )
    )
        return true
    if (
        method === 'GET' &&
        /^\/api\/v1\/reader\/pictures\/[^/]+$/.test(pathname)
    )
        return true
    if (
        pathname === '/api/v1/reader/progress' &&
        (method === 'GET' || method === 'POST')
    )
        return true
    return false
}

async function requestBody(request: IncomingMessage) {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
        const value = Buffer.from(chunk)
        size += value.byteLength
        if (size > MAX_REQUEST_BODY_BYTES)
            throw Object.assign(new Error('Remote request body is too large'), {
                statusCode: 413
            })
        chunks.push(value)
    }
    return chunks.length ? Buffer.concat(chunks) : undefined
}

function proxyHeaders(request: IncomingMessage) {
    const headers = new Headers()
    for (const name of [
        'accept',
        'content-type',
        'if-none-match',
        'if-modified-since',
        'x-pica-app-session',
        'x-pica-context-id'
    ]) {
        const value = request.headers[name]
        if (typeof value === 'string') headers.set(name, value)
    }
    return headers
}

function writeUpstreamHeaders(response: ServerResponse, upstream: Response) {
    const headers: Record<string, string> = {}
    for (const [name, value] of upstream.headers) {
        if (FORWARDED_RESPONSE_HEADERS.has(name.toLowerCase()))
            headers[name] = value
    }
    headers['x-content-type-options'] = 'nosniff'
    response.writeHead(upstream.status, headers)
}

function closeServer(server: Server) {
    server.closeIdleConnections()
    return new Promise<void>((resolve) => {
        let settled = false
        const finish = () => {
            if (settled) return
            settled = true
            resolve()
        }
        server.close(finish)
        const timer = setTimeout(() => {
            server.closeAllConnections()
            finish()
        }, 1_000)
        timer.unref()
    })
}

export function readRemoteApiToken(
    file: string,
    platform: NodeJS.Platform = process.platform,
    uid = process.getuid?.()
) {
    const stat = fs.statSync(file)
    if (!stat.isFile())
        throw new Error('Remote API token path must be a regular file')
    if (platform !== 'win32') {
        const permissions = stat.mode & 0o777
        if ((permissions & 0o077) !== 0)
            throw new Error(
                'Remote API token file must not be accessible by group or other users'
            )
        if (
            uid !== undefined &&
            stat.uid !== uid &&
            stat.uid !== 0
        )
            throw new Error(
                'Remote API token file must be owned by the current user or root'
            )
    }
    const value = fs.readFileSync(file, 'utf8').trim()
    if (value.length < 32 || value.length > 512)
        throw new Error(
            'Remote API token file must contain between 32 and 512 characters'
        )
    if (/\s/.test(value))
        throw new Error('Remote API token must not contain whitespace')
    return value
}

export async function startRemoteApiGateway(
    options: RemoteApiGatewayOptions
): Promise<RemoteApiGateway> {
    const target = new URL(options.targetBaseUrl)
    if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname))
        throw new Error('Remote API gateway target must remain loopback-only')

    const allowedHosts = new Set(
        options.allowedHosts
            .map((value) => normalizedHost(value))
            .filter((value): value is string => Boolean(value))
    )
    if (allowedHosts.size === 0)
        throw new Error('Remote API requires at least one allowed Host')

    const allowedOrigins = new Set(
        (options.allowedOrigins ?? [])
            .map((value) => normalizedOrigin(value))
            .filter((value): value is string => Boolean(value))
    )
    const expectedDigest = tokenDigest(options.token)
    const rateLimit = Math.max(1, options.rateLimit ?? DEFAULT_RATE_LIMIT)
    const rateWindowMs = Math.max(
        1_000,
        options.rateWindowMs ?? DEFAULT_RATE_WINDOW_MS
    )
    const rateWindows = new Map<string, RateWindow>()

    const audit = (
        request: IncomingMessage,
        pathname: string,
        status: number
    ) => {
        options.onAudit?.({
            remoteAddress: request.socket.remoteAddress ?? 'unknown',
            method: request.method ?? 'GET',
            path: pathname,
            status
        })
    }

    const rateLimited = (request: IncomingMessage) => {
        const remoteAddress = request.socket.remoteAddress ?? 'unknown'
        const now = Date.now()
        if (rateWindows.size > 1024) {
            for (const [key, value] of rateWindows)
                if (now - value.startedAt >= rateWindowMs)
                    rateWindows.delete(key)
        }
        let window = rateWindows.get(remoteAddress)
        if (!window || now - window.startedAt >= rateWindowMs) {
            window = { startedAt: now, count: 0 }
            rateWindows.set(remoteAddress, window)
        }
        window.count += 1
        if (window.count <= rateLimit) return null
        return Math.max(
            1,
            Math.ceil((window.startedAt + rateWindowMs - now) / 1_000)
        )
    }

    const server = http.createServer(async (request, response) => {
        const method = request.method ?? 'GET'
        let pathname = '/'
        try {
            const url = new URL(
                request.url ?? '/',
                `http://${request.headers.host ?? 'invalid.local'}`
            )
            pathname = url.pathname

            const requestHost = normalizedHost(request.headers.host ?? '')
            if (!requestHost || !allowedHosts.has(requestHost)) {
                audit(request, pathname, 403)
                return json(response, 403, { error: 'Remote Host is not allowed' })
            }

            const originHeader = request.headers.origin
            if (originHeader) {
                const origin = normalizedOrigin(originHeader)
                if (!origin || !allowedOrigins.has(origin)) {
                    audit(request, pathname, 403)
                    return json(response, 403, {
                        error: 'Remote Origin is not allowed'
                    })
                }
            }

            const retryAfter = rateLimited(request)
            if (retryAfter !== null) {
                response.setHeader('retry-after', String(retryAfter))
                audit(request, pathname, 429)
                return json(response, 429, {
                    error: 'Remote rate limit exceeded'
                })
            }

            if (method === 'GET' && pathname === '/healthz') {
                try {
                    const health = await fetch(
                        new URL('/api/v1/status', target),
                        { signal: AbortSignal.timeout(1_500) }
                    )
                    const status = health.ok ? 200 : 503
                    audit(request, pathname, status)
                    return json(response, status, {
                        status: health.ok ? 'ok' : 'unavailable',
                        application: 'Pica Library',
                        remoteApiVersion: REMOTE_API_VERSION
                    })
                } catch {
                    audit(request, pathname, 503)
                    return json(response, 503, {
                        status: 'unavailable',
                        application: 'Pica Library',
                        remoteApiVersion: REMOTE_API_VERSION
                    })
                }
            }

            if (!isAuthorized(request, expectedDigest)) {
                response.setHeader('www-authenticate', 'Bearer')
                audit(request, pathname, 401)
                return json(response, 401, {
                    error: 'Authentication required'
                })
            }

            if (!allowlistedRoute(method, pathname)) {
                audit(request, pathname, 404)
                return json(response, 404, {
                    error: 'Remote route unavailable'
                })
            }

            const body =
                method === 'GET' || method === 'HEAD'
                    ? undefined
                    : await requestBody(request)
            const upstreamUrl = new URL(url.pathname + url.search, target)
            const upstream = await fetch(upstreamUrl, {
                method,
                headers: proxyHeaders(request),
                body,
                redirect: 'manual',
                signal: AbortSignal.timeout(30_000)
            })
            writeUpstreamHeaders(response, upstream)
            audit(request, pathname, upstream.status)
            if (!upstream.body) {
                response.end()
                return
            }
            Readable.fromWeb(upstream.body as never).pipe(response)
        } catch (error) {
            const status =
                typeof error === 'object' &&
                error !== null &&
                'statusCode' in error &&
                Number.isInteger(Number(error.statusCode))
                    ? Number(error.statusCode)
                    : 502
            audit(request, pathname, status)
            json(response, status, {
                error:
                    status === 413
                        ? 'Remote request body is too large'
                        : 'Remote gateway request failed'
            })
        }
    })

    server.maxHeadersCount = 50
    server.headersTimeout = 10_000
    server.requestTimeout = 30_000
    server.keepAliveTimeout = 5_000

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(options.port, options.host, () => {
            server.off('error', reject)
            resolve()
        })
    })
    const address = server.address()
    const port =
        typeof address === 'object' && address ? address.port : options.port

    return {
        server,
        host: options.host,
        port,
        close: () => closeServer(server)
    }
}
