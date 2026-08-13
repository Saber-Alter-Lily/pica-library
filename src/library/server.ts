import fs from 'node:fs'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FavoriteRecord, SortMode } from './types'
import { LibraryDatabase } from './database'
import { LibraryService } from './service'
import { organizeLibraryViews } from './organizer'
import { queueRepairs, scanRepairIssues } from '../maintenance/repair'
import { queueUpdate } from '../maintenance/updates'
import type { DownloadSource } from '../core/downloads/types'
import { PRODUCT_VERSION } from '../version'

export interface DesktopServerController {
    csrfToken: string
    configured: () => boolean
    status: () => Record<string, unknown>
    save: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
    testConnection: (
        input: Record<string, unknown>
    ) => Promise<Record<string, unknown>>
    detectProxy?: () => Promise<Record<string, unknown>>
    chooseFolder: () => Promise<string | null>
    exportBrowserLitePackage: () => Promise<Record<string, unknown>>
    openDirectory: (kind: string) => Promise<void>
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
}) {
    const root = webRoot()
    const host = options.host ?? '127.0.0.1'
    const port = options.port ?? 4789
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
                return json(response, 200, await options.desktop.detectProxy())
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
                    summary: options.database.summary()
                })
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
                        true
                    )
                )
            }
            if (url.pathname === '/api/v1/sync' && request.method === 'POST') {
                return json(
                    response,
                    200,
                    await options.service.syncFavorites()
                )
            }
            if (
                url.pathname === '/api/v1/search' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
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
                        seedCount: Number(input.seedCount ?? 12)
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
