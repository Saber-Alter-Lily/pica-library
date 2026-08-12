#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import Table from 'cli-table3'
import { loadEnv } from './utils'
import { LibraryDatabase } from './library/database'
import { favoritesFromCsv, favoritesToCsv } from './library/csv'
import { LibraryService, parseEpisodeSelection } from './library/service'
import { startLibraryServer } from './library/server'
import {
    materializePortableLibrary,
    organizeLibraryViews
} from './library/organizer'
import type { SortMode } from './library/types'
import { parsePositionals } from './library/arguments'
import { serializeLibraryBundle } from './types/bundle'
import { queueRepairs, scanRepairIssues } from './maintenance/repair'
import { queueUpdate } from './maintenance/updates'
import { buildRunnerArtifact } from './runners/shared/artifact'
import type {
    PerformanceProfile,
    PerformanceSettings
} from './core/downloads/profiles'
import type { DownloadRunner } from './core/downloads/types'

loadEnv()

const argv = process.argv.slice(2)
const flagsWithValues = new Set([
    'data-dir',
    'db',
    'query',
    'author',
    'tag',
    'category',
    'sort',
    'limit',
    'name',
    'episodes',
    'concurrency',
    'job-concurrency',
    'request-interval',
    'max-retries',
    'profile',
    'runner',
    'host',
    'port',
    'page',
    'output'
])

function flag(name: string, fallback?: string) {
    const index = argv.indexOf(`--${name}`)
    if (index >= 0) return argv[index + 1]
    const inline = argv.find((value) => value.startsWith(`--${name}=`))
    return inline ? inline.slice(name.length + 3) : fallback
}

function hasFlag(name: string) {
    return argv.includes(`--${name}`)
}

function listFlag(name: string) {
    return String(flag(name, ''))
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
}

function positionalsAfter(command: string) {
    return parsePositionals(argv, command, flagsWithValues)
}

function downloadRuntimeOptions() {
    const profile = flag('profile', 'balanced') as PerformanceProfile
    if (!['conservative', 'balanced', 'fast', 'custom'].includes(profile))
        throw new Error(`Unknown performance profile: ${profile}`)
    const runner = flag('runner', 'LOCAL')?.toUpperCase() as DownloadRunner
    if (!['LOCAL', 'GITHUB'].includes(runner))
        throw new Error(`Unknown download runner: ${runner}`)
    const custom: Partial<PerformanceSettings> = {}
    if (profile === 'custom') {
        if (flag('job-concurrency'))
            custom.jobConcurrency = Number(flag('job-concurrency'))
        if (flag('concurrency'))
            custom.globalMediaConcurrency = Number(flag('concurrency'))
        if (flag('request-interval'))
            custom.requestIntervalMs = Number(flag('request-interval'))
        if (flag('max-retries')) custom.maxRetries = Number(flag('max-retries'))
    }
    return { profile, runner, custom }
}

