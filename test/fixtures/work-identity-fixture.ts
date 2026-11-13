import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import type { FavoriteRecord } from '../../src/library/types'
import { WorkIdentityQueriesV5 } from '../../src/identity/queries-v5'
import { WorkIdentityCommandsV5 } from '../../src/identity/commands-v5'
import {
    workIdentityReadPortV5,
    workIdentityWritePortV5,
    workIdentityTaskPortsV5
} from '../../src/services/work-identity-adapter'
import {
    defaultPortablePolicyStateV5,
    RECOMMENDATION_V5_POLICY_STATE_KEY
} from '../../src/recommendation-v5/portable-policy'
import { WORK_IDENTITY_RESOLVER_VERSION } from '../../src/recommendation-v5/work-identity-foundation'
import { FrozenWorkIdentityV5 } from './work-identity-legacy'
import { enabledFixtureSources } from "../helpers/source-runtime-fixture"
// Reuse the existing all-table synthetic snapshot; it opens no profile on import.
export { shadowDatabaseState as identityDatabaseState } from './recommendation-shadow-fixture'

export const IDENTITY_NOW = '2026-10-23T12:00:00.000Z'
export const IDENTITY_LEFT = 'fixture-left',
    IDENTITY_RIGHT = 'eh:2:0123456789',
    IDENTITY_THIRD = 'fixture-third'
export type IdentityScenario =
    | 'plain'
    | 'ready'
    | 'keep-separate'
    | 'bindings'
    | 'cover'
    | 'uninitialized'
type Sqlite = {
    exec(sql: string): void
    prepare(sql: string): {
        all(...args: unknown[]): Array<Record<string, unknown>>
        run(...args: unknown[]): unknown
    }
}

