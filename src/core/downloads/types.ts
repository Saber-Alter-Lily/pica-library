export const downloadStatuses = [
    'DRAFT',
    'QUEUED',
    'PREPARING',
    'RUNNING',
    'PAUSED',
    'RETRY_WAIT',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
] as const

export type DownloadStatus = (typeof downloadStatuses)[number]
export type DownloadSource =
    | 'library'
    | 'search'
    | 'recommendation'
    | 'update'
    | 'repair'
    | 'manual'
export type DownloadRunner = 'LOCAL' | 'GITHUB'

export interface DownloadJob {
    id: string
    comicId: string
    episodeOrders: number[]
    source: DownloadSource
    priority: number
    runner: DownloadRunner
    status: DownloadStatus
    createdAt: string
    startedAt: string | null
    finishedAt: string | null
    retryCount: number
    progressCompleted: number
    progressTotal: number
    bytes: number
    expectedBytes?: number | null
    comicTitle?: string | null
    chapterTitle?: string | null
    progressUpdatedAt?: string | null
    bytesPerSecond?: number | null
    error: string | null
}

export interface CreateDownloadJob {
    comicId: string
    episodeOrders?: number[]
    source?: DownloadSource
    priority?: number
    runner?: DownloadRunner
}

export interface DownloadJobPatch {
    progressCompleted?: number
    progressTotal?: number
    bytes?: number
    expectedBytes?: number | null
    chapterTitle?: string | null
    retryCount?: number
    error?: string | null
}
