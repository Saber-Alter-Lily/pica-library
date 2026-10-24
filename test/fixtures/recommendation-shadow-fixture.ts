import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { RecommendationPolicyStoreV5 } from '../../src/recommendation-v5/policy-store'
import {
    defaultPortablePolicyStateV5,
    RECOMMENDATION_V5_POLICY_STATE_KEY
} from '../../src/recommendation-v5/portable-policy'
import { buildPreferenceTimescalesV5 } from '../../src/recommendation-v5/preference-timescales'
import { buildCandidateChannelPlanV5 } from '../../src/recommendation-v5/candidate-channels'
import { compileCandidateProviderRoutesV5 } from '../../src/recommendation-v5/provider-query-compiler'
import { recommendationShadowPortsV5 } from '../../src/services/recommendation-shadow-adapter'
import { defaultTagPolicyV1, normalizeTagPolicyV1 } from '../../src/tags/policy'
import type { FavoriteRecord } from '../../src/library/types'
import type { RecommendationShadowApplicationV5 } from '../../src/services/recommendation-shadow-adapter'

export const SHADOW_TEST_NOW = '2026-10-23T12:00:00.000Z'
export const SHADOW_CONFIRM = {
    confirmation: 'RUN_RECOMMENDATION_V5_SHADOW_RETRIEVAL',
    appSessionId: 'synthetic-session'
}
export type ShadowScenario =
    | 'normal'
    | 'partial-provider-failure'
    | 'private-tags'
    | 'providers-off'
    | 'missing-policy'
    | 'many-candidates'
type TraceRow = { name: string; args: unknown[] }
type Sqlite = {
    prepare(sql: string): { all(): Array<Record<string, unknown>> }
}

/** Only throwaway fixtures: never open an installed profile or invoke a provider transport. */
export function shadowDatabaseState(database: LibraryDatabase) {
    const sqlite = (database as unknown as { db: Sqlite }).db
    return Object.fromEntries(
        sqlite
            .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
            .all()
            .map((row) => {
                const name = String(row.name)
                if (!/^[a-z_0-9]+$/i.test(name))
                    throw new Error('Unexpected synthetic table')
                return [
                    name,
                    sqlite
                        .prepare('SELECT * FROM "' + name + '"')
                        .all()
                        .map((value) => JSON.stringify(value))
                        .sort()
                ]
            })
    ) as Record<string, string[]>
}

