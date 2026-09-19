import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import {
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION,
    type VisualEmbeddingRecord
} from '../../src/recommendation-v4/visual-style'
import type { DiversifiedShadowCandidateV5 } from '../../src/recommendation-v5/batch-diversity'
import type { RankedShadowCandidateV5 } from '../../src/recommendation-v5/relevance-ranker'
import {
    VISUAL_CANDIDATE_COVERAGE_V5_VERSION,
    buildVisualCandidateCoverageV5
} from '../../src/recommendation-v5/visual-candidate-coverage'

function ranked(
    comicId: string,
    rank: number,
    providerId: 'pica' | 'eh' = 'pica',
    score = 1
): RankedShadowCandidateV5 {
    return {
        rank,
        comic: {
            comicId,
            providerId,
            title: comicId,
            author: 'Author',
            categories: [],
            tags: [],
            finished: true
        },
        evidence: {
            routeIds: ['r'],
            channelIds: ['TAG|LIFETIME|TAG:x'],
            surfaces: [providerId],
            families: ['TAG'],
            sourceLayers: ['LIFETIME'],
            precisions: ['PROVIDER_NATIVE'],
            providerRanks: [rank],
            bestProviderRank: rank,
            maxPriority: 60
        },
        score,
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
        reasons: []
    }
}

function diversified(
    row: RankedShadowCandidateV5,
    batchRank: number
): DiversifiedShadowCandidateV5 {
    return {
        ...row,
        batchRank,
        relevanceRank: row.rank,
        allocationPass: 'A',
        diversityPenalty: 0,
        providerBalanceBonus: 0,
        selectionScore: row.score,
        diversityReasons: []
    }
}

function catalogComic(
    comicId: string,
    downloadedPictures = 0
): StoredComic {
    return {
        comicId,
        title: comicId,
        author: 'Author',
        canonicalAuthor: 'Author',
        circle: null,
        authorId: null,
        tags: [],
        categories: [],
        finished: true,
        isFavorite: false,
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: '2026-09-17T00:00:00.000Z',
        knownEpisodes: 1,
        knownPictures: 100,
        downloadedPictures,
        pagesCount: 100,
        inLibrary: downloadedPictures > 0,
        providerId: 'pica',
        providerMetadata: {}
    } as StoredComic
}

function embedding(comicId: string): VisualEmbeddingRecord {
    return {
        comicId,
        modelId: VISUAL_MODEL_ID,
        modelVersion: VISUAL_MODEL_VERSION,
        samplingPolicyVersion:
            VISUAL_SAMPLING_POLICY_VERSION,
        embeddingKind: 'body',
        vector: [1, 0],
        dimension: 2,
        sourceKind: 'LOCAL_PAGES',
        sampleCount: 6,
        confidence: 1,
        generatedAt: '2026-09-01T00:00:00.000Z',
        metadata: {}
    }
}

describe('Visual candidate coverage planning', () => {
    it('measures ranked/batch coverage and prioritizes missing batch candidates', () => {
        const r1 = ranked('c1', 1)
        const r2 = ranked('c2', 2, 'eh', 0.9)
        const r3 = ranked('c3', 3, 'pica', 0.8)
        const r4 = ranked('c4', 60, 'pica', 0.4)
        const result = buildVisualCandidateCoverageV5({
            ranked: [r1, r2, r3, r4],
            diversified: [
                diversified(r1, 1),
                diversified(r2, 2)
            ],
            embeddings: [embedding('c1')],
            catalog: [
                catalogComic('c1', 6),
                catalogComic('c3', 6),
                catalogComic('c4', 0)
            ],
            analysisBudget: 2
        })

        expect(result.coverageVersion).toBe(
            VISUAL_CANDIDATE_COVERAGE_V5_VERSION
        )
        expect(result.mode).toBe('PLAN_ONLY')
        expect(result.servingImpact).toBe(false)
        expect(result.embeddingGenerationEnabled).toBe(false)
        expect(result.candidatePersistenceEnabled).toBe(false)
        expect(result.coverage.ranked).toMatchObject({
            candidateCount: 4,
            indexedCount: 1,
            missingCount: 3,
            coverage: 0.25
        })
        expect(result.coverage.diversifiedBatch).toMatchObject({
            candidateCount: 2,
            indexedCount: 1,
            missingCount: 1,
            coverage: 0.5
        })
        expect(result.selectedForAnalysis.map((item) => item.comicId)).toEqual(
            ['c2', 'c3']
        )
        expect(result.selectedForAnalysis[0]).toMatchObject({
            comicId: 'c2',
            priorityTier: 'DIVERSIFIED_BATCH',
            catalogPresent: false,
            preparationReady: false,
            blockedReason: 'SHADOW_CANDIDATE_NOT_PERSISTED'
        })
        expect(result.selectedForAnalysis[1]).toMatchObject({
            comicId: 'c3',
            priorityTier: 'TOP_50_RELEVANCE',
            catalogPresent: true,
            preparationReady: true,
            recommendedSamplingMode: 'local_only'
        })
        expect(result.budget).toMatchObject({
            requested: 2,
            selectedCount: 2,
            readyCount: 1,
            blockedCount: 1,
            readyFraction: 0.5
        })
        expect(result.diagnostics).toMatchObject({
            nonPersistedMissingCount: 1,
            nonPersistedBatchMissingCount: 1,
            requiresEphemeralPreparationSeam: true
        })
    })

    it('is deterministic and prefers standard sampling for catalogued remote-ready candidates without local pages', () => {
        const r1 = ranked('pica:new', 1, 'pica')
        const result = buildVisualCandidateCoverageV5({
            ranked: [r1],
            diversified: [diversified(r1, 1)],
            embeddings: [],
            catalog: [catalogComic('pica:new', 0)],
            analysisBudget: 10
        })
        expect(result.selectedForAnalysis[0]).toMatchObject({
            comicId: 'pica:new',
            preparationReady: true,
            recommendedSamplingMode: 'standard'
        })
        const again = buildVisualCandidateCoverageV5({
            ranked: [r1],
            diversified: [diversified(r1, 1)],
            embeddings: [],
            catalog: [catalogComic('pica:new', 0)],
            analysisBudget: 10
        })
        expect(again).toEqual(result)
    })
})
