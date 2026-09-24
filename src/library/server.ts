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
import { VisualStyleService } from '../services/visual-style-service'
import {
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION,
    type VisualSamplingMode
} from '../recommendation-v4/visual-style'
import { ReaderService } from '../services/reader-service'
import { OnlineReaderService } from '../services/online-reader-service'
import type { UserEventInput, V3EventType } from '../recommendation-v3/types'
import { CycleCoordinatorV3 } from '../recommendation-v3/cycle-coordinator-v3'
import { FINAL_PROFILE_VERSION } from '../recommendation-v3/final-profile'
import { RANKER_ADAPTER_VERSION } from '../recommendation-v3/ranker-adapter-v3'
import { RETRIEVER_VERSION } from '../recommendation-v3/retriever-v3'
import { BATCH_ALLOCATOR_VERSION } from '../recommendation-v3/batch-allocator-v3'

export interface DesktopServerController {
    csrfToken: string
    registerAccount?: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
    configured: () => boolean
    status: () => Record<string, unknown>
    startEhWebLogin?: () => Promise<Record<string, unknown>>
    ehWebLoginStatus?: () => Record<string, unknown>
    cancelEhWebLogin?: () => Promise<Record<string, unknown>>
    importThemePack?: (name: string, value: Buffer) => Promise<Record<string, unknown>>
    save: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
    testConnection: (
        input: Record<string, unknown>
    ) => Promise<Record<string, unknown>>
    detectProxy?: (
        input: Record<string, unknown>
    ) => Promise<Record<string, unknown>>
    chooseFolder: () => Promise<string | null>
    exportBrowserLitePackage: () => Promise<Record<string, unknown>>
    exportRecommendationAudit?: (
        input?: Record<string, unknown>
    ) => Promise<Record<string, unknown>>
    syncAndExportBrowserLitePackage?: () => Promise<Record<string, unknown>>
    openBrowserLite?: () => Promise<void>
    openDirectory: (kind: string) => Promise<void>
    ecosystemPackInventory?: () => unknown
    checkForUpdate?: () => Promise<Record<string, unknown>>
    stageUpdate?: (
        name: string,
        value: Buffer
    ) => Promise<Record<string, unknown>>
    applyUpdate?: (id: string) => Promise<Record<string, unknown>>
    updateProgress?: () => unknown
    browserSessionOpened?: (sessionId: string) => void
    browserSessionClosed?: (sessionId: string) => void
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
async function downloadUpdateAsset(
    value: string,
    limit = 128 * 1024 * 1024,
    onProgress?: (current: number, total: number | null) => void,
    signal?: AbortSignal
): Promise<Buffer> {
    const target = new URL(value)
    if (target.protocol !== 'https:')
        throw new Error('Official update URL must use HTTPS')
    const timeout = AbortSignal.timeout(120_000)
    const combinedController = new AbortController()
    const forwardAbort = () => combinedController.abort()
    timeout.addEventListener('abort', forwardAbort, { once: true })
    signal?.addEventListener('abort', forwardAbort, { once: true })
    const response = await fetch(target, {
        redirect: 'follow',
        headers: { 'user-agent': 'Pica-Library-UpdateDownloader' },
        signal: combinedController.signal
    })
    if (!response.ok)
        throw new Error(
            `Official update download failed: HTTP ${response.status}`
        )
    const declaredRaw = Number(response.headers.get('content-length') ?? 0)
    const declared = Number.isFinite(declaredRaw) && declaredRaw > 0 ? declaredRaw : null
    if (declared !== null && declared > limit)
        throw new Error('Official update package is too large')
    if (!response.body) {
        const fallback = Buffer.from(await response.arrayBuffer())
        if (fallback.byteLength > limit)
            throw new Error('Official update package is too large')
        onProgress?.(fallback.byteLength, declared)
        return fallback
    }
    const chunks: Buffer[] = []
    let size = 0
    const reader = response.body.getReader()
    while (true) {
        const { done, value: chunk } = await reader.read()
        if (done) break
        const buffer = Buffer.from(chunk)
        size += buffer.byteLength
        if (size > limit) {
            await reader.cancel('Update package is too large')
            throw new Error('Official update package is too large')
        }
        chunks.push(buffer)
        onProgress?.(size, declared)
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
    const providerService = options.service.providerService()
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
    void recommendationService.ensureInitialPrepared().catch(() => {
        // Connected startup must remain available while provider preparation
        // waits for credentials/network. The status endpoint exposes preparing.
    })
    const previewCache = new PreviewCacheManager(
        path.join(options.cacheDir ?? options.service.dataDir, 'previews')
    )
    let updateDownloadController: AbortController | null = null
    let updateDownloadProgress: Record<string, unknown> | null = null
    const writeUpdateDownloadProgress = (value: Record<string, unknown>) => {
        updateDownloadProgress = { ...value, updatedAt: new Date().toISOString() }
    }
    const previewService = new PreviewService(
        options.database,
        providerService,
        previewCache
    )
    const visualStyleService = new VisualStyleService(
        options.database,
        providerService,
        new PreviewCacheManager(
            path.join(
                options.cacheDir ?? options.service.dataDir,
                'visual-samples'
            ),
            { maxBytes: 192 * 1024 * 1024, ttlMs: 6 * 60 * 60 * 1000 }
        )
    )
    const readerService = new ReaderService(
        options.database,
        options.service.dataDir
    )
    const onlineReader = new OnlineReaderService(options.database, providerService,
        new PreviewCacheManager(path.join(options.cacheDir ?? options.service.dataDir, 'online-reader'), {
            maxBytes: 256 * 1024 * 1024,
            ttlMs: 24 * 60 * 60 * 1000
        }))
    const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1'])
    if (!loopbackHosts.has(host)) {
        throw new Error(
            'Unauthenticated remote binding is disabled. Configure an authenticated remote-access mode before using a non-loopback host.'
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
                const desktopStatus = options.desktop?.status() ?? null
                return json(response, 200, {
                    ...appCapabilities(
                        providerService.capabilities.favoriteMutation,
                        process.platform,
                        process.arch,
                        desktopStatus
                    ),
                    providers: providerService.providerStatus()
                })
            }
            if (
                url.pathname === '/api/v1/recommendation-v5' &&
                request.method === 'GET'
            )
                return json(response, 200, options.service.recommendationV5Snapshot())

            if (
                url.pathname ===
                    '/api/v1/recommendation-v5/provider-routes' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.service.recommendationV5ProviderRoutes(
                        url.searchParams.get('appSessionId'),
                        Number(url.searchParams.get('limit') ?? 5000)
                    )
                )

            if (
                url.pathname ===
                    '/api/v1/recommendation-v5/candidate-channels' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.service.recommendationV5CandidateChannels(
                        url.searchParams.get('appSessionId'),
                        Number(url.searchParams.get('limit') ?? 5000)
                    )
                )

            if (
                url.pathname ===
                    '/api/v1/recommendation-v5/serving-composition' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.service.recommendationServingCompositionV3()
                )

            if (
                url.pathname ===
                    '/api/v1/recommendation-v5/preference-timescales' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.service.recommendationV5PreferenceTimescales(
                        url.searchParams.get('appSessionId'),
                        Number(url.searchParams.get('limit') ?? 5000)
                    )
                )

            if (
                url.pathname ===
                    '/api/v1/recommendation-v5/behavior-evidence' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.service.recommendationV5BehaviorEvidence(
                        Number(url.searchParams.get('limit') ?? 5000)
                    )
                )

            if (
                url.pathname ===
                    '/api/v1/recommendation-v5/work-identity/audit' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.service.recommendationV5WorkIdentityAudit(
                        Number(url.searchParams.get('limit') ?? 200)
                    )
                )

            if (
                url.pathname ===
                    '/api/v1/recommendation-v5/work-identity/evidence' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.service.recommendationV5WorkIdentityEvidence(
                        Number(url.searchParams.get('limit') ?? 200)
                    )
                )

            if (
                url.pathname ===
                    '/api/v1/recommendation-v5/work-identity/evidence/refresh' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    options.service.recommendationV5RefreshWorkIdentityEvidence(
                        Number(input.limit ?? 500)
                    )
                )
            }

            if (
                url.pathname ===
                    '/api/v1/recommendation-v5/work-identity/review' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.service.recommendationV5WorkIdentityReview(
                        Number(url.searchParams.get('limit') ?? 200)
                    )
                )

            if (
                url.pathname ===
                    '/api/v1/recommendation-v5/work-identity/materialization-plan' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.service.recommendationV5WorkIdentityMaterializationPlan()
                )

            if (
                url.pathname ===
                    '/api/v1/desktop/recommendation-v5/evaluation/advanced-learning-gate' &&
                request.method === 'GET'
            ) {
                if (!options.desktop)
                    return json(response, 409, {
                        error: 'Desktop control plane is unavailable'
                    })
                return json(
                    response,
                    200,
                    options.service.recommendationV5AdvancedLearningGate(
                        url.searchParams.get('direction'),
                        url.searchParams.get('baselineVersion'),
                        url.searchParams.get('candidateVersion'),
                        Number(url.searchParams.get('limit') ?? 1000),
                        Number(url.searchParams.get('horizonDays') ?? 30)
                    )
                )
            }

            if (
                url.pathname ===
                    '/api/v1/desktop/recommendation-v5/evaluation/versions' &&
                request.method === 'GET'
            ) {
                if (!options.desktop)
                    return json(response, 409, {
                        error: 'Desktop control plane is unavailable'
                    })
                return json(
                    response,
                    200,
                    options.service.recommendationV5BenchmarkVersions(
                        Number(url.searchParams.get('limit') ?? 1000)
                    )
                )
            }

            if (
                url.pathname ===
                    '/api/v1/desktop/recommendation-v5/evaluation/compare' &&
                request.method === 'GET'
            ) {
                if (!options.desktop)
                    return json(response, 409, {
                        error: 'Desktop control plane is unavailable'
                    })
                return json(
                    response,
                    200,
                    options.service.recommendationV5BenchmarkComparison(
                        String(url.searchParams.get('baselineVersion') ?? ''),
                        String(url.searchParams.get('candidateVersion') ?? ''),
                        Number(url.searchParams.get('limit') ?? 1000),
                        Number(url.searchParams.get('horizonDays') ?? 30)
                    )
                )
            }

            if (
                url.pathname ===
                    '/api/v1/desktop/recommendation-v5/evaluation/summary' &&
                request.method === 'GET'
            ) {
                if (!options.desktop)
                    return json(response, 409, {
                        error: 'Desktop control plane is unavailable'
                    })
                return json(
                    response,
                    200,
                    options.service.recommendationV5EvaluationSummary(
                        Number(url.searchParams.get('limit') ?? 200),
                        Number(url.searchParams.get('horizonDays') ?? 30),
                        Number(url.searchParams.get('steerabilityStep') ?? 3),
                        Number(url.searchParams.get('steerabilityTargetLimit') ?? 30)
                    )
                )
            }

            if (
                url.pathname ===
                    '/api/v1/desktop/recommendation-v5/evaluation/steerability' &&
                request.method === 'GET'
            ) {
                if (!options.desktop)
                    return json(response, 409, {
                        error: 'Desktop control plane is unavailable'
                    })
                return json(
                    response,
                    200,
                    options.service.recommendationV5SteerabilityAudit(
                        Number(url.searchParams.get('step') ?? 3),
                        Number(url.searchParams.get('targetLimit') ?? 30)
                    )
                )
            }

            if (
                url.pathname ===
                    '/api/v1/desktop/recommendation-v5/evaluation/retrospective' &&
                request.method === 'GET'
            ) {
                if (!options.desktop)
                    return json(response, 409, {
                        error: 'Desktop control plane is unavailable'
                    })
                return json(
                    response,
                    200,
                    options.service.recommendationV5RetrospectiveBenchmark(
                        Number(url.searchParams.get('limit') ?? 200),
                        Number(url.searchParams.get('horizonDays') ?? 30)
                    )
                )
            }

            if (
                url.pathname ===
                    '/api/v1/desktop/recommendation-v5/visual-activation-gate' &&
                request.method === 'GET'
            ) {
                if (!options.desktop)
                    return json(response, 409, {
                        error: 'Desktop control plane is unavailable'
                    })
                return json(
                    response,
                    200,
                    options.service.recommendationV5VisualActivationGate(
                        Number(url.searchParams.get('limit') ?? 100)
                    )
                )
            }

            if (
                url.pathname ===
                    '/api/v1/desktop/recommendation-v5/promotion-gate' &&
                request.method === 'GET'
            ) {
                if (!options.desktop)
                    return json(response, 409, {
                        error: 'Desktop control plane is unavailable'
                    })
                return json(
                    response,
                    200,
                    options.service.recommendationV5P3PromotionGate(
                        Number(url.searchParams.get('limit') ?? 100)
                    )
                )
            }

            if (
                url.pathname ===
                    '/api/v1/desktop/recommendation-v5/shadow-runs' &&
                request.method === 'GET'
            ) {
                if (!options.desktop)
                    return json(response, 409, {
                        error: 'Desktop control plane is unavailable'
                    })
                return json(
                    response,
                    200,
                    options.service.recommendationV5ShadowRuns(
                        Number(url.searchParams.get('limit') ?? 50)
                    )
                )
            }

            if (
                url.pathname ===
                    '/api/v1/desktop/recommendation-v5/shadow-retrieval' &&
                request.method === 'POST'
            ) {
                if (!options.desktop)
                    return json(response, 409, {
                        error: 'Desktop control plane is unavailable'
                    })
                const input = await body(request)
                return json(
                    response,
                    200,
                    await options.service.runRecommendationV5ShadowRetrieval(
                        input
                    )
                )
            }

            if (
                url.pathname ===
                    '/api/v1/desktop/recommendation-v5/work-identity/materialization/runs' &&
                request.method === 'GET'
            ) {
                if (!options.desktop)
                    return json(response, 409, {
                        error: 'Desktop control plane is unavailable'
                    })
                return json(
                    response,
                    200,
                    options.service.recommendationV5WorkIdentityMaterializationRuns(
                        Number(url.searchParams.get('limit') ?? 100)
                    )
                )
            }

            if (
                url.pathname ===
                    '/api/v1/desktop/recommendation-v5/work-identity/materialization/prepare' &&
                request.method === 'POST'
            ) {
                if (!options.desktop)
                    return json(response, 409, {
                        error: 'Desktop control plane is unavailable'
                    })
                const input = await body(request)
                return json(
                    response,
                    200,
                    options.service.prepareRecommendationV5WorkIdentityMaterialization(
                        input
                    )
                )
            }

            if (
                url.pathname ===
                    '/api/v1/recommendation-v5/work-identity/decision' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    options.service.updateRecommendationV5WorkIdentityDecision(
                        input
                    )
                )
            }

            if (
                url.pathname === '/api/v1/recommendation-v5/control' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    options.service.updateRecommendationV5Control(input)
                )
            }

