import { describe, expect, it } from 'vitest'
import {
    collectSourceModuleGraph,
    moduleBoundaryViolations,
    type DependencyEdge
} from '../../scripts/audit-modules'

describe('S2 actual TypeScript module ownership graph', () => {
    it('builds a complete source AST import graph and rejects new protected reverse imports', () => {
        const graph = collectSourceModuleGraph()
        expect(graph.nodes.length).toBeGreaterThan(100)
        expect(graph.edges.length).toBeGreaterThan(graph.nodes.length)
        expect(graph.nodes).toContain('src/services/provider-service.ts')
        expect(graph.nodes).toContain('src/services/online-reader-service.ts')
        expect(graph.nodes).toContain('src/services/reader-service.ts')
        expect(graph.edges).not.toContainEqual({
            from: 'src/services/reader-service.ts',
            to: 'src/services/external-reader-adapter.ts',
            typeOnly: false
        })
        expect(graph.edges).toContainEqual({
            from: 'src/library/server.ts',
            to: 'src/services/external-reader-adapter.ts',
            typeOnly: false
        })
        expect(graph.nodes).toContain('src/source-extensions/reader-contract.ts')
        // The concrete factory is now the sole runtime source composition seam.
        // ProviderRegistry remains a type-only import in the consuming service.
        expect(graph.edges).toContainEqual({
            from: 'src/services/provider-service.ts',
            to: 'src/providers/compiled-composition.ts',
            typeOnly: false
        })
        expect(graph.edges).toContainEqual({
            from: 'src/services/provider-service.ts',
            to: 'src/providers/provider-registry.ts',
            typeOnly: true
        })
        expect(moduleBoundaryViolations(graph.edges)).toEqual([])
    })

    it('detects real coupling without falsely calling the current core source-free', () => {
        const graph = collectSourceModuleGraph()
        const providerImports = graph.edges.filter((edge) =>
            edge.from === 'src/services/provider-service.ts' &&
            edge.to.startsWith('src/providers/')
        )
        expect(providerImports.length).toBeGreaterThan(0)
        const directSdk = graph.edges.some((edge) =>
            edge.from === 'src/desktop/main.ts' && edge.to === 'src/sdk.ts'
        )
        expect(directSdk).toBe(true)
    })

    it('keeps the full local and online Reader runtime closure free of provider SDKs and Desktop shell', () => {
        const graph = collectSourceModuleGraph()
        const dependencies = new Map<string, string[]>()
        for (const edge of graph.edges) {
            if (edge.typeOnly || !edge.to.startsWith('src/')) continue
            const targets = dependencies.get(edge.from) ?? []
            targets.push(edge.to)
            dependencies.set(edge.from, targets)
        }
        for (const entry of [
            'src/services/reader-service.ts',
            'src/services/online-reader-service.ts',
            'src/source-extensions/desktop-reader-adapter.ts'
        ]) {
            const closure = new Set([entry])
            const queue = [entry]
            for (const file of queue) {
                for (const target of dependencies.get(file) ?? []) {
                    if (closure.has(target)) continue
                    closure.add(target)
                    queue.push(target)
                }
            }
            const forbidden = [...closure].filter((file) =>
                file.startsWith('src/providers/') ||
                file.startsWith('src/desktop/') ||
                file.startsWith('src/source-hosts/') ||
                file === 'src/sdk.ts' ||
                file === 'src/services/provider-service.ts' ||
                file === 'src/services/external-reader-adapter.ts'
            )
            expect(forbidden, entry + ' runtime dependency closure').toEqual([])
        }
    })

    it('fails when concrete SDKs or dynamic loaders cross protected reader boundaries', () => {
        const illegal: DependencyEdge[] = [
            {
                from: 'src/services/online-reader-service.ts',
                to: 'src/providers/jm-provider.ts', typeOnly: false
            },
            {
                from: 'src/reader/progress-writes.ts',
                to: 'src/sdk.ts', typeOnly: true
            },
            {
                from: 'src/source-extensions/reader-contract.ts',
                to: 'node:fs', typeOnly: false
            },
            {
                from: 'src/source-extensions/desktop-reader-adapter.ts',
                to: 'src/providers/pica-provider.ts', typeOnly: false
            },
            {
                from: 'src/services/online-reader-service.ts',
                to: '<runtime-loader>', typeOnly: false
            },
            {
                from: 'src/services/provider-service.ts',
                to: 'src/providers/jm-provider.ts', typeOnly: false
            },
            {
                from: 'src/services/reader-service.ts',
                to: 'src/services/external-reader-adapter.ts',
                typeOnly: false
            }
        ]
        expect(moduleBoundaryViolations(illegal)).toHaveLength(7)
    })

    it('permits only the explicit benign dependency direction for the new bridge', () => {
        expect(moduleBoundaryViolations([
            {
                from: 'src/source-extensions/desktop-reader-adapter.ts',
                to: 'src/source-extensions/reader-contract.ts',
                typeOnly: false
            },
            {
                from: 'src/source-extensions/desktop-reader-adapter.ts',
                to: 'src/services/online-reader-service.ts',
                typeOnly: true
            },
            {
                from: 'src/source-extensions/desktop-reader-adapter.ts',
                to: 'node:buffer',
                typeOnly: false
            }
        ])).toEqual([])
    })
})
