import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryQueryService } from '../../src/services/library-query-service'
import type { FavoriteRecord, LibraryFacetQuery } from '../../src/library/types'

function percentile(values: number[], fraction: number) {
    const sorted = [...values].sort((left, right) => left - right)
    if (!sorted.length) return null
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * fraction) - 1)
    )
    return Math.round(sorted[index] * 1000) / 1000
}

function record(index: number): FavoriteRecord {
    return {
        comicId: `library-query-bench-${index}`,
        providerId: index % 5 === 0 ? 'eh' : 'pica',
        providerRemoteId: String(index),
        title: `Benchmark Work ${index}`,
        author: `Circle ${index % 23} [Author ${index % 97}]`,
        categories: [`Category ${index % 12}`],
        tags: [
            `Tag ${index % 31}`,
            `Series ${index % 67}`,
            index % 3 === 0 ? 'Common' : 'Other'
        ],
        finished: index % 4 === 0,
        totalLikes: (index * 17) % 10000,
        totalViews: (index * 113) % 100000,
        updatedAt: new Date(
            Date.UTC(2026, 0, 1) + index * 60_000
        ).toISOString()
    }
}

function timedQuery(
    query: LibraryQueryService,
    input: LibraryFacetQuery,
    warmup: number,
    repeats: number
) {
    for (let index = 0; index < warmup; index += 1) query.query(input)
    const durations: number[] = []
    let result = query.query(input)
    for (let index = 0; index < repeats; index += 1) {
        const started = performance.now()
        result = query.query(input)
        durations.push(performance.now() - started)
    }
    return {
        count: durations.length,
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        maxMs: durations.length
            ? Math.round(Math.max(...durations) * 1000) / 1000
            : null,
        resultTotal: result.total,
        returned: result.items.length,
        authorFacetCount: result.facets.authors.length,
        tagFacetCount: result.facets.tags.length
    }
}

function run(size: number, warmup: number, repeats: number) {
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), `pica-library-query-bench-${size}-`)
    )
    try {
        const database = new LibraryDatabase(path.join(root, 'library.db'))
        const records = Array.from({ length: size }, (_, index) =>
            record(index)
        )
        const importStarted = performance.now()
        database.importFavorites(
            records,
            'benchmark:library-query',
            true,
            true
        )
        const importMs =
            Math.round((performance.now() - importStarted) * 1000) / 1000
        const query = new LibraryQueryService(database)

        const scenarios: Record<string, LibraryFacetQuery> = {
            'library-latest': {
                scope: 'library',
                sort: 'latest',
                limit: 48,
                offset: 0
            },
            'library-provider-finished': {
                scope: 'library',
                providerIds: ['pica'],
                finished: false,
                sort: 'latest',
                limit: 48,
                offset: 0
            },
            'library-tag': {
                scope: 'library',
                tags: ['Common'],
                tagMode: 'all',
                sort: 'latest',
                limit: 48,
                offset: 0
            },
            'library-text-author': {
                scope: 'library',
                text: 'Author 7',
                sort: 'latest',
                limit: 48,
                offset: 0
            }
        }

        const results = Object.fromEntries(
            Object.entries(scenarios).map(([name, input]) => [
                name,
                timedQuery(query, input, warmup, repeats)
            ])
        )
        database.close()
        return {
            librarySize: size,
            importSetupMs: importMs,
            results
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
const warmup = 2
const repeats = 5

console.log(
    JSON.stringify(
        {
            benchmark: 'library-query-sqlite-scaling-p2-d3',
            warning:
                'Synthetic local SQLite scaling evidence only. Do not use CI/shared-runner wall time as a user-facing latency budget.',
            environment: {
                node: process.version,
                platform: process.platform,
                arch: process.arch
            },
            protocol: {
                warmup,
                repeats,
                sizes
            },
            results: sizes.map((size) => run(size, warmup, repeats))
        },
        null,
        2
    )
)
