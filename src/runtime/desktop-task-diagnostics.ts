import {
    runtimeTaskDiagnosticSnapshot,
    type RuntimeTaskDiagnosticInput,
    type RuntimeTaskDiagnosticSnapshot,
    type RuntimeTaskResourceSnapshotLike
} from './task-diagnostics'

export interface DesktopTaskDiagnosticSources {
    base: RuntimeTaskDiagnosticSnapshot
    resources: RuntimeTaskResourceSnapshotLike
    remoteStorageProgress?: Record<string, unknown> | null
    browserLiteExportProgress?: {
        phase?: unknown
        state?: unknown
    } | null
    lastBrowserLiteExportAt?: unknown
    ehWebLogin?: {
        state?: unknown
        message?: unknown
        startedAt?: unknown
        completedAt?: unknown
    } | null
    updateProgress?: {
        phase?: unknown
        current?: unknown
        total?: unknown
        message?: unknown
        updatedAt?: unknown
    } | null
    now?: Date
}

function text(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
}

function terminalState(value: string) {
    return value === 'complete' || value === 'failed' || value === 'cancelled'
}

function browserLiteInput(
    progress: DesktopTaskDiagnosticSources['browserLiteExportProgress'],
    lastCompletedAt: unknown
): RuntimeTaskDiagnosticInput {
    const phase = text(progress?.phase) || 'idle'
    const sourceState = text(progress?.state) || 'idle'
    const state =
        phase === 'cancelled'
            ? 'cancelled'
            : sourceState === 'running' ||
                sourceState === 'complete' ||
                sourceState === 'failed'
              ? sourceState
              : 'idle'
    return {
        taskKey: 'browser-lite-export',
        taskType: 'browser-lite-export',
        owner: 'desktop-controller',
        state,
        phase,
        finishedAt:
            state === 'complete' && typeof lastCompletedAt === 'string'
                ? lastCompletedAt
                : null,
        canPause: false,
        canResume: false,
        canCancel: false,
        canRetry: false,
        pauseSemantics: 'unsupported',
        resourceClasses: [],
        recoveryMode: 'restart_export',
        commitBoundary:
            'selected Browser Lite package is written before the last-export timestamp is atomically published'
    }
}

function ehLoginInput(
    snapshot: DesktopTaskDiagnosticSources['ehWebLogin']
): RuntimeTaskDiagnosticInput {
    const phase = text(snapshot?.state) || 'idle'
    const state =
        phase === 'opening' || phase === 'verifying'
            ? 'running'
            : phase === 'waiting'
              ? 'waiting'
              : phase === 'complete' ||
                  phase === 'failed' ||
                  phase === 'cancelled' ||
                  phase === 'idle'
                ? phase
                : 'unknown'
    return {
        taskKey: 'eh-managed-login',
        taskType: 'eh-managed-login',
        owner: 'desktop-eh-web-login',
        state,
        phase,
        startedAt: snapshot?.startedAt,
        updatedAt: snapshot?.completedAt,
        finishedAt: terminalState(state) ? snapshot?.completedAt : null,
        canPause: false,
        canResume: false,
        canCancel: state === 'running' || state === 'waiting',
        canRetry: false,
        pauseSemantics: 'unsupported',
        resourceClasses: [],
        lastError: state === 'failed' ? snapshot?.message : null,
        providerRoute: 'eh-managed-browser',
        recoveryMode: 'restart_login',
        commitBoundary:
            'captured E-H session is persisted only after provider verification succeeds'
    }
}

function updateInput(
    progress: DesktopTaskDiagnosticSources['updateProgress']
): RuntimeTaskDiagnosticInput {
    const phase = text(progress?.phase) || 'idle'
    const state =
        phase === 'idle'
            ? 'idle'
            : phase === 'staged'
              ? 'waiting'
              : phase === 'complete' || phase === 'failed'
                ? phase
                : 'running'
    return {
        taskKey: 'software-update',
        taskType: 'software-update',
        owner: 'update-manager',
        state,
        phase,
        done: progress?.current,
        total: progress?.total,
        updatedAt: progress?.updatedAt,
        finishedAt: terminalState(state) ? progress?.updatedAt : null,
        canPause: false,
        canResume: false,
        canCancel: false,
        canRetry: false,
        pauseSemantics: 'unsupported',
        resourceClasses: [],
        lastError: state === 'failed' ? progress?.message : null,
        providerRoute: 'github-release',
        recoveryMode: 'persisted_progress_with_rollback',
        commitBoundary:
            'replacement is promoted only after staged verification and post-start health validation'
    }
}

function remoteStorageInput(
    progress: DesktopTaskDiagnosticSources['remoteStorageProgress']
): RuntimeTaskDiagnosticInput {
    const state = text(progress?.state) || 'idle'
    const phase = text(progress?.phase) || state
    const totalPages =
        typeof progress?.totalPages === 'number' ? progress.totalPages : null
    const completedPages =
        typeof progress?.completedPages === 'number'
            ? progress.completedPages
            : null
    const totalComics =
        typeof progress?.totalComics === 'number' ? progress.totalComics : null
    const completedComics =
        typeof progress?.completedComics === 'number'
            ? progress.completedComics
            : null
    return {
        taskKey: 'remote-storage-sync',
        taskType: 'remote-storage-sync',
        owner: 'remote-storage-manager',
        state,
        phase,
        done:
            totalPages !== null && totalPages > 0
                ? completedPages
                : completedComics,
        total:
            totalPages !== null && totalPages > 0 ? totalPages : totalComics,
        updatedAt: progress?.updatedAt,
        finishedAt: terminalState(state) ? progress?.updatedAt : null,
        canPause: progress?.canPause,
        canResume: progress?.canResume,
        canCancel: progress?.canCancel,
        canRetry: false,
        pauseSemantics: 'in_place',
        resourceClasses: [
            'remote-storage-network',
            'filesystem-heavy',
            'sqlite-read-heavy',
            'sqlite-write-heavy'
        ],
        lastError: state === 'failed' ? progress?.message : null,
        providerRoute: 'webdav',
        recoveryMode: 'restart_sync_reuse_sha_objects',
        commitBoundary:
            'generation catalog and current pointer publish only through the completed sync publication flow'
    }
}

export function desktopRuntimeTaskDiagnostics(
    sources: DesktopTaskDiagnosticSources
): RuntimeTaskDiagnosticSnapshot {
    const now = sources.now ?? new Date()
    const extras = runtimeTaskDiagnosticSnapshot(
        [
            remoteStorageInput(sources.remoteStorageProgress),
            browserLiteInput(
                sources.browserLiteExportProgress,
                sources.lastBrowserLiteExportAt
            ),
            ehLoginInput(sources.ehWebLogin),
            updateInput(sources.updateProgress)
        ],
        sources.resources,
        now
    )
    return {
        schemaVersion: 1,
        capturedAt: now.toISOString(),
        tasks: [...sources.base.tasks, ...extras.tasks].sort((left, right) =>
            left.taskKey.localeCompare(right.taskKey)
        )
    }
}
