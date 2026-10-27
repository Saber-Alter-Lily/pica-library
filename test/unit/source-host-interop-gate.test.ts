import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
// @ts-expect-error Pure CI helper, no Java/application/host is loaded by these tests.
import { assertRealHostCi, checkedOwnedRealHostRoot, realHostJavaArguments, syntheticHostPng, REAL_HOST_JAR_SHA256, REAL_HOST_BRANCH } from '../../scripts/lib/source-host-interop-fixture.mjs'
import authority from '../fixtures/source-host-runtime-authority.json'
const read = (file: string) => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')
const workflow = read('.github/workflows/source-host-interop.yml'), launcher = read('scripts/test-source-host-interop.mjs'), client = read('scripts/lib/source-host-interop-client.ts')
const allowed = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_REPOSITORY: 'Saber-Alter-Lily/pica-library', GITHUB_REF: REAL_HOST_BRANCH, GITHUB_EVENT_NAME: 'push' }

describe('bounded real Host interop recipe, source-only local checks', () => {
    it('keeps official source/runtime binding and requires the exact authorized hosted context', () => {
        expect(authority.commit).toBe('40bc5da57820324ed0ae724cbbc020cc4673b594')
        expect(authority.jar.sha256).toBe(REAL_HOST_JAR_SHA256); expect(authority.jvmTarget).toBe(21)
        expect(workflow).toContain(REAL_HOST_JAR_SHA256)
        expect(workflow).toContain('pnpm exec tsc --project scripts/tsconfig.source-host-interop.json')
        expect(() => assertRealHostCi(allowed, 'linux')).not.toThrow()
        for (const changed of [{ GITHUB_ACTIONS: 'false' }, { RUNNER_ENVIRONMENT: 'self-hosted' }, { GITHUB_REF: 'refs/heads/main' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REPOSITORY: 'elsewhere/repo' }]) expect(() => assertRealHostCi({ ...allowed, ...changed }, 'linux')).toThrow()
        for (const platform of ['win32', 'darwin']) expect(() => assertRealHostCi(allowed, platform)).toThrow()
    })
    it('refuses the actual entry before TS loading, file reads or native runtime work outside CI', () => {
        const result = spawnSync(process.execPath, ['scripts/test-source-host-interop.mjs', 'MUST_NOT_READ'], { env: { ...process.env, GITHUB_ACTIONS: 'false' }, encoding: 'utf8', windowsHide: true, timeout: 10000 })
        expect(result.status).not.toBe(0); expect(result.stderr).toContain('separately authorized exact-branch disposable')
        expect(launcher.indexOf('assertRealHostCi()')).toBeLessThan(launcher.indexOf("import.meta.resolve('tsx/cli')"))
        expect(launcher).not.toContain("await import('tsx/esm/api')")
    })
    it('resolves and syntax-checks the actually installed public tsx CLI without executing it locally', () => {
        const require = createRequire(import.meta.url), metadata = require('tsx/package.json'), cli = require.resolve('tsx/cli')
        expect(metadata.version).toBe('4.7.0'); expect(metadata.exports['./esm/api']).toBeUndefined()
        expect(metadata.exports['./cli']).toBe(metadata.bin)
        const result = spawnSync(process.execPath, ['--check', cli], { env: { ...process.env, GITHUB_ACTIONS: 'false' }, encoding: 'utf8', windowsHide: true, timeout: 10000 })
        expect(result.status).toBe(0)
    })
    it('owns only fresh fixture roots and disables host UI/CEF/automatic source work without patching upstream', () => {
        const parent = path.resolve(os.tmpdir()), root = path.join(parent, 'pica-real-host-' + 'a'.repeat(32) + 'ABC123')
        expect(checkedOwnedRealHostRoot(parent, root)).toBe(root)
        for (const value of [parent, path.join(parent, '..', 'other'), path.join(parent, 'arbitrary-existing-root')]) expect(() => checkedOwnedRealHostRoot(parent, value)).toThrow()
        const args = realHostJavaArguments(root, path.join(parent, 'host.jar'))
        expect(args).toContain('-Duser.home=' + path.join(root, 'home'))
        expect(args).toContain('-Dsuwayomi.tachidesk.config.server.ip=127.0.0.1')
        expect(args).toContain('-Dsuwayomi.tachidesk.config.server.kcefEnabled=false')
        expect(args).toContain('-Dsuwayomi.tachidesk.config.server.initialOpenInBrowserEnabled=false')
        expect(args).toContain('-Dsuwayomi.tachidesk.config.server.extensionStores=[]')
        expect(args.at(-2)).toBe('-jar'); expect(args).not.toContain('-javaagent')
    })
    it('reuses actual production ports and fresh offline process, not fabricated GraphQL/image responses', () => {
        for (const name of ['HostedLibraryReader', 'SourceHostConnections', 'SourceHostInspector', 'LocalLibraryIngestion', 'PreviewCacheManager', 'ReaderService', 'RuntimeResourceCoordinator']) expect(client).toContain(name)
        expect(client).toContain('const response = await nativeFetch(input, init)')
        expect(client).toContain('return response')
        expect(client).toContain('pageCountObservations')
        expect(client.indexOf('realUpstreamRuntime: false')).toBeLessThan(client.indexOf('result.realUpstreamRuntime = true'))
        expect(client.indexOf('if (!ready)')).toBeLessThan(client.indexOf('result.realUpstreamRuntime = true'))
        expect(client).not.toMatch(/new Response\(|createServer\(|route\.fulfill|fakeFetch/)
        expect(client).toContain("[launcher, 'offline', source, root]")
        expect(client).toContain("await stop(); assert.equal(childExited, true)")
        expect(client).toContain("secondRealProviderAccepted: false")
    })
    it('physically isolates the whole Java/client run to a different loopback-only namespace', () => {
        expect(workflow).toContain('unshare --net --fork --kill-child')
        expect(workflow).toContain('ip link set lo up')
        expect(client).toContain("assert.deepEqual(Object.keys(os.networkInterfaces()), ['lo'])")
        expect(client).toContain("assert.notEqual(current, process.env.PICA_HOST_OUTER_NETNS)")
        expect(client).toContain('url.origin, origin')
        expect(client).toContain("commandLine.includes(jar) && commandLine.includes(path.join(root, 'host'))")
    })
    it('has no signing/publication/installable upload or fake version reservation', () => {
        expect(workflow).toContain('permissions:\n  contents: read')
        expect(workflow).toContain("github.event_name != 'pull_request'")
        expect(workflow).not.toMatch(/secrets\.|contents: write|continue-on-error|gradle|gh release|git push|pull_request_target/)
        const upload = workflow.slice(workflow.indexOf('          path: |'), workflow.indexOf('          retention-days:'))
        expect(upload).toContain('result.json'); expect(upload).not.toMatch(/\.jar|\.zip|\.png|\.db|interop\/\*\*/)
        expect(workflow).toContain('retention-days: 1')
    })
    it('uses distinct valid synthetic PNG payloads with no external image input', () => {
        const first = syntheticHostPng(10, 20, 30), second = syntheticHostPng(40, 50, 60)
        expect(first.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
        expect(first.equals(second)).toBe(false)
        expect(() => syntheticHostPng(-1, 0, 0)).toThrow()
    })
})
