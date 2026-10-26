// Test-only external preload, copied OUTSIDE the application. Never shipped/loaded by the product.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import cp from 'node:child_process'
import { EventEmitter } from 'node:events'
import { syncBuiltinESMExports } from 'node:module'
import { assertDisposableWindowsCi, createFirstHopFetch, FIRST_HOP_BASELINE, FIRST_HOP_SCENARIOS, localConnectTarget, loopbackHost, sha256 } from './old-client-first-hop.mjs'

const file = process.env.READER_FIRST_HOP_FIXTURE
if (!file) throw Error('External first-hop preload requires its own explicit CI fixture')
assertDisposableWindowsCi()
if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 8192) throw Error('Invalid first-hop fixture descriptor')
const input = JSON.parse(fs.readFileSync(file, 'utf8')), root = fs.realpathSync.native(input.root)
if (input.schemaVersion !== 1 || !FIRST_HOP_SCENARIOS.includes(input.scenario) || !/^[a-f0-9]{32}$/.test(input.nonce) ||
    !/^pica-old-first-hop-[a-f0-9]{32}[a-zA-Z0-9]{6}$/.test(path.basename(root)) || fs.realpathSync.native(path.dirname(root)) !== fs.realpathSync.native(os.tmpdir()) || fs.lstatSync(input.root).isSymbolicLink()) throw Error('Only a fresh owned first-hop CI root is permitted')
const inside = value => {
    const absolute = path.resolve(String(value)), relative = path.relative(root, absolute)
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Error('Fixture path escaped owned CI root')
    return absolute
}
inside(file)
const app = inside(input.applicationRoot), audit = inside(input.auditFile), archive = inside(input.archiveFile)
const archiveBytes = fs.readFileSync(archive)
if (sha256(archiveBytes) !== input.candidateSha256 || !/^[a-f0-9]{40}$/.test(input.candidateSourceSha) || !/^[a-f0-9]{64}$/.test(input.candidateDesktopSha256)) throw Error('Fixture candidate digest/identity mismatch')
const entry = inside(process.argv[1]), entryHash = sha256(fs.readFileSync(entry)), desktop = path.join(app, 'app', 'desktop.js')
const source = () => fs.readFileSync(path.join(app, 'SOURCE_SHA.txt'), 'utf8').trim()
const kind = entry === desktop && entryHash === FIRST_HOP_BASELINE.desktopSha256 && source() === FIRST_HOP_BASELINE.sourceSha ? 'released-desktop' :
    entry === desktop && entryHash === input.candidateDesktopSha256 && source() === input.candidateSourceSha ? 'candidate-desktop' :
    path.basename(entry) === 'full-upgrader.js' && entryHash === FIRST_HOP_BASELINE.helperSha256 ? 'released-helper' : null
if (!kind) throw Error('Unknown or substituted application/helper entrypoint')
const observe = event => fs.appendFileSync(audit, JSON.stringify({ pid: process.pid, entryKind: kind, ...event }) + '\n')
let launchErrorInjected = false
observe({ kind: 'ENTRY_INITIALIZED', sha256: entryHash })
globalThis.fetch = createFirstHopFetch({ scenario: input.scenario, archiveBytes, releasedDesktop: () => kind === 'released-desktop', nativeFetch: globalThis.fetch.bind(globalThis), observe })
const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
    if (!localConnectTarget(args[0])) { observe({ kind: 'NONLOCAL_SOCKET_BLOCKED' }); throw Error('No outbound non-loopback sockets in first-hop fixture') }
    return connect.apply(this, args)
}
for (const module of [http, https]) for (const name of ['request', 'get']) {
    const original = module[name]
    module[name] = function (input, ...args) {
        const host = typeof input === 'string' || input instanceof URL ? new URL(input).hostname : input?.hostname ?? input?.host
        if (!loopbackHost(host)) { observe({ kind: 'NONLOCAL_HTTP_BLOCKED' }); throw Error('No real external HTTP in first-hop fixture') }
        return original.call(this, input, ...args)
    }
}
for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork']) {
    const original = cp[name]
    cp[name] = function (command, ...args) {
        const argv = Array.isArray(args[0]) ? args[0] : []
        if (/^javaw?(?:\.exe)?$/i.test(path.basename(String(command)))) { observe({ kind: 'JAVA_BLOCKED' }); throw Error('Core first-hop must not launch Java') }
        if (kind === 'released-helper' && name === 'spawn' && /^rundll32\.exe$/i.test(path.basename(String(command))) &&
            String(argv[0]).toLowerCase() === 'url.dll,fileprotocolhandler' && argv.length === 2 && loopbackHost(new URL(argv[1]).hostname)) {
            // Post-health UI convenience only; never suppress application launch or fake health.
            observe({ kind: 'BROWSER_CONVENIENCE_NOT_TESTED' })
            const child = new EventEmitter(); child.unref = () => child
            queueMicrotask(() => child.emit('spawn')); return child
        }
        if (name === 'exec' || name === 'execSync' || !path.isAbsolute(String(command))) { observe({ kind: 'UNOWNED_PROCESS_BLOCKED' }); throw Error('Only explicit owned executables in first-hop fixture') }
        const target = inside(command)
        if (!fs.realpathSync.native(target).toLowerCase().startsWith(root.toLowerCase() + path.sep)) throw Error('Linked executable escaped fixture')
        if (kind === 'released-desktop' && path.basename(target).toLowerCase() === 'node.exe') {
            const helper = argv.find(value => String(value).endsWith('full-upgrader.js'))
            if (!helper || sha256(fs.readFileSync(inside(helper))) !== FIRST_HOP_BASELINE.helperSha256) throw Error('Old controller did not select its own exact released helper')
            observe({ kind: 'RELEASED_HELPER_SELECTED', sha256: FIRST_HOP_BASELINE.helperSha256 })
        }
        if (!launchErrorInjected && kind === 'released-helper' && input.scenario === 'launch-rollback' && path.resolve(target) === path.join(app, 'Pica Library.exe') && source() === input.candidateSourceSha) {
            launchErrorInjected = true
            observe({ kind: 'SYNTHETIC_CANDIDATE_LAUNCH_ERROR' })
            const child = new EventEmitter(); child.unref = () => child
            queueMicrotask(() => child.emit('error', Object.assign(Error('test-only first-hop asynchronous launch EACCES'), { code: 'EACCES' })))
            return child
        }
        observe({ kind: 'OWNED_PROCESS_START', executable: path.basename(target) })
        const child = original.call(this, command, ...args)
        if (name === 'spawn' || name === 'fork') child.once('spawn', () => observe({ kind: 'OWNED_CHILD_PUBLISHED', childPid: child.pid, executable: path.basename(target) }))
        return child
    }
}
syncBuiltinESMExports()
