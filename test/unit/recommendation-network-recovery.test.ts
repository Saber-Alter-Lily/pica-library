import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { retrieveCandidatesV3 } from '../../src/recommendation-v3/retriever-v3'
import { CycleCoordinatorV3, type BuiltRecommendationCycleV3 } from '../../src/recommendation-v3/cycle-coordinator-v3'

const dirs: string[] = []
function tempDb(prefix: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    dirs.push(dir)
    return { dir, database: new LibraryDatabase(path.join(dir, 'library.db')) }
}

describe('recommendation network interruption recovery', () => {
    it('clears a stale persisted building cycle when a new Desktop process starts', () => {
        const { dir, database } = tempDb('pica-rec-stale-')
        try {
            database.setAppState('recommendation.v3.activeCycle.v1', {
                schemaVersion: 1,
                activeCycleId: 'last-good-cycle',
                buildingCycleId: 'interrupted-cycle',
                activeBatchIndex: 2,
                previousUsableCycleId: null,
                buildingRequestId: 'old-request',
                versions: {}
            })
            const service = new LibraryService(database, dir)
            const state = database.getAppState<Record<string, unknown>>(
                'recommendation.v3.activeCycle.v1'
            )!
            expect(state.activeCycleId).toBe('last-good-cycle')
            expect(state.buildingCycleId).toBeNull()
            expect(state.buildingRequestId).toBeNull()
            expect(service.recommendationBuildProgress()).toMatchObject({
                state: 'failed',
                phase: 'recovered'
            })
        } finally {
            database.close()
        }
    })

    it('stops route retrieval after three consecutive provider failures', async () => {
        let calls = 0
        const routes = Array.from({ length: 8 }, (_, index) => ({
            routeId: `route-${index}`,
            parentIntentId: 'intent',
            family: 'SEMANTIC_ANCHOR',
            routeType: 'KEYWORD',
            queryTerm: `term-${index}`,
            page: 1,
            sort: 'loved'
        }))
        const result = await retrieveCandidatesV3({
            provider: {
                keyword: async () => {
                    calls += 1
                    throw new Error('network timeout')
                },
                author: async () => [],
                related: async () => []
            },
            routes: routes as never,
            intents: [{ intentId: 'intent', type: 'SEMANTIC_ANCHOR' }] as never,
            favoriteIds: new Set()
        })
        expect(calls).toBe(3)
        expect(result.telemetry.providerRequestCount).toBe(3)
        expect(result.telemetry.stoppedBy).toBe('PROVIDER_FAILURE_BUDGET')
        expect(result.readiness).toBe('FAILED_INSUFFICIENT_POOL')
    })

    it('never promotes an unusable replacement cycle over the last good cycle', async () => {
        const { database } = tempDb('pica-rec-retain-')
        try {
            const versions = {
                profileVersion: 'profile-test',
                registryVersion: 'registry-test',
                rankerModelVersion: 'ranker-test',
                candidatePoolVersion: 'pool-test',
                allocatorVersion: 'allocator-test'
            }
            const base = {
                profile: {
                    favoriteFingerprint: 'favorite-fingerprint',
                    registryVersion: 'registry-test',
                    profileVersion: 'profile-test',
                    generatedAt: '2026-09-21T00:00:00.000Z'
                },
                intents: [],
                routes: [],
                ranked: [],
                telemetry: {},
                versions
            }
            let next: BuiltRecommendationCycleV3 = {
                ...base,
                readiness: 'READY_LIMITED'
            } as BuiltRecommendationCycleV3
            const coordinator = new CycleCoordinatorV3(
                database,
                async () => next,
                versions
            )
            coordinator.resumeOrCreate('initial')
            await coordinator.waitForBuild()
            const goodCycle = coordinator.status().activeCycleId
            expect(goodCycle).toBeTruthy()

            next = {
                ...base,
                readiness: 'FAILED_INSUFFICIENT_POOL'
            } as BuiltRecommendationCycleV3
            coordinator.forceNew('bad-network-refresh')
            await expect(coordinator.waitForBuild()).rejects.toThrow(
                'previous recommendations were kept'
            )
            expect(coordinator.status().activeCycleId).toBe(goodCycle)
            expect(coordinator.status().buildingCycleId).toBeNull()
            expect(database.latestV3CandidatePool(goodCycle!)?.telemetry.state).toBe(
                'READY_LIMITED'
            )
        } finally {
            database.close()
        }
    })
})

for (const dir of dirs) {
    process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }))
}
