import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { buildRunnerArtifact } from '../../src/runners/shared/artifact'

describe('runner artifact', () => {
    it('filters GitHub jobs and emits their runner in the portable contract', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-artifact-'))
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        database.importCatalog([
            {
                comicId: 'c1',
                title: 'Work',
                author: 'Alice',
                categories: [],
                tags: [],
                finished: false
            }
        ])
        const job = database.createDownloadJob({
            comicId: 'c1',
            runner: 'GITHUB'
        })
        database.transitionDownloadJob(job.id, 'QUEUED')
        const local = database.createDownloadJob({
            comicId: 'c1',
            runner: 'LOCAL'
        })
        database.transitionDownloadJob(local.id, 'QUEUED')
        expect(database.nextDownloadJobs(10, 'GITHUB')).toEqual([
            expect.objectContaining({ id: job.id, runner: 'GITHUB' })
        ])
        database.transitionDownloadJob(job.id, 'CANCELLED')
        database.transitionDownloadJob(local.id, 'CANCELLED')
        const output = path.join(dir, 'artifact')
        buildRunnerArtifact(database, dir, output)
        expect(fs.readdirSync(output).sort()).toEqual([
            'download-result.json',
            'library',
            'manifest.json'
        ])
        const combined =
            fs.readFileSync(path.join(output, 'manifest.json'), 'utf8') +
            fs.readFileSync(path.join(output, 'download-result.json'), 'utf8')
        expect(combined).not.toMatch(/password|token|cookie|secret/i)
        expect(combined).not.toContain(dir)
        expect(
            JSON.parse(
                fs.readFileSync(
                    path.join(output, 'download-result.json'),
                    'utf8'
                )
            ).jobs
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ jobId: job.id, runner: 'GITHUB' })
            ])
        )
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('configures the workflow CLI path as a GitHub runner', () => {
        const workflow = fs.readFileSync(
            path.resolve('.github/workflows/download.yml'),
            'utf8'
        )
        expect(workflow.match(/--runner GITHUB/g)).toHaveLength(2)
        expect(workflow).toContain('INPUT_PROFILE')
    })
})
