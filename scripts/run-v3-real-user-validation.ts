import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { LibraryDatabase } from '../src/library/database'
import {
    deterministicHoldout,
    evaluateAblations,
    evaluationMetrics,
    withoutHeldOut
} from '../src/recommendation-v3/evaluator'
import { buildV3Profile } from '../src/recommendation-v3/taste-model'
import { rankV3 } from '../src/recommendation-v3/ranker'
import { rerankV3 } from '../src/recommendation-v3/reranker'

const databasePath = path.resolve(
    process.argv[2] ?? '_validation/real-user/library.db'
)
const reportPath = path.resolve(
    process.argv[3] ?? '_reports/recommendation_v3_real_user_validation.json'
)
const beforeSize = fs.statSync(databasePath).size
const db = new LibraryDatabase(databasePath)
const records = db.listComics({ limit: 5000 })
const favorites = records.filter((item) => item.isFavorite)
const tags = new Set(records.flatMap((item) => item.tags))
const authors = new Set(
    records.map((item) => item.canonicalAuthor ?? item.author).filter(Boolean)
)
const circles = new Set(records.map((item) => item.circle).filter(Boolean))
const tagCounts = records.map((item) => item.tags.length).sort((a, b) => a - b)
const percentile = (value: number) =>
    tagCounts[
        Math.min(tagCounts.length - 1, Math.floor(tagCounts.length * value))
    ] ?? 0

const bootstrapStart = performance.now()
const profile = buildV3Profile(favorites, records, '2026-08-28T00:00:00.000Z')
const bootstrapMs = performance.now() - bootstrapStart
const topSingleTags = profile.historical.tags.slice(0, 30)
const topPairs = profile.historical.pairs.slice(0, 30)
const topTriples = profile.historical.triples.slice(0, 20)

const holdoutKinds = ['random', 'author', 'cluster', 'long-tail'] as const
const ablations = Object.fromEntries(
    holdoutKinds.map((kind) => [
        kind,
        Array.from({ length: kind === 'random' ? 20 : 1 }, (_, index) =>
            evaluateAblations(records, 500, kind, `real-${kind}-${index}`)
        )
    ])
)
const randomRuns = ablations.random as ReturnType<typeof evaluateAblations>[]
const metricSummary = (key: keyof ReturnType<typeof evaluationMetrics>) => {
    const values = randomRuns.map((run) => run.v3WithPairs[key] as number)
    const sorted = [...values].sort((a, b) => a - b)
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const std = Math.sqrt(
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
            values.length
    )
    return {
        mean,
        median: sorted[Math.floor(sorted.length / 2)],
        std,
        min: sorted[0],
        max: sorted[sorted.length - 1]
    }
}

const rankingStart = performance.now()
const ranked = rankV3(records, favorites, profile)
const rankingMs = performance.now() - rankingStart
const comicMap = new Map(records.map((item) => [item.comicId, item]))
const rerankStart = performance.now()
const batches = [0, 1, 2].map((batch) =>
    rerankV3(ranked.slice(batch * 36), comicMap, 12)
)
const rerankMs = performance.now() - rerankStart
const afterSize = fs.statSync(databasePath).size
db.close()

const output = {
    databasePath,
    schemaAfter: 8,
    dataset: {
        totalComics: records.length,
        totalFavorites: favorites.length,
        totalTags: tags.size,
        totalAuthors: authors.size,
        totalCircles: circles.size,
        medianTagsPerComic: percentile(0.5),
        p90TagsPerComic: percentile(0.9)
    },
    historicalBootstrap: {
        topSingleTags,
        topPairs,
        topTriples,
        clusters: profile.historical.clusters
    },
    holdout: {
        kinds: holdoutKinds,
        randomRuns: randomRuns.length,
        summary: Object.fromEntries(
            (
                [
                    'recallAt12',
                    'ndcgAt12',
                    'authorDiversity',
                    'tagDiversity'
                ] as const
            ).map((key) => [key, metricSummary(key)])
        ),
        ablations
    },
    smoke: {
        batches: batches.map((batch) =>
            batch.map((item) => ({
                comicId: item.comicId,
                score: item.score,
                reasons: item.reasons,
                features: item.features
            }))
        )
    },
    performance: {
        bootstrapMs,
        rankingMs,
        rerankMs,
        nextBatchMs: rerankMs / 3
    },
    dbGrowthBytes: afterSize - beforeSize,
    userDataReadOnlyCopy: true,
    trainingLeakageGuard: withoutHeldOut(
        records,
        deterministicHoldout(records, 'random')
    ).every((item) => item.isFavorite)
}
fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, JSON.stringify(output, null, 2), 'utf8')
console.log(JSON.stringify(output))
