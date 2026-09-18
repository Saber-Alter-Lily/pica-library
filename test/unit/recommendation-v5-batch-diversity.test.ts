import { describe, expect, it } from 'vitest'
import {
    BATCH_DIVERSITY_V5_VERSION,
    diversifyShadowBatchV5
} from '../../src/recommendation-v5/batch-diversity'
import type { RankedShadowCandidateV5 } from '../../src/recommendation-v5/relevance-ranker'

function row(
    comicId: string,
    rank: number,
    score: number,
    input: {
        author?: string
        providerId?: 'pica' | 'eh'
        surfaces?: string[]
    } = {}
): RankedShadowCandidateV5 {
    return {
        rank,
        comic: {
            comicId,
            title: comicId,
            author: input.author ?? 'Artist',
            categories: [],
            tags: [],
            finished: true,
            providerId: input.providerId
        },
        evidence: {
            routeIds: [`route-${comicId}`],
            channelIds: [`channel-${comicId}`],
            surfaces:
                input.surfaces ??
                [input.providerId ?? 'pica'],
            families: ['TAG'],
            sourceLayers: ['LIFETIME'],
            precisions: ['PROVIDER_NATIVE'],
            providerRanks: [rank],
            bestProviderRank: rank,
            maxPriority: 60
        },
        score,
        features: {
            channelPriority: 0.5,
            routeCorroboration: 0,
            providerRankQuality: 0.5,
            providerPrecision: 0.7,
            exactItemEvidence: 0,
            lifetimeAffinity: 0,
            recent30Affinity: 0,
            recent7Affinity: 0,
            sessionAffinity: 0,
            explicitAdjustment: 0,
            popularity: 0
        },
        reasons: []
    }
}

describe('Recommendation V5 batch diversity allocator', () => {
    it('reduces author concentration without replacing relevance ranking', () => {
        const ranked = [
            row('a1', 1, 1.0, { author: 'A' }),
            row('a2', 2, 0.99, { author: 'A' }),
            row('a3', 3, 0.98, { author: 'A' }),
            row('a4', 4, 0.97, { author: 'A' }),
            row('b1', 5, 0.9, { author: 'B' }),
            row('c1', 6, 0.89, { author: 'C' }),
            row('d1', 7, 0.88, { author: 'D' }),
            row('e1', 8, 0.87, { author: 'E' })
        ]
        const result = diversifyShadowBatchV5(
            ranked,
            {},
            6
        )

        expect(result.allocatorVersion).toBe(
            BATCH_DIVERSITY_V5_VERSION
        )
        expect(result.mode).toBe('SHADOW')
        expect(result.servingImpact).toBe(false)
        expect(result.visualStyleDiversityEnabled).toBe(false)
        expect(result.rows[0].comic.comicId).toBe('a1')
        expect(
            result.rows.filter(
                (item) => item.comic.author === 'A'
            ).length
        ).toBeLessThanOrEqual(2)
        expect(
            result.telemetry.selectedConcentration.authorMaxShare
        ).toBeLessThan(
            result.telemetry.rawTopConcentration.authorMaxShare
        )
    })

    it('uses fandom and tag saturation independently from author caps', () => {
        const ranked = [
            row('x1', 1, 1.0, { author: 'A' }),
            row('x2', 2, 0.99, { author: 'B' }),
            row('x3', 3, 0.98, { author: 'C' }),
            row('x4', 4, 0.97, { author: 'D' }),
            row('y1', 5, 0.9, { author: 'E' }),
            row('z1', 6, 0.89, { author: 'F' })
        ]
        const semantic = {
            x1: { fandomKeys: ['ip-x'], tagKeys: ['tag-x'] },
            x2: { fandomKeys: ['ip-x'], tagKeys: ['tag-x'] },
            x3: { fandomKeys: ['ip-x'], tagKeys: ['tag-x'] },
            x4: { fandomKeys: ['ip-x'], tagKeys: ['tag-x'] },
            y1: { fandomKeys: ['ip-y'], tagKeys: ['tag-y'] },
            z1: { fandomKeys: ['ip-z'], tagKeys: ['tag-z'] }
        }
        const result = diversifyShadowBatchV5(
            ranked,
            semantic,
            5
        )
        const firstPassIpX = result.rows.filter(
            (item) =>
                item.allocationPass === 'A' &&
                semantic[item.comic.comicId as keyof typeof semantic]
                    ?.fandomKeys.includes('ip-x')
        )
        expect(firstPassIpX.length).toBeLessThanOrEqual(3)
        expect(
            result.telemetry.selectedConcentration.fandomMaxShare
        ).toBeLessThanOrEqual(
            result.telemetry.rawTopConcentration.fandomMaxShare
        )
        expect(
            result.rows.some((item) =>
                item.diversityReasons.includes(
                    'FANDOM_SATURATION'
                )
            )
        ).toBe(true)
    })

    it('uses provider balance only as a small secondary bonus', () => {
        const ranked = [
            row('p1', 1, 1.0, {
                providerId: 'pica',
                author: 'A'
            }),
            row('p2', 2, 0.99, {
                providerId: 'pica',
                author: 'B'
            }),
            row('e1', 3, 0.985, {
                providerId: 'eh',
                author: 'C'
            }),
            row('e2', 4, 0.98, {
                providerId: 'eh',
                author: 'D'
            })
        ]
        const result = diversifyShadowBatchV5(
            ranked,
            {},
            4
        )
        expect(result.rows[0].comic.comicId).toBe('p1')
        expect(
            result.telemetry.selectedConcentration.providerCounts
        ).toMatchObject({
            eh: 2,
            pica: 2
        })
        expect(
            result.rows.some((item) =>
                item.diversityReasons.includes(
                    'PROVIDER_BALANCE'
                )
            )
        ).toBe(true)
    })

    it('relaxes caps deterministically through A then B then C when the pool is homogeneous', () => {
        const ranked = Array.from({ length: 5 }, (_, index) =>
            row(
                `same-${index + 1}`,
                index + 1,
                1 - index * 0.01,
                { author: 'Same Artist' }
            )
        )
        const result = diversifyShadowBatchV5(
            ranked,
            {},
            5
        )
        expect(result.selectedCount).toBe(5)
        expect(result.telemetry.passCounts).toEqual({
            A: 2,
            B: 1,
            C: 2
        })
        expect(result.rows.map((item) => item.comic.comicId)).toEqual([
            'same-1',
            'same-2',
            'same-3',
            'same-4',
            'same-5'
        ])
    })
})
