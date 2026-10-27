import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import { LibraryDatabase } from '../../src/library/database'
import { HostedLibraryReader } from '../../src/source-hosts/library-reader'
import { SourceHostConnections } from '../../src/source-hosts/connections'
import { SourceHostInspector } from '../../src/source-hosts/inspector'
import { sourceHostHttp } from '../../src/source-hosts/http-transport'
import { sourceHostStore } from '../../src/desktop/source-host-store'
import { SUWAYOMI_QUERIES, suwayomiServer } from '../../src/source-hosts/suwayomi'
import { HOST_READER_OPERATIONS, HOST_DISCOVERY_OPERATIONS } from '../../src/source-hosts/reader-protocol'
import { PreviewCacheManager } from '../../src/services/preview-cache-manager'
import { ReaderService } from '../../src/services/reader-service'
import { LocalLibraryIngestion } from '../../src/local-library/ingestion'
import { RuntimeResourceCoordinator } from '../../src/runtime/resource-coordinator'
// @ts-expect-error Pure CI fixture, not an application SDK.
import { assertRealHostCi, checkedOwnedRealHostRoot, REAL_HOST_KIND, REAL_HOST_JAR_SHA256, REAL_HOST_JAR_BYTES, realHostJavaArguments, syntheticHostPng } from './source-host-interop-fixture.mjs'

const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex')
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const signal = () => AbortSignal.timeout(30000)
const operations = { ...SUWAYOMI_QUERIES, ...HOST_READER_OPERATIONS, ...HOST_DISCOVERY_OPERATIONS }
const origin = 'http://127.0.0.1:4567'

function namespaceProof() {
    assert.equal(process.env.PICA_HOST_INTEROP_NETNS, '1')
    const current = fs.readlinkSync('/proc/self/ns/net')
    assert.match(process.env.PICA_HOST_OUTER_NETNS ?? '', /^net:\[\d+\]$/)
    assert.notEqual(current, process.env.PICA_HOST_OUTER_NETNS)
    assert.deepEqual(Object.keys(os.networkInterfaces()), ['lo'])
    const routes = fs.readFileSync('/proc/net/route', 'utf8').trim().split('\n').slice(1)
    assert.ok(routes.every(row => !row.trim() || row.split(/\s+/)[0] === 'lo'))
    return { isolatedNetworkNamespace: true, interfaces: ['lo'], externalRoute: false }
}
function ownedRoot(root: string, source: string) {
    checkedOwnedRealHostRoot(fs.realpathSync.native(os.tmpdir()), root)
    assert.equal(fs.realpathSync.native(root), root); assert.equal(fs.lstatSync(root).isSymbolicLink(), false)
    const marker = JSON.parse(fs.readFileSync(path.join(root, 'OWNED_FIXTURE.json'), 'utf8'))
    assert.equal(marker.kind, REAL_HOST_KIND); assert.equal(marker.sourceSha, source)
}
function offline(root: string, source: string) {
    ownedRoot(root, source)
    const expected = JSON.parse(fs.readFileSync(path.join(root, 'OFFLINE_EXPECTED.json'), 'utf8'))
    assert.equal(expected.sourceSha, source); assert.equal(expected.books.length, 2)
    const data = path.join(root, 'app-data'), database = new LibraryDatabase(path.join(data, 'library.db')), reader = new ReaderService(database, data)
    try {
        for (const book of expected.books) {
            const chapter = reader.chapter(book.comicId, book.episodeId)
            assert.equal(chapter.pages.length, 2); assert.equal(chapter.progress?.pageIndex, 1)
            assert.deepEqual(chapter.pages.map(page => hash(reader.picture(page.id).data)), book.pageHashes)
        }
    } finally { database.close() }
    return { status: 'PASS', freshNodeProcess: true, existingLocalReader: true, books: 2, bodyPages: 4, progressRetained: true, hostRunning: false }
}

