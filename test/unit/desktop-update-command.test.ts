import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyUpdateAndScheduleShutdown } from '../../src/desktop/update-command'
afterEach(() => {
    vi.useRealTimers()
})
const context = {
    desktopHomeRoot: 'synthetic-home',
    libraryDirectory: 'synthetic-library'
}
describe('Desktop update command shutdown authority', () => {
    it('deduplicates host apply and shutdown even when the same ready command is clicked twice', async () => {
        vi.useFakeTimers()
        const apply = vi.fn(async () => ({ accepted: true })),
            commands = { apply },
            stop = vi.fn()
        const first = applyUpdateAndScheduleShutdown(
            commands,
            'fixture',
            context,
            stop
        )
        expect(
            applyUpdateAndScheduleShutdown(commands, 'fixture', context, stop)
        ).toBe(first)
        await first
        await vi.advanceTimersByTimeAsync(1000)
        expect(apply).toHaveBeenCalledTimes(1)
        expect(stop).toHaveBeenCalledTimes(1)
    })
    it('keeps the current app alive while helper startup is pending, then uses the existing delayed shutdown', async () => {
        vi.useFakeTimers()
        let accept!: (value: Record<string, unknown>) => void
        const apply = vi.fn(
                () =>
                    new Promise<Record<string, unknown>>((resolve) => {
                        accept = resolve
                    })
            ),
            stop = vi.fn()
        const result = applyUpdateAndScheduleShutdown(
            { apply },
            'fixture',
            context,
            stop
        )
        await vi.advanceTimersByTimeAsync(1000)
        expect(stop).not.toHaveBeenCalled()
        accept({
            accepted: true,
            mode: 'incremental',
            targetVersion: 'fixture'
        })
        await expect(result).resolves.toMatchObject({ accepted: true })
        await vi.advanceTimersByTimeAsync(149)
        expect(stop).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(stop).toHaveBeenCalledTimes(1)
        expect(apply).toHaveBeenCalledWith('fixture', context)
    })
    it('does not schedule shutdown when helper startup fails', async () => {
        vi.useFakeTimers()
        const stop = vi.fn(),
            apply = vi.fn(async () => {
                throw new Error('helper not ready')
            })
        await expect(
            applyUpdateAndScheduleShutdown({ apply }, 'fixture', context, stop)
        ).rejects.toThrow('helper not ready')
        await vi.advanceTimersByTimeAsync(30_000)
        expect(stop).not.toHaveBeenCalled()
    })
})
