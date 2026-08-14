import { randomUUID } from 'node:crypto'
import type { LibraryDatabase } from '../library/database'
import type { RecommendationResult } from '../library/types'

interface GeneratedRecommendations {
    recommendations: RecommendationResult[]
    profile: unknown
    audit?: unknown
}

export class RecommendationService {
    static readonly batchSize = 12
    static readonly sessionSize = 60
    private readonly stateKey = 'recommendation.activeCycle'

    constructor(
        private readonly database: LibraryDatabase,
        private readonly generate: (
            limit: number
        ) => Promise<GeneratedRecommendations>
    ) {}

    private cycleId() {
        const existing = this.database.getAppState<{ cycleId?: string }>(
            this.stateKey
        )?.cycleId
        if (existing) return existing
        const cycleId = randomUUID()
        this.database.setAppState(this.stateKey, { cycleId })
        return cycleId
    }

    async nextSession() {
        const cycleId = this.cycleId()
        const latest = this.database.latestRecommendationSession(cycleId)
        const sessionNo = (latest?.sessionNo ?? 0) + 1
        const seen = new Set(this.database.recommendationSeen(cycleId))
        const generated = await this.generate(100)
        const recommendations = generated.recommendations
            .filter((item) => !seen.has(item.comic.comicId))
            .slice(0, RecommendationService.sessionSize)
        const exhausted = recommendations.length === 0
        const stored = this.database.saveRecommendationSession(
            cycleId,
            sessionNo,
            recommendations.map((item) => item.comic.comicId),
            exhausted
        )
        return {
            cycleId,
            sessionId: stored.id,
            sessionNo,
            batchSize: RecommendationService.batchSize,
            batchCount: Math.max(
                1,
                Math.ceil(
                    recommendations.length / RecommendationService.batchSize
                )
            ),
            recommendations,
            profile: generated.profile,
            audit: generated.audit,
            seenCount: seen.size + recommendations.length,
            exhausted,
            message: exhausted ? '暂时没有更多未展示推荐。' : undefined
        }
    }

    async restartCycle() {
        const cycleId = randomUUID()
        this.database.setAppState(this.stateKey, { cycleId })
        return this.nextSession()
    }

    currentState() {
        const cycleId = this.cycleId()
        return {
            cycleId,
            latest: this.database.latestRecommendationSession(cycleId),
            seenCount: this.database.recommendationSeen(cycleId).length
        }
    }
}
