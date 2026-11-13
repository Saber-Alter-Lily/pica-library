import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WORK_IDENTITY_MATERIALIZATION_PREPARE_CONFIRMATION } from '../../src/identity/ports-v5'
import { RECOMMENDATION_V5_POLICY_STATE_KEY } from '../../src/recommendation-v5/portable-policy'
import {
    identityFixture,
    identityDatabaseState,
    IDENTITY_LEFT,
    IDENTITY_RIGHT,
    IDENTITY_THIRD,
    IDENTITY_NOW,
    type IdentityFixture,
    type IdentityScenario
} from '../fixtures/work-identity-fixture'

const fixtures: IdentityFixture[] = []
const fixture = (scenario?: IdentityScenario) => {
    const value = identityFixture(scenario)
    fixtures.push(value)
    return value
}
beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(IDENTITY_NOW))
})
afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    for (const value of fixtures.splice(0)) value.dispose()
})
const views = [
    'workVariantsForComic',
    'recommendationV5WorkIdentityAudit',
    'recommendationV5WorkIdentityEvidence',
    'recommendationV5WorkIdentityReview',
    'recommendationV5WorkIdentityMaterializationPlan',
    'recommendationV5WorkIdentityMaterializationRuns'
] as const
const argsFor = (name: (typeof views)[number]): unknown[] =>
    name === 'workVariantsForComic'
        ? [IDENTITY_LEFT, 24]
        : name === 'recommendationV5WorkIdentityMaterializationPlan'
          ? []
          : [200]
const call = (owner: object, name: string, args: unknown[]) =>
    Reflect.apply(Reflect.get(owner, name), owner, args)
const withoutAtomic = (value: IdentityFixture['trace']) =>
    value.filter((row) => row.name !== 'withAppStateTransaction')

describe('actual identity views versus fifteen-method frozen baseline', () => {
    for (const scenario of [
        'plain',
        'ready',
        'keep-separate',
        'bindings',
        'cover',
        'uninitialized'
    ] as const) {
        it.each(views)(
            scenario + ': %s preserves full output/read order and never writes',
            (name) => {
                const old = fixture(scenario),
                    next = fixture(scenario),
                    before = identityDatabaseState(next.database)
                const expected = call(old.frozen, name, argsFor(name))
                const actual = call(next.queries, name, argsFor(name))
                expect(actual).toEqual(expected)
                expect(next.trace).toEqual(
                    old.trace.filter(
                        (row) =>
                            scenario !== 'uninitialized' ||
                            row.name !== 'setAppState'
                    )
                )
                expect(identityDatabaseState(next.database)).toEqual(before)
                if (scenario === 'uninitialized')
                    expect(
                        next.database.getAppState(
                            RECOMMENDATION_V5_POLICY_STATE_KEY
                        )
                    ).toBeUndefined()
            }
        )
    }
    it.each(['', 'missing', 'cover-a', IDENTITY_LEFT])(
        'keeps variants %s and bounds compatible, including synthetic cover rescue',
        (id) => {
            const old = fixture('cover'),
                next = fixture('cover')
            for (const limit of [-1, 0, 1, 48, 100, Number.NaN])
                expect(next.queries.workVariantsForComic(id, limit)).toEqual(
                    old.frozen.workVariantsForComic(id, limit)
                )
            if (id === 'cover-a')
                expect(
                    next.queries
                        .workVariantsForComic(id)
                        .items.some((item) => item.comicId === 'eh:cover-b')
                ).toBe(true)
        }
    )
    it('retains full authoritative decisions beyond the visible 5000-row window', () => {
        const old = fixture('plain'),
            next = fixture('plain')
        for (const value of [old, next]) {
            value.database.importCatalog(
                Array.from({ length: 103 }, (_, index) => ({
                    comicId: 'many-' + index,
                    title: 'Many fixture ' + index,
                    author: 'Many Creator',
                    tags: [],
                    categories: [],
                    finished: true
                })),
                'synthetic:large-review'
            )
            value.database.withAppStateTransaction(() => {
                let index = 0
                const insert = value.sqlite.prepare(
                    "INSERT INTO work_identity_decisions(id,left_comic_id,right_comic_id,decision,source,note,created_at,updated_at) VALUES (?,?,?,'KEEP_SEPARATE','USER','',?,?)"
                )
                for (let left = 0; left < 103 && index < 5001; left++)
                    for (
                        let right = left + 1;
                        right < 103 && index < 5001;
                        right++
                    ) {
                        const pair = ['many-' + left, 'many-' + right].sort()
                        insert.run(
                            'many-decision-' + index++,
                            pair[0],
                            pair[1],
                            IDENTITY_NOW,
                            IDENTITY_NOW
                        )
                    }
            })
            value.trace.length = 0
        }
        expect(next.queries.recommendationV5WorkIdentityReview()).toEqual(
            old.frozen.recommendationV5WorkIdentityReview()
        )
        expect(next.trace).toEqual(old.trace)
        expect(
            next.trace.some(
                (row) => row.name === 'listAllWorkIdentityDecisions'
            )
        ).toBe(true)
    }, 20000)
})

