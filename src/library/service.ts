import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import pLimit from 'p-limit'
import { Pica } from '../sdk'
import type { Comic, Picture } from '../types'
import { LibraryDatabase } from './database'
import { normalizeAuthorKey } from './author'
import { safeRasterContentType, trustedCoverUrl } from './cover-url'
import type {
    FavoriteRecord,
    RecommendationCandidate,
    RecallRoute,
    SortMode
} from './types'
import {
    mergeRecallCandidates,
    recommendComics,
    selectDiversifiedSeeds
} from './recommendation'
import { DownloadScheduler } from '../core/downloads/scheduler'
import { MediaRequestGate } from '../core/downloads/media-gate'
import {
    resolvePerformanceSettings,
    type PerformanceProfile,
    type PerformanceSettings
} from '../core/downloads/profiles'
import {
    defaultLibraryTemplate,
    renderLibraryPath,
    safePathSegment
} from './path-template'
import type {
    CreateDownloadJob,
    DownloadJob,
    DownloadRunner
} from '../core/downloads/types'
import { checkComicUpdates } from '../maintenance/updates'
import {
    ProviderService,
    type FavoritesSyncMode
} from '../services/provider-service'
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
import type { UserEventInput } from '../recommendation-v3/types'
import {
    buildHistoricalTasteSnapshot,
    type HistoricalTasteSnapshot
} from '../recommendation-v3/taste-chronicle'
import { runtimeRegistryDirectory } from '../recommendation-v3/runtime-registry-path'
import {
    buildFinalLifetimeProfileV3,
    FINAL_PROFILE_VERSION
} from '../recommendation-v3/final-profile'
import {
    buildRecommendationIntentsV3,
    INTENT_PLANNER_VERSION,
    type IntentCycleHistory
} from '../recommendation-v3/intent-planner-v3'
import {
    translateIntentPlanV3,
    QUERY_TRANSLATOR_VERSION
} from '../recommendation-v3/provider-query-translator'
import {
    retrieveCandidatesV3,
    RETRIEVER_VERSION
} from '../recommendation-v3/retriever-v3'
import {
    rankCandidatesWithFrozenRankerV3,
    RANKER_ADAPTER_VERSION
} from '../recommendation-v3/ranker-adapter-v3'
import { BATCH_ALLOCATOR_VERSION } from '../recommendation-v3/batch-allocator-v3'
import {
    loadTagRegistryV3,
    resolveTagV3
} from '../recommendation-v3/tag-resolution-v3'

export interface DiscoverQuery {
    keyword?: string
    tags?: string[]
    categories?: string[]
    sort?: SortMode
    limit?: number
}

export interface DownloadProgress {
    comicId: string
    comicTitle: string
    episodeId: string
    episodeTitle: string
    completed: number
    total: number
    bytes: number
    file?: string
}

export interface DownloadResult {
    comicId: string
    title: string
    episodes: number
    pictures: number
    downloaded: number
    skipped: number
    completed: number
    bytes: number
}

export interface FavoritesSyncProgress {
    phase: 'idle' | 'reading' | 'processing' | 'complete' | 'failed'
    mode?: FavoritesSyncMode
    page?: number
    pages?: number
    fetched?: number
    total?: number
    processed?: number
    error?: string
    found?: number
    fallbackReason?: string
}

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

function sortCode(pica: Pica, sort: SortMode | undefined) {
    if (sort === 'latest') return pica.Order.latest
    if (sort === 'oldest') return pica.Order.oldest
    if (sort === 'views') return pica.Order.point
    if (sort === 'likes' || sort === 'recommended') return pica.Order.loved
    return pica.Order.default
}

export class LibraryService {
    private pica: Pica | null = null
    private acceptingLocalDownloads = true
    private readonly activeLocalRuns = new Set<Promise<void>>()
    private readonly activeLocalSchedulers = new Set<DownloadScheduler>()
    private favoritesProgress: FavoritesSyncProgress = { phase: 'idle' }

