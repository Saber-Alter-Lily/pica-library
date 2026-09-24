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

export interface RepairScanProgress {
    done: number
    total: number
}

export interface RepairScanOptions {
    onProgress?: (progress: RepairScanProgress) => void
    checkpoint?: () => Promise<void> | void
    yieldEvery?: number
}

function missingFile(error: unknown) {
    return Boolean(
        error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as NodeJS.ErrnoException).code === 'ENOENT'
    )
}

async function yieldToEventLoop() {
    await new Promise<void>((resolve) => setImmediate(resolve))
}

export async function scanRepairIssues(
    database: LibraryDatabase,
    options: RepairScanOptions = {}
): Promise<RepairIssue[]> {
    const pictures = database.listPictureHealth()
    const issues: RepairIssue[] = []
    const yieldEvery = Math.max(
        1,
        Math.floor(Number(options.yieldEvery) || 50)
    )

    for (let index = 0; index < pictures.length; index += 1) {
        await options.checkpoint?.()
        const picture = pictures[index]
        let reason: RepairIssue['reason'] | null = null

        if (picture.status === 'failed') reason = 'failed'
        else if (!picture.localPath) reason = 'missing'
        else {
            try {
                const stat = await fs.promises.stat(picture.localPath)
                if (stat.size === 0) reason = 'empty'
            } catch (error) {
                if (missingFile(error)) reason = 'missing'
                else throw error
            }
        }

        if (reason) issues.push({ ...picture, reason })

        options.onProgress?.({
            done: index + 1,
            total: pictures.length
        })
        if ((index + 1) % yieldEvery === 0) await yieldToEventLoop()
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