describe('explicit identity commands retain results and do not apply bindings', () => {
    it.each(['SAME_WORK', 'EDITION_VARIANT', 'KEEP_SEPARATE', 'CLEAR'])(
        '%s keeps all successful rows, response and read/write order compatible',
        (decision) => {
            const old = fixture(),
                next = fixture()
            const input = {
                leftComicId: IDENTITY_LEFT,
                rightComicId: IDENTITY_RIGHT,
                decision,
                note: 'Synthetic note',
                limit: 20
            }
            expect(
                next.commands.updateRecommendationV5WorkIdentityDecision(input)
            ).toEqual(
                old.frozen.updateRecommendationV5WorkIdentityDecision(input)
            )
            expect(withoutAtomic(next.trace)).toEqual(old.trace)
            expect(identityDatabaseState(next.database)).toEqual(
                identityDatabaseState(old.database)
            )
            expect(
                next.database.workIdentityStorageStatus().counts.bindings
            ).toBe(0)
        }
    )
    it('explicit decisions still initialize policy when needed, unlike a read', () => {
        const old = fixture('uninitialized'),
            next = fixture('uninitialized')
        const input = {
            leftComicId: IDENTITY_LEFT,
            rightComicId: IDENTITY_RIGHT,
            decision: 'KEEP_SEPARATE'
        }
        expect(
            next.commands.updateRecommendationV5WorkIdentityDecision(input)
        ).toEqual(old.frozen.updateRecommendationV5WorkIdentityDecision(input))
        expect(identityDatabaseState(next.database)).toEqual(
            identityDatabaseState(old.database)
        )
        expect(
            next.database.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)
        ).toBeDefined()
    })
    it.each(['ready', 'uninitialized'] as const)(
        '%s evidence refresh saves only evidence, preserving its full report',
        (scenario) => {
            const old = fixture(scenario),
                next = fixture(scenario),
                before = identityDatabaseState(next.database)
            expect(
                next.commands.recommendationV5RefreshWorkIdentityEvidence()
            ).toEqual(old.frozen.recommendationV5RefreshWorkIdentityEvidence())
            expect(next.trace).toEqual(
                old.trace.filter(
                    (row) =>
                        scenario !== 'uninitialized' ||
                        row.name !== 'setAppState'
                )
            )
            const after = identityDatabaseState(next.database)
            for (const table of Object.keys(before))
                if (table !== 'work_identity_evidence')
                    expect(after[table], table).toEqual(before[table])
        }
    )
    it('prepares an idempotent unchanged plan but keeps execution and automatic binding disabled', () => {
        const old = fixture(),
            next = fixture()
        const plan =
            next.queries.recommendationV5WorkIdentityMaterializationPlan()
        expect(plan.summary.fullBindingReadyCount).toBe(1)
        const input = {
            requestKey: 'fixture-plan',
            planVersion: plan.planVersion,
            planDigest: plan.planDigest,
            confirmation: WORK_IDENTITY_MATERIALIZATION_PREPARE_CONFIRMATION
        }
        old.trace.length = next.trace.length = 0
        for (let attempt = 0; attempt < 2; attempt++) {
            const actual =
                next.commands.prepareRecommendationV5WorkIdentityMaterialization(
                    input
                )
            expect(actual).toEqual(
                old.frozen.prepareRecommendationV5WorkIdentityMaterialization(
                    input
                )
            )
            expect(actual).toMatchObject({
                mode: 'PREPARED_ONLY',
                executionEnabled: false,
                applyEndpoint: null,
                run: { idempotentReplay: attempt > 0 }
            })
        }
        expect(next.trace).toEqual(old.trace)
        expect(identityDatabaseState(next.database)).toEqual(
            identityDatabaseState(old.database)
        )
        expect(next.database.workIdentityStorageStatus().counts).toMatchObject({
            works: 0,
            editions: 0,
            bindings: 0,
            materializationRuns: 1
        })
    })
    it('accepts explicitly adjudicated local-only pairs without source login or binding application', () => {
        const value = fixture('plain')
        value.database.importCatalog(
            ['a', 'b'].map((key) => ({
                comicId: 'local:' + key,
                providerId: 'local',
                title: 'Local Fixture',
                author: 'Local Creator',
                pagesCount: 12,
                tags: [],
                categories: [],
                finished: true
            })),
            'synthetic:local-identity'
        )
        value.service.updateRecommendationV5WorkIdentityDecision({
            leftComicId: 'local:a',
            rightComicId: 'local:b',
            decision: 'SAME_WORK'
        })
        expect(
            value.service.recommendationV5WorkIdentityMaterializationPlan()
                .summary.fullBindingReadyCount
        ).toBe(1)
        expect(value.database.workIdentityStorageStatus().counts.bindings).toBe(
            0
        )
    })
    it.each(['confirmation', 'planVersion', 'planDigest'] as const)(
        'rejects obsolete/missing %s without any mutation',
        (key) => {
            const value = fixture(),
                plan =
                    value.queries.recommendationV5WorkIdentityMaterializationPlan(),
                before = identityDatabaseState(value.database)
            const input = {
                requestKey: 'fixture-plan',
                planVersion: plan.planVersion,
                planDigest: plan.planDigest,
                confirmation:
                    WORK_IDENTITY_MATERIALIZATION_PREPARE_CONFIRMATION,
                [key]: 'wrong'
            }
            value.trace.length = 0
            expect(() =>
                value.commands.prepareRecommendationV5WorkIdentityMaterialization(
                    input
                )
            ).toThrow()
            expect(identityDatabaseState(value.database)).toEqual(before)
            if (key === 'confirmation') expect(value.trace).toEqual([])
        }
    )
    it.each(['empty', 'conflict'] as const)(
        'does not prepare %s groups or gain a binding capability',
        (scenario) => {
            const value = fixture(scenario === 'empty' ? 'plain' : 'ready')
            if (scenario === 'conflict')
                value.proxy.saveWorkIdentityDecision({
                    leftComicId: IDENTITY_LEFT,
                    rightComicId: IDENTITY_THIRD,
                    decision: 'KEEP_SEPARATE'
                })
            const plan =
                    value.queries.recommendationV5WorkIdentityMaterializationPlan(),
                before = identityDatabaseState(value.database)
            expect(() =>
                value.commands.prepareRecommendationV5WorkIdentityMaterialization(
                    {
                        requestKey: 'fixture-blocked',
                        planVersion: plan.planVersion,
                        planDigest: plan.planDigest,
                        confirmation:
                            WORK_IDENTITY_MATERIALIZATION_PREPARE_CONFIRMATION
                    }
                )
            ).toThrow()
            expect(identityDatabaseState(value.database)).toEqual(before)
            expect(
                value.database.workIdentityStorageStatus().counts.bindings
            ).toBe(0)
        }
    )
})

