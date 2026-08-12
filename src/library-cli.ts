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

function help() {
    console.log(`pica-library 2.0.0-alpha.1

Usage:
  pica-library init
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
  pica-library download <comic-id...> [--episodes 1,3,5-10] [--concurrency 5]
  pica-library download list
  pica-library download run
  pica-library download <pause|resume|retry|cancel> <job-id>
  pica-library download-favorites --page 1 [--episodes all] [--concurrency 5]
  pica-library download-plan <download-plan.json> [--concurrency 5]
  pica-library organize
  pica-library portable --output pica-download
  pica-library serve [--host 127.0.0.1] [--port 4789]
  pica-library doctor

Global options:
  --data-dir PATH   Data, database and library root (default: .pica-library)
  --json            Machine-readable output

Connected commands use PICA_ACCOUNT and PICA_PASSWORD from the environment or
.env.local. Credentials and tokens are never written to the library database.`)
}

function print(value: unknown) {
    if (hasFlag('json')) console.log(JSON.stringify(value, null, 2))
    else console.log(value)
}

async function main() {
    const command = argv[0] ?? 'help'
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
                JSON.stringify(
                    {
                        schemaVersion: 2,
                        kind: 'pica-library-bundle',
                        generatedAt: new Date().toISOString(),
                        favorites,
                        profile: result.profile,
                        recommendations: result.recommendations
                    },
                    null,
                    2
                ),
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
            const comicIds = positionalsAfter('download')
            const [action, jobId] = comicIds
            if (action === 'list') {
                print(database.listDownloadJobs())
                return
            }
            if (action === 'run') {
                await service.runDownloadQueue({
                    runner: 'LOCAL',
                    concurrency: Number(flag('concurrency', '2'))
                })
                print(database.listDownloadJobs())
                return
            }
            const operatorStatus = {
                pause: 'PAUSED',
                resume: 'QUEUED',
                retry: 'QUEUED',
                cancel: 'CANCELLED'
            } as const
            if (action in operatorStatus) {
                if (!jobId) throw new Error(`A job id is required for ${action}`)
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
                        runner: 'LOCAL'
                    })
                )
            }
            await service.runDownloadQueue({
                runner: 'LOCAL',
                pictureConcurrency: Number(flag('concurrency', '5')),
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
        if (command === 'download-favorites') {
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
                        runner: 'LOCAL'
                    })
                )
            }
            await service.runDownloadQueue({
                runner: 'LOCAL',
                pictureConcurrency: Number(flag('concurrency', '5'))
            })
            print({
                page: favoritePage.page,
                pages: favoritePage.pages,
                totalFavorites: favoritePage.total,
                jobs: jobs.map((job) => database.getDownloadJob(job.id))
            })
            return
        }
        if (command === 'download-plan') {
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
                        runner: 'LOCAL'
                    })
                )
            }
            await service.runDownloadQueue({
                runner: 'LOCAL',
                pictureConcurrency: Number(flag('concurrency', '5'))
            })
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
