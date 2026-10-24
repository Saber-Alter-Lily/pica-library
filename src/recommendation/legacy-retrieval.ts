import type {
    LegacyRecallPorts,
    LegacyRecommendationOptions
} from './legacy-ports'
import type { Comic } from '../types'
import type { RecommendationCandidate, RecallRoute } from '../library/types'
import { normalizeAuthorKey } from '../library/author-normalization'
import {
    mergeRecallCandidates,
    recommendComics,
    selectDiversifiedSeeds
} from '../library/recommendation'
import { buildV3Profile } from '../recommendation-v3/taste-model'
import {
    buildRecommendationIntents,
    planSemanticQueries
} from '../recommendation-v3/query-planner'
import { normalizeTag } from '../recommendation-v3/semantic-core'
import { buildBehaviorProfile } from '../recommendation-v3/behavior-profile'
import { mineTagCombinations } from '../recommendation-v3/tag-combinations'
import { rankV3 } from '../recommendation-v3/ranker'
import { rerankV3 } from '../recommendation-v3/reranker'
import { projectComicTagSignalsV1 } from '../tags/policy'

/** Actual historical bounded recall/rank pipeline; account, transport and persistence are ports. */
export class LegacyRecommendationRetrieval {
    constructor(private readonly ports: LegacyRecallPorts) {}
    async execute(options: LegacyRecommendationOptions = {}) {
        const limit = Math.max(1, Math.min(options.limit ?? 30, 500))
        const tagState = this.ports.tagPolicy()
        const rawInitialCatalog = this.ports.read.listComics({ limit: 5000 })
        const favorites = this.ports.read
            .listComics({ limit: 5000 })
            .filter((comic) => comic.isFavorite)
            .map((comic) => projectComicTagSignalsV1(comic, tagState, false))
        if (favorites.length === 0) return recommendComics([], limit)

        const source = await this.ports.openProvider()
        const pica = source.client
        const seedBudget = Math.max(1, Math.min(options.seedCount ?? 12, 16))
        // This legacy route calls Pica's native related endpoint, not a cross-source ID lookup.
        const seeds = selectDiversifiedSeeds(
            favorites.filter(
                (comic) =>
                    !comic.comicId.includes(':') && comic.providerId === 'pica'
            ),
            seedBudget
        )
        const profile = recommendComics(favorites, limit).profile
        const semanticProfile = buildV3Profile(
            favorites,
            rawInitialCatalog.map((comic) =>
                projectComicTagSignalsV1(comic, tagState, false)
            )
        )
        const semanticPlans = planSemanticQueries(
            buildRecommendationIntents(semanticProfile, favorites)
        )
        const boundedTagSearch = async (tag: string) => {
            const first = await pica.comicsPage('', tag, pica.Order.loved, 1)
            const docs = [...first.docs]
            for (let page = 2; page <= Math.min(first.pages, 3); page++)
                docs.push(
                    ...(await pica.comicsPage('', tag, pica.Order.loved, page))
                        .docs
                )
            return docs
        }
        const boundedAuthorSearch = async (author: string) => {
            const first = await pica.search(author, 1, pica.Order.loved)
            const docs = [...first.docs]
            for (let page = 2; page <= Math.min(first.pages, 2); page++)
                docs.push(
                    ...(await pica.search(author, page, pica.Order.loved)).docs
                )
            return docs
        }
        const recallTasks: Array<{
            route: RecallRoute
            source: string
            seedComicId?: string
            load: () => Promise<Comic[]>
            accepts?: (comic: Comic) => boolean
        }> = seeds.map((seed) => ({
            route: 'related' as const,
            source: seed.comicId,
            seedComicId: seed.comicId,
            load: () => pica.related(seed.comicId)
        }))
        // Self-designed semantic routes own the first bounded retrieval budget;
        // native related remains a later auxiliary route in the merged pool.
        for (const plan of semanticPlans.slice(0, 4))
            for (const route of plan.routes.slice(0, 2)) {
                if (route.kind === 'tag' || route.kind === 'fandom')
                    recallTasks.push({
                        route: 'tag',
                        source: `semantic:${route.kind}:${route.query}`,
                        load: () => boundedTagSearch(route.query),
                        accepts: (comic) =>
                            comic.tags.some(
                                (tag) =>
                                    normalizeTag(tag) ===
                                    normalizeTag(route.query)
                            )
                    })
                else if (route.kind === 'author')
                    recallTasks.push({
                        route: 'author',
                        source: `semantic:${route.query}`,
                        load: () => boundedAuthorSearch(route.query)
                    })
                else if (route.kind === 'genre')
                    recallTasks.push({
                        route: 'category',
                        source: `semantic:genre:${route.query}`,
                        load: async () => {
                            const first = await pica.comicsPage(
                                route.query,
                                '',
                                pica.Order.loved,
                                1
                            )
                            const pages = Math.min(
                                first.pages ?? 1,
                                route.maxPages
                            )
                            const docs = [...first.docs]
                            for (let page = 2; page <= pages; page++)
                                docs.push(
                                    ...(
                                        await pica.comicsPage(
                                            route.query,
                                            '',
                                            pica.Order.loved,
                                            page
                                        )
                                    ).docs
                                )
                            return docs
                        },
                        accepts: (comic) =>
                            comic.categories.some(
                                (category) =>
                                    normalizeTag(category) ===
                                    normalizeTag(route.query)
                            )
                    })
            }
        const recallTelemetry = new Map<
            string,
            {
                requests: number
                failures: number
                raw: number
                unique: number
                latencyMs: number
            }
        >()
        for (const item of profile.tags.slice(0, 2))
            recallTasks.push({
                route: 'tag',
                source: item.value,
                load: () => boundedTagSearch(item.value),
                accepts: (comic) =>
                    comic.tags.some(
                        (tag) => normalizeTag(tag) === normalizeTag(item.value)
                    )
            })
        const combinations = mineTagCombinations(
            favorites,
            this.ports.read.listComics({ limit: 5000 })
        )
        for (const combination of [
            ...combinations.pairs.slice(0, 2),
            ...combinations.triples.slice(0, 1)
        ]) {
            const anchor = combination.tags
                .map((tag) => ({
                    tag,
                    count: favorites.filter((comic) =>
                        comic.tags.some(
                            (value) => normalizeTag(value) === normalizeTag(tag)
                        )
                    ).length
                }))
                .sort(
                    (a, b) => a.count - b.count || a.tag.localeCompare(b.tag)
                )[0]?.tag
            if (!anchor) continue
            recallTasks.push({
                route: 'tag',
                source: `combination:${combination.tags.join('+')}`,
                load: () => boundedTagSearch(anchor),
                accepts: (comic) =>
                    combination.tags.every((wanted) =>
                        comic.tags.some(
                            (value) =>
                                normalizeTag(value) === normalizeTag(wanted)
                        )
                    )
            })
        }
        for (const item of profile.categories.slice(0, 2))
            recallTasks.push({
                route: 'category',
                source: item.value,
                load: async () =>
                    (await pica.comicsPage(item.value, '', pica.Order.loved, 1))
                        .docs,
                accepts: (comic) =>
                    comic.categories.some(
                        (category) =>
                            normalizeAuthorKey(category) ===
                            normalizeAuthorKey(item.value)
                    )
            })
        for (const item of profile.authors.slice(0, 2))
            recallTasks.push({
                route: 'author',
                source: item.value,
                load: () => boundedAuthorSearch(item.value),
                accepts: (comic) =>
                    normalizeAuthorKey(comic.author) ===
                    normalizeAuthorKey(item.value)
            })
        for (const item of profile.circles.slice(0, 2))
            recallTasks.push({
                route: 'circle',
                source: item.value,
                load: () => boundedAuthorSearch(item.value),
                accepts: (comic) =>
                    normalizeAuthorKey(comic.author).includes(
                        normalizeAuthorKey(item.value)
                    )
            })
        // Keep the cycle bounded even when semantic and legacy fallback routes
        // are both available. Native related seeds occupy the first slots;
        // semantic routes then receive the remaining bounded budget.
        const boundedRecallTasks = recallTasks.slice(0, 24)
        const gate = this.ports.runtime.limit(3)
        const recalled = await Promise.all(
            boundedRecallTasks.map((task) =>
                gate(async (): Promise<RecommendationCandidate[]> => {
                    const startedAt = this.ports.runtime.nowMs()
                    const telemetry = recallTelemetry.get(task.route) ?? {
                        requests: 0,
                        failures: 0,
                        raw: 0,
                        unique: 0,
                        latencyMs: 0
                    }
                    telemetry.requests += 1
                    try {
                        const loaded = await task.load()
                        telemetry.raw += loaded.length
                        const result = loaded
                            .filter((comic) => task.accepts?.(comic) ?? true)
                            .map((comic) => ({
                                comic: this.ports.convert(comic),
                                recalls: [
                                    {
                                        route: task.route,
                                        source: task.source,
                                        seedComicId: task.seedComicId,
                                        providerPage: 1,
                                        providerRank: loaded.indexOf(comic) + 1,
                                        retrievedAt:
                                            this.ports.runtime.nowIso(),
                                        queryTag:
                                            task.route === 'tag' &&
                                            !task.source.startsWith(
                                                'combination:'
                                            )
                                                ? task.source
                                                : undefined,
                                        queryCombination:
                                            task.source.startsWith(
                                                'combination:'
                                            )
                                                ? task.source
                                                      .slice(
                                                          'combination:'.length
                                                      )
                                                      .split('+')
                                                : undefined
                                    }
                                ]
                            }))
                        telemetry.unique += new Set(
                            result.map((item) => item.comic.comicId)
                        ).size
                        telemetry.latencyMs +=
                            this.ports.runtime.nowMs() - startedAt
                        recallTelemetry.set(task.route, telemetry)
                        return result
                    } catch {
                        telemetry.failures += 1
                        telemetry.latencyMs +=
                            this.ports.runtime.nowMs() - startedAt
                        recallTelemetry.set(task.route, telemetry)
                        return []
                    }
                })
            )
        )
        const mergedCandidates = mergeRecallCandidates(recalled.flat())
        // Native related is auxiliary only: semantic/tag/creator/category
        // routes own the pool, while related results can rescue a bounded
        // fraction of candidates and add graph corroboration.
        const semanticCandidates = mergedCandidates.filter((candidate) =>
            candidate.recalls.some((recall) => recall.route !== 'related')
        )
        const nativeCandidates = mergedCandidates.filter((candidate) =>
            candidate.recalls.every((recall) => recall.route === 'related')
        )
        const nativeBudget = Math.min(
            120,
            Math.max(24, Math.floor(mergedCandidates.length * 0.25))
        )
        const candidates = [
            ...semanticCandidates,
            ...nativeCandidates.slice(0, nativeBudget)
        ].slice(0, 1500)
        source.assertCurrent()
        for (const candidate of candidates)
            for (const evidence of candidate.recalls)
                if (evidence.route === 'related' && evidence.seedComicId)
                    this.ports.write.recordRecommendationEdge({
                        sourceComicId: evidence.seedComicId,
                        targetComicId: candidate.comic.comicId,
                        edgeType: 'provider-related',
                        confidence: 0.5,
                        metadata: { source: evidence.source }
                    })
        this.ports.write.importCatalog(
            candidates.map((item) => item.comic),
            'pica:recommendations'
        )
        const rawCatalog = this.ports.read.listComics({ limit: 5000 })
        const catalog = rawCatalog.map((comic) =>
            projectComicTagSignalsV1(comic, tagState, false)
        )
        try {
            const v3Profile = buildBehaviorProfile(
                buildV3Profile(favorites, catalog),
                this.ports.read.listUserEvents({ limit: 5000 }),
                catalog,
                options.appSessionId
            )
            const ranked = rankV3(
                catalog.filter((comic) =>
                    candidates.some(
                        (item) => item.comic.comicId === comic.comicId
                    )
                ),
                favorites,
                v3Profile,
                this.ports.read.listUserEvents(),
                {
                    graphEdges: this.ports.read
                        .listRecommendationEdges()
                        .map((edge) => ({
                            sourceComicId: edge.sourceComicId,
                            targetComicId: edge.targetComicId,
                            confidence: edge.confidence,
                            observationCount: edge.observationCount
                        })),
                    routeFamilies: new Map(
                        [
                            'related',
                            'cluster',
                            'tag',
                            'combination',
                            'author',
                            'circle'
                        ].map((route) => [
                            route,
                            new Set(
                                candidates
                                    .filter((item) =>
                                        item.recalls.some(
                                            (recall) => recall.route === route
                                        )
                                    )
                                    .map((item) => item.comic.comicId)
                            )
                        ])
                    )
                }
            )
            const byId = new Map(
                rawCatalog.map((comic) => [comic.comicId, comic])
            )
            const reranked = rerankV3(
                ranked,
                new Map(catalog.map((comic) => [comic.comicId, comic])),
                limit,
                v3Profile.historical.clusters
            )
            const recallById = new Map(
                candidates.map((item) => [item.comic.comicId, item.recalls])
            )
            if (reranked.length) {
                return {
                    profile: {
                        favoriteCount: favorites.length,
                        finishedRatio: favorites.length
                            ? favorites.filter((comic) => comic.finished)
                                  .length / favorites.length
                            : 0,
                        tags: v3Profile.historical.tags
                            .slice(0, 20)
                            .map((item) => ({
                                value: item.tag,
                                count: item.favoriteCount,
                                weight: item.score
                            })),
                        categories: [],
                        authors: [],
                        circles: []
                    },
                    recommendations: reranked.map((item) => {
                        const comic = byId.get(item.comicId)!
                        const evidence = recallById.get(item.comicId) ?? []
                        return {
                            comic,
                            score: item.score,
                            reasons: item.reasons,
                            recallSources: [
                                ...new Set(evidence.map((value) => value.route))
                            ],
                            matchedSignals: item.reasons,
                            exploration: item.features.novelty > 0
                        }
                    }),
                    audit: {
                        favoriteCount: favorites.length,
                        seedCount: seeds.length,
                        seedAuthorDiversity: new Set(
                            seeds.map((item) => item.authorId)
                        ).size,
                        seedTagDiversity: new Set(
                            seeds.flatMap((item) => item.tags)
                        ).size,
                        candidateCountByRecallRoute: {
                            related: candidates.filter((item) =>
                                item.recalls.some((r) => r.route === 'related')
                            ).length,
                            author: candidates.filter((item) =>
                                item.recalls.some((r) => r.route === 'author')
                            ).length,
                            tag: candidates.filter((item) =>
                                item.recalls.some((r) => r.route === 'tag')
                            ).length,
                            category: candidates.filter((item) =>
                                item.recalls.some((r) => r.route === 'category')
                            ).length,
                            circle: candidates.filter((item) =>
                                item.recalls.some((r) => r.route === 'circle')
                            ).length
                        },
                        deduplicatedCandidateCount: candidates.length,
                        alreadyFavoriteExcludedCount: 0,
                        finalRecommendationCount: reranked.length,
                        maxSameAuthorInTopN: 2,
                        explorationCount: reranked.filter(
                            (item) => item.features.novelty > 0
                        ).length,
                        recallTelemetry: Object.fromEntries(
                            [...recallTelemetry.entries()].map(
                                ([route, value]) => [
                                    route,
                                    {
                                        ...value,
                                        duplicateCount: Math.max(
                                            0,
                                            value.raw - value.unique
                                        ),
                                        pageDepth: 1,
                                        yield:
                                            value.unique /
                                            Math.max(1, value.requests)
                                    }
                                ]
                            )
                        )
                    }
                }
            }
        } catch {
            // V3 is deliberately fail-safe: preserve the V2 contract if a
            // profile, ranking, or schema-8 derived artifact is unavailable.
        }
        const fallback = recommendComics(
            catalog,
            limit,
            candidates.map((candidate) => ({
                ...candidate,
                comic: projectComicTagSignalsV1(
                    candidate.comic,
                    tagState,
                    false
                )
            }))
        )
        const rawById = new Map(
            rawCatalog.map((comic) => [comic.comicId, comic])
        )
        return {
            ...fallback,
            recommendations: fallback.recommendations.map((row) => ({
                ...row,
                comic: rawById.get(row.comic.comicId) ?? row.comic
            }))
        }
    }
}