describe('manual identity decision is one existing synchronous SQLite savepoint', () => {
    for (const decision of ['KEEP_SEPARATE', 'CLEAR', 'SAME_WORK']) {
        it.each([
            'policy-before-write',
            'policy-after-write',
            'review'
        ] as const)(
            decision + ' rolls back both facts and policy on %s failure',
            (stage) => {
                const value = fixture('keep-separate'),
                    before = identityDatabaseState(value.database)
                if (stage === 'review')
                    vi.spyOn(
                        value.database,
                        'listWorkIdentityEvidence'
                    ).mockImplementation(() => {
                        throw new Error('Synthetic review failure')
                    })
                else {
                    const save = value.database.setAppState.bind(value.database)
                    vi.spyOn(value.database, 'setAppState').mockImplementation(
                        (key, state) => {
                            if (stage === 'policy-after-write') save(key, state)
                            throw new Error('Synthetic policy write failure')
                        }
                    )
                }
                expect(() =>
                    value.service.updateRecommendationV5WorkIdentityDecision({
                        leftComicId: IDENTITY_LEFT,
                        rightComicId: IDENTITY_RIGHT,
                        decision
                    })
                ).toThrow('Synthetic')
                expect(identityDatabaseState(value.database)).toEqual(before)
            }
        )
    }
    it('rolls back a raw-ID decision when the policy identity rejects case-folded equal IDs', () => {
        const value = fixture('uninitialized')
        value.database.importCatalog(
            [
                {
                    comicId: IDENTITY_LEFT.toUpperCase(),
                    title: 'Synthetic uppercase ID',
                    author: 'Synthetic Creator',
                    tags: [],
                    categories: [],
                    finished: true
                }
            ],
            'synthetic:case'
        )
        const before = identityDatabaseState(value.database)
        expect(() =>
            value.service.updateRecommendationV5WorkIdentityDecision({
                leftComicId: IDENTITY_LEFT,
                rightComicId: IDENTITY_LEFT.toUpperCase(),
                decision: 'KEEP_SEPARATE'
            })
        ).toThrow('Two distinct comic ids')
        expect(identityDatabaseState(value.database)).toEqual(before)
    })
    it('preserves a surrounding transaction when an inner decision is caught and rejected', () => {
        const value = fixture('keep-separate'),
            before = identityDatabaseState(value.database)
        const save = value.database.setAppState.bind(value.database)
        vi.spyOn(value.database, 'setAppState').mockImplementation(
            (key, state) => {
                save(key, state)
                if (key === RECOMMENDATION_V5_POLICY_STATE_KEY)
                    throw new Error('Synthetic nested failure')
                return { key, updatedAt: IDENTITY_NOW }
            }
        )
        value.database.withAppStateTransaction(() => {
            value.database.setAppState('outer-fixture', { active: true })
            expect(() =>
                value.service.updateRecommendationV5WorkIdentityDecision({
                    leftComicId: IDENTITY_LEFT,
                    rightComicId: IDENTITY_RIGHT,
                    decision: 'CLEAR'
                })
            ).toThrow('Synthetic nested failure')
            expect(value.database.getAppState('outer-fixture')).toEqual({
                active: true
            })
        })
        const after = identityDatabaseState(value.database)
        for (const table of Object.keys(before))
            if (table !== 'app_state')
                expect(after[table], table).toEqual(before[table])
        expect(value.database.getAppState('outer-fixture')).toEqual({
            active: true
        })
        expect(
            value.database.getAppState<{ explicitDistinctPairs: string[] }>(
                RECOMMENDATION_V5_POLICY_STATE_KEY
            )?.explicitDistinctPairs
        ).toHaveLength(1)
    })
    it.each(['UNKNOWN', '', 'AUTO_BIND'])(
        'rejects invalid decision %s without writing',
        (decision) => {
            const value = fixture('uninitialized'),
                before = identityDatabaseState(value.database)
            expect(() =>
                value.commands.updateRecommendationV5WorkIdentityDecision({
                    leftComicId: IDENTITY_LEFT,
                    rightComicId: IDENTITY_RIGHT,
                    decision
                })
            ).toThrow('Unknown work identity decision')
            expect(identityDatabaseState(value.database)).toEqual(before)
        }
    )
})
