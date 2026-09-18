import crypto from 'node:crypto'
import {
    rankingMetrics,
    type RankingMetricSet
} from '../../src/recommendation-v5/evaluation-metrics'

export { rankingMetrics }
export type { RankingMetricSet }

export const FEATURE_SCHEMA_VERSION = 'ranker-matrix-v1'

export const FEATURE_NAMES = [
    'historicalSimilarity',
    'historicalClusterSimilarity',
    'lifetimeSimilarity',
    'recentSimilarity',
    'sessionSimilarity',
    'authorAffinity',
    'circleAffinity',
    'singleTagAffinity',
    'categorySimilarity',
    'relatedGraphScore',
    'recallRouteSupport',
    'popularity',
    'novelty',
    'recentExposurePenalty',
    'negativeBehaviorPenalty'
] as const

export type FeatureName = (typeof FEATURE_NAMES)[number]
export type FeatureRow = Record<FeatureName, number>
export type WeightVector = Record<FeatureName, number>

export function stableDigest(value: unknown) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(value))
        .digest('hex')
}

export function scoreFeatureRow(row: FeatureRow, weights: WeightVector) {
    return FEATURE_NAMES.reduce(
        (sum, name) => sum + Number(row[name] ?? 0) * Number(weights[name] ?? 0),
        0
    )
}

export function stableRank(
    candidateIds: string[],
    matrix: FeatureRow[],
    weights: WeightVector
) {
    return candidateIds
        .map((comicId, index) => ({
            comicId,
            score: scoreFeatureRow(matrix[index], weights),
            features: matrix[index]
        }))
        .sort(
            (left, right) =>
                right.score - left.score ||
                left.comicId.localeCompare(right.comicId)
        )
}

export function pairedBootstrap(
    deltas: number[],
    samples = 5000,
    initialSeed = 8675309
) {
    if (!deltas.length) return { mean: 0, low: 0, high: 0 }
    let seed = initialSeed >>> 0
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return seed / 4294967296
    }
    const values: number[] = []
    for (let sample = 0; sample < samples; sample += 1) {
        let sum = 0
        for (let index = 0; index < deltas.length; index += 1)
            sum += deltas[Math.floor(random() * deltas.length)]
        values.push(sum / deltas.length)
    }
    values.sort((a, b) => a - b)
    return {
        mean: deltas.reduce((sum, value) => sum + value, 0) / deltas.length,
        low: values[Math.floor(samples * 0.025)],
        high: values[Math.floor(samples * 0.975)]
    }
}

export function cacheKeyMatches(
    actual: Record<string, string>,
    expected: Record<string, string>
) {
    return Object.entries(expected).every(
        ([key, value]) => actual[key] === value
    )
}
