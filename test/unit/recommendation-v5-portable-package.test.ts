import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { RecommendationPolicyStoreV5 } from '../../src/recommendation-v5/policy-store'

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
            expect(first.foundation.visualGeneration).toBe(
                second.foundation.visualGeneration
            )
            expect(first.foundation.canonicalGeneration).toBe(
                second.foundation.canonicalGeneration
            )
            expect(first.behavior.generation).toBe(
                second.behavior.generation
            )
            expect(first.foundation.visualGeneration).toMatch(/^[0-9a-f]{24}$/)
            expect(first.foundation.canonicalGeneration).toMatch(/^[0-9a-f]{24}$/)
            expect(first.engineVersion).toBe('portable-v5-runtime-v1')
            expect(first.foundation.identityBindings).toEqual([])
            expect(first.behavior).toMatchObject({
                feedback: [],
                recentEvents: []
            })
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

    it('keeps portable policy generation stable across Session-only changes but advances for durable controls', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v5-policy-gen-'))
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
                        finished: true
                    }
                ],
                'test:discover'
            )
            const cycleId = 'policy-gen-cycle'
            database.saveV3CandidatePool({
                id: 'policy-gen-pool',
                cycleId,
                candidateIds: ['candidate-a'],
                telemetry: { state: 'ACTIVE' }
            })
            database.setAppState('recommendation.v3.activeCycle.v1', {
                schemaVersion: 1,
                activeCycleId: cycleId,
                activeBatchIndex: 0
            })
            const service = new LibraryService(database, dir)
            const store = new RecommendationPolicyStoreV5(database)

            const baseline = service.recommendationPortablePackageV5(100)
            store.setSessionIntent({
                mode: 'TARGET',
                targetType: 'TAG',
                key: 'session-only',
                label: '本次想看'
            })
            const sessionOnly = service.recommendationPortablePackageV5(100)
            expect(
                sessionOnly.foundation.portablePolicyGeneration
            ).toBe(baseline.foundation.portablePolicyGeneration)

            store.setControl({
                targetType: 'TAG',
                key: 'tag-a',
                label: 'tag-a',
                direction: 'MORE',
                levelDelta: 2,
                scope: 'PERSISTENT'
            })
            const durable = service.recommendationPortablePackageV5(100)
            expect(
                durable.foundation.portablePolicyGeneration
            ).not.toBe(baseline.foundation.portablePolicyGeneration)
        } finally {
            database.close()
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })
})
