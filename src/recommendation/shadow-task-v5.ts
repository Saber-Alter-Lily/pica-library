import type {
    RecommendationV5ShadowTaskProgress,
    RecommendationShadowRuntimeV5
} from './shadow-ports-v5'
import { RECOMMENDATION_V5_SHADOW_RETRIEVAL_CONFIRMATION } from './shadow-ports-v5'
import type { executeRecommendationShadowV5 } from './shadow-execution-v5'
export class RecommendationV5ShadowCancelledError extends Error {
    constructor() {
        super('Recommendation V5 shadow retrieval was cancelled')
        this.name = 'RecommendationV5ShadowCancelledError'
    }
}
export interface RecommendationShadowTaskExecutionV5 {
    acquire(): Promise<{ release(): void }>
    run(
        input: Record<string, unknown>,
        runtime: RecommendationShadowRuntimeV5
    ): Promise<Awaited<ReturnType<typeof executeRecommendationShadowV5>>>
}
/** Extracted existing control state; resource admission and execution remain explicit injected capabilities. */
export class RecommendationShadowTaskV5 {
    constructor(
        private readonly execution: RecommendationShadowTaskExecutionV5
    ) {}
    private recommendationV5ShadowProgress: RecommendationV5ShadowTaskProgress =
        {
            state: 'idle',
            phase: 'idle',
            done: 0,
            total: 7,
            retrievalDone: 0,
            retrievalTotal: 0,
            rawCandidateCount: 0,
            candidateCount: 0,
            rankedCandidateCount: 0,
            selectedCount: 0
        }
    private recommendationV5ShadowPauseRequested = false
    private recommendationV5ShadowCancelRequested = false
    private recommendationV5ShadowResumePhase: RecommendationV5ShadowTaskProgress['phase'] =
        'retrieving'
    private readonly recommendationV5ShadowResumeWaiters = new Set<() => void>()
    private recommendationV5ShadowRun: Promise<void> | null = null
    private shuttingDown = false
    private recommendationV5ShadowResult: {
        rawCandidateCount: number
        candidateCount: number
        rankedCandidateCount: number
        selectedCount: number
        audit: {
            poolId: string
            cycleId: string
            modelVersion: string
            generatedAt: string
            candidateIdCount: number
        }
    } | null = null
    status() {
        const active = ['running', 'pausing', 'paused', 'cancelling'].includes(
            this.recommendationV5ShadowProgress.state
        )
        const terminal = ['complete', 'failed', 'cancelled'].includes(
            this.recommendationV5ShadowProgress.state
        )
        return {
            ...this.recommendationV5ShadowProgress,
            active,
            canPause:
                this.recommendationV5ShadowProgress.state === 'running' ||
                this.recommendationV5ShadowProgress.state === 'pausing',
            canResume: this.recommendationV5ShadowProgress.state === 'paused',
            canCancel: active,
            result: terminal ? this.recommendationV5ShadowResult : undefined
        }
    }

    control(action: 'pause' | 'resume' | 'cancel') {
        if (action === 'pause') {
            if (this.recommendationV5ShadowProgress.state === 'running') {
                this.recommendationV5ShadowPauseRequested = true
                this.recommendationV5ShadowProgress = {
                    ...this.recommendationV5ShadowProgress,
                    state: 'pausing',
                    updatedAt: new Date().toISOString()
                }
            }
            return this.status()
        }
        if (action === 'resume') {
            this.recommendationV5ShadowPauseRequested = false
            if (
                this.recommendationV5ShadowProgress.state === 'paused' ||
                this.recommendationV5ShadowProgress.state === 'pausing'
            )
                this.recommendationV5ShadowProgress = {
                    ...this.recommendationV5ShadowProgress,
                    state: 'running',
                    phase: this.recommendationV5ShadowResumePhase,
                    updatedAt: new Date().toISOString()
                }
            for (const resolve of this.recommendationV5ShadowResumeWaiters)
                resolve()
            this.recommendationV5ShadowResumeWaiters.clear()
            return this.status()
        }
        this.recommendationV5ShadowCancelRequested = true
        this.recommendationV5ShadowPauseRequested = false
        for (const resolve of this.recommendationV5ShadowResumeWaiters)
            resolve()
        this.recommendationV5ShadowResumeWaiters.clear()
        if (
            this.recommendationV5ShadowProgress.state === 'running' ||
            this.recommendationV5ShadowProgress.state === 'pausing' ||
            this.recommendationV5ShadowProgress.state === 'paused'
        )
            this.recommendationV5ShadowProgress = {
                ...this.recommendationV5ShadowProgress,
                state: 'cancelling',
                updatedAt: new Date().toISOString()
            }
        return this.status()
    }

