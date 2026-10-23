import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runFullApplicationUpgrade } from '../../src/update/full-upgrader'
import type { FullApplicationUpdaterInstruction } from '../../src/update/types'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn }))
const roots: string[] = []

function fixture(): FullApplicationUpdaterInstruction {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-upgrade-transaction-'))
    roots.push(root)
    const value: FullApplicationUpdaterInstruction = {
        parentPid: 9876543,
        applicationRoot: path.join(root, 'current'),
        stagedApplicationRoot: path.join(root, 'staged'),
        backupRoot: path.join(root, 'backup'),
        bootstrapRoot: path.join(root, 'bootstrap'),
        desktopHomeRoot: path.join(root, 'home'),
        libraryDirectory: path.join(root, 'library'),
        instanceFile: path.join(root, 'instance.json'),
        progressFile: path.join(root, 'progress.json'),
        targetVersion: '0.5.0-test',
        targetSourceSha: 'a'.repeat(40),
        healthTimeoutMs: 20
    }
    for (const directory of [value.applicationRoot, value.stagedApplicationRoot]) {
        for (const name of ['Pica Library.exe', 'runtime/node.exe', 'app/desktop.js', 'app/updater.js', 'app/full-upgrader.js', 'SOURCE_SHA.txt']) {
            const target = path.join(directory, name)
            fs.mkdirSync(path.dirname(target), { recursive: true })
            fs.writeFileSync(target, name === 'SOURCE_SHA.txt' ? (directory === value.applicationRoot ? 'b' : 'a').repeat(40) : directory === value.applicationRoot ? 'original' : 'candidate')
        }
    }
    fs.mkdirSync(value.bootstrapRoot)
    fs.mkdirSync(path.join(value.desktopHomeRoot, 'config'), { recursive: true })
    fs.mkdirSync(value.libraryDirectory)
    fs.writeFileSync(path.join(value.desktopHomeRoot, 'config', 'fixture.json'), '{"synthetic":"keep"}')
    fs.writeFileSync(path.join(value.libraryDirectory, 'library.db'), 'synthetic database bytes')
    return value
}

function fakeLaunch(value: FullApplicationUpdaterInstruction, failure?: (attempt: number) => Error | null) {
    let attempts = 0
    spawn.mockImplementation(() => {
        const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
        const error = failure?.(++attempts)
        queueMicrotask(() => {
            if (error) child.emit('error', error)
            else {
                fs.writeFileSync(value.instanceFile, JSON.stringify({ pid: 9876542, url: 'http://127.0.0.1:54123' }))
                child.emit('spawn')
            }
        })
        return child
    })
}

function expectOriginal(value: FullApplicationUpdaterInstruction) {
    expect(fs.readFileSync(path.join(value.applicationRoot, 'Pica Library.exe'), 'utf8')).toBe('original')
    expect(fs.readFileSync(path.join(value.desktopHomeRoot, 'config', 'fixture.json'), 'utf8')).toBe('{"synthetic":"keep"}')
    expect(fs.readFileSync(path.join(value.libraryDirectory, 'library.db'), 'utf8')).toBe('synthetic database bytes')
}

