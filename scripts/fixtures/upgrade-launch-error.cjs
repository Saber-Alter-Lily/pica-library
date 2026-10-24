// Synthetic acceptance only: loaded explicitly by the test harness, never by the product.
const fs = require('node:fs')
const path = require('node:path')
const childProcess = require('node:child_process')
const { EventEmitter } = require('node:events')
const { syncBuiltinESMExports } = require('node:module')

const instructionFile = process.argv[2]
if (!instructionFile || path.basename(instructionFile) !== 'instruction.json') throw new Error('Synthetic launch fixture requires its own instruction file')
const root = path.dirname(path.dirname(instructionFile))
if (!/^pica-universal-upgrade-[0-9a-f]{32}$/.test(path.basename(root))) throw new Error('Synthetic launch fixture requires an isolated acceptance root')
const instruction = JSON.parse(fs.readFileSync(instructionFile, 'utf8').replace(/^\uFEFF/, ''))
const target = path.join(instruction.applicationRoot, 'Pica Library.exe')
const relative = path.relative(root, target)
if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Synthetic launch target escaped its acceptance root')
const original = childProcess.spawn
let injected = false
childProcess.spawn = function (command, ...args) {
    if (!injected && path.resolve(String(command)) === path.resolve(target)) {
        injected = true
        const child = new EventEmitter()
        child.unref = () => child
        setImmediate(() => child.emit('error', Object.assign(new Error('synthetic asynchronous launcher EACCES'), { code: 'EACCES' })))
        return child
    }
    // Rollback launches the real baseline executable through the real Windows API.
    return original.call(this, command, ...args)
}
syncBuiltinESMExports()
