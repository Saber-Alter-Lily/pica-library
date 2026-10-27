// External disposable-CI observation/fault boundary. Not shipped or imported by the product.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import cp from 'node:child_process'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'
import { syncBuiltinESMExports } from 'node:module'
import { assertDisposableWindowsCi, localConnectTarget, loopbackHost, sha256, FIRST_HOP_BASELINE } from './old-client-first-hop.mjs'
import { checkedT3Descriptor, t3OwnedPath, t3ForwardTransport } from './legacy-transition-t3-fixture.mjs'

assertDisposableWindowsCi()
const descriptor = process.env.READER_LEGACY_T3_FIXTURE
if (!descriptor || fs.lstatSync(descriptor).isSymbolicLink() || fs.statSync(descriptor).size > 16384) throw Error('Explicit bounded T3 descriptor required')
const input = checkedT3Descriptor(JSON.parse(fs.readFileSync(descriptor, 'utf8'))), root = fs.realpathSync.native(input.root)
if (!/^pica-legacy-transition-[a-f0-9]{32}[a-zA-Z0-9]{6}$/.test(path.basename(root)) || fs.realpathSync.native(path.dirname(root)) !== fs.realpathSync.native(os.tmpdir()) || fs.lstatSync(input.root).isSymbolicLink()) throw Error('Only a fresh owned T3 root is permitted')
function inside(value) {
    const file = t3OwnedPath(root, value)
    if (fs.existsSync(file) && !fs.realpathSync.native(file).toLowerCase().startsWith(root.toLowerCase() + path.sep)) throw Error('Linked T3 path escaped root')
    return file
}
inside(descriptor)
const app = inside(input.applicationRoot), audit = inside(input.auditFile), forward = fs.readFileSync(inside(input.forwardArchive))
if (sha256(forward) !== input.forwardSha256) throw Error('T3 forward package changed')
const entry = inside(process.argv[1]), entryHash = sha256(fs.readFileSync(entry))
const desktop = path.join(app, 'app', 'desktop.js'), source = () => fs.readFileSync(path.join(app, 'SOURCE_SHA.txt'), 'utf8').trim()
const desktopHash = () => sha256(fs.readFileSync(desktop))
const kind = path.basename(entry) === 'legacy-transition.cjs' && entryHash === input.transitionSha256 ? 'transition' :
    path.basename(entry) === 'full-upgrader.js' && entryHash === input.helperSha256 ? 'modern-helper' :
    entry === desktop && source() === FIRST_HOP_BASELINE.sourceSha && entryHash === FIRST_HOP_BASELINE.desktopSha256 ? 'old-desktop' :
    entry === desktop && source() === input.sourceSha && entryHash === input.desktop1Sha256 ? 'desktop-1' :
    entry === desktop && source() === input.sourceSha && entryHash === input.desktop2Sha256 ? 'desktop-2' : null
