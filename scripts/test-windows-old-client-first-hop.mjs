import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'
import { assertDisposableWindowsCi, FIRST_HOP_BASELINE, FIRST_HOP_FIXTURE_VERSION, FIRST_HOP_SCENARIOS, firstHopPublication, sha256 } from './lib/old-client-first-hop.mjs'
import { firstHopStateProgram } from './lib/first-hop-state.mjs'

// Refuse before reading inputs or creating files. Never a local application-launch permission.
assertDisposableWindowsCi()
const [baselineFile, candidateFile, receiptFile, sourceSha, selected = 'all'] = process.argv.slice(2)
if (!baselineFile || !candidateFile || !receiptFile || !/^[a-f0-9]{40}$/.test(sourceSha ?? '') || (selected !== 'all' && !FIRST_HOP_SCENARIOS.includes(selected))) throw Error('Explicit pinned baseline, synthetic fixture ZIP/receipt, candidate source and scenario required')
const baselineBytes = fs.readFileSync(baselineFile), candidateBytes = fs.readFileSync(candidateFile)
assert.equal(sha256(baselineBytes), FIRST_HOP_BASELINE.zipSha256)
const baseline = new AdmZip(baselineBytes), candidate = new AdmZip(candidateBytes), receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'))
assert.equal(receipt.kind, 'SYNTHETIC_PUBLISHER_FIRST_HOP_ONLY_NOT_FOR_INSTALLATION')
assert.equal(receipt.sourceSha, sourceSha); assert.equal(receipt.fixtureVersion, FIRST_HOP_FIXTURE_VERSION)
assert.equal(receipt.archiveSha256, sha256(candidateBytes)); assert.equal(receipt.versionOnlyBuildOverride, true)
assert.equal(receipt.compiledSourcesOrHelpersPatched, false); assert.equal(receipt.publishedOrProposedVersion, false)
assert.equal(baseline.readAsText('SOURCE_SHA.txt').trim(), FIRST_HOP_BASELINE.sourceSha)
assert.equal(sha256(baseline.readFile('app/desktop.js')), FIRST_HOP_BASELINE.desktopSha256)
assert.equal(sha256(baseline.readFile('app/full-upgrader.js')), FIRST_HOP_BASELINE.helperSha256)
assert.equal(candidate.readAsText('SOURCE_SHA.txt').trim(), sourceSha)
const marker = JSON.parse(candidate.readAsText('FIRST_HOP_FIXTURE.json'))
for (const [key, value] of Object.entries(marker)) assert.deepEqual(receipt[key], value, 'Fixture marker/receipt mismatch: ' + key)
assert.deepEqual(JSON.parse(candidate.readAsText('app/runtime-composition.json')), { formatVersion: 1, sourceRuntimes: [] })
for (const zip of [baseline, candidate]) {
    const identities = new Set()
    for (const entry of zip.getEntries()) {
        const name = entry.isDirectory ? entry.entryName.replace(/\/$/, '') : entry.entryName
        assert.ok(!name.includes('\\') && !name.includes(':') && !name.startsWith('/') && !name.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part)), 'Unsafe input ZIP path')
        assert.ok(!identities.has(name.toLowerCase()), 'Duplicate/case-aliased ZIP path'); identities.add(name.toLowerCase())
        assert.ok(name.toLowerCase() !== 'runtime/jm' && !name.toLowerCase().startsWith('runtime/jm/'), 'This pinned first-hop gate is core-only')
        assert.ok(((entry.attr >>> 16) & 0o170000) !== 0o120000, 'Linked input ZIP file')
    }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), scriptRoot = path.dirname(fileURLToPath(import.meta.url))
