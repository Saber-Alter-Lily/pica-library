import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectLegacyTransition, runLegacyTransitionPreviewCli, type LegacyTransitionAuthority } from '../../src/update/legacy-transition-preflight'

const roots: string[] = []
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
function fixture() {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pica-legacy-preview-')))
    roots.push(root)
    const app = path.join(root, 'old-app'), tool = path.join(root, 'independent-tool'),
        local = path.join(root, 'localappdata'), home = path.join(local, 'Pica Library'),
        library = path.join(root, 'personal-library'), work = path.join(root, 'future-work')
    const oldFiles: Record<string, string> = {
        'SOURCE_SHA.txt': 'bec7f9f31828e8c57e0a2c103b6b1206c22c37cf\n',
        'Pica Library.exe': 'synthetic old launcher, never executed',
        'runtime/node.exe': 'synthetic old runtime, never executed',
        'app/desktop.js': 'synthetic old desktop, never executed',
        'app/updater.js': 'synthetic old helper, never executed',
        'app/full-upgrader.js': 'synthetic old full helper, never executed'
    }
    for (const [name, bytes] of Object.entries(oldFiles)) {
        const file = path.join(app, name)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, bytes)
    }
    fs.mkdirSync(path.join(home, 'config'), { recursive: true })
    fs.mkdirSync(path.join(library, 'library'), { recursive: true })
    fs.writeFileSync(path.join(home, 'config/config.json'), JSON.stringify({ schemaVersion: 1, libraryDirectory: library, unrelatedSecret: 'synthetic-private-setting' }))
    fs.writeFileSync(path.join(library, 'library.db'), 'synthetic database, not opened as SQLite')
    fs.writeFileSync(path.join(library, 'library', 'body-sentinel.bin'), 'synthetic body, must not be read')
    const source = 'a'.repeat(40), target = new AdmZip()
    for (const name of Object.keys(oldFiles))
        target.addFile(name, Buffer.from(name === 'SOURCE_SHA.txt' ? source + '\n' : 'synthetic new ' + name))
    target.addFile('app/runtime-composition.json', Buffer.from(JSON.stringify({ formatVersion: 1, sourceRuntimes: [] })))
    const zipFile = path.join(root, 'Pica-Library-v0.5.1-windows-x64.zip')
    target.writeZip(zipFile)
    for (const name of ['SOURCE_SHA.txt', 'runtime/node.exe', 'app/full-upgrader.js']) {
        const file = path.join(tool, name)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, target.readFile(name)!)
    }
    const authority: LegacyTransitionAuthority = {
        formatVersion: 1, kind: 'pica-library-legacy-transition',
        source: { version: '0.5.0', sourceSha: oldFiles['SOURCE_SHA.txt'].trim(),
            files: Object.fromEntries(Object.entries(oldFiles).map(([name, bytes]) => [name, sha(bytes)])) },
        target: { version: '0.5.1', sourceSha: source, archiveName: path.basename(zipFile), archiveSha256: sha(fs.readFileSync(zipFile)),
            channel: 'stable', provenanceUrl: 'https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/' + path.basename(zipFile) }
    }
    const context = { authority: authority as LegacyTransitionAuthority | null, toolRoot: tool, localAppData: local, platform: 'win32' }
    const selection = { applicationRoot: app, targetZip: zipFile, workRoot: work, dataHome: home }
    return { root, app, tool, local, home, library, work, zipFile, target, oldFiles, authority, context, selection }
}
type Fixture = ReturnType<typeof fixture>
function refreshTarget(f: Fixture) {
    f.target.writeZip(f.zipFile)
    f.authority.target.archiveSha256 = sha(fs.readFileSync(f.zipFile))
}
function args(f: Fixture) {
    return ['--application-root', f.app, '--target-zip', f.zipFile, '--work-root', f.work, '--data-home', f.home]
}
afterEach(() => {
    vi.restoreAllMocks()
    for (const root of roots.splice(0)) {
        if (!path.basename(root).startsWith('pica-legacy-preview-') || path.dirname(root) === root) throw Error('Unsafe fixture cleanup')
        fs.rmSync(root, { recursive: true, force: true })
    }
})

