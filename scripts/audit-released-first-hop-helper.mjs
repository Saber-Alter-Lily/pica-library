import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'
import ts from 'typescript'
import { FIRST_HOP_BASELINE, sha256 } from './lib/old-client-first-hop.mjs'

/** Exact old launch function only. No real spawn, filesystem mutation, app, Java or networking. */
export function auditReleasedFirstHopHelper(file) {
    const bytes = fs.readFileSync(file)
    assert.equal(sha256(bytes), FIRST_HOP_BASELINE.zipSha256)
    const zip = new AdmZip(bytes), helperBytes = zip.readFile('app/full-upgrader.js')
    assert.equal(sha256(helperBytes), FIRST_HOP_BASELINE.helperSha256)
    const ast = ts.createSourceFile('released-helper.js', helperBytes.toString('utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'w')
    assert.ok(fn, 'Pinned helper launch function missing')
    const source = fn.getText(ast), children = [], observed = []
    const handlers = []
    function walk(node) {
        if (ts.isStringLiteralLike(node) && ['uncaughtException', 'uncaughtExceptionMonitor'].includes(node.text)) handlers.push(node.text)
        ts.forEachChild(node, walk)
    }
    walk(ast); assert.equal(handlers.length, 0)
    const context = vm.createContext({ t: { existsSync: () => true }, i: { join: path.join }, y: (command, args, options) => {
        observed.push({ executable: path.basename(command), arguments: args, detached: options.detached })
        const child = new EventEmitter(); child.unref = () => child; children.push(child); return child
    } }, { codeGeneration: { strings: false, wasm: false } })
    new vm.Script(source + '; globalThis.launch = w;').runInContext(context, { timeout: 1000 })
    const returned = context.launch('synthetic-not-a-real-application-directory')
    assert.equal(children.length, 1); assert.equal(returned, undefined)
    const listenerCount = children[0].listenerCount('error')
    let unhandled = null
    try { children[0].emit('error', Object.assign(Error('synthetic asynchronous EACCES'), { code: 'EACCES' })) } catch (error) { unhandled = error }
    assert.equal(listenerCount, 0); assert.equal(unhandled?.code, 'EACCES')
    return { status: 'VERIFIED_LEGACY_COUNTEREXAMPLE_NOT_UPGRADE_PASS', baseline: FIRST_HOP_BASELINE, entry: 'app/full-upgrader.js', functionName: 'w',
        extractedFunctionSha256: sha256(source), observations: observed, childErrorListenersAfterReturn: listenerCount, returnedStartupPromise: false,
        asynchronousLaunchErrorEscapes: true, globalUncaughtExceptionHandlerPresent: false,
        actualInstalledRollbackExecuted: false, realSpawnApplicationJavaNetworkOrMutation: false,
        consequence: 'New candidate-helper recovery tests cannot establish this old first-hop error path. Keep actual old-helper launch-recovery gate unresolved; never substitute the candidate helper.' }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const [file, ...extra] = process.argv.slice(2)
    if (!file || extra.length) throw Error('Usage: node scripts/audit-released-first-hop-helper.mjs <pinned-v0.5.0-zip>')
    console.log(JSON.stringify(auditReleasedFirstHopHelper(file), null, 2))
}
