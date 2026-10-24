import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeRecommendationShadowV5 } from '../../src/recommendation/shadow-execution-v5'
import { RecommendationV5ShadowCancelledError } from '../../src/recommendation/shadow-task-v5'
import { RECOMMENDATION_V5_POLICY_STATE_KEY } from '../../src/recommendation-v5/portable-policy'
import { SourceDisabledError } from '../../src/sources/source-policy'
import * as semantics from '../../src/recommendation-v3/tag-resolution-v3'
import { FrozenRecommendationShadowV5 } from '../fixtures/recommendation-shadow-legacy'
import {
    shadowFixture,
    shadowDatabaseState,
    SHADOW_CONFIRM,
    SHADOW_TEST_NOW,
    type ShadowFixture,
    type ShadowScenario
} from '../fixtures/recommendation-shadow-fixture'

const fixtures: ShadowFixture[] = []
const fixture = (scenario?: ShadowScenario) => {
    const value = shadowFixture(scenario)
    fixtures.push(value)
    return value
}
const phases = [
    'planning',
    'retrieving',
    'hygiene',
    'ranking',
    'diversity',
    'audit',
    'persisting'
] as const
beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(SHADOW_TEST_NOW))
})
afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    for (const value of fixtures.splice(0)) value.dispose()
})

function unchangedExceptAudit(
    before: Record<string, string[]>,
    database: ShadowFixture['database']
) {
    const after = shadowDatabaseState(database)
    for (const [table, rows] of Object.entries(before))
        if (table !== 'recommendation_v3_candidate_pools')
            expect(after[table], table).toEqual(rows)
    expect(after.recommendation_v3_candidate_pools).toHaveLength(
        before.recommendation_v3_candidate_pools.length + 1
    )
}

