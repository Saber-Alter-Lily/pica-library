import { createHash } from 'node:crypto'
import type { LibraryDatabase } from '../library/database'
import type { StoredComic } from '../library/types'
import type {
    WorkIdentityReadPortV5,
    WorkIdentityWritePortV5,
    WorkIdentityTaskReadPortV5,
    WorkIdentityTaskWritePortV5
} from '../identity/ports-v5'
import { RecommendationPolicyStoreV5 } from '../recommendation-v5/policy-store'

const identityFacts = (database: LibraryDatabase) =>
    Object.freeze({
        explicitDistinctPairs: Object.freeze([
            ...new RecommendationPolicyStoreV5(database).state({
                initialize: false
            }).explicitDistinctPairs
        ])
    })

/** Stored facts only. Query defaults never initialize persistent preferences. */
export function workIdentityReadPortV5(
    database: LibraryDatabase,
    catalog: () => StoredComic[]
): WorkIdentityReadPortV5 {
    return Object.freeze({
        catalog,
        policy: () => identityFacts(database),
        digestPlan: (plan) =>
            createHash('sha256').update(JSON.stringify(plan)).digest('hex'),
        getWorkIdentityBinding: database.getWorkIdentityBinding.bind(database),
        listWorkIdentityBindingsForWork:
            database.listWorkIdentityBindingsForWork.bind(database),
        listWorkIdentityDecisionsForComic:
            database.listWorkIdentityDecisionsForComic.bind(database),
        listWorkIdentityProbableEvidenceForComic:
            database.listWorkIdentityProbableEvidenceForComic.bind(database),
        listWorkIdentityBindingsByComicIds:
            database.listWorkIdentityBindingsByComicIds.bind(database),
        listVisualEmbeddings: database.listVisualEmbeddings.bind(database),
        workIdentityStorageStatus:
            database.workIdentityStorageStatus.bind(database),
        listWorkIdentityEvidence:
            database.listWorkIdentityEvidence.bind(database),
        listWorkIdentityDecisions:
            database.listWorkIdentityDecisions.bind(database),
        listAllWorkIdentityDecisions:
            database.listAllWorkIdentityDecisions.bind(database),
        listAllWorkIdentityBindings:
            database.listAllWorkIdentityBindings.bind(database),
        listWorkIdentityMaterializationRuns:
            database.listWorkIdentityMaterializationRuns.bind(database)
    } satisfies WorkIdentityReadPortV5)
}

/** Reuses the existing synchronous nested-safe SQLite savepoint; no new schema/engine. */
export function workIdentityWritePortV5(
    database: LibraryDatabase
): WorkIdentityWritePortV5 {
    return Object.freeze({
        saveWorkIdentityEvidence:
            database.saveWorkIdentityEvidence.bind(database),
        prepareWorkIdentityMaterializationRun:
            database.prepareWorkIdentityMaterializationRun.bind(database),
        clearWorkIdentityDecision:
            database.clearWorkIdentityDecision.bind(database),
        saveWorkIdentityDecision:
            database.saveWorkIdentityDecision.bind(database),
        workIdentityStorageStatus:
            database.workIdentityStorageStatus.bind(database),
        setExplicitDistinctPair: (left, right, distinct) =>
            new RecommendationPolicyStoreV5(database).setExplicitDistinctPair(
                left,
                right,
                distinct
            ),
        atomic: <T>(operation: () => T): T =>
            database.withAppStateTransaction(operation)
    } satisfies WorkIdentityWritePortV5)
}

/** Runtime object keys are narrow too: the background task cannot adjudicate or bind works. */
export function workIdentityTaskPortsV5(
    database: LibraryDatabase,
    catalog: () => StoredComic[]
): { read: WorkIdentityTaskReadPortV5; write: WorkIdentityTaskWritePortV5 } {
    return Object.freeze({
        read: Object.freeze({
            catalog,
            policy: () => identityFacts(database)
        }),
        write: Object.freeze({
            saveWorkIdentityEvidence:
                database.saveWorkIdentityEvidence.bind(database)
        })
    })
}
