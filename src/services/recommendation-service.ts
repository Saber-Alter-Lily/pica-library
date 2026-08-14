import { randomUUID } from 'node:crypto'
import type { LibraryDatabase } from '../library/database'
import type { RecommendationResult } from '../library/types'

interface GeneratedRecommendations {
    recommendations: RecommendationResult[]
    profile: unknown
    audit?: unknown
}

interface ActiveRecommendationState {
    cycleId: string
    currentSessionNo: number
    currentBatchIndex: number
}

export class RecommendationService {
    static readonly batchSize = 12
    static readonly sessionSize = 60
    static readonly candidateDepth = 500
    private readonly stateKey = 'recommendation.activeCycle'
    private prewarm: Promise<unknown> | null = null
    private prewarmTarget: { cycleId: string; sessionNo: number } | null = null

    constructor(
        private readonly database: LibraryDatabase,
        private readonly generate: (
            limit: number
        ) => Promise<GeneratedRecommendations>
    ) {}

    private state(): ActiveRecommendationState {
        const existing = this.database.getAppState<ActiveRecommendationState>(
            this.stateKey
        )
        if (existing?.cycleId)
            return {
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
        const created = {
            cycleId: randomUUID(),
            currentSessionNo: 0,
            currentBatchIndex: 0
        }
        this.database.setAppState(this.stateKey, created)
        return created
    }

    private saveState(state: ActiveRecommendationState) {
        this.database.setAppState(this.stateKey, state)
        return state
    }

    private response(
        state: ActiveRecommendationState,
        session: NonNullable<
            ReturnType<LibraryDatabase['latestRecommendationSession']>
        >,
        profile: unknown = null,
        audit?: unknown,
        generatedRecommendations?: RecommendationResult[]
    ) {
        const recommendations = (
            generatedRecommendations ??
            this.database.recommendationRecords(session.comicIds)
        ).filter((item) => !item.comic.isFavorite)
        return {
            cycleId: state.cycleId,
            sessionId: session.id,
            sessionNo: session.sessionNo,
            currentBatchIndex: state.currentBatchIndex,
            batchSize: RecommendationService.batchSize,
            batchCount: Math.max(
                1,
                Math.ceil(
                    recommendations.length / RecommendationService.batchSize
                )
            ),
            recommendations,
            profile,
            audit,
            seenCount: this.database.recommendationSeen(state.cycleId).length,
            exhausted: session.exhausted,
            nextSessionReady: Boolean(
                this.database.recommendationSession(
                    state.cycleId,
                    session.sessionNo + 1
                )
            ),
            message: session.exhausted ? '暂时没有更多未展示推荐。' : undefined
        }
    }

    private async generateSession(cycleId: string, sessionNo: number) {
        const existing = this.database.recommendationSession(cycleId, sessionNo)
        if (existing)
            return {
                session: existing,
                profile: null,
                audit: null,
                recommendations: undefined
            }
        const seen = new Set(this.database.recommendationSeen(cycleId))
        const generated = await this.generate(
            RecommendationService.candidateDepth
        )
        const unique = new Map<string, RecommendationResult>()
        for (const item of generated.recommendations) {
            const id = item.comic.comicId
            if (seen.has(id) || item.comic.isFavorite || unique.has(id))
                continue
            unique.set(id, item)
            if (unique.size >= RecommendationService.sessionSize) break
        }
        const recommendations = [...unique.values()]
        const session = this.database.saveRecommendationSession(
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
            const current = this.database.recommendationSession(
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
        if (this.database.recommendationSession(state.cycleId, nextNo))
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
            cycleId: randomUUID(),
            currentSessionNo: 0,
            currentBatchIndex: 0
        })
        return this.ensureInitialPrepared()
    }

    currentState() {
        const state = this.state()
        if (!state.currentSessionNo)
            return {
                ...state,
                preparing: true,
                recommendations: [],
                nextSessionReady: false,
                seenCount: 0
            }
        const session = this.database.recommendationSession(
            state.cycleId,
            state.currentSessionNo
        )
        if (!session)
            return {
                ...state,
                preparing: true,
                recommendations: [],
                nextSessionReady: false,
                seenCount: this.database.recommendationSeen(state.cycleId)
                    .length
            }
        return { ...this.response(state, session), preparing: false }
    }
}
