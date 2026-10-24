// Exact frozen methods/classes from 3ce697566f379fef2dc566af9e91f3ee183c2d21. Never update with the replacement.
import pLimit from 'p-limit'
import { randomUUID } from 'node:crypto'
import type { Pica } from '../../src/sdk'
import type { Comic } from '../../src/types'
import { LibraryDatabase } from '../../src/library/database'
import { normalizeAuthorKey } from '../../src/library/author'
import { trustedCoverUrl } from '../../src/library/cover-url'
import type { FavoriteRecord, RecommendationCandidate, RecallRoute, RecommendationResult } from '../../src/library/types'
import { mergeRecallCandidates, recommendComics, selectDiversifiedSeeds } from '../../src/library/recommendation'
import { buildV3Profile } from '../../src/recommendation-v3/taste-model'
import { buildRecommendationIntents, planSemanticQueries } from '../../src/recommendation-v3/query-planner'
import { normalizeTag } from '../../src/recommendation-v3/semantic-core'
import { buildBehaviorProfile } from '../../src/recommendation-v3/behavior-profile'
import { mineTagCombinations } from '../../src/recommendation-v3/tag-combinations'
import { rankV3 } from '../../src/recommendation-v3/ranker'
import { rerankV3 } from '../../src/recommendation-v3/reranker'
import { normalizeTagPolicyV1, projectComicTagSignalsV1 } from '../../src/tags/policy'
import { RECOMMENDATION_V5_POLICY_STATE_KEY, type PortablePolicyStateV5 } from '../../src/recommendation-v5/portable-policy'

