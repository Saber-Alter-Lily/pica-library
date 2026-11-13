import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import type { ChildProcess } from 'node:child_process'
import AdmZip from 'adm-zip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handoffLegacyTransition } from '../../src/update/legacy-transition-coordinator'
import { assertLegacyApplicationStopped } from '../../src/update/legacy-transition-guard'
import { inspectLegacyTransition, type LegacyTransitionAuthority } from '../../src/update/legacy-transition-preflight'
import { compileLegacyTransitionBundle, deriveLegacyTransitionAuthority, buildLegacyTransitionAssistant } from '../../scripts/build-legacy-transition-assistant'
import { buildUpgradeAssistant } from '../../scripts/build-upgrade-assistant'
import { runFullApplicationUpgrade } from '../../src/update/full-upgrader'
import { acquireLegacyTransitionLock, legacyTransitionLock, releaseLegacyTransitionLock } from '../../src/update/legacy-transition-lock'
import * as startup from '../../src/update/helper-startup'
import * as lifecycle from '../../src/update/process-lifecycle'
import type { FullApplicationUpdaterInstruction } from '../../src/update/types'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawnSync: query }))
const roots: string[] = [], repo = path.resolve(import.meta.dirname, '../..')
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
function fixture() {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pica-legacy-handoff-')))
    roots.push(root)
    const app = path.join(root, 'old-program'), tool = path.join(root, 'tool'), local = path.join(root, 'localappdata'),
        home = path.join(local, 'Pica Library'), library = path.join(root, 'library'), work = path.join(root, 'work')
    const oldZip = new AdmZip(), target = new AdmZip(), oldSource = 'bec7f9f31828e8c57e0a2c103b6b1206c22c37cf', source = 'a'.repeat(40)
    const files = ['SOURCE_SHA.txt', 'Pica Library.exe', 'runtime/node.exe', 'app/desktop.js', 'app/updater.js', 'app/full-upgrader.js']
    for (const name of files) {
        const oldBytes = Buffer.from(name === 'SOURCE_SHA.txt' ? oldSource + '\n' : 'inert old ' + name)
        oldZip.addFile(name, oldBytes)
        const file = path.join(app, name)
        fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, oldBytes)
        target.addFile(name, Buffer.from(name === 'SOURCE_SHA.txt' ? source + '\n' : 'inert modern ' + name))
    }
    target.addFile('app/runtime-composition.json', Buffer.from('{"formatVersion":1,"sourceRuntimes":[]}'))
    const zipMetadata = JSON.parse(fs.readFileSync(createRequire(import.meta.url).resolve('adm-zip/package.json'), 'utf8')) as { name: string; version: string }
    target.addFile('licenses/Node.js-LICENSE.txt', Buffer.from('Synthetic runtime notice fixture, NOT a distributable Node runtime'))
    target.addFile('licenses/THIRD_PARTY_LICENSES.txt', Buffer.from('Synthetic notice fixture, NOT actual legal evidence\n' + zipMetadata.name + '@' + zipMetadata.version + '\n'))
    const zipFile = path.join(root, 'Pica-Library-v0.5.1-windows-x64.zip')
    target.writeZip(zipFile)
    for (const name of ['SOURCE_SHA.txt', 'runtime/node.exe', 'app/full-upgrader.js']) {
        const file = path.join(tool, name)
        fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, target.readFile(name)!)
    }
    fs.mkdirSync(path.join(home, 'config'), { recursive: true })
    fs.mkdirSync(path.join(library, 'library'), { recursive: true })
    fs.writeFileSync(path.join(home, 'config/config.json'), JSON.stringify({ libraryDirectory: library, privateFixture: 'do-not-print-private-fixture' }))
    fs.writeFileSync(path.join(library, 'library.db'), 'inert DB before update')
    fs.writeFileSync(path.join(library, 'library/keep.bin'), 'inert body not to be read')
    const authority = deriveLegacyTransitionAuthority(oldZip.toBuffer(), { expectedSourceArchiveSha256: sha(oldZip.toBuffer()),
        target: { version: '0.5.1', sourceSha: source, archiveName: path.basename(zipFile), archiveSha256: sha(fs.readFileSync(zipFile)),
            channel: 'stable', provenanceUrl: 'https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/' + path.basename(zipFile) } })
    const context = { authority: authority as LegacyTransitionAuthority | null, toolRoot: tool, localAppData: local, platform: 'win32' }
    const selection = { applicationRoot: app, targetZip: zipFile, workRoot: work }
    const confirmation = { previewId: inspectLegacyTransition(selection, context).previewId, confirmed: true,
        canonicalPathsAccepted: true, runtimeCompositionAccepted: true }
    return { root, app, tool, local, home, library, work, oldZip, target, zipFile, authority, context, selection, confirmation }
}
type Fixture = ReturnType<typeof fixture>
function refresh(f: Fixture) {
    f.target.writeZip(f.zipFile)
    f.authority.target.archiveSha256 = sha(fs.readFileSync(f.zipFile))
    f.confirmation.previewId = inspectLegacyTransition(f.selection, f.context).previewId
}
function original(f: Fixture) {
    expect(fs.readFileSync(path.join(f.app, 'Pica Library.exe'), 'utf8')).toBe('inert old Pica Library.exe')
    expect(fs.readFileSync(path.join(f.library, 'library.db'), 'utf8')).toBe('inert DB before update')
    expect(fs.readFileSync(path.join(f.library, 'library/keep.bin'), 'utf8')).toBe('inert body not to be read')
    expect(fs.readFileSync(path.join(f.home, 'config/config.json'), 'utf8')).toContain('do-not-print-private-fixture')
}
function absentProcesses() { query.mockReturnValue({ status: 0, signal: null, stdout: '[]' }) }
beforeEach(() => {
    query.mockReset(); absentProcesses()
    vi.stubGlobal('process', { ...process, platform: 'win32', chdir: vi.fn(), kill: vi.fn(() => { throw Error('No process control allowed') }) })
    vi.spyOn(startup, 'startUpgradeHelper').mockResolvedValue({ pid: 8765432 } as ChildProcess)
})
afterEach(() => {
    vi.restoreAllMocks(); vi.unstubAllGlobals()
    for (const root of roots.splice(0)) {
        if (!path.basename(root).startsWith('pica-legacy-handoff-')) throw Error('Fixture cleanup scope invalid')
        fs.rmSync(root, { recursive: true, force: true })
    }
})

