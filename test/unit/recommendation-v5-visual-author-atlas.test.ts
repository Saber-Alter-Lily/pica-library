import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import {
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION,
    type VisualEmbeddingRecord
} from '../../src/recommendation-v4/visual-style'
import {
    VISUAL_AUTHOR_ATLAS_V5_VERSION,
    buildVisualAuthorAtlasV5
} from '../../src/recommendation-v5/visual-author-atlas'

function comic(
    comicId: string,
    author: string,
    providerId: 'pica' | 'eh' = 'pica'
): StoredComic {
    return {
        comicId,
        title: comicId,
        author,
        canonicalAuthor: author,
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
        downloadedPictures: 0,
        pagesCount: 100,
        inLibrary: false,
        providerId,
        providerMetadata: {}
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

describe('Visual V1 author prototype atlas', () => {
    const catalog = [
        comic('a1', 'Artist A', 'pica'),
        comic('a2', 'Artist A', 'pica'),
        comic('a3', 'Artist A', 'eh'),
        comic('a4', 'Artist A', 'eh'),
        comic('b1', 'Artist B', 'pica'),
        comic('b2', 'Artist B', 'pica'),
        comic('c1', 'Artist C', 'pica'),
        comic('c2', 'Artist C', 'eh'),
        comic('d1', 'Artist D', 'pica')
    ]
    const embeddings = [
        embedding('a1', [1, 0]),
        embedding('a2', [0.99, 0.05]),
        embedding('a3', [0, 1], {
            sourceKind: 'REMOTE_PAGES'
        }),
        embedding('a4', [0.05, 0.99], {
            sourceKind: 'REMOTE_PAGES'
        }),
        embedding('b1', [0.98, 0.02]),
        embedding('b2', [1, 0.04]),
        embedding('c1', [-1, 0]),
        embedding('c2', [-0.99, 0.03], {
            sourceKind: 'REMOTE_PAGES'
        }),
        embedding('d1', [0.5, 0.5]),
        // Cover cannot replace A1's body embedding.
        embedding('a1', [-1, 0], {
            embeddingKind: 'cover',
            sourceKind: 'COVER_ONLY'
        })
    ]

    it('uses the existing multi-prototype builder to preserve author substyles', () => {
        const atlas = buildVisualAuthorAtlasV5({
            embeddings,
            catalog,
            minWorksPerAuthor: 2,
            maxGraphAuthors: 20,
            neighborLimit: 2
        })

        expect(atlas.atlasVersion).toBe(
            VISUAL_AUTHOR_ATLAS_V5_VERSION
        )
        expect(atlas.mode).toBe('READ_ONLY')
        expect(atlas.rebuildPerformed).toBe(false)
        expect(atlas.servingImpact).toBe(false)
        expect(atlas.visualRecallEnabled).toBe(false)
        expect(atlas.styleFamilyServingEnabled).toBe(false)

        const artistA = atlas.authors.find(
            (item) => item.authorKey === 'artist a'
        )!
        expect(artistA).toBeTruthy()
        expect(artistA).toMatchObject({
            indexedWorkCount: 4,
            totalCatalogWorkCount: 4,
            multiProvider: true,
            prototypeCount: 2
        })
        expect(artistA.providerCounts).toEqual({
            pica: 2,
            eh: 2
        })
        expect(artistA.sourceKindCounts).toEqual({
            LOCAL_PAGES: 2,
            REMOTE_PAGES: 2
        })
        expect(artistA.cohesion).toBeGreaterThan(0.98)
        expect(artistA.substyleSpread).toBeGreaterThan(0.8)
        expect(
            new Set(
                artistA.prototypes.flatMap(
                    (item) => item.representativeComicIds
                )
            ).size
        ).toBeGreaterThanOrEqual(4)

        expect(
            atlas.authors.some(
                (item) => item.authorKey === 'artist d'
            )
        ).toBe(false)
        expect(atlas.summary.authorsBelowMinimum).toBe(1)
        expect(atlas.summary.multiPrototypeAuthorCount).toBe(1)
        expect(atlas.summary.multiProviderAuthorCount).toBe(2)
    })

    it('builds a deterministic bounded author similarity graph', () => {
        const first = buildVisualAuthorAtlasV5({
            embeddings,
            catalog,
            minWorksPerAuthor: 2,
            maxGraphAuthors: 3,
            neighborLimit: 1
        })
        const second = buildVisualAuthorAtlasV5({
            embeddings: [...embeddings].reverse(),
            catalog: [...catalog].reverse(),
            minWorksPerAuthor: 2,
            maxGraphAuthors: 3,
            neighborLimit: 1
        })

        expect(second).toEqual(first)
        expect(first.summary.graphAuthorCount).toBe(3)
        expect(first.graph.nodes).toHaveLength(3)
        expect(first.graph.edges.length).toBeGreaterThan(0)

        const aToB = first.graph.edges.find(
            (edge) =>
                edge.leftAuthorKey === 'artist a' &&
                edge.rightAuthorKey === 'artist b'
        )
        expect(aToB).toBeTruthy()
        expect(aToB!.similarity).toBeGreaterThan(0.98)

        const strongest = first.graph.edges[0]
        expect(
            [
                strongest.leftAuthorKey,
                strongest.rightAuthorKey
            ].sort()
        ).toEqual(['artist a', 'artist b'])
    })
})
