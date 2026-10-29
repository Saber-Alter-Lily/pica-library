/**
 * S3 CORE-LIB-04b-02. Stage the ORIGINAL full Web HTML and its actual module
 * import closure into a fresh disposable OS-temp folder. Never release it.
 *
 * No provider account/extension boot scripts, executable plugin runtime or
 * arbitrary user files are copied. The full DOM and all core UI modules come
 * from the existing web/ tree; this is NOT a second application or Reader.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const WEB = path.join(ROOT, 'web')
const SOURCE_HTML = 'index.html'
const MANIFEST = 'full-web-qa-manifest.json'
const SOURCES_EXCLUDED = new Set([
    'eh-account.js', 'jm-account.js', 'source-choices.js',
    'source-hosts.js', 'saved-source-hosts.js', 'recommendation-v5.js',
    'alpha8-star-access.js', 'alpha8-connections.js',
    'alpha8-product.js', 'alpha8-theme-help.js',
    'alpha8-update-ui.js', 'onboarding-v1.js',
    'vendor/qrcode.min.js', 'vendor/driverjs/driver.js.iife.js'
])
// This is a deliberately small set of ORIGINAL top-level UI entrypoints.
// app.js' own static/dynamic dependency closure is discovered, not guessed.
export const FULL_WEB_CORE_ENTRIES = Object.freeze([
    'info-tip-v1.js', 'app.js', 'alpha7-cloud.js', 'ui-polish-v5.js'
])
const CSS = new Set([
    'styles.css', 'alpha8-6.css', 'ui-polish-v5.css',
    'info-tip-v1.css', 'onboarding-v1.css'
])
const ICON = 'pica-library-icon.webp'
const SHA = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function validName(name: string) {
    if (!/^[a-z0-9][a-z0-9_.-]*\.(?:js|css|webp|png|svg|html)$/.test(name) ||
        name === '.' || name.includes('..') || name.includes('/') ||
        name.includes('\\'))
        throw new Error('Full Web QA asset path is not a reviewed local name: ' + name)
    return name
}
function sourceBytes(name: string): Buffer {
    validName(name)
    const file = path.join(WEB, name)
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
        stat.size < 1 || stat.size > 512 * 1024)
        throw new Error('Unsafe original full Web asset: ' + name)
    return fs.readFileSync(file)
}
function dependency(from: string, specifier: string) {
    // Only the existing web/ local top-level ES modules are acceptable.
    if (!/^\.[/][a-z0-9][a-z0-9_.-]*\.js$/.test(specifier))
        throw new Error('Unreviewed runtime Web import ' + from + ' -> ' + specifier)
    const target = validName(specifier.slice(2))
    if (SOURCES_EXCLUDED.has(target))
        throw new Error('Source-only Web module leaked into core: ' + target)
    return target
}
function moduleEdges(name: string, value: Buffer) {
    const input = value.toString('utf8')
    const ast = ts.createSourceFile(name, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const edges = new Set<string>()
    const add = (specifier: string) => edges.add(dependency(name, specifier))
    const walk = (node: ts.Node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
            add(node.moduleSpecifier.text)
        if (ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const arg = node.arguments[0]
            if (!arg || !ts.isStringLiteral(arg))
                throw new Error('Dynamic Web import must be a constant: ' + name)
            add(arg.text)
        }
        ts.forEachChild(node, walk)
    }
    walk(ast)
    // Existing worker script is an original Web module. Keep the literal URL
    // closure as well, but never allow worker-loading a nonlocal script.
    for (const match of input.matchAll(/new\s+URL\(\s*['"]([^'"]+\.js)['"]\s*,\s*import\.meta\.url\s*\)/g))
        add(match[1])
    return [...edges].sort()
}
function fullHtml(source: Buffer) {
    const raw = source.toString('utf8')
    const scripts: string[] = []
    const next = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, tag => {
        const match = /\bsrc=["']\.\/([^"']+)["']/i.exec(tag)
        if (!match) throw new Error('Unreviewed inline full Web executable script')
        const file = match[1]
        if (FULL_WEB_CORE_ENTRIES.includes(file)) {
            if (!/\btype=["']module["']/i.test(tag))
                throw new Error('Full Web core entry must be an ES module')
            scripts.push(file)
            return tag
        }
        if (!SOURCES_EXCLUDED.has(file))
            throw new Error('New unreviewed full Web top-level script: ' + file)
        return ''
    })
    if (scripts.join(',') !== FULL_WEB_CORE_ENTRIES.join(','))
        throw new Error('Original full Web script order or approved entries changed')
    const links = [...next.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)]
    let html = next
    for (const match of links) {
        const href = /\bhref=["']\.\/([^"']+)["']/i.exec(match[0])
        if (!href) throw new Error('Unreviewed full Web stylesheet URL')
        if (href[1] === 'vendor/driverjs/driver.css') {
            html = html.replace(match[0], '')
            continue
        }
        if (!CSS.has(href[1]))
            throw new Error('Unreviewed stylesheet in original full Web UI')
    }
    for (const match of html.matchAll(/\b(?:src|href)=["']\.\/([^"']+)["']/g)) {
        const file = match[1]
        if (!CSS.has(file) && file !== ICON && !FULL_WEB_CORE_ENTRIES.includes(file))
            throw new Error('Full Web HTML gained an unreviewed local asset: ' + file)
    }
    for (const id of ['home', 'library', 'shelves', 'reader', 'settings']) {
        if (!html.includes('id="' + id + '"'))
            throw new Error('Original full Web page lost required panel: ' + id)
    }
    if (!html.includes('<script type="module" src="./app.js"></script>'))
        throw new Error('Core Web stage is not the real full application')
    // No HTML markup for a new app. This is the original HTML minus optional
    // source/account scripts whose runtime is intentionally not installed.
    return Buffer.from(html, 'utf8')
}
export interface FullWebQaAsset {
    name: string
    sha256: string
    size: number
}
export interface FullWebQaManifest {
    kind: 'DISPOSABLE_FULL_WEB_CORE_QA_ONLY'
    sourceHtmlSha256: string
    appEntrypoints: string[]
    files: FullWebQaAsset[]
    sourceSdkIncluded: false
    distributable: false
}
export function stageOfflineFullWebQa(destination: string): FullWebQaManifest {
    const temp = fs.realpathSync.native(os.tmpdir())
    if (typeof destination !== 'string' || !path.isAbsolute(destination))
        throw new Error('Full Web QA destination must be absolute OS temp')
    const requested = path.resolve(destination)
    const parent = fs.realpathSync.native(path.dirname(requested))
    const rel = path.relative(temp, parent)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel))
        throw new Error('Full Web QA is restricted to disposable OS temp')
    const folder = path.join(parent, path.basename(requested))
    if (fs.lstatSync(folder, { throwIfNoEntry: false }))
        throw new Error('Full Web QA destination is not disposable')
    const source = sourceBytes(SOURCE_HTML)
    const html = fullHtml(source)
    const files = new Map<string, Buffer>([
        [SOURCE_HTML, html], [ICON, sourceBytes(ICON)]
    ])
    for (const stylesheet of [...CSS]) files.set(stylesheet, sourceBytes(stylesheet))
    const queue = [...FULL_WEB_CORE_ENTRIES]
    while (queue.length) {
        const file = queue.shift()!
        if (files.has(file)) continue
        if (files.size > 75) throw new Error('Full Web QA module closure is too large')
        if (SOURCES_EXCLUDED.has(file)) throw new Error('Unreviewed source UI entry')
        const bytes = sourceBytes(file)
        files.set(file, bytes)
        queue.push(...moduleEdges(file, bytes).filter(item => !files.has(item)))
    }
    const total = [...files.values()].reduce((size, file) => size + file.length, 0)
    if (total > 3 * 1024 * 1024) throw new Error('Full Web QA asset budget exceeded')
    fs.mkdirSync(folder, { mode: 0o700 })
    const rows: FullWebQaAsset[] = []
    for (const [name, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
        fs.writeFileSync(path.join(folder, name), bytes, {
            mode: 0o600, flag: 'wx'
        })
        const copied = fs.readFileSync(path.join(folder, name))
        if (!bytes.equals(copied)) throw new Error('Full Web QA asset readback mismatch')
        rows.push({ name, size: copied.length, sha256: SHA(copied) })
    }
    const result: FullWebQaManifest = {
        kind: 'DISPOSABLE_FULL_WEB_CORE_QA_ONLY',
        sourceHtmlSha256: SHA(source),
        appEntrypoints: [...FULL_WEB_CORE_ENTRIES],
        files: rows, sourceSdkIncluded: false, distributable: false
    }
    fs.writeFileSync(path.join(folder, MANIFEST), JSON.stringify(result, null, 2), {
        mode: 0o600, flag: 'wx'
    })
    return result
}
