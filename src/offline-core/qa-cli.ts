/**
 * S3 physical source-free *QA core* entry. It reuses the existing local
 * ingestion/database/Reader; it is neither a replacement Desktop application
 * nor a release candidate. It may open ONLY a freshly initialized disposable
 * QA root carrying our exact sentinel. Never touch a v0.5.0 user's data.
 *
 * No LibraryService, ProviderService, SDK, network client, Host, workers or
 * sign/install capability. An explicit, loopback-only QA HTTP service
 * may be launched after checking its isolated data root; no content or
 * executable code is downloaded.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { LibraryDatabase } from '../library/database'
import { createCoreLocalRuntime } from '../library/core-runtime-composition'
import { localReaderGet } from '../reader/local-http-read'
import { startOfflineCoreHttp } from './qa-http'
import {
    assertDisposableCoreRoot,
    OFFLINE_QA_SENTINEL,
    OFFLINE_QA_SENTINEL_TEXT
} from './qa-ownership'

const COMMANDS = new Set([
    'init', 'status', 'list', 'import', 'chapters', 'chapter',
    'picture', 'progress', 'history', 'serve'
])
const FLAGS = new Set([
    'root', 'confirm-disposable', 'confirm', 'path', 'kind', 'comic-id',
    'episode-id', 'picture-id', 'page-index'
])
const BOOLEAN = new Set(['confirm-disposable', 'confirm'])

function options(argv: string[]) {
    const command = argv.shift()
    if (!command || !COMMANDS.has(command))
        throw new Error('Unsupported offline QA core command')
    const values = new Map<string, string>()
    for (let i = 0; i < argv.length; i++) {
        const name = argv[i]
        if (!name.startsWith('--') || !FLAGS.has(name.slice(2)))
            throw new Error('Unknown offline QA core argument')
        const key = name.slice(2)
        if (values.has(key)) throw new Error('Duplicate offline QA argument')
        if (BOOLEAN.has(key)) values.set(key, 'true')
        else {
            const value = argv[++i]
            if (!value || value.startsWith('--') || value.includes('\0') ||
                value.length > 4096)
                throw new Error('Missing or invalid offline QA argument')
            values.set(key, value)
        }
    }
    const permitted: Record<string, string[]> = {
        init: ['root', 'confirm-disposable'],
        status: ['root'],
        list: ['root'],
        import: ['root', 'path', 'kind', 'confirm'],
        chapters: ['root', 'comic-id'],
        chapter: ['root', 'comic-id', 'episode-id'],
        picture: ['root', 'picture-id'],
        progress: ['root', 'comic-id', 'episode-id', 'page-index', 'confirm'],
        history: ['root'],
        serve: ['root']
    }
    if ([...values.keys()].some(key => !permitted[command].includes(key)))
        throw new Error('Argument not supported by this QA command')
    const required = (key: string) => {
        const result = values.get(key)
        if (!result) throw new Error('Missing required QA argument: ' + key)
        return result
    }
    const root = required('root')
    if (!path.isAbsolute(root))
        throw new Error('QA data root must be absolute')
    return { command, values, required, root: path.resolve(root) }
}

async function run() {
    const input = options(process.argv.slice(2))
    const { command, root, values, required } = input
    if (command === 'init') {
        if (!values.has('confirm-disposable'))
            throw new Error('Disposable QA initialization needs explicit confirmation')
        // mkdir is exclusive. Existing user libraries and prior QA roots are
        // NEVER migrated or overwritten, even if they resemble our paths.
        fs.mkdirSync(root, { mode: 0o700 })
        const marker = path.join(root, OFFLINE_QA_SENTINEL)
        fs.writeFileSync(marker, OFFLINE_QA_SENTINEL_TEXT, { flag: 'wx', mode: 0o600 })
        const db = new LibraryDatabase(path.join(root, 'library.db'))
        try {
            return { status: 'QA_INITIALIZED', sourceCount: 0,
                summary: db.summary() }
        } finally { db.close() }
    }
    assertDisposableCoreRoot(root)
    const db = new LibraryDatabase(path.join(root, 'library.db'))
    const coreRuntime = createCoreLocalRuntime({ database: db, dataDir: root })
    const reader = coreRuntime.readerService
    // Exercise the EXACT original Desktop GET route contract, not parallel
    // read behavior in an offline-only pseudo Reader.
    const get = (route: string) => localReaderGet(route, reader)
    try {
        if (command === 'serve') {
            const http = await startOfflineCoreHttp({
                database: db, reader, coreRuntime,
                // A real staged QA candidate serves only its own reviewed
                // Reader assets, independent of cwd/repository checkout.
                // Unstaged developer fixtures may use the existing repo Web.
                // Never accept a user/HTTP-selected asset root.
                webRoot: fs.existsSync(path.join(
                    path.dirname(path.resolve(process.argv[1])), 'web',
                    'reader-fragment.html')) || fs.existsSync(path.join(
                    path.dirname(path.resolve(process.argv[1])), 'web',
                    'full-web-qa-manifest.json'))
                    ? path.join(path.dirname(path.resolve(process.argv[1])), 'web')
                    : path.resolve(process.cwd(), 'web')
            })
            process.stdout.write(JSON.stringify({
                status: 'OFFLINE_HTTP_QA_ONLY', url: http.url,
                sources: 0, publishable: false
            }) + '\n')
            await new Promise<void>(resolve => {
                process.once('SIGINT', () => resolve())
                process.once('SIGTERM', () => resolve())
            })
            await http.close()
            return { status: 'OFFLINE_HTTP_QA_STOPPED' }
        }
        if (command === 'status')
            return { status: 'OFFLINE_QA_ONLY', summary: db.summary() }
        if (command === 'list')
            return { comics: db.listComics({ limit: 100 })
                .filter(comic => comic.providerId === 'local')
                .map(comic => ({
                    comicId: comic.comicId,
                    title: comic.title,
                    pagesCount: comic.pagesCount
                })) }
        if (command === 'import') {
            if (!values.has('confirm'))
                throw new Error('Import needs explicit confirmation')
            const kind = required('kind')
            if (kind !== 'folder' && kind !== 'cbz')
                throw new Error('Invalid local import kind')
            const source = required('path')
            if (!path.isAbsolute(source))
                throw new Error('Local QA import path must be absolute')
            // Same source-neutral selection/confirmation controller as the
            // production Desktop, with an explicitly confirmed CLI path
            // (never a remotely submitted HTTP filesystem path).
            const preview = await coreRuntime.localImport.previewChosen(
                kind, async () => source
            )
            if ('cancelled' in preview)
                throw new Error('Disposable local import was cancelled')
            return await coreRuntime.localImport.confirm(preview.token)
        }
        if (command === 'chapters') {
            const result = get('/api/v1/reader/comics/' +
                encodeURIComponent(required('comic-id')) + '/chapters')
            if (!result || result.kind !== 'json')
                throw new Error('Offline Reader chapters route unavailable')
            return { chapters: result.value }
        }
        if (command === 'chapter') {
            const result = get('/api/v1/reader/comics/' +
                encodeURIComponent(required('comic-id')) + '/chapters/' +
                encodeURIComponent(required('episode-id')))
            if (!result || result.kind !== 'json')
                throw new Error('Offline Reader chapter route unavailable')
            return result.value
        }
        if (command === 'picture') {
            // The QA command only proves the existing file Reader can access
            // the page; do not print binary copyrighted/user media to stdout.
            const picture = get('/api/v1/reader/pictures/' +
                encodeURIComponent(required('picture-id')))
            if (!picture || picture.kind !== 'image')
                throw new Error('Offline Reader picture route unavailable')
            return {
                contentType: picture.contentType,
                bytes: picture.data.length,
                sha256: createHash('sha256').update(picture.data).digest('hex')
            }
        }
        if (command === 'progress') {
            if (!values.has('confirm'))
                throw new Error('Progress write needs explicit confirmation')
            const raw = required('page-index')
            if (!/^(0|[1-9]\d{0,4})$/.test(raw))
                throw new Error('Invalid QA reader page index')
            return reader.saveProgress(
                required('comic-id'), required('episode-id'), Number(raw))
        }
        if (command === 'history') {
            const result = get('/api/v1/reader/progress')
            if (!result || result.kind !== 'json')
                throw new Error('Offline Reader progress route unavailable')
            return { readingProgress: result.value }
        }
        throw new Error('Unsupported offline QA command')
    } finally { db.close() }
}

void run()
    .then(value => process.stdout.write(JSON.stringify(value) + '\n'))
    .catch(error => {
        process.stderr.write(
            'OFFLINE_CORE_QA_REJECTED: ' +
            (error instanceof Error ? error.message : String(error)) + '\n')
        process.exitCode = 1
    })
