import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UpdateManager } from '../../src/update/manager'
import { checkWindowsRuntimePackage } from '../../scripts/check-windows-runtime-package'
import { buildLocalUpdatePackage } from '../../scripts/build-local-update-package'
import { runIncrementalUpgrade } from '../../src/update/updater'
import { runFullApplicationUpgrade } from '../../src/update/full-upgrader'
import { classifyUpdateCompatibility } from '../../src/update/compatibility'
import { fullApplicationAssetName, selectReleaseUpdateAsset, targetScopedUpdateAssetName, updateAssetNamesForChecksums } from '../../src/update/release-assets'
import { RUNTIME_COMPOSITION_PATH, type RuntimeComposition } from '../../src/modules/runtime-composition'
import { APP_API_VERSION, DATABASE_SCHEMA_VERSION } from '../../src/app-capabilities'
import type { UpdateManifest } from '../../src/update/types'

const core: RuntimeComposition = { formatVersion: 1, sourceRuntimes: [] }, jm: RuntimeComposition = { formatVersion: 1, sourceRuntimes: ['jm'] }
const target = { platform: 'windows' as const, arch: 'x64' as const }
const sourceSha = '1'.repeat(40), targetSha = '2'.repeat(40)
const roots: string[] = []
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const component = { 'runtime/jm/bin/java.exe': 'synthetic, never executed', 'runtime/jm/lib/pica-jm-source.jar': 'synthetic, never executed', 'runtime/jm/PICA_JM_RUNTIME.json': '{}' }
function write(root: string, name: string, value: string | Buffer) { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), value) }
function fixture(composition = core, declared = true) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-composition-update-')); roots.push(root)
    const app = path.join(root, 'application'); fs.mkdirSync(app)
    write(app, 'SOURCE_SHA.txt', sourceSha)
    if (declared) write(app, RUNTIME_COMPOSITION_PATH, JSON.stringify(composition))
    if (composition.sourceRuntimes.includes('jm')) for (const [name, value] of Object.entries(component)) write(app, name, value)
    write(root, 'profile/config.json', JSON.stringify({ sourceChoices: ['synthetic-user-choice'], readerMode: 'double' }))
    const request = vi.fn()
    const manager = new UpdateManager({ currentVersion: '0.5.0', currentSourceSha: sourceSha, applicationRoot: app, stateRoot: path.join(root, 'state'), runtimePath: process.execPath, launcherPath: path.join(app, 'Pica Library.exe'), desktopEntryPath: path.join(app, 'app/desktop.js'), instanceFile: path.join(root, 'instance.json'), target, fetchImplementation: request as unknown as typeof fetch })
    return { root, app, manager, request }
}
function full(composition = core, extras: Record<string, string> = {}, declared = true) {
    const zip = new AdmZip()
    const payload = { 'Pica Library.exe': 'synthetic launcher', 'runtime/node.exe': 'synthetic node', 'app/desktop.js': 'synthetic app', 'app/updater.js': 'same synthetic helper', 'app/full-upgrader.js': 'same synthetic full helper', 'SOURCE_SHA.txt': targetSha, ...(declared ? { [RUNTIME_COMPOSITION_PATH]: JSON.stringify(composition) } : {}), ...(composition.sourceRuntimes.includes('jm') ? component : {}), ...extras }
    for (const [name, value] of Object.entries(payload)) zip.addFile(name, Buffer.from(value))
    return zip.toBuffer()
}
function release(request: ReturnType<typeof vi.fn>, name: string, bytes: Buffer) {
    request.mockResolvedValue(new Response(JSON.stringify({ tag_name: 'v0.5.1', draft: false, prerelease: false, assets: [{ name, digest: 'sha256:' + hash(bytes), browser_download_url: 'https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/' + name }] }), { status: 200 }))
}
function incremental(composition = core, descriptor = composition, extra: Partial<UpdateManifest> = {}) {
    const zip = new AdmZip(), payload: Record<string, Buffer> = { 'SOURCE_SHA.txt': Buffer.from(targetSha), [RUNTIME_COMPOSITION_PATH]: Buffer.from(JSON.stringify(descriptor)) }
    const manifest: UpdateManifest = { manifestVersion: 1, packageType: 'incremental', sourceVersionRange: '=0.5.0', sourceSha, targetVersion: '0.5.1', targetSourceSha: targetSha, targetPlatform: 'windows', targetArch: 'x64', appApiVersion: APP_API_VERSION, databaseSchemaVersion: DATABASE_SCHEMA_VERSION, requiresFullInstall: false, runtimeComposition: composition, files: Object.entries(payload).map(([path, value]) => ({ path, sha256: hash(value), size: value.length })), deletions: [], ...extra }
    for (const [name, value] of Object.entries(payload)) zip.addFile(name, value)
    zip.addFile('update-manifest.json', Buffer.from(JSON.stringify(manifest)))
    return { bytes: zip.toBuffer(), manifest }
}
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

