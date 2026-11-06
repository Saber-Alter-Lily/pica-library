import fs from 'node:fs'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { build } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import { shadowPipelineModelVersionV5 } from '../../src/recommendation-v5/shadow-pipeline'
import { recommendationShadowPortsV5 } from '../../src/services/recommendation-shadow-adapter'
import type { RecommendationShadowAuditInputV5 } from '../../src/recommendation/shadow-ports-v5'
import { SHADOW_ORACLE_SOURCE_V5 } from '../fixtures/recommendation-shadow-legacy'
import authority from '../fixtures/recommendation-shadow-legacy-authority.json'
import {
    shadowFixture,
    shadowDatabaseState,
    type ShadowFixture
} from '../fixtures/recommendation-shadow-fixture'

const fixtures: ShadowFixture[] = []
const fixture = () => {
    const value = shadowFixture('missing-policy')
    fixtures.push(value)
    return value
}
afterEach(() => {
    for (const value of fixtures.splice(0)) value.dispose()
})

describe('V5 shadow module boundaries and audit-only write capability', () => {
    it('retains all six exact pre-extraction oracle methods independently of the new implementation', () => {
        expect(SHADOW_ORACLE_SOURCE_V5).toBe(
            'f4e2c2ba8cb147292e4c344c59ca1619766a4380'
        )
        expect(authority.sourceSha).toBe(SHADOW_ORACLE_SOURCE_V5)
        const source = fs
            .readFileSync(
                'test/fixtures/recommendation-shadow-legacy.ts',
                'utf8'
            )
            .replaceAll('\r\n', '\n')
        const tree = ts.createSourceFile(
            'legacy.ts',
            source,
            ts.ScriptTarget.Latest,
            true
        )
        const declaration = tree.statements.find(
            (node): node is ts.ClassDeclaration =>
                ts.isClassDeclaration(node) &&
                node.name?.text === 'FrozenRecommendationShadowV5'
        )!
        expect(authority.methods).toHaveLength(6)
        for (const entry of authority.methods) {
            const method = declaration.members.find(
                (node): node is ts.MethodDeclaration =>
                    ts.isMethodDeclaration(node) &&
                    node.name.getText(tree) === entry.name
            )!
            expect(method, entry.name).toBeDefined()
            expect(
                createHash('sha256').update(method.getText(tree)).digest('hex'),
                entry.name
            ).toBe(entry.sha256)
        }
        expect(source).not.toMatch(
            /from ['"][^'"]*(?:shadow-execution-v5|shadow-task-v5|recommendation-shadow-adapter)/
        )
    })
    it('bundles the actual execution/task without Node, SQLite, provider transports, Registry I/O or inference', async () => {
        const result = await build({
            entryPoints: [
                'src/recommendation/shadow-execution-v5.ts',
                'src/recommendation/shadow-task-v5.ts'
            ],
            bundle: true,
            platform: 'browser',
            format: 'esm',
            write: false,
            outdir: '_validation/shadow-boundary-in-memory',
            metafile: true,
            logLevel: 'silent'
        })
        const allowed = new Set([
            'src/recommendation/shadow-execution-v5.ts',
            'src/recommendation/shadow-task-v5.ts',
            'src/recommendation/shadow-ports-v5.ts',
            'src/providers/eh-tags.ts',
            'src/tags/policy.ts',
            'src/library/author-normalization.ts',
            'src/recommendation-v4/visual-style.ts',
            ...[
                'semantic-core',
                'features',
                'tag-combinations',
                'taste-model',
                'behavior-profile'
            ].map((name) => 'src/recommendation-v3/' + name + '.ts'),
            ...[
                'portable-policy',
                'behavior-evidence',
                'preference-timescales',
                'candidate-channels',
                'provider-query-compiler',
                'shadow-retrieval',
                'candidate-hygiene',
                'relevance-ranker',
                'batch-diversity',
                'correctness-audit',
                'visual-candidate-coverage',
                'shadow-pipeline',
                'visual-style-families'
            ].map((name) => 'src/recommendation-v5/' + name + '.ts')
        ])
        const inputs = Object.keys(result.metafile!.inputs).map((file) =>
            file.replaceAll('\\', '/')
        )
        expect(result.outputFiles).toHaveLength(2)
        for (const file of inputs) {
            expect(file).not.toMatch(
                /(?:policy-store|tag-resolution-v3|library\/(?:database|service)|services\/|sdk|eh-provider|jm-provider|runtime\/)/
            )
            expect(allowed.has(file), file).toBe(true)
        }
        expect(inputs).toContain('src/recommendation/shadow-execution-v5.ts')
        expect(inputs).toContain('src/recommendation-v5/relevance-ranker.ts')
        expect(inputs).toContain('src/recommendation-v5/batch-diversity.ts')
    })
    it('exposes only narrow evidence, provider and audit capabilities with no serving writer', () => {
        const value = fixture(),
            port = value.ports()
        expect(Object.keys(port).sort()).toEqual(
            [
                'assertSourcesCurrent',
                'audit',
                'createCycleId',
                'evidence',
                'loadTagResolver',
                'openProvider',
                'plan',
                'timescales'
            ].sort()
        )
        expect(Object.keys(port.evidence).sort()).toEqual([
            'catalog',
            'embeddings',
            'policy'
        ])
        expect(Object.keys(port.audit)).toEqual(['save'])
        expect(Object.keys(port.openProvider()).sort()).toEqual([
            'relatedPica',
            'search'
        ])
        expect(Object.isFrozen(port)).toBe(true)
        expect(Object.isFrozen(port.audit)).toBe(true)
        expect(Object.isFrozen(port.evidence)).toBe(true)
        const before = shadowDatabaseState(value.database)
        port.evidence.policy()
        expect(shadowDatabaseState(value.database)).toEqual(before)
    })
    it.each([
        { cycleId: 'serving-cycle' },
        { modelVersion: shadowPipelineModelVersionV5() + '-foreign' },
        {
            telemetry: {
                mode: 'LIVE',
                servingImpact: false,
                persistCandidates: false
            }
        },
        {
            telemetry: {
                mode: 'SHADOW',
                servingImpact: true,
                persistCandidates: false
            }
        },
        {
            telemetry: {
                mode: 'SHADOW',
                servingImpact: false,
                persistCandidates: true
            }
        },
        { telemetry: {} }
    ])(
        'rejects a non-shadow save capability request %j before SQLite mutation',
        (override) => {
            const value = fixture(),
                before = shadowDatabaseState(value.database)
            const input: RecommendationShadowAuditInputV5 = {
                appSessionId: null,
                cycleId: 'v5-shadow:synthetic',
                candidateIds: ['not-imported'],
                modelVersion: shadowPipelineModelVersionV5(),
                telemetry: {
                    mode: 'SHADOW',
                    servingImpact: false,
                    persistCandidates: false
                },
                ...override
            }
            expect(() => value.ports().audit.save(input)).toThrow(
                'Only current non-serving shadow audit records may be saved'
            )
            expect(shadowDatabaseState(value.database)).toEqual(before)
        }
    )
    it('checks the source revision at the write boundary even if called without the orchestrator', () => {
        const value = fixture(),
            before = shadowDatabaseState(value.database)
        let current = true
        const port = recommendationShadowPortsV5({
            database: value.proxy,
            ...value.hooks,
            createCycleId: () => 'v5-shadow:synthetic',
            assertSourcesCurrent() {
                if (!current) throw new Error('Synthetic stale source revision')
            }
        })
        current = false
        expect(() =>
            port.audit.save({
                appSessionId: null,
                cycleId: 'v5-shadow:synthetic',
                candidateIds: [],
                modelVersion: shadowPipelineModelVersionV5(),
                telemetry: {
                    mode: 'SHADOW',
                    servingImpact: false,
                    persistCandidates: false
                }
            })
        ).toThrow('Synthetic stale source revision')
        expect(shadowDatabaseState(value.database)).toEqual(before)
    })
})
