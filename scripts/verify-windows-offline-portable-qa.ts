/**
 * Actual Windows x64 ZIP extraction + bundled-node offline Reader smoke.
 * No signed install, OS sandbox, user-profile migration, source activation,
 * network source, release upload or OTA side effects.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import AdmZip from 'adm-zip'

function digest(bytes: Uint8Array) {
    return createHash('sha256').update(bytes).digest('hex')
}
const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)
function env() {
    return {
        PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP, TMP: process.env.TMP
    }
}
function invoke(binary: string, core: string, command: string,
    root: string, rest: string[] = []) {
    const child = spawnSync(binary, [
        core, command, '--root', root, ...rest
    ], { encoding: 'utf8', timeout: 45_000, env: env(), windowsHide: true })
    if (child.error) throw child.error
    return {
        code: child.status ?? -1,
        stdout: String(child.stdout ?? ''),
        stderr: String(child.stderr ?? '')
    }
}
function succeeded(binary: string, core: string, command: string,
    root: string, rest: string[] = []) {
    const outcome = invoke(binary, core, command, root, rest)
    if (outcome.code !== 0)
        throw new Error('Portable QA command failed ' + command + ': ' + outcome.stderr)
    return JSON.parse(outcome.stdout) as Record<string, any>
}
function readJson(bytes: Uint8Array) {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, any>
}
async function startServerThroughPortableLauncher(
    launcher: string, root: string, cwd: string
) {
    // Execute the real packaged .cmd instead of reconstructing its runtime
    // invocation in the test harness. The official Node runtime was already
    // version-checked directly before this call.
    const child = spawn('cmd.exe', ['/d', '/c', launcher, root], {
        cwd, windowsHide: true, env: env(),
        stdio: ['ignore', 'pipe', 'pipe']
    })
    let errors = ''
    child.stderr.on('data', part => { errors += String(part).slice(0, 1400) })
    const state = await new Promise<{ url: string }>((resolve, reject) => {
        let emitted = '', done = false
        const timeout = setTimeout(() =>
            finish(new Error('Portable launcher HTTP timed out ' + errors)), 20_000)
        const finish = (error?: Error, value?: { url: string }) => {
            if (done) return
            done = true
            clearTimeout(timeout)
            if (error) reject(error)
            else resolve(value!)
        }
        child.stdout.on('data', part => {
            emitted += String(part)
            const end = emitted.indexOf('\n')
            if (end < 0) return
            try {
                const response = JSON.parse(emitted.slice(0, end).trim())
                if (response.status !== 'OFFLINE_HTTP_QA_ONLY' ||
                    typeof response.url !== 'string' ||
                    !/^http:\/\/127\.0\.0\.1:\d+\/qa\/[a-f0-9]{64}$/.test(response.url))
                    throw new Error('Unexpected portable launcher listener')
                finish(undefined, { url: response.url })
            } catch (e) { finish(e as Error) }
        })
        child.once('error', error => finish(error))
        child.once('exit', code => finish(new Error(
            'Portable launcher exited ' + code + ': ' + errors)))
    })
    const stop = async () => {
        if (child.exitCode !== null || child.signalCode !== null) return
        const awaitingExit = new Promise<void>(resolve => {
            const timer = setTimeout(() => {
                child.kill('SIGKILL')
                resolve()
            }, 10_000)
            child.once('exit', () => {
                clearTimeout(timer)
                resolve()
            })
        })
        // On Windows, killing only cmd.exe can orphan its node.exe child.
        // Kill the complete ephemeral process tree and verify SQLite recovery
        // with a NEW process afterward, never touching a real user database.
        const kill = spawnSync('taskkill.exe', [
            '/PID', String(child.pid), '/T', '/F'
        ], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
        if (kill.error || kill.status !== 0) child.kill('SIGKILL')
        await awaitingExit
    }
    return { state, stop }
}

async function forgedHost(host: string, port: number, cookie: string) {
    return await new Promise<number>((resolve, reject) => {
        const request = http.request({
            hostname: '127.0.0.1', port, method: 'GET',
            path: '/api/v1/offline-qa/library',
            headers: { Host: host, cookie }
        }, response => {
            response.resume()
            response.once('end', () => resolve(response.statusCode ?? 0))
        })
        request.once('error', reject)
        request.end()
    })
}

export async function verifyWindowsOfflinePortableQa(zipFile: string,
    expectedSourceSha: string) {
    if (process.platform !== 'win32' || process.arch !== 'x64')
        throw new Error('This executable ZIP test requires Windows x64')
    if (!/^[0-9a-f]{40}$/.test(expectedSourceSha))
        throw new Error('Missing exact Git source SHA')
    const zip = new AdmZip(zipFile)
    const zipEntries = zip.getEntries()
    if (zipEntries.some(entry => entry.isDirectory ||
        !/^[A-Za-z0-9_.\-/]+$/.test(entry.entryName) ||
        entry.entryName.split('/').some(part =>
            !part || part === '.' || part === '..')))
        throw new Error('Invalid or traversing QA ZIP path')
    const contents = new Map(zipEntries.map(entry => [
        entry.entryName, entry.getData()
    ] as const))
    if (contents.size !== zipEntries.length ||
        !contents.has('BUILD-MANIFEST.json'))
        throw new Error('Untrusted QA ZIP inventory')
    const manifest = readJson(contents.get('BUILD-MANIFEST.json')!)
    if (manifest.schemaVersion !== 1 ||
        manifest.label !== 'UNSIGNED_S3_WINDOWS_X64_PORTABLE_QA_ONLY' ||
        manifest.sourceSha !== expectedSourceSha ||
        manifest.runtimeVersion !== '24.15.0' ||
        manifest.sourceCount !== 0 ||
        manifest.executableSourceFree !== true ||
        manifest.publishAuthorized !== false ||
        manifest.userInstallable !== false ||
        manifest.signed !== false ||
        manifest.otaChanged !== false ||
        !/^[0-9a-f]{64}$/.test(manifest.verifiedNodeArchiveSha256) ||
        !Array.isArray(manifest.files) ||
        manifest.files.length !== 20 ||
        contents.size !== manifest.files.length + 1)
        throw new Error('Unexpected source-free portable QA manifest')
    const seen = new Set<string>()
    for (const row of manifest.files) {
        if (!row || typeof row.path !== 'string' ||
            seen.has(row.path) || !contents.has(row.path) ||
            row.bytes !== contents.get(row.path)!.length ||
            row.sha256 !== digest(contents.get(row.path)!))
            throw new Error('Portable QA ZIP file hash or identity mismatch')
        seen.add(row.path)
    }
    if ([...contents.keys()].some(name =>
        !seen.has(name) && name !== 'BUILD-MANIFEST.json'))
        throw new Error('Unaccounted executable bytes in QA ZIP')
    for (const forbidden of [
        'app/desktop.js', 'app/pica-library.js', 'web/index.html',
        'app/web/app.js', 'app/web/eh-account.js',
        'app/web/jm-account.js', 'app/web/recommendation-v5.js',
        'runtime/jm/bin/java.exe', '.env.local', 'library.db'
    ]) if (contents.has(forbidden))
        throw new Error('Legacy source or user content entered portable QA ZIP')
    for (const required of [
        'app/core.mjs', 'runtime/node.exe', 'LICENSE',
        'NOTICE.md', 'UPSTREAM.md', 'DISCLAIMER.md',
        'licenses/Node.js-LICENSE.txt', 'licenses/AdmZip-LICENSE.txt',
        'Start-Offline-Reader-QA.cmd', 'README-OFFLINE-QA.txt',
        'app/web/reader-fragment.html',
        'app/web/offline-core-reader-qa.js'
    ]) if (!contents.has(required))
        throw new Error('Mandatory source-free QA file missing: ' + required)

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-s3-qa-extract-'))
    let running: Awaited<ReturnType<typeof startServerThroughPortableLauncher>> | undefined
    try {
        const unpacked = path.join(temp, 'unpacked')
        fs.mkdirSync(unpacked)
        zip.extractAllTo(unpacked, false, true)
        for (const row of manifest.files) {
            const bytes = fs.readFileSync(
                path.join(unpacked, ...row.path.split('/')))
            if (bytes.length !== row.bytes || digest(bytes) !== row.sha256)
                throw new Error('ZIP extraction changed QA packaged bytes')
        }
        const runtime = path.join(unpacked, 'runtime', 'node.exe')
        const core = path.join(unpacked, 'app', 'core.mjs')
        const version = spawnSync(runtime, ['--version'], {
            encoding: 'utf8', timeout: 10_000, windowsHide: true
        })
        if (version.error || version.status !== 0 ||
            version.stdout.trim() !== 'v24.15.0')
            throw new Error('Bundled official Node runtime cannot execute')
        const platform = spawnSync(runtime, [
            '-p', 'process.platform + ":" + process.arch'
        ], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
        if (platform.status !== 0 || platform.stdout.trim() !== 'win32:x64')
            throw new Error('Portable runtime is not Windows x64')

        const launcher = path.join(unpacked, 'Start-Offline-Reader-QA.cmd')
        const help = spawnSync('cmd.exe', [
            '/d', '/c', launcher
        ], { cwd: unpacked, encoding: 'utf8', timeout: 15_000 })
        if (help.error || help.status !== 2 ||
            !help.stdout.includes('OFFLINE_READER_QA_ONLY'))
            throw new Error('Portable launcher lacks explicit data-root gate')
        const root = path.join(temp, 'new-disposable-library')
        const originals = path.join(temp, 'source-images')
        fs.mkdirSync(originals)
        fs.writeFileSync(path.join(originals, '01.png'), png)
        fs.writeFileSync(path.join(originals, '02.png'), png)
        const unsafe = invoke(runtime, core, 'status', root)
        if (unsafe.code === 0)
            throw new Error('Portable core implicitly accessed unknown user root')
        const init = succeeded(runtime, core, 'init', root,
            ['--confirm-disposable'])
        if (init.status !== 'QA_INITIALIZED' || init.sourceCount !== 0)
            throw new Error('Unexpected portable initialization')

        const book = succeeded(runtime, core, 'import', root, [
            '--path', originals, '--kind', 'folder', '--confirm'
        ])
        if (!/^local:[0-9a-f]{64}$/.test(book.comicId) ||
            book.pages !== 2 || book.imported !== true)
            throw new Error('Official-runtime local folder import failed')
        const chapters = succeeded(runtime, core, 'chapters', root,
            ['--comic-id', book.comicId]).chapters as Array<Record<string, any>>
        if (chapters.length !== 1)
            throw new Error('Portable Reader lost the stored chapter')
        const episodeId = chapters[0].id as string
        const pages = succeeded(runtime, core, 'chapter', root, [
            '--comic-id', book.comicId, '--episode-id', episodeId
        ])
        if (pages.pages?.length !== 2)
            throw new Error('Portable Reader did not reconstruct owned pages')
        running = await startServerThroughPortableLauncher(launcher, root, temp)
        const entry = new URL(running.state.url)
        const origin = entry.origin
        if (entry.hostname !== '127.0.0.1')
            throw new Error('Portable QA network escaped loopback')
        if ((await fetch(origin + '/api/v1/offline-qa/library')).status !== 403)
            throw new Error('Portable QA browser was not session-gated')
        const opening = await fetch(entry)
        if (opening.status !== 200)
            throw new Error('Portable QA entry did not open')
        const cookie = opening.headers.get('set-cookie')?.split(';')[0]
        const html = await opening.text()
        if (!cookie || !/^pica_offline_qa=[0-9a-f]{64}$/.test(cookie) ||
            !html.includes('id="reader-pages"') ||
            html.includes('eh-account.js') ||
            html.includes('setup-password'))
            throw new Error('Portable Reader browser session or UI invalid')
        const get = (pathname: string) => fetch(origin + pathname, {
            headers: { cookie }
        })
        // This is the original production catalogue/facet API implemented
        // by the common source-neutral LibraryQueryService, not a parallel
        // in-memory QA filter. All source identities remain local-only.
        const books = await (await get('/api/v1/comics')).json() as any[]
        if (books.length !== 1 || books[0].comicId !== book.comicId)
            throw new Error('Portable original catalogue route failed')
        const search = await fetch(origin + '/api/v1/library/query', {
            method: 'POST',
            headers: {
                cookie, origin, 'content-type': 'application/json',
                'x-pica-qa-csrf': /"csrf":"([0-9a-f]{64})"/.exec(html)?.[1] ?? ''
            },
            body: JSON.stringify({ scope: 'library', providerIds: ['local'],
                text: 'source-images', limit: 100 })
        })
        if (search.status !== 200)
            throw new Error('Portable shared catalogue query not accessible')
        const searchValue = await search.json() as any
        if (searchValue.total !== 1 ||
            searchValue.items[0]?.comicId !== book.comicId ||
            searchValue.query?.providerIds?.[0] !== 'local')
            throw new Error('Portable shared catalogue query was not local-only')
        const refused = await fetch(origin + '/api/v1/library/query', {
            method: 'POST',
            headers: {
                cookie, origin, 'content-type': 'application/json',
                'x-pica-qa-csrf': /"csrf":"([0-9a-f]{64})"/.exec(html)?.[1] ?? ''
            },
            body: JSON.stringify({ scope: 'all', providerIds: ['eh'] })
        })
        if (refused.status !== 400)
            throw new Error('Portable catalogue accepted a foreign source')
        // Verify original ShelfService is also physically present in the
        // same extracted source-free ZIP, with explicit local-only authority.
        const shelfPost = async (path: string, input: Record<string, unknown>) =>
            fetch(origin + path, {
                method: 'POST',
                headers: {
                    cookie, origin, 'content-type': 'application/json',
                    'x-pica-qa-csrf': /"csrf":"([0-9a-f]{64})"/.exec(html)?.[1] ?? ''
                },
                body: JSON.stringify(input)
            })
        const shelfCreated = await shelfPost('/api/v1/shelves', {
            name: 'Owned portable shelf'
        })
        if (shelfCreated.status !== 200)
            throw new Error('Bundled ShelfService cannot create local shelves')
        const shelf = await shelfCreated.json() as { id: string }
        const pathToShelf = '/api/v1/shelves/' + encodeURIComponent(shelf.id)
        if ((await shelfPost(pathToShelf + '/items', {
            comicIds: ['eh:123:abcdef1234']
        })).status !== 400)
            throw new Error('Bundled core shelf allowed foreign source identity')
        if ((await shelfPost(pathToShelf + '/items', {
            comicIds: [book.comicId]
        })).status !== 200)
            throw new Error('Bundled core shelf cannot add local work')
        const shelfContents = await (await get(pathToShelf)).json() as any
        if (shelfContents.items.length !== 1 ||
            shelfContents.items[0].comicId !== book.comicId)
            throw new Error('Bundled core shelf lost owned local work')
        const asset = await get('/offline-core-reader-qa.js')
        if (asset.status !== 200 || !(await asset.text()).includes(
            'createReaderViewportTracker'))
            throw new Error('Portable Reader browser asset unavailable')
        if ((await get('/app.js')).status !== 404 ||
            (await get('/api/v1/online-reader/progress')).status !== 404)
            throw new Error('Portable QA accidentally exposes online app routes')
        const chaptersHttp = await get('/api/v1/reader/comics/' +
            encodeURIComponent(book.comicId) + '/chapters')
        if (chaptersHttp.status !== 200)
            throw new Error('Reader chapter GET unavailable after ZIP extract')
        const chapterHttp = await get('/api/v1/reader/comics/' +
            encodeURIComponent(book.comicId) + '/chapters/' +
            encodeURIComponent(episodeId))
        const page = (await chapterHttp.json() as any).pages[0].url as string
        const image = await get(page)
        if (image.status !== 200 ||
            !Buffer.from(await image.arrayBuffer()).equals(png))
            throw new Error('Portable QA image bytes differ from original')
        const csrf = /"csrf":"([0-9a-f]{64})"/.exec(html)?.[1]
        if (!csrf) throw new Error('Portable QA CSRF bootstrap missing')
        const body = JSON.stringify({
            comicId: book.comicId, episodeId, pageIndex: 1
        })
        const post = await fetch(origin + '/api/v1/reader/progress', {
            method: 'POST',
            headers: {
                cookie, 'content-type': 'application/json',
                origin, 'x-pica-qa-csrf': csrf
            },
            body
        })
        if (post.status !== 200)
            throw new Error('Portable QA Reader progress was not saved')
        const history = await (await get('/api/v1/reader/progress')).json() as any[]
        if (history[0]?.comicId !== book.comicId ||
            history[0]?.pageIndex !== 1)
            throw new Error('Portable QA HTTP progress not owned or persisted')
        if (await forgedHost('rebind.invalid:' + entry.port,
            Number(entry.port), cookie) !== 403)
            throw new Error('Portable loopback Host boundary failed')
        await running.stop()
        running = undefined
        const persisted = succeeded(runtime, core, 'chapter', root, [
            '--comic-id', book.comicId, '--episode-id', episodeId
        ])
        if (persisted.progress?.pageIndex !== 1)
            throw new Error('Portable Reader lost progress across process restart')
        if (!fs.readFileSync(path.join(originals, '01.png')).equals(png))
            throw new Error('Portable QA modified original page input')
        return {
            status: 'WINDOWS_X64_EXTRACTED_PORTABLE_QA_PASS',
            files: contents.size,
            zipSha256: digest(fs.readFileSync(zipFile)),
            runtimeVersion: manifest.runtimeVersion,
            sourceSha: expectedSourceSha,
            sourceCount: 0,
            actualOldReaderRoutes: true,
            verifiedProgressRestart: true,
            originalSourcePreserved: true,
            userInstallable: false,
            publishAuthorized: false
        }
    } finally {
        await running?.stop()
        fs.rmSync(temp, { recursive: true, force: true,
            maxRetries: 20, retryDelay: 150 })
    }
}
async function main() {
    const args = process.argv.slice(2)
    if (args.length !== 4 || args[0] !== '--zip' ||
        args[2] !== '--source-sha')
        throw new Error('Expected fixed temporary ZIP and exact source SHA')
    process.stdout.write(JSON.stringify(
        await verifyWindowsOfflinePortableQa(args[1], args[3]), null, 2
    ) + '\n')
}
if (process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    main().catch(error => {
        process.stderr.write(
            (error instanceof Error ? error.message : String(error)) + '\n')
        process.exitCode = 1
    })
