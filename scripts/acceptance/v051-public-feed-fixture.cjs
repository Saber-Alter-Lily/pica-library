// Used only in an isolated v0.5.0 end-to-end test. No sockets, tokens or real provider data.
const fs = require('node:fs'), path = require('node:path')
const root=process.env.PICA_QA_051_ROOT, official='https://github.com/Saber-Alter-Lily/pica-library'
if(!root || fs.realpathSync.native(path.dirname(root))!==fs.realpathSync.native(process.env.RUNNER_TEMP) || !/^pica-button-051-[a-f0-9-]{36}$/i.test(path.basename(root))
    || process.env.LOCALAPPDATA!==path.join(root,'User','AppData','Local') || process.env.PICA_LIBRARY_DESKTOP_HOME
    || path.resolve(process.execPath).toLowerCase()!==path.join(root,'install','runtime','node.exe').toLowerCase()
    || path.resolve(process.argv[1]).toLowerCase()!==path.join(root,'install','app','desktop.js').toLowerCase())throw Error('Not the isolated v0.5.0 desktop process')
// Only the running old process sees the unpublished release. Its updater and the new
// desktop must execute normally, even though the real updater sanitizes PICA_*.
delete process.env.NODE_OPTIONS
delete process.env.PICA_QA_051_ROOT
const inc='Pica-Library-v0.5.1-update-from-v0.5.0.zip',base=official+'/releases/download/v0.5.1/'
const native=globalThis.fetch.bind(globalThis)
globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input.url||String(input))
    if(['localhost','127.0.0.1','[::1]'].includes(url.hostname))return native(input,init)
    const method=String(init?.method||input?.method||'GET').toUpperCase()
    if(method!=='GET' || new Headers(init?.headers).has('authorization'))return new Response('',{status:403})
    let payload=null,type='text/plain'
    if(['latest','tags/v0.5.1'].some(s=>url.href==='https://api.github.com/repos/Saber-Alter-Lily/pica-library/releases/'+s)){
        type='application/json';payload=JSON.stringify({tag_name:'v0.5.1',html_url:official+'/releases/tag/v0.5.1',draft:false,prerelease:false,
          assets:[inc,'SHA256SUMS.txt'].map(name=>({name,browser_download_url:base+name}))})
    }else if(url.href===base+inc){payload=fs.readFileSync(path.join(root,'feed',inc));type='application/zip'}
    else if([base+'SHA256SUMS.txt',official+'/releases/latest/download/SHA256SUMS.txt'].includes(url.href))payload=fs.readFileSync(path.join(root,'feed','SHA256SUMS.txt'))
    if(payload===null)return new Response('',{status:404})
    fs.appendFileSync(path.join(root,'feed-log.txt'),url.pathname+'\n')
    return new Response(payload,{status:200,headers:{'content-type':type,'content-length':String(Buffer.byteLength(payload))}})
}