    recordRecommendationEvent(input: UserEventInput) {
        return this.database.recordUserEvent(input)
    }

    constructor(
        readonly database: LibraryDatabase,
        readonly dataDir: string,
        provider?: Pica
    ) {
        this.pica = provider ?? null
        fs.mkdirSync(dataDir, { recursive: true })
    }

    async connect() {
        if (this.pica) return this.pica
        const account = process.env.PICA_ACCOUNT
        const password = process.env.PICA_PASSWORD
        if (!account || !password) {
            throw new Error(
                'PICA_ACCOUNT and PICA_PASSWORD are required for connected mode'
            )
        }
        const pica = new Pica()
        await pica.login(account, password)
        this.pica = pica
        return pica
    }

    async cover(comicId: string) {
        const comic = this.database.getComic(comicId)
        if (!comic?.coverUrl) throw new Error('Comic cover is unavailable')

        const cacheDir = path.join(this.dataDir, 'cover-cache')
        const cacheKey = createHash('sha256').update(comicId).digest('hex')
        const imageFile = path.join(cacheDir, `${cacheKey}.bin`)
        const metadataFile = path.join(cacheDir, `${cacheKey}.json`)
        try {
            const metadata = JSON.parse(
                await fs.promises.readFile(metadataFile, 'utf8')
            ) as { contentType?: unknown }
            const contentType = safeRasterContentType(metadata.contentType)
            if (!contentType) throw new Error('invalid')
            return {
                data: await fs.promises.readFile(imageFile),
                contentType,
                cached: true
            }
        } catch {
            // A partial or stale cache entry is safely replaced below.
        }

        const pica = await this.connect()
        const image = await pica.fetchImage(comic.coverUrl)
        await fs.promises.mkdir(cacheDir, { recursive: true })
        const imagePartial = `${imageFile}.part`
        const metadataPartial = `${metadataFile}.part`
        await fs.promises.writeFile(imagePartial, image.data)
        await fs.promises.writeFile(
            metadataPartial,
            JSON.stringify({ contentType: image.contentType })
        )
        await fs.promises.rename(imagePartial, imageFile)
        await fs.promises.rename(metadataPartial, metadataFile)
        return { ...image, cached: false }
    }

