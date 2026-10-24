import type { LibraryDatabase } from '../library/database'
import type { ProviderService } from './provider-service'
import type { RecommendationShadowPortsV5 } from '../recommendation/shadow-ports-v5'
import { RecommendationPolicyStoreV5 } from '../recommendation-v5/policy-store'
import { shadowPipelineModelVersionV5 } from '../recommendation-v5/shadow-pipeline'
import { runtimeRegistryDirectory } from '../recommendation-v3/runtime-registry-path'
import {
    loadTagRegistryV3,
    resolveTagV3
} from '../recommendation-v3/tag-resolution-v3'

export interface RecommendationShadowApplicationV5 {
    database: LibraryDatabase
    provider(): Pick<ProviderService, 'search' | 'relatedPica'>
    plan: RecommendationShadowPortsV5['plan']
    timescales: RecommendationShadowPortsV5['timescales']
    createCycleId: RecommendationShadowPortsV5['createCycleId']
    assertSourcesCurrent: RecommendationShadowPortsV5['assertSourcesCurrent']
}

/** Application binding reuses existing transport, policy normalization, Registry and SQLite. */
export function recommendationShadowPortsV5(
    input: RecommendationShadowApplicationV5
): RecommendationShadowPortsV5 {
    const database = input.database
    return Object.freeze({
        evidence: Object.freeze({
            catalog: () => database.listComics({ limit: 10000 }),
            policy: () =>
                new RecommendationPolicyStoreV5(database).state({
                    initialize: false
                }),
            embeddings: () => database.listVisualEmbeddings()
        }),
        plan: input.plan,
        timescales: input.timescales,
        openProvider: () => {
            const provider = input.provider()
            return Object.freeze({
                search: (surface, request) =>
                    provider.search(request, [surface], 'recommendations', {
                        persist: false
                    }),
                relatedPica: (comicId) =>
                    provider.relatedPica(comicId, 'recommendations', {
                        persist: false
                    })
            } satisfies ReturnType<RecommendationShadowPortsV5['openProvider']>)
        },
        loadTagResolver: () => {
            const registry = loadTagRegistryV3(runtimeRegistryDirectory())
            return (raw: string) => resolveTagV3(raw, registry)
        },
        createCycleId: input.createCycleId,
        assertSourcesCurrent: input.assertSourcesCurrent,
        audit: Object.freeze({
            save: (value) => {
                input.assertSourcesCurrent()
                if (
                    !value.cycleId.startsWith('v5-shadow:') ||
                    value.modelVersion !== shadowPipelineModelVersionV5() ||
                    value.telemetry.mode !== 'SHADOW' ||
                    value.telemetry.servingImpact !== false ||
                    value.telemetry.persistCandidates !== false
                )
                    throw new Error(
                        'Only current non-serving shadow audit records may be saved'
                    )
                return database.saveV3CandidatePool(value)
            }
        } satisfies RecommendationShadowPortsV5['audit'])
    })
}
