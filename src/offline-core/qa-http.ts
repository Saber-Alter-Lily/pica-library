import fs from 'node:fs'
import path from 'node:path'
import http, {
    type IncomingMessage, type Server, type ServerResponse
} from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { safePathSegment } from '../library/path-template'
import { verifiedFullWebQaAssets } from './full-web-qa-assets'
import { createCoreLibraryPorts, type CoreLocalRuntime } from '../library/core-runtime-composition'
import { localReaderGet } from '../reader/local-http-read'
import { coreCatalogueGet, coreCatalogueQuery } from '../library/core-catalog-read'
import { coreBootstrapStatus, coreBootstrapAuthors, coreBootstrapCapabilities } from '../library/core-bootstrap-read'
import { coreShelfMatch, coreShelfExecute } from '../library/core-shelf-routes'
import { coreLocalImportMatch, type CoreLocalPicker } from '../library/core-local-import'
import { ReadingLibrary, type ReadingLibraryPort } from '../library/reading-library'
import { catalogueReadingPort } from '../services/reading-library-adapters'
import type { LibraryFacetQuery } from '../library/types'
import type { LibraryDatabase } from '../library/database'
import type { ReaderService } from '../services/reader-service'
import type { SourceHostInspector } from '../source-hosts/inspector'
import type { SourceHostConnections } from '../source-hosts/connections'
import type { HostedLibraryReader } from '../source-hosts/library-reader'

/** Optional ports supplied only by a separate, explicitly launched user-Host
 * composition. Type-only dependencies keep default core binaries source/Host-free.
 */
