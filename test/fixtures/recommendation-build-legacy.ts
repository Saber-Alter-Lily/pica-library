// Frozen old runtime body; do not update it with the implementation under test.
// Source 2167576eea14e2c02f4d143e2097f4ca24da8856; method SHA256 de00250b8e20584b9e9005c0b322222976d3481fd95cfff55d031d4a8ca221b2.
import path from "node:path"
import type { Comic, Episode, Picture } from "../../src/types"
import { safeRasterContentType, trustedCoverUrl } from "../../src/library/cover-url"
import type {
    FavoriteRecord,
    RecommendationCandidate,
    RecallRoute,
    SortMode,
    StoredComic
} from "../../src/library/types"
import { runtimeRegistryDirectory } from "../../src/recommendation-v3/runtime-registry-path"
import {
    buildFinalLifetimeProfileV3,
    FINAL_PROFILE_VERSION
} from "../../src/recommendation-v3/final-profile"
import {
    buildRecommendationIntentsV3,
    INTENT_PLANNER_VERSION,
    type IntentCycleHistory
} from "../../src/recommendation-v3/intent-planner-v3"
import {
    translateIntentPlanV3,
    QUERY_TRANSLATOR_VERSION
} from "../../src/recommendation-v3/provider-query-translator"
import {
    retrieveCandidatesV3,
    RETRIEVER_VERSION
} from "../../src/recommendation-v3/retriever-v3"
import {
    rankCandidatesWithFrozenRankerV3,
    RANKER_ADAPTER_VERSION
} from "../../src/recommendation-v3/ranker-adapter-v3"
import { BATCH_ALLOCATOR_VERSION } from "../../src/recommendation-v3/batch-allocator-v3"
import {
    buildVisualPreferenceProfile,
    cosineSimilarity,
    metadataFeedbackAdjustment,
    selectPreferredVisualEmbeddings,
    visualAffinity,
    rerankWithVisualStyle,
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_PROFILE_VERSION,
    VISUAL_RERANK_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION,
    type VisualEmbeddingRecord,
    type VisualInfluenceStrength,
    type VisualRerankMode,
    type VisualSamplingMode
} from "../../src/recommendation-v4/visual-style"
import {
    loadTagRegistryV3,
    resolveTagV3
} from "../../src/recommendation-v3/tag-resolution-v3"
import {
    RecommendationPolicyStoreV5,
    type MobileRecommendationSyncV5
} from "../../src/recommendation-v5/policy-store"
import {
    filterCandidatesAgainstOwnedV5,
    RECOMMENDATION_V5_POLICY_STATE_KEY,
    type PortablePolicyStateV5,
    normalizePreferenceKey,
    preferenceAdjustmentV5,
    workIdentityEvidenceV5,
    workIdentitySignalsV2
} from "../../src/recommendation-v5/portable-policy"
import { applyIntentPolicyV5 } from "../../src/recommendation-v5/intent-policy"
import { buildTagDirectoryV1, normalizeTagPolicyV1, privateTagForSignalV1, projectComicTagSignalsV1, tagPoliciesEqualV1, rawTagParticipatesV1, comicTagProviderV1, providerRawTagFactsV1 } from "../../src/tags/policy"
import { inferredPrivateTagIntentsV1, restrictTagIntentsV1 } from "../../src/recommendation-v5/tag-intents"
import type { LibraryService } from '../../src/library/service'
import type { SourceRuntime } from '../../src/sources/source-policy'
import type { RuntimeResourceCoordinator } from '../../src/runtime/resource-coordinator'
import type { Pica } from '../../src/sdk'
import type { ProviderService } from '../../src/services/provider-service'
import type { LibraryDatabase } from '../../src/library/database'

