import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import AdmZip from 'adm-zip'
import { assertPackagedSourceHostInspection } from './lib/assert-source-host-inspection.mjs'

if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Permission-sensitive source runtime gate is CI-only; see docs/LOCAL_VALIDATION_SAFETY.md')

// Actual packaged engine and local HTTP fixture only; never substitute an installed profile.
const [zipFile, version, sourceSha] = process.argv.slice(2)
if (process.platform !== 'win32' || !zipFile || !version || !/^[0-9a-f]{40}$/.test(sourceSha ?? '')) throw new Error('Explicit Windows package/version/source required')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-source-media-'))
const app = path.join(root, 'application'), home = path.join(root, 'localappdata', 'Pica Library Post Stable RC')
const data = path.join(home, 'data'), instanceFile = path.join(home, 'runtime-state', 'instance.json')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WsAAAAASUVORK5CYII=', 'base64')
let requests = 0, slowRequests = 0, cancelledRequests = 0, forbidden = 0, instance, success = false
const proxyObservations = []
const proxy = http.createServer((request, response) => {
    proxyObservations.push({ method: request.method, url: String(request.url).includes('pica-acceptance.invalid') ? request.url : 'unexpected target', headerNames: Object.keys(request.headers) })
    if (request.method === 'GET' && request.url === 'https://cdn.pica-acceptance.invalid/cancel.png' &&
        !['authorization', 'cookie', 'signature', 'api-key', 'nonce'].some(name => request.headers[name])) {
        cancelledRequests++
        response.writeHead(200, { 'content-type': 'image/png' })
        response.write(png.subarray(0, 8))
        return
    }
    if (request.method === 'GET' && request.url === 'https://cdn.pica-acceptance.invalid/slow.png' &&
        !['authorization', 'cookie', 'signature', 'api-key', 'nonce'].some(name => request.headers[name])) {
        slowRequests++
        // Intentionally never send headers/body; only the production client's deadline ends this.
        return
    }
    if (request.method !== 'GET' || request.url !== 'https://cdn.pica-acceptance.invalid/cover.png' ||
        ['authorization', 'cookie', 'signature', 'api-key', 'nonce'].some(name => request.headers[name])) {
        forbidden++; response.writeHead(502); response.end(); return
    }
    requests++
    response.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length })
    response.end(png)
})
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitInstance() {
    for (let attempt = 0; attempt < 200; attempt++) {
        try {
            const value = JSON.parse(fs.readFileSync(instanceFile, 'utf8'))
            if (value.pid && /^http:\/\/127\.0\.0\.1:\d+$/.test(value.url)) return value
        } catch {}
        await sleep(100)
    }
    throw new Error('Owned packaged instance did not appear')
}
async function status() {
    instance = await waitInstance()
    const response = await fetch(instance.url + '/api/v1/desktop/status', { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error('Owned Desktop status unavailable')
    return response.json()
}
async function post(route, body) {
    const current = await status()
    const response = await fetch(instance.url + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-pica-csrf': current.csrfToken, Origin: instance.url }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error('Synthetic local operation failed: ' + route + ' HTTP ' + response.status)
    return response.json()
}
try {
    const archive = new AdmZip(zipFile)
    archive.extractAllTo(app)
    if (!fs.existsSync(path.join(app, 'Pica Library.exe')) || fs.readFileSync(path.join(app, 'SOURCE_SHA.txt'), 'utf8').trim() !== sourceSha) throw new Error('Actual package identity mismatch')
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
    const proxyUrl = 'http://127.0.0.1:' + proxy.address().port
    const env = { ...process.env, LOCALAPPDATA: path.dirname(home) }
    for (const key of Object.keys(env)) if (key.startsWith('PICA_')) delete env[key]
    env.PICA_LIBRARY_DESKTOP_HOME = home
    spawn(path.join(app, 'Pica Library.exe'), ['--no-open'], { env, cwd: app, windowsHide: true, stdio: 'ignore' }).on('error', () => {})
    let current = await status()
    if (current.version !== version || current.configured || current.picaAccount?.configured) throw new Error('Expected fresh isolated source-free package')
    await post('/api/v1/desktop/settings', { setupMode: 'local', libraryDirectory: data, profile: 'balanced' })
    const oldCsrf = current.csrfToken
    let ready = false
    for (let attempt = 0; attempt < 200; attempt++) {
        try {
            current = await status()
            if (current.configured && current.startupReady && current.csrfToken !== oldCsrf) { ready = true; break }
        } catch {}
        await sleep(100)
    }
    if (!ready) throw new Error('Local setup did not finish its actual engine restart')
    if (current.externalSources?.enabled.length !== 0) throw new Error('Fresh local setup unexpectedly enabled a source')
    await assertPackagedSourceHostInspection({ status: async () => ({ ...await status(), fixtureApplicationUrl: instance.url }), home, data, sourceSha, version })
    await post('/api/v1/desktop/settings', { sourceAction: 'save', enabled: ['jm'], expectedRevision: current.externalSources.revision })
    await post('/api/v1/desktop/settings', { libraryDirectory: data, profile: 'balanced', proxyUrl })
    await post('/api/v1/import', { records: [{ comicId: 'jm:123', providerId: 'jm', providerRemoteId: '123', title: 'Synthetic packaged JM cover', author: 'Fixture', tags: [], categories: [], finished: false, coverUrl: 'https://cdn.pica-acceptance.invalid/cover.png' }] })
    const responses = await Promise.all(Array.from({ length: 3 }, () => fetch(instance.url + '/api/v1/covers/jm%3A123?url=https://127.0.0.1/not-allowed', { signal: AbortSignal.timeout(15000) })))
    for (const response of responses) {
        const bytes = Buffer.from(await response.arrayBuffer())
        if (!response.ok || response.headers.get('content-type') !== 'image/png' || !bytes.equals(png)) throw new Error('Actual packaged JM cover response invalid: ' + JSON.stringify({ status: response.status, type: response.headers.get('content-type'), bytes: bytes.length, error: response.ok ? null : bytes.toString('utf8').slice(0, 300), proxyObservations }))
    }
    current = await status()
    if (!current.configured || current.picaAccount?.configured || requests !== 1 || forbidden || fs.existsSync(path.join(home, 'config', 'credentials.dat'))) throw new Error('Source-free/cache/credential boundary failed')
    const modules = await fetch(instance.url + '/api/v1/capabilities').then(response => response.json())
    if (modules.sourceModules.find(module => module.id === 'jm')?.adapterVersion !== '1.0.1') throw new Error('New compiled adapter declaration missing')
    await post('/api/v1/import', { records: [{ comicId: 'jm:124', providerId: 'jm', providerRemoteId: '124', title: 'Synthetic timeout', author: 'Fixture', tags: [], categories: [], finished: false, coverUrl: 'https://cdn.pica-acceptance.invalid/slow.png' }] })
    const timed = await fetch(instance.url + '/api/v1/covers/jm%3A124', { signal: AbortSignal.timeout(30000) })
    if (timed.ok || !(await timed.text()).includes('timed out') || slowRequests !== 1 || forbidden) throw new Error('Actual packaged media deadline did not terminate the stalled fixture')
    await post('/api/v1/import', { records: [{ comicId: 'jm:125', providerId: 'jm', providerRemoteId: '125', title: 'Synthetic source cancellation', author: 'Fixture', tags: [], categories: [], finished: false, coverUrl: 'https://cdn.pica-acceptance.invalid/cancel.png' }] })
    const pending = fetch(instance.url + '/api/v1/covers/jm%3A125', {signal: AbortSignal.timeout(15000)})
    for (let attempt = 0; attempt < 100 && !cancelledRequests; attempt++) await sleep(50)
    if (cancelledRequests !== 1) throw new Error('Synthetic cancellation request did not enter transport')
    current = await status()
    await post('/api/v1/desktop/settings', {sourceAction:'save',enabled:[],expectedRevision:current.externalSources.revision})
    const cancelled = await pending
    if (cancelled.status !== 409 || (await cancelled.json()).code !== 'SOURCE_DISABLED') throw new Error('Packaged source disable did not abort in-flight media')
    const blocked = await fetch(instance.url + '/api/v1/covers/jm%3A125')
    if (blocked.status !== 409 || cancelledRequests !== 1) throw new Error('Disabled source issued another request')
    current = await status()
    const disabledRevision = current.externalSources.revision
    const stale = await fetch(instance.url + '/api/v1/desktop/settings', {method:'POST',headers:{'content-type':'application/json','x-pica-csrf':current.csrfToken,Origin:instance.url},body:JSON.stringify({sourceAction:'save',enabled:['pica'],expectedRevision:disabledRevision-1})})
    if (stale.ok || (await status()).externalSources.enabled.length) throw new Error('Stale source choices overwrote the current policy')
    await post('/api/v1/desktop/settings', {sourceAction:'save',enabled:['jm'],expectedRevision:disabledRevision})
    const expectedPolicy = (await status()).externalSources
    await post('/api/v1/desktop/shutdown', {})
    let stopped = false
    for (let attempt = 0; attempt < 100; attempt++) {
        try { process.kill(instance.pid, 0) } catch { stopped = true; break }
        await sleep(100)
    }
    if (!stopped) throw new Error('Owned source fixture did not stop before relaunch')
    instance = null
    spawn(path.join(app, 'Pica Library.exe'), ['--no-open'], {env,cwd:app,windowsHide:true,stdio:'ignore'}).on('error',()=>{})
    current = await status()
    if (JSON.stringify(current.externalSources) !== JSON.stringify(expectedPolicy) || current.picaAccount?.configured || fs.existsSync(path.join(home,'config','credentials.dat'))) throw new Error('Source policy or credential boundary changed on restart')
    success = true
    process.stdout.write(JSON.stringify({ packaged_source_media: 'PASS', packaged_source_lifecycle: 'PASS', source_sha: sourceSha, version, fresh_sources_disabled:true, explicit_jm_opt_in:true, in_flight_abort:true, stale_save_rejected:true, source_policy_restart:true, cancelled_fixture_requests:cancelledRequests, pica_account_configured: false, pica_or_other_remote_requests: forbidden, cover_http_requests: requests, slow_fixture_requests: slowRequests, bounded_timeout_response: true, concurrent_cover_readers: responses.length, caller_url_ignored: true, configured_proxy_used: true, cached_image_bytes_match: true, credentials_file_created: false, synthetic_only: true, production_accessed: false }) + '\n')
} finally {
    if (instance) {
        try { await post('/api/v1/desktop/shutdown', {}) } catch {}
        for (let attempt = 0; attempt < 100; attempt++) {
            try { process.kill(instance.pid, 0) } catch { instance = null; break }
            await sleep(100)
        }
    }
    proxy.closeAllConnections()
    await new Promise(resolve => proxy.close(resolve))
    // Preserve diagnostics if a task-owned backend did not exit. Never kill an unrelated process.
    if (instance) throw new Error('Owned test backend is still alive; synthetic fixture retained: ' + root)
    if (success) {
        const resolved = fs.realpathSync(root), parent = fs.realpathSync(os.tmpdir())
        if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('pica-source-media-') || fs.lstatSync(root).isSymbolicLink()) throw new Error('Unsafe fixture cleanup refused')
        fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } else process.stderr.write('Synthetic fixture retained: ' + root + '\n')
}
