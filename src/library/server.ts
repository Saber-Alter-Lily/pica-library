import fs from 'node:fs'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FavoriteRecord, SortMode } from './types'
import { LibraryDatabase } from './database'
import { LibraryService } from './service'
import { organizeLibraryViews } from './organizer'

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

export async function startLibraryServer(options: {
    database: LibraryDatabase
    service: LibraryService
    host?: string
    port?: number
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
            if (url.pathname === '/api/v1/status' && request.method === 'GET') {
                return json(response, 200, {
                    mode: 'connected',
                    version: '2.0.0-alpha.1',
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
            if (
                url.pathname.startsWith('/api/v1/authors/') &&
                request.method === 'POST'
            ) {
                const authorId = decodeURIComponent(
                    url.pathname.split('/').at(-1) ?? ''
                )
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
                        seedCount: Number(input.seedCount ?? 8)
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
                const results = []
                for (const comicId of comicIds) {
                    results.push(
                        await options.service.downloadComic(comicId, {
                            episodeOrders,
                            concurrency: Number(input.concurrency ?? 5)
                        })
                    )
                }
                return json(response, 200, results)
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
            serveAsset(response, root, url.pathname)
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
