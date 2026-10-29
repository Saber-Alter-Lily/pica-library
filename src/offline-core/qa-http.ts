import fs from 'node:fs'
import path from 'node:path'
import http, {
    type IncomingMessage, type Server, type ServerResponse
} from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { localReaderGet } from '../reader/local-http-read'
import { coreCatalogueGet, coreCatalogueQuery } from '../library/core-catalog-read'
import { LibraryQueryService } from '../services/library-query-service'
import type { LibraryFacetQuery } from '../library/types'
import type { LibraryDatabase } from '../library/database'
import type { ReaderService } from '../services/reader-service'

/**
 * Disposable, browser-visible acceptance seam for the actual local Reader.
 *
 * This cannot connect any source or accept a preexisting v0.5.0 data root.
 * Its caller MUST check the owned QA root/sentinel before starting. This
 * small server is NOT the production Desktop Server, installer or a sandbox.
 */
interface QaHttpOptions {
    database: LibraryDatabase
    reader: ReaderService
    webRoot: string
}
const SCRIPT_ASSETS = new Set([
    'offline-core-reader-qa.js',
    'reader-input.js',
    'reader-progress.js',
    'reader-settings.js',
    'reader-viewport.js'
])
const STYLE_ASSETS = new Set([
    'styles.css',
    'ui-polish-v5.css',
    'alpha8-6.css'
])
const IMAGE_ASSETS = new Set(['pica-library-icon.webp'])
const SESSION_NAME = 'pica_offline_qa'
const LOCAL_ID = /^local:[0-9a-f]{64}$/
const CHAPTER_ID = /^local:[0-9a-f]{64}:chapter:[0-9a-f]{64}$/
const errorHeaders = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
}
function json(response: ServerResponse, status: number, value: unknown) {
    response.writeHead(status, errorHeaders)
    response.end(JSON.stringify(value))
}
function secureEqual(actual: string, expected: string) {
    if (!/^[0-9a-f]{64}$/.test(actual)) return false
    return timingSafeEqual(Buffer.from(actual, 'ascii'),
        Buffer.from(expected, 'ascii'))
}
function hasCookie(request: IncomingMessage, secret: string) {
    const text = request.headers.cookie ?? ''
    if (typeof text !== 'string' || text.length > 1024) return false
    const values = text.split(';').map(entry => entry.trim())
        .filter(entry => entry.startsWith(SESSION_NAME + '='))
    return values.length === 1 && secureEqual(
        values[0].slice(SESSION_NAME.length + 1), secret)
}
async function readJsonObject(request: IncomingMessage) {
    const type = String(request.headers['content-type'] ?? '')
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type))
        throw new Error('Invalid QA content type')
    const chunks: Buffer[] = []
    let count = 0
    for await (const item of request) {
        const buffer = Buffer.from(item)
        count += buffer.length
        if (count > 4096) throw new Error('QA request too large')
        chunks.push(buffer)
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!value || Array.isArray(value) || typeof value !== 'object')
        throw new Error('Invalid QA input')
    return value as Record<string, unknown>
}
async function readSmallJson(request: IncomingMessage) {
    const input = await readJsonObject(request)
    if (Object.keys(input).sort().join(',') !==
        'comicId,episodeId,pageIndex' ||
        typeof input.comicId !== 'string' ||
        !LOCAL_ID.test(input.comicId) ||
        typeof input.episodeId !== 'string' ||
        !CHAPTER_ID.test(input.episodeId) ||
        !input.episodeId.startsWith(input.comicId + ':') ||
        !Number.isSafeInteger(input.pageIndex) ||
        (input.pageIndex as number) < 0 ||
        (input.pageIndex as number) > 9999)
        throw new Error('Invalid QA progress')
    return {
        comicId: input.comicId,
        episodeId: input.episodeId,
        pageIndex: input.pageIndex as number
    }
}
function requiredAsset(webRoot: string, name: string) {
    if (!SCRIPT_ASSETS.has(name) && !STYLE_ASSETS.has(name) &&
        !IMAGE_ASSETS.has(name) && name !== 'index.html' &&
        name !== 'reader-fragment.html')
        throw new Error('Unexpected QA Web asset')
    const file = path.join(webRoot, name)
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 ||
        stat.size > 1024 * 1024)
        throw new Error('Invalid or linked QA Web asset')
    return file
}
/**
 * Take the exact existing Reader markup from index.html; the remaining
 * account/setup/recommendation UI is intentionally not mounted in this QA
 * shell. No second set of Reader markup/styles or provider scripts is copied.
 */