            if (
                url.pathname === '/api/v1/recommendation-v5/session' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    options.service.updateRecommendationV5Session(input)
                )
            }

            if (
                url.pathname === '/api/v1/recommendation-v5/suppress' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    options.service.suppressRecommendationV5Comic(input)
                )
            }

            if (
                url.pathname ===
                    '/api/v1/recommendation-v5/taste-exclusion' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    options.service.updateRecommendationV5TasteExclusion(input)
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
                    'recommend_like',
                    'recommend_dislike',
                    'recommend_feedback_reason',
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
                const cycleId = input.recommendationCycleId
                    ? String(input.recommendationCycleId)
                    : null
                const batchIndex =
                    input.recommendationBatchIndex === undefined
                        ? null
                        : Number(input.recommendationBatchIndex)
                const comicId = input.comicId ? String(input.comicId) : null
                const rankPosition =
                    input.rankPosition === undefined
                        ? null
                        : Number(input.rankPosition)
                const batchId = input.recommendationBatchId
                    ? String(input.recommendationBatchId)
                    : null
                if (
                    eventType === 'recommend_batch_presented' &&
                    (!cycleId || batchIndex === null || !batchId)
                )
                    return json(response, 400, {
                        error: 'Batch presentation requires cycle and batch context'
                    })
                if (
                    (eventType === 'recommend_like' ||
                        eventType === 'recommend_dislike' ||
                        eventType === 'recommend_feedback_reason') &&
                    !comicId
                )
                    return json(response, 400, {
                        error: 'Recommendation feedback requires a comic'
                    })
                if (eventType === 'recommend_feedback_reason') {
                    const metadata =
                        typeof input.metadata === 'object' && input.metadata
                            ? (input.metadata as Record<string, unknown>)
                            : {}
                    if (
                        !['like', 'dislike'].includes(
                            String(metadata.sentiment ?? '')
                        ) ||
                        !Array.isArray(metadata.reasons)
                    )
                        return json(response, 400, {
                            error: 'Feedback reasons require sentiment and reasons'
                        })
                }
                if (
                    eventType === 'recommend_impression' &&
                    (!cycleId ||
                        batchIndex === null ||
                        !comicId ||
                        rankPosition === null)
                )
                    return json(response, 400, {
                        error: 'Recommendation impression requires cycle, batch, comic, and rank context'
                    })
                return json(
                    response,
                    200,
                    options.service.recordRecommendationEvent({
                        eventType,
                        occurredAt: input.occurredAt
                            ? String(input.occurredAt)
                            : undefined,
                        comicId,
                        source: input.source ? String(input.source) : null,
                        appSessionId: input.appSessionId
                            ? String(input.appSessionId)
                            : null,
                        contextId: input.contextId
                            ? String(input.contextId)
                            : null,
                        recommendationCycleId: cycleId,
                        recommendationSessionId: input.recommendationSessionId
                            ? String(input.recommendationSessionId)
                            : null,
                        recommendationBatchIndex: batchIndex,
                        rankPosition,
                        metadata:
                            typeof input.metadata === 'object' && input.metadata
                                ? {
                                      ...(input.metadata as Record<
                                          string,
                                          unknown
                                      >),
                                      ...(batchId ? { batchId } : {})
                                  }
                                : {},
                        dedupeKey: input.dedupeKey
                            ? String(input.dedupeKey)
                            : eventType === 'recommend_batch_presented' &&
                                cycleId &&
                                batchId
                              ? `${cycleId}:${batchId}`
                              : null
                    } satisfies UserEventInput)
                )
            }
            if (
                url.pathname === '/api/v1/recommendation-feedback' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.database.recommendationFeedback()
                )
            if (
                url.pathname === '/api/v1/visual/status' &&
                request.method === 'GET'
            )
                return json(response, 200, options.service.visualIndexStatus())
            if (
                url.pathname === '/api/v1/visual/representation-qc' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.service.visualRepresentationQc(
                        Number(url.searchParams.get('maxPairSamples') ?? 4000),
                        Number(url.searchParams.get('maxAnchors') ?? 120)
                    )
                )
            if (
                url.pathname === '/api/v1/visual/author-atlas' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.service.visualAuthorAtlas(
                        Number(url.searchParams.get('minWorksPerAuthor') ?? 2),
                        Number(url.searchParams.get('maxGraphAuthors') ?? 600),
                        Number(url.searchParams.get('neighborLimit') ?? 8)
                    )
                )
            if (
                url.pathname === '/api/v1/visual/style-families' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.service.visualStyleFamilies(
                        Number(url.searchParams.get('minWorksPerAuthor') ?? 2),
                        Number(url.searchParams.get('maxAuthors') ?? 300),
                        Number(url.searchParams.get('mutualK') ?? 2),
                        Number(url.searchParams.get('minimumSimilarity') ?? -1)
                    )
                )
            if (
                url.pathname === '/api/v1/visual/settings' &&
                request.method === 'POST'
            )
                return json(
                    response,
                    200,
                    options.service.updateVisualSettings(await body(request))
                )
            if (
                url.pathname === '/api/v1/visual/prepare' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const mode = [
                    'local_only',
                    'standard',
                    'cover_only'
                ].includes(String(input.mode ?? ''))
                    ? (String(input.mode) as VisualSamplingMode)
                    : options.service.visualSettings().samplingMode
                return json(
                    response,
                    200,
                    await visualStyleService.prepare(
                        String(input.comicId ?? ''),
                        mode,
                        Number(input.limit ?? 6)
                    )
                )
            }
            if (
                url.pathname === '/api/v1/visual/embedding' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const vector = Array.isArray(input.vector)
                    ? input.vector.map(Number)
                    : []
                const sourceKind = String(input.sourceKind ?? '')
                if (
                    ![
                        'LOCAL_PAGES',
                        'REMOTE_PAGES',
                        'COVER_ONLY'
                    ].includes(sourceKind)
                )
                    return json(response, 400, {
                        error: 'Invalid visual embedding source'
                    })
                return json(
                    response,
                    200,
                    options.service.saveVisualEmbedding({
                        comicId: String(input.comicId ?? ''),
                        modelId: String(input.modelId ?? VISUAL_MODEL_ID),
                        modelVersion: String(
                            input.modelVersion ?? VISUAL_MODEL_VERSION
                        ),
                        samplingPolicyVersion: String(
                            input.samplingPolicyVersion ??
                                VISUAL_SAMPLING_POLICY_VERSION
                        ),
                        embeddingKind:
                            input.embeddingKind === 'cover' ? 'cover' : 'body',
                        vector,
                        dimension: Number(input.dimension ?? vector.length),
                        sourceKind: sourceKind as
                            | 'LOCAL_PAGES'
                            | 'REMOTE_PAGES'
                            | 'COVER_ONLY',
                        sampleCount: Number(input.sampleCount ?? 1),
                        confidence: Number(
                            input.confidence ??
                                (sourceKind === 'COVER_ONLY' ? 0.5 : 1)
                        ),
                        metadata:
                            typeof input.metadata === 'object' && input.metadata
                                ? (input.metadata as Record<string, unknown>)
                                : {}
                    })
                )
            }
            const visualSimilar = url.pathname.match(
                /^\/api\/v1\/visual\/similar\/([^/]+)$/
            )
            if (visualSimilar && request.method === 'GET')
                return json(
                    response,
                    200,
                    options.service.similarVisualStyle(
                        decodeURIComponent(visualSimilar[1]),
                        Number(url.searchParams.get('limit') ?? 20)
                    )
                )
            const visualSample = url.pathname.match(
                /^\/api\/v1\/visual\/samples\/([^/]+)$/
            )
            if (visualSample && request.method === 'GET') {
                const image = visualStyleService.page(
                    decodeURIComponent(visualSample[1])
                )
                response.writeHead(200, {
                    'content-type': image.contentType,
                    'content-length': String(image.data.byteLength),
                    'cache-control': 'private, no-store',
                    'x-content-type-options': 'nosniff'
                })
                response.end(image.data)
                return
            }
            if (
                url.pathname === '/api/v1/visual/cache/clear' &&
                request.method === 'POST'
            )
                return json(response, 200, visualStyleService.clear())
            if (
                url.pathname === '/api/v1/desktop/ecosystem/packs' &&
                request.method === 'GET'
            ) {
                if (!options.desktop?.ecosystemPackInventory)
                    return json(response, 409, {
                        error: 'Ecosystem Pack inventory is unavailable'
                    })
                return json(
                    response,
                    200,
                    options.desktop.ecosystemPackInventory()
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
                return json(
                    response,
                    200,
                    updateDownloadProgress ?? options.desktop.updateProgress()
                )
            }
            if (
                url.pathname === '/api/v1/update/cancel' &&
                request.method === 'POST'
            ) {
                if (
                    !options.desktop ||
                    request.headers['x-pica-csrf'] !== options.desktop.csrfToken
                )
                    return json(response, 403, {
                        error: 'This local request could not be verified'
                    })
                if (updateDownloadController) updateDownloadController.abort()
                updateDownloadController = null
                writeUpdateDownloadProgress({ phase: 'cancelled' })
                return json(response, 200, { success: true })
            }
            if (
                url.pathname === '/api/v1/update/prepare-latest' &&
                request.method === 'POST'
            ) {
                if (
                    !options.desktop?.checkForUpdate ||
                    !options.desktop?.stageUpdate
                )
                    throw new Error('Updates are unavailable in this mode')
                if (
                    request.headers['x-pica-csrf'] !== options.desktop.csrfToken
                )
                    return json(response, 403, {
                        error: 'This local request could not be verified'
                    })
                const available = await options.desktop.checkForUpdate()
                if (available.status !== 'incremental')
                    return json(response, 200, available)
                const assetName = path.basename(
                    String(available.assetName ?? '')
                )
                const assetUrl = String(available.assetUrl ?? '')
                if (!assetName || !assetUrl)
                    throw new Error(
                        'Official incremental update asset is missing'
                    )
                if (updateDownloadController)
                    throw new Error('An update download is already running')
                updateDownloadController = new AbortController()
                writeUpdateDownloadProgress({
                    phase: 'downloading',
                    current: 0,
                    total: 0,
                    targetVersion: available.version
                })
                try {
                    const archive = await downloadUpdateAsset(
                        assetUrl,
                        128 * 1024 * 1024,
                        (current, total) =>
                            writeUpdateDownloadProgress({
                                phase: 'downloading',
                                current,
                                total: total ?? 0,
                                targetVersion: available.version
                            }),
                        updateDownloadController.signal
                    )
                    updateDownloadController = null
                    updateDownloadProgress = null
                    const staged = await options.desktop.stageUpdate(
                        assetName,
                        archive
                    )
                    return json(response, 200, staged)
                } catch (error) {
                    const cancelled =
                        error instanceof Error &&
                        (error.name === 'AbortError' || /abort/i.test(error.message))
                    updateDownloadController = null
                    writeUpdateDownloadProgress({
                        phase: cancelled ? 'cancelled' : 'failed',
                        error: cancelled
                            ? 'Update download was cancelled'
                            : error instanceof Error
                              ? error.message
                              : String(error),
                        targetVersion: available.version
                    })
                    if (cancelled)
                        return json(response, 409, {
                            error: 'Update download was cancelled'
                        })
                    throw error
                }
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
                url.pathname === '/api/v1/desktop/theme-import' &&
                request.method === 'POST'
            ) {
                if (!options.desktop?.importThemePack)
                    throw new Error('Theme import is unavailable in this mode')
                const rawName = String(request.headers['x-theme-filename'] ?? 'theme.pica-theme')
                let decodedName = rawName
                try { decodedName = decodeURIComponent(rawName) } catch { /* basename below still constrains it */ }
                const filename = path.basename(decodedName)
                return json(
                    response,
                    200,
                    await options.desktop.importThemePack(
                        filename,
                        await binaryBody(request, 24 * 1024 * 1024)
                    )
                )
            }
            if (
                url.pathname === '/api/v1/desktop/eh-web-login/status' &&
                request.method === 'GET'
            ) {
                if (!options.desktop?.ehWebLoginStatus)
                    return json(response, 409, { error: '受控 E-H 网页登录不可用' })
                return json(response, 200, options.desktop.ehWebLoginStatus())
            }
            if (
                url.pathname === '/api/v1/desktop/eh-web-login/start' &&
                request.method === 'POST'
            ) {
                if (!options.desktop?.startEhWebLogin)
                    return json(response, 409, { error: '受控 E-H 网页登录不可用' })
                return json(response, 200, await options.desktop.startEhWebLogin())
            }
            if (
                url.pathname === '/api/v1/desktop/eh-web-login/cancel' &&
                request.method === 'POST'
            ) {
                if (!options.desktop?.cancelEhWebLogin)
                    return json(response, 409, { error: '受控 E-H 网页登录不可用' })
                return json(response, 200, await options.desktop.cancelEhWebLogin())
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
                url.pathname === '/api/v1/desktop/register-account' &&
                request.method === 'POST'
            ) {
                if (!options.desktop?.registerAccount)
                    return json(response, 409, { error: '请在本地 Windows 版或 Android 中注册，Browser Lite 不接收账号凭据。' })
                return json(response, 200, await options.desktop.registerAccount(await body(request)))
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
                url.pathname ===
                    '/api/v1/desktop/recommendation-v5/export-audit' &&
                request.method === 'POST'
            ) {
                if (!options.desktop?.exportRecommendationAudit)
                    return json(response, 409, {
                        error: 'Recommendation audit export is unavailable'
                    })
                return json(
                    response,
                    200,
                    await options.desktop.exportRecommendationAudit(
                        await body(request)
                    )
                )
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
                url.pathname === '/api/v1/desktop/browser-session' &&
                request.method === 'POST' &&
                options.desktop
            ) {
                const input = await body(request)
                const sessionId = String(input.sessionId ?? '').trim().slice(0, 160)
                const action = String(input.action ?? '')
                if (!sessionId)
                    return json(response, 400, { error: 'Browser session id is required' })
                if (action === 'open')
                    options.desktop.browserSessionOpened?.(sessionId)
                else if (action === 'close')
                    options.desktop.browserSessionClosed?.(sessionId)
                else
                    return json(response, 400, { error: 'Unknown browser session action' })
                return json(response, 200, { success: true })
            }
            if (
                url.pathname === '/api/v1/desktop/shutdown' &&
                request.method === 'POST' &&
                options.desktop
            ) {
                json(response, 200, {
                    success: true,
                    shutdownScheduled: true
                })
                options.desktop.shutdown()
                return
            }
            if (url.pathname === '/api/v1/status' && request.method === 'GET') {
                return json(response, 200, {
                    application: 'Pica Library',
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
                    if (
                        input.action === 'pause_build' ||
                        input.action === 'resume_build' ||
                        input.action === 'cancel_build'
                    )
                        return json(
                            response,
                            200,
                            options.service.recommendationBuildControl(
                                input.action === 'pause_build'
                                    ? 'pause'
                                    : input.action === 'resume_build'
                                      ? 'resume'
                                      : 'cancel'
                            )
                        )
                    if (input.action === 'resume_or_create')
                        return json(
                            response,
                            200,
                            finalRecommendationCoordinator.resumeOrCreate(
                                input.requestId
                                    ? String(input.requestId)
                                    : undefined
                            )
                        )
                    if (input.action === 'force_new')
                        return json(
                            response,
                            200,
                            finalRecommendationCoordinator.forceNew(
                                String(input.requestId ?? '')
                            )
                        )
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
                        : url.searchParams.get('mode') === 'final'
                          ? {
                                ...finalRecommendationCoordinator.status(),
                                buildProgress: options.service.recommendationBuildProgress()
                            }
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
                if (result.changed)
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
            const onlineChapters = url.pathname.match(/^\/api\/v1\/online-reader\/comics\/([^/]+)\/chapters$/)
            if (onlineChapters && request.method === 'GET')
                return json(response, 200, await onlineReader.chapters(decodeURIComponent(onlineChapters[1])))
            const onlineChapter = url.pathname.match(/^\/api\/v1\/online-reader\/comics\/([^/]+)\/chapters\/([^/]+)$/)
            if (onlineChapter && request.method === 'GET')
                return json(response, 200, await onlineReader.chapter(decodeURIComponent(onlineChapter[1]), decodeURIComponent(onlineChapter[2])))
            const onlinePage = url.pathname.match(/^\/api\/v1\/online-reader\/comics\/([^/]+)\/chapters\/([^/]+)\/pages\/(\d+)$/)
            if (onlinePage && request.method === 'GET') {
                const image = await onlineReader.picture(decodeURIComponent(onlinePage[1]), decodeURIComponent(onlinePage[2]), Number(onlinePage[3]))
                response.writeHead(200, { 'content-type': image.contentType, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' })
                return response.end(image.data)
            }
            if (url.pathname === '/api/v1/online-reader/progress') {
                if (request.method === 'GET') return json(response, 200, onlineReader.recentProgress())
                if (request.method === 'POST') {
                    const input = await body(request)
                    return json(response, 200, await onlineReader.saveProgress(String(input.comicId ?? ''), String(input.episodeId ?? ''), Number(input.pageIndex)))
                }
            }
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
            const comicDetailRequest = url.pathname.match(
                /^\/api\/v1\/comics\/([^/]+)$/
            )
            if (comicDetailRequest && request.method === 'GET') {
                const comic = options.database.getComic(
                    decodeURIComponent(comicDetailRequest[1])
                )
                return json(
                    response,
                    comic ? 200 : 404,
                    comic ?? { error: 'Comic not found' }
                )
            }

            const workVariantsRequest = url.pathname.match(
                /^\/api\/v1\/comics\/([^/]+)\/work-variants$/
            )
            if (workVariantsRequest && request.method === 'GET')
                return json(
                    response,
                    200,
                    options.service.workVariantsForComic(
                        decodeURIComponent(workVariantsRequest[1]),
                        Number(url.searchParams.get('limit') ?? 24)
                    )
                )

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
            const authorRefresh = url.pathname.match(
                /^\/api\/v1\/authors\/([^/]+)\/refresh$/
            )
            if (authorRefresh && request.method === 'POST')
                return json(
                    response,
                    200,
                    await options.service.refreshAuthorWorks(decodeURIComponent(authorRefresh[1]))
                )
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
            if (
                url.pathname === '/api/v1/sync/control' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const action = String(input.action ?? '')
                if (
                    action !== 'pause' &&
                    action !== 'resume' &&
                    action !== 'cancel'
                )
                    return json(response, 400, {
                        error: 'Unknown favorites sync control action'
                    })
                return json(
                    response,
                    200,
                    options.service.favoritesSyncControl(action)
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
                        ehMode: ['latest','popular','favorites','watched','toplist'].includes(String(input.ehMode ?? '')) ? String(input.ehMode) as 'latest' | 'popular' | 'favorites' | 'watched' | 'toplist' : undefined,
                        ehToplist: input.ehToplist ? String(input.ehToplist) : undefined,
                        ehLanguage: input.ehLanguage ? String(input.ehLanguage) : undefined,
                        ehExcludeTags: stringList(input.ehExcludeTags),
                        ehMinRating: Number(input.ehMinRating ?? 0),
                        ehPageFrom: Number(input.ehPageFrom ?? 0),
                        ehPageTo: Number(input.ehPageTo ?? 0),
                        sort: (input.sort
                            ? String(input.sort)
                            : 'likes') as SortMode,
                        limit: Number(input.limit ?? 100),
                        providers: stringList(input.providers).filter(
                            (value): value is 'pica' | 'eh' | 'exh' =>
                                value === 'pica' || value === 'eh' || value === 'exh'
                        )
                    })
                )
            }
            if (
                url.pathname === '/api/v1/recommendation/profile' &&
                request.method === 'GET'
            ) {
                const snapshot = options.service.tasteChronicle()
                return json(response, snapshot ? 200 : 404, {
                    available: Boolean(snapshot),
                    snapshot
                })
            }
            if (
                url.pathname === '/api/v1/recommendation/profile/rebuild' &&
                request.method === 'POST'
            ) {
                return json(response, 200, {
                    available: true,
                    snapshot: options.service.rebuildTasteChronicle()
                })
            }
            if (
                url.pathname === '/api/v1/recommendations' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                if (input.action === 'current')
                    return json(
                        response,
                        200,
                        finalRecommendationCoordinator.current()
                    )
                if (input.action === 'next')
                    return json(
                        response,
                        200,
                        await finalRecommendationCoordinator.next(
                            String(input.requestId ?? '')
                        )
                    )
                return json(response, 200, {
                    engine: 'legacy',
                    ...(await options.service.recommendations({
                        limit: Number(input.limit ?? 30),
                        seedCount: Number(input.seedCount ?? 12),
                        appSessionId: input.appSessionId
                            ? String(input.appSessionId)
                            : null
                    }))
                })
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
                if (input.run !== false)
                    options.service.startLocalDownloadQueue({
                        profile: (input.profile
                            ? String(input.profile)
                            : 'balanced') as
                            | 'conservative'
                            | 'balanced'
                            | 'fast'
                            | 'custom',
                        custom: performanceOverrides(input)
                    })
                return json(
                    response,
                    200,
                    jobs.map((job) => options.database.getDownloadJob(job.id))
                )
            }
            if (
                url.pathname === '/api/v1/downloads/summary' &&
                request.method === 'GET'
            )
                return json(response, 200, {
                    ...options.database.downloadJobSummary(),
                    runtime: options.service.localDownloadRuntime()
                })
            if (
                url.pathname === '/api/v1/downloads/page' &&
                request.method === 'GET'
            ) {
                const rawView = String(url.searchParams.get('view') ?? 'active')
                const view = rawView === 'finished' || rawView === 'all' ? rawView : 'active'
                return json(
                    response,
                    200,
                    options.database.listDownloadJobsPage({
                        view,
                        limit: Number(url.searchParams.get('limit') ?? 100),
                        offset: Number(url.searchParams.get('offset') ?? 0),
                        runner: url.searchParams.get('runner') === 'GITHUB'
                            ? 'GITHUB'
                            : url.searchParams.get('runner') === 'LOCAL'
                              ? 'LOCAL'
                              : undefined
                    })
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
                const runtime = options.service.startLocalDownloadQueue({
                    profile: (input.profile
                        ? String(input.profile)
                        : 'balanced') as
                        | 'conservative'
                        | 'balanced'
                        | 'fast'
                        | 'custom',
                    custom: performanceOverrides(input)
                })
                return json(response, 200, {
                    ...runtime,
                    summary: options.database.downloadJobSummary()
                })
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
                const issues = await scanRepairIssues(options.database)
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
