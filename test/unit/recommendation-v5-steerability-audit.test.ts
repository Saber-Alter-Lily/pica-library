import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import {
    STEERABILITY_AUDIT_V5_VERSION,
    evaluateSteerabilityV5
} from '../../src/recommendation-v5/steerability-audit'
import { defaultPortablePolicyStateV5 } from '../../src/recommendation-v5/portable-policy'

function comic(
    comicId: string,
    input: Partial<StoredComic> = {}
): StoredComic {
    return {
        comicId,
        title: comicId,
        author: input.author ?? 'Author',
        canonicalAuthor:
            input.canonicalAuthor ?? input.author ?? 'Author',
        circle: null,
        authorId: null,
        tags: input.tags ?? [],
        categories: input.categories ?? [],
        finished: true,
        isFavorite: false,
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: '2026-09-17T00:00:00.000Z',
        knownEpisodes: 1,
        knownPictures: 100,
        downloadedPictures: 0,
        pagesCount: 100,
        inLibrary: false,
        providerId: 'pica',
        providerMetadata: {}
    } as StoredComic
}

describe('Recommendation V5 steerability audit', () => {
    it('verifies monotonic soft controls, zero BLOCK leakage, and zero non-match collateral', () => {
        const result = evaluateSteerabilityV5({
            catalog: [
                comic('match-a', { tags: ['target-tag'] }),
                comic('match-b', { tags: ['target-tag'] }),
                comic('other', { tags: ['other-tag'] })
            ],
            state: defaultPortablePolicyStateV5(),
            targets: [
                {
                    targetType: 'TAG',
                    key: 'target-tag',
                    label: 'Target',
                    baselineLevel: 5
                }
            ],
            requestedStep: 3
        })

        expect(result.auditVersion).toBe(
            STEERABILITY_AUDIT_V5_VERSION
        )
        expect(result.mode).toBe('READ_ONLY')
        expect(result.servingImpact).toBe(false)
        expect(result.policyMutationEnabled).toBe(false)
        expect(result.summary).toMatchObject({
            targetCount: 1,
            twoSidedTestableCount: 1,
            passedCount: 1,
            passRate: 1,
            totalBlockLeakage: 0,
            totalBlockCollateral: 0
        })
        expect(result.targets[0]).toMatchObject({
            baselineLevel: 5,
            highLevel: 8,
            lowLevel: 2,
            highDelta: 3,
            lowDelta: -3,
            matchingCandidateCount: 2,
            nonMatchingCandidateCount: 1,
            twoSidedTestable: true,
            meanMatchingAdjustmentDeltaWhenRaised: 0.09,
            meanMatchingAdjustmentDeltaWhenLowered: -0.09,
            maxNonMatchingAdjustmentChange: 0,
            blockLeakage: 0,
            blockCollateral: 0,
            pass: true
        })
    })

    it('does not call an edge-baseline target two-sided steerable when one direction cannot move', () => {
        const result = evaluateSteerabilityV5({
            catalog: [
                comic('match-a', { author: 'Artist A' }),
                comic('other', { author: 'Artist B' })
            ],
            state: defaultPortablePolicyStateV5(),
            targets: [
                {
                    targetType: 'AUTHOR',
                    key: 'Artist A',
                    label: 'Artist A',
                    baselineLevel: 10
                }
            ]
        })
        expect(result.targets[0]).toMatchObject({
            baselineLevel: 10,
            highLevel: 10,
            highDelta: 0,
            lowLevel: 7,
            lowDelta: -3,
            twoSidedTestable: false,
            pass: false
        })
        expect(result.summary.twoSidedTestableCount).toBe(0)
        expect(result.summary.passRate).toBeNull()
    })

    it('isolates the target control from pre-existing unrelated controls', () => {
        const state = {
            ...defaultPortablePolicyStateV5(),
            controls: [
                {
                    targetType: 'TAG' as const,
                    key: 'other-tag',
                    label: 'Other',
                    direction: 'MORE' as const,
                    scope: 'PERSISTENT' as const,
                    source: 'DESKTOP' as const,
                    updatedAt: '2026-09-17T00:00:00.000Z',
                    levelDelta: 2
                }
            ]
        }
        const result = evaluateSteerabilityV5({
            catalog: [
                comic('target', { tags: ['target-tag'] }),
                comic('other', { tags: ['other-tag'] })
            ],
            state,
            targets: [
                {
                    targetType: 'TAG',
                    key: 'target-tag',
                    label: 'Target',
                    baselineLevel: 5
                }
            ]
        })
        expect(result.targets[0]).toMatchObject({
            pass: true,
            maxNonMatchingAdjustmentChange: 0
        })
    })
})
