import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import { LibraryDatabase } from '../../src/library/database'
import { latestMigrationVersion } from '../../src/storage/sqlite/migrations'
import {
    buildFinalLifetimeProfileV3,
    favoriteFingerprint,
    type FinalLifetimeProfileV3
} from '../../src/recommendation-v3/final-profile'
import type { TagRegistryV3 } from '../../src/recommendation-v3/tag-resolution-v3'
import {
    buildRecommendationIntentsV3,
    type RecommendationIntentV3
} from '../../src/recommendation-v3/intent-planner-v3'
import {
    translateIntentPlanV3,
    type RetrievalRouteV3
} from '../../src/recommendation-v3/provider-query-translator'
import {
    retrieveCandidatesV3,
    type CandidateEvidenceV3
} from '../../src/recommendation-v3/retriever-v3'
import { rankCandidatesWithFrozenRankerV3 } from '../../src/recommendation-v3/ranker-adapter-v3'
import { allocateRecommendationBatchV3 } from '../../src/recommendation-v3/batch-allocator-v3'
import {
    CycleCoordinatorV3,
    type BuiltRecommendationCycleV3
} from '../../src/recommendation-v3/cycle-coordinator-v3'

const comic = (
    id: string,
    tags: string[] = [],
    favorite = false,
    author = 'author'
): StoredComic => ({
    comicId: id,
    title: `title-${id}`,
    author,
    canonicalAuthor: author,
    circle: null,
    authorId: `author:${author}`,
    categories: ['category'],
    tags,
    finished: true,
    isFavorite: favorite,
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    knownEpisodes: 0,
    knownPictures: 0,
    downloadedPictures: 0
})

const row = (
    canonical: string,
    facet: string,
    role = 'CORE',
    utility = 'HIGH_PRECISION_ANCHOR',
    eligible = 'true'
) => ({
    canonical_tag: canonical,
    facet,
    recommendation_role: role,
    retrieval_utility: utility,
    recommendation_eligible: eligible,
    safety_status: ''
})

const registry = (): TagRegistryV3 =>
    ({
        semantic: new Map([
            ['canon', row('canon', 'GENRE_THEME')],
            ['other', row('other', 'BODY_ATTRIBUTE')],
            ['broad', row('broad', 'GENRE_THEME', 'CORE', 'BROAD_RECALL')],
            ['modifier', row('modifier', 'VISUAL_STYLE', 'MODIFIER')],
            [
                'profile',
                row(
                    'profile',
                    'FANDOM_CHARACTER',
                    'PROFILE_ONLY',
                    'PROFILE_ONLY',
                    'false'
                )
            ],
            [
                'safe',
                {
                    ...row(
                        'safe',
                        'SAFETY',
                        'SAFETY_EXCLUDE',
                        'SAFETY_BLOCKED',
                        'false'
                    ),
                    safety_status: 'BLOCK_MINOR_EXPLICIT'
                }
            ]
        ]),
        entities: new Map(),
        aliases: new Map([['alias', 'canon']]),
        unresolved: new Set(['unknown']),
        manifestSha256: 'registry-test'
    }) as unknown as TagRegistryV3

describe('Recommender V3 final profile', () => {
    it('uses a stable distinct favorite fingerprint', () => {
        const a = comic('a', [], true)
        const b = comic('b', [], true)
        expect(favoriteFingerprint([b, a, a])).toBe(favoriteFingerprint([a, b]))
    })

    it('deduplicates aliases per comic and isolates roles', () => {
        const profile = buildFinalLifetimeProfileV3(
            [
                comic(
                    'a',
                    [
                        'canon',
                        'alias',
                        'modifier',
                        'profile',
                        'unknown',
                        'safe'
                    ],
                    true
                )
            ],
            { registry: registry(), generatedAt: '2026-01-01T00:00:00.000Z' }
        )
        expect(
            profile.primaryInterests.find((x) => x.canonicalKey === 'canon')
                ?.supportCount
        ).toBe(1)
        expect(profile.modifierEvidence.map((x) => x.canonicalKey)).toEqual([
            'modifier'
        ])
        expect(profile.profileOnlyInterests.map((x) => x.canonicalKey)).toEqual(
            ['profile']
        )
        expect(profile.unresolvedEvidence).toHaveLength(1)
        expect(
            profile.primaryInterests.some((x) => x.canonicalKey === 'safe')
        ).toBe(false)
        expect(profile.noFabricatedRecency).toBe(true)
    })

    it('preserves provider-observed labels and unresolved semantic evidence', () => {
        const localRegistry = registry()
        localRegistry.semantic.set(
            'uncertain',
            row('uncertain', 'GENRE_THEME', 'CORE', 'UNRESOLVED', 'true')
        )
        const profile = buildFinalLifetimeProfileV3(
            [comic('a', ['canon', 'uncertain'], true)],
            { registry: localRegistry }
        )
        expect(profile.primaryInterests.map((x) => x.canonicalKey)).toEqual([
            'canon'
        ])
        expect(
            profile.primaryInterests[0].providerObservedLabels[0].label
        ).toBe('canon')
        expect(profile.unresolvedEvidence[0].rawTag).toBe('uncertain')
    })

    it('counts facet denominators by distinct comic', () => {
        const profile = buildFinalLifetimeProfileV3(
            [comic('a', ['canon', 'other'], true), comic('b', ['canon'], true)],
            { registry: registry() }
        )
        const canon = profile.primaryInterests.find(
            (x) => x.canonicalKey === 'canon'
        )!
        expect(canon.facetComicCount).toBe(2)
        expect(canon.facetConditionalShare).toBe(1)
    })
})

