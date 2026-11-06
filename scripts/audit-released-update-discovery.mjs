import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'
import ts from 'typescript'

const expectedHash = '14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf'
const expectedSource = 'bec7f9f31828e8c57e0a2c103b6b1206c22c37cf'
const methodNames = ['updateTarget', 'checkForUpdate', 'availableFromRelease', 'shaFromSums']
const helperNames = ['we', 'Pe', 'vt', 'cs', 'us', 'vr', 'St', 'Fr', 'Ar', 'Er']

/** Exact released discovery methods only, not an app launch or first-hop upgrade test. */
export async function auditReleasedUpdateDiscovery(file) {
    const bytes = fs.readFileSync(file), hash = createHash('sha256').update(bytes).digest('hex')
    assert.equal(hash, expectedHash, 'Only the pinned public v0.5.0 ZIP is allowed')
    const zip = new AdmZip(bytes)
    assert.equal(zip.readAsText('SOURCE_SHA.txt').trim(), expectedSource)
    const source = zip.readAsText('app/desktop.js'), ast = ts.createSourceFile('released.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const controller = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'ys')
    assert.ok(controller, 'Pinned compiled controller is missing')
    const methods = methodNames.map(name => {
        const method = controller.members.find(node => ts.isMethodDeclaration(node) && node.name?.getText(ast) === name)
        assert.ok(method, 'Released method missing: ' + name)
        return method.getText(ast)
    })
    const helpers = helperNames.map(name => {
        const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
        assert.ok(fn, 'Released helper missing: ' + name)
        return fn.getText(ast)
    })
    const constants = ['Ye', 'he'].map(name => {
        const declaration = ast.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === name)
        assert.ok(declaration?.initializer, 'Released constant missing: ' + name)
        return 'const ' + declaration.getText(ast) + ';'
    })
    const code = [...constants, ...helpers, `class Controller { constructor(options) { this.options = options } writeProgress(value) { this.progress = value } ${methods.join('\n')} } globalThis.makeController = options => new Controller(options);`].join('\n')
    const context = vm.createContext({ AbortSignal: { timeout: () => undefined }, encodeURIComponent }, { codeGeneration: { strings: false, wasm: false } })
    new vm.Script(code, { filename: 'released-discovery-only.js' }).runInContext(context, { timeout: 1000 })
    const future = '0.5.1' // Synthetic response only. Never a publication or proposed version.
    const standard = `Pica-Library-v${future}-windows-x64.zip`, renamed = `Pica-Library-v${future}-core-windows-x64.zip`
    const delta = `Pica-Library-v${future}-windows-x64-update-from-v0.5.0.zip`
    const asset = name => ({ name, browser_download_url: `https://github.com/Saber-Alter-Lily/pica-library/releases/download/v${future}/${name}` })
    const results = []
    for (const c of [
        { id: 'same-version', version: '0.5.0', names: [standard], status: 'current' },
        { id: 'standard-full', names: [standard], status: 'full-install', selected: standard },
        { id: 'renamed-core-only', names: [renamed], status: 'full-install' },
        { id: 'standard-and-renamed', names: [renamed, standard], status: 'full-install', selected: standard },
        { id: 'scoped-delta-priority', names: [standard, delta], status: 'incremental', selected: delta },
        { id: 'checksum-standard-full', names: [standard], status: 'full-install', selected: standard, fallback: true },
        { id: 'checksum-renamed-core-only', names: [renamed], status: 'full-install', fallback: true }
    ]) {
        let calls = 0
        const request = async url => {
            calls++
            if (String(url).includes('api.github.com')) {
                if (c.fallback) throw Error('Synthetic API offline')
                return { ok: true, json: async () => ({ tag_name: 'v' + (c.version ?? future), draft: false, prerelease: false, assets: c.names.map(asset) }) }
            }
            assert.equal(String(url), 'https://github.com/Saber-Alter-Lily/pica-library/releases/latest/download/SHA256SUMS.txt')
            return { ok: true, url: `https://github.com/Saber-Alter-Lily/pica-library/releases/download/v${future}/SHA256SUMS.txt`, text: async () => c.names.map(name => 'a'.repeat(64) + '  ' + name).join('\n') }
        }
        const manager = context.makeController({ currentVersion: '0.5.0', fetchImplementation: request, target: { platform: 'windows', arch: 'x64' } })
        const result = JSON.parse(JSON.stringify(await manager.checkForUpdate()))
        assert.equal(result.status, c.status, c.id)
        assert.equal(result.assetName, c.selected, c.id)
        assert.equal(result.oneClick, c.selected === standard ? true : undefined, c.id)
        assert.equal(calls, c.fallback ? 2 : 1)
        results.push({ id: c.id, ...result, syntheticFetchCalls: calls })
    }
    return { status: 'PASS', packageSha256: hash, sourceSha: expectedSource, sourceEntry: 'app/desktop.js', className: 'ys',
        methods: methodNames, helpers: helperNames, extractedCodeSha256: createHash('sha256').update(code).digest('hex'), cases: results,
        syntheticFutureVersion: future, futureVersionPublishedOrProposed: false,
        applicationJavaOrListenerStarted: false, realUpdateNetworkRequests: 0, installedFirstHopStagingReplacementAndRecovery: 'NOT_ESTABLISHED' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const [file, ...extra] = process.argv.slice(2)
    if (!file || extra.length) throw Error('Usage: node scripts/audit-released-update-discovery.mjs <pinned-v0.5.0-zip>')
    console.log(JSON.stringify(await auditReleasedUpdateDiscovery(file), null, 2))
}
