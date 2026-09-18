import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import {
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION,
    type VisualEmbeddingRecord
} from '../../src/recommendation-v4/visual-style'
import {
    VISUAL_REPRESENTATION_QC_V5_VERSION,
    buildVisualRepresentationQcV5
} from '../../src/recommendation-v5/visual-representation-qc'

function comic(
    comicId: string,
    input: Partial<StoredComic> = {}
): StoredComic {
    return {
        comicId,
        title: input.title ?? comicId,
        author: input.author ?? 'Author',
        canonicalAuthor:
            input.canonicalAuthor ?? input.author ?? 'Author',
        circle: input.circle ?? null,
        authorId: input.authorId ?? null,
        tags: input.tags ?? [],
        categories: input.categories ?? [],
        finished: input.finished ?? true,
        isFavorite: input.isFavorite ?? false,
        firstSeenAt:
            input.firstSeenAt ?? '2026-01-01T00:00:00.000Z',
        lastSeenAt:
            input.lastSeenAt ?? '2026-09-17T00:00:00.000Z',
        knownEpisodes: input.knownEpisodes ?? 1,
        knownPictures: input.knownPictures ?? 100,
        downloadedPictures: input.downloadedPictures ?? 0,
        pagesCount: input.pagesCount ?? 100,
        inLibrary: input.inLibrary ?? false,
        providerId: input.providerId ?? 'pica',
        providerMetadata: input.providerMetadata ?? {}
    } as StoredComic
}

function embedding(
    comicId: string,
    vector: number[],
    input: Partial<VisualEmbeddingRecord> = {}
): VisualEmbeddingRecord {
    return {
        comicId,
        modelId: input.modelId ?? VISUAL_MODEL_ID,
        modelVersion:
            input.modelVersion ?? VISUAL_MODEL_VERSION,
        samplingPolicyVersion:
            input.samplingPolicyVersion ??
            VISUAL_SAMPLING_POLICY_VERSION,
        embeddingKind: input.embeddingKind ?? 'body',
        vector,
        dimension: vector.length,
        sourceKind: input.sourceKind ?? 'LOCAL_PAGES',
        sampleCount: input.sampleCount ?? 6,
        confidence: input.confidence ?? 1,
        generatedAt:
            input.generatedAt ?? '2026-09-01T00:00:00.000Z',
        metadata: input.metadata ?? {}
    }
}