export async function runRealHostInterop(args: string[]) {
    assertRealHostCi()
    const [mode, source, oldRoot] = args
    assert.ok(['main', 'offline'].includes(mode) && /^[a-f0-9]{40}$/.test(source ?? ''))
    assert.equal(source, process.env.GITHUB_SHA)
    const netProof = namespaceProof()
    if (mode === 'offline') { console.log(JSON.stringify(offline(oldRoot, source))); return }
    const sourceCheck = spawnSync('git', ['-c', 'safe.directory=' + process.cwd(), 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true })
    assert.equal(sourceCheck.status, 0); assert.equal(sourceCheck.stdout.trim(), source)
    const temp = fs.realpathSync.native(os.tmpdir()), root = fs.mkdtempSync(path.join(temp, 'pica-real-host-' + randomUUID().replaceAll('-', '')))
    fs.writeFileSync(path.join(root, 'OWNED_FIXTURE.json'), JSON.stringify({ kind: REAL_HOST_KIND, sourceSha: source }), { flag: 'wx' }); ownedRoot(root, source)
    const jar = fs.realpathSync.native(process.env.PICA_HOST_INTEROP_JAR!), runnerTemp = fs.realpathSync.native(process.env.RUNNER_TEMP!)
    assert.ok(jar.startsWith(runnerTemp + path.sep) && fs.statSync(jar).size === REAL_HOST_JAR_BYTES)
    assert.equal(hash(fs.readFileSync(jar)), REAL_HOST_JAR_SHA256)
    const java = fs.realpathSync.native(path.join(process.env.JAVA_HOME!, 'bin/java'))
    const evidence = path.resolve('artifacts/source-host-interop'); fs.mkdirSync(evidence, { recursive: true })
    const result: Record<string, any> = { kind: REAL_HOST_KIND, sourceSha: source, status: 'FAIL', step: 'prepare', ...netProof, upstreamJarSha256: REAL_HOST_JAR_SHA256,
        realUpstreamRuntime: false, syntheticBodiesOnly: true, thirdPartyExtensionsInstalled: false, realPlatformAccessed: false, credentialsUsed: false,
        localExecution: false, runtimeBundledWithPica: false, fullObjective: 'OPEN', secondRealProviderAccepted: false }
    let child: ChildProcess | undefined, childExited = false, database: LibraryDatabase | undefined, hosted: HostedLibraryReader | undefined, connections: SourceHostConnections | undefined
    let stopPromise: Promise<void> | undefined
    const stop = () => stopPromise ??= (async () => {
        if (!child || childExited) return
        const commandLine = fs.readFileSync(`/proc/${child.pid}/cmdline`, 'utf8')
        assert.ok(commandLine.includes(jar) && commandLine.includes(path.join(root, 'host')), 'Refuse an unowned host PID')
        const ended = once(child, 'exit').then(() => { childExited = true })
        child.kill('SIGTERM')
        const graceful = await Promise.race([ended.then(() => true), sleep(5000).then(() => false)])
        if (!graceful) child.kill('SIGKILL')
        await Promise.race([ended, sleep(10000).then(() => { throw Error('OWNED_HOST_DID_NOT_EXIT') })])
    })()
    const calls: string[] = [], pageCountObservations: Array<{ operation: string; counts: number[] }> = [], nativeFetch = globalThis.fetch.bind(globalThis)
    const fetcher: typeof fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        assert.equal(url.origin, origin); assert.ok(!url.username && !url.password && !url.search && !url.hash)
        const headers = new Headers(init?.headers); assert.equal(headers.has('authorization'), false); assert.equal(headers.has('cookie'), false)
        let operationName = ''
        if ((init?.method ?? 'GET') === 'POST') {
            assert.equal(url.pathname, '/api/graphql')
            const request = JSON.parse(String(init?.body)), operation = Object.values(operations).find(row => row.operationName === request.operationName)
            assert.ok(operation); assert.equal(request.query, operation.query); calls.push(request.operationName); operationName = request.operationName
        } else { assert.equal(init?.method ?? 'GET', 'GET'); assert.match(url.pathname, /^\/api\/v1\/manga\/\d+\/chapter\/\d+\/page\/[01]$/); calls.push('body-page') }
        const response = await nativeFetch(input, init)
        if (response.ok && ['PicaHostPrepareManga', 'PicaHostChapterPages'].includes(operationName)) {
            // Observe only numeric metadata from our own fixture; never replace upstream replies.
            const payload = await response.clone().json() as any
            const rows = operationName === 'PicaHostPrepareManga' ? payload.data?.fetchMangaAndChapters?.chapters : [payload.data?.fetchChapterPages?.chapter]
            assert.ok(Array.isArray(rows) && rows.length === 1 && rows.every(row => Number.isInteger(row?.pageCount)))
            assert.ok(pageCountObservations.length < 16)
            pageCountObservations.push({ operation: operationName, counts: rows.map(row => row.pageCount) })
        }
        return response
    }
    const mark = (step: string) => { result.step = step }
    try {
        const pixels = { folder: [syntheticHostPng(190, 40, 60), syntheticHostPng(40, 170, 70)], cbz: [syntheticHostPng(40, 70, 190), syntheticHostPng(180, 150, 30)] }
        const local = path.join(root, 'host/local'), folder = path.join(local, 'Interop Fixture Folder/Chapter 1'), cbzFolder = path.join(local, 'Interop Fixture CBZ')
        for (const dir of [folder, cbzFolder, path.join(root, 'java-tmp'), path.join(root, 'home'), path.join(root, 'app-data')]) fs.mkdirSync(dir, { recursive: true })
        pixels.folder.forEach((data, index) => fs.writeFileSync(path.join(folder, `${index + 1}.png`), data, { flag: 'wx' }))
        const zip = new AdmZip(); pixels.cbz.forEach((data, index) => zip.addFile(`${index + 1}.png`, data)); fs.writeFileSync(path.join(cbzFolder, 'Chapter 1.cbz'), zip.toBuffer(), { flag: 'wx' })
        mark('boot-pinned-host')
        child = spawn(java, realHostJavaArguments(root, jar), { cwd: root, windowsHide: true,
            env: { PATH: path.dirname(java) + ':/usr/bin:/bin', HOME: path.join(root, 'home'), TMPDIR: path.join(root, 'java-tmp'), LANG: 'C.UTF-8', JAVA_HOME: process.env.JAVA_HOME! }, stdio: ['ignore', 'pipe', 'pipe'] })
        child.on('exit', () => { childExited = true }); child.on('error', () => {})
        let hostLogs = ''
        for (const stream of [child.stdout, child.stderr]) stream!.on('data', bytes => { hostLogs = (hostLogs + bytes.toString()).slice(-16384) })
        let ready = false
        for (let attempt = 0; attempt < 240 && !childExited; attempt++) {
            try {
                const response = await fetcher(origin + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...SUWAYOMI_QUERIES.info, variables: {} }), signal: AbortSignal.timeout(1500) })
                const body = await response.json() as any
                if (response.ok && suwayomiServer(body).version.replace(/^v/, '') === '2.4.2366') { ready = true; break }
            } catch { /* Bounded readiness only, no alternate host or fabricated response. */ }
            await sleep(250)
        }
        if (!ready) { fs.writeFileSync(path.join(evidence, 'host-startup-tail.txt'), hostLogs, { flag: 'wx' }); throw Error('PINNED_HOST_NOT_READY') }
        result.realUpstreamRuntime = true
        mark('save-enable-inspect')
        const inspector = new SourceHostInspector(connection => sourceHostHttp(connection, fetcher))
        connections = new SourceHostConnections(sourceHostStore(path.join(root, 'host-connections.json')), inspector, randomUUID)
        const beforeConfigurationCalls = calls.length
        const saved = connections.command({ action: 'save', kind: 'suwayomi', label: 'Owned real-runtime fixture', endpoint: origin + '/', authMode: 'none', allowInsecureLan: false, scope: 'inspect-only', consent: true })
        const host = saved.hosts[0]
        connections.command({ action: 'set-enabled', id: host.id, expectedRevision: 0, enabled: true, consent: true })
        assert.equal(calls.length, beforeConfigurationCalls)
        const inspected = await connections.inspect({ id: host.id, expectedRevision: 1, offset: 0, consent: true }, signal())
        assert.equal(inspected.page.sources.length, 1); assert.equal(inspected.page.sources[0].id, '0')
        const data = path.join(root, 'app-data'); database = new LibraryDatabase(path.join(data, 'library.db'))
        const ingestion = new LocalLibraryIngestion(database, data), resources = new RuntimeResourceCoordinator()
        hosted = new HostedLibraryReader(connections, database, () => new PreviewCacheManager(path.join(root, 'page-cache'), { maxBytes: 1024 * 1024, ttlMs: 60000 }), fetcher, Date.now,
            { saveChapter: input => ingestion.importGeneratedChapter(input), resources })
        const command = async (input: unknown): Promise<any> => hosted!.command(input, signal())
        mark('library-scope-real-query')
        const grant = { action: 'start', id: host.id, expectedRevision: 1, consent: true, acceptHostFetchSideEffects: true }
        const library = await command({ ...grant, scope: 'library-read' })
        const libraryRows = await command({ action: 'list', sessionId: library.sessionId, offset: 0 })
        assert.ok(libraryRows.books.length <= 2 && libraryRows.books.every((book: any) => book.sourceId === '0' && String(book.title).startsWith('Interop Fixture')))
        result.initialHostLibraryCount = libraryRows.books.length
        const beforeDeniedSearch = calls.length
        await assert.rejects(() => command({ action: 'search', sessionId: library.sessionId, query: 'Interop Fixture', page: 1 }), /SOURCE_HOST_SCOPE_REQUIRED/)
        assert.equal(calls.length, beforeDeniedSearch)
        await command({ action: 'close', sessionId: library.sessionId })
        mark('explicit-installed-source-search')
        const search = await command({ ...grant, scope: 'source-search-read', acceptHostCatalogueSideEffects: true })
        const sources = await command({ action: 'sources', sessionId: search.sessionId, offset: 0 }); assert.equal(sources.sources.length, 1); assert.equal(sources.sources[0].id, '0')
        await command({ action: 'bind-source', sessionId: search.sessionId, sourceId: '0', consent: true })
        const found = await command({ action: 'search', sessionId: search.sessionId, query: 'Interop Fixture', page: 1 }); assert.equal(found.books.length, 2)
        const offlineBooks = []
        for (const book of found.books) {
            const expected = String(book.title).includes('CBZ') ? pixels.cbz : pixels.folder
            mark('select-and-read-' + (String(book.title).includes('CBZ') ? 'cbz' : 'folder'))
            await command({ action: 'select', sessionId: search.sessionId, comicId: book.comicId })
            const chapters = await hosted.read(search.sessionId, 'chapters', { comicId: book.comicId }, signal()) as any[]; assert.equal(chapters.length, 1)
            const episodeId = chapters[0].id
            const chapter = await hosted.read(search.sessionId, 'chapter', { comicId: book.comicId, episodeId }, signal()) as any; assert.equal(chapter.pages.length, 2)
            for (let index = 0; index < 2; index++) assert.equal(hash((await hosted.picture(search.sessionId, book.comicId, episodeId, index, signal())).data), hash(expected[index]))
            await hosted.read(search.sessionId, 'save-progress', { comicId: book.comicId, episodeId, pageIndex: 1 }, signal())
            mark('separate-confirmed-local-save')
            await assert.rejects(() => command({ action: 'download-start', sessionId: search.sessionId, comicId: book.comicId, episodeId, consent: true, acceptLocalCopy: false }), /SOURCE_HOST_DOWNLOAD_CONSENT_REQUIRED/)
            const job = await command({ action: 'download-start', sessionId: search.sessionId, comicId: book.comicId, episodeId, consent: true, acceptLocalCopy: true })
            let completed: any
            for (let attempt = 0; attempt < 300; attempt++) {
                const state = await command({ action: 'downloads', sessionId: search.sessionId }), row = state.jobs.find((value: any) => value.id === job.id)
                assert.ok(row); if (['FAILED', 'CANCELLED'].includes(row.status)) throw Error('HOST_LOCAL_SAVE_FAILED')
                if (row.status === 'COMPLETED') { completed = row; break }
                await sleep(100)
            }
            assert.ok(completed?.localComicId && completed?.localEpisodeId)
            const reader = new ReaderService(database, data); reader.saveProgress(completed.localComicId, completed.localEpisodeId, 1)
            offlineBooks.push({ comicId: completed.localComicId, episodeId: completed.localEpisodeId, pageHashes: expected.map(hash) })
        }
        mark('revoke-and-stop-host')
        const onlineProgress = await hosted.read(search.sessionId, 'progress', {}, signal()) as any[]; assert.equal(onlineProgress.length, 2); assert.ok(onlineProgress.every(value => value.pageIndex === 1))
        connections.command({ action: 'set-enabled', id: host.id, expectedRevision: 1, enabled: false, consent: true })
        await assert.rejects(() => hosted!.read(search.sessionId, 'progress', {}, signal()), /SOURCE_HOST_CANCELLED/)
        await hosted.close(); hosted = undefined; connections.close(); connections = undefined; inspector.close(); database.close(); database = undefined
        await stop(); assert.equal(childExited, true)
        for (const operation of Object.values(operations)) assert.ok(calls.includes(operation.operationName), 'Every fixed operation must reach the actual upstream runtime')
        assert.equal(pageCountObservations.filter(row => row.operation === 'PicaHostPrepareManga' && row.counts[0] === -1).length, 2)
        assert.ok(pageCountObservations.filter(row => row.operation === 'PicaHostChapterPages').every(row => row.counts[0] === 2))
        fs.writeFileSync(path.join(root, 'OFFLINE_EXPECTED.json'), JSON.stringify({ sourceSha: source, books: offlineBooks }), { flag: 'wx' })
        mark('fresh-node-offline-reader')
        const launcher = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../test-source-host-interop.mjs')
        const fresh = spawnSync(process.execPath, [launcher, 'offline', source, root], { cwd: process.cwd(), env: process.env, encoding: 'utf8', windowsHide: true, timeout: 30000 })
        assert.equal(fresh.status, 0); const offlineProof = JSON.parse(fresh.stdout.trim()); assert.equal(offlineProof.status, 'PASS')
        Object.assign(result, { status: 'PASS', step: 'complete', actualFixedOperations: Object.values(operations).map(value => value.operationName), sourceId: '0', sourceKind: 'UPSTREAM_BUILTIN_LOCAL_SOURCE',
            realSourceSearch: true, existingReaderAndLocalIngestion: true, onlineBooks: 2, offlineBooks: 2, bodyPages: 4, saveConsentSeparated: true, revokeStopsSession: true, offlineProof,
            requests: Object.fromEntries([...new Set(calls)].map(name => [name, calls.filter(value => value === name).length])) })
    } catch (error) {
        result.error = { name: error instanceof Error ? error.name : 'UNKNOWN', code: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'ASSERTION_OR_RUNTIME_FAILURE' }
        throw error
    } finally {
        try { await hosted?.close(); connections?.close(); database?.close(); await stop(); result.ownedHostStopped = !child || childExited }
        catch { result.status = 'FAIL'; result.cleanupFailed = true }
        result.requests = Object.fromEntries([...new Set(calls)].map(name => [name, calls.filter(value => value === name).length]))
        result.pageCountObservations = pageCountObservations
        result.hostExit = child ? { code: child.exitCode, signal: child.signalCode } : null
        fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' })
        console.log(JSON.stringify(result))
        if (result.status !== 'PASS') process.exitCode = 1
    }
}
