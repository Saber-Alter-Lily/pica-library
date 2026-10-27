import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

// Source/fixture tests only: native tools, applications and listeners are never loaded.
// @ts-expect-error The isolated CI helper is an ESM test asset, not an application SDK.
import { T3_KIND, T3_SCENARIOS, T3_VERSIONS, checkedT3Descriptor, t3OwnedPath, t3ForwardTransport, t3BrowserNetworkEvidence, t3ExpectedReconnectFailure } from '../../scripts/lib/legacy-transition-t3-fixture.mjs'
// @ts-expect-error Existing pure string-generating fixture helper.
import { firstHopStateProgram, runtimeChoiceStateProgram, legacyTransitionStateProgram } from '../../scripts/lib/first-hop-state.mjs'

const read=(file:string)=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n')
const recipe=read('.github/workflows/legacy-transition-t3.yml'),driver=read('scripts/test-windows-legacy-transition-t3.mjs'),preload=read('scripts/lib/legacy-transition-t3-preload.mjs'),builder=read('scripts/build-windows-legacy-transition-t3.ps1')
const hash=(value:string)=>createHash('sha256').update(value).digest('hex')
function descriptor(){
    const root=path.join(os.tmpdir(),'not-created-t3-fixture')
    return {schemaVersion:1,kind:T3_KIND,scenario:'success-forward',nonce:'a'.repeat(32),sourceSha:'a'.repeat(40),root,applicationRoot:path.join(root,'application'),auditFile:path.join(root,'audit.jsonl'),forwardArchive:path.join(root,'forward.zip'),transitionSha256:'b'.repeat(64),helperSha256:'b'.repeat(64),desktop1Sha256:'b'.repeat(64),desktop2Sha256:'b'.repeat(64),forwardSha256:'b'.repeat(64),publicationAuthenticated:false,syntheticStableAuthorityOnly:true}
}

