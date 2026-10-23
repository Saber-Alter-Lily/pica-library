import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
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
