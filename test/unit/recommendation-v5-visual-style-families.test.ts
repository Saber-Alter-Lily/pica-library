import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import {
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION,
    type VisualEmbeddingRecord
} from '../../src/recommendation-v4/visual-style'
import { buildVisualAuthorAtlasV5 } from '../../src/recommendation-v5/visual-author-atlas'
import {
    VISUAL_STYLE_FAMILY_V5_VERSION,
    buildVisualStyleFamiliesV5
} from '../../src/recommendation-v5/visual-style-families'

function comic(
    comicId: string,
    author: string
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
        providerId: 'pica',
        providerMetadata: {}
    } as StoredComic
}

function embedding(
    comicId: string,
    vector: number[]
): VisualEmbeddingRecord {
    return {
        comicId,
        modelId: VISUAL_MODEL_ID,
        modelVersion: VISUAL_MODEL_VERSION,
        samplingPolicyVersion:
            VISUAL_SAMPLING_POLICY_VERSION,
        embeddingKind: 'body',
        vector,
        dimension: vector.length,
        sourceKind: 'LOCAL_PAGES',
        sampleCount: 6,
        confidence: 1,
        generatedAt: '2026-09-01T00:00:00.000Z',
        metadata: {}
    }
}

describe('Visual V1 provisional style families', () => {
    const catalog = [
        comic('a1', 'Artist A'),
        comic('a2', 'Artist A'),
        comic('a3', 'Artist A'),
        comic('a4', 'Artist A'),
        comic('b1', 'Artist B'),
        comic('b2', 'Artist B'),
        comic('c1', 'Artist C'),
        comic('c2', 'Artist C'),
        comic('d1', 'Artist D'),
        comic('d2', 'Artist D')
    ]
    const embeddings = [
        embedding('a1', [1, 0]),
        embedding('a2', [0.99, 0.03]),
        embedding('a3', [0, 1]),
        embedding('a4', [0.03, 0.99]),
        embedding('b1', [0.98, 0.02]),
        embedding('b2', [1, 0.01]),
        embedding('c1', [0.01, 1]),
        embedding('c2', [0.04, 0.99]),
        embedding('d1', [-1, 0]),
        embedding('d2', [-0.99, -0.02])
    ]

    function atlas() {
        return buildVisualAuthorAtlasV5({
            embeddings,
            catalog,
            minWorksPerAuthor: 2,
            maxGraphAuthors: 20,
            neighborLimit: 4
        })
    }

    it('allows different prototypes from one author to occupy different provisional families', () => {
        const families = buildVisualStyleFamiliesV5({
            atlas: atlas(),
            maxAuthors: 20,
            mutualK: 1
        })

        expect(families.familyVersion).toBe(
            VISUAL_STYLE_FAMILY_V5_VERSION
        )
        expect(families.mode).toBe('READ_ONLY')
        expect(families.provisional).toBe(true)
        expect(families.servingImpact).toBe(false)
        expect(families.visualRecallEnabled).toBe(false)
        expect(families.styleDiversityEnabled).toBe(false)

        const aMembership =
            families.authorMemberships.find(
                (item) => item.authorKey === 'artist a'
            )
        expect(aMembership).toBeTruthy()
        expect(aMembership!.familyIds).toHaveLength(2)
        expect(families.summary.multiFamilyAuthorCount).toBe(1)

        const aFamilies = families.families.filter(
            (family) =>
                family.authorKeys.includes('artist a')
        )
        expect(aFamilies).toHaveLength(2)
        expect(
            aFamilies.some((family) =>
                family.authorKeys.includes('artist b')
            )
        ).toBe(true)
        expect(
            aFamilies.some((family) =>
                family.authorKeys.includes('artist c')
            )
        ).toBe(true)
        expect(
            aFamilies.every(
                (family) =>
                    family.familyPrototype &&
                    family.familyPrototype.support >= 2
            )
        ).toBe(true)
    })

    it('uses deterministic mutual-kNN connected components and leaves unsupported prototypes unassigned', () => {
        const first = buildVisualStyleFamiliesV5({
            atlas: atlas(),
            maxAuthors: 20,
            mutualK: 1
        })
        const reversedAtlas = buildVisualAuthorAtlasV5({
            embeddings: [...embeddings].reverse(),
            catalog: [...catalog].reverse(),
            minWorksPerAuthor: 2,
            maxGraphAuthors: 20,
            neighborLimit: 4
        })
        const second = buildVisualStyleFamiliesV5({
            atlas: reversedAtlas,
            maxAuthors: 20,
            mutualK: 1
        })

        expect(second).toEqual(first)
        expect(first.method).toBe(
            'MUTUAL_KNN_CONNECTED_COMPONENTS'
        )
        expect(first.summary.familyCount).toBe(2)
        expect(first.summary.assignedPrototypeCount).toBe(4)
        expect(
            first.summary.singletonOrUnassignedPrototypeCount
        ).toBeGreaterThanOrEqual(1)
        expect(first.graph.mutualEdges.length).toBe(2)
        expect(
            first.families.every(
                (family) =>
                    family.edgeSimilarity.minimum !== null &&
                    (family.edgeSimilarity.minimum ?? 0) > 0.95
            )
        ).toBe(true)
    })
})