export interface CoreUserHostPorts {
    inspector: SourceHostInspector
    connections: SourceHostConnections
    reader: HostedLibraryReader
}

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
    /** Reuse the same local runtime instance as the original Desktop/CLI. */
    coreRuntime?: CoreLocalRuntime
    /** Only the trusted Desktop composition root may supply this native UI. */
    localPicker?: CoreLocalPicker
    webRoot: string
    /** Never supplied by the normal pure-local source-free composition. */
    userHost?: CoreUserHostPorts
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
async function readJsonObject(request: IncomingMessage, maxBytes = 4096) {
    const type = String(request.headers['content-type'] ?? '')
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type))
        throw new Error('Invalid QA content type')
    const chunks: Buffer[] = []
    let count = 0
    for await (const item of request) {
        const buffer = Buffer.from(item)
        count += buffer.length
        if (count > maxBytes) throw new Error('QA request too large')
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
<label for="qa-library-search">查找本地书库 · Find local books</label>
<input id="qa-library-search" type="search" maxlength="200" autocomplete="off">
<button id="qa-library-search-button" type="button">查找 · Search</button>
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
/**
 * Exactly the existing Desktop Host control and Reader paths, invoked only
 * after the source-free QA cookie + loopback Host checks. No new Host protocol,
 * parser, source marketplace or network client; all requests use injected
 * SourceHostConnections / HostedLibraryReader.
 */
async function optionalUserHostRoute(
    request: IncomingMessage, response: ServerResponse, pathname: string,
    options: CoreUserHostPorts | undefined, origin: string, csrf: string
): Promise<boolean> {
    const prefix = '/api/v1/desktop/host-reader'
    const hosts = '/api/v1/desktop/source-hosts/'
    const hostReader = pathname === prefix || pathname.startsWith(prefix + '/')
    const hostSettings = [
        hosts + 'inspect', hosts + 'connections', hosts + 'inspect-saved'
    ].includes(pathname)
    if (!options || !hostReader && !hostSettings) return false

    const trustedPost = request.method === 'POST' &&
        request.headers.origin === origin &&
        request.headers['x-pica-csrf'] === csrf
    let referrer = ''
    try {
        referrer = new URL(String(request.headers.referer ?? '')).origin
    } catch { /* no referrer means no implicit image authority */ }
    const sameOriginGet = request.method === 'GET' &&
        request.headers['sec-fetch-site'] === 'same-origin' &&
        referrer === origin
    const image = /^\/api\/v1\/desktop\/host-reader\/[0-9a-f-]{36}\/comics\/[^/]+\/chapters\/[^/]+\/pages\/\d+$/.test(pathname)
    const implicitImage = image && sameOriginGet &&
        !request.headers.origin &&
        request.headers['sec-fetch-dest'] === 'image'
    const trustedGet = sameOriginGet &&
        request.headers['x-pica-csrf'] === csrf
    if (!trustedPost && !trustedGet && !implicitImage) {
        json(response, 403, { error: 'User Host authority required' })
        return true
    }
    const abort = new AbortController()
    const closed = () => { if (!response.writableEnded) abort.abort() }
    response.once('close', closed)
    try {
        if (hostSettings) {
            if (!trustedPost) throw Error('INVALID_SOURCE_HOST')
            const input = await readJsonObject(request, 16384)
            const result = pathname === hosts + 'inspect'
                ? await options.inspector.inspect(input, abort.signal)
                : pathname === hosts + 'inspect-saved'
                    ? await options.connections.inspect(input, abort.signal)
                    : options.connections.command(input)
            if (!response.destroyed) json(response, 200, result)
            return true
        }
        if (pathname === prefix) {
            if (!trustedPost) throw Error('INVALID_SOURCE_HOST')
            const command = await readJsonObject(request, 16384)
            const result = await options.reader.command(command, abort.signal)
            if (!response.destroyed) json(response, 200, result)
            return true
        }
        const route = pathname.match(
            /^\/api\/v1\/desktop\/host-reader\/([0-9a-f-]{36})\/(?:progress|comics\/([^/]+)\/chapters(?:\/([^/]+)(?:\/pages\/(\d+))?)?)$/
        )
        if (!route) throw Error('INVALID_SOURCE_HOST')
        const [, id, rawComic, rawChapter, page] = route
        if (!rawComic) {
            if (!trustedPost && !trustedGet)
                throw Error('INVALID_SOURCE_HOST')
            const input = request.method === 'POST'
                ? await readJsonObject(request, 4096) : {}
            if (request.method === 'POST' &&
                Object.keys(input).some(k =>
                    !['comicId', 'episodeId', 'pageIndex'].includes(k)))
                throw Error('INVALID_SOURCE_HOST')
            const value = await options.reader.read(
                id, request.method === 'POST' ? 'save-progress' : 'progress',
                input, abort.signal
            )
            if (!response.destroyed) json(response, 200, value)
            return true
        }
        if (request.method !== 'GET' || !trustedGet && !implicitImage)
            throw Error('INVALID_SOURCE_HOST')
        const comicId = decodeURIComponent(rawComic)
        const episodeId = rawChapter ? decodeURIComponent(rawChapter) : undefined
        if (page !== undefined) {
            const media = await options.reader.picture(
                id, comicId, episodeId!, Number(page), abort.signal
            )
            if (!response.destroyed) {
                response.writeHead(200, {
                    'content-type': media.contentType,
                    'cache-control': 'private, no-store',
                    'x-content-type-options': 'nosniff',
                    'cross-origin-resource-policy': 'same-origin'
                })
                response.end(media.data)
            }
            return true
        }
        const result = await options.reader.read(
            id, episodeId ? 'chapter' : 'chapters',
            { comicId, episodeId }, abort.signal
        )
        if (!response.destroyed) json(response, 200, result)
    } catch (error) {
        const candidate = error && typeof error === 'object' &&
            'code' in error && typeof error.code === 'string'
            ? error.code : error instanceof Error ? error.message : ''
        const code = /^(?:SOURCE_HOST_[A-Z_]+|INVALID_SOURCE_HOST)$/.test(candidate)
            ? candidate : 'SOURCE_HOST_UNAVAILABLE'
        const status = code === 'SOURCE_HOST_AUTH_REQUIRED' ? 401
            : code === 'SOURCE_HOST_SCOPE_REQUIRED' ? 403
            : ['SOURCE_HOST_CANCELLED', 'SOURCE_HOST_STALE',
                'SOURCE_HOST_DISABLED', 'SOURCE_HOST_BUSY',
                'SOURCE_HOST_DUPLICATE'].includes(code) ? 409
            : code === 'SOURCE_HOST_UNSUPPORTED' ? 422
            : code === 'SOURCE_HOST_TIMEOUT' ? 504
            : code === 'SOURCE_HOST_STORAGE' ? 503
            : ['INVALID_SOURCE_HOST', 'SOURCE_HOST_CONSENT_REQUIRED',
                'SOURCE_HOST_INSECURE', 'SOURCE_HOST_READER_CONSENT_REQUIRED',
                'SOURCE_HOST_SOURCE_SELECTION_REQUIRED',
                'SOURCE_HOST_DOWNLOAD_CONSENT_REQUIRED'].includes(code) ? 400
            : 502
        if (!response.destroyed) json(response, status, { code, error: code })
    } finally {
        response.removeListener('close', closed)
    }
    return true
}

export async function startOfflineCoreHttp(options: QaHttpOptions): Promise<{
    url: string
    close(): Promise<void>
}> {
    const webRoot = fs.realpathSync.native(options.webRoot)
    const fullWeb = verifiedFullWebQaAssets(webRoot, Boolean(options.userHost))
    if (options.userHost && !fullWeb)
        throw new Error('User Host requires explicitly reviewed full Web assets')
    const localPickerStatus = fullWeb && options.coreRuntime
        ? options.localPicker?.status() : undefined
    const capabilities = () => coreBootstrapCapabilities({
        kind: 'source-free' as const,
        desktopStatus: localPickerStatus
    })
    if (!fullWeb) {
        const markupFile = fs.existsSync(path.join(webRoot, 'reader-fragment.html'))
            ? 'reader-fragment.html' : 'index.html'
        for (const asset of [
            markupFile, ...SCRIPT_ASSETS, ...STYLE_ASSETS, ...IMAGE_ASSETS
        ]) requiredAsset(webRoot, asset)
    }

    const { libraryQueries, shelfService: shelves } = options.coreRuntime ??
        createCoreLibraryPorts(options.database)
    const secret = randomBytes(32).toString('hex')
    const csrf = randomBytes(32).toString('hex')
    const markup = fullWeb ? null : existingReaderMarkup(webRoot)
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
            (fullWeb ? "form-action 'self'; " : "form-action 'none'; ") +
            "frame-ancestors 'none'")
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
        // The real full Web homepage asks for up to 5000 LOCAL-only catalogue
        // rows on startup; allow only these reviewed GET parameters, not query
        // strings for arbitrary API or user-selected Host/source routes.
        const validFullCatalogueQuery = Boolean(fullWeb) &&
            request.method === 'GET' &&
            url.pathname === '/api/v1/comics' &&
            url.search.length <= 512 &&
            [...url.searchParams].every(([key, value]) =>
                ['q', 'author', 'tags', 'categories', 'finished', 'sort',
                    'limit', 'offset'].includes(key) && value.length <= 200
            ) &&
            ['limit', 'offset'].every(key =>
                !url.searchParams.has(key) ||
                /^(0|[1-9][0-9]{0,3})$/.test(
                    url.searchParams.get(key) ?? ''
                )
            )
        if (url.origin !== origin || url.hash ||
            (url.search !== '' && !validImageRevision &&
                !validFullCatalogueQuery))
            return json(response, 400, { error: 'Invalid QA request target' })
        if (request.method === 'GET' &&
            url.pathname === '/qa/' + secret) {
            response.setHeader('set-cookie',
                SESSION_NAME + '=' + secret +
                '; Path=/; HttpOnly; SameSite=Strict')
            if (fullWeb) {
                // Redirect to / after setting the same private session cookie:
                // original ./app.js and CSS URLs resolve from the real root.
                response.writeHead(303, { location: '/' })
                response.end()
            } else {
                response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
                response.end(page(markup!, csrf))
            }
            return
        }
        if (!hasCookie(request, secret))
            return json(response, 403, { error: 'QA session missing' })
        if (await optionalUserHostRoute(
            request, response, url.pathname, options.userHost, origin, csrf
        )) return
        let shelfRoute: ReturnType<typeof coreShelfMatch>
        try {
            shelfRoute = coreShelfMatch(request.method ?? '', url.pathname)
        } catch {
            return json(response, 400, { error: 'Invalid shelf URL' })
        }
        const localImportRoute = fullWeb && options.coreRuntime && options.localPicker
            ? coreLocalImportMatch(request.method ?? '', url.pathname)
            : null
        // Original Reader export, not another archive implementation. Only
        // source-free full Web's explicit user action may invoke it.
        const localExportFormat = fullWeb && request.method === 'POST'
            ? url.pathname === '/api/v1/reader/export-cbz' ? 'cbz'
                : url.pathname === '/api/v1/reader/export-zip' ? 'zip' : null
            : null
        if (request.method === 'GET') {
            if (fullWeb && url.pathname === '/') {
                const original = fullWeb.get('index.html')!.data.toString('utf8')
                // This session-only token is used by the ORIGINAL app.js on
                // explicit local requests, never persisted or sent cross-site.
                const html = original.replace('</head>',
                    '<meta name="pica-core-qa-csrf" content="' + csrf + '"></head>')
                // User-owned Host image tags require a genuine same-origin
                // Referer; keep the normal zero-network QA's no-referrer.
                if (options.userHost)
                    response.setHeader('referrer-policy', 'same-origin')
                response.writeHead(200, {
                    'content-type': 'text/html; charset=utf-8'
                })
                response.end(html)
                return
            }
            if (fullWeb && url.pathname === '/api/v1/desktop/status') {
                return json(response, 200, {
                    application: 'Pica Library',
                    version: capabilities().appVersion,
                    configured: true,
                    coreOnly: true,
                    startupReady: true,
                    csrfToken: csrf,
                    profile: 'balanced',
                    libraryDirectory: '',
                    picaAccount: { configured: false, enabled: false },
                    ehAccount: { configured: false, enabled: false },
                    externalSources: { schemaVersion: 1, revision: 0, enabled: [] },
                    remoteStorage: { configured: false, kind: 'webdav' },
                    ...(options.userHost ? {
                        sourceHostInspection: {
                            available: true, reader: false, libraryImport: false,
                            extensionInstall: false, persisted: false
                        },
                        sourceHostConnections: {
                            available: true,
                            storage: options.userHost.connections.snapshot().storage,
                            scope: 'inspect-only', reader: false
                        },
                        hostedLibraryReader: {
                            available: true, scope: 'explicit-session-library-read',
                            providerSearch: false, libraryImport: false,
                            extensionInstall: false,
                            downloads: options.userHost.reader.localDownloadsAvailable,
                            native: false
                        },
                        hostedSourceBrowser: {
                            available: true,
                            scope: 'explicit-session-selected-source-search-read',
                            providerSearch: true, libraryImport: false,
                            extensionInstall: false,
                            downloads: options.userHost.reader.localDownloadsAvailable,
                            native: false
                        }
                    } : {}),
                    nativePicker: localPickerStatus?.nativePicker ??
                        { folderPicker: false, savePicker: false },
                    runtime: localPickerStatus?.runtime ?? { mode: 'headless' }
                })
            }
            // These are the exact original Desktop bootstrap read ports,
            // with no ProviderService/online module in this physical binary.
            if (url.pathname === '/api/v1/status')
                return json(response, 200, coreBootstrapStatus(
                    options.database, null
                ))
            if (url.pathname === '/api/v1/capabilities')
                return json(response, 200, capabilities())
            if (url.pathname === '/api/v1/authors')
                return json(response, 200, coreBootstrapAuthors(options.database))
            const asset = url.pathname.slice(1)
            if (fullWeb && url.pathname === '/' + asset &&
                fullWeb.has(asset)) {
                const { data, contentType } = fullWeb.get(asset)!
                response.writeHead(200, {
                    'content-type': contentType,
                    'content-length': String(data.byteLength)
                })
                response.end(data)
                return
            }
            if (!fullWeb && (SCRIPT_ASSETS.has(asset) || STYLE_ASSETS.has(asset) ||
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
            if (shelfRoute) {
                try {
                    return json(response, 200, coreShelfExecute(
                        shelfRoute, shelves, {}, { localOnly: true }
                    ))
                } catch {
                    return json(response, 400,
                        { error: 'Invalid local shelf request' })
                }
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
        if (!shelfRoute && !localImportRoute && !localExportFormat &&
            (request.method !== 'POST' ||
            !['/api/v1/reader/progress', '/api/v1/library/query',
                '/api/v1/desktop/reading-library/query']
                .includes(url.pathname)))
            return json(response, 405, { error: 'Unsupported QA operation' })
        // The original full app uses x-pica-csrf for Desktop actions, while
        // this QA core already uses x-pica-qa-csrf for Reader/shelf writes.
        // Accept either only inside the same authenticated loopback session.
        const csrfHeader = fullWeb &&
            request.headers['x-pica-csrf'] !== undefined
                ? String(request.headers['x-pica-csrf'])
                : String(request.headers['x-pica-qa-csrf'] ?? '')
        if (request.headers.origin !== origin ||
            !secureEqual(csrfHeader, csrf))
            return json(response, 403, { error: 'QA CSRF rejected' })
        try {
            if (localExportFormat) {
                const input = await readJsonObject(request)
                if (Object.keys(input).sort().join(',') !== 'comicId,episodeId' ||
                    typeof input.comicId !== 'string' ||
                    !LOCAL_ID.test(input.comicId) ||
                    typeof input.episodeId !== 'string' ||
                    !CHAPTER_ID.test(input.episodeId) ||
                    !input.episodeId.startsWith(input.comicId + ':chapter:'))
                    throw new Error('Invalid source-free Reader export')
                const comic = options.database.getComic(input.comicId)
                const chapter = options.reader.chapters(input.comicId)
                    .find(row => row.id === input.episodeId)
                if (!comic || comic.providerId !== 'local' || !chapter)
                    throw new Error('Local Reader export is unavailable')
                // The native dialog is injected only by the trusted Desktop
                // composition root. Web never sends a destination path.
                const chooseSave = options.localPicker?.chooseSaveArchive
                let selected: string | null = null
                if (chooseSave) {
                    const defaultName = safePathSegment(
                        comic.title + ' - ' + chapter.title, 'Pica Library Comic'
                    ) + '.' + localExportFormat
                    selected = await chooseSave({
                        format: localExportFormat, defaultName
                    })
                    if (selected === null)
                        return json(response, 200, { cancelled: true })
                    if (typeof selected !== 'string' || !path.isAbsolute(selected) ||
                        path.extname(selected).toLowerCase() !== '.' + localExportFormat)
                        throw new Error('Invalid native export destination')
                }
                const value = localExportFormat === 'cbz'
                    ? options.reader.exportCbz(input.comicId, input.episodeId)
                    : options.reader.exportZip(input.comicId, input.episodeId)
                if (selected) {
                    await fs.promises.copyFile(value.path, selected)
                    return json(response, 200, { ...value, path: selected })
                }
                return json(response, 200, value)
            }
            if (localImportRoute && options.coreRuntime) {
                const input = await readJsonObject(request)
                const reply = await options.coreRuntime.localImport.http(
                    localImportRoute, input, options.localPicker
                )
                return json(response, reply.status, reply.value)
            }
            if (shelfRoute) {
                const input = shelfRoute.needsBody
                    ? await readJsonObject(request) : {}
                return json(response, 200, coreShelfExecute(
                    shelfRoute, shelves, input, {
                        localOnly: true,
                        // All QA shelf mutations remain in the sentinel-owned
                        // ephemeral SQLite. Never activate any provider.
                        recordUserEvents: events =>
                            options.database.recordUserEvents(events)
                    }
                ))
            }
            if (url.pathname === '/api/v1/library/query') {
                const input = await readJsonObject(request)
                return json(response, 200, coreCatalogueQuery(
                    input as LibraryFacetQuery,
                    libraryQueries,
                    { localOnly: true, fullWebQa: Boolean(fullWeb) }
                ))
            }
            if (url.pathname === '/api/v1/desktop/reading-library/query') {
                if (!fullWeb) throw new Error('Original Web UI is required')
                const input = await readJsonObject(request)
                if (Object.keys(input).some(key =>
                    !['query', 'hostSessionId'].includes(key)) ||
                    !Object.hasOwn(input, 'query'))
                    throw new Error('Invalid reading-library query')
                const hostId = input.hostSessionId
                if (hostId !== undefined && (
                    !options.userHost || typeof hostId !== 'string' ||
                    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(hostId)
                )) throw new Error('Unowned Host session')
                // The existing projection takes only already persisted local
                // progress and explicitly selected rows of one live Host
                // session. No source activation, network call or catalogue
                // import occurs on this query.
                const ports: ReadingLibraryPort[] = [
                    catalogueReadingPort('local',
                        () => options.database.recentReadingProgress(100)
                            .filter(row => LOCAL_ID.test(row.comicId)),
                        {
                            getComicsByIds: ids =>
                                options.database.getComicsByIds(ids).filter(
                                    comic => comic.providerId === 'local' &&
                                        LOCAL_ID.test(comic.comicId)
                                )
                        }, () => false)
                ]
                if (typeof hostId === 'string') ports.push({
                    id: 'selected-host',
                    snapshot: () => options.userHost!.reader.readingLibraryRows(
                        hostId
                    )
                })
                return json(response, 200,
                    new ReadingLibrary(ports).query(input.query))
            }
            const input = await readSmallJson(request)
            return json(response, 200, options.reader.saveProgress(
                input.comicId, input.episodeId, input.pageIndex
            ))
        } catch {
            return json(response, 400, { error: 'Invalid local QA mutation' })
        }
    })
    server.requestTimeout = options.userHost ? 20_000 : 10_000
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
