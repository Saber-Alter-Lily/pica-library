import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import type { DiversifiedShadowCandidateV5 } from '../../src/recommendation-v5/batch-diversity'
import {
    CORRECTNESS_AUDIT_V5_VERSION,
    auditShadowCorrectnessV5
} from '../../src/recommendation-v5/correctness-audit'
import type {
    ShadowRetrievedCandidateV5
} from '../../src/recommendation-v5/shadow-retrieval'
import { defaultPortablePolicyStateV5 } from '../../src/recommendation-v5/portable-policy'

function candidate(
    comicId: string,
    tags: string[] = []
): ShadowRetrievedCandidateV5 {
    return {
        comic: {
            comicId,
            providerId: 'pica',
            title: comicId,
            author: 'Author ' + comicId,
            tags,
            categories: [],
            finished: true
        },
        evidence: {
            routeIds: ['r'],
            channelIds: ['TAG|LIFETIME|TAG:test'],
            surfaces: ['pica'],
            families: ['TAG'],
            sourceLayers: ['LIFETIME'],
            precisions: ['PROVIDER_NATIVE'],
            providerRanks: [1],
            bestProviderRank: 1,
            maxPriority: 60
        }
    }
}

function diversified(
    row: ShadowRetrievedCandidateV5,
    batchRank: number
): DiversifiedShadowCandidateV5 {
    return {
        rank: batchRank,
        comic: row.comic,
        evidence: row.evidence,
        score: 1,
        features: {
            channelPriority: 0,
            routeCorroboration: 0,
            providerRankQuality: 0,
            providerPrecision: 0,
            exactItemEvidence: 0,
            lifetimeAffinity: 0,
            recent30Affinity: 0,
            recent7Affinity: 0,
            sessionAffinity: 0,
            explicitAdjustment: 0,
            popularity: 0
        },
        reasons: [],
        batchRank,
        relevanceRank: batchRank,
        allocationPass: 'A',
        diversityPenalty: 0,
        providerBalanceBonus: 0,
        selectionScore: 1,
        diversityReasons: []
    }
}

function stored(
    comicId: string,
    input: Partial<StoredComic> = {}
): StoredComic {
    return {
        comicId,
        title: comicId,
        author: input.author ?? 'Author ' + comicId,
        canonicalAuthor:
            input.canonicalAuthor ?? input.author ?? 'Author ' + comicId,
        circle: null,
        authorId: null,
        tags: input.tags ?? [],
        categories: input.categories ?? [],
        finished: true,
        isFavorite: input.isFavorite ?? false,
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: '2026-09-17T00:00:00.000Z',
        knownEpisodes: 1,
        knownPictures: 100,
        downloadedPictures:
            input.downloadedPictures ?? 0,
        pagesCount: 100,
        inLibrary: input.inLibrary ?? false,
        providerId: 'pica',
        providerMetadata: {}
    } as StoredComic
}

describe('Recommendation V5 correctness audit', () => {
    it('passes when a hygienic pool remains clean on a second hygiene pass', () => {
        const a = candidate('a')
        const b = candidate('b')
        const result = auditShadowCorrectnessV5({
            candidates: [a, b],
            diversified: [
                diversified(a, 1),
                diversified(b, 2)
            ],
            catalog: [],
            state: defaultPortablePolicyStateV5(),
            now: new Date('2026-09-17T12:00:00.000Z')
        })
        expect(result.auditVersion).toBe(
            CORRECTNESS_AUDIT_V5_VERSION
        )
        expect(result.mode).toBe('SHADOW_AUDIT')
        expect(result.servingImpact).toBe(false)
        expect(result.catalogMutationEnabled).toBe(false)
        expect(result.policyMutationEnabled).toBe(false)
        expect(result.pass).toBe(true)
        expect(result.rankedPool.totalLeakage).toBe(0)
        expect(result.diversifiedBatch.totalLeakage).toBe(0)
    })

    it('detects owned, repeated-exposure, and hard-control leakage instead of silently scoring it', () => {
        const owned = candidate('owned')
        const seen = candidate('seen')
        const blocked = candidate('blocked', ['blocked-tag'])
        const state = {
            ...defaultPortablePolicyStateV5(),
            seenComicIds: ['seen'],
            controls: [
                {
                    targetType: 'TAG' as const,
                    key: 'blocked-tag',
                    label: 'Blocked Tag',
                    direction: 'BLOCK' as const,
                    scope: 'PERSISTENT' as const,
                    source: 'DESKTOP' as const,
                    updatedAt: '2026-09-17T00:00:00.000Z'
                }
            ]
        }
        const result = auditShadowCorrectnessV5({
            candidates: [owned, seen, blocked],
            diversified: [
                diversified(owned, 1),
                diversified(seen, 2),
                diversified(blocked, 3)
            ],
            catalog: [
                stored('owned', {
                    isFavorite: true,
                    inLibrary: true
                })
            ],
            state,
            now: new Date('2026-09-17T12:00:00.000Z')
        })

        expect(result.pass).toBe(false)
        expect(result.rankedPool).toMatchObject({
            totalLeakage: 3,
            ownershipLeakage: 1,
            repeatedExposureLeakage: 1,
            hardConstraintLeakage: 1,
            pass: false
        })
        expect(result.diversifiedBatch).toMatchObject({
            totalLeakage: 3,
            ownershipLeakage: 1,
            repeatedExposureLeakage: 1,
            hardConstraintLeakage: 1,
            pass: false
        })
        expect(result.tasteNegativeHardFiltered).toBe(false)
    })
})