describe('build-bound first transition coordinator with inert process ports', () => {
    it('prepares target-matched independent helper and delegates without replacing app/profile', async () => {
        const f = fixture(), read = vi.spyOn(fs, 'readFileSync')
        const result = await handoffLegacyTransition(f.selection, f.context, f.confirmation)
        expect(result.status).toBe('HELPER_ACCEPTED_PARENT_MUST_EXIT')
        const call = vi.mocked(startup.startUpgradeHelper).mock.calls[0], input = call[3] as FullApplicationUpdaterInstruction
        expect(call[0]).toBe(path.join(input.bootstrapRoot, 'node.exe'))
        expect(call[1]).toEqual([path.join(input.bootstrapRoot, 'full-upgrader.js'), result.instructionFile])
        expect(call[4]).toBe('full-application')
        expect(input.parentPid).toBe(process.pid)
        expect(input.readyFile).toContain(input.readyNonce)
        expect(input.legacyTransition?.installedTreeSha256).toMatch(/^[a-f0-9]{64}$/)
        expect(input.desktopHomeRoot).toBe(f.home); expect(input.libraryDirectory).toBe(f.library)
        expect(fs.readFileSync(call[0], 'utf8')).toBe('inert modern runtime/node.exe')
        expect(fs.readFileSync(call[1][0], 'utf8')).toBe('inert modern app/full-upgrader.js')
        expect(fs.readFileSync(path.join(input.stagedApplicationRoot, 'SOURCE_SHA.txt'), 'utf8').trim()).toBe(f.authority.target.sourceSha)
        expect(read.mock.calls.some(([file]) => String(file) === path.join(f.library, 'library.db'))).toBe(false)
        expect(read.mock.calls.some(([file]) => String(file).endsWith('keep.bin'))).toBe(false)
        expect(fs.existsSync(input.backupRoot)).toBe(false)
        original(f)
        expect(process.kill).not.toHaveBeenCalled()
    })
    it.each(['cancel', 'stale-preview', 'unbound', 'unpublished'])('refuses %s before staging/process queries', async mode => {
        const f = fixture()
        if (mode === 'cancel') f.confirmation.confirmed = false
        if (mode === 'stale-preview') f.confirmation.previewId = '0'.repeat(64)
        if (mode === 'unbound') f.context.authority = null
        if (mode === 'unpublished') {
            f.authority.target.channel = 'unpublished-review'
            f.authority.target.provenanceUrl = 'https://github.com/Saber-Alter-Lily/pica-library/actions/runs/123/artifacts/456'
            f.confirmation.previewId = inspectLegacyTransition(f.selection, f.context).previewId
        }
        await expect(handoffLegacyTransition(f.selection, f.context, f.confirmation)).rejects.toThrow()
        expect(query).not.toHaveBeenCalled(); expect(startup.startUpgradeHelper).not.toHaveBeenCalled()
        expect(fs.existsSync(f.work)).toBe(false); original(f)
    })
    it('refuses a still-running selected application, without trusting or killing an instance PID', async () => {
        const f = fixture()
        query.mockReturnValue({ status: 0, signal: null, stdout: JSON.stringify([{ ProcessId: 12345, ExecutablePath: path.join(f.app, 'runtime/node.exe') }]) })
        await expect(handoffLegacyTransition(f.selection, f.context, f.confirmation)).rejects.toThrow('CLOSE_SELECTED_LEGACY_APPLICATION_FIRST')
        expect(fs.existsSync(f.work)).toBe(false); expect(startup.startUpgradeHelper).not.toHaveBeenCalled()
        expect(process.kill).not.toHaveBeenCalled(); original(f)
    })
    it.each([
        { status: 1, stdout: '' }, { status: 0, stdout: 'not-json' },
        { status: 0, stdout: '[{"ProcessId":999,"ExecutablePath":null}]' },
        { status: 0, stdout: '[{"ProcessId":-1,"ExecutablePath":"C:\\unknown"}]' }
    ])('unknown process ownership refuses instead of treating it as absence (%j)', async output => {
        const f = fixture(); query.mockReturnValue(output)
        await expect(handoffLegacyTransition(f.selection, f.context, f.confirmation)).rejects.toThrow(/LEGACY_PROCESS_/)
        expect(fs.existsSync(f.work)).toBe(false); expect(startup.startUpgradeHelper).not.toHaveBeenCalled(); original(f)
    })
    it('uses fixed, hidden, bounded CIM arguments and ignores proven other-install processes', () => {
        const f = fixture()
        query.mockReturnValue({ status: 0, stdout: JSON.stringify({ ProcessId: 9988, ExecutablePath: path.join(f.tool, 'runtime/node.exe') }) })
        assertLegacyApplicationStopped(f.app)
        expect(query.mock.calls[0][0]).toMatch(/powershell\.exe$/i)
        expect(query.mock.calls[0][1].join(' ')).not.toContain(f.app)
        expect(query.mock.calls[0][2]).toMatchObject({ windowsHide: true, timeout: 10_000 })
    })
    it('refuses an active selected-profile PID even when its executable is outside the selected app', async () => {
        const f = fixture(), state = path.join(f.home, 'runtime-state')
        fs.mkdirSync(state); fs.writeFileSync(path.join(state, 'instance.json'), '{"pid":9988,"url":"http://127.0.0.1:50000"}')
        query.mockReturnValue({ status: 0, stdout: JSON.stringify({ ProcessId: 9988, ExecutablePath: path.join(f.tool, 'runtime/node.exe') }) })
        await expect(handoffLegacyTransition(f.selection, f.context, f.confirmation)).rejects.toThrow('CLOSE_SELECTED_PROFILE_APPLICATION_FIRST')
        expect(query.mock.calls[0][1].join(' ')).toContain('OR ProcessId=9988')
        expect(process.kill).not.toHaveBeenCalled(); expect(fs.existsSync(f.work)).toBe(false); original(f)
    })
    it('malformed or hardlinked profile instance is not treated as a safely absent process', async () => {
        const f = fixture(), state = path.join(f.home, 'runtime-state'), instance = path.join(state, 'instance.json')
        fs.mkdirSync(state); fs.writeFileSync(instance, '{"secret":"do-not-print",')
        await expect(handoffLegacyTransition(f.selection, f.context, f.confirmation)).rejects.toThrow('LEGACY_PROFILE_INSTANCE_UNREADABLE')
        fs.writeFileSync(instance, '{"pid":56}'); fs.linkSync(instance, path.join(f.root, 'linked-instance.json'))
        await expect(handoffLegacyTransition(f.selection, f.context, f.confirmation)).rejects.toThrow('LEGACY_PROFILE_INSTANCE_UNREADABLE')
        expect(query).not.toHaveBeenCalled(); expect(fs.existsSync(f.work)).toBe(false)
    })
    it('failed exclusive write probe stops before staging or launching, without modifying profile files', async () => {
        const f = fixture(), write = fs.writeFileSync
        vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
            if (String(file).includes('.pica-transition-write-')) throw Object.assign(new Error('synthetic denied write'), { code: 'EACCES' })
            return write(file, ...args)
        })
        await expect(handoffLegacyTransition(f.selection, f.context, f.confirmation)).rejects.toThrow('LEGACY_WRITE_ACCESS_REQUIRED')
        expect(fs.existsSync(f.work)).toBe(false); expect(startup.startUpgradeHelper).not.toHaveBeenCalled(); original(f)
    })
    it('revalidates configuration/source after extraction and retains preparation rather than handing off stale facts', async () => {
        const f = fixture(), write = fs.writeFileSync
        vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
            const result = write(file, ...args)
            if (String(file).includes('preparing-transition-') && String(file).endsWith('full-upgrader.js'))
                write(path.join(f.home, 'config/config.json'), JSON.stringify({ libraryDirectory: f.library, changed: true }))
            return result
        })
        await expect(handoffLegacyTransition(f.selection, f.context, f.confirmation)).rejects.toThrow('LEGACY_TRANSITION_PREVIEW_CHANGED')
        expect(startup.startUpgradeHelper).not.toHaveBeenCalled()
        expect(fs.readdirSync(f.work)).toHaveLength(1)
        expect(fs.readFileSync(path.join(f.app, 'Pica Library.exe'), 'utf8')).toBe('inert old Pica Library.exe')
    })
    it('checks exit again after lengthy preparation before accepting a helper', async () => {
        const f = fixture()
        query.mockReturnValueOnce({ status: 0, stdout: '[]' }).mockReturnValue({ status: 0, stdout: JSON.stringify({ ProcessId: 56, ExecutablePath: path.join(f.app, 'Pica Library.exe') }) })
        await expect(handoffLegacyTransition(f.selection, f.context, f.confirmation)).rejects.toThrow('CLOSE_SELECTED_LEGACY_APPLICATION_FIRST')
        expect(startup.startUpgradeHelper).not.toHaveBeenCalled(); original(f)
    })
    it.each([false, true])('helper startup failure never launches/replaces old app, uncertain exit=%s', async uncertain => {
        const f = fixture()
        vi.mocked(startup.startUpgradeHelper).mockRejectedValue(uncertain ? new startup.UpgradeHelperStopError('synthetic ambiguous helper') : new Error('synthetic spawn EACCES'))
        const launch = vi.spyOn(lifecycle, 'launchApplication')
        await expect(handoffLegacyTransition(f.selection, f.context, f.confirmation)).rejects.toThrow(uncertain ? 'HELPER_EXIT_UNKNOWN_RECOVERY_RETAINED' : 'HELPER_NOT_ACCEPTED_INSTALLATION_UNCHANGED')
        expect(launch).not.toHaveBeenCalled(); expect(process.kill).not.toHaveBeenCalled(); original(f)
        const instruction = vi.mocked(startup.startUpgradeHelper).mock.calls[0][3] as FullApplicationUpdaterInstruction
        expect(fs.existsSync(instruction.legacyTransition!.lock.file)).toBe(uncertain)
    })
    it('requires explicit optional-runtime consent and emits the existing exact composition receipt', async () => {
        const f = fixture()
        f.target.addFile('app/runtime-composition.json', Buffer.from('{"formatVersion":1,"sourceRuntimes":["jm"]}'))
        for (const name of ['runtime/jm/bin/java.exe', 'runtime/jm/lib/pica-jm-source.jar', 'runtime/jm/PICA_JM_RUNTIME.json'])
            f.target.addFile(name, Buffer.from('inert runtime bytes, never executed'))
        f.zipFile = path.join(f.root, 'Pica-Library-v0.5.1-with-jm-windows-x64.zip')
        f.selection.targetZip = f.zipFile; f.authority.target.archiveName = path.basename(f.zipFile)
        f.authority.target.provenanceUrl = 'https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/' + path.basename(f.zipFile)
        refresh(f)
        f.confirmation.runtimeCompositionAccepted = false
        await expect(handoffLegacyTransition(f.selection, f.context, f.confirmation)).rejects.toThrow('EXPLICIT_RUNTIME_COMPONENT_CONSENT_REQUIRED')
        expect(fs.existsSync(f.work)).toBe(false)
        f.confirmation.runtimeCompositionAccepted = true
        await handoffLegacyTransition(f.selection, f.context, f.confirmation)
        expect((vi.mocked(startup.startUpgradeHelper).mock.calls[0][3] as FullApplicationUpdaterInstruction).runtimeChoice).toMatchObject({
            kind: 'user-selected-runtime-composition', from: { sourceRuntimes: [] }, to: { sourceRuntimes: ['jm'] },
            sourceVersion: '0.5.0', targetVersion: '0.5.1', archiveSha256: f.authority.target.archiveSha256
        })
    })
    it('refuses Windows case-alias payloads before writing staged files', async () => {
        const f = fixture(); f.target.addFile('runtime/Node.exe', Buffer.from('collision'))
        f.target.writeZip(f.zipFile); f.authority.target.archiveSha256 = sha(fs.readFileSync(f.zipFile))
        await expect(handoffLegacyTransition(f.selection, f.context, f.confirmation)).rejects.toThrow('TARGET_CASE_COLLISION')
        expect(fs.existsSync(f.work)).toBe(false)
    })
    it('also requires explicit component consent to REMOVE a historical bundled runtime', async () => {
        const f = fixture()
        for (const name of ['runtime/jm/bin/java.exe', 'runtime/jm/lib/pica-jm-source.jar', 'runtime/jm/PICA_JM_RUNTIME.json']) {
            const bytes = Buffer.from('inert historical component ' + name), file = path.join(f.app, name)
            fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes)
            f.authority.source.files[name] = sha(bytes)
        }
        f.confirmation.previewId = inspectLegacyTransition(f.selection, f.context).previewId
        f.confirmation.runtimeCompositionAccepted = false
        await expect(handoffLegacyTransition(f.selection, f.context, f.confirmation)).rejects.toThrow('EXPLICIT_RUNTIME_COMPONENT_CONSENT_REQUIRED')
        expect(fs.existsSync(f.work)).toBe(false)
        f.confirmation.runtimeCompositionAccepted = true
        await handoffLegacyTransition(f.selection, f.context, f.confirmation)
        expect((vi.mocked(startup.startUpgradeHelper).mock.calls[0][3] as FullApplicationUpdaterInstruction).runtimeChoice).toMatchObject({
            from: { sourceRuntimes: ['jm'] }, to: { sourceRuntimes: [] }
        })
    })
    it('different working/tool sessions cannot both own a transition for the same installation', async () => {
        const f = fixture()
        await handoffLegacyTransition(f.selection, f.context, f.confirmation)
        const secondSelection = { ...f.selection, workRoot: path.join(f.root, 'another-workspace') }
        const secondConfirmation = { ...f.confirmation, previewId: inspectLegacyTransition(secondSelection, f.context).previewId }
        await expect(handoffLegacyTransition(secondSelection, f.context, secondConfirmation)).rejects.toThrow('LEGACY_TRANSITION_ALREADY_IN_PROGRESS_OR_RECOVERY_PENDING')
        expect(startup.startUpgradeHelper).toHaveBeenCalledTimes(1); original(f)
    })
    it('cannot release/replace another nonce or an unknown pending recovery lock', () => {
        const f = fixture(), owner = legacyTransitionLock(f.app, '11111111-1111-1111-1111-111111111111'),
            other = legacyTransitionLock(f.app, '22222222-2222-2222-2222-222222222222')
        acquireLegacyTransitionLock(owner, f.app)
        const bytes = fs.readFileSync(owner.file)
        expect(() => acquireLegacyTransitionLock(other, f.app)).toThrow('LEGACY_TRANSITION_ALREADY_IN_PROGRESS_OR_RECOVERY_PENDING')
        expect(releaseLegacyTransitionLock(other, f.app)).toBe(false)
        expect(fs.readFileSync(owner.file)).toEqual(bytes)
        expect(releaseLegacyTransitionLock(owner, f.app)).toBe(true)
    })
})

