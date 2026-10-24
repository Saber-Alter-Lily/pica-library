import pLimit from 'p-limit'
import type { LibraryDatabase } from '../library/database'
import type { SourceRuntime } from '../sources/source-policy'
import type {
    LegacyRecallPorts,
    LegacySessionState,
    LegacySessionReadPort,
    LegacySessionWritePort,
    AdaptiveSessionState,
    AdaptiveSessionReadPort,
    AdaptiveSessionWritePort
} from '../recommendation/legacy-ports'

/** Only the application owns concrete credentials, SDK, clock, scheduler and SQLite. */
export function legacyRecallPorts(input: {
    database: LibraryDatabase
    tagPolicy: LegacyRecallPorts['tagPolicy']
    connect: () => Promise<import('../sdk').Pica>
    sources: SourceRuntime
    convert: LegacyRecallPorts['convert']
}): LegacyRecallPorts {
    const database = input.database
    return Object.freeze({
        read: Object.freeze({
            listComics: database.listComics.bind(database),
            listUserEvents: database.listUserEvents.bind(database),
            listRecommendationEdges:
                database.listRecommendationEdges.bind(database)
        }),
        write: Object.freeze({
            recordRecommendationEdge:
                database.recordRecommendationEdge.bind(database),
            importCatalog: database.importCatalog.bind(database)
        }),
        tagPolicy: () =>
            Object.freeze({ tagPolicy: input.tagPolicy().tagPolicy }),
        convert: input.convert,
        openProvider: async () => {
            const lease = input.sources.acquire('pica')
            const revision = input.sources.snapshot().revision
            const sdk = await input.connect()
            const assertCurrent = () => {
                lease.check()
                if (input.sources.snapshot().revision !== revision)
                    throw new Error(
                        'Source choices changed during legacy recommendation recall; no recalled catalog was saved'
                    )
            }
            assertCurrent()
            return Object.freeze({
                client: Object.freeze({
                    Order: sdk.Order,
                    related: sdk.related.bind(sdk),
                    comicsPage: sdk.comicsPage.bind(sdk),
                    search: sdk.search.bind(sdk)
                }),
                assertCurrent
            })
        },
        runtime: Object.freeze({
            nowMs: () => Date.now(),
            nowIso: () => new Date().toISOString(),
            limit: pLimit
        })
    })
}

export function legacySessionPorts(database: LibraryDatabase): {
    read: LegacySessionReadPort
    write: LegacySessionWritePort
} {
    return Object.freeze({
        read: Object.freeze({
            readState: () =>
                database.getAppState<LegacySessionState>(
                    'recommendation.activeCycle'
                ),
            recommendationSession:
                database.recommendationSession.bind(database),
            recommendationRecords:
                database.recommendationRecords.bind(database),
            recommendationSeen: database.recommendationSeen.bind(database)
        }),
        write: Object.freeze({
            writeState: (state: LegacySessionState) => {
                database.setAppState('recommendation.activeCycle', state)
            },
            saveRecommendationSession:
                database.saveRecommendationSession.bind(database)
        })
    })
}

export function adaptiveSessionPorts(database: LibraryDatabase): {
    read: AdaptiveSessionReadPort
    write: AdaptiveSessionWritePort
} {
    return Object.freeze({
        read: Object.freeze({
            readState: () =>
                database.getAppState<AdaptiveSessionState>(
                    'recommendation.v3.activeCycle'
                ),
            getV3CandidatePool: database.getV3CandidatePool.bind(database),
            recommendationSeen: database.recommendationSeen.bind(database),
            recommendationRecords:
                database.recommendationRecords.bind(database),
            listComics: database.listComics.bind(database),
            listUserEvents: database.listUserEvents.bind(database),
            listV3Batches: database.listV3Batches.bind(database)
        }),
        write: Object.freeze({
            writeState: (state: AdaptiveSessionState) => {
                database.setAppState('recommendation.v3.activeCycle', state)
            },
            saveV3CandidatePool: database.saveV3CandidatePool.bind(database),
            allocateRecommendationIds:
                database.allocateRecommendationIds.bind(database),
            saveV3Batch: database.saveV3Batch.bind(database),
            atomic: <T>(operation: () => T): T =>
                database.withAppStateTransaction(operation)
        })
    })
}