/** Temporary SQLite plus invented metadata and tiny synthetic vectors; no transport/Java/Reader/server. */
export function identityFixture(scenario: IdentityScenario = 'ready') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-identity-module-'))
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    const sqlite = (database as unknown as { db: Sqlite }).db
    const trace: Array<{ name: string; args: unknown[] }> = []
    // Align UUID-only fields at the storage test seam. Facts, outputs, ordering and
    // every row remain available for exact old/new comparison; no scores are stripped.
    function alignIds(table: string, columns: string[]) {
        if (
            ![
                'work_identity_decisions',
                'work_identity_evidence',
                'work_identity_materialization_runs'
            ].includes(table)
        )
            throw new Error('Unexpected fixture ID table')
        for (const row of sqlite.prepare('SELECT * FROM ' + table).all()) {
            const id =
                'fixture-' +
                createHash('sha256')
                    .update(
                        JSON.stringify([
                            table,
                            ...columns.map((key) => row[key])
                        ])
                    )
                    .digest('hex')
                    .slice(0, 32)
            sqlite
                .prepare('UPDATE ' + table + ' SET id=? WHERE id=?')
                .run(id, row.id)
        }
    }
    const proxy = new Proxy(database, {
        get(target, key) {
            const value = Reflect.get(target, key)
            if (typeof value !== 'function') return value
            return (...args: unknown[]) => {
                if (key !== 'close')
                    trace.push({
                        name: String(key),
                        args: JSON.parse(JSON.stringify(args))
                    })
                const result = Reflect.apply(value, target, args)
                if (key === 'saveWorkIdentityEvidence')
                    alignIds('work_identity_evidence', [
                        'left_comic_id',
                        'right_comic_id',
                        'resolver_version'
                    ])
                if (key === 'saveWorkIdentityDecision') {
                    const record = result as ReturnType<
                        LibraryDatabase['saveWorkIdentityDecision']
                    >
                    alignIds('work_identity_decisions', [
                        'left_comic_id',
                        'right_comic_id'
                    ])
                    const row = sqlite
                        .prepare(
                            'SELECT id FROM work_identity_decisions WHERE left_comic_id=? AND right_comic_id=?'
                        )
                        .all(record.leftComicId, record.rightComicId)[0]
                    return { ...record, id: row.id }
                }
                if (key === 'prepareWorkIdentityMaterializationRun') {
                    const record = result as ReturnType<
                        LibraryDatabase['prepareWorkIdentityMaterializationRun']
                    >
                    alignIds('work_identity_materialization_runs', [
                        'request_key'
                    ])
                    const row = sqlite
                        .prepare(
                            'SELECT id FROM work_identity_materialization_runs WHERE request_key=?'
                        )
                        .all(record.requestKey)[0]
                    return { ...record, id: row.id }
                }
                return result
            }
        }
    })
    database.importCatalog(
        [
            {
                comicId: IDENTITY_LEFT,
                providerId: 'pica',
                title: 'Synthetic Work',
                author: 'Synthetic Creator',
                pagesCount: 100
            },
            {
                comicId: IDENTITY_RIGHT,
                providerId: 'eh',
                title: 'Synthetic Work',
                author: 'Synthetic Creator',
                pagesCount: 101
            },
            {
                comicId: IDENTITY_THIRD,
                providerId: 'pica',
                title: 'Synthetic Work CN',
                author: 'Synthetic Creator',
                pagesCount: 103
            },
            {
                comicId: 'cover-a',
                providerId: 'pica',
                title: 'Synthetic translation A',
                author: 'Cover Creator',
                pagesCount: 30
            },
            {
                comicId: 'eh:cover-b',
                providerId: 'eh',
                title: 'Completely Different Synthetic Translation',
                author: 'Cover Creator',
                pagesCount: 30
            },
            {
                comicId: 'unrelated',
                providerId: 'pica',
                title: 'Unrelated synthetic title',
                author: 'Other Creator',
                pagesCount: 50
            }
        ].map((row) => ({
            ...row,
            providerId: row.providerId as FavoriteRecord['providerId'],
            tags: ['synthetic'],
            categories: ['Fixture'],
            finished: true
        })),
        'synthetic:work-identity'
    )
    database.setFavoriteState(IDENTITY_LEFT, true)
    const policy = defaultPortablePolicyStateV5()
    policy.revision = 3
    if (scenario === 'keep-separate')
        policy.explicitDistinctPairs = [
            [IDENTITY_LEFT, IDENTITY_RIGHT].sort().join('\u0000')
        ]
    if (scenario !== 'uninitialized')
        database.setAppState(RECOMMENDATION_V5_POLICY_STATE_KEY, policy)
    database.setAppState('synthetic-serving-sentinel', {
        cycle: 'do-not-change',
        batch: 2,
        visual: 'OFF',
        syncRevision: 7
    })
    if (['ready', 'bindings', 'uninitialized'].includes(scenario)) {
        proxy.saveWorkIdentityDecision({
            leftComicId: IDENTITY_LEFT,
            rightComicId: IDENTITY_RIGHT,
            decision: 'SAME_WORK',
            source: 'USER'
        })
        proxy.saveWorkIdentityDecision({
            leftComicId: IDENTITY_RIGHT,
            rightComicId: IDENTITY_THIRD,
            decision: 'EDITION_VARIANT',
            source: 'USER'
        })
    }
    if (scenario === 'keep-separate')
        proxy.saveWorkIdentityDecision({
            leftComicId: IDENTITY_LEFT,
            rightComicId: IDENTITY_RIGHT,
            decision: 'KEEP_SEPARATE',
            source: 'USER'
        })
    proxy.saveWorkIdentityEvidence([
        {
            leftComicId: IDENTITY_LEFT,
            rightComicId: IDENTITY_RIGHT,
            relation: 'PROBABLE_SAME_WORK',
            confidence: 0.99,
            resolverVersion: WORK_IDENTITY_RESOLVER_VERSION,
            evidence: { synthetic: true }
        }
    ])
    if (scenario === 'bindings') {
        sqlite
            .prepare(
                "INSERT INTO canonical_works(id,preferred_title,normalized_title,status,created_at,updated_at) VALUES ('fixture-work','Synthetic Work','synthetic work','CONFIRMED',?,?)"
            )
            .run(IDENTITY_NOW, IDENTITY_NOW)
        for (const id of ['edition-a', 'edition-b'])
            sqlite
                .prepare(
                    "INSERT INTO work_editions(id,work_id,language,label,created_at,updated_at) VALUES (?,'fixture-work','en',?,?,?)"
                )
                .run(id, id, IDENTITY_NOW, IDENTITY_NOW)
        for (const [comic, edition] of [
            [IDENTITY_LEFT, 'edition-a'],
            [IDENTITY_RIGHT, 'edition-a'],
            [IDENTITY_THIRD, 'edition-b']
        ])
            sqlite
                .prepare(
                    "INSERT INTO work_upload_bindings(comic_id,work_id,edition_id,binding_status,confidence,resolver_version,created_at,updated_at) VALUES (?,'fixture-work',?,'MANUAL_CONFIRMED',1,?,?,?)"
                )
                .run(
                    comic,
                    edition,
                    WORK_IDENTITY_RESOLVER_VERSION,
                    IDENTITY_NOW,
                    IDENTITY_NOW
                )
    }
    if (scenario === 'cover') {
        for (const [comicId, vector] of [
            ['cover-a', [1, 0, 0]],
            ['eh:cover-b', [0.9999, 0.01, 0]]
        ] as const)
            database.saveVisualEmbedding({
                comicId,
                modelId: 'synthetic-cover',
                modelVersion: '1',
                samplingPolicyVersion: 'synthetic-cover-only',
                embeddingKind: 'cover',
                dimension: 3,
                vector: [...vector],
                sourceKind: 'LOCAL_PAGES',
                sampleCount: 1,
                confidence: 1,
                generatedAt: IDENTITY_NOW,
                metadata: { synthetic: true }
            })
    }
    const catalog = () =>
        proxy.listComics(
            { limit: Number.MAX_SAFE_INTEGER, sort: 'latest' },
            Number.MAX_SAFE_INTEGER
        )
    const read = workIdentityReadPortV5(proxy, catalog),
        write = workIdentityWritePortV5(proxy),
        task = workIdentityTaskPortsV5(proxy, catalog)
    const queries = new WorkIdentityQueriesV5(read),
        commands = new WorkIdentityCommandsV5(queries, write)
    const service = new LibraryService(proxy, root, undefined, undefined, undefined, enabledFixtureSources()),
        frozen = new FrozenWorkIdentityV5(proxy)
    trace.length = 0
    return {
        root,
        database,
        proxy,
        sqlite,
        trace,
        read,
        write,
        task,
        queries,
        commands,
        service,
        frozen,
        dispose() {
            database.close()
            const resolved = fs.realpathSync.native(root)
            if (
                path.dirname(resolved) !==
                    fs.realpathSync.native(os.tmpdir()) ||
                !path.basename(resolved).startsWith('pica-identity-module-') ||
                fs.lstatSync(root).isSymbolicLink()
            )
                throw new Error('Unsafe synthetic fixture cleanup')
            fs.rmSync(resolved, { recursive: true, force: true })
        }
    }
}
export type IdentityFixture = ReturnType<typeof identityFixture>
