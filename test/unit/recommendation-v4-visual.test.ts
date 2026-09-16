import { describe, expect, it } from 'vitest'
import {
    aggregatePageEmbeddings,
    buildVisualPreferenceProfile,
    cosineSimilarity,
    normalizeVector,
    rerankWithVisualStyle,
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION,
    type VisualEmbeddingRecord
} from '../../src/recommendation-v4/visual-style'
import type { RankedCandidateWithEvidenceV3 } from '../../src/recommendation-v3/ranker-adapter-v3'

function embedding(
    comicId: string,
    vector: number[],
    sourceKind: VisualEmbeddingRecord['sourceKind'] = 'LOCAL_PAGES',
    embeddingKind: VisualEmbeddingRecord['embeddingKind'] = 'body'
): VisualEmbeddingRecord {
    return {
        comicId,
        modelId: VISUAL_MODEL_ID,
        modelVersion: VISUAL_MODEL_VERSION,
        samplingPolicyVersion: VISUAL_SAMPLING_POLICY_VERSION,
        embeddingKind,
        vector: normalizeVector(vector),
        dimension: vector.length,
        sourceKind,
        sampleCount: embeddingKind === 'body' ? 6 : 1,
        confidence: sourceKind === 'COVER_ONLY' ? 0.5 : 1,
        generatedAt: new Date(0).toISOString(),
        metadata: {}
    }
}

function candidate(comicId: string, rawRank: number): RankedCandidateWithEvidenceV3 {
    return {
        comicId,
        rawRank,
        score: 1 - rawRank * 0.01,
        comic: {
            comicId,
            title: comicId,
            author: '',
            canonicalAuthor: null,
            categories: [],
            tags: [],
            finished: false,
            isFavorite: false,
            totalLikes: 0,
            totalViews: 0,
            downloadedPictures: 0,
            knownPictures: 0,
            knownEpisodes: 0,
            inLibrary: false,
            firstSeenAt: new Date(0).toISOString(),
            lastSeenAt: new Date(0).toISOString()
        },
        features: {
            historicalOrdinalSimilarity: 0,
            historicalSimilarity: 0,
            historicalClusterSimilarity: 0,
            lifetimeSimilarity: 0,
            recentSimilarity: 0,
            sessionSimilarity: 0,
            authorAffinity: 0,
            circleAffinity: 0,
            singleTagAffinity: 0,
            pairInteractionBonus: 0,
            tripleInteractionBonus: 0,
            categorySimilarity: 0,
            itemSimilarity: 0,
            relatedGraphScore: 0,
            positiveBehaviorSimilarity: 0,
            negativeBehaviorPenalty: 0,
            popularity: 0,
            novelty: 0,
            previousImpressionCount: 0,
            recentExposurePenalty: 0,
            alreadyFavorite: false,
            alreadyDownloaded: false,
            alreadyRead: false,
            recallRouteSupport: 0
        },
        reasons: [],
        provenance: [],
        evidence: {
            originIntentIds: [],
            routeFamilies: ['EXPLORATION'],
            providerRanksByIntent: {},
            candidateFandomKeys: [],
            conjunctionEvidence: [],
            primaryFamily: 'EXPLORATION'
        }
    } as unknown as RankedCandidateWithEvidenceV3
}

describe('Recommendation V4 visual style core', () => {
    it('normalizes vectors and keeps cosine geometry', () => {
        expect(normalizeVector([3, 4])).toEqual([0.6, 0.8])
        expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
        expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1)
    })

    it('aggregates multiple pages while resisting one outlier', () => {
        const vector = aggregatePageEmbeddings([
            [1, 0],
            [0.99, 0.01],
            [0.98, 0.02],
            [1, 0.01],
            [0.97, 0.03],
            [0, 1]
        ])
        expect(vector[0]).toBeGreaterThan(0.95)
        expect(vector[1]).toBeLessThan(0.2)
    })

    it('builds multiple positive prototypes and reason-aware negatives', () => {
        const embeddings = [
            embedding('fav-a', [1, 0, 0]),
            embedding('fav-b', [0.98, 0.02, 0]),
            embedding('fav-c', [0, 1, 0]),
            embedding('fav-d', [0.01, 0.99, 0]),
            embedding('bad-style', [0, 0, 1]),
            embedding('bad-topic', [0, 0, 0.9])
        ]
        const profile = buildVisualPreferenceProfile({
            embeddings,
            favoriteComicIds: new Set(['fav-a', 'fav-b', 'fav-c', 'fav-d']),
            feedback: [
                {
                    comicId: 'bad-style',
                    sentiment: 'dislike',
                    feedbackEventId: 'f1',
                    occurredAt: new Date(0).toISOString(),
                    reasons: ['style'],
                    reasonEventId: 'r1'
                },
                {
                    comicId: 'bad-topic',
                    sentiment: 'dislike',
                    feedbackEventId: 'f2',
                    occurredAt: new Date(0).toISOString(),
                    reasons: ['topic'],
                    reasonEventId: 'r2'
                }
            ]
        })
        expect(profile).not.toBeNull()
        expect(profile!.positivePrototypes.length).toBe(2)
        expect(profile!.negativeEvidenceCount).toBe(1)
        expect(profile!.explicitDislikeCount).toBe(2)
    })

    it('keeps candidates without visual data on their baseline rather than assigning zero', () => {
        const profile = buildVisualPreferenceProfile({
            embeddings: [embedding('fav', [1, 0])],
            favoriteComicIds: new Set(['fav']),
            feedback: []
        })!
        const ranked = [candidate('missing', 1), candidate('visual', 2)]
        const shadow = rerankWithVisualStyle({
            ranked,
            embeddings: [embedding('fav', [1, 0]), embedding('visual', [1, 0])],
            profile,
            mode: 'SHADOW'
        })
        expect(shadow.map((item) => item.comicId)).toEqual(['missing', 'visual'])
        expect(shadow[0].visual?.available).toBe(false)
        expect(shadow[0].visual?.shadowScore).toBeCloseTo(1)
    })

    it('can reorder in LIVE mode while SHADOW preserves baseline order', () => {
        const profile = buildVisualPreferenceProfile({
            embeddings: [embedding('fav', [1, 0])],
            favoriteComicIds: new Set(['fav']),
            feedback: []
        })!
        const ranked = [candidate('weak', 1), candidate('strong', 2), candidate('other', 3)]
        const embeddings = [
            embedding('fav', [1, 0]),
            embedding('weak', [0, 1]),
            embedding('strong', [1, 0]),
            embedding('other', [0.5, 0.5], 'COVER_ONLY', 'cover')
        ]
        const shadow = rerankWithVisualStyle({ ranked, embeddings, profile, mode: 'SHADOW' })
        const live = rerankWithVisualStyle({ ranked, embeddings, profile, mode: 'LIVE' })
        expect(shadow.map((item) => item.comicId)).toEqual(['weak', 'strong', 'other'])
        expect(live.findIndex((item) => item.comicId === 'strong')).toBeLessThan(
            live.findIndex((item) => item.comicId === 'weak')
        )
    })
})
