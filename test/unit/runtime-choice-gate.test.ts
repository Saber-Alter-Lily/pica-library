import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { assertDisposableWindowsCi, localConnectTarget, loopbackHost, sha256 } from '../../scripts/lib/old-client-first-hop.mjs'
import { createRuntimeChoiceFetch, RUNTIME_CHOICE_SCENARIOS } from '../../scripts/lib/runtime-choice-fixture.mjs'
import { firstHopStateProgram, runtimeChoiceStateProgram, syntheticUpgradeStateProgram } from '../../scripts/lib/first-hop-state.mjs'

const roots: string[] = [], require = createRequire(import.meta.url)
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
function ownedRoot() {
    const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'pica-runtime-choice-' + randomUUID().replaceAll('-', '')))
    roots.push(root); return root
}
function preload(kind: 'desktop' | 'helper', scenario = 'roundtrip') {
    const root = ownedRoot(), app = path.join(root, 'application'), harness = path.join(root, 'harness')
    fs.mkdirSync(path.join(app, 'app'), { recursive: true }); fs.mkdirSync(harness)
    const desktop = path.join(app, 'app', 'desktop.js'), helper = path.join(harness, 'full-upgrader.js'), sourceSha = 'a'.repeat(40)
    fs.writeFileSync(desktop, 'synthetic desktop identity, never executed'); fs.writeFileSync(helper, 'synthetic helper identity, never executed')
    fs.writeFileSync(path.join(app, 'SOURCE_SHA.txt'), sourceSha); fs.writeFileSync(path.join(app, 'Pica Library.exe'), 'synthetic launcher, never executed')
    fs.writeFileSync(path.join(app, 'app', 'runtime-composition.json'), JSON.stringify({ formatVersion: 1, sourceRuntimes: [] }))
    const archives = Object.fromEntries(['core', 'jm'].map(mode => {
        const file = path.join(harness, mode + '.zip'), bytes = Buffer.from('synthetic ' + mode + ' bytes'); fs.writeFileSync(file, bytes)
        return [mode, { file, sha256: sha256(bytes) }]
    }))
    const audit = path.join(harness, 'audit.jsonl'), descriptor = path.join(harness, 'fixture.json'); fs.writeFileSync(audit, '')
    fs.writeFileSync(descriptor, JSON.stringify({ schemaVersion: 1, root, applicationRoot: app, auditFile: audit, scenario, nonce: 'b'.repeat(32), sourceSha,
        desktopSha256: sha256(fs.readFileSync(desktop)), helperSha256: sha256(fs.readFileSync(helper)), archives }))
    const cp = Object.fromEntries(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork'].map(name => [name, vi.fn((..._args: unknown[]) => new EventEmitter())]))
    const socketConnect = vi.fn(), serverListen = vi.fn(), nativeFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{"appVersion":"0.5.1"}'))
    const sandbox = {
        fs, os, path, EventEmitter, URL, Request, Response, Buffer, ReadableStream, DOMException, Headers, setTimeout, clearTimeout, queueMicrotask,
        cp, net: { Socket: { prototype: { connect: socketConnect } }, Server: { prototype: { listen: serverListen } } }, http: { get: vi.fn(), request: vi.fn() }, https: { get: vi.fn(), request: vi.fn() },
        process: { pid: 999999, argv: ['synthetic-node', kind === 'desktop' ? desktop : helper], env: { READER_RUNTIME_CHOICE_FIXTURE: descriptor }, on: vi.fn() },
        // Run the real boundary algorithm with explicit simulated host ports, not a local CI spoof or application launch.
        assertDisposableWindowsCi: () => assertDisposableWindowsCi({ GITHUB_ACTIONS: 'true', RUNNER_OS: 'Windows', RUNNER_ENVIRONMENT: 'github-hosted' }, 'win32'),
        localConnectTarget, loopbackHost, sha256, createRuntimeChoiceFetch, RUNTIME_CHOICE_SCENARIOS, syncBuiltinESMExports: vi.fn(), fetch: nativeFetch
    }
    const source = fs.readFileSync('scripts/lib/runtime-choice-preload.mjs', 'utf8').replace(/^import .+ from .+\r?\n/gm, '')
    new vm.Script(source).runInNewContext(sandbox)
    const events = () => fs.readFileSync(audit, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    return { root, app, helper, sandbox, nativeFetch, events, socketConnect, serverListen }
}

describe('runtime-choice actual gate preparation, no application/Java/network/listener', () => {
    it('refuses the actual runtime runner and preload before input access outside hosted CI', () => {
        for (const script of ['scripts/test-windows-runtime-choice.mjs', 'scripts/lib/runtime-choice-preload.mjs']) {
            const result = spawnSync(process.execPath, [script, 'NONEXISTENT_INPUT'], { env: { ...process.env, GITHUB_ACTIONS: 'false' }, encoding: 'utf8', windowsHide: true, timeout: 10000 })
            expect(result.error, result.stderr).toBeUndefined(); expect(result.status).not.toBe(0)
            expect(result.stderr).toContain('separately authorized disposable GitHub-hosted Windows CI'); expect(result.stderr).not.toContain('ENOENT')
        }
    })
    it.runIf(process.platform === 'win32')('parses the actual builder and rejects it before source changes or a build', () => {
        const packageBytes = fs.readFileSync('package.json'), file = path.resolve('scripts/build-windows-runtime-choice-fixtures.ps1').replaceAll("'", "''")
        const command = `$ErrorActionPreference='Stop'; $tokens=$null; $errors=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$tokens,[ref]$errors); if($errors){throw ($errors|Out-String)}; & '${file}' -ExpectedSourceSha ('a'*40)`
        const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { env: { ...process.env, GITHUB_ACTIONS: 'false' }, encoding: 'utf8', windowsHide: true, timeout: 10000 })
        expect(result.error, result.stderr).toBeUndefined(); expect(result.status).not.toBeNull(); expect(result.status).not.toBe(0)
        expect(result.stderr).toContain('separately authorized disposable GitHub-hosted Windows CI'); expect(fs.readFileSync('package.json')).toEqual(packageBytes)
    })
    it('uses the actual fault boundary with inert ports to reject Java, external sockets and nonloopback listeners', () => {
        const f = preload('desktop')
        expect(() => f.sandbox.cp.spawn('java.exe')).toThrow(/must not launch Java/)
        expect(() => f.sandbox.net.Socket.prototype.connect({ host: 'untrusted.invalid', port: 443 })).toThrow(/external source sockets/)
        expect(() => f.sandbox.net.Server.prototype.listen({ host: '0.0.0.0', port: 4789 })).toThrow(/loopback listeners/)
        expect(f.socketConnect).not.toHaveBeenCalled(); expect(f.serverListen).not.toHaveBeenCalled()
        f.sandbox.net.Socket.prototype.connect({ host: '127.0.0.1', port: 4789 }); f.sandbox.net.Server.prototype.listen({ host: '127.0.0.1', port: 4789 })
        expect(f.socketConnect).toHaveBeenCalledOnce(); expect(f.serverListen).toHaveBeenCalledOnce()
        expect(f.events().filter(row => /BLOCKED/.test(row.kind))).toHaveLength(3)
    })
    it('validates the actual helper bytes before a desktop can start it', () => {
        const f = preload('desktop'), ownedNode = path.join(f.app, 'runtime', 'node.exe'); fs.mkdirSync(path.dirname(ownedNode)); fs.writeFileSync(ownedNode, 'never executed')
        fs.writeFileSync(f.helper, 'changed helper identity')
        expect(() => f.sandbox.cp.spawn(ownedNode, [f.helper])).toThrow(/installed current helper/)
        expect(f.events().some(row => row.kind === 'INSTALLED_HELPER_SELECTED')).toBe(false)
    })
    it('faults only actual-helper health responses after a real transport-port call, not desktop responses', async () => {
        const helper = preload('helper', 'health-rollback'), desktop = preload('desktop', 'health-rollback')
        for (const f of [helper, desktop]) fs.writeFileSync(path.join(f.app, 'app', 'runtime-composition.json'), JSON.stringify({ formatVersion: 1, sourceRuntimes: ['jm'] }))
        expect((await helper.sandbox.fetch('http://127.0.0.1:4789/api/v1/capabilities')).status).toBe(503)
        expect((await desktop.sandbox.fetch('http://127.0.0.1:4789/api/v1/capabilities')).status).toBe(200)
        expect(helper.nativeFetch).toHaveBeenCalledOnce(); expect(desktop.nativeFetch).toHaveBeenCalledOnce()
        expect(helper.events().filter(row => row.kind === 'SYNTHETIC_HEALTH_RESPONSE_FAILURE')).toHaveLength(1)
    })
    it('injects one asynchronous target launch error but lets the actual recovery launch use its original port', async () => {
        const f = preload('helper', 'launch-rollback')
        fs.writeFileSync(path.join(f.app, 'app', 'runtime-composition.json'), JSON.stringify({ formatVersion: 1, sourceRuntimes: ['jm'] }))
        const child = f.sandbox.cp.spawn(path.join(f.app, 'Pica Library.exe'), ['--no-open'])
        const error = await new Promise<Error & { code?: string }>(resolve => child.once('error', resolve))
        expect(error.code).toBe('EACCES')
        fs.writeFileSync(path.join(f.app, 'app', 'runtime-composition.json'), JSON.stringify({ formatVersion: 1, sourceRuntimes: [] }))
        expect(() => f.sandbox.cp.spawn(path.join(f.app, 'Pica Library.exe'), ['--no-open'])).not.toThrow()
        expect(f.events().filter(row => row.kind === 'SYNTHETIC_TARGET_LAUNCH_ERROR')).toHaveLength(1)
        expect(f.sandbox.process.on.mock.calls.map(row => row[0])).toEqual(['uncaughtExceptionMonitor', 'exit'])
    })
    it('retains the first-hop state contract and detects real synthetic private-tag/progress changes for runtime choice', () => {
        expect(firstHopStateProgram).toBe(syntheticUpgradeStateProgram('old-first-hop'))
        expect(() => syntheticUpgradeStateProgram('arbitrary' as 'old-first-hop')).toThrow(/scope/)
        const root = ownedRoot(), file = path.join(root, 'localappdata/Pica Library/data/library.db'), db = new LibraryDatabase(file)
        db.importFavorites([{ comicId: 'first-hop-sentinel-1', title: 'Synthetic', author: 'Fixture', categories: ['Fixture'], tags: ['Fixture'], finished: true, totalLikes: 1, totalViews: 1 }], 'synthetic:runtime-choice'); db.close()
        const run = (action: string) => new vm.Script(runtimeChoiceStateProgram).runInNewContext({ require, process: { argv: ['synthetic-node', action, root] }, console: { log: vi.fn() } })
        run('seed'); run('snapshot'); run('verify')
        const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite'), connection = new DatabaseSync(file)
        try { connection.prepare('UPDATE app_state SET value_json=? WHERE key=?').run('{"privateTags":[]}', 'acceptance.synthetic.first-hop') } finally { connection.close() }
        expect(() => run('verify')).toThrow()
    })
    it('keeps real UI commands, exact-tree/state checks and legacy failures separate instead of substituting helpers', () => {
        const source = fs.readFileSync('scripts/test-windows-runtime-choice.mjs', 'utf8')
        expect(source).toContain("await page.locator('#app-confirm-submit').click()")
        expect(source).toContain("await applyFromUi(page, 'jm'); await openUi(page); await applyFromUi(page, 'core')")
        expect(source).toContain('newPidAndCsrfSession: true'); expect(source).toContain("state('verify')")
        expect(source).toContain("legacyFirstHopRecovery: 'NOT_ESTABLISHED_BY_THIS_CURRENT_HELPER_GATE'")
        expect(source).not.toMatch(/route\.fulfill|continue-on-error|process\.env\.PICA_LIBRARY_DESKTOP_HOME\s*=/)
    })
})
