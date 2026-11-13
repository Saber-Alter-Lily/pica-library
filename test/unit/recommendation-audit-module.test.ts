import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { build } from 'esbuild'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { RECOMMENDATION_V5_POLICY_STATE_KEY } from '../../src/recommendation-v5/portable-policy'
import { parseEhTag } from '../../src/providers/eh-tags'
import { parseEhTag as compatibleParseEhTag } from '../../src/providers/eh-provider'
import { enabledFixtureSources } from "../helpers/source-runtime-fixture"

const fixtures: Array<{ root: string; database: LibraryDatabase }> = []
function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-audit-module-'))
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    fixtures.push({ root, database })
    return { root, database, service: new LibraryService(database, root, undefined, undefined, undefined, enabledFixtureSources()) }
}
afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    for (const { root, database } of fixtures.splice(0)) {
        database.close()
        fs.rmSync(root, { recursive: true, force: true })
    }
})

describe('V5 audit read module', () => {
    it.each([
        [
            'tagFacet',
            '218cce4e24cd6bda1b72630523d5a0c60f1a13546b2034c3e8a121d158816e64'
        ],
        [
            'parseEhTag',
            '012b4e2d5e5c7df4627afd1da5e705b7b6b45f539182b1fa2dcdb163f3fa17db'
        ]
    ])('%s retains its frozen NEXT58 implementation', (name, expectedHash) => {
        // Extracted from fe360d315d53 src/providers/eh-provider.ts, normalizing line endings only.
        const source = fs
            .readFileSync('src/providers/eh-tags.ts', 'utf8')
            .replaceAll('\r\n', '\n')
        const tree = ts.createSourceFile(
            'eh-tags.ts',
            source,
            ts.ScriptTarget.Latest,
            true
        )
        const method = tree.statements.find(
            (node): node is ts.FunctionDeclaration =>
                ts.isFunctionDeclaration(node) && node.name?.text === name
        )
        expect(method).toBeDefined()
        expect(
            createHash('sha256').update(method!.getText(tree)).digest('hex')
        ).toBe(expectedHash)
    })
    it('keeps the provider re-export and representative namespace results compatible', () => {
        expect(compatibleParseEhTag).toBe(parseEhTag)
        for (const [raw, namespace, value, facet] of [
            ['artist: Example ', 'artist', 'Example', 'CREATOR'],
            ['PARODY:Series', 'parody', 'Series', 'FANDOM_IP'],
            ['female:trait:detail', 'female', 'trait:detail', 'CONTENT_TRAIT'],
            ['language:japanese', 'language', 'japanese', 'LANGUAGE'],
            [':literal', null, ':literal', 'OTHER'],
            [' plain ', null, 'plain', 'OTHER']
        ])
            expect(parseEhTag(raw!)).toEqual({ raw, namespace, value, facet })
    })
    it('mobile sync preview leaves a missing policy absent until an explicit merge/save', () => {
        const { database, service } = fixture()
        expect(
            database.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)
        ).toBeUndefined()
        const write = vi
            .spyOn(database, 'setAppState')
            .mockImplementation(() => {
                throw new Error('Preview must not initialize persistent policy')
            })
        expect(() =>
            service.previewMobileRecommendationV5({
                deviceId: 'synthetic-preview',
                mutationId: 'preview-only',
                syncSchemaVersion: 1,
                controls: []
            })
        ).not.toThrow()
        expect(write).not.toHaveBeenCalled()
        expect(
            database.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)
        ).toBeUndefined()
    })
    it('bundles actual audit queries/export assembly without Node, SQL, provider sessions or model execution', async () => {
        const result = await build({
            entryPoints: [
                'src/recommendation/audit-queries-v5.ts',
                'src/recommendation/audit-export-v5.ts'
            ],
            bundle: true,
            platform: 'browser',
            format: 'esm',
            write: false,
            outdir: '_validation/audit-boundary-in-memory',
            metafile: true,
            logLevel: 'silent'
        })
        const inputs = Object.keys(result.metafile!.inputs).map((file) =>
            file.replaceAll('\\', '/')
        )
        const allowed = new Set([
            'src/recommendation/audit-queries-v5.ts',
            'src/recommendation/audit-export-v5.ts',
            'src/library/author-normalization.ts',
            'src/providers/eh-tags.ts',
            'src/tags/policy.ts',
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
                'candidate-channels',
                'provider-query-compiler',
                'preference-timescales',
                'shadow-retrieval',
                'candidate-hygiene',
                'relevance-ranker',
                'batch-diversity',
                'shadow-pipeline',
                'promotion-gate',
                'visual-style-families',
                'visual-candidate-coverage',
                'visual-activation-gate',
                'evaluation-metrics',
                'retrospective-benchmark',
                'steerability-audit',
                'evaluation-framework',
                'benchmark-comparison',
                'advanced-learning-gate'
            ].map((name) => 'src/recommendation-v5/' + name + '.ts')
        ])
        expect(result.outputFiles).toHaveLength(2)
        for (const file of inputs) {
            expect(file).not.toMatch(
                /(?:policy-store|tag-profile-exchange|library\/database|library\/service|services\/|sdk\/|eh-provider|runtime\/)/
            )
            expect(allowed.has(file), file).toBe(true)
        }
        expect(inputs).toContain('src/providers/eh-tags.ts')
    })
    it.each([
        'recommendationV5Snapshot',
        'recommendationV5PreferenceTimescales',
        'recommendationV5BehaviorEvidence',
        'recommendationV5CandidateChannels',
        'recommendationV5SteerabilityAudit',
        'recommendationV5EvaluationSummary',
        'recommendationPortablePackageV5',
        'visualPreferenceProfile'
    ] as const)(
        '%s does not initialize policy or write user state in an empty library',
        (method) => {
            const { database, service } = fixture()
            expect(
                database.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)
            ).toBeUndefined()
            const write = vi
                .spyOn(database, 'setAppState')
                .mockImplementation(() => {
                    throw new Error(
                        'Read path must not persist policy or state'
                    )
                })
            expect(() => service[method]()).not.toThrow()
            expect(
                database.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)
            ).toBeUndefined()
            expect(write).not.toHaveBeenCalled()
        }
    )
})
