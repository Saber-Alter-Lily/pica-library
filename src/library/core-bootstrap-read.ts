import { PRODUCT_VERSION } from '../version'
import { appCapabilities } from '../app-capabilities'
import type { LibraryDatabase } from './database'

/**
 * Shared original Desktop read-only application bootstrap. Provider and source
 * service constructors are absent; the actual DB is the single authority.
 */
export type CoreBootstrapDatabase = Pick<
    LibraryDatabase,
    'file' | 'summary' | 'reconcileLibraryCounts' | 'listAuthors'
>

export function coreBootstrapStatus(
    database: CoreBootstrapDatabase,
    favoritesSyncProgress: unknown
) {
    return {
        application: 'Pica Library',
        mode: 'connected' as const,
        version: PRODUCT_VERSION,
        database: database.file,
        summary: database.summary(),
        reconciliation: database.reconcileLibraryCounts(),
        favoritesSyncProgress
    }
}

export function coreBootstrapAuthors(database: CoreBootstrapDatabase) {
    return database.listAuthors()
}

export type CoreBootstrapComposition =
    | {
        kind: 'provider-enabled'
        desktopStatus?: Record<string, unknown> | null
        favoriteMutation: boolean
        providers: unknown
        sourceModules: unknown
        externalSources: unknown
    }
    | {
        kind: 'source-free'
        desktopStatus?: Record<string, unknown> | null
    }

/**
 * Real feature availability, not a promise that a bundled provider exists.
 * Local-only composition advertises only the features the independent Reader,
 * shelf and local catalogue runtime has demonstrated. It cannot advertise
 * recommendation/remote-source activation until those ports are composed.
 */
export function coreBootstrapCapabilities(
    composition: CoreBootstrapComposition
) {
    const enabled = composition.kind === 'provider-enabled'
    const base = appCapabilities(
        enabled ? composition.favoriteMutation : false,
        process.platform, process.arch, composition.desktopStatus
    )
    if (enabled) return {
        ...base,
        providers: composition.providers,
        sourceModules: composition.sourceModules,
        externalSources: composition.externalSources
    }
    return {
        ...base,
        features: {
            ...base.features,
            providerFavoriteMutation: false,
            recommendationSessions: false,
            recommendationV3: false,
            adaptiveRecommendationBatches: false,
            behaviorLearning: false,
            multiTagPreference: false,
            previewPages: false
        },
        providers: {},
        sourceModules: [],
        externalSources: { schemaVersion: 1, revision: 0, enabled: [] }
    }
}