export function shadowFixture(scenario: ShadowScenario = 'normal') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-shadow-module-'))
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    const trace: TraceRow[] = []
    let poolId: string | undefined
    const proxy = new Proxy(database, {
        get(target, key) {
            const value = Reflect.get(target, key)
            if (typeof value !== 'function') return value
            return (...args: unknown[]) => {
                if (
                    [
                        'getAppState',
                        'setAppState',
                        'listComics',
                        'listVisualEmbeddings',
                        'saveV3CandidatePool'
                    ].includes(String(key))
                )
                    trace.push({
                        name: String(key),
                        args: JSON.parse(JSON.stringify(args))
                    })
                if (key === 'saveV3CandidatePool' && poolId)
                    args = [{ ...(args[0] as object), id: poolId }]
                return Reflect.apply(value, target, args)
            }
        }
    })
    database.importCatalog(
        Array.from({ length: 8 }, (_, index) => ({
            comicId: index % 2 ? `eh:${index}:0123456789` : `fixture-${index}`,
            title: 'Synthetic work ' + index,
            author: 'Synthetic Author ' + (index % 3),
            tags:
                index % 2
                    ? ['female:schoolgirl', 'parody:fixture-ip']
                    : ['School', '短篇'],
            categories: ['Manga'],
            finished: true,
            providerId: index % 2 ? 'eh' : 'pica',
            providerMetadata:
                index % 2
                    ? { rawTags: ['female:schoolgirl', 'parody:fixture-ip'] }
                    : undefined
        })),
        'synthetic:shadow'
    )
    database.setFavoriteState('fixture-0', true)
    database.setFavoriteState('eh:1:0123456789', true)
    const state = defaultPortablePolicyStateV5()
    state.revision = 3
    state.controls = [
        {
            targetType: 'TAG',
            key: 'school',
            label: 'School',
            direction: 'MORE',
            levelDelta: 2,
            scope: 'PERSISTENT',
            source: 'DESKTOP',
            updatedAt: SHADOW_TEST_NOW
        }
    ]
    state.seenComicIds = ['fixture-2']
    state.hardSuppressComicIds = ['returned-3']
    if (scenario === 'private-tags') {
        const id = 'pt_' + '6'.repeat(32)
        state.tagPolicy = normalizeTagPolicyV1({
            ...defaultTagPolicyV1(),
            mode: 'SELECTED',
            selected: ['private|' + id],
            privateTags: [
                {
                    id,
                    name: 'Synthetic alias',
                    kind: 'MAPPED',
                    comicIds: [],
                    mappings: ['pica|school', 'eh|female:schoolgirl']
                }
            ]
        })
    }
    if (scenario !== 'missing-policy')
        database.setAppState(RECOMMENDATION_V5_POLICY_STATE_KEY, state)
    database.setAppState('synthetic-serving-sentinel', {
        currentCycle: 'do-not-change',
        currentBatch: 2,
        visual: 'OFF',
        syncRevision: 12
    })
    database.saveV3CandidatePool({
        id: 'existing-serving-pool',
        cycleId: 'serving-cycle',
        candidateIds: ['fixture-4'],
        modelVersion: 'v3-serving-fixture',
        telemetry: { servingImpact: true }
    })
    const catalog = database.listComics({ limit: 10000 })
    const policy = () =>
        new RecommendationPolicyStoreV5(proxy).state({ initialize: false })
    const timescales: RecommendationShadowApplicationV5['timescales'] = (
        session,
        limit
    ) => {
        trace.push({ name: 'timescales', args: [session, limit] })
        return buildPreferenceTimescalesV5(
            [],
            catalog,
            scenario === 'missing-policy'
                ? defaultPortablePolicyStateV5()
                : state
        )
    }
    const plan: RecommendationShadowApplicationV5['plan'] = (
        session,
        limit
    ) => {
        trace.push({ name: 'plan', args: [session, limit] })
        const current =
            scenario === 'missing-policy'
                ? defaultPortablePolicyStateV5()
                : state
        return compileCandidateProviderRoutesV5(
            buildCandidateChannelPlanV5({
                catalog,
                policy: current,
                timescales: buildPreferenceTimescalesV5([], catalog, current),
                tagProviderCanonicals: { school: 'female:schoolgirl' },
                tagFacets: { school: 'CONTENT_TRAIT' },
                providerEligibility: {
                    pica: scenario !== 'providers-off',
                    eh: scenario !== 'providers-off',
                    exh: false
                }
            })
        )
    }
    const records: FavoriteRecord[] = Array.from(
        { length: scenario === 'many-candidates' ? 110 : 14 },
        (_, index) => ({
            comicId: 'returned-' + index,
            title: 'Synthetic returned ' + index,
            author: 'Other Author ' + (index % 5),
            tags: ['School', '短篇'],
            categories: ['Manga'],
            finished: true
        })
    )
    const provider: ReturnType<RecommendationShadowApplicationV5['provider']> =
        {
            search: async (...args) => {
                trace.push({
                    name: 'search',
                    args: JSON.parse(JSON.stringify(args))
                })
                if (
                    scenario === 'partial-provider-failure' &&
                    args[1]?.[0] === 'eh'
                )
                    throw new Error('Synthetic network timeout')
                return records
            },
            relatedPica: async (...args) => {
                trace.push({
                    name: 'relatedPica',
                    args: JSON.parse(JSON.stringify(args))
                })
                return records.slice(2, 8)
            }
        }
    const hooks = {
        provider: () => {
            trace.push({ name: 'openProvider', args: [] })
            return provider
        },
        plan,
        timescales,
        acquire: async () => ({ release() {} })
    }
    const service = new LibraryService(proxy, root)
    service.providerService = hooks.provider as typeof service.providerService
    service.recommendationV5ProviderRoutes = plan
    service.recommendationV5PreferenceTimescales = timescales
    const ports = (cycleId = 'v5-shadow:synthetic') =>
        recommendationShadowPortsV5({
            database: proxy,
            ...hooks,
            createCycleId: () => cycleId,
            assertSourcesCurrent() {}
        })
    return {
        root,
        database,
        proxy,
        trace,
        hooks,
        service,
        ports,
        policy,
        records,
        usePoolId(value: string) {
            poolId = value
        },
        dispose() {
            database.close()
            const resolved = fs.realpathSync.native(root)
            if (
                path.dirname(resolved) !==
                    fs.realpathSync.native(os.tmpdir()) ||
                !path.basename(resolved).startsWith('pica-shadow-module-') ||
                fs.lstatSync(root).isSymbolicLink()
            )
                throw new Error('Unsafe synthetic cleanup target')
            fs.rmSync(resolved, { recursive: true, force: true })
        }
    }
}

export type ShadowFixture = ReturnType<typeof shadowFixture>