describe('Visual V1 representation QC', () => {
    const catalog = [
        comic('a1', {
            author: 'Artist A',
            providerId: 'pica',
            pagesCount: 100,
            isFavorite: true
        }),
        comic('a2', {
            author: 'Artist A',
            providerId: 'pica',
            pagesCount: 105
        }),
        comic('a3', {
            author: 'Artist A',
            providerId: 'eh',
            pagesCount: 160
        }),
        comic('b1', {
            author: 'Artist B',
            providerId: 'eh',
            pagesCount: 100,
            isFavorite: true,
            providerMetadata: {
                rawTags: ['parody:Series X']
            }
        }),
        comic('c1', {
            author: 'Artist C',
            providerId: 'pica',
            pagesCount: 95
        }),
        comic('d1', {
            author: 'Artist D',
            providerId: 'pica',
            pagesCount: 100
        }),
        comic('favorite-without-vector', {
            author: 'Artist E',
            providerId: 'pica',
            isFavorite: true
        })
    ]

    const embeddings = [
        embedding('a1', [1, 0], {
            sourceKind: 'LOCAL_PAGES'
        }),
        embedding('a2', [0.995, 0.1], {
            sourceKind: 'LOCAL_PAGES'
        }),
        embedding('a3', [0.98, 0.2], {
            sourceKind: 'REMOTE_PAGES'
        }),
        embedding('b1', [0, 1], {
            sourceKind: 'REMOTE_PAGES'
        }),
        embedding('c1', [0.08, 0.997], {
            sourceKind: 'LOCAL_PAGES'
        }),
        embedding('d1', [-1, 0], {
            sourceKind: 'LOCAL_PAGES'
        }),
        // Cover must not replace the preferred body embedding.
        embedding('a1', [0, 1], {
            embeddingKind: 'cover',
            sourceKind: 'COVER_ONLY',
            sampleCount: 1,
            confidence: 0.5
        }),
        // Old model state must not enter current Visual V1 QC.
        embedding('favorite-without-vector', [1, 0], {
            modelVersion: 'old-model'
        })
    ]

    it('separates author/fandom signal from background and reports nuisance proxies', () => {
        const qc = buildVisualRepresentationQcV5({
            embeddings,
            catalog,
            fandomKeysByComic: {
                c1: ['series x']
            },
            maxPairSamples: 1000,
            maxAnchors: 50
        })

        expect(qc.qcVersion).toBe(
            VISUAL_REPRESENTATION_QC_V5_VERSION
        )
        expect(qc.mode).toBe('READ_ONLY')
        expect(qc.rebuildPerformed).toBe(false)
        expect(qc.servingImpact).toBe(false)

        expect(qc.pairwise.sameAuthor.count).toBe(3)
        expect(qc.pairwise.sameAuthor.mean).toBeGreaterThan(
            qc.pairwise.differentAuthor.mean ?? 1
        )
        expect(qc.pairwise.authorSeparation).toBeGreaterThan(0)
        expect(
            qc.pairwise.sameFandomDifferentAuthor.count
        ).toBeGreaterThan(0)
        expect(qc.pairwise.fandomSeparation).toBeGreaterThan(0)

        expect(
            qc.pairwise.sameAuthorSameProvider.count
        ).toBeGreaterThan(0)
        expect(
            qc.pairwise.sameAuthorCrossProvider.count
        ).toBeGreaterThan(0)
        expect(
            qc.pairwise.sameAuthorSameSourceKind.count
        ).toBeGreaterThan(0)
        expect(
            qc.pairwise.sameAuthorMixedSourceKind.count
        ).toBeGreaterThan(0)
        expect(
            qc.pairwise.sameAuthorNearPageCount.count
        ).toBeGreaterThan(0)
        expect(
            qc.pairwise.sameAuthorFarPageCount.count
        ).toBeGreaterThan(0)
    })

    it('reports deterministic coverage and k-NN diagnostics from frozen embeddings', () => {
        const first = buildVisualRepresentationQcV5({
            embeddings,
            catalog,
            fandomKeysByComic: {
                c1: ['series x']
            },
            maxPairSamples: 1000,
            maxAnchors: 50
        })
        const second = buildVisualRepresentationQcV5({
            embeddings: [...embeddings].reverse(),
            catalog: [...catalog].reverse(),
            fandomKeysByComic: {
                c1: ['series x']
            },
            maxPairSamples: 1000,
            maxAnchors: 50
        })

        expect(second).toEqual(first)
        expect(first.coverage).toMatchObject({
            catalogCount: 7,
            favoriteCount: 3,
            indexedComicCount: 6,
            indexedFavoriteCount: 2,
            bodyPreferredCount: 6,
            coverPreferredCount: 0
        })
        expect(first.coverage.catalogCoverage).toBeCloseTo(6 / 7, 5)
        expect(first.coverage.favoriteCoverage).toBeCloseTo(2 / 3, 5)
        expect(first.coverage.byProvider).toMatchObject({
            pica: {
                total: 5,
                indexed: 4
            },
            eh: {
                total: 2,
                indexed: 2
            }
        })
        expect(first.knn.author.eligibleAnchors).toBeGreaterThan(0)
        expect(first.knn.author.top5HitRate).toBeGreaterThan(0)
        expect(
            first.knn.fandomDifferentAuthor.eligibleAnchors
        ).toBeGreaterThan(0)
        expect(
            first.knn.fandomDifferentAuthor.top5HitRate
        ).toBeGreaterThan(0)
        expect(first.sampling.deterministic).toBe(true)
    })
})