describe('same full transaction engine after simulated accepted handoff (no real processes)', () => {
    async function prepared() {
        const f = fixture(), result = await handoffLegacyTransition(f.selection, f.context, f.confirmation)
        const input = JSON.parse(fs.readFileSync(result.instructionFile, 'utf8')) as FullApplicationUpdaterInstruction
        // Readiness is independently covered by actual helper-startup tests. This
        // layer exercises the unchanged transaction body, not separate OS processes.
        delete input.readyFile; delete input.readyNonce
        vi.spyOn(lifecycle, 'waitForExit').mockResolvedValue(undefined)
        vi.spyOn(lifecycle, 'launchApplication').mockResolvedValue({} as ChildProcess)
        vi.spyOn(lifecycle, 'health').mockResolvedValue({ ok: true, url: 'http://127.0.0.1:50123' })
        vi.spyOn(lifecycle, 'stopPublishedInstance').mockResolvedValue(true)
        return { f, input }
    }
    it('replaces only program bytes, checks target and preserves synthetic profile/database/downloads', async () => {
        const { f, input } = await prepared()
        await runFullApplicationUpgrade(input)
        expect(fs.readFileSync(path.join(f.app, 'SOURCE_SHA.txt'), 'utf8').trim()).toBe(f.authority.target.sourceSha)
        expect(fs.readFileSync(path.join(f.library, 'library.db'), 'utf8')).toBe('inert DB before update')
        expect(fs.readFileSync(path.join(f.library, 'library/keep.bin'), 'utf8')).toBe('inert body not to be read')
        expect(fs.readFileSync(path.join(f.home, 'config/config.json'), 'utf8')).toContain('do-not-print-private-fixture')
        expect(fs.existsSync(input.backupRoot)).toBe(false)
        expect(fs.existsSync(input.legacyTransition!.lock.file)).toBe(false)
    })
    it.each(['launch', 'health'])('existing engine recovers old program and profile after %s failure', async failure => {
        const { f, input } = await prepared()
        if (failure === 'launch') vi.mocked(lifecycle.launchApplication).mockRejectedValueOnce(new Error('synthetic EACCES'))
        else {
            vi.mocked(lifecycle.launchApplication).mockImplementationOnce(async () => {
                fs.writeFileSync(path.join(f.library, 'library.db'), 'synthetic candidate changed DB')
                fs.writeFileSync(path.join(f.home, 'config/config.json'), 'synthetic candidate changed config')
                return {} as ChildProcess
            })
            vi.mocked(lifecycle.health).mockResolvedValue({ ok: false, url: null })
        }
        await expect(runFullApplicationUpgrade(input)).rejects.toThrow()
        original(f)
        expect(lifecycle.launchApplication).toHaveBeenCalledTimes(2)
        expect(fs.existsSync(input.legacyTransition!.lock.file)).toBe(false)
    })
    it('refuses changed legacy tree after coordinator exit without snapshot, replacement or relaunch', async () => {
        const { f, input } = await prepared()
        fs.writeFileSync(path.join(f.app, 'app/desktop.js'), 'changed after confirmation')
        await expect(runFullApplicationUpgrade(input)).rejects.toThrow('LEGACY_TRANSITION_IDENTITY_CHANGED')
        expect(lifecycle.launchApplication).not.toHaveBeenCalled()
        expect(fs.existsSync(input.backupRoot)).toBe(false)
        expect(fs.existsSync(path.join(input.bootstrapRoot, 'user-state-snapshot'))).toBe(false)
    })
    it('unknown legacy process ownership after coordinator exit never restores DB or relaunches an app', async () => {
        const { f, input } = await prepared()
        query.mockReturnValue({ status: 0, stdout: '[{"ProcessId":45,"ExecutablePath":null}]' })
        await expect(runFullApplicationUpgrade(input)).rejects.toThrow('LEGACY_PROCESS_OWNERSHIP_UNKNOWN')
        expect(lifecycle.launchApplication).not.toHaveBeenCalled()
        expect(fs.existsSync(path.join(input.bootstrapRoot, 'user-state-snapshot'))).toBe(false); original(f)
    })
    it('profile config changed after coordinator exit refuses before snapshot or restoration', async () => {
        const { f, input } = await prepared()
        const config = path.join(f.home, 'config/config.json'), changed = JSON.stringify({ libraryDirectory: f.library, changedAfterHandoff: true })
        fs.writeFileSync(config, changed)
        await expect(runFullApplicationUpgrade(input)).rejects.toThrow('LEGACY_TRANSITION_IDENTITY_CHANGED')
        expect(fs.readFileSync(config, 'utf8')).toBe(changed)
        expect(lifecycle.launchApplication).not.toHaveBeenCalled()
        expect(fs.existsSync(path.join(input.bootstrapRoot, 'user-state-snapshot'))).toBe(false)
    })
    it('unproven replacement exit retains both recovery assets and exclusive ownership', async () => {
        const { input } = await prepared()
        vi.mocked(lifecycle.health).mockResolvedValue({ ok: false, url: null })
        vi.mocked(lifecycle.stopPublishedInstance).mockResolvedValue(false)
        await expect(runFullApplicationUpgrade(input)).rejects.toThrow('Replacement exit cannot be verified')
        expect(fs.existsSync(input.backupRoot)).toBe(true)
        expect(fs.existsSync(path.join(input.bootstrapRoot, 'user-state-snapshot/database/library.db'))).toBe(true)
        expect(fs.existsSync(input.legacyTransition!.lock.file)).toBe(true)
        expect(lifecycle.launchApplication).toHaveBeenCalledTimes(1)
    })
})

