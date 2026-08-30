import { describe, expect, it } from 'vitest'
import {
    FEATURE_SCHEMA_VERSION,
    cacheKeyMatches,
    pairedBootstrap,
    rankingMetrics,
    scoreFeatureRow,
    stableDigest,
    stableRank
} from '../../_validation/semantic-rebuild/ranker-validation-core'

describe('ranker validation matrix helpers', () => {
    it('keeps deterministic hashes, cache invalidation and tie breaking', () => {
        expect(stableDigest(['a', 1])).toBe(stableDigest(['a', 1]))
        expect(
            cacheKeyMatches(
                { db: 'a', schema: FEATURE_SCHEMA_VERSION },
                { db: 'a', schema: FEATURE_SCHEMA_VERSION }
            )
        ).toBe(true)
        expect(
            cacheKeyMatches(
                { db: 'b', schema: FEATURE_SCHEMA_VERSION },
                { db: 'a', schema: FEATURE_SCHEMA_VERSION }
            )
        ).toBe(false)
        const weights = { historicalSimilarity: 1 } as never
        expect(
            stableRank(
                ['z', 'a'],
                [
                    { historicalSimilarity: 0 } as never,
                    { historicalSimilarity: 0 } as never
                ],
                weights
            ).map((x) => x.comicId)
        ).toEqual(['a', 'z'])
    })

    it('calculates recall, ndcg, mrr and handles empty/short pools', () => {
        const metrics = rankingMetrics(['b', 'a'], ['a', 'c'])
        expect(metrics.recall5).toBe(0.5)
        expect(metrics.mrr).toBe(0.5)
        expect(rankingMetrics([], ['a']).recall12).toBe(0)
    })

    it('computes deterministic paired bootstrap intervals', () => {
        const first = pairedBootstrap([0, 1, 0], 200, 7)
        expect(first).toEqual(pairedBootstrap([0, 1, 0], 200, 7))
        expect(first.mean).toBeCloseTo(1 / 3)
        expect(
            scoreFeatureRow(
                { historicalSimilarity: 2 } as never,
                { historicalSimilarity: 0.5 } as never
            )
        ).toBe(1)
    })
})
