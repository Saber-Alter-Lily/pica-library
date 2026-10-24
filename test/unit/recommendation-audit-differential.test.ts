import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { RecommendationAuditQueriesV5 } from '../../src/recommendation/audit-queries-v5'
import { recommendationAuditReadPortV5 } from '../../src/services/recommendation-audit-adapter'
import { RecommendationPolicyStoreV5 } from '../../src/recommendation-v5/policy-store'
import {
    defaultPortablePolicyStateV5,
    RECOMMENDATION_V5_POLICY_STATE_KEY
} from '../../src/recommendation-v5/portable-policy'
import { shadowPipelineModelVersionV5 } from '../../src/recommendation-v5/shadow-pipeline'
import { defaultTagPolicyV1, normalizeTagPolicyV1 } from '../../src/tags/policy'
import * as semantics from '../../src/recommendation-v3/tag-resolution-v3'
import {
    FrozenRecommendationAuditV5,
    AUDIT_ORACLE_SOURCE_V5
} from '../fixtures/recommendation-audit-legacy'

const fixtures: Array<{ root: string; database: LibraryDatabase }> = []
const model = shadowPipelineModelVersionV5()
const scenarios = [
    'populated',
    'private-tags',
    'missing-registry',
    'providers-off',
    'uninitialized'
] as const
const methods = [
    'recommendationV5BenchmarkVersions',
    'recommendationV5BenchmarkComparison',
    'recommendationV5EvaluationSummary',
    'recommendationV5SteerabilityAudit',
    'recommendationV5RetrospectiveBenchmark',
    'recommendationV5VisualActivationGate',
    'recommendationV5P3PromotionGate',
    'recommendationV5ShadowRuns',
    'recommendationV5ProviderRoutes',
    'recommendationV5CandidateChannels',
    'recommendationV5PreferenceTimescales',
    'recommendationV5BehaviorEvidence',
    'recommendationV5AdvancedLearningGate'
] as const
type Scenario = (typeof scenarios)[number]
const privateId = 'pt_' + '4'.repeat(32)

