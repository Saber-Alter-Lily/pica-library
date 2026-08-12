import fs from 'node:fs'
import path from 'node:path'
import type { LibraryDatabase } from '../../library/database'

export function buildRunnerArtifact(
    database: LibraryDatabase,
    dataDir: string,
    outputDir: string
) {
    const destination = path.resolve(outputDir)
    const source = path.join(path.resolve(dataDir), 'library')
    fs.mkdirSync(destination, { recursive: true })
    if (fs.existsSync(source))
        fs.cpSync(source, path.join(destination, 'library'), {
            recursive: true,
            force: true
        })
    else fs.mkdirSync(path.join(destination, 'library'), { recursive: true })
    const jobs = database.listDownloadJobs()
    const errors = jobs
        .filter((job) => job.status === 'FAILED' || job.error)
        .map((job) => ({
            jobId: job.id,
            comicId: job.comicId,
            error: job.error
        }))
    const result = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        jobs: jobs.map((job) => ({
            jobId: job.id,
            comicId: job.comicId,
            runner: job.runner,
            status: job.status,
            bytes: job.bytes,
            completed: job.progressCompleted,
            total: job.progressTotal,
            retryCount: job.retryCount
        }))
    }
    const manifest = {
        schemaVersion: 1,
        kind: 'pica-library-download-artifact',
        generatedAt: result.generatedAt,
        layout: 'library/{author}/{title} [{short_id}]/{chapter_order} - {chapter}',
        files: ['library/', 'download-result.json', 'manifest.json'],
        hasErrors: errors.length > 0
    }
    fs.writeFileSync(
        path.join(destination, 'download-result.json'),
        JSON.stringify(result, null, 2)
    )
    fs.writeFileSync(
        path.join(destination, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
    )
    if (errors.length)
        fs.writeFileSync(
            path.join(destination, 'errors.json'),
            JSON.stringify(errors, null, 2)
        )
    return { outputDir: destination, jobs: jobs.length, errors: errors.length }
}
