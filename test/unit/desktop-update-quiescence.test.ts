import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstanceLock } from '../../src/desktop/instance'
import {
    DesktopUpgradeQuiescenceError,
    requireDesktopUpgradeQuiescence,
    type DesktopUpgradeQuiescencePort
} from '../../src/desktop/update-quiescence'
import { applyUpdateAndScheduleShutdown } from
    '../../src/desktop/update-command'

type Fixture = {
    root: string
    instance: InstanceLock
    port: DesktopUpgradeQuiescencePort & { leases: string[] }
}
const fixtures: Fixture[] = []
afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    for (const f of fixtures.splice(0)) {
        try { f.instance.release() } catch { /* tampering must fail closed */ }
        fs.rmSync(f.root, { recursive: true, force: true })
    }
})

function fixture(): Fixture {
    const root = fs.mkdtempSync(path.join(os.tmpdir(),
        'pica-update-quiescence-qa-'))
    const state = path.join(root, 'runtime-state')
    fs.mkdirSync(state)
    const instance = new InstanceLock(
        path.join(state, 'instance.lock'),
        path.join(state, 'instance.json'),
        { recoverStale: false }
    )
    expect(instance.acquire()).toBe(true)
    const leases: string[] = []
    const port = {
        ownership: instance,
        engineReady: true,
        stopping: false,
        hasDatabase: true,
        hasService: true,
        leases,
        activeWorkLeases: () => leases
    }
    const f = { root, instance, port }
    fixtures.push(f)
    return f
}

describe('actual Desktop update helper handoff preflight, no production migration', () => {
    it('accepts only a truly held real InstanceLock and an idle loaded engine', () => {
        const f = fixture()
        expect(() => requireDesktopUpgradeQuiescence(f.port)).not.toThrow()
        f.instance.release()
        expect(() => requireDesktopUpgradeQuiescence(f.port))
            .toThrow('DESKTOP_INSTANCE_OWNERSHIP')
    })

    it.each([
        ['engine not ready', { engineReady: false }],
        ['shutdown already started', { stopping: true }],
        ['database not initialized', { hasDatabase: false }],
        ['library service not initialized', { hasService: false }]
    ])('fails closed when %s', (_, change) => {
        const f = fixture()
        expect(() => requireDesktopUpgradeQuiescence({ ...f.port, ...change }))
            .toThrow(DesktopUpgradeQuiescenceError)
    })

    it.each([
        'local-downloads',
        'favorites-sync',
        'recommendation-build',
        'remote-sync',
        'browser-lite-export',
        'source-host-inspection',
        'saved-source-host-inspection',
        'host-library-reader',
        'mobile-bridge-activity',
        'runtime:filesystem-heavy'
    ])('blocks an existing Desktop active lease: %s', lease => {
        const f = fixture()
        f.port.leases.push(lease)
        expect(() => requireDesktopUpgradeQuiescence(f.port))
            .toThrow('Finish, pause and fully stop active work')
        expect(fs.readFileSync(f.instance.lockFile, 'utf8'))
            .toBe(String(process.pid))
    })

    it('does not treat PAUSED work as quiescent if the original collector reports a lease', () => {
        const f = fixture()
        f.port.leases.push('remote-sync')
        expect(() => requireDesktopUpgradeQuiescence(f.port))
            .toThrow('Finish, pause and fully stop active work')
        f.port.leases.pop()
        expect(() => requireDesktopUpgradeQuiescence(f.port)).not.toThrow()
    })

    it('rejects missing/unknown activity data and status collector failures', () => {
        const f = fixture()
        const badPorts = [
            { ...f.port, activeWorkLeases: () => { throw Error('incomplete runtime snapshot') } },
            { ...f.port, activeWorkLeases: () => null as unknown as string[] },
            { ...f.port, activeWorkLeases: () => [null as unknown as string] }
        ]
        for (const value of badPorts) {
            expect(() => requireDesktopUpgradeQuiescence(value))
                .toThrow(DesktopUpgradeQuiescenceError)
        }
    })

    it('refuses a lost instance ownership detected on the second check', () => {
        const f = fixture()
        const calls: string[] = []
        const guard = {
            ...f.port,
            ownership: {
                assertHeld: () => {
                    calls.push('assert')
                    if (calls.filter(entry => entry === 'assert').length === 2)
                        throw new Error('OWNER_LOST')
                }
            },
            activeWorkLeases: () => {
                calls.push('snapshot')
                return [] as string[]
            }
        }
        expect(() => requireDesktopUpgradeQuiescence(guard))
            .toThrow('OWNER_LOST')
        expect(calls).toEqual(['assert', 'snapshot', 'assert'])
    })

    it('never starts helper or schedules shutdown if active work or ownership prevents handoff', async () => {
        const f = fixture()
        f.port.leases.push('local-downloads')
        vi.useFakeTimers()
        const commands = { apply: vi.fn(async () => ({ accepted: true })) }
        const shutdown = vi.fn()
        const original = fs.readFileSync(f.instance.lockFile)
        const before = applyUpdateAndScheduleShutdown(
            commands, 'fixture-id',
            { desktopHomeRoot: f.root, libraryDirectory: f.root },
            shutdown, () => requireDesktopUpgradeQuiescence(f.port)
        )
        await expect(before).rejects.toThrow('Finish, pause')
        expect(commands.apply).not.toHaveBeenCalled()
        expect(shutdown).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1000)
        expect(fs.readFileSync(f.instance.lockFile)).toEqual(original)
        f.port.leases.pop()

        // A refused preflight must not poison future update attempts.
        const retry = applyUpdateAndScheduleShutdown(
            commands, 'fixture-id',
            { desktopHomeRoot: f.root, libraryDirectory: f.root },
            shutdown, () => requireDesktopUpgradeQuiescence(f.port)
        )
        await expect(retry).resolves.toMatchObject({accepted:true})
        expect(commands.apply).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(150)
        expect(shutdown).toHaveBeenCalledTimes(1)
    })

    it('deduplicates repeated apply requests and runs readiness check once', async () => {
        const f = fixture()
        const admission = vi.fn(() => requireDesktopUpgradeQuiescence(f.port))
        const command = { apply: vi.fn(async () => ({accepted:true})) }
        const stop = vi.fn()
        vi.useFakeTimers()
        const args = [
            command, 'upgrade-1',
            {desktopHomeRoot:f.root,libraryDirectory:f.root},
            stop, admission
        ] as const
        const first = applyUpdateAndScheduleShutdown(...args)
        const next = applyUpdateAndScheduleShutdown(...args)
        expect(first).toBe(next)
        await first
        expect(admission).toHaveBeenCalledTimes(1)
        expect(command.apply).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(150)
        expect(stop).toHaveBeenCalledTimes(1)
    })

    it('wires the preflight to the REAL Desktop one-click handler, not an inert test-only copy', () => {
        const source = fs.readFileSync('src/desktop/main.ts', 'utf8')
        expect(source).toContain('requireDesktopUpgradeQuiescence')
        expect(source).toMatch(/applyUpdate:[\s\S]{0,550}ownership: instance/)
        expect(source).toMatch(/applyUpdate:[\s\S]{0,850}activeWorkLeases: activeDesktopWorkLeases/)
        expect(source).toContain('service?.quiesceLocalDownloads()')
        const preflight = fs.readFileSync(
            'src/desktop/update-quiescence.ts','utf8')
        expect(preflight).not.toMatch(/fs\.(?:rm|unlink|rename|writeFile|copyFile)Sync\(/)
        expect(preflight).not.toMatch(/process\.(?:exit|kill)\(/)
    })
})