function help() {
    console.log(`pica-library 0.1.0-rc.1

Usage:
  pica-library init
  pica-library library <sync|list|import|export>
  pica-library discover <search|recommend>
  pica-library download <add|list|run|pause|resume|retry|cancel>
  pica-library maintenance <updates|repair|authors|health>
  pica-library import <favorites.csv>
  pica-library export <favorites.csv>
  pica-library import-aliases <author-aliases.json>
  pica-library status
  pica-library progress [comic-id]
  pica-library list [--tag TAG] [--author NAME] [--sort latest|likes|views]
  pica-library authors [--pending]
  pica-library author <approve|keep|research> <author-id> [--name NAME]
  pica-library author merge <target-id> <source-id...> [--name NAME]
  pica-library sync
  pica-library prepare-library --output pica-library-export
  pica-library search [KEYWORD] [--tag TAG] [--category NAME] [--sort likes]
  pica-library download <comic-id...> [--episodes 1,3,5-10] [--profile balanced] [--runner LOCAL]
  pica-library download add <comic-id...> [--episodes 1,3,5-10] [--runner LOCAL]
  pica-library download list
  pica-library download run [--profile conservative|balanced|fast]
  pica-library download run --profile custom [--job-concurrency N] [--concurrency N] [--request-interval MS] [--max-retries N]
  pica-library download <pause|resume|retry|cancel> <job-id>
  pica-library download-favorites --page 1 [--episodes all] [--profile balanced]
  pica-library download-plan <download-plan.json> [--profile balanced]
  pica-library organize
  pica-library portable --output pica-download
  pica-library artifact --output pica-download
  pica-library serve [--host 127.0.0.1] [--port 4789]
  pica-library doctor

Maintenance options:
  --queue           Create incremental jobs after update/repair review

Global options:
  --data-dir PATH   Data, database and library root (default: .pica-library)
  --json            Machine-readable output
  --profile NAME    conservative, balanced, fast or custom
  --runner NAME     LOCAL or GITHUB

Connected commands use PICA_ACCOUNT and PICA_PASSWORD from the environment or
.env.local. Credentials and tokens are never written to the library database.`)
}

function print(value: unknown) {
    if (hasFlag('json')) console.log(JSON.stringify(value, null, 2))
    else console.log(value)
}

