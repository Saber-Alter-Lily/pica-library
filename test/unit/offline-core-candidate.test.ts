import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { buildOfflineCoreCandidate } from '../../scripts/build-offline-core-candidate'

const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)

interface Invocation {
    status: number
    stdout: string
    stderr: string
}
function invoke(binary: string, command: string, root: string,
    args: string[] = []): Invocation {
    const result = spawnSync(
        process.execPath, [binary, command, '--root', root, ...args], {
            encoding: 'utf8',
            timeout: 60_000,
            maxBuffer: 2 * 1024 * 1024,
            env: {
                // No source account or startup flags supplied to this child.
                PATH: process.env.PATH,
                SystemRoot: process.env.SystemRoot,
                TEMP: process.env.TEMP,
                TMP: process.env.TMP
            }
        }
    )
    if (result.error) throw result.error
    return {
        status: result.status ?? -1,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? ''
    }
}
function good(binary: string, command: string, root: string, args: string[] = []) {
    const result = invoke(binary, command, root, args)
    expect(result.status, result.stderr).toBe(0)
    return JSON.parse(result.stdout) as Record<string, any>
}
function denied(binary: string, command: string, root: string, args: string[] = []) {
    const result = invoke(binary, command, root, args)
    expect(result.status, result.stdout).not.toBe(0)
    expect(result.stderr).toContain('OFFLINE_CORE_QA_REJECTED')
    return result
}

