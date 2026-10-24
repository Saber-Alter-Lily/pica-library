import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { DatabaseSync } from 'node:sqlite'

/** Reuses the caller's exact isolated application/profile; never spawns a second app or a JVM. */
export async function assertPackagedSourceHostInspection({ status, home, data, sourceSha, version }) {
    if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32') throw Error('Source-host application/listener gate is CI-only')
    const current = await status(), appUrl = new URL(current.fixtureApplicationUrl)
    assert.equal(current.version, version); assert.equal(current.sourceHostInspection?.available, true)
    const api = appUrl.origin + '/api/v1/desktop/source-hosts/inspect'
    const secret = 'synthetic-host-secret-not-an-account', basic = 'Basic ' + Buffer.from('synthetic:' + secret).toString('base64')
    let mode = 'normal', unexpected = 0, cancelled = 0, stalled = 0
    const observations = []
    const fixture = http.createServer(async (request, response) => {
        if (request.method !== 'POST' || request.url !== '/owned-host/api/graphql' || request.headers.cookie) { unexpected++; response.writeHead(502); response.end(); return }
        try {
            const chunks = []; let bytes = 0
            for await (const chunk of request) { bytes += chunk.length; if (bytes > 2048) throw Error('Unexpected synthetic request'); chunks.push(chunk) }
            const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            assert.ok(['PicaSourceHostInfo', 'PicaSourceHostSources'].includes(value.operationName))
            assert.match(value.query, /^query /); assert.doesNotMatch(value.query, /mutation|subscription|installExtension/)
            observations.push({ operation: value.operationName, variables: value.variables, explicitBasic: request.headers.authorization === basic, ambientAuth: Boolean(request.headers.authorization && request.headers.authorization !== basic), cookie: Boolean(request.headers.cookie), mode })
            if (mode === 'redirect') { response.writeHead(302, { location: 'http://127.0.0.1:' + fixture.address().port + '/do-not-forward' }); response.end(); return }
            if (mode === 'large') { response.writeHead(200, { 'content-type': 'application/json', 'content-length': 1048577 }); response.end('{}'); return }
            response.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'must-not-be-replayed=synthetic' })
            if (mode === 'stall') { stalled++; response.once('close', () => { if (!response.writableEnded) cancelled++ }); response.write('{"data":'); return }
            if (mode === 'error') { response.end(JSON.stringify({ data: {}, errors: [{ message: secret }] })); return }
            const payload = value.operationName === 'PicaSourceHostInfo' ? { aboutServer: { name: 'Suwayomi-Server', version: '2.4.2366' } } : { sources: { nodes: [{ id: '9223372036854775807', name: 'Synthetic host source', lang: 'zh', supportsLatest: true }], pageInfo: { hasNextPage: false, hasPreviousPage: false }, totalCount: 1 } }
            response.end(JSON.stringify({ data: payload }))
        } catch { unexpected++; if (!response.headersSent) response.writeHead(502); response.end() }
    })
    const snapshot = () => {
        const sqlite = new DatabaseSync(path.join(data, 'library.db'))
        try { return JSON.stringify(Object.fromEntries(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name }) => { assert.match(name, /^[a-z_0-9]+$/i); return [name, sqlite.prepare('SELECT * FROM "' + name + '"').all().map(row => JSON.stringify(row)).sort()] }))) }
        finally { sqlite.close() }
    }
    const headers = { 'content-type': 'application/json', Origin: appUrl.origin, 'x-pica-csrf': current.csrfToken }
    const post = (body, extra = {}, signal = AbortSignal.timeout(16000)) => fetch(api, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body), signal })
    const wait = async check => { for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 50)) } throw Error('Owned host fixture did not reach expected cancellation state') }
    try {
        await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve))
        const input = { kind: 'suwayomi', endpoint: 'http://127.0.0.1:' + fixture.address().port + '/owned-host/', consent: true }
        const before = snapshot(), config = fs.readFileSync(path.join(home, 'config/config.json')), choices = current.externalSources
        assert.deepEqual(choices.enabled, []); assert.equal(observations.length, 0)
        assert.equal((await fetch(api)).status, 405)
        assert.equal((await post(input, { 'x-pica-csrf': 'untrusted' })).status, 403)
        assert.equal((await post(input, { Origin: 'https://untrusted.invalid' })).status, 403)
        assert.equal((await post({ ...input, consent: false })).status, 400)
        assert.equal(observations.length, 0)
        const success = await post(input), value = await success.json()
        assert.equal(success.status, 200); assert.equal(value.page.sources[0].id, '9223372036854775807')
        assert.deepEqual(value.capabilities, { sourceInspection: true, reader: false, libraryImport: false, extensionInstall: false }); assert.equal(value.persisted, false)
        assert.equal(observations.length, 2)
        const authenticated = await post({ ...input, auth: { mode: 'basic', username: 'synthetic', password: secret } })
        assert.equal(authenticated.status, 200); assert.equal(observations.slice(-2).every(row => row.explicitBasic), true)
        assert.equal(JSON.stringify(await authenticated.json()).includes(secret), false)
        for (const [setting, statusCode, code] of [['redirect', 502, 'SOURCE_HOST_REDIRECT'], ['large', 502, 'SOURCE_HOST_TOO_LARGE'], ['error', 502, 'SOURCE_HOST_PROTOCOL']]) {
            mode = setting; const response = await post(input), error = await response.json(); assert.equal(response.status, statusCode); assert.equal(error.code, code); assert.equal(JSON.stringify(error).includes(secret), false)
        }
        mode = 'stall'
        const abort = new AbortController(), pending = post(input, {}, abort.signal)
        await wait(() => stalled === 1); abort.abort(); await assert.rejects(pending); await wait(() => cancelled >= 1)
        const timed = await post(input); assert.equal(timed.status, 504); assert.equal((await timed.json()).code, 'SOURCE_HOST_TIMEOUT'); await wait(() => cancelled >= 2)
        mode = 'normal'; const retry = await post(input); assert.equal(retry.status, 200); await retry.arrayBuffer()
        const connectionsApi = appUrl.origin + '/api/v1/desktop/source-hosts/connections'
        const savedInspectApi = appUrl.origin + '/api/v1/desktop/source-hosts/inspect-saved'
        const command = body => fetch(connectionsApi, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(16000) })
        const count = observations.length
        assert.equal(current.sourceHostConnections?.available, true)
        const empty = await command({ action: 'list' }); assert.equal(empty.status, 200); assert.deepEqual((await empty.json()).hosts, [])
        const savedResponse = await command({ action: 'save', kind: 'suwayomi', label: 'Synthetic user-owned host', endpoint: input.endpoint, authMode: 'basic', allowInsecureLan: false, consent: true, scope: 'inspect-only' })
        assert.equal(savedResponse.status, 200); const host = (await savedResponse.json()).hosts[0]
        assert.equal(host.enabled, false); assert.equal(observations.length, count)
        const enabled = await command({ action: 'set-enabled', id: host.id, expectedRevision: 0, enabled: true, consent: true }); assert.equal(enabled.status, 200); await enabled.arrayBuffer()
        assert.equal(observations.length, count)
        const checkSaved = body => fetch(savedInspectApi, { method: 'POST', headers, body: JSON.stringify({ id: host.id, expectedRevision: 1, consent: true, ...body }), signal: AbortSignal.timeout(16000) })
        const noSecret = await checkSaved({}); assert.equal(noSecret.status, 401); await noSecret.arrayBuffer()
        assert.equal(observations.length, count)
        const checked = await checkSaved({ auth: { mode: 'basic', username: 'synthetic', password: secret } }); assert.equal(checked.status, 200); assert.equal((await checked.json()).persisted, false)
        assert.equal(observations.length, count + 2); assert.equal(observations.slice(-2).every(row => row.explicitBasic), true)
        const metadata = fs.readFileSync(path.join(home, 'config/source-hosts.json'), 'utf8')
        assert.equal(metadata.includes(secret), false); assert.doesNotMatch(metadata, /password|username|authorization|cookie|token/)
        assert.equal(JSON.parse(metadata).hosts[0].id, host.id); assert.equal(JSON.parse(metadata).hosts[0].enabled, true)
        const disabled = await command({ action: 'set-enabled', id: host.id, expectedRevision: 1, enabled: false, consent: true }); assert.equal(disabled.status, 200); await disabled.arrayBuffer()
        const denied = await checkSaved({ expectedRevision: 2 }); assert.equal(denied.status, 409); assert.equal((await denied.json()).code, 'SOURCE_HOST_DISABLED')
        const stale = await command({ action: 'set-enabled', id: host.id, expectedRevision: 1, enabled: true, consent: true }); assert.equal(stale.status, 409); await stale.arrayBuffer()
        const removed = await command({ action: 'remove', id: host.id, expectedRevision: 2, consent: true }); assert.equal(removed.status, 200); assert.deepEqual((await removed.json()).hosts, [])
        assert.equal(observations.length, count + 2)
        assert.equal(snapshot(), before); assert.deepEqual(fs.readFileSync(path.join(home, 'config/config.json')), config)
        assert.deepEqual((await status()).externalSources, choices); assert.equal(fs.existsSync(path.join(home, 'config/credentials.dat')), false)
        assert.equal(unexpected, 0); assert.equal(observations.some(row => row.ambientAuth || row.cookie), false)
        process.stdout.write(JSON.stringify({ packaged_source_host_inspection: 'PASS', saved_host_lifecycle: 'PASS', saved_disabled_by_default: true, settings_changes_do_not_contact_host: true, per_request_only_credentials: true, stale_permission_rejected: true, saved_metadata_excludes_secrets: true, source_sha: sourceSha, version, execution_location: 'GITHUB_WINDOWS_CI', actual_http_adapter: true, lossless_long_source_id: true, get_and_csrf_and_origin_and_consent_rejected_before_host: true, source_choices_unchanged: true, all_tables_unchanged: true, config_bytes_unchanged: true, credentials_file_created: false, basic_scoped_to_explicit_host: true, redirects_refused: true, size_and_graphql_errors_sanitized: true, explicit_cancel_closed_remote_stream: true, actual_deadline_closed_remote_stream: true, successful_retry: true, reader_or_library_import_advertised: false, extension_or_host_installed: false, unexpected_fixture_requests: unexpected, host_requests: observations.length, production_accessed: false }) + '\n')
    } finally { fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve)) }
}
