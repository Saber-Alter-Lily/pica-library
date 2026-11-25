import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import AdmZip from 'adm-zip'
import {createRequire} from 'node:module'

assert.equal(process.platform,'win32')
assert.equal(process.env.GITHUB_ACTIONS?.toLowerCase(),'true','Run only on a disposable GitHub Windows runner')
const {chromium}=createRequire(path.join(process.env.RUNNER_TEMP,'pica-051-browser','package.json'))('playwright-core')
const [baseFile,delta,expectedSha]=process.argv.slice(2),name=path.basename(delta)
assert.equal(name,'Pica-Library-v0.5.1-update-from-v0.5.0.zip')
assert.match(expectedSha,/^[a-f0-9]{40}$/)
const hash=(file)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
assert.equal(hash(baseFile),'14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf')
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pica-button-051-')),install=path.join(root,'install'),home=path.join(root,'profile')
const extra=path.join(root,'feed'),info=path.join(home,'runtime-state','instance.json'),pause=ms=>new Promise(r=>setTimeout(r,ms))
fs.mkdirSync(extra); fs.mkdirSync(home)
new AdmZip(baseFile).extractAllTo(install,false)
fs.copyFileSync(delta,path.join(extra,name));fs.writeFileSync(path.join(extra,'SHA256SUMS.txt'),hash(delta)+'  '+name+'\n')
const fixture=fileURLToPath(new URL('./v051-public-feed-fixture.cjs',import.meta.url)).replaceAll('\\','/')
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PICA_|^NODE_OPTIONS$|^GH_TOKEN$|^GITHUB_TOKEN$|PROXY$/i.test(k)))
Object.assign(env,{LOCALAPPDATA:path.join(root,'local'),APPDATA:path.join(root,'roaming'),PICA_LIBRARY_DESKTOP_HOME:home,PICA_QA_051_ROOT:root,NODE_OPTIONS:'--require="'+fixture+'"'})
const marker=path.join(home,'config','qa-preservation.txt');fs.mkdirSync(path.dirname(marker),{recursive:true});fs.writeFileSync(marker,'button-qa')
const old=spawn(path.join(install,'Pica Library.exe'),['--no-open'],{cwd:install,windowsHide:true,env,stdio:'ignore'})
await new Promise((resolve,reject)=>{old.on('error',reject);old.on('exit',c=>c===0?resolve():reject(Error('launcher exit '+c)))})
let browser
async function instance(ver,oldPid){
    for(let i=0;i<180;i++){try{
        const s=JSON.parse(fs.readFileSync(info));const u=new URL(s.url)
        assert.equal(u.hostname,'127.0.0.1')
        const caps=await (await fetch(new URL('/api/v1/capabilities',u),{signal:AbortSignal.timeout(1200)})).json()
        if(caps.appVersion===ver&&s.pid!==oldPid)return s
    }catch{} await pause(500)}throw Error('No healthy isolated instance for '+ver)
}
try {
    const first=await instance('0.5.0')
    browser=await chromium.launch({channel:'msedge',headless:true})
    const p=await browser.newPage();p.setDefaultTimeout(20000)
    await p.addInitScript(()=>{localStorage.setItem('pica-onboarding-state-v1',JSON.stringify({completedVersion:2,autoShow:false}));localStorage.setItem('pica-auto-update-prompt-v1',JSON.stringify({checkedAt:Date.now()}))})
    const network=[]
    p.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/v1/update/'))network.push([u.pathname,r.request().method(),r.status()])})
    await p.goto(first.url)
    await p.locator('#pica-disclaimer-check').check();await p.locator('#pica-disclaimer-accept').click()
    await p.locator('nav [data-view="maintenance"]').click();await p.locator('#a87-maintenance-tab').click()
    const tab=p.locator('#a87-maintenance-panel [data-tab="software-updates"]').first();if(await tab.isVisible())await tab.click()
    await p.locator('#update-one-click').click()
    await p.locator('#app-confirm-submit').click()
    let second
    try{second=await instance('0.5.1',first.pid)}
    catch(error){console.error('Button request results:',network);console.error('Updater message:',await p.locator('#update-message').textContent({timeout:2000}).catch(()=>'<page closed>'));throw error}
    for(const [route,method] of [['check','GET'],['prepare-latest','POST'],['apply','POST']])
        assert.ok(network.some(([p,m,s])=>p==='/api/v1/update/'+route&&m===method&&s===200), 'Missing successful UI '+route+'; '+JSON.stringify(network))
    // No test-driven reload/navigation here: v0.5.0 must reconnect and load the new Web bundle itself.
    await p.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>new URL(e.name).pathname.endsWith('/reader-ux-051.js')),null,{timeout:95000})
    assert.equal(fs.readFileSync(path.join(install,'SOURCE_SHA.txt'),'utf8').trim(),expectedSha)
    assert.equal(fs.readFileSync(marker,'utf8'),'button-qa')
    assert.ok(fs.readFileSync(path.join(root,'feed-log.txt'),'utf8').includes('/releases/download/v0.5.1/'+name))
    console.log('OFFICIAL_V050_UI_ONE_CLICK_TO_V051=PASS (discovery -> confirmed button -> downloaded incremental -> staged -> applied -> new healthy process)')
    console.log('Verified at '+second.url)
} finally {
    if(browser)await browser.close()
    try{const {url}=JSON.parse(fs.readFileSync(info)); assert.equal(new URL(url).hostname,'127.0.0.1')
        const status=await (await fetch(url+'/api/v1/desktop/status')).json()
        await fetch(url+'/api/v1/desktop/shutdown',{method:'POST',headers:{'content-type':'application/json','x-pica-csrf':status.csrfToken,origin:url},body:'{}'})
    }catch{}
}
