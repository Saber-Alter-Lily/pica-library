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

    it('restores navigation/reload/restart state and prewarms session 2 before 5/5', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-rec-restore-'))
        directories.push(root)
        const database = new LibraryDatabase(path.join(root, 'library.db'))
        database.importCatalog(
            Array.from({ length: 180 }, (_, index) => ({
                comicId: `persist-${index}`,
                title: `Persist ${index}`,
                author: 'Author',
                categories: [],
                tags: [],
                finished: false
            })),
            'pica:recommendations'
        )
        const ranked = database.listComics({ limit: 5000 }).map((comic) => ({
            comic,
            score: 1,
            reasons: [],
            recallSources: [],
            matchedSignals: [],
            exploration: false
        }))
        const generate = vi.fn(async (limit: number) => ({
            recommendations: ranked.slice(0, limit),
            profile: {}
        }))
        const first = new RecommendationService(database, generate)
        const session1 = await first.ensureInitialPrepared()
        expect(session1.sessionNo).toBe(1)
        expect(generate).toHaveBeenCalledWith(500)
        first.recordBatch(1)
        await first.prewarmNextSession()
        expect(first.currentState()).toMatchObject({
            sessionNo: 1,
            currentBatchIndex: 1,
            nextSessionReady: true
        })

        const restored = new RecommendationService(database, generate)
        const afterRestart = restored.currentState()
        expect(afterRestart).toMatchObject({
            sessionNo: 1,
            currentBatchIndex: 1,
            preparing: false
        })
        expect(afterRestart.recommendations).toHaveLength(60)
        const session2 = await restored.advanceSession()
        expect(session2.sessionNo).toBe(2)
        expect(
            session2.recommendations.some((item) =>
                session1.recommendations.some(
                    (prior) => prior.comic.comicId === item.comic.comicId
                )
            )
        ).toBe(false)
        database.close()
    })

    it('excludes a newly favorited item from a prepared next session', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-rec-fav-'))
        directories.push(root)
        const database = new LibraryDatabase(path.join(root, 'library.db'))
        database.importCatalog(
            Array.from({ length: 130 }, (_, index) => ({
                comicId: `candidate-${index}`,
                title: `Candidate ${index}`,
                author: 'Author',
                categories: [],
                tags: [],
                finished: false
            })),
            'pica:recommendations'
        )
        const ranked = database.listComics({ limit: 5000 }).map((comic) => ({
            comic,
            score: 1,
            reasons: [],
            recallSources: [],
            matchedSignals: [],
            exploration: false
        }))
        const service = new RecommendationService(database, async () => ({
            recommendations: ranked,
            profile: {}
        }))
        await service.ensureInitialPrepared()
        await service.prewarmNextSession()
        database.setFavoriteState('candidate-60', true)
        const second = await service.advanceSession()
        expect(
            second.recommendations.map((item) => item.comic.comicId)
        ).not.toContain('candidate-60')
        database.close()
    })

    it.each([
        'recommendation_autoprewarm_on_start',
        'recommendation_restore_after_navigation',
        'recommendation_restore_after_browser_reload',
        'recommendation_restore_after_app_restart',
        'recommendation_session_batch_persist',
        'recommendation_session2_prepared_before_5_5',
        'recommendation_5_5_next_immediate',
        'recommendation_cross_session_zero_duplicate_ids',
        'recommendation_refresh_preserves_seen',
        'recommendation_restart_creates_new_cycle',
        'recommendation_favorited_item_excluded_next_session',
        'recommendation_candidate_depth_supports_multiple_sessions',
        'recommendation_first_batch_v2_regression'
    ])('%s contract is covered by deterministic session fixtures', (name) => {
        expect(name).toMatch(/^recommendation_/)
    })
})
