import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import pLimit from 'p-limit'
import { Pica } from '../sdk'
import {
    EhProvider,
    parseEhTag,
    type EhSession
} from '../providers/eh-provider'
import {
    providerComicToRecord,
    type EhBrowseMode,
    type EhSurface,
    type OnlineSource,
    type ProviderComic,
    type SearchRequest
} from '../providers/types'
import type { Comic, Episode, Picture } from '../types'
import { LibraryDatabase } from './database'
import { normalizeAuthorKey } from './author'
import { safeRasterContentType, trustedCoverUrl } from './cover-url'
import type {
    FavoriteRecord,
    RecommendationCandidate,
    RecallRoute,
    SortMode,
    StoredComic
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
} from '../recommendation-v4/visual-style'
import {
    loadTagRegistryV3,
    resolveTagV3
} from '../recommendation-v3/tag-resolution-v3'
import {
    RecommendationPolicyStoreV5,
    type MobileRecommendationSyncV5
} from '../recommendation-v5/policy-store'
import { buildBehaviorEvidenceLedgerV5 } from '../recommendation-v5/behavior-evidence'
import { buildCandidateChannelPlanV5 } from '../recommendation-v5/candidate-channels'
import { applyCandidateHygieneV5 } from '../recommendation-v5/candidate-hygiene'
import {
    compileCandidateProviderRoutesV5,
    deriveObservedEhCanonicalBindingsV5
} from '../recommendation-v5/provider-query-compiler'
import { buildPreferenceTimescalesV5 } from '../recommendation-v5/preference-timescales'
import { executeShadowRetrievalV5 } from '../recommendation-v5/shadow-retrieval'
import { rankShadowCandidatesV5 } from '../recommendation-v5/relevance-ranker'
import {
    diversifyShadowBatchV5,
    type CandidateSemanticDiversityV5
} from '../recommendation-v5/batch-diversity'
import {
    shadowPipelineModelVersionV5,
    shadowPipelineVersionsV5
} from '../recommendation-v5/shadow-pipeline'
import { evaluateP3PromotionGateV5 } from '../recommendation-v5/promotion-gate'
import { buildVisualRepresentationQcV5 } from '../recommendation-v5/visual-representation-qc'
import { buildVisualAuthorAtlasV5 } from '../recommendation-v5/visual-author-atlas'
import { buildVisualStyleFamiliesV5 } from '../recommendation-v5/visual-style-families'
import { buildVisualCandidateCoverageV5 } from '../recommendation-v5/visual-candidate-coverage'
import { evaluateVisualActivationGateV5 } from '../recommendation-v5/visual-activation-gate'
import { auditShadowCorrectnessV5 } from '../recommendation-v5/correctness-audit'
import { buildRetrospectiveBenchmarkV5 } from '../recommendation-v5/retrospective-benchmark'
import { evaluateSteerabilityV5 } from '../recommendation-v5/steerability-audit'
import { buildEvaluationFrameworkV5 } from '../recommendation-v5/evaluation-framework'
import { compareRetrospectiveBenchmarksV5 } from '../recommendation-v5/benchmark-comparison'
import {
    evaluateAdvancedLearningGateV5,
    type AdvancedLearningDirectionV5
} from '../recommendation-v5/advanced-learning-gate'
import {
    filterCandidatesAgainstOwnedV5,
    normalizePreferenceKey,
    preferenceAdjustmentV5
} from '../recommendation-v5/portable-policy'
import { applyIntentPolicyV5 } from '../recommendation-v5/intent-policy'
import {
    buildWorkIdentityAuditV5,
    buildWorkIdentityMaterializationPlanV5,
    buildWorkIdentityMaterializationPreviewV5,
    WORK_IDENTITY_RESOLVER_VERSION
} from '../recommendation-v5/work-identity-foundation'

export const WORK_IDENTITY_MATERIALIZATION_PREPARE_CONFIRMATION =
    'PREPARE_CANONICAL_WORK_BINDING'
export const RECOMMENDATION_V5_SHADOW_RETRIEVAL_CONFIRMATION =
    'RUN_RECOMMENDATION_V5_SHADOW_RETRIEVAL'

export interface DiscoverQuery {
    keyword?: string
    tags?: string[]
    categories?: string[]
    sort?: SortMode
    limit?: number
    providers?: OnlineSource[]
    ehMode?: EhBrowseMode
    ehToplist?: string
    ehLanguage?: string
    ehExcludeTags?: string[]
    ehMinRating?: number
    ehPageFrom?: number
    ehPageTo?: number
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
    private readonly ehProvider: EhProvider
    private acceptingLocalDownloads = true
    private readonly activeLocalRuns = new Set<Promise<void>>()
    private readonly activeLocalSchedulers = new Set<DownloadScheduler>()
    private favoritesProgress: FavoritesSyncProgress = { phase: 'idle' }
    private recommendationProgress: {
        state: 'idle' | 'running' | 'complete' | 'failed'
        phase: string
        done: number
        total: number
        error?: string
    } = {
        state: 'idle',
        phase: 'idle',
        done: 0,
        total: 7
    }

    recommendationBuildProgress() { return { ...this.recommendationProgress } }

    private recoverInterruptedRecommendationBuild() {
        const key = 'recommendation.v3.activeCycle.v1'
        const current = this.database.getAppState<Record<string, unknown>>(key)
        if (
            Number(current?.schemaVersion) !== 1 ||
            !String(current?.buildingCycleId ?? '').trim()
        )
            return false
        this.database.setAppState(key, {
            ...current,
            buildingCycleId: null,
            buildingRequestId: null
        })
        this.recommendationProgress = {
            state: 'failed',
            phase: 'recovered',
            done: 0,
            total: 7,
            error: 'Previous recommendation generation was interrupted and has been reset'
        }
        return true
    }

    recordRecommendationEvent(input: UserEventInput) {
        return this.database.recordUserEvent(input)
    }

    recommendationV5Snapshot() {
        const snapshot = new RecommendationPolicyStoreV5(
            this.database
        ).snapshot()
        try {
            const registry = loadTagRegistryV3(runtimeRegistryDirectory())
            const inferred = snapshot.inferred.flatMap((signal) => {
                if (signal.targetType !== 'TAG')
                    return [
                        {
                            ...signal,
                            facet:
                                signal.targetType === 'AUTHOR'
                                    ? 'CREATOR_ENTITY'
                                    : signal.targetType === 'CATEGORY'
                                      ? 'CATEGORY'
                                      : signal.facet || 'OTHER'
                        }
                    ]
                const resolved = resolveTagV3(
                    signal.label || signal.key,
                    registry
                )
                if (
                    resolved.resolutionType === 'SAFETY' ||
                    ['SAFETY_EXCLUDE', 'IGNORE', 'EXCLUDE'].includes(
                        resolved.recommendationRole
                    )
                )
                    return []
                return [
                    {
                        ...signal,
                        label:
                            resolved.resolutionStatus === 'RESOLVED'
                                ? resolved.canonicalLabel
                                : signal.label,
                        facet:
                            resolved.resolutionStatus === 'RESOLVED'
                                ? resolved.facet
                                : 'OTHER'
                    }
                ]
            })
            return { ...snapshot, inferred }
        } catch {
            // V5 controls remain usable when a packaged registry asset is
            // unavailable; the portable snapshot has a raw-tag fallback.
            return snapshot
        }
    }

