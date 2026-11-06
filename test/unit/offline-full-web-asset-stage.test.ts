import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
    FULL_WEB_CORE_ENTRIES, stageOfflineFullWebQa
} from '../../scripts/stage-offline-full-web-qa'

const sha = (bytes: Uint8Array) =>
    createHash('sha256').update(bytes).digest('hex')

describe('CORE-LIB-04b original full Web source-neutral asset staging', () => {
    it('stages the real homepage, library, shelves, Reader and settings, including complete static/dynamic module closure', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-s3-full-web-'))
        try {
            const first = path.join(root, 'first')
            const second = path.join(root, 'second')
            const a = stageOfflineFullWebQa(first)
            const b = stageOfflineFullWebQa(second)
            expect(a).toEqual(b)
            expect(a.kind).toBe('DISPOSABLE_FULL_WEB_CORE_QA_ONLY')
            expect(a.sourceSdkIncluded).toBe(false)
            expect(a.distributable).toBe(false)
            expect(a.appEntrypoints).toEqual([...FULL_WEB_CORE_ENTRIES])
            expect(a.files.length).toBeGreaterThan(22)
            expect(a.sourceHtmlSha256).toBe(sha(
                fs.readFileSync('web/index.html')))
            const list = a.files.map(row => row.name)
            expect(fs.readdirSync(first).sort()).toEqual([
                ...list, 'full-web-qa-manifest.json'
            ].sort())
            for (const row of a.files) {
                const original = fs.readFileSync(path.join(first, row.name))
                expect(original.length).toBe(row.size)
                expect(sha(original)).toBe(row.sha256)
                expect(fs.readFileSync(path.join(second, row.name)))
                    .toEqual(original)
            }
            const html = fs.readFileSync(path.join(first, 'index.html'), 'utf8')
            expect(html).toContain('<script type="module" src="./app.js"></script>')
            for (const id of ['home', 'library', 'shelves', 'reader', 'settings'])
                expect(html).toContain('id="' + id + '"')
            expect(html).not.toContain('src="./eh-account.js"')
            expect(html).not.toContain('src="./jm-account.js"')
            expect(html).not.toContain('src="./source-hosts.js"')
            expect(html).not.toContain('src="./recommendation-v5.js"')
            expect(list).toContain('app.js')
            expect(list).toContain('i18n.js')
            expect(list).toContain('reader-settings.js')
            expect(list).toContain('alpha7-cloud.js')
            expect(list).not.toContain('eh-account.js')
            expect(list).not.toContain('jm-account.js')
            expect(list).not.toContain('source-hosts.js')
            expect(list).not.toContain('source-choices.js')
            expect(list).not.toContain('vendor/driverjs/driver.js.iife.js')
        } finally {
            fs.rmSync(root, { recursive: true, force: true })
        }
    }, 30_000)

    it('refuses overwriting existing assets or touching project/real user roots', () => {
        const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-s3-full-guard-'))
        try {
            const dest = path.join(parent, 'web')
            stageOfflineFullWebQa(dest)
            const old = fs.readFileSync(path.join(dest, 'index.html'))
            expect(() => stageOfflineFullWebQa(dest)).toThrow(/disposable/)
            expect(fs.readFileSync(path.join(dest, 'index.html'))).toEqual(old)
            expect(() => stageOfflineFullWebQa(path.resolve('web'))).toThrow(/temp/)
            expect(() => stageOfflineFullWebQa('web')).toThrow(/absolute/)
        } finally {
            fs.rmSync(parent, { recursive: true, force: true })
        }
    })
})
