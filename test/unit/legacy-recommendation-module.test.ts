import fs from 'node:fs'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import authority from '../fixtures/legacy-recommendation-authority.json'
import { LEGACY_COMPATIBILITY_SOURCE } from '../fixtures/legacy-recommendation-frozen'
import { normalizeAuthorKey as pureNormalizer } from '../../src/library/author-normalization'
import { normalizeAuthorKey as originalNormalizer } from '../../src/library/author'

describe('real legacy/adaptive module ownership and frozen authority', () => {
    it('retains both exact old classes and all nineteen method bodies without delegating to replacements', () => {
        expect(LEGACY_COMPATIBILITY_SOURCE).toBe(
            '3ce697566f379fef2dc566af9e91f3ee183c2d21'
        )
        expect(authority.sourceSha).toBe(LEGACY_COMPATIBILITY_SOURCE)
        const text = fs
            .readFileSync(
                'test/fixtures/legacy-recommendation-frozen.ts',
                'utf8'
            )
            .replaceAll('\r\n', '\n')
        const tree = ts.createSourceFile(
            'frozen.ts',
            text,
            ts.ScriptTarget.Latest,
            true
        )
        const owners = tree.statements.filter(ts.isClassDeclaration)
        const hash = (text: string) =>
            createHash('sha256').update(text).digest('hex')
        expect(authority.methods).toHaveLength(19)
        for (const expected of authority.methods) {
            const owner = owners.find(
                (node) => node.name?.text === expected.owner
            )!
            const method = owner.members.find(
                (node) =>
                    ts.isMethodDeclaration(node) &&
                    node.name.getText(tree) === expected.name
            )!
            expect(
                hash(method.getText(tree)),
                expected.owner + '.' + expected.name
            ).toBe(expected.sha256)
        }
        for (const expected of authority.classes)
            expect(
                hash(
                    owners
                        .find((node) => node.name?.text === expected.name)!
                        .getText(tree)
                )
            ).toBe(expected.sha256)
        expect(text).not.toMatch(
            /from ['"][^'"]*(?:legacy-(?:retrieval|sessions|recommendation-adapter)|adaptive-batches|compatibility-queries)/
        )
        expect(originalNormalizer).toBe(pureNormalizer)
    })
    it('changes only the shared helper import to the exact same normalization function', () => {
        const text = fs.readFileSync('src/library/recommendation.ts', 'utf8').replaceAll('\r\n', '\n').replace("from './author-normalization'", "from './author'")
        expect(createHash('sha256').update(text).digest('hex')).toBe(authority.recommendationHelperTextSha256)
        expect(pureNormalizer).toBe(originalNormalizer)
    })
    it('browser-bundles actual retrieval/session/query implementations without SQL/SDK/account/runtime adapters', async () => {
        const result = await build({
            entryPoints: [
                'src/recommendation/legacy-retrieval.ts',
                'src/recommendation/legacy-sessions.ts',
                'src/recommendation/adaptive-batches.ts',
                'src/recommendation/compatibility-queries.ts'
            ],
            bundle: true,
            platform: 'browser',
            format: 'esm',
            write: false,
            outdir: '_validation/compatibility-pure-in-memory',
            metafile: true,
            logLevel: 'silent'
        })
        expect(result.outputFiles).toHaveLength(4)
        const files = Object.keys(result.metafile!.inputs).map((file) =>
            file.replaceAll('\\', '/')
        )
        for (const file of files) {
            expect(file).not.toMatch(
                /(?:node_modules|library\/(?:database|service)|services\/|providers\/|sdk|runtime\/|policy-store|tag-resolution-v3)/
            )
            expect(file).toMatch(
                /^src\/(?:recommendation(?:-v3)?\/|library\/(?:recommendation|author-normalization)\.ts|tags\/policy\.ts)/
            )
        }
        for (const output of result.outputFiles)
            expect(output.text).not.toMatch(
                /(?:node:|require\(|import\s+.*from\s+['"])/
            )
        expect(files).toContain('src/recommendation/compatibility-queries.ts')
    })
    it('keeps old imports as thin compatibility adapters and migrates the actual LibraryService body', () => {
        for (const [file, owner] of [
            [
                'src/services/recommendation-service.ts',
                'LegacyRecommendationSessions'
            ],
            [
                'src/recommendation-v3/adaptive-session.ts',
                'AdaptiveRecommendationBatches'
            ]
        ]) {
            const text = fs.readFileSync(file, 'utf8')
            expect(text).toContain('extends ' + owner)
            expect(text).not.toMatch(
                /(?:rankV3|saveV3Batch|saveRecommendationSession|prewarmNextSession)\(/
            )
        }
        const service = fs.readFileSync('src/library/service.ts', 'utf8')
        const tree = ts.createSourceFile(
            'service.ts',
            service,
            ts.ScriptTarget.Latest,
            true
        )
        const owner = tree.statements.find(
            (node) =>
                ts.isClassDeclaration(node) &&
                node.name?.text === 'LibraryService'
        ) as ts.ClassDeclaration
        const method = owner.members.find(
            (node) =>
                ts.isMethodDeclaration(node) &&
                node.name.getText(tree) === 'recommendations'
        )!
        expect(method.getText(tree)).toContain(
            'new LegacyRecommendationRetrieval(legacyRecallPorts('
        )
        expect(method.getText(tree)).not.toMatch(
            /(?:boundedRecallTasks|mergeRecallCandidates|rankV3|recommendComics)\(/
        )
        expect(
            fs.readFileSync('src/recommendation/legacy-retrieval.ts', 'utf8')
        ).toContain('recallTasks.slice(0, 24)')
        expect(
            fs.readFileSync('src/recommendation/legacy-retrieval.ts', 'utf8')
        ).toContain('this.ports.runtime.limit(3)')
    })
})