describe('actual V5 shadow pipeline versus frozen pre-extraction execution', () => {
    it.each([
        'normal',
        'partial-provider-failure',
        'private-tags',
        'providers-off',
        'missing-policy',
        'many-candidates'
    ] as const)(
        '%s preserves full result, telemetry, phase/checkpoint/provider/read order and all non-audit tables',
        async (scenario) => {
            const old = fixture(scenario),
                next = fixture(scenario)
            const oldBefore = shadowDatabaseState(old.database),
                nextBefore = shadowDatabaseState(next.database)
            const frozen = new FrozenRecommendationShadowV5(
                old.proxy,
                old.hooks
            )
            const previousPhases: unknown[] = [],
                nextPhases: unknown[] = []
            old.trace.length = next.trace.length = 0
            const input = {
                ...SHADOW_CONFIRM,
                ...(scenario === 'many-candidates'
                    ? {
                          maxCandidates: 110,
                          batchSize: 50,
                          visualAnalysisBudget: 100
                      }
                    : {})
            }
            const expected = await frozen.runRecommendationV5ShadowRetrieval(
                input,
                {
                    checkpoint: () => {
                        old.trace.push({ name: 'checkpoint', args: [] })
                    },
                    onProgress: (progress) => previousPhases.push(progress)
                }
            )
            next.usePoolId(expected.audit.poolId)
            const actual = await executeRecommendationShadowV5(
                input,
                next.ports(expected.audit.cycleId),
                {
                    checkpoint: () => {
                        next.trace.push({ name: 'checkpoint', args: [] })
                    },
                    onProgress: (progress) => nextPhases.push(progress)
                }
            )
            expect(actual).toEqual(expected)
            expect(nextPhases).toEqual(previousPhases)
            expect(next.trace).toEqual(
                old.trace.filter(
                    (row) =>
                        scenario !== 'missing-policy' ||
                        row.name !== 'setAppState'
                )
            )
            unchangedExceptAudit(nextBefore, next.database)
            expect(
                next.database.getV3CandidatePool(actual.audit.poolId)
            ).toEqual(old.database.getV3CandidatePool(expected.audit.poolId))
            expect(actual).toMatchObject({
                mode: 'SHADOW',
                persistCandidates: false,
                servingImpact: false,
                executionAuthority: 'MANUAL_DESKTOP_ONLY',
                trigger: 'EXPLICIT_CONFIRMATION'
            })
            expect(next.database.getComic('returned-0')).toBeUndefined()
            if (scenario === 'missing-policy') {
                expect(
                    old.database.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)
                ).toBeDefined()
                expect(
                    next.database.getAppState(
                        RECOMMENDATION_V5_POLICY_STATE_KEY
                    )
                ).toBeUndefined()
            } else {
                unchangedExceptAudit(oldBefore, old.database)
                expect(shadowDatabaseState(next.database)).toEqual(
                    shadowDatabaseState(old.database)
                )
            }
            if (scenario === 'partial-provider-failure')
                expect(
                    actual.telemetry.providers.eh.failedRoutes
                ).toBeGreaterThan(0)
            if (scenario === 'providers-off')
                expect(
                    next.trace.filter((row) =>
                        ['search', 'relatedPica'].includes(row.name)
                    )
                ).toHaveLength(0)
            if (scenario === 'many-candidates')
                expect(actual.ranking.candidateCount).toBeGreaterThan(25)
        }
    )
    it.each([
        {
            limit: -8,
            maxCandidates: -1,
            batchSize: -1,
            visualAnalysisBudget: -1
        },
        {
            limit: 8000,
            maxCandidates: 8000,
            batchSize: 8000,
            visualAnalysisBudget: 8000
        },
        { limit: 0, maxCandidates: 0, batchSize: 0, visualAnalysisBudget: 0 },
        {
            limit: 'invalid',
            maxCandidates: 'invalid',
            batchSize: 'invalid',
            visualAnalysisBudget: 'invalid'
        }
    ])(
        'keeps budget normalization and full results compatible for %j',
        async (overrides) => {
            const old = fixture(),
                next = fixture()
            const expected = await new FrozenRecommendationShadowV5(
                old.proxy,
                old.hooks
            ).runRecommendationV5ShadowRetrieval({
                ...SHADOW_CONFIRM,
                ...overrides
            })
            next.usePoolId(expected.audit.poolId)
            expect(
                await executeRecommendationShadowV5(
                    { ...SHADOW_CONFIRM, ...overrides },
                    next.ports(expected.audit.cycleId)
                )
            ).toEqual(expected)
        }
    )
    it('keeps missing Registry fallback output identical, without initializing user state', async () => {
        vi.spyOn(semantics, 'loadTagRegistryV3').mockImplementation(() => {
            throw new Error('Synthetic missing Registry')
        })
        const old = fixture(),
            next = fixture(),
            before = shadowDatabaseState(next.database)
        const expected = await new FrozenRecommendationShadowV5(
            old.proxy,
            old.hooks
        ).runRecommendationV5ShadowRetrieval(SHADOW_CONFIRM)
        next.usePoolId(expected.audit.poolId)
        expect(
            await executeRecommendationShadowV5(
                SHADOW_CONFIRM,
                next.ports(expected.audit.cycleId)
            )
        ).toEqual(expected)
        unchangedExceptAudit(before, next.database)
    })
    it('does not swallow late semantic resolver failures or publish partial audits', async () => {
        vi.spyOn(semantics, 'resolveTagV3').mockImplementation(() => {
            throw new Error('Synthetic semantic row failure')
        })
        for (const implementation of ['old', 'new'] as const) {
            const value = fixture(),
                before = shadowDatabaseState(value.database)
            const run =
                implementation === 'old'
                    ? new FrozenRecommendationShadowV5(
                          value.proxy,
                          value.hooks
                      ).runRecommendationV5ShadowRetrieval(SHADOW_CONFIRM)
                    : executeRecommendationShadowV5(
                          SHADOW_CONFIRM,
                          value.ports()
                      )
            await expect(run).rejects.toThrow('Synthetic semantic row failure')
            expect(shadowDatabaseState(value.database)).toEqual(before)
        }
    })
})

