/**
 * B2 open-licensed external source acceptance using the ORIGINAL Windows
 * HostedLibraryReader -> LocalLibraryIngestion -> ReaderService.
 * CI-owned temporary files only, no credential or comic image artifact.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { LibraryDatabase } from '../src/library/database'
import { SourceHostConnections } from '../src/source-hosts/connections'
import { HostedLibraryReader } from '../src/source-hosts/library-reader'
import { PreviewCacheManager } from '../src/services/preview-cache-manager'
import { ReaderService } from '../src/services/reader-service'
import { LocalLibraryIngestion } from '../src/local-library/ingestion'
import { RuntimeResourceCoordinator } from '../src/runtime/resource-coordinator'

const [mode, rawRoot] = process.argv.slice(2)
assert.ok(mode === 'online' || mode === 'offline')
assert.equal(process.env.GITHUB_ACTIONS, 'true')
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted')
assert.equal(process.env.GITHUB_REPOSITORY, 'Saber-Alter-Lily/pica-library')
assert.equal(process.env.GITHUB_REF, 'refs/heads/codex/product-integration-r1-20261102')
assert.equal(process.env.GITHUB_EVENT_NAME, 'push')
assert.ok(rawRoot && process.env.RUNNER_TEMP)
const root = fs.realpathSync(rawRoot)
assert.equal(path.dirname(root), fs.realpathSync(process.env.RUNNER_TEMP))
assert.match(path.basename(root), /^pica-r2-external-source-[a-z0-9_-]+$/)
assert.equal(fs.lstatSync(root).isSymbolicLink(), false)
const dataRoot = path.join(root, 'original-reader')
const proofFile = path.join(root, 'OFFLINE_EXPECTED.json')
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const abort = () => AbortSignal.timeout(45000)
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const HOST = '64d223e0-5d29-4320-babb-5a2da654d345'
const titleKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

if (mode === 'offline') {
    const expected = JSON.parse(fs.readFileSync(proofFile, 'utf8'))
    assert.equal(expected.sourceSha, process.env.GITHUB_SHA)
    assert.equal(expected.kind, 'B2_REAL_EXTERNAL_LICENSED_ORIGINAL_READER')
    assert.ok(expected.books.length >= 1 && expected.books.length <= 2)
    let stopped = false
    try { await fetch('http://127.0.0.1:4567/api/graphql', { signal: AbortSignal.timeout(1500) }) }
    catch { stopped = true }
    assert.ok(stopped, 'Host still reachable; not an offline test')
    const db = new LibraryDatabase(path.join(dataRoot, 'library.db'))
    try {
        const reader = new ReaderService(db, dataRoot)
        for (const saved of expected.books) {
            const chapter = reader.chapter(saved.comic, saved.episode)
            assert.deepEqual(chapter.pages.map((p: { id: string }) =>
                sha256(reader.picture(p.id).data)), saved.pageHashes)
        }
        console.log(JSON.stringify({ status:'PASS', phase:'OFFLINE', hostStopped:stopped,
            localReader:true, savedChapters:expected.books.length }))
    } finally { db.close() }
} else {
    const sourceId = process.env.PICA_B2_SOURCE_ID
    const query = process.env.PICA_B2_SAMPLE_QUERY
    const expectedTitle = process.env.PICA_B2_SAMPLE_TITLE
    assert.match(sourceId ?? '', /^-?\d+$/)
    assert.ok(query && expectedTitle && query.length < 100 && expectedTitle.length < 100)
    assert.ok(!fs.existsSync(proofFile))
    fs.mkdirSync(dataRoot)
    const db = new LibraryDatabase(path.join(dataRoot, 'library.db'))
    const importer = new LocalLibraryIngestion(db, dataRoot)
    let registry: unknown = null
    const connections = new SourceHostConnections({
        load: () => registry, save: value => { registry = structuredClone(value) }
    }, {inspect: async () => { throw Error('No unrequested source inspection') }}, () => HOST)
    connections.command({action:'save',kind:'suwayomi',label:'Ephemeral licensed-source test',
        endpoint:'http://127.0.0.1:4567/',authMode:'none',allowInsecureLan:false,
        consent:true,scope:'inspect-only'})
    connections.command({action:'set-enabled',id:HOST,expectedRevision:0,
        enabled:true,consent:true})
    // CI-only bounded metadata trace. Keep image bytes, URLs and remote error
    // bodies out of logs; diagnose failures using fixed operation + MIME
    // and upstream page counts without weakening production validation.
    const trace: Array<Record<string, string | number | boolean | null>> = []
    const observedFetch = (async (...args: Parameters<typeof fetch>) => {
        const init = args[1]
        let operation = 'IMAGE'
        if (init?.body) {
            try { operation = JSON.parse(String(init.body)).operationName ?? 'GRAPHQL' }
            catch { operation = 'GRAPHQL' }
        }
        const response = await fetch(...args)
        const row: Record<string, string | number | boolean | null> = {
            operation, status: response.status,
            mime: response.headers.get('content-type')?.split(';')[0] ?? null
        }
        if (operation === 'PicaHostChapterPages' && response.ok) {
            try {
                const body: any = await response.clone().json()
                const pages = body?.data?.fetchChapterPages?.pages
                const chapter = body?.data?.fetchChapterPages?.chapter
                row.pages = Array.isArray(pages) ? pages.length : -1
                row.pageCount = Number.isInteger(chapter?.pageCount) ? chapter.pageCount : -1
                row.graphqlError = Array.isArray(body?.errors) && body.errors.length > 0
            } catch { row.graphqlError = true }
        }
        if (trace.length >= 50) trace.shift()
        trace.push(row)
        return response
    }) as typeof fetch
    const hosted = new HostedLibraryReader(connections, db,
        () => new PreviewCacheManager(path.join(root,'image-cache')), observedFetch, Date.now,
        {saveChapter: input => importer.importGeneratedChapter(input),
         resources: new RuntimeResourceCoordinator()})
    const command = (input: Record<string, unknown>) =>
        hosted.command(input, abort()) as Promise<any>
    const saved: Array<{ comic:string;episode:string;pageHashes:string[] }> = []
    try {
        const started = await command({action:'start',id:HOST,expectedRevision:1,
            consent:true,scope:'source-search-read',
            acceptHostFetchSideEffects:true,acceptHostCatalogueSideEffects:true})
        const id = started.sessionId
        let sourcePresent = false
        for (let offset=0;offset<200;offset+=25) {
            const page = await command({action:'sources',sessionId:id,offset})
            if (page.sources.some((s:{id:string})=>s.id===sourceId)) {
                sourcePresent=true;break
            }
            if (!page.hasNext) break
        }
        assert.ok(sourcePresent,'Exact installed external source not present')
        await command({action:'bind-source',sessionId:id,sourceId,consent:true})
        const result = await command(process.env.PICA_B2_BROWSE_POPULAR === '1'
            ? {action:'browse',sessionId:id,page:1}
            : {action:'search',sessionId:id,query,page:1})
        assert.ok(Array.isArray(result.books) && result.books.length)
        const selected = result.books.find((b:{title:string}) =>
            titleKey(b.title).includes(titleKey(expectedTitle)))
        assert.ok(selected,'Author-licensed title not in real source search')
        const comicId = selected.comicId
        assert.equal((await command({action:'bookmark',sessionId:id,
            comicId,consent:true})).saved,true)
        assert.ok((await command({action:'saved',sessionId:id})).books.some(
            (b:{comicId:string})=>b.comicId===comicId))
        const chapters = await command({action:'download-chapters',sessionId:id,comicId})
        assert.ok(Array.isArray(chapters.chapters) && chapters.chapters.length)
        let images=0
        for (const chapterRow of chapters.chapters.slice(0,2)) {
            const chapter = await hosted.read(id,'chapter',
                {comicId,episodeId:chapterRow.id},abort()) as any
            if (!Array.isArray(chapter.pages) || chapter.pages.length<1 ||
                chapter.pages.length>12) continue
            const image = await hosted.picture(id,comicId,chapterRow.id,0,abort())
            assert.ok(Buffer.isBuffer(image.data) && image.data.length>48)
            const task = await command({action:'download-start',sessionId:id,
                comicId,episodeId:chapterRow.id,consent:true,acceptLocalCopy:true})
            let done:any=null
            for(let n=0;n<160;n++){
                const jobs=(await command({action:'downloads',sessionId:id})).jobs
                const job=jobs.find((j:{id:string})=>j.id===task.id)
                if(job?.status==='COMPLETED'){done=job;break}
                if(job?.status==='FAILED'||job?.status==='CANCELLED'){
                    // Never echo remote exception bodies, URLs or credentials.
                    // Snapshot metadata is sufficient to pinpoint a real
                    // blocked local-import step without exposing site content.
                    const code = typeof job.error === 'string' &&
                        /^[A-Z][A-Z0-9_]{1,80}$/.test(job.error) ? job.error : 'REDACTED'
                    throw Error('Original local chapter job did not complete: ' +
                        JSON.stringify({status:job.status,phase:job.phase,
                            errorCode:code,completed:job.progressCompleted,
                            total:job.progressTotal,operations:trace.slice(-12)}))
                }
                await pause(500)
            }
            assert.ok(done?.localComicId&&done?.localEpisodeId,
                'Local chapter importer timed out')
            const localReader=new ReaderService(db,dataRoot)
            const local=localReader.chapter(done.localComicId,done.localEpisodeId)
            const pageHashes=local.pages.map((p:{id:string})=>
                sha256(localReader.picture(p.id).data))
            assert.equal(pageHashes.length,chapter.pages.length)
            assert.equal(pageHashes[0],sha256(image.data))
            saved.push({comic:done.localComicId,episode:done.localEpisodeId,pageHashes})
            images+=pageHashes.length
            if(images>=2)break
        }
        assert.ok(images>=2,'Fewer than 2 real licensed image pages')
        connections.command({action:'set-enabled',id:HOST,expectedRevision:1,
            enabled:false,consent:true})
        await assert.rejects(command({action:'downloads',sessionId:id}),
            /SOURCE_HOST_CANCELLED/)
        fs.writeFileSync(proofFile,JSON.stringify({
            kind:'B2_REAL_EXTERNAL_LICENSED_ORIGINAL_READER',
            sourceSha:process.env.GITHUB_SHA,sourceId,books:saved
        }),{flag:'wx',mode:0o600})
        console.log(JSON.stringify({status:'PASS',phase:'ONLINE',realExternalSource:true,
            originalHostedReader:true,originalLocalImporter:true,
            realImagePages:images,revokedSource:true,savedChapters:saved.length}))
    } finally {await hosted.close();db.close()}
}
