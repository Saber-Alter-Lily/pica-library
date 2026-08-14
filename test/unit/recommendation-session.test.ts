import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { RecommendationService } from '../../src/services/recommendation-service'

const directories: string[] = []

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('RecommendationService sessions', () => {
    it('preserves first batch order, creates session 2 and excludes seen IDs', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-rec-session-'))
        directories.push(root)
        const database = new LibraryDatabase(path.join(root, 'library.db'))
        database.importCatalog(
            Array.from({ length: 70 }, (_, index) => ({
                comicId: `r-${index}`,
                title: `Recommendation ${index}`,
                author: `Author ${index % 8}`,
                categories: [],
                tags: [],
                finished: false
            }))
        )
        const ranked = database
            .listComics({ limit: 5000 })
            .map((comic, index) => ({
                comic,
                score: 100 - index,
                reasons: [`rank-${index}`],
                recallSources: ['fixture'],
                matchedSignals: [],
                exploration: false
            }))
        const generate = vi.fn(async () => ({
            recommendations: ranked,
            profile: { fixture: true }
        }))
        const service = new RecommendationService(database, generate)
        const session1 = await service.nextSession()
        expect(session1.sessionNo).toBe(1)
        expect(session1.batchCount).toBe(5)
        expect(session1.recommendations.slice(0, 12)).toEqual(
            ranked.slice(0, 12)
        )
        const session2 = await service.nextSession()
        expect(session2.sessionNo).toBe(2)
        expect(session2.recommendations).toHaveLength(10)
        expect(session2.recommendations[0].comic.comicId).toBe(
            ranked[60].comic.comicId
        )
        expect(
            new Set([
                ...session1.recommendations.map((item) => item.comic.comicId),
                ...session2.recommendations.map((item) => item.comic.comicId)
            ]).size
        ).toBe(70)
        const exhausted = await service.nextSession()
        expect(exhausted).toMatchObject({
            sessionNo: 3,
            exhausted: true,
            message: '暂时没有更多未展示推荐。'
        })
        const restarted = await service.restartCycle()
        expect(restarted.sessionNo).toBe(1)
        expect(restarted.recommendations[0].comic.comicId).toBe(
            ranked[0].comic.comicId
        )
        database.close()
    })
})
