import fs from 'node:fs'
import type { LibraryDatabase } from '../library/database'

export interface RepairIssue {
    pictureId: string
    comicId: string
    episodeId: string
    episodeOrder: number
    reason: 'missing' | 'empty' | 'failed'
    localPath: string | null
}

export function scanRepairIssues(database: LibraryDatabase): RepairIssue[] {
    const issues: RepairIssue[] = []
    for (const picture of database.listPictureHealth()) {
        let reason: RepairIssue['reason'] | null = null
        if (picture.status === 'failed') reason = 'failed'
        else if (!picture.localPath || !fs.existsSync(picture.localPath))
            reason = 'missing'
        else if (fs.statSync(picture.localPath).size === 0) reason = 'empty'
        if (reason) issues.push({ ...picture, reason })
    }
    return issues
}

export function queueRepairs(
    database: LibraryDatabase,
    issues: RepairIssue[],
    runner: 'LOCAL' | 'GITHUB' = 'LOCAL'
) {
    const grouped = new Map<string, Set<number>>()
    for (const issue of issues) {
        const orders = grouped.get(issue.comicId) ?? new Set<number>()
        orders.add(issue.episodeOrder)
        grouped.set(issue.comicId, orders)
    }
    return [...grouped].map(([comicId, orders]) => {
        const job = database.createDownloadJob({
            comicId,
            episodeOrders: [...orders].sort((a, b) => a - b),
            source: 'repair',
            runner,
            priority: 20
        })
        return database.transitionDownloadJob(job.id, 'QUEUED')
    })
}
