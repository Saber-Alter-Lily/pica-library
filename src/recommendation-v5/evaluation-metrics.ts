export const RECOMMENDATION_EVALUATION_METRICS_V5_VERSION =
    'recommendation-evaluation-metrics-v1'

export interface RankingMetricSet {
    precision5: number
    precision12: number
    precision20: number
    precision50: number
    recall5: number
    recall12: number
    recall20: number
    recall50: number
    hit5: number
    hit12: number
    hit20: number
    hit50: number
    ndcg5: number
    ndcg12: number
    ndcg20: number
    ndcg50: number
    mrr: number
    meanRank: number
    medianRank: number
}

function round(value: number) {
    return Math.round(value * 1_000_000) / 1_000_000
}

export function rankingMetrics(
    rankedIds: string[],
    positiveIds: string[]
): RankingMetricSet {
    const relevant = new Set(positiveIds)
    const hitsAt = (limit: number) =>
        rankedIds
            .slice(0, limit)
            .filter((id) => relevant.has(id)).length
    const recall = (limit: number) =>
        hitsAt(limit) / Math.max(1, relevant.size)
    const precision = (limit: number) =>
        hitsAt(limit) /
        Math.max(1, Math.min(limit, rankedIds.length))
    const hit = (limit: number) =>
        hitsAt(limit) > 0 ? 1 : 0
    const dcg = (limit: number) =>
        rankedIds.slice(0, limit).reduce<number>(
            (sum, id, index) =>
                sum +
                (relevant.has(id)
                    ? 1 / Math.log2(index + 2)
                    : 0),
            0
        )
    const ideal = (limit: number) =>
        Array.from({
            length: Math.min(limit, relevant.size)
        }).reduce<number>(
            (sum, _, index) =>
                sum + 1 / Math.log2(index + 2),
            0
        )
    const ranks = rankedIds
        .map((id, index) =>
            relevant.has(id) ? index + 1 : 0
        )
        .filter(Boolean)
        .sort((a, b) => a - b)
    const metric = {
        precision5: precision(5),
        precision12: precision(12),
        precision20: precision(20),
        precision50: precision(50),
        recall5: recall(5),
        recall12: recall(12),
        recall20: recall(20),
        recall50: recall(50),
        hit5: hit(5),
        hit12: hit(12),
        hit20: hit(20),
        hit50: hit(50),
        ndcg5:
            dcg(5) /
            Math.max(Number.EPSILON, ideal(5)),
        ndcg12:
            dcg(12) /
            Math.max(Number.EPSILON, ideal(12)),
        ndcg20:
            dcg(20) /
            Math.max(Number.EPSILON, ideal(20)),
        ndcg50:
            dcg(50) /
            Math.max(Number.EPSILON, ideal(50)),
        mrr: ranks.length ? 1 / ranks[0] : 0,
        meanRank: ranks.length
            ? ranks.reduce(
                  (sum, value) => sum + value,
                  0
              ) / ranks.length
            : 0,
        medianRank: ranks.length
            ? ranks[Math.floor(ranks.length / 2)]
            : 0
    }
    return Object.fromEntries(
        Object.entries(metric).map(([key, value]) => [
            key,
            round(value)
        ])
    ) as unknown as RankingMetricSet
}

export function itemCoverage(
    recommendationLists: string[][],
    catalogSize: number
) {
    const recommended = new Set(
        recommendationLists.flat().filter(Boolean)
    )
    return {
        distinctRecommendedItems: recommended.size,
        catalogSize: Math.max(0, catalogSize),
        coverage:
            catalogSize > 0
                ? round(
                      recommended.size / catalogSize
                  )
                : 0
    }
}

export function meanMetric(
    rows: RankingMetricSet[]
): RankingMetricSet {
    const keys = Object.keys(
        rankingMetrics([], [])
    ) as Array<keyof RankingMetricSet>
    return Object.fromEntries(
        keys.map((key) => [
            key,
            rows.length
                ? round(
                      rows.reduce(
                          (sum, row) =>
                              sum + row[key],
                          0
                      ) / rows.length
                  )
                : 0
        ])
    ) as RankingMetricSet
}
