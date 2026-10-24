import type {
    WorkIdentityTaskReadPortV5,
    WorkIdentityTaskWritePortV5,
    WorkIdentityEvidenceRefreshTaskProgress,
    WorkIdentityTaskExecutionV5
} from './ports-v5'
import { buildWorkIdentityAuditAsyncV5 } from '../recommendation-v5/work-identity-foundation'
export class WorkIdentityEvidenceRefreshCancelledError extends Error {
    constructor() {
        super('Work Identity evidence refresh was cancelled')
        this.name = 'WorkIdentityEvidenceRefreshCancelledError'
    }
}
/** Existing cooperative evidence task. Storage/admission are injected; no network or binding capability. */
export class WorkIdentityTaskV5 {
    constructor(
        private readonly read: WorkIdentityTaskReadPortV5,
        private readonly write: WorkIdentityTaskWritePortV5,
        private readonly execution: WorkIdentityTaskExecutionV5
    ) {}
    private workIdentityEvidenceRefreshProgress: WorkIdentityEvidenceRefreshTaskProgress =
        {
            state: 'idle',
            phase: 'idle',
            done: 0,
            total: 0,
            candidateCount: 0,
            pairChecks: 0,
            savedCount: 0
        }
    private workIdentityEvidenceRefreshPauseRequested = false
    private workIdentityEvidenceRefreshCancelRequested = false
    private workIdentityEvidenceRefreshResumePhase: WorkIdentityEvidenceRefreshTaskProgress['phase'] =
        'loading'
    private readonly workIdentityEvidenceRefreshResumeWaiters = new Set<
        () => void
    >()
    private workIdentityEvidenceRefreshRun: Promise<void> | null = null
    private workIdentityEvidenceRefreshResult: {
        scannedComicCount: number
        candidateCount: number
        crossProviderCandidateCount: number
        savedCount: number
    } | null = null
    status() {
        const active = ['running', 'pausing', 'paused', 'cancelling'].includes(
            this.workIdentityEvidenceRefreshProgress.state
        )
        const terminal = ['complete', 'failed', 'cancelled'].includes(
            this.workIdentityEvidenceRefreshProgress.state
        )
        return {
            ...this.workIdentityEvidenceRefreshProgress,
            active,
            canPause:
                this.workIdentityEvidenceRefreshProgress.state === 'running' ||
                this.workIdentityEvidenceRefreshProgress.state === 'pausing',
            canResume:
                this.workIdentityEvidenceRefreshProgress.state === 'paused',
            canCancel: active,
            result: terminal
                ? this.workIdentityEvidenceRefreshResult
                : undefined
        }
    }

    control(action: 'pause' | 'resume' | 'cancel') {
        if (action === 'pause') {
            if (this.workIdentityEvidenceRefreshProgress.state === 'running') {
                this.workIdentityEvidenceRefreshPauseRequested = true
                this.workIdentityEvidenceRefreshProgress = {
                    ...this.workIdentityEvidenceRefreshProgress,
                    state: 'pausing',
                    updatedAt: new Date().toISOString()
                }
            }
            return this.status()
        }
        if (action === 'resume') {
            this.workIdentityEvidenceRefreshPauseRequested = false
            if (
                this.workIdentityEvidenceRefreshProgress.state === 'paused' ||
                this.workIdentityEvidenceRefreshProgress.state === 'pausing'
            )
                this.workIdentityEvidenceRefreshProgress = {
                    ...this.workIdentityEvidenceRefreshProgress,
                    state: 'running',
                    phase: this.workIdentityEvidenceRefreshResumePhase,
                    updatedAt: new Date().toISOString()
                }
            for (const resolve of this.workIdentityEvidenceRefreshResumeWaiters)
                resolve()
            this.workIdentityEvidenceRefreshResumeWaiters.clear()
            return this.status()
        }
        this.workIdentityEvidenceRefreshCancelRequested = true
        this.workIdentityEvidenceRefreshPauseRequested = false
        for (const resolve of this.workIdentityEvidenceRefreshResumeWaiters)
            resolve()
        this.workIdentityEvidenceRefreshResumeWaiters.clear()
        if (
            this.workIdentityEvidenceRefreshProgress.state === 'running' ||
            this.workIdentityEvidenceRefreshProgress.state === 'pausing' ||
            this.workIdentityEvidenceRefreshProgress.state === 'paused'
        )
            this.workIdentityEvidenceRefreshProgress = {
                ...this.workIdentityEvidenceRefreshProgress,
                state: 'cancelling',
                updatedAt: new Date().toISOString()
            }
        return this.status()
    }

    private async checkpoint() {
        if (this.workIdentityEvidenceRefreshCancelRequested)
            throw new WorkIdentityEvidenceRefreshCancelledError()
        if (!this.workIdentityEvidenceRefreshPauseRequested) return
        this.workIdentityEvidenceRefreshResumePhase =
            this.workIdentityEvidenceRefreshProgress.phase === 'paused'
                ? this.workIdentityEvidenceRefreshResumePhase
                : this.workIdentityEvidenceRefreshProgress.phase
        this.workIdentityEvidenceRefreshProgress = {
            ...this.workIdentityEvidenceRefreshProgress,
            state: 'paused',
            phase: 'paused',
            updatedAt: new Date().toISOString()
        }
        await new Promise<void>((resolve) =>
            this.workIdentityEvidenceRefreshResumeWaiters.add(resolve)
        )
        if (this.workIdentityEvidenceRefreshCancelRequested)
            throw new WorkIdentityEvidenceRefreshCancelledError()
        this.workIdentityEvidenceRefreshProgress = {
            ...this.workIdentityEvidenceRefreshProgress,
            state: 'running',
            phase: this.workIdentityEvidenceRefreshResumePhase,
            updatedAt: new Date().toISOString()
        }
    }

