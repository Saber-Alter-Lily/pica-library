import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    compatibilityFixture,
    compatibilityDatabaseState,
    type CompatibilityFixture
} from '../fixtures/legacy-recommendation-fixture'
import { AdaptiveRecommendationBatches } from '../../src/recommendation/adaptive-batches'
import {
    adaptiveSessionPorts,
    legacyRecallPorts
} from '../../src/services/legacy-recommendation-adapter'
import { LegacyRecommendationRetrieval } from '../../src/recommendation/legacy-retrieval'

const fixtures: CompatibilityFixture[] = []
const fixture = () => {
    const f = compatibilityFixture('empty', 30)
    fixtures.push(f)
    f.prepareSessions()
    return f
}
afterEach(() => {
    for (const f of fixtures.splice(0)) f.dispose()
    vi.restoreAllMocks()
})

describe('adaptive commit failures are one synchronous existing savepoint', () => {
    for (const failure of [
        'after-allocation',
        'before-batch',
        'after-batch',
        'after-pointer',
        'returned-view'
    ] as const)
        it(
            'restores every table and retries the same unconsumed candidates: ' +
                failure,
            async () => {
                const f = fixture(),
                    db = f.database
                const pool = db.saveV3CandidatePool({
                    id: 'synthetic-pool',
                    cycleId: 'synthetic-cycle',
                    candidateIds: db
                        .listComics({ limit: 500 })
                        .map((row) => row.comicId)
                })
                db.setAppState('recommendation.v3.activeCycle', {
                    cycleId: 'synthetic-cycle',
                    poolId: pool.id,
                    batchIndex: -1,
                    appSessionId: null
                })
                const before = compatibilityDatabaseState(db)
                let reject = true,
                    seenReads = 0
                const allocate = db.allocateRecommendationIds.bind(db),
                    batch = db.saveV3Batch.bind(db),
                    state = db.setAppState.bind(db),
                    seen = db.recommendationSeen.bind(db)
                vi.spyOn(db, 'allocateRecommendationIds').mockImplementation(
                    (...args) => {
                        const value = allocate(...args)
                        if (reject && failure === 'after-allocation')
                            throw Error(failure)
                        return value
                    }
                )
                vi.spyOn(db, 'saveV3Batch').mockImplementation((input) => {
                    if (reject && failure === 'before-batch')
                        throw Error(failure)
                    const value = batch(input)
                    if (reject && failure === 'after-batch')
                        throw Error(failure)
                    return value
                })
                vi.spyOn(db, 'setAppState').mockImplementation((key, value) => {
                    const saved = state(key, value)
                    if (
                        reject &&
                        failure === 'after-pointer' &&
                        key === 'recommendation.v3.activeCycle'
                    )
                        throw Error(failure)
                    return saved
                })
                vi.spyOn(db, 'recommendationSeen').mockImplementation(
                    (cycle) => {
                        const value = seen(cycle)
                        if (
                            reject &&
                            failure === 'returned-view' &&
                            ++seenReads === 2
                        )
                            throw Error(failure)
                        return value
                    }
                )
                const ports = adaptiveSessionPorts(f.proxy)
                const service = new AdaptiveRecommendationBatches(
                    ports.read,
                    ports.write,
                    f.generate,
                    { createId: () => 'synthetic-context' }
                )
                await expect(service.nextBatch()).rejects.toThrow(failure)
                expect(compatibilityDatabaseState(db)).toEqual(before)
                reject = false
                const result = await service.nextBatch()
                expect(result).toMatchObject({
                    currentBatchIndex: 0,
                    exhausted: false
                })
                expect(result.recommendations).toHaveLength(12)
                expect(db.recommendationSeen('synthetic-cycle')).toHaveLength(
                    12
                )
                expect(db.listV3Batches(pool.id)).toHaveLength(1)
                expect(f.generations()).toBe(0)
            }
        )
    it('rolls back candidate pool + pointer and does not cache a rolled-back pool', async () => {
        const f = fixture(),
            db = f.database
        let reject = true
        const set = db.setAppState.bind(db)
        vi.spyOn(db, 'setAppState').mockImplementation((key, state) => {
            const result = set(key, state)
            if (
                reject &&
                key === 'recommendation.v3.activeCycle' &&
                (state as { poolId?: unknown }).poolId
            )
                throw Error('pool pointer after SQL')
            return result
        })
        const ports = adaptiveSessionPorts(f.proxy)
        const controller = new AdaptiveRecommendationBatches(
            ports.read,
            ports.write,
            f.generate,
            { createId: () => 'synthetic-context' }
        )
        await expect(controller.nextBatch()).rejects.toThrow(
            'pool pointer after SQL'
        )
        expect(db.listV3CandidatePools()).toHaveLength(0)
        expect(db.getAppState('recommendation.v3.activeCycle')).toMatchObject({
            poolId: null,
            batchIndex: -1
        })
        reject = false
        expect((await controller.nextBatch()).recommendations).toHaveLength(12)
        expect(f.generations()).toBe(2)
        expect(db.listV3CandidatePools()).toHaveLength(1)
    })
    it('preserves the caller transaction when a nested final commit rejects', async () => {
        const f = fixture(),
            db = f.database
        const pool = db.saveV3CandidatePool({
            id: 'nested-pool',
            cycleId: 'nested-cycle',
            candidateIds: db
                .listComics({ limit: 500 })
                .map((row) => row.comicId)
        })
        db.setAppState('recommendation.v3.activeCycle', {
            cycleId: 'nested-cycle',
            poolId: pool.id,
            batchIndex: -1,
            appSessionId: null
        })
        const before = compatibilityDatabaseState(db),
            ports = adaptiveSessionPorts(f.proxy)
        const write = {
            ...ports.write,
            atomic: <T>(operation: () => T): T =>
                db.withAppStateTransaction(() => {
                    const result = ports.write.atomic(operation)
                    db.setAppState('synthetic-outer', true)
                    throw Error('outer rollback after nested commit')
                    return result
                })
        }
        const controller = new AdaptiveRecommendationBatches(
            ports.read,
            write,
            f.generate,
            { createId: () => 'nested-context' }
        )
        await expect(controller.nextBatch()).rejects.toThrow('outer rollback')
        expect(compatibilityDatabaseState(db)).toEqual(before)
    })
})

