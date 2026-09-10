import { describe, expect, it } from 'vitest'
import {
    loadTagRegistryV3,
    resolveTagV3
} from '../../src/recommendation-v3/tag-resolution-v3'

describe('R1.9 resolution metadata contract', () => {
    const registry = loadTagRegistryV3('src/data/registry-v3-final')

    it('keeps semantic and safety resolution types orthogonal', () => {
        expect(resolveTagV3('MOB (路人)', registry).resolutionType).toBe(
            'SEMANTIC'
        )
        expect(
            resolveTagV3('間諜過家家（SPY×FAMILY）', registry).resolutionType
        ).toBe('SEMANTIC')
        expect(resolveTagV3('女高中生(JK)', registry).resolutionType).toBe(
            'SAFETY'
        )
        expect(resolveTagV3('C87', registry).resolutionType).toBe('SEMANTIC')
    })

    it('adapts V3 semantic metadata and entity facets', () => {
        for (const tag of ['雌墜', '產卵', 'ABO', 'C87']) {
            const result = resolveTagV3(tag, registry)
            expect(result.resolutionStatus).toBe('RESOLVED')
            expect(result.canonicalLabel).not.toBe('')
            expect(result.facet).not.toBe('')
            expect(result.recommendationRole).not.toBe('')
            expect(result.retrievalUtility).not.toBe('')
            expect(result.safetyStatus).not.toBe('')
        }
        const entity = resolveTagV3('東方: 靈夢', registry)
        expect(entity.resolutionType).toBe('ENTITY')
        expect(entity.facet).toBe('FANDOM_CHARACTER')
        expect(entity.recommendationEligible).toBe(false)
        expect(entity.retrievalUtility).toBe('PROFILE_ONLY')
    })

    it('preserves alias target metadata and open-world behavior', () => {
        const alias = resolveTagV3('強奸', registry)
        expect(alias.resolutionType).toBe('ALIAS')
        expect(alias.canonicalLabel).toBe('強暴')
        expect(alias.facet).not.toBe('')
        expect(
            resolveTagV3('r1.9 synthetic unknown', registry).resolutionStatus
        ).toBe('UNRESOLVED')
    })
})
