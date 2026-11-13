import { randomUUID } from 'node:crypto'
import type { LibraryDatabase } from '../../src/library/database'
import type { LibraryService, RecommendationV5ShadowTaskProgress } from '../../src/library/service'
import type { ProviderService } from '../../src/services/provider-service'
import { RecommendationPolicyStoreV5 } from '../../src/recommendation-v5/policy-store'
import { runtimeRegistryDirectory } from '../../src/recommendation-v3/runtime-registry-path'
import { loadTagRegistryV3, resolveTagV3 } from '../../src/recommendation-v3/tag-resolution-v3'
import { parseEhTag } from '../../src/providers/eh-tags'
import { executeShadowRetrievalV5 } from '../../src/recommendation-v5/shadow-retrieval'
import { applyCandidateHygieneV5 } from '../../src/recommendation-v5/candidate-hygiene'
import { rankShadowCandidatesV5 } from '../../src/recommendation-v5/relevance-ranker'
import { diversifyShadowBatchV5, type CandidateSemanticDiversityV5 } from '../../src/recommendation-v5/batch-diversity'
import { auditShadowCorrectnessV5 } from '../../src/recommendation-v5/correctness-audit'
import { buildVisualCandidateCoverageV5 } from '../../src/recommendation-v5/visual-candidate-coverage'
import { shadowPipelineModelVersionV5, shadowPipelineVersionsV5 } from '../../src/recommendation-v5/shadow-pipeline'
import { normalizePreferenceKey } from '../../src/recommendation-v5/portable-policy'
import { projectComicTagSignalsV1, rawTagParticipatesV1, comicTagProviderV1 } from '../../src/tags/policy'