function existingReaderMarkup(webRoot: string) {
    const start = '<section id="reader" class="view reader-view">'
    const fragment = path.join(webRoot, 'reader-fragment.html')
    const staged = fs.existsSync(fragment)
    const html = staged
        ? fs.readFileSync(requiredAsset(webRoot, 'reader-fragment.html'), 'utf8')
        : fs.readFileSync(requiredAsset(webRoot, 'index.html'), 'utf8')
    const at = html.indexOf(start)
    const end = html.indexOf('</section>', at)
    if (at < 0 || end < 0 ||
        html.indexOf(start, at + start.length) >= 0 ||
        (staged && html.slice(end + '</section>'.length).trim()))
        throw new Error('Existing Reader markup is missing or ambiguous')
    const section = html.slice(at, end + '</section>'.length)
    for (const expected of [
        'id="reader-pages"', 'id="reader-chapters"',
        'id="reader-mode"', 'id="reader-direction"', 'id="reader-fit"',
        'id="reader-exit"', 'id="reader-message"'
    ]) if (!section.includes(expected))
        throw new Error('Existing Reader markup is incompatible')
    return section.replace(
        'id="reader" class="view reader-view"',
        'id="reader" class="view reader-view active"'
    )
}
function page(markup: string, csrf: string) {
    // csrf is random lowercase hexadecimal, never user-provided HTML.
    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pica Library · Local Reader QA</title>
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/alpha8-6.css">
<link rel="stylesheet" href="/ui-polish-v5.css">
</head><body>
<header class="app-header"><div class="app-brand">
<img class="app-brand-icon" src="/pica-library-icon.webp" alt="">
<div><h1>Pica Library</h1><p>本地阅读验证 · Local-only QA</p></div>
</div></header>
<main class="app-main">
<section id="qa-library" class="panel">
<h2>本地书库 · Offline books</h2>
<p>隔离测试目录，仅限本地文件夹和 CBZ。无账号、来源或推荐功能。</p>
<label for="qa-book">选择本地作品</label>
<select id="qa-book"></select>
<button id="qa-open" type="button">进入阅读</button>
<p id="qa-library-status" role="status"></p>
</section>
${markup}
</main>
<script id="offline-qa-bootstrap" type="application/json">{"csrf":"${csrf}"}</script>
<script type="module" src="/offline-core-reader-qa.js"></script>
</body></html>`
}
export async function startOfflineCoreHttp(options: QaHttpOptions): Promise<{
    url: string
    close(): Promise<void>
}> {
    const webRoot = fs.realpathSync.native(options.webRoot)
    const markupFile = fs.existsSync(path.join(webRoot, 'reader-fragment.html'))
        ? 'reader-fragment.html' : 'index.html'
    for (const asset of [
        markupFile, ...SCRIPT_ASSETS, ...STYLE_ASSETS, ...IMAGE_ASSETS
    ]) requiredAsset(webRoot, asset)

    const libraryQueries = new LibraryQueryService(options.database)
    const secret = randomBytes(32).toString('hex')
    const csrf = randomBytes(32).toString('hex')
    const markup = existingReaderMarkup(webRoot)
    let server: Server
    server = http.createServer(async (request, response) => {
        response.setHeader('cache-control', 'no-store')
        response.setHeader('x-content-type-options', 'nosniff')
        response.setHeader('x-frame-options', 'DENY')
        response.setHeader('referrer-policy', 'no-referrer')
        response.setHeader('cross-origin-resource-policy', 'same-origin')
        response.setHeader('content-security-policy',
            "default-src 'none'; script-src 'self'; style-src 'self'; " +
            "img-src 'self'; connect-src 'self'; base-uri 'none'; " +
            "form-action 'none'; frame-ancestors 'none'")
        const ownPort = request.socket.localPort
        const origin = 'http://127.0.0.1:' + ownPort
        if (!ownPort || request.headers.host !== '127.0.0.1:' + ownPort ||
            !['127.0.0.1', '::ffff:127.0.0.1']
                .includes(request.socket.remoteAddress ?? '') ||
            !['same-origin', 'none', undefined]
                .includes(request.headers['sec-fetch-site'] as string | undefined)) {
            return json(response, 403, { error: 'QA origin rejected' })
        }
        let url: URL
        try {
            url = new URL(request.url ?? '', origin)
        } catch {
            return json(response, 400, { error: 'Invalid QA path' })
        }
        // The existing local Reader appends a SHA-256 ?v= revision only to
        // owned page URLs. Preserve that exact cache-busting contract, but
        // reject all other query strings and ambiguous request targets.
        const validImageRevision = /^\/api\/v1\/reader\/pictures\/[^/]+$/.test(url.pathname) &&
            /^\?v=[a-f0-9]{64}$/.test(url.search)
        if (url.origin !== origin || url.hash ||
            (url.search !== '' && !validImageRevision))
            return json(response, 400, { error: 'Invalid QA request target' })
        if (request.method === 'GET' &&
            url.pathname === '/qa/' + secret) {
            response.setHeader('set-cookie',
                SESSION_NAME + '=' + secret +
                '; Path=/; HttpOnly; SameSite=Strict')
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
            response.end(page(markup, csrf))
            return
        }
        if (!hasCookie(request, secret))
            return json(response, 403, { error: 'QA session missing' })
        if (request.method === 'GET') {
            const asset = url.pathname.slice(1)
            if ((SCRIPT_ASSETS.has(asset) || STYLE_ASSETS.has(asset) ||
                IMAGE_ASSETS.has(asset)) && url.pathname === '/' + asset) {
                const file = requiredAsset(webRoot, asset)
                response.writeHead(200, {
                    'content-type': SCRIPT_ASSETS.has(asset)
                        ? 'text/javascript; charset=utf-8'
                        : STYLE_ASSETS.has(asset)
                            ? 'text/css; charset=utf-8' : 'image/webp'
                })
                fs.createReadStream(file).pipe(response)
                return
            }
            const catalogueRead = coreCatalogueGet(
                url, options.database, { localOnly: true }
            )
            if (catalogueRead)
                return json(response, catalogueRead.status, catalogueRead.value)
            if (url.pathname === '/api/v1/offline-qa/library') {
                const comics = options.database.listComics({ limit: 100 })
                    .filter(comic => comic.providerId === 'local')
                    .map(comic => ({
                        comicId: comic.comicId,
                        title: comic.title,
                        pagesCount: comic.pagesCount
                    }))
                return json(response, 200, { comics, sourceCount: 0 })
            }
            try {
                const result = localReaderGet(url.pathname, options.reader)
                if (result?.kind === 'json')
                    return json(response, 200, result.value)
                if (result?.kind === 'image') {
                    response.writeHead(200, {
                        'content-type': result.contentType,
                        'content-length': String(result.data.byteLength),
                        'cache-control': result.cacheControl,
                        'x-content-type-options': 'nosniff'
                    })
                    response.end(result.data)
                    return
                }
            } catch {
                return json(response, 404, { error: 'Local QA reader item unavailable' })
            }
            return json(response, 404, { error: 'No source routes in offline QA' })
        }
        if (request.method !== 'POST' ||
            !['/api/v1/reader/progress', '/api/v1/library/query']
                .includes(url.pathname))
            return json(response, 405, { error: 'Unsupported QA operation' })
        if (request.headers.origin !== origin ||
            !secureEqual(String(request.headers['x-pica-qa-csrf'] ?? ''), csrf))
            return json(response, 403, { error: 'QA CSRF rejected' })
        try {
            if (url.pathname === '/api/v1/library/query') {
                const input = await readJsonObject(request)
                return json(response, 200, coreCatalogueQuery(
                    input as LibraryFacetQuery,
                    libraryQueries,
                    { localOnly: true }
                ))
            }
            const input = await readSmallJson(request)
            return json(response, 200, options.reader.saveProgress(
                input.comicId, input.episodeId, input.pageIndex
            ))
        } catch {
            return json(response, 400, { error: 'Invalid local QA progress' })
        }
    })
    server.requestTimeout = 10_000
    server.headersTimeout = 10_000
    server.maxRequestsPerSocket = 500
    try {
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject)
            server.listen(0, '127.0.0.1', () => {
                server.off('error', reject)
                resolve()
            })
        })
    } catch (error) {
        server.closeAllConnections()
        throw error
    }
    const address = server.address()
    if (!address || typeof address === 'string')
        throw new Error('Offline QA listener address is invalid')
    return {
        url: 'http://127.0.0.1:' + address.port + '/qa/' + secret,
        close: () => new Promise<void>((resolve, reject) => {
            server.closeAllConnections()
            server.close(error => error ? reject(error) : resolve())
        })
    }
}
