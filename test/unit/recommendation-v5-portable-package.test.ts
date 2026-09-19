import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'

describe('Recommendation V5 portable mobile package', () => {
    it('exports reusable candidates and generations without copying the current batch or raw visual vectors', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v5-portable-'))
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        try {
            database.importCatalog(
                [
                    {
                        comicId: 'candidate-a',
                        title: 'Candidate A',
                        author: 'Author A',
                        tags: ['tag-a'],
                        categories: ['短篇'],
                        finished: true,
                        totalLikes: 20,
                        totalViews: 100
                    },
                    {
                        comicId: 'owned-b',
                        title: 'Owned B',
                        author: 'Author B',
                        tags: ['tag-b'],
                        categories: ['長篇'],
                        finished: true
                    }
                ],
                'test:discover'
            )
            database.setFavoriteState('owned-b', true)

            const cycleId = 'portable-cycle'
            const pool = database.saveV3CandidatePool({
                id: 'portable-pool',
                cycleId,
                candidateIds: ['candidate-a', 'owned-b'],
                telemetry: { state: 'ACTIVE' }
            })
            database.setAppState('recommendation.v3.activeCycle.v1', {
                schemaVersion: 1,
                activeCycleId: cycleId,
                activeBatchIndex: 0
            })

            const service = new LibraryService(database, dir)
            const beforeBatches = database.listV3Batches(pool.id)
            const first = service.recommendationPortablePackageV5(100)
            const second = service.recommendationPortablePackageV5(100)
            const afterBatches = database.listV3Batches(pool.id)

            expect(afterBatches).toEqual(beforeBatches)
            expect(first.reservoir.sourceCycleId).toBe(cycleId)
            expect(first.reservoir.sourcePoolId).toBe(pool.id)
            expect(first.reservoir.candidates.map((row) => row.comicId)).toEqual([
                'candidate-a'
            ])
            expect(first.reservoir.generation).toBe(
                second.reservoir.generation
            )
            expect(first.foundation.visualGeneration).toMatch(/^[0-9a-f]{24}$/)
            expect(first.foundation.canonicalGeneration).toMatch(/^[0-9a-f]{24}$/)
            expect(first.engineVersion).toBe('portable-v5-runtime-v1')
            const serialized = JSON.stringify(first)
            expect(serialized).not.toContain('"vector"')
            expect(serialized).not.toContain('"embedding":[')
            expect(JSON.stringify(first)).not.toMatch(
                /password|passHash|authorization|cookie/i
            )
        } finally {
            database.close()
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })
})
