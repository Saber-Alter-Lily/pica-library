/**
 * Real repository import graph using the already-installed TypeScript compiler.
 * Does not guess import targets with hand-written extension/path rules.
 *
 * pnpm exec tsx scripts/audit-modules.ts --output=module-graph.json
 * The unit gate imports moduleBoundaryViolations() and fails CI on regressions.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export interface DependencyEdge {
    from: string
    to: string
    typeOnly: boolean
}

export interface SourceModuleGraph {
    nodes: string[]
    edges: DependencyEdge[]
    runtimeCycles: string[][]
}

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const normalized = (file: string) => file.replaceAll('\\', '/')
const relative = (file: string, root: string) =>
    normalized(path.relative(root, file))
const local = (value: string) => value.startsWith('src/')

function typeOnlyImport(node: ts.ImportDeclaration) {
    const clause = node.importClause
    if (!clause) return false
    if (clause.isTypeOnly) return true
    const named = clause.namedBindings
    return !clause.name && Boolean(named && ts.isNamedImports(named) &&
        named.elements.length && named.elements.every((e) => e.isTypeOnly))
}

function typeOnlyExport(node: ts.ExportDeclaration) {
    if (node.isTypeOnly) return true
    const clause = node.exportClause
    return Boolean(clause && ts.isNamedExports(clause) &&
        clause.elements.length && clause.elements.every((e) => e.isTypeOnly))
}

export function collectSourceModuleGraph(root = ROOT): SourceModuleGraph {
    const configPath = path.join(root, 'tsconfig.json')
    const config = ts.readConfigFile(configPath, ts.sys.readFile)
    if (config.error) throw new Error('Cannot load TypeScript configuration')
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
    if (parsed.errors.length) throw new Error('Invalid TypeScript configuration')

    const paths = parsed.fileNames
        .map((file) => path.resolve(file))
        .filter((file) => local(relative(file, root)) &&
            /\.(?:ts|tsx|mts)$/.test(file) && !file.endsWith('.d.ts'))
        .sort()
    const nodes = paths.map((file) => relative(file, root))
    const nodeSet = new Set(nodes)
    const edges: DependencyEdge[] = []

    for (const absolute of paths) {
        const body = ts.sys.readFile(absolute)
        if (body === undefined)
            throw new Error('Unreadable TypeScript file: ' + absolute)
        const from = relative(absolute, root)
        const source = ts.createSourceFile(
            absolute, body, ts.ScriptTarget.Latest, true,
            absolute.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        )
        const add = (specifier: string, typeOnly: boolean) => {
            const resolved = ts.resolveModuleName(
                specifier, absolute, parsed.options, ts.sys
            ).resolvedModule?.resolvedFileName
            const target = resolved && relative(path.resolve(resolved), root)
            const to = target && nodeSet.has(target) ? target : specifier
            edges.push({ from, to, typeOnly })
        }
        const walk = (node: ts.Node) => {
            if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))
                add(node.moduleSpecifier.text, typeOnlyImport(node))
            else if (ts.isExportDeclaration(node) && node.moduleSpecifier &&
                ts.isStringLiteral(node.moduleSpecifier))
                add(node.moduleSpecifier.text, typeOnlyExport(node))
            else if (ts.isImportEqualsDeclaration(node) &&
                ts.isExternalModuleReference(node.moduleReference) &&
                node.moduleReference.expression &&
                ts.isStringLiteral(node.moduleReference.expression))
                add(node.moduleReference.expression.text, node.isTypeOnly)
            else if (ts.isCallExpression(node) &&
                (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                    (ts.isIdentifier(node.expression) && node.expression.text === 'require')))
                edges.push({ from, to: '<runtime-loader>', typeOnly: false })
            ts.forEachChild(node, walk)
        }
        walk(source)
    }
    edges.sort((a, b) => a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to) || Number(a.typeOnly) - Number(b.typeOnly))
    return { nodes, edges, runtimeCycles: runtimeCycles(nodes, edges) }
}

/** Report SCC cycles honestly; existing historic cycles are not silently erased. */
function runtimeCycles(nodes: string[], edges: DependencyEdge[]) {
    const known = new Set(nodes)
    const outgoing = new Map(nodes.map((node) => [node, [] as string[]]))
    for (const edge of edges)
        if (!edge.typeOnly && known.has(edge.to))
            outgoing.get(edge.from)?.push(edge.to)
    let sequence = 0
    const index = new Map<string, number>()
    const low = new Map<string, number>()
    const stack: string[] = []
    const stacked = new Set<string>()
    const cycles: string[][] = []
    const visit = (node: string) => {
        index.set(node, sequence)
        low.set(node, sequence++)
        stack.push(node)
        stacked.add(node)
        for (const dependency of outgoing.get(node) ?? []) {
            if (!index.has(dependency)) {
                visit(dependency)
                low.set(node, Math.min(low.get(node)!, low.get(dependency)!))
            } else if (stacked.has(dependency))
                low.set(node, Math.min(low.get(node)!, index.get(dependency)!))
        }
        if (low.get(node) === index.get(node)) {
            const group: string[] = []
            let member: string
            do {
                member = stack.pop()!
                stacked.delete(member)
                group.push(member)
            } while (member !== node)
            if (group.length > 1 || (outgoing.get(node) ?? []).includes(node))
                cycles.push(group.sort())
        }
    }
    for (const node of nodes) if (!index.has(node)) visit(node)
    return cycles.sort((a, b) => a[0].localeCompare(b[0]))
}

