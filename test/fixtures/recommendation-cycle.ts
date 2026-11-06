import type { StoredComic } from '../../src/library/types'
import type {
    BuiltRecommendationCycleV3,
    V3CycleVersions
} from '../../src/recommendation/ports'

export const cycleVersions: V3CycleVersions = {
    profileVersion: 'fixture-profile',
    registryVersion: 'fixture-registry',
    rankerModelVersion: 'fixture-frozen-ranker',
    candidatePoolVersion: 'fixture-pool',
    allocatorVersion: 'fixture-allocator'
}

/** Synthetic output at the existing builder port; no registry/model/provider is executed. */
export function syntheticCycle(count = 36): BuiltRecommendationCycleV3 {
    const comics: StoredComic[] = Array.from({ length: count }, (_, i) => ({
        comicId: 'fixture-' + i,
        title: 'Distinct Work ' + i,
        author: 'Creator ' + i,
        canonicalAuthor: 'Creator ' + i,
        circle: null,
        authorId: 'creator:' + i,
        tags: [i % 2 ? 'tag-b' : 'tag-a'],
        categories: ['Fixture'],
        finished: true,
        isFavorite: false,
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: '2026-01-01T00:00:00.000Z',
        knownEpisodes: 0,
        knownPictures: 0,
        downloadedPictures: 0
    }))
    const intent = {
        intentId: 'fixture-intent',
        type: 'CREATOR',
        anchors: [],
        sourceLayer: 'LIFETIME'
    } as unknown as BuiltRecommendationCycleV3['intents'][number]
    return {
        // The coordinator consumes these identity fields; profile construction has its own existing suite.
        profile: {
            favoriteFingerprint: 'fixture-favorites',
            registryVersion: cycleVersions.registryVersion,
            profileVersion: cycleVersions.profileVersion,
            generatedAt: '2026-01-01T00:00:00.000Z'
        } as unknown as BuiltRecommendationCycleV3['profile'],
        intents: [intent],
        routes: [],
        readiness: 'READY',
        versions: cycleVersions,
        ranked: comics.map((comic, i) => ({
            comicId: comic.comicId,
            comic,
            rawRank: i + 1,
            score: 1000 - i,
            features: {} as never,
            reasons: [],
            provenance: [],
            evidence: {
                comicId: comic.comicId,
                originIntentIds: [intent.intentId],
                originRouteIds: ['fixture-route'],
                routeFamilies: ['CREATOR'],
                primaryFamily: 'CREATOR',
                routeHitCount: 1,
                intentHitCount: 1,
                providerBestRank: i + 1,
                providerRanks: [i + 1],
                queryTerms: [],
                conjunctionEvidence: [],
                relatedSeedIds: [],
                exploration: false,
                firstSeenAt: '2026-01-01T00:00:00.000Z'
            }
        })),
        telemetry: {
            providerRequestCount: 0,
            recommendationV5: {
                portableBaseline: { fixture: 'unchanged-policy-baseline' }
            }
        }
    }
}