export const SHADOW_ORACLE_SOURCE_V5 = 'f4e2c2ba8cb147292e4c344c59ca1619766a4380'
const RECOMMENDATION_V5_SHADOW_RETRIEVAL_CONFIRMATION = 'RUN_RECOMMENDATION_V5_SHADOW_RETRIEVAL'
class RecommendationV5ShadowCancelledError extends Error {
    constructor() {
        super('Recommendation V5 shadow retrieval was cancelled')
        this.name = 'RecommendationV5ShadowCancelledError'
    }
}
/** Frozen pre-extraction methods. No replacement pipeline/task module is called. */
export class FrozenRecommendationShadowV5 {
constructor(private readonly database: LibraryDatabase, private readonly hooks: {
    provider(): Pick<ProviderService, 'search' | 'relatedPica'>
    plan: LibraryService['recommendationV5ProviderRoutes']
    timescales: LibraryService['recommendationV5PreferenceTimescales']
    acquire(): Promise<{ release(): void }>
}) {}
private readonly runtimeResources = { acquire: (_request: unknown) => this.hooks.acquire() }
private providerService() { return this.hooks.provider() }
private recommendationV5ProviderRoutes(...args: Parameters<LibraryService['recommendationV5ProviderRoutes']>) { return this.hooks.plan(...args) }
private recommendationV5PreferenceTimescales(...args: Parameters<LibraryService['recommendationV5PreferenceTimescales']>) { return this.hooks.timescales(...args) }
private recommendationV5ShadowProgress: RecommendationV5ShadowTaskProgress = {
        state: 'idle',
        phase: 'idle',
        done: 0,
        total: 7,
        retrievalDone: 0,
        retrievalTotal: 0,
        rawCandidateCount: 0,
        candidateCount: 0,
        rankedCandidateCount: 0,
        selectedCount: 0
    }
private recommendationV5ShadowPauseRequested = false
private recommendationV5ShadowCancelRequested = false
private recommendationV5ShadowResumePhase: RecommendationV5ShadowTaskProgress['phase'] =
        'retrieving'
private readonly recommendationV5ShadowResumeWaiters = new Set<() => void>()
private recommendationV5ShadowRun: Promise<void> | null = null
private recommendationV5ShadowResult:
        | {
              rawCandidateCount: number
              candidateCount: number
              rankedCandidateCount: number
              selectedCount: number
              audit: {
                  poolId: string
                  cycleId: string
                  modelVersion: string
                  generatedAt: string
                  candidateIdCount: number
              }
          }
        | null = null
recommendationV5ShadowStatus() {
        const active = [
            'running',
            'pausing',
            'paused',
            'cancelling'
        ].includes(this.recommendationV5ShadowProgress.state)
        const terminal = [
            'complete',
            'failed',
            'cancelled'
        ].includes(this.recommendationV5ShadowProgress.state)
        return {
            ...this.recommendationV5ShadowProgress,
            active,
            canPause:
                this.recommendationV5ShadowProgress.state === 'running' ||
                this.recommendationV5ShadowProgress.state === 'pausing',
            canResume:
                this.recommendationV5ShadowProgress.state === 'paused',
            canCancel: active,
            result: terminal ? this.recommendationV5ShadowResult : undefined
        }
    }

recommendationV5ShadowControl(
        action: 'pause' | 'resume' | 'cancel'
    ) {
        if (action === 'pause') {
            if (this.recommendationV5ShadowProgress.state === 'running') {
                this.recommendationV5ShadowPauseRequested = true
                this.recommendationV5ShadowProgress = {
                    ...this.recommendationV5ShadowProgress,
                    state: 'pausing',
                    updatedAt: new Date().toISOString()
                }
            }
            return this.recommendationV5ShadowStatus()
        }
        if (action === 'resume') {
            this.recommendationV5ShadowPauseRequested = false
            if (
                this.recommendationV5ShadowProgress.state === 'paused' ||
                this.recommendationV5ShadowProgress.state === 'pausing'
            )
                this.recommendationV5ShadowProgress = {
                    ...this.recommendationV5ShadowProgress,
                    state: 'running',
                    phase: this.recommendationV5ShadowResumePhase,
                    updatedAt: new Date().toISOString()
                }
            for (const resolve of this.recommendationV5ShadowResumeWaiters)
                resolve()
            this.recommendationV5ShadowResumeWaiters.clear()
            return this.recommendationV5ShadowStatus()
        }
        this.recommendationV5ShadowCancelRequested = true
        this.recommendationV5ShadowPauseRequested = false
        for (const resolve of this.recommendationV5ShadowResumeWaiters)
            resolve()
        this.recommendationV5ShadowResumeWaiters.clear()
        if (
            this.recommendationV5ShadowProgress.state === 'running' ||
            this.recommendationV5ShadowProgress.state === 'pausing' ||
            this.recommendationV5ShadowProgress.state === 'paused'
        )
            this.recommendationV5ShadowProgress = {
                ...this.recommendationV5ShadowProgress,
                state: 'cancelling',
                updatedAt: new Date().toISOString()
            }
        return this.recommendationV5ShadowStatus()
    }

private async recommendationV5ShadowCheckpoint() {
        if (this.recommendationV5ShadowCancelRequested)
            throw new RecommendationV5ShadowCancelledError()
        if (!this.recommendationV5ShadowPauseRequested) return
        this.recommendationV5ShadowResumePhase =
            this.recommendationV5ShadowProgress.phase === 'paused'
                ? this.recommendationV5ShadowResumePhase
                : this.recommendationV5ShadowProgress.phase
        this.recommendationV5ShadowProgress = {
            ...this.recommendationV5ShadowProgress,
            state: 'paused',
            phase: 'paused',
            updatedAt: new Date().toISOString()
        }
        await new Promise<void>((resolve) =>
            this.recommendationV5ShadowResumeWaiters.add(resolve)
        )
        if (this.recommendationV5ShadowCancelRequested)
            throw new RecommendationV5ShadowCancelledError()
        this.recommendationV5ShadowProgress = {
            ...this.recommendationV5ShadowProgress,
            state: 'running',
            phase: this.recommendationV5ShadowResumePhase,
            updatedAt: new Date().toISOString()
        }
    }

private finishRecommendationV5ShadowControl() {
        this.recommendationV5ShadowPauseRequested = false
        this.recommendationV5ShadowCancelRequested = false
        for (const resolve of this.recommendationV5ShadowResumeWaiters)
            resolve()
        this.recommendationV5ShadowResumeWaiters.clear()
        this.recommendationV5ShadowRun = null
    }

startRecommendationV5ShadowRetrieval(
        input: Record<string, unknown>
    ) {
        if (
            String(input.confirmation ?? '').trim() !==
            RECOMMENDATION_V5_SHADOW_RETRIEVAL_CONFIRMATION
        )
            throw new Error(
                'Explicit shadow retrieval confirmation is required'
            )
        if (
            this.recommendationV5ShadowRun &&
            [
                'running',
                'pausing',
                'paused',
                'cancelling'
            ].includes(this.recommendationV5ShadowProgress.state)
        )
            return {
                started: false,
                ...this.recommendationV5ShadowStatus()
            }

        const now = new Date().toISOString()
        this.recommendationV5ShadowPauseRequested = false
        this.recommendationV5ShadowCancelRequested = false
        this.recommendationV5ShadowResumePhase = 'planning'
        this.recommendationV5ShadowResumeWaiters.clear()
        this.recommendationV5ShadowResult = null
        this.recommendationV5ShadowProgress = {
            state: 'running',
            phase: 'planning',
            done: 0,
            total: 7,
            retrievalDone: 0,
            retrievalTotal: 0,
            rawCandidateCount: 0,
            candidateCount: 0,
            rankedCandidateCount: 0,
            selectedCount: 0,
            startedAt: now,
            updatedAt: now
        }

        const run = (async () => {
            let releaseResources: () => void = () => undefined
            try {
                const lease = await this.runtimeResources.acquire({
                    ownerId: 'recommendation-v5-shadow',
                    taskType: 'recommendation-v5-shadow',
                    priority: 'background',
                    resources: {
                        'provider-network': 1,
                        'cpu-analysis': 1,
                        'sqlite-write-heavy': 1
                    }
                })
                releaseResources = () => lease.release()
                const result =
                    await this.runRecommendationV5ShadowRetrieval(
                        input,
                        {
                            checkpoint: () =>
                                this.recommendationV5ShadowCheckpoint(),
                            onProgress: (progress) => {
                                const controlState =
                                    this.recommendationV5ShadowProgress.state
                                this.recommendationV5ShadowProgress = {
                                    ...this.recommendationV5ShadowProgress,
                                    ...progress,
                                    state:
                                        controlState === 'pausing' ||
                                        controlState === 'cancelling'
                                            ? controlState
                                            : 'running',
                                    updatedAt: new Date().toISOString()
                                }
                            }
                        }
                    )
                this.recommendationV5ShadowResult = {
                    rawCandidateCount: result.rawCandidateCount,
                    candidateCount: result.candidateCount,
                    rankedCandidateCount: result.ranking.candidateCount,
                    selectedCount: result.diversity.selectedCount,
                    audit: result.audit
                }
                this.recommendationV5ShadowProgress = {
                    ...this.recommendationV5ShadowProgress,
                    state: 'complete',
                    phase: 'complete',
                    done: 7,
                    total: 7,
                    rawCandidateCount: result.rawCandidateCount,
                    candidateCount: result.candidateCount,
                    rankedCandidateCount: result.ranking.candidateCount,
                    selectedCount: result.diversity.selectedCount,
                    poolId: result.audit.poolId,
                    cycleId: result.audit.cycleId,
                    modelVersion: result.audit.modelVersion,
                    updatedAt: new Date().toISOString()
                }
            } catch (error) {
                if (error instanceof RecommendationV5ShadowCancelledError)
                    this.recommendationV5ShadowProgress = {
                        ...this.recommendationV5ShadowProgress,
                        state: 'cancelled',
                        phase: 'cancelled',
                        updatedAt: new Date().toISOString()
                    }
                else
                    this.recommendationV5ShadowProgress = {
                        ...this.recommendationV5ShadowProgress,
                        state: 'failed',
                        phase: 'failed',
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        updatedAt: new Date().toISOString()
                    }
            } finally {
                releaseResources()
                this.finishRecommendationV5ShadowControl()
            }
        })()
        this.recommendationV5ShadowRun = run
        void run.catch(() => {
            // The task records its authoritative terminal state above.
        })
        return {
            started: true,
            ...this.recommendationV5ShadowStatus()
        }
    }

async runRecommendationV5ShadowRetrieval(
        input: Record<string, unknown>,
        runtime: {
            checkpoint?: () => Promise<void> | void
            onProgress?: (
                progress: Partial<RecommendationV5ShadowTaskProgress>
            ) => void
        } = {}
    ) {
        if (
            String(input.confirmation ?? '').trim() !==
            RECOMMENDATION_V5_SHADOW_RETRIEVAL_CONFIRMATION
        )
            throw new Error(
                'Explicit shadow retrieval confirmation is required'
            )
        runtime.onProgress?.({
            phase: 'planning',
            done: 0,
            total: 7
        })
        await runtime.checkpoint?.()
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
        runtime.onProgress?.({
            phase: 'retrieving',
            done: 1,
            total: 7
        })
        await runtime.checkpoint?.()
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
            {
                maxCandidates,
                checkpoint: runtime.checkpoint,
                onProgress: (progress) =>
                    runtime.onProgress?.({
                        phase: 'retrieving',
                        done: 1,
                        total: 7,
                        retrievalDone: progress.done,
                        retrievalTotal: progress.total,
                        rawCandidateCount: progress.candidateCount
                    })
            }
        )
        await runtime.checkpoint?.()
        runtime.onProgress?.({
            phase: 'hygiene',
            done: 2,
            total: 7,
            rawCandidateCount: result.candidateCount
        })
        const state = new RecommendationPolicyStoreV5(
            this.database
        ).state()
        const hygiene = applyCandidateHygieneV5(
            result.candidates,
            catalog,
            state
        )
        await runtime.checkpoint?.()
        runtime.onProgress?.({
            phase: 'ranking',
            done: 3,
            total: 7,
            rawCandidateCount: result.candidateCount,
            candidateCount: hygiene.outputCandidateCount
        })
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
        await runtime.checkpoint?.()
        runtime.onProgress?.({
            phase: 'diversity',
            done: 4,
            total: 7,
            rawCandidateCount: result.candidateCount,
            candidateCount: hygiene.outputCandidateCount,
            rankedCandidateCount: ranking.candidateCount
        })
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
        for (let rowIndex = 0; rowIndex < ranking.rows.length; rowIndex += 1) {
            if (rowIndex % 25 === 0) await runtime.checkpoint?.()
            const row = ranking.rows[rowIndex]
            const fandomKeys = new Set<string>()
            const tagKeys = new Set<string>()
            if (registry)
                for (const rawTag of projectComicTagSignalsV1(row.comic, state, false).tags) {
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
                if (!rawTagParticipatesV1(state, comicTagProviderV1(row.comic), rawTag)) continue
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
        await runtime.checkpoint?.()
        runtime.onProgress?.({
            phase: 'audit',
            done: 5,
            total: 7,
            rawCandidateCount: result.candidateCount,
            candidateCount: hygiene.outputCandidateCount,
            rankedCandidateCount: ranking.candidateCount,
            selectedCount: diversity.selectedCount
        })
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
        await runtime.checkpoint?.()
        runtime.onProgress?.({
            phase: 'persisting',
            done: 6,
            total: 7,
            rawCandidateCount: result.candidateCount,
            candidateCount: hygiene.outputCandidateCount,
            rankedCandidateCount: ranking.candidateCount,
            selectedCount: diversity.selectedCount
        })
        const cycleId = `v5-shadow:${randomUUID()}`
        const modelVersion = shadowPipelineModelVersionV5()
        await runtime.checkpoint?.()
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
        runtime.onProgress?.({
            phase: 'complete',
            done: 7,
            total: 7,
            rawCandidateCount: result.candidateCount,
            candidateCount: hygiene.outputCandidateCount,
            rankedCandidateCount: ranking.candidateCount,
            selectedCount: diversity.selectedCount,
            poolId: audit.id,
            cycleId,
            modelVersion
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
}