describe('independent first-migration read-only preflight', () => {
    it('produces a deterministic preview without writes, SQLite access, process control or body reads', () => {
        const f = fixture(), reads = vi.spyOn(fs, 'readFileSync')
        const writes = [vi.spyOn(fs, 'writeFileSync'), vi.spyOn(fs, 'mkdirSync'), vi.spyOn(fs, 'renameSync'),
            vi.spyOn(fs, 'copyFileSync'), vi.spyOn(fs, 'rmSync')]
        const preview = inspectLegacyTransition(f.selection, f.context)
        expect(preview).toMatchObject({
            readOnly: true, canApply: false, executionAvailable: false, mustRevalidateBeforeApply: true,
            verdict: 'READY_FOR_EXPLICIT_CONFIRMATION', requiresOptionalRuntimeConsent: false,
            profile: { home: f.home, library: f.library, configured: true, downloadInventory: 'NOT_READ' },
            nextAction: 'CONFIRMATION_AND_COORDINATOR_NOT_IMPLEMENTED'
        })
        expect(inspectLegacyTransition(f.selection, f.context).previewId).toBe(preview.previewId)
        for (const write of writes) expect(write).not.toHaveBeenCalled()
        expect(reads.mock.calls.map(([file]) => String(file))).not.toContain(path.join(f.library, 'library.db'))
        expect(reads.mock.calls.some(([file]) => String(file).includes('body-sentinel'))).toBe(false)
        expect(JSON.stringify(preview)).not.toContain('synthetic-private-setting')
        expect(fs.existsSync(preview.paths.backup)).toBe(false)
        expect(fs.existsSync(f.work)).toBe(false)
        expect(fs.existsSync(path.join(f.library, 'library.db-wal'))).toBe(false)
    })
    it('refuses unbound build authority before any filesystem access', () => {
        const read = vi.spyOn(fs, 'lstatSync')
        const context = { authority: null, platform: 'win32', localAppData: 'NONEXISTENT', toolRoot: 'NONEXISTENT' }
        expect(() => inspectLegacyTransition({ applicationRoot: 'NONEXISTENT', targetZip: 'NONEXISTENT', workRoot: 'NONEXISTENT' }, context)).toThrow('BUILD_AUTHORITY_NOT_BOUND')
        expect(read).not.toHaveBeenCalled()
    })
    it('does not accept another platform, profile or unrelated legacy source', () => {
        const f = fixture()
        expect(() => inspectLegacyTransition(f.selection, { ...f.context, platform: 'linux' })).toThrow('WINDOWS_ONLY')
        expect(() => inspectLegacyTransition({ ...f.selection, dataHome: path.join(f.local, 'Pica Library Post Stable RC') }, f.context)).toThrow('DATA_PROFILE_MISMATCH')
        fs.writeFileSync(path.join(f.app, 'SOURCE_SHA.txt'), 'b'.repeat(40))
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('INSTALLED_SOURCE_MISMATCH')
    })
    it('refuses missing or modified installed files rather than guessing a baseline', () => {
        const f = fixture()
        fs.writeFileSync(path.join(f.app, 'app/full-upgrader.js'), 'modified old helper')
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('INSTALLED_FILE_MISMATCH')
        fs.unlinkSync(path.join(f.app, 'app/full-upgrader.js'))
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('INSTALLED_FILES_MISSING')
    })
    it('rejects mixed-in user directories before descending or reading their contents', () => {
        const f = fixture(), unknown = path.join(f.app, 'personal-content')
        fs.mkdirSync(unknown)
        fs.writeFileSync(path.join(unknown, 'private-body.bin'), 'do not read')
        const read = vi.spyOn(fs, 'readdirSync')
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('INSTALLED_UNEXPECTED_CONTENT')
        expect(read.mock.calls.some(([file]) => String(file) === unknown)).toBe(false)
    })
    it.each(['applicationRoot', 'workRoot'])('refuses user-data overlap with %s', role => {
        const f = fixture()
        expect(() => inspectLegacyTransition({ ...f.selection, [role]: f.home }, f.context)).toThrow('PATH_ROLES_OVERLAP')
    })
    it('rejects a Library containing the application and never reports its config contents', () => {
        const f = fixture()
        fs.writeFileSync(path.join(f.home, 'config/config.json'), JSON.stringify({ libraryDirectory: f.root, secret: 'never-print-me' }))
        const result = runLegacyTransitionPreviewCli(args(f), f.context)
        expect(JSON.parse(result.output).error).toBe('PATH_ROLES_OVERLAP')
        expect(result.output).not.toContain('never-print-me')
    })
    it('refuses corrupt/missing existing profile config and does not disclose parser fragments', () => {
        const f = fixture()
        fs.writeFileSync(path.join(f.home, 'config/config.json'), '{"secret":"never-print-me",')
        const result = runLegacyTransitionPreviewCli(args(f), f.context)
        expect(result.exitCode).toBe(1)
        expect(result.output).not.toContain('never-print-me')
        fs.unlinkSync(path.join(f.home, 'config/config.json'))
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('PREFLIGHT_INPUT_UNREADABLE_OR_INVALID')
    })
    it('preserves known absence of an unused profile instead of creating settings or a database', () => {
        const f = fixture()
        fs.rmSync(f.home, { recursive: true })
        const preview = inspectLegacyTransition(f.selection, f.context)
        expect(preview.profile.configured).toBe(false)
        expect(preview.profile.library).toBe(path.join(f.home, 'data'))
        expect(fs.existsSync(f.home)).toBe(false)
    })
    it('rejects package hash, source and independent engine mismatches', () => {
        const f = fixture(), originalHash = f.authority.target.archiveSha256
        f.authority.target.archiveSha256 = '0'.repeat(64)
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('TARGET_ARCHIVE_HASH_MISMATCH')
        f.authority.target.archiveSha256 = originalHash
        fs.writeFileSync(path.join(f.tool, 'app/full-upgrader.js'), 'unverified external helper')
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('INDEPENDENT_ENGINE_FILE_MISMATCH')
        fs.writeFileSync(path.join(f.tool, 'SOURCE_SHA.txt'), 'b'.repeat(40))
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('INDEPENDENT_ENGINE_SOURCE_MISMATCH')
    })
    it('uses the existing full-package validator for source and required-file checks', () => {
        const f = fixture()
        f.target.updateFile('SOURCE_SHA.txt', Buffer.from('b'.repeat(40)))
        refreshTarget(f)
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('TARGET_SOURCE_MISMATCH')
        f.target.deleteFile('app/desktop.js')
        refreshTarget(f)
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('PREFLIGHT_INPUT_UNREADABLE_OR_INVALID')
    })
    it.each(['config/credentials.dat', 'app/credentials.dat', 'library.db', 'comic.cbz'])('rejects private or body payload %s', name => {
        const f = fixture()
        f.target.addFile(name, Buffer.from('synthetic forbidden data'))
        refreshTarget(f)
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('TARGET_PRIVATE_OR_LINKED_PAYLOAD')
    })
    it('does not let a differently scoped RC payload consume the stable profile', () => {
        const f = fixture()
        f.target.addFile('TEST_BUILD.txt', Buffer.from('Desktop home: Pica Library Post Stable RC'))
        refreshTarget(f)
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('TARGET_DATA_PROFILE_MISMATCH')
    })
    it.each([
        'https://github.com.evil.invalid/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/file.zip',
        'https://user:secret@github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/file.zip',
        'https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/file.zip?token=secret'
    ])('does not accept a forged publisher location: %s', url => {
        const f = fixture()
        f.authority.target.provenanceUrl = url
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('TARGET_PROVENANCE_INVALID')
    })
    it('keeps CI review provenance distinct from a published stable release', () => {
        const f = fixture()
        f.authority.target.channel = 'unpublished-review'
        f.authority.target.provenanceUrl = 'https://github.com/Saber-Alter-Lily/pica-library/actions/runs/123/artifacts/456'
        expect(inspectLegacyTransition(f.selection, f.context).target.channel).toBe('unpublished-review')
        expect(inspectLegacyTransition(f.selection, f.context).canApply).toBe(false)
    })
    it('never overwrites a pre-existing planned recovery location', () => {
        const f = fixture(), preview = inspectLegacyTransition(f.selection, f.context)
        fs.mkdirSync(preview.paths.backup)
        fs.writeFileSync(path.join(preview.paths.backup, 'keep.txt'), 'retained recovery')
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('RECOVERY_LOCATION_ALREADY_EXISTS')
        expect(fs.readFileSync(path.join(preview.paths.backup, 'keep.txt'), 'utf8')).toBe('retained recovery')
    })
    it('reports canonical path changes for explicit review, not permission to apply', () => {
        const f = fixture(), alias = path.join(f.root, 'program-junction')
        fs.symlinkSync(f.app, alias, 'junction')
        const preview = inspectLegacyTransition({ ...f.selection, applicationRoot: alias }, f.context)
        expect(preview.verdict).toBe('PATH_REVIEW_REQUIRED')
        expect(preview.paths.application).toBe(f.app)
        expect(preview.canApply).toBe(false)
    })
    it('rejects a file as a future working directory', () => {
        const f = fixture()
        fs.writeFileSync(f.work, 'not a directory')
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('PATH_ROLE_NOT_DIRECTORY')
    })
    it('does not approve a database with an unverified hardlink identity', () => {
        const f = fixture()
        fs.linkSync(path.join(f.library, 'library.db'), path.join(f.root, 'database-alias'))
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('DATABASE_PATH_INVALID')
    })
    it('does not follow an interior source-file alias or treat access denial as absence', () => {
        const f = fixture(), stat = fs.lstatSync
        vi.spyOn(fs, 'lstatSync').mockImplementation((file, ...options) => {
            if (String(file) === path.join(f.app, 'app/desktop.js')) {
                const value = stat(file, ...options)
                if (!value) throw Error('Synthetic source fixture disappeared')
                return new Proxy(value, { get: (target, key) => key === 'isSymbolicLink' ? () => true : Reflect.get(target, key) })
            }
            return stat(file, ...options)
        })
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('LINK_OR_NONREGULAR_FILE')
        vi.restoreAllMocks()
        vi.spyOn(fs, 'lstatSync').mockImplementation((file, ...options) => {
            if (String(file) === f.work) throw Object.assign(new Error('synthetic denial'), { code: 'EACCES' })
            return stat(file, ...options)
        })
        expect(() => inspectLegacyTransition(f.selection, f.context)).toThrow('PREFLIGHT_INPUT_UNREADABLE_OR_INVALID')
    })
    it('wires a preview-only CLI and rejects apply/manifest/unknown/missing/duplicate flags', () => {
        const f = fixture(), result = runLegacyTransitionPreviewCli(args(f), f.context)
        expect(result.exitCode).toBe(0)
        expect(JSON.parse(result.output).canApply).toBe(false)
        for (const command of [
            [...args(f), '--apply', 'yes'], [...args(f), '--manifest', 'untrusted.json'],
            [...args(f), '--work-root', f.work], ['--target-zip'], ['--unknown', 'value']
        ]) expect(JSON.parse(runLegacyTransitionPreviewCli(command, f.context).output).error).toBe('ARGUMENTS_INVALID')
        expect(runLegacyTransitionPreviewCli(['--help'], { ...f.context, authority: null }).exitCode).toBe(0)
    })
    it('runs the actual bundled CLI against synthetic files, with no migration branch or server', async () => {
        const f = fixture()
        const result = await build({
            entryPoints: ['scripts/preview-legacy-transition.ts'], bundle: true, write: false,
            platform: 'node', format: 'cjs', logLevel: 'silent', metafile: true,
            define: { __PICA_LEGACY_TRANSITION_AUTHORITY__: JSON.stringify(f.authority), 'import.meta.dirname': JSON.stringify(path.join(f.tool, 'app')) }
        })
        expect(Object.keys(result.metafile!.inputs).some(name =>
            /src\/(?:providers\/|library\/database|update\/(?:full-upgrader|process-lifecycle|helper-startup|user-state-snapshot))/.test(name)
        )).toBe(false)
        let stdout = ''
        const execution = { argv: ['node', 'readonly-preview', ...args(f)], platform: 'win32', versions: { node: process.versions.node }, env: { LOCALAPPDATA: f.local },
            stdout: { write: (text: string) => { stdout += text } }, exitCode: undefined as number | undefined }
        // AdmZip selects its byte-input path by instanceof Uint8Array. Native fs
        // returns native Buffers; a different VM intrinsic misclassifies them as
        // an empty archive. Keep the actual Node byte contract, not a ZIP mock.
        expect(fs.readFileSync(f.zipFile) instanceof vm.runInNewContext('Uint8Array')).toBe(false)
        new vm.Script(result.outputFiles[0].text).runInNewContext({
            require: createRequire(import.meta.url), process: execution, Buffer, Uint8Array, ArrayBuffer, URL, console, module: { exports: {} }
        }, { timeout: 5000 })
        expect(execution.exitCode, stdout).toBe(0)
        expect(JSON.parse(stdout)).toMatchObject({ readOnly: true, canApply: false, profile: { library: f.library } })
        expect(fs.existsSync(f.work)).toBe(false)
    })
    it('refuses the actual unbound CLI before file reads even with a forged environment authority', async () => {
        const f = fixture()
        const result = await build({
            entryPoints: ['scripts/preview-legacy-transition.ts'], bundle: true, write: false,
            platform: 'node', format: 'cjs', logLevel: 'silent',
            define: { 'import.meta.dirname': JSON.stringify(path.join(f.tool, 'app')) }
        })
        let stdout = ''
        const execution = { argv: ['node', 'readonly-preview', ...args(f)], platform: 'win32', versions: process.versions,
            env: { LOCALAPPDATA: f.local, PICA_LEGACY_TRANSITION_AUTHORITY: JSON.stringify(f.authority) },
            stdout: { write: (text: string) => { stdout += text } }, exitCode: undefined as number | undefined }
        const read = vi.spyOn(fs, 'readFileSync'), stat = vi.spyOn(fs, 'lstatSync')
        new vm.Script(result.outputFiles[0].text).runInNewContext({
            require: createRequire(import.meta.url), process: execution, Buffer, Uint8Array, ArrayBuffer, URL, console, module: { exports: {} }
        }, { timeout: 5000 })
        expect(execution.exitCode).toBe(1)
        expect(JSON.parse(stdout).error).toBe('BUILD_AUTHORITY_NOT_BOUND')
        expect(read).not.toHaveBeenCalled()
        expect(stat).not.toHaveBeenCalled()
    })
})
