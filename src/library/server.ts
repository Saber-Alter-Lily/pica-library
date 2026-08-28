import fs from 'node:fs'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FavoriteRecord, LibraryFacetQuery, SortMode } from './types'
import { LibraryDatabase } from './database'
import { LibraryService } from './service'
import { organizeLibraryViews } from './organizer'
import { queueRepairs, scanRepairIssues } from '../maintenance/repair'
import { queueUpdate } from '../maintenance/updates'
import type { DownloadSource } from '../core/downloads/types'
import { PRODUCT_VERSION } from '../version'
import { appCapabilities } from '../app-capabilities'
import { ProviderService } from '../services/provider-service'
import { LibraryQueryService } from '../services/library-query-service'
import { ShelfService } from '../services/shelf-service'
import { RecommendationService } from '../services/recommendation-service'
import { AdaptiveRecommendationSession } from '../recommendation-v3/adaptive-session'
import { PreviewCacheManager } from '../services/preview-cache-manager'
import { PreviewService } from '../services/preview-service'
import { ReaderService } from '../services/reader-service'
import type { UserEventInput, V3EventType } from '../recommendation-v3/types'

export interface DesktopServerController {
    csrfToken: string
    configured: () => boolean
    status: () => Record<string, unknown>
    save: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
    testConnection: (
        input: Record<string, unknown>
    ) => Promise<Record<string, unknown>>
    detectProxy?: (
        input: Record<string, unknown>
    ) => Promise<Record<string, unknown>>
    chooseFolder: () => Promise<string | null>
    exportBrowserLitePackage: () => Promise<Record<string, unknown>>
    syncAndExportBrowserLitePackage?: () => Promise<Record<string, unknown>>
    openBrowserLite?: () => Promise<void>
    openDirectory: (kind: string) => Promise<void>
    checkForUpdate?: () => Promise<Record<string, unknown>>
    stageUpdate?: (
        name: string,
        value: Buffer
    ) => Promise<Record<string, unknown>>
    applyUpdate?: (id: string) => Promise<Record<string, unknown>>
    updateProgress?: () => unknown
    shutdown: () => void
}

function json(response: ServerResponse, status: number, value: unknown) {
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
    })
    response.end(JSON.stringify(value))
}

async function body(request: IncomingMessage) {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
        const buffer = Buffer.from(chunk)
        size += buffer.byteLength
        if (size > 10 * 1024 * 1024)
            throw new Error('Request body is too large')
        chunks.push(buffer)
    }
    if (chunks.length === 0) return {}
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
        string,
        unknown
    >
}

async function binaryBody(request: IncomingMessage, limit = 128 * 1024 * 1024) {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
        const buffer = Buffer.from(chunk)
        size += buffer.byteLength
        if (size > limit) throw new Error('Update package is too large')
        chunks.push(buffer)
    }
    return Buffer.concat(chunks)
}

function webRoot() {
    const candidates = [
        path.resolve(process.cwd(), 'web'),
        fileURLToPath(new URL('../web', import.meta.url)),
        fileURLToPath(new URL('../../web', import.meta.url))
    ]
    const found = candidates.find((candidate) =>
        fs.existsSync(path.join(candidate, 'index.html'))
    )
    if (!found) throw new Error('Web assets were not found')
    return found
}

const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
}

