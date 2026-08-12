import { randomUUID } from 'node:crypto'
import type { LibraryDatabase } from '../library/database'

export interface RemoteEpisode {
    id: string
    order: number
    title: string
    updatedAt?: string
}

export interface UpdateProvider {
    episodes(comicId: string): Promise<RemoteEpisode[]>
}

export interface UpdateFinding {
    id: string
    comicId: string
    oldEpisodeCount: number
    newEpisodeCount: number
    newEpisodeIds: string[]
    newEpisodeOrders: number[]
    metadataChanged: boolean
    checkedAt: string
    status: 'OPEN'
}

export async function checkComicUpdates(
    database: LibraryDatabase,
    provider: UpdateProvider,
    comicId: string
): Promise<UpdateFinding> {
    const known = database.listEpisodes(comicId)
    const remote = await provider.episodes(comicId)
    const knownById = new Map(known.map((episode) => [episode.id, episode]))
    const added = remote.filter((episode) => !knownById.has(episode.id))
    const metadataChanged = remote.some((episode) => {
        const previous = knownById.get(episode.id)
        return Boolean(
            previous &&
                (previous.order !== episode.order ||
                    previous.title !== episode.title ||
                    (episode.updatedAt &&
                        previous.updatedAt !== episode.updatedAt))
        )
    })
    const finding: UpdateFinding = {
        id: randomUUID(),
        comicId,
        oldEpisodeCount: known.length,
        newEpisodeCount: remote.length,
        newEpisodeIds: added.map((episode) => episode.id),
        newEpisodeOrders: added.map((episode) => episode.order),
        metadataChanged,
        checkedAt: new Date().toISOString(),
        status: 'OPEN'
    }
    database.saveUpdateFinding(finding)
    return finding
}

export function queueUpdate(
    database: LibraryDatabase,
    finding: UpdateFinding,
    runner: 'LOCAL' | 'GITHUB' = 'LOCAL'
) {
    if (finding.newEpisodeOrders.length === 0)
        throw new Error('The update finding contains no new episodes')
    const job = database.createDownloadJob({
        comicId: finding.comicId,
        episodeOrders: finding.newEpisodeOrders,
        source: 'update',
        runner,
        priority: 10
    })
    return database.transitionDownloadJob(job.id, 'QUEUED')
}