describe('legacy explicit source and capability safety', () => {
    for (const change of [
        'disable',
        'disable-reenable',
        'revision-only'
    ] as const)
        it(
            'does not import late recalled metadata after a source revision changes: ' +
                change,
            async () => {
                const f = compatibilityFixture('normal')
                fixtures.push(f)
                const before = compatibilityDatabaseState(f.database)
                let changed = false
                vi.spyOn(f.sdk, 'related').mockImplementation(async () => {
                    if (!changed) {
                        changed = true
                        const sources = f.service.sources
                        sources.apply(
                            sources.prepare(
                                change === 'revision-only'
                                    ? ['pica', 'eh', 'jm']
                                    : ['eh', 'jm'],
                                sources.snapshot().revision
                            )
                        )
                        if (change === 'disable-reenable')
                            sources.apply(
                                sources.prepare(
                                    ['pica', 'eh', 'jm'],
                                    sources.snapshot().revision
                                )
                            )
                    }
                    return [f.rawComic('late-candidate')]
                })
                await expect(f.service.recommendations()).rejects.toThrow(
                    /Source is disabled|Source choices changed/
                )
                expect(compatibilityDatabaseState(f.database)).toEqual(before)
            }
        )
    it('does not open a source or create policy for an empty library even with all sources off', async () => {
        const f = compatibilityFixture('empty')
        fixtures.push(f)
        f.service.sources.apply(f.service.sources.prepare([], 0))
        const before = compatibilityDatabaseState(f.database),
            connect = vi.spyOn(f.service, 'connect')
        expect((await f.service.recommendations()).recommendations).toEqual([])
        expect(connect).not.toHaveBeenCalled()
        expect(compatibilityDatabaseState(f.database)).toEqual(before)
    })
    it('exposes only bound operations and tag policy, never the SDK/DB/portable profile object', async () => {
        const f = fixture()
        const ports = legacyRecallPorts({
            database: f.proxy,
            sources: f.service.sources,
            connect: async () => f.sdk,
            convert: (raw) => ({
                comicId: raw._id,
                title: raw.title,
                author: raw.author,
                tags: raw.tags,
                categories: raw.categories,
                finished: raw.finished
            }),
            tagPolicy: () =>
                ({
                    tagPolicy: undefined,
                    controls: ['not a tag input']
                }) as never
        })
        expect(Object.keys(ports.read).sort()).toEqual([
            'listComics',
            'listRecommendationEdges',
            'listUserEvents'
        ])
        expect(Object.keys(ports.write).sort()).toEqual([
            'importCatalog',
            'recordRecommendationEdge'
        ])
        expect(Object.keys(ports.tagPolicy())).toEqual(['tagPolicy'])
        expect(Object.keys((await ports.openProvider()).client).sort()).toEqual(
            ['Order', 'comicsPage', 'related', 'search']
        )
        expect(new LegacyRecommendationRetrieval(ports)).toBeDefined()
    })
})
