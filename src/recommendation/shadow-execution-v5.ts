import type {
    RecommendationShadowPortsV5,
    RecommendationShadowRuntimeV5
} from './shadow-ports-v5'
import { RECOMMENDATION_V5_SHADOW_RETRIEVAL_CONFIRMATION } from './shadow-ports-v5'
import { parseEhTag } from '../providers/eh-tags'
import { executeShadowRetrievalV5 } from '../recommendation-v5/shadow-retrieval'
import { applyCandidateHygieneV5 } from '../recommendation-v5/candidate-hygiene'
import { rankShadowCandidatesV5 } from '../recommendation-v5/relevance-ranker'
import {
    diversifyShadowBatchV5,
    type CandidateSemanticDiversityV5
} from '../recommendation-v5/batch-diversity'
import { auditShadowCorrectnessV5 } from '../recommendation-v5/correctness-audit'
import { buildVisualCandidateCoverageV5 } from '../recommendation-v5/visual-candidate-coverage'
import {
    shadowPipelineModelVersionV5,
    shadowPipelineVersionsV5
} from '../recommendation-v5/shadow-pipeline'
import { normalizePreferenceKey } from '../recommendation-v5/portable-policy'
import {
    projectComicTagSignalsV1,
    rawTagParticipatesV1,
    comicTagProviderV1
} from '../tags/policy'