const evidence = path.resolve('artifacts/old-client-first-hop-evidence')
fs.mkdirSync(evidence, { recursive: true })
function treeSnapshot(root) {
    const rows = []
    function walk(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name), stat = fs.lstatSync(file)
            assert.ok(!stat.isSymbolicLink(), 'Linked application tree')
            if (stat.isDirectory()) walk(file)
            else { assert.ok(stat.isFile()); rows.push([path.relative(root, file).replaceAll('\\', '/'), sha256(fs.readFileSync(file))]) }
        }
    }
    walk(root); return rows.sort((a, b) => a[0].localeCompare(b[0]))
}
async function scenario(kind) {
    const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'pica-old-first-hop-' + randomUUID().replaceAll('-', '')))
    const app = path.join(root, 'application'), home = path.join(root, 'localappdata', 'Pica Library'), data = path.join(home, 'data'),
        instanceFile = path.join(home, 'runtime-state', 'instance.json'), progressFile = path.join(home, 'runtime-state', 'updates', 'update-progress.json'),
        harness = path.join(root, 'harness'), auditFile = path.join(harness, 'audit.jsonl'), descriptorFile = path.join(harness, 'fixture.json'), archiveFile = path.join(harness, 'candidate.zip')
    const env = { ...process.env, LOCALAPPDATA: path.dirname(home), APPDATA: path.join(root, 'roaming') }
    for (const key of Object.keys(env)) if (/^(?:PICA_|JM_|EH_|EXH_|ANDROID_PREVIEW_|GH_TOKEN$|GITHUB_TOKEN$|NODE_OPTIONS$|READER_FIRST_HOP_FIXTURE$)/i.test(key)) delete env[key]
    let instance = null, oldPid = 0, row = { scenario: kind, status: 'FAIL' }, success = false, launcher = null
    const streams = []
    function node(args) {
        const result = spawnSync(path.join(app, 'runtime', 'node.exe'), args, { env, cwd: root, windowsHide: true, encoding: 'utf8', timeout: 20000 })
        assert.equal(result.status, 0, (result.stderr ?? '').slice(-3000)); return result.stdout
    }
    function state(action) { return JSON.parse(node(['-e', firstHopStateProgram, action, root])) }
    function ownedPid(pid) {
        assert.ok(Number.isInteger(pid) && pid > 0)
        const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
            `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress`], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
        assert.equal(result.status, 0)
        if (!result.stdout.trim()) return false
        const process = JSON.parse(result.stdout)
        assert.ok(process.ExecutablePath && fs.realpathSync.native(process.ExecutablePath).toLowerCase().startsWith(root.toLowerCase() + path.sep), 'Refuse process outside exact owned first-hop root')
        return true
    }
    async function ready(version, differentPid = false) {
        for (let attempt = 0; attempt < 300; attempt++) {
            try {
                const value = JSON.parse(fs.readFileSync(instanceFile, 'utf8'))
                if (!Number.isInteger(value.pid) || !/^http:\/\/127\.0\.0\.1:\d+$/.test(value.url) || (differentPid && value.pid === oldPid)) throw Error('Waiting for owned replacement')
                const response = await fetch(value.url + '/api/v1/desktop/status', { signal: AbortSignal.timeout(1500) }), status = await response.json()
                // The pinned old release has no startupReady field and can expose
                // updates without credentials. Match actual helper health, not a
                // fabricated modern ready/configured contract or a fake login.
                const caps = await fetch(value.url + '/api/v1/capabilities', { signal: AbortSignal.timeout(1500) })
                const capabilities = await caps.json()
                if (response.ok && caps.ok && status.version === version && capabilities.appVersion === version) { instance = value; return status }
            } catch {}
            await sleep(100)
        }
        throw Error('Actual owned Desktop did not become ready: ' + version)
    }
    async function post(route, body, timeout = 30000) {
        const response = await fetch(instance.url + '/api/v1/desktop/status', { signal: AbortSignal.timeout(5000) })
        assert.ok(response.ok); const status = await response.json()
        return fetch(instance.url + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-pica-csrf': status.csrfToken, Origin: instance.url }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) })
    }
    function events() { return fs.readFileSync(auditFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) }
    async function stopOwned() {
        const pids = new Set(events().flatMap(value => [value.pid, value.childPid]).filter(pid => Number.isInteger(pid) && pid > 0))
        if (launcher?.pid) pids.add(launcher.pid)
        try {
            const published = JSON.parse(fs.readFileSync(instanceFile, 'utf8'))
            if (ownedPid(published.pid) && /^http:\/\/127\.0\.0\.1:\d+$/.test(published.url)) {
                instance = published; pids.add(published.pid)
                try { await post('/api/v1/desktop/shutdown', {}, 5000) } catch {}
            }
        } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error }
        for (const pid of pids) {
            if (!ownedPid(pid)) continue
            for (let attempt = 0; attempt < 100; attempt++) { if (!ownedPid(pid)) break; await sleep(100) }
            if (ownedPid(pid)) { process.kill(pid); for (let attempt = 0; attempt < 100 && ownedPid(pid); attempt++) await sleep(100) }
            assert.ok(!ownedPid(pid), 'Owned process remains; retain the fixture')
        }
    }
    try {
        baseline.extractAllTo(app)
        const baselineTree = treeSnapshot(app)
        fs.mkdirSync(harness)
        fs.writeFileSync(auditFile, '', { flag: 'wx' }); fs.writeFileSync(archiveFile, candidateBytes, { flag: 'wx' })
        for (const name of ['old-client-first-hop.mjs', 'old-client-first-hop-preload.mjs']) fs.copyFileSync(path.join(scriptRoot, 'lib', name), path.join(harness, name), fs.constants.COPYFILE_EXCL)
        fs.writeFileSync(descriptorFile, JSON.stringify({ schemaVersion: 1, root, scenario: kind, nonce: randomUUID().replaceAll('-', ''), applicationRoot: app, auditFile, archiveFile,
            candidateSha256: sha256(candidateBytes), candidateSourceSha: sourceSha, candidateDesktopSha256: sha256(candidate.readFile('app/desktop.js')) }), { flag: 'wx' })
        const csv = path.join(root, 'synthetic.csv')
        fs.writeFileSync(csv, 'comic_id,title,author,categories,tags,finished,total_likes,total_views,pages_count,eps_count\nfirst-hop-sentinel-1,Synthetic First Hop Sentinel,Fixture Author,Fixture,Fixture,true,1,1,12,1\n', { flag: 'wx' })
        // Exact public CLI, local synthetic input only, before application launch.
        node([path.join(app, 'app', 'pica-library.js'), 'import', csv, '--data-dir', data, '--json'])
        state('seed')
        const launchEnv = { ...env, READER_FIRST_HOP_FIXTURE: descriptorFile,
            NODE_OPTIONS: '--import=' + pathToFileURL(path.join(harness, 'old-client-first-hop-preload.mjs')).href }
        for (const channel of ['stdout', 'stderr']) streams.push(fs.createWriteStream(path.join(harness, 'launcher.' + channel + '.log'), { flags: 'wx' }))
        // createWriteStream opens asynchronously; spawn requires real, already-open fds.
        await Promise.all(streams.map(stream => once(stream, 'open')))
        launcher = spawn(path.join(app, 'Pica Library.exe'), ['--no-open'], { env: launchEnv, cwd: app, windowsHide: true, stdio: ['ignore', streams[0], streams[1]] })
        await new Promise((resolve, reject) => { launcher.once('spawn', resolve); launcher.once('error', reject) })
        await ready(FIRST_HOP_BASELINE.version); assert.ok(ownedPid(instance.pid)); oldPid = instance.pid; state('snapshot')
        const publication = firstHopPublication(kind)
        row.failureStep = 'check-current-release'
        const check = await fetch(instance.url + '/api/v1/update/check', { signal: AbortSignal.timeout(30000) })
        assert.ok(check.ok); const available = await check.json()
        assert.equal(available.status, 'full-install'); assert.equal(available.oneClick, true); assert.equal(available.version, publication.version); assert.equal(available.assetName, publication.archiveName)
        // Do not call stage-full directly or invoke/copy a candidate helper.
        row.failureStep = 'prepare-latest'
        const preparedResponse = await post('/api/v1/update/prepare-latest', {}, 180000), prepared = await preparedResponse.json()
        if (kind === 'hash-mismatch') {
            assert.ok(!preparedResponse.ok && !prepared.id, 'Corrupt download was not rejected by old official hash verification')
            assert.match(String(prepared.error), /SHA|hash|official/i)
            assert.equal((await ready(FIRST_HOP_BASELINE.version)).version, FIRST_HOP_BASELINE.version)
            assert.equal(instance.pid, oldPid); assert.deepEqual(treeSnapshot(app), baselineTree); state('verify')
            assert.ok(!events().some(event => event.kind === 'RELEASED_HELPER_SELECTED'), 'Hash failure must not start a helper')
        } else {
            assert.ok(preparedResponse.ok && prepared.id); assert.equal(prepared.mode, 'full-application'); assert.equal(prepared.oneClick, true)
            assert.equal(prepared.targetSourceSha, sourceSha); assert.equal(prepared.archiveSha256, sha256(candidateBytes))
            row.failureStep = 'apply'
            const applied = await post('/api/v1/update/apply', { id: prepared.id })
            assert.ok(applied.ok); const accepted = await applied.json(); assert.ok(accepted.accepted || accepted.success, 'Old controller did not acknowledge apply')
            row.failureStep = 'wait-exact-old-helper-terminal'
            let terminal
            // Observation budget only: production/helper deadlines are never changed.
            for (let attempt = 0; attempt < 1500; attempt++) {
                try { const value = JSON.parse(fs.readFileSync(progressFile, 'utf8')); if (['complete', 'failed'].includes(value.phase)) { terminal = value; break } } catch {}
                if (attempt % 10 === 0) {
                    const helper = events().find(event => event.kind === 'ENTRY_INITIALIZED' && event.entryKind === 'released-helper')
                    if (helper && !ownedPid(helper.pid)) throw Error('Exact released helper exited without terminal update/recovery status; do not replace it with the candidate helper')
                }
                await sleep(100)
            }
            assert.ok(terminal, 'Actual old helper did not reach a terminal state')
            const rollback = kind !== 'success'
            assert.equal(terminal.phase, rollback ? 'failed' : 'complete')
            await ready(rollback ? FIRST_HOP_BASELINE.version : FIRST_HOP_FIXTURE_VERSION, true)
            assert.ok(ownedPid(instance.pid))
            assert.equal(fs.readFileSync(path.join(app, 'SOURCE_SHA.txt'), 'utf8').trim(), rollback ? FIRST_HOP_BASELINE.sourceSha : sourceSha)
            const finalTree = treeSnapshot(app), candidateTree = candidate.getEntries().filter(entry => !entry.isDirectory).map(entry => [entry.entryName, sha256(entry.getData())]).sort((a, b) => a[0].localeCompare(b[0]))
            assert.deepEqual(finalTree, rollback ? baselineTree : candidateTree, 'Replacement/rollback must preserve exact application tree bytes')
            state('verify')
            assert.ok(events().some(event => event.kind === 'RELEASED_HELPER_SELECTED' && event.sha256 === FIRST_HOP_BASELINE.helperSha256))
            assert.ok(events().some(event => event.kind === 'ENTRY_INITIALIZED' && event.entryKind === 'released-helper'))
            if (kind === 'launch-rollback') assert.equal(events().filter(event => event.kind === 'SYNTHETIC_CANDIDATE_LAUNCH_ERROR').length, 1)
        }
        const observed = events()
        assert.ok(!observed.some(event => /BLOCKED|UNEXPECTED/.test(event.kind)), 'Unexpected provider/network/process attempt; do not waive')
        assert.ok(observed.some(event => event.kind === 'SYNTHETIC_PUBLISHER' && event.route === 'archive'))
        assert.ok(observed.some(event => event.kind === 'SYNTHETIC_PUBLISHER' && event.route === 'tag-api'), 'Actual old official-archive verification must be reached')
        row = { scenario: kind, status: 'PASS', baselineVersion: FIRST_HOP_BASELINE.version, baselineSourceSha: FIRST_HOP_BASELINE.sourceSha, candidateSourceSha: sourceSha,
            candidateFixtureVersion: FIRST_HOP_FIXTURE_VERSION, advertisedSyntheticVersion: publication.version, exactOldController: true, exactOldHelper: kind === 'hash-mismatch' ? 'NOT_STARTED_BY_DESIGN' : true, candidateHelperInjected: false,
            actualCheckAndPrepareLatestEndpoints: true, applyEndpointInvoked: kind !== 'hash-mismatch', selectedUserStateCanaries: 'PASS', exactApplicationTree: 'PASS', productionDeadlinesModified: false,
            realProviderSessionsSeeded: false, accountOrFullLibraryReadyClaimed: false,
            realPublicGitHubNetworkOrPublishedOta: false, userDataAccessed: 'OWNED_SYNTHETIC_ONLY', physicalDeviceOrBrowserUiAcceptance: 'NOT_ESTABLISHED' }
        success = true
    } catch (error) {
        row.error = String(error?.stack ?? error)
        row.causeCode = typeof error?.cause?.code === 'string' && /^[A-Z0-9_]+$/.test(error.cause.code) ? error.cause.code : null
        throw error
    }
    finally {
        try { if (fs.existsSync(auditFile)) await stopOwned() } catch (error) { success = false; row.status = 'FAIL'; row.teardownError = String(error); throw error }
        finally {
            await Promise.all(streams.map(stream => new Promise((resolve, reject) => { stream.once('error', reject); stream.end(resolve) })))
            const target = path.join(evidence, kind); fs.mkdirSync(target, { recursive: true })
            fs.writeFileSync(path.join(target, 'result.json'), JSON.stringify(row, null, 2), { flag: 'wx' })
            for (const [name, file] of [['audit.jsonl', auditFile], ['update-progress.json', progressFile]]) if (fs.existsSync(file)) fs.copyFileSync(file, path.join(target, name), fs.constants.COPYFILE_EXCL)
            for (const name of ['launcher.stdout.log', 'launcher.stderr.log']) if (fs.existsSync(path.join(harness, name))) fs.copyFileSync(path.join(harness, name), path.join(target, name), fs.constants.COPYFILE_EXCL)
            if (success) {
                assert.ok(fs.realpathSync.native(path.dirname(root)) === fs.realpathSync.native(os.tmpdir()) && /^pica-old-first-hop-[a-f0-9]{32}[a-zA-Z0-9]{6}$/.test(path.basename(root)) && !fs.lstatSync(root).isSymbolicLink())
                fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
            } else console.error('Failed owned first-hop fixture retained: ' + root)
        }
    }
    return row
}
const rows = []
for (const name of selected === 'all' ? FIRST_HOP_SCENARIOS : [selected]) { const row = await scenario(name); rows.push(row); console.log(JSON.stringify(row)) }
console.log(JSON.stringify({ gate: 'REAL_OLD_CLIENT_FIRST_HOP_WITH_SYNTHETIC_PUBLISHER', status: 'PASS', sourceSha, publishedOtaTested: false, rows }))
