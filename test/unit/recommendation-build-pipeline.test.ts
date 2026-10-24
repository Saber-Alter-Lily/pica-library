import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import type { Comic } from '../../src/types'
import type { Pica } from '../../src/sdk'
import type { FavoriteRecord } from '../../src/library/types'
import { SourceRuntime } from '../../src/sources/source-policy'
import { CycleCoordinatorV3 } from '../../src/recommendation-v3/cycle-coordinator-v3'
import { RecommendationCycleQueriesV3 } from '../../src/recommendation/queries'
import { recommendationCycleReadStoreV3 } from '../../src/services/recommendation-cycle-store'
import {
    defaultPortablePolicyStateV5,
    RECOMMENDATION_V5_POLICY_STATE_KEY
} from '../../src/recommendation-v5/portable-policy'
import { normalizeTagPolicyV1 } from '../../src/tags/policy'
import {
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION
} from '../../src/recommendation-v4/visual-style'
import {
    legacyBuildFinalCycleV3,
    LEGACY_BUILD_METHOD_SHA256,
    type LegacyBuildContextV3
} from '../fixtures/recommendation-build-legacy'

const roots: Array<{ root: string; database: LibraryDatabase }> = []
afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    for (const item of roots.splice(0).reverse()) {
        item.database.close()
        fs.rmSync(item.root, { recursive: true, force: true })
    }
})
type Scenario = {
    mode?: 'OFF' | 'SHADOW' | 'LIVE'
    pica?: boolean
    eh?: boolean
    count?: number
    partial?: boolean
    privateTags?: boolean
    interrupt?: 'retrieve-fence' | 'visual-fence' | 'cancel' | 'pause'
}
type Internals = LegacyBuildContextV3 & {
    recommendationCancelRequested: boolean
}
const at = '2026-10-23T00:00:00.000Z'