function databaseState(database: LibraryDatabase) {
    // Synthetic fixtures only. Logical row equality is stronger than observing selected setters.
    const sqlite = (
        database as unknown as {
            db: {
                prepare(sql: string): { all(): Array<Record<string, unknown>> }
            }
        }
    ).db
    const tables = sqlite
        .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all()
    return JSON.stringify(
        tables.map((row) => {
            const name = String(row.name)
            if (!/^[a-z_0-9]+$/i.test(name))
                throw new Error('Unexpected synthetic table')
            return {
                name,
                rows: sqlite
                    .prepare('SELECT * FROM "' + name + '"')
                    .all()
                    .map((value) => JSON.stringify(value))
                    .sort()
            }
        })
    )
}
function fixture(scenario: Scenario) {
    const root = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-audit-differential-')
        ),
        database = new LibraryDatabase(path.join(root, 'library.db'))
    fixtures.push({ root, database })
    const trace: Array<{ name: string; args: unknown[] }> = []
    const reads = new Set([
        'getAppState',
        'listComics',
        'listUserEvents',
        'listCandidatePoolsByModelVersionPrefix',
        'listVisualEmbeddings',
        'favoriteIds',
        'recommendationFeedback'
    ])
    const proxy = new Proxy(database, {
        get(target, key) {
            const value = Reflect.get(target, key)
            if (typeof value !== 'function') return value
            return (...args: unknown[]) => {
                if (reads.has(String(key)))
                    trace.push({
                        name: String(key),
                        args: JSON.parse(JSON.stringify(args))
                    })
                return Reflect.apply(value, target, args)
            }
        }
    })
    database.importCatalog(
        Array.from({ length: 18 }, (_, i) => ({
            comicId: i % 2 ? 'eh:' + i + ':0123456789' : 'synthetic-' + i,
            title: 'Fixture ' + i,
            author: 'Author ' + (i % 4),
            tags:
                i % 2
                    ? [
                          'artist:author ' + (i % 4),
                          'parody:fixture-ip',
                          'female:schoolgirl'
                      ]
                    : ['School', '短篇'],
            categories: ['Manga'],
            finished: true,
            providerId: i % 2 ? 'eh' : 'pica',
            providerMetadata:
                i % 2
                    ? {
                          rawTags: [
                              'artist:author ' + (i % 4),
                              'parody:fixture-ip',
                              'female:schoolgirl'
                          ]
                      }
                    : undefined
        })),
        'synthetic:audit'
    )
    database.setFavoriteState('synthetic-0', true)
    database.setFavoriteState('eh:1:0123456789', true)
    if (scenario !== 'uninitialized') {
        const state = defaultPortablePolicyStateV5()
        state.revision = 4
        state.controls = [
            {
                targetType: 'TAG',
                key: 'school',
                label: 'School',
                direction: 'MORE',
                levelDelta: 2,
                scope: 'PERSISTENT',
                source: 'DESKTOP',
                updatedAt: '2026-08-01T00:00:00Z'
            }
        ]
        state.sessionIntent = {
            mode: 'TARGET',
            targetType: 'AUTHOR',
            key: 'author 1',
            label: 'Author 1',
            source: 'DESKTOP',
            updatedAt: '2026-08-01T00:00:00Z'
        }
        state.temporarySuppressions = [
            {
                comicId: 'synthetic-2',
                createdAt: '2026-10-23T00:00:00Z',
                expiresAt: '2026-10-25T00:00:00Z'
            }
        ]
        if (scenario === 'private-tags')
            state.tagPolicy = normalizeTagPolicyV1({
                ...defaultTagPolicyV1(),
                mode: 'SELECTED',
                selected: ['private|' + privateId],
                privateTags: [
                    {
                        id: privateId,
                        name: 'My fixture alias',
                        kind: 'MAPPED',
                        comicIds: [],
                        mappings: ['pica|school', 'eh|female:schoolgirl']
                    }
                ]
            })
        database.setAppState(RECOMMENDATION_V5_POLICY_STATE_KEY, state)
    }
    for (let i = 0; i < 4; i++) {
        const at = i < 3 ? '2026-08-01T00:00:00Z' : '2026-10-23T00:00:00Z'
        vi.setSystemTime(new Date(at))
        database.saveV3CandidatePool({
            id: 'pool-' + i,
            cycleId: 'cycle-' + i,
            appSessionId: 'session-a',
            modelVersion: i === 2 ? model + '-older' : model,
            candidateIds: ['synthetic-2', 'eh:3:0123456789', 'synthetic-4'],
            telemetry: {
                sessionMode: i % 2 ? 'EXPLORE' : 'DEFAULT',
                rankedEvidence: [{ comicId: 'synthetic-2', rank: 1 }],
                diversifiedBatch: [{ comicId: 'synthetic-2', batchRank: 1 }],
                correctnessAudit: { status: 'PASS' }
            }
        })
    }
    vi.setSystemTime(new Date('2026-10-24T00:00:00Z'))
    database.recordUserEvent({
        id: 'event-1',
        occurredAt: '2026-08-02T00:00:00Z',
        eventType: 'recommend_like',
        comicId: 'synthetic-2',
        appSessionId: 'session-a',
        source: 'synthetic'
    })
    database.recordUserEvent({
        id: 'event-2',
        occurredAt: '2026-10-23T00:00:00Z',
        eventType: 'search',
        appSessionId: 'session-a',
        metadata: { query: 'School' },
        source: 'synthetic'
    })
    const service = new LibraryService(proxy, root)
    const eligibility =
        scenario === 'providers-off'
            ? { pica: false, eh: false, exh: false }
            : { pica: true, eh: true, exh: true }
    const hooks = {
        visualRepresentationQc: () => service.visualRepresentationQc(),
        visualAuthorAtlas: () => service.visualAuthorAtlas(),
        eligibility
    }
    const legacy = new FrozenRecommendationAuditV5(proxy, hooks)
    const modern = new RecommendationAuditQueriesV5(
        recommendationAuditReadPortV5(proxy, {
            ...hooks,
            providerEligibility: () => eligibility
        })
    )
    trace.length = 0
    return { database, legacy, modern, trace }
}
afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    for (const { root, database } of fixtures.splice(0)) {
        database.close()
        fs.rmSync(root, { recursive: true, force: true })
    }
})