describe('one application update preserves the installed optional runtime choice', () => {
    it.each([core, jm])('checks actual ZIP bytes and declared composition without extracting or executing them: %j', composition => {
        const f = fixture(composition), file = path.join(f.root, 'application.zip'), mode = composition.sourceRuntimes.length ? 'jm' : 'core'
        fs.writeFileSync(file, full(composition))
        expect(checkWindowsRuntimePackage(file, mode, targetSha)).toMatchObject({ composition, sourceRuntimeFiles: mode === 'jm' ? 3 : 0, applicationOrJavaExecuted: false })
        expect(() => checkWindowsRuntimePackage(file, mode === 'jm' ? 'core' : 'jm', targetSha)).toThrow(/composition/)
        expect(() => checkWindowsRuntimePackage(file, mode, sourceSha)).toThrow(/source SHA/)
    })
    it('actual ZIP inspection refuses undeclared runtimes, missing metadata and user media/private state', () => {
        const f = fixture(core), file = path.join(f.root, 'bad.zip')
        const invalidInputs: Record<string, string>[] = [{ 'runtime/other/bin/java.exe': 'never executed' }, { 'web/pages/book.cbz': 'never extracted' }, { 'runtime/jm/credentials.dat': 'synthetic, not a real credential' }]
        for (const extras of invalidInputs) {
            fs.writeFileSync(file, full(core, extras))
            expect(() => checkWindowsRuntimePackage(file, 'core', targetSha)).toThrow(/runtime|Private/)
        }
        fs.writeFileSync(file, full(core, {}, false))
        expect(() => checkWindowsRuntimePackage(file, 'core', targetSha)).toThrow(/Incomplete/)
    })
    it('keeps old full-package names for core and never falls from JM into a core/generic delta', () => {
        expect(fullApplicationAssetName('0.5.1', target, core)).toBe('Pica-Library-v0.5.1-windows-x64.zip')
        expect(fullApplicationAssetName('0.5.1', target, jm)).toBe('Pica-Library-v0.5.1-with-jm-windows-x64.zip')
        const generic = { name: 'Pica-Library-v0.5.1-update.zip', browser_download_url: 'synthetic-generic' }
        const scoped = { name: targetScopedUpdateAssetName('0.5.1', '0.5.0', target, core), browser_download_url: 'synthetic-core' }
        expect(selectReleaseUpdateAsset([generic, scoped], '0.5.1', '0.5.0', target, jm)).toBeNull()
        const optional = { name: targetScopedUpdateAssetName('0.5.1', '0.5.0', target, jm), browser_download_url: 'synthetic-with-jm' }
        expect(selectReleaseUpdateAsset([generic, scoped, optional], '0.5.1', '0.5.0', target, jm)?.url).toBe('synthetic-with-jm')
        expect(updateAssetNamesForChecksums('0.5.1', '0.5.0', target, jm)).toEqual([optional.name])
        expect(selectReleaseUpdateAsset([generic], '0.5.1', '0.5.0', target, core)?.url).toBe('synthetic-generic')
    })
    it.each([core, jm])('actual manager discovers the correct same-composition complete application: %j', async composition => {
        const f = fixture(composition)
        const names = [core, jm].map(value => fullApplicationAssetName('0.5.1', target, value))
        f.request.mockResolvedValue(new Response(JSON.stringify({ tag_name: 'v0.5.1', assets: names.map(name => ({ name, browser_download_url: 'https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/' + name })) })))
        expect(await f.manager.checkForUpdate()).toMatchObject({ status: 'full-install', oneClick: true, assetName: fullApplicationAssetName('0.5.1', target, composition) })
        expect(JSON.parse(fs.readFileSync(path.join(f.root, 'profile/config.json'), 'utf8')).sourceChoices).toEqual(['synthetic-user-choice'])
    })
    it('retains legacy JM detection, and declines one-click when only an incompatible core asset exists', async () => {
        const f = fixture(jm, false), bytes = full(core), name = fullApplicationAssetName('0.5.1', target, core)
        release(f.request, name, bytes)
        const available = await f.manager.checkForUpdate()
        expect(available).toMatchObject({ status: 'full-install', version: '0.5.1' })
        expect(available).not.toHaveProperty('oneClick')
        expect(available).not.toHaveProperty('assetName')
    })
    it('does not turn unreadable/invalid composition into a core update or a network outage', async () => {
        const f = fixture(jm)
        write(f.app, RUNTIME_COMPOSITION_PATH, '{')
        await expect(f.manager.checkForUpdate()).rejects.toThrow(/Installed runtime composition is invalid/)
        expect(f.request).not.toHaveBeenCalled()
    })
    it.each([core, jm])('actual full staging accepts only same-composition verified payloads: %j', async composition => {
        const f = fixture(composition), bytes = full(composition), name = fullApplicationAssetName('0.5.1', target, composition)
        release(f.request, name, bytes)
        expect(await f.manager.stageFullApplication('0.5.1', name, bytes)).toMatchObject({ mode: 'full-application', oneClick: true, targetSourceSha: targetSha })
        expect(fs.readFileSync(path.join(f.app, 'SOURCE_SHA.txt'), 'utf8')).toBe(sourceSha)
    })
    it.each([[core, jm], [jm, core]] as const)('does not add or remove optional components by automatic full update: %j -> %j', async (current, next) => {
        const f = fixture(current), bytes = full(next), name = fullApplicationAssetName('0.5.1', target, current)
        release(f.request, name, bytes)
        await expect(f.manager.stageFullApplication('0.5.1', name, bytes)).rejects.toThrow(/cannot add or remove/)
        expect(fs.readdirSync(path.join(f.root, 'state'))).toEqual(['update-progress.json'])
    })
    it('rejects hidden runtimes and noncanonical descriptors even with a matching synthetic official digest', async () => {
        const invalidPayloads: Record<string, string>[] = [component, { [RUNTIME_COMPOSITION_PATH]: JSON.stringify(jm) }, { 'app/RUNTIME-COMPOSITION.json': JSON.stringify(core) }]
        for (const extras of invalidPayloads) {
            const f = fixture(core), bytes = full(core, extras), name = fullApplicationAssetName('0.5.1', target, core)
            release(f.request, name, bytes)
            await expect(f.manager.stageFullApplication('0.5.1', name, bytes)).rejects.toThrow(/runtime|composition|canonical|Duplicate/i)
            expect(fs.readdirSync(path.join(f.root, 'state'))).toEqual(['update-progress.json'])
        }
    })
    it('stages unchanged composition metadata but rejects semantic drift and undeclared descriptor files', async () => {
        const f = fixture(jm), update = incremental(jm), name = targetScopedUpdateAssetName('0.5.1', '0.5.0', target, jm)
        release(f.request, name, update.bytes)
        const staged = await f.manager.stage(name, update.bytes)
        expect(JSON.parse(fs.readFileSync(path.join(f.root, 'state', 'staged-' + staged.id, 'update-manifest.json'), 'utf8')).runtimeComposition).toEqual(jm)
        for (const [manifestComposition, descriptor, overrides] of [[core, core, {}], [jm, core, {}], [jm, jm, { runtimeComposition: undefined }]] as const) {
            const g = fixture(jm), invalid = incremental(manifestComposition, descriptor, overrides)
            release(g.request, name, invalid.bytes)
            await expect(g.manager.stage(name, invalid.bytes)).rejects.toThrow(/composition|compatibility|not declared/i)
        }
    })
    it('rechecks changed staged or installed composition before preparing a full-upgrade helper', async () => {
        for (const changedSide of ['staged', 'installed'] as const) {
            const f = fixture(core), bytes = full(core), name = fullApplicationAssetName('0.5.1', target, core)
            release(f.request, name, bytes)
            const staged = await f.manager.stageFullApplication('0.5.1', name, bytes)
            const changedRoot = changedSide === 'staged' ? path.join(f.root, 'state', 'full-staged-' + staged.id, 'application') : f.app
            write(changedRoot, RUNTIME_COMPOSITION_PATH, JSON.stringify(jm))
            for (const [file, value] of Object.entries(component)) write(changedRoot, file, value)
            expect(() => f.manager.apply(staged.id, { desktopHomeRoot: path.join(f.root, 'profile'), libraryDirectory: path.join(f.root, 'profile/data') })).toThrow(/cannot add or remove/)
            expect(fs.existsSync(path.join(f.root, 'upgrade-assistant'))).toBe(false)
            expect(fs.readFileSync(path.join(f.app, 'SOURCE_SHA.txt'), 'utf8')).toBe(sourceSha)
        }
    })
    it.runIf(process.platform === 'win32')('actual full helper refuses changed components before acknowledgement, snapshot or replacement', async () => {
        const f = fixture(core), staging = path.join(f.root, 'full-stage'), bootstrap = path.join(f.root, 'bootstrap'), previousCwd = process.cwd()
        fs.mkdirSync(bootstrap)
        for (const entry of new AdmZip(full(jm)).getEntries()) if (!entry.isDirectory) write(staging, entry.entryName, entry.getData())
        try {
            await expect(runFullApplicationUpgrade({ applicationRoot: f.app, stagedApplicationRoot: staging, backupRoot: path.join(f.root, 'backup'), bootstrapRoot: bootstrap, desktopHomeRoot: path.join(f.root, 'profile'), libraryDirectory: path.join(f.root, 'profile/data'), readyNonce: 'unused-before-preflight', readyFile: path.join(f.root, 'ready.json'), parentPid: 1, instanceFile: path.join(f.root, 'profile/instance.json'), progressFile: path.join(f.root, 'profile/progress.json'), targetVersion: '0.5.1', targetSourceSha: targetSha, runtimeComposition: core, healthTimeoutMs: 1 })).rejects.toThrow(/cannot add or remove/)
        } finally { process.chdir(previousCwd) }
        expect(fs.existsSync(path.join(f.root, 'backup'))).toBe(false)
        expect(fs.existsSync(path.join(f.root, 'ready.json'))).toBe(false)
        expect(fs.readdirSync(path.join(f.root, 'profile'))).toEqual(['config.json'])
        expect(fs.readFileSync(path.join(f.app, 'SOURCE_SHA.txt'), 'utf8')).toBe(sourceSha)
    })
    it('the actual detached helper rejects a composition change before startup acknowledgement or file mutation', async () => {
        const f = fixture(core), update = incremental(jm), staging = path.join(f.root, 'staging'), backup = path.join(f.root, 'backup')
        for (const entry of new AdmZip(update.bytes).getEntries()) if (!entry.isDirectory) write(staging, entry.entryName, entry.getData())
        await expect(runIncrementalUpgrade({ applicationRoot: f.app, stagingRoot: staging, backupRoot: backup, desktopHomeRoot: path.join(f.root, 'profile'), libraryDirectory: path.join(f.root, 'profile/data'), readyNonce: 'unused-before-preflight', readyFile: path.join(f.root, 'ready.json'), parentPid: 1, runtimePath: path.join(f.app, 'runtime/node.exe'), launcherPath: path.join(f.app, 'Pica Library.exe'), desktopEntryPath: path.join(f.app, 'app/desktop.js'), instanceFile: path.join(f.root, 'profile/instance.json'), progressFile: path.join(f.root, 'profile/progress.json'), healthTimeoutMs: 1, manifest: update.manifest })).rejects.toThrow(/optional source runtimes/)
        expect(fs.existsSync(backup)).toBe(false)
        expect(fs.existsSync(path.join(f.root, 'ready.json'))).toBe(false)
        expect(fs.readFileSync(path.join(f.app, 'SOURCE_SHA.txt'), 'utf8')).toBe(sourceSha)
    })
    it('actual delta builder binds descriptors, refuses composition switches/removal, and never includes Java', () => {
        const f = fixture(core)
        const old = path.join(f.root, 'Pica-Library-v0.5.0-windows-x64.zip'), next = path.join(f.root, 'Pica-Library-v0.5.1-windows-x64.zip'), output = path.join(f.root, 'delta.zip')
        const baseline = new AdmZip(full(core, {}, false)); baseline.updateFile('SOURCE_SHA.txt', Buffer.from(sourceSha)); baseline.updateFile('app/desktop.js', Buffer.from('old synthetic app')); baseline.writeZip(old)
        fs.writeFileSync(next, full(core))
        expect(buildLocalUpdatePackage(old, next, output).manifest.runtimeComposition).toEqual(core)
        expect(new AdmZip(output).getEntries().some(entry => entry.entryName.startsWith('runtime/'))).toBe(false)
        const wrong = path.join(f.root, 'Pica-Library-v0.5.2-with-jm-windows-x64.zip'); fs.writeFileSync(wrong, full(jm))
        expect(() => buildLocalUpdatePackage(next, wrong, path.join(f.root, 'bad.zip'))).toThrow(/composition changed/)
        const removed = path.join(f.root, 'Pica-Library-v0.5.2-windows-x64.zip'); fs.writeFileSync(removed, full(core, {}, false))
        expect(() => buildLocalUpdatePackage(next, removed, path.join(f.root, 'removed.zip'))).toThrow(/Removing runtime composition/)
    })
    it('classifies changed source runtimes as a complete application while preserving schema downgrade rejection', () => {
        const input = { currentAppApiVersion: 2, targetAppApiVersion: 2, currentDatabaseSchemaVersion: 14, targetDatabaseSchemaVersion: 14, currentRuntimeComposition: core, targetRuntimeComposition: jm }
        expect(classifyUpdateCompatibility(input)).toEqual({ kind: 'FULL_APPLICATION', reason: 'RUNTIME_COMPOSITION_CHANGED' })
        expect(classifyUpdateCompatibility({ ...input, targetDatabaseSchemaVersion: 13 })).toEqual({ kind: 'UNSUPPORTED', reason: 'SCHEMA_DOWNGRADE' })
    })
})
