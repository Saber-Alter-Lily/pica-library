// External test observer only. Not shipped in the application; never logs argv/stdin/stdout/env.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const assert = require('node:assert/strict'), cp = require('node:child_process')
const { createHash } = require('node:crypto')
assert.ok(process.platform === 'win32' && process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_OS === 'Windows' && process.env.RUNNER_ENVIRONMENT === 'github-hosted', 'Smoke process observation requires disposable Windows CI')
const descriptor = process.env.READER_SMOKE_PROCESS_OBSERVER_FILE
assert.ok(descriptor && !fs.lstatSync(descriptor).isSymbolicLink() && fs.statSync(descriptor).size < 8192)
const value = JSON.parse(fs.readFileSync(descriptor, 'utf8')), root = fs.realpathSync.native(value.root)
assert.match(path.basename(root), /^pica-artifact-smoke-[a-f0-9]{32}$/)
assert.equal(fs.realpathSync.native(path.dirname(root)), fs.realpathSync.native(os.tmpdir()))
const inside = file => { const relative = path.relative(root, path.resolve(file)); assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)); return file }
inside(descriptor); inside(value.applicationRoot); inside(value.auditFile)
assert.equal(path.resolve(process.argv[1]), path.join(value.applicationRoot, 'app', 'desktop.js'))
assert.match(value.sourceSha, /^[a-f0-9]{40}$/)
assert.equal(fs.readFileSync(path.join(value.applicationRoot, 'SOURCE_SHA.txt'), 'utf8').trim(), value.sourceSha)
assert.equal(createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'), value.desktopSha256)
const observe = row => fs.appendFileSync(value.auditFile, JSON.stringify({ pid: process.pid, ...row }) + '\n')
observe({ kind: 'OBSERVER_READY', sourceSha: value.sourceSha })
const original = cp.spawnSync
cp.spawnSync = function (command, argv, ...rest) {
    const started = Date.now(), id = started + '-' + Math.random().toString(16).slice(2)
    const bridge = /powershell\.exe$/i.test(String(command))
    const code = Array.isArray(argv) ? argv.join(' ') : ''
    observe({ kind: 'SYNC_PROCESS_BEGIN', id, commandBase: path.basename(String(command)), windowsPowerShell: bridge,
        dpapiProtect: bridge && /ProtectedData\]::Protect\(/.test(code), dpapiUnprotect: bridge && /ProtectedData\]::Unprotect\(/.test(code) })
    try {
        const result = original.call(this, command, argv, ...rest)
        observe({ kind: 'SYNC_PROCESS_END', id, elapsedMs: Date.now() - started, status: result.status, signal: result.signal,
            errorCode: typeof result.error?.code === 'string' ? result.error.code : null })
        return result
    } catch (error) {
        observe({ kind: 'SYNC_PROCESS_THROW', id, elapsedMs: Date.now() - started,
            errorCode: typeof error?.code === 'string' ? error.code : null })
        throw error
    }
}
require('node:module').syncBuiltinESMExports()
