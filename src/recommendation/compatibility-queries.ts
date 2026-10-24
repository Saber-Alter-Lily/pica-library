import type { RecommendationResult } from '../library/types'
import {
    LEGACY_RECOMMENDATION_BATCH_SIZE,
    type LegacySessionState,
    type LegacySessionReadPort,
    type AdaptiveSessionState,
    type AdaptiveSessionReadPort
} from './legacy-ports'

/** Missing state is an ephemeral per-controller draft, not a persisted generation. */
export function readLegacySessionState(
    read: LegacySessionReadPort,
    draft: () => LegacySessionState
) {
    const existing = read.readState()
    return existing?.cycleId
        ? {
              persisted: true,
              state: {
                  cycleId: existing.cycleId,
                  currentSessionNo: Math.max(
                      0,
                      Number(existing.currentSessionNo ?? 0)
                  ),
                  currentBatchIndex: Math.max(
                      0,
                      Number(existing.currentBatchIndex ?? 0)
                  )
              }
          }
        : { persisted: false, state: draft() }
}

export function readAdaptiveSessionState(
    read: AdaptiveSessionReadPort,
    draft: () => AdaptiveSessionState
) {
    const existing = read.readState()
    return existing?.cycleId
        ? { persisted: true, state: existing }
        : { persisted: false, state: draft() }
}

export function legacySessionResponse(
    read: LegacySessionReadPort,
    state: LegacySessionState,
    session: NonNullable<
        ReturnType<LegacySessionReadPort['recommendationSession']>
    >,
    profile: unknown = null,
    audit?: unknown,
    generatedRecommendations?: RecommendationResult[]
) {
    const recommendations = (
        generatedRecommendations ?? read.recommendationRecords(session.comicIds)
    ).filter((item) => !item.comic.isFavorite)
    return {
        cycleId: state.cycleId,
        sessionId: session.id,
        sessionNo: session.sessionNo,
        currentBatchIndex: state.currentBatchIndex,
        batchSize: LEGACY_RECOMMENDATION_BATCH_SIZE,
        batchCount: Math.max(
            1,
            Math.ceil(recommendations.length / LEGACY_RECOMMENDATION_BATCH_SIZE)
        ),
        recommendations,
        profile,
        audit,
        seenCount: read.recommendationSeen(state.cycleId).length,
        exhausted: session.exhausted,
        nextSessionReady: Boolean(
            read.recommendationSession(state.cycleId, session.sessionNo + 1)
        ),
        message: session.exhausted ? '暂时没有更多未展示推荐。' : undefined
    }
}

/** No generation callback, writer, account or allocator capability. */
export function legacySessionStatus(
    read: LegacySessionReadPort,
    state: LegacySessionState
) {
    if (!state.currentSessionNo)
        return {
            ...state,
            preparing: true,
            recommendations: [],
            nextSessionReady: false,
            seenCount: 0
        }
    const session = read.recommendationSession(
        state.cycleId,
        state.currentSessionNo
    )
    if (!session)
        return {
            ...state,
            preparing: true,
            recommendations: [],
            nextSessionReady: false,
            seenCount: read.recommendationSeen(state.cycleId).length
        }
    return { ...legacySessionResponse(read, state, session), preparing: false }
}

/** Stored-only adaptive view; this function cannot ensure/create a candidate pool. */
export function adaptiveSessionStatus(
    read: AdaptiveSessionReadPort,
    state: AdaptiveSessionState
) {
    const pool = state.poolId ? read.getV3CandidatePool(state.poolId) : null
    const batches = pool ? read.listV3Batches(pool.id) : []
    const last = batches.at(-1)
    return {
        ...state,
        adaptive: true,
        contextId: last?.contextId ?? null,
        recommendations: last ? read.recommendationRecords(last.itemIds) : [],
        seenCount: read.recommendationSeen(state.cycleId).length,
        preparing: !pool
    }
}
