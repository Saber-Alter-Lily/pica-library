import { randomUUID } from 'node:crypto'
import type { LibraryDatabase } from '../library/database'
import { RecommendationCycleCommandsV3 } from '../recommendation/cycle-commands'
import type {
    RecommendationCycleBuildPortV3,
    V3CycleVersions
} from '../recommendation/ports'
import { recommendationCycleWriteStoreV3 } from '../services/recommendation-cycle-store'

export {
    CYCLE_COORDINATOR_VERSION,
    MAX_VISIBLE_BATCHES_PER_CYCLE,
    RECENT_CYCLE_COOLDOWN_COUNT
} from '../recommendation/ports'
export type {
    BuiltRecommendationCycleV3,
    V3CycleVersions
} from '../recommendation/ports'

/** Existing application API retained; algorithms and wire state are unchanged. */
export class CycleCoordinatorV3 extends RecommendationCycleCommandsV3 {
    constructor(
        database: LibraryDatabase,
        buildCycle: RecommendationCycleBuildPortV3,
        versions: V3CycleVersions
    ) {
        super(recommendationCycleWriteStoreV3(database), buildCycle, versions, {
            createId: randomUUID,
            now: () => new Date().toISOString()
        })
    }
}
