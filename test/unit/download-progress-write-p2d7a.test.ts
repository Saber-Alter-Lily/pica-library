import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'

const roots: string[] = []

function setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-p2d7a-'))
    roots.push(root)
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    database.importCatalog([
        {
            comicId: 'progress-comic',
            title: 'Progress Comic',
            author: 'Progress Author',
            categories: [],
            tags: [],
            finished: false
        }
    ])
    return { database }
}

afterEach(() => {
    while (roots.length)
        fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('P2 D7A download progress write discipline', () => {
    it('preserves unspecified progress fields without a pre-read', () => {
        const { database } = setup()
        const job = database.createDownloadJob({
            comicId: 'progress-comic'
        })

        const initial = database.updateDownloadProgress(job.id, {
            progressCompleted: 3,
            progressTotal: 8,
            bytes: 3072,
            expectedBytes: 8192,
            chapterTitle: 'Chapter 12'
        })
        expect(initial).toMatchObject({
            progressCompleted: 3,
            progressTotal: 8,
            bytes: 3072,
            expectedBytes: 8192,
            chapterTitle: 'Chapter 12'
        })

        const partial = database.updateDownloadProgress(job.id, {
            bytes: 4096
        })
        expect(partial).toMatchObject({
            progressCompleted: 3,
            progressTotal: 8,
            bytes: 4096,
            expectedBytes: 8192,
            chapterTitle: 'Chapter 12',
            progressUpdatedAt: expect.any(String)
        })

        const explicitZero = database.updateDownloadProgress(job.id, {
            progressCompleted: 0,
            bytes: 0
        })
        expect(explicitZero).toMatchObject({
            progressCompleted: 0,
            progressTotal: 8,
            bytes: 0,
            expectedBytes: 8192,
            chapterTitle: 'Chapter 12'
        })
        database.close()
    })

    it('retains the unknown-job failure contract', () => {
        const { database } = setup()
        expect(() =>
            database.updateDownloadProgress('missing-job', {
                bytes: 1
            })
        ).toThrow(/Unknown download job/)
        database.close()
    })

    it('keeps the hot write path to one UPDATE plus one return lookup', () => {
        const source = fs.readFileSync('src/library/database.ts', 'utf8')
        const start = source.indexOf(
            'updateDownloadProgress(id: string, patch: DownloadJobPatch)'
        )
        const end = source.indexOf('\n    }\n}', start)
        const method = source.slice(start, end)

        expect(method).toContain('progress_completed = COALESCE(')
        expect(method).toContain('progress_total = COALESCE(')
        expect(method).toContain('bytes = COALESCE(')
        expect(method).not.toContain('const current = this.getDownloadJob(id)')
        expect(method.match(/this\.getDownloadJob\(id\)/g)).toHaveLength(1)
    })

    it('retains the existing 250 ms service persistence throttle', () => {
        const service = fs.readFileSync('src/library/service.ts', 'utf8')
        expect(service).toContain(
            'const DOWNLOAD_PROGRESS_PERSIST_INTERVAL_MS = 250'
        )
        expect(service).toContain(
            'now - lastPersistedAt <\n                            DOWNLOAD_PROGRESS_PERSIST_INTERVAL_MS'
        )
    })
})
