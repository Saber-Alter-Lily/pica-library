import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { RecommendationCycleCommandsV3 } from '../../src/recommendation/cycle-commands'
import { RecommendationCycleQueriesV3 } from '../../src/recommendation/queries'
import {
    recommendationCycleReadStoreV3,
    recommendationCycleWriteStoreV3
} from '../../src/services/recommendation-cycle-store'
import { RecommendationPolicyStoreV5 } from '../../src/recommendation-v5/policy-store'
import {
    defaultPortablePolicyStateV5,
    RECOMMENDATION_V5_POLICY_STATE_KEY
} from '../../src/recommendation-v5/portable-policy'
import { cycleVersions, syntheticCycle } from '../fixtures/recommendation-cycle'

const opened: Array<{ root: string; database: LibraryDatabase }> = []
afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    while (opened.length) {
        const row = opened.pop()!
        row.database.close()
        fs.rmSync(row.root, { recursive: true, force: true })
    }
})
function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-cycle-module-')),
        database = new LibraryDatabase(path.join(root, 'library.db'))
    opened.push({ root, database })
    const built = syntheticCycle()
    database.importCatalog(
        built.ranked.map((r) => r.comic),
        'synthetic'
    )
    let idSequence = 0
    const build = vi.fn(async () => built),
        createId = vi.fn(() => `fixture-id-${++idSequence}`)
    const commands = new RecommendationCycleCommandsV3(
        recommendationCycleWriteStoreV3(database),
        build,
        cycleVersions,
        { createId, now: () => '2026-10-23T00:00:00.000Z' }
    )
    const readPort = recommendationCycleReadStoreV3(database),
        queries = new RecommendationCycleQueriesV3(readPort, cycleVersions)
    return {
        root,
        database,
        built,
        build,
        createId,
        commands,
        readPort,
        queries
    }
}
const writeSpies = (db: LibraryDatabase) => [
    vi.spyOn(db, 'setAppState'),
    vi.spyOn(db, 'saveV3CandidatePool'),
    vi.spyOn(db, 'saveOrReuseV3Profile'),
    vi.spyOn(db, 'saveV3BatchAndAllocate'),
    vi.spyOn(db, 'updateV3CandidatePoolState')
]
async function ready(f: ReturnType<typeof fixture>) {
    f.commands.resumeOrCreate('fixture-build')
    await f.commands.waitForBuild()
}

