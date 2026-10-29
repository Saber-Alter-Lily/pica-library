import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { buildOfflineCoreCandidate } from '../../scripts/build-offline-core-candidate'
import { stageOfflineReaderAssetsQa } from '../../scripts/stage-offline-reader-assets-qa'

const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)
const environment = () => ({
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP
})
function run(binary: string, command: string, root: string,
    extra: string[] = []) {
    const proc = spawnSync(process.execPath, [
        binary, command, '--root', root, ...extra
    ], {
        encoding: 'utf8', timeout: 60_000,
        env: environment(), maxBuffer: 1024 * 1024
    })
    if (proc.error) throw proc.error
    if (proc.status !== 0)
        throw new Error(command + ' failed: ' + proc.stderr)
    return JSON.parse(proc.stdout) as Record<string, any>
}
async function start(binary: string, root: string) {
    const child = spawn(process.execPath,
        [binary, 'serve', '--root', root], {
            cwd: path.dirname(binary),
            env: environment(),
            stdio: ['ignore', 'pipe', 'pipe']
        })
    let errors = ''
    child.stderr.on('data', buffer => {
        errors += String(buffer).slice(0, 2048)
    })
    const state = await new Promise<Record<string, any>>((resolve, reject) => {
        let printed = '', settled = false
        const finish = (error?: Error, data?: Record<string, any>) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            if (error) reject(error)
            else resolve(data!)
        }
        const timeout = setTimeout(() =>
            finish(new Error('Offline QA HTTP did not start: ' + errors)), 20_000)
        child.stdout.on('data', buffer => {
            printed += String(buffer)
            if (!printed.includes('\n')) return
            const line = printed.slice(0, printed.indexOf('\n'))
            try {
                const parsed = JSON.parse(line) as Record<string, any>
                if (parsed.status !== 'OFFLINE_HTTP_QA_ONLY')
                    throw new Error('Unexpected offline QA startup')
                finish(undefined, parsed)
            } catch (error) {
                finish(error as Error)
            }
        })
        child.once('error', error => finish(error))
        child.once('exit', code =>
            finish(new Error('Offline QA exited ' + code + ': ' + errors)))
    })
    const stop = async () => {
        if (child.exitCode !== null || child.signalCode !== null) return
        await new Promise<void>(resolve => {
            const deadline = setTimeout(() => {
                child.kill('SIGKILL')
                resolve()
            }, 8_000)
            child.once('exit', () => {
                clearTimeout(deadline)
                resolve()
            })
            child.kill('SIGTERM')
        })
    }
    return { child, state, stop, errors: () => errors }
}
async function raw(hostname: string, port: number, target: string,
    headers: Record<string, string>) {
    return await new Promise<{ status: number; text: string }>((resolve, reject) => {
        const request = http.request({
            hostname, port, path: target, method: 'GET', headers
        }, response => {
            const bytes: Buffer[] = []
            response.on('data', item => bytes.push(Buffer.from(item)))
            response.once('end', () => resolve({
                status: response.statusCode ?? 0,
                text: Buffer.concat(bytes).toString('utf8')
            }))
        })
        request.once('error', reject)
        request.end()
    })
}