describe('finite separately authorized T3 gate, no local runtime',()=>{
    it('has exactly seven scenario groups and versions only as synthetic fixture facts',()=>{
        expect(T3_SCENARIOS).toEqual(['preview-cancel','integrity-rejections','running-refusal','concurrent-entry','success-forward','launch-rollback','health-rollback'])
        expect(T3_VERSIONS).toEqual(['0.5.1','0.5.2'])
        expect(builder).toContain('publishedOrProposedVersion=$false')
        expect(builder).toContain('rawToolsOrInstallersMayBeUploaded=$false')
    })
    it('retains byte-identical old state programs while extending only the owned root kind',()=>{
        expect(hash(firstHopStateProgram)).toBe('6865a3a1f1257be308382b150ddaa0cacf9efc41c7364c4a49c9b7bd0ad20f8b')
        expect(hash(runtimeChoiceStateProgram)).toBe('52694c40f2ad87af0dc7b14d97aeffadb16c9301817dabd74fe62ce06a2e9af6')
        expect(legacyTransitionStateProgram).toContain('pica-legacy-transition-')
    })
    it('validates descriptor authority without a file, token, manifest or publication promotion',()=>{
        expect(checkedT3Descriptor(descriptor())).toMatchObject({publicationAuthenticated:false,syntheticStableAuthorityOnly:true})
        for(const value of [{...descriptor(),publicationAuthenticated:true},{...descriptor(),syntheticStableAuthorityOnly:false},{...descriptor(),helperSha256:'bad'},{...descriptor(),scenario:'any'},{...descriptor(),forwardArchive:'relative.zip'}])expect(()=>checkedT3Descriptor(value)).toThrow()
        const root=descriptor().root
        expect(t3OwnedPath(root,path.join(root,'safe.bin'))).toBe(path.join(root,'safe.bin'))
        for(const file of [root,path.dirname(root),path.join(root,'..','sibling')])expect(()=>t3OwnedPath(root,file)).toThrow()
    })
    it('uses the existing inert 0.5.2 publisher and refuses ambient auth or unrelated requests',async()=>{
        const native=vi.fn(async()=>new Response('real-loopback-only')),events:unknown[]=[]
        const transport=t3ForwardTransport({archiveBytes:Buffer.from('synthetic bytes'),allowedDesktop:()=>true,nativeFetch:native,observe:(event:unknown)=>events.push(event)})
        const published=await transport('https://api.github.com/repos/Saber-Alter-Lily/pica-library/releases/latest')
        expect((await published.json()).tag_name).toBe('v0.5.2');expect(native).not.toHaveBeenCalled()
        await expect(transport('https://provider.invalid/')).rejects.toThrow()
        await expect(transport('https://api.github.com/repos/Saber-Alter-Lily/pica-library/releases/latest',{headers:{authorization:'not-a-real-token'}})).rejects.toThrow()
        expect(await (await transport('http://127.0.0.1:1234/api/v1/capabilities')).text()).toBe('real-loopback-only')
        expect(native).toHaveBeenCalledTimes(1);expect(events.length).toBeGreaterThan(0)
    })
    it('actually rejects the driver before input reads, native addon loading or application work outside disposable CI',()=>{
        const run=spawnSync(process.execPath,['scripts/test-windows-legacy-transition-t3.mjs','MUST-NOT-READ'],{cwd:process.cwd(),env:{...process.env,GITHUB_ACTIONS:'false',RUNNER_ENVIRONMENT:'not-hosted'},windowsHide:true,encoding:'utf8',timeout:10000})
        expect(run.status).not.toBe(0);expect(run.stderr).toContain('separately authorized disposable GitHub-hosted Windows CI')
        expect(driver.indexOf('assertDisposableWindowsCi()')).toBeLessThan(driver.indexOf('fs.readFileSync('))
        expect(driver.indexOf('assertDisposableWindowsCi()')).toBeLessThan(driver.indexOf("require('node-pty')"))
    })
    it('confines execution to one exact public non-PR read-only Windows job, with no signing/publish/deploy',()=>{
        expect(recipe).toContain('branches: [codex/legacy-transition-t3-20261026]')
        expect(recipe).toContain("github.ref == 'refs/heads/codex/legacy-transition-t3-20261026'")
        expect(recipe).toContain('github.event.repository.private == false');expect(recipe).toContain("github.event_name != 'pull_request'")
        expect(recipe).toContain('permissions:\n  contents: read')
        expect(recipe).not.toMatch(/continue-on-error|secrets\.|gh release|git push|contents: write|pull_request_target|OTA|ota\//)
        expect(recipe).not.toContain('setup-java');expect(recipe).not.toContain('ANDROID_PREVIEW')
    })
    it('uploads only receipt/diagnostic leaves, never synthetic stable executables or archives',()=>{
        const paths=recipe.slice(recipe.indexOf('          path: |'),recipe.indexOf('          retention-days:'))
        expect(paths).toContain('legacy-transition-t3-private-fixtures/BUILD_RECEIPT.json')
        expect(paths).not.toMatch(/\.zip|\.exe|\.cjs|\.cmd|private-fixtures\/\*|legacy-transition-t3-private-fixtures\/$/m)
        expect(recipe).toContain('retention-days: 1');expect(recipe).toContain('if: always()')
    })
    it('keeps true TTY, real process proof, actual target helper and original health deadline',()=>{
        expect(driver).toContain('pty.spawn(');expect(driver).toContain('process.stdin.isTTY+","+process.stdout.isTTY')
        expect(driver).not.toMatch(/defineProperty\([^\n]*isTTY|\.isTTY\s*=|T3_SCENARIO_IMPLEMENTATION_PENDING/)
        expect(preload).toContain('Get-CimInstance Win32_Process');expect(preload).toContain('return original.call(this, command, ...args)')
        expect(preload).toContain('instruction.healthTimeoutMs !== 60000')
        expect(preload).toContain('input.helperSha256');expect(driver).toContain('health.at(-1).at - health[0].at >= 50000')
        expect(driver).toContain("page.locator('#update-one-click').click()")
        expect(driver).toContain("await page.locator('#app-confirm-submit').click()")
        expect(preload).not.toMatch(/new Response\([^\n]*(?:status:\s*200|healthy.*true)/)
    })
    it('uses exact cmd invocation, opened log descriptors and a real awaited welcome dismissal',()=>{
        expect(driver).toContain("['/d', '/c', 'Start-Pica-Library-Transition.cmd']")
        expect(driver).toContain("await Promise.all([once(out, 'open'), once(err, 'open')])")
        expect(driver.indexOf("await Promise.all([once(out, 'open')")).toBeLessThan(driver.indexOf('activeLauncher = spawn('))
        expect(driver).toContain("await expect(page.locator('#pica-onboarding-welcome')).toBeVisible")
        expect(driver).toContain("await expect(page.locator('#pica-onboarding-welcome')).toBeHidden")
        expect(driver).not.toContain("if (await page.locator('#pica-onboarding-welcome').isVisible())")
    })
    it('retains all network assertions while choosing the old supported headless scope only in CI',()=>{
        expect(preload).toContain("if (kind === 'old-desktop') {")
        expect(preload).toContain("process.argv.push('--headless')")
        expect(preload).toContain('LEGACY_SUPPORTED_HEADLESS_CI_CONTAINMENT')
        expect(preload).toContain('legacyInteractiveDefaultFixed: false')
        expect(driver).toContain("oldInteractiveDefaultBridge: 'NOT_ACCEPTED_NOT_FIXED'")
        expect(driver).toContain("/BLOCKED|UNEXPECTED|UNCAUGHT/.test(row.kind)")
        expect(preload).toContain("observe({ kind: 'NONLOCAL_LISTENER_BLOCKED' }); throw Error")
    })
    it('publishes terminal evidence and cleanup results before explicitly ending only the CI controller',()=>{
        expect(driver).toContain('controllerResourcesBeforeExit: process.getActiveResourcesInfo()')
        expect(driver.indexOf("fs.writeFileSync(path.join(evidence, 'summary.json')")).toBeLessThan(driver.indexOf('process.exit(exitCode)'))
        expect(driver).toContain("const exitCode = summary.status === 'PASS' ? 0 : 1")
        expect(recipe).toContain('timeout-minutes: 25');expect(recipe).toContain('timeout-minutes: 15')
        expect(driver).toContain('assert.equal(helpers()[0].healthTimeoutMs, 60000)')
    })
    it('records diagnostic API identities without hosts, queries, fragments, credentials or body data',()=>{
        expect(t3BrowserNetworkEvidence('http://user:secret@127.0.0.1:1234/api/v1/desktop/browser-session?token=private#secret','fetch')).toEqual({protocol:'http:',route:'/api/v1/desktop/browser-session',resourceType:'fetch'})
        for(const url of ['https://user:secret@provider.invalid/path?token=private#secret','invalid secret','http://localhost:1234/api/v1/comics/123456789abcdef?secret=value']) {
            const value=JSON.stringify(t3BrowserNetworkEvidence(url,'untrusted secret'))
            expect(value).not.toMatch(/secret|private|token|provider\.invalid|1234|123456789abcdef/)
        }
    })
    it('adds bounded response/failure timing only, without relaxing the original browser or process gate',()=>{
        expect(driver).toContain("page.on('response'")
        expect(driver).toContain("page.on('requestfailed'")
        expect(driver).toContain('browserDiagnostics.length >= 128')
        expect(driver).toContain("assert.equal(browserDiagnosticsOverflow, false")
        expect(driver).toContain('assert.deepEqual(browserErrors, []); assert.deepEqual(external, [])')
        expect(driver).not.toContain("!value.text().includes('Failed to load resource')")
    })
    it('recognizes only the shipped two GET probes during the accepted bounded restart',()=>{
        const input={url:'http://127.0.0.1:1234/api/v1/capabilities',stage:'apply-accepted',method:'GET',resourceType:'fetch',failure:'net::ERR_CONNECTION_REFUSED',elapsedSinceApplyMs:500}
        expect(t3ExpectedReconnectFailure(input,'http://127.0.0.1:1234')).toBe(true)
        expect(t3ExpectedReconnectFailure({...input,url:'http://127.0.0.1:1234/?pica-update-ready=1793070000000'},'http://127.0.0.1:1234')).toBe(true)
        for(const change of [{stage:'initial-page'},{stage:'update-request'},{stage:'reconnected'},{method:'POST'},{resourceType:'script'},{failure:'net::ERR_ABORTED'},{failure:undefined,status:400},{status:503},{elapsedSinceApplyMs:-1},{elapsedSinceApplyMs:90001},{elapsedSinceApplyMs:null},{url:'http://127.0.0.1:9999/api/v1/capabilities'},{url:'https://example.invalid/api/v1/capabilities'},{url:'http://user:secret@127.0.0.1:1234/api/v1/capabilities'},{url:'http://127.0.0.1:1234/api/v1/recommendation-events'},{url:'http://127.0.0.1:1234/'},{url:'http://127.0.0.1:1234/?pica-update-ready=123&extra=1'},{url:'http://127.0.0.1:1234/?pica-update-ready=bad'},{url:'http://127.0.0.1:1234/api/v1/capabilities?extra=1'}]) {
            expect(t3ExpectedReconnectFailure({...input,...change},'http://127.0.0.1:1234')).toBe(false)
        }
    })
    it('requires real new-version readback and one-to-one failed-request correlation, while retaining all HTTP errors',()=>{
        expect(driver).toContain('matched.has(index)')
        expect(driver).toContain('value.url === error.url')
        expect(driver).toContain('Math.abs(value.elapsedMs - error.elapsedMs) <= 1000')
        expect(driver).toContain("error.message === 'Failed to load resource: net::ERR_CONNECTION_REFUSED'")
        expect(driver).toContain("assert.deepEqual(browserReadback, { capabilitiesStatus: 200, appVersion: '0.5.2', shellStatus: 200, html: true })")
        expect(driver).toContain("value.kind === 'http-error'")
        expect(driver).toContain('assert.deepEqual(browserErrors, []); assert.deepEqual(external, [])')
    })
})