describe('recommendation domain and read/write capabilities', () => {
    it('reads an empty installation without creating cycle/policy state, IDs or calling the builder', () => {
        const f = fixture(),
            writes = writeSpies(f.database)
        expect(Object.isFrozen(f.readPort)).toBe(true)
        expect(f.readPort).not.toHaveProperty('writeState')
        expect(f.readPort).not.toHaveProperty('saveV3BatchAndAllocate')
        expect(f.queries.status().activeCycleId).toBeNull()
        expect(f.queries.current().recommendations).toEqual([])
        expect(f.queries.portable().items).toEqual([])
        expect(
            f.database.getAppState('recommendation.v3.activeCycle.v1')
        ).toBeUndefined()
        expect(
            f.database.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)
        ).toBeUndefined()
        for (const spy of writes) expect(spy).not.toHaveBeenCalled()
        expect(f.createId).not.toHaveBeenCalled()
        expect(f.build).not.toHaveBeenCalled()
    })
    it('does not allocate a first batch from a ready pool during a query', async () => {
        const f = fixture()
        await ready(f)
        const pool = f.database.latestV3CandidatePool(
            f.commands.status().activeCycleId!
        )!
        const writes = writeSpies(f.database),
            before = f.database.recommendationSeen(pool.cycleId)
        expect(f.queries.current()).toMatchObject({
            recommendations: [],
            awaitingFirstBatch: true,
            cycleState: 'READY_NO_BATCH'
        })
        expect(f.database.listV3Batches(pool.id)).toEqual([])
        expect(f.database.recommendationSeen(pool.cycleId)).toEqual(before)
        for (const spy of writes) expect(spy).not.toHaveBeenCalled()
        const allocated = f.commands.current()
        expect(allocated.recommendations).toHaveLength(12)
        expect(f.queries.current()).toEqual(allocated)
        expect(f.build).toHaveBeenCalledTimes(1)
    })
    it('reuses frozen scores, compact ID reads and baseline for repeated current/portable reads', async () => {
        const f = fixture()
        await ready(f)
        const current = f.commands.current()
        const writes = writeSpies(f.database),
            broad = vi.spyOn(f.database, 'listComics'),
            exact = vi.spyOn(f.database, 'getComicsByIds')
        expect(f.queries.current()).toEqual(current)
        expect(f.queries.current()).toEqual(current)
        const portable = f.queries.portable(24)
        expect(portable.items.map((r) => [r.comicId, r.score])).toEqual(
            f.built.ranked.slice(0, 24).map((r) => [r.comicId, r.score])
        )
        expect(portable).toMatchObject({
            cached: true,
            source: 'final-v3-portable-cache',
            policyBaseline: { fixture: 'unchanged-policy-baseline' }
        })
        expect(exact).toHaveBeenCalledTimes(1)
        expect(new Set(exact.mock.calls[0][0]).size).toBe(f.built.ranked.length)
        expect(broad).not.toHaveBeenCalled()
        for (const spy of writes) expect(spy).not.toHaveBeenCalled()
        expect(f.build).toHaveBeenCalledTimes(1)
    })
    it('reads the same persisted cycle and latest batch after rebuilding the query object', async () => {
        const f = fixture()
        await ready(f)
        f.commands.current()
        await f.commands.next('next-fixture')
        const before = f.queries.current(),
            seen = f.database.recommendationSeen(before.activeCycleId!),
            writes = writeSpies(f.database)
        const restored = new RecommendationCycleQueriesV3(
            recommendationCycleReadStoreV3(f.database),
            cycleVersions
        )
        expect(restored.current()).toEqual(before)
        expect(f.database.recommendationSeen(before.activeCycleId!)).toEqual(
            seen
        )
        for (const spy of writes) expect(spy).not.toHaveBeenCalled()
    })
    it('invalidates a warm eligibility view for a new raw hard BLOCK without changing stored scores/batches', async () => {
        const f = fixture()
        await ready(f)
        f.commands.current()
        f.queries.current()
        f.queries.portable()
        const pool = f.database.latestV3CandidatePool(
                f.commands.status().activeCycleId!
            )!,
            batches = f.database.listV3Batches(pool.id)
        const policy = new RecommendationPolicyStoreV5(f.database)
        policy.setTagPolicy({
            tagPolicy: {
                schemaVersion: 1,
                mode: 'SELECTED',
                selected: [],
                disabled: [],
                privateTags: []
            },
            baseRevision: policy.state().revision
        })
        policy.setControl({
            targetType: 'TAG',
            key: 'tag-a',
            label: 'Tag A',
            direction: 'BLOCK',
            scope: 'PERSISTENT'
        })
        const writes = writeSpies(f.database)
        const current = f.queries.current().recommendations,
            portable = f.queries.portable().items
        expect(current.length).toBeGreaterThan(0)
        expect(current.every((r) => !r.comic.tags.includes('tag-a'))).toBe(true)
        expect(portable.every((r) => !r.comic.tags.includes('tag-a'))).toBe(
            true
        )
        expect(f.database.listV3Batches(pool.id)).toEqual(batches)
        expect(f.database.getV3CandidatePool(pool.id)).toEqual(pool)
        for (const spy of writes) expect(spy).not.toHaveBeenCalled()
        expect(f.build).toHaveBeenCalledTimes(1)
    })
    it('refreshes seen/duplicate masks and expires temporary suppression without a new generation', async () => {
        const f = fixture()
        await ready(f)
        f.commands.current()
        f.queries.current()
        const state = defaultPortablePolicyStateV5()
        f.database.setAppState(RECOMMENDATION_V5_POLICY_STATE_KEY, {
            ...state,
            seenComicIds: ['fixture-0'],
            duplicateReportComicIds: ['fixture-1']
        })
        expect(
            f.queries.current().recommendations.map((r) => r.comicId)
        ).not.toContain('fixture-0')
        expect(f.queries.portable().items.map((r) => r.comicId)).not.toContain(
            'fixture-1'
        )
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'))
        f.database.setAppState(RECOMMENDATION_V5_POLICY_STATE_KEY, {
            ...state,
            temporarySuppressions: [
                {
                    comicId: 'fixture-2',
                    createdAt: '2030-01-01T00:00:00.000Z',
                    expiresAt: '2030-01-01T00:01:00.000Z'
                }
            ]
        })
        expect(
            f.queries.current().recommendations.map((r) => r.comicId)
        ).not.toContain('fixture-2')
        vi.setSystemTime(new Date('2030-01-01T00:02:00.000Z'))
        expect(
            f.queries.current().recommendations.map((r) => r.comicId)
        ).toContain('fixture-2')
        expect(f.build).toHaveBeenCalledTimes(1)
    })
    it('uses canonical owned-work bindings consistently in batch and portable views', async () => {
        const f = fixture()
        await ready(f)
        f.commands.current()
        f.database.setLocalFavoriteState('fixture-0', true)
        // The binding port supplies reviewed identities; the module must not infer these itself.
        const reader = new RecommendationCycleQueriesV3(
            {
                ...f.readPort,
                listAllWorkIdentityBindings: () => [
                    { comicId: 'fixture-0', workId: 'reviewed-work' },
                    { comicId: 'fixture-1', workId: 'reviewed-work' }
                ]
            },
            cycleVersions
        )
        const current = reader.current(),
            portable = reader.portable()
        for (const rows of [current.recommendations, portable.items]) {
            expect(rows.map((r) => r.comicId)).not.toContain('fixture-0')
            expect(rows.map((r) => r.comicId)).not.toContain('fixture-1')
        }
        expect(current).toMatchObject({
            servingFilterTelemetry: {
                canonicalOwnedWorkCount: 1,
                canonicalOwnedUploadCount: 2
            }
        })
        expect(f.build).toHaveBeenCalledTimes(1)
    })
})
