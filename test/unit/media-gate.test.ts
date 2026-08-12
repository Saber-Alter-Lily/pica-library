import { describe, expect, it } from 'vitest'
import { MediaRequestGate } from '../../src/core/downloads/media-gate'

describe('shared media request gate', () => {
    it('caps media transfers globally across three jobs', async () => {
        const gate = new MediaRequestGate(4, 0)
        let active = 0
        let peak = 0
        const job = () =>
            Promise.all(
                Array.from({ length: 6 }, () =>
                    gate.run(async () => {
                        active += 1
                        peak = Math.max(peak, active)
                        await new Promise((resolve) => setTimeout(resolve, 5))
                        active -= 1
                    })
                )
            )
        await Promise.all([job(), job(), job()])
        expect(peak).toBeLessThanOrEqual(4)
    })

    it('spaces actual request starts', async () => {
        const gate = new MediaRequestGate(3, 20)
        const starts: number[] = []
        await Promise.all(
            Array.from({ length: 4 }, () =>
                gate.run(async () => {
                    starts.push(Date.now())
                })
            )
        )
        const gaps = starts
            .slice(1)
            .map((start, index) => start - starts[index])
        expect(gaps.every((gap) => gap >= 15)).toBe(true)
    })
})