describe('S3 real protected loopback HTTP with existing Web Reader markup', () => {
    it('serves owned local books, original Reader routes and source-free browser assets without exposing a user profile', async () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'offline-http-core-'))
        let running: Awaited<ReturnType<typeof start>> | undefined
        try {
            const candidate = await buildOfflineCoreCandidate()
            const binary = path.join(home, 'core.mjs')
            fs.writeFileSync(binary, candidate.bytes, { flag: 'wx' })
            const staged = stageOfflineReaderAssetsQa(path.join(home, 'web'))
            expect(staged).toMatchObject({
                status: 'UNSIGNED_OFFLINE_READER_QA_ASSETS',
                sources: 0, count: 10, runnableAppReleased: false
            })
            const listed = fs.readdirSync(path.join(home, 'web'))
            expect(listed).toContain('reader-fragment.html')
            expect(listed).not.toContain('index.html')
            expect(listed).not.toContain('app.js')
            expect(listed).not.toContain('eh-account.js')
            const root = path.join(home, 'qa-library')
            const originals = path.join(home, 'originals')
            fs.mkdirSync(originals)
            fs.writeFileSync(path.join(originals, '01.png'), png)
            fs.writeFileSync(path.join(originals, '02.png'), png)
            run(binary, 'init', root, ['--confirm-disposable'])
            const book = run(binary, 'import', root, [
                '--path', originals, '--kind', 'folder', '--confirm'
            ])
            const comicId = book.comicId as string
            expect(comicId).toMatch(/^local:[0-9a-f]{64}$/)

            running = await start(binary, root)
            expect(running.state).toMatchObject({
                status: 'OFFLINE_HTTP_QA_ONLY',
                sources: 0, publishable: false
            })
            const entry = new URL(String(running.state.url))
            expect(entry.hostname).toBe('127.0.0.1')
            expect(entry.pathname).toMatch(/^\/qa\/[0-9a-f]{64}$/)
            const base = entry.origin
            const port = Number(entry.port)

            const noCookie = await fetch(base + '/api/v1/offline-qa/library')
            expect(noCookie.status).toBe(403)
            const noEntry = await fetch(base + '/')
            expect(noEntry.status).toBe(403)
            const opened = await fetch(entry)
            expect(opened.status).toBe(200)
            expect(opened.headers.get('content-security-policy'))
                .toContain("frame-ancestors 'none'")
            expect(opened.headers.get('referrer-policy')).toBe('no-referrer')
            const cookie = opened.headers.get('set-cookie')?.split(';')[0]
            expect(cookie).toMatch(/^pica_offline_qa=[0-9a-f]{64}$/)
            const html = await opened.text()
            expect(html).toContain('id="reader-pages"')
            expect(html).toContain('id="reader-chapters"')
            expect(html).toContain('id="reader-mode"')
            expect(html).toContain('offline-core-reader-qa.js')
            expect(html).not.toContain('setup-password')
            expect(html).not.toContain('app.js')
            expect(html).not.toContain('eh-account.js')
            const match = /"csrf":"([0-9a-f]{64})"/.exec(html)
            expect(match).not.toBeNull()
            const csrf = match![1]
            const get = async (route: string) => await fetch(base + route, {
                headers: { cookie: cookie! }
            })
            const listing = await get('/api/v1/offline-qa/library')
            expect(listing.status).toBe(200)
            const collection = await listing.json() as Record<string, any>
            expect(collection.sourceCount).toBe(0)
            expect(collection.comics).toHaveLength(1)
            expect(collection.comics[0].comicId).toBe(comicId)
            expect((await get('/api/v1/comics')).status).toBe(200)
            expect((await (await get('/api/v1/comics/' +
                encodeURIComponent(comicId))).json()).comicId).toBe(comicId)
            expect((await get('/api/v1/comics/' +
                encodeURIComponent('eh:123:abcdef1234'))).status).toBe(404)
            const query = async (body: unknown, headers: Record<string, string> = {
                origin: base, 'x-pica-qa-csrf': csrf
            }) => fetch(base + '/api/v1/library/query', {
                method: 'POST',
                headers: {
                    cookie: cookie!, 'content-type': 'application/json',
                    ...headers
                },
                body: JSON.stringify(body)
            })
            expect((await query({ scope: 'library' }, {})).status).toBe(403)
            expect((await query({ scope: 'library' }, {
                origin: 'https://other.example', 'x-pica-qa-csrf': csrf
            })).status).toBe(403)
            const filteredResponse = await query({
                scope: 'library', providerIds: ['local'], limit: 100
            })
            expect(filteredResponse.status).toBe(200)
            const filtered = await filteredResponse.json() as Record<string, any>
            expect(filtered.total).toBe(1)
            expect(filtered.items[0].comicId).toBe(comicId)
            expect(filtered.query.providerIds).toEqual(['local'])
            const missing = await query({
                scope: 'library', text: 'missing title'
            })
            expect((await missing.json() as Record<string, any>).total).toBe(0)
            expect((await query({
                scope: 'all', providerIds: ['eh']
            })).status).toBe(400)

            // Original production ShelfService over real local-only HTTP.
            expect(await (await get('/api/v1/shelves')).json()).toEqual([])
            const shelfRequest = async (
                suffix: string, method: string,
                input?: Record<string, unknown>,
                headers: Record<string, string> = {
                    origin: base, 'x-pica-qa-csrf': csrf
                }
            ) => fetch(base + '/api/v1/shelves' + suffix, {
                method, headers: {
                    cookie: cookie!,
                    ...(input ? { 'content-type': 'application/json' } : {}),
                    ...headers
                },
                ...(input ? { body: JSON.stringify(input) } : {})
            })
            expect((await shelfRequest('', 'POST', {
                name: 'Local QA shelf'
            }, {})).status).toBe(403)
            const createdResponse = await shelfRequest('', 'POST', {
                name: 'Local QA shelf'
            })
            expect(createdResponse.status).toBe(200)
            const shelf = await createdResponse.json() as { id: string }
            expect(shelf.id).toMatch(/^[0-9a-f-]{36}$/)
            const shelfUrl = '/' + encodeURIComponent(shelf.id)
            expect((await shelfRequest(shelfUrl + '/items', 'POST', {
                comicIds: ['eh:123:abcdef1234']
            })).status).toBe(400)
            expect((await shelfRequest(shelfUrl + '/items', 'POST', {
                comicIds: [comicId]
            })).status).toBe(200)
            const contents = await (await get('/api/v1/shelves' +
                shelfUrl)).json() as Record<string, any>
            expect(contents.items.map((row: any) => row.comicId))
                .toEqual([comicId])
            expect((await (await get('/api/v1/shelves')).json() as any[])[0])
                .toMatchObject({ count: 1 })
            expect((await shelfRequest(shelfUrl + '/add-filtered', 'POST', {
                query: { scope: 'all', providerIds: ['eh'] }
            })).status).toBe(400)
            expect((await shelfRequest(shelfUrl, 'PATCH', {
                name: 'Renamed local shelf'
            })).status).toBe(200)
            expect((await shelfRequest(shelfUrl + '/remove', 'POST', {
                comicIds: [comicId]
            })).status).toBe(200)
            expect((await shelfRequest(shelfUrl, 'DELETE')).status).toBe(200)
            expect(await (await get('/api/v1/shelves')).json()).toEqual([])
            // The local book survives changes to its shelf memberships.
            expect((await get('/api/v1/comics/' +
                encodeURIComponent(comicId))).status).toBe(200)

            const chaptersResponse = await get('/api/v1/reader/comics/' +
                encodeURIComponent(comicId) + '/chapters')
            expect(chaptersResponse.status).toBe(200)
            const chapters = await chaptersResponse.json() as Array<Record<string, any>>
            expect(chapters).toHaveLength(1)
            const episodeId = String(chapters[0].id)
            const chapterResponse = await get('/api/v1/reader/comics/' +
                encodeURIComponent(comicId) + '/chapters/' +
                encodeURIComponent(episodeId))
            const chapter = await chapterResponse.json() as Record<string, any>
            expect(chapter.pages).toHaveLength(2)
            const pageUrl = String(chapter.pages[0].url)
            expect(pageUrl).toMatch(/^\/api\/v1\/reader\/pictures\//)
            expect(pageUrl).toMatch(/\?v=[0-9a-f]{64}$/)
            const image = await get(pageUrl)
            expect(image.status).toBe(200)
            expect(image.headers.get('content-type')).toBe('image/png')
            expect(image.headers.get('cache-control')).toBe('private, no-store')
            expect(Buffer.from(await image.arrayBuffer())).toEqual(png)

            const js = await get('/offline-core-reader-qa.js')
            expect(js.status).toBe(200)
            const browserAdapter = await js.text()
            expect(browserAdapter).toContain('createReaderViewportTracker')
            expect(browserAdapter).toContain('readerPageIndex')
            expect(browserAdapter).toContain('recordReaderProgress')
            const originalControl = await get('/reader-input.js')
            expect(originalControl.status).toBe(200)
            expect((await originalControl.text())).toContain('readerKeyboardAction')
            const stylesheet = await get('/styles.css')
            expect(stylesheet.status).toBe(200)
            expect((await stylesheet.text())).toContain('.reader-pages')
            expect((await get('/app.js')).status).toBe(404)
            expect((await get('/api/v1/online-reader/progress')).status).toBe(404)
            expect((await get('/api/v1/reader/pictures/pic?v=not-a-sha')).status)
                .toBe(400)

            const body = JSON.stringify({
                comicId, episodeId, pageIndex: 1
            })
            const post = async (headers: Record<string, string>,
                payload = body) => await fetch(base + '/api/v1/reader/progress', {
                method: 'POST', headers: {
                    cookie: cookie!, 'content-type': 'application/json', ...headers
                }, body: payload
            })
            expect((await post({ origin: base })).status).toBe(403)
            expect((await post({
                origin: 'http://attacker.example',
                'x-pica-qa-csrf': csrf
            })).status).toBe(403)
            expect((await post({
                origin: base, 'x-pica-qa-csrf': csrf
            })).status).toBe(200)
            const history = await (await get('/api/v1/reader/progress')).json() as any[]
            expect(history[0]).toMatchObject({ comicId, episodeId, pageIndex: 1 })
            const afterProgress = await (await get(
                '/api/v1/reader/comics/' + encodeURIComponent(comicId) +
                '/chapters/' + encodeURIComponent(episodeId)
            )).json() as Record<string, any>
            expect(afterProgress.progress.pageIndex).toBe(1)
            expect((await post({
                origin: base, 'x-pica-qa-csrf': csrf
            }, JSON.stringify({ comicId, episodeId, pageIndex: 5 }))).status)
                .toBe(400)
            expect((await post({
                origin: base, 'x-pica-qa-csrf': csrf
            }, JSON.stringify({ comicId, episodeId, pageIndex: 0, extra: true }))).status)
                .toBe(400)
            expect((await raw('127.0.0.1', port,
                '/api/v1/offline-qa/library', {
                    Host: 'evil.example:' + port,
                    cookie: cookie!
                })).status).toBe(403)
            expect((await raw('127.0.0.1', port,
                '/api/v1/offline-qa/library', {
                    Host: '127.0.0.1:' + port,
                    cookie: cookie!, 'Sec-Fetch-Site': 'cross-site'
                })).status).toBe(403)
            // No user originals are rewritten by reading or progress.
            expect(fs.readFileSync(path.join(originals, '01.png'))).toEqual(png)
        } finally {
            await running?.stop()
            fs.rmSync(home, { recursive: true, force: true,
                maxRetries: 20, retryDelay: 150 })
        }
    }, 120_000)
})
