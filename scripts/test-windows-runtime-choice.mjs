import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'
import { assertDisposableWindowsCi, loopbackHost, sha256 } from './lib/old-client-first-hop.mjs'
import { RUNTIME_CHOICE_FIXTURE_VERSION, RUNTIME_CHOICE_SCENARIOS } from './lib/runtime-choice-fixture.mjs'
import { runtimeChoiceStateProgram } from './lib/first-hop-state.mjs'

// No input reads, tool loading, extraction or runtime action before this guard.
assertDisposableWindowsCi()
const [fixtureDirectory, sourceSha, selected] = process.argv.slice(2)
assert.ok(fixtureDirectory && /^[a-f0-9]{40}$/.test(sourceSha ?? '') && RUNTIME_CHOICE_SCENARIOS.includes(selected), 'Explicit fixture pair, exact source and one scenario required')
const receipt = JSON.parse(fs.readFileSync(path.join(fixtureDirectory, 'FIXTURE_BUILD_RECEIPT.json'), 'utf8'))
assert.equal(receipt.kind, 'SYNTHETIC_RUNTIME_CHOICE_PAIR_ONLY_NOT_FOR_INSTALLATION')
assert.equal(receipt.sourceSha, sourceSha); assert.equal(receipt.fixtureVersion, RUNTIME_CHOICE_FIXTURE_VERSION)
assert.equal(receipt.noReleaseOrVersionReservation, true); assert.equal(receipt.productOrHelperBytesPatched, false)
assert.equal(receipt.archives.length, 2); assert.deepEqual(receipt.archives.map(row => row.mode).sort(), ['core', 'jm'])
const archives = {}, zips = {}, expectedTrees = {}
for (const mode of ['core', 'jm']) {
    const row = receipt.archives.find(row => row.mode === mode), name = `SYNTHETIC-${mode}-NOT-FOR-INSTALLATION.zip`
    assert.equal(row.file, name)
    const bytes = fs.readFileSync(path.join(fixtureDirectory, name)), zip = new AdmZip(bytes)
    assert.equal(sha256(bytes), row.archiveSha256)
    const identities = new Set()
    for (const entry of zip.getEntries()) {
        const name = entry.isDirectory ? entry.entryName.replace(/\/$/, '') : entry.entryName
        assert.ok(!name.includes('\\') && !name.includes(':') && !name.startsWith('/') && !name.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part)), 'Unsafe fixture ZIP path')
        assert.ok(!identities.has(name.toLowerCase()), 'Duplicate/case-aliased ZIP entry'); identities.add(name.toLowerCase())
        assert.ok(((entry.attr >>> 16) & 0o170000) !== 0o120000, 'Linked fixture member')
        assert.ok(!/(?:^|\/)(?:credentials\.dat|remote-storage\.json|library\.db(?:-wal|-shm)?|\.env(?:\..*)?)$|\.(?:cbz|cbr|epub|pdf)$/i.test(name), 'Private state/body in fixture package')
        if (!entry.isDirectory) entry.getData() // Verify every member's CRC before extraction.
    }
    assert.equal(zip.readAsText('SOURCE_SHA.txt').trim(), sourceSha)
    const marker = JSON.parse(zip.readAsText('RUNTIME_CHOICE_FIXTURE.json'))
    assert.deepEqual(marker, row.marker); assert.equal(marker.kind, 'SYNTHETIC_RUNTIME_CHOICE_ONLY_NOT_FOR_INSTALLATION')
    assert.equal(marker.composition, mode); assert.equal(marker.fixtureVersion, RUNTIME_CHOICE_FIXTURE_VERSION)
    assert.equal(marker.sourceSha, sourceSha); assert.equal(marker.versionOnlyBuildOverride, true)
    assert.equal(marker.compiledSourcesOrHelpersPatched, false); assert.equal(marker.publishedOrProposedVersion, false)
    assert.deepEqual(JSON.parse(zip.readAsText('app/runtime-composition.json')), { formatVersion: 1, sourceRuntimes: mode === 'jm' ? ['jm'] : [] })
    const runtimeNames = zip.getEntries().filter(entry => !entry.isDirectory && entry.entryName.startsWith('runtime/jm/')).map(entry => entry.entryName)
    if (mode === 'core') assert.equal(runtimeNames.length, 0)
    else for (const required of ['runtime/jm/bin/java.exe', 'runtime/jm/lib/pica-jm-source.jar', 'runtime/jm/PICA_JM_RUNTIME.json']) assert.ok(runtimeNames.includes(required))
    archives[mode] = bytes; zips[mode] = zip
    expectedTrees[mode] = zip.getEntries().filter(entry => !entry.isDirectory).map(entry => [entry.entryName, sha256(entry.getData())]).sort((a, b) => a[0].localeCompare(b[0]))
}
for (const name of ['app/desktop.js', 'app/full-upgrader.js', 'app/updater.js', 'runtime/node.exe']) assert.deepEqual(zips.core.readFile(name), zips.jm.readFile(name), 'Different source engines between compositions: ' + name)
const toolRoot = process.env.PICA_PLAYWRIGHT_TOOL_ROOT
assert.ok(toolRoot && fs.realpathSync.native(toolRoot).toLowerCase().startsWith(fs.realpathSync.native(os.tmpdir()).toLowerCase() + path.sep), 'Explicit disposable Playwright tool root required')
const require = createRequire(path.join(toolRoot, 'package.json'))
assert.equal(require('@playwright/test/package.json').version, '1.63.0', 'Use the existing pinned browser tooling, not project dependency edits')
const { chromium, expect } = require('@playwright/test')
const evidence = path.resolve('artifacts/runtime-choice-evidence', selected)
assert.ok(!fs.existsSync(evidence), 'Refuse to overwrite earlier scenario evidence')
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'pica-runtime-choice-' + randomUUID().replaceAll('-', '')))
const app = path.join(root, 'application'), home = path.join(root, 'localappdata', 'Pica Library'), data = path.join(home, 'data'),
    instanceFile = path.join(home, 'runtime-state', 'instance.json'), progressFile = path.join(home, 'runtime-state', 'updates', 'update-progress.json'),
    harness = path.join(root, 'harness'), auditFile = path.join(harness, 'audit.jsonl'), descriptor = path.join(harness, 'fixture.json')
