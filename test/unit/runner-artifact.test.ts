import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { buildRunnerArtifact } from '../../src/runners/shared/artifact'

describe('runner artifact', () => {
    it('emits the portable contract without credentials or absolute paths', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-artifact-'))
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        database.importCatalog([{ comicId: 'c1', title: 'Work', author: 'Alice', categories: [], tags: [], finished: false }])
        const job = database.createDownloadJob({ comicId: 'c1', runner: 'GITHUB' })
        database.transitionDownloadJob(job.id, 'CANCELLED')
        const output = path.join(dir, 'artifact')
        buildRunnerArtifact(database, dir, output)
        expect(fs.readdirSync(output).sort()).toEqual(['download-result.json', 'library', 'manifest.json'])
        const combined = fs.readFileSync(path.join(output, 'manifest.json'), 'utf8') + fs.readFileSync(path.join(output, 'download-result.json'), 'utf8')
        expect(combined).not.toMatch(/password|token|cookie|secret/i)
        expect(combined).not.toContain(dir)
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })
})