    private finishControl() {
        this.workIdentityEvidenceRefreshPauseRequested = false
        this.workIdentityEvidenceRefreshCancelRequested = false
        for (const resolve of this.workIdentityEvidenceRefreshResumeWaiters)
            resolve()
        this.workIdentityEvidenceRefreshResumeWaiters.clear()
        this.workIdentityEvidenceRefreshRun = null
    }

    start(requestedLimit = 500) {
        if (
            this.workIdentityEvidenceRefreshRun &&
            ['running', 'pausing', 'paused', 'cancelling'].includes(
                this.workIdentityEvidenceRefreshProgress.state
            )
        )
            return {
                started: false,
                ...this.status()
            }

        const limit = Math.max(
            1,
            Math.min(1000, Math.floor(Number(requestedLimit) || 500))
        )
        const now = new Date().toISOString()
        this.workIdentityEvidenceRefreshPauseRequested = false
        this.workIdentityEvidenceRefreshCancelRequested = false
        this.workIdentityEvidenceRefreshResumePhase = 'loading'
        this.workIdentityEvidenceRefreshResumeWaiters.clear()
        this.workIdentityEvidenceRefreshResult = null
        this.workIdentityEvidenceRefreshProgress = {
            state: 'running',
            phase: 'loading',
            done: 0,
            total: 0,
            candidateCount: 0,
            pairChecks: 0,
            savedCount: 0,
            startedAt: now,
            updatedAt: now
        }

        const run = (async () => {
            let releaseResources: () => void = () => undefined
            try {
                const lease = await this.execution.acquire()
                releaseResources = () => lease.release()
                // Detach the first full-catalog read from the start request.
                await new Promise<void>((resolve) => setTimeout(resolve, 0))
                await this.checkpoint()
                const catalog = this.read.catalog()
                const state = this.read.policy()
                await this.checkpoint()
                const audit = await buildWorkIdentityAuditAsyncV5(
                    catalog,
                    state,
                    limit,
                    {
                        checkpoint: () => this.checkpoint(),
                        onProgress: (progress) => {
                            const controlState =
                                this.workIdentityEvidenceRefreshProgress.state
                            this.workIdentityEvidenceRefreshResumePhase =
                                progress.phase
                            this.workIdentityEvidenceRefreshProgress = {
                                ...this.workIdentityEvidenceRefreshProgress,
                                ...progress,
                                state:
                                    controlState === 'pausing' ||
                                    controlState === 'cancelling'
                                        ? controlState
                                        : 'running',
                                updatedAt: new Date().toISOString()
                            }
                        }
                    }
                )
                await this.checkpoint()
                this.workIdentityEvidenceRefreshResumePhase = 'persisting'
                this.workIdentityEvidenceRefreshProgress = {
                    ...this.workIdentityEvidenceRefreshProgress,
                    state: 'running',
                    phase: 'persisting',
                    done: audit.scannedComicCount,
                    total: audit.scannedComicCount,
                    candidateCount: audit.candidateCount,
                    updatedAt: new Date().toISOString()
                }
                await this.checkpoint()
                const saved = this.write.saveWorkIdentityEvidence(
                    audit.candidates.map((candidate) => ({
                        leftComicId: candidate.leftComicId,
                        rightComicId: candidate.rightComicId,
                        relation: candidate.relation,
                        confidence: candidate.confidence,
                        resolverVersion: candidate.resolverVersion,
                        evidence: {
                            ...candidate.evidence,
                            leftProvider: candidate.leftProvider,
                            rightProvider: candidate.rightProvider,
                            crossProvider: candidate.crossProvider
                        }
                    }))
                )
                this.workIdentityEvidenceRefreshResult = {
                    scannedComicCount: audit.scannedComicCount,
                    candidateCount: audit.candidateCount,
                    crossProviderCandidateCount:
                        audit.crossProviderCandidateCount,
                    savedCount: saved.upserted
                }
                this.workIdentityEvidenceRefreshProgress = {
                    ...this.workIdentityEvidenceRefreshProgress,
                    state: 'complete',
                    phase: 'complete',
                    done: audit.scannedComicCount,
                    total: audit.scannedComicCount,
                    candidateCount: audit.candidateCount,
                    savedCount: saved.upserted,
                    updatedAt: new Date().toISOString()
                }
            } catch (error) {
                if (error instanceof WorkIdentityEvidenceRefreshCancelledError)
                    this.workIdentityEvidenceRefreshProgress = {
                        ...this.workIdentityEvidenceRefreshProgress,
                        state: 'cancelled',
                        phase: 'cancelled',
                        updatedAt: new Date().toISOString()
                    }
                else
                    this.workIdentityEvidenceRefreshProgress = {
                        ...this.workIdentityEvidenceRefreshProgress,
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
        this.workIdentityEvidenceRefreshRun = run
        void run.catch(() => {
            // The task records its authoritative terminal state above.
        })
        return {
            started: true,
            ...this.status()
        }
    }
}
