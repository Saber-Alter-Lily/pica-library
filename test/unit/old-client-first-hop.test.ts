import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { assertDisposableWindowsCi, createFirstHopFetch, FIRST_HOP_BASELINE, FIRST_HOP_SCENARIOS, firstHopPublication, localConnectTarget, loopbackHost, sha256 } from '../../scripts/lib/old-client-first-hop.mjs'
import { firstHopStateProgram } from '../../scripts/lib/first-hop-state.mjs'

const roots: string[] = [], require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
const fakeBytes = Buffer.from('synthetic archive bytes, never an application'), env = { GITHUB_ACTIONS: 'true', RUNNER_OS: 'Windows', RUNNER_ENVIRONMENT: 'github-hosted' }
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
function transport(scenario = 'success', released = true) {
    const observed: Record<string, unknown>[] = [], native = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('actual loopback stub'))
    return { fetch: createFirstHopFetch({ scenario, archiveBytes: fakeBytes, releasedDesktop: () => released, nativeFetch: native, observe: event => observed.push(event) }), observed, native }
}
describe('first-hop harness contracts without applications, Java, HTTP or listeners', () => {
    it.each([
        [{}, 'win32'], [{ ...env, GITHUB_ACTIONS: 'false' }, 'win32'], [{ ...env, RUNNER_ENVIRONMENT: 'self-hosted' }, 'win32'], [env, 'linux']
    ] as const)('denies non-disposable or non-Windows execution before side effects: %j %s', (environment, platform) => {
        expect(() => assertDisposableWindowsCi(environment, platform)).toThrow(/separately authorized/)
    })
    it('accepts only the exact CI context and keeps baseline discovery distinct from unpublished test labels', () => {
        expect(() => assertDisposableWindowsCi(env, 'win32')).not.toThrow()
        expect(FIRST_HOP_BASELINE.zipSha256).toBe('14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf')
        expect(FIRST_HOP_SCENARIOS).toHaveLength(4)
        expect(() => firstHopPublication('published-ota')).toThrow()
        expect(firstHopPublication('success').archiveName).toBe('Pica-Library-v0.5.1-windows-x64.zip')
        expect(firstHopPublication('health-rollback').version).toBe('0.5.2')
    })
    it('uses synthetic metadata/digest/archive while keeping the official URL checks unmodified', async () => {
        const f = transport(), p = firstHopPublication('success')
        for (const url of [p.latestApi, p.taggedApi]) {
            const response = await f.fetch(url), metadata = await response.json()
            expect(metadata).toMatchObject({ tag_name: 'v0.5.1', assets: [{ name: p.archiveName, digest: 'sha256:' + sha256(fakeBytes), browser_download_url: p.archiveUrl }] })
            expect(response.url).toBe(url)
        }
        const archive = await f.fetch(p.archiveUrl)
        expect(Buffer.from(await archive.arrayBuffer())).toEqual(fakeBytes)
        expect(archive.headers.get('content-length')).toBe(String(fakeBytes.length))
        const fallback = await f.fetch(p.latestSumsUrl)
        expect(fallback.url).toBe(p.sumsUrl)
        expect(await fallback.text()).toContain(sha256(fakeBytes) + '  ' + p.archiveName)
        expect(f.native).not.toHaveBeenCalled()
    })
    it('injects a hash mismatch only into delivered bytes, never into metadata or the original buffer', async () => {
        const f = transport('hash-mismatch'), p = firstHopPublication('hash-mismatch')
        const metadata = await (await f.fetch(p.taggedApi)).json(), delivered = Buffer.from(await (await f.fetch(p.archiveUrl)).arrayBuffer())
        expect(metadata.assets[0].digest).toBe('sha256:' + sha256(fakeBytes))
        expect(sha256(delivered)).not.toBe(sha256(fakeBytes))
        expect(fakeBytes.toString()).toBe('synthetic archive bytes, never an application')
    })
    it.each([
        ['https://api.github.com/repos/other/repo/releases/latest', {}],
        ['https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/other.zip', {}],
        ['https://api.github.com/repos/Saber-Alter-Lily/pica-library/releases/latest', { method: 'POST' }],
        ['https://api.github.com/repos/Saber-Alter-Lily/pica-library/releases/latest', { headers: { authorization: 'SYNTHETIC NOT A TOKEN' } }],
        ['https://api.github.com/repos/Saber-Alter-Lily/pica-library/releases/latest', { headers: { cookie: 'synthetic=not-a-real-cookie' } }],
        ['http://127.0.0.1.attacker.invalid/', {}]
    ] as const)('never falls back to a real external request: %s', async (url, options) => {
        const f = transport()
        await expect(f.fetch(url, options)).rejects.toThrow(/external/)
        expect(f.native).not.toHaveBeenCalled()
        expect(f.observed).toEqual([{ kind: 'UNEXPECTED_EXTERNAL_REQUEST' }])
        expect(JSON.stringify(f.observed)).not.toMatch(/SYNTHETIC NOT A TOKEN|not-a-real-cookie/)
    })
    it('allows actual loopback health only and never makes a helper/candidate into a publisher', async () => {
        const f = transport('success', false)
        expect(await (await f.fetch('http://127.0.0.1:4789/api/v1/capabilities')).text()).toBe('actual loopback stub')
        expect(f.native).toHaveBeenCalledTimes(1)
        await expect(f.fetch(firstHopPublication('success').latestApi)).rejects.toThrow()
        expect(f.native).toHaveBeenCalledTimes(1)
    })
    it.each(['127.0.0.1', '::1', '[::1]', '::ffff:127.0.0.1', 'localhost'])('recognizes exact loopback host %s', host => {
        expect(loopbackHost(host)).toBe(true); expect(localConnectTarget([{ host, port: 1234 }])).toBe(true)
    })
    it.each(['127.0.0.1.attacker.invalid', '0.0.0.0', '192.168.1.1', 'github.com', undefined])('refuses nonlocal connect host %s', host => {
        expect(loopbackHost(host)).toBe(false); expect(localConnectTarget({ host, port: 443 })).toBe(false)
    })
    it('permits only local Windows IPC, not arbitrary socket path strings', () => {
        expect(localConnectTarget('\\\\.\\pipe\\owned-test')).toBe(true)
        expect(localConnectTarget({ path: '\\\\?\\pipe\\owned-test' })).toBe(true)
        expect(localConnectTarget('/tmp/arbitrary')).toBe(false)
    })
    it('exercises real disposable SQLite/user-file canaries and detects progress loss', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-old-first-hop-' + randomUUID().replaceAll('-', ''))); roots.push(root)
        const file = path.join(root, 'localappdata/Pica Library/data/library.db'), database = new LibraryDatabase(file)
        database.importFavorites([{ comicId: 'first-hop-sentinel-1', title: 'Synthetic First Hop Sentinel', author: 'Fixture Author', categories: ['Fixture'], tags: ['Fixture'], finished: true, totalLikes: 1, totalViews: 1 }], 'synthetic:first-hop')
        database.close()
        const run = (action: string) => new vm.Script(firstHopStateProgram).runInNewContext({ require, process: { argv: ['synthetic-node', action, root] }, console: { log: vi.fn() } })
        run('seed'); run('snapshot'); run('verify')
        const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'expected-state.json'), 'utf8'))
        expect(snapshot.progress[0].page_index).toBe(7); expect(snapshot.comic.is_favorite).toBe(1)
        const connection = new DatabaseSync(file)
        try { connection.prepare('UPDATE reading_progress SET page_index=8 WHERE comic_id=?').run('first-hop-sentinel-1') } finally { connection.close() }
        expect(() => run('verify')).toThrow()
    })
    it('rejects a non-owned state root before opening a database', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'not-a-first-hop-')); roots.push(root)
        expect(() => new vm.Script(firstHopStateProgram).runInNewContext({ require, process: { argv: ['synthetic-node', 'seed', root] }, console: { log: vi.fn() } })).toThrow(/owned synthetic/)
        expect(fs.readdirSync(root)).toEqual([])
    })
    it('the actual first-hop application runner refuses outside authorized CI before input/state access', () => {
        const result = spawnSync(process.execPath, ['scripts/test-windows-old-client-first-hop.mjs'], { env: { ...process.env, GITHUB_ACTIONS: 'false' }, windowsHide: true, encoding: 'utf8', timeout: 10000 })
        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain('separately authorized disposable GitHub-hosted Windows CI')
        expect(result.stderr).not.toContain('ENOENT')
    })
    it.runIf(process.platform === 'win32')('the actual fixture builder refuses before changing source or starting a build', () => {
        const metadata = fs.readFileSync('package.json')
        const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.resolve('scripts/build-windows-first-hop-fixture.ps1'), '-ExpectedSourceSha', '1'.repeat(40)], { env: { ...process.env, GITHUB_ACTIONS: 'false' }, encoding: 'utf8', windowsHide: true, timeout: 10000 })
        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain('separately authorized disposable GitHub-hosted Windows CI')
        expect(fs.readFileSync('package.json')).toEqual(metadata)
    })
    it.runIf(process.platform === 'win32')('the actual packaging SHA function releases its file before the next build step', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-hash-handle-')); roots.push(root)
        const file = path.join(root, 'synthetic.zip'); fs.writeFileSync(file, fakeBytes)
        const quote = (value: string) => value.replaceAll("'", "''")
        const script = path.resolve('scripts/build-windows-package.ps1')
        const command = `$ErrorActionPreference='Stop'; $tokens=$null; $errors=$null; $ast=[System.Management.Automation.Language.Parser]::ParseFile('${quote(script)}',[ref]$tokens,[ref]$errors); if($errors){throw 'Builder parse failed'}; $fn=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-Sha256'},$true); if(-not $fn){throw 'Missing actual builder SHA function'}; . ([scriptblock]::Create($fn.Extent.Text)); $hash=Get-Sha256 '${quote(file)}'; if($hash -ne '${sha256(fakeBytes)}'){throw 'Incorrect SHA'}; $exclusive=[IO.File]::Open('${quote(file)}',[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None); $exclusive.Dispose(); 'PASS_HASH_AND_EXCLUSIVE_REOPEN'`
        const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 10000 })
        expect(result.status, result.stderr).toBe(0)
        expect(result.stdout).toContain('PASS_HASH_AND_EXCLUSIVE_REOPEN')
    })
})
