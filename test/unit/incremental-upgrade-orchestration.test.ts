import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runIncrementalUpgrade } from '../../src/update/updater'
import * as lifecycle from '../../src/update/process-lifecycle'
import type { UpdaterInstruction } from '../../src/update/types'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn }))
const roots: string[] = []
const oldSha = 'b'.repeat(40),
    newSha = 'a'.repeat(40),
    replacementPid = 9876542
function write(file: string, bytes: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, bytes)
}
function fixture(): UpdaterInstruction {
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-incremental-transaction-')
    )
    roots.push(root)
    const app = path.join(root, 'current'),
        staged = path.join(root, 'staged')
    const payload = {
        'web/page.js': 'new application',
        'web/added.js': 'new file',
        'SOURCE_SHA.txt': newSha
    }
    for (const [name, bytes] of Object.entries(payload))
        write(path.join(staged, name), bytes)
    for (const [name, bytes] of Object.entries({
        'web/page.js': 'old application',
        'web/retired.js': 'old retired file',
        'app/desktop.js': 'old desktop',
        'app/updater.js': 'original helper',
        'Pica Library.exe': 'original launcher',
        'SOURCE_SHA.txt': oldSha
    }))
        write(path.join(app, name), bytes)
    const input: UpdaterInstruction = {
        parentPid: 9876543,
        applicationRoot: app,
        stagingRoot: staged,
        backupRoot: path.join(root, 'backup'),
        desktopHomeRoot: path.join(root, 'home'),
        libraryDirectory: path.join(root, 'library'),
        launcherPath: path.join(app, 'Pica Library.exe'),
        runtimePath: process.execPath,
        desktopEntryPath: path.join(app, 'app/desktop.js'),
        instanceFile: path.join(root, 'instance.json'),
        progressFile: path.join(root, 'progress.json'),
        healthTimeoutMs: 20,
        manifest: {
            manifestVersion: 1,
            packageType: 'local-test',
            sourceVersionRange: '=fixture-old',
            sourceSha: oldSha,
            targetVersion: 'fixture-new',
            targetSourceSha: newSha,
            appApiVersion: 2,
            databaseSchemaVersion: 14,
            requiresFullInstall: false,
            files: Object.entries(payload).map(([name, bytes]) => ({
                path: name,
                size: Buffer.byteLength(bytes),
                sha256: createHash('sha256').update(bytes).digest('hex')
            })),
            deletions: ['web/retired.js']
        }
    }
    write(path.join(input.desktopHomeRoot, 'config/fixture.json'), 'old config')
    for (const suffix of ['', '-wal', '-shm'])
        write(
            path.join(input.libraryDirectory, 'library.db' + suffix),
            'old database ' + suffix
        )
    return input
}
function expectOriginal(input: UpdaterInstruction) {
    expect(
        fs.readFileSync(path.join(input.applicationRoot, 'web/page.js'), 'utf8')
    ).toBe('old application')
    expect(
        fs.readFileSync(
            path.join(input.applicationRoot, 'web/retired.js'),
            'utf8'
        )
    ).toBe('old retired file')
    expect(
        fs.existsSync(path.join(input.applicationRoot, 'web/added.js'))
    ).toBe(false)
    expect(
        fs.readFileSync(
            path.join(input.applicationRoot, 'SOURCE_SHA.txt'),
            'utf8'
        )
    ).toBe(oldSha)
    expect(
        fs.readFileSync(
            path.join(input.desktopHomeRoot, 'config/fixture.json'),
            'utf8'
        )
    ).toBe('old config')
    for (const suffix of ['', '-wal', '-shm'])
        expect(
            fs.readFileSync(
                path.join(input.libraryDirectory, 'library.db' + suffix),
                'utf8'
            )
        ).toBe('old database ' + suffix)
    expect(
        fs.readFileSync(
            path.join(input.applicationRoot, 'app/updater.js'),
            'utf8'
        )
    ).toBe('original helper')
}
function fakeLaunch(
    input: UpdaterInstruction,
    options: {
        failFirst?: boolean
        mutateState?: boolean
        healthy?: boolean
        refuseStop?: boolean
        omitInstance?: boolean
    } = {}
) {
    let attempts = 0,
        running = false
    vi.spyOn(process, 'kill').mockImplementation(((
        pid: number,
        signal?: NodeJS.Signals | number
    ) => {
        if (pid !== replacementPid || !running)
            throw new Error('synthetic ESRCH')
        if (signal === 0) return true
        if (options.refuseStop) throw new Error('synthetic EPERM')
        running = false
        return true
    }) as typeof process.kill)
    spawn.mockImplementation(() => {
        const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
        const attempt = ++attempts
        queueMicrotask(() => {
            if (attempt === 1 && options.failFirst) {
                child.emit('error', new Error('synthetic asynchronous EACCES'))
                return
            }
            running = true
            if (!options.omitInstance)
                write(
                    input.instanceFile,
                    JSON.stringify({
                        pid: replacementPid,
                        url: 'http://127.0.0.1:54123'
                    })
                )
            if (attempt === 1 && options.mutateState) {
                write(
                    path.join(input.desktopHomeRoot, 'config/fixture.json'),
                    'replacement config'
                )
                for (const suffix of ['', '-wal', '-shm'])
                    write(
                        path.join(
                            input.libraryDirectory,
                            'library.db' + suffix
                        ),
                        'replacement database'
                    )
            }
            child.emit('spawn')
        })
        return child
    })
    const fetchMock = vi.fn(async (url: string | URL) => {
        const route = new URL(url).pathname
        if (route.endsWith('/status')) {
            if (options.refuseStop) throw new Error('controller unavailable')
            return Response.json({ csrfToken: 'fixture-csrf' })
        }
        if (route.endsWith('/shutdown')) {
            running = false
            return Response.json({ ok: true })
        }
        return Response.json({
            appVersion: options.healthy
                ? input.manifest.targetVersion
                : 'wrong-version'
        })
    })
    vi.stubGlobal('fetch', fetchMock)
    return { fetchMock }
}
beforeEach(() => {
    spawn.mockReset()
})
afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('actual incremental transaction with synthetic I/O failures', () => {
    it.each(['missing', 'invalid'] as const)(
        'retains backups and never overwrites an unidentifiable %s replacement',
        async (kind) => {
            const f = fixture()
            fakeLaunch(f, { omitInstance: true, mutateState: true })
            if (kind === 'invalid')
                vi.spyOn(lifecycle, 'health').mockImplementationOnce(
                    async () => {
                        write(
                            f.instanceFile,
                            JSON.stringify({
                                pid: -1,
                                url: 'http://127.0.0.1:54123'
                            })
                        )
                        return { ok: false as const, url: null }
                    }
                )
            await expect(runIncrementalUpgrade(f)).rejects.toThrow(
                'exit cannot be verified'
            )
            expect(
                fs.readFileSync(
                    path.join(f.applicationRoot, 'web/page.js'),
                    'utf8'
                )
            ).toBe('new application')
            expect(
                fs.readFileSync(path.join(f.backupRoot, 'web/page.js'), 'utf8')
            ).toBe('old application')
            expect(
                fs.readFileSync(
                    path.join(f.desktopHomeRoot, 'config/fixture.json'),
                    'utf8'
                )
            ).toBe('replacement config')
            expect(
                fs.existsSync(
                    path.join(f.backupRoot, 'user-state-snapshot/snapshot.json')
                )
            ).toBe(true)
            expect(spawn).toHaveBeenCalledTimes(1)
        }
    )
    it('awaits async launch failure, restores replacements/deletions/new files and relaunches the old application', async () => {
        const f = fixture()
        fakeLaunch(f, { failFirst: true })
        await expect(runIncrementalUpgrade(f)).rejects.toThrow(
            'synthetic asynchronous EACCES'
        )
        expectOriginal(f)
        expect(spawn).toHaveBeenCalledTimes(2)
        expect(
            JSON.parse(fs.readFileSync(f.progressFile, 'utf8'))
        ).toMatchObject({
            phase: 'failed',
            message: 'synthetic asynchronous EACCES'
        })
    })
    it('stops an unhealthy replacement before restoring original config and all SQLite sidecars', async () => {
        const f = fixture(),
            { fetchMock } = fakeLaunch(f, { mutateState: true })
        await expect(runIncrementalUpgrade(f)).rejects.toThrow('health check')
        expectOriginal(f)
        expect(
            fetchMock.mock.calls.some(([url]) =>
                String(url).endsWith('/shutdown')
            )
        ).toBe(true)
        expect(spawn).toHaveBeenCalledTimes(2)
    })
    it('retains the complete backup instead of overwriting a replacement that cannot be stopped', async () => {
        const f = fixture()
        fakeLaunch(f, { refuseStop: true, mutateState: true })
        await expect(runIncrementalUpgrade(f)).rejects.toThrow(
            'could not be stopped'
        )
        expect(
            fs.readFileSync(path.join(f.applicationRoot, 'web/page.js'), 'utf8')
        ).toBe('new application')
        expect(
            fs.readFileSync(path.join(f.backupRoot, 'web/page.js'), 'utf8')
        ).toBe('old application')
        expect(
            fs.existsSync(
                path.join(f.backupRoot, 'user-state-snapshot/snapshot.json')
            )
        ).toBe(true)
        expect(spawn).toHaveBeenCalledTimes(1)
    })
    it('recovers a partial apply from the completed backup journal', async () => {
        const f = fixture()
        fakeLaunch(f)
        const rename = fs.renameSync
        vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
            if (destination === path.join(f.applicationRoot, 'web/added.js'))
                throw new Error('synthetic partial apply EPERM')
            return rename(source, destination)
        })
        await expect(runIncrementalUpgrade(f)).rejects.toThrow(
            'synthetic partial apply EPERM'
        )
        expectOriginal(f)
        expect(spawn).toHaveBeenCalledTimes(1)
    })
    it('never treats a partial backup as a complete rollback or mutates installed files', async () => {
        const f = fixture()
        fakeLaunch(f)
        const copy = fs.copyFileSync
        vi.spyOn(fs, 'copyFileSync').mockImplementation(
            (source, destination, flags) => {
                if (source === path.join(f.applicationRoot, 'web/page.js'))
                    throw new Error('synthetic backup copy EIO')
                return copy(source, destination, flags)
            }
        )
        await expect(runIncrementalUpgrade(f)).rejects.toThrow(
            'synthetic backup copy EIO'
        )
        expectOriginal(f)
        expect(fs.existsSync(path.join(f.backupRoot, 'existing.json'))).toBe(
            false
        )
        expect(spawn).toHaveBeenCalledTimes(1)
    })
    it('does not let recovery-status errors block file and user-state restoration', async () => {
        const f = fixture()
        fakeLaunch(f, { failFirst: true })
        const original = fs.writeFileSync
        vi.spyOn(fs, 'writeFileSync').mockImplementation(
            (file, bytes, options) => {
                if (
                    file === f.progressFile &&
                    /"phase":"(?:rollback|failed)"/.test(String(bytes))
                )
                    throw new Error('synthetic status EACCES')
                return original(file, bytes, options)
            }
        )
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        await expect(runIncrementalUpgrade(f)).rejects.toThrow(
            'synthetic asynchronous EACCES'
        )
        expectOriginal(f)
        expect(console.error).toHaveBeenCalledTimes(2)
    })
    it('keeps a proven healthy installation when final status storage fails', async () => {
        const f = fixture()
        fakeLaunch(f, { healthy: true })
        const original = fs.writeFileSync
        vi.spyOn(fs, 'writeFileSync').mockImplementation(
            (file, bytes, options) => {
                if (
                    file === f.progressFile &&
                    String(bytes).includes('"phase":"complete"')
                )
                    throw new Error('synthetic status EACCES')
                return original(file, bytes, options)
            }
        )
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        await runIncrementalUpgrade(f)
        expect(
            fs.readFileSync(path.join(f.applicationRoot, 'web/page.js'), 'utf8')
        ).toBe('new application')
        expect(
            fs.existsSync(path.join(f.applicationRoot, 'web/retired.js'))
        ).toBe(false)
        expect(fs.existsSync(f.backupRoot)).toBe(true)
        expect(spawn).toHaveBeenCalledTimes(1)
    })
    it('uses the existing bundled-Node fallback when no launcher exists', async () => {
        const f = fixture()
        fs.rmSync(f.launcherPath)
        fakeLaunch(f, { healthy: true })
        await runIncrementalUpgrade(f)
        expect(spawn.mock.calls[0]).toEqual([
            f.runtimePath,
            [f.desktopEntryPath, '--no-open'],
            expect.objectContaining({
                cwd: f.applicationRoot,
                windowsHide: true,
                detached: true,
                stdio: 'ignore'
            })
        ])
    })
    it('does not stop/relaunch or mutate anything when the original process did not exit', async () => {
        const f = fixture()
        fakeLaunch(f)
        vi.spyOn(lifecycle, 'waitForExit').mockRejectedValueOnce(
            new Error('synthetic parent exit timeout')
        )
        await expect(runIncrementalUpgrade(f)).rejects.toThrow(
            'synthetic parent exit timeout'
        )
        expectOriginal(f)
        expect(spawn).not.toHaveBeenCalled()
        expect(fs.existsSync(f.backupRoot)).toBe(false)
    })
    it('rejects a pre-existing recovery directory without claiming or deleting it', async () => {
        const f = fixture()
        write(path.join(f.backupRoot, 'retain.txt'), 'foreign recovery')
        fakeLaunch(f)
        await expect(runIncrementalUpgrade(f)).rejects.toThrow(
            'backup directory already exists'
        )
        expectOriginal(f)
        expect(
            fs.readFileSync(path.join(f.backupRoot, 'retain.txt'), 'utf8')
        ).toBe('foreign recovery')
        expect(spawn).not.toHaveBeenCalled()
    })
    it.each([
        'hash',
        'source',
        'case-collision',
        'self-replacement',
        'data-payload',
        'directory-deletion'
    ] as const)(
        'rejects %s before parent exit, backup or mutation',
        async (kind) => {
            const f = fixture()
            fakeLaunch(f)
            if (kind === 'hash')
                write(path.join(f.stagingRoot, 'web/page.js'), 'tampered')
            if (kind === 'source')
                write(
                    path.join(f.applicationRoot, 'SOURCE_SHA.txt'),
                    'c'.repeat(40)
                )
            if (kind === 'case-collision')
                f.manifest.deletions.push('web/PAGE.JS')
            if (kind === 'self-replacement')
                f.manifest.deletions.push('app/UPDATER.JS')
            if (kind === 'data-payload')
                f.manifest.deletions.push('app/cache/private.db')
            if (kind === 'directory-deletion')
                f.manifest.deletions.push('web/directory'),
                    fs.mkdirSync(path.join(f.applicationRoot, 'web/directory'))
            const before = fs.readFileSync(
                path.join(f.applicationRoot, 'web/page.js')
            )
            await expect(runIncrementalUpgrade(f)).rejects.toThrow()
            expect(
                fs.readFileSync(path.join(f.applicationRoot, 'web/page.js'))
            ).toEqual(before)
            expect(fs.existsSync(f.backupRoot)).toBe(false)
            expect(spawn).not.toHaveBeenCalled()
            expect(fs.existsSync(f.progressFile)).toBe(false)
        }
    )
    it('rejects linked payload paths without needing host symlink privileges', async () => {
        const f = fixture()
        fakeLaunch(f)
        const original = fs.lstatSync
        vi.spyOn(fs, 'lstatSync').mockImplementation(((
            file: fs.PathLike,
            options?: unknown
        ) => {
            const stat = original(file, options as never)
            return String(file) === path.join(f.applicationRoot, 'web/page.js')
                ? Object.assign(Object.create(stat), {
                      isSymbolicLink: () => true
                  })
                : stat
        }) as typeof fs.lstatSync)
        await expect(runIncrementalUpgrade(f)).rejects.toThrow(
            'non-linked file'
        )
        expectOriginal(f)
        expect(spawn).not.toHaveBeenCalled()
    })
})
