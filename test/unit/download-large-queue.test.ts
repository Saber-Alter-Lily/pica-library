import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'

const directories: string[] = []
afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

function record(index: number) {
    return {
        comicId: `stress-${index}`,
        title: `Stress ${index}`,
        author: `Author ${index % 20}`,
        categories: [], tags: [], finished: false
    }
}

describe('large download queue data access', () => {
    it('summarizes 1500 jobs while returning only a bounded active page', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-queue-stress-'))
        directories.push(directory)
        const database = new LibraryDatabase(path.join(directory, 'library.db'))
        database.importCatalog(Array.from({ length: 1500 }, (_, i) => record(i)))
        const jobs = Array.from({ length: 1500 }, (_, i) =>
            database.createDownloadJob({ comicId: `stress-${i}`, runner: 'LOCAL' })
        )
        for (const job of jobs) database.transitionDownloadJob(job.id, 'QUEUED')
        for (const job of jobs.slice(0, 350)) {
            database.transitionDownloadJob(job.id, 'PREPARING')
            database.transitionDownloadJob(job.id, 'RUNNING')
            database.transitionDownloadJob(job.id, 'COMPLETED')
        }
        const summary = database.downloadJobSummary()
        const page = database.listDownloadJobsPage({ view: 'active', limit: 100 })
        expect(summary.total).toBe(1500)
        expect(summary.finished).toBe(350)
        expect(summary.active).toBe(1150)
        expect(page.total).toBe(1150)
        expect(page.items).toHaveLength(100)
        expect(database.hasActiveDownloadJobs('LOCAL')).toBe(true)
        expect(page.items.every((job) => job.status !== 'COMPLETED')).toBe(true)
        database.close()
    }, 30000)
})