/** Existing manual audit pipeline; no serving activation, raw-catalog persistence or model execution. */
export async function executeRecommendationShadowV5(
    input: Record<string, unknown>,
    ports: RecommendationShadowPortsV5,
    runtime: RecommendationShadowRuntimeV5 = {}
) {
    if (
        String(input.confirmation ?? '').trim() !==
        RECOMMENDATION_V5_SHADOW_RETRIEVAL_CONFIRMATION
    )
        throw new Error('Explicit shadow retrieval confirmation is required')
    const checkpoint = async () => {
        await runtime.checkpoint?.()
        ports.assertSourcesCurrent()
    }
    runtime.onProgress?.({
        phase: 'planning',
        done: 0,
        total: 7
    })
    await checkpoint()
    const appSessionId = input.appSessionId ? String(input.appSessionId) : null
    const eventLimit = Math.max(
        1,
        Math.min(5000, Math.floor(Number(input.limit) || 5000))
    )
    const maxCandidates = Math.max(
        12,
        Math.min(1000, Math.floor(Number(input.maxCandidates) || 500))
    )
    const plan = ports.plan(appSessionId, eventLimit)
    const catalog = ports.evidence.catalog()
    const provider = ports.openProvider()
    runtime.onProgress?.({
        phase: 'retrieving',
        done: 1,
        total: 7
    })
    await checkpoint()
    const result = await executeShadowRetrievalV5(plan, provider, catalog, {
        maxCandidates,
        checkpoint,
        onProgress: (progress) =>
            runtime.onProgress?.({
                phase: 'retrieving',
                done: 1,
                total: 7,
                retrievalDone: progress.done,
                retrievalTotal: progress.total,
                rawCandidateCount: progress.candidateCount
            })
    })
    await checkpoint()
    runtime.onProgress?.({
        phase: 'hygiene',
        done: 2,
        total: 7,
        rawCandidateCount: result.candidateCount
    })
    const state = ports.evidence.policy()
    const hygiene = applyCandidateHygieneV5(result.candidates, catalog, state)
    await checkpoint()
    runtime.onProgress?.({
        phase: 'ranking',
        done: 3,
        total: 7,
        rawCandidateCount: result.candidateCount,
        candidateCount: hygiene.outputCandidateCount
    })
    const timescales = ports.timescales(appSessionId, eventLimit)
    const ranking = rankShadowCandidatesV5(
        hygiene.candidates,
        timescales,
        state,
        catalog
    )
    await checkpoint()
    runtime.onProgress?.({
        phase: 'diversity',
        done: 4,
        total: 7,
        rawCandidateCount: result.candidateCount,
        candidateCount: hygiene.outputCandidateCount,
        rankedCandidateCount: ranking.candidateCount
    })
    const semanticDiversity: Record<string, CandidateSemanticDiversityV5> = {}
    let resolveTag: ReturnType<
        RecommendationShadowPortsV5['loadTagResolver']
    > | null = null
    try {
        resolveTag = ports.loadTagResolver()
    } catch {
        resolveTag = null
    }
    for (let rowIndex = 0; rowIndex < ranking.rows.length; rowIndex += 1) {
        if (rowIndex % 25 === 0) await checkpoint()
        const row = ranking.rows[rowIndex]
        const fandomKeys = new Set<string>()
        const tagKeys = new Set<string>()
        if (resolveTag)
            for (const rawTag of projectComicTagSignalsV1(
                row.comic,
                state,
                false
            ).tags) {
                const resolved = resolveTag(rawTag)
                if (
                    resolved.resolutionStatus !== 'RESOLVED' ||
                    resolved.resolutionType === 'SAFETY' ||
                    !resolved.recommendationEligible
                )
                    continue
                if (resolved.facet === 'FANDOM_IP')
                    fandomKeys.add(resolved.canonicalKey)
                else if (resolved.facet && resolved.facet !== 'CREATOR_ENTITY')
                    tagKeys.add(`${resolved.facet}:${resolved.canonicalKey}`)
            }
        const rawEhTags = Array.isArray(row.comic.providerMetadata?.rawTags)
            ? row.comic.providerMetadata.rawTags.map(String)
            : []
        for (const rawTag of rawEhTags) {
            if (
                !rawTagParticipatesV1(
                    state,
                    comicTagProviderV1(row.comic),
                    rawTag
                )
            )
                continue
            const parsed = parseEhTag(rawTag)
            const value = normalizePreferenceKey(parsed.value)
            if (!value || !parsed.namespace) continue
            if (parsed.facet === 'FANDOM_IP') fandomKeys.add(value)
            else if (
                parsed.facet &&
                !['CREATOR_ENTITY', 'LANGUAGE', 'FANDOM_IP'].includes(
                    parsed.facet
                )
            )
                tagKeys.add(`${parsed.facet}:${value}`)
        }
        semanticDiversity[normalizePreferenceKey(row.comic.comicId)] = {
            fandomKeys: [...fandomKeys].sort(),
            tagKeys: [...tagKeys].sort()
        }
    }
    const diversity = diversifyShadowBatchV5(
        ranking.rows,
        semanticDiversity,
        Math.max(1, Math.min(50, Math.floor(Number(input.batchSize) || 12)))
    )
    await checkpoint()
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
        embeddings: ports.evidence.embeddings(),
        catalog,
        analysisBudget: (() => {
            const requested = Number(input.visualAnalysisBudget)
            return Math.max(
                0,
                Math.min(
                    100,
                    Number.isFinite(requested) ? Math.floor(requested) : 24
                )
            )
        })()
    })
    await checkpoint()
    runtime.onProgress?.({
        phase: 'persisting',
        done: 6,
        total: 7,
        rawCandidateCount: result.candidateCount,
        candidateCount: hygiene.outputCandidateCount,
        rankedCandidateCount: ranking.candidateCount,
        selectedCount: diversity.selectedCount
    })
    const cycleId = ports.createCycleId()
    const modelVersion = shadowPipelineModelVersionV5()
    await checkpoint()
    const audit = ports.audit.save({
        appSessionId,
        cycleId,
        candidateIds: ranking.rows.map((item) => item.comic.comicId),
        modelVersion,
        telemetry: {
            mode: result.mode,
            pipelineVersions: shadowPipelineVersionsV5(),
            servingImpact: result.servingImpact,
            persistCandidates: result.persistCandidates,
            providerFailureIsolation: result.providerFailureIsolation,
            readiness: result.readiness,
            rawCandidateCount: result.candidateCount,
            hygienicCandidateCount: hygiene.outputCandidateCount,
            rankedCandidateCount: ranking.candidateCount,
            providerRouteSummary: plan.summary,
            sessionMode: plan.sourceSessionMode,
            sessionModePolicy: plan.sourceSessionModePolicy,
            providerBudgets: plan.sourceProviderBudgets,
            retrievalTelemetry: result.telemetry,
            hygieneTelemetry: hygiene.telemetry,
            rankingTelemetry: ranking.telemetry,
            diversityTelemetry: diversity.telemetry,
            correctnessAudit,
            visualCandidateCoverage: visualCoverage,
            diversifiedBatch: diversity.rows.map((row) => ({
                comicId: row.comic.comicId,
                batchRank: row.batchRank,
                relevanceRank: row.relevanceRank,
                score: row.score,
                allocationPass: row.allocationPass,
                diversityPenalty: row.diversityPenalty,
                providerBalanceBonus: row.providerBalanceBonus,
                diversityReasons: row.diversityReasons
            })),
            rankedEvidence: ranking.rows.slice(0, 100).map((row) => ({
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
