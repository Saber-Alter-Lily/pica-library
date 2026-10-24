import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkIdentityTaskV5 } from '../../src/identity/task-v5'
import { workIdentityTaskPortsV5 } from '../../src/services/work-identity-adapter'
import { RECOMMENDATION_V5_POLICY_STATE_KEY } from '../../src/recommendation-v5/portable-policy'
import * as foundation from '../../src/recommendation-v5/work-identity-foundation'
import { FrozenWorkIdentityV5 } from '../fixtures/work-identity-legacy'
import {
    identityFixture,
    identityDatabaseState,
    IDENTITY_NOW,
    type IdentityFixture
} from '../fixtures/work-identity-fixture'

const fixtures: IdentityFixture[] = []
const fixture = () => {
    const value = identityFixture('plain')
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
function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
        resolve = done
    })
    return { promise, resolve }
}
async function waitFor(predicate: () => boolean) {
    for (let attempt = 0; attempt < 2000; attempt++) {
        if (predicate()) return
        await new Promise((resolve) => setTimeout(resolve, 1))
    }
    throw new Error('Synthetic identity task did not settle')
}
type Scenario =
    | 'complete'
    | 'pause-resume'
    | 'pause-cancel'
    | 'queued-cancel'
    | 'admission-failure'
    | 'catalog-failure'
    | 'save-failure'
async function traceTask(kind: 'new' | 'frozen', scenario: Scenario) {
    const value = fixture(),
        admitted = deferred(),
        trace: unknown[] = [],
        before = identityDatabaseState(value.database)
    const release = vi.fn(() => trace.push('release'))
    if (scenario === 'catalog-failure')
        vi.spyOn(value.database, 'listComics').mockImplementation(() => {
            throw new Error('Synthetic catalog failure')
        })
    if (scenario === 'save-failure')
        vi.spyOn(value.database, 'saveWorkIdentityEvidence').mockImplementation(
            () => {
                throw new Error('Synthetic evidence save failure')
            }
        )
    const acquire = async () => {
        trace.push('acquire')
        if (scenario === 'admission-failure')
            throw new Error('Synthetic admission failure')
        await admitted.promise
        return { release }
    }
    const ports = workIdentityTaskPortsV5(value.proxy, value.read.catalog)
    const modern = new WorkIdentityTaskV5(ports.read, ports.write, { acquire })
    const frozen = new FrozenWorkIdentityV5(value.proxy, acquire)
    const subject =
        kind === 'new'
            ? modern
            : {
                  start: frozen.startRecommendationV5WorkIdentityEvidenceRefresh.bind(
                      frozen
                  ),
                  status: frozen.recommendationV5WorkIdentityEvidenceRefreshStatus.bind(
                      frozen
                  ),
                  control:
                      frozen.recommendationV5WorkIdentityEvidenceRefreshControl.bind(
                          frozen
                      )
              }
    let paused = false
    const original = foundation.buildWorkIdentityAuditAsyncV5
    const audit = vi
        .spyOn(foundation, 'buildWorkIdentityAuditAsyncV5')
        .mockImplementation((catalog, policy, limit, runtime = {}) =>
            original(catalog, policy, limit, {
                ...runtime,
                onProgress: (progress) => {
                    runtime.onProgress?.(progress)
                    if (
                        !paused &&
                        progress.phase === 'comparing' &&
                        scenario.startsWith('pause-')
                    ) {
                        paused = true
                        subject.control('pause')
                    }
                }
            })
        )
    const snap = () => trace.push(JSON.parse(JSON.stringify(subject.status())))
    try {
        snap()
        trace.push(subject.start(200))
        trace.push(subject.start(200))
        expect(subject.start(200).started).toBe(false)
        if (scenario === 'queued-cancel') trace.push(subject.control('cancel'))
        admitted.resolve()
        if (scenario.startsWith('pause-')) {
            await waitFor(() => subject.status().state === 'paused')
            snap()
            trace.push(
                subject.control(
                    scenario === 'pause-resume' ? 'resume' : 'cancel'
                )
            )
        }
        await waitFor(() => !subject.status().active)
        snap()
        expect(release).toHaveBeenCalledTimes(
            scenario === 'admission-failure' ? 0 : 1
        )
        expect(subject.status().state).toBe(
            scenario.endsWith('failure')
                ? 'failed'
                : scenario.endsWith('cancel')
                  ? 'cancelled'
                  : 'complete'
        )
        if (subject.status().state !== 'complete')
            expect(identityDatabaseState(value.database)).toEqual(before)
        return { trace, state: identityDatabaseState(value.database) }
    } finally {
        audit.mockRestore()
        vi.restoreAllMocks()
    }
}

describe('identity background task parity and bounded evidence-only authority', () => {
    it.each([
        'complete',
        'pause-resume',
        'pause-cancel',
        'queued-cancel',
        'admission-failure',
        'catalog-failure',
        'save-failure'
    ] as const)(
        '%s preserves frozen full task state, rows, duplicate control and lease release',
        async (scenario) => {
            expect(await traceTask('new', scenario)).toEqual(
                await traceTask('frozen', scenario)
            )
        }
    )
    it('actual Service refresh on an empty policy saves evidence without creating preferences or bindings', async () => {
        const value = identityFixture('uninitialized')
        fixtures.push(value)
        const before = identityDatabaseState(value.database)
        const write = vi
            .spyOn(value.database, 'setAppState')
            .mockImplementation(() => {
                throw new Error('Evidence task must not initialize policy')
            })
        expect(
            value.service.startRecommendationV5WorkIdentityEvidenceRefresh()
        ).toMatchObject({ started: true })
        await waitFor(
            () =>
                !value.service.recommendationV5WorkIdentityEvidenceRefreshStatus()
                    .active
        )
        expect(
            value.service.recommendationV5WorkIdentityEvidenceRefreshStatus()
        ).toMatchObject({ state: 'complete' })
        expect(write).not.toHaveBeenCalled()
        expect(
            value.database.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)
        ).toBeUndefined()
        const after = identityDatabaseState(value.database)
        for (const table of Object.keys(before))
            if (table !== 'work_identity_evidence')
                expect(after[table], table).toEqual(before[table])
        expect(value.service.runtimeActiveTaskTypes()).toEqual([])
    })
})
