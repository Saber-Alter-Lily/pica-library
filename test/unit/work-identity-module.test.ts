import fs from 'node:fs'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import vm from 'node:vm'
import { build } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import authority from '../fixtures/work-identity-legacy-authority.json'
import { IDENTITY_ORACLE_SOURCE_V5 } from '../fixtures/work-identity-legacy'
import {
    identityFixture,
    identityDatabaseState,
    type IdentityFixture
} from '../fixtures/work-identity-fixture'

const fixtures: IdentityFixture[] = []
afterEach(() => {
    for (const value of fixtures.splice(0)) value.dispose()
})
describe('work identity actual module ownership and capabilities', () => {
    it('binds all fifteen exact old methods without calling replacement implementations', () => {
        expect(IDENTITY_ORACLE_SOURCE_V5).toBe(
            '2c3f7d647100441398b28fbdc0cc41a5e8ffd0cc'
        )
        expect(authority.sourceSha).toBe(IDENTITY_ORACLE_SOURCE_V5)
        expect(authority.methods).toHaveLength(15)
        const source = fs
            .readFileSync('test/fixtures/work-identity-legacy.ts', 'utf8')
            .replaceAll('\r\n', '\n')
        const tree = ts.createSourceFile(
            'frozen.ts',
            source,
            ts.ScriptTarget.Latest,
            true
        )
        const owner = tree.statements.find(
            (node): node is ts.ClassDeclaration =>
                ts.isClassDeclaration(node) &&
                node.name?.text === 'FrozenWorkIdentityV5'
        )!
        for (const entry of authority.methods) {
            const method = owner.members.find(
                (node) =>
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
            /from ['"][^'"]*(?:work-identity-(?:queries|commands|task|ports)-v5|services\/work-identity-adapter)/
        )
    })
    it('browser-bundles actual views, commands and task without SQLite/accounts/filesystem/model execution', async () => {
        const result = await build({
            entryPoints: [
                'src/identity/queries-v5.ts',
                'src/identity/commands-v5.ts',
                'src/identity/task-v5.ts'
            ],
            bundle: true,
            platform: 'browser',
            format: 'esm',
            write: false,
            outdir: '_validation/identity-source-only-in-memory',
            metafile: true,
            logLevel: 'silent'
        })
        const allowed = new Set([
            'src/identity/queries-v5.ts',
            'src/identity/commands-v5.ts',
            'src/identity/task-v5.ts',
            'src/identity/ports-v5.ts',
            'src/recommendation-v5/work-identity-foundation.ts',
            'src/recommendation-v5/work-identity-v3.ts',
            'src/recommendation-v5/portable-policy.ts',
            'src/recommendation-v4/visual-style.ts',
            'src/library/author-normalization.ts',
            'src/tags/policy.ts'
        ])
        const inputs = Object.keys(result.metafile!.inputs).map((file) =>
            file.replaceAll('\\', '/')
        )
        expect(result.outputFiles).toHaveLength(3)
        for (const file of inputs) {
            expect(file).not.toMatch(
                /(?:policy-store|library\/(?:database|service)|services\/|providers\/|sdk|runtime\/)/
            )
            expect(allowed.has(file), file).toBe(true)
        }
        expect(inputs).toContain(
            'src/recommendation-v5/work-identity-foundation.ts'
        )
        expect(inputs).toContain('src/recommendation-v5/work-identity-v3.ts')
    })
    it('narrows matcher inputs by types only, retaining the frozen executable matcher exactly', () => {
        const input = fs.readFileSync(
            'src/recommendation-v5/work-identity-foundation.ts',
            'utf8'
        )
        const emitted = ts.transpileModule(input, {
            compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ESNext,
                removeComments: true
            }
        }).outputText
        const canonical = ts
            .createPrinter({
                removeComments: true,
                newLine: ts.NewLineKind.LineFeed
            })
            .printFile(
                ts.createSourceFile(
                    'matcher.js',
                    emitted,
                    ts.ScriptTarget.Latest,
                    true,
                    ts.ScriptKind.JS
                )
            )
        // Canonical executable emitted from the exact NEXT60 matcher, independently
        // recorded in MATCHER_TYPE_NARROWING.json before committing this slice.
        expect(createHash('sha256').update(canonical).digest('hex')).toBe(
            '17b4eeaee360dd4b16c4289db245761a348fcfba0eddb1d69d8b2d4e15178e6d'
        )
    })
    it('gives the background task only catalog/policy reads and evidence save, never adjudication/binding', () => {
        const value = identityFixture('uninitialized')
        fixtures.push(value)
        expect(Object.keys(value.task.read).sort()).toEqual([
            'catalog',
            'policy'
        ])
        expect(Object.keys(value.task.write)).toEqual([
            'saveWorkIdentityEvidence'
        ])
        expect(Object.keys(value.write).sort()).toEqual(
            [
                'atomic',
                'clearWorkIdentityDecision',
                'prepareWorkIdentityMaterializationRun',
                'saveWorkIdentityDecision',
                'saveWorkIdentityEvidence',
                'setExplicitDistinctPair',
                'workIdentityStorageStatus'
            ].sort()
        )
        expect(Object.keys(value.read)).not.toContain('setAppState')
        expect(Object.keys(value.read)).not.toContain('withAppStateTransaction')
        expect(Object.isFrozen(value.read)).toBe(true)
        expect(Object.isFrozen(value.write)).toBe(true)
        expect(Object.isFrozen(value.task.read)).toBe(true)
        expect(Object.isFrozen(value.task.write)).toBe(true)
        expect(Object.keys(value.read.policy())).toEqual([
            'explicitDistinctPairs'
        ])
        expect(Object.keys(value.task.read.policy())).toEqual([
            'explicitDistinctPairs'
        ])
        expect(Object.isFrozen(value.read.policy().explicitDistinctPairs)).toBe(
            true
        )
        const before = identityDatabaseState(value.database)
        value.read.policy()
        value.task.read.policy()
        expect(identityDatabaseState(value.database)).toEqual(before)
    })
    it('uses the existing transaction primitive and rejects an asynchronous transaction callback', () => {
        const value = identityFixture('uninitialized')
        fixtures.push(value)
        const before = identityDatabaseState(value.database)
        expect(() =>
            value.write.atomic(() => Promise.resolve('not-supported'))
        ).toThrow('App-state transactions must be synchronous')
        expect(identityDatabaseState(value.database)).toEqual(before)
        const adapter = fs.readFileSync(
            'src/services/work-identity-adapter.ts',
            'utf8'
        )
        expect(adapter).toContain('database.withAppStateTransaction(operation)')
        expect(adapter).not.toMatch(
            /\.exec\(|\b(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/
        )
    })
    it('keeps LibraryService compatibility methods as real delegation rather than retained business bodies', () => {
        const source = fs.readFileSync('src/library/service.ts', 'utf8'),
            tree = ts.createSourceFile(
                'service.ts',
                source,
                ts.ScriptTarget.Latest,
                true
            )
        const owner = tree.statements.find(
            (node): node is ts.ClassDeclaration =>
                ts.isClassDeclaration(node) &&
                node.name?.text === 'LibraryService'
        )!
        for (const entry of authority.methods.filter(
            (entry) =>
                ![
                    'allComicsForIdentity',
                    'workIdentityEvidenceRefreshCheckpoint',
                    'finishWorkIdentityEvidenceRefreshControl'
                ].includes(entry.name)
        )) {
            const method = owner.members.find(
                (node): node is ts.MethodDeclaration =>
                    ts.isMethodDeclaration(node) &&
                    node.name.getText(tree) === entry.name
            )!
            expect(method.body?.statements.length, entry.name).toBe(1)
            expect(method.body!.getText(tree)).toMatch(
                /this\.workIdentity(?:QueriesV5\(\)|CommandsV5\(\)|TaskV5)\./
            )
        }
    })
    it('syntax-checks the external CI fault preload without executing its program or spawning anything', () => {
        const source = fs.readFileSync(
            'scripts/test-windows-recommendation-audit.mjs',
            'utf8'
        )
        const tree = ts.createSourceFile(
            'ci-runtime.mjs',
            source,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.JS
        )
        let template: ts.TemplateExpression | undefined
        const visit = (node: ts.Node) => {
            if (
                ts.isCallExpression(node) &&
                node.expression.getText(tree) === 'fs.writeFileSync' &&
                node.arguments[0]?.getText(tree) === 'preload' &&
                ts.isTemplateExpression(node.arguments[1])
            )
                template = node.arguments[1]
            ts.forEachChild(node, visit)
        }
        visit(tree)
        expect(template).toBeDefined()
        const allowed = new Set([
            'control',
            'trace',
            'output',
            'credentialCanary',
            'bodyCanary'
        ])
        for (const span of template!.templateSpans) {
            const expression = span.expression
            if (
                !ts.isCallExpression(expression) ||
                expression.expression.getText(tree) !== 'JSON.stringify' ||
                expression.arguments.length !== 1
            )
                throw new Error('Unexpected executable preload interpolation')
            const argument = expression.arguments[0]
            const identifiers = ts.isArrayLiteralExpression(argument)
                ? argument.elements
                : [argument]
            for (const identifier of identifiers)
                if (
                    !ts.isIdentifier(identifier) ||
                    !allowed.has(identifier.text)
                )
                    throw new Error('Unexpected preload interpolation input')
        }
        const text = vm.runInNewContext(
            template!.getText(tree),
            {
                JSON,
                control: '/synthetic/control',
                trace: '/synthetic/trace',
                output: '/synthetic/output',
                credentialCanary: '/synthetic/credential',
                bodyCanary: '/synthetic/body'
            },
            { timeout: 1000 }
        )
        expect(() => new vm.Script(text)).not.toThrow()
        expect(text).toContain('/INSERT\\s+INTO\\s+app_state/i')
        expect(text).toContain("record('identity-policy-after-write-fault')")
        expect(source).toContain("process.env.GITHUB_ACTIONS !== 'true'")
    })
})
