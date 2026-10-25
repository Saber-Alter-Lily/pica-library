import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {build} from 'esbuild'
import {describe,expect,it} from 'vitest'
import {SUWAYOMI_QUERIES} from '../../src/source-hosts/suwayomi'

const read=(file:string)=>fs.readFileSync(file,'utf8')
const authority=JSON.parse(read('test/fixtures/source-host-authority.json'))
describe('optional source-host ownership and application safety contracts',()=>{
    it('keeps a genuinely platform-neutral protocol/inspection closure, not just type-only ports',async()=>{
        const entryPoints=['src/source-hosts/contract.ts','src/source-hosts/suwayomi.ts','src/source-hosts/inspector.ts']
        const output=await build({entryPoints,bundle:true,platform:'browser',format:'esm',write:false,outdir:'_validation/source-host-boundary-proof',metafile:true,logLevel:'silent'})
        expect(Object.keys(output.metafile!.inputs).map(f=>f.replaceAll('\\','/')).sort()).toEqual([...entryPoints].sort())
        for(const file of entryPoints)expect(read(file)).not.toMatch(/node:|process\.|require\(|eval\(|new Function|import\(/)
    })
    it('introduces no catalogue/provider namespace, schema/module change or fallback to Pica',()=>{
        for(const [file,hash]of Object.entries(authority.protectedTextHashes))expect(createHash('sha256').update(read(file).replaceAll('\r\n','\n')).digest('hex')).toBe(hash)
        expect(read('src/source-hosts/contract.ts')).toContain('reader: false; libraryImport: false; extensionInstall: false')
    })
    it('uses exactly two official fixed queries and documents a real pinned LongString registration',()=>{
        expect(Object.keys(SUWAYOMI_QUERIES).sort()).toEqual(['info','sources'])
        for(const operation of Object.values(SUWAYOMI_QUERIES))expect(operation.query).toMatch(/^query /)
        for(const operation of Object.values(SUWAYOMI_QUERIES))expect(operation.query).not.toMatch(/mutation|subscription|install|update|setSettings/)
        expect(authority.upstream.commit).toBe('40bc5da57820324ed0ae724cbbc020cc4673b594')
        expect(authority.upstream.sourceFiles).toHaveLength(7)
        expect(authority.upstream.sourceFiles.some((row:{file:string})=>row.file.endsWith('TachideskGraphQLSchema.kt'))).toBe(true)
    })
    it('keeps provider/account/database/file/process capabilities out of every host module',()=>{
        for(const name of ['contract','suwayomi','inspector','http-transport','http-body']){
            const code=read('src/source-hosts/'+name+'.ts')
            expect(code).not.toMatch(/LibraryDatabase|LibraryService|ProviderRegistry|PicaClient|JmWorker|credentialsStore|node:fs|node:child_process|node:net|\.listen\(|\.spawn\(/)
        }
        expect(read('src/source-hosts/http-body.ts')).toContain("import { Buffer } from 'node:buffer'")
    })
    it('wires the real Desktop command, shutdown cancellation and active-work lease',()=>{
        const app=read('src/desktop/main.ts')
        expect(app).toContain('new SourceHostInspector(sourceHostHttp)')
        expect(app).toContain('return sourceHostInspector.inspect(input, signal)')
        expect(app).toContain("if (sourceHostInspector.busy) leases.push('source-host-inspection')")
        expect(app).toContain('sourceHostInspector.cancel()');expect(app).toContain('sourceHostInspector.close()')
        const server=read('src/library/server.ts')
        expect(server).toContain("'/api/v1/desktop/source-hosts/inspect'")
        expect(server).toContain('sourceHostAction(input, abort.signal)')
        expect(server).toContain('body(request, 16384)');expect(server).toContain('setTimeout(() => request.destroy(), 5000)')
        expect(server).toContain("response.once('close', disconnected)")
    })
    it('uses explicit panel events with no storage, arbitrary markup, provider calls or background polls',()=>{
        const ui=read('web/source-hosts.js'),html=read('web/index.html')
        expect(ui).not.toMatch(/localStorage|sessionStorage|indexedDB|\.innerHTML|insertAdjacentHTML|setInterval|\/api\/v1\/comics|sourceAction|startWorker|\.src\s*=/)
        expect(ui).toContain('text.textContent = value')
        expect(ui).toContain('ticket !== generation || !panel.open || controller.signal.aborted')
        expect(ui).toContain("panel.addEventListener('toggle'")
        expect(ui).toContain("window.addEventListener('pagehide'")
        expect(html).toContain('<details id="source-host-panel">')
        expect(html).toContain('src="./source-hosts.js"')
    })
    it('retains all runtime/browser gates in CI rather than triggering them from local source validation',()=>{
        const smoke=read('scripts/run-web-browser-smoke.sh'),gate=read('scripts/test-windows-source-media.mjs')
        expect(smoke).toContain('test/e2e/source-hosts.spec.mjs')
        expect(gate.indexOf("process.env.GITHUB_ACTIONS !== 'true'")).toBeLessThan(gate.indexOf('fs.mkdtempSync'))
        expect(gate).toContain('await assertPackagedSourceHostInspection(')
        expect(read('scripts/lib/assert-source-host-inspection.mjs')).toContain("packaged_source_host_inspection: 'PASS'")
    })
    it('keeps saved host authority platform-neutral, inspection-only and separate from source/content/account ownership',async()=>{
        const result=await build({entryPoints:['src/source-hosts/connections.ts'],bundle:true,platform:'browser',format:'esm',write:false,metafile:true,logLevel:'silent'})
        expect(Object.keys(result.metafile!.inputs).map(file=>file.replaceAll('\\','/')).sort()).toEqual(['src/source-hosts/connections.ts','src/source-hosts/contract.ts'])
        const core=read('src/source-hosts/connections.ts'),ui=read('web/saved-source-hosts.js'),main=read('src/desktop/main.ts')
        expect(core).not.toMatch(/node:|process\.|LibraryDatabase|ProviderRegistry|\.fetch\(|\.listen\(|credentialsStore/)
        expect(core).toContain("scope: 'inspect-only'")
        expect(core).toContain("credentials: 'per-request-not-stored'")
        expect(ui).not.toMatch(/localStorage|sessionStorage|indexedDB|\.innerHTML|insertAdjacentHTML|setInterval|\/api\/v1\/comics|\.src\s*=/)
        expect(main).toContain('sourceHostConnections.cancel()');expect(main).toContain('sourceHostConnections.close()')
        expect(main).toContain("sourceHostStore(path.join(path.dirname(paths.config), 'source-hosts.json'))")
    })
    it('shares the real Reader via narrow state/source/cache/identity ports without pulling SQL/accounts/filesystem into its emitted graph',async()=>{
        const result=await build({entryPoints:['src/services/online-reader-service.ts'],bundle:true,platform:'node',format:'esm',write:false,metafile:true,logLevel:'silent'})
        expect(Object.keys(result.metafile!.inputs).map(file=>file.replaceAll('\\','/')).filter(file=>file.startsWith('src/')).sort()).toEqual(['src/reader/progress-writes.ts','src/services/online-reader-service.ts'])
        expect(read('src/services/online-reader-service.ts')).not.toMatch(/LibraryDatabase|ProviderService|PreviewCacheManager|node:fs|credentialsStore/)
        expect(read('src/reader/progress-writes.ts')).not.toMatch(/LibraryDatabase|ProviderService|PreviewCacheManager|node:fs|credentialsStore|fetch\(|listen\(/)
        const protocol=await build({entryPoints:['src/source-hosts/reader-protocol.ts'],bundle:true,platform:'browser',format:'esm',write:false,metafile:true,logLevel:'silent'})
        expect(Object.keys(protocol.metafile!.inputs).map(file=>file.replaceAll('\\','/')).sort()).toEqual(['src/source-hosts/contract.ts','src/source-hosts/reader-protocol.ts','src/source-hosts/suwayomi.ts'])
        const ui=read('web/host-library.js'),server=read('src/library/server.ts')
        expect(ui).not.toMatch(/localStorage|sessionStorage|\.innerHTML|insertAdjacentHTML|setInterval/)
        expect(server).toContain("request.headers['sec-fetch-site'] === 'same-origin'")
        expect(server).toContain("'cross-origin-resource-policy': 'same-origin'")
        expect(read('scripts/lib/assert-hosted-library-reader.mjs')).toContain("packaged_host_library_reader:'PASS'")
    })
})
