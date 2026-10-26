// External hosted-CI fault/transport boundary. Never included in an application ZIP.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import cp from 'node:child_process'
import { EventEmitter } from 'node:events'
import { syncBuiltinESMExports } from 'node:module'
import { assertDisposableWindowsCi, localConnectTarget, loopbackHost, sha256 } from './old-client-first-hop.mjs'
import { createRuntimeChoiceFetch, RUNTIME_CHOICE_SCENARIOS } from './runtime-choice-fixture.mjs'

assertDisposableWindowsCi()
const descriptor = process.env.READER_RUNTIME_CHOICE_FIXTURE
if (!descriptor || fs.lstatSync(descriptor).isSymbolicLink() || fs.statSync(descriptor).size > 8192) throw Error('Explicit bounded runtime-choice CI descriptor required')
const input = JSON.parse(fs.readFileSync(descriptor, 'utf8')), root = fs.realpathSync.native(input.root)
if (input.schemaVersion !== 1 || !RUNTIME_CHOICE_SCENARIOS.includes(input.scenario) || !/^[a-f0-9]{32}$/.test(input.nonce ?? '') ||
    !/^pica-runtime-choice-[a-f0-9]{32}[a-zA-Z0-9]{6}$/.test(path.basename(root)) || fs.realpathSync.native(path.dirname(root)) !== fs.realpathSync.native(os.tmpdir()) || fs.lstatSync(input.root).isSymbolicLink()) throw Error('Fresh owned runtime-choice root required')
function inside(value) {
    const file = path.resolve(String(value)), relative = path.relative(root, file)
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Error('Runtime-choice path escaped owned root')
    if (fs.existsSync(file) && !fs.realpathSync.native(file).toLowerCase().startsWith(root.toLowerCase() + path.sep)) throw Error('Linked runtime-choice path escaped root')
    return file
}
inside(descriptor)
const app = inside(input.applicationRoot), audit = inside(input.auditFile)
const archives = Object.fromEntries(['core', 'jm'].map(mode => {
    const bytes = fs.readFileSync(inside(input.archives[mode].file))
    if (sha256(bytes) !== input.archives[mode].sha256) throw Error('Runtime-choice archive hash mismatch')
    return [mode, bytes]
}))
for (const key of ['sourceSha', 'desktopSha256', 'helperSha256']) if (!(key === 'sourceSha' ? /^[a-f0-9]{40}$/ : /^[a-f0-9]{64}$/).test(input[key] ?? '')) throw Error('Invalid exact fixture identity')
const entry = inside(process.argv[1]), entryHash = sha256(fs.readFileSync(entry))
const entryKind = entry === path.join(app, 'app', 'desktop.js') && entryHash === input.desktopSha256 ? 'desktop' :
    path.basename(entry) === 'full-upgrader.js' && entryHash === input.helperSha256 ? 'helper' : null
