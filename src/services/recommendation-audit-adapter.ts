import type { LibraryDatabase } from '../library/database'
import type { RecommendationAuditReadPortV5 } from '../recommendation/audit-ports-v5'
import { RecommendationPolicyStoreV5 } from '../recommendation-v5/policy-store'
import { runtimeRegistryDirectory } from '../recommendation-v3/runtime-registry-path'
import {
    loadTagRegistryV3,
    resolveTagV3
} from '../recommendation-v3/tag-resolution-v3'
import { privateTagForSignalV1 } from '../tags/policy'

/** Preserve existing display projection; semantic asset loading belongs to the application. */
export function recommendationAuditSnapshotV5(database: LibraryDatabase) {
    const snapshot = new RecommendationPolicyStoreV5(database).snapshot({
        initialize: false
    })
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
            if (privateTagForSignalV1(snapshot, signal.key))
                return [{ ...signal, facet: 'PRIVATE' }]
            const resolved = resolveTagV3(signal.label || signal.key, registry)
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
        // Missing packaged semantics retain the existing raw-tag snapshot fallback.
        return snapshot
    }
}

export function recommendationAuditReadPortV5(
    database: LibraryDatabase,
    hooks: Pick<
        RecommendationAuditReadPortV5,
        'providerEligibility' | 'visualRepresentationQc' | 'visualAuthorAtlas'
    >
): RecommendationAuditReadPortV5 {
    const policy = new RecommendationPolicyStoreV5(database)
    return Object.freeze({
        listCandidatePoolsByModelVersionPrefix: (
            prefix: string,
            limit: number
        ) => database.listCandidatePoolsByModelVersionPrefix(prefix, limit),
        listUserEvents: (options: { limit: number }) =>
            database.listUserEvents(options),
        listComics: (options: { limit: number }) =>
            database.listComics(options),
        readPolicy: () => policy.state({ initialize: false }),
        readSnapshot: () => recommendationAuditSnapshotV5(database),
        loadTagResolver: () => {
            const registry = loadTagRegistryV3(runtimeRegistryDirectory())
            return (raw: string) => resolveTagV3(raw, registry)
        },
        providerEligibility: hooks.providerEligibility,
        visualRepresentationQc: hooks.visualRepresentationQc,
        visualAuthorAtlas: hooks.visualAuthorAtlas
    })
}