describe('shadow write authority and source-revision fencing', () => {
    it.each([{}, { confirmation: 'GENERATE_RECOMMENDATIONS' }])(
        'rejects missing explicit authority before reads, providers or writes: %j',
        async (input) => {
            const value = fixture('missing-policy'),
                before = shadowDatabaseState(value.database)
            value.trace.length = 0
            await expect(
                executeRecommendationShadowV5(input, value.ports())
            ).rejects.toThrow(
                'Explicit shadow retrieval confirmation is required'
            )
            expect(value.trace).toEqual([])
            expect(shadowDatabaseState(value.database)).toEqual(before)
        }
    )
    it.each(phases)(
        'source changes during %s prevent any audit or policy write',
        async (phase) => {
            const value = fixture('missing-policy'),
                before = shadowDatabaseState(value.database)
            const observed: string[] = []
            await expect(
                value.service.runRecommendationV5ShadowRetrieval(
                    SHADOW_CONFIRM,
                    {
                        onProgress: (progress) => {
                            observed.push(progress.phase!)
                            if (
                                progress.phase === phase &&
                                value.service.sources.snapshot().revision === 0
                            )
                                value.service.sources.apply(
                                    value.service.sources.prepare([], 0)
                                )
                        }
                    }
                )
            ).rejects.toThrow(
                'Source choices changed during shadow retrieval; no shadow audit was saved'
            )
            expect(observed).not.toContain('complete')
            expect(shadowDatabaseState(value.database)).toEqual(before)
        }
    )
    it('disabling and re-enabling a source does not revive an obsolete run', async () => {
        const value = fixture('missing-policy'),
            before = shadowDatabaseState(value.database)
        await expect(
            value.service.runRecommendationV5ShadowRetrieval(SHADOW_CONFIRM, {
                onProgress: (progress) => {
                    if (progress.phase !== 'persisting') return
                    const enabled = value.service.sources.snapshot().enabled
                    value.service.sources.apply(
                        value.service.sources.prepare([], 0)
                    )
                    value.service.sources.apply(
                        value.service.sources.prepare(enabled, 1)
                    )
                }
            })
        ).rejects.toThrow('Source choices changed')
        expect(value.service.sources.snapshot().revision).toBe(2)
        expect(shadowDatabaseState(value.database)).toEqual(before)
    })
    it('transport failure isolation cannot swallow a source-revision change and still save', async () => {
        const value = fixture('missing-policy'),
            before = shadowDatabaseState(value.database)
        const original = value.hooks.provider()
        let calls = 0
        value.service.providerService = (() => ({
            ...original,
            search: async () => {
                calls++
                if (calls === 1)
                    value.service.sources.apply(
                        value.service.sources.prepare([], 0)
                    )
                throw new SourceDisabledError('pica')
            }
        })) as unknown as typeof value.service.providerService
        await expect(
            value.service.runRecommendationV5ShadowRetrieval(SHADOW_CONFIRM)
        ).rejects.toThrow('Source choices changed')
        expect(calls).toBeGreaterThan(0)
        expect(shadowDatabaseState(value.database)).toEqual(before)
    })
    it.each(phases)(
        'cooperative cancellation at %s leaves all user tables unchanged',
        async (phase) => {
            const value = fixture('missing-policy'),
                before = shadowDatabaseState(value.database)
            let current = ''
            await expect(
                executeRecommendationShadowV5(SHADOW_CONFIRM, value.ports(), {
                    onProgress: (progress) => {
                        current = progress.phase!
                    },
                    checkpoint: () => {
                        if (current === phase)
                            throw new RecommendationV5ShadowCancelledError()
                    }
                })
            ).rejects.toBeInstanceOf(RecommendationV5ShadowCancelledError)
            expect(shadowDatabaseState(value.database)).toEqual(before)
        }
    )
    it('save failure remains failure, emits no complete progress and does not activate serving', async () => {
        const value = fixture('missing-policy'),
            before = shadowDatabaseState(value.database),
            observed: string[] = []
        vi.spyOn(value.database, 'saveV3CandidatePool').mockImplementation(
            () => {
                throw new Error('Synthetic audit storage failure')
            }
        )
        await expect(
            executeRecommendationShadowV5(SHADOW_CONFIRM, value.ports(), {
                onProgress: (p) => observed.push(p.phase!)
            })
        ).rejects.toThrow('Synthetic audit storage failure')
        expect(observed).toContain('persisting')
        expect(observed).not.toContain('complete')
        expect(shadowDatabaseState(value.database)).toEqual(before)
    })
})
