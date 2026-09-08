import { createHash, randomBytes, randomInt } from 'node:crypto'
import fs from 'node:fs'
import http, {
    type IncomingMessage,
    type Server,
    type ServerResponse
} from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { LibraryDatabase } from '../library/database'
import type { LibraryService } from '../library/service'
import type { LibraryScope, SortMode } from '../library/types'
import { PRODUCT_VERSION } from '../version'
import { LibraryQueryService } from '../services/library-query-service'
import { ReaderService } from '../services/reader-service'

interface PersistedDevice {
    tokenHash: string
    deviceName: string
    pairedAt: string
    lastSeenAt: string
}

interface PersistedState {
    version: 1
    devices: PersistedDevice[]
}

export interface MobileBridgeStatus {
    enabled: true
    port: number
    addresses: string[]
    pairingCode: string
    pairingExpiresAt: string
    pairedDevices: Array<{
        deviceName: string
        pairedAt: string
        lastSeenAt: string
    }>
}

export interface MobileBridgeController {
    readonly server: Server
    status: () => MobileBridgeStatus
    close: () => Promise<void>
}

function json(response: ServerResponse, status: number, value: unknown) {
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
    })
    response.end(JSON.stringify(value))
}

async function body(request: IncomingMessage, limit = 64 * 1024) {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
        const buffer = Buffer.from(chunk)
        size += buffer.byteLength
        if (size > limit) throw new Error('Request body is too large')
        chunks.push(buffer)
    }
    if (!chunks.length) return {}
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
        string,
        unknown
    >
}

function tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex')
}

function privateIpv4Addresses(host: string, port: number) {
    if (host === '127.0.0.1' || host === 'localhost')
        return [`http://127.0.0.1:${port}`]

    const values: Array<{
        name: string
        address: string
        priority: number
    }> = []
    for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
        for (const item of addresses ?? []) {
            if (item.internal || item.family !== 'IPv4') continue
            const address = item.address
            const priority = /^192\.168\./.test(address)
                ? 0
                : /^10\./.test(address)
                  ? 1
                  : /^172\.(1[6-9]|2\d|3[01])\./.test(address)
                    ? 2
                    : /^100\./.test(address)
                      ? 3
                      : 4
            values.push({ name, address, priority })
        }
    }
    values.sort(
        (a, b) => a.priority - b.priority || a.name.localeCompare(b.name)
    )
    return [
        ...new Set(values.map((item) => `http://${item.address}:${port}`))
    ]
}

