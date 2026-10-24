import type { LibraryDatabase } from '../library/database'
import type { Comic } from '../types'
import type { Pica } from '../sdk'
import type { FavoriteRecord } from '../library/types'
import type { SourceRuntime } from '../sources/source-policy'
import type { ProviderService } from './provider-service'
import type { IntentCycleHistory } from '../recommendation-v3/intent-planner-v3'
import type {
    RecommendationBuildPortsV3,
    RecommendationBuildVisualInputV3
} from '../recommendation/build-ports'
import { picaEhBuildProviderV3 } from './recommendation-retrieval-adapter'
import { RecommendationPolicyStoreV5 } from '../recommendation-v5/policy-store'
import {
    loadTagRegistryV3,
    resolveTagV3
} from '../recommendation-v3/tag-resolution-v3'
import { runtimeRegistryDirectory } from '../recommendation-v3/runtime-registry-path'
import {
    buildFinalLifetimeProfileV3,
    FINAL_PROFILE_VERSION
} from '../recommendation-v3/final-profile'
import { INTENT_PLANNER_VERSION } from '../recommendation-v3/intent-planner-v3'
import { QUERY_TRANSLATOR_VERSION } from '../recommendation-v3/provider-query-translator'
import { RETRIEVER_VERSION } from '../recommendation-v3/retriever-v3'
import { RANKER_ADAPTER_VERSION } from '../recommendation-v3/ranker-adapter-v3'
import { VISUAL_RERANK_VERSION } from '../recommendation-v4/visual-style'
import { BATCH_ALLOCATOR_VERSION } from '../recommendation-v3/batch-allocator-v3'

export interface RecommendationBuildApplicationV3 {
    database: LibraryDatabase
    sources: Pick<SourceRuntime, 'isEnabled' | 'acquire'>
    connectPica(): Promise<Pica>
    externalProvider(): ProviderService
    convertPica(comic: Comic): FavoriteRecord
    visualSettings(): RecommendationBuildVisualInputV3['settings']
    checkpoint: RecommendationBuildPortsV3['checkpoint']
    progress: RecommendationBuildPortsV3['progress']
    assertSourcesCurrent: RecommendationBuildPortsV3['assertSourcesCurrent']
}

/** Application-only binding: credentials, concrete storage and registry I/O stop here. */
export function recommendationBuildPortsV3(
    input: RecommendationBuildApplicationV3
): RecommendationBuildPortsV3 {
    const database = input.database
    return {
        evidence: {
            catalog: () => database.listComics({ limit: 10000 }),
            // An explicit build may initialize legacy policy as before. This is
            // deliberately not the query-only read-store capability.
            policy: () => new RecommendationPolicyStoreV5(database).state(),
            readingComicIds: () =>
                database.readingProgress().map((item) => item.comicId),
            feedback: () => database.recommendationFeedback(),
            intentHistory: () =>
                database.listV3CandidatePools(50).flatMap((pool) => {
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
                }),
            graphEdges: () =>
                database
                    .listRecommendationEdges()
                    .map((edge) => ({
                        sourceComicId: edge.sourceComicId,
                        targetComicId: edge.targetComicId,
                        confidence: edge.confidence,
                        observationCount: edge.observationCount
                    })),
            visualInput: () => ({
                settings: input.visualSettings(),
                embeddings: database.listVisualEmbeddings()
            })
        },
        openProvider: async () => {
            const pica = input.sources.isEnabled('pica')
                ? await input.connectPica()
                : null
            const external = input.externalProvider()
            return picaEhBuildProviderV3({
                pica,
                external,
                checkpoint: input.checkpoint,
                ehEnabled: () => input.sources.isEnabled('eh'),
                importPica: (comics) => {
                    input.sources.acquire('pica')
                    const records = comics.map(input.convertPica)
                    database.importCatalog(records, 'pica:recommendations')
                    return records.flatMap((record) => {
                        const stored = database.getComic(record.comicId)
                        return stored ? [stored] : []
                    })
                },
                storedRecords: (records) =>
                    records.flatMap((record) => {
                        const stored = database.getComic(record.comicId)
                        return stored ? [stored] : []
                    })
            })
        },
        loadSemantics: () => {
            const registry = loadTagRegistryV3(runtimeRegistryDirectory())
            return {
                profile: (records) =>
                    buildFinalLifetimeProfileV3(records, { registry }),
                resolve: (raw) => resolveTagV3(raw, registry)
            }
        },
        checkpoint: input.checkpoint,
        progress: input.progress,
        assertSourcesCurrent: input.assertSourcesCurrent,
        versions: {
            profileVersion: FINAL_PROFILE_VERSION,
            registryVersion: 'PICA Registry V3',
            rankerModelVersion: `${RANKER_ADAPTER_VERSION}/${VISUAL_RERANK_VERSION}`,
            candidatePoolVersion: `${INTENT_PLANNER_VERSION}/${QUERY_TRANSLATOR_VERSION}/${RETRIEVER_VERSION}`,
            allocatorVersion: BATCH_ALLOCATOR_VERSION
        }
    }
}
