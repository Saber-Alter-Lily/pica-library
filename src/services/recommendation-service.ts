import { randomUUID } from 'node:crypto'
import type { LibraryDatabase } from '../library/database'
import type { LegacyGeneratedRecommendations } from '../recommendation/legacy-ports'
import { LegacyRecommendationSessions } from '../recommendation/legacy-sessions'
import { legacySessionPorts } from './legacy-recommendation-adapter'

/** Existing application entry point; real session logic lives in the recommendation domain. */
export class RecommendationService extends LegacyRecommendationSessions {
    constructor(
        database: LibraryDatabase,
        generate: (limit: number) => Promise<LegacyGeneratedRecommendations>
    ) {
        const { read, write } = legacySessionPorts(database)
        super(read, write, generate, { createId: randomUUID })
    }
}