async function fixture(scenario: Scenario = {}) {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(at))
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-build-pipeline-'))
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    roots.push({ root, database })
    const sources = new SourceRuntime({
        schemaVersion: 1,
        revision: 0,
        enabled: [
            scenario.pica !== false ? ('pica' as const) : null,
            scenario.eh !== false ? ('eh' as const) : null
        ].filter((id): id is 'pica' | 'eh' => id !== null)
    })
    const trace: unknown[] = []
    const favoriteIds = Array.from({ length: 6 }, (_, i) => 'seed-' + i)
    database.importCatalog(
        favoriteIds.map((id, i) => ({
            comicId: id,
            title: 'Favorite ' + i,
            author: i < 3 ? 'Fixture Creator A' : 'Fixture Creator B',
            tags: ['校园', '恋爱', 'school'],
            categories: ['Manga'],
            finished: true,
            isFavorite: true
        })),
        'synthetic'
    )
    const count = scenario.count ?? 96
    const picaRows: Comic[] = Array.from({ length: count }, (_, i) => ({
        _id: 'candidate-' + i,
        title: 'Unique Synthetic Work ' + i,
        author: 'Creator ' + i,
        description: '',
        chineseTeam: '',
        categories: ['Manga'],
        tags: i % 7 === 0 ? ['blocked-synthetic'] : ['school', '校园'],
        finished: true,
        created_at: at,
        updated_at: at,
        totalLikes: i * 13,
        totalViews: i * 31,
        allowDownload: true,
        pagesCount: 20 + i,
        epsCount: 1
    }))
    const externalRows: FavoriteRecord[] = Array.from(
        { length: Math.min(count, 36) },
        (_, i) => ({
            comicId: 'eh:' + i,
            providerId: 'eh',
            title: 'External Synthetic Work ' + i,
            author: 'External Creator ' + i,
            categories: ['Manga'],
            tags: ['school'],
            providerMetadata: { rawTags: ['female:schoolgirl'] },
            finished: true
        })
    )
    // Vectors are small synthetic arrays, not content, DINO inference or production assets.
    database.importCatalog(
        picaRows.map((row) => ({
            comicId: row._id,
            title: row.title,
            author: row.author!,
            categories: row.categories!,
            tags: row.tags!,
            finished: true
        })),
        'synthetic'
    )
    database.importCatalog(externalRows, 'synthetic')
    for (const [i, id] of [
        ...favoriteIds,
        ...picaRows.map((row) => row._id),
        ...externalRows.map((row) => row.comicId)
    ].entries()) {
        database.saveVisualEmbedding({
            comicId: id,
            modelId: VISUAL_MODEL_ID,
            modelVersion: VISUAL_MODEL_VERSION,
            samplingPolicyVersion: VISUAL_SAMPLING_POLICY_VERSION,
            embeddingKind: 'body',
            vector: [1, (i % 5) / 5, (i % 11) / 11],
            dimension: 3,
            sourceKind: 'LOCAL_PAGES',
            sampleCount: 6,
            confidence: 1,
            generatedAt: at,
            metadata: { fixture: true }
        })
    }
    for (const id of favoriteIds) database.setLocalFavoriteState(id, true)
    database.upsertEpisode({
        id: 'fixture-episode',
        comicId: favoriteIds[0],
        title: 'Synthetic Chapter',
        order: 1
    })
    database.saveReadingProgress(favoriteIds[0], 'fixture-episode', 2)
    database.recordRecommendationEdge({
        sourceComicId: favoriteIds[0],
        targetComicId: 'candidate-12',
        edgeType: 'RELATED',
        confidence: 0.9
    })
    for (const [id, eventType] of [
        ['candidate-0', 'recommend_like'],
        ['candidate-1', 'recommend_dislike']
    ] as const)
        database.recordUserEvent({
            comicId: id,
            eventType,
            source: 'synthetic'
        })
    const state = defaultPortablePolicyStateV5()
    state.hardSuppressComicIds = ['candidate-2']
    state.ownedComicIds = ['candidate-3']
    state.seenComicIds = ['candidate-4']
    state.tasteExcludedComicIds = [favoriteIds[5]]
    state.controls = [
        {
            targetType: 'TAG',
            key: 'blocked-synthetic',
            label: 'Blocked',
            direction: 'BLOCK',
            scope: 'PERSISTENT',
            source: 'DESKTOP',
            updatedAt: at
        }
    ]
    if (scenario.privateTags) {
        const mapped = 'pt_' + 'a'.repeat(32),
            manual = 'pt_' + 'b'.repeat(32)
        state.tagPolicy = normalizeTagPolicyV1({
            schemaVersion: 1,
            mode: 'SELECTED',
            selected: ['private|' + mapped, 'private|' + manual],
            disabled: [],
            privateTags: [
                {
                    id: mapped,
                    name: 'Private mapped name',
                    kind: 'MAPPED',
                    comicIds: [],
                    mappings: ['pica|school', 'eh|female:schoolgirl']
                },
                {
                    id: manual,
                    name: 'Manual style',
                    kind: 'MANUAL',
                    comicIds: favoriteIds,
                    mappings: []
                }
            ]
        })
    }
    database.setAppState(RECOMMENDATION_V5_POLICY_STATE_KEY, state)
    database.setAppState('recommendation.visualSettings.v1', {
        enabled: scenario.mode !== 'OFF',
        rerankMode: scenario.mode ?? 'SHADOW',
        strength: 'STANDARD'
    })
    database.saveV3CandidatePool({
        cycleId: 'history',
        candidateIds: [],
        modelVersion: 'synthetic',
        telemetry: {
            state: 'SUPERSEDED',
            completedAt: at,
            intentPlan: [{ intentId: 'synthetic-prior' }]
        }
    })
    let interrupted = false
    let service: LibraryService
    const changeSource = () =>
        sources.apply(
            sources.prepare(
                sources.snapshot().enabled,
                sources.snapshot().revision
            )
        )
    const onRequest = () => {
        if (interrupted) return
        if (scenario.interrupt === 'retrieve-fence') {
            interrupted = true
            changeSource()
        }
        if (scenario.interrupt === 'cancel') {
            interrupted = true
            service.recommendationBuildControl('cancel')
        }
        if (scenario.interrupt === 'pause') {
            interrupted = true
            service.recommendationBuildControl('pause')
        }
    }
    const pica = {
        Order: { loved: 'likes' },
        async comicsPage(
            _category: string,
            query: string,
            _order: unknown,
            page: number
        ) {
            trace.push(['keyword', query, page])
            onRequest()
            if (scenario.partial && page === 2)
                throw new Error('Synthetic Pica failure')
            return { docs: picaRows.slice((page - 1) * 32, page * 32) }
        },
        async search(query: string, page: number) {
            trace.push(['author', query, page])
            onRequest()
            return { docs: picaRows.slice((page - 1) * 32, page * 32) }
        },
        async related(id: string) {
            trace.push(['related', id])
            onRequest()
            return picaRows.slice(0, 32)
        }
    }
    service = new LibraryService(
        database,
        root,
        pica as unknown as Pica,
        undefined,
        undefined,
        sources
    )
    vi.spyOn(service, 'providerService').mockReturnValue({
        async probeExHentai() {
            trace.push(['probe'])
            return scenario.partial ? 'UNAVAILABLE' : 'AVAILABLE'
        },
        async search(
            request: { keyword?: string },
            providerIds: string[],
            purpose: string
        ) {
            trace.push(['external', request.keyword, providerIds, purpose])
            onRequest()
            if (scenario.partial && providerIds[0] === 'eh')
                throw new Error('Synthetic E-H failure')
            const rows = externalRows.map((row) => ({
                ...row,
                providerMetadata: {
                    ...row.providerMetadata,
                    surface: providerIds[0]
                }
            }))
            database.importCatalog(rows, 'fixture:external')
            return rows
        }
    } as unknown as ReturnType<LibraryService['providerService']>)
    const internal = service as unknown as Internals
    internal.recommendationCancelRequested = true
    try {
        await internal.recommendationCheckpoint()
    } catch (error) {
        internal.cancelledErrorConstructor = (error as Error)
            .constructor as Internals['cancelledErrorConstructor']
    }
    internal.recommendationCancelRequested = false
    for (const name of [
        'listComics',
        'readingProgress',
        'recommendationFeedback',
        'listV3CandidatePools',
        'listRecommendationEdges',
        'listVisualEmbeddings'
    ] as const) {
        const original = database[name].bind(database) as (
            ...args: unknown[]
        ) => unknown
        vi.spyOn(database, name).mockImplementation(((...args: unknown[]) => {
            trace.push(['read', name])
            const value = original(...args)
            if (
                name === 'listVisualEmbeddings' &&
                scenario.interrupt === 'visual-fence'
            )
                changeSource()
            return value
        }) as never)
    }
    const checkpoint = internal.recommendationCheckpoint.bind(service)
    vi.spyOn(internal, 'recommendationCheckpoint').mockImplementation(
        async () => {
            trace.push([
                'checkpoint',
                service.recommendationBuildProgress().phase
            ])
            return checkpoint()
        }
    )
    return {
        root,
        database,
        service,
        internal,
        trace,
        sources,
        run: (legacy = false) =>
            legacy
                ? legacyBuildFinalCycleV3.call(internal, 'fixture-cycle')
                : service.buildFinalRecommendationCycleV3('fixture-cycle')
    }
}

