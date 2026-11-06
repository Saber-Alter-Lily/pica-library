import { randomUUID } from 'node:crypto'
import type { LibraryDatabase } from '../library/database'
import type { LegacyGeneratedRecommendations } from '../recommendation/legacy-ports'
import { AdaptiveRecommendationBatches } from '../recommendation/adaptive-batches'
import { adaptiveSessionPorts } from '../services/legacy-recommendation-adapter'

/** Compatibility application adapter; no duplicated adaptive rank/batch implementation. */
export class AdaptiveRecommendationSession extends AdaptiveRecommendationBatches {
    constructor(
        database: LibraryDatabase,
        generate: (
            limit: number,
            appSessionId?: string | null
        ) => Promise<LegacyGeneratedRecommendations>
    ) {
        const { read, write } = adaptiveSessionPorts(database)
        super(read, write, generate, { createId: randomUUID })
    }
}
