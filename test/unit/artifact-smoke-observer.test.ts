import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url), roots: string[] = []
const code = fs.readFileSync('scripts/fixtures/artifact-smoke-process-observer.cjs', 'utf8')
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
describe('external process observation without application/PowerShell execution', () => {
    it('loads the real observer through portable NODE_OPTIONS and refuses before executing an entry', () => {
        const observer = path.resolve('scripts/fixtures/artifact-smoke-process-observer.cjs')
        const probe = (file: string) => spawnSync(process.execPath, ['-e', "throw Error('UNREACHABLE_ENTRY')"], { windowsHide: true, encoding: 'utf8', timeout: 10000,
            env: { ...process.env, GITHUB_ACTIONS: 'false', NODE_OPTIONS: '--require="' + file + '"' } })
        const portable = probe(observer.replaceAll('\\', '/'))
        expect(portable.error).toBeUndefined(); expect(portable.status).toBe(1)
        expect(portable.stderr).toContain('Smoke process observation requires disposable Windows CI')
        expect(portable.stderr).not.toContain('UNREACHABLE_ENTRY')
        if (process.platform === 'win32') {
            const old = probe(observer)
            expect(old.error).toBeUndefined(); expect(old.status).toBe(1)
            expect(old.stderr).toContain('Cannot find module')
            expect(old.stderr).not.toContain('UNREACHABLE_ENTRY')
        }
        expect(fs.readFileSync('scripts/test-windows-artifact.ps1', 'utf8')).toContain("$observer.Replace('\\','/')")
    })
    it('refuses non-disposable contexts before descriptor access or process hooks', () => {
        const port = { spawnSync: vi.fn() }, sync = vi.fn()
        const load = (name: string) => name === 'node:child_process' ? port : name === 'node:module' ? { syncBuiltinESMExports: sync } : require(name)
        expect(() => new vm.Script(code).runInNewContext({ require: load, process: { platform: 'linux', env: {} } })).toThrow(/disposable Windows CI/)
        expect(port.spawnSync).not.toHaveBeenCalled(); expect(sync).not.toHaveBeenCalled()
    })
    it('records only timing/status and preserves the original result and error', () => {
        const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-smoke-observer-')); roots.push(parent)
        const declaredRoot = path.join(parent, 'pica-artifact-smoke-' + randomUUID().replaceAll('-', ''))
        fs.mkdirSync(declaredRoot)
        // Match the CI descriptor's canonical owned-root spelling; do not weaken the observer's containment guard.
        const root = fs.realpathSync.native(declaredRoot)
        const app = path.join(root, 'application'), entry = path.join(app, 'app/desktop.js'), audit = path.join(root, 'process-audit.jsonl')
        const sourceSha = '1'.repeat(40), bytes = Buffer.from('synthetic bytes, never executed'), descriptor = path.join(root, 'observer-descriptor.json')
        fs.mkdirSync(path.dirname(entry), { recursive: true }); fs.writeFileSync(entry, bytes); fs.writeFileSync(path.join(app, 'SOURCE_SHA.txt'), sourceSha)
        fs.writeFileSync(descriptor, JSON.stringify({ root, applicationRoot: app, auditFile: audit, sourceSha, desktopSha256: createHash('sha256').update(bytes).digest('hex') }))
        const secret = 'SYNTHETIC_SECRET_MUST_NOT_ENTER_AUDIT', thrown = Object.assign(new Error(secret), { code: 'EACCES' })
        const returned = { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT', message: secret }, stdout: secret, stderr: secret }
        const original = vi.fn().mockReturnValueOnce(returned).mockImplementationOnce(() => { throw thrown }), port = { spawnSync: original }, sync = vi.fn()
        const load = (name: string) => name === 'node:child_process' ? port : name === 'node:module' ? { syncBuiltinESMExports: sync } : name === 'node:os' ? { ...os, tmpdir: () => parent } : require(name)
        new vm.Script(code).runInNewContext({ require: load, process: { pid: 12345, argv: ['synthetic-node', entry], platform: 'win32', env: {
            GITHUB_ACTIONS: 'true', RUNNER_OS: 'Windows', RUNNER_ENVIRONMENT: 'github-hosted', READER_SMOKE_PROCESS_OBSERVER_FILE: descriptor
        } } })
        const args = ['-Command', '[Security.Cryptography.ProtectedData]::Protect(' + secret + ')']
        expect(port.spawnSync('powershell.exe', args, { input: secret })).toBe(returned)
        expect(() => port.spawnSync('powershell.exe', args, { input: secret })).toThrow(thrown)
        expect(original).toHaveBeenCalledTimes(2); expect(sync).toHaveBeenCalledOnce()
        const text = fs.readFileSync(audit, 'utf8'), rows = text.trim().split('\n').map(line => JSON.parse(line))
        expect(text).not.toContain(secret)
        expect(rows.map(row => row.kind)).toEqual(['OBSERVER_READY', 'SYNC_PROCESS_BEGIN', 'SYNC_PROCESS_END', 'SYNC_PROCESS_BEGIN', 'SYNC_PROCESS_THROW'])
        expect(rows[1]).toMatchObject({ windowsPowerShell: true, dpapiProtect: true, dpapiUnprotect: false })
        expect(rows[2]).toMatchObject({ status: null, signal: 'SIGTERM', errorCode: 'ETIMEDOUT' }); expect(rows[4]).toMatchObject({ errorCode: 'EACCES' })
    })
    it('retains the setup deadline and exports no credential/config/database files', () => {
        const smoke = fs.readFileSync('scripts/test-windows-artifact.ps1', 'utf8')
        const save = smoke.split("$payload = @{ account='synthetic-account'")[1]?.split('Start-Sleep -Seconds 1')[0] ?? ''
        expect(save).toContain('-TimeoutSec 15')
        const evidence = smoke.split('if ($observerDescriptor)')[1]?.split('if ($listener)')[0] ?? ''
        expect(evidence).toContain('Copy-Item -LiteralPath $observerAudit'); expect(evidence).not.toMatch(/credentials\.dat|config\.json|library\.db/)
        expect(smoke).toContain("[Environment]::SetEnvironmentVariable('NODE_OPTIONS',$originalNodeOptions,'Process')")
    })
})