async function main() {
    const groups: Record<string, Record<string, string>> = {
        library: {
            sync: 'sync',
            list: 'list',
            import: 'import',
            export: 'export'
        },
        discover: { search: 'search', recommend: 'recommendations' },
        maintenance: {
            updates: 'maintenance-updates',
            repair: 'maintenance-repair',
            authors: 'authors',
            health: 'doctor'
        }
    }
    const requested = argv[0] ?? 'help'
    const groupedCommand = groups[requested]?.[argv[1]]
    if (groupedCommand) argv.splice(0, 2, groupedCommand)
    const command = argv[0] ?? requested
    if (['help', '--help', '-h'].includes(command)) {
        help()
        return
    }
    const dataDir = path.resolve(
        flag('data-dir', process.env.PICA_LIBRARY_HOME || '.pica-library')!
    )
    const databaseFile = path.resolve(
        flag('db', path.join(dataDir, 'library.db'))!
    )
    const database = new LibraryDatabase(databaseFile)
    const service = new LibraryService(database, dataDir)
    let keepOpen = false
    try {
        if (command === 'init') {
            print({
                dataDir,
                database: databaseFile,
                summary: database.summary()
            })
            return
        }
        if (command === 'import') {
            const file = positionalsAfter('import')[0]
            if (!file) throw new Error('A CSV file path is required')
            const records = favoritesFromCsv(
                fs.readFileSync(path.resolve(file), 'utf8')
            )
            print(
                database.importFavorites(
                    records,
                    `csv:${path.basename(file)}`,
                    true
                )
            )
            return
        }
        if (command === 'export') {
            const file = positionalsAfter('export')[0]
            if (!file) throw new Error('An output CSV file path is required')
            const output = path.resolve(file)
            fs.mkdirSync(path.dirname(output), { recursive: true })
            const comics = database.listComics({ limit: 5000 })
            fs.writeFileSync(output, favoritesToCsv(comics), 'utf8')
            print({ exported: comics.length, file: output })
            return
        }
        if (command === 'import-aliases') {
            const file = positionalsAfter('import-aliases')[0]
            if (!file)
                throw new Error('An author aliases JSON file is required')
            const dictionary = JSON.parse(
                fs.readFileSync(path.resolve(file), 'utf8')
            ) as {
                authors?: Array<{ canonicalName: string; aliases: string[] }>
            }
            print(database.applyAuthorDictionary(dictionary.authors ?? []))
            return
        }
        if (command === 'status') {
            print({
                dataDir,
                database: databaseFile,
                summary: database.summary()
            })
            return
        }
        if (command === 'progress') {
            const comicId = positionalsAfter('progress')[0]
            const comics = database
                .listComics({ limit: 5000 })
                .filter((comic) => !comicId || comic.comicId === comicId)
                .map((comic) => ({
                    comicId: comic.comicId,
                    title: comic.title,
                    expectedEpisodes: comic.epsCount ?? 0,
                    knownEpisodes: comic.knownEpisodes,
                    knownPictures: comic.knownPictures,
                    downloadedPictures: comic.downloadedPictures,
                    complete:
                        comic.knownPictures > 0 &&
                        comic.knownPictures === comic.downloadedPictures &&
                        (!(comic.epsCount ?? 0) ||
                            comic.knownEpisodes >= (comic.epsCount ?? 0))
                }))
            print(comics)
            return
        }
        if (command === 'list') {
            const comics = database.listComics({
                text: flag('query'),
                author: flag('author'),
                tags: listFlag('tag'),
                categories: listFlag('category'),
                finished: hasFlag('finished')
                    ? true
                    : hasFlag('unfinished')
                      ? false
                      : undefined,
                sort: flag('sort', 'latest') as SortMode,
                limit: Number(flag('limit', '100'))
            })
            if (hasFlag('json')) return print(comics)
            const table = new Table({
                head: [
                    'ID',
                    'Title',
                    'Canonical author',
                    'Likes',
                    'Views',
                    'Updated'
                ]
            })
            for (const comic of comics) {
                table.push([
                    comic.comicId,
                    comic.title,
                    comic.canonicalAuthor ?? comic.author,
                    comic.totalLikes ?? 0,
                    comic.totalViews ?? 0,
                    comic.updatedAt ?? ''
                ])
            }
            console.log(table.toString())
            return
        }
        if (command === 'authors') {
            let authors = database.listAuthors()
            if (hasFlag('pending')) {
                authors = authors.filter(
                    (author) => author.reviewStatus === 'pending'
                )
            }
            if (hasFlag('json')) return print(authors)
            const table = new Table({
                head: [
                    'ID',
                    'Canonical',
                    'Works',
                    'Circles',
                    'Confidence',
                    'Status'
                ]
            })
            for (const author of authors.slice(
                0,
                Number(flag('limit', '200'))
            )) {
                table.push([
                    author.id,
                    author.canonicalName,
                    author.works,
                    author.circles.join(' | '),
                    `${Math.round(author.confidence * 100)}%`,
                    author.reviewStatus
                ])
            }
            console.log(table.toString())
            return
        }
        if (command === 'author') {
            const [action, authorId, ...sourceAuthorIds] =
                positionalsAfter('author')
            if (!action || !authorId)
                throw new Error(
                    'Usage: pica-library author <approve|keep|research> <id>'
                )
            if (action === 'merge') {
                print(
                    database.mergeAuthors(
                        authorId,
                        sourceAuthorIds,
                        flag('name')
                    )
                )
                return
            }
            const statuses = {
                approve: 'approved',
                keep: 'keep_separate',
                research: 'needs_research'
            } as const
            const status = statuses[action as keyof typeof statuses]
            if (!status) throw new Error(`Unknown author decision: ${action}`)
            database.setAuthorDecision(authorId, status, flag('name'))
            print({ success: true, authorId, status })
            return
        }
        if (command === 'sync') {
            print(await service.syncFavorites())
            return
        }
        if (command === 'prepare-library') {
            const outputDir = path.resolve(
                flag('output', 'pica-library-export')!
            )
            await service.syncFavorites()
            const result = await service.recommendations({
                limit: Number(flag('limit', '100')),
                seedCount: 12
            })
            const favorites = database
                .listComics({ limit: 5000 })
                .filter((comic) => comic.isFavorite)
            fs.mkdirSync(outputDir, { recursive: true })
            fs.writeFileSync(
                path.join(outputDir, 'favorites.csv'),
                favoritesToCsv(favorites),
                'utf8'
            )
            fs.writeFileSync(
                path.join(outputDir, 'pica-library-bundle.json'),
                serializeLibraryBundle({
                    schemaVersion: 1,
                    kind: 'pica-library-bundle',
                    generatedAt: new Date().toISOString(),
                    library: { comics: favorites },
                    authors: database.listAuthors(),
                    profile: result.profile as unknown as Record<
                        string,
                        unknown
                    >,
                    recommendations: result.recommendations,
                    queue: database.listDownloadJobs(),
                    provenance: {
                        application: 'pica-library',
                        version: '0.1.0-rc.1',
                        source: 'connected-preparation'
                    }
                }),
                'utf8'
            )
            print({
                outputDir,
                favorites: favorites.length,
                recommendations: result.recommendations.length
            })
            return
        }
        if (command === 'search') {
            const keyword = positionalsAfter('search')[0]
            const records = await service.discover({
                keyword,
                tags: listFlag('tag'),
                categories: listFlag('category'),
                sort: flag('sort', 'likes') as SortMode,
                limit: Number(flag('limit', '100'))
            })
            if (hasFlag('json')) return print(records)
            const table = new Table({
                head: ['ID', 'Title', 'Author', 'Likes', 'Views', 'Updated']
            })
            for (const comic of records) {
                table.push([
                    comic.comicId,
                    comic.title,
                    comic.author,
                    comic.totalLikes ?? 0,
                    comic.totalViews ?? 0,
                    comic.updatedAt ?? ''
                ])
            }
            console.log(table.toString())
            return
        }
        if (command === 'download') {
            const runtime = downloadRuntimeOptions()
            const comicIds = positionalsAfter('download')
            const [action, jobId] = comicIds
            if (action === 'list') {
                print(database.listDownloadJobs())
                return
            }
            if (action === 'run') {
                await service.runDownloadQueue(runtime)
                print(database.listDownloadJobs())
                return
            }
            if (action === 'add') {
                const addIds = comicIds.slice(1)
                if (addIds.length === 0)
                    throw new Error('At least one comic id is required')
                print(
                    addIds.map((comicId) =>
                        service.enqueueDownload({
                            comicId,
                            episodeOrders: parseEpisodeSelection(
                                flag('episodes')
                            ),
                            source: 'manual',
                            runner: runtime.runner
                        })
                    )
                )
                return
            }
            if (action === 'retry') {
                if (!jobId) throw new Error('A job id is required for retry')
                print(database.retryDownloadJob(jobId))
                return
            }
            const operatorStatus = {
                pause: 'PAUSED',
                resume: 'QUEUED',
                cancel: 'CANCELLED'
            } as const
            if (action in operatorStatus) {
                if (!jobId)
                    throw new Error(`A job id is required for ${action}`)
                print(
                    database.transitionDownloadJob(
                        jobId,
                        operatorStatus[action as keyof typeof operatorStatus]
                    )
                )
                return
            }
            if (comicIds.length === 0)
                throw new Error('At least one comic id is required')
            const jobs = []
            for (const comicId of comicIds) {
                jobs.push(
                    service.enqueueDownload({
                        comicId,
                        episodeOrders: parseEpisodeSelection(flag('episodes')),
                        source: 'manual',
                        runner: runtime.runner
                    })
                )
            }
            await service.runDownloadQueue({
                ...runtime,
                onProgress: (progress) => {
                    if (!hasFlag('json')) {
                        process.stdout.write(
                            `\r${progress.comicTitle} / ${progress.episodeTitle}: ${progress.completed}/${progress.total}`
                        )
                        if (progress.completed === progress.total)
                            process.stdout.write('\n')
                    }
                }
            })
            print(jobs.map((job) => database.getDownloadJob(job.id)))
            return
        }
        if (command === 'recommendations') {
            print(
                await service.recommendations({
                    limit: Number(flag('limit', '30'))
                })
            )
            return
        }
        if (command === 'maintenance-updates') {
            const comicIds = positionalsAfter('maintenance-updates')
            const findings = await service.checkUpdates(comicIds)
            const jobs = hasFlag('queue')
                ? findings
                      .filter((finding) => finding.newEpisodeOrders.length > 0)
                      .map((finding) => queueUpdate(database, finding))
                : []
            print({ findings, jobs })
            return
        }
        if (command === 'maintenance-repair') {
            const issues = scanRepairIssues(database)
            const jobs = hasFlag('queue') ? queueRepairs(database, issues) : []
            print({ issues, jobs })
            return
        }
        if (command === 'download-favorites') {
            const runtime = downloadRuntimeOptions()
            const page = Number(flag('page', '1'))
            const favoritePage = await service.favoritesPage(page)
            if (!hasFlag('json')) {
                console.log(
                    `Favorite page ${favoritePage.page}/${favoritePage.pages}: ${favoritePage.comics.length} comics`
                )
            }
            const jobs = []
            for (const comic of favoritePage.comics) {
                jobs.push(
                    service.enqueueDownload({
                        comicId: comic.comicId,
                        episodeOrders: parseEpisodeSelection(flag('episodes')),
                        source: 'library',
                        runner: runtime.runner
                    })
                )
            }
            await service.runDownloadQueue(runtime)
            print({
                page: favoritePage.page,
                pages: favoritePage.pages,
                totalFavorites: favoritePage.total,
                jobs: jobs.map((job) => database.getDownloadJob(job.id))
            })
            return
        }
        if (command === 'download-plan') {
            const runtime = downloadRuntimeOptions()
            const file = positionalsAfter('download-plan')[0]
            if (!file) throw new Error('A download plan JSON file is required')
            const plan = JSON.parse(
                fs.readFileSync(path.resolve(file), 'utf8')
            ) as {
                comicIds?: unknown
                episodeOrders?: unknown
            }
            const comicIds = Array.isArray(plan.comicIds)
                ? plan.comicIds.map(String).filter(Boolean)
                : []
            if (comicIds.length === 0)
                throw new Error('The plan contains no comic ids')
            const episodeOrders = Array.isArray(plan.episodeOrders)
                ? plan.episodeOrders.map(Number).filter(Number.isInteger)
                : []
            const jobs = []
            for (const comicId of comicIds) {
                jobs.push(
                    service.enqueueDownload({
                        comicId,
                        episodeOrders,
                        source: 'manual',
                        runner: runtime.runner
                    })
                )
            }
            await service.runDownloadQueue(runtime)
            print(jobs.map((job) => database.getDownloadJob(job.id)))
            return
        }
        if (command === 'organize') {
            print(
                organizeLibraryViews(
                    dataDir,
                    database.listComics({ limit: 5000 })
                )
            )
            return
        }
        if (command === 'portable') {
            const outputDir = path.resolve(flag('output', 'pica-download')!)
            print(
                materializePortableLibrary(
                    dataDir,
                    database.listComics({ limit: 5000 }),
                    outputDir
                )
            )
            return
        }
        if (command === 'artifact') {
            print(
                buildRunnerArtifact(
                    database,
                    dataDir,
                    path.resolve(flag('output', 'pica-download')!)
                )
            )
            return
        }
        if (command === 'serve') {
            const started = await startLibraryServer({
                database,
                service,
                host: flag('host', '127.0.0.1'),
                port: Number(flag('port', '4789'))
            })
            keepOpen = true
            console.log(`Pica Library is running at ${started.url}`)
            return
        }
        if (command === 'doctor') {
            const checks = {
                node: process.version,
                nodeSupported:
                    Number(process.versions.node.split('.')[0]) >= 22,
                database: databaseFile,
                databaseWritable: true,
                dataDir,
                connectedCredentialsConfigured: Boolean(
                    process.env.PICA_ACCOUNT && process.env.PICA_PASSWORD
                ),
                summary: database.summary()
            }
            print(checks)
            if (!checks.nodeSupported) process.exitCode = 1
            return
        }
        throw new Error(`Unknown command: ${command}`)
    } finally {
        if (!keepOpen) database.close()
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
