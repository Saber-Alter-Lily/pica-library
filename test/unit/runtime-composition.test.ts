import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compositionFromPayload, coreRuntimeComposition, normalizeRuntimeComposition, parseRuntimeComposition, RUNTIME_COMPOSITION_PATH, sameRuntimeComposition } from '../../src/modules/runtime-composition'
import { installedRuntimeComposition } from '../../src/runtime/installed-runtime-composition'
import { stageSourceRuntime } from '../../scripts/stage-source-runtime'
import { JmWorkerTransport, selectJmApplicationRoot } from '../../src/providers/jm-worker'
import { validateIncrementalRuntimeComposition } from '../../src/update/runtime-composition'

const core = coreRuntimeComposition(), jm = { formatVersion: 1 as const, sourceRuntimes: ['jm' as const] }
const jmFiles = ['runtime/jm/bin/java.exe', 'runtime/jm/lib/pica-jm-source.jar', 'runtime/jm/PICA_JM_RUNTIME.json']
const directories: string[] = []
function temporary() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-composition-'))
    directories.push(root)
    return root
}
function stage(root = temporary()) {
    fs.mkdirSync(path.join(root, 'app'), { recursive: true })
    fs.mkdirSync(path.join(root, 'runtime'), { recursive: true })
    fs.writeFileSync(path.join(root, 'app/desktop.js'), '// synthetic, never executed')
    fs.writeFileSync(path.join(root, 'app/module-contracts.json'), '{}')
    return root
}
function checkout() {
    const root = temporary(), runtime = path.join(root, 'runtime/jm')
    fs.mkdirSync(path.join(runtime, 'bin'), { recursive: true })
    fs.mkdirSync(path.join(runtime, 'lib'), { recursive: true })
    fs.writeFileSync(path.join(runtime, 'bin/java.exe'), 'synthetic executable, never run')
    const jar = Buffer.from('synthetic Jar, never executed')
    fs.writeFileSync(path.join(runtime, 'lib/pica-jm-source.jar'), jar)
    fs.writeFileSync(path.join(runtime, 'PICA_JM_RUNTIME.json'), JSON.stringify({ sdkVersion: 'v1.1.12', userDataIncluded: false, statusProbe: 'PASS', jarSha256: createHash('sha256').update(jar).digest('hex') }))
    return root
}
afterEach(() => { vi.restoreAllMocks(); for (const root of directories.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

describe('actual optional runtime composition, never source-enable permission', () => {
    it('is runtime-neutral and has no filesystem, source, app or network dependency', async () => {
        const result = await build({ entryPoints: ['src/modules/runtime-composition.ts'], bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, logLevel: 'silent' })
        expect(Object.keys(result.metafile!.inputs)).toEqual(['src/modules/runtime-composition.ts'])
        const copy = normalizeRuntimeComposition(jm)
        copy.sourceRuntimes.length = 0
        expect(jm.sourceRuntimes).toEqual(['jm'])
        expect(sameRuntimeComposition(parseRuntimeComposition(JSON.stringify(core)), core)).toBe(true)
    })
    it.each([null, [], {}, { formatVersion: 2, sourceRuntimes: [] }, { formatVersion: 1, sourceRuntimes: ['java'] }, { formatVersion: 1, sourceRuntimes: ['jm', 'jm'] }, { ...core, enabled: true }, { ...core, entryPoint: 'evil.jar' }])('rejects unknown or executable declarations: %j', value => {
        expect(() => normalizeRuntimeComposition(value)).toThrow()
    })
    it('rejects malformed and oversized descriptors', () => {
        expect(() => parseRuntimeComposition('{')).toThrow(/valid JSON/)
        expect(() => parseRuntimeComposition(' '.repeat(4097))).toThrow(/size/)
    })
    it('binds declarations to actual files, preserves full legacy inference, and rejects partial/hidden runtimes', () => {
        expect(compositionFromPayload(['runtime/node.exe'])).toEqual(core)
        expect(compositionFromPayload(jmFiles)).toEqual(jm)
        expect(compositionFromPayload([RUNTIME_COMPOSITION_PATH], JSON.stringify(core))).toEqual(core)
        expect(compositionFromPayload([RUNTIME_COMPOSITION_PATH, ...jmFiles], JSON.stringify(jm))).toEqual(jm)
        expect(() => compositionFromPayload([RUNTIME_COMPOSITION_PATH, ...jmFiles], JSON.stringify(core))).toThrow(/actual/)
        expect(() => compositionFromPayload([RUNTIME_COMPOSITION_PATH], JSON.stringify(jm))).toThrow(/actual/)
        expect(() => compositionFromPayload(jmFiles.slice(1))).toThrow(/Incomplete/)
        expect(() => compositionFromPayload([RUNTIME_COMPOSITION_PATH])).toThrow(/mismatch/)
        expect(() => compositionFromPayload([], JSON.stringify(core))).toThrow(/mismatch/)
        expect(() => compositionFromPayload(['app/RUNTIME-COMPOSITION.json'], JSON.stringify(core))).toThrow(/canonical/)
        expect(() => compositionFromPayload(['runtime/JM/bin/java.exe'])).toThrow(/canonical/)
    })
    it('stages core without touching an available or corrupt checkout JVM', async () => {
        const source = checkout(), target = stage()
        fs.writeFileSync(path.join(source, 'runtime/jm/PICA_JM_RUNTIME.json'), 'deliberately malformed unused component')
        expect(stageSourceRuntime(target, source, core)).toEqual({ composition: core, copiedRuntimeFiles: 0, javaStarted: false })
        expect(fs.existsSync(path.join(target, 'runtime/jm'))).toBe(false)
        expect(installedRuntimeComposition(target)).toEqual({ status: 'declared', composition: core })
        const worker = new JmWorkerTransport(target)
        expect(worker.available).toBe(false)
        await expect(worker.request('status')).rejects.toThrow(/普通本地阅读不受影响/)
        expect(() => stageSourceRuntime(target, source, core)).toThrow(/overwrite/)
    })
    it('copies the explicit valid component and descriptor without executing any source program', () => {
        const source = checkout(), target = stage()
        expect(stageSourceRuntime(target, source, jm)).toMatchObject({ composition: jm, copiedRuntimeFiles: 3, javaStarted: false })
        expect(installedRuntimeComposition(target)).toEqual({ status: 'declared', composition: jm })
        expect(new JmWorkerTransport(target).available).toBe(true)
        expect(fs.readFileSync(path.join(target, 'runtime/jm/lib/pica-jm-source.jar'))).toEqual(fs.readFileSync(path.join(source, 'runtime/jm/lib/pica-jm-source.jar')))
    })
    it('refuses private state in a runtime input and a non-file application marker', () => {
        const source = checkout(), target = stage()
        fs.writeFileSync(path.join(source, 'runtime/jm/credentials.dat'), 'synthetic, not a real credential')
        expect(() => stageSourceRuntime(target, source, jm)).toThrow(/Profile data/)
        expect(fs.existsSync(path.join(target, 'runtime/jm'))).toBe(false)
        const bad = stage()
        fs.unlinkSync(path.join(bad, 'app/module-contracts.json'))
        fs.mkdirSync(path.join(bad, 'app/module-contracts.json'))
        expect(() => stageSourceRuntime(bad, source, core)).toThrow(/non-linked application/)
    })
    it('rejects a tampered component, incomplete legacy tree and corrupt declaration without mutating profile data', () => {
        const source = checkout(), target = stage()
        fs.appendFileSync(path.join(source, 'runtime/jm/lib/pica-jm-source.jar'), 'tampered')
        expect(() => stageSourceRuntime(target, source, jm)).toThrow(/integrity/)
        expect(fs.existsSync(path.join(target, RUNTIME_COMPOSITION_PATH))).toBe(false)
        fs.mkdirSync(path.join(target, 'runtime/jm'))
        expect(installedRuntimeComposition(target).status).toBe('invalid')
        const clean = stage()
        fs.writeFileSync(path.join(clean, RUNTIME_COMPOSITION_PATH), '{')
        expect(installedRuntimeComposition(clean).status).toBe('invalid')
        expect(new JmWorkerTransport(clean).available).toBe(false)
    })
    it('never borrows cwd source components for a selected packaged core', () => {
        const coreRoot = stage(), source = checkout()
        fs.writeFileSync(path.join(coreRoot, 'SOURCE_SHA.txt'), '1'.repeat(40))
        expect(selectJmApplicationRoot([coreRoot, source])).toBe(coreRoot)
        expect(new JmWorkerTransport(coreRoot).available).toBe(false)
    })
    it('rejects symlinked application metadata paths rather than following an unrelated directory', () => {
        const source = stage(), target = temporary()
        fs.symlinkSync(path.join(source, 'app'), path.join(target, 'app'), process.platform === 'win32' ? 'junction' : 'dir')
        expect(installedRuntimeComposition(target).status).toBe('invalid')
    })
    it('does not misclassify a missing root or unreadable optional descriptor as a legacy core', () => {
        const target = stage(), original = fs.lstatSync
        expect(installedRuntimeComposition(path.join(target, 'missing')).status).toBe('invalid')
        vi.spyOn(fs, 'lstatSync').mockImplementation(((file: fs.PathLike, ...args: unknown[]) => {
            if (String(file) === path.join(target, RUNTIME_COMPOSITION_PATH)) throw Object.assign(Error('synthetic access denied'), { code: 'EACCES' })
            return Reflect.apply(original, fs, [file, ...args])
        }) as typeof fs.lstatSync)
        expect(installedRuntimeComposition(target).status).toBe('invalid')
        expect(new JmWorkerTransport(target).available).toBe(false)
    })
    it('rechecks declared incremental composition, including legacy, canonical paths and late payload changes', () => {
        const base = { current: core, files: [] as string[], deletions: [] as string[] }
        expect(() => validateIncrementalRuntimeComposition(base)).not.toThrow()
        expect(() => validateIncrementalRuntimeComposition({ ...base, target: core })).not.toThrow()
        expect(() => validateIncrementalRuntimeComposition({ ...base, files: [RUNTIME_COMPOSITION_PATH], target: core, descriptor: JSON.stringify(core) })).not.toThrow()
        expect(() => validateIncrementalRuntimeComposition({ ...base, target: jm })).toThrow(/complete application/)
        expect(() => validateIncrementalRuntimeComposition({ ...base, files: [RUNTIME_COMPOSITION_PATH], descriptor: JSON.stringify(core) })).toThrow(/not declared/)
        expect(() => validateIncrementalRuntimeComposition({ ...base, files: [RUNTIME_COMPOSITION_PATH], target: core, descriptor: JSON.stringify(jm) })).toThrow(/payload/)
        expect(() => validateIncrementalRuntimeComposition({ ...base, deletions: [RUNTIME_COMPOSITION_PATH] })).toThrow(/cannot be removed/)
        expect(() => validateIncrementalRuntimeComposition({ ...base, files: ['app/RUNTIME-COMPOSITION.json'], descriptor: JSON.stringify(core) })).toThrow(/canonical/)
    })
    it.runIf(process.platform === 'win32')('uses the actual Windows PowerShell build choice and keeps the old core archive name', () => {
        const script = path.resolve('scripts/lib/source-runtime-build.ps1').replaceAll("'", "''")
        const command = `. '${script}'; @(@{ mode=(Resolve-PicaSourceRuntimeMode); name=(Get-PicaWindowsPackageStem -Version '0.5.0') }, @{ mode=(Resolve-PicaSourceRuntimeMode -RequireJm '1'); name=(Get-PicaWindowsPackageStem -Version '0.5.0' -SourceRuntimes 'jm') }, @{ mode=(Resolve-PicaSourceRuntimeMode -Requested 'core' -RequireJm '0') }, @{ name=(Get-PicaWindowsPackageStem -Version '0.2.0-dev.0') }, @{ name=(Get-PicaWindowsPackageStem -Version '0.2.0-dev.1' -SourceRuntimes 'jm') }, @{ name=(Get-PicaWindowsPackageStem -Version '9.87.65') }) | ConvertTo-Json -Compress`
        const result = spawnSync(process.platform === 'win32' ? 'powershell.exe' : 'pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 10000 })
        expect(result.status, result.stderr).toBe(0)
        const rows = JSON.parse(result.stdout)
        expect(rows).toEqual([{ mode: 'core', name: 'Pica-Library-v0.5.0-windows-x64' }, { mode: 'jm', name: 'Pica-Library-v0.5.0-with-jm-windows-x64' }, { mode: 'core' }, { name: 'Pica-Library-v0.2.0-dev.0-update-base-windows-x64' }, { name: 'Pica-Library-v0.2.0-dev.1-local-test-with-jm-windows-x64' }, { name: 'Pica-Library-v9.87.65-windows-x64' }])
        const rejected = spawnSync(process.platform === 'win32' ? 'powershell.exe' : 'pwsh', ['-NoProfile', '-NonInteractive', '-Command', `. '${script}'; Resolve-PicaSourceRuntimeMode -Requested core -RequireJm 1`], { encoding: 'utf8', windowsHide: true, timeout: 10000 })
        expect(rejected.status).not.toBe(0)
    })
})
