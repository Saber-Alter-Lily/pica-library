import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { checkComicUpdates, queueUpdate } from '../../src/maintenance/updates'
import { queueRepairs, scanRepairIssues } from '../../src/maintenance/repair'

const dirs: string[] = []
function setup() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-maintenance-'))
    dirs.push(dir)
    const database = new LibraryDatabase(path.join(dir, 'library.db'))
    database.importCatalog([
        {
            comicId: 'comic-1',
            title: 'Work',
            author: 'Author',
            categories: [],
            tags: [],
            finished: false
        }
    ])
    database.upsertEpisode({ id: 'e1', comicId: 'comic-1', title: 'One', order: 1 })
    return { dir, database }
}

afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })))

describe('maintenance', () => {
    it('detects only new remote episodes and queues an incremental update', async () => {
        const { database } = setup()
        const finding = await checkComicUpdates(database, {
            async episodes() {
                return [
                    { id: 'e1', order: 1, title: 'One' },
                    { id: 'e2', order: 2, title: 'Two' }
                ]
            }
        }, 'comic-1')
        expect(finding).toMatchObject({ oldEpisodeCount: 1, newEpisodeCount: 2, newEpisodeOrders: [2] })
        expect(queueUpdate(database, finding)).toMatchObject({ source: 'update', episodeOrders: [2], status: 'QUEUED' })
        database.close()
    })

    it('groups missing and empty files into one repair job', () => {
        const { dir, database } = setup()
        const empty = path.join(dir, 'empty.jpg')
        fs.writeFileSync(empty, '')
        database.upsertPicture({ id: 'p1', comicId: 'comic-1', episodeId: 'e1', position: 1, originalName: '1.jpg', mediaPath: '/1.jpg', fileServer: 'https://example.test' })
        database.upsertPicture({ id: 'p2', comicId: 'comic-1', episodeId: 'e1', position: 2, originalName: '2.jpg', mediaPath: '/2.jpg', fileServer: 'https://example.test' })
        database.markPictureDownloaded('p2', empty, 0, '')
        const issues = scanRepairIssues(database)
        expect(issues.map((issue) => issue.reason).sort()).toEqual(['empty', 'missing'])
        expect(queueRepairs(database, issues)).toHaveLength(1)
        database.close()
    })
})
