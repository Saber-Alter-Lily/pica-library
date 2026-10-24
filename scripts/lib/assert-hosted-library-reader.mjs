import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { DatabaseSync } from 'node:sqlite'

/** Same owned Windows application/profile as the source gate; only this synthetic host is new. */
export async function assertPackagedHostedLibraryReader({ status, home, data, sourceSha, version }) {
    if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32') throw Error('Hosted Reader application/listener gate is CI-only')
    const current = await status(), app = new URL(current.fixtureApplicationUrl), endpoint = app.origin + '/api/v1/desktop/host-reader'
    assert.equal(current.version, version); assert.equal(current.hostedLibraryReader?.available, true)
    const headers = { 'content-type': 'application/json', Origin: app.origin, 'x-pica-csrf': current.csrfToken }
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/XFoAAAAASUVORK5CYII=', 'base64')
    const secret = 'synthetic-hosted-reader-not-a-real-secret', authorization = 'Basic ' + Buffer.from('fixture-user:' + secret).toString('base64')
    let reused = false, images = 0, calls = 0, unexpected = 0
    const manga = () => ({ id: 1, sourceId: '9007199254740993', url: reused ? '/reused-for-another-work' : '/owned-book', title: 'Synthetic hosted book' })
    const chapter = { id: 2, mangaId: 1, url: '/owned-book/chapter-1', name: 'One', sourceOrder: 0, chapterNumber: 1, pageCount: 2 }
    const fixture = http.createServer(async (request, response) => {
        try {
            calls++; assert.equal(request.headers.authorization, authorization); assert.equal(request.headers.cookie, undefined)
            if (request.method === 'GET') { assert.match(request.url, /^\/own\/api\/v1\/manga\/1\/chapter\/0\/page\/[01]$/); images++; response.writeHead(200, { 'content-type': 'image/png' }); response.end(png); return }
            assert.equal(request.method, 'POST'); assert.equal(request.url, '/own/api/graphql')
            const chunks=[];let bytes=0;for await(const chunk of request){bytes+=chunk.length;if(bytes>4096)throw Error('Unexpected body');chunks.push(chunk)}
            const value=JSON.parse(Buffer.concat(chunks).toString('utf8'))
            assert.ok(['PicaSourceHostInfo','PicaHostLibrary','PicaHostManga','PicaHostChapter','PicaHostChapterPages'].includes(value.operationName))
            if(value.operationName==='PicaHostChapterPages')assert.match(value.query,/^mutation PicaHostChapterPages/);else assert.match(value.query,/^query /)
            const payload=value.operationName==='PicaSourceHostInfo'?{aboutServer:{name:'Suwayomi-Server',version:'2.4.2366'}}:value.operationName==='PicaHostLibrary'?{mangas:{nodes:[manga()],pageInfo:{hasNextPage:false}}}:value.operationName==='PicaHostManga'?{manga:{...manga(),chapters:{nodes:[chapter]}}}:value.operationName==='PicaHostChapter'?{chapter}:{fetchChapterPages:{chapter,pages:[0,1].map(index=>'/api/v1/manga/1/chapter/0/page/'+index)}}
            response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({data:payload}))
        }catch{unexpected++;if(!response.headersSent)response.writeHead(502);response.end()}
    })
    const tables = () => { const db=new DatabaseSync(path.join(data,'library.db'));try{return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>{assert.match(name,/^[a-z_0-9]+$/i);return[name,db.prepare('SELECT * FROM "'+name+'"').all()]}))}finally{db.close()} }
    const owned=key=>key==='host-reader-book-references-v1'||/^host-reader-progress-v1:[0-9a-f]{64}$/.test(key)
    const protectedState=value=>JSON.stringify(Object.fromEntries(Object.entries(value).map(([name,rows])=>[name,rows.filter(row=>name!=='app_state'||!owned(row.key)).map(row=>JSON.stringify(row)).sort()])))
    const post=async(url,input)=>{const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(input),signal:AbortSignal.timeout(20000)});const value=await response.json();return{status:response.status,value}}
    const command=input=>post(endpoint,input),configuration=input=>post(app.origin+'/api/v1/desktop/source-hosts/connections',input)
    try{
        await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve))
        const before=tables(),config=fs.readFileSync(path.join(home,'config/config.json')),choices=current.externalSources
        assert.equal((before.app_state??[]).some(row=>owned(row.key)),false)
        const saved=await configuration({action:'save',kind:'suwayomi',label:'My synthetic reading host',endpoint:'http://127.0.0.1:'+fixture.address().port+'/own/',authMode:'basic',allowInsecureLan:false,scope:'inspect-only',consent:true})
        assert.equal(saved.status,200);const host=saved.value.hosts[0]
        assert.equal((await configuration({action:'set-enabled',id:host.id,expectedRevision:0,enabled:true,consent:true})).status,200);assert.equal(calls,0)
        const input={action:'start',id:host.id,expectedRevision:1,auth:{mode:'basic',username:'fixture-user',password:secret},scope:'library-read',consent:true,acceptHostFetchSideEffects:true}
        assert.equal((await command({...input,acceptHostFetchSideEffects:false})).status,400);assert.equal(calls,0)
        const started=await command(input);assert.equal(started.status,200);const session=started.value.sessionId,root=endpoint+'/'+session
        const listed=await command({action:'list',sessionId:session,offset:0});assert.equal(listed.status,200)
        const comic=listed.value.books[0].comicId;assert.match(comic,/^hosted:/);assert.equal(listed.value.books[0].sourceId,'9007199254740993')
        assert.equal((await command({action:'select',sessionId:session,comicId:comic})).status,200)
        const chaptersUrl=root+'/comics/'+encodeURIComponent(comic)+'/chapters',chapters=await fetch(chaptersUrl,{headers}).then(r=>r.json()),episode=chapters[0].id
        const chapterResponse=await fetch(chaptersUrl+'/'+encodeURIComponent(episode),{headers});assert.equal(chapterResponse.status,200);const metadata=await chapterResponse.json()
        const imageUrl=app.origin+metadata.pages[0].url,count=calls
        assert.equal((await fetch(imageUrl,{headers:{Origin:'https://outside.invalid','sec-fetch-site':'cross-site'}})).status,403);assert.equal(calls,count)
        for(let i=0;i<2;i++){const image=await fetch(imageUrl,{headers});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),png)}
        assert.equal(images,1)
        const progress=await post(root+'/progress',{comicId:comic,episodeId:episode,pageIndex:1});assert.equal(progress.status,200)
        assert.equal((await command({action:'close',sessionId:session})).status,200)
        const next=await command(input);assert.equal(next.status,200);const session2=next.value.sessionId,root2=endpoint+'/'+session2
        assert.equal(next.value.history[0].comicId,comic);assert.equal(next.value.history[0].pageIndex,1)
        assert.equal((await command({action:'select',sessionId:session2,comicId:comic})).status,200)
        const resumed=await fetch(root2+'/comics/'+encodeURIComponent(comic)+'/chapters/'+encodeURIComponent(episode),{headers}).then(r=>r.json());assert.equal(resumed.progress.pageIndex,1)
        reused=true
        const stale=await fetch(app.origin+resumed.pages[0].url,{headers});assert.equal(stale.status,409);assert.equal((await stale.json()).code,'SOURCE_HOST_STALE');assert.equal(images,1)
        const after=tables(),own=(after.app_state??[]).filter(row=>owned(row.key));assert.equal(own.length,2)
        assert.equal(protectedState(after),protectedState(before));assert.equal(JSON.stringify(after).includes(secret),false)
        assert.equal((await configuration({action:'set-enabled',id:host.id,expectedRevision:1,enabled:false,consent:true})).status,200)
        assert.equal((await fetch(root2+'/progress',{headers})).status,409)
        assert.equal((await configuration({action:'remove',id:host.id,expectedRevision:2,consent:true})).status,200)
        assert.deepEqual(fs.readFileSync(path.join(home,'config/config.json')),config);assert.deepEqual((await status()).externalSources,choices);assert.equal(fs.existsSync(path.join(home,'config/credentials.dat')),false);assert.equal(unexpected,0)
        process.stdout.write(JSON.stringify({packaged_host_library_reader:'PASS',source_sha:sourceSha,version,execution_location:'GITHUB_WINDOWS_CI',actual_shared_reader:true,host_library_only:true,independent_progress_resumed:true,only_owned_app_state_keys_changed:2,stale_remote_id_rejected_before_cached_body:true,cross_site_media_denied_before_host:true,session_revoked_on_disable:true,credential_persistence:false,catalogue_import:false,native_host_reader:false,unexpected_fixture_requests:unexpected,production_accessed:false})+'\n')
    }finally{fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve))}
}