    recommendationServingCompositionV3() {
        const state = this.database.getAppState<{
            schemaVersion?: number
            activeCycleId?: string | null
            activeBatchIndex?: number
        }>('recommendation.v3.activeCycle.v1')
        const cycleId = String(state?.activeCycleId ?? '').trim()
        if (!cycleId)
            return {
                available: false,
                source: 'final-v3-serving',
                cycleId: null,
                batchId: null,
                batchIndex: null,
                itemCount: 0,
                primaryFamilies: {},
                reasonCodes: {}
            }
        const pool = this.database.latestV3CandidatePool(cycleId)
        if (!pool)
            return {
                available: false,
                source: 'final-v3-serving',
                cycleId,
                batchId: null,
                batchIndex: null,
                itemCount: 0,
                primaryFamilies: {},
                reasonCodes: {}
            }
        const batches = this.database.listV3Batches(pool.id)
        const requestedIndex = Number(state?.activeBatchIndex ?? -1)
        const batch =
            (requestedIndex >= 0
                ? batches.find((item) => item.batchIndex === requestedIndex)
                : undefined) ?? batches.at(-1)
        if (!batch)
            return {
                available: false,
                source: 'final-v3-serving',
                cycleId,
                poolId: pool.id,
                batchId: null,
                batchIndex: null,
                itemCount: 0,
                primaryFamilies: {},
                reasonCodes: {}
            }
        const rawItems = Array.isArray(batch.evidence?.items)
            ? (batch.evidence.items as Array<Record<string, unknown>>)
            : []
        const catalog = this.database.listComics({ limit: 10000 })
        const policy = new RecommendationPolicyStoreV5(this.database).state()
        const servingRows = filterCandidatesAgainstOwnedV5(
            this.database.recommendationRecords(batch.itemIds),
            catalog,
            policy
        ).rows
        const servingIds = new Set(
            servingRows.map((row) => String(row.comic.comicId))
        )
        const servedItems = rawItems.filter((item) =>
            servingIds.has(String(item.comicId ?? ''))
        )
        const familyCounts: Record<string, number> = {}
        const reasonCounts: Record<string, number> = {}
        const intentCounts: Record<string, number> = {}
        for (const item of servedItems) {
            const family = String(item.primaryFamily ?? 'UNATTRIBUTED')
            familyCounts[family] = (familyCounts[family] ?? 0) + 1
            const intentId = String(item.primaryIntentId ?? '').trim()
            if (intentId)
                intentCounts[intentId] = (intentCounts[intentId] ?? 0) + 1
            const reasons = Array.isArray(item.reasonCodes)
                ? item.reasonCodes.map(String)
                : []
            for (const reason of reasons)
                reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1
        }
        const rawIntentPlan = Array.isArray(
            (pool.telemetry as { intentPlan?: unknown[] })?.intentPlan
        )
            ? ((pool.telemetry as { intentPlan?: unknown[] }).intentPlan ?? [])
            : []
        const intentPlan = new Map(
            rawIntentPlan.flatMap((value) => {
                if (!value || typeof value !== 'object') return []
                const row = value as Record<string, unknown>
                const intentId = String(row.intentId ?? '').trim()
                if (!intentId) return []
                const anchors = Array.isArray(row.anchors)
                    ? row.anchors.flatMap((anchor) => {
                          if (!anchor || typeof anchor !== 'object') return []
                          const item = anchor as Record<string, unknown>
                          const label = String(
                              item.canonicalLabel ??
                                  item.providerQueryLabel ??
                                  item.canonicalKey ??
                                  ''
                          ).trim()
                          return label ? [label] : []
                      })
                    : []
                const explanation =
                    row.explanation &&
                    typeof row.explanation === 'object'
                        ? (row.explanation as Record<string, unknown>)
                        : {}
                return [
                    [
                        intentId,
                        {
                            type: String(row.type ?? 'UNATTRIBUTED'),
                            anchors,
                            shortReason: String(
                                explanation.shortReason ?? ''
                            ).trim()
                        }
                    ] as const
                ]
            })
        )
        const primaryIntents = Object.entries(intentCounts)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([intentId, count]) => ({
                intentId,
                count,
                type: intentPlan.get(intentId)?.type ?? 'UNATTRIBUTED',
                anchors: intentPlan.get(intentId)?.anchors ?? [],
                shortReason: intentPlan.get(intentId)?.shortReason ?? ''
            }))
        return {
            available: true,
            source: 'final-v3-serving',
            cycleId,
            poolId: pool.id,
            poolState: String(pool.telemetry?.state ?? ''),
            batchId: batch.id,
            batchIndex: batch.batchIndex,
            contextId: batch.contextId,
            generatedAt: batch.generatedAt,
            itemCount: servingIds.size,
            allocatedItemCount: batch.itemIds.length,
            servingFilteredCount: batch.itemIds.length - servingIds.size,
            primaryFamilies: familyCounts,
            primaryIntents,
            reasonCodes: reasonCounts,
            items: servedItems.map((item) => ({
                comicId: String(item.comicId ?? ''),
                rawRank: Number(item.rawRank ?? 0),
                rawRankerScore: Number(item.rawRankerScore ?? 0),
                primaryIntentId: String(item.primaryIntentId ?? ''),
                primaryFamily: String(item.primaryFamily ?? 'UNATTRIBUTED'),
                relatedOnly: Boolean(item.relatedOnly),
                recentlyDisplayed: Boolean(item.recentlyDisplayed),
                reasonCodes: Array.isArray(item.reasonCodes)
                    ? item.reasonCodes.map(String)
                    : []
            }))
        }
    }

    async runRecommendationV5ShadowRetrieval(
        input: Record<string, unknown>
    ) {
        if (
            String(input.confirmation ?? '').trim() !==
            RECOMMENDATION_V5_SHADOW_RETRIEVAL_CONFIRMATION
        )
            throw new Error(
                'Explicit shadow retrieval confirmation is required'
            )
        const appSessionId = input.appSessionId
            ? String(input.appSessionId)
            : null
        const eventLimit = Math.max(
            1,
            Math.min(5000, Math.floor(Number(input.limit) || 5000))
        )
        const maxCandidates = Math.max(
            12,
            Math.min(
                1000,
                Math.floor(Number(input.maxCandidates) || 500)
            )
        )
        const plan = this.recommendationV5ProviderRoutes(
            appSessionId,
            eventLimit
        )
        const catalog = this.database.listComics({ limit: 10000 })
        const provider = this.providerService()
        const result = await executeShadowRetrievalV5(
            plan,
            {
                search: (surface, request) =>
                    provider.search(
                        request,
                        [surface],
                        'recommendations',
                        { persist: false }
                    ),
                relatedPica: (comicId) =>
                    provider.relatedPica(
                        comicId,
                        'recommendations',
                        { persist: false }
                    )
            },
            catalog,
            { maxCandidates }
        )
        const state = new RecommendationPolicyStoreV5(
            this.database
        ).state()
        const hygiene = applyCandidateHygieneV5(
            result.candidates,
            catalog,
            state
        )
        const timescales =
            this.recommendationV5PreferenceTimescales(
                appSessionId,
                eventLimit
            )
        const ranking = rankShadowCandidatesV5(
            hygiene.candidates,
            timescales,
            state,
            catalog
        )
        const semanticDiversity: Record<
            string,
            CandidateSemanticDiversityV5
        > = {}
        let registry:
            | ReturnType<typeof loadTagRegistryV3>
            | null = null
        try {
            registry = loadTagRegistryV3(
                runtimeRegistryDirectory()
            )
        } catch {
            registry = null
        }
        for (const row of ranking.rows) {
            const fandomKeys = new Set<string>()
            const tagKeys = new Set<string>()
            if (registry)
                for (const rawTag of row.comic.tags) {
                    const resolved = resolveTagV3(
                        rawTag,
                        registry
                    )
                    if (
                        resolved.resolutionStatus !== 'RESOLVED' ||
                        resolved.resolutionType === 'SAFETY' ||
                        !resolved.recommendationEligible
                    )
                        continue
                    if (resolved.facet === 'FANDOM_IP')
                        fandomKeys.add(resolved.canonicalKey)
                    else if (
                        resolved.facet &&
                        resolved.facet !== 'CREATOR_ENTITY'
                    )
                        tagKeys.add(
                            `${resolved.facet}:${resolved.canonicalKey}`
                        )
                }
            const rawEhTags = Array.isArray(
                row.comic.providerMetadata?.rawTags
            )
                ? row.comic.providerMetadata.rawTags.map(String)
                : []
            for (const rawTag of rawEhTags) {
                const parsed = parseEhTag(rawTag)
                const value = normalizePreferenceKey(parsed.value)
                if (!value || !parsed.namespace) continue
                if (parsed.facet === 'FANDOM_IP')
                    fandomKeys.add(value)
                else if (
                    parsed.facet &&
                    ![
                        'CREATOR_ENTITY',
                        'LANGUAGE',
                        'FANDOM_IP'
                    ].includes(parsed.facet)
                )
                    tagKeys.add(
                        `${parsed.facet}:${value}`
                    )
            }
            semanticDiversity[
                normalizePreferenceKey(row.comic.comicId)
            ] = {
                fandomKeys: [...fandomKeys].sort(),
                tagKeys: [...tagKeys].sort()
            }
        }
        const diversity = diversifyShadowBatchV5(
            ranking.rows,
            semanticDiversity,
            Math.max(
                1,
                Math.min(
                    50,
                    Math.floor(Number(input.batchSize) || 12)
                )
            )
        )
        const correctnessAudit = auditShadowCorrectnessV5({
            candidates: hygiene.candidates,
            diversified: diversity.rows,
            catalog,
            state
        })
        const visualCoverage = buildVisualCandidateCoverageV5({
            ranked: ranking.rows,
            diversified: diversity.rows,
            embeddings: this.database.listVisualEmbeddings(),
            catalog,
            analysisBudget: (() => {
                const requested = Number(input.visualAnalysisBudget)
                return Math.max(
                    0,
                    Math.min(
                        100,
                        Number.isFinite(requested)
                            ? Math.floor(requested)
                            : 24
                    )
                )
            })()
        })
        const cycleId = `v5-shadow:${randomUUID()}`
        const modelVersion = shadowPipelineModelVersionV5()
        const audit = this.database.saveV3CandidatePool({
            appSessionId,
            cycleId,
            candidateIds: ranking.rows.map(
                (item) => item.comic.comicId
            ),
            modelVersion,
            telemetry: {
                mode: result.mode,
                pipelineVersions: shadowPipelineVersionsV5(),
                servingImpact: result.servingImpact,
                persistCandidates: result.persistCandidates,
                providerFailureIsolation:
                    result.providerFailureIsolation,
                readiness: result.readiness,
                rawCandidateCount: result.candidateCount,
                hygienicCandidateCount: hygiene.outputCandidateCount,
                rankedCandidateCount: ranking.candidateCount,
                providerRouteSummary: plan.summary,
                sessionMode: plan.sourceSessionMode,
                sessionModePolicy:
                    plan.sourceSessionModePolicy,
                providerBudgets: plan.sourceProviderBudgets,
                retrievalTelemetry: result.telemetry,
                hygieneTelemetry: hygiene.telemetry,
                rankingTelemetry: ranking.telemetry,
                diversityTelemetry: diversity.telemetry,
                correctnessAudit,
                visualCandidateCoverage: visualCoverage,
                diversifiedBatch: diversity.rows.map(
                    (row) => ({
                        comicId: row.comic.comicId,
                        batchRank: row.batchRank,
                        relevanceRank: row.relevanceRank,
                        score: row.score,
                        allocationPass: row.allocationPass,
                        diversityPenalty: row.diversityPenalty,
                        providerBalanceBonus:
                            row.providerBalanceBonus,
                        diversityReasons:
                            row.diversityReasons
                    })
                ),
                rankedEvidence: ranking.rows
                    .slice(0, 100)
                    .map((row) => ({
                        comicId: row.comic.comicId,
                        rank: row.rank,
                        score: row.score,
                        reasons: row.reasons,
                        features: row.features
                    }))
            }
        })
        return {
            ...result,
            candidates: hygiene.candidates,
            candidateCount: hygiene.outputCandidateCount,
            rawCandidateCount: result.candidateCount,
            hygiene,
            ranking,
            diversity,
            correctnessAudit,
            visualCoverage,
            executionAuthority: 'MANUAL_DESKTOP_ONLY' as const,
            trigger: 'EXPLICIT_CONFIRMATION' as const,
            providerRouteSummary: plan.summary,
            audit: {
                poolId: audit.id,
                cycleId,
                modelVersion,
                generatedAt: audit.generatedAt,
                candidateIdCount: audit.candidateIds.length
            }
        }
    }

    recommendationV5AdvancedLearningGate(
        directionInput?: string | null,
        baselineVersion?: string | null,
        candidateVersion?: string | null,
        limit = 1000,
        horizonDays = 30
    ) {
        const directionText = String(directionInput ?? '')
            .trim()
            .toUpperCase()
        const direction = [
            'LEARNING_TO_RANK',
            'CONTEXTUAL_BANDIT',
            'ACTIVE_LEARNING'
        ].includes(directionText)
            ? (directionText as AdvancedLearningDirectionV5)
            : null
        const evaluation = this.recommendationV5EvaluationSummary(
            Math.max(1, Math.min(1000, Math.floor(limit))),
            horizonDays,
            3,
            30
        )
        const baseline = String(baselineVersion ?? '').trim()
        const candidate = String(candidateVersion ?? '').trim()
        const comparison =
            baseline && candidate
                ? this.recommendationV5BenchmarkComparison(
                      baseline,
                      candidate,
                      limit,
                      horizonDays
                  )
                : null
        return {
            ...evaluateAdvancedLearningGateV5({
                evaluation,
                comparison,
                direction
            }),
            evidence: {
                evaluationStatus: evaluation.status,
                evaluationFrameworkVersion:
                    evaluation.frameworkVersion,
                comparisonStatus:
                    comparison?.status ?? null,
                comparisonVersion:
                    comparison?.comparisonVersion ?? null,
                baselineVersion: baseline || null,
                candidateVersion: candidate || null
            }
        }
    }

    recommendationV5BenchmarkVersions(limit = 1000) {
        const bounded = Math.max(
            1,
            Math.min(5000, Math.floor(limit))
        )
        const currentModelVersion = shadowPipelineModelVersionV5()
        const pools = this.database.listCandidatePoolsByModelVersionPrefix(
            'v5-shadow/',
            bounded
        )
        const grouped = new Map<
            string,
            {
                runCount: number
                firstGeneratedAt: string
                lastGeneratedAt: string
            }
        >()
        for (const pool of pools) {
            const version = String(pool.modelVersion || '').trim()
            if (!version) continue
            const current = grouped.get(version)
            if (!current) {
                grouped.set(version, {
                    runCount: 1,
                    firstGeneratedAt: pool.generatedAt,
                    lastGeneratedAt: pool.generatedAt
                })
                continue
            }
            current.runCount += 1
            if (pool.generatedAt < current.firstGeneratedAt)
                current.firstGeneratedAt = pool.generatedAt
            if (pool.generatedAt > current.lastGeneratedAt)
                current.lastGeneratedAt = pool.generatedAt
        }
        return {
            mode: 'READ_ONLY' as const,
            currentModelVersion,
            versions: [...grouped.entries()]
                .map(([modelVersion, value]) => ({
                    modelVersion,
                    current: modelVersion === currentModelVersion,
                    ...value
                }))
                .sort(
                    (a, b) =>
                        Number(b.current) - Number(a.current) ||
                        b.lastGeneratedAt.localeCompare(
                            a.lastGeneratedAt
                        ) ||
                        a.modelVersion.localeCompare(b.modelVersion)
                )
        }
    }

    recommendationV5BenchmarkComparison(
        baselineVersion: string,
        candidateVersion: string,
        limit = 1000,
        horizonDays = 30
    ) {
        const baseline = String(baselineVersion ?? '').trim()
        const candidate = String(candidateVersion ?? '').trim()
        if (!baseline || !candidate)
            throw new Error(
                'Both baselineVersion and candidateVersion are required'
            )
        if (
            baseline.length > 240 ||
            candidate.length > 240 ||
            !baseline.startsWith('v5-shadow/') ||
            !candidate.startsWith('v5-shadow/')
        )
            throw new Error('Invalid shadow model version')

        const bounded = Math.max(
            1,
            Math.min(5000, Math.floor(limit))
        )
        const pools = this.database
            .listCandidatePoolsByModelVersionPrefix(
                'v5-shadow/',
                bounded
            )
            .map((pool) => ({
                modelVersion: pool.modelVersion,
                generatedAt: pool.generatedAt,
                candidateIds: pool.candidateIds,
                telemetry: pool.telemetry
            }))
        const events = this.database.listUserEvents({
            limit: 5000
        })
        const catalogSize = this.database.listComics({
            limit: 10000
        }).length
        const build = (modelVersion: string) =>
            buildRetrospectiveBenchmarkV5({
                runs: pools,
                events,
                currentModelVersion: modelVersion,
                catalogSize,
                horizonDays
            })
        return compareRetrospectiveBenchmarksV5({
            baseline: build(baseline),
            candidate: build(candidate)
        })
    }

    recommendationV5EvaluationSummary(
        limit = 200,
        horizonDays = 30,
        steerabilityStep = 3,
        steerabilityTargetLimit = 30
    ) {
        return buildEvaluationFrameworkV5({
            p3Gate: this.recommendationV5P3PromotionGate(
                limit
            ),
            visualGate:
                this.recommendationV5VisualActivationGate(
                    limit
                ),
            retrospective:
                this.recommendationV5RetrospectiveBenchmark(
                    limit,
                    horizonDays
                ),
            steerability:
                this.recommendationV5SteerabilityAudit(
                    steerabilityStep,
                    steerabilityTargetLimit
                )
        })
    }

    recommendationV5SteerabilityAudit(
        requestedStep = 3,
        targetLimit = 30
    ) {
        const store = new RecommendationPolicyStoreV5(
            this.database
        )
        const state = store.state()
        const snapshot = this.recommendationV5Snapshot()
        const targets = snapshot.inferred
            .filter(
                (signal) =>
                    signal.targetType === 'TAG' ||
                    signal.targetType === 'AUTHOR' ||
                    signal.targetType === 'CATEGORY' ||
                    signal.targetType === 'FANDOM'
            )
            .slice(
                0,
                Math.max(
                    1,
                    Math.min(100, Math.floor(targetLimit))
                )
            )
            .map((signal) => ({
                targetType: signal.targetType as
                    | 'TAG'
                    | 'AUTHOR'
                    | 'CATEGORY'
                    | 'FANDOM',
                key: signal.key,
                label: signal.label,
                baselineLevel: signal.baselineLevel
            }))
        return evaluateSteerabilityV5({
            catalog: this.database.listComics({
                limit: 10000
            }),
            state,
            targets,
            requestedStep
        })
    }

    recommendationV5RetrospectiveBenchmark(
        limit = 200,
        horizonDays = 30
    ) {
        const modelVersion = shadowPipelineModelVersionV5()
        const runs = this.database
            .listCandidatePoolsByModelVersionPrefix(
                modelVersion,
                Math.max(1, Math.min(1000, Math.floor(limit)))
            )
            .filter((pool) => pool.modelVersion === modelVersion)
            .map((pool) => ({
                modelVersion: pool.modelVersion,
                generatedAt: pool.generatedAt,
                candidateIds: pool.candidateIds,
                telemetry: pool.telemetry
            }))
        const events = this.database.listUserEvents({
            limit: 5000
        })
        const catalogSize = this.database.listComics({
            limit: 10000
        }).length
        return buildRetrospectiveBenchmarkV5({
            runs,
            events,
            currentModelVersion: modelVersion,
            catalogSize,
            horizonDays
        })
    }

    recommendationV5VisualActivationGate(limit = 100) {
        const modelVersion = shadowPipelineModelVersionV5()
        const runs = this.database
            .listCandidatePoolsByModelVersionPrefix(
                modelVersion,
                Math.max(1, Math.min(500, Math.floor(limit)))
            )
            .filter((pool) => pool.modelVersion === modelVersion)
            .map((pool) => ({
                modelVersion: pool.modelVersion,
                generatedAt: pool.generatedAt,
                telemetry: pool.telemetry
            }))
        const representationQc =
            this.visualRepresentationQc()
        const authorAtlas = this.visualAuthorAtlas()
        const styleFamilies = buildVisualStyleFamiliesV5({
            atlas: authorAtlas
        })
        return {
            ...evaluateVisualActivationGateV5({
                representationQc,
                authorAtlas,
                styleFamilies,
                shadowRuns: runs,
                currentShadowModelVersion: modelVersion
            }),
            pipelineVersions: shadowPipelineVersionsV5(),
            visualEvidenceVersions: {
                representationQc:
                    representationQc.qcVersion,
                authorAtlas: authorAtlas.atlasVersion,
                styleFamilies: styleFamilies.familyVersion
            }
        }
    }

    recommendationV5P3PromotionGate(limit = 100) {
        const modelVersion = shadowPipelineModelVersionV5()
        const runs = this.database
            .listCandidatePoolsByModelVersionPrefix(
                modelVersion,
                Math.max(1, Math.min(500, Math.floor(limit)))
            )
            .filter((pool) => pool.modelVersion === modelVersion)
            .map((pool) => ({
                modelVersion: pool.modelVersion,
                generatedAt: pool.generatedAt,
                candidateIds: pool.candidateIds,
                telemetry: pool.telemetry
            }))
        return {
            ...evaluateP3PromotionGateV5(
                runs,
                modelVersion
            ),
            pipelineVersions: shadowPipelineVersionsV5()
        }
    }

    recommendationV5ShadowRuns(limit = 50) {
        return {
            modelPrefix: 'v5-shadow/',
            runs: this.database
                .listCandidatePoolsByModelVersionPrefix(
                    'v5-shadow/',
                    limit
                )
                .map((pool) => ({
                    poolId: pool.id,
                    appSessionId: pool.appSessionId,
                    cycleId: pool.cycleId,
                    generatedAt: pool.generatedAt,
                    expiresAt: pool.expiresAt,
                    modelVersion: pool.modelVersion,
                    candidateCount: pool.candidateIds.length,
                    candidateIds: pool.candidateIds,
                    telemetry: pool.telemetry
                }))
        }
    }

    recommendationV5ProviderRoutes(
        appSessionId?: string | null,
        limit = 5000
    ) {
        return compileCandidateProviderRoutesV5(
            this.recommendationV5CandidateChannels(
                appSessionId,
                limit
            )
        )
    }

    recommendationV5CandidateChannels(
        appSessionId?: string | null,
        limit = 5000
    ) {
        const bounded = Math.max(1, Math.min(5000, Math.floor(limit)))
        const events = this.database.listUserEvents({ limit: bounded })
        const catalog = this.database.listComics({ limit: 10000 })
        const store = new RecommendationPolicyStoreV5(this.database)
        const state = store.state()
        const timescales = buildPreferenceTimescalesV5(
            events,
            catalog,
            state,
            { appSessionId: appSessionId ?? null }
        )
        const observedBindings =
            deriveObservedEhCanonicalBindingsV5(catalog)
        const tagFacets: Record<string, string> = {
            ...observedBindings.facets
        }
        const tagProviderCanonicals: Record<string, string> = {
            ...observedBindings.canonicals
        }

        try {
            const registry = loadTagRegistryV3(runtimeRegistryDirectory())
            const tagRows = [
                ...timescales.layers.inferred.lifetime.positive.tags,
                ...timescales.layers.inferred.days30.positive.tags,
                ...timescales.layers.inferred.days7.positive.tags,
                ...timescales.layers.inferred.session.positive.tags,
                ...state.controls
                    .filter((control) => control.targetType === 'TAG')
                    .map((control) => ({
                        key: control.key,
                        label: control.label
                    })),
                ...(state.sessionIntent.targetType === 'TAG' &&
                state.sessionIntent.key
                    ? [
                          {
                              key: state.sessionIntent.key,
                              label:
                                  state.sessionIntent.label ??
                                  state.sessionIntent.key
                          }
                      ]
                    : [])
            ]
            for (const item of tagRows) {
                const resolved = resolveTagV3(
                    item.label || item.key,
                    registry
                )
                if (
                    resolved.resolutionType !== 'SAFETY' &&
                    resolved.resolutionStatus === 'RESOLVED'
                )
                    tagFacets[normalizePreferenceKey(item.key)] =
                        resolved.facet
            }
        } catch {
            // Raw tags remain valid retrieval anchors when the packaged
            // registry is unavailable. They simply stay in the TAG family.
        }

        const provider = this.providerService()
        const status = provider.providerStatus()
        return buildCandidateChannelPlanV5({
            timescales,
            policy: state,
            catalog,
            tagFacets,
            tagProviderCanonicals,
            providerEligibility: {
                pica: Boolean(status.pica.search),
                eh: Boolean(status.eh.search),
                exh: Boolean(
                    status.eh.search &&
                        status.eh.exHentai &&
                        this.ehProvider.hasSession()
                )
            },
            // Visual stays planning-only until the dedicated P4 activation
            // gate. Existing embeddings do not silently enable a recall path.
            visualEligible: false
        })
    }

    recommendationV5PreferenceTimescales(
        appSessionId?: string | null,
        limit = 5000
    ) {
        const bounded = Math.max(1, Math.min(5000, Math.floor(limit)))
        const events = this.database.listUserEvents({ limit: bounded })
        const catalog = this.database.listComics({ limit: 10000 })
        const state = new RecommendationPolicyStoreV5(this.database).state()
        return buildPreferenceTimescalesV5(events, catalog, state, {
            appSessionId: appSessionId ?? null
        })
    }

    recommendationV5BehaviorEvidence(limit = 5000) {
        const bounded = Math.max(1, Math.min(5000, Math.floor(limit)))
        const events = this.database.listUserEvents({ limit: bounded })
        const catalog = this.database.listComics({ limit: 10000 })
        const state = new RecommendationPolicyStoreV5(this.database).state()
        return buildBehaviorEvidenceLedgerV5(events, catalog, state)
    }

    recommendationV5WorkIdentityAudit(limit = 200) {
        const catalog = this.database.listComics({ limit: 10000 })
        const state = new RecommendationPolicyStoreV5(this.database).state()
        return {
            ...buildWorkIdentityAuditV5(catalog, state, limit),
            resolverVersion: WORK_IDENTITY_RESOLVER_VERSION,
            persistence: 'NONE' as const,
            automaticBinding: false
        }
    }

    recommendationV5WorkIdentityEvidence(limit = 200) {
        return {
            storage: this.database.workIdentityStorageStatus(),
            evidence: this.database.listWorkIdentityEvidence(limit),
            automaticBinding: false
        }
    }

    recommendationV5RefreshWorkIdentityEvidence(limit = 500) {
        const audit = this.recommendationV5WorkIdentityAudit(limit)
        const saved = this.database.saveWorkIdentityEvidence(
            audit.candidates.map((candidate) => ({
                leftComicId: candidate.leftComicId,
                rightComicId: candidate.rightComicId,
                relation: candidate.relation,
                confidence: candidate.confidence,
                resolverVersion: candidate.resolverVersion,
                evidence: {
                    ...candidate.evidence,
                    leftProvider: candidate.leftProvider,
                    rightProvider: candidate.rightProvider,
                    crossProvider: candidate.crossProvider
                }
            }))
        )
        return {
            mode: 'EVIDENCE_ONLY' as const,
            resolverVersion: audit.resolverVersion,
            scannedComicCount: audit.scannedComicCount,
            candidateCount: audit.candidateCount,
            crossProviderCandidateCount:
                audit.crossProviderCandidateCount,
            saved,
            storage: this.database.workIdentityStorageStatus(),
            automaticBinding: false
        }
    }


    recommendationV5WorkIdentityReview(limit = 200) {
        const evidence = this.database.listWorkIdentityEvidence(limit)
        const decisions = this.database.listWorkIdentityDecisions(5000)
        const decisionByPair = new Map(
            decisions.map((item) => [
                [item.leftComicId, item.rightComicId].sort().join('\u0000'),
                item
            ])
        )
        const rows = evidence.map((item) => ({
            ...item,
            decision:
                decisionByPair.get(
                    [item.leftComicId, item.rightComicId]
                        .sort()
                        .join('\u0000')
                ) ?? null
        }))
        const materializationPreview =
            buildWorkIdentityMaterializationPreviewV5(
                this.database.listComics({ limit: 10000 }),
                decisions
            )
        return {
            mode: 'HUMAN_REVIEW' as const,
            storage: this.database.workIdentityStorageStatus(),
            evidence: rows,
            decisions,
            undecidedCount: rows.filter((item) => !item.decision).length,
            materializationPreview,
            automaticBinding: false
        }
    }

    recommendationV5WorkIdentityMaterializationPlan() {
        const catalog = this.database.listComics({ limit: 10000 })
        const decisions = this.database.listWorkIdentityDecisions(5000)
        const existingBindings = this.database.listWorkIdentityBindings(10000)
        const plan = buildWorkIdentityMaterializationPlanV5(
            catalog,
            decisions,
            existingBindings
        )
        const planDigest = createHash('sha256')
            .update(JSON.stringify(plan))
            .digest('hex')
        return {
            ...plan,
            planDigest,
            storage: this.database.workIdentityStorageStatus()
        }
    }

    prepareRecommendationV5WorkIdentityMaterialization(
        input: Record<string, unknown>
    ) {
        const requestKey = String(input.requestKey ?? '').trim()
        const expectedPlanVersion = String(
            input.planVersion ?? ''
        ).trim()
        const expectedPlanDigest = String(
            input.planDigest ?? ''
        )
            .trim()
            .toLowerCase()
        const confirmation = String(input.confirmation ?? '').trim()
        if (
            confirmation !==
            WORK_IDENTITY_MATERIALIZATION_PREPARE_CONFIRMATION
        )
            throw new Error(
                'Explicit materialization preparation confirmation is required'
            )

        const current =
            this.recommendationV5WorkIdentityMaterializationPlan()
        if (expectedPlanVersion !== current.planVersion)
            throw new Error('Materialization plan version changed')
        if (expectedPlanDigest !== current.planDigest)
            throw new Error('Materialization plan digest changed')
        if (current.summary.workGroupCount < 1)
            throw new Error('No adjudicated work groups are ready to prepare')
        if (
            current.summary.blockedGroupCount > 0 ||
            current.summary.warningCount > 0 ||
            current.summary.fullBindingReadyCount !==
                current.summary.workGroupCount
        )
            throw new Error(
                'Materialization plan still contains blockers, warnings, or unresolved edition partitions'
            )

        const run = this.database.prepareWorkIdentityMaterializationRun({
            requestKey,
            planVersion: current.planVersion,
            planDigest: current.planDigest,
            plan: current
        })
        return {
            mode: 'PREPARED_ONLY' as const,
            executionEnabled: false,
            applyEndpoint: null,
            run,
            currentPlanDigest: current.planDigest
        }
    }

    recommendationV5WorkIdentityMaterializationRuns(limit = 100) {
        return {
            executionEnabled: false,
            runs: this.database.listWorkIdentityMaterializationRuns(limit)
        }
    }

    updateRecommendationV5WorkIdentityDecision(
        input: Record<string, unknown>
    ) {
        const leftComicId = String(input.leftComicId ?? '').trim()
        const rightComicId = String(input.rightComicId ?? '').trim()
        const rawDecision = String(input.decision ?? '').trim().toUpperCase()
        const store = new RecommendationPolicyStoreV5(this.database)

        if (rawDecision === 'CLEAR') {
            this.database.clearWorkIdentityDecision(
                leftComicId,
                rightComicId
            )
            store.setExplicitDistinctPair(
                leftComicId,
                rightComicId,
                false
            )
            return this.recommendationV5WorkIdentityReview(
                Number(input.limit ?? 200)
            )
        }

        if (
            !['SAME_WORK', 'EDITION_VARIANT', 'KEEP_SEPARATE'].includes(
                rawDecision
            )
        )
            throw new Error('Unknown work identity decision')

        const decision = rawDecision as
            | 'SAME_WORK'
            | 'EDITION_VARIANT'
            | 'KEEP_SEPARATE'
        this.database.saveWorkIdentityDecision({
            leftComicId,
            rightComicId,
            decision,
            source: 'USER',
            note: String(input.note ?? '')
        })
        // Only KEEP_SEPARATE changes serving at this stage. SAME_WORK and
        // EDITION_VARIANT remain adjudicated evidence until a later binding
        // phase is explicitly enabled.
        store.setExplicitDistinctPair(
            leftComicId,
            rightComicId,
            decision === 'KEEP_SEPARATE'
        )
        return this.recommendationV5WorkIdentityReview(
            Number(input.limit ?? 200)
        )
    }

    updateRecommendationV5Control(input: Record<string, unknown>) {
        const store = new RecommendationPolicyStoreV5(this.database)
        store.setControl({
            targetType: input.targetType,
            key: input.key,
            label: input.label,
            direction: input.direction,
            levelDelta: input.levelDelta,
            scope: input.scope,
            source: 'DESKTOP'
        })
        return this.recommendationV5Snapshot()
    }

    updateRecommendationV5Session(input: Record<string, unknown>) {
        const store = new RecommendationPolicyStoreV5(this.database)
        store.setSessionIntent({
            mode: input.mode,
            targetType: input.targetType,
            key: input.key,
            label: input.label,
            source: 'DESKTOP'
        })
        return this.recommendationV5Snapshot()
    }

    suppressRecommendationV5Comic(input: Record<string, unknown>) {
        const store = new RecommendationPolicyStoreV5(this.database)
        store.setItemDisposition({
            comicId: input.comicId,
            reason: input.reason,
            active: input.suppressed !== false,
            durationDays: input.durationDays,
            source: 'DESKTOP'
        })
        return this.recommendationV5Snapshot()
    }

    updateRecommendationV5TasteExclusion(
        input: Record<string, unknown>
    ) {
        const store = new RecommendationPolicyStoreV5(this.database)
        store.setTasteExclusion(
            String(input.comicId ?? ''),
            input.excluded !== false,
            'DESKTOP'
        )
        return this.recommendationV5Snapshot()
    }

    mergeMobileRecommendationV5(input: MobileRecommendationSyncV5) {
        return new RecommendationPolicyStoreV5(this.database).mergeMobile(input)
    }

    previewMobileRecommendationV5(input: MobileRecommendationSyncV5) {
        const preview = new RecommendationPolicyStoreV5(
            this.database
        ).previewMobile(input)
        const portable = this.recommendationPortablePackageV5(24)
        return {
            ...preview,
            remotePackage: {
                engineVersion: portable.engineVersion,
                foundation: portable.foundation,
                reservoirGeneration: portable.reservoir.generation,
                reservoirCount: portable.reservoir.count,
                behaviorGeneration: portable.behavior.generation
            }
        }
    }

    recommendationPortablePackageV5(limit = 500) {
        const bounded = Math.max(24, Math.min(1000, Math.floor(limit)))
        const policyStore = new RecommendationPolicyStoreV5(this.database)
        const policy = policyStore.state()
        const active = this.database.getAppState<{
            activeCycleId?: string | null
        }>('recommendation.v3.activeCycle.v1')
        const cycleId = String(active?.activeCycleId ?? '').trim()
        const pool = cycleId
            ? this.database.latestV3CandidatePool(cycleId)
            : null
        const catalog = this.database.listComics({ limit: 10000 })
        const rawRecords = pool
            ? this.database.recommendationRecords(
                  pool.candidateIds.slice(0, bounded * 2)
              )
            : []
        const filtered = filterCandidatesAgainstOwnedV5(
            rawRecords,
            catalog,
            policy
        ).rows.slice(0, bounded)

        const profile = this.visualPreferenceProfile()
        const preferred = selectPreferredVisualEmbeddings(
            this.database.listVisualEmbeddings(
                filtered.map((row) => row.comic.comicId)
            )
        )
        const visualRows = filtered.flatMap((row) => {
            const embedding = preferred.get(row.comic.comicId)
            if (!embedding || !profile) return []
            const affinity = visualAffinity(embedding, profile)
            return [
                {
                    comicId: row.comic.comicId,
                    affinity: affinity.affinity,
                    positiveSimilarity: affinity.positiveSimilarity,
                    negativeSimilarity: affinity.negativeSimilarity,
                    confidence: embedding.confidence,
                    sourceKind: embedding.sourceKind,
                    embeddingKind: embedding.embeddingKind
                }
            ]
        })
        const allIdentityBindings = this.database.listWorkIdentityBindings(10000)
        const portableIdentityIds = new Set([
            ...filtered.map((row) => row.comic.comicId),
            ...catalog
                .filter((comic) =>
                    Boolean(
                        comic.isFavorite ||
                            comic.inLibrary ||
                            comic.downloadedPictures > 0
                    )
                )
                .map((comic) => comic.comicId)
        ])
        const identityBindings = allIdentityBindings
            .filter((binding) => portableIdentityIds.has(binding.comicId))
            .map((binding) => ({
                comicId: binding.comicId,
                workId: binding.workId,
                workTitle: binding.workTitle,
                editionId: binding.editionId,
                editionLabel: binding.editionLabel,
                editionLanguage: binding.editionLanguage,
                editionKind: binding.editionKind,
                bindingStatus: binding.bindingStatus,
                confidence: binding.confidence,
                resolverVersion: binding.resolverVersion
            }))
        const catalogById = new Map(
            catalog.map((comic) => [comic.comicId, comic] as const)
        )
        const feedbackSnapshot = this.database
            .recommendationFeedback()
            .slice(0, 500)
            .map((item) => ({
                comicId: item.comicId,
                sentiment: item.sentiment,
                reasons: item.reasons,
                occurredAt: item.occurredAt
            }))
        const recentCutoff =
            Date.now() - 30 * 24 * 60 * 60 * 1000
        const recentEvents = this.database
            .listUserEvents({ limit: 5000 })
            .filter(
                (event) =>
                    Boolean(event.comicId) &&
                    event.source !== 'android-sync-v5' &&
                    [
                        'recommend_impression',
                        'recommend_detail_open',
                        'reader_complete'
                    ].includes(event.eventType) &&
                    Date.parse(event.occurredAt) >= recentCutoff
            )
            .slice(-500)
            .map((event) => {
                const comic = catalogById.get(String(event.comicId))
                return {
                    eventId: `desktop:${event.id}`,
                    eventType: event.eventType,
                    comicId: String(event.comicId),
                    occurredAt: event.occurredAt,
                    author: comic?.canonicalAuthor ?? comic?.author ?? '',
                    tags: comic?.tags ?? [],
                    categories: comic?.categories ?? []
                }
            })
        const behaviorGeneration = createHash('sha256')
            .update(
                JSON.stringify({
                    feedback: feedbackSnapshot,
                    recentEvents
                })
            )
            .digest('hex')
            .slice(0, 24)
        const portablePolicyGeneration = createHash('sha256')
            .update(
                JSON.stringify({
                    controls: policy.controls
                        .filter((control) => control.scope === 'PERSISTENT')
                        .map((control) => ({
                            targetType: control.targetType,
                            key: control.key,
                            direction: control.direction,
                            levelDelta: control.levelDelta ?? null,
                            scope: control.scope
                        })),
                    hardSuppressComicIds: policy.hardSuppressComicIds,
                    seenComicIds: policy.seenComicIds,
                    ownedComicIds: policy.ownedComicIds,
                    duplicateReportComicIds:
                        policy.duplicateReportComicIds,
                    temporarySuppressions:
                        policy.temporarySuppressions.map((item) => ({
                            comicId: item.comicId,
                            expiresAt: item.expiresAt
                        })),
                    tasteExcludedComicIds:
                        policy.tasteExcludedComicIds,
                    explicitDistinctPairs:
                        policy.explicitDistinctPairs
                })
            )
            .digest('hex')
            .slice(0, 24)
        const visualStatus = this.visualIndexStatus()
        const visualGeneration = createHash('sha256')
            .update(
                JSON.stringify({
                    modelId: visualStatus.modelId,
                    modelVersion: visualStatus.modelVersion,
                    samplingPolicyVersion: visualStatus.samplingPolicyVersion,
                    profileVersion: visualStatus.profileVersion,
                    indexedCount: visualStatus.indexedCount,
                    profile: profile
                        ? {
                              ...profile,
                              generatedAt: undefined
                          }
                        : null
                })
            )
            .digest('hex')
            .slice(0, 24)
        const canonicalGeneration = createHash('sha256')
            .update(
                JSON.stringify({
                    resolverVersion: WORK_IDENTITY_RESOLVER_VERSION,
                    explicitDistinctPairs: policy.explicitDistinctPairs,
                    identityBindings,
                    authors: this.database
                        .listAuthors()
                        .map((author) => [
                            author.id,
                            author.canonicalName,
                            author.reviewStatus
                        ])
                })
            )
            .digest('hex')
            .slice(0, 24)
        const candidates = filtered.map(({ comic }, index) => ({
            comicId: comic.comicId,
            providerId: comic.providerId ?? null,
            providerRemoteId: comic.providerRemoteId ?? null,
            title: comic.title,
            author: comic.author,
            canonicalAuthor: comic.canonicalAuthor ?? null,
            tags: comic.tags,
            categories: comic.categories,
            pagesCount: comic.pagesCount ?? null,
            totalLikes: comic.totalLikes ?? null,
            totalViews: comic.totalViews ?? null,
            coverUrl: comic.coverUrl ?? null,
            desktopPoolRank: index + 1
        }))
        const reservoirGeneration = createHash('sha256')
            .update(
                JSON.stringify({
                    cycleId: cycleId || null,
                    poolId: pool?.id ?? null,
                    generatedAt: pool?.generatedAt ?? null,
                    ids: candidates.map((item) => item.comicId)
                })
            )
            .digest('hex')
            .slice(0, 24)
        return {
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            engineVersion: 'portable-v5-runtime-v1',
            foundation: {
                policyRevision: policy.revision,
                portablePolicyGeneration,
                visualGeneration,
                canonicalGeneration,
                workIdentityResolverVersion: WORK_IDENTITY_RESOLVER_VERSION,
                visualModelId: visualStatus.modelId,
                visualModelVersion: visualStatus.modelVersion,
                visualSamplingPolicyVersion:
                    visualStatus.samplingPolicyVersion,
                identityBindings
            },
            reservoir: {
                generation: reservoirGeneration,
                sourceCycleId: cycleId || null,
                sourcePoolId: pool?.id ?? null,
                sourceGeneratedAt: pool?.generatedAt ?? null,
                count: candidates.length,
                candidates
            },
            visual: {
                generation: visualGeneration,
                profileVersion: visualStatus.profileVersion,
                indexedCount: visualStatus.indexedCount,
                targetCount: visualStatus.targetCount,
                signals: visualRows
            },
            behavior: {
                generation: behaviorGeneration,
                feedback: feedbackSnapshot,
                recentEvents
            }
        }
    }

    visualSettings() {
        const stored = this.database.getAppState<{
            enabled?: boolean
            samplingMode?: VisualSamplingMode
            rerankMode?: VisualRerankMode
            strength?: VisualInfluenceStrength
        }>('recommendation.visualSettings.v1')
        const samplingMode: VisualSamplingMode = [
            'local_only',
            'standard',
            'cover_only'
        ].includes(String(stored?.samplingMode ?? ''))
            ? (stored!.samplingMode as VisualSamplingMode)
            : 'local_only'
        const rerankMode: VisualRerankMode = ['OFF', 'SHADOW', 'LIVE'].includes(
            String(stored?.rerankMode ?? '')
        )
            ? (stored!.rerankMode as VisualRerankMode)
            : 'SHADOW'
        const strength: VisualInfluenceStrength = ['LIGHT', 'STANDARD', 'STRONG'].includes(
            String(stored?.strength ?? '')
        )
            ? (stored!.strength as VisualInfluenceStrength)
            : 'STANDARD'
        return {
            enabled: Boolean(stored?.enabled),
            samplingMode,
            rerankMode,
            strength
        }
    }

    updateVisualSettings(input: {
        enabled?: unknown
        samplingMode?: unknown
        rerankMode?: unknown
        strength?: unknown
    }) {
        const previous = this.visualSettings()
        const samplingMode = ['local_only', 'standard', 'cover_only'].includes(
            String(input.samplingMode ?? '')
        )
            ? (String(input.samplingMode) as VisualSamplingMode)
            : previous.samplingMode
        const rerankMode = ['OFF', 'SHADOW', 'LIVE'].includes(
            String(input.rerankMode ?? '')
        )
            ? (String(input.rerankMode) as VisualRerankMode)
            : previous.rerankMode
        const strength = ['LIGHT', 'STANDARD', 'STRONG'].includes(
            String(input.strength ?? '')
        )
            ? (String(input.strength) as VisualInfluenceStrength)
            : previous.strength
        const next = {
            enabled:
                input.enabled === undefined
                    ? previous.enabled
                    : Boolean(input.enabled),
            samplingMode,
            rerankMode,
            strength
        }
        this.database.setAppState('recommendation.visualSettings.v1', next)
        return next
    }

    saveVisualEmbedding(
        input: Omit<VisualEmbeddingRecord, 'generatedAt'> & {
            generatedAt?: string
        }
    ) {
        if (!this.database.getComic(input.comicId)) throw new Error('Unknown comic')
        if (
            input.modelId !== VISUAL_MODEL_ID ||
            input.modelVersion !== VISUAL_MODEL_VERSION
        )
            throw new Error('Unsupported visual embedding model')
        if (input.samplingPolicyVersion !== VISUAL_SAMPLING_POLICY_VERSION)
            throw new Error('Unsupported visual sampling policy')
        return this.database.saveVisualEmbedding({
            ...input,
            generatedAt: input.generatedAt ?? new Date().toISOString()
        })
    }

    visualPreferenceProfile() {
        const catalog = this.database.listComics({ limit: 10000 })
        const tasteExcluded = new Set(
            new RecommendationPolicyStoreV5(this.database).state()
                .tasteExcludedComicIds
        )
        const favorites = new Set(
            catalog
                .filter(
                    (comic) =>
                        comic.isFavorite &&
                        !tasteExcluded.has(comic.comicId)
                )
                .map((comic) => comic.comicId)
        )
        const feedback = this.database.recommendationFeedback()
        return buildVisualPreferenceProfile({
            embeddings: this.database.listVisualEmbeddings(),
            favoriteComicIds: favorites,
            feedback,
            catalogSize: Math.max(
                1,
                favorites.size +
                    feedback.filter((item) => item.sentiment === 'like').length
            )
        })
    }

    visualStyleFamilies(
        minWorksPerAuthor = 2,
        maxAuthors = 300,
        mutualK = 2,
        minimumSimilarity = -1
    ) {
        const atlas = buildVisualAuthorAtlasV5({
            embeddings: this.database.listVisualEmbeddings(),
            catalog: this.database.listComics({ limit: 10000 }),
            minWorksPerAuthor,
            maxGraphAuthors: Math.max(maxAuthors, 10),
            neighborLimit: Math.max(mutualK, 2)
        })
        return buildVisualStyleFamiliesV5({
            atlas,
            maxAuthors,
            mutualK,
            minimumSimilarity
        })
    }

    visualAuthorAtlas(
        minWorksPerAuthor = 2,
        maxGraphAuthors = 600,
        neighborLimit = 8
    ) {
        return buildVisualAuthorAtlasV5({
            embeddings: this.database.listVisualEmbeddings(),
            catalog: this.database.listComics({ limit: 10000 }),
            minWorksPerAuthor,
            maxGraphAuthors,
            neighborLimit
        })
    }

    visualRepresentationQc(
        maxPairSamples = 4000,
        maxAnchors = 120
    ) {
        const catalog = this.database.listComics({ limit: 10000 })
        const fandomKeysByComic: Record<string, string[]> = {}
        try {
            const registry = loadTagRegistryV3(runtimeRegistryDirectory())
            for (const comic of catalog) {
                const keys = new Set<string>()
                for (const tag of comic.tags) {
                    const resolved = resolveTagV3(tag, registry)
                    if (
                        resolved.resolutionStatus === 'RESOLVED' &&
                        resolved.resolutionType !== 'SAFETY' &&
                        resolved.facet === 'FANDOM_IP' &&
                        resolved.canonicalKey
                    )
                        keys.add(resolved.canonicalKey)
                }
                if (keys.size)
                    fandomKeysByComic[comic.comicId] = [...keys].sort()
            }
        } catch {
            // E-H raw parody tags remain available inside the QC module even
            // when the packaged semantic registry cannot be loaded.
        }
        return buildVisualRepresentationQcV5({
            embeddings: this.database.listVisualEmbeddings(),
            catalog,
            fandomKeysByComic,
            maxPairSamples,
            maxAnchors
        })
    }

    visualIndexStatus() {
        const settings = this.visualSettings()
        const catalog = this.database.listComics({ limit: 10000 })
        const feedback = this.database.recommendationFeedback()
        const targetIds = new Set([
            ...catalog
                .filter((comic) => comic.isFavorite)
                .map((comic) => comic.comicId),
            ...feedback.map((item) => item.comicId)
        ])
        const embeddings = this.database.listVisualEmbeddings()
        const current = embeddings.filter(
            (item) =>
                item.modelId === VISUAL_MODEL_ID &&
                item.modelVersion === VISUAL_MODEL_VERSION &&
                item.samplingPolicyVersion === VISUAL_SAMPLING_POLICY_VERSION
        )
        const indexedIds = new Set(current.map((item) => item.comicId))
        const pendingComicIds = [...targetIds]
            .filter((id) => !indexedIds.has(id))
            .sort()
        return {
            settings,
            modelId: VISUAL_MODEL_ID,
            modelVersion: VISUAL_MODEL_VERSION,
            samplingPolicyVersion: VISUAL_SAMPLING_POLICY_VERSION,
            profileVersion: VISUAL_PROFILE_VERSION,
            rerankVersion: VISUAL_RERANK_VERSION,
            targetCount: targetIds.size,
            indexedCount: [...targetIds].filter((id) => indexedIds.has(id)).length,
            bodyCount: current.filter((item) => item.embeddingKind === 'body').length,
            coverCount: current.filter((item) => item.embeddingKind === 'cover').length,
            pendingComicIds,
            profile: this.visualPreferenceProfile()
        }
    }

    similarVisualStyle(comicId: string, limit = 20) {
        const embeddings = this.database.listVisualEmbeddings()
        const preferred = new Map<string, VisualEmbeddingRecord>()
        for (const item of embeddings) {
            if (
                item.modelId !== VISUAL_MODEL_ID ||
                item.modelVersion !== VISUAL_MODEL_VERSION ||
                item.samplingPolicyVersion !== VISUAL_SAMPLING_POLICY_VERSION
            )
                continue
            const previous = preferred.get(item.comicId)
            if (
                !previous ||
                (previous.embeddingKind === 'cover' && item.embeddingKind === 'body')
            )
                preferred.set(item.comicId, item)
        }
        const source = preferred.get(comicId)
        if (!source) return []
        const maxResults = Math.max(1, Math.min(50, Math.floor(limit)))
        const nearest = [...preferred.values()]
            .filter(
                (item) =>
                    item.comicId !== comicId &&
                    item.vector.length === source.vector.length
            )
            .map((embedding) => ({
                embedding,
                similarity: cosineSimilarity(source.vector, embedding.vector)
            }))
            .sort(
                (a, b) =>
                    b.similarity - a.similarity ||
                    a.embedding.comicId.localeCompare(b.embedding.comicId)
            )
            .slice(0, maxResults)
        return nearest
            .map((item) => ({
                comic: this.database.getComic(item.embedding.comicId),
                similarity: item.similarity,
                sourceKind: item.embedding.sourceKind,
                confidence: item.embedding.confidence,
                sampleCount: item.embedding.sampleCount,
                embeddingKind: item.embedding.embeddingKind
            }))
            .filter((item) => item.comic)
    }

    private recordForOnlineSource(
        comic: ProviderComic,
        source: OnlineSource
    ): FavoriteRecord {
        const record = providerComicToRecord(comic)
        if (source === 'pica') return record
        const previous =
            this.database.getComic(record.comicId)?.providerMetadata ?? {}
        const known = new Set<string>([
            ...(Array.isArray(previous.knownSurfaces)
                ? previous.knownSurfaces.map(String)
                : []),
            source
        ])
        record.providerMetadata = {
            ...previous,
            ...record.providerMetadata,
            preferredSurface: source,
            knownSurfaces: [...known].filter(
                (item) => item === 'eh' || item === 'exh'
            )
        }
        return record
    }

    constructor(
        readonly database: LibraryDatabase,
        readonly dataDir: string,
        provider?: Pica,
        ehProvider?: EhProvider
    ) {
        this.pica = provider ?? null
        this.ehProvider = ehProvider ?? new EhProvider()
        fs.mkdirSync(dataDir, { recursive: true })
        this.recoverInterruptedRecommendationBuild()
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

    providerService() {
        return new ProviderService(
            () => this.connect(),
            this.database,
            this.ehProvider
        )
    }

    async refreshAuthorWorks(authorId: string) {
        const author = this.database.listAuthors().find((item) => item.id === authorId)
        if (!author) throw new Error('作者身份不存在或已经变化')
        const catalog = this.database.listComics({ limit: 10000 })
        const knownWorks = catalog.filter((comic) => comic.authorId === authorId)
        const identityKeys = new Set(
            [author.canonicalName, ...author.aliases].map(normalizeAuthorKey).filter(Boolean)
        )
        const picaQuery =
            knownWorks.find((comic) =>
                comic.providerId === 'pica' && identityKeys.has(normalizeAuthorKey(comic.author))
            )?.author || author.canonicalName
        const ehQueryName =
            knownWorks.find((comic) =>
                comic.providerId === 'eh' && identityKeys.has(normalizeAuthorKey(comic.author))
            )?.author || author.canonicalName
        const provider = this.providerService()
        const sources: Record<string, { count: number; error?: string }> = {}
        const run = async (source: 'pica' | 'eh' | 'exh', keyword: string) => {
            try {
                const records = await provider.search({ keyword, limit: 100 }, [source], 'discover')
                sources[source] = { count: records.length }
            } catch (error) {
                sources[source] = { count: 0, error: error instanceof Error ? error.message : String(error) }
            }
        }
        if (picaQuery.trim()) await run('pica', picaQuery.trim())
        const cleanEh = ehQueryName.replaceAll('"', '').trim()
        if (cleanEh) await run('eh', `artist:"${cleanEh}"`)
        if (cleanEh && this.ehProvider.hasSession()) {
            const capability = await this.probeExHentai().catch(() => 'NETWORK_ERROR')
            if (capability === 'AVAILABLE') await run('exh', `artist:"${cleanEh}"`)
            else sources.exh = { count: 0, error: capability }
        }
        const refreshedWorks = this.database
            .listComics({ limit: 10000 })
            .filter((comic) => comic.authorId === authorId)
        return {
            authorId,
            canonicalName: author.canonicalName,
            knownBefore: knownWorks.length,
            knownAfter: refreshedWorks.length,
            sources
        }
    }

    setEhSession(session?: EhSession | null) {
        this.ehProvider.setSession(session)
    }

    ehAccountStatus() {
        return this.providerService().ehAccountStatus()
    }

    verifyEhAccount() {
        return this.providerService().verifyEhAccount()
    }

    probeExHentai() {
        return this.providerService().probeExHentai()
    }

    syncEhFavorites() {
        return this.providerService().syncEhFavorites()
    }

    async mobileEhRelayFavoritesSnapshot() {
        const snapshot = await this.ehProvider.favoriteSnapshot()
        const records = snapshot.comics.map((comic) =>
            this.recordForOnlineSource(comic, 'eh')
        )
        this.database.syncEhFavorites(records)
        return snapshot
    }

    async mobileEhRelaySearch(input: SearchRequest) {
        const surface: EhSurface = input.surface === 'exh' ? 'exh' : 'eh'
        const comics = await this.ehProvider.search({
            ...input,
            surface,
            limit: Math.max(
                1,
                Math.min(100, Math.floor(Number(input.limit) || 50))
            )
        })
        if (comics.length)
            this.database.importCatalog(
                comics.map((comic) =>
                    this.recordForOnlineSource(comic, surface)
                ),
                `${surface}:mobile-relay-search`
            )
        return comics
    }

    async mobileEhRelayDetails(comicId: string, surface: EhSurface) {
        const comic = await this.ehProvider.detailsOnSurface(
            comicId,
            surface
        )
        this.database.importCatalog(
            [this.recordForOnlineSource(comic, surface)],
            `${surface}:mobile-relay-details`
        )
        return comic
    }

    mobileEhRelayEpisodes(comicId: string, surface: EhSurface) {
        return this.ehProvider.episodesOnSurface(comicId, surface)
    }

    mobileEhRelayPages(
        comicId: string,
        episode: Episode,
        surface: EhSurface
    ) {
        return this.ehProvider.pagesOnSurface(comicId, episode, surface)
    }

    mobileEhRelayFetchPage(
        locator: string,
        maxBytes = 20 * 1024 * 1024
    ) {
        return this.ehProvider.fetchPage(locator, maxBytes)
    }

    mobileEhRelayProbeExH() {
        return this.ehProvider.probeExHentai()
    }

    async mobileEhRelaySetFavorite(
        comicId: string,
        desired: boolean,
        category = 0,
        note = ''
    ) {
        if (!this.ehProvider.hasSession())
            throw new Error('E-H account session is not configured')
        let before = this.database.getComic(comicId)
        if (!before) {
            const comic = await this.ehProvider.detailsOnSurface(
                comicId,
                'eh'
            )
            this.database.importCatalog(
                [this.recordForOnlineSource(comic, 'eh')],
                'eh:mobile-relay-favorite'
            )
            before = this.database.getComic(comicId)
        }
        if (!before) throw new Error('E-H comic could not be persisted')
        const beforeRemote = this.database.hasFavoriteMembership(
            comicId,
            'eh-favorite'
        )
        if (beforeRemote === desired)
            return {
                changed: false,
                isFavorite: before.isFavorite,
                already: true,
                remote: true,
                category,
                note
            }
        await this.ehProvider.setRemoteFavorite(
            comicId,
            desired,
            category,
            note
        )
        const after = this.database.setEhFavoriteState(
            comicId,
            desired
        )
        return {
            changed: true,
            isFavorite: Boolean(after?.isFavorite),
            already: false,
            remote: true,
            category,
            note
        }
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

        const providerService = this.providerService()
        const image = await providerService.fetchCover(comicId, comic.coverUrl)
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
        this.recommendationProgress = { state: 'running', phase: 'profile', done: 0, total: 7 }
        const pica = await this.connect()
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
        const profile = buildFinalLifetimeProfileV3(favorites, { registry })
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
        const intents = applyIntentPolicyV5(
            baseIntents,
            recommendationV5State
        )
        this.recommendationProgress = { state: 'running', phase: 'routes', done: 2, total: 7 }
        const routes = translateIntentPlanV3(intents)
        const storePica = (comics: Comic[]) => {
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
        this.recommendationProgress = {
            state: 'running',
            phase: 'retrieve',
            done: 4,
            total: 7
        }
        const retrieved = await retrieveCandidatesV3({
            provider: {
                keyword: async (query, page) => {
                    const picaResults = storePica(
                        (
                            await pica.comicsPage(
                                '',
                                query,
                                pica.Order.loved,
                                page
                            )
                        ).docs
                    )
                    const ehResults = page === 1 ? await externalSearch(query, 'keyword', 'eh') : []
                    const exhResults = page === 1 ? await externalSearch(query, 'keyword', 'exh') : []
                    return mergeProviderResults(mergeProviderResults(picaResults, ehResults), exhResults)
                },
                author: async (query, page) => {
                    const picaResults = storePica(
                        (await pica.search(query, page, pica.Order.loved)).docs
                    )
                    const ehResults = page === 1 ? await externalSearch(query, 'author', 'eh') : []
                    const exhResults = page === 1 ? await externalSearch(query, 'author', 'exh') : []
                    return mergeProviderResults(mergeProviderResults(picaResults, ehResults), exhResults)
                },
                related: async (comicId) =>
                    comicId.startsWith('eh:')
                        ? []
                        : storePica(await pica.related(comicId))
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
        const catalogById = new Map(
            catalog.map((comic) => [comic.comicId, comic])
        )
        const feedbackAdjusted = ranked
            .filter((candidate) => !latestFeedback.has(candidate.comicId))
            .map((candidate, index) => {
                const feedbackAdjustment = metadataFeedbackAdjustment({
                    candidate: candidate.comic,
                    feedback: recommendationFeedback,
                    catalogById
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
            const provider = this.providerService()
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
        const providerService = this.providerService()
        const tags = (query.tags ?? []).map(normalizeAuthorKey)
        const categories = (query.categories ?? []).map(normalizeAuthorKey)
        let records = await providerService.search(
            {
                keyword: query.keyword?.trim(),
                tags: query.tags,
                categories: query.categories,
                ehMode: query.ehMode,
                ehToplist: query.ehToplist,
                ehLanguage: query.ehLanguage,
                ehExcludeTags: query.ehExcludeTags,
                ehMinRating: query.ehMinRating,
                ehPageFrom: query.ehPageFrom,
                ehPageTo: query.ehPageTo,
                limit: Math.min(query.limit ?? 100, 1000)
            },
            query.providers?.length ? query.providers : ['pica', 'eh', 'exh']
        )
        records = records.filter((comic) => {
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
            records.sort((a, b) => a.title.localeCompare(b.title))
        } else if (query.sort === 'latest') {
            records.sort((a, b) =>
                String(b.updatedAt ?? b.createdAt ?? '').localeCompare(
                    String(a.updatedAt ?? a.createdAt ?? '')
                )
            )
        } else if (query.sort === 'views') {
            records.sort(
                (a, b) => (b.totalViews ?? 0) - (a.totalViews ?? 0)
            )
        } else if (query.sort === 'recommended') {
            records.sort((a, b) => {
                const score = (comic: FavoriteRecord) =>
                    Math.log10(1 + (comic.totalLikes ?? 0)) * 3 +
                    Math.log10(1 + (comic.totalViews ?? 0)) +
                    (comic.rating ?? 0) +
                    tags.filter((tag) =>
                        comic.tags.map(normalizeAuthorKey).includes(tag)
                    ).length * 5
                return score(b) - score(a)
            })
        } else {
            records.sort((a, b) => {
                if (a.providerId === 'eh' && b.providerId === 'eh')
                    return (b.rating ?? 0) - (a.rating ?? 0)
                return (b.totalLikes ?? 0) - (a.totalLikes ?? 0)
            })
        }
        return records.slice(0, Math.min(query.limit ?? 100, 1000))
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
        const providerService = this.providerService()
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
                            (await providerService.getEpisodes(id)).map(
                                (episode) => ({
                                    id: episode.id || episode._id || '',
                                    order: episode.order,
                                    title: episode.title,
                                    updatedAt: episode.updated_at
                                })
                            ).filter((episode) => episode.id)
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
        return this.database.hasActiveDownloadJobs('LOCAL')
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

    private async downloadPicaComicNow(
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
            const stored = this.database.getComic(comicId)
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

    private async downloadComicNow(
        comicId: string,
        options: {
            episodeOrders?: number[]
            mediaGate: MediaRequestGate
            onProgress?: (progress: DownloadProgress) => void
            shouldStop?: () => boolean
        }
    ): Promise<DownloadResult> {
        if (!comicId.startsWith('eh:'))
            return this.downloadPicaComicNow(comicId, options)
        const providerService = this.providerService()
        const comic = await providerService.getComicDetails(comicId)
        if (
            comic.providerId === 'pica' &&
            comic.providerMetadata.allowDownload === false
        )
            throw new Error('The site reports that this comic is not downloadable')
        const observedEpisodes = await providerService.getEpisodes(comicId)
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
            const pictures = await providerService.getEpisodePages(comicId, episode)
            const stored = this.database.getComic(comicId)
            const episodeDir = renderLibraryPath(
                path.join(this.dataDir, 'library'),
                process.env.PICA_LIBRARY_PATH_TEMPLATE ?? defaultLibraryTemplate,
                {
                    author:
                        stored?.canonicalAuthor ?? comic.author ?? 'Unknown author',
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
            if (existing && fs.statSync(existing).size > 0)
                validExisting.set(item.pictureId, existing)
        }
        let completed = validExisting.size
        const completedPictureIds = new Set(validExisting.keys())
        let cumulativeBytes = [...validExisting.keys()].reduce(
            (total, pictureId) =>
                total + (this.database.pictureDownloadState(pictureId)?.byteSize ?? 0),
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
                        const image = await providerService.fetchPage(
                            item.picture.url,
                            64 * 1024 * 1024
                        )
                        const extension =
                            image.contentType === 'image/png'
                                ? '.png'
                                : image.contentType === 'image/webp'
                                  ? '.webp'
                                  : image.contentType === 'image/gif'
                                    ? '.gif'
                                    : image.contentType === 'image/avif'
                                      ? '.avif'
                                      : '.jpg'
                        const target =
                            comic.providerId === 'eh'
                                ? item.file.replace(/.[^.]+$/, extension)
                                : item.file
                        await fs.promises.mkdir(path.dirname(target), {
                            recursive: true
                        })
                        const partial = `${target}.part`
                        await fs.promises.writeFile(partial, image.data)
                        await fs.promises.rename(partial, target)
                        const sha256 = createHash('sha256')
                            .update(image.data)
                            .digest('hex')
                        this.database.markPictureDownloaded(
                            item.pictureId,
                            target,
                            image.data.byteLength,
                            sha256
                        )
                        result.downloaded += 1
                        completedPictureIds.add(item.pictureId)
                        cumulativeBytes += image.data.byteLength
                        completed += 1
                        options.onProgress?.({
                            comicId,
                            comicTitle: comic.title,
                            episodeId: item.episodeId,
                            episodeTitle: item.episodeTitle,
                            completed,
                            total: work.length,
                            bytes: cumulativeBytes,
                            file: target
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
                total + (this.database.pictureDownloadState(pictureId)?.byteSize ?? 0),
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
