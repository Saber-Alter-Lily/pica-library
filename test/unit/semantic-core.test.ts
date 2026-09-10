import { describe, expect, it } from 'vitest'
import {
    classifyTagFacet,
    normalizeTag,
    recommendationTags,
    resolveTagAlias,
    semanticTagFeature
} from '../../src/recommendation-v3/semantic-core'
import {
    applyLocalSemanticConjunction,
    buildRecommendationIntents,
    planSemanticQueries,
    selectAnchor
} from '../../src/recommendation-v3/query-planner'
import type { StoredComic } from '../../src/library/types'
import type { V3Profile } from '../../src/recommendation-v3/types'

function comic(id: string, tags: string[]): StoredComic {
    return {
        comicId: id,
        title: id,
        author: 'author',
        canonicalAuthor: 'author',
        circle: '',
        categories: [],
        tags,
        description: '',
        finished: false,
        totalLikes: 0,
        totalViews: 0,
        downloadedPictures: 0,
        knownPictures: 0,
        isFavorite: true,
        inLibrary: true,
        authorId: 'author',
        firstSeenAt: '2026-01-01T00:00:00Z',
        lastSeenAt: '2026-01-01T00:00:00Z',
        knownEpisodes: 0
    }
}

describe('semantic tag core', () => {
    it('normalizes mechanically and idempotently', () => {
        const value = '【 全彩　】'
        expect(normalizeTag(normalizeTag(value))).toBe(normalizeTag(value))
        expect(resolveTagAlias('彩色')).toBe('全彩')
    })
    it('assigns facets and recommendation roles independently', () => {
        expect(classifyTagFacet('C101')).toBe('EVENT_SOURCE')
        expect(semanticTagFeature('C101')).toMatchObject({
            recommendationRole: 'IGNORE',
            eligibleForRecall: false,
            eligibleForCluster: false
        })
        expect(semanticTagFeature('全彩')).toMatchObject({
            facet: 'VISUAL_STYLE',
            recommendationRole: 'MODIFIER',
            modifierOnly: true
        })
        expect(semanticTagFeature('人妻').eligibleForRecall).toBe(true)
    })
    it('keeps raw provenance while filtering event/language from algorithm tags', () => {
        const features = recommendationTags(
            comic('x', [' C101 ', '全彩', '中文汉化', '人妻'])
        )
        expect(features.map((item) => item.canonical)).toEqual(['人妻'])
        expect(features.some((item) => item.raw.includes('C101'))).toBe(false)
    })
})

describe('semantic query planner', () => {
    const profile = {
        historical: {
            clusters: [
                {
                    clusterId: 'cluster-a',
                    weight: 1,
                    size: 2,
                    itemIds: ['a', 'b'],
                    authors: ['author'],
                    circles: [],
                    tags: ['人妻', '全彩'],
                    tagPairs: [],
                    tagTriples: [],
                    confidence: 1
                }
            ],
            tags: [],
            pairs: [],
            triples: []
        },
        lifetime: { clusters: [], tags: [], pairs: [], triples: [] },
        recent: { clusters: [], tags: [], pairs: [], triples: [] },
        session: { clusters: [], tags: [], pairs: [], triples: [] },
        generatedAt: '',
        modelVersion: '',
        evidenceCutoff: ''
    } as V3Profile
    it('selects deterministic anchors and creates bounded semantic routes', () => {
        expect(selectAnchor(['宽标签', 'a'])).toBe('a')
        const intents = buildRecommendationIntents(profile, [
            comic('a', ['人妻', '全彩']),
            comic('b', ['人妻'])
        ])
        const plans = planSemanticQueries(intents)
        expect(plans[0].routes.length).toBeGreaterThan(0)
        expect(plans[0].routes.every((route) => route.maxPages <= 3)).toBe(true)
    })
    it('applies local conjunction filtering without allowing modifiers to dominate', () => {
        const intent = {
            clusterId: 'x',
            intentWeight: 1,
            coreSemanticTags: ['人妻'],
            secondarySemanticTags: [],
            fandoms: [],
            authors: [],
            genres: [],
            styleModifiers: ['全彩'],
            formatModifiers: [],
            positiveItemSeeds: [],
            behaviorEvidence: []
        }
        expect(
            applyLocalSemanticConjunction(
                [comic('a', ['人妻']), comic('b', ['全彩'])],
                intent
            ).map((x) => x.comicId)
        ).toEqual(['a'])
    })
})
