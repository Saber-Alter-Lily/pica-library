import fs from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { runtimeChoiceProcessState } from '../../scripts/lib/runtime-choice-fixture.mjs'

describe('runtime-choice teardown never treats missing executable identity as absence or kill authority', () => {
    it('requires an actually absent CIM row, keeping null path unidentified', () => {
        const owned = vi.fn(() => true)
        expect(runtimeChoiceProcessState(null, 41, owned)).toBe('absent')
        expect(runtimeChoiceProcessState({ ProcessId: 41, ExecutablePath: null }, 41, owned)).toBe('unidentified')
        expect(runtimeChoiceProcessState({ ProcessId: 41, ExecutablePath: '' }, 41, owned)).toBe('unidentified')
        expect(owned).not.toHaveBeenCalled()
    })
    it('retains exact path ownership and rejects foreign or mismatched process records', () => {
        expect(runtimeChoiceProcessState({ ProcessId: 41, ExecutablePath: 'owned' }, 41, (value: string) => value === 'owned')).toBe('owned')
        expect(() => runtimeChoiceProcessState({ ProcessId: 41, ExecutablePath: 'foreign' }, 41, () => false)).toThrow('Refuse process outside exact owned root')
        expect(() => runtimeChoiceProcessState({ ProcessId: 42, ExecutablePath: 'owned' }, 41, () => true)).toThrow('Unexpected process identity')
        expect(() => runtimeChoiceProcessState(null, 0, () => true)).toThrow()
    })
    // Execute the actual driver's function body with inert process/CIM/clock ports,
    // not a duplicate teardown implementation and never a real listener or process.
    function harness(states: string[]) {
        const source = fs.readFileSync('scripts/test-windows-runtime-choice.mjs', 'utf8')
        const start = source.indexOf('async function stopOwned() {'), end = source.indexOf('\ntry {\n    result.step', start)
        expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start)
        const kill = vi.fn(), sleep = vi.fn(async () => {}), observe = vi.fn(() => states.length > 1 ? states.shift() : states[0])
        const run = vm.runInNewContext('(' + source.slice(start, end).trim() + ')', {
            events: () => [{ pid: 41 }], launcher: undefined,
            fs: { readFileSync: () => { throw Object.assign(new Error('No published instance'), { code: 'ENOENT' }) } },
            instanceFile: 'inert', ownedPid: observe, sleep, process: { kill },
            assert: { equal: (actual: unknown, expected: unknown, message: string) => { if (actual !== expected) throw Error(message) } }
        })
        return { run, kill, sleep, observe }
    }
    it('allows unidentified-to-absent observation without killing or claiming early absence', async () => {
        const h = harness(['unidentified', 'unidentified', 'absent'])
        await h.run()
        expect(h.kill).not.toHaveBeenCalled(); expect(h.sleep).toHaveBeenCalledTimes(2)
    })
    it('retains failure and files when identity remains unknown after the original bounded waits', async () => {
        const h = harness(['unidentified'])
        await expect(h.run()).rejects.toThrow('remains or cannot be identified')
        expect(h.kill).not.toHaveBeenCalled(); expect(h.sleep).toHaveBeenCalledTimes(150)
    })
    it('only terminates an identified owned process and waits through a terminating null-path row', async () => {
        const h = harness([...Array(51).fill('owned'), 'unidentified', 'absent'])
        await h.run()
        expect(h.kill).toHaveBeenCalledTimes(1); expect(h.kill).toHaveBeenCalledWith(41)
        expect(h.sleep).toHaveBeenCalledTimes(51)
    })
    it('propagates foreign-process refusal instead of killing or swallowing it', async () => {
        const h = harness(['owned'])
        h.observe.mockImplementation(() => { throw Error('Refuse process outside exact owned root') })
        await expect(h.run()).rejects.toThrow('Refuse process outside exact owned root')
        expect(h.kill).not.toHaveBeenCalled()
    })
})
