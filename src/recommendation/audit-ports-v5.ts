import type { StoredComic } from '../library/types'
import type { UserEvent } from '../recommendation-v3/types'
import type {
    PortablePolicySnapshotV5,
    PortablePolicyStateV5
} from '../recommendation-v5/portable-policy'
import type { buildVisualRepresentationQcV5 } from '../recommendation-v5/visual-representation-qc'
import type { buildVisualAuthorAtlasV5 } from '../recommendation-v5/visual-author-atlas'
import type { RecommendationPoolV3 } from './ports'

/** No SQL, write/allocate/build callback, account session or filesystem handle. */
export interface RecommendationAuditReadPortV5 {
    listCandidatePoolsByModelVersionPrefix(
        prefix: string,
        limit: number
    ): RecommendationPoolV3[]
    listUserEvents(options: { limit: number }): UserEvent[]
    listComics(options: { limit: number }): StoredComic[]
    readPolicy(): PortablePolicyStateV5
    readSnapshot(): PortablePolicySnapshotV5
    loadTagResolver(): (raw: string) => {
        resolutionType: string
        resolutionStatus: string
        facet: string
    }
    providerEligibility(): { pica: boolean; eh: boolean; exh: boolean }
    visualRepresentationQc(): ReturnType<typeof buildVisualRepresentationQcV5>
    visualAuthorAtlas(): ReturnType<typeof buildVisualAuthorAtlasV5>
}
