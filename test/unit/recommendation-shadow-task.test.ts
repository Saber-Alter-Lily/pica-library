import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    RecommendationShadowTaskV5,
    type RecommendationShadowTaskExecutionV5
} from '../../src/recommendation/shadow-task-v5'
import type { RecommendationShadowRuntimeV5 } from '../../src/recommendation/shadow-ports-v5'
import { FrozenRecommendationShadowV5 } from '../fixtures/recommendation-shadow-legacy'
import {
    shadowFixture,
    shadowDatabaseState,
    SHADOW_CONFIRM,
    SHADOW_TEST_NOW,
    type ShadowFixture
} from '../fixtures/recommendation-shadow-fixture'

const fixtures: ShadowFixture[] = []
const fixture = () => {
    const value = shadowFixture('missing-policy')
    fixtures.push(value)
    return value
}
beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(SHADOW_TEST_NOW))
})
afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    for (const value of fixtures.splice(0)) value.dispose()
})
function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((done) => {
        resolve = done
    })
    return { promise, resolve }
}
async function waitFor(predicate: () => boolean) {
    for (let attempt = 0; attempt < 1000; attempt++) {
        if (predicate()) return
        await new Promise((resolve) => setTimeout(resolve, 1))
    }
    throw new Error('Synthetic shadow task did not settle')
}
const output = {
    rawCandidateCount: 12,
    candidateCount: 10,
    ranking: { candidateCount: 9 },
    diversity: { selectedCount: 7 },
    audit: {
        poolId: 'synthetic-pool',
        cycleId: 'v5-shadow:task',
        modelVersion: 'synthetic-model',
        generatedAt: SHADOW_TEST_NOW,
        candidateIdCount: 9
    }
} as Awaited<ReturnType<RecommendationShadowTaskExecutionV5['run']>>

async function taskTrace(
    kind: 'frozen' | 'new',
    scenario:
        | 'complete'
        | 'pause-resume'
        | 'pause-cancel'
        | 'admission-failure'
        | 'execution-failure'
        | 'queued-cancel'
) {
    const value = fixture(),
        admitted = deferred<void>(),
        entered = deferred<void>(),
        step = deferred<void>()
    const trace: unknown[] = []
    const release = vi.fn(() => {
        trace.push('release')
    })
    const run = async (
        _input: Record<string, unknown>,
        runtime: RecommendationShadowRuntimeV5
    ) => {
        trace.push('run')
        await runtime.checkpoint?.()
        runtime.onProgress?.({
            phase: 'retrieving',
            done: 1,
            total: 7,
            retrievalDone: 0,
            retrievalTotal: 1
        })
        entered.resolve()
        await step.promise
        runtime.onProgress?.({
            phase: 'retrieving',
            retrievalDone: 1,
            rawCandidateCount: 12
        })
        await runtime.checkpoint?.()
        if (scenario === 'execution-failure')
            throw new Error('Synthetic execution failure')
        return output
    }
    const acquire = async () => {
        trace.push('acquire')
        if (scenario === 'admission-failure')
            throw new Error('Synthetic admission failure')
        await admitted.promise
        return { release }
    }
    const legacy = new FrozenRecommendationShadowV5(value.proxy, {
        ...value.hooks,
        acquire
    })
    legacy.runRecommendationV5ShadowRetrieval =
        run as typeof legacy.runRecommendationV5ShadowRetrieval
    const task = new RecommendationShadowTaskV5({ acquire, run })
    const subject =
        kind === 'new'
            ? task
            : {
                  start: legacy.startRecommendationV5ShadowRetrieval.bind(
                      legacy
                  ),
                  status: legacy.recommendationV5ShadowStatus.bind(legacy),
                  control: legacy.recommendationV5ShadowControl.bind(legacy)
              }
    const snap = () => {
        trace.push(JSON.parse(JSON.stringify(subject.status())))
    }
    snap()
    expect(() => subject.start({})).toThrow(
        'Explicit shadow retrieval confirmation'
    )
    expect(trace).toHaveLength(1)
    trace.push(subject.start(SHADOW_CONFIRM))
    const duplicate = subject.start(SHADOW_CONFIRM)
    expect(duplicate.started).toBe(false)
    trace.push(duplicate)
    if (scenario === 'queued-cancel') trace.push(subject.control('cancel'))
    admitted.resolve()
    if (scenario === 'admission-failure' || scenario === 'queued-cancel') {
        await waitFor(() => !subject.status().active)
    } else {
        await entered.promise
        snap()
        if (scenario === 'pause-resume' || scenario === 'pause-cancel') {
            trace.push(subject.control('pause'))
            step.resolve()
            await waitFor(() => subject.status().state === 'paused')
            snap()
            trace.push(
                subject.control(
                    scenario === 'pause-resume' ? 'resume' : 'cancel'
                )
            )
        } else step.resolve()
        await waitFor(() => !subject.status().active)
    }
    snap()
    expect(release).toHaveBeenCalledTimes(
        scenario === 'admission-failure' ? 0 : 1
    )
    expect(subject.status().state).toBe(
        scenario === 'pause-cancel' || scenario === 'queued-cancel'
            ? 'cancelled'
            : scenario.endsWith('failure')
              ? 'failed'
              : 'complete'
    )
    if (subject.status().state !== 'complete')
        expect(subject.status().result).toBeNull()
    return trace
}

