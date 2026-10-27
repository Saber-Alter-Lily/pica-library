import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { assertPackagedHostedOfflineChapter } from './assert-hosted-offline-chapter.mjs'

/** Same owned Windows application/profile as the source gate; only this synthetic host is new. */
export async function assertPackagedHostedLibraryReader({ status, home, data, sourceSha, version }) {
    if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32') throw Error('Hosted Reader application/listener gate is CI-only')
    const current = await status(), app = new URL(current.fixtureApplicationUrl), endpoint = app.origin + '/api/v1/desktop/host-reader'
    assert.equal(current.version, version); assert.equal(current.hostedLibraryReader?.available, true)
    const headers = { 'content-type': 'application/json', Origin: app.origin, 'x-pica-csrf': current.csrfToken }
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=', 'base64')
    const secret = 'synthetic-hosted-reader-not-a-real-secret', authorization = 'Basic ' + Buffer.from('fixture-user:' + secret).toString('base64')
    let reused = false, inLibrary = true, images = 0, calls = 0, unexpected = 0, searches = 0, preparations = 0
    const manga = () => ({ id: 1, sourceId: '9007199254740993', url: reused ? '/reused-for-another-work' : '/owned-book', title: 'Synthetic hosted book', inLibrary })
    const chapter = { id: 2, mangaId: 1, url: '/owned-book/chapter-1', name: 'One', sourceOrder: 0, chapterNumber: 1, pageCount: 2 }
    const fixture = http.createServer(async (request, response) => {
        try {
            calls++; assert.equal(request.headers.authorization, authorization); assert.equal(request.headers.cookie, undefined)
            if (request.method === 'GET') { assert.match(request.url, /^\/own\/api\/v1\/manga\/1\/chapter\/0\/page\/[01]$/); images++; response.writeHead(200, { 'content-type': 'image/png' }); response.end(png); return }
            assert.equal(request.method, 'POST'); assert.equal(request.url, '/own/api/graphql')
            const chunks=[];let bytes=0;for await(const chunk of request){bytes+=chunk.length;if(bytes>4096)throw Error('Unexpected body');chunks.push(chunk)}
            const value=JSON.parse(Buffer.concat(chunks).toString('utf8'))
            assert.ok(['PicaSourceHostInfo','PicaSourceHostSources','PicaHostLibrary','PicaHostManga','PicaHostChapter','PicaHostChapterPages','PicaHostSourceSearch','PicaHostPrepareManga'].includes(value.operationName))
            if(['PicaHostChapterPages','PicaHostSourceSearch','PicaHostPrepareManga'].includes(value.operationName))assert.match(value.query,new RegExp('^mutation '+value.operationName));else assert.match(value.query,/^query /)
            if(value.operationName==='PicaHostSourceSearch'){searches++;assert.deepEqual(value.variables,{input:{source:'9007199254740993',type:'SEARCH',page:1,query:'fixture search'}})}
            if(value.operationName==='PicaHostPrepareManga'){preparations++;assert.deepEqual(value.variables,{input:{id:1,fetchManga:true,fetchChapters:true}})}
            const payload=value.operationName==='PicaSourceHostInfo'?{aboutServer:{name:'Suwayomi-Server',version:'2.4.2366'}}:
                value.operationName==='PicaSourceHostSources'?{sources:{nodes:[{id:'9007199254740993',name:'My installed fixture source',lang:'zh',supportsLatest:true}],pageInfo:{hasNextPage:false,hasPreviousPage:false},totalCount:1}}:
                value.operationName==='PicaHostSourceSearch'?{fetchSourceManga:{mangas:[manga()],hasNextPage:false}}:
                value.operationName==='PicaHostPrepareManga'?{fetchMangaAndChapters:{manga:manga(),chapters:[chapter]}}:
                value.operationName==='PicaHostLibrary'?{mangas:{nodes:[manga()],pageInfo:{hasNextPage:false}}}:value.operationName==='PicaHostManga'?{manga:{...manga(),chapters:{nodes:[chapter]}}}:value.operationName==='PicaHostChapter'?{chapter}:{fetchChapterPages:{chapter,pages:[0,1].map(index=>'/api/v1/manga/1/chapter/0/page/'+index)}}
            response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({data:payload}))
        }catch{unexpected++;if(!response.headersSent)response.writeHead(502);response.end()}
    })
    const tables = () => { const db=new DatabaseSync(path.join(data,'library.db'));try{return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>{assert.match(name,/^[a-z_0-9]+$/i);return[name,db.prepare('SELECT * FROM "'+name+'"').all()]}))}finally{db.close()} }
    const owned=key=>key==='host-reader-book-references-v1'||/^host-reader-progress-v1:[0-9a-f]{64}$/.test(key)
    const protectedState=value=>JSON.stringify(Object.fromEntries(Object.entries(value).map(([name,rows])=>[name,rows.filter(row=>name!=='app_state'||!owned(row.key)).map(row=>JSON.stringify(row)).sort()])))
    const post=async(url,input)=>{const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(input),signal:AbortSignal.timeout(20000)});const value=await response.json();return{status:response.status,value}}
    const command=input=>post(endpoint,input),configuration=input=>post(app.origin+'/api/v1/desktop/source-hosts/connections',input)
    const readingLibrary=hostSessionId=>post(app.origin+'/api/v1/desktop/reading-library/query',{query:{limit:100},...(hostSessionId?{hostSessionId}:{})})
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
        const beforeProjection=tables(),beforeQueryCalls=calls,unselected=await readingLibrary(session)
        assert.equal(unselected.status,200);assert.equal(unselected.value.items.some(row=>row.comicId===comic),false)
        assert.equal(calls,beforeQueryCalls);assert.deepEqual(tables(),beforeProjection)
        assert.equal((await command({action:'select',sessionId:session,comicId:comic})).status,200)
        const chaptersUrl=root+'/comics/'+encodeURIComponent(comic)+'/chapters',chapters=await fetch(chaptersUrl,{headers}).then(r=>r.json()),episode=chapters[0].id
        const chapterResponse=await fetch(chaptersUrl+'/'+encodeURIComponent(episode),{headers});assert.equal(chapterResponse.status,200);const metadata=await chapterResponse.json()
        const imageUrl=app.origin+metadata.pages[0].url,count=calls
        assert.equal((await fetch(imageUrl,{headers:{Origin:'https://outside.invalid','sec-fetch-site':'cross-site'}})).status,403);assert.equal(calls,count)
        for(let i=0;i<2;i++){const image=await fetch(imageUrl,{headers});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),png)}
        assert.equal(images,1)
        const progress=await post(root+'/progress',{comicId:comic,episodeId:episode,pageIndex:1});assert.equal(progress.status,200)
        const selectedState=tables(),selectedQueryCalls=calls,selectedView=await readingLibrary(session),plainView=await readingLibrary()
        assert.equal(selectedView.status,200);assert.equal(selectedView.value.complete,true)
        const selectedBook=selectedView.value.items.find(row=>row.comicId===comic)
        assert.equal(selectedBook.title,'Synthetic hosted book');assert.equal(selectedBook.routes[0].channel,'hosted');assert.equal(selectedBook.routes[0].progress.pageIndex,1)
        assert.equal(plainView.value.items.some(row=>row.comicId===comic),false);assert.equal(calls,selectedQueryCalls)
        assert.deepEqual(tables(),selectedState);assert.equal(JSON.stringify(selectedView.value).includes(secret),false);assert.equal(JSON.stringify(selectedView.value).includes('/own/'),false)
        assert.equal((await command({action:'close',sessionId:session})).status,200)
        const next=await command(input);assert.equal(next.status,200);const session2=next.value.sessionId,root2=endpoint+'/'+session2
        assert.equal(next.value.history[0].comicId,comic);assert.equal(next.value.history[0].pageIndex,1)
        assert.equal((await command({action:'select',sessionId:session2,comicId:comic})).status,200)
        const resumed=await fetch(root2+'/comics/'+encodeURIComponent(comic)+'/chapters/'+encodeURIComponent(episode),{headers}).then(r=>r.json());assert.equal(resumed.progress.pageIndex,1)
        reused=true
        const stale=await fetch(app.origin+resumed.pages[0].url,{headers});assert.equal(stale.status,409);assert.equal((await stale.json()).code,'SOURCE_HOST_STALE');assert.equal(images,1)
        const beforeSearchScope=calls
        assert.equal((await command({action:'search',sessionId:session2,query:'fixture search',page:1})).status,403);assert.equal(calls,beforeSearchScope)
        reused=false;inLibrary=false
        assert.equal(current.hostedSourceBrowser?.available,true);assert.equal(current.hostedSourceBrowser?.downloads,true);assert.equal(current.hostedSourceBrowser?.native,false)
        const searchInput={...input,scope:'source-search-read',acceptHostCatalogueSideEffects:true}
        assert.equal((await command({...searchInput,acceptHostCatalogueSideEffects:false})).status,400);assert.equal(calls,beforeSearchScope)
        const searchStarted=await command(searchInput);assert.equal(searchStarted.status,200);const sourceSession=searchStarted.value.sessionId,sourceRoot=endpoint+'/'+sourceSession
        assert.equal((await command({action:'search',sessionId:sourceSession,query:'fixture search',page:1})).status,400)
        assert.equal((await command({action:'sources',sessionId:sourceSession,offset:0})).status,200)
        assert.equal((await command({action:'bind-source',sessionId:sourceSession,sourceId:'9007199254740993',consent:true})).status,200)
        assert.equal((await command({action:'bind-source',sessionId:sourceSession,sourceId:'1',consent:true})).status,409)
        const beforeSearch=tables(),searched=await command({action:'search',sessionId:sourceSession,query:'fixture search',page:1})
        assert.equal(searched.status,200);assert.equal(searched.value.books[0].comicId,comic);assert.deepEqual(tables(),beforeSearch);assert.equal(searches,1)
        assert.equal((await command({action:'select',sessionId:sourceSession,comicId:comic})).status,200);assert.equal(preparations,1)
        const sourceMetadata=await fetch(sourceRoot+'/comics/'+encodeURIComponent(comic)+'/chapters/'+encodeURIComponent(episode),{headers}).then(response=>response.json())
        assert.equal((await fetch(app.origin+sourceMetadata.pages[1].url,{headers})).status,200)
        const sourceProgress=await post(sourceRoot+'/progress',{comicId:comic,episodeId:episode,pageIndex:0});assert.equal(sourceProgress.status,200)
        const libraryDenied=await fetch(root2+'/comics/'+encodeURIComponent(comic)+'/chapters',{headers});assert.equal(libraryDenied.status,403);assert.equal((await libraryDenied.json()).code,'SOURCE_HOST_SCOPE_REQUIRED')
        const after=tables(),own=(after.app_state??[]).filter(row=>owned(row.key));assert.equal(own.length,2)
        assert.equal(protectedState(after),protectedState(before));assert.equal(JSON.stringify(after).includes(secret),false)
        const readOffline=await assertPackagedHostedOfflineChapter({appOrigin:app.origin,headers,command,sessionId:sourceSession,comicId:comic,episodeId:episode,png,tables,hostCalls:()=>calls})
        assert.equal((await configuration({action:'set-enabled',id:host.id,expectedRevision:1,enabled:false,consent:true})).status,200)
        assert.equal((await fetch(root2+'/progress',{headers})).status,409)
        assert.equal((await fetch(sourceRoot+'/progress',{headers})).status,409)
        const revokedState=tables(),revokedCalls=calls,revokedView=await readingLibrary(session2)
        assert.equal(revokedView.status,200);assert.equal(revokedView.value.complete,false);assert.equal(revokedView.value.items.some(row=>row.comicId===comic),false)
        assert.ok(revokedView.value.issues.some(row=>row.port==='selected-host'));assert.equal(calls,revokedCalls);assert.deepEqual(tables(),revokedState)
        assert.equal((await configuration({action:'remove',id:host.id,expectedRevision:2,consent:true})).status,200)
        assert.deepEqual(fs.readFileSync(path.join(home,'config/config.json')),config);assert.deepEqual((await status()).externalSources,choices);assert.equal(fs.existsSync(path.join(home,'config/credentials.dat')),false);assert.equal(unexpected,0)
        fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve))
        const offline=await readOffline()
        assert.equal(JSON.stringify(tables()).includes(secret),false)
        process.stdout.write(JSON.stringify({packaged_host_library_reader:'PASS',source_sha:sourceSha,version,execution_location:'GITHUB_WINDOWS_CI',actual_shared_reader:true,library_scope_cannot_search:true,explicit_single_source_search_read:true,search_browsing_has_no_local_catalogue_write:true,selected_source_metadata_fetches:preparations,library_scope_rejects_nonlibrary_search_refs:true,independent_progress_resumed:true,only_owned_app_state_keys_changed_before_local_copy:2,stale_remote_id_rejected_before_cached_body:true,cross_site_media_denied_before_host:true,session_revoked_on_disable:true,selected_reading_projection_without_host_fetch_or_writes:true,implicit_host_projection:false,revoked_projection_is_partial_without_private_rows:true,credential_persistence:false,catalogue_import:false,native_host_reader:false,host_downloads:true,...offline,unexpected_fixture_requests:unexpected,production_accessed:false})+'\n')
    }finally{if(fixture.listening){fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve))}}
}