function plannerProfile(): FinalLifetimeProfileV3 {
    const ids = ['1', '2', '3', '4', '5']
    const base = buildFinalLifetimeProfileV3(
        [
            ...ids.map((id) => comic(id, ['canon', 'other'], true)),
            ...['6', '7', '8', '9', '10'].map((id) =>
                comic(id, ['unknown'], true)
            )
        ],
        { registry: registry(), generatedAt: '2026-01-01T00:00:00.000Z' }
    )
    return base
}

describe('Recommender V3 intent planner and translator', () => {
    it('is deterministic and creates only cross-facet conjunctions', () => {
        const profile = plannerProfile()
        const input = {
            profile,
            favorites: ['1', '2', '3', '4', '5'].map((id) =>
                comic(id, ['canon', 'other'], true)
            )
        }
        const first = buildRecommendationIntentsV3(input)
        const second = buildRecommendationIntentsV3(input)
        expect(first).toEqual(second)
        const conjunctions = first.filter(
            (x) => x.type === 'SEMANTIC_CONJUNCTION'
        )
        expect(conjunctions).toHaveLength(1)
        expect(new Set(conjunctions[0].anchors.map((x) => x.facet)).size).toBe(
            2
        )
        expect(conjunctions[0].evidence.coSupportCount).toBe(5)
    })

    it('keeps provider prior out of intent ordering and splits conjunction routes', () => {
        const profile = plannerProfile()
        const intents = buildRecommendationIntentsV3({
            profile,
            favorites: ['1', '2', '3', '4', '5'].map((id) =>
                comic(id, [], true)
            )
        })
        expect(profile.providerSamplePriorEffect).toBe(0)
        const conjunction = intents.find(
            (x) => x.type === 'SEMANTIC_CONJUNCTION'
        )!
        const routes = translateIntentPlanV3([conjunction])
        expect(routes).toHaveLength(2)
        expect(routes.every((route) => route.routeType === 'KEYWORD')).toBe(
            true
        )
    })
})