const env = { ...process.env, LOCALAPPDATA: path.dirname(home), APPDATA: path.join(root, 'roaming') }
for (const key of Object.keys(env)) if (/^(?:PICA_|JM_|EH_|EXH_|ANDROID_PREVIEW_|GH_TOKEN$|GITHUB_TOKEN$|NODE_OPTIONS$|READER_)/i.test(key)) delete env[key]
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), streams = [], errors = [], browserEvents = [], uiSteps = []
let instance, browser, launcher, success = false
const result = { status: 'FAIL', scenario: selected, sourceSha, version: RUNTIME_CHOICE_FIXTURE_VERSION, syntheticOnly: true, deadlinesModified: false, productOrHelperBytesPatched: false, realProvidersOrProductionStateAccessed: false }
const events = () => fs.readFileSync(auditFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
function node(args) {
    const child = spawnSync(path.join(app, 'runtime', 'node.exe'), args, { env, cwd: root, windowsHide: true, encoding: 'utf8', timeout: 20000 })
    assert.equal(child.status, 0, (child.stderr ?? '').slice(-3000)); return child.stdout
}
const state = action => JSON.parse(node(['-e', runtimeChoiceStateProgram, action, root]))
function ownedPid(pid) {
    assert.ok(Number.isInteger(pid) && pid > 0)
    const child = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress`], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
    assert.equal(child.status, 0)
    if (!child.stdout.trim()) return false
    const value = JSON.parse(child.stdout)
    assert.ok(value.ExecutablePath && fs.realpathSync.native(value.ExecutablePath).toLowerCase().startsWith(root.toLowerCase() + path.sep), 'Refuse process outside exact owned root')
    return true
}
function treeSnapshot(directory) {
    const rows = []
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name), stat = fs.lstatSync(file)
            assert.ok(!stat.isSymbolicLink(), 'Linked application tree')
            if (stat.isDirectory()) walk(file)
            else { assert.ok(stat.isFile()); rows.push([path.relative(directory, file).replaceAll('\\', '/'), sha256(fs.readFileSync(file))]) }
        }
    }
    walk(directory); return rows.sort((a, b) => a[0].localeCompare(b[0]))
}
async function ready(mode, previous) {
    for (let attempt = 0; attempt < 300; attempt++) {
        try {
            const value = JSON.parse(fs.readFileSync(instanceFile, 'utf8'))
            assert.ok(Number.isInteger(value.pid) && /^http:\/\/127\.0\.0\.1:\d+$/.test(value.url))
            const response = await fetch(value.url + '/api/v1/desktop/status', { signal: AbortSignal.timeout(1500) }), status = await response.json()
            const caps = await fetch(value.url + '/api/v1/capabilities', { signal: AbortSignal.timeout(1500) }), capabilities = await caps.json()
            if (!response.ok || !caps.ok || !status.startupReady || status.version !== RUNTIME_CHOICE_FIXTURE_VERSION || capabilities.appVersion !== RUNTIME_CHOICE_FIXTURE_VERSION) throw Error('Not ready')
            assert.deepEqual(status.runtimeComposition, { formatVersion: 1, sourceRuntimes: mode === 'jm' ? ['jm'] : [] })
            assert.equal(typeof status.csrfToken, 'string'); assert.ok(status.csrfToken.length)
            if (previous) { assert.notEqual(value.pid, previous.pid); assert.notEqual(status.csrfToken, previous.csrfToken) }
            instance = { ...value, csrfToken: status.csrfToken }; assert.ok(ownedPid(value.pid))
            return status
        } catch {}
        await sleep(100)
    }
    throw Error('Actual owned Desktop did not become ready in expected composition: ' + mode)
}
async function post(route, body, extra = {}) {
    return fetch(instance.url + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-pica-csrf': instance.csrfToken, Origin: instance.url, ...extra.headers },
        body: typeof body === 'string' ? body : JSON.stringify(body), signal: extra.signal ?? AbortSignal.timeout(180000) })
}
async function command(action, body) {
    const response = await post('/api/v1/update/runtime-choice/' + action, body), value = await response.json()
    assert.ok(response.ok, String(value.error)); return value
}
async function unchanged(mode) {
    await ready(mode); assert.deepEqual(treeSnapshot(app), expectedTrees[mode]); state('verify')
}
function noStagedApplication() {
    const updates = path.dirname(progressFile)
    assert.ok(!fs.existsSync(updates) || !fs.readdirSync(updates).some(name => name.startsWith('full-staged-')), 'Rejected/cancelled work left a staged application')
}
async function waitEvent(predicate, attempts = 100) {
    for (let attempt = 0; attempt < attempts; attempt++) { const row = events().find(predicate); if (row) return row; await sleep(100) }
    throw Error('Required actual fixture event did not occur')
}
async function terminal(previousTimestamp, phase) {
    for (let attempt = 0; attempt < 1500; attempt++) {
        try { const value = JSON.parse(fs.readFileSync(progressFile, 'utf8')); if (value.updatedAt !== previousTimestamp && ['complete', 'failed'].includes(value.phase)) { assert.equal(value.phase, phase); return value } } catch (error) { if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error }
        await sleep(100)
    }
    throw Error('Actual helper did not reach required terminal state')
}
async function openUi(page) {
    await page.goto(instance.url, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#mode')).not.toHaveText('正在检测模式', { timeout: 10000 })
    if (await page.locator('#pica-disclaimer-gate').isVisible()) { await page.locator('#pica-disclaimer-check').check(); await page.locator('#pica-disclaimer-accept').click() }
    await expect.poll(() => page.evaluate(() => Boolean(window.picaOnboarding)), { timeout: 10000 }).toBe(true)
    // A fresh profile should present its actual welcome UI. Use the shipped Later
    // action, not a LocalStorage override that conceals an obstructing dialog.
    const firstWelcome = !uiSteps.some(row => row.action === 'dismiss-initial-welcome')
    if (firstWelcome) {
        await expect(page.locator('#pica-onboarding-welcome')).toBeVisible({ timeout: 10000 })
        await page.locator('#pica-onboarding-later').click(); uiSteps.push({ action: 'dismiss-initial-welcome' })
    }
    if (await page.locator('#pica-onboarding-welcome').isVisible()) await page.locator('#pica-onboarding-later').click()
    await page.locator('nav [data-view="maintenance"]').click()
    await page.locator('#a87-maintenance-tab').click()
    if (!(await page.locator('#runtime-choice-panel').evaluate(node => node.open))) await page.locator('#runtime-choice-panel > summary').click()
    await expect(page.locator('#runtime-choice-jm')).toBeVisible()
}
async function applyFromUi(page, mode) {
    const previous = { ...instance }, oldPhase = fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile, 'utf8')).updatedAt : null
    await page.locator('#runtime-choice-' + mode).click()
    await expect(page.locator('#app-confirm-dialog')).toBeVisible()
    await expect(page.locator('#app-confirm-message')).toContainText(RUNTIME_CHOICE_FIXTURE_VERSION)
    const prepared = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/update/runtime-choice/prepare', { timeout: 180000 })
    const applied = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/update/apply', { timeout: 180000 })
    // Subscribe before confirmation so even a fast real replacement/reload is observed.
    // A rejected observer remains a failure below; no synthetic DOM-ready or session flag.
    const reloaded = page.waitForEvent('domcontentloaded', { timeout: 180000 }).then(() => null, error => error)
    // The shipped UI now performs prepare/apply; the driver never calls a helper directly.
    await page.locator('#app-confirm-submit').click()
    const preparedResponse = await prepared, staged = await preparedResponse.json()
    assert.ok(preparedResponse.ok()); assert.equal(staged.mode, 'full-application')
    assert.deepEqual(staged.expectedRuntimeComposition, { formatVersion: 1, sourceRuntimes: mode === 'jm' ? ['jm'] : [] })
    assert.equal(staged.archiveSha256, sha256(archives[mode])); assert.ok((await applied).ok())
    await terminal(oldPhase, 'complete'); await ready(mode, previous)
    const reloadError = await reloaded; if (reloadError) throw reloadError
    await expect(page.locator('#mode')).not.toHaveText('正在检测模式', { timeout: 10000 })
    await unchanged(mode)
    uiSteps.push({ action: 'confirmed-actual-ui-replacement', target: mode, newPidAndCsrfSession: true, exactApplicationTree: true, selectedStateCanaries: true })
}
async function stopOwned() {
    const pids = new Set(events().flatMap(row => [row.pid, row.childPid]).filter(pid => Number.isInteger(pid) && pid > 0))
    if (launcher?.pid) pids.add(launcher.pid)
    try {
        const published = JSON.parse(fs.readFileSync(instanceFile, 'utf8'))
        if (ownedPid(published.pid) && /^http:\/\/127\.0\.0\.1:\d+$/.test(published.url)) {
            const response = await fetch(published.url + '/api/v1/desktop/status', { signal: AbortSignal.timeout(1500) }), status = await response.json()
            instance = { ...published, csrfToken: status.csrfToken }; pids.add(published.pid)
            try { await post('/api/v1/desktop/shutdown', {}, { signal: AbortSignal.timeout(5000) }) } catch {}
        }
    } catch (error) { if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError) && error.name !== 'TypeError') throw error }
    for (const pid of pids) {
        for (let attempt = 0; attempt < 50 && ownedPid(pid); attempt++) await sleep(100)
        if (ownedPid(pid)) process.kill(pid)
        for (let attempt = 0; attempt < 100 && ownedPid(pid); attempt++) await sleep(100)
        assert.ok(!ownedPid(pid), 'Owned fixture process remains; retain all files')
    }
}
try {
    result.step = 'isolate-and-launch'
    zips.core.extractAllTo(app); fs.mkdirSync(harness); fs.writeFileSync(auditFile, '', { flag: 'wx' })
    const libs = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib')
    for (const name of ['old-client-first-hop.mjs', 'runtime-choice-fixture.mjs', 'runtime-choice-preload.mjs']) fs.copyFileSync(path.join(libs, name), path.join(harness, name), fs.constants.COPYFILE_EXCL)
    const inputs = {}
    for (const mode of ['core', 'jm']) { const file = path.join(harness, mode + '.zip'); fs.writeFileSync(file, archives[mode], { flag: 'wx' }); inputs[mode] = { file, sha256: sha256(archives[mode]) } }
    fs.writeFileSync(descriptor, JSON.stringify({ schemaVersion: 1, root, applicationRoot: app, auditFile, scenario: selected, nonce: randomUUID().replaceAll('-', ''), sourceSha,
        desktopSha256: sha256(zips.core.readFile('app/desktop.js')), helperSha256: sha256(zips.core.readFile('app/full-upgrader.js')), archives: inputs }), { flag: 'wx' })
    const csv = path.join(root, 'synthetic.csv')
    fs.writeFileSync(csv, 'comic_id,title,author,categories,tags,finished,total_likes,total_views,pages_count,eps_count\nfirst-hop-sentinel-1,Synthetic Runtime Choice Sentinel,Fixture Author,Fixture,Fixture,true,1,1,12,1\n', { flag: 'wx' })
    node([path.join(app, 'app', 'pica-library.js'), 'import', csv, '--data-dir', data, '--json']); state('seed')
    for (const channel of ['stdout', 'stderr']) streams.push(fs.createWriteStream(path.join(harness, 'launcher.' + channel + '.log'), { flags: 'wx' }))
    await Promise.all(streams.map(stream => once(stream, 'open')))
    launcher = spawn(path.join(app, 'Pica Library.exe'), ['--no-open'], { env: { ...env, READER_RUNTIME_CHOICE_FIXTURE: descriptor, NODE_OPTIONS: '--import=' + pathToFileURL(path.join(harness, 'runtime-choice-preload.mjs')).href }, cwd: app, windowsHide: true, stdio: ['ignore', streams[0], streams[1]] })
    await new Promise((resolve, reject) => { launcher.once('spawn', resolve); launcher.once('error', reject) })
    const status = await ready('core'); assert.deepEqual(status.externalSources.enabled, []); state('snapshot')
    browser = await chromium.launch({ headless: true, env })
    const context = await browser.newContext({ serviceWorkers: 'block' })
    await context.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.protocol === 'http:' && loopbackHost(url.hostname)) return route.continue()
        browserEvents.push({ kind: 'EXTERNAL_BROWSER_REQUEST_BLOCKED' }); return route.abort('blockedbyclient')
    })
    const page = await context.newPage(); page.on('pageerror', error => errors.push(String(error)))
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()) })
    await openUi(page)
    result.step = selected
    if (selected === 'roundtrip') {
        const before = events().filter(row => row.route === 'archive').length
        await page.locator('#runtime-choice-jm').click(); await expect(page.locator('#app-confirm-dialog')).toBeVisible()
        await page.locator('#app-confirm-dialog button[value="cancel"]').click()
        await expect(page.locator('#runtime-choice-jm')).toBeEnabled()
        assert.equal(events().filter(row => row.route === 'archive').length, before); await unchanged('core')
        uiSteps.push({ action: 'cancel-preview', noDownloadOrApplicationMutation: true })
        await applyFromUi(page, 'jm'); await openUi(page); await applyFromUi(page, 'core')
    } else if (selected === 'guardrails') {
        const route = '/api/v1/update/runtime-choice/plan'
        for (const bad of [
            { body: { choice: 'jm' }, headers: { Origin: 'https://untrusted.invalid' }, status: 403 },
            { body: { choice: 'jm' }, headers: { 'x-pica-csrf': 'wrong' }, status: 403 },
            { body: { choice: 'jm' }, headers: { 'content-type': 'text/plain' }, status: 400 },
            { body: { choice: 'jm', confirm: true }, status: 400 },
            { body: { choice: 'jm' }, suffix: '?bypass=1', status: 403 },
            { body: JSON.stringify({ choice: 'jm', extra: 'x'.repeat(4096) }), status: 400 }
        ]) { const response = await post(route + (bad.suffix ?? ''), bad.body, { headers: bad.headers }); assert.equal(response.status, bad.status) }
        const get = await fetch(instance.url + route); assert.equal(get.status, 403)
        const unchangedPlan = await command('plan', { choice: 'core' }); assert.equal(unchangedPlan.status, 'unchanged')
        const first = await command('plan', { choice: 'jm' }), second = await command('plan', { choice: 'jm' })
        const old = await post('/api/v1/update/runtime-choice/prepare', { id: first.id }); assert.equal(old.status, 400)
        const staged = await command('prepare', { id: second.id }); assert.equal(staged.mode, 'full-application')
        const replay = await post('/api/v1/update/runtime-choice/prepare', { id: second.id }); assert.equal(replay.status, 400)
        // No explicit consent means the ordinary same-version updater must not
        // select the other composition simply because both assets are present.
        const normal = await post('/api/v1/update/prepare-latest', {}), normalValue = await normal.json()
        assert.ok(normal.ok); assert.equal(normalValue.status, 'current')
        assert.ok(!events().some(row => row.kind === 'INSTALLED_HELPER_SELECTED')); await unchanged('core')
        result.guardrails = { authorityAndBodyRejections: 7, supersededAndConsumedPlansRejected: true, ordinarySameVersionDidNotChangeComposition: true, futureVersionCompositionGuard: 'COVERED_BY_SEPARATE_MANAGER_TEST_NOT_THIS_SCENARIO' }
    } else if (selected === 'request-abort') {
        const plan = await command('plan', { choice: 'jm' }), abort = new AbortController()
        const pending = post('/api/v1/update/runtime-choice/prepare', { id: plan.id }, { signal: abort.signal }).then(response => ({ response }), error => ({ error }))
        await waitEvent(row => row.kind === 'SYNTHETIC_ARCHIVE_FIRST_CHUNK' && row.emittedBytes > 0)
        abort.abort(); assert.ok((await pending).error)
        await waitEvent(row => ['SYNTHETIC_ARCHIVE_ABORTED', 'SYNTHETIC_ARCHIVE_CANCELLED'].includes(row.kind))
        // A fresh task must own the released download slot; cancel it through the
        // real cancel route too, rather than waiting for a deliberately slow ZIP.
        const fresh = await command('plan', { choice: 'jm' }), oldCount = events().filter(row => row.route === 'archive').length
        const next = post('/api/v1/update/runtime-choice/prepare', { id: fresh.id })
        for (let attempt = 0; events().filter(row => row.route === 'archive').length <= oldCount; attempt++) { assert.ok(attempt < 100); await sleep(100) }
        assert.ok((await post('/api/v1/update/cancel', {})).ok)
        const cancelled = await next; assert.equal(cancelled.status, 409)
        assert.ok(!events().some(row => row.kind === 'INSTALLED_HELPER_SELECTED')); await unchanged('core'); noStagedApplication()
        result.disconnectedRequestReleasesDownloadSlot = true
    } else {
        const plan = await command('plan', { choice: 'jm' }), previous = { ...instance }
        const response = await post('/api/v1/update/runtime-choice/prepare', { id: plan.id }), staged = await response.json()
        if (selected === 'hash-mismatch') {
            assert.equal(response.status, 400); assert.match(String(staged.error), /hash|SHA|changed/i); assert.ok(!staged.id)
            assert.ok(!events().some(row => row.kind === 'INSTALLED_HELPER_SELECTED')); await unchanged('core'); noStagedApplication()
        } else {
            assert.ok(response.ok); assert.equal(staged.mode, 'full-application')
            const timestamp = JSON.parse(fs.readFileSync(progressFile, 'utf8')).updatedAt
            const applied = await post('/api/v1/update/apply', { id: staged.id }); assert.ok(applied.ok)
            await terminal(timestamp, 'failed'); await ready('core', previous); await unchanged('core')
            assert.ok(events().some(row => row.kind === 'INSTALLED_HELPER_SELECTED'))
            if (selected === 'launch-rollback') assert.equal(events().filter(row => row.kind === 'SYNTHETIC_TARGET_LAUNCH_ERROR').length, 1)
            else assert.ok(events().some(row => row.kind === 'SYNTHETIC_HEALTH_RESPONSE_FAILURE'))
            result.actualHelperRollback = true
        }
    }
    assert.deepEqual(errors, [], 'Unhandled browser/console error')
    assert.deepEqual(browserEvents, [], 'Unexpected external browser request')
    assert.ok(!events().some(row => /BLOCKED|UNEXPECTED/.test(row.kind)), 'Source/network/Java/process boundary violation')
    Object.assign(result, { status: 'PASS', uiSteps, browserBootAndSettings: true, exactApplicationTree: true, selectedStateCanaries: true, legacyFirstHopRecovery: 'NOT_ESTABLISHED_BY_THIS_CURRENT_HELPER_GATE', physicalDeviceAcceptance: 'NOT_ESTABLISHED' }); success = true
} catch (error) {
    result.error = String(error?.stack ?? error); throw error
} finally {
    try { await browser?.close(); if (fs.existsSync(auditFile)) await stopOwned() }
    catch (error) { success = false; result.status = 'FAIL'; result.teardownError = String(error); throw error }
    finally {
        await Promise.all(streams.map(stream => new Promise((resolve, reject) => { stream.once('error', reject); stream.end(resolve) })))
        fs.mkdirSync(evidence, { recursive: true })
        fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' })
        for (const [name, file] of [['audit.jsonl', auditFile], ['update-progress.json', progressFile], ['launcher.stdout.log', path.join(harness, 'launcher.stdout.log')], ['launcher.stderr.log', path.join(harness, 'launcher.stderr.log')]]) if (fs.existsSync(file)) fs.copyFileSync(file, path.join(evidence, name), fs.constants.COPYFILE_EXCL)
        if (success) {
            assert.ok(fs.realpathSync.native(path.dirname(root)) === fs.realpathSync.native(os.tmpdir()) && /^pica-runtime-choice-[a-f0-9]{32}[a-zA-Z0-9]{6}$/.test(path.basename(root)) && !fs.lstatSync(root).isSymbolicLink())
            fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
        } else console.error('Failed owned runtime-choice fixture retained: ' + root)
        console.log(JSON.stringify(result))
    }
}