describe('V5 audit frozen-method differential', () => {
    it('keeps every frozen method byte-identical and independent of the replacement query class', () => {
        const text = fs.readFileSync(
                'test/fixtures/recommendation-audit-legacy.ts',
                'utf8'
            ),
            tree = ts.createSourceFile(
                'oracle.ts',
                text,
                ts.ScriptTarget.Latest,
                true
            ),
            owner = tree.statements.find(
                (n): n is ts.ClassDeclaration =>
                    ts.isClassDeclaration(n) &&
                    n.name?.text === 'FrozenRecommendationAuditV5'
            )!
        const authority = JSON.parse(
            fs.readFileSync(
                'test/fixtures/recommendation-audit-legacy-authority.json',
                'utf8'
            )
        )
        expect(AUDIT_ORACLE_SOURCE_V5).toBe(
            'fe360d315d53c597042307a47e6e81fc14c9a1ef'
        )
        expect(text).not.toContain('audit-queries-v5')
        expect(text).not.toContain('recommendation-audit-adapter')
        for (const row of authority.methods) {
            const method = owner.members.find(
                (m) => m.name?.getText(tree) === row.name
            )!
            expect(
                createHash('sha256').update(method.getText(tree)).digest('hex'),
                row.name
            ).toBe(row.sha256)
        }
    })
    it.each(
        scenarios.flatMap((scenario) =>
            methods.map((method) => ({ scenario, method }))
        )
    )(
        '$scenario: $method preserves complete output and read order',
        ({ scenario, method }) => {
            vi.useFakeTimers({ toFake: ['Date'] })
            vi.setSystemTime(new Date('2026-10-24T00:00:00Z'))
            if (scenario === 'missing-registry')
                vi.spyOn(semantics, 'loadTagRegistryV3').mockImplementation(
                    () => {
                        throw new Error('synthetic missing semantic assets')
                    }
                )
            const old = fixture(scenario),
                next = fixture(scenario)
            const before = databaseState(next.database)
            const args: unknown[] =
                method === 'recommendationV5BenchmarkComparison'
                    ? [model + '-older', model, 25, 30]
                    : method === 'recommendationV5AdvancedLearningGate'
                      ? ['ACTIVE_LEARNING', model + '-older', model, 25, 30]
                      : [
                              'recommendationV5ProviderRoutes',
                              'recommendationV5CandidateChannels',
                              'recommendationV5PreferenceTimescales'
                          ].includes(method)
                        ? ['session-a', 25]
                        : method === 'recommendationV5SteerabilityAudit'
                          ? [3, 12]
                          : method === 'recommendationV5EvaluationSummary'
                            ? [25, 30, 3, 12]
                            : [25]
            const expected = Reflect.apply(
                    old.legacy[method],
                    old.legacy,
                    args
                ),
                actual = Reflect.apply(next.modern[method], next.modern, args)
            expect(actual).toEqual(expected)
            expect(next.trace).toEqual(old.trace)
            expect(databaseState(next.database)).toBe(before)
        }
    )
    it('preserves already-resolved facets when a later semantic row throws', () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-10-24T00:00:00Z'))
        const resolve = semantics.resolveTagV3
        let calls = 0
        vi.spyOn(semantics, 'resolveTagV3').mockImplementation((...args) => {
            if (++calls > 1)
                throw new Error('Synthetic later-row resolution failure')
            return resolve(...args)
        })
        const old = fixture('populated'),
            next = fixture('populated')
        const before = databaseState(next.database)
        const expected = old.legacy.recommendationV5CandidateChannels(
            'session-a',
            25
        )
        const oldCalls = calls
        calls = 0
        const actual = next.modern.recommendationV5CandidateChannels(
            'session-a',
            25
        )
        expect(oldCalls).toBeGreaterThan(1)
        expect(calls).toBe(oldCalls)
        expect(actual).toEqual(expected)
        expect(next.trace).toEqual(old.trace)
        expect(databaseState(next.database)).toBe(before)
    })
    it('retains the frozen counterexample: old snapshot persists an empty policy while new read does not', () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-10-24T00:00:00Z'))
        const old = fixture('uninitialized'),
            next = fixture('uninitialized')
        old.legacy.recommendationV5Snapshot()
        next.modern.recommendationV5SteerabilityAudit()
        expect(
            old.database.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)
        ).toBeDefined()
        expect(
            next.database.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)
        ).toBeUndefined()
    })
})
