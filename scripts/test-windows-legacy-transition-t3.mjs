import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { stripVTControlCharacters } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'
import { assertDisposableWindowsCi, FIRST_HOP_BASELINE, sha256 } from './lib/old-client-first-hop.mjs'
import { legacyTransitionStateProgram } from './lib/first-hop-state.mjs'
import { T3_KIND, T3_SCENARIOS, T3_VERSIONS, T3_PTY_VERSION, T3_PLAYWRIGHT_VERSION } from './lib/legacy-transition-t3-fixture.mjs'

// Mandatory BEFORE input reads, tool/native-addon loading, extraction or runtime IO.
assertDisposableWindowsCi()
const [oldFile, fixtureDirectory, sourceSha] = process.argv.slice(2)
assert.ok(oldFile && fixtureDirectory && /^[a-f0-9]{40}$/.test(sourceSha ?? ''))
const receipt = JSON.parse(fs.readFileSync(path.join(fixtureDirectory, 'BUILD_RECEIPT.json'), 'utf8'))
assert.equal(receipt.kind, T3_KIND); assert.equal(receipt.sourceSha, sourceSha)
for (const key of ['productOrHelperBytesPatched', 'publishedOrProposedVersion', 'publicationAuthenticated', 'rawToolsOrInstallersMayBeUploaded']) assert.equal(receipt[key], false)
assert.equal(receipt.syntheticStableAuthorityOnly, true); assert.equal(receipt.versionOnlyBuildOverride, true)
const oldBytes = fs.readFileSync(oldFile); assert.equal(sha256(oldBytes), FIRST_HOP_BASELINE.zipSha256)
function zip(bytes) {
    const archive = new AdmZip(bytes); assert.ok(archive.test())
    const seen = new Set()
    for (const entry of archive.getEntries()) {
        const name = entry.entryName.replace(/\/$/, '')
        assert.ok(name && !name.includes('\\') && !name.includes(':') && !name.startsWith('/') && !name.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part)))
        assert.ok(!seen.has(name.toLowerCase())); seen.add(name.toLowerCase())
        assert.ok(((entry.attr >>> 16) & 0o170000) !== 0o120000)
        assert.ok(!/(?:^|\/)(?:credentials\.dat|remote-storage\.json|library\.db(?:-wal|-shm)?|\.env(?:\..*)?)$|\.(?:jks|keystore|cbz|cbr|epub|pdf)$/i.test(name))
        if (!entry.isDirectory) entry.getData()
    }
    return archive
}
const old = zip(oldBytes), targets = T3_VERSIONS.map(version => {
    const row = receipt.targets.find(item => item.version === version); assert.ok(row)
    const bytes = fs.readFileSync(path.join(fixtureDirectory, row.file)); assert.equal(sha256(bytes), row.sha256)
    const archive = zip(bytes), marker = JSON.parse(archive.readAsText('LEGACY_TRANSITION_T3_FIXTURE.json'))
    assert.equal(marker.kind, T3_KIND); assert.equal(marker.sourceSha, sourceSha); assert.equal(marker.version, version)
    assert.equal(marker.publishedOrProposedVersion, false); assert.equal(archive.getEntry('TEST_BUILD.txt'), null)
    assert.equal(archive.readAsText('SOURCE_SHA.txt').trim(), sourceSha)
    assert.deepEqual(JSON.parse(archive.readAsText('app/runtime-composition.json')), { formatVersion: 1, sourceRuntimes: [] })
    return { version, row, bytes, archive, desktopSha256: sha256(archive.readFile('app/desktop.js')), helperSha256: sha256(archive.readFile('app/full-upgrader.js')) }
})
assert.equal(sha256(old.readFile('app/desktop.js')), FIRST_HOP_BASELINE.desktopSha256)
assert.equal(sha256(old.readFile('app/full-upgrader.js')), FIRST_HOP_BASELINE.helperSha256)
const toolBytes = fs.readFileSync(path.join(fixtureDirectory, 'transition-execution-fixture.zip')), reviewBytes = fs.readFileSync(path.join(fixtureDirectory, 'transition-preview.zip'))
const toolZip = zip(toolBytes), reviewZip = zip(reviewBytes)
for (const archive of [toolZip, reviewZip]) {
    assert.equal(archive.readAsText('SOURCE_SHA.txt').trim(), sourceSha)
    for (const file of ['runtime/node.exe', 'app/full-upgrader.js']) assert.deepEqual(archive.readFile(file), targets[0].archive.readFile(file))
    assert.deepEqual(archive.readFile('payload/' + targets[0].row.file), targets[0].bytes)
    assert.ok(archive.readAsText('README.txt').includes('PREVIEW ONLY'))
}
const toolRoot = process.env.PICA_T3_TOOL_ROOT, runnerTemp = fs.realpathSync.native(process.env.RUNNER_TEMP)
assert.ok(toolRoot && fs.realpathSync.native(toolRoot).toLowerCase().startsWith(runnerTemp.toLowerCase() + path.sep))
const require = createRequire(path.join(toolRoot, 'package.json'))
assert.equal(require('node-pty/package.json').version, T3_PTY_VERSION); assert.equal(require('@playwright/test/package.json').version, T3_PLAYWRIGHT_VERSION)
assert.equal(require('node-pty/package.json').license, 'MIT')
const toolsReceipt = { nodePty: T3_PTY_VERSION, nodePtyLicense: 'MIT', playwright: T3_PLAYWRIGHT_VERSION, lockSha256: sha256(fs.readFileSync(path.join(toolRoot, 'pnpm-lock.yaml'))), applicationDependenciesChanged: false }
const pty = require('node-pty'), { chromium, expect } = require('@playwright/test')
const systemRoot = process.env.SystemRoot
assert.ok(systemRoot && path.isAbsolute(systemRoot))
const scriptRoot = path.dirname(fileURLToPath(import.meta.url)), evidence = path.resolve('artifacts/legacy-transition-t3-evidence')
fs.mkdirSync(evidence, { recursive: true })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
function tree(directory) {
    const rows = []
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name); assert.ok(!fs.lstatSync(file).isSymbolicLink())
        if (entry.isDirectory()) rows.push(...tree(file).map(([name, hash]) => [entry.name + '/' + name, hash]))
        else { assert.ok(entry.isFile()); rows.push([entry.name, sha256(fs.readFileSync(file))]) }
    }
    return rows.sort((a, b) => a[0].localeCompare(b[0]))
}
const expectedTree = archive => archive.getEntries().filter(entry => !entry.isDirectory).map(entry => [entry.entryName, sha256(entry.getData())]).sort((a, b) => a[0].localeCompare(b[0]))
const rows = []
async function scenario(selected) {
    const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'pica-legacy-transition-' + randomUUID().replaceAll('-', '')))
    const app = path.join(root, 'application'), home = path.join(root, 'localappdata', 'Pica Library'), data = path.join(home, 'data'),
        instanceFile = path.join(home, 'runtime-state', 'instance.json'), normalProgress = path.join(home, 'runtime-state', 'updates', 'update-progress.json'),
        tool = path.join(root, 'tool'), review = path.join(root, 'review-tool'), harness = path.join(root, 'harness'), audit = path.join(harness, 'audit.jsonl'), descriptor = path.join(harness, 'fixture.json')
    const env = { ...process.env, LOCALAPPDATA: path.dirname(home), APPDATA: path.join(root, 'roaming') }
    for (const key of Object.keys(env)) if (/^(?:PICA_|JM_|EH_|EXH_|ANDROID_PREVIEW_|GH_|GITHUB_TOKEN$|NODE_OPTIONS$|NODE_PATH$|NODE_EXTRA_CA_CERTS$|NODE_TLS_|READER_)/i.test(key)) delete env[key]
    let instance, browser, activeLauncher, success = false, cleanupFailure = false
    const terminals = [], logs = [], result = { scenario: selected, status: 'FAIL', sourceSha, syntheticOnly: true, syntheticStableAuthorityOnly: true, publicationAuthenticated: false, productOrHelperBytesPatched: false, deadlinesModified: false, productionDataAccessed: false }
    const events = () => fs.readFileSync(audit, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    function node(args) {
        const r = spawnSync(path.join(app, 'runtime', 'node.exe'), args, { env, cwd: root, windowsHide: true, encoding: 'utf8', timeout: 20000 })
        assert.equal(r.status, 0, (r.stderr ?? '').slice(-2000)); return r.stdout
    }
    const state = action => JSON.parse(node(['-e', legacyTransitionStateProgram, action, root]))
    function ownedPid(pid) {
        assert.ok(Number.isInteger(pid) && pid > 0)
        const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress`], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
        assert.equal(r.status, 0); if (!r.stdout.trim()) return false
        const value = JSON.parse(r.stdout)
        assert.ok(value.ExecutablePath && fs.realpathSync.native(value.ExecutablePath).toLowerCase().startsWith(root.toLowerCase() + path.sep), 'Refuse an unowned T3 process')
        return true
    }
    async function ready(version) {
        for (let attempt = 0; attempt < 300; attempt++) {
            try {
                const value = JSON.parse(fs.readFileSync(instanceFile, 'utf8')); assert.ok(ownedPid(value.pid)); assert.match(value.url, /^http:\/\/127\.0\.0\.1:\d+$/)
                const response = await fetch(value.url + '/api/v1/desktop/status', { signal: AbortSignal.timeout(1500) }), status = await response.json()
                const capabilities = await fetch(value.url + '/api/v1/capabilities', { signal: AbortSignal.timeout(1500) }).then(response => response.json())
                if (response.ok && status.version === version && capabilities.appVersion === version) {
                    if (version !== '0.5.0') { assert.equal(status.startupReady, true); assert.deepEqual(status.externalSources?.enabled, []) }
                    instance = { ...value, csrfToken: status.csrfToken }; return status
                }
            } catch {}
            await sleep(100)
        }
        throw Error('Actual T3 application did not become ready at ' + version)
    }
    async function post(route, body) {
        return fetch(instance.url + route, { method: 'POST', headers: { 'content-type': 'application/json', Origin: instance.url, 'x-pica-csrf': instance.csrfToken }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) })
    }
    function launchOld() {
        const out = fs.createWriteStream(path.join(harness, 'old-launcher.stdout.log'), { flags: 'wx' }), err = fs.createWriteStream(path.join(harness, 'old-launcher.stderr.log'), { flags: 'wx' }); logs.push(out, err)
        activeLauncher = spawn(path.join(app, 'Pica Library.exe'), ['--no-open'], { cwd: app, env: { ...env, READER_LEGACY_T3_FIXTURE: descriptor, NODE_OPTIONS: '--import=' + pathToFileURL(path.join(harness, 'legacy-transition-t3-preload.mjs')).href }, windowsHide: true, stdio: ['ignore', out, err] })
        activeLauncher.on('error', () => {})
    }
    function terminal(which = tool, wrapper = false) {
        const binary = wrapper ? path.join(systemRoot, 'System32', 'cmd.exe') : path.join(which, 'runtime', 'node.exe')
        const args = wrapper ? ['/d', '/s', '/c', 'call "' + path.join(which, 'Start-Pica-Library-Transition.cmd') + '"'] : ['--import=' + pathToFileURL(path.join(harness, 'legacy-transition-t3-preload.mjs')).href, path.join(which, 'app', 'legacy-transition.cjs')]
        const process = pty.spawn(binary, args, { name: 'xterm-color', cols: 4096, rows: 40, cwd: which, env: { ...env, READER_LEGACY_T3_FIXTURE: descriptor } })
        const value = { process, output: '', exited: false, code: null, error: null }
        value.exit = new Promise(resolve => process.onExit(({ exitCode }) => { value.exited = true; value.code = exitCode; resolve(exitCode) }))
        process.onData(bytes => { value.output += stripVTControlCharacters(bytes).replaceAll('\r', ''); if (value.output.length > 256 * 1024) value.error = Error('T3 terminal output exceeded bound') })
        terminals.push(value); return value
    }
    async function text(value, wanted, timeout = 20000) {
        const until = Date.now() + timeout
        while (Date.now() < until) { if (value.error) throw value.error; if (value.output.includes(wanted)) return; if (value.exited) throw Error('T3 entry exited before ' + wanted + ': ' + value.output.slice(-1600)); await sleep(50) }
        throw Error('T3 entry did not present ' + wanted)
    }
    async function exited(value, expected) {
        for (let attempt = 0; attempt < 1200 && !value.exited; attempt++) { if (value.error) throw value.error; await sleep(100) }
        assert.ok(value.exited, 'T3 terminal did not exit'); if (expected !== undefined) assert.equal(value.code, expected, value.output.slice(-1600)); return value
    }
    async function selectedEntry(which = tool, wrapper = false, application = app) {
        const value = terminal(which, wrapper); await text(value, '旧版 Pica Library'); value.process.write(application + '\r'); return value
    }
    async function confirmation(value) {
        for (let attempt = 0; attempt < 400; attempt++) {
            if (value.output.includes('输入 MIGRATE')) return
            const yesPrompts = [...value.output.matchAll(/输入 YES/g)].length
            if (yesPrompts > (value.yesAccepted ?? 0)) { value.yesAccepted = yesPrompts; value.process.write('YES\r') }
            if (value.exited) throw Error('T3 confirmation unavailable: ' + value.output.slice(-1600))
            await sleep(50)
        }
        throw Error('Actual T3 confirmation not presented')
    }
    function accepted(value) {
        const match = value.output.match(/\{"status":"HELPER_ACCEPTED_PARENT_MUST_EXIT"[^\n]*\}/)
        assert.ok(match, value.output.slice(-2400)); const info = JSON.parse(match[0])
        for (const file of [info.instructionFile, info.progressFile]) assert.ok(path.resolve(file).toLowerCase().startsWith(root.toLowerCase() + path.sep))
        return info
    }
    async function terminalPhase(file, phase) {
        for (let attempt = 0; attempt < 1500; attempt++) {
            try { const value = JSON.parse(fs.readFileSync(file, 'utf8')); if (['complete', 'failed'].includes(value.phase)) { assert.equal(value.phase, phase); return value } } catch (error) { if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error }
            await sleep(100)
        }
        throw Error('T3 helper did not retain the required terminal state')
    }
    async function stopOwned() {
        const pids = new Set(events().flatMap(row => [row.pid, row.childPid]).filter(pid => Number.isInteger(pid) && pid > 0))
        if (activeLauncher?.pid) pids.add(activeLauncher.pid)
        try {
            const published = JSON.parse(fs.readFileSync(instanceFile, 'utf8'))
            if (ownedPid(published.pid)) { instance = { ...published, csrfToken: (await fetch(published.url + '/api/v1/desktop/status', { signal: AbortSignal.timeout(1500) }).then(response => response.json())).csrfToken }; pids.add(published.pid); try { await post('/api/v1/desktop/shutdown', {}) } catch {} }
        } catch (error) { if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError) && error.name !== 'TypeError') throw error }
        for (const value of terminals) if (!value.exited) value.process.kill()
        for (const pid of pids) {
            for (let attempt = 0; attempt < 50 && ownedPid(pid); attempt++) await sleep(100)
            if (ownedPid(pid)) process.kill(pid)
            for (let attempt = 0; attempt < 100 && ownedPid(pid); attempt++) await sleep(100)
            assert.ok(!ownedPid(pid), 'Owned T3 process remains; retain fixture')
        }
    }
    // Scenario body follows below; all runtime entrypoints remain behind the guard.
    try {
        old.extractAllTo(app); toolZip.extractAllTo(tool); reviewZip.extractAllTo(review); fs.mkdirSync(harness)
        fs.writeFileSync(audit, '', { flag: 'wx' })
        for (const file of ['old-client-first-hop.mjs', 'legacy-transition-t3-fixture.mjs', 'legacy-transition-t3-preload.mjs']) fs.copyFileSync(path.join(scriptRoot, 'lib', file), path.join(harness, file), fs.constants.COPYFILE_EXCL)
        const forwardArchive = path.join(harness, targets[1].row.file); fs.writeFileSync(forwardArchive, targets[1].bytes, { flag: 'wx' })
        fs.writeFileSync(descriptor, JSON.stringify({ schemaVersion: 1, kind: T3_KIND, root, applicationRoot: app, auditFile: audit, scenario: selected, nonce: randomUUID().replaceAll('-', ''), sourceSha,
            transitionSha256: sha256(toolZip.readFile('app/legacy-transition.cjs')), helperSha256: targets[0].helperSha256, desktop1Sha256: targets[0].desktopSha256, desktop2Sha256: targets[1].desktopSha256,
            forwardArchive, forwardSha256: sha256(targets[1].bytes), publicationAuthenticated: false, syntheticStableAuthorityOnly: true }), { flag: 'wx' })
        const csv = path.join(root, 'synthetic.csv'); fs.writeFileSync(csv, 'comic_id,title,author,categories,tags,finished,total_likes,total_views,pages_count,eps_count\nfirst-hop-sentinel-1,Synthetic Legacy Transition Sentinel,Fixture Author,Fixture,Fixture,true,1,1,12,1\n', { flag: 'wx' })
        node([path.join(app, 'app', 'pica-library.js'), 'import', csv, '--data-dir', data, '--json']); state('seed'); state('snapshot')
        assert.deepEqual(tree(app), expectedTree(old))
        await executeScenario()
        state('verify')
        const auditRows = events(); assert.ok(!auditRows.some(row => /BLOCKED|UNEXPECTED|UNCAUGHT/.test(row.kind)), 'T3 source/process/network boundary violation')
        Object.assign(result, { status: 'PASS', selectedSyntheticStateCanariesPreserved: true, originalPublicOldArchiveUnmodified: true, actualBoundEntry: true, physicalDeviceOrPublishedOta: 'NOT_ESTABLISHED' }); success = true
    } catch (error) { result.error = String(error?.stack ?? error) }
    finally {
        try { await browser?.close(); await stopOwned() } catch (error) { success = false; cleanupFailure = true; result.status = 'FAIL'; result.cleanupError = String(error) }
        await Promise.all(logs.map(stream => new Promise((resolve, reject) => { stream.once('error', reject); stream.end(resolve) })))
        const out = path.join(evidence, selected); fs.mkdirSync(out)
        fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' })
        const output = terminals.map((value, index) => ({ index, exitCode: value.code, output: value.output })); fs.writeFileSync(path.join(out, 'terminal.txt'), JSON.stringify(output, null, 2), { flag: 'wx' })
        if (fs.existsSync(audit)) { assert.ok(fs.statSync(audit).size <= 256 * 1024); fs.copyFileSync(audit, path.join(out, 'audit.jsonl'), fs.constants.COPYFILE_EXCL) }
        if (success) {
            assert.ok(fs.realpathSync.native(path.dirname(root)) === fs.realpathSync.native(os.tmpdir()) && /^pica-legacy-transition-[a-f0-9]{32}[a-zA-Z0-9]{6}$/.test(path.basename(root)) && !fs.lstatSync(root).isSymbolicLink())
            fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
        } else console.error('Failed owned T3 fixture retained: ' + root)
    }
    return { ...result, cleanupFailure }

    async function executeScenario() {
        const beforeApp = tree(app), work = path.join(env.LOCALAPPDATA, 'Pica Library Upgrade Transition', sourceSha.slice(0, 16))
        const unchanged = () => { assert.deepEqual(tree(app), beforeApp); state('verify') }
        const helpers = () => events().filter(row => row.kind === 'INDEPENDENT_MODERN_HELPER_SELECTED')
        const migrate = async () => {
            const value = await selectedEntry(); await confirmation(value); value.process.write('MIGRATE\r'); await exited(value, 0)
            return accepted(value)
        }
        if (selected === 'preview-cancel') {
            // Real PTY descriptors, no property replacement or fake stdin flags.
            const probe = pty.spawn(path.join(tool, 'runtime', 'node.exe'), ['-e', 'process.stdout.write("T3_REAL_TTY="+process.stdin.isTTY+","+process.stdout.isTTY)'], { cols: 120, rows: 20, cwd: tool, env })
            let output = '', ended = false
            probe.onData(value => { output += stripVTControlCharacters(value) }); probe.onExit(() => { ended = true })
            for (let attempt = 0; attempt < 200 && !ended; attempt++) await sleep(50)
            if (!ended) { probe.kill(); throw Error('Real TTY probe did not exit') }
            assert.ok(output.includes('T3_REAL_TTY=true,true'))
            const preview = await selectedEntry(review, true); await exited(preview, 0)
            assert.ok(preview.output.includes('仅预检')); assert.ok(preview.output.includes('"canApply": false')); unchanged(); assert.ok(!fs.existsSync(work))
            const cancelled = await selectedEntry(); await confirmation(cancelled); cancelled.process.write('CANCEL\r'); await exited(cancelled, 0)
            assert.ok(cancelled.output.includes('已取消')); unchanged(); assert.ok(!fs.existsSync(work)); assert.equal(helpers().length, 0)
            Object.assign(result, { realConPtyTty: true, actualCmdUnpublishedPreview: true, actualInteractiveCancellation: true, previewAndCancelNoWrites: true })
        } else if (selected === 'integrity-rejections') {
            const refused = async (expected, application = app) => {
                const value = await selectedEntry(tool, false, application); await exited(value, 1); assert.match(value.output, expected)
                assert.equal(helpers().length, 0); assert.ok(!fs.existsSync(work))
            }
            const oldDesktop = path.join(app, 'app', 'desktop.js'), original = fs.readFileSync(oldDesktop)
            fs.appendFileSync(oldDesktop, '\n// synthetic T3 integrity counterexample\n'); const tamperedTree = tree(app)
            await refused(/INSTALLED_FILE_MISMATCH/); assert.deepEqual(tree(app), tamperedTree); fs.writeFileSync(oldDesktop, original); unchanged()
            const payload = path.join(tool, 'payload', targets[0].row.file), bytes = fs.readFileSync(payload), bad = Buffer.from(bytes); bad[bad.length - 1] ^= 1
            fs.writeFileSync(payload, bad); await refused(/TARGET_ARCHIVE_HASH_MISMATCH/); assert.equal(sha256(fs.readFileSync(payload)), sha256(bad)); fs.writeFileSync(payload, bytes); unchanged()
            const config = path.join(home, 'config', 'config.json'), configBytes = fs.readFileSync(config), invalid = JSON.parse(configBytes)
            invalid.libraryDirectory = app; fs.writeFileSync(config, JSON.stringify(invalid)); const wrongConfig = fs.readFileSync(config)
            await refused(/PATH_ROLES_OVERLAP/); assert.deepEqual(fs.readFileSync(config), wrongConfig); fs.writeFileSync(config, configBytes); unchanged()
            await refused(/PATH_ROLES_OVERLAP/, root); unchanged()
            result.preflightRejections = ['old-full-tree-hash', 'target-payload-hash', 'library-application-overlap', 'broad-overlapping-program-root']
        } else if (selected === 'running-refusal') {
            launchOld(); await ready('0.5.0'); const pid = instance.pid
            const value = await selectedEntry(); await confirmation(value); value.process.write('MIGRATE\r'); await exited(value, 1)
            assert.match(value.output, /CLOSE_SELECTED_(?:LEGACY_APPLICATION|PROFILE_APPLICATION)_FIRST/)
            assert.ok(ownedPid(pid)); await ready('0.5.0'); assert.equal(instance.pid, pid); unchanged(); assert.ok(!fs.existsSync(work)); assert.equal(helpers().length, 0)
            result.actualRunningOldProcessRefusedWithoutTermination = true
        } else if (selected === 'concurrent-entry') {
            const first = await selectedEntry(); await confirmation(first)
            const second = await selectedEntry(); await confirmation(second)
            first.process.write('MIGRATE\r'); second.process.write('MIGRATE\r')
            await Promise.all([exited(first), exited(second)])
            const acceptedEntries = [first, second].filter(value => value.output.includes('HELPER_ACCEPTED_PARENT_MUST_EXIT'))
            assert.equal(acceptedEntries.length, 1); assert.equal(helpers().length, 1)
            assert.equal([first, second].filter(value => value.code === 1).length, 1)
            const info = accepted(acceptedEntries[0]); await terminalPhase(info.progressFile, 'complete'); await ready('0.5.1')
            assert.deepEqual(tree(app), expectedTree(targets[0].archive)); state('verify')
            result.twoConfirmedEntriesExactlyOneHelperAndHealthyTarget = true
        } else {
            const info = await migrate(), rollback = selected.endsWith('rollback')
            assert.equal(helpers().length, 1); assert.equal(helpers()[0].healthTimeoutMs, 60000); assert.equal(helpers()[0].legacyGuardPresent, true)
            await terminalPhase(info.progressFile, rollback ? 'failed' : 'complete')
            await ready(rollback ? '0.5.0' : '0.5.1')
            assert.deepEqual(tree(app), expectedTree(rollback ? old : targets[0].archive)); state('verify')
            if (rollback) {
                if (selected === 'launch-rollback') assert.equal(events().filter(row => row.kind === 'SYNTHETIC_TARGET_LAUNCH_ERROR').length, 1)
                else {
                    const health = events().filter(row => row.kind === 'SYNTHETIC_HEALTH_RESPONSE_FAILURE'); assert.ok(health.length > 1)
                    assert.ok(health.at(-1).at - health[0].at >= 50000, 'Product health failure must exercise the retained deadline')
                }
                Object.assign(result, { actualOldAppRelaunchedAndReady: true, actualTerminalFailureRetained: true, oldProgramTreeRestored: true, healthDeadlineMs: 60000 })
            } else {
                const browserErrors = [], external = []
                browser = await chromium.launch({ headless: true }); const page = await browser.newPage()
                page.on('pageerror', error => browserErrors.push(String(error)))
                page.on('console', value => { if (value.type() === 'error') browserErrors.push(value.text()) })
                await page.route('**/*', route => {
                    const url = new URL(route.request().url())
                    if (['data:', 'blob:'].includes(url.protocol) || ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return route.continue()
                    external.push({ protocol: url.protocol, resourceType: route.request().resourceType() }); return route.abort('blockedbyclient')
                })
                await page.goto(instance.url, { waitUntil: 'domcontentloaded' }); await expect(page.locator('#mode')).not.toHaveText('正在检测模式', { timeout: 10000 })
                if (await page.locator('#pica-disclaimer-gate').isVisible()) { await page.locator('#pica-disclaimer-check').check(); await page.locator('#pica-disclaimer-accept').click() }
                await expect.poll(() => page.evaluate(() => Boolean(window.picaOnboarding)), { timeout: 10000 }).toBe(true)
                if (await page.locator('#pica-onboarding-welcome').isVisible()) await page.locator('#pica-onboarding-later').click()
                await page.locator('nav [data-view="maintenance"]').click(); await page.locator('#a87-maintenance-tab').click()
                await expect(page.locator('#update-one-click')).toBeVisible()
                const prepared = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/update/prepare-latest', { timeout: 180000 })
                const applied = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/update/apply', { timeout: 180000 })
                const reloaded = page.waitForEvent('domcontentloaded', { timeout: 180000 }).then(() => null, error => error)
                await page.locator('#update-one-click').click(); await expect(page.locator('#app-confirm-dialog')).toBeVisible(); await expect(page.locator('#app-confirm-message')).toContainText('0.5.2')
                await page.locator('#app-confirm-submit').click()
                const preparedResponse = await prepared, staged = await preparedResponse.json(); assert.ok(preparedResponse.ok()); assert.equal(staged.mode, 'full-application'); assert.equal(staged.archiveSha256, targets[1].row.sha256)
                assert.ok((await applied).ok()); await terminalPhase(normalProgress, 'complete'); await ready('0.5.2')
                const reloadError = await reloaded; if (reloadError) throw reloadError
                await expect(page.locator('#mode')).not.toHaveText('正在检测模式', { timeout: 10000 })
                assert.deepEqual(tree(app), expectedTree(targets[1].archive)); state('verify')
                assert.ok(events().some(row => row.kind === 'NORMAL_INSTALLED_HELPER_SELECTED'))
                assert.deepEqual(browserErrors, []); assert.deepEqual(external, [])
                Object.assign(result, { actualOneTimeEntryMigration: true, actualBrowserOneClickForwardUpdate: true, forwardVersion: '0.5.2', browserReloadObserved: true, noExternalBrowserRequests: true })
            }
        }
    }
}
for (const selected of T3_SCENARIOS) {
    const row = await scenario(selected); rows.push(row); console.log(JSON.stringify(row))
    if (row.cleanupFailure) break
}
const summary = { kind: T3_KIND, sourceSha, tools: toolsReceipt, status: rows.length === T3_SCENARIOS.length && rows.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL', rows,
    rawToolsOrInstallersUploaded: false, publicationAuthenticated: false, legacyOriginalInAppFailureReclassified: false, productionDataAccessed: false, localExecution: false, fullObjective: 'OPEN' }
fs.writeFileSync(path.join(evidence, 'summary.json'), JSON.stringify(summary, null, 2), { flag: 'wx' })
if (summary.status !== 'PASS') process.exitCode = 1
