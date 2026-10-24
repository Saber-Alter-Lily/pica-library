import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
function files(directory: string): string[] {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) =>
            entry.isDirectory()
                ? files(path.join(directory, entry.name))
                : entry.name.endsWith('.ts')
                  ? [path.join(directory, entry.name)]
                  : []
        )
}
function imports(file: string): string[] {
    // Reuse the installed TypeScript compiler, not a home-grown import regex/resolver.
    const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true
    )
    const found: string[] = []
    function visit(node: ts.Node) {
        if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
        )
            found.push(node.moduleSpecifier.text)
        if (
            ts.isImportTypeNode(node) &&
            ts.isLiteralTypeNode(node.argument) &&
            ts.isStringLiteral(node.argument.literal)
        )
            found.push(node.argument.literal.text)
        if (
            ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                (ts.isIdentifier(node.expression) &&
                    node.expression.text === 'require'))
        )
            found.push('<dynamic-loader>')
        ts.forEachChild(node, visit)
    }
    visit(source)
    return found
}
describe('enforced first module boundaries', () => {
    it('keeps Desktop update shutdown authorization behind its async apply port without process or storage I/O', async () => {
        const result=await build({entryPoints:['src/desktop/update-command.ts'],bundle:true,platform:'browser',format:'esm',write:false,metafile:true,logLevel:'silent'})
        expect(Object.keys(result.metafile!.inputs)).toEqual(['src/desktop/update-command.ts'])
        expect(result.outputFiles).toHaveLength(1)
    })
    it('bundles the real ordered recommendation build with only pure algorithm dependencies, never database/session/registry/model I/O', async () => {
        const result=await build({entryPoints:['src/recommendation/build-pipeline.ts'],bundle:true,platform:'browser',format:'esm',write:false,metafile:true,logLevel:'silent'})
        const allowed=new Set([
            'src/recommendation/build-pipeline.ts','src/library/author-normalization.ts',
            ...['intent-planner-v3','provider-query-translator','retriever-v3','semantic-core','features','tag-combinations','taste-model','behavior-profile','ranker','ranker-adapter-v3'].map(name=>'src/recommendation-v3/'+name+'.ts'),
            'src/recommendation-v4/visual-style.ts','src/tags/policy.ts',
            ...['portable-policy','explicit-intents','tag-intents','intent-policy'].map(name=>'src/recommendation-v5/'+name+'.ts')
        ])
        for(const file of Object.keys(result.metafile!.inputs))expect(allowed.has(file.replaceAll('\\','/')),file).toBe(true)
        expect(result.outputFiles).toHaveLength(1)
        expect(result.metafile!.inputs['src/recommendation/build-pipeline.ts']).toBeDefined()
    })
    it('bundles recommendation queries and commands without Node, SQL, provider clients or model execution', async () => {
        const result = await build({ entryPoints: ['src/recommendation/queries.ts','src/recommendation/cycle-commands.ts'],
            bundle:true, platform:'browser',format:'esm',write:false,outdir:'_validation/recommendation-boundary-memory',metafile:true,logLevel:'silent' })
        const allowed = new Set(['src/recommendation/ports.ts','src/recommendation/queries.ts','src/recommendation/cycle-commands.ts',
            'src/recommendation-v3/batch-allocator-v3.ts','src/recommendation-v5/portable-policy.ts','src/tags/policy.ts'])
        for(const file of Object.keys(result.metafile!.inputs))
            expect(allowed.has(file.replaceAll('\\','/')),file).toBe(true)
        expect(result.outputFiles).toHaveLength(2)
        const query=fs.readFileSync(path.join(root,'src/recommendation/queries.ts'),'utf8')
        for(const forbidden of ['buildCycle','createId','writeState','saveV3BatchAndAllocate','fetch(']) expect(query).not.toContain(forbidden)
    })
    it('keeps local ingestion behind a narrow storage port without online/login/ranking ownership', () => {
        const directory=path.join(root,'src/local-library')
        for(const file of files(directory)) for(const specifier of imports(file)) {
            if(['node:fs','node:path','node:crypto','node:zlib','adm-zip'].includes(specifier))continue
            expect(path.resolve(path.dirname(file),specifier).startsWith(directory+path.sep)).toBe(true)
        }
    })
    it('keeps neutral media transport independent from provider sessions, library storage and recommendations', () => {
        const directory = path.join(root, 'src/media')
        for (const file of files(directory)) for (const specifier of imports(file)) {
            if (['axios', 'node:net'].includes(specifier)) continue
            expect(specifier.startsWith('.'), `${file}: ${specifier}`).toBe(true)
            expect(path.resolve(path.dirname(file), specifier).startsWith(directory + path.sep)).toBe(true)
        }
    })
    it('keeps the tag domain and module-contract parser independent from storage, providers, UI and rankers', () => {
        for (const folder of ['src/tags', 'src/modules']) {
            const directory = path.join(root, folder)
            for (const file of files(directory))
                for (const specifier of imports(file)) {
                    expect(
                        specifier.startsWith('.'),
                        `${file}: ${specifier}`
                    ).toBe(true)
                    const resolved = path.resolve(path.dirname(file), specifier)
                    expect(
                        resolved.startsWith(directory + path.sep),
                        `${file}: ${specifier}`
                    ).toBe(true)
                }
        }
    })
    it('allows only the old compatibility barrel, never a production dependency back into the V5 tag path', () => {
        for (const file of files(path.join(root, 'src'))) {
            if (file.endsWith(path.join('recommendation-v5', 'tag-policy.ts')))
                continue
            for (const specifier of imports(file))
                expect(path.resolve(path.dirname(file), specifier)).not.toBe(
                    path.join(root, 'src/recommendation-v5/tag-policy')
                )
        }
    })
    it('keeps source routing metadata separate from SDK sessions and recommendation generation', () => {
        for (const name of ['provider-registry.ts', 'module-manifests.ts'])
            expect(
                imports(path.join(root, 'src/providers', name)).every(
                    (specifier) =>
                        ['./types', './module-manifests'].includes(specifier)
                )
            ).toBe(true)
    })
})
