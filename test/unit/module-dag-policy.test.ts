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
                file === 'src/services/external-reader-adapter.ts' ||
                file === 'src/source-extensions/trusted-process.ts' ||
                file === 'src/source-extensions/signed-worker-store.ts'
            )
            expect(forbidden, entry + ' runtime dependency closure').toEqual([])
        }
    })

    it('keeps privileged worker IPC outside Reader and concrete provider SDKs', () => {
        const graph = collectSourceModuleGraph()
        const workerImports = graph.edges.filter((edge) =>
            edge.from === 'src/source-extensions/trusted-process.ts' &&
            !edge.typeOnly
        ).map((edge) => edge.to).sort()
        expect(workerImports).toEqual([
            'node:child_process',
            'node:crypto',
            'node:fs',
            'node:path',
            'src/source-extensions/reader-contract.ts'
        ])
        expect(graph.edges.filter((edge) =>
            edge.from === 'src/services/reader-service.ts' ||
            edge.from === 'src/services/online-reader-service.ts'
        ).some((edge) =>
            edge.to === 'src/source-extensions/trusted-process.ts'
        )).toBe(false)
    })

    it('keeps the signed lifecycle store restricted to Node crypto/filesystem and source ports', () => {
        const graph = collectSourceModuleGraph()
        expect(graph.nodes).toContain('src/source-extensions/signed-worker-store.ts')
        const runtime = graph.edges.filter(edge =>
            edge.from === 'src/source-extensions/signed-worker-store.ts' &&
            !edge.typeOnly
        ).map(edge => edge.to).sort()
        expect(runtime).toEqual([
            'node:crypto',
            'node:fs',
            'node:path',
            'src/source-extensions/reader-contract.ts',
            'src/source-extensions/trusted-process.ts'
        ])
        expect(graph.edges.some(edge =>
            (edge.from === 'src/services/reader-service.ts' ||
                edge.from === 'src/services/online-reader-service.ts') &&
            edge.to === 'src/source-extensions/signed-worker-store.ts'
        )).toBe(false)
    })

    it('keeps the default Desktop HTTP server free of signed worker process execution', () => {
        const graph = collectSourceModuleGraph()
        expect(graph.nodes).toContain('src/source-extensions/signed-reader-errors.ts')
        expect(graph.edges).toContainEqual({
            from: 'src/library/server.ts',
            to: 'src/source-extensions/signed-reader-errors.ts',
            typeOnly: false
        })
        expect(graph.edges).toContainEqual({
            from: 'src/library/server.ts',
            to: 'src/desktop/signed-source-reader.ts',
            typeOnly: true
        })
        const adjacency = new Map<string, string[]>()
        for (const edge of graph.edges) {
            if (edge.typeOnly || !edge.to.startsWith('src/')) continue
            const dependencies = adjacency.get(edge.from) ?? []
            dependencies.push(edge.to)
            adjacency.set(edge.from, dependencies)
        }
        const visited = new Set(['src/library/server.ts'])
        const queue = [...visited]
        for (const from of queue) {
            for (const to of adjacency.get(from) ?? []) {
                if (visited.has(to)) continue
                visited.add(to)
                queue.push(to)
            }
        }
        for (const privileged of [
            'src/desktop/signed-source-reader.ts',
            'src/source-extensions/trusted-process.ts',
            'src/source-extensions/signed-worker-store.ts'
        ]) {
            expect(visited.has(privileged), 'Server eagerly imports ' + privileged)
                .toBe(false)
        }
        expect(moduleBoundaryViolations([
            {
                from: 'src/library/server.ts',
                to: 'src/desktop/signed-source-reader.ts',
                typeOnly: false
            },
            {
                from: 'src/source-extensions/signed-reader-errors.ts',
                to: 'node:child_process',
                typeOnly: false
            }
        ])).toHaveLength(2)
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
            },
            {
                from: 'src/services/online-reader-service.ts',
                to: 'src/source-extensions/trusted-process.ts',
                typeOnly: false
            },
            {
                from: 'src/services/reader-service.ts',
                to: 'src/source-extensions/signed-worker-store.ts',
                typeOnly: false
            },
            {
                from: 'src/source-extensions/signed-worker-store.ts',
                to: 'src/sdk.ts',
                typeOnly: false
            }
        ]
        expect(moduleBoundaryViolations(illegal)).toHaveLength(10)
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