if (!entryKind || fs.readFileSync(path.join(app, 'SOURCE_SHA.txt'), 'utf8').trim() !== input.sourceSha) throw Error('Substituted application/helper/source refused')
const composition = () => {
    const value = JSON.parse(fs.readFileSync(path.join(app, 'app', 'runtime-composition.json'), 'utf8'))
    if (value.formatVersion !== 1 || !Array.isArray(value.sourceRuntimes) || value.sourceRuntimes.length > 1 || value.sourceRuntimes.some(id => id !== 'jm')) throw Error('Unknown installed composition')
    return value.sourceRuntimes.length ? 'jm' : 'core'
}
const observe = event => fs.appendFileSync(audit, JSON.stringify({ pid: process.pid, entryKind, ...event }) + '\n')
observe({ kind: 'ENTRY_INITIALIZED', sha256: entryHash, composition: composition() })
process.on('uncaughtExceptionMonitor', error => observe({ kind: 'UNCAUGHT_EXCEPTION_OBSERVED', name: error?.name, code: /^[A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : null }))
process.on('exit', code => observe({ kind: 'ENTRY_EXIT_OBSERVED', code }))
const transport = createRuntimeChoiceFetch({ archives, scenario: input.scenario, nativeFetch: globalThis.fetch.bind(globalThis), observe })
globalThis.fetch = async (value, init) => {
    const url = new URL(value instanceof Request ? value.url : String(value)), response = await transport(value, init)
    // A real loopback capability request happens first; only the helper's received
    // health response is faulted. No product bytes, instructions or deadlines change.
    if (input.scenario === 'health-rollback' && entryKind === 'helper' && url.pathname === '/api/v1/capabilities' && composition() === 'jm') {
        await response.arrayBuffer()
        observe({ kind: 'SYNTHETIC_HEALTH_RESPONSE_FAILURE' })
        return new Response('{"syntheticHealthFailure":true}', { status: 503, headers: { 'content-type': 'application/json' } })
    }
    return response
}
const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
    if (!localConnectTarget(args[0])) { observe({ kind: 'NONLOCAL_SOCKET_BLOCKED' }); throw Error('No external source sockets in runtime-choice fixture') }
    return connect.apply(this, args)
}
const listen = net.Server.prototype.listen
net.Server.prototype.listen = function (...args) {
    const options = args[0]
    const host = typeof options === 'object' ? options?.host : typeof args[1] === 'string' ? args[1] : null
    const pipe = typeof options === 'string' && /^\\\\[.?]\\pipe\\/i.test(options)
    if (!pipe && !loopbackHost(host)) { observe({ kind: 'NONLOCAL_LISTENER_BLOCKED' }); throw Error('Only explicit loopback listeners in runtime-choice fixture') }
    return listen.apply(this, args)
}
for (const module of [http, https]) for (const name of ['request', 'get']) {
    const original = module[name]
    module[name] = function (input, ...args) {
        const host = typeof input === 'string' || input instanceof URL ? new URL(input).hostname : input?.hostname ?? input?.host
        if (!loopbackHost(host)) { observe({ kind: 'NONLOCAL_HTTP_BLOCKED' }); throw Error('No external HTTP in runtime-choice fixture') }
        return original.call(this, input, ...args)
    }
}
let launchErrorInjected = false
for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork']) {
    const original = cp[name]
    cp[name] = function (command, ...args) {
        const argv = Array.isArray(args[0]) ? args[0] : []
        if (/^javaw?(?:\.exe)?$/i.test(path.basename(String(command)))) { observe({ kind: 'JAVA_BLOCKED' }); throw Error('Runtime selection must not launch Java') }
        if (entryKind === 'helper' && name === 'spawn' && /^rundll32\.exe$/i.test(path.basename(String(command))) && String(argv[0]).toLowerCase() === 'url.dll,fileprotocolhandler' && argv.length === 2 && loopbackHost(new URL(argv[1]).hostname)) {
            observe({ kind: 'POST_HEALTH_BROWSER_CONVENIENCE_NOT_TESTED' })
            const child = new EventEmitter(); child.unref = () => child; queueMicrotask(() => child.emit('spawn')); return child
        }
        if (name === 'exec' || name === 'execSync' || !path.isAbsolute(String(command))) { observe({ kind: 'UNOWNED_PROCESS_BLOCKED' }); throw Error('Only exact owned executable paths are allowed') }
        const target = inside(command)
        if (entryKind === 'desktop' && path.basename(target).toLowerCase() === 'node.exe') {
            const helper = argv.find(value => String(value).endsWith('full-upgrader.js'))
            if (!helper || sha256(fs.readFileSync(inside(helper))) !== input.helperSha256) throw Error('Actual installed current helper was not selected')
            observe({ kind: 'INSTALLED_HELPER_SELECTED', sha256: input.helperSha256 })
        }
        if (!launchErrorInjected && entryKind === 'helper' && input.scenario === 'launch-rollback' && target === path.join(app, 'Pica Library.exe') && composition() === 'jm') {
            launchErrorInjected = true; observe({ kind: 'SYNTHETIC_TARGET_LAUNCH_ERROR' })
            const child = new EventEmitter(); child.unref = () => child
            queueMicrotask(() => child.emit('error', Object.assign(Error('Synthetic runtime-choice asynchronous launch EACCES'), { code: 'EACCES' })))
            return child
        }
        observe({ kind: 'OWNED_PROCESS_START', executable: path.basename(target) })
        const child = original.call(this, command, ...args)
        if (name === 'spawn' || name === 'fork') child.once('spawn', () => observe({ kind: 'OWNED_CHILD_PUBLISHED', childPid: child.pid, executable: path.basename(target) }))
        return child
    }
}
syncBuiltinESMExports()
