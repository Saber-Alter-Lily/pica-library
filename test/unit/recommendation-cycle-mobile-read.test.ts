import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import {
    startMobileBridge,
    type MobileBridgeController
} from '../../src/mobile/bridge-server'
import { startLibraryServer } from '../../src/library/server'
import { syntheticCycle } from '../fixtures/recommendation-cycle'
import { enabledFixtureSources } from "../helpers/source-runtime-fixture"

it('opens a local library with favorites and serves Final V3 status without preparing a legacy cycle', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-local-no-recall-'))
    vi.stubEnv('PICA_LIBRARY_DESKTOP_HOME', path.join(root, 'desktop'))
    const database = new LibraryDatabase(path.join(root, 'library.db')),
        service = new LibraryService(database, root, undefined, undefined, undefined, enabledFixtureSources())
    database.importFavorites(
        [
            {
                comicId: 'local:favorite',
                title: 'Synthetic Local Comic',
                author: 'Fixture',
                tags: ['line'],
                categories: [],
                finished: true
            }
        ],
        'synthetic',
        true
    )
    const live = vi
        .spyOn(service, 'recommendations')
        .mockRejectedValue(new Error('Startup must not recall'))
    const build = vi
        .spyOn(service, 'buildFinalRecommendationCycleV3')
        .mockRejectedValue(new Error('Startup must not generate'))
    const write = vi.spyOn(database, 'setAppState')
    let server: Awaited<ReturnType<typeof startLibraryServer>> | undefined
    try {
        server = await startLibraryServer({
            database,
            service,
            host: '127.0.0.1',
            port: 0
        })
        const response = await fetch(
            server.url + '/api/v1/recommendation-sessions/status?mode=final'
        )
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            engine: 'v3',
            activeCycleId: null
        })
        expect(live).not.toHaveBeenCalled()
        expect(build).not.toHaveBeenCalled()
        expect(write).not.toHaveBeenCalled()
        expect(
            database.getAppState('recommendation.activeCycle')
        ).toBeUndefined()
        expect(
            database.getAppState('recommendation.v3.activeCycle.v1')
        ).toBeUndefined()
    } finally {
        if (server)
            await new Promise<void>((resolve) =>
                server!.server.close(() => resolve())
            )
        database.close()
        vi.restoreAllMocks()
        vi.unstubAllEnvs()
        fs.rmSync(root, { recursive: true, force: true })
    }
})

it('keeps paired mobile GETs read-only; only explicit recompute prepares a new current batch', async () => {
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-mobile-read-capability-')
    )
    vi.stubEnv('PICA_LIBRARY_DESKTOP_HOME', path.join(root, 'desktop'))
    const database = new LibraryDatabase(path.join(root, 'library.db')),
        service = new LibraryService(database, root, undefined, undefined, undefined, enabledFixtureSources()),
        built = syntheticCycle()
    database.importCatalog(
        built.ranked.map((r) => r.comic),
        'synthetic'
    )
    const build = vi
        .spyOn(service, 'buildFinalRecommendationCycleV3')
        .mockResolvedValue(
            built as unknown as Awaited<
                ReturnType<LibraryService['buildFinalRecommendationCycleV3']>
            >
        )
    const live = vi
        .spyOn(service, 'recommendations')
        .mockRejectedValue(new Error('GET must never call live recall'))
    vi.spyOn(service, 'mergeMobileRecommendationV5').mockReturnValue({
        requiresResolution: false
    } as ReturnType<LibraryService['mergeMobileRecommendationV5']>)
    let bridge: MobileBridgeController | undefined
    try {
        bridge = await startMobileBridge({
            database,
            service,
            host: '127.0.0.1',
            port: 0,
            stateFile: path.join(root, 'paired.json')
        })
        const host = bridge.status().addresses[0]
        const pair = await fetch(host + '/mobile/v1/pair', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                code: bridge.status().pairingCode,
                deviceName: 'Synthetic Phone'
            })
        })
        expect(pair.status).toBe(200)
        const token = String(((await pair.json()) as { token: string }).token),
            headers = { authorization: 'Bearer ' + token }
        const writes = [
            vi.spyOn(database, 'setAppState'),
            vi.spyOn(database, 'saveV3CandidatePool'),
            vi.spyOn(database, 'saveV3BatchAndAllocate'),
            vi.spyOn(database, 'updateV3CandidatePoolState')
        ]
        const get = async (route: string) => {
            const response = await fetch(host + route, { headers })
            expect(response.status).toBe(200)
            return response.json() as Promise<Record<string, any>>
        }
        const empty = await get('/mobile/v1/recommendations')
        expect(empty).toMatchObject({
            source: 'final-v3-current',
            cached: true,
            recommendations: []
        })
        expect((await get('/mobile/v1/recommendations/cache')).items).toEqual(
            []
        )
        for (const spy of writes) expect(spy).not.toHaveBeenCalled()
        expect(build).not.toHaveBeenCalled()
        expect(live).not.toHaveBeenCalled()

        const refresh = await fetch(
            host + '/mobile/v1/recommendation/v5/sync',
            {
                method: 'POST',
                headers: { ...headers, 'content-type': 'application/json' },
                body: JSON.stringify({
                    deviceId: 'fixture-phone',
                    mutationId: 'fixture-recompute',
                    recompute: true
                })
            }
        )
        expect(refresh.status).toBe(200)
        expect(await refresh.json()).toMatchObject({
            recommendationRefresh: {
                requested: true,
                completed: true,
                status: { activeBatchIndex: 0 }
            }
        })
        expect(build).toHaveBeenCalledTimes(1)
        const batchesBefore = database
            .listV3CandidatePools()
            .flatMap((p) => database.listV3Batches(p.id))
        expect(batchesBefore).toHaveLength(1)
        writes.forEach((spy) => spy.mockClear())
        const current = await get('/mobile/v1/recommendations?limit=2')
        expect(current).toMatchObject({
            source: 'final-v3-current',
            cached: true,
            batchId: batchesBefore[0].id,
            batchIndex: 0
        })
        expect(current.recommendations).toHaveLength(2)
        const cache = await get('/mobile/v1/recommendations/cache?limit=24')
        expect(cache).toMatchObject({
            source: 'final-v3-portable-cache',
            cached: true,
            policyBaseline: { fixture: 'unchanged-policy-baseline' }
        })
        expect(cache.items).toHaveLength(24)
        expect(await get('/mobile/v1/recommendations?limit=2')).toEqual(current)
        expect(
            database
                .listV3CandidatePools()
                .flatMap((p) => database.listV3Batches(p.id))
        ).toEqual(batchesBefore)
        for (const spy of writes) expect(spy).not.toHaveBeenCalled()
        expect(build).toHaveBeenCalledTimes(1)
        expect(live).not.toHaveBeenCalled()
    } finally {
        await bridge?.close()
        database.close()
        vi.restoreAllMocks()
        vi.unstubAllEnvs()
        fs.rmSync(root, { recursive: true, force: true })
    }
})
