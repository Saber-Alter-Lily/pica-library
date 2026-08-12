import { describe, expect, it } from 'vitest'
import { assertTransition, canTransition } from '../../src/core/downloads/state-machine'

describe('download state machine', () => {
    it('allows the normal lifecycle and operator controls', () => {
        expect(canTransition('DRAFT', 'QUEUED')).toBe(true)
        expect(canTransition('RUNNING', 'PAUSED')).toBe(true)
        expect(canTransition('PAUSED', 'QUEUED')).toBe(true)
        expect(canTransition('FAILED', 'QUEUED')).toBe(true)
    })

    it('rejects impossible transitions', () => {
        expect(() => assertTransition('COMPLETED', 'RUNNING')).toThrow(
            'COMPLETED -> RUNNING'
        )
        expect(() => assertTransition('DRAFT', 'COMPLETED')).toThrow(
            'DRAFT -> COMPLETED'
        )
    })
})