if (!kind) throw Error('Substituted T3 entrypoint or old helper refused')
const observe = event => fs.appendFileSync(audit, JSON.stringify({ at: Date.now(), pid: process.pid, entryKind: kind, ...event }) + '\n')
observe({ kind: 'ENTRY_INITIALIZED', sha256: entryHash })
process.on('uncaughtExceptionMonitor', error => observe({ kind: 'UNCAUGHT_EXCEPTION_OBSERVED', name: error?.name, code: /^[A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : null }))
process.on('exit', code => observe({ kind: 'ENTRY_EXIT_OBSERVED', code }))
const transport = t3ForwardTransport({ archiveBytes: forward, allowedDesktop: () => input.scenario === 'success-forward' && kind === 'desktop-1', nativeFetch: globalThis.fetch.bind(globalThis), observe })
globalThis.fetch = async (value, init) => {
    const url = new URL(value instanceof Request ? value.url : String(value)), response = await transport(value, init)
    if (input.scenario === 'health-rollback' && kind === 'modern-helper' && url.pathname === '/api/v1/capabilities' && source() === input.sourceSha && desktopHash() === input.desktop1Sha256) {
        await response.arrayBuffer(); observe({ kind: 'SYNTHETIC_HEALTH_RESPONSE_FAILURE' })
        return new Response('{"syntheticHealthFailure":true}', { status: 503, headers: { 'content-type': 'application/json' } })
    }
    return response
}
const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) { if (!localConnectTarget(args[0])) { observe({ kind: 'NONLOCAL_SOCKET_BLOCKED' }); throw Error('No external sockets in T3') } return connect.apply(this, args) }
const listen = net.Server.prototype.listen
net.Server.prototype.listen = function (...args) {
    const value = args[0], host = typeof value === 'object' ? value?.host : typeof args[1] === 'string' ? args[1] : null
    if (!(typeof value === 'string' && /^\\\\[.?]\\pipe\\/i.test(value)) && !loopbackHost(host)) { observe({ kind: 'NONLOCAL_LISTENER_BLOCKED' }); throw Error('T3 listeners must be explicit loopback') }
    return listen.apply(this, args)
}
for (const module of [http, https]) for (const name of ['request', 'get']) {
    const original = module[name]
    module[name] = function (value, ...args) {
        const host = typeof value === 'string' || value instanceof URL ? new URL(value).hostname : value?.hostname ?? value?.host
        if (!loopbackHost(host)) { observe({ kind: 'NONLOCAL_HTTP_BLOCKED' }); throw Error('No external HTTP in T3') }
        return original.call(this, value, ...args)
    }
}
const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe').toLowerCase()
let launchFault = false
for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork']) {
    const original = cp[name]
    cp[name] = function (command, ...args) {
        const argv = Array.isArray(args[0]) ? args[0] : []
        if (/^javaw?(?:\.exe)?$/i.test(path.basename(String(command)))) { observe({ kind: 'JAVA_BLOCKED' }); throw Error('T3 core cannot launch Java') }
        // Preserve the actual read-only Windows process proof; do not mock its rows.
        if (name === 'spawnSync' && path.resolve(String(command)).toLowerCase() === powershell && argv.includes('-NonInteractive') && argv.some(value => String(value).includes('Get-CimInstance Win32_Process'))) {
            observe({ kind: 'ACTUAL_READONLY_WINDOWS_PROCESS_PROOF' }); return original.call(this, command, ...args)
        }
        if (kind === 'modern-helper' && name === 'spawn' && /^rundll32\.exe$/i.test(path.basename(String(command))) && String(argv[0]).toLowerCase() === 'url.dll,fileprotocolhandler' && argv.length === 2 && loopbackHost(new URL(argv[1]).hostname)) {
            observe({ kind: 'POST_HEALTH_BROWSER_CONVENIENCE_NOT_TESTED' })
            const child = new EventEmitter(); child.unref = () => child; queueMicrotask(() => child.emit('spawn')); return child
        }
        if (['exec', 'execSync', 'fork'].includes(name) || !path.isAbsolute(String(command))) { observe({ kind: 'UNOWNED_PROCESS_BLOCKED' }); throw Error('T3 requires explicit owned executables') }
        const target = inside(command)
        const helper = argv.find(value => String(value).endsWith('full-upgrader.js'))
        if (helper) {
            if (sha256(fs.readFileSync(inside(helper))) !== input.helperSha256) throw Error('T3 must use actual target-matched modern helper')
            const instructionFile = inside(argv[argv.indexOf(helper) + 1]), instruction = JSON.parse(fs.readFileSync(instructionFile, 'utf8'))
            if (instruction.healthTimeoutMs !== 60000) throw Error('T3 cannot change the product health deadline')
            observe({ kind: kind === 'transition' ? 'INDEPENDENT_MODERN_HELPER_SELECTED' : 'NORMAL_INSTALLED_HELPER_SELECTED', sha256: input.helperSha256, healthTimeoutMs: instruction.healthTimeoutMs, legacyGuardPresent: Boolean(instruction.legacyTransition) })
        }
        if (!launchFault && kind === 'modern-helper' && input.scenario === 'launch-rollback' && target === path.join(app, 'Pica Library.exe') && source() === input.sourceSha && desktopHash() === input.desktop1Sha256) {
            launchFault = true; observe({ kind: 'SYNTHETIC_TARGET_LAUNCH_ERROR' })
            const child = new EventEmitter(); child.unref = () => child
            queueMicrotask(() => child.emit('error', Object.assign(Error('Synthetic T3 asynchronous launch EACCES'), { code: 'EACCES' }))); return child
        }
        // External instrumentation follows owned children only. This is not a
        // product/environment permission switch and never enters the archives.
        if (['spawn', 'spawnSync', 'execFile', 'execFileSync'].includes(name)) {
            const options = args[1] ?? {}
            args[1] = { ...options, env: { ...(options.env ?? process.env), READER_LEGACY_T3_FIXTURE: descriptor, NODE_OPTIONS: '--import=' + pathToFileURL(import.meta.filename).href } }
        }
        observe({ kind: 'OWNED_PROCESS_START', executable: path.basename(target) })
        const child = original.call(this, command, ...args)
        if (name === 'spawn') child.once('spawn', () => observe({ kind: 'OWNED_CHILD_PUBLISHED', childPid: child.pid, executable: path.basename(target) }))
        return child
    }
}
syncBuiltinESMExports()