describe('Recommender V3 retriever and Ranker adapter', () => {
    const intent: RecommendationIntentV3 = {
        intentId: 'SEMANTIC_ANCHOR:GENRE_THEME/canon',
        type: 'SEMANTIC_ANCHOR',
        anchors: [
            {
                canonicalKey: 'canon',
                canonicalLabel: 'canon',
                facet: 'GENRE_THEME',
                providerQueryLabel: 'canon',
                recommendationEligible: true,
                retrievalUtility: 'HIGH_PRECISION_ANCHOR'
            }
        ],
        sourceLayer: 'LIFETIME',
        evidence: { supportCount: 5, supportShare: 1, confidence: 'MEDIUM' },
        retrieval: {
            providerEligible: true,
            utilityTier: 'HIGH_PRECISION_ANCHOR',
            estimatedRouteCost: 1
        },
        planning: {
            familyRank: 0,
            recentUseCount: 0,
            lastUsedAt: null,
            exploration: false
        },
        explanation: { reasonCode: 'MULTI_ROUTE_SUPPORT', shortReason: 'test' }
    }
    const routes: RetrievalRouteV3[] = [
        {
            routeId: 'r1',
            parentIntentId: intent.intentId,
            family: intent.type,
            routeType: 'KEYWORD',
            queryTerm: 'canon',
            page: 1,
            sort: 'loved',
            anchorKey: 'canon',
            anchorFacet: 'GENRE_THEME',
            expectedPrecisionTier: 'HIGH_PRECISION_ANCHOR'
        },
        {
            routeId: 'r2',
            parentIntentId: intent.intentId,
            family: intent.type,
            routeType: 'KEYWORD',
            queryTerm: 'other',
            page: 1,
            sort: 'loved',
            anchorKey: 'other',
            anchorFacet: 'BODY_ATTRIBUTE',
            expectedPrecisionTier: 'HIGH_PRECISION_ANCHOR'
        }
    ]

    it('deduplicates entities, unions evidence, and excludes favorites', async () => {
        const result = await retrieveCandidatesV3({
            provider: {
                keyword: async (query) =>
                    query === 'canon'
                        ? [comic('x'), comic('fav')]
                        : [comic('x'), comic('y')],
                author: async () => [],
                related: async () => []
            },
            routes,
            intents: [intent],
            favoriteIds: new Set(['fav'])
        })
        expect(result.candidates.map((x) => x.comic.comicId)).toEqual([
            'x',
            'y'
        ])
        expect(result.candidates[0].evidence.routeHitCount).toBe(2)
        expect(result.telemetry.favoriteExcludedCount).toBeGreaterThanOrEqual(1)
        expect(result.telemetry.providerRequestCount).toBeLessThanOrEqual(24)
    })

    it('keeps event-derived Ranker inputs neutral', () => {
        const favorite = comic('fav', ['canon'], true)
        const candidate = comic('x', ['canon'])
        const evidence: CandidateEvidenceV3 = {
            comicId: 'x',
            originIntentIds: [intent.intentId],
            originRouteIds: ['r1'],
            routeFamilies: ['SEMANTIC_ANCHOR'],
            primaryFamily: 'SEMANTIC_ANCHOR',
            routeHitCount: 1,
            intentHitCount: 1,
            providerBestRank: 1,
            providerRanks: [1],
            queryTerms: ['canon'],
            conjunctionEvidence: [],
            relatedSeedIds: [],
            exploration: false,
            firstSeenAt: '2026-01-01T00:00:00.000Z'
        }
        const ranked = rankCandidatesWithFrozenRankerV3({
            candidates: [{ comic: candidate, evidence }],
            favorites: [favorite]
        })[0]
        expect(ranked.features.historicalSimilarity).toBe(0)
        expect(ranked.features.recentSimilarity).toBe(0)
        expect(ranked.features.sessionSimilarity).toBe(0)
        expect(ranked.features.previousImpressionCount).toBe(0)
        expect(ranked.features.recentExposurePenalty).toBe(0)
    })

    it('uses actual candidate Fandom metadata for soft caps', () => {
        const fandomIntent: RecommendationIntentV3 = {
            ...intent,
            intentId: 'FANDOM:fgo',
            type: 'FANDOM',
            anchors: [
                {
                    ...intent.anchors[0],
                    facet: 'FANDOM_IP',
                    canonicalKey: 'fgo'
                }
            ]
        }
        const ranked = Array.from({ length: 8 }, (_, index) => ({
            comicId: `f${index}`,
            score: 100 - index,
            rawRank: index + 1,
            comic: comic(`f${index}`, [], false, `author-${index}`),
            features: {} as never,
            reasons: [],
            provenance: [],
            evidence: {
                ...intent,
                comicId: `f${index}`,
                originIntentIds:
                    index < 3 ? ['FANDOM:fgo'] : ['SEMANTIC_ANCHOR:other'],
                originRouteIds: ['r'],
                routeFamilies: [index < 3 ? 'FANDOM' : 'SEMANTIC_ANCHOR'],
                primaryFamily: index < 3 ? 'FANDOM' : 'SEMANTIC_ANCHOR',
                routeHitCount: 1,
                intentHitCount: 1,
                providerBestRank: index + 1,
                providerRanks: [index + 1],
                providerRanksByIntent: {
                    [index < 3 ? 'FANDOM:fgo' : 'SEMANTIC_ANCHOR:other']: [
                        index + 1
                    ]
                },
                queryTerms: [],
                conjunctionEvidence: [],
                relatedSeedIds: [],
                exploration: false,
                firstSeenAt: '2026-01-01T00:00:00.000Z',
                candidateFandomKeys: ['fgo']
            } as CandidateEvidenceV3
        }))
        const batch = allocateRecommendationBatchV3({
            ranked,
            intents: [fandomIntent, intent],
            alreadyAllocated: new Set()
        })
        const passAIds = new Set(
            batch
                .filter((item) => item.allocationPass === 'A')
                .map((item) => item.comicId)
        )
        expect(
            ranked.filter(
                (candidate) =>
                    passAIds.has(candidate.comicId) &&
                    candidate.evidence.candidateFandomKeys?.includes('fgo')
            )
        ).toHaveLength(4)
    })
})

