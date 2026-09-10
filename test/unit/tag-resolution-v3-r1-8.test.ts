import { describe, expect, it } from 'vitest'
import {
    loadTagRegistryV3,
    resolveTagV3
} from '../../src/recommendation-v3/tag-resolution-v3'

describe('R1.8 V2/V3 union lookup', () => {
    const registry = loadTagRegistryV3('src/data/registry-v3-final')

    it('resolves reviewed V2 canonical spellings that had truncated normalized cells', () => {
        for (const tag of [
            '女高中生(JK)',
            '女中學生(JC)',
            '女大學生(JD)',
            '間諜過家家（SPY×FAMILY）',
            'MOB (路人)',
            '男大學生(DD)'
        ]) {
            expect(resolveTagV3(tag, registry).resolutionStatus).toBe(
                'RESOLVED'
            )
        }
    })

    it('keeps age-coded V2 safety exclusion in force', () => {
        const result = resolveTagV3('女高中生(JK)', registry)
        expect(result.recommendationEligible).toBe(false)
        expect(result.safetyStatus).toBe('BLOCK_MINOR_EXPLICIT')
    })

    it('does not resolve open-world unknowns', () => {
        expect(
            resolveTagV3('r1.8 synthetic unknown', registry).resolutionStatus
        ).toBe('UNRESOLVED')
    })
})
