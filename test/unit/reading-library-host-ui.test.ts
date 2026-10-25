import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { afterEach, expect, it, vi } from 'vitest'
import { inertReadingDom, ReadingElement } from '../helpers/fake-reading-dom'

const HOST = '64d223e0-5d29-4320-babb-5a2da654d345', SESSION = '74d223e0-5d29-4320-babb-5a2da654d345'
class InertEvent { detail: unknown; constructor(readonly type: string, options?: {detail?: unknown}) { this.detail = options?.detail } }
const cleanups: Array<() => void> = []
afterEach(() => { for (const close of cleanups.splice(0)) close() })
async function fixture() {
    const dom = inertReadingDom(), exports: Record<string, any> = {}, snapshots: unknown[] = [], scopeEvents: unknown[] = []
    let clock = Date.now(), timerId = 0
    const timers = new Map<number,{at:number;action:()=>void}>()
    class SessionDate extends Date { static now() { return clock } }
    const selectedHost = {id:HOST,revision:1,enabled:true,label:'Synthetic host',endpoint:'https://synthetic-host.invalid/',authMode:'none'}
    let listedHost = {...selectedHost}
    const fetcher = vi.fn(async (url: string, options: any = {}) => {
        expect(url.startsWith('/api/v1/desktop/')).toBe(true)
        if (url.endsWith('/status')) return {ok:true,json:async()=>({configured:true,startupReady:true,csrfToken:'synthetic-csrf',hostedLibraryReader:{available:true},sourceHostConnections:{available:true}})}
        const input = JSON.parse(options.body)
        expect(options.headers['x-pica-csrf']).toBe('synthetic-csrf')
        if (url.endsWith('/connections')) return {ok:true,json:async()=>({schemaVersion:1,scope:'inspect-only',credentials:'per-request-not-stored',storage:'available',capabilities:{sourceInspection:true,reader:false,libraryImport:false,extensionInstall:false},hosts:[listedHost]})}
        if (input.action === 'start') { expect(input.scope).toBe('library-read'); expect(input.consent).toBe(true); return {ok:true,json:async()=>({sessionId:SESSION,expiresAt:clock+60000,capabilities:{libraryRead:true,libraryImport:false},history:[]})} }
        if (input.action === 'list') return {ok:true,json:async()=>({books:[],hasNext:false,offset:0})}
        if (input.action === 'select') return {ok:true,json:async()=>({sessionId:SESSION,comicId:input.comicId,title:'Selected title'})}
        if (input.action === 'close') return {ok:true,json:async()=>({closed:true})}
        throw Error('Unexpected local synthetic request')
    })
    const context = {exports,require:(name:string)=>{expect(name).toBe('./locale-runtime.js');return {copy:(...values:string[])=>values[1]}},document:dom.document,window:dom.window,fetch:fetcher,CustomEvent:InertEvent,AbortController,setTimeout:(action:()=>void,delay:number)=>{const id=++timerId;timers.set(id,{at:clock+delay,action});return id},clearTimeout:(id:number)=>timers.delete(id),Date:SessionDate,Error}
    // CommonJS modules have separate wrapper scopes, while sharing the inert document/window.
    const execute = (file: string) => vm.runInNewContext('(function(){\n'+ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'\n})()',context,{timeout:1000})
    dom.document.addEventListener('pica-host-connections-snapshot', event => snapshots.push(event.detail))
    dom.document.addEventListener('pica-hosted-reading-scope-changed', event => scopeEvents.push(event))
    execute('web/host-library.js')
    dom.document.dispatchEvent(new InertEvent('pica-host-library-config',{detail:selectedHost}))
    expect(fetcher).not.toHaveBeenCalled()
    dom.document.getElementById('host-library-consent')!.checked = true
    dom.document.getElementById('host-library-form')!.onsubmit?.({preventDefault(){}})
    await vi.waitFor(() => expect(dom.document.getElementById('host-library-start')!.disabled).toBe(true))
    await vi.waitFor(() => expect(dom.document.getElementById('host-library-end')!.disabled).toBe(false))
    await vi.waitFor(() => expect(fetcher.mock.calls.some(([,options])=>options.body&&JSON.parse(options.body).action==='list')).toBe(true))
    cleanups.push(()=>dom.window.dispatchEvent(new InertEvent('pagehide')))
    function installSaved() {
        const panel = new ReadingElement('details'); panel.id='saved-host-panel';panel.open=true;dom.body.append(panel)
        const ids=['summary','boundary','privacy','refresh','label-label','endpoint-label','auth-label','anonymous','basic','lan-label','consent-label','save','cancel','form','label','endpoint','auth','lan','consent','list','fields','state']
        for(const id of ids){const node=new ReadingElement(id==='form'?'form':id==='list'?'div':id==='refresh'?'button':'input');node.id='saved-host-'+id;panel.append(node)}
        execute('web/saved-source-hosts.js')
        return panel
    }
    return {...dom,exports,fetcher,snapshots,scopeEvents,installSaved,listed:(value:Partial<typeof selectedHost>)=>{listedHost={...listedHost,...value}},expire:()=>{clock+=60001;for(const [id,timer]of[...timers])if(timer.at<=clock){timers.delete(id);timer.action()}}}
}
it('keeps host authority volatile and resumes only through an explicit local select command', async () => {
    const f=await fixture(),scope=f.exports.currentHostedLibrarySession()
    expect(Object.keys(scope).sort()).toEqual(['expiresAt','sessionId'])
    scope.sessionId='not-the-actual-session'
    expect(f.exports.currentHostedLibrarySession().sessionId).toBe(SESSION)
    await expect(f.exports.resumeHostedLibraryComic('hosted:fixture','wrong-session')).rejects.toThrow('SOURCE_HOST_CANCELLED')
    expect(f.fetcher.mock.calls.filter(([,options])=>options.body&&JSON.parse(options.body).action==='select')).toHaveLength(0)
    const opens:unknown[]=[];f.document.addEventListener('pica-open-hosted-reader',event=>opens.push(event.detail))
    await f.exports.resumeHostedLibraryComic('hosted:fixture',SESSION)
    expect(opens).toMatchObject([{comicId:'hosted:fixture',sessionId:SESSION,csrfToken:'synthetic-csrf'}])
})
it('the actual saved-host snapshot publisher revokes a changed active session without exposing endpoints or credentials', async () => {
    const f=await fixture();f.installSaved();f.listed({enabled:false,revision:2})
    await f.document.getElementById('saved-host-refresh')!.click()
    await vi.waitFor(()=>expect(f.exports.currentHostedLibrarySession()).toBe(null))
    expect(f.snapshots).toEqual([{hosts:[{id:HOST,revision:2,enabled:false}]}])
    expect(JSON.stringify(f.snapshots)).not.toContain('synthetic-host.invalid')
    expect(f.fetcher.mock.calls.some(([,options])=>options.body&&JSON.parse(options.body).action==='close')).toBe(true)
})
it('refreshing an unchanged host snapshot does not silently end or renew the reading session', async () => {
    const f=await fixture(),before=f.exports.currentHostedLibrarySession();f.installSaved()
    await f.document.getElementById('saved-host-refresh')!.click()
    await vi.waitFor(()=>expect(f.snapshots).toHaveLength(1))
    expect(f.exports.currentHostedLibrarySession()).toEqual(before)
    expect(f.fetcher.mock.calls.filter(([,options])=>options.body&&JSON.parse(options.body).action==='start')).toHaveLength(1)
})
it('the actual expiry callback clears authority and permits an explicit new session without fetching source content', async () => {
    const f=await fixture(),before=f.fetcher.mock.calls.length
    f.expire()
    expect(f.exports.currentHostedLibrarySession()).toBe(null)
    expect(f.document.getElementById('host-library-start')!.disabled).toBe(false)
    expect(f.document.getElementById('host-library-state')!.textContent).toContain('expired')
    expect(f.fetcher.mock.calls.slice(before).map(([,options])=>JSON.parse(options.body).action)).toEqual(['close'])
})
