import { randomUUID } from 'node:crypto'

export type MaintenanceTaskState =
    | 'idle'
    | 'running'
    | 'pausing'
    | 'paused'
    | 'cancelling'
    | 'cancelled'
    | 'complete'
    | 'failed'

export type MaintenanceTaskControlAction = 'pause' | 'resume' | 'cancel'

export interface MaintenanceTaskProgress<TResult = unknown> {
    taskId: string | null
    taskType: string
    state: MaintenanceTaskState
    phase: string
    done: number
    total: number
    indeterminate: boolean
    startedAt: string | null
    updatedAt: string
    finishedAt: string | null
    canPause: boolean
    canResume: boolean
    canCancel: boolean
    canRetry: boolean
    pauseSemantics: 'in_place'
    recoveryMode: 'restart_required'
    error?: string
    result?: TResult
}

export interface MaintenanceTaskContext {
    checkpoint(): Promise<void>
    report(input: {
        phase?: string
        done?: number
        total?: number
        indeterminate?: boolean
    }): void
}

class MaintenanceTaskCancelledError extends Error {
    constructor() {
        super('Maintenance task was cancelled')
        this.name = 'MaintenanceTaskCancelledError'
    }
}

const now = () => new Date().toISOString()

export class MaintenanceTaskRuntime<TResult> {
    private progress: MaintenanceTaskProgress<TResult>
    private pauseRequested = false
    private cancelRequested = false
    private readonly resumeWaiters = new Set<() => void>()
    private activeRun: Promise<void> | null = null

    constructor(private readonly taskType: string) {
        this.progress = this.idleProgress()
    }

    private idleProgress(): MaintenanceTaskProgress<TResult> {
        return {
            taskId: null,
            taskType: this.taskType,
            state: 'idle',
            phase: 'idle',
            done: 0,
            total: 0,
            indeterminate: true,
            startedAt: null,
            updatedAt: now(),
            finishedAt: null,
            canPause: false,
            canResume: false,
            canCancel: false,
            canRetry: false,
            pauseSemantics: 'in_place',
            recoveryMode: 'restart_required'
        }
    }

    status(): MaintenanceTaskProgress<TResult> {
        const state = this.progress.state
        return {
            ...this.progress,
            canPause: state === 'running' || state === 'pausing',
            canResume: state === 'paused',
            canCancel: ['running', 'pausing', 'paused', 'cancelling'].includes(
                state
            ),
            canRetry: ['cancelled', 'complete', 'failed'].includes(state)
        }
    }

    start(
        execute: (context: MaintenanceTaskContext) => Promise<TResult>,
        initial: {
            phase?: string
            done?: number
            total?: number
            indeterminate?: boolean
        } = {}
    ) {
        if (this.activeRun)
            return {
                started: false,
                task: this.status()
            }

        this.pauseRequested = false
        this.cancelRequested = false
        this.resumeWaiters.clear()
        const startedAt = now()
        this.progress = {
            taskId: randomUUID(),
            taskType: this.taskType,
            state: 'running',
            phase: initial.phase ?? 'starting',
            done: Math.max(0, Math.floor(initial.done ?? 0)),
            total: Math.max(0, Math.floor(initial.total ?? 0)),
            indeterminate:
                initial.indeterminate ??
                (!Number.isFinite(initial.total) ||
                    Number(initial.total) <= 0),
            startedAt,
            updatedAt: startedAt,
            finishedAt: null,
            canPause: true,
            canResume: false,
            canCancel: true,
            canRetry: false,
            pauseSemantics: 'in_place',
            recoveryMode: 'restart_required'
        }

        const checkpoint = async () => {
            if (this.cancelRequested)
                throw new MaintenanceTaskCancelledError()
            if (!this.pauseRequested) return

            this.progress = {
                ...this.progress,
                state: 'paused',
                updatedAt: now()
            }
            await new Promise<void>((resolve) =>
                this.resumeWaiters.add(resolve)
            )
            if (this.cancelRequested)
                throw new MaintenanceTaskCancelledError()
            this.progress = {
                ...this.progress,
                state: 'running',
                updatedAt: now()
            }
        }

        const report: MaintenanceTaskContext['report'] = (input) => {
            this.progress = {
                ...this.progress,
                phase: input.phase ?? this.progress.phase,
                done:
                    input.done === undefined
                        ? this.progress.done
                        : Math.max(0, Math.floor(input.done)),
                total:
                    input.total === undefined
                        ? this.progress.total
                        : Math.max(0, Math.floor(input.total)),
                indeterminate:
                    input.indeterminate ??
                    (input.total === undefined
                        ? this.progress.indeterminate
                        : Number(input.total) <= 0),
                updatedAt: now()
            }
        }

        const run = (async () => {
            try {
                const result = await execute({ checkpoint, report })
                await checkpoint()
                this.progress = {
                    ...this.progress,
                    state: 'complete',
                    phase: 'complete',
                    finishedAt: now(),
                    updatedAt: now(),
                    result,
                    error: undefined
                }
            } catch (error) {
                if (
                    error instanceof MaintenanceTaskCancelledError ||
                    this.cancelRequested
                ) {
                    this.progress = {
                        ...this.progress,
                        state: 'cancelled',
                        phase: 'cancelled',
                        finishedAt: now(),
                        updatedAt: now(),
                        result: undefined,
                        error: undefined
                    }
                } else {
                    this.progress = {
                        ...this.progress,
                        state: 'failed',
                        phase: 'failed',
                        finishedAt: now(),
                        updatedAt: now(),
                        result: undefined,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error)
                    }
                }
            } finally {
                this.pauseRequested = false
                this.cancelRequested = false
                for (const resolve of this.resumeWaiters) resolve()
                this.resumeWaiters.clear()
                this.activeRun = null
            }
        })()

        this.activeRun = run
        return {
            started: true,
            task: this.status()
        }
    }

    control(action: MaintenanceTaskControlAction) {
        const state = this.progress.state
        if (action === 'pause') {
            if (state === 'running') {
                this.pauseRequested = true
                this.progress = {
                    ...this.progress,
                    state: 'pausing',
                    updatedAt: now()
                }
            }
            return this.status()
        }

        if (action === 'resume') {
            this.pauseRequested = false
            for (const resolve of this.resumeWaiters) resolve()
            this.resumeWaiters.clear()
            if (state === 'paused' || state === 'pausing')
                this.progress = {
                    ...this.progress,
                    state: 'running',
                    updatedAt: now()
                }
            return this.status()
        }

        if (['running', 'pausing', 'paused'].includes(state)) {
            this.cancelRequested = true
            this.pauseRequested = false
            for (const resolve of this.resumeWaiters) resolve()
            this.resumeWaiters.clear()
            this.progress = {
                ...this.progress,
                state: 'cancelling',
                updatedAt: now()
            }
        }
        return this.status()
    }
}