    async buildFinalRecommendationCycleV3(cycleId: string) {
        const pica = await this.connect()
        const catalog = this.database.listComics({ limit: 10000 })
        const favorites = catalog.filter((comic) => comic.isFavorite)
        const registry = loadTagRegistryV3(runtimeRegistryDirectory())
        const profile = buildFinalLifetimeProfileV3(catalog, { registry })
        const history: IntentCycleHistory[] = this.database
            .listV3CandidatePools(50)
            .flatMap((pool) => {
                const state = String(pool.telemetry.state ?? '')
                const completedAt = String(pool.telemetry.completedAt ?? '')
                const plan = Array.isArray(pool.telemetry.intentPlan)
                    ? (pool.telemetry.intentPlan as Array<{
                          intentId?: unknown
                      }>)
                    : []
                return completedAt &&
                    (state === 'EXHAUSTED' || state === 'SUPERSEDED')
                    ? [
                          {
                              state,
                              completedAt,
                              intentIds: plan
                                  .map((intent) =>
                                      String(intent.intentId ?? '')
                                  )
                                  .filter(Boolean)
                          } as IntentCycleHistory
                      ]
                    : []
            })
        const intents = buildRecommendationIntentsV3({
            profile,
            favorites,
            history
        })
        const routes = translateIntentPlanV3(intents)
        const store = (comics: Comic[]) => {
            const records = comics.map(comicToRecord)
            this.database.importCatalog(records, 'pica:recommendations')
            return records.flatMap((record) => {
                const stored = this.database.getComic(record.comicId)
                return stored ? [stored] : []
            })
        }
        const retrieved = await retrieveCandidatesV3({
            provider: {
                keyword: async (query, page) =>
                    store(
                        (
                            await pica.comicsPage(
                                '',
                                query,
                                pica.Order.loved,
                                page
                            )
                        ).docs
                    ),
                author: async (query, page) =>
                    store(
                        (await pica.search(query, page, pica.Order.loved)).docs
                    ),
                related: async (comicId) => store(await pica.related(comicId))
            },
            routes,
            intents,
            favoriteIds: new Set(favorites.map((comic) => comic.comicId)),
            isSafetyExcluded: (comic) =>
                comic.tags.some((tag) => {
                    const resolved = resolveTagV3(tag, registry)
                    return (
                        resolved.resolutionType === 'SAFETY' ||
                        resolved.recommendationRole === 'SAFETY_EXCLUDE'
                    )
                }),
            candidateFandomKeys: (comic) =>
                comic.tags.flatMap((tag) => {
                    const resolved = resolveTagV3(tag, registry)
                    return resolved.facet === 'FANDOM_IP' &&
                        resolved.resolutionStatus === 'RESOLVED'
                        ? [resolved.canonicalKey]
                        : []
                })
        })
        const ranked = rankCandidatesWithFrozenRankerV3({
            candidates: retrieved.candidates,
            favorites,
            graphEdges: this.database.listRecommendationEdges().map((edge) => ({
                sourceComicId: edge.sourceComicId,
                targetComicId: edge.targetComicId,
                confidence: edge.confidence,
                observationCount: edge.observationCount
            }))
        })
        return {
            profile,
            intents,
            routes,
            ranked,
            readiness: retrieved.readiness,
            telemetry: { ...retrieved.telemetry, cycleId },
            versions: {
                profileVersion: FINAL_PROFILE_VERSION,
                registryVersion: profile.registryVersion,
                rankerModelVersion: RANKER_ADAPTER_VERSION,
                candidatePoolVersion: `${INTENT_PLANNER_VERSION}/${QUERY_TRANSLATOR_VERSION}/${RETRIEVER_VERSION}`,
                allocatorVersion: BATCH_ALLOCATOR_VERSION
            }
        }
    }

