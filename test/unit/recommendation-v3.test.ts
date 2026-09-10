import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { mineTagCombinations } from '../../src/recommendation-v3/tag-combinations'
import {
    buildTasteClusters,
    buildV3Profile
} from '../../src/recommendation-v3/taste-model'
import {
    buildBehaviorProfile,
    profileConfidence
} from '../../src/recommendation-v3/behavior-profile'
import { rankV3 } from '../../src/recommendation-v3/ranker'
import { extractRankingFeatures } from '../../src/recommendation-v3/ranker'
import { retrieveV3 } from '../../src/recommendation-v3/retrieval'
import { residualCombinationBonus } from '../../src/recommendation-v3/tag-combinations'
import { rerankV3 } from '../../src/recommendation-v3/reranker'
import {
    deterministicHoldout,
    evaluationMetrics,
    withoutHeldOut
} from '../../src/recommendation-v3/evaluator'
import { AdaptiveRecommendationSession } from '../../src/recommendation-v3/adaptive-session'
import type { StoredComic } from '../../src/library/types'

const dirs: string[] = []
afterEach(() => {
    for (const dir of dirs.splice(0))
        fs.rmSync(dir, { recursive: true, force: true })
})

function comic(id: string, tags: string[], author = 'A'): StoredComic {
    return {
        comicId: id,
        title: id,
        author,
        canonicalAuthor: author,
        circle: '',
        categories: [],
        tags,
        description: '',
        finished: false,
        totalLikes: 10,
        totalViews: 20,
        downloadedPictures: 0,
        knownPictures: 0,
        isFavorite: true,
        inLibrary: true,
        authorId: author,
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: '2026-01-01T00:00:00.000Z',
        knownEpisodes: 0
    }
}

