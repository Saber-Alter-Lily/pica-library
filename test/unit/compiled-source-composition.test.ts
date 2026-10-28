import { describe, expect, it, vi } from 'vitest'
import { createCompiledProviderComposition } from '../../src/providers/compiled-composition'
import { EhProvider } from '../../src/providers/eh-provider'
import { JmProvider } from '../../src/providers/jm-provider'
import { SourceRuntime } from '../../src/sources/source-policy'
import { collectSourceModuleGraph } from '../../scripts/audit-modules'

describe('S2 compiled legacy source composition', () => {
    it('keeps the old three sources, URL routes and unprefixed Pica identity intact', () => {
        const connect = vi.fn(async () => {
            throw new Error('Should not connect in a constructor')
        })
        const sourceAccess = new SourceRuntime()
        const composed = createCompiledProviderComposition(connect, sourceAccess)
        expect(connect).not.toHaveBeenCalled()
        expect(composed.registry.manifests().map((m) => m.id)).toEqual([
            'pica', 'eh', 'jm'
        ])
        expect(composed.registry.forComic('old-unprefixed-work').id).toBe('pica')
        expect(composed.registry.forComic('eh:123:abc').id).toBe('eh')
        expect(composed.registry.forComic('jm:123').id).toBe('jm')
        expect(composed.registry.forPageForComic(
            'jm:123', 'jm-page:12:1'
        ).id).toBe('jm')
        expect(() => composed.registry.forPageForComic(
            'eh:123:abc', 'https://example.invalid/foreign.png'
        )).toThrow('Page source does not match comic source')
        expect(sourceAccess.snapshot().enabled).toEqual([])
    })

    it('preserves injected EH/JM adapters without creating substitute instances', () => {
        const eh = new EhProvider()
        const jm = new JmProvider()
        const composed = createCompiledProviderComposition(
            async () => { throw new Error('No login') },
            new SourceRuntime(), { eh, jm }
        )
        expect(composed.eh).toBe(eh)
        expect(composed.jm).toBe(jm)
        expect(composed.registry.get('eh')).toBe(eh)
        expect(composed.registry.get('jm')).toBe(jm)
    })

    it('keeps the concrete constructors at the composition root, not in ProviderService or Reader', () => {
        const graph = collectSourceModuleGraph()
        const serviceRuntimeEdges = graph.edges.filter((edge) =>
            edge.from === 'src/services/provider-service.ts' && !edge.typeOnly
        ).map((edge) => edge.to)
        expect(serviceRuntimeEdges).toContain(
            'src/providers/compiled-composition.ts'
        )
        for (const target of [
            'src/providers/pica-provider.ts',
            'src/providers/eh-provider.ts',
            'src/providers/jm-provider.ts'
        ]) expect(serviceRuntimeEdges).not.toContain(target)

        const sourceCompositionEdges = graph.edges.filter((edge) =>
            edge.from === 'src/providers/compiled-composition.ts' &&
            !edge.typeOnly
        ).map((edge) => edge.to)
        expect(sourceCompositionEdges).toEqual(expect.arrayContaining([
            'src/providers/pica-provider.ts',
            'src/providers/eh-provider.ts',
            'src/providers/jm-provider.ts'
        ]))
    })
})