    async downloadedCover(comicId: string) {
        const file = this.database.downloadedCoverPath(comicId)
        if (!file) throw new Error('Downloaded cover is unavailable')
        const contentTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.gif': 'image/gif'
        }
        const contentType = safeRasterContentType(
            contentTypes[path.extname(file).toLowerCase()]
        )
        if (!contentType) throw new Error('Downloaded cover type is unsafe')
        return { data: await fs.promises.readFile(file), contentType }
    }

    favoritesSyncProgress() {
        return { ...this.favoritesProgress }
    }

    private tasteChroniclePath() {
        return path.join(this.dataDir, 'taste-chronicle.json')
    }

    tasteChronicle(): HistoricalTasteSnapshot | null {
        try {
            return JSON.parse(
                fs.readFileSync(this.tasteChroniclePath(), 'utf8')
            ) as HistoricalTasteSnapshot
        } catch {
            return null
        }
    }

    rebuildTasteChronicle(_orderIds?: string[]) {
        // Atlas V2 intentionally ignores historical favorite order. The current
        // favorite set is the only preference authority; orderIds remains in the
        // method signature so full-sync callers stay backward compatible.
        void _orderIds
        const records = this.database.listComics({ limit: 5000 })
        const snapshot = buildHistoricalTasteSnapshot(records)
        const target = this.tasteChroniclePath()
        const nonce = `${process.pid}-${Date.now()}`
        const temporary = `${target}.${nonce}.new`
        const backup = `${target}.${nonce}.previous`
        fs.writeFileSync(temporary, JSON.stringify(snapshot), 'utf8')
        let movedPrevious = false
        try {
            if (fs.existsSync(target)) {
                fs.renameSync(target, backup)
                movedPrevious = true
            }
            fs.renameSync(temporary, target)
            if (movedPrevious) fs.unlinkSync(backup)
        } catch (error) {
            if (
                !fs.existsSync(target) &&
                movedPrevious &&
                fs.existsSync(backup)
            )
                fs.renameSync(backup, target)
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
            throw error
        }
        return snapshot
    }

    async syncFavorites(mode: FavoritesSyncMode = 'quick') {
        this.favoritesProgress = { phase: 'reading' }
        try {
            const provider = new ProviderService(
                () => this.connect(),
                this.database
            )
            const result = await provider.syncFavorites(mode, (progress) => {
                this.favoritesProgress = {
                    ...progress
                }
            })
            if (result.syncMode === 'full' && result.favoriteOrderIds?.length)
                this.rebuildTasteChronicle(result.favoriteOrderIds)
            this.favoritesProgress = {
                phase: 'complete',
                mode: result.syncMode,
                page: result.pagesChecked,
                fetched: result.imported,
                total: result.favoriteCount,
                processed: result.imported,
                found: result.addedFavorites,
                fallbackReason: result.fallbackReason
            }
            return result
        } catch (error) {
            this.favoritesProgress = {
                phase: 'failed',
                error: error instanceof Error ? error.message : String(error)
            }
            throw error
        }
    }

    async favoritesPage(page: number) {
        if (!Number.isInteger(page) || page < 1)
            throw new Error('Favorite page must be a positive integer')
        const pica = await this.connect()
        const result = await pica.favorites(page)
        const records = result.docs.map(comicToRecord)
        this.database.importFavorites(
            records,
            `pica:favorites:page:${page}`,
            false,
            true
        )
        return {
            page: result.page,
            pages: result.pages,
            total: result.total,
            comics: records
        }
    }

    async discover(query: DiscoverQuery) {
        const pica = await this.connect()
        const order = sortCode(pica, query.sort)
        let comics: Comic[]
        if (query.keyword?.trim()) {
            comics = await pica.searchAll(
                query.keyword.trim(),
                order,
                query.categories ?? []
            )
        } else {
            comics = await pica.comicsAll(
                query.categories?.[0] ?? '',
                query.tags?.[0] ?? '',
                order
            )
        }

        const tags = (query.tags ?? []).map(normalizeAuthorKey)
        const categories = (query.categories ?? []).map(normalizeAuthorKey)
        let records = comics.map(comicToRecord).filter((comic) => {
            const comicTags = comic.tags.map(normalizeAuthorKey)
            const comicCategories = comic.categories.map(normalizeAuthorKey)
            return (
                tags.every((tag) => comicTags.includes(tag)) &&
                categories.every((category) =>
                    comicCategories.includes(category)
                )
            )
        })

        if (query.sort === 'title') {
            records = records.sort((a, b) => a.title.localeCompare(b.title))
        } else if (query.sort === 'recommended') {
            records = records.sort((a, b) => {
                const score = (comic: FavoriteRecord) =>
                    Math.log10(1 + (comic.totalLikes ?? 0)) * 3 +
                    Math.log10(1 + (comic.totalViews ?? 0)) +
                    tags.filter((tag) =>
                        comic.tags.map(normalizeAuthorKey).includes(tag)
                    ).length *
                        5
                return score(b) - score(a)
            })
        }
        records = records.slice(0, Math.min(query.limit ?? 100, 1000))
        this.database.importCatalog(records, 'pica:discover')
        return records
    }

    async recommendations(
        options: {
            limit?: number
            seedCount?: number
            appSessionId?: string | null
        } = {}
    ) {
        const limit = Math.max(1, Math.min(options.limit ?? 30, 500))
        const favorites = this.database
            .listComics({ limit: 5000 })
            .filter((comic) => comic.isFavorite)
        if (favorites.length === 0) return recommendComics([], limit)

        const pica = await this.connect()
        const seedBudget = Math.max(1, Math.min(options.seedCount ?? 12, 16))
        const seeds = selectDiversifiedSeeds(favorites, seedBudget)
        const profile = recommendComics(favorites, limit).profile
        const semanticProfile = buildV3Profile(
            favorites,
            this.database.listComics({ limit: 5000 })
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
        const catalog = this.database.listComics({ limit: 5000 })
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
            const byId = new Map(catalog.map((comic) => [comic.comicId, comic]))
            const reranked = rerankV3(
                ranked,
                byId,
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
        return recommendComics(catalog, limit, candidates)
    }

    async checkUpdates(comicIds?: string[]) {
        const pica = await this.connect()
        const ids = comicIds?.length
            ? comicIds
            : this.database
                  .listComics({ limit: 5000 })
                  .filter((comic) => comic.downloadedPictures > 0)
                  .map((comic) => comic.comicId)
        const findings = []
        for (const comicId of ids) {
            findings.push(
                await checkComicUpdates(
                    this.database,
                    {
                        episodes: async (id) =>
                            (await pica.episodesAll(id)).flatMap((episode) => {
                                const episodeId = episode.id || episode._id
                                return episodeId
                                    ? [
                                          {
                                              id: episodeId,
                                              order: episode.order,
                                              title: episode.title,
                                              updatedAt: episode.updated_at
                                          }
                                      ]
                                    : []
                            })
                    },
                    comicId
                )
            )
        }
        return findings
    }

    enqueueDownload(input: CreateDownloadJob): DownloadJob {
        if (
            (input.runner ?? 'LOCAL') === 'LOCAL' &&
            !this.acceptingLocalDownloads
        )
            throw new Error('The local download engine is shutting down')
        const job = this.database.createDownloadJob(input)
        return this.database.transitionDownloadJob(job.id, 'QUEUED')
    }

    async runDownloadQueue(
        options: {
            runner?: DownloadRunner
            profile?: PerformanceProfile
            custom?: Partial<PerformanceSettings>
            onProgress?: (progress: DownloadProgress) => void
        } = {}
    ) {
        const runner = options.runner ?? 'LOCAL'
        if (runner === 'LOCAL' && !this.acceptingLocalDownloads)
            throw new Error('The local download engine is shutting down')
        const settings = resolvePerformanceSettings(
            options.profile ?? 'balanced',
            options.custom
        )
        const mediaGate = new MediaRequestGate(
            settings.globalMediaConcurrency,
            settings.requestIntervalMs
        )
        const store = {
            nextDownloadJobs: (limit: number) =>
                this.database.nextDownloadJobs(limit, runner),
            getDownloadJob: this.database.getDownloadJob.bind(this.database),
            transitionDownloadJob: this.database.transitionDownloadJob.bind(
                this.database
            )
        }
        const scheduler = new DownloadScheduler(
            store,
            async (job) => {
                const result = await this.downloadComicNow(job.comicId, {
                    episodeOrders: job.episodeOrders,
                    mediaGate,
                    onProgress: (progress) => {
                        this.database.updateDownloadProgress(job.id, {
                            progressCompleted: progress.completed,
                            progressTotal: progress.total,
                            bytes: progress.bytes,
                            chapterTitle: progress.episodeTitle
                        })
                        options.onProgress?.(progress)
                    },
                    shouldStop: () => {
                        const status = this.database.getDownloadJob(
                            job.id
                        ).status
                        return status === 'PAUSED' || status === 'CANCELLED'
                    }
                })
                this.database.updateDownloadProgress(job.id, {
                    progressCompleted: result.completed,
                    progressTotal: result.pictures,
                    bytes: result.bytes
                })
            },
            {
                jobConcurrency: settings.jobConcurrency,
                maxRetries: settings.maxRetries,
                retryBaseMs: settings.retryBaseMs
            }
        )
        const draining = scheduler.drain()
        if (runner === 'LOCAL') {
            this.activeLocalRuns.add(draining)
            this.activeLocalSchedulers.add(scheduler)
        }
        try {
            await draining
        } finally {
            if (runner === 'LOCAL') {
                this.activeLocalRuns.delete(draining)
                this.activeLocalSchedulers.delete(scheduler)
            }
        }
        return this.database.listDownloadJobs()
    }

    hasActiveLocalDownloads() {
        const active = new Set(['QUEUED', 'PREPARING', 'RUNNING', 'RETRY_WAIT'])
        return this.database
            .listDownloadJobs()
            .some((job) => job.runner === 'LOCAL' && active.has(job.status))
    }

    async quiesceLocalDownloads(timeoutMs = 30_000) {
        this.acceptingLocalDownloads = false
        for (const scheduler of this.activeLocalSchedulers) scheduler.stop()
        const pausable = new Set([
            'QUEUED',
            'PREPARING',
            'RUNNING',
            'RETRY_WAIT'
        ])
        for (const job of this.database.listDownloadJobs()) {
            if (job.runner === 'LOCAL' && pausable.has(job.status))
                this.database.transitionDownloadJob(job.id, 'PAUSED')
        }
        const settled = Promise.allSettled([...this.activeLocalRuns]).then(
            () => undefined
        )
        let timeout: NodeJS.Timeout | undefined
        try {
            await Promise.race([
                settled,
                new Promise<never>((_, reject) => {
                    timeout = setTimeout(
                        () =>
                            reject(
                                new Error(
                                    'Timed out waiting for active downloads to pause'
                                )
                            ),
                        timeoutMs
                    )
                })
            ])
        } finally {
            if (timeout) clearTimeout(timeout)
        }
    }

    private async downloadComicNow(
        comicId: string,
        options: {
            episodeOrders?: number[]
            mediaGate: MediaRequestGate
            onProgress?: (progress: DownloadProgress) => void
            shouldStop?: () => boolean
        }
    ): Promise<DownloadResult> {
        const pica = await this.connect()
        const comic = await pica.comicInfo(comicId)
        if (comic.allowDownload === false) {
            throw new Error(
                'The site reports that this comic is not downloadable'
            )
        }
        this.database.importCatalog(
            [comicToRecord(comic)],
            'pica:download:metadata'
        )
        const observedEpisodes = await pica.episodesAll(comicId)
        for (const episode of observedEpisodes) {
            const episodeId = episode.id || episode._id
            if (!episodeId)
                throw new Error('Episode response did not include an id')
            this.database.upsertEpisode({
                id: episodeId,
                comicId,
                title: episode.title,
                order: episode.order,
                updatedAt: episode.updated_at
            })
        }
        let episodes = observedEpisodes
        if (options.episodeOrders?.length) {
            const allowed = new Set(options.episodeOrders)
            episodes = episodes.filter((episode) => allowed.has(episode.order))
        }

        const result: DownloadResult = {
            comicId,
            title: comic.title.trim(),
            episodes: episodes.length,
            pictures: 0,
            downloaded: 0,
            skipped: 0,
            completed: 0,
            bytes: 0
        }
        const work: Array<{
            picture: Picture
            pictureId: string
            episodeId: string
            episodeTitle: string
            file: string
        }> = []
        for (const episode of episodes) {
            const episodeId = episode.id || episode._id
            if (!episodeId)
                throw new Error('Episode response did not include an id')
            const pictures = await pica.picturesAll(comicId, episode)
            result.pictures += pictures.length
            const stored = this.database
                .listComics({ limit: 5000 })
                .find((item) => item.comicId === comicId)
            const episodeDir = renderLibraryPath(
                path.join(this.dataDir, 'library'),
                process.env.PICA_LIBRARY_PATH_TEMPLATE ??
                    defaultLibraryTemplate,
                {
                    author:
                        stored?.canonicalAuthor ??
                        comic.author ??
                        'Unknown author',
                    title: comic.title,
                    comic_id: comicId,
                    chapter_order: String(episode.order).padStart(4, '0'),
                    chapter: episode.title || episodeId
                }
            )
            pictures.forEach((picture, index) => {
                const pictureId =
                    picture.id ||
                    String((picture as Picture & { _id?: string })._id ?? '')
                if (!pictureId)
                    throw new Error('Picture response did not include an id')
                this.database.upsertPicture({
                    id: pictureId,
                    comicId,
                    episodeId,
                    position: index + 1,
                    originalName: picture.media.originalName,
                    mediaPath: picture.media.path,
                    fileServer: picture.media.fileServer
                })
                work.push({
                    picture,
                    pictureId,
                    episodeId,
                    episodeTitle: episode.title,
                    file: path.join(
                        episodeDir,
                        safePathSegment(picture.name, `${index + 1}.jpg`)
                    )
                })
            })
        }
        const validExisting = new Map<string, string>()
        for (const item of work) {
            const previous = this.database.pictureDownloadState(item.pictureId)
            const existing =
                previous?.status === 'completed' &&
                previous.localPath &&
                fs.existsSync(previous.localPath)
                    ? previous.localPath
                    : fs.existsSync(item.file)
                      ? item.file
                      : null
            if (existing && fs.statSync(existing).size > 0) {
                validExisting.set(item.pictureId, existing)
            }
        }
        let completed = validExisting.size
        const completedPictureIds = new Set(validExisting.keys())
        let cumulativeBytes = [...validExisting.keys()].reduce(
            (total, pictureId) =>
                total +
                (this.database.pictureDownloadState(pictureId)?.byteSize ?? 0),
            0
        )
        result.skipped = completed
        result.pictures = work.length
        let attemptFailed = false
        const settled = await Promise.allSettled(
            work.map(async (item) => {
                if (options.shouldStop?.()) return
                const existing = validExisting.get(item.pictureId)
                if (existing) {
                    const data = fs.readFileSync(existing)
                    this.database.markPictureDownloaded(
                        item.pictureId,
                        existing,
                        data.byteLength,
                        createHash('sha256').update(data).digest('hex')
                    )
                    return
                }
                await options.mediaGate.run(async () => {
                    if (attemptFailed || options.shouldStop?.()) return
                    try {
                        const downloaded = await pica.downloadToFile(
                            item.picture.url,
                            item.file
                        )
                        this.database.markPictureDownloaded(
                            item.pictureId,
                            item.file,
                            downloaded.bytes,
                            downloaded.sha256
                        )
                        result.downloaded += 1
                        completedPictureIds.add(item.pictureId)
                        cumulativeBytes += downloaded.bytes
                        completed += 1
                        options.onProgress?.({
                            comicId,
                            comicTitle: comic.title,
                            episodeId: item.episodeId,
                            episodeTitle: item.episodeTitle,
                            completed,
                            total: work.length,
                            bytes: cumulativeBytes,
                            file: item.file
                        })
                    } catch (error) {
                        attemptFailed = true
                        throw error
                    }
                })
            })
        )
        result.completed = completedPictureIds.size
        result.bytes = [...completedPictureIds].reduce(
            (total, pictureId) =>
                total +
                (this.database.pictureDownloadState(pictureId)?.byteSize ?? 0),
            0
        )
        const failure = settled.find(
            (item): item is PromiseRejectedResult => item.status === 'rejected'
        )
        if (failure) throw failure.reason
        return result
    }
}

export function parseEpisodeSelection(input: string | undefined): number[] {
    if (!input || input === 'all') return []
    const values = new Set<number>()
    for (const part of input.split(',')) {
        const range = part.trim().match(/^(\d+)-(\d+)$/)
        if (range) {
            const start = Number(range[1])
            const end = Number(range[2])
            for (let value = start; value <= end; value += 1) values.add(value)
        } else {
            const value = Number(part.trim())
            if (Number.isInteger(value) && value > 0) values.add(value)
        }
    }
    return [...values].sort((a, b) => a - b)
}