beforeEach(() => {
    spawn.mockReset()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ appVersion: 'synthetic-unhealthy' })))
    vi.stubGlobal('process', {
        ...process,
        platform: 'win32',
        chdir: vi.fn(),
        kill: vi.fn(() => { throw new Error('synthetic ESRCH') })
    })
})
afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('actual full-upgrade orchestration with synthetic I/O faults', () => {
    it('preflights impossible database paths before waiting, snapshotting or replacing files', async () => {
        const value=fixture()
        value.libraryDirectory=path.resolve(value.libraryDirectory, ...Array.from({length:6000},()=> 'nested'))
        const current=fs.readFileSync(path.join(value.applicationRoot,'Pica Library.exe'))
        const copy=vi.spyOn(fs,'cpSync')
        await expect(runFullApplicationUpgrade(value)).rejects.toThrow(/filesystem limit/)
        expect(fs.readFileSync(path.join(value.applicationRoot,'Pica Library.exe'))).toEqual(current)
        expect(copy).not.toHaveBeenCalled()
        expect(spawn).not.toHaveBeenCalled()
        expect(fs.existsSync(value.progressFile)).toBe(false)
    })
    it('awaits an asynchronous launch error and restores old application/config/database', async () => {
        const value = fixture()
        fakeLaunch(value, n => n === 1 ? new Error('synthetic CreateProcess EACCES') : null)
        await expect(runFullApplicationUpgrade(value)).rejects.toThrow('synthetic CreateProcess EACCES')
        expectOriginal(value)
        expect(spawn).toHaveBeenCalledTimes(2)
        expect(JSON.parse(fs.readFileSync(value.progressFile, 'utf8'))).toMatchObject({ phase: 'failed', message: 'synthetic CreateProcess EACCES' })
    })

    it('routes partial-copy failure through the owned-backup recovery path', async () => {
        const value = fixture()
        fakeLaunch(value)
        const copy = fs.cpSync
        vi.spyOn(fs, 'cpSync').mockImplementation((from, to, options) => {
            if (from === value.stagedApplicationRoot) {
                fs.mkdirSync(String(to), { recursive: true })
                fs.writeFileSync(path.join(String(to), 'partial.txt'), 'partial new tree')
                throw new Error('synthetic partial copy EPERM')
            }
            return copy(from, to, options)
        })
        await expect(runFullApplicationUpgrade(value)).rejects.toThrow('synthetic partial copy EPERM')
        expectOriginal(value)
        expect(fs.existsSync(path.join(value.applicationRoot, 'partial.txt'))).toBe(false)
        expect(spawn).toHaveBeenCalledTimes(1)
    })

    it('does not let an unwritable recovery status file interrupt restoring user state', async () => {
        const value = fixture()
        fakeLaunch(value, n => n === 1 ? new Error('synthetic launch failure') : null)
        const write = fs.writeFileSync
        vi.spyOn(fs, 'writeFileSync').mockImplementation((target, bytes, options) => {
            if (target === value.progressFile && /"phase":"(?:rollback|failed)"/.test(String(bytes))) throw new Error('synthetic status EACCES')
            return write(target, bytes, options)
        })
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        await expect(runFullApplicationUpgrade(value)).rejects.toThrow('synthetic launch failure')
        expectOriginal(value)
        expect(spawn).toHaveBeenCalledTimes(2)
        expect(console.error).toHaveBeenCalledTimes(2)
    })

    it('retains a pre-existing backup and never claims it belongs to this invocation', async () => {
        const value = fixture()
        fs.mkdirSync(value.backupRoot)
        fs.writeFileSync(path.join(value.backupRoot, 'keep.txt'), 'prior recovery backup')
        fakeLaunch(value)
        await expect(runFullApplicationUpgrade(value)).rejects.toThrow('backup directory already exists')
        expectOriginal(value)
        expect(fs.readFileSync(path.join(value.backupRoot, 'keep.txt'), 'utf8')).toBe('prior recovery backup')
    })

    it('finishes successful replacement and does not attempt rollback', async () => {
        const value = fixture()
        value.healthTimeoutMs = 2000
        fakeLaunch(value)
        vi.stubGlobal('fetch', vi.fn(async () => Response.json({ appVersion: value.targetVersion })))
        await runFullApplicationUpgrade(value)
        expect(fs.readFileSync(path.join(value.applicationRoot, 'Pica Library.exe'), 'utf8')).toBe('candidate')
        expect(fs.existsSync(value.backupRoot)).toBe(false)
        expect(spawn).toHaveBeenCalledTimes(1)
        expect(JSON.parse(fs.readFileSync(value.progressFile, 'utf8')).phase).toBe('complete')
    })

    it('retains a proven healthy installation when final status writes fail', async () => {
        const value = fixture()
        value.healthTimeoutMs = 2000
        fakeLaunch(value)
        vi.stubGlobal('fetch', vi.fn(async () => Response.json({ appVersion: value.targetVersion })))
        const write = fs.writeFileSync
        vi.spyOn(fs, 'writeFileSync').mockImplementation((target, bytes, options) => {
            if (target === value.progressFile && String(bytes).includes('"phase":"complete"')) throw new Error('synthetic final-status EACCES')
            return write(target, bytes, options)
        })
        await runFullApplicationUpgrade(value)
        expect(fs.readFileSync(path.join(value.applicationRoot, 'Pica Library.exe'), 'utf8')).toBe('candidate')
        expect(fs.existsSync(value.backupRoot)).toBe(true)
        expect(spawn).toHaveBeenCalledTimes(1)
    })

    it('does not roll back a healthy installation if automatic browser opening fails', async () => {
        const value = fixture()
        value.healthTimeoutMs = 2000
        value.previousUrl = 'http://127.0.0.1:54122'
        fakeLaunch(value, n => n === 2 ? new Error('synthetic rundll32 failure') : null)
        vi.stubGlobal('fetch', vi.fn(async () => Response.json({ appVersion: value.targetVersion })))
        await runFullApplicationUpgrade(value)
        expect(fs.readFileSync(path.join(value.applicationRoot, 'Pica Library.exe'), 'utf8')).toBe('candidate')
        expect(fs.existsSync(value.backupRoot)).toBe(false)
        expect(spawn.mock.calls[1][0]).toBe('rundll32.exe')
    })
})