export const LEGACY_BUILD_SOURCE_SHA='2167576eea14e2c02f4d143e2097f4ca24da8856'
export const LEGACY_BUILD_METHOD_SHA256='de00250b8e20584b9e9005c0b322222976d3481fd95cfff55d031d4a8ca221b2'
export interface LegacyBuildContextV3 {
 database: LibraryDatabase
 sources: SourceRuntime
 runtimeResources: RuntimeResourceCoordinator
 connect():Promise<Pica>
 providerService():ProviderService
 visualSettings():ReturnType<LibraryService['visualSettings']>
 beginRecommendationBuild(cycleId:string):void
 recommendationCheckpoint():Promise<void>
 finishRecommendationBuild():void
 recommendationProgress:Omit<ReturnType<LibraryService['recommendationBuildProgress']>, 'canPause' | 'canResume' | 'canCancel'>
 cancelledErrorConstructor:new(...args:never[])=>Error
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

export async function legacyBuildFinalCycleV3(this:LegacyBuildContextV3,cycleId:string) {
        const RecommendationBuildCancelledError = this.cancelledErrorConstructor
        const sourceRevision = this.sources.snapshot().revision
        this.beginRecommendationBuild(cycleId)
        let releaseResources: () => void = () => undefined
        try {
        const lease = await this.runtimeResources.acquire({
            ownerId: 'recommendation-v3',
            taskType: 'recommendation-v3-build',
            priority: 'background',
            resources: {
                'provider-network': 1,
                'cpu-analysis': 1,
                'sqlite-read-heavy': 1,
                'sqlite-write-heavy': 1
            }
        })
        releaseResources = () => lease.release()
        await this.recommendationCheckpoint()
        const pica = this.sources.isEnabled('pica') ? await this.connect() : null
        const providerService = this.providerService()
        const catalog = this.database.listComics({ limit: 10000 })
        const recommendationV5Store = new RecommendationPolicyStoreV5(this.database)
        const recommendationV5State = recommendationV5Store.state()
        const tasteExcludedIds = new Set(
            recommendationV5State.tasteExcludedComicIds
        )
        const readingIds = new Set(
            this.database.readingProgress().map((item) => item.comicId)
        )
        const explicitFavoriteIds = new Set(
            catalog
                .filter(
                    (comic) =>
                        comic.isFavorite &&
                        !tasteExcludedIds.has(comic.comicId)
                )
                .map((comic) => comic.comicId)
        )
        const recommendationFeedback = this.database.recommendationFeedback()
        const latestFeedback = new Map(
            recommendationFeedback.map((item) => [item.comicId, item])
        )
        const dislikedIds = new Set(
            recommendationFeedback
                .filter((item) => item.sentiment === 'dislike')
                .map((item) => item.comicId)
        )
        const likedIds = new Set(
            recommendationFeedback
                .filter((item) => item.sentiment === 'like')
                .map((item) => item.comicId)
        )
        const favorites = catalog
            .filter(
                (comic) =>
                    !tasteExcludedIds.has(comic.comicId) &&
                    !dislikedIds.has(comic.comicId) &&
                    (comic.isFavorite || likedIds.has(comic.comicId))
            )
            .map((comic) => ({ ...comic, isFavorite: true }))
        const registry = loadTagRegistryV3(runtimeRegistryDirectory())
        const profile = buildFinalLifetimeProfileV3(favorites.map(comic => projectComicTagSignalsV1(comic, recommendationV5State, false)), { registry })
        await this.recommendationCheckpoint()
        this.recommendationProgress = { state: 'running', phase: 'intents', done: 1, total: 7 }
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
        const baseIntents = buildRecommendationIntentsV3({
            profile,
            favorites,
            history
        })
        const intents = restrictTagIntentsV1(applyIntentPolicyV5(
            [...baseIntents, ...inferredPrivateTagIntentsV1(favorites, recommendationV5State)],
            recommendationV5State, 5, catalog
        ), recommendationV5State, catalog, raw => resolveTagV3(raw, registry).canonicalKey)
        await this.recommendationCheckpoint()
        this.recommendationProgress = { state: 'running', phase: 'routes', done: 2, total: 7 }
        const routes = translateIntentPlanV3(intents)
        const storePica = (comics: Comic[]) => {
            this.sources.acquire('pica')
            const records = comics.map(comicToRecord)
            this.database.importCatalog(records, 'pica:recommendations')
            return records.flatMap((record) => {
                const stored = this.database.getComic(record.comicId)
                return stored ? [stored] : []
            })
        }
        const storedRecords = (records: FavoriteRecord[]): StoredComic[] =>
            records.flatMap((record) => {
                const stored = this.database.getComic(record.comicId)
                return stored ? [stored] : []
            })
        const mergeProviderResults = (
            primary: StoredComic[],
            secondary: StoredComic[]
        ) => [
            ...new Map(
                [...primary, ...secondary].map((comic) => [comic.comicId, comic])
            ).values()
        ]
        const externalCache = new Map<string, StoredComic[]>()
        const sourceBudget: Record<'eh' | 'exh', number> = { eh: 4, exh: 2 }
        const sourceRequests: Record<'eh' | 'exh', number> = { eh: 0, exh: 0 }
        await this.recommendationCheckpoint()
        this.recommendationProgress = {
            state: 'running',
            phase: 'providers',
            done: 3,
            total: 7
        }
        const exhAvailable =
            (await providerService
                .probeExHentai()
                .catch(() => 'UNAVAILABLE')) === 'AVAILABLE'
        const externalSearch = async (
            query: string,
            kind: 'keyword' | 'author',
            source: 'eh' | 'exh'
        ): Promise<StoredComic[]> => {
            if (!this.sources.isEnabled('eh')) return []
            if (source === 'exh' && !exhAvailable) return []
            const clean = query.trim()
            if (!clean) return []
            const key = `${source}:${kind}:${clean.toLocaleLowerCase("und")}`
            const cached = externalCache.get(key)
            if (cached) return cached
            if (sourceRequests[source] >= sourceBudget[source]) return []
            sourceRequests[source] += 1
            const providerQuery = kind === 'author' ? `artist:"${clean.replaceAll("\"", "")}"` : clean
            try {
                await this.recommendationCheckpoint()
                const records = await providerService.search(
                    { keyword: providerQuery, limit: 40 },
                    [source],
                    'recommendations'
                )
                const stored = storedRecords(records)
                externalCache.set(key, stored)
                return stored
            } catch {
                externalCache.set(key, [])
                return []
            }
        }
        await this.recommendationCheckpoint()
        this.recommendationProgress = {
            state: 'running',
            phase: 'retrieve',
            done: 4,
            total: 7
        }
        const retrieved = await retrieveCandidatesV3({
            provider: {
                keyword: async (query, page, route) => {
                    await this.recommendationCheckpoint()
                    const picaResults = !pica || (route?.allowedProviders && !route.allowedProviders.includes('pica')) ? [] : storePica(
                        (
                            await pica.comicsPage(
                                '',
                                query,
                                pica.Order.loved,
                                page
                            )
                        ).docs
                    )
                    const ehAllowed = !route?.allowedProviders || route.allowedProviders.includes('eh')
                    const ehResults = page === 1 && ehAllowed ? await externalSearch(query, 'keyword', 'eh') : []
                    const exhResults = page === 1 && ehAllowed ? await externalSearch(query, 'keyword', 'exh') : []
                    return mergeProviderResults(mergeProviderResults(picaResults, ehResults), exhResults)
                },
                author: async (query, page) => {
                    await this.recommendationCheckpoint()
                    const picaResults = !pica ? [] : storePica(
                        (await pica.search(query, page, pica.Order.loved)).docs
                    )
                    const ehResults = page === 1 ? await externalSearch(query, 'author', 'eh') : []
                    const exhResults = page === 1 ? await externalSearch(query, 'author', 'exh') : []
                    return mergeProviderResults(mergeProviderResults(picaResults, ehResults), exhResults)
                },
                related: async (comicId) => {
                    await this.recommendationCheckpoint()
                    return !pica || comicId.includes(':')
                        ? []
                        : storePica(await pica.related(comicId))
                }
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
                projectComicTagSignalsV1(comic, recommendationV5State, false).tags.flatMap((tag) => {
                    const resolved = resolveTagV3(tag, registry)
                    return resolved.facet === 'FANDOM_IP' &&
                        resolved.resolutionStatus === 'RESOLVED'
                        ? [resolved.canonicalKey]
                        : []
                })
        })
        if (this.sources.snapshot().revision !== sourceRevision)
            throw new Error('Source choices changed during recommendation generation; previous recommendations were kept')
        if (retrieved.readiness === 'FAILED_INSUFFICIENT_POOL')
            throw new Error(
                'Recommendation generation could not retrieve enough candidates; previous recommendations were kept'
            )
        await this.recommendationCheckpoint()
        this.recommendationProgress = {
            state: 'running',
            phase: 'rank',
            done: 5,
            total: 7
        }
        const v5Filtered = filterCandidatesAgainstOwnedV5(
            retrieved.candidates,
            catalog,
            recommendationV5State
        )
        const ranked = rankCandidatesWithFrozenRankerV3({
            candidates: v5Filtered.rows,
            favorites,
            graphEdges: this.database.listRecommendationEdges().map((edge) => ({
                sourceComicId: edge.sourceComicId,
                targetComicId: edge.targetComicId,
                confidence: edge.confidence,
                observationCount: edge.observationCount
            }))
        })
        const tasteCatalogById = new Map(catalog.map(comic => [comic.comicId, projectComicTagSignalsV1(comic, recommendationV5State)]))
        const feedbackAdjusted = ranked
            .filter((candidate) => !latestFeedback.has(candidate.comicId))
            .map((candidate, index) => {
                const feedbackAdjustment = metadataFeedbackAdjustment({
                    candidate: projectComicTagSignalsV1(candidate.comic, recommendationV5State),
                    feedback: recommendationFeedback,
                    catalogById: tasteCatalogById
                })
                const baselinePercentile =
                    ranked.length <= 1 ? 1 : 1 - index / (ranked.length - 1)
                return {
                    ...candidate,
                    feedbackAdjustment,
                    __feedbackRankScore:
                        baselinePercentile + feedbackAdjustment
                }
            })
            .sort(
                (a, b) =>
                    b.__feedbackRankScore - a.__feedbackRankScore ||
                    a.rawRank - b.rawRank ||
                    a.comicId.localeCompare(b.comicId)
            )
            .map(({ __feedbackRankScore: _score, ...candidate }) => candidate)
        const policyAdjusted = feedbackAdjusted
            .map((candidate, index) => {
                const policy = preferenceAdjustmentV5(
                    candidate.comic,
                    recommendationV5State
                )
                const baselinePercentile =
                    feedbackAdjusted.length <= 1
                        ? 1
                        : 1 - index / (feedbackAdjusted.length - 1)
                return {
                    ...candidate,
                    v5Adjustment: policy.adjustment,
                    v5Reasons: policy.reasons,
                    __v5RankScore: baselinePercentile + policy.adjustment
                }
            })
            .filter((candidate) => !preferenceAdjustmentV5(candidate.comic, recommendationV5State).blocked)
            .sort(
                (a, b) =>
                    b.__v5RankScore - a.__v5RankScore ||
                    a.rawRank - b.rawRank ||
                    a.comicId.localeCompare(b.comicId)
            )
            .map(({ __v5RankScore: _score, ...candidate }) => candidate)
        await this.recommendationCheckpoint()
        this.recommendationProgress = {
            state: 'running',
            phase: 'visual',
            done: 6,
            total: 7
        }
        const visualSettings = this.visualSettings()
        const visualEmbeddings = this.database.listVisualEmbeddings()
        const visualProfile = buildVisualPreferenceProfile({
            embeddings: visualEmbeddings,
            favoriteComicIds: explicitFavoriteIds,
            feedback: recommendationFeedback,
            catalogSize: Math.max(1, explicitFavoriteIds.size + likedIds.size)
        })
        const reranked = rerankWithVisualStyle({
            ranked: policyAdjusted,
            embeddings: visualEmbeddings,
            profile: visualProfile,
            mode: visualSettings.enabled ? visualSettings.rerankMode : 'OFF',
            strength: visualSettings.strength
        })
        if (this.sources.snapshot().revision !== sourceRevision)
            throw new Error('Source choices changed during recommendation generation; previous recommendations were kept')
        this.recommendationProgress = {
            state: 'complete',
            phase: 'complete',
            done: 7,
            total: 7
        }
        return {
            profile,
            intents,
            routes,
            ranked: reranked,
            readiness: retrieved.readiness,
            telemetry: {
                ...retrieved.telemetry,
                cycleId,
                recommendationV5: {
                    policyVersion: recommendationV5State.policyVersion,
                    revision: recommendationV5State.revision,
                    controlCount: recommendationV5State.controls.length,
                    hardSuppressCount:
                        recommendationV5State.hardSuppressComicIds.length,
                    tasteExcludedCount:
                        recommendationV5State.tasteExcludedComicIds.length,
                    portableBaseline: {
                        tagPolicy: normalizeTagPolicyV1(recommendationV5State.tagPolicy),
                        schemaVersion: recommendationV5State.schemaVersion,
                        policyVersion: recommendationV5State.policyVersion,
                        revision: recommendationV5State.revision,
                        controls: recommendationV5State.controls,
                        sessionIntent: recommendationV5State.sessionIntent,
                        hardSuppressComicIds:
                            recommendationV5State.hardSuppressComicIds
                    },
                    ownedOrDuplicateRemoved:
                        v5Filtered.telemetry.exactOrOwnedRemoved +
                        v5Filtered.telemetry.workDuplicateRemoved,
                    workDuplicateRemoved:
                        v5Filtered.telemetry.workDuplicateRemoved,
                    hardBlockedRemoved:
                        v5Filtered.telemetry.hardBlockedRemoved,
                    policyAdjustedCount: policyAdjusted.filter(
                        (item) =>
                            Number(
                                (item as { v5Adjustment?: number })
                                    .v5Adjustment ?? 0
                            ) !== 0
                    ).length
                },
                recommendationV4: {
                    feedbackCount: recommendationFeedback.length,
                    likedCount: likedIds.size,
                    dislikedCount: dislikedIds.size,
                    exactFeedbackItemsSuppressed:
                        ranked.length - feedbackAdjusted.length,
                    visual: {
                        settings: visualSettings,
                        profileAvailable: Boolean(visualProfile),
                        profileCoverage: visualProfile?.coverage ?? 0,
                        positivePrototypeCount:
                            visualProfile?.positivePrototypes.length ?? 0,
                        negativePrototypeCount:
                            visualProfile?.negativePrototypes.length ?? 0,
                        candidateEmbeddingCount: reranked.filter((item) =>
                            Boolean(
                                item.visual &&
                                    typeof item.visual === 'object' &&
                                    (item.visual as { available?: boolean })
                                        .available
                            )
                        ).length,
                        shadowMoveCount: reranked.filter((item) => {
                            const visual = item.visual as
                                | { shadowRank?: number | null }
                                | undefined
                            return Boolean(
                                visual?.shadowRank &&
                                    visual.shadowRank !== item.rawRank
                            )
                        }).length
                    }
                },
                providerSources: {
                    ehRequests: sourceRequests.eh,
                    exhRequests: sourceRequests.exh,
                    exhAvailable,
                    ehCandidates: retrieved.candidates.filter(
                        (item) =>
                            item.comic.providerId === 'eh' ||
                            item.comic.comicId.startsWith('eh:')
                    ).length,
                    preferenceSignals: {
                        explicitFavorites: explicitFavoriteIds.size,
                        collectionSeeds: favorites.length,
                        readingSeeds: readingIds.size,
                        downloadedSeeds: favorites.filter((comic) => comic.downloadedPictures > 0).length
                    },
                    picaCandidates: retrieved.candidates.filter(
                        (item) =>
                            item.comic.providerId !== 'eh' &&
                            !item.comic.comicId.startsWith('eh:')
                    ).length
                }
            },
            versions: {
                profileVersion: FINAL_PROFILE_VERSION,
                registryVersion: profile.registryVersion,
                rankerModelVersion: `${RANKER_ADAPTER_VERSION}/${VISUAL_RERANK_VERSION}`,
                candidatePoolVersion: `${INTENT_PLANNER_VERSION}/${QUERY_TRANSLATOR_VERSION}/${RETRIEVER_VERSION}`,
                allocatorVersion: BATCH_ALLOCATOR_VERSION
            }
        }
        } catch (error) {
            const cancelled = error instanceof RecommendationBuildCancelledError
            this.recommendationProgress = {
                state: cancelled ? 'cancelled' : 'failed',
                phase: this.recommendationProgress.phase,
                done: this.recommendationProgress.done,
                total: 7,
                error: cancelled
                    ? undefined
                    : error instanceof Error
                      ? error.message
                      : String(error)
            }
            throw error
        } finally {
            releaseResources()
            this.finishRecommendationBuild()
        }
    }