describe('S3 actual isolated local-only core file and process', () => {
    it('builds reproducible ESM bytes with a strictly source-free runtime inventory', async () => {
        const first = await buildOfflineCoreCandidate()
        const second = await buildOfflineCoreCandidate()
        expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(true)
        expect(first.sha256).toBe(second.sha256)
        expect(first.sha256).toBe(
            createHash('sha256').update(first.bytes).digest('hex'))
        expect(first.sourceInputs).toEqual(expect.arrayContaining([
            'src/offline-core/qa-cli.ts',
            'src/library/database.ts',
            'src/local-library/ingestion.ts',
            'src/services/reader-service.ts'
        ]))
        expect(first.sourceInputs).not.toContain('src/library/service.ts')
        expect(first.sourceInputs.some(name =>
            name.startsWith('src/providers/') ||
            name.startsWith('src/desktop/') ||
            name.startsWith('src/source-extensions/') ||
            name === 'src/sdk.ts'
        )).toBe(false)
        expect(first.sourceInputs).toEqual(expect.arrayContaining([
            'src/library/core-bootstrap-read.ts',
            'src/app-capabilities.ts',
            'src/version.ts',
            'src/modules/contracts.ts'
        ]))
        expect(first.packageInputs).toContain('package.json')
        expect(first.packageInputs.every(name =>
            name === 'package.json' ||
            name.includes('node_modules/adm-zip/'))).toBe(true)
        expect(first.externalImports.every(name =>
            name.startsWith('node:') ||
            ['fs', 'path', 'util', 'stream', 'buffer', 'crypto', 'events',
                'zlib', 'os', 'module'].includes(name))).toBe(true)
        expect(fs.existsSync('.s3-offline-core-qa/core.mjs')).toBe(false)
    }, 60_000)

    it('uses a standalone bundle for real local import, page, progress and process restart without source', async () => {
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-offline-core-'))
        try {
            const candidate = await buildOfflineCoreCandidate()
            const binary = path.join(folder, 'core.mjs')
            fs.writeFileSync(binary, candidate.bytes, { flag: 'wx' })
            const library = path.join(folder, 'disposable-library')
            const originals = path.join(folder, 'original-pages')
            fs.mkdirSync(originals)
            fs.writeFileSync(path.join(originals, '01.png'), tinyPng)
            fs.writeFileSync(path.join(originals, '02.png'), tinyPng)

            // No silent construction of a library or access to existing
            // stable-profile data; the whole QA root is disposable.
            denied(binary, 'status', library)
            denied(binary, 'init', library)
            expect(fs.existsSync(library)).toBe(false)
            expect(good(binary, 'init', library, ['--confirm-disposable']))
                .toMatchObject({ status: 'QA_INITIALIZED', sourceCount: 0 })
            denied(binary, 'init', library, ['--confirm-disposable'])
            denied(binary, 'import', library,
                ['--path', originals, '--kind', 'folder'])
            expect(good(binary, 'status', library).summary.comics).toBe(0)

            const imported = good(binary, 'import', library, [
                '--path', originals, '--kind', 'folder', '--confirm'
            ])
            expect(imported).toMatchObject({ imported: true, pages: 2 })
            expect(imported.comicId).toMatch(/^local:[a-f0-9]{64}$/)
            const records = good(binary, 'list', library).comics
            expect(records).toHaveLength(1)
            expect(records[0].comicId).toBe(imported.comicId)
            expect(good(binary, 'status', library).summary.downloadedPictures)
                .toBe(2)
            const chapters = good(binary, 'chapters', library,
                ['--comic-id', imported.comicId]).chapters
            expect(chapters).toHaveLength(1)
            const episodeId = chapters[0].id
            const chapterArgs = [
                '--comic-id', imported.comicId,
                '--episode-id', episodeId
            ]
            const chapter = good(binary, 'chapter', library, chapterArgs)
            expect(chapter.pages).toHaveLength(2)
            const page = good(binary, 'picture', library,
                ['--picture-id', chapter.pages[0].id])
            expect(page).toEqual({
                contentType: 'image/png',
                bytes: tinyPng.length,
                sha256: createHash('sha256').update(tinyPng).digest('hex')
            })

            // Writes require explicit confirmation and an in-range page.
            denied(binary, 'progress', library, [
                ...chapterArgs, '--page-index', '1'
            ])
            denied(binary, 'progress', library, [
                ...chapterArgs, '--page-index', '2', '--confirm'
            ])
            good(binary, 'progress', library, [
                ...chapterArgs, '--page-index', '1', '--confirm'
            ])
            // New Node process, same DB and owned pages; no login or Host.
            expect(good(binary, 'chapter', library, chapterArgs)
                .progress?.pageIndex).toBe(1)
            expect(good(binary, 'history', library)
                .readingProgress[0].comicId).toBe(imported.comicId)
            expect(fs.readFileSync(path.join(originals, '01.png')))
                .toEqual(tinyPng)
            expect(fs.readFileSync(path.join(originals, '02.png')))
                .toEqual(tinyPng)

            // The same physically source-free process reads a normal CBZ
            // through the existing approved archive importer (no Host/SDK).
            const archive = path.join(folder, 'synthetic.cbz')
            const zip = new AdmZip()
            zip.addFile('Volume 1/01.png', tinyPng)
            zip.writeZip(archive)
            const cbz = good(binary, 'import', library, [
                '--path', archive, '--kind', 'cbz', '--confirm'
            ])
            expect(cbz).toMatchObject({ imported: true, pages: 1 })
            expect(cbz.comicId).toMatch(/^local:[a-f0-9]{64}$/)
            expect(cbz.comicId).not.toBe(imported.comicId)
            const cbzChapters = good(binary, 'chapters', library, [
                '--comic-id', cbz.comicId
            ]).chapters
            expect(cbzChapters).toHaveLength(1)
            const cbzChapter = good(binary, 'chapter', library, [
                '--comic-id', cbz.comicId,
                '--episode-id', cbzChapters[0].id
            ])
            expect(cbzChapter.pages).toHaveLength(1)
            expect(good(binary, 'picture', library, [
                '--picture-id', cbzChapter.pages[0].id
            ]).sha256).toBe(createHash('sha256').update(tinyPng).digest('hex'))
            expect(good(binary, 'list', library).comics).toHaveLength(2)
            expect(fs.existsSync(archive)).toBe(true)
        } finally {
            fs.rmSync(folder, { recursive: true, force: true, maxRetries: 10,
                retryDelay: 150 })
        }
    }, 120_000)

    it('rejects a protected legacy library before opening or migrating its database', async () => {
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-offline-guard-'))
        try {
            const candidate = await buildOfflineCoreCandidate()
            const binary = path.join(folder, 'core.mjs')
            fs.writeFileSync(binary, candidate.bytes, { flag: 'wx' })
            const legacy = path.join(folder, 'legacy-v050')
            fs.mkdirSync(legacy)
            const database = path.join(legacy, 'library.db')
            const protectedBytes = Buffer.from('never-migrate-user-library-v050')
            fs.writeFileSync(database, protectedBytes)
            denied(binary, 'status', legacy)
            denied(binary, 'init', legacy, ['--confirm-disposable'])
            denied(binary, 'history', legacy)
            expect(fs.readFileSync(database)).toEqual(protectedBytes)
            expect(fs.readdirSync(legacy)).toEqual(['library.db'])
        } finally {
            fs.rmSync(folder, { recursive: true, force: true, maxRetries: 10,
                retryDelay: 150 })
        }
    }, 60_000)
})
