import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    prepareHelperStartup,
    startUpgradeHelper,
    waitForHelperReady,
    type HelperReadiness
} from '../../src/update/helper-startup'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn }))
const roots: string[] = []
function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-helper-startup-'))
    roots.push(root)
    const readyNonce = '11111111-2222-3333-4444-555555555555'
    const input: HelperReadiness = {
        readyNonce,
        readyFile: path.join(root, `helper-ready-${readyNonce}.json`),
        progressFile: path.join(root, 'progress.json'),
        parentPid: 9876543
    }
    const child = Object.assign(new EventEmitter(), {
        pid: 9876542,
        exitCode: null as number | null,
        signalCode: null,
        unref: vi.fn(),
        kill: vi.fn(() => {
            queueMicrotask(() => {
                child.exitCode = 1
                child.emit('exit', 1, null)
            })
            return true
        })
    })
    const ready = (overrides: Record<string, unknown> = {}) =>
        fs.writeFileSync(
            input.readyFile!,
            JSON.stringify({
                schemaVersion: 1,
                kind: 'incremental',
                nonce: input.readyNonce,
                parentPid: input.parentPid,
                pid: child.pid,
                ...overrides
            })
        )
    return { root, input, child, ready }
}
beforeEach(() => spawn.mockReset())
afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('upgrade helper startup and parent acknowledgement', () => {
    it('rejects asynchronous OS spawn failure before reporting accepted', async () => {
        const f = fixture()
        spawn.mockImplementation(() => {
            queueMicrotask(() =>
                f.child.emit('error', new Error('synthetic helper EACCES'))
            )
            return f.child
        })
        await expect(
            startUpgradeHelper(
                'synthetic-node',
                ['helper.js'],
                {},
                f.input,
                'incremental'
            )
        ).rejects.toThrow('synthetic helper EACCES')
        expect(f.child.unref).not.toHaveBeenCalled()
        expect(f.child.kill).not.toHaveBeenCalled()
        expect(fs.existsSync(f.input.readyFile! + '.accepted')).toBe(false)
    })
    it('accepts only a ready record bound to the new helper PID, nonce, parent and mode', async () => {
        const f = fixture()
        spawn.mockImplementation(() => {
            queueMicrotask(() => {
                f.child.emit('spawn')
                f.ready()
            })
            return f.child
        })
        await startUpgradeHelper(
            'synthetic-node',
            ['helper.js'],
            { cwd: f.root },
            f.input,
            'incremental'
        )
        expect(
            JSON.parse(
                fs.readFileSync(f.input.readyFile! + '.accepted', 'utf8')
            )
        ).toMatchObject({ pid: f.child.pid, nonce: f.input.readyNonce })
        expect(f.child.unref).toHaveBeenCalledTimes(1)
        expect(f.child.kill).not.toHaveBeenCalled()
    })
    it.each([
        { pid: 1 },
        { nonce: 'stale' },
        { parentPid: 1 },
        { kind: 'full-application' }
    ])(
        'rejects stale/mismatched readiness %j and stops only its own child',
        async (overrides) => {
            const f = fixture()
            spawn.mockImplementation(() => {
                queueMicrotask(() => {
                    f.child.emit('spawn')
                    f.ready(overrides)
                })
                return f.child
            })
            await expect(
                startUpgradeHelper(
                    'synthetic-node',
                    ['helper.js'],
                    {},
                    f.input,
                    'incremental'
                )
            ).rejects.toThrow('does not match')
            expect(f.child.kill).toHaveBeenCalledTimes(1)
            expect(fs.existsSync(f.input.readyFile! + '.accepted')).toBe(false)
        }
    )
    it('detects a helper that exited immediately after spawn without treating its OS spawn as readiness', async () => {
        const f = fixture()
        spawn.mockImplementation(() => {
            queueMicrotask(() => {
                f.child.emit('spawn')
                f.child.exitCode = 2
                f.child.emit('exit', 2, null)
            })
            return f.child
        })
        await expect(
            startUpgradeHelper(
                'synthetic-node',
                ['helper.js'],
                {},
                f.input,
                'incremental'
            )
        ).rejects.toThrow('exited before startup confirmation')
        expect(f.child.kill).not.toHaveBeenCalled()
        expect(fs.existsSync(f.input.readyFile! + '.accepted')).toBe(false)
    })
    it('bounds missing readiness and terminates only the unconfirmed spawned child', async () => {
        vi.useFakeTimers()
        const f = fixture()
        spawn.mockImplementation(() => {
            queueMicrotask(() => f.child.emit('spawn'))
            return f.child
        })
        const result = startUpgradeHelper(
            'synthetic-node',
            ['helper.js'],
            {},
            f.input,
            'incremental'
        ).then(
            () => null,
            (error) => error
        )
        await vi.advanceTimersByTimeAsync(16_000)
        expect((await result).message).toContain('timed out')
        expect(f.child.kill).toHaveBeenCalledTimes(1)
        expect(fs.existsSync(f.input.readyFile! + '.accepted')).toBe(false)
    })
    it('requires the parent acknowledgement before a helper may start waiting to replace the application', async () => {
        const f = fixture()
        // This test only exchanges private synthetic files; it never kills this PID.
        f.child.pid = process.pid
        const ready = prepareHelperStartup(f.input, 'incremental', 1000)
        await waitForHelperReady(
            f.child as unknown as ChildProcess,
            f.input,
            'incremental',
            1000
        )
        await ready
        expect(f.child.kill).not.toHaveBeenCalled()
    })
    it('an unacknowledged helper expires without gaining authority to mutate files or relaunch an app', async () => {
        const f = fixture()
        await expect(
            prepareHelperStartup(f.input, 'incremental', 20)
        ).rejects.toThrow('was not accepted')
        expect(fs.existsSync(f.input.readyFile!)).toBe(true)
        expect(fs.existsSync(f.input.readyFile! + '.accepted')).toBe(false)
        expect(spawn).not.toHaveBeenCalled()
    })
    it('retains legacy direct-helper use without silently inventing an acknowledgement', async () => {
        const f = fixture()
        await prepareHelperStartup(
            {
                parentPid: f.input.parentPid,
                progressFile: f.input.progressFile
            },
            'incremental'
        )
        expect(fs.readdirSync(f.root)).toEqual([])
    })
})
