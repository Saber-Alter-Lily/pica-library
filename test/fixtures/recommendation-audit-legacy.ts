/** Frozen NEXT58 methods, not a facade over the replacement audit module. */
import type { LibraryDatabase } from '../../src/library/database'
import type { buildVisualRepresentationQcV5 } from '../../src/recommendation-v5/visual-representation-qc'
import type { buildVisualAuthorAtlasV5 } from '../../src/recommendation-v5/visual-author-atlas'
import { runtimeRegistryDirectory } from '../../src/recommendation-v3/runtime-registry-path'
import { loadTagRegistryV3, resolveTagV3 } from '../../src/recommendation-v3/tag-resolution-v3'
import { RecommendationPolicyStoreV5 } from '../../src/recommendation-v5/policy-store'
import { buildBehaviorEvidenceLedgerV5 } from '../../src/recommendation-v5/behavior-evidence'
import { buildCandidateChannelPlanV5 } from '../../src/recommendation-v5/candidate-channels'
import { compileCandidateProviderRoutesV5, deriveObservedEhCanonicalBindingsV5 } from '../../src/recommendation-v5/provider-query-compiler'
import { buildPreferenceTimescalesV5 } from '../../src/recommendation-v5/preference-timescales'
import { shadowPipelineModelVersionV5, shadowPipelineVersionsV5 } from '../../src/recommendation-v5/shadow-pipeline'
import { evaluateP3PromotionGateV5 } from '../../src/recommendation-v5/promotion-gate'
import { buildVisualStyleFamiliesV5 } from '../../src/recommendation-v5/visual-style-families'
import { evaluateVisualActivationGateV5 } from '../../src/recommendation-v5/visual-activation-gate'
import { buildRetrospectiveBenchmarkV5 } from '../../src/recommendation-v5/retrospective-benchmark'
import { evaluateSteerabilityV5 } from '../../src/recommendation-v5/steerability-audit'
import { buildEvaluationFrameworkV5 } from '../../src/recommendation-v5/evaluation-framework'
import { compareRetrospectiveBenchmarksV5 } from '../../src/recommendation-v5/benchmark-comparison'
import { evaluateAdvancedLearningGateV5, type AdvancedLearningDirectionV5 } from '../../src/recommendation-v5/advanced-learning-gate'
import { normalizePreferenceKey } from '../../src/recommendation-v5/portable-policy'
import { privateTagForSignalV1 } from '../../src/tags/policy'

export const AUDIT_ORACLE_SOURCE_V5='fe360d315d53c597042307a47e6e81fc14c9a1ef'
export interface FrozenAuditHooksV5 {
    visualRepresentationQc(): ReturnType<typeof buildVisualRepresentationQcV5>
    visualAuthorAtlas(): ReturnType<typeof buildVisualAuthorAtlasV5>
    eligibility: {pica:boolean;eh:boolean;exh:boolean}
}
export class FrozenRecommendationAuditV5 {
    constructor(readonly database: LibraryDatabase,private readonly hooks:FrozenAuditHooksV5){}
    private ehProvider={hasSession:()=>this.hooks.eligibility.exh}
    private providerService(){return {providerStatus:()=>({pica:{search:this.hooks.eligibility.pica},eh:{search:this.hooks.eligibility.eh,exHentai:this.hooks.eligibility.exh}})}}
    private visualRepresentationQc(){return this.hooks.visualRepresentationQc()}
    private visualAuthorAtlas(){return this.hooks.visualAuthorAtlas()}
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
                if (privateTagForSignalV1(snapshot, signal.key)) return [{ ...signal, facet: 'PRIVATE' }]
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
}