async function outcome(scenario: Scenario, legacy: boolean) {
    const f = await fixture(scenario)
    try {
        const result = await f.run(legacy)
        return {
            result,
            trace: [...f.trace],
            progress: f.service.recommendationBuildProgress(),
            active: f.service.runtimeActiveTaskTypes()
        }
    } catch (error) {
        return {
            error: (error as Error).message,
            trace: [...f.trace],
            progress: f.service.recommendationBuildProgress(),
            active: f.service.runtimeActiveTaskTypes()
        }
    }
}

describe('actual recommendation build: frozen legacy differential oracle', () => {
    it('retains the frozen pre-extraction method body rather than copying the new pipeline into the oracle', () => {
        const file = fs.readFileSync(
            new URL(
                '../fixtures/recommendation-build-legacy.ts',
                import.meta.url
            ),
            'utf8'
        )
        const tree = ts.createSourceFile(
            'oracle.ts',
            file,
            ts.ScriptTarget.Latest,
            true
        )
        const fn = tree.statements.find(
            (node) =>
                ts.isFunctionDeclaration(node) &&
                node.name?.text === 'legacyBuildFinalCycleV3'
        ) as ts.FunctionDeclaration
        const body = fn
            .body!.getText(tree)
            .replace(
                '{\n        const RecommendationBuildCancelledError = this.cancelledErrorConstructor',
                '{'
            )
        const method =
            'async buildFinalRecommendationCycleV3(cycleId: string) ' + body
        expect(
            createHash('sha256')
                .update(method.replaceAll('\r\n', '\n'))
                .digest('hex')
        ).toBe(LEGACY_BUILD_METHOD_SHA256)
        expect(file).not.toContain(
            "from '../../src/recommendation/build-pipeline'"
        )
    })
    it.each(['OFF', 'SHADOW', 'LIVE'] as const)(
        'preserves every score, rank, evidence, route, telemetry and version in Visual %s',
        async (mode) => {
            const old = await outcome({ mode }, true),
                next = await outcome({ mode }, false)
            expect(next).toEqual(old)
            expect(next.error).toBeUndefined()
            expect(next.result!.ranked.length).toBeGreaterThan(12)
            expect(
                next.result!.ranked.every(
                    (row) =>
                        ![
                            'candidate-0',
                            'candidate-1',
                            'candidate-2',
                            'candidate-3',
                            'candidate-4'
                        ].includes(row.comicId)
                )
            ).toBe(true)
            expect(next.active).toEqual([])
        }
    )
    it.each<Scenario>([
        { pica: false },
        { eh: false },
        { partial: true },
        { privateTags: true },
        { count: 14 },
        { pica: false, eh: false }
    ])(
        'preserves existing provider/policy/degraded behavior: %j',
        async (scenario) => {
            expect(await outcome(scenario, false)).toEqual(
                await outcome(scenario, true)
            )
        }
    )
    it.each(['retrieve-fence', 'visual-fence', 'cancel'] as const)(
        'preserves %s failure and releases resources without leaving a running build',
        async (interrupt) => {
            const old = await outcome({ interrupt }, true),
                next = await outcome({ interrupt }, false)
            expect(next).toEqual(old)
            expect(next.error).toBeTruthy()
            expect(next.progress.state).toBe(
                interrupt === 'cancel' ? 'cancelled' : 'failed'
            )
            expect(next.active).toEqual([])
        }
    )
    it('retains in-place pause/resume without restarting provider requests or losing the build lease', async () => {
        const f = await fixture({ interrupt: 'pause' })
        const pending = f.run()
        for (
            let i = 0;
            i < 300 &&
            f.service.recommendationBuildProgress().state !== 'paused';
            i++
        )
            await Promise.resolve()
        expect(f.service.recommendationBuildProgress().state).toBe('paused')
        expect(f.service.runtimeActiveTaskTypes()).toContain(
            'recommendation-v3-build'
        )
        f.service.recommendationBuildControl('resume')
        expect((await pending).ranked.length).toBeGreaterThan(12)
        expect(f.service.runtimeActiveTaskTypes()).toEqual([])
    })
    it('reports persistence failure truthfully, keeps the old cycle and ignores a stale build observer', async () => {
        const f = await fixture()
        const built = await f.run()
        const coordinator = new CycleCoordinatorV3(
            f.database,
            (id) => f.service.buildFinalRecommendationCycleV3(id),
            built.versions,
            (id, state, error) =>
                f.service.recommendationBuildCommitState(id, state, error)
        )
        coordinator.resumeOrCreate('first')
        await coordinator.waitForBuild()
        const current = coordinator.current(),
            pool = f.database.latestV3CandidatePool(current.activeCycleId!)!
        const save = f.database.saveV3CandidatePool.bind(f.database)
        vi.spyOn(f.database, 'saveV3CandidatePool')
            .mockImplementationOnce(() => {
                expect(f.service.recommendationBuildProgress()).toMatchObject({
                    state: 'running',
                    phase: 'persist',
                    canPause: false,
                    canCancel: false
                })
                throw new Error('Synthetic commit failure')
            })
            .mockImplementation(save)
        coordinator.forceNew('persist-failure')
        await expect(coordinator.waitForBuild()).rejects.toThrow(
            'Synthetic commit failure'
        )
        expect(f.service.recommendationBuildProgress()).toMatchObject({
            state: 'failed',
            phase: 'persist',
            error: 'Synthetic commit failure'
        })
        expect(coordinator.status().activeCycleId).toBe(current.activeCycleId)
        expect(f.database.getV3CandidatePool(pool.id)).toEqual(pool)
        const failed = f.service.recommendationBuildProgress()
        f.service.recommendationBuildCommitState('obsolete-cycle', 'committed')
        expect(f.service.recommendationBuildProgress()).toEqual(failed)
        coordinator.forceNew('retry-success')
        await coordinator.waitForBuild()
        expect(f.service.recommendationBuildProgress()).toMatchObject({
            state: 'complete',
            phase: 'complete',
            done: 7
        })
        expect(coordinator.status().activeCycleId).not.toBe(
            current.activeCycleId
        )
    })
    it('keeps the previous usable cycle/batch/scores after an actual build failure; read/portable paths never call providers', async () => {
        const f = await fixture()
        const built = await f.run()
        const coordinator = new CycleCoordinatorV3(
            f.database,
            (id) => f.service.buildFinalRecommendationCycleV3(id),
            built.versions
        )
        coordinator.resumeOrCreate('first')
        await coordinator.waitForBuild()
        const current = coordinator.current()
        const pool = f.database.latestV3CandidatePool(current.activeCycleId!)!
        const batches = f.database.listV3Batches(pool.id)
        f.sources.apply(f.sources.prepare([], f.sources.snapshot().revision))
        coordinator.forceNew('must-fail')
        await expect(coordinator.waitForBuild()).rejects.toThrow(
            'enough candidates'
        )
        expect(coordinator.status().activeCycleId).toBe(current.activeCycleId)
        expect(f.database.getV3CandidatePool(pool.id)).toEqual(pool)
        expect(f.database.listV3Batches(pool.id)).toEqual(batches)
        const before = f.trace.filter(
            (row) =>
                Array.isArray(row) &&
                ['keyword', 'author', 'related', 'external', 'probe'].includes(
                    String(row[0])
                )
        )
        const queries = new RecommendationCycleQueriesV3(
            recommendationCycleReadStoreV3(f.database),
            built.versions
        )
        queries.current()
        queries.portable()
        queries.status()
        expect(
            f.trace.filter(
                (row) =>
                    Array.isArray(row) &&
                    [
                        'keyword',
                        'author',
                        'related',
                        'external',
                        'probe'
                    ].includes(String(row[0]))
            )
        ).toEqual(before)
    })
    it('retains an executable no-observer counterexample for the former false-complete state after a save failure', async () => {
        const f = await fixture()
        const built = await f.run(true)
        const coordinator = new CycleCoordinatorV3(
            f.database,
            (id) => legacyBuildFinalCycleV3.call(f.internal, id),
            built.versions
        )
        vi.spyOn(f.database, 'saveV3CandidatePool').mockImplementationOnce(
            () => {
                throw new Error('Synthetic commit failure')
            }
        )
        coordinator.resumeOrCreate('frozen-no-observer')
        await expect(coordinator.waitForBuild()).rejects.toThrow(
            'Synthetic commit failure'
        )
        expect(coordinator.status().activeCycleId).toBeNull()
        expect(f.service.recommendationBuildProgress().state).toBe('complete')
        // This is the rejected historical behavior, not an acceptance of that state.
    })
})
