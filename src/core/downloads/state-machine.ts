import type { DownloadStatus } from './types'

const transitions: Record<DownloadStatus, readonly DownloadStatus[]> = {
    DRAFT: ['QUEUED', 'CANCELLED'],
    QUEUED: ['PREPARING', 'PAUSED', 'CANCELLED'],
    PREPARING: ['RUNNING', 'RETRY_WAIT', 'FAILED', 'CANCELLED'],
    RUNNING: ['PAUSED', 'RETRY_WAIT', 'COMPLETED', 'FAILED', 'CANCELLED'],
    PAUSED: ['QUEUED', 'CANCELLED'],
    RETRY_WAIT: ['QUEUED', 'FAILED', 'CANCELLED'],
    COMPLETED: [],
    FAILED: ['QUEUED', 'CANCELLED'],
    CANCELLED: []
}

export function canTransition(from: DownloadStatus, to: DownloadStatus) {
    return transitions[from].includes(to)
}

export function assertTransition(from: DownloadStatus, to: DownloadStatus) {
    if (!canTransition(from, to)) {
        throw new Error(`Illegal download transition: ${from} -> ${to}`)
    }
}

export function isTerminal(status: DownloadStatus) {
    return ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)
}