export const LEGACY_COMPATIBILITY_SOURCE = "3ce697566f379fef2dc566af9e91f3ee183c2d21"
function comicToRecord(comic: Comic): FavoriteRecord {
    return {
        comicId: comic._id,
        title: comic.title.trim(),
        author: comic.author ?? '',
        description: comic.description ?? '',
        chineseTeam: comic.chineseTeam ?? '',
        categories: comic.categories ?? [],
        tags: comic.tags ?? [],
        finished: Boolean(comic.finished),
        createdAt: comic.created_at,
        updatedAt: comic.updated_at,
        totalLikes: comic.totalLikes ?? comic.likesCount ?? 0,
        totalViews: comic.totalViews ?? comic.viewsCount ?? 0,
        pagesCount: comic.pagesCount ?? 0,
        epsCount: comic.epsCount ?? 0,
        coverUrl: trustedCoverUrl(
            comic.thumb?.fileServer && comic.thumb.path
                ? `${comic.thumb.fileServer}/static/${comic.thumb.path}`
                : undefined
        )
    }
}
export class FrozenLegacyRecall {
constructor(readonly database: LibraryDatabase, private readonly provider: Pica) {}
private async connect() { return this.provider }
private preferenceViewState() {
        // These GET views must not initialize/persist a policy on an empty library.
        const state = this.database.getAppState<PortablePolicyStateV5>(
            RECOMMENDATION_V5_POLICY_STATE_KEY
        )
        return {
            revision: state?.revision ?? 0,
            tagPolicy: normalizeTagPolicyV1(state?.tagPolicy),
            controls: Array.isArray(state?.controls) ? state.controls : [],
            tasteExcludedComicIds: Array.isArray(state?.tasteExcludedComicIds)
                ? state.tasteExcludedComicIds
                : []
        }
    }
async recommendations(
        options: {
            limit?: number
            seedCount?: number
            appSessionId?: string | null
        } = {}
    ) {
        const limit = Math.max(1, Math.min(options.limit ?? 30, 500))
        const tagState = this.preferenceViewState()
        const rawInitialCatalog = this.database.listComics({ limit: 5000 })
        const favorites = this.database
            .listComics({ limit: 5000 })
            .filter((comic) => comic.isFavorite)
            .map(comic => projectComicTagSignalsV1(comic, tagState, false))
        if (favorites.length === 0) return recommendComics([], limit)

        const pica = await this.connect()
        const seedBudget = Math.max(1, Math.min(options.seedCount ?? 12, 16))
        // This legacy route calls Pica's native related endpoint, not a cross-source ID lookup.
        const seeds = selectDiversifiedSeeds(favorites.filter(comic => !comic.comicId.includes(':') && comic.providerId === 'pica'), seedBudget)
        const profile = recommendComics(favorites, limit).profile
        const semanticProfile = buildV3Profile(
            favorites,
            rawInitialCatalog.map(comic => projectComicTagSignalsV1(comic, tagState, false))
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
            this.database.listComics({ limit: 5000 })
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
        const gate = pLimit(3)
        const recalled = await Promise.all(
            boundedRecallTasks.map((task) =>
                gate(async (): Promise<RecommendationCandidate[]> => {
                    const startedAt = Date.now()
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
                                comic: comicToRecord(comic),
                                recalls: [
                                    {
                                        route: task.route,
                                        source: task.source,
                                        seedComicId: task.seedComicId,
                                        providerPage: 1,
                                        providerRank: loaded.indexOf(comic) + 1,
                                        retrievedAt: new Date().toISOString(),
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
                        telemetry.latencyMs += Date.now() - startedAt
                        recallTelemetry.set(task.route, telemetry)
                        return result
                    } catch {
                        telemetry.failures += 1
                        telemetry.latencyMs += Date.now() - startedAt
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
        for (const candidate of candidates)
            for (const evidence of candidate.recalls)
                if (evidence.route === 'related' && evidence.seedComicId)
                    this.database.recordRecommendationEdge({
                        sourceComicId: evidence.seedComicId,
                        targetComicId: candidate.comic.comicId,
                        edgeType: 'provider-related',
                        confidence: 0.5,
                        metadata: { source: evidence.source }
                    })
        this.database.importCatalog(
            candidates.map((item) => item.comic),
            'pica:recommendations'
        )
        const rawCatalog = this.database.listComics({ limit: 5000 })
        const catalog = rawCatalog.map(comic => projectComicTagSignalsV1(comic, tagState, false))
        try {
            const v3Profile = buildBehaviorProfile(
                buildV3Profile(favorites, catalog),
                this.database.listUserEvents({ limit: 5000 }),
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
                this.database.listUserEvents(),
                {
                    graphEdges: this.database
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
            const byId = new Map(rawCatalog.map((comic) => [comic.comicId, comic]))
            const reranked = rerankV3(
                ranked,
                new Map(catalog.map(comic => [comic.comicId, comic])),
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
        const fallback = recommendComics(catalog, limit, candidates.map(candidate => ({ ...candidate, comic: projectComicTagSignalsV1(candidate.comic, tagState, false) })))
        const rawById = new Map(rawCatalog.map(comic => [comic.comicId, comic]))
        return { ...fallback, recommendations: fallback.recommendations.map(row => ({ ...row, comic: rawById.get(row.comic.comicId) ?? row.comic })) }
    }
}
interface GeneratedRecommendations {
    recommendations: RecommendationResult[]
    profile: unknown
    audit?: unknown
}
interface ActiveRecommendationState {
    cycleId: string
    currentSessionNo: number
    currentBatchIndex: number
}
export class RecommendationService {
    static readonly batchSize = 12
    static readonly sessionSize = 60
    static readonly candidateDepth = 500
    private readonly stateKey = 'recommendation.activeCycle'
    private prewarm: Promise<unknown> | null = null
    private prewarmTarget: { cycleId: string; sessionNo: number } | null = null

    constructor(
        private readonly database: LibraryDatabase,
        private readonly generate: (
            limit: number
        ) => Promise<GeneratedRecommendations>
    ) {}

    private state(): ActiveRecommendationState {
        const existing = this.database.getAppState<ActiveRecommendationState>(
            this.stateKey
        )
        if (existing?.cycleId)
            return {
                cycleId: existing.cycleId,
                currentSessionNo: Math.max(
                    0,
                    Number(existing.currentSessionNo ?? 0)
                ),
                currentBatchIndex: Math.max(
                    0,
                    Number(existing.currentBatchIndex ?? 0)
                )
            }
        const created = {
            cycleId: randomUUID(),
            currentSessionNo: 0,
            currentBatchIndex: 0
        }
        this.database.setAppState(this.stateKey, created)
        return created
    }

    private saveState(state: ActiveRecommendationState) {
        this.database.setAppState(this.stateKey, state)
        return state
    }

    private response(
        state: ActiveRecommendationState,
        session: NonNullable<
            ReturnType<LibraryDatabase['latestRecommendationSession']>
        >,
        profile: unknown = null,
        audit?: unknown,
        generatedRecommendations?: RecommendationResult[]
    ) {
        const recommendations = (
            generatedRecommendations ??
            this.database.recommendationRecords(session.comicIds)
        ).filter((item) => !item.comic.isFavorite)
        return {
            cycleId: state.cycleId,
            sessionId: session.id,
            sessionNo: session.sessionNo,
            currentBatchIndex: state.currentBatchIndex,
            batchSize: RecommendationService.batchSize,
            batchCount: Math.max(
                1,
                Math.ceil(
                    recommendations.length / RecommendationService.batchSize
                )
            ),
            recommendations,
            profile,
            audit,
            seenCount: this.database.recommendationSeen(state.cycleId).length,
            exhausted: session.exhausted,
            nextSessionReady: Boolean(
                this.database.recommendationSession(
                    state.cycleId,
                    session.sessionNo + 1
                )
            ),
            message: session.exhausted ? '暂时没有更多未展示推荐。' : undefined
        }
    }

    private async generateSession(cycleId: string, sessionNo: number) {
        const existing = this.database.recommendationSession(cycleId, sessionNo)
        if (existing)
            return {
                session: existing,
                profile: null,
                audit: null,
                recommendations: undefined
            }
        const seen = new Set(this.database.recommendationSeen(cycleId))
        const generated = await this.generate(
            RecommendationService.candidateDepth
        )
        const unique = new Map<string, RecommendationResult>()
        for (const item of generated.recommendations) {
            const id = item.comic.comicId
            if (seen.has(id) || item.comic.isFavorite || unique.has(id))
                continue
            unique.set(id, item)
            if (unique.size >= RecommendationService.sessionSize) break
        }
        const recommendations = [...unique.values()]
        const session = this.database.saveRecommendationSession(
            cycleId,
            sessionNo,
            recommendations.map((item) => item.comic.comicId),
            recommendations.length === 0
        )
        return {
            session,
            profile: generated.profile,
            audit: generated.audit,
            recommendations
        }
    }

    async ensureInitialPrepared() {
        const state = this.state()
        if (state.currentSessionNo > 0) {
            const current = this.database.recommendationSession(
                state.cycleId,
                state.currentSessionNo
            )
            if (current) return this.response(state, current)
        }
        const generated = await this.generateSession(state.cycleId, 1)
        const active = this.saveState({
            ...state,
            currentSessionNo: 1,
            currentBatchIndex: 0
        })
        return this.response(
            active,
            generated.session,
            generated.profile,
            generated.audit,
            generated.recommendations
        )
    }

    prewarmNextSession() {
        if (this.prewarm) return this.prewarm
        const state = this.state()
        if (!state.currentSessionNo) return Promise.resolve(null)
        const nextNo = state.currentSessionNo + 1
        if (this.database.recommendationSession(state.cycleId, nextNo))
            return Promise.resolve({ ready: true, sessionNo: nextNo })
        this.prewarmTarget = { cycleId: state.cycleId, sessionNo: nextNo }
        this.prewarm = this.generateSession(state.cycleId, nextNo).finally(
            () => {
                this.prewarm = null
                this.prewarmTarget = null
            }
        )
        return this.prewarm
    }

    async nextSession() {
        const state = this.state()
        if (!state.currentSessionNo) return this.ensureInitialPrepared()
        return this.advanceSession()
    }

    async advanceSession() {
        const state = this.state()
        if (!state.currentSessionNo) return this.ensureInitialPrepared()
        const nextNo = state.currentSessionNo + 1
        if (
            this.prewarm &&
            this.prewarmTarget?.cycleId === state.cycleId &&
            this.prewarmTarget.sessionNo === nextNo
        )
            await this.prewarm
        const generated = await this.generateSession(state.cycleId, nextNo)
        const active = this.saveState({
            ...state,
            currentSessionNo: nextNo,
            currentBatchIndex: 0
        })
        void this.prewarmNextSession().catch(() => undefined)
        return this.response(
            active,
            generated.session,
            generated.profile,
            generated.audit,
            generated.recommendations
        )
    }

    recordBatch(batchIndex: number) {
        const state = this.state()
        const active = this.saveState({
            ...state,
            currentBatchIndex: Math.max(0, Math.floor(batchIndex))
        })
        if (active.currentBatchIndex >= 1)
            void this.prewarmNextSession().catch(() => undefined)
        return this.currentState()
    }

    async restartCycle() {
        if (this.prewarm) await this.prewarm.catch(() => undefined)
        this.saveState({
            cycleId: randomUUID(),
            currentSessionNo: 0,
            currentBatchIndex: 0
        })
        return this.ensureInitialPrepared()
    }

    currentState() {
        const state = this.state()
        if (!state.currentSessionNo)
            return {
                ...state,
                preparing: true,
                recommendations: [],
                nextSessionReady: false,
                seenCount: 0
            }
        const session = this.database.recommendationSession(
            state.cycleId,
            state.currentSessionNo
        )
        if (!session)
            return {
                ...state,
                preparing: true,
                recommendations: [],
                nextSessionReady: false,
                seenCount: this.database.recommendationSeen(state.cycleId)
                    .length
            }
        return { ...this.response(state, session), preparing: false }
    }
}
interface AdaptiveState {
    cycleId: string
    poolId: string | null
    batchIndex: number
    appSessionId: string | null
}
export class AdaptiveRecommendationSession {
    static readonly batchSize = 12
    static readonly candidateDepth = 500
    private readonly stateKey = 'recommendation.v3.activeCycle'
    private readonly generatedPools = new Map<
        string,
        GeneratedRecommendations
    >()

    constructor(
        private readonly database: LibraryDatabase,
        private readonly generate: (
            limit: number,
            appSessionId?: string | null
        ) => Promise<GeneratedRecommendations>
    ) {}

    private state(): AdaptiveState {
        const existing = this.database.getAppState<AdaptiveState>(this.stateKey)
        if (existing?.cycleId) return existing
        return this.saveState({
            cycleId: randomUUID(),
            poolId: null,
            batchIndex: -1,
            appSessionId: null
        })
    }

    private saveState(state: AdaptiveState) {
        this.database.setAppState(this.stateKey, state)
        return state
    }

    private async ensurePool(state: AdaptiveState) {
        if (state.poolId) {
            const existing = this.database.getV3CandidatePool(state.poolId)
            if (existing) return existing
        }
        const generated = await this.generate(
            AdaptiveRecommendationSession.candidateDepth,
            state.appSessionId
        )
        const ids = [
            ...new Set(
                generated.recommendations.map((item) => item.comic.comicId)
            )
        ]
        const pool = this.database.saveV3CandidatePool({
            cycleId: state.cycleId,
            appSessionId: state.appSessionId,
            candidateIds: ids,
            telemetry: { audit: generated.audit ?? null },
            modelVersion: 'v3.0.0-local-explainable'
        })
        this.saveState({ ...state, poolId: pool.id })
        this.generatedPools.set(pool.id, generated)
        return this.database.getV3CandidatePool(pool.id)!
    }

    async nextBatch(input: { appSessionId?: string | null } = {}) {
        let state = this.state()
        if (input.appSessionId && input.appSessionId !== state.appSessionId)
            state = this.saveState({
                ...state,
                appSessionId: input.appSessionId
            })
        const pool = await this.ensurePool(state)
        const allocated = new Set(
            this.database.recommendationSeen(state.cycleId)
        )
        const remaining = pool.candidateIds.filter((id) => !allocated.has(id))
        const cached = this.generatedPools.get(pool.id) ?? {
            recommendations: this.database.recommendationRecords(
                pool.candidateIds
            ),
            profile: null,
            audit: { restoredFromCandidatePool: true }
        }
        this.generatedPools.set(pool.id, cached)
        const catalog = this.database.listComics({ limit: 5000 })
        const favorites = catalog.filter((item) => item.isFavorite)
        const profile = buildBehaviorProfile(
            buildV3Profile(favorites, catalog),
            this.database.listUserEvents({ limit: 5000 }),
            catalog,
            state.appSessionId
        )
        const ranked = rankV3(
            catalog.filter((item) => remaining.includes(item.comicId)),
            favorites,
            profile,
            this.database.listUserEvents({ limit: 5000 })
        )
        const reranked = rerankV3(
            ranked,
            new Map(catalog.map((item) => [item.comicId, item])),
            AdaptiveRecommendationSession.batchSize
        )
        const generatedById = new Map(
            (cached?.recommendations ?? []).map((item) => [
                item.comic.comicId,
                item
            ])
        )
        const recommendations = reranked.flatMap((item) => {
            const original = generatedById.get(item.comicId)
            const comic = catalog.find(
                (candidate) => candidate.comicId === item.comicId
            )
            return comic
                ? [
                      {
                          ...(original ?? {
                              comic,
                              recallSources: [],
                              matchedSignals: [],
                              exploration: false
                          }),
                          comic,
                          score: item.score,
                          reasons: item.reasons,
                          matchedSignals: item.reasons,
                          exploration: item.features.novelty > 0
                      }
                  ]
                : []
        })
        const batchIndex = state.batchIndex + 1
        const contextId = randomUUID()
        this.database.allocateRecommendationIds(
            state.cycleId,
            recommendations.map((item) => item.comic.comicId)
        )
        const batch = this.database.saveV3Batch({
            poolId: pool.id,
            cycleId: state.cycleId,
            batchIndex,
            contextId,
            itemIds: recommendations.map((item) => item.comic.comicId),
            evidence: { adaptiveRerank: true, profile }
        })
        state = this.saveState({ ...state, poolId: pool.id, batchIndex })
        return {
            cycleId: state.cycleId,
            sessionId: batch.id,
            sessionNo: 1,
            currentBatchIndex: batchIndex,
            batchSize: AdaptiveRecommendationSession.batchSize,
            batchCount: Math.max(
                1,
                Math.ceil(
                    pool.candidateIds.length /
                        AdaptiveRecommendationSession.batchSize
                )
            ),
            recommendations,
            profile,
            audit: cached?.audit,
            contextId,
            candidatePoolId: pool.id,
            adaptive: true,
            seenCount: this.database.recommendationSeen(state.cycleId).length,
            exhausted: recommendations.length === 0,
            nextSessionReady: remaining.length > recommendations.length
        }
    }

    async restart(input: { appSessionId?: string | null } = {}) {
        this.saveState({
            cycleId: randomUUID(),
            poolId: null,
            batchIndex: -1,
            appSessionId: input.appSessionId ?? null
        })
        return this.nextBatch(input)
    }

    status() {
        const state = this.state()
        const pool = state.poolId
            ? this.database.getV3CandidatePool(state.poolId)
            : null
        const batches = pool ? this.database.listV3Batches(pool.id) : []
        const last = batches.at(-1)
        return {
            ...state,
            adaptive: true,
            contextId: last?.contextId ?? null,
            recommendations: last
                ? this.database.recommendationRecords(last.itemIds)
                : [],
            seenCount: this.database.recommendationSeen(state.cycleId).length,
            preparing: !pool
        }
    }
}
export { RecommendationService as FrozenLegacySessions, AdaptiveRecommendationSession as FrozenAdaptiveSessions }
