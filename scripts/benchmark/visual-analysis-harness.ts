import { performance } from 'node:perf_hooks'
import type { StoredComic } from '../../src/library/types'
import {
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION,
    type VisualEmbeddingRecord
} from '../../src/recommendation-v4/visual-style'
import { buildVisualRepresentationQcV5 } from '../../src/recommendation-v5/visual-representation-qc'
import { buildVisualAuthorAtlasV5 } from '../../src/recommendation-v5/visual-author-atlas'
import { buildVisualStyleFamiliesV5 } from '../../src/recommendation-v5/visual-style-families'

function comic(index: number, worksPerAuthor: number): StoredComic {
    const authorIndex = Math.floor(index / worksPerAuthor)
    return {
        comicId: `visual-bench-${index}`,
        title: `Visual Benchmark ${index}`,
        author: `Artist ${authorIndex}`,
        canonicalAuthor: `Artist ${authorIndex}`,
        circle: null,
        authorId: null,
        tags: [`Series ${index % 80}`, `Topic ${index % 40}`],
        categories: [],
        finished: true,
        isFavorite: index % 5 === 0,
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: '2026-09-24T00:00:00.000Z',
        knownEpisodes: 1,
        knownPictures: 80,
        downloadedPictures: index % 3 === 0 ? 80 : 0,
        pagesCount: 80 + (index % 30),
        inLibrary: true,
        providerId: index % 4 === 0 ? 'eh' : 'pica',
        providerMetadata:
            index % 4 === 0
                ? { rawTags: [`parody:Series ${index % 80}`] }
                : {}
    } as StoredComic
}

function vector(index: number, dimension = 32) {
    const values = Array.from(
        { length: dimension },
        (_, offset) =>
            Math.sin((index + 1) * (offset + 3) * 0.017) +
            Math.cos((index + 7) * (offset + 1) * 0.013)
    )
    const norm = Math.sqrt(
        values.reduce((sum, value) => sum + value * value, 0)
    )
    return values.map((value) => value / Math.max(norm, 1e-9))
}

function embedding(index: number): VisualEmbeddingRecord {
    const values = vector(index)
    return {
        comicId: `visual-bench-${index}`,
        modelId: VISUAL_MODEL_ID,
        modelVersion: VISUAL_MODEL_VERSION,
        samplingPolicyVersion: VISUAL_SAMPLING_POLICY_VERSION,
        embeddingKind: 'body',
        vector: values,
        dimension: values.length,
        sourceKind: index % 4 === 0 ? 'REMOTE_PAGES' : 'LOCAL_PAGES',
        sampleCount: 6,
        confidence: 1,
        generatedAt: '2026-09-24T00:00:00.000Z',
        metadata: {}
    }
}

function timed<T>(work: () => T) {
    const started = performance.now()
    const result = work()
    return {
        result,
        durationMs: Math.round((performance.now() - started) * 1000) / 1000
    }
}

function run(size: number) {
    const worksPerAuthor = 4
    const catalog = Array.from({ length: size }, (_, index) =>
        comic(index, worksPerAuthor)
    )
    const embeddings = Array.from({ length: size }, (_, index) =>
        embedding(index)
    )
    const fandomKeysByComic = Object.fromEntries(
        catalog.map((item, index) => [
            item.comicId,
            [`series-${index % 80}`]
        ])
    )

    const representation = timed(() =>
        buildVisualRepresentationQcV5({
            embeddings,
            catalog,
            fandomKeysByComic,
            maxPairSamples: 4000,
            maxAnchors: 120
        })
    )
    const atlas = timed(() =>
        buildVisualAuthorAtlasV5({
            embeddings,
            catalog,
            minWorksPerAuthor: 2,
            maxGraphAuthors: 600,
            neighborLimit: 8
        })
    )
    const families = timed(() =>
        buildVisualStyleFamiliesV5({
            atlas: atlas.result,
            maxAuthors: 300,
            mutualK: 2,
            minimumSimilarity: -1
        })
    )

    return {
        catalogCount: catalog.length,
        embeddingCount: embeddings.length,
        authorCount: Math.ceil(size / worksPerAuthor),
        representationQcMs: representation.durationMs,
        authorAtlasMs: atlas.durationMs,
        styleFamiliesMs: families.durationMs,
        atlasGraphAuthors: atlas.result.summary.graphAuthorCount,
        stylePrototypeNodes: families.result.summary.prototypeNodeCount
    }
}

const requested = process.argv
    .slice(2)
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 100)
const sizes = requested.length ? requested : [500, 2000, 5000]

console.log(
    JSON.stringify(
        {
            benchmark: 'visual-analysis-synthetic-scaling-v1',
            warning:
                'Synthetic scaling evidence only. Do not use CI wall time as the user-facing foreground/background threshold.',
            node: process.version,
            results: sizes.map(run)
        },
        null,
        2
    )
)