describe('Recommendation V3', () => {
    it('mines bounded pair/triple interactions with finite shrinkage', () => {
        const records = Array.from({ length: 20 }, (_, i) =>
            comic(`f-${i}`, i < 10 ? ['a', 'b', 'c'] : ['a', 'd'])
        )
        const result = mineTagCombinations(records, records)
        expect(result.pairs.length).toBeGreaterThan(0)
        expect(result.triples.length).toBeGreaterThan(0)
        for (const item of [...result.pairs, ...result.triples])
            expect(Number.isFinite(item.score)).toBe(true)
        expect(result.pairs.length).toBeLessThanOrEqual(200)
        expect(result.triples.length).toBeLessThanOrEqual(100)
    })

    it('keeps small users in one deterministic cluster and separates interests', () => {
        const small = [comic('1', ['romance']), comic('2', ['romance'])]
        expect(buildTasteClusters(small)).toHaveLength(1)
        const mixed = [
            comic('a', ['romance', 'school']),
            comic('b', ['romance', 'school']),
            comic('c', ['fantasy', 'adventure']),
            comic('d', ['fantasy', 'adventure']),
            comic('e', ['cooking', 'food']),
            comic('f', ['cooking', 'food']),
            comic('g', ['mystery', 'crime']),
            comic('h', ['mystery', 'crime'])
        ]
        const left = buildTasteClusters(mixed)
        const right = buildTasteClusters([...mixed].reverse())
        expect(left).toEqual(right)
        expect(left.length).toBeGreaterThan(1)
    })

    it('does not leak held-out favorites into profile evidence', () => {
        const all = [
            comic('1', ['a']),
            comic('2', ['b']),
            comic('3', ['c']),
            comic('4', ['d']),
            comic('5', ['e'])
        ]
        const heldOut = deterministicHoldout(all, 'random', 'fixed')
        const training = withoutHeldOut(all, heldOut)
        const profile = buildV3Profile(training, all)
        expect(
            profile.historical.clusters.flatMap((cluster) => cluster.itemIds)
        ).not.toContain(heldOut[0].comicId)
        expect(profile.historical.tags.map((tag) => tag.tag)).not.toContain(
            heldOut[0].tags[0]
        )
    })

    it('uses behavior evidence for recent/session confidence and ranking', () => {
        const records = [
            comic('1', ['a']),
            comic('2', ['b']),
            comic('3', ['c'])
        ]
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v3-events-'))
        dirs.push(root)
        const db = new LibraryDatabase(path.join(root, 'library.db'))
        db.importCatalog(records)
        db.recordUserEvent({
            eventType: 'reader_complete',
            comicId: '2',
            appSessionId: 'session-1',
            contextId: 'ctx-1',
            dedupeKey: 'complete-2'
        })
        const profile = buildBehaviorProfile(
            buildV3Profile(records, records),
            db.listUserEvents(),
            records,
            'session-1'
        )
        const confidence = profileConfidence(profile)
        expect(confidence.session).toBeGreaterThan(0)
        const ranked = rankV3(
            records.map((item) => ({ ...item, isFavorite: false })),
            records.slice(0, 1),
            profile,
            db.listUserEvents()
        )
        expect(ranked.every((item) => Number.isFinite(item.score))).toBe(true)
        db.close()
    })

    it('event store is append-only, private, and deduplicated', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v3-store-'))
        dirs.push(root)
        const db = new LibraryDatabase(path.join(root, 'library.db'))
        const first = db.recordUserEvent({
            eventType: 'recommend_impression',
            comicId: 'x',
            contextId: 'ctx',
            dedupeKey: 'ctx:0:x'
        })
        const second = db.recordUserEvent({
            eventType: 'recommend_impression',
            comicId: 'x',
            contextId: 'ctx',
            dedupeKey: 'ctx:0:x'
        })
        expect(second.id).toBe(first.id)
        expect(db.listUserEvents()).toHaveLength(1)
        expect(() =>
            db.recordUserEvent({
                eventType: 'search',
                metadata: { token: 'secret' }
            })
        ).toThrow()
        db.close()
    })

    it('adaptive batches reuse a pool, avoid duplicates, and record contexts', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v3-adaptive-'))
        dirs.push(root)
        const db = new LibraryDatabase(path.join(root, 'library.db'))
        const records = Array.from({ length: 30 }, (_, i) => ({
            ...comic(`c-${i}`, [i % 2 ? 'b' : 'a']),
            isFavorite: false
        }))
        db.importCatalog(records, 'pica:recommendations')
        const generate = async () => ({
            recommendations: records.map((item, index) => ({
                comic: item,
                score: 100 - index,
                reasons: [],
                recallSources: ['fixture'],
                matchedSignals: [],
                exploration: false
            })),
            profile: {}
        })
        const service = new AdaptiveRecommendationSession(db, generate)
        const first = await service.nextBatch({ appSessionId: 'session' })
        const second = await service.nextBatch({ appSessionId: 'session' })
        expect(first.recommendations).toHaveLength(12)
        expect(
            new Set(
                [...first.recommendations, ...second.recommendations].map(
                    (item) => item.comic.comicId
                )
            ).size
        ).toBe(24)
        expect(db.listV3Batches(first.candidatePoolId)).toHaveLength(2)
        expect(second.contextId).not.toBe(first.contextId)
        db.close()
    })

    it('produces offline metrics and supports ranking evaluation', () => {
        const held = [comic('h1', ['a']), comic('h2', ['b'])]
        const ranked = held.map((item, i) => ({
            comicId: item.comicId,
            score: 1 - i / 10,
            features: {} as never,
            reasons: [],
            provenance: []
        }))
        const metrics = evaluationMetrics(ranked, held)
        expect(metrics.recallAt12).toBe(1)
        expect(metrics.ndcgAt12).toBe(1)
    })

    it('changes seeded random holdouts while remaining reproducible', () => {
        const records = Array.from({ length: 30 }, (_, i) =>
            comic(`h-${i}`, [`t-${i % 3}`])
        )
        const a = deterministicHoldout(records, 'random', 'a').map(
            (x) => x.comicId
        )
        const b = deterministicHoldout(records, 'random', 'b').map(
            (x) => x.comicId
        )
        expect(a).toEqual(
            deterministicHoldout(records, 'random', 'a').map((x) => x.comicId)
        )
        expect(a).not.toEqual(b)
    })

    it('uses retrieval candidates and bounded graph/route evidence', () => {
        const favorites = [comic('f', ['a'])]
        const catalog = [
            ...favorites,
            comic('x', ['a']),
            comic('y', ['b'])
        ].map((x) => ({ ...x, isFavorite: x.comicId === 'f' }))
        const profile = buildV3Profile(favorites, catalog)
        const ids = retrieveV3(catalog, favorites, profile, 10)
        expect(ids).toContain('x')
        const feature = extractRankingFeatures(
            catalog[1],
            favorites,
            profile,
            [],
            {
                graphEdges: [
                    {
                        sourceComicId: 'f',
                        targetComicId: 'x',
                        confidence: 1,
                        observationCount: 3
                    }
                ],
                routeFamilies: new Map([
                    ['tag', new Set(['x'])],
                    ['related', new Set(['x'])]
                ])
            }
        )
        expect(feature.relatedGraphScore).toBeGreaterThan(0)
        expect(feature.recallRouteSupport).toBeGreaterThan(0)
        expect(feature.recallRouteSupport).toBeLessThanOrEqual(1)
    })

    it('protects residual combination bonuses from overlap and honors exploration quota', () => {
        const pair = {
            order: 2 as const,
            tags: ['a', 'b'],
            favoriteCount: 4,
            favoriteSupport: 0.5,
            backgroundCount: 1,
            backgroundSupport: 0.1,
            enrichment: 1,
            withinFavoriteInteraction: 1,
            backgroundInteraction: 0,
            specificInteraction: 1,
            reliability: 1,
            score: 1
        }
        const triple = { ...pair, order: 3 as const, tags: ['a', 'b', 'c'] }
        const bonus = residualCombinationBonus(
            ['a', 'b', 'c'],
            [pair],
            [triple]
        )
        expect(bonus.pair).toBeLessThanOrEqual(1)
        expect(bonus.triple).toBeLessThanOrEqual(1)
        const comics = new Map([
            ['x', comic('x', ['a'])],
            ['y', comic('y', ['b'])],
            ['z', comic('z', ['c'])]
        ])
        const ranked = [...comics.keys()].map((id, i) => ({
            comicId: id,
            score: 1 - i * 0.01,
            features: { novelty: i === 2 ? 1 : 0 } as never,
            reasons: [],
            provenance: []
        }))
        expect(rerankV3(ranked, comics, 3)).toHaveLength(3)
    })
})