describe('trusted producer and actual bound offline distribution', () => {
    it('derives ALL old file hashes from pinned bytes; rejects bad hash/source/provenance', () => {
        const f = fixture(), bytes = f.oldZip.toBuffer()
        expect(Object.keys(f.authority.source.files)).toHaveLength(6)
        for (const entry of f.oldZip.getEntries()) expect(f.authority.source.files[entry.entryName]).toBe(sha(entry.getData()))
        expect(() => deriveLegacyTransitionAuthority(bytes, { expectedSourceArchiveSha256: '0'.repeat(64), target: f.authority.target })).toThrow('PINNED_LEGACY_ARCHIVE_HASH_MISMATCH')
        const other = new AdmZip(bytes); other.addFile('SOURCE_SHA.txt', Buffer.from('b'.repeat(40)))
        expect(() => deriveLegacyTransitionAuthority(other.toBuffer(), { expectedSourceArchiveSha256: sha(other.toBuffer()), target: f.authority.target })).toThrow('PINNED_LEGACY_SOURCE_MISMATCH')
        expect(() => deriveLegacyTransitionAuthority(bytes, { expectedSourceArchiveSha256: sha(bytes), target: { ...f.authority.target, provenanceUrl: 'https://example.invalid/not-the-project' } })).toThrow('TARGET_PROVENANCE_INVALID')
    })
    it('actual producer refuses a dirty/mismatched checkout before reading an input ZIP or producing output', () => {
        const f = fixture(), read = vi.spyOn(fs, 'readFileSync')
        query.mockImplementation((_file: string, args: string[]) => ({ status: 0, stdout: args.includes('--show-toplevel') ? repo : args.includes('HEAD') ? 'b'.repeat(40) : '' }))
        expect(() => buildLegacyTransitionAssistant({ sourceZipFile: 'must-not-read.zip', targetZipFile: f.zipFile,
            targetVersion: f.authority.target.version, targetSourceSha: f.authority.target.sourceSha,
            targetArchiveSha256: f.authority.target.archiveSha256, channel: 'stable', provenanceUrl: f.authority.target.provenanceUrl,
            outputFile: path.join(f.root, 'never-produced.zip') })).toThrow('BUILD_REQUIRES_EXACT_CLEAN_TARGET_CHECKOUT')
        expect(read).not.toHaveBeenCalled()
    })
    it('real producer never accepts the synthetic test pin even with an attested-checkout port', () => {
        const f = fixture(), sourceFile = path.join(f.root, 'synthetic-legacy.zip'), outputFile = path.join(f.root, 'not-produced.zip')
        fs.writeFileSync(sourceFile, f.oldZip.toBuffer())
        query.mockImplementation((_file: string, args: string[]) => ({ status: 0,
            stdout: args.includes('--show-toplevel') ? repo : args.includes('HEAD') ? f.authority.target.sourceSha : '' }))
        const options = { sourceZipFile: sourceFile, targetZipFile: f.zipFile, targetVersion: f.authority.target.version,
            targetSourceSha: f.authority.target.sourceSha, targetArchiveSha256: f.authority.target.archiveSha256,
            channel: 'stable' as const, provenanceUrl: f.authority.target.provenanceUrl, outputFile,
            expectedSourceArchiveSha256: sha(f.oldZip.toBuffer()) }
        expect(() => buildLegacyTransitionAssistant(options)).toThrow('PINNED_LEGACY_ARCHIVE_HASH_MISMATCH')
        expect(fs.existsSync(outputFile)).toBe(false)
    })
    it('historical PS builder can no longer silently handle v0.5.0 transitions', () => {
        expect(() => buildUpgradeAssistant({ sourceVersion: '0.5.0', targetVersion: '0.5.1', targetZipFile: 'absent.zip',
            targetSourceSha: 'a'.repeat(40), targetDatabaseSchema: 14, outputFile: 'not-written.zip' })).toThrow('Use buildLegacyTransitionAssistant')
    })
    it('refuses a native-entry distribution missing runtime/dependency notices', () => {
        const f = fixture()
        f.target.deleteFile('licenses/Node.js-LICENSE.txt'); refresh(f)
        expect(() => compileLegacyTransitionBundle(f.authority, f.zipFile, repo)).toThrow('TRANSITION_RUNTIME_LICENSE_NOTICES_MISSING')
        f.target.addFile('licenses/Node.js-LICENSE.txt', Buffer.from('synthetic'))
        f.target.addFile('licenses/THIRD_PARTY_LICENSES.txt', Buffer.from('synthetic but does not cover bundled dependencies')); refresh(f)
        expect(() => compileLegacyTransitionBundle(f.authority, f.zipFile, repo)).toThrow('TRANSITION_BUNDLED_DEPENDENCY_NOTICE_MISSING')
    })
    it('builds portable review bytes and runs the actual CJS entry against inert files in preview mode', async () => {
        const f = fixture()
        f.authority.target.channel = 'unpublished-review'
        f.authority.target.provenanceUrl = 'https://github.com/Saber-Alter-Lily/pica-library/actions/runs/123/artifacts/456'
        const zip = new AdmZip(compileLegacyTransitionBundle(f.authority, f.zipFile, repo))
        for (const line of zip.readAsText('SHA256SUMS.txt').trim().split('\n')) {
            const [digest, file] = line.split('  ')
            expect(sha(zip.readFile(file)!)).toBe(digest)
        }
        expect(zip.getEntries().some(entry => /\.ps1$|credentials|\.db|config\.json/i.test(entry.entryName))).toBe(false)
        expect(zip.readAsText('app/legacy-transition.cjs')).toContain(f.authority.target.archiveSha256)
        expect(zip.readFile('runtime/node.exe')).toEqual(f.target.readFile('runtime/node.exe'))
        expect(zip.readFile('payload/' + f.authority.target.archiveName)).toEqual(fs.readFileSync(f.zipFile))
        const payloadPath = path.join(f.tool, 'payload', f.authority.target.archiveName)
        fs.mkdirSync(path.dirname(payloadPath)); fs.writeFileSync(payloadPath, zip.readFile('payload/' + f.authority.target.archiveName)!)
        let stdout = '', stderr = ''
        const execution = { argv: ['node', 'bound-entry', '--application-root', f.app, '--preview'], platform: 'win32',
            versions: process.versions, env: { LOCALAPPDATA: f.local }, stdin: { isTTY: false },
            stdout: { write: (text: string) => stdout += text }, stderr: { write: (text: string) => stderr += text }, exitCode: undefined }
        new vm.Script(zip.readAsText('app/legacy-transition.cjs')).runInNewContext({
            __dirname: path.join(f.tool, 'app'), require: createRequire(import.meta.url), process: execution,
            Buffer, Uint8Array, ArrayBuffer, URL, console, module: { exports: {} }
        }, { timeout: 5000 })
        await Promise.resolve(); await Promise.resolve()
        expect(stderr).toBe(''); expect(execution.exitCode).toBeUndefined()
        expect(stdout).toContain('"canApply": false'); expect(stdout).toContain('仅预检，没有执行迁移')
        expect(stdout).not.toContain('do-not-print-private-fixture')
        expect(startup.startUpgradeHelper).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled()
        expect(fs.existsSync(path.join(f.local, 'Pica Library Upgrade Transition'))).toBe(false); original(f)
    })
})
