import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LocalLibraryIngestion } from '../../src/local-library/ingestion'
import { stageOfflineFullWebQa } from '../../scripts/stage-offline-full-web-qa'
import { buildOfflineCoreCandidate } from '../../scripts/build-offline-core-candidate'
import {
    OFFLINE_QA_SENTINEL, OFFLINE_QA_SENTINEL_TEXT,
    assertTemporaryCorePreviewRoot
} from '../../src/offline-core/qa-ownership'

const folders: string[] = []
const running: ChildProcess[] = []
afterEach(async () => {
    for (const child of running.splice(0)) {
        if (child.exitCode !== null || child.signalCode !== null) continue
        await new Promise<void>(resolve => {
            const deadline = setTimeout(() => {
                child.kill('SIGKILL')
                resolve()
            }, 8000)
            child.once('exit', () => {
                clearTimeout(deadline)
                resolve()
            })
            child.kill('SIGTERM')
        })
    }
    for (const folder of folders.splice(0))
        fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5 })
})
const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=', 'base64'
)
function execute(binary: string, args: string[]) {
    return spawnSync(process.execPath, [binary, ...args], {
        timeout: 30000, encoding: 'utf8'
    })
}
async function readyProcess(binary: string, root: string, cwd: string) {
    const child = spawn(process.execPath, [
        binary, '--owned-temp-root', root, '--explicit-preview-only'
    ], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    running.push(child)
    let stderr = ''
    child.stderr?.on('data', value => { stderr += String(value).slice(0, 1800) })
    const state = await new Promise<Record<string, any>>((resolve, reject) => {
        let buffer = '', settled = false
        const timer = setTimeout(() => fail(
            new Error('Source-free preview startup timed out: ' + stderr)
        ), 20000)
        const fail = (error: Error, value?: Record<string, any>) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            if (error) reject(error)
            else resolve(value!)
        }
        child.stdout?.on('data', chunk => {
            buffer += String(chunk)
            const end = buffer.indexOf('\n')
            if (end < 0) return
            try {
                const row = JSON.parse(buffer.slice(0, end)) as Record<string, any>
                if (row.status !== 'CORE_DESKTOP_PREVIEW_QA_ONLY')
                    throw new Error('Unexpected preview startup')
                fail(undefined as unknown as Error, row)
            } catch (error) { fail(error as Error) }
        })
        child.once('exit', code =>
            fail(new Error('Desktop preview exited ' + code + ': ' + stderr)))
        child.once('error', fail)
    })
    return { child, state, errors: () => stderr }
}
describe('actual independent source-free Desktop entrypoint, never legacy profile', () => {
    it('physically excludes every provider SDK and Host, while retaining original business modules', async () => {
        const candidate = await buildOfflineCoreCandidate('desktop-core-preview')
        expect(candidate.sourceInputs).toContain('src/desktop/core-preview-main.ts')
        expect(candidate.sourceInputs).toContain('src/desktop/instance.ts')
        expect(candidate.sourceInputs).toContain('src/library/core-runtime-composition.ts')
        expect(candidate.sourceInputs).not.toContain('src/offline-core/qa-cli.ts')
        expect(candidate.sourceInputs).not.toContain('src/library/service.ts')
        expect(candidate.sourceInputs).not.toContain('src/services/provider-service.ts')
        expect(candidate.sourceInputs).not.toContain('src/sdk/index.ts')
        expect(candidate.sourceInputs.filter(name => name.startsWith('src/desktop/')))
            .toEqual(['src/desktop/core-preview-main.ts', 'src/desktop/instance.ts'])
        expect(candidate.packageInputs.every(name =>
            name === 'package.json' || name.includes('node_modules/adm-zip/')))
            .toBe(true)
        expect(candidate.bytes.length).toBeGreaterThan(0)
    }, 60000)

    it('serves the ORIGINAL full Web from a fresh owned OS-temp library and keeps a single instance', async () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-core-desktop-preview-'))
        folders.push(home)
        const root = path.join(home, 'owned-local-library')
        const original = path.join(home, 'comic-images')
        fs.mkdirSync(root)
        fs.mkdirSync(original)
        fs.writeFileSync(path.join(root, OFFLINE_QA_SENTINEL),
            OFFLINE_QA_SENTINEL_TEXT, { flag: 'wx' })
        fs.writeFileSync(path.join(original, '01.png'), png)
        const db = new LibraryDatabase(path.join(root, 'library.db'))
        const importer = new LocalLibraryIngestion(db, root)
        const preview = await importer.preview(original, 'folder')
        const comic = await importer.confirm(preview.token)
        db.close()
        const candidate = await buildOfflineCoreCandidate('desktop-core-preview')
        const binary = path.join(home, 'desktop-core-preview.mjs')
        fs.writeFileSync(binary, candidate.bytes, { flag: 'wx' })
        const manifest = stageOfflineFullWebQa(path.join(home, 'web'))
        expect(manifest.sourceSdkIncluded).toBe(false)
        const first = await readyProcess(binary, root, home)
        const entry = new URL(first.state.url)
        expect(entry.hostname).toBe('127.0.0.1')
        expect(first.state).toMatchObject({
            status: 'CORE_DESKTOP_PREVIEW_QA_ONLY',
            sourceCount: 0, userProfileOpened: false,
            defaultDesktopReplaced: false, publishAuthorized: false
        })
        const marker = path.join(root, 'runtime-state', 'core-preview.lock')
        expect(fs.existsSync(marker)).toBe(true)
        const duplicate = execute(binary, [
            '--owned-temp-root', root, '--explicit-preview-only'
        ])
        expect(duplicate.status).not.toBe(0)
        expect(duplicate.stderr).toContain('already running')
        expect((await fetch(entry.origin + '/api/v1/status')).status).toBe(403)
        const opened = await fetch(first.state.url, { redirect: 'manual' })
        expect(opened.status).toBe(303)
        const cookie = opened.headers.get('set-cookie')?.split(';')[0]
        expect(cookie).toMatch(/^pica_offline_qa=[a-f0-9]{64}$/)
        const request = (route: string) => fetch(entry.origin + route, {
            headers: { cookie: cookie! }
        })
        const html = await (await request('/')).text()
        expect(html).toContain('src="./app.js"')
        expect(html).toContain('id="shelves"')
        expect(html).toContain('id="reader"')
        expect((await request('/eh-account.js')).status).toBe(404)
        const caps = await (await request('/api/v1/capabilities')).json()
        expect(caps).toMatchObject({
            providers: {},
            features: { reader: true, shelves: true, recommendationSessions: false }
        })
        const comics = await (await request('/api/v1/comics?limit=5000')).json()
        expect(comics).toMatchObject([
            { comicId: comic.comicId, providerId: 'local' }
        ])
        first.child.kill('SIGTERM')
        await new Promise<void>(resolve => first.child.once('exit', () => resolve()))
        expect(fs.existsSync(marker)).toBe(false)
        const second = await readyProcess(binary, root, home)
        const again = await fetch(second.state.url, { redirect: 'manual' })
        expect(again.status).toBe(303)
        const newCookie = again.headers.get('set-cookie')?.split(';')[0]
        const value = await (await fetch(new URL(second.state.url).origin +
            '/api/v1/comics?limit=5000', {
                headers: { cookie: newCookie! }
            })).json()
        expect(value[0]?.comicId).toBe(comic.comicId)
    }, 90000)

    it('fails closed for absent consent, unowned and installed-style roots', async () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-core-desktop-deny-'))
        folders.push(home)
        const candidate = await buildOfflineCoreCandidate('desktop-core-preview')
        const binary = path.join(home, 'desktop-core-preview.mjs')
        fs.writeFileSync(binary, candidate.bytes)
        const incomplete = path.join(home, 'not-initialized')
        fs.mkdirSync(incomplete)
        expect(execute(binary, ['--owned-temp-root', incomplete]).status)
            .not.toBe(0)
        const denied = execute(binary, [
            '--owned-temp-root', incomplete, '--explicit-preview-only'
        ])
        expect(denied.status).not.toBe(0)
        expect(denied.stderr).toMatch(/owned disposable QA root|absent/)
        expect(() => assertTemporaryCorePreviewRoot(process.cwd()))
            .toThrow()
    }, 60000)
})
