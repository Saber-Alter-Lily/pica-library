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
import type { FavoriteRecord, LibraryScope, SortMode } from '../library/types'
import { PRODUCT_VERSION } from '../version'
import { desktopPaths } from '../desktop/paths'
import { LibraryQueryService } from '../services/library-query-service'
import { ReaderService } from '../services/reader-service'
import { CycleCoordinatorV3 } from '../recommendation-v3/cycle-coordinator-v3'
import { FINAL_PROFILE_VERSION } from '../recommendation-v3/final-profile'
import { RANKER_ADAPTER_VERSION } from '../recommendation-v3/ranker-adapter-v3'
import { RETRIEVER_VERSION } from '../recommendation-v3/retriever-v3'
import { BATCH_ALLOCATOR_VERSION } from '../recommendation-v3/batch-allocator-v3'
import { ShelfService } from '../services/shelf-service'
import { PersonalizationService } from '../services/personalization-service'

interface PersistedDevice {
    tokenHash: string
    /** Stable app-local Android identity. Legacy rows may omit it. */
    deviceId?: string
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
    rotatePairingCode: () => MobileBridgeStatus
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

function stringArray(value: unknown) {
    return Array.isArray(value)
        ? value.map((item) => String(item)).filter(Boolean)
        : []
}

function picaSort(value: unknown, fallback = 'ld') {
    const sort = String(value ?? '').trim()
    return ['ua', 'dd', 'da', 'ld', 'vd'].includes(sort)
        ? sort
        : fallback
}

function safePathSegment(value: string) {
    try {
        return decodeURIComponent(value)
    } catch {
        return ''
    }
}


function mobileFavoriteRecords(value: unknown): FavoriteRecord[] {
    if (!Array.isArray(value)) return []
    return value.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const row = item as Record<string, unknown>
        const comicId = String(row.comicId ?? '').trim()
        if (!comicId) return []
        return [
            {
                comicId,
                title: String(row.title ?? '未命名漫画'),
                author: String(row.author ?? '未知作者'),
                categories: stringArray(row.categories),
                tags: stringArray(row.tags),
                finished: Boolean(row.finished),
                updatedAt: String(row.updatedAt ?? '') || undefined,
                pagesCount: Number(row.knownPictures ?? 0) || undefined,
                coverUrl: String(row.coverUrl ?? '') || undefined
            }
        ]
    })
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
    accountStatus?: () => Record<string, unknown>
}) {
    const host = options.host ?? '0.0.0.0'
    const requestedPort = options.port ?? 7788
    const library = new LibraryQueryService(options.database)
    const reader = new ReaderService(options.database, options.service.dataDir)
    const finalRecommendationCoordinator = new CycleCoordinatorV3(
        options.database,
        (cycleId) => options.service.buildFinalRecommendationCycleV3(cycleId),
        {
            profileVersion: FINAL_PROFILE_VERSION,
            registryVersion: 'PICA Registry V3',
            rankerModelVersion: RANKER_ADAPTER_VERSION,
            candidatePoolVersion: RETRIEVER_VERSION,
            allocatorVersion: BATCH_ALLOCATOR_VERSION
        }
    )
    const shelves = new ShelfService(options.database, library)
    const personalization = new PersonalizationService(
        path.join(desktopPaths().runtimeState, 'personalization')
    )
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
                const deviceName = String(
                    input.deviceName ?? 'Android device'
                ).slice(0, 120)
                const deviceId = String(input.deviceId ?? '')
                    .trim()
                    .slice(0, 160)
                let pairedAt = nowIso
                if (deviceId) {
                    for (const [hash, existing] of devices) {
                        const sameStableDevice =
                            existing.deviceId === deviceId
                        const sameLegacyName =
                            !existing.deviceId &&
                            existing.deviceName === deviceName
                        if (!sameStableDevice && !sameLegacyName) continue
                        if (existing.pairedAt < pairedAt)
                            pairedAt = existing.pairedAt
                        devices.delete(hash)
                    }
                }
                const device: PersistedDevice = {
                    tokenHash: tokenHash(token),
                    ...(deviceId ? { deviceId } : {}),
                    deviceName,
                    pairedAt,
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
                url.pathname === '/mobile/v1/accounts/status' &&
                request.method === 'GET'
            )
                return json(response, 200, {
                    authority: 'desktop',
                    transport: 'paired-mobile-bridge',
                    ...(options.accountStatus?.() ?? {
                        pica: { configured: false },
                        eh: { configured: false }
                    })
                })

            // Paired-provider relay: Android can use Desktop's authenticated
            // Pica session without copying a password, provider token, or cookie
            // to the phone. Every route stays behind the existing Mobile Bridge
            // bearer authentication above.
            if (
                url.pathname === '/mobile/v1/provider/pica/search' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const pica = await options.service.connect()
                const page = Math.max(
                    1,
                    Math.min(1000, Math.floor(Number(input.page) || 1))
                )
                const keyword = String(input.keyword ?? '').trim().slice(0, 500)
                const categories = stringArray(input.categories).slice(0, 20)
                const comics = await pica.search(
                    keyword,
                    page,
                    picaSort(input.sort, pica.Order.loved),
                    categories
                )
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    comics
                })
            }

            if (
                url.pathname === '/mobile/v1/provider/pica/browse' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const pica = await options.service.connect()
                const page = Math.max(
                    1,
                    Math.min(1000, Math.floor(Number(input.page) || 1))
                )
                const comics = await pica.comicsPage(
                    String(input.category ?? '').trim().slice(0, 200),
                    String(input.tag ?? '').trim().slice(0, 200),
                    picaSort(input.sort, pica.Order.loved),
                    page
                )
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    comics
                })
            }

            if (
                url.pathname === '/mobile/v1/provider/pica/favorites' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const pica = await options.service.connect()
                const page = Math.max(
                    1,
                    Math.min(1000, Math.floor(Number(input.page) || 1))
                )
                const comics = await pica.favorites(
                    page,
                    picaSort(input.sort, pica.Order.latest)
                )
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    comics
                })
            }

            if (
                url.pathname === '/mobile/v1/provider/pica/leaderboard' &&
                request.method === 'GET'
            ) {
                const pica = await options.service.connect()
                const requested = String(url.searchParams.get('tt') ?? 'H24')
                const range = ['H24', 'D7', 'D30'].includes(requested)
                    ? requested
                    : 'H24'
                const result = await pica.request<unknown>(
                    'get',
                    `comics/leaderboard?tt=${range}&ct=VC`
                )
                const comics =
                    result &&
                    typeof result === 'object' &&
                    Array.isArray(
                        (result as { comics?: unknown }).comics
                    )
                        ? (result as { comics: unknown[] }).comics
                        : []
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    comics
                })
            }

            if (
                url.pathname === '/mobile/v1/provider/pica/categories' &&
                request.method === 'GET'
            ) {
                const pica = await options.service.connect()
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    ...(await pica.categories())
                })
            }

            const picaComicRoute = url.pathname.match(
                /^\/mobile\/v1\/provider\/pica\/comic\/([^/]+)$/
            )
            if (picaComicRoute && request.method === 'GET') {
                const comicId = safePathSegment(picaComicRoute[1]).trim()
                if (!comicId)
                    return json(response, 400, {
                        error: 'Pica comic id is required'
                    })
                const pica = await options.service.connect()
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    comic: await pica.comicInfo(comicId)
                })
            }

            const picaEpisodesRoute = url.pathname.match(
                /^\/mobile\/v1\/provider\/pica\/episodes\/([^/]+)$/
            )
            if (picaEpisodesRoute && request.method === 'GET') {
                const comicId = safePathSegment(picaEpisodesRoute[1]).trim()
                if (!comicId)
                    return json(response, 400, {
                        error: 'Pica comic id is required'
                    })
                const pica = await options.service.connect()
                const episodes = await pica.episodesAll(comicId)
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    episodes: episodes.map((episode) => ({
                        id: episode.id || episode._id || '',
                        title: episode.title,
                        order: episode.order
                    }))
                })
            }

            const picaPagesRoute = url.pathname.match(
                /^\/mobile\/v1\/provider\/pica\/pages\/([^/]+)\/(\d+)$/
            )
            if (picaPagesRoute && request.method === 'GET') {
                const comicId = safePathSegment(picaPagesRoute[1]).trim()
                const order = Number(picaPagesRoute[2])
                if (!comicId || !Number.isSafeInteger(order) || order < 1)
                    return json(response, 400, {
                        error: 'Valid Pica comic id and episode order are required'
                    })
                const pica = await options.service.connect()
                const episodes = await pica.episodesAll(comicId)
                const episode = episodes.find((item) => item.order === order)
                if (!episode)
                    return json(response, 404, {
                        error: 'Pica episode was not found'
                    })
                const pages = await pica.picturesAll(comicId, episode)
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    pages: pages.map((page, index) => ({
                        id: page.id || `p${index}`,
                        url: page.url,
                        name: page.name,
                        position: index
                    }))
                })
            }

            const picaRelatedRoute = url.pathname.match(
                /^\/mobile\/v1\/provider\/pica\/related\/([^/]+)$/
            )
            if (picaRelatedRoute && request.method === 'GET') {
                const comicId = safePathSegment(picaRelatedRoute[1]).trim()
                if (!comicId)
                    return json(response, 400, {
                        error: 'Pica comic id is required'
                    })
                const pica = await options.service.connect()
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    comics: await pica.related(comicId)
                })
            }

            if (
                url.pathname === '/mobile/v1/provider/pica/favorite' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const comicId = String(input.comicId ?? '').trim()
                if (!comicId)
                    return json(response, 400, {
                        error: 'Pica comic id is required'
                    })
                const desired = input.desired === true
                const provider = options.service.providerService()
                // Ensure the Desktop catalog contains the target before
                // ProviderService updates favorite membership. The relay may
                // act on a comic first discovered only on Android.
                await provider.getComicDetails(comicId)
                const result = await provider.setFavorite(comicId, desired)
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    ...result
                })
            }

            if (
                url.pathname === '/mobile/v1/provider/eh/search' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const surface = input.surface === 'exh' ? 'exh' : 'eh'
                const requestedMode = String(input.ehMode ?? 'latest')
                const ehMode = [
                    'latest',
                    'popular',
                    'favorites',
                    'watched',
                    'toplist'
                ].includes(requestedMode)
                    ? requestedMode
                    : 'latest'
                const comics = await options.service.mobileEhRelaySearch({
                    keyword: String(input.keyword ?? '').trim().slice(0, 500),
                    tags: stringArray(input.tags).slice(0, 30),
                    categories: stringArray(input.categories).slice(0, 20),
                    limit: boundedInt(
                        String(input.limit ?? ''),
                        50,
                        1,
                        100
                    ),
                    surface,
                    ehMode: ehMode as
                        | 'latest'
                        | 'popular'
                        | 'favorites'
                        | 'watched'
                        | 'toplist',
                    ehToplist: String(input.ehToplist ?? '11').slice(0, 8),
                    ehLanguage: String(input.ehLanguage ?? '').trim().slice(0, 80),
                    ehExcludeTags: stringArray(input.ehExcludeTags).slice(0, 30),
                    ehMinRating: Number(input.ehMinRating ?? 0),
                    ehPageFrom: Number(input.ehPageFrom ?? 0),
                    ehPageTo: Number(input.ehPageTo ?? 0)
                })
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    surface,
                    comics
                })
            }

            if (
                url.pathname === '/mobile/v1/provider/eh/exh-capability' &&
                request.method === 'GET'
            )
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    capability:
                        await options.service.mobileEhRelayProbeExH()
                })

            const ehComicRoute = url.pathname.match(
                /^\/mobile\/v1\/provider\/eh\/comic\/([^/]+)$/
            )
            if (ehComicRoute && request.method === 'GET') {
                const comicId = safePathSegment(ehComicRoute[1]).trim()
                const surface =
                    url.searchParams.get('surface') === 'exh' ? 'exh' : 'eh'
                if (!comicId)
                    return json(response, 400, {
                        error: 'E-H comic id is required'
                    })
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    surface,
                    comic:
                        await options.service.mobileEhRelayDetails(
                            comicId,
                            surface
                        )
                })
            }

            const ehEpisodesRoute = url.pathname.match(
                /^\/mobile\/v1\/provider\/eh\/episodes\/([^/]+)$/
            )
            if (ehEpisodesRoute && request.method === 'GET') {
                const comicId = safePathSegment(ehEpisodesRoute[1]).trim()
                const surface =
                    url.searchParams.get('surface') === 'exh' ? 'exh' : 'eh'
                if (!comicId)
                    return json(response, 400, {
                        error: 'E-H comic id is required'
                    })
                const episodes =
                    await options.service.mobileEhRelayEpisodes(
                        comicId,
                        surface
                    )
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    surface,
                    episodes: episodes.map((episode) => ({
                        id: episode.id || episode._id || '',
                        title: episode.title,
                        order: episode.order
                    }))
                })
            }

            const ehPagesRoute = url.pathname.match(
                /^\/mobile\/v1\/provider\/eh\/pages\/([^/]+)$/
            )
            if (ehPagesRoute && request.method === 'GET') {
                const comicId = safePathSegment(ehPagesRoute[1]).trim()
                const surface =
                    url.searchParams.get('surface') === 'exh' ? 'exh' : 'eh'
                if (!comicId)
                    return json(response, 400, {
                        error: 'E-H comic id is required'
                    })
                const episodes =
                    await options.service.mobileEhRelayEpisodes(
                        comicId,
                        surface
                    )
                const episode = episodes[0]
                if (!episode)
                    return json(response, 404, {
                        error: 'E-H episode was not found'
                    })
                const pages = await options.service.mobileEhRelayPages(
                    comicId,
                    episode,
                    surface
                )
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    surface,
                    pages: pages.map((page, index) => ({
                        id: page.id || `eh-page-${index + 1}`,
                        locator: page.url,
                        name: page.name,
                        position: index
                    }))
                })
            }

            if (
                url.pathname === '/mobile/v1/provider/eh/page-image' &&
                request.method === 'GET'
            ) {
                const locator = String(
                    url.searchParams.get('locator') ?? ''
                ).trim()
                if (
                    !locator.startsWith('eh-page:') ||
                    locator.length > 4096
                )
                    return json(response, 400, {
                        error: 'Valid E-H page locator is required'
                    })
                const image =
                    await options.service.mobileEhRelayFetchPage(locator)
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
                url.pathname === '/mobile/v1/provider/eh/favorite' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const comicId = String(input.comicId ?? '').trim()
                if (!comicId.startsWith('eh:'))
                    return json(response, 400, {
                        error: 'Valid E-H comic id is required'
                    })
                const result =
                    await options.service.mobileEhRelaySetFavorite(
                        comicId,
                        input.desired === true
                    )
                return json(response, 200, {
                    authority: 'desktop',
                    relay: true,
                    ...result
                })
            }

            if (
                url.pathname === '/mobile/v1/recommendation/v5/snapshot' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.service.recommendationV5Snapshot()
                )

            if (
                url.pathname === '/mobile/v1/recommendation/v5/sync' &&
                request.method === 'POST'
            ) {
                const input = await body(request, 512 * 1024)
                const merged = options.service.mergeMobileRecommendationV5(input)
                let recommendationRefresh: Record<string, unknown> = {
                    requested: false
                }
                if (input.recompute === true) {
                    try {
                        const deviceId = String(input.deviceId ?? 'android')
                        const mutationId = String(input.mutationId ?? Date.now())
                        finalRecommendationCoordinator.forceNew(
                            `mobile-pair:${deviceId}:${mutationId}`
                        )
                        await finalRecommendationCoordinator.waitForBuild()
                        recommendationRefresh = {
                            requested: true,
                            completed: true,
                            status: finalRecommendationCoordinator.status()
                        }
                    } catch (error) {
                        recommendationRefresh = {
                            requested: true,
                            completed: false,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error)
                        }
                    }
                }
                return json(response, 200, {
                    ...merged,
                    recommendationRefresh
                })
            }

            if (
                url.pathname === '/mobile/v1/recommendations/cache' &&
                request.method === 'GET'
            ) {
                const limit = boundedInt(
                    url.searchParams.get('limit'),
                    72,
                    1,
                    120
                )
                return json(
                    response,
                    200,
                    finalRecommendationCoordinator.portable(limit)
                )
            }

            if (
                url.pathname === '/mobile/v1/visual/status' &&
                request.method === 'GET'
            ) {
                return json(response, 200, options.service.visualIndexStatus())
            }

            if (
                url.pathname === '/mobile/v1/visual/settings' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                options.service.updateVisualSettings({
                    enabled: input.enabled,
                    rerankMode: input.rerankMode
                })
                return json(response, 200, options.service.visualIndexStatus())
            }

            if (url.pathname === '/mobile/v1/star-access' && request.method === 'GET') {
                const proof = personalization.starProof()
                return json(response, 200, proof ?? { unlocked: false, githubUser: '', verifiedAt: '' })
            }

            if (
                url.pathname === '/mobile/v1/supporter/entitlement' &&
                request.method === 'GET'
            ) {
                const entitlement = personalization.entitlementText()
                if (!entitlement)
                    return json(response, 404, { error: 'No supporter entitlement' })
                response.writeHead(200, {
                    'content-type': 'application/json; charset=utf-8',
                    'content-length': String(Buffer.byteLength(entitlement)),
                    'cache-control': 'no-store',
                    'x-content-type-options': 'nosniff'
                })
                response.end(entitlement)
                return
            }

            if (url.pathname === '/mobile/v1/themes' && request.method === 'GET') {
                if (!personalization.starProof())
                    return json(response, 403, { error: 'GitHub Star authentication required' })
                return json(response, 200, {
                    ...personalization.status(),
                    packs: personalization.listThemePacks()
                })
            }

            const themeRoute = url.pathname.match(/^\/mobile\/v1\/themes\/([^/]+)$/)
            if (themeRoute && request.method === 'GET') {
                if (!personalization.starProof())
                    return json(response, 403, { error: 'GitHub Star authentication required' })
                const pack = personalization.themePack(
                    decodeURIComponent(themeRoute[1])
                )
                response.writeHead(200, {
                    'content-type': 'application/zip',
                    'content-length': String(pack.byteLength),
                    'cache-control': 'no-store',
                    'x-content-type-options': 'nosniff'
                })
                response.end(pack)
                return
            }

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
                url.pathname === '/mobile/v1/shelves' &&
                request.method === 'GET'
            ) {
                const values = shelves.list()
                return json(response, 200, {
                    updatedAt: new Date().toISOString(),
                    shelves: values.map((shelf) => ({
                        ...shelf,
                        desktopId: shelf.id,
                        items: shelves.contents(shelf.id).map((comic) => ({
                            comicId: comic.comicId,
                            title: comic.title,
                            author: comic.author,
                            canonicalAuthor: comic.canonicalAuthor ?? '',
                            tags: comic.tags,
                            categories: comic.categories,
                            finished: comic.finished,
                            downloadedPictures: comic.downloadedPictures,
                            knownPictures: comic.knownPictures,
                            updatedAt: comic.lastSeenAt,
                            deletedAt: ''
                        }))
                    }))
                })
            }

            if (
                url.pathname === '/mobile/v1/shelves/mutate' &&
                request.method === 'POST'
            ) {
                const input = await body(request, 512 * 1024)
                const action = String(input.action ?? '')
                const id = String(input.id ?? '')
                const name = String(input.name ?? '')
                const comicIds = stringArray(input.comicIds)
                const records = mobileFavoriteRecords(input.records)
                if (action === 'create')
                    return json(response, 200, shelves.create(name))
                if (action === 'rename')
                    return json(response, 200, shelves.rename(id, name))
                if (action === 'delete')
                    return json(response, 200, shelves.delete(id))
                if (action === 'add')
                    return json(response, 200, shelves.add(id, comicIds, records))
                if (action === 'remove')
                    return json(response, 200, shelves.remove(id, comicIds))
                return json(response, 400, { error: 'Unknown shelf mutation' })
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
                // The desktop web UI already owns the authoritative Final V3
                // cycle/batch. Mobile must read that persisted batch instead of
                // starting the expensive provider recall pipeline again.
                const current = finalRecommendationCoordinator.current()
                const recommendations = current.recommendations.slice(0, limit)
                return json(response, 200, {
                    ...current,
                    recommendations,
                    source: 'final-v3-current',
                    cached: true
                })
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
            pairedDevices: (() => {
                const visible = new Map<string, PersistedDevice>()
                for (const device of devices.values()) {
                    const key = device.deviceId
                        ? `id:${device.deviceId}`
                        : `legacy-name:${device.deviceName}`
                    const current = visible.get(key)
                    if (
                        !current ||
                        current.lastSeenAt < device.lastSeenAt
                    )
                        visible.set(key, device)
                }
                return [...visible.values()]
                    .sort((a, b) =>
                        b.lastSeenAt.localeCompare(a.lastSeenAt)
                    )
                    .map((device) => ({
                        deviceName: device.deviceName,
                        pairedAt: device.pairedAt,
                        lastSeenAt: device.lastSeenAt
                    }))
            })()
        }
    }

    return {
        server,
        status,
        rotatePairingCode: () => { rotatePairingCode(); return status() },
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