describe('Recommender V3 allocator and Schema 8 cycle', () => {
    it('uses three score-preserving passes and never repeats allocated IDs', () => {
        const intent = buildRecommendationIntentsV3({
            profile: plannerProfile(),
            favorites: [comic('f', [], true)]
        })[0]
        const ranked = Array.from({ length: 15 }, (_, index) => ({
            comicId: `c${index}`,
            score: 100 - index,
            rawRank: index + 1,
            comic: comic(`c${index}`, [], false, 'same-author'),
            features: {} as never,
            reasons: [],
            provenance: [],
            evidence: {
                comicId: `c${index}`,
                originIntentIds: [intent.intentId],
                originRouteIds: ['r'],
                routeFamilies: [intent.type],
                primaryFamily: intent.type,
                routeHitCount: 1,
                intentHitCount: 1,
                providerBestRank: index + 1,
                providerRanks: [index + 1],
                queryTerms: [],
                conjunctionEvidence: [],
                relatedSeedIds: [],
                exploration: false,
                firstSeenAt: '2026-01-01T00:00:00.000Z'
            } as CandidateEvidenceV3
        }))
        const batch = allocateRecommendationBatchV3({
            ranked,
            intents: [intent],
            alreadyAllocated: new Set(['c0'])
        })
        expect(batch).toHaveLength(12)
        expect(batch.some((item) => item.allocationPass === 'C')).toBe(true)
        expect(batch.some((item) => item.comicId === 'c0')).toBe(false)
        expect(batch.map((item) => item.rawRankerScore)).toEqual(
            batch.map((item) => 100 - Number(item.comicId.slice(1)))
        )
    })

    it('persists idempotent CURRENT/NEXT batches without a migration', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v3-final-'))
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        try {
            expect(latestMigrationVersion).toBe(8)
            const comics = Array.from({ length: 30 }, (_, index) =>
                comic(`c${index}`)
            )
            database.importCatalog(comics, 'test')
            const profile = plannerProfile()
            const intents = buildRecommendationIntentsV3({
                profile,
                favorites: [comic('f', [], true)]
            })
            const evidence = (
                id: string,
                index: number
            ): CandidateEvidenceV3 => ({
                comicId: id,
                originIntentIds: [intents[0].intentId],
                originRouteIds: ['r'],
                routeFamilies: [intents[0].type],
                primaryFamily: intents[0].type,
                routeHitCount: 1,
                intentHitCount: 1,
                providerBestRank: index + 1,
                providerRanks: [index + 1],
                queryTerms: [],
                conjunctionEvidence: [],
                relatedSeedIds: [],
                exploration: false,
                firstSeenAt: '2026-01-01T00:00:00.000Z'
            })
            const ranked = comics.map((item, index) => ({
                comicId: item.comicId,
                score: 100 - index,
                rawRank: index + 1,
                comic: item,
                features: {} as never,
                reasons: [],
                provenance: [],
                evidence: evidence(item.comicId, index)
            }))
            const built: BuiltRecommendationCycleV3 = {
                profile,
                intents,
                routes: [],
                ranked,
                readiness: 'READY_DEGRADED',
                telemetry: { providerRequestCount: 0 },
                versions: {
                    profileVersion: profile.profileVersion,
                    registryVersion: profile.registryVersion,
                    rankerModelVersion: 'frozen',
                    candidatePoolVersion: 'test',
                    allocatorVersion: 'test'
                }
            }
            const coordinator = new CycleCoordinatorV3(
                database,
                async () => built,
                built.versions
            )
            coordinator.resumeOrCreate('build-1')
            await coordinator.waitForBuild()
            const current = coordinator.current() as {
                batchId: string
                recommendations: unknown[]
            }
            expect((coordinator.current() as { batchId: string }).batchId).toBe(
                current.batchId
            )
            expect(current.recommendations).toHaveLength(12)
            const next = (await coordinator.next('next-1')) as {
                batchId: string
                recommendations: unknown[]
                batchIndex: number
            }
            const repeated = (await coordinator.next('next-1')) as {
                batchId: string
            }
            expect(repeated.batchId).toBe(next.batchId)
            expect(next.recommendations).toHaveLength(12)
            const currentAfterNext = coordinator.current() as {
                batchId: string
                batchIndex: number
            }
            expect(currentAfterNext.batchId).toBe(next.batchId)
            expect(currentAfterNext.batchIndex).toBe(next.batchIndex)
            expect(
                new Set(
                    database.recommendationSeen(
                        coordinator.status().activeCycleId!
                    )
                ).size
            ).toBe(24)
        } finally {
            database.close()
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })

    it('persists SUPERSEDED and EXHAUSTED states for real cycle history', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v3-state-'))
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        try {
            const profile = plannerProfile()
            const versions = {
                profileVersion: profile.profileVersion,
                registryVersion: profile.registryVersion,
                rankerModelVersion: 'frozen',
                candidatePoolVersion: 'test',
                allocatorVersion: 'test'
            }
            const built = (count: number): BuiltRecommendationCycleV3 => {
                const intents = buildRecommendationIntentsV3({
                    profile,
                    favorites: [comic('f', [], true)]
                })
                return {
                    profile,
                    intents,
                    routes: [],
                    ranked: Array.from({ length: count }, (_, index) => ({
                        comicId: `z${index}`,
                        score: 10 - index,
                        rawRank: index + 1,
                        comic: comic(`z${index}`),
                        features: {} as never,
                        reasons: [],
                        provenance: [],
                        evidence: {
                            comicId: `z${index}`,
                            originIntentIds: [intents[0].intentId],
                            originRouteIds: ['r'],
                            routeFamilies: [intents[0].type],
                            primaryFamily: intents[0].type,
                            routeHitCount: 1,
                            intentHitCount: 1,
                            providerBestRank: index + 1,
                            providerRanks: [index + 1],
                            queryTerms: [],
                            conjunctionEvidence: [],
                            relatedSeedIds: [],
                            exploration: false,
                            firstSeenAt: '2026-01-01T00:00:00.000Z'
                        }
                    })) as BuiltRecommendationCycleV3['ranked'],
                    readiness: 'READY',
                    telemetry: {},
                    versions
                }
            }
            let count = 12
            const coordinator = new CycleCoordinatorV3(
                database,
                async () => built(count),
                versions
            )
            coordinator.resumeOrCreate('a')
            await coordinator.waitForBuild()
            const cycleA = coordinator.status().activeCycleId!
            coordinator.current()
            count = 0
            coordinator.forceNew('b')
            await coordinator.waitForBuild()
            expect(
                database.latestV3CandidatePool(cycleA)?.telemetry.state
            ).toBe('SUPERSEDED')
            const cycleB = coordinator.status().activeCycleId!
            const exhausted = coordinator.current() as { cycleState: string }
            expect(exhausted.cycleState).toBe('EXHAUSTED')
            expect(
                database.latestV3CandidatePool(cycleB)?.telemetry.state
            ).toBe('EXHAUSTED')
            const history = database.listV3CandidatePools().map((pool) => ({
                state: pool.telemetry.state as 'SUPERSEDED' | 'EXHAUSTED',
                completedAt: String(pool.telemetry.completedAt),
                intentIds: (
                    (pool.telemetry.intentPlan ??
                        []) as RecommendationIntentV3[]
                ).map((item) => item.intentId)
            }))
            expect(history.some((item) => item.state === 'SUPERSEDED')).toBe(
                true
            )
            const planned = buildRecommendationIntentsV3({
                profile,
                favorites: [comic('f', [], true)],
                history
            })
            expect(
                planned.some((item) => item.planning.recentUseCount >= 1)
            ).toBe(true)
        } finally {
            database.close()
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })

    it('records factual events once with server-authoritative time', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v3-events-'))
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        try {
            const first = database.recordUserEvent({
                eventType: 'recommend_batch_presented',
                recommendationCycleId: 'cycle',
                recommendationBatchIndex: 0,
                metadata: { batchId: 'batch' },
                dedupeKey: 'cycle:batch',
                occurredAt: '2000-01-01T00:00:00.000Z'
            })
            const second = database.recordUserEvent({
                eventType: 'recommend_batch_presented',
                recommendationCycleId: 'cycle',
                recommendationBatchIndex: 0,
                metadata: { batchId: 'batch' },
                dedupeKey: 'cycle:batch',
                occurredAt: '2001-01-01T00:00:00.000Z'
            })
            expect(
                database.listUserEvents({
                    eventType: 'recommend_batch_presented'
                })
            ).toHaveLength(1)
            expect(first.id).toBe(second.id)
            expect(first.occurredAt).not.toBe('2000-01-01T00:00:00.000Z')
            expect(first.metadata.clientObservedAt).toBe(
                '2000-01-01T00:00:00.000Z'
            )
            expect(first.metadata.clientObservedTimeTrust).toBe(
                'UNTRUSTED_CLIENT_TIME'
            )
        } finally {
            database.close()
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })
})
