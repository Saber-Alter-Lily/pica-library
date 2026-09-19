import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { RecommendationPolicyStoreV5 } from '../../src/recommendation-v5/policy-store'

describe('Recommendation V5 serving composition', () => {
    it('reads the persisted current batch without allocating and summarizes only currently eligible items', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v5-serving-'))
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        try {
            database.importCatalog(
                [
                    {
                        comicId: 'keep',
                        title: 'Keep',
                        author: 'Keep Author',
                        tags: ['keep-tag'],
                        categories: ['短篇'],
                        finished: true
                    },
                    {
                        comicId: 'blocked',
                        title: 'Blocked',
                        author: 'Blocked Author',
                        tags: ['blocked-tag'],
                        categories: ['短篇'],
                        finished: true
                    }
                ],
                'test'
            )

            const cycleId = 'cycle-serving'
            const pool = database.saveV3CandidatePool({
                id: 'pool-serving',
                cycleId,
                candidateIds: ['keep', 'blocked'],
                telemetry: {
                    state: 'ACTIVE',
                    intentPlan: [
                        {
                            intentId: 'CREATOR:keep',
                            type: 'CREATOR',
                            anchors: [
                                {
                                    canonicalLabel: 'Keep Author',
                                    canonicalKey: 'keep-author'
                                }
                            ],
                            explanation: {
                                shortReason: '作者偏好'
                            }
                        },
                        {
                            intentId: 'CREATOR:blocked',
                            type: 'CREATOR',
                            anchors: [
                                {
                                    canonicalLabel: 'Blocked Author',
                                    canonicalKey: 'blocked-author'
                                }
                            ],
                            explanation: {
                                shortReason: '作者偏好'
                            }
                        }
                    ]
                }
            })

            database.saveV3BatchAndAllocate({
                poolId: pool.id,
                cycleId,
                batchIndex: 0,
                contextId: 'context-serving',
                itemIds: ['keep', 'blocked'],
                evidence: {
                    schemaVersion: 1,
                    allocatorVersion: 'test',
                    requestId: 'CURRENT',
                    items: [
                        {
                            comicId: 'keep',
                            rawRank: 1,
                            rawRankerScore: 10,
                            primaryIntentId: 'CREATOR:keep',
                            primaryFamily: 'CREATOR',
                            relatedOnly: false,
                            recentlyDisplayed: false,
                            reasonCodes: ['CREATOR_MATCH']
                        },
                        {
                            comicId: 'blocked',
                            rawRank: 2,
                            rawRankerScore: 9,
                            primaryIntentId: 'CREATOR:blocked',
                            primaryFamily: 'CREATOR',
                            relatedOnly: false,
                            recentlyDisplayed: false,
                            reasonCodes: ['CREATOR_MATCH']
                        }
                    ]
                }
            })

            database.setAppState('recommendation.v3.activeCycle.v1', {
                schemaVersion: 1,
                activeCycleId: cycleId,
                buildingCycleId: null,
                activeBatchIndex: 0,
                previousUsableCycleId: null,
                buildingRequestId: null,
                versions: {
                    profileVersion: 'test',
                    registryVersion: 'test',
                    rankerModelVersion: 'test',
                    candidatePoolVersion: 'test',
                    allocatorVersion: 'test'
                }
            })

            new RecommendationPolicyStoreV5(database).setControl({
                targetType: 'AUTHOR',
                key: 'Blocked Author',
                label: 'Blocked Author',
                direction: 'BLOCK',
                scope: 'PERSISTENT'
            })

            const beforeBatches = database.listV3Batches(pool.id)
            const service = new LibraryService(database, dir)
            const result = service.recommendationServingCompositionV3()
            const afterBatches = database.listV3Batches(pool.id)

            expect(afterBatches).toEqual(beforeBatches)
            expect(result).toMatchObject({
                available: true,
                source: 'final-v3-serving',
                cycleId,
                batchIndex: 0,
                itemCount: 1,
                allocatedItemCount: 2,
                servingFilteredCount: 1,
                primaryFamilies: { CREATOR: 1 }
            })
            expect(result.items.map((item) => item.comicId)).toEqual(['keep'])
            expect(result.primaryIntents).toMatchObject([
                {
                    intentId: 'CREATOR:keep',
                    count: 1,
                    type: 'CREATOR',
                    anchors: ['Keep Author']
                }
            ])
        } finally {
            database.close()
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })
})
