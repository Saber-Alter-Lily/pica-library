import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    FrozenLegacyRecall,
    FrozenLegacySessions,
    FrozenAdaptiveSessions
} from '../fixtures/legacy-recommendation-frozen'
import {
    compatibilityFixture,
    compatibilityDatabaseState,
    COMPATIBILITY_TEST_NOW,
    type CompatibilityFixture,
    type RecallScenario
} from '../fixtures/legacy-recommendation-fixture'
import { RecommendationService } from '../../src/services/recommendation-service'
import { AdaptiveRecommendationSession } from '../../src/recommendation-v3/adaptive-session'
import * as ranker from '../../src/recommendation-v3/ranker'
import * as reranker from '../../src/recommendation-v3/reranker'

const ids = vi.hoisted(() => ({ current: 0 }))
vi.mock('node:crypto', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:crypto')>()),
    randomUUID: () =>
        '00000000-0000-4000-8000-' + String(++ids.current).padStart(12, '0')
}))
const fixtures: CompatibilityFixture[] = []
const fixture = (scenario?: RecallScenario, count?: number) => {
    const f = compatibilityFixture(scenario, count)
    fixtures.push(f)
    return f
}
beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(COMPATIBILITY_TEST_NOW)
})
afterEach(() => {
    for (const f of fixtures.splice(0)) f.dispose()
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('legacy recall exact frozen implementation differential', () => {
    for (const engine of ['rank', 'rerank'] as const)
        it(
            'retains the full V2 fail-safe contract if the old V3 engine rejects: ' +
                engine,
            async () => {
                if (engine === 'rank')
                    vi.spyOn(ranker, 'rankV3').mockImplementation(() => {
                        throw Error('Synthetic rank rejection')
                    })
                else
                    vi.spyOn(reranker, 'rerankV3').mockImplementation(() => {
                        throw Error('Synthetic rerank rejection')
                    })
                ids.current = 0
                const old = fixture()
                const expected = await new FrozenLegacyRecall(
                    old.proxy,
                    old.sdk
                ).recommendations({ limit: 9 })
                ids.current = 0
                const current = fixture()
                expect(
                    await current.service.recommendations({ limit: 9 })
                ).toEqual(expected)
                expect(compatibilityDatabaseState(current.database)).toEqual(
                    compatibilityDatabaseState(old.database)
                )
                expect(current.trace).toEqual(old.trace)
                expect(expected.recommendations.length).toBeGreaterThan(0)
            }
        )
    for (const scenario of [
        'normal',
        'empty',
        'partial-failure',
        'no-candidates',
        'local-eh-favorites',
        'personal-tags'
    ] as const)
        for (const options of [
            { limit: 8, seedCount: 3, appSessionId: 'fixture-session' },
            { limit: 999, seedCount: 999 }
        ])
            it(
                'preserves full result, rows and observation sequence: ' +
                    scenario +
                    ' ' +
                    options.limit,
                async () => {
                    ids.current = 0
                    const old = fixture(scenario)
                    const expected = await new FrozenLegacyRecall(
                        old.proxy,
                        old.sdk
                    ).recommendations(options)
                    const oldRows = compatibilityDatabaseState(old.database)
                    ids.current = 0
                    const current = fixture(scenario)
                    const result =
                        await current.service.recommendations(options)
                    expect(result).toEqual(expected)
                    expect(
                        compatibilityDatabaseState(current.database)
                    ).toEqual(oldRows)
                    expect(current.trace).toEqual(old.trace)
                    expect(current.providerCalls).toEqual(old.providerCalls)
                    expect(current.maximumActive()).toBeLessThanOrEqual(3)
                    if (scenario === 'local-eh-favorites')
                        expect(
                            current.providerCalls.filter(
                                (row) => row.kind === 'related'
                            )
                        ).toHaveLength(0)
                }
            )
})

describe('legacy/adaptive sessions preserve successful command and restored-read contracts', () => {
    for (const kind of ['v2', 'adaptive'] as const)
        it(
            'preserves explicit generation-failure state without swallowing the error: ' +
                kind,
            async () => {
                const run = async (old: boolean) => {
                    ids.current = 0
                    const f = fixture('empty')
                    const reject = async () => {
                        throw Error('Synthetic generation rejected')
                    }
                    const s =
                        kind === 'v2'
                            ? old
                                ? new FrozenLegacySessions(f.proxy, reject)
                                : new RecommendationService(f.proxy, reject)
                            : old
                              ? new FrozenAdaptiveSessions(f.proxy, reject)
                              : new AdaptiveRecommendationSession(
                                    f.proxy,
                                    reject
                                )
                    await expect(
                        'ensureInitialPrepared' in s
                            ? s.ensureInitialPrepared()
                            : s.nextBatch()
                    ).rejects.toThrow('Synthetic generation rejected')
                    return compatibilityDatabaseState(f.database)
                }
                expect(await run(false)).toEqual(await run(true))
            }
        )
    for (const count of [0, 3, 30, 135])
        it(
            'preserves complete V2 command/results/table state: candidates=' +
                count,
            async () => {
                const run = async (old: boolean) => {
                    ids.current = 0
                    const f = fixture('empty', count)
                    f.prepareSessions()
                    f.trace.length = 0
                    const s = old
                        ? new FrozenLegacySessions(f.proxy, f.generate)
                        : new RecommendationService(f.proxy, f.generate)
                    const outputs = [
                        await s.ensureInitialPrepared(),
                        s.currentState(),
                        await s.nextSession()
                    ]
                    await s.prewarmNextSession()
                    outputs.push(s.recordBatch(1))
                    await s.prewarmNextSession()
                    outputs.push(
                        await s.advanceSession(),
                        await s.restartCycle()
                    )
                    await s.prewarmNextSession()
                    const rows = compatibilityDatabaseState(f.database)
                    const trace = [...f.trace]
                    return {
                        outputs,
                        rows,
                        trace,
                        generations: f.generations()
                    }
                }
                expect(await run(false)).toEqual(await run(true))
            }
        )
    for (const count of [0, 3, 30, 135])
        it(
            'preserves complete adaptive output/rank/evidence/rows through exhaustion: candidates=' +
                count,
            async () => {
                const run = async (old: boolean) => {
                    ids.current = 0
                    const f = fixture('empty', count)
                    f.prepareSessions()
                    f.trace.length = 0
                    const s = old
                        ? new FrozenAdaptiveSessions(f.proxy, f.generate)
                        : new AdaptiveRecommendationSession(f.proxy, f.generate)
                    const outputs = [
                        await s.nextBatch({ appSessionId: 'fixture-session' }),
                        s.status(),
                        await s.nextBatch({ appSessionId: 'next-session' }),
                        await s.nextBatch(),
                        await s.nextBatch(),
                        await s.restart({ appSessionId: 'restart-session' })
                    ]
                    const restored = old
                        ? new FrozenAdaptiveSessions(f.proxy, f.generate)
                        : new AdaptiveRecommendationSession(f.proxy, f.generate)
                    outputs.push(restored.status(), await restored.nextBatch())
                    return {
                        outputs,
                        rows: compatibilityDatabaseState(f.database),
                        trace: f.trace.filter(
                            (row) => row.name !== 'withAppStateTransaction'
                        ),
                        generations: f.generations()
                    }
                }
                expect(await run(false)).toEqual(await run(true))
            }
        )
    for (const kind of ['v2', 'adaptive'] as const)
        it(
            'serves stable wire-compatible idle draft without writes or generation: ' +
                kind,
            async () => {
                const f = fixture('empty')
                const before = compatibilityDatabaseState(f.database)
                const controller =
                    kind === 'v2'
                        ? new RecommendationService(f.proxy, f.generate)
                        : new AdaptiveRecommendationSession(f.proxy, f.generate)
                const get = () =>
                    controller instanceof RecommendationService
                        ? controller.currentState()
                        : controller.status()
                const first = get()
                expect(get()).toEqual(first)
                expect(first).toMatchObject({
                    preparing: true,
                    recommendations: []
                })
                expect(typeof first.cycleId).toBe('string')
                expect(compatibilityDatabaseState(f.database)).toEqual(before)
                expect(
                    f.trace.some((row) => /^(set|save|allocate)/.test(row.name))
                ).toBe(false)
                expect(f.generations()).toBe(0)
                f.prepareSessions()
                const generated =
                    controller instanceof RecommendationService
                        ? await controller.ensureInitialPrepared()
                        : await controller.nextBatch()
                expect(generated.cycleId).toBe(first.cycleId)
            }
        )
    it('keeps existing malformed V2 counter normalization and missing-session response', () => {
        const f = fixture('empty')
        f.database.setAppState('recommendation.activeCycle', {
            cycleId: 'stored-cycle',
            currentSessionNo: -8,
            currentBatchIndex: -3
        })
        const before = compatibilityDatabaseState(f.database)
        expect(
            new RecommendationService(f.proxy, f.generate).currentState()
        ).toEqual(new FrozenLegacySessions(f.proxy, f.generate).currentState())
        expect(compatibilityDatabaseState(f.database)).toEqual(before)
        f.database.setAppState('recommendation.activeCycle', {
            cycleId: 'missing-session',
            currentSessionNo: 3,
            currentBatchIndex: 2
        })
        expect(
            new RecommendationService(f.proxy, f.generate).currentState()
        ).toEqual(new FrozenLegacySessions(f.proxy, f.generate).currentState())
    })
})