    private async checkpoint() {
        if (this.recommendationV5ShadowCancelRequested)
            throw new RecommendationV5ShadowCancelledError()
        if (!this.recommendationV5ShadowPauseRequested) return
        this.recommendationV5ShadowResumePhase =
            this.recommendationV5ShadowProgress.phase === 'paused'
                ? this.recommendationV5ShadowResumePhase
                : this.recommendationV5ShadowProgress.phase
        this.recommendationV5ShadowProgress = {
            ...this.recommendationV5ShadowProgress,
            state: 'paused',
            phase: 'paused',
            updatedAt: new Date().toISOString()
        }
        await new Promise<void>((resolve) =>
            this.recommendationV5ShadowResumeWaiters.add(resolve)
        )
        if (this.recommendationV5ShadowCancelRequested)
            throw new RecommendationV5ShadowCancelledError()
        this.recommendationV5ShadowProgress = {
            ...this.recommendationV5ShadowProgress,
            state: 'running',
            phase: this.recommendationV5ShadowResumePhase,
            updatedAt: new Date().toISOString()
        }
    }

    private finishControl() {
        this.recommendationV5ShadowPauseRequested = false
        this.recommendationV5ShadowCancelRequested = false
        for (const resolve of this.recommendationV5ShadowResumeWaiters)
            resolve()
        this.recommendationV5ShadowResumeWaiters.clear()
        this.recommendationV5ShadowRun = null
    }

    /** Await the existing detached task before the owning SQLite connection closes. */
    async quiesce() {
        this.shuttingDown = true
        this.control('cancel')
        await this.recommendationV5ShadowRun
    }

    start(input: Record<string, unknown>) {
        if (this.shuttingDown)
            throw new Error('Recommendation V5 shadow task is shutting down')
        if (
            String(input.confirmation ?? '').trim() !==
            RECOMMENDATION_V5_SHADOW_RETRIEVAL_CONFIRMATION
        )
            throw new Error(
                'Explicit shadow retrieval confirmation is required'
            )
        if (
            this.recommendationV5ShadowRun &&
            ['running', 'pausing', 'paused', 'cancelling'].includes(
                this.recommendationV5ShadowProgress.state
            )
        )
            return {
                started: false,
                ...this.status()
            }

        const now = new Date().toISOString()
        this.recommendationV5ShadowPauseRequested = false
        this.recommendationV5ShadowCancelRequested = false
        this.recommendationV5ShadowResumePhase = 'planning'
        this.recommendationV5ShadowResumeWaiters.clear()
        this.recommendationV5ShadowResult = null
        this.recommendationV5ShadowProgress = {
            state: 'running',
            phase: 'planning',
            done: 0,
            total: 7,
            retrievalDone: 0,
            retrievalTotal: 0,
            rawCandidateCount: 0,
            candidateCount: 0,
            rankedCandidateCount: 0,
            selectedCount: 0,
            startedAt: now,
            updatedAt: now
        }

        const run = (async () => {
            let releaseResources: () => void = () => undefined
            try {
                const lease = await this.execution.acquire()
                releaseResources = () => lease.release()
                const result = await this.execution.run(input, {
                    checkpoint: () => this.checkpoint(),
                    onProgress: (progress) => {
                        const controlState =
                            this.recommendationV5ShadowProgress.state
                        this.recommendationV5ShadowProgress = {
                            ...this.recommendationV5ShadowProgress,
                            ...progress,
                            state:
                                controlState === 'pausing' ||
                                controlState === 'cancelling'
                                    ? controlState
                                    : 'running',
                            updatedAt: new Date().toISOString()
                        }
                    }
                })
                this.recommendationV5ShadowResult = {
                    rawCandidateCount: result.rawCandidateCount,
                    candidateCount: result.candidateCount,
                    rankedCandidateCount: result.ranking.candidateCount,
                    selectedCount: result.diversity.selectedCount,
                    audit: result.audit
                }
                this.recommendationV5ShadowProgress = {
                    ...this.recommendationV5ShadowProgress,
                    state: 'complete',
                    phase: 'complete',
                    done: 7,
                    total: 7,
                    rawCandidateCount: result.rawCandidateCount,
                    candidateCount: result.candidateCount,
                    rankedCandidateCount: result.ranking.candidateCount,
                    selectedCount: result.diversity.selectedCount,
                    poolId: result.audit.poolId,
                    cycleId: result.audit.cycleId,
                    modelVersion: result.audit.modelVersion,
                    updatedAt: new Date().toISOString()
                }
            } catch (error) {
                if (error instanceof RecommendationV5ShadowCancelledError)
                    this.recommendationV5ShadowProgress = {
                        ...this.recommendationV5ShadowProgress,
                        state: 'cancelled',
                        phase: 'cancelled',
                        updatedAt: new Date().toISOString()
                    }
                else
                    this.recommendationV5ShadowProgress = {
                        ...this.recommendationV5ShadowProgress,
                        state: 'failed',
                        phase: 'failed',
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        updatedAt: new Date().toISOString()
                    }
            } finally {
                releaseResources()
                this.finishControl()
            }
        })()
        this.recommendationV5ShadowRun = run
        void run.catch(() => {
            // The task records its authoritative terminal state above.
        })
        return {
            started: true,
            ...this.status()
        }
    }
}