export function moduleBoundaryViolations(edges: DependencyEdge[]): string[] {
    const violations: string[] = []
    for (const edge of edges) {
        const from = edge.from
        const to = edge.to
        const isCoreReader = from.startsWith('src/reader/') ||
            from === 'src/services/online-reader-service.ts' ||
            from === 'src/services/reader-service.ts' ||
            from === 'src/library/reading-library.ts'
        const isConcreteSource = to.startsWith('src/providers/') ||
            to === 'src/sdk.ts' || to.startsWith('src/desktop/') ||
            to.startsWith('src/source-hosts/') ||
            to === 'src/source-extensions/trusted-process.ts' ||
            to === 'src/services/provider-service.ts'
        let reason: string | undefined

        if (isCoreReader && (isConcreteSource ||
            to === 'src/services/external-reader-adapter.ts' ||
            to === 'node:child_process' || to === '<runtime-loader>'))
            reason = 'Reader must not depend on concrete sources'
        if (from === 'src/services/provider-service.ts' && !edge.typeOnly &&
            ['src/providers/pica-provider.ts',
                'src/providers/eh-provider.ts',
                'src/providers/jm-provider.ts'].includes(to))
            reason = 'Concrete source constructors belong in compiled composition'
        if (from === 'src/source-extensions/reader-contract.ts')
            reason = 'Portable source contract must have zero imports'
        if (from === 'src/source-extensions/desktop-reader-adapter.ts') {
            const allowed = edge.typeOnly
                ? ['src/types.ts', 'src/services/online-reader-service.ts',
                    'src/source-extensions/reader-contract.ts']
                : ['node:buffer', 'src/source-extensions/reader-contract.ts']
            if (!allowed.includes(to))
                reason = 'Reader binding must not load source SDK, database or process'
        }
        if ((from.startsWith('src/tags/') || from.startsWith('src/modules/')) &&
            to.startsWith('src/') &&
            !to.startsWith(from.startsWith('src/tags/') ? 'src/tags/' : 'src/modules/'))
            reason = 'Pure tag/module domain imports another owner'

        if (reason) violations.push(reason + ': ' + from + ' -> ' + to)
    }
    return violations
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const graph = collectSourceModuleGraph()
    const violations = moduleBoundaryViolations(graph.edges)
    const summary = {
        sourceSha: process.env.GITHUB_SHA || null,
        files: graph.nodes.length,
        imports: graph.edges.length,
        existingRuntimeCycles: graph.runtimeCycles.length,
        knownSourceCoupling: graph.edges.filter((edge) =>
            edge.from === 'src/services/provider-service.ts' &&
            (edge.to.startsWith('src/providers/') || edge.to === 'src/sdk.ts')
        ),
        violations
    }
    const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9)
    if (output) {
        const target = path.resolve(output)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, JSON.stringify({ summary, ...graph }, null, 2) + '\n')
    }
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
    if (violations.length) process.exitCode = 1
}
