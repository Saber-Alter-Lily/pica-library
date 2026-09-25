import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { LibraryDatabase } from '../../src/library/database'

const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')

function percentile(values: number[], fraction: number) {
    if (!values.length) return null
    const sorted = [...values].sort((left, right) => left - right)
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * fraction) - 1)
    )
    return Math.round(sorted[index] * 1000) / 1000
}

function summary(values: number[]) {
    return {
        count: values.length,
        p50Ms: percentile(values, 0.5),
        p95Ms: percentile(values, 0.95),
        maxMs: values.length
            ? Math.round(Math.max(...values) * 1000) / 1000
            : null
    }
}

function seed(
    file: string,
    comicCount: number,
    picturesPerComic: number
) {
    const library = new LibraryDatabase(file)
    library.close()

    const database = new DatabaseSync(file)
    const comic = database.prepare(
        `INSERT INTO comics(
            id, title, raw_author, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?)`
    )
    const episode = database.prepare(
        `INSERT INTO episodes(
            id, comic_id, title, order_no, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    const picture = database.prepare(
        `INSERT INTO pictures(
            id, comic_id, episode_id, position, original_name,
            media_path, file_server, status, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const now = '2026-09-24T00:00:00.000Z'

    database.exec('BEGIN IMMEDIATE')
    try {
        for (let comicIndex = 0; comicIndex < comicCount; comicIndex += 1) {
            const comicId = `bench-comic-${comicIndex}`
            const episodeId = `bench-episode-${comicIndex}`
            comic.run(
                comicId,
                `Benchmark Comic ${comicIndex}`,
                `Author ${comicIndex % 97}`,
                now,
                now
            )
            episode.run(
                episodeId,
                comicId,
                'Episode 1',
                1,
                now,
                now
            )
            for (
                let pictureIndex = 0;
                pictureIndex < picturesPerComic;
                pictureIndex += 1
            ) {
                picture.run(
                    `bench-picture-${comicIndex}-${pictureIndex}`,
                    comicId,
                    episodeId,
                    pictureIndex,
                    `${pictureIndex}.jpg`,
                    `/${pictureIndex}.jpg`,
                    'https://media.example',
                    pictureIndex % 3 === 0 ? 'completed' : 'pending',
                    now,
                    now
                )
            }
        }
        database.exec('COMMIT')
        database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch (error) {
        database.exec('ROLLBACK')
        database.close()
        throw error
    }
    database.close()
}

function dropD8AIndex(file: string) {
    const database = new DatabaseSync(file)
    database.exec('DROP INDEX IF EXISTS idx_pictures_comic_status')
    database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    database.close()
}

function measure(file: string, comicCount: number) {
    const database = new LibraryDatabase(file)
    const ids = Array.from(
        { length: Math.min(40, comicCount) },
        (_, index) =>
            `bench-comic-${Math.floor(
                (index * Math.max(1, comicCount - 1)) /
                    Math.max(1, Math.min(40, comicCount) - 1)
            )}`
    )

    for (const comicId of ids.slice(0, 5)) database.getComic(comicId)
    database.listComicsForLibraryQueryBase({ scope: 'catalog' })

    const detailDurations: number[] = []
    for (const comicId of ids) {
        const started = performance.now()
        const comic = database.getComic(comicId)
        if (!comic) throw new Error(`Missing fixture comic: ${comicId}`)
        detailDurations.push(performance.now() - started)
    }

    const broadDurations: number[] = []
    let broadCount = 0
    for (let repeat = 0; repeat < 5; repeat += 1) {
        const started = performance.now()
        const rows = database.listComicsForLibraryQueryBase({
            scope: 'catalog'
        })
        broadDurations.push(performance.now() - started)
        broadCount = rows.length
    }

    database.close()
    return {
        detail: summary(detailDurations),
        broadCatalogProjection: {
            ...summary(broadDurations),
            resultCount: broadCount
        }
    }
}

function ratio(
    withoutIndex: number | null,
    indexed: number | null
) {
    if (
        withoutIndex === null ||
        indexed === null ||
        !Number.isFinite(withoutIndex) ||
        !Number.isFinite(indexed) ||
        indexed <= 0
    )
        return null
    return Math.round((withoutIndex / indexed) * 1000) / 1000
}

function run(comicCount: number, picturesPerComic: number) {
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), `pica-comic-select-bench-${comicCount}-`)
    )
    try {
        const indexedFile = path.join(root, 'indexed.db')
        const withoutIndexFile = path.join(root, 'without-d8a-index.db')
        seed(indexedFile, comicCount, picturesPerComic)
        fs.copyFileSync(indexedFile, withoutIndexFile)
        dropD8AIndex(withoutIndexFile)

        const indexed = measure(indexedFile, comicCount)
        const withoutIndex = measure(withoutIndexFile, comicCount)

        return {
            comicCount,
            picturesPerComic,
            totalPictures: comicCount * picturesPerComic,
            indexed,
            withoutD8AIndex: withoutIndex,
            relativeWithoutIndexOverIndexed: {
                detailP50: ratio(
                    withoutIndex.detail.p50Ms,
                    indexed.detail.p50Ms
                ),
                detailP95: ratio(
                    withoutIndex.detail.p95Ms,
                    indexed.detail.p95Ms
                ),
                broadP50: ratio(
                    withoutIndex.broadCatalogProjection.p50Ms,
                    indexed.broadCatalogProjection.p50Ms
                ),
                broadP95: ratio(
                    withoutIndex.broadCatalogProjection.p95Ms,
                    indexed.broadCatalogProjection.p95Ms
                )
            }
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
}

const requested = process.argv
    .slice(2)
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 100)
const sizes = requested.length ? requested : [500, 2000, 5000]
const picturesPerComic = Math.max(
    1,
    Math.min(
        200,
        Number.parseInt(
            process.env.PICA_BENCH_PICTURES_PER_COMIC ?? '20',
            10
        ) || 20
    )
)

console.log(
    JSON.stringify(
        {
            benchmark: 'comic-select-picture-count-index-scaling-p2-d8b',
            warning:
                'Synthetic local SQLite A/B scaling evidence only. Do not use these wall times as a user-facing latency budget or release threshold.',
            environment: {
                node: process.version,
                platform: process.platform,
                arch: process.arch
            },
            protocol: {
                sizes,
                picturesPerComic,
                detailSamplesPerVariant: 40,
                broadRepeatsPerVariant: 5
            },
            results: sizes.map((size) => run(size, picturesPerComic))
        },
        null,
        2
    )
)