describe('extracted V5 shadow task control versus frozen control state', () => {
    it.each([
        'complete',
        'pause-resume',
        'pause-cancel',
        'admission-failure',
        'execution-failure',
        'queued-cancel'
    ] as const)(
        '%s preserves full public status/control/result, duplicate start and release behavior',
        async (scenario) => {
            expect(await taskTrace('new', scenario)).toEqual(
                await taskTrace('frozen', scenario)
            )
        }
    )
    it('can restart after terminal failure without leaking an old result or control flags', async () => {
        const release = vi.fn(),
            run = vi.fn<
                Parameters<RecommendationShadowTaskExecutionV5['run']>,
                ReturnType<RecommendationShadowTaskExecutionV5['run']>
            >()
        run.mockRejectedValueOnce(
            new Error('Synthetic first failure')
        ).mockResolvedValue(output)
        const task = new RecommendationShadowTaskV5({
            acquire: async () => ({ release }),
            run
        })
        task.start(SHADOW_CONFIRM)
        await waitFor(() => task.status().state === 'failed')
        expect(task.start(SHADOW_CONFIRM)).toMatchObject({
            started: true,
            state: 'running',
            result: undefined
        })
        await waitFor(() => task.status().state === 'complete')
        expect(task.status()).toMatchObject({
            state: 'complete',
            result: { audit: output.audit }
        })
        expect(task.status().error).toBeUndefined()
        expect(release).toHaveBeenCalledTimes(2)
    })
    it.each(['source-change', 'cancel'] as const)(
        'actual Service task %s before persistence saves nothing and releases admission',
        async (action) => {
            const value = fixture(),
                before = shadowDatabaseState(value.database)
            const resources = (
                value.service as unknown as {
                    runtimeResources: {
                        acquire: RecommendationShadowTaskExecutionV5['acquire']
                    }
                }
            ).runtimeResources
            const release = vi.fn()
            vi.spyOn(resources, 'acquire').mockResolvedValue({ release })
            const actualRun =
                value.service.runRecommendationV5ShadowRetrieval.bind(
                    value.service
                )
            value.service.runRecommendationV5ShadowRetrieval = (
                input,
                runtime = {}
            ) =>
                actualRun(input, {
                    ...runtime,
                    onProgress: (progress) => {
                        runtime.onProgress?.(progress)
                        if (progress.phase === 'persisting') {
                            if (action === 'cancel')
                                value.service.recommendationV5ShadowControl(
                                    'cancel'
                                )
                            else
                                value.service.sources.apply(
                                    value.service.sources.prepare([], 0)
                                )
                        }
                    }
                })
            expect(
                value.service.startRecommendationV5ShadowRetrieval(
                    SHADOW_CONFIRM
                )
            ).toMatchObject({ started: true })
            await waitFor(
                () => !value.service.recommendationV5ShadowStatus().active
            )
            expect(value.service.recommendationV5ShadowStatus()).toMatchObject({
                state: action === 'cancel' ? 'cancelled' : 'failed',
                result: null
            })
            expect(release).toHaveBeenCalledTimes(1)
            expect(shadowDatabaseState(value.database)).toEqual(before)
        }
    )
})