function boundedInt(
    value: string | null,
    fallback: number,
    min: number,
    max: number
) {
    const parsed = Number(value ?? fallback)
    if (!Number.isFinite(parsed)) return fallback
    return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function normalizeScope(value: string | null): LibraryScope {
    if (
        value === 'favorites' ||
        value === 'downloaded' ||
        value === 'library' ||
        value === 'catalog' ||
        value === 'all'
    )
        return value
    return 'favorites'
}

function normalizeSort(value: string | null): SortMode {
    if (
        value === 'latest' ||
        value === 'oldest' ||
        value === 'title' ||
        value === 'likes' ||
        value === 'views'
    )
        return value
    return 'latest'
}

function readState(file: string | undefined) {
    if (!file) return [] as PersistedDevice[]
    try {
        const parsed = JSON.parse(
            fs.readFileSync(file, 'utf8')
        ) as PersistedState
        if (parsed.version !== 1 || !Array.isArray(parsed.devices)) return []
        return parsed.devices.filter(
            (item) =>
                typeof item.tokenHash === 'string' &&
                /^[0-9a-f]{64}$/.test(item.tokenHash) &&
                typeof item.deviceName === 'string'
        )
    } catch {
        return []
    }
}

function writeState(file: string | undefined, devices: PersistedDevice[]) {
    if (!file) return
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    fs.writeFileSync(
        temporary,
        JSON.stringify({ version: 1, devices } satisfies PersistedState),
        { encoding: 'utf8', mode: 0o600 }
    )
    fs.renameSync(temporary, file)
}

export async function startMobileBridge(options: {
    database: LibraryDatabase
    service: LibraryService
    host?: string
    port?: number
    stateFile?: string
}) {
    const host = options.host ?? '0.0.0.0'
    const requestedPort = options.port ?? 7788
    const library = new LibraryQueryService(options.database)
    const reader = new ReaderService(options.database, options.service.dataDir)
    const devices = new Map<string, PersistedDevice>()
    for (const device of readState(options.stateFile))
        devices.set(device.tokenHash, device)
    const pairAttempts = new Map<string, { startedAt: number; count: number }>()
    let pairingCode = ''
    let pairingExpiresAt = 0
    let actualPort = requestedPort

    const rotatePairingCode = () => {
        pairingCode = String(randomInt(0, 1_000_000)).padStart(6, '0')
        pairingExpiresAt = Date.now() + 15 * 60 * 1000
    }
    const ensurePairingCode = () => {
        if (!pairingCode || Date.now() >= pairingExpiresAt) rotatePairingCode()
    }
    rotatePairingCode()

    const persist = () => writeState(options.stateFile, [...devices.values()])

    const authenticate = (request: IncomingMessage) => {
        const header = String(request.headers.authorization ?? '')
        const token = header.match(/^Bearer\s+(.+)$/i)?.[1]
        if (!token) return null
        const hash = tokenHash(token)
        const device = devices.get(hash)
        if (!device) return null
        device.lastSeenAt = new Date().toISOString()
        devices.set(hash, device)
        return device
    }

    const server = http.createServer(async (request, response) => {
        const url = new URL(
            request.url ?? '/',
            `http://${request.headers.host ?? `127.0.0.1:${actualPort}`}`
        )
        try {
            if (
                url.pathname === '/mobile/v1/status' &&
                request.method === 'GET'
            ) {
                return json(response, 200, {
                    application: 'Pica Library Desktop',
                    version: PRODUCT_VERSION,
                    protocolVersion: 1,
                    pairingRequired: true
                })
            }

            if (
                url.pathname === '/mobile/v1/pair' &&
                request.method === 'POST'
            ) {
                ensurePairingCode()
                const remote = request.socket.remoteAddress ?? 'unknown'
                const current = pairAttempts.get(remote)
                const now = Date.now()
                const bucket =
                    !current || now - current.startedAt > 60_000
                        ? { startedAt: now, count: 0 }
                        : current
                bucket.count += 1
                pairAttempts.set(remote, bucket)
                if (bucket.count > 10)
                    return json(response, 429, {
                        error: 'Too many pairing attempts. Wait one minute.'
                    })

                const input = await body(request)
                if (String(input.code ?? '') !== pairingCode)
                    return json(response, 403, {
                        error: '配对码无效或已过期'
                    })

                const token = randomBytes(32).toString('base64url')
                const nowIso = new Date().toISOString()
                const device: PersistedDevice = {
                    tokenHash: tokenHash(token),
                    deviceName: String(
                        input.deviceName ?? 'Android device'
                    ).slice(0, 120),
                    pairedAt: nowIso,
                    lastSeenAt: nowIso
                }
                devices.set(device.tokenHash, device)
                persist()
                rotatePairingCode()
                return json(response, 200, {
                    token,
                    serverName: os.hostname(),
                    protocolVersion: 1
                })
            }

            const device = authenticate(request)
            if (!device)
                return json(response, 401, {
                    error: 'Mobile device is not paired'
                })

            if (
                url.pathname === '/mobile/v1/library' &&
                request.method === 'GET'
            ) {
                const scope = normalizeScope(url.searchParams.get('scope'))
                const limit = boundedInt(
                    url.searchParams.get('limit'),
                    120,
                    1,
                    500
                )
                const offset = boundedInt(
                    url.searchParams.get('offset'),
                    0,
                    0,
                    5000
                )
                const text = url.searchParams.get('text')?.trim() || undefined
                const sort = normalizeSort(url.searchParams.get('sort'))
                const result = library.query({ scope, limit, offset, text, sort })
                return json(response, 200, {
                    ...result,
                    items: result.items.map((comic) => ({
                        ...comic,
                        coverPath: `/mobile/v1/covers/${encodeURIComponent(
                            comic.comicId
                        )}`
                    }))
                })
            }

            if (
                url.pathname === '/mobile/v1/reader/recent' &&
                request.method === 'GET'
            ) {
                const limit = boundedInt(
                    url.searchParams.get('limit'),
                    20,
                    1,
                    100
                )
                const seen = new Set<string>()
                const items = []
                for (const progress of reader.recentProgress()) {
                    if (seen.has(progress.comicId)) continue
                    seen.add(progress.comicId)
                    const comic = options.database.getComic(progress.comicId)
                    if (!comic) continue
                    const episode = reader
                        .chapters(progress.comicId)
                        .find((item) => item.id === progress.episodeId)
                    items.push({
                        ...progress,
                        title: comic.title,
                        author: comic.author,
                        downloadedPictures: comic.downloadedPictures,
                        episodeTitle: episode?.title ?? '章节',
                        episodeOrder: episode?.order ?? 0,
                        coverPath: `/mobile/v1/covers/${encodeURIComponent(
                            progress.comicId
                        )}`
                    })
                    if (items.length >= limit) break
                }
                return json(response, 200, { items })
            }

            const coverRoute = url.pathname.match(
                /^\/mobile\/v1\/covers\/([^/]+)$/
            )
            if (coverRoute && request.method === 'GET') {
                const comicId = decodeURIComponent(coverRoute[1])
                let cover
                try {
                    cover = await options.service.downloadedCover(comicId)
                } catch {
                    cover = await options.service.cover(comicId)
                }
                response.writeHead(200, {
                    'content-type': cover.contentType,
                    'content-length': String(cover.data.byteLength),
                    'cache-control': 'private, max-age=86400',
                    'x-content-type-options': 'nosniff'
                })
                response.end(cover.data)
                return
            }

            const chaptersRoute = url.pathname.match(
                /^\/mobile\/v1\/comics\/([^/]+)\/chapters$/
            )
            if (chaptersRoute && request.method === 'GET')
                return json(
                    response,
                    200,
                    reader.chapters(decodeURIComponent(chaptersRoute[1]))
                )

            const chapterRoute = url.pathname.match(
                /^\/mobile\/v1\/comics\/([^/]+)\/chapters\/([^/]+)$/
            )
            if (chapterRoute && request.method === 'GET') {
                const value = reader.chapter(
                    decodeURIComponent(chapterRoute[1]),
                    decodeURIComponent(chapterRoute[2])
                )
                return json(response, 200, {
                    ...value,
                    pages: value.pages.map((page) => ({
                        ...page,
                        url: `/mobile/v1/reader/pictures/${encodeURIComponent(
                            page.id
                        )}`
                    }))
                })
            }

            const pictureRoute = url.pathname.match(
                /^\/mobile\/v1\/reader\/pictures\/([^/]+)$/
            )
            if (pictureRoute && request.method === 'GET') {
                const image = reader.picture(
                    decodeURIComponent(pictureRoute[1])
                )
                response.writeHead(200, {
                    'content-type': image.contentType,
                    'content-length': String(image.data.byteLength),
                    'cache-control': 'private, max-age=3600',
                    'x-content-type-options': 'nosniff'
                })
                response.end(image.data)
                return
            }

            if (
                url.pathname === '/mobile/v1/reader/progress' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    reader.saveProgress(
                        String(input.comicId ?? ''),
                        String(input.episodeId ?? ''),
                        Number(input.pageIndex ?? 0)
                    )
                )
            }

            if (
                url.pathname === '/mobile/v1/atlas' &&
                request.method === 'GET'
            ) {
                const snapshot = options.service.tasteChronicle()
                return json(response, snapshot ? 200 : 404, {
                    available: Boolean(snapshot),
                    snapshot
                })
            }

            if (
                url.pathname === '/mobile/v1/recommendations' &&
                request.method === 'GET'
            ) {
                const limit = boundedInt(
                    url.searchParams.get('limit'),
                    18,
                    1,
                    60
                )
                return json(
                    response,
                    200,
                    await options.service.recommendations({ limit })
                )
            }

            if (
                url.pathname === '/mobile/v1/device' &&
                request.method === 'GET'
            )
                return json(response, 200, {
                    deviceName: device.deviceName,
                    pairedAt: device.pairedAt,
                    lastSeenAt: device.lastSeenAt
                })

            return json(response, 404, { error: 'Not found' })
        } catch (error) {
            return json(response, 500, {
                error: error instanceof Error ? error.message : String(error)
            })
        }
    })

    await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
            server.off('listening', onListening)
            reject(error)
        }
        const onListening = () => {
            server.off('error', onError)
            const address = server.address()
            if (address && typeof address !== 'string') actualPort = address.port
            resolve()
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(requestedPort, host)
    })

    const status = (): MobileBridgeStatus => {
        ensurePairingCode()
        return {
            enabled: true,
            port: actualPort,
            addresses: privateIpv4Addresses(host, actualPort),
            pairingCode,
            pairingExpiresAt: new Date(pairingExpiresAt).toISOString(),
            pairedDevices: [...devices.values()].map((device) => ({
                deviceName: device.deviceName,
                pairedAt: device.pairedAt,
                lastSeenAt: device.lastSeenAt
            }))
        }
    }

    return {
        server,
        status,
        close: async () => {
            persist()
            server.closeIdleConnections()
            await new Promise<void>((resolve) => {
                let settled = false
                const finish = () => {
                    if (settled) return
                    settled = true
                    resolve()
                }
                server.close(finish)
                setTimeout(() => {
                    server.closeAllConnections()
                    finish()
                }, 1_000).unref()
            })
        }
    } satisfies MobileBridgeController
}
