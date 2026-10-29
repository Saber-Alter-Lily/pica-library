import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
    OFFLINE_READER_ASSETS,
    stageOfflineReaderAssetsQa
} from '../../scripts/stage-offline-reader-assets-qa'

function digest(data: Uint8Array) {
    return createHash('sha256').update(data).digest('hex')
}

describe('S3 actual source-free offline Web Reader asset stage', () => {
    it('copies only the original Reader fragment and approved source-neutral assets, with reproducible digests', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-offline-web-'))
        try {
            const first = path.join(home, 'first')
            const second = path.join(home, 'second')
            const a = stageOfflineReaderAssetsQa(first)
            const b = stageOfflineReaderAssetsQa(second)
            expect(a).toEqual(b)
            expect(a).toMatchObject({
                status: 'UNSIGNED_OFFLINE_READER_QA_ASSETS',
                count: 10, sources: 0, runnableAppReleased: false
            })
            const approved = [...OFFLINE_READER_ASSETS,
                'reader-fragment.html'].sort()
            expect(fs.readdirSync(first).sort()).toEqual(approved)
            for (const row of a.files) {
                const data = fs.readFileSync(path.join(first, row.name))
                expect(row.sha256).toBe(digest(data))
                expect(row.size).toBe(data.length)
                expect(fs.readFileSync(path.join(second, row.name)))
                    .toEqual(data)
            }
            const html = fs.readFileSync('web/index.html', 'utf8')
            const head = '<section id="reader" class="view reader-view">'
            const at = html.indexOf(head)
            const end = html.indexOf('</section>', at)
            expect(fs.readFileSync(path.join(first, 'reader-fragment.html'),
                'utf8')).toBe(html.slice(at, end + '</section>'.length))
            const staged = fs.readFileSync(path.join(first,
                'reader-fragment.html'), 'utf8')
            expect(staged).toContain('id="reader-pages"')
            expect(staged).toContain('id="reader-mode"')
            expect(staged).not.toMatch(/<script|<iframe|<form/i)
            for (const name of [
                'index.html', 'app.js', 'eh-account.js', 'jm-account.js',
                'source-hosts.js', 'recommendation-v5.js'
            ])
                expect(fs.existsSync(path.join(first, name))).toBe(false)
            const allowedJs = new Set<string>(OFFLINE_READER_ASSETS.filter(name =>
                name.endsWith('.js')))
            for (const name of allowedJs) {
                const text = fs.readFileSync(path.join(first, name), 'utf8')
                const imports = [...text.matchAll(/\bfrom\s+['"]\.\/([^'"]+)['"]/g)]
                    .map(row => row[1])
                expect(imports.every(input => allowedJs.has(input))).toBe(true)
            }
        } finally {
            fs.rmSync(home, { recursive: true, force: true })
        }
    })

    it('does not overwrite an existing stage or touch a non-temp directory', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-offline-staging-'))
        try {
            const location = path.join(home, 'web')
            stageOfflineReaderAssetsQa(location)
            const sentinel = fs.readFileSync(path.join(location, 'reader-fragment.html'))
            expect(() => stageOfflineReaderAssetsQa(location))
                .toThrow('not disposable')
            expect(fs.readFileSync(path.join(location, 'reader-fragment.html')))
                .toEqual(sentinel)
            expect(() => stageOfflineReaderAssetsQa(path.join(
                process.cwd(), 'web'
            ))).toThrow(/temp|disposable/i)
        } finally {
            fs.rmSync(home, { recursive: true, force: true })
        }
    })
})