function serveAsset(response: ServerResponse, root: string, pathname: string) {
    const requested = pathname === '/' ? 'index.html' : pathname.slice(1)
    const file = path.resolve(root, requested)
    const relative = path.relative(path.resolve(root), file)
    if (
        relative.startsWith('..') ||
        path.isAbsolute(relative) ||
        !fs.existsSync(file)
    ) {
        response.writeHead(404)
        response.end('Not found')
        return
    }
    response.writeHead(200, {
        'content-type':
            mimeTypes[path.extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-cache'
    })
    fs.createReadStream(file).pipe(response)
}

function stringList(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String).filter(Boolean)
    return String(value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
}

function performanceOverrides(input: Record<string, unknown>) {
    const result: Record<string, number> = {}
    for (const key of [
        'jobConcurrency',
        'globalMediaConcurrency',
        'requestIntervalMs',
        'maxRetries'
    ]) {
        if (input[key] !== undefined) result[key] = Number(input[key])
    }
    return result
}

export async function startLibraryServer(options: {
    database: LibraryDatabase
    service: LibraryService
    host?: string
    port?: number
    desktop?: DesktopServerController
    cacheDir?: string
}) {
    const root = webRoot()
    const host = options.host ?? '127.0.0.1'
    const port = options.port ?? 4789
    const providerService = new ProviderService(
        () => options.service.connect(),
        options.database
    )
    const libraryQueries = new LibraryQueryService(options.database)
    const shelfService = new ShelfService(options.database, libraryQueries)
    const recommendationService = new RecommendationService(
        options.database,
        (limit) => options.service.recommendations({ limit })
    )
    const adaptiveRecommendationService = new AdaptiveRecommendationSession(
        options.database,
        (limit, appSessionId) =>
            options.service.recommendations({ limit, appSessionId })
    )
    void recommendationService.ensureInitialPrepared().catch(() => {
        // Connected startup must remain available while provider preparation
        // waits for credentials/network. The status endpoint exposes preparing.
    })
    const previewCache = new PreviewCacheManager(
        path.join(options.cacheDir ?? options.service.dataDir, 'previews')
    )
    const previewService = new PreviewService(
        options.database,
        providerService,
        previewCache
    )
    const readerService = new ReaderService(
        options.database,
        options.service.dataDir
    )
    const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1'])
    if (
        !loopbackHosts.has(host) &&
        process.env.PICA_LIBRARY_ALLOW_REMOTE !== 'true'
    ) {
        throw new Error(
            'Remote binding is disabled. Use a loopback host or explicitly set PICA_LIBRARY_ALLOW_REMOTE=true.'
        )
    }
    const server = http.createServer(async (request, response) => {
        const url = new URL(request.url ?? '/', `http://${host}:${port}`)
        try {
            const requestHost = request.headers.host ?? ''
            if (
                !requestHost.startsWith(`${host}:`) &&
                !requestHost.startsWith('localhost:')
            ) {
                return json(response, 403, { error: 'Invalid local host' })
            }
            const origin = request.headers.origin
            const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(
                request.method ?? 'GET'
            )
            if (
                isMutation &&
                origin &&
                new URL(origin).host !== request.headers.host
            ) {
                return json(response, 403, {
                    error: 'Cross-origin writes are forbidden'
                })
            }
            const desktopMutation =
                options.desktop &&
                isMutation &&
                url.pathname.startsWith('/api/v1/desktop/')
            if (
                desktopMutation &&
                request.headers['x-pica-csrf'] !== options.desktop?.csrfToken
            ) {
                return json(response, 403, {
                    error: 'This local request could not be verified'
                })
            }
            if (
                url.pathname === '/api/v1/desktop/status' &&
                request.method === 'GET' &&
                options.desktop
            ) {
                return json(response, 200, {
                    application: 'Pica Library',
                    version: PRODUCT_VERSION,
                    configured: options.desktop.configured(),
                    csrfToken: options.desktop.csrfToken,
                    ...options.desktop.status()
                })
            }
            if (
                url.pathname === '/api/v1/capabilities' &&
                request.method === 'GET'
            ) {
                return json(
                    response,
                    200,
                    appCapabilities(
                        providerService.capabilities.favoriteMutation
                    )
                )
            }
            if (
                url.pathname === '/api/v1/recommendation-events' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const allowed = new Set<V3EventType>([
                    'search',
                    'search_result_open',
                    'recommend_batch_presented',
                    'recommend_impression',
                    'recommend_detail_open',
                    'preview_open',
                    'preview_more',
                    'shelf_add',
                    'shelf_remove',
                    'reader_open',
                    'reader_progress',
                    'reader_complete',
                    'recommendation_restart',
                    'recommendation_batch_advance'
                ])
                const eventType = String(input.eventType ?? '') as V3EventType
                if (!allowed.has(eventType))
                    return json(response, 400, {
                        error: 'Event type must be recorded by its authoritative server operation'
                    })
                return json(
                    response,
                    200,
                    options.service.recordRecommendationEvent({
                        eventType,
                        occurredAt: input.occurredAt
                            ? String(input.occurredAt)
                            : undefined,
                        comicId: input.comicId ? String(input.comicId) : null,
                        source: input.source ? String(input.source) : null,
                        appSessionId: input.appSessionId
                            ? String(input.appSessionId)
                            : null,
                        contextId: input.contextId
                            ? String(input.contextId)
                            : null,
                        recommendationCycleId: input.recommendationCycleId
                            ? String(input.recommendationCycleId)
                            : null,
                        recommendationSessionId: input.recommendationSessionId
                            ? String(input.recommendationSessionId)
                            : null,
                        recommendationBatchIndex:
                            input.recommendationBatchIndex === undefined
                                ? null
                                : Number(input.recommendationBatchIndex),
                        rankPosition:
                            input.rankPosition === undefined
                                ? null
                                : Number(input.rankPosition),
                        metadata:
                            typeof input.metadata === 'object' && input.metadata
                                ? (input.metadata as Record<string, unknown>)
                                : {},
                        dedupeKey: input.dedupeKey
                            ? String(input.dedupeKey)
                            : null
                    } satisfies UserEventInput)
                )
            }
            if (
                url.pathname === '/api/v1/update/check' &&
                request.method === 'GET' &&
                options.desktop?.checkForUpdate
            ) {
                return json(
                    response,
                    200,
                    await options.desktop.checkForUpdate()
                )
            }
            if (
                url.pathname === '/api/v1/update/progress' &&
                request.method === 'GET' &&
                options.desktop?.updateProgress
            ) {
                return json(response, 200, options.desktop.updateProgress())
            }
            if (
                url.pathname === '/api/v1/update/stage' &&
                request.method === 'POST'
            ) {
                if (!options.desktop?.stageUpdate)
                    throw new Error('Updates are unavailable in this mode')
                if (
                    request.headers['x-pica-csrf'] !== options.desktop.csrfToken
                )
                    return json(response, 403, {
                        error: 'This local request could not be verified'
                    })
                const filename = path.basename(
                    String(request.headers['x-update-filename'] ?? 'update.zip')
                )
                return json(
                    response,
                    200,
                    await options.desktop.stageUpdate(
                        filename,
                        await binaryBody(request)
                    )
                )
            }
            if (
                url.pathname === '/api/v1/update/apply' &&
                request.method === 'POST'
            ) {
                if (!options.desktop?.applyUpdate)
                    throw new Error('Updates are unavailable in this mode')
                if (
                    request.headers['x-pica-csrf'] !== options.desktop.csrfToken
                )
                    return json(response, 403, {
                        error: 'This local request could not be verified'
                    })
                const input = await body(request)
                return json(
                    response,
                    200,
                    await options.desktop.applyUpdate(String(input.id ?? ''))
                )
            }
            if (
                url.pathname === '/api/v1/desktop/settings' &&
                request.method === 'POST' &&
                options.desktop
            ) {
                return json(
                    response,
                    200,
                    await options.desktop.save(await body(request))
                )
            }
            if (
                url.pathname === '/api/v1/desktop/test-connection' &&
                request.method === 'POST' &&
                options.desktop
            ) {
                return json(
                    response,
                    200,
                    await options.desktop.testConnection(await body(request))
                )
            }
            if (
                url.pathname === '/api/v1/desktop/detect-proxy' &&
                request.method === 'POST'
            ) {
                if (!options.desktop?.detectProxy)
                    throw new Error('Proxy detection is unavailable')
                return json(
                    response,
                    200,
                    await options.desktop.detectProxy(await body(request))
                )
            }
            if (
                url.pathname === '/api/v1/desktop/choose-folder' &&
                request.method === 'POST' &&
                options.desktop
            ) {
                return json(response, 200, {
                    path: await options.desktop.chooseFolder()
                })
            }
            if (
                url.pathname === '/api/v1/desktop/export-browser-lite' &&
                request.method === 'POST' &&
                options.desktop
            ) {
                return json(
                    response,
                    200,
                    await options.desktop.exportBrowserLitePackage()
                )
            }
            if (
                url.pathname === '/api/v1/desktop/sync-export-browser-lite' &&
                request.method === 'POST'
            ) {
                if (!options.desktop?.syncAndExportBrowserLitePackage)
                    throw new Error('Sync and export is unavailable')
                return json(
                    response,
                    200,
                    await options.desktop.syncAndExportBrowserLitePackage()
                )
            }
            if (
                url.pathname === '/api/v1/desktop/open-browser-lite' &&
                request.method === 'POST'
            ) {
                if (!options.desktop?.openBrowserLite)
                    throw new Error('Browser Lite is unavailable')
                await options.desktop.openBrowserLite()
                return json(response, 200, { success: true })
            }
            if (
                url.pathname === '/api/v1/desktop/open-directory' &&
                request.method === 'POST' &&
                options.desktop
            ) {
                const input = await body(request)
                await options.desktop.openDirectory(String(input.kind ?? ''))
                return json(response, 200, { success: true })
            }
            if (
                url.pathname === '/api/v1/desktop/shutdown' &&
                request.method === 'POST' &&
                options.desktop
            ) {
                json(response, 200, { success: true })
                setTimeout(() => options.desktop?.shutdown(), 50)
                return
            }
            if (url.pathname === '/api/v1/status' && request.method === 'GET') {
                return json(response, 200, {
                    mode: 'connected',
                    version: PRODUCT_VERSION,
                    database: options.database.file,
                    summary: options.database.summary(),
                    reconciliation: options.database.reconcileLibraryCounts(),
                    favoritesSyncProgress:
                        options.service.favoritesSyncProgress()
                })
            }
            if (
                url.pathname === '/api/v1/sync/progress' &&
                request.method === 'GET'
            ) {
                return json(
                    response,
                    200,
                    options.service.favoritesSyncProgress()
                )
            }
            if (
                url.pathname === '/api/v1/downloaded' &&
                request.method === 'GET'
            ) {
                return json(
                    response,
                    200,
                    options.database.listDownloadedComics()
                )
            }
            if (
                url.pathname === '/api/v1/library/query' &&
                request.method === 'POST'
            ) {
                return json(
                    response,
                    200,
                    libraryQueries.query(
                        (await body(request)) as LibraryFacetQuery
                    )
                )
            }
            if (url.pathname === '/api/v1/shelves' && request.method === 'GET')
                return json(response, 200, shelfService.list())
            if (
                url.pathname === '/api/v1/shelves' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    shelfService.create(String(input.name ?? ''))
                )
            }
            const shelfRoute = url.pathname.match(
                /^\/api\/v1\/shelves\/([^/]+)$/
            )
            if (shelfRoute && request.method === 'GET') {
                const shelfId = decodeURIComponent(shelfRoute[1])
                return json(response, 200, {
                    shelf: shelfService
                        .list()
                        .find((item) => item.id === shelfId),
                    items: shelfService.contents(shelfId)
                })
            }
            if (shelfRoute && request.method === 'PATCH') {
                const input = await body(request)
                return json(
                    response,
                    200,
                    shelfService.rename(
                        decodeURIComponent(shelfRoute[1]),
                        String(input.name ?? '')
                    )
                )
            }
            if (shelfRoute && request.method === 'DELETE')
                return json(
                    response,
                    200,
                    shelfService.delete(decodeURIComponent(shelfRoute[1]))
                )
            const shelfItemsRoute = url.pathname.match(
                /^\/api\/v1\/shelves\/([^/]+)\/(items|remove|add-filtered)$/
            )
            if (shelfItemsRoute && request.method === 'POST') {
                const shelfId = decodeURIComponent(shelfItemsRoute[1])
                const input = await body(request)
                if (shelfItemsRoute[2] === 'add-filtered')
                    return json(
                        response,
                        200,
                        shelfService.addFiltered(
                            shelfId,
                            (input.query ?? {}) as LibraryFacetQuery
                        )
                    )
                if (shelfItemsRoute[2] === 'remove') {
                    const comicIds = stringList(input.comicIds)
                    const result = shelfService.remove(shelfId, comicIds)
                    for (const comicId of comicIds)
                        options.database.recordUserEvent({
                            eventType: 'shelf_remove',
                            comicId,
                            source: 'shelf',
                            appSessionId: request.headers['x-pica-app-session']
                                ? String(request.headers['x-pica-app-session'])
                                : null,
                            contextId: request.headers['x-pica-context-id']
                                ? String(request.headers['x-pica-context-id'])
                                : null,
                            metadata: { shelfId }
                        })
                    return json(response, 200, result)
                }
                const comicIds = stringList(input.comicIds)
                const result = shelfService.add(
                    shelfId,
                    comicIds,
                    Array.isArray(input.records)
                        ? (input.records as FavoriteRecord[])
                        : []
                )
                for (const comicId of comicIds)
                    options.database.recordUserEvent({
                        eventType: 'shelf_add',
                        comicId,
                        source: 'shelf',
                        appSessionId: request.headers['x-pica-app-session']
                            ? String(request.headers['x-pica-app-session'])
                            : null,
                        contextId: request.headers['x-pica-context-id']
                            ? String(request.headers['x-pica-context-id'])
                            : null,
                        metadata: { shelfId }
                    })
                return json(response, 200, result)
            }
            if (
                url.pathname === '/api/v1/recommendation-sessions' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const useV3 = input.engine === 'v3'
                if (useV3) {
                    const appSessionId = input.appSessionId
                        ? String(input.appSessionId)
                        : null
                    return json(
                        response,
                        200,
                        input.action === 'restart'
                            ? await adaptiveRecommendationService.restart({
                                  appSessionId
                              })
                            : await adaptiveRecommendationService.nextBatch({
                                  appSessionId
                              })
                    )
                }
                return json(
                    response,
                    200,
                    input.action === 'restart'
                        ? await recommendationService.restartCycle()
                        : input.action === 'next'
                          ? await recommendationService.advanceSession()
                          : input.action === 'batch'
                            ? recommendationService.recordBatch(
                                  Number(input.batchIndex ?? 0)
                              )
                            : await recommendationService.ensureInitialPrepared()
                )
            }
            if (
                url.pathname === '/api/v1/recommendation-sessions/status' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    url.searchParams.get('engine') === 'v2'
                        ? recommendationService.currentState()
                        : adaptiveRecommendationService.status()
                )
            const favoriteRoute = url.pathname.match(
                /^\/api\/v1\/provider\/favorites\/([^/]+)$/
            )
            if (
                favoriteRoute &&
                ['PUT', 'DELETE'].includes(request.method ?? '')
            ) {
                if (
                    options.desktop &&
                    request.headers['x-pica-csrf'] !== options.desktop.csrfToken
                )
                    return json(response, 403, {
                        error: 'This local request could not be verified'
                    })
                const comicId = decodeURIComponent(favoriteRoute[1])
                const result =
                    request.method === 'PUT'
                        ? await providerService.addFavorite(comicId)
                        : await providerService.removeFavorite(comicId)
                if (result.isFavorite === (request.method === 'PUT'))
                    options.database.recordUserEvent({
                        eventType:
                            request.method === 'PUT'
                                ? 'favorite_add'
                                : 'favorite_remove',
                        comicId,
                        source: 'provider',
                        appSessionId: request.headers['x-pica-app-session']
                            ? String(request.headers['x-pica-app-session'])
                            : null,
                        contextId: request.headers['x-pica-context-id']
                            ? String(request.headers['x-pica-context-id'])
                            : null,
                        dedupeKey: null
                    })
                return json(response, 200, result)
            }
            if (
                url.pathname === '/api/v1/previews/prepare' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                options.database.recordUserEvent({
                    eventType:
                        Number(input.offset ?? 0) > 0
                            ? 'preview_more'
                            : 'preview_open',
                    comicId: input.comicId ? String(input.comicId) : null,
                    source: 'preview',
                    appSessionId: request.headers['x-pica-app-session']
                        ? String(request.headers['x-pica-app-session'])
                        : null,
                    contextId: request.headers['x-pica-context-id']
                        ? String(request.headers['x-pica-context-id'])
                        : null,
                    metadata: {
                        offset: Number(input.offset ?? 0),
                        count: Number(input.count ?? 3)
                    }
                })
                return json(
                    response,
                    200,
                    await previewService.prepare(
                        String(input.comicId ?? ''),
                        Number(input.offset ?? 0),
                        Number(input.count ?? 3)
                    )
                )
            }
            const previewPage = url.pathname.match(
                /^\/api\/v1\/previews\/([^/]+)\/([^/]+)\/(\d+)$/
            )
            if (previewPage && request.method === 'GET') {
                const image = previewService.page(
                    decodeURIComponent(previewPage[1]),
                    decodeURIComponent(previewPage[2]),
                    Number(previewPage[3])
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
                url.pathname === '/api/v1/previews/cache' &&
                request.method === 'GET'
            )
                return json(response, 200, previewService.stats())
            if (
                url.pathname === '/api/v1/previews/cache/clear' &&
                request.method === 'POST'
            )
                return json(response, 200, previewService.clear())
            const readerChapters = url.pathname.match(
                /^\/api\/v1\/reader\/comics\/([^/]+)\/chapters$/
            )
            if (readerChapters && request.method === 'GET')
                return json(
                    response,
                    200,
                    readerService.chapters(
                        decodeURIComponent(readerChapters[1])
                    )
                )
            const readerChapter = url.pathname.match(
                /^\/api\/v1\/reader\/comics\/([^/]+)\/chapters\/([^/]+)$/
            )
            if (readerChapter && request.method === 'GET')
                return json(
                    response,
                    200,
                    readerService.chapter(
                        decodeURIComponent(readerChapter[1]),
                        decodeURIComponent(readerChapter[2])
                    )
                )
            const readerPicture = url.pathname.match(
                /^\/api\/v1\/reader\/pictures\/([^/]+)$/
            )
            if (readerPicture && request.method === 'GET') {
                const image = readerService.picture(
                    decodeURIComponent(readerPicture[1])
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
                url.pathname === '/api/v1/reader/progress' &&
                request.method === 'GET'
            )
                return json(response, 200, readerService.recentProgress())
            if (
                url.pathname === '/api/v1/reader/progress' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const result = readerService.saveProgress(
                    String(input.comicId ?? ''),
                    String(input.episodeId ?? ''),
                    Number(input.pageIndex ?? 0)
                )
                options.database.recordUserEvent({
                    eventType: 'reader_progress',
                    comicId: result.comicId,
                    source: 'reader',
                    appSessionId: request.headers['x-pica-app-session']
                        ? String(request.headers['x-pica-app-session'])
                        : null,
                    contextId: request.headers['x-pica-context-id']
                        ? String(request.headers['x-pica-context-id'])
                        : null,
                    metadata: {
                        episodeId: result.episodeId,
                        pageIndex: result.pageIndex
                    }
                })
                return json(response, 200, result)
            }
            if (
                url.pathname === '/api/v1/reader/export-zip' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    readerService.exportZip(
                        String(input.comicId ?? ''),
                        String(input.episodeId ?? '')
                    )
                )
            }
            if (
                url.pathname === '/api/v1/reader/export-cbz' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    readerService.exportCbz(
                        String(input.comicId ?? ''),
                        String(input.episodeId ?? '')
                    )
                )
            }
            if (
                url.pathname === '/api/v1/reader/open-default' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    readerService.openDefault(String(input.path ?? ''))
                )
            }
            if (url.pathname === '/api/v1/comics' && request.method === 'GET') {
                return json(
                    response,
                    200,
                    options.database.listComics({
                        text: url.searchParams.get('q') ?? undefined,
                        author: url.searchParams.get('author') ?? undefined,
                        tags: stringList(url.searchParams.get('tags')),
                        categories: stringList(
                            url.searchParams.get('categories')
                        ),
                        finished: url.searchParams.has('finished')
                            ? url.searchParams.get('finished') === 'true'
                            : undefined,
                        sort: (url.searchParams.get('sort') ??
                            'latest') as SortMode,
                        limit: Number(url.searchParams.get('limit') ?? 100),
                        offset: Number(url.searchParams.get('offset') ?? 0)
                    })
                )
            }
            const coverRequest = url.pathname.match(
                /^\/api\/v1\/covers\/([^/]+)$/
            )
            if (coverRequest && request.method === 'GET') {
                const cover = await options.service.cover(
                    decodeURIComponent(coverRequest[1])
                )
                response.writeHead(200, {
                    'content-type': cover.contentType,
                    'content-length': String(cover.data.byteLength),
                    'cache-control': 'private, max-age=86400',
                    'x-content-type-options': 'nosniff'
                })
                response.end(cover.data)
                return
            }
            const downloadedCoverRequest = url.pathname.match(
                /^\/api\/v1\/downloaded\/([^/]+)\/cover$/
            )
            if (downloadedCoverRequest && request.method === 'GET') {
                const cover = await options.service.downloadedCover(
                    decodeURIComponent(downloadedCoverRequest[1])
                )
                response.writeHead(200, {
                    'content-type': cover.contentType,
                    'content-length': String(cover.data.byteLength),
                    'cache-control': 'private, max-age=86400',
                    'x-content-type-options': 'nosniff'
                })
                response.end(cover.data)
                return
            }
            if (
                url.pathname === '/api/v1/authors' &&
                request.method === 'GET'
            ) {
                return json(response, 200, options.database.listAuthors())
            }
            if (
                url.pathname === '/api/v1/authors/merge' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    options.database.mergeAuthors(
                        String(input.targetAuthorId ?? ''),
                        stringList(input.sourceAuthorIds),
                        input.canonicalName
                            ? String(input.canonicalName)
                            : undefined
                    )
                )
            }
            if (
                url.pathname === '/api/v1/authors/import' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const authors = Array.isArray(input.authors)
                    ? (input.authors as Array<{
                          canonicalName: string
                          aliases: string[]
                      }>)
                    : []
                return json(
                    response,
                    200,
                    options.database.applyAuthorDictionary(authors)
                )
            }
            const authorDecision = url.pathname.match(
                /^\/api\/v1\/authors\/([^/]+)(?:\/decision)?$/
            )
            if (authorDecision && request.method === 'POST') {
                const authorId = decodeURIComponent(authorDecision[1])
                const input = await body(request)
                options.database.setAuthorDecision(
                    authorId,
                    String(input.reviewStatus) as
                        | 'approved'
                        | 'keep_separate'
                        | 'needs_research',
                    input.canonicalName
                        ? String(input.canonicalName)
                        : undefined
                )
                return json(response, 200, { success: true })
            }
            if (
                url.pathname === '/api/v1/import' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const records = Array.isArray(input.records)
                    ? (input.records as FavoriteRecord[])
                    : []
                return json(
                    response,
                    200,
                    options.database.importFavorites(
                        records,
                        'web:import',
                        false,
                        false
                    )
                )
            }
            if (url.pathname === '/api/v1/sync' && request.method === 'POST') {
                const input = await body(request)
                const result = await options.service.syncFavorites(
                    input.mode === 'full' ? 'full' : 'quick'
                )
                return json(response, 200, {
                    ...result,
                    lastSync: options.database.lastCompletedSync(),
                    reconciliation: options.database.reconcileLibraryCounts()
                })
            }
            if (
                url.pathname === '/api/v1/search' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                options.database.recordUserEvent({
                    eventType: 'search',
                    source: 'search',
                    appSessionId: request.headers['x-pica-app-session']
                        ? String(request.headers['x-pica-app-session'])
                        : null,
                    contextId: request.headers['x-pica-context-id']
                        ? String(request.headers['x-pica-context-id'])
                        : null,
                    metadata: {
                        hasKeyword: Boolean(input.keyword),
                        tagCount: Array.isArray(input.tags)
                            ? input.tags.length
                            : 0
                    }
                })
                return json(
                    response,
                    200,
                    await options.service.discover({
                        keyword: input.keyword
                            ? String(input.keyword)
                            : undefined,
                        tags: stringList(input.tags),
                        categories: stringList(input.categories),
                        sort: (input.sort
                            ? String(input.sort)
                            : 'likes') as SortMode,
                        limit: Number(input.limit ?? 100)
                    })
                )
            }
            if (
                url.pathname === '/api/v1/recommendations' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    await options.service.recommendations({
                        limit: Number(input.limit ?? 30),
                        seedCount: Number(input.seedCount ?? 12),
                        appSessionId: input.appSessionId
                            ? String(input.appSessionId)
                            : null
                    })
                )
            }
            if (
                url.pathname === '/api/v1/download' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const comicIds = stringList(input.comicIds)
                const episodeOrders = stringList(input.episodeOrders)
                    .map(Number)
                    .filter((value) => Number.isInteger(value) && value > 0)
                const jobs = []
                for (const comicId of comicIds) {
                    jobs.push(
                        options.service.enqueueDownload({
                            comicId,
                            episodeOrders,
                            source: (input.source
                                ? String(input.source)
                                : 'manual') as DownloadSource,
                            runner: 'LOCAL'
                        })
                    )
                }
                if (input.run !== false) {
                    await options.service.runDownloadQueue({
                        runner: 'LOCAL',
                        profile: (input.profile
                            ? String(input.profile)
                            : 'balanced') as
                            | 'conservative'
                            | 'balanced'
                            | 'fast'
                            | 'custom',
                        custom: performanceOverrides(input)
                    })
                }
                for (const job of jobs)
                    options.database.recordUserEvent({
                        eventType: 'download_enqueue',
                        comicId: job.comicId,
                        source: job.source,
                        appSessionId: request.headers['x-pica-app-session']
                            ? String(request.headers['x-pica-app-session'])
                            : null,
                        contextId: request.headers['x-pica-context-id']
                            ? String(request.headers['x-pica-context-id'])
                            : null,
                        metadata: { jobId: job.id }
                    })
                return json(
                    response,
                    200,
                    jobs.map((job) => options.database.getDownloadJob(job.id))
                )
            }
            if (
                url.pathname === '/api/v1/downloads' &&
                request.method === 'GET'
            ) {
                return json(response, 200, options.database.listDownloadJobs())
            }
            if (
                url.pathname === '/api/v1/downloads/run' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                await options.service.runDownloadQueue({
                    runner: 'LOCAL',
                    profile: (input.profile
                        ? String(input.profile)
                        : 'balanced') as
                        | 'conservative'
                        | 'balanced'
                        | 'fast'
                        | 'custom',
                    custom: performanceOverrides(input)
                })
                return json(response, 200, options.database.listDownloadJobs())
            }
            const jobAction = url.pathname.match(
                /^\/api\/v1\/downloads\/([^/]+)\/(pause|resume|retry|cancel)$/
            )
            if (jobAction && request.method === 'POST') {
                const jobId = decodeURIComponent(jobAction[1])
                if (jobAction[2] === 'retry')
                    return json(
                        response,
                        200,
                        options.database.retryDownloadJob(jobId)
                    )
                const statuses = {
                    pause: 'PAUSED',
                    resume: 'QUEUED',
                    cancel: 'CANCELLED'
                } as const
                return json(
                    response,
                    200,
                    options.database.transitionDownloadJob(
                        jobId,
                        statuses[jobAction[2] as keyof typeof statuses]
                    )
                )
            }
            if (
                url.pathname === '/api/v1/maintenance/updates' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const findings = await options.service.checkUpdates(
                    stringList(input.comicIds)
                )
                const jobs = input.queue
                    ? findings
                          .filter(
                              (finding) => finding.newEpisodeOrders.length > 0
                          )
                          .map((finding) =>
                              queueUpdate(options.database, finding)
                          )
                    : []
                return json(response, 200, { findings, jobs })
            }
            if (
                url.pathname === '/api/v1/maintenance/repair' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const issues = scanRepairIssues(options.database)
                const jobs = input.queue
                    ? queueRepairs(options.database, issues)
                    : []
                return json(response, 200, { issues, jobs })
            }
            if (
                url.pathname === '/api/v1/organize' &&
                request.method === 'POST'
            ) {
                return json(
                    response,
                    200,
                    organizeLibraryViews(
                        options.service.dataDir,
                        options.database.listComics({ limit: 5000 })
                    )
                )
            }
            if (url.pathname.startsWith('/api/')) {
                return json(response, 404, { error: 'API route not found' })
            }
            if (url.pathname === '/setup')
                serveAsset(response, root, '/index.html')
            else serveAsset(response, root, url.pathname)
        } catch (error) {
            json(response, 500, {
                error: error instanceof Error ? error.message : String(error)
            })
        }
    })
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, resolve)
    })
    const address = server.address()
    const actualPort =
        typeof address === 'object' && address ? address.port : port
    return { server, url: `http://${host}:${actualPort}` }
}
