import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fullUpgradeInternals } from '../../src/update/full-upgrader'
import type { FullApplicationUpdaterInstruction } from '../../src/update/types'

const roots: string[] = []

function fixture(): FullApplicationUpdaterInstruction {
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-upgrade-recovery-')
    )
    roots.push(root)
    return {
        parentPid: 9_876_543,
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
        healthTimeoutMs: 100
    }
}

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('full application recovery safety', () => {
    it('prefers authenticated loopback shutdown and waits for the published process to exit', async () => {
        const value = fixture()
        fs.writeFileSync(
            value.instanceFile,
            JSON.stringify({
                pid: value.parentPid,
                url: 'http://127.0.0.1:54123'
            })
        )
        let running = true
        const kill = vi
            .spyOn(process, 'kill')
            .mockImplementation((pid, signal) => {
                expect(pid).toBe(value.parentPid)
                expect(signal).toBe(0)
                if (!running) throw new Error('synthetic ESRCH')
                return true
            })
        const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
            if (input.endsWith('/status'))
                return Response.json({ csrfToken: 'fixture-csrf' })
            expect(input).toBe('http://127.0.0.1:54123/api/v1/desktop/shutdown')
            expect(init).toMatchObject({
                method: 'POST',
                headers: {
                    'x-pica-csrf': 'fixture-csrf',
                    Origin: 'http://127.0.0.1:54123'
                }
            })
            running = false
            return Response.json({ success: true })
        })
        vi.stubGlobal('fetch', fetchMock)
        await fullUpgradeInternals.stopPublishedInstance(value.instanceFile)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(kill.mock.calls.every(([, signal]) => signal === 0)).toBe(true)
    })

    it('uses the PID fallback when the local controller is unavailable and verifies exit', async () => {
        const value = fixture()
        fs.writeFileSync(
            value.instanceFile,
            JSON.stringify({
                pid: value.parentPid,
                url: 'https://external.invalid'
            })
        )
        let running = true
        const kill = vi
            .spyOn(process, 'kill')
            .mockImplementation((pid, signal) => {
                expect(pid).toBe(value.parentPid)
                if (!running) throw new Error('synthetic ESRCH')
                if (signal !== 0) running = false
                return true
            })
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        await fullUpgradeInternals.stopPublishedInstance(value.instanceFile)
        expect(fetchMock).not.toHaveBeenCalled()
        expect(kill.mock.calls).toEqual([
            [value.parentPid, 0],
            [value.parentPid],
            [value.parentPid, 0]
        ])
    })

    it('does not remove the installed tree when the application backup is missing', () => {
        const value = fixture()
        fs.mkdirSync(value.applicationRoot)
        const sentinel = path.join(value.applicationRoot, 'retain-me.txt')
        fs.writeFileSync(sentinel, 'current application')
        expect(() => fullUpgradeInternals.rollbackApplication(value)).toThrow(
            /backup is unavailable/
        )
        expect(fs.readFileSync(sentinel, 'utf8')).toBe('current application')
    })

    it('bounds Windows removal retries and retains a healthy installation on recovery-cleanup failure', () => {
        const value = fixture()
        fs.mkdirSync(value.applicationRoot)
        const sentinel = path.join(value.applicationRoot, 'retain-me.txt')
        fs.writeFileSync(sentinel, 'healthy application')
        const snapshot = path.join(value.bootstrapRoot, 'user-state-snapshot')
        const remove = vi.spyOn(fs, 'rmSync').mockImplementation(() => {
            throw new Error('synthetic EPERM')
        })
        fullUpgradeInternals.cleanupHealthyRecovery(value, snapshot)
        expect(remove).toHaveBeenCalledTimes(1)
        expect(remove).toHaveBeenCalledWith(value.backupRoot, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 100
        })
        expect(fs.readFileSync(sentinel, 'utf8')).toBe('healthy application')
        expect(
            JSON.parse(fs.readFileSync(value.progressFile, 'utf8'))
        ).toMatchObject({
            phase: 'complete',
            message: expect.stringContaining('retained')
        })
    })
})
