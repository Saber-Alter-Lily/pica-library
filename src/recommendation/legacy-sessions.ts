import type {
    LegacyGeneratedRecommendations,
    LegacySessionState,
    LegacySessionReadPort,
    LegacySessionWritePort,
    SessionRuntime
} from './legacy-ports'
import type { RecommendationResult } from '../library/types'
import {
    legacySessionResponse,
    legacySessionStatus,
    readLegacySessionState
} from './compatibility-queries'
import {
    LEGACY_RECOMMENDATION_BATCH_SIZE,
    LEGACY_RECOMMENDATION_SESSION_SIZE,
    LEGACY_RECOMMENDATION_CANDIDATE_DEPTH
} from './legacy-ports'

export class LegacyRecommendationSessions {
    static readonly batchSize = LEGACY_RECOMMENDATION_BATCH_SIZE
    static readonly sessionSize = LEGACY_RECOMMENDATION_SESSION_SIZE
    static readonly candidateDepth = LEGACY_RECOMMENDATION_CANDIDATE_DEPTH
    private initialState?: LegacySessionState
    private prewarm: Promise<unknown> | null = null
    private prewarmTarget: { cycleId: string; sessionNo: number } | null = null

    constructor(
        private readonly read: LegacySessionReadPort,
        private readonly write: LegacySessionWritePort,
        private readonly generate: (
            limit: number
        ) => Promise<LegacyGeneratedRecommendations>,
        private readonly runtime: SessionRuntime
    ) {}

    private state(): LegacySessionState {
        const { state, persisted } = readLegacySessionState(this.read, () =>
            this.draft()
        )
        if (!persisted) this.write.writeState(state)
        return state
    }

    private draft(): LegacySessionState {
        return (this.initialState ??= {
            cycleId: this.runtime.createId(),
            currentSessionNo: 0,
            currentBatchIndex: 0
        })
    }

    private saveState(state: LegacySessionState) {
        this.write.writeState(state)
        return state
    }

    private response(
        state: LegacySessionState,
        session: NonNullable<
            ReturnType<LegacySessionReadPort['recommendationSession']>
        >,
        profile: unknown = null,
        audit?: unknown,
        generatedRecommendations?: RecommendationResult[]
    ) {
        return legacySessionResponse(
            this.read,
            state,
            session,
            profile,
            audit,
            generatedRecommendations
        )
    }

    private async generateSession(cycleId: string, sessionNo: number) {
        const existing = this.read.recommendationSession(cycleId, sessionNo)
        if (existing)
            return {
                session: existing,
                profile: null,
                audit: null,
                recommendations: undefined
            }
        const seen = new Set(this.read.recommendationSeen(cycleId))
        const generated = await this.generate(
            LegacyRecommendationSessions.candidateDepth
        )
        const unique = new Map<string, RecommendationResult>()
        for (const item of generated.recommendations) {
            const id = item.comic.comicId
            if (seen.has(id) || item.comic.isFavorite || unique.has(id))
                continue
            unique.set(id, item)
            if (unique.size >= LegacyRecommendationSessions.sessionSize) break
        }
        const recommendations = [...unique.values()]
        const session = this.write.saveRecommendationSession(
            cycleId,
            sessionNo,
            recommendations.map((item) => item.comic.comicId),
            recommendations.length === 0
        )
        return {
            session,
            profile: generated.profile,
            audit: generated.audit,
            recommendations
        }
    }

    async ensureInitialPrepared() {
        const state = this.state()
        if (state.currentSessionNo > 0) {
            const current = this.read.recommendationSession(
                state.cycleId,
                state.currentSessionNo
            )
            if (current) return this.response(state, current)
        }
        const generated = await this.generateSession(state.cycleId, 1)
        const active = this.saveState({
            ...state,
            currentSessionNo: 1,
            currentBatchIndex: 0
        })
        return this.response(
            active,
            generated.session,
            generated.profile,
            generated.audit,
            generated.recommendations
        )
    }

    prewarmNextSession() {
        if (this.prewarm) return this.prewarm
        const state = this.state()
        if (!state.currentSessionNo) return Promise.resolve(null)
        const nextNo = state.currentSessionNo + 1
        if (this.read.recommendationSession(state.cycleId, nextNo))
            return Promise.resolve({ ready: true, sessionNo: nextNo })
        this.prewarmTarget = { cycleId: state.cycleId, sessionNo: nextNo }
        this.prewarm = this.generateSession(state.cycleId, nextNo).finally(
            () => {
                this.prewarm = null
                this.prewarmTarget = null
            }
        )
        return this.prewarm
    }

    async nextSession() {
        const state = this.state()
        if (!state.currentSessionNo) return this.ensureInitialPrepared()
        return this.advanceSession()
    }

    async advanceSession() {
        const state = this.state()
        if (!state.currentSessionNo) return this.ensureInitialPrepared()
        const nextNo = state.currentSessionNo + 1
        if (
            this.prewarm &&
            this.prewarmTarget?.cycleId === state.cycleId &&
            this.prewarmTarget.sessionNo === nextNo
        )
            await this.prewarm
        const generated = await this.generateSession(state.cycleId, nextNo)
        const active = this.saveState({
            ...state,
            currentSessionNo: nextNo,
            currentBatchIndex: 0
        })
        void this.prewarmNextSession().catch(() => undefined)
        return this.response(
            active,
            generated.session,
            generated.profile,
            generated.audit,
            generated.recommendations
        )
    }

    recordBatch(batchIndex: number) {
        const state = this.state()
        const active = this.saveState({
            ...state,
            currentBatchIndex: Math.max(0, Math.floor(batchIndex))
        })
        if (active.currentBatchIndex >= 1)
            void this.prewarmNextSession().catch(() => undefined)
        return this.currentState()
    }

    async restartCycle() {
        if (this.prewarm) await this.prewarm.catch(() => undefined)
        this.saveState({
            cycleId: this.runtime.createId(),
            currentSessionNo: 0,
            currentBatchIndex: 0
        })
        return this.ensureInitialPrepared()
    }

    currentState() {
        return legacySessionStatus(
            this.read,
            readLegacySessionState(this.read, () => this.draft()).state
        )
    }
}
