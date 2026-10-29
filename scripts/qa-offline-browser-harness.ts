/**
 * Disposable only. Used exclusively by the S3 Chromium UI QA job.
 * Builds the *same* physical source-free core, uses the existing import and
 * Reader, and keeps the executable + account-free fixtures in OS temp.
 * No install, release, user profile, provider, signature or open network.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { buildOfflineCoreCandidate } from './build-offline-core-candidate'
import { stageOfflineReaderAssetsQa } from './stage-offline-reader-assets-qa'

const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)
const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP, TMP: process.env.TMP
}
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-browser-core-'))
let server: ReturnType<typeof spawn> | undefined

function execute(binary: string, command: string, root: string, args: string[]) {
    const child = spawnSync(process.execPath,
        [binary, command, '--root', root, ...args], {
            env, encoding: 'utf8', timeout: 30_000
        })
    if (child.error || child.status !== 0)
        throw child.error ?? new Error(child.stderr)
    return JSON.parse(child.stdout)
}

async function main() {
    const candidate = await buildOfflineCoreCandidate()
    const binary = path.join(home, 'core.mjs')
    fs.writeFileSync(binary, candidate.bytes, { flag: 'wx' })
    const staged = stageOfflineReaderAssetsQa(path.join(home, 'web'))
    if (staged.count !== 10 || staged.sources !== 0)
        throw new Error('No-source Reader QA Web stage is incomplete')
    const root = path.join(home, 'qa-library')
    const source = path.join(home, 'original-pages')
    fs.mkdirSync(source)
    fs.writeFileSync(path.join(source, '01.png'), png)
    fs.writeFileSync(path.join(source, '02.png'), png)
    execute(binary, 'init', root, ['--confirm-disposable'])
    const imported = execute(binary, 'import', root, [
        '--path', source, '--kind', 'folder', '--confirm'
    ])
    if (!/^local:[0-9a-f]{64}$/.test(imported.comicId) || imported.pages !== 2)
        throw new Error('Offline core browser fixture import failed')
    server = spawn(process.execPath, [binary, 'serve', '--root', root], {
        cwd: home, env, stdio: ['ignore', 'pipe', 'pipe']
    })
    const started = await new Promise<{ url: string }>((resolve, reject) => {
        let pending = '', settled = false, stderr = ''
        const timer = setTimeout(() => done(
            new Error('Offline core browser QA launch timed out: ' + stderr)), 20_000)
        function done(error?: Error, value?: { url: string }) {
            if (settled) return
            settled = true
            clearTimeout(timer)
            if (error) reject(error)
            else resolve(value!)
        }
        server!.stderr?.on('data', data => {
            stderr += String(data).slice(0, 1200)
        })
        server!.stdout?.on('data', data => {
            pending += String(data)
            if (!pending.includes('\n')) return
            try {
                const row = JSON.parse(pending.slice(0, pending.indexOf('\n')))
                if (row.status !== 'OFFLINE_HTTP_QA_ONLY' ||
                    typeof row.url !== 'string')
                    throw new Error('Unexpected source-free browser startup')
                done(undefined, { url: row.url })
            } catch (error) { done(error as Error) }
        })
        server!.once('error', error => done(error))
        server!.once('exit', code =>
            done(new Error('Offline QA process died ' + code)))
    })
    process.stdout.write(JSON.stringify({
        status: 'QA_BROWSER_HARNESS', url: started.url
    }) + '\n')
}

async function cleanup() {
    const child = server
    server = undefined
    if (child && child.exitCode === null) {
        await new Promise<void>(resolve => {
            const timeout = setTimeout(() => {
                child.kill('SIGKILL')
                resolve()
            }, 4_000)
            child.once('exit', () => {
                clearTimeout(timeout)
                resolve()
            })
            child.kill('SIGTERM')
        })
    }
    fs.rmSync(home, { recursive: true, force: true,
        maxRetries: 10, retryDelay: 150 })
}
let stopping = false
function stop() {
    if (stopping) return
    stopping = true
    void cleanup().then(() => process.exit(0)).catch(() => process.exit(1))
}
process.once('SIGTERM', stop)
process.once('SIGINT', stop)
main().catch(async error => {
    process.stderr.write(String(error instanceof Error ? error.message : error) + '\n')
    await cleanup()
    process.exitCode = 1
})
