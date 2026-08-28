import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import { assertTransition, isTerminal } from '../core/downloads/state-machine'
import type {
    CreateDownloadJob,
    DownloadJob,
    DownloadJobPatch,
    DownloadStatus
} from '../core/downloads/types'
import {
    authorIdForKey,
    normalizeAuthorKey,
    parseAuthorIdentity
} from './author'
import type {
    AuthorGroup,
    ComicQuery,
    DownloadedComic,
    FavoriteRecord,
    FavoritesSyncState,
    ImportResult,
    LibraryReconciliation,
    LibrarySummary,
    ReaderEpisode,
    ReaderPicture,
    ReadingProgress,
    Shelf,
    StoredComic
} from './types'
import {
    latestMigrationVersion,
    runMigrations
} from '../storage/sqlite/migrations'
import type { UpdateFinding } from '../maintenance/updates'
import { trustedCoverUrl } from './cover-url'
import type { UserEvent, UserEventInput } from '../recommendation-v3/types'

type SqlRow = Record<string, unknown>

// Vite 5 predates node:sqlite and attempts to bundle it as a package. Loading
// through Node's require keeps the built-in external in both production and tests.
const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')

function jsonArray(value: unknown): string[] {
    try {
        const parsed = JSON.parse(String(value ?? '[]'))
        return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
        return []
    }
}

function numberValue(value: unknown): number {
    const number = Number(value)
    return Number.isFinite(number) ? number : 0
}

function provenanceGroup(source: string) {
    if (source.startsWith('pica:favorites')) return 'favorites sync'
    if (source === 'pica:discover') return 'search'
    if (source === 'pica:recommendations') return 'recommendation'
    if (source.startsWith('download:enqueue')) return 'download enqueue'
    if (source === 'download:completion') return 'download completion'
    if (source.startsWith('pica:download')) return 'metadata hydration'
    if (source.includes('csv')) return 'CSV import'
    if (source.includes('bundle')) return 'Bundle import'
    if (source.includes('import')) return 'manual import'
    if (source === 'legacy/unknown') return 'legacy/migration'
    return 'unknown'
}

function downloadJob(row: SqlRow): DownloadJob {
    const startedAt = row.started_at ? String(row.started_at) : null
    const progressUpdatedAt = row.progress_updated_at
        ? String(row.progress_updated_at)
        : null
    const bytes = numberValue(row.bytes)
    const elapsedSeconds = startedAt
        ? Math.max(
              0,
              (new Date(
                  progressUpdatedAt ?? new Date().toISOString()
              ).getTime() -
                  new Date(startedAt).getTime()) /
                  1000
          )
        : 0
    const rawTitle = row.comic_title ? String(row.comic_title) : ''
    return {
        id: String(row.id),
        comicId: String(row.comic_id),
        episodeOrders: jsonArray(row.episode_selection_json).map(Number),
        source: String(row.source) as DownloadJob['source'],
        priority: numberValue(row.priority),
        runner: String(row.runner) as DownloadJob['runner'],
        status: String(row.status) as DownloadStatus,
        createdAt: String(row.created_at),
        startedAt,
        finishedAt: row.finished_at ? String(row.finished_at) : null,
        retryCount: numberValue(row.retry_count),
        progressCompleted: numberValue(row.progress_completed),
        progressTotal: numberValue(row.progress_total),
        bytes,
        expectedBytes:
            row.expected_bytes === null || row.expected_bytes === undefined
                ? null
                : numberValue(row.expected_bytes),
        comicTitle:
            rawTitle && !rawTitle.startsWith('Pending metadata [')
                ? rawTitle
                : null,
        chapterTitle: row.current_episode_title
            ? String(row.current_episode_title)
            : null,
        progressUpdatedAt,
        bytesPerSecond:
            elapsedSeconds > 0 && bytes > 0
                ? Math.round(bytes / elapsedSeconds)
                : null,
        error: row.error ? String(row.error) : null
    }
}

const downloadJobSelect = `
    SELECT j.*, c.title AS comic_title
    FROM download_jobs j
    JOIN comics c ON c.id = j.comic_id
`

export class LibraryDatabase {
    readonly file: string
    private readonly db: DatabaseSyncType

    constructor(file: string) {
        this.file = path.resolve(file)
        fs.mkdirSync(path.dirname(this.file), { recursive: true })
        this.db = new DatabaseSync(this.file)
        this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')
        this.backupBeforeMigration()
        this.migrate()
    }

    close() {
        this.db.close()
    }

    recordUserEvent(input: UserEventInput): UserEvent {
        const id = input.id ?? randomUUID()
        const occurredAt = input.occurredAt ?? new Date().toISOString()
        const createdAt = new Date().toISOString()
        const metadata = input.metadata ?? {}
        const dedupeKey = input.dedupeKey ?? null
        const serialized = JSON.stringify(metadata)
        if (
            !input.eventType ||
            /(?:password|token|authorization|cookie|pica_account|pica_password|pica_proxy)/i.test(
                serialized
            )
        )
            throw new Error('Invalid recommendation event metadata')
        this.db
            .prepare(
                `
            INSERT OR IGNORE INTO user_events(
                id, occurred_at, event_type, comic_id, source, app_session_id,
                context_id, recommendation_cycle_id, recommendation_session_id,
                recommendation_batch_index, rank_position, metadata_json,
                dedupe_key, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
            )
            .run(
                id,
                occurredAt,
                input.eventType,
                input.comicId ?? null,
                input.source ?? null,
                input.appSessionId ?? null,
                input.contextId ?? null,
                input.recommendationCycleId ?? null,
                input.recommendationSessionId ?? null,
                input.recommendationBatchIndex ?? null,
                input.rankPosition ?? null,
                serialized,
                dedupeKey,
                createdAt
            )
        const row = (
            dedupeKey
                ? this.db
                      .prepare(
                          'SELECT * FROM user_events WHERE event_type = ? AND dedupe_key = ?'
                      )
                      .get(input.eventType, dedupeKey)
                : this.db
                      .prepare('SELECT * FROM user_events WHERE id = ?')
                      .get(id)
        ) as SqlRow
        if (!row) throw new Error('Failed to record recommendation event')
        return {
            id: String(row.id),
            occurredAt: String(row.occurred_at),
            eventType: String(row.event_type) as UserEvent['eventType'],
            comicId: row.comic_id ? String(row.comic_id) : null,
            source: row.source ? String(row.source) : null,
            appSessionId: row.app_session_id
                ? String(row.app_session_id)
                : null,
            contextId: row.context_id ? String(row.context_id) : null,
            recommendationCycleId: row.recommendation_cycle_id
                ? String(row.recommendation_cycle_id)
                : null,
            recommendationSessionId: row.recommendation_session_id
                ? String(row.recommendation_session_id)
                : null,
            recommendationBatchIndex:
                row.recommendation_batch_index === null
                    ? null
                    : numberValue(row.recommendation_batch_index),
            rankPosition:
                row.rank_position === null
                    ? null
                    : numberValue(row.rank_position),
            metadata: JSON.parse(String(row.metadata_json ?? '{}')) as Record<
                string,
                unknown
            >,
            dedupeKey: row.dedupe_key ? String(row.dedupe_key) : null,
            createdAt: String(row.created_at)
        }
    }

    listUserEvents(
        options: { eventType?: string; comicId?: string; limit?: number } = {}
    ): UserEvent[] {
        const where: string[] = []
        const args: (string | number)[] = []
        if (options.eventType) {
            where.push('event_type = ?')
            args.push(options.eventType)
        }
        if (options.comicId) {
            where.push('comic_id = ?')
            args.push(options.comicId)
        }
        const limit = Math.max(1, Math.min(5000, options.limit ?? 500))
        const rows = this.db
            .prepare(
                `SELECT * FROM user_events ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY occurred_at, created_at LIMIT ?`
            )
            .all(...args, limit) as SqlRow[]
        return rows.map((row) => this.recordFromRow(row))
    }

    recordRecommendationEdge(input: {
        sourceComicId: string
        targetComicId: string
        edgeType: string
        confidence?: number
        metadata?: Record<string, unknown>
    }) {
        const now = new Date().toISOString()
        this.db
            .prepare(
                `
            INSERT INTO recommendation_item_edges(
                source_comic_id, target_comic_id, edge_type,
                first_observed_at, last_observed_at, observation_count,
                confidence, metadata_json
            ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(source_comic_id, target_comic_id, edge_type) DO UPDATE SET
                last_observed_at = excluded.last_observed_at,
                observation_count = recommendation_item_edges.observation_count + 1,
                confidence = MAX(recommendation_item_edges.confidence, excluded.confidence),
                metadata_json = excluded.metadata_json
        `
            )
            .run(
                input.sourceComicId,
                input.targetComicId,
                input.edgeType,
                now,
                now,
                Math.max(0, Math.min(1, input.confidence ?? 0.5)),
                JSON.stringify(input.metadata ?? {})
            )
    }

    listRecommendationEdges(sourceComicId?: string) {
        const rows = sourceComicId
            ? this.db
                  .prepare(
                      'SELECT * FROM recommendation_item_edges WHERE source_comic_id = ? ORDER BY confidence DESC, observation_count DESC'
                  )
                  .all(sourceComicId)
            : this.db
                  .prepare(
                      'SELECT * FROM recommendation_item_edges ORDER BY confidence DESC, observation_count DESC'
                  )
                  .all()
        return (rows as SqlRow[]).map((row) => ({
            sourceComicId: String(row.source_comic_id),
            targetComicId: String(row.target_comic_id),
            edgeType: String(row.edge_type),
            firstObservedAt: String(row.first_observed_at),
            lastObservedAt: String(row.last_observed_at),
            observationCount: numberValue(row.observation_count),
            confidence: numberValue(row.confidence),
            metadata: JSON.parse(String(row.metadata_json ?? '{}')) as Record<
                string,
                unknown
            >
        }))
    }

    saveV3CandidatePool(input: {
        id?: string
        appSessionId?: string | null
        cycleId: string
        candidateIds: string[]
        telemetry?: Record<string, unknown>
        modelVersion?: string
        expiresAt?: string | null
    }) {
        const id = input.id ?? randomUUID()
        const generatedAt = new Date().toISOString()
        this.db
            .prepare(
                `INSERT INTO recommendation_v3_candidate_pools(
            id, app_session_id, recommendation_cycle_id, generated_at,
            expires_at, model_version, telemetry_json, candidate_ids_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
                id,
                input.appSessionId ?? null,
                input.cycleId,
                generatedAt,
                input.expiresAt ?? null,
                input.modelVersion ?? 'v3.0.0-local-explainable',
                JSON.stringify(input.telemetry ?? {}),
                JSON.stringify([...new Set(input.candidateIds)])
            )
        return {
            id,
            generatedAt,
            candidateIds: [...new Set(input.candidateIds)]
        }
    }

    getV3CandidatePool(id: string) {
        const row = this.db
            .prepare(
                'SELECT * FROM recommendation_v3_candidate_pools WHERE id = ?'
            )
            .get(id) as SqlRow | undefined
        return row
            ? {
                  id: String(row.id),
                  appSessionId: row.app_session_id
                      ? String(row.app_session_id)
                      : null,
                  cycleId: String(row.recommendation_cycle_id),
                  generatedAt: String(row.generated_at),
                  candidateIds: jsonArray(row.candidate_ids_json),
                  telemetry: JSON.parse(
                      String(row.telemetry_json ?? '{}')
                  ) as Record<string, unknown>
              }
            : null
    }

    latestV3CandidatePool(cycleId: string) {
        const row = this.db
            .prepare(
                `
            SELECT id FROM recommendation_v3_candidate_pools
            WHERE recommendation_cycle_id = ?
            ORDER BY generated_at DESC LIMIT 1
        `
            )
            .get(cycleId) as SqlRow | undefined
        return row ? this.getV3CandidatePool(String(row.id)) : null
    }

    saveV3Batch(input: {
        poolId: string
        cycleId: string
        sessionId?: string | null
        batchIndex: number
        contextId: string
        itemIds: string[]
        evidence?: Record<string, unknown>
    }) {
        const id = randomUUID()
        const generatedAt = new Date().toISOString()
        this.db
            .prepare(
                `INSERT INTO recommendation_v3_batches(
            id, pool_id, recommendation_cycle_id, recommendation_session_id,
            batch_index, context_id, generated_at, item_ids_json, evidence_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
                id,
                input.poolId,
                input.cycleId,
                input.sessionId ?? null,
                input.batchIndex,
                input.contextId,
                generatedAt,
                JSON.stringify(input.itemIds),
                JSON.stringify(input.evidence ?? {})
            )
        return { id, generatedAt, ...input }
    }

    listV3Batches(poolId: string) {
        return (
            this.db
                .prepare(
                    `
            SELECT * FROM recommendation_v3_batches
            WHERE pool_id = ? ORDER BY batch_index
        `
                )
                .all(poolId) as SqlRow[]
        ).map((row) => ({
            id: String(row.id),
            poolId: String(row.pool_id),
            cycleId: String(row.recommendation_cycle_id),
            sessionId: row.recommendation_session_id
                ? String(row.recommendation_session_id)
                : null,
            batchIndex: numberValue(row.batch_index),
            contextId: String(row.context_id),
            generatedAt: String(row.generated_at),
            itemIds: jsonArray(row.item_ids_json),
            evidence: JSON.parse(String(row.evidence_json ?? '{}')) as Record<
                string,
                unknown
            >
        }))
    }

    allocateRecommendationIds(cycleId: string, comicIds: string[]) {
        const now = new Date().toISOString()
        const statement = this.db.prepare(`
            INSERT OR IGNORE INTO recommendation_seen(
                cycle_id, comic_id, first_seen_at
            ) VALUES (?, ?, ?)
        `)
        for (const comicId of comicIds) statement.run(cycleId, comicId, now)
    }

    private recordFromRow(row: SqlRow): UserEvent {
        return {
            id: String(row.id),
            occurredAt: String(row.occurred_at),
            eventType: String(row.event_type) as UserEvent['eventType'],
            comicId: row.comic_id ? String(row.comic_id) : null,
            source: row.source ? String(row.source) : null,
            appSessionId: row.app_session_id
                ? String(row.app_session_id)
                : null,
            contextId: row.context_id ? String(row.context_id) : null,
            recommendationCycleId: row.recommendation_cycle_id
                ? String(row.recommendation_cycle_id)
                : null,
            recommendationSessionId: row.recommendation_session_id
                ? String(row.recommendation_session_id)
                : null,
            recommendationBatchIndex:
                row.recommendation_batch_index === null
                    ? null
                    : numberValue(row.recommendation_batch_index),
            rankPosition:
                row.rank_position === null
                    ? null
                    : numberValue(row.rank_position),
            metadata: JSON.parse(String(row.metadata_json ?? '{}')) as Record<
                string,
                unknown
            >,
            dedupeKey: row.dedupe_key ? String(row.dedupe_key) : null,
            createdAt: String(row.created_at)
        }
    }

    private migrate() {
        runMigrations(this.db)
    }

    private backupBeforeMigration() {
        if (!fs.existsSync(this.file) || fs.statSync(this.file).size === 0)
            return
        const table = this.db
            .prepare(
                "SELECT 1 AS found FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
            )
            .get() as SqlRow | undefined
        const current = table
            ? numberValue(
                  (
                      this.db
                          .prepare(
                              'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations'
                          )
                          .get() as SqlRow
                  ).version
              )
            : 0
        if (current >= latestMigrationVersion) return
        this.db.exec('PRAGMA wal_checkpoint(FULL)')
        const backup = `${this.file}.pre-migration-v${latestMigrationVersion}.bak`
        fs.copyFileSync(this.file, backup)
    }

    importFavorites(
        records: FavoriteRecord[],
        source = 'import',
        completeSnapshot = true,
        markFavorite = true
    ): ImportResult {
        const now = new Date().toISOString()
        const uniqueRecords = [
            ...new Map(
                records
                    .filter((record) => record.comicId?.trim())
                    .map((record) => [record.comicId.trim(), record])
            ).values()
        ]
        const previousFavoriteIds = new Set(
            (
                this.db
                    .prepare('SELECT id FROM comics WHERE is_favorite = 1')
                    .all() as SqlRow[]
            ).map((row) => String(row.id))
        )
        const run = this.db
            .prepare(
                `INSERT INTO sync_runs(source, status, started_at)
                 VALUES (?, 'running', ?)`
            )
            .run(source, now)
        const runId = Number(run.lastInsertRowid)
        const existsStatement = this.db.prepare(
            'SELECT 1 AS found FROM comics WHERE id = ?'
        )
        const aliasLookup = this.db.prepare(
            'SELECT author_id FROM author_aliases WHERE alias_key = ?'
        )
        const authorUpsert = this.db.prepare(`
            INSERT INTO authors(
                id, canonical_name, normalized_key, confidence, evidence,
                review_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(normalized_key) DO UPDATE SET
                confidence = MIN(authors.confidence, excluded.confidence),
                evidence = CASE
                    WHEN authors.evidence = excluded.evidence THEN authors.evidence
                    ELSE authors.evidence || '; ' || excluded.evidence
                END,
                review_status = CASE
                    WHEN authors.review_status = 'approved'
                         AND excluded.review_status = 'pending'
                    THEN 'pending'
                    ELSE authors.review_status
                END,
                updated_at = excluded.updated_at
        `)
        const aliasUpsert = this.db.prepare(`
            INSERT INTO author_aliases(
                alias_key, alias_display, author_id, source, evidence,
                confidence, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(alias_key) DO UPDATE SET
                alias_display = excluded.alias_display,
                evidence = excluded.evidence,
                confidence = MIN(author_aliases.confidence, excluded.confidence)
        `)
        const comicUpsert = this.db.prepare(`
            INSERT INTO comics(
                id, title, raw_author, circle, author_candidate,
                canonical_author_id, description, chinese_team,
                categories_json, tags_json, finished, created_at_source,
                updated_at_source, total_likes, total_views, pages_count,
                eps_count, cover_url, is_favorite, first_seen_at, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                raw_author = excluded.raw_author,
                circle = excluded.circle,
                author_candidate = excluded.author_candidate,
                canonical_author_id = excluded.canonical_author_id,
                description = excluded.description,
                chinese_team = excluded.chinese_team,
                categories_json = excluded.categories_json,
                tags_json = excluded.tags_json,
                finished = excluded.finished,
                created_at_source = COALESCE(excluded.created_at_source, comics.created_at_source),
                updated_at_source = COALESCE(excluded.updated_at_source, comics.updated_at_source),
                total_likes = excluded.total_likes,
                total_views = excluded.total_views,
                pages_count = excluded.pages_count,
                eps_count = excluded.eps_count,
                cover_url = COALESCE(excluded.cover_url, comics.cover_url),
                is_favorite = CASE
                    WHEN excluded.is_favorite = 1 THEN 1
                    ELSE comics.is_favorite
                END,
                last_seen_at = excluded.last_seen_at
        `)
        const linkUpsert = this.db.prepare(`
            INSERT INTO comic_authors(
                comic_id, author_id, raw_value, circle, confidence,
                needs_review, evidence
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(comic_id, author_id, raw_value) DO UPDATE SET
                circle = excluded.circle,
                confidence = excluded.confidence,
                needs_review = excluded.needs_review,
                evidence = excluded.evidence
        `)
        const provenanceUpsert = this.db.prepare(`
            INSERT INTO comic_provenance(
                comic_id, source, first_seen_at, last_seen_at
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT(comic_id, source) DO UPDATE SET
                last_seen_at = excluded.last_seen_at
        `)
        const clearUnknownProvenance = this.db.prepare(`
            DELETE FROM comic_provenance
            WHERE comic_id = ? AND source = 'legacy/unknown'
        `)
        const membershipUpsert = this.db.prepare(`
            INSERT INTO library_membership(comic_id, reason, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(comic_id, reason) DO UPDATE SET updated_at = excluded.updated_at
        `)
        const explicitImport =
            source.includes('import') ||
            source.toLocaleLowerCase('und').includes('csv') ||
            source.toLocaleLowerCase('und').includes('bundle')

        let inserted = 0
        let updated = 0
        try {
            this.db.exec('BEGIN IMMEDIATE')
            if (completeSnapshot && markFavorite) {
                this.db.exec('UPDATE comics SET is_favorite = 0')
                this.db.exec(
                    "DELETE FROM library_membership WHERE reason = 'pica-favorite'"
                )
            }
            for (const record of uniqueRecords) {
                const existed = Boolean(
                    existsStatement.get(record.comicId) as SqlRow | undefined
                )
                const identity = parseAuthorIdentity(record.author)
                let authorId: string | null = null
                if (identity.normalizedKey !== '(missing)') {
                    const existingAlias = aliasLookup.get(
                        identity.normalizedKey
                    ) as SqlRow | undefined
                    authorId = existingAlias
                        ? String(existingAlias.author_id)
                        : authorIdForKey(identity.normalizedKey)
                    authorUpsert.run(
                        authorId,
                        identity.creator,
                        identity.normalizedKey,
                        identity.confidence,
                        identity.evidence,
                        identity.needsReview ? 'pending' : 'approved',
                        now,
                        now
                    )
                    aliasUpsert.run(
                        identity.normalizedKey,
                        identity.creator,
                        authorId,
                        identity.parsed ? 'parenthetical' : 'standalone',
                        identity.evidence,
                        identity.confidence,
                        now
                    )
                }
                comicUpsert.run(
                    record.comicId,
                    record.title.trim(),
                    record.author,
                    identity.circle,
                    identity.creator === '(missing)' ? null : identity.creator,
                    authorId,
                    record.description ?? '',
                    record.chineseTeam ?? '',
                    JSON.stringify(record.categories),
                    JSON.stringify(record.tags),
                    record.finished ? 1 : 0,
                    record.createdAt ?? null,
                    record.updatedAt ?? null,
                    record.totalLikes ?? 0,
                    record.totalViews ?? 0,
                    record.pagesCount ?? 0,
                    record.epsCount ?? 0,
                    trustedCoverUrl(record.coverUrl) ?? null,
                    markFavorite ? 1 : 0,
                    now,
                    now
                )
                if (authorId) {
                    linkUpsert.run(
                        record.comicId,
                        authorId,
                        record.author,
                        identity.circle,
                        identity.confidence,
                        identity.needsReview ? 1 : 0,
                        identity.evidence
                    )
                }
                provenanceUpsert.run(record.comicId, source, now, now)
                if (source !== 'legacy/unknown')
                    clearUnknownProvenance.run(record.comicId)
                if (markFavorite)
                    membershipUpsert.run(
                        record.comicId,
                        'pica-favorite',
                        now,
                        now
                    )
                if (explicitImport)
                    membershipUpsert.run(
                        record.comicId,
                        'explicit-import',
                        now,
                        now
                    )
                if (existed) updated += 1
                else inserted += 1
            }
            this.db
                .prepare(
                    `UPDATE sync_runs SET status = 'completed', finished_at = ?,
                     item_count = ? WHERE id = ?`
                )
                .run(new Date().toISOString(), uniqueRecords.length, runId)
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            this.db
                .prepare(
                    `UPDATE sync_runs SET status = 'failed', finished_at = ?,
                     error = ? WHERE id = ?`
                )
                .run(new Date().toISOString(), String(error), runId)
            throw error
        }

        const summary = this.summary()
        const currentFavoriteIds = new Set(
            (
                this.db
                    .prepare('SELECT id FROM comics WHERE is_favorite = 1')
                    .all() as SqlRow[]
            ).map((row) => String(row.id))
        )
        return {
            imported: uniqueRecords.length,
            inserted,
            updated,
            authorGroups: summary.authors,
            authorsPendingReview: summary.authorsPendingReview,
            favoriteCount: summary.favorites,
            addedFavorites: [...currentFavoriteIds].filter(
                (id) => !previousFavoriteIds.has(id)
            ).length,
            removedFavorites:
                completeSnapshot && markFavorite
                    ? [...previousFavoriteIds].filter(
                          (id) => !currentFavoriteIds.has(id)
                      ).length
                    : 0,
            libraryInserted: inserted,
            libraryUpdated: updated
        }
    }

    importCatalog(records: FavoriteRecord[], source = 'catalog'): ImportResult {
        return this.importFavorites(records, source, false, false)
    }

    summary(): LibrarySummary {
        const count = (sql: string) =>
            numberValue((this.db.prepare(sql).get() as SqlRow).count)
        return {
            comics: count(
                'SELECT COUNT(DISTINCT comic_id) AS count FROM library_membership'
            ),
            catalogComics: count('SELECT COUNT(*) AS count FROM comics'),
            favorites: count(
                'SELECT COUNT(*) AS count FROM comics WHERE is_favorite = 1'
            ),
            downloadedComics: this.listDownloadedComics().length,
            authors: count('SELECT COUNT(*) AS count FROM authors'),
            authorsPendingReview: count(
                `SELECT COUNT(*) AS count FROM authors WHERE review_status = 'pending'`
            ),
            episodes: count('SELECT COUNT(*) AS count FROM episodes'),
            pictures: count('SELECT COUNT(*) AS count FROM pictures'),
            downloadedPictures: count(
                `SELECT COUNT(*) AS count FROM pictures WHERE status = 'completed'`
            )
        }
    }

    reconcileLibraryCounts(): LibraryReconciliation {
        const count = (sql: string) =>
            numberValue((this.db.prepare(sql).get() as SqlRow).count)
        const provenanceGroups: Record<string, number> = {}
        const provenanceRows = this.db
            .prepare(
                `SELECT source, COUNT(DISTINCT comic_id) AS count
                 FROM comic_provenance GROUP BY source`
            )
            .all() as SqlRow[]
        for (const row of provenanceRows) {
            const group = provenanceGroup(String(row.source))
            provenanceGroups[group] =
                (provenanceGroups[group] ?? 0) + numberValue(row.count)
        }
        return {
            totalComicRecords: count('SELECT COUNT(*) AS count FROM comics'),
            favoriteRecords: count(
                'SELECT COUNT(*) AS count FROM comics WHERE is_favorite = 1'
            ),
            nonFavoriteRecords: count(
                'SELECT COUNT(*) AS count FROM comics WHERE is_favorite = 0'
            ),
            distinctCanonicalComicIds: count(
                'SELECT COUNT(DISTINCT id) AS count FROM comics'
            ),
            distinctProviderRawIds: count(
                'SELECT COUNT(DISTINCT id) AS count FROM comics'
            ),
            duplicateCanonicalIds: count(
                `SELECT COUNT(*) AS count FROM (
                    SELECT id FROM comics GROUP BY id HAVING COUNT(*) > 1
                )`
            ),
            duplicateProviderRawIds: count(
                `SELECT COUNT(*) AS count FROM (
                    SELECT id FROM comics GROUP BY id HAVING COUNT(*) > 1
                )`
            ),
            provenanceGroups,
            favoriteIdsMissingComics: 0,
            comicsWithoutKnownProvenance: count(
                `SELECT COUNT(*) AS count FROM comics c
                 WHERE NOT EXISTS (
                    SELECT 1 FROM comic_provenance p
                    WHERE p.comic_id = c.id AND p.source <> 'legacy/unknown'
                 )`
            ),
            sameMangaMultipleIds: count(
                `SELECT COUNT(*) AS count FROM (
                    SELECT lower(trim(title)), lower(trim(raw_author))
                    FROM comics
                    GROUP BY lower(trim(title)), lower(trim(raw_author))
                    HAVING COUNT(DISTINCT id) > 1
                )`
            ),
            metadataHydrationOnly: count(
                `SELECT COUNT(*) AS count FROM comics c
                 WHERE EXISTS (
                    SELECT 1 FROM comic_provenance p
                    WHERE p.comic_id = c.id
                      AND p.source IN ('pica:download', 'pica:download:metadata')
                 ) AND NOT EXISTS (
                    SELECT 1 FROM comic_provenance p
                    WHERE p.comic_id = c.id
                      AND p.source NOT IN ('pica:download', 'pica:download:metadata')
                 )`
            )
        }
    }

    listDownloadedComics(): DownloadedComic[] {
        const rows = this.db
            .prepare(
                `SELECT c.id, c.title, c.raw_author, c.cover_url,
                        a.canonical_name, p.episode_id, p.local_path,
                        p.last_seen_at,
                        (SELECT COUNT(*) FROM episodes e
                         WHERE e.comic_id = c.id) AS known_chapters,
                        (SELECT COUNT(*) FROM pictures k
                         WHERE k.comic_id = c.id) AS known_pictures
                 FROM comics c
                 JOIN pictures p ON p.comic_id = c.id
                 LEFT JOIN authors a ON a.id = c.canonical_author_id
                 WHERE p.status = 'completed' AND p.local_path IS NOT NULL
                 ORDER BY c.title, p.last_seen_at DESC`
            )
            .all() as SqlRow[]
        const grouped = new Map<
            string,
            DownloadedComic & { episodeIds: Set<string> }
        >()
        for (const row of rows) {
            const localPath = String(row.local_path)
            if (!fs.existsSync(localPath)) continue
            const stat = fs.statSync(localPath)
            if (!stat.isFile() || stat.size <= 0) continue
            const comicId = String(row.id)
            let item = grouped.get(comicId)
            if (!item) {
                item = {
                    comicId,
                    title: String(row.title),
                    author: String(row.raw_author),
                    canonicalAuthor: row.canonical_name
                        ? String(row.canonical_name)
                        : null,
                    coverUrl: row.cover_url ? String(row.cover_url) : undefined,
                    status: 'partial',
                    downloadedChapters: 0,
                    knownChapters: numberValue(row.known_chapters),
                    downloadedPictures: 0,
                    knownPictures: numberValue(row.known_pictures),
                    localBytes: 0,
                    lastDownloadedAt: null,
                    episodeIds: new Set<string>()
                }
                grouped.set(comicId, item)
            }
            item.episodeIds.add(String(row.episode_id))
            item.downloadedPictures += 1
            item.localBytes += stat.size
            const observedAt = String(row.last_seen_at)
            if (!item.lastDownloadedAt || observedAt > item.lastDownloadedAt)
                item.lastDownloadedAt = observedAt
        }
        return [...grouped.values()].map(({ episodeIds, ...item }) => ({
            ...item,
            downloadedChapters: episodeIds.size,
            status:
                item.knownPictures > 0 &&
                item.downloadedPictures >= item.knownPictures
                    ? 'complete'
                    : 'partial'
        }))
    }

    downloadedCoverPath(comicId: string) {
        const rows = this.db
            .prepare(
                `SELECT local_path FROM pictures
                 WHERE comic_id = ? AND status = 'completed'
                   AND local_path IS NOT NULL
                 ORDER BY position LIMIT 20`
            )
            .all(comicId) as SqlRow[]
        for (const row of rows) {
            const file = String(row.local_path)
            if (fs.existsSync(file) && fs.statSync(file).size > 0) return file
        }
        return null
    }

    lastCompletedSync() {
        const row = this.db
            .prepare(
                `SELECT finished_at, item_count FROM sync_runs
                 WHERE status = 'completed' AND source LIKE 'pica:favorites%'
                 ORDER BY finished_at DESC LIMIT 1`
            )
            .get() as SqlRow | undefined
        return row
            ? {
                  finishedAt: String(row.finished_at),
                  itemCount: numberValue(row.item_count)
              }
            : null
    }

    listComics(query: ComicQuery = {}): StoredComic[] {
        const rows = this.db
            .prepare(
                `SELECT c.*, a.canonical_name,
                        EXISTS(SELECT 1 FROM library_membership lm
                               WHERE lm.comic_id = c.id) AS in_library,
                        (SELECT COUNT(*) FROM episodes e WHERE e.comic_id = c.id)
                            AS known_episodes,
                        (SELECT COUNT(*) FROM pictures p WHERE p.comic_id = c.id)
                            AS known_pictures,
                        (SELECT COUNT(*) FROM pictures p
                         WHERE p.comic_id = c.id AND p.status = 'completed')
                            AS downloaded_pictures
                 FROM comics c
                 LEFT JOIN authors a ON a.id = c.canonical_author_id`
            )
            .all() as SqlRow[]
        const text = query.text?.toLocaleLowerCase('und').trim()
        const author = query.author
            ? normalizeAuthorKey(query.author)
            : undefined
        const tags = query.tags?.map((tag) => normalizeAuthorKey(tag)) ?? []
        const categories =
            query.categories?.map((category) => normalizeAuthorKey(category)) ??
            []

        const comics = rows
            .map((row): StoredComic => {
                const canonicalAuthor = row.canonical_name
                    ? String(row.canonical_name)
                    : null
                return {
                    comicId: String(row.id),
                    title: String(row.title),
                    author: String(row.raw_author),
                    description: String(row.description ?? ''),
                    chineseTeam: String(row.chinese_team ?? ''),
                    categories: jsonArray(row.categories_json),
                    tags: jsonArray(row.tags_json),
                    finished: Boolean(row.finished),
                    createdAt: row.created_at_source
                        ? String(row.created_at_source)
                        : undefined,
                    updatedAt: row.updated_at_source
                        ? String(row.updated_at_source)
                        : undefined,
                    totalLikes: numberValue(row.total_likes),
                    totalViews: numberValue(row.total_views),
                    pagesCount: numberValue(row.pages_count),
                    epsCount: numberValue(row.eps_count),
                    coverUrl: row.cover_url ? String(row.cover_url) : undefined,
                    canonicalAuthor,
                    circle: row.circle ? String(row.circle) : null,
                    authorId: row.canonical_author_id
                        ? String(row.canonical_author_id)
                        : null,
                    isFavorite: Boolean(row.is_favorite),
                    firstSeenAt: String(row.first_seen_at),
                    lastSeenAt: String(row.last_seen_at),
                    knownEpisodes: numberValue(row.known_episodes),
                    knownPictures: numberValue(row.known_pictures),
                    downloadedPictures: numberValue(row.downloaded_pictures),
                    inLibrary: Boolean(row.in_library)
                }
            })
            .filter((comic) => {
                if (query.comicId && comic.comicId !== query.comicId)
                    return false
                if (
                    query.finished !== undefined &&
                    comic.finished !== query.finished
                )
                    return false
                if (
                    text &&
                    ![
                        comic.title,
                        comic.author,
                        comic.canonicalAuthor ?? '',
                        comic.description ?? ''
                    ]
                        .join('\n')
                        .toLocaleLowerCase('und')
                        .includes(text)
                )
                    return false
                if (
                    author &&
                    normalizeAuthorKey(
                        comic.canonicalAuthor ?? comic.author
                    ) !== author
                )
                    return false
                const comicTags = comic.tags.map(normalizeAuthorKey)
                if (tags.some((tag) => !comicTags.includes(tag))) return false
                const comicCategories = comic.categories.map(normalizeAuthorKey)
                if (
                    categories.some(
                        (category) => !comicCategories.includes(category)
                    )
                )
                    return false
                return true
            })

        const sort = query.sort ?? 'latest'
        comics.sort((left, right) => {
            if (sort === 'oldest')
                return String(left.updatedAt ?? '').localeCompare(
                    String(right.updatedAt ?? '')
                )
            if (sort === 'likes')
                return (right.totalLikes ?? 0) - (left.totalLikes ?? 0)
            if (sort === 'views')
                return (right.totalViews ?? 0) - (left.totalViews ?? 0)
            if (sort === 'title') return left.title.localeCompare(right.title)
            if (sort === 'recommended') {
                const score = (comic: StoredComic) =>
                    Math.log10(1 + (comic.totalLikes ?? 0)) * 3 +
                    Math.log10(1 + (comic.totalViews ?? 0)) +
                    tags.filter((tag) =>
                        comic.tags.map(normalizeAuthorKey).includes(tag)
                    ).length *
                        5
                return score(right) - score(left)
            }
            return String(right.updatedAt ?? '').localeCompare(
                String(left.updatedAt ?? '')
            )
        })
        const offset = Math.max(0, query.offset ?? 0)
        const limit = Math.max(1, Math.min(5000, query.limit ?? 100))
        return comics.slice(offset, offset + limit)
    }

    getComic(comicId: string): StoredComic | undefined {
        return this.listComics({ comicId, limit: 1 })[0]
    }

    setFavoriteState(comicId: string, isFavorite: boolean) {
        const result = this.db
            .prepare(
                'UPDATE comics SET is_favorite = ?, last_seen_at = ? WHERE id = ?'
            )
            .run(isFavorite ? 1 : 0, new Date().toISOString(), comicId)
        if (result.changes !== 1) throw new Error(`Comic not found: ${comicId}`)
        const now = new Date().toISOString()
        if (isFavorite)
            this.db
                .prepare(
                    `INSERT INTO library_membership(comic_id, reason, created_at, updated_at)
                     VALUES (?, 'pica-favorite', ?, ?)
                     ON CONFLICT(comic_id, reason) DO UPDATE SET updated_at = excluded.updated_at`
                )
                .run(comicId, now, now)
        else
            this.db
                .prepare(
                    "DELETE FROM library_membership WHERE comic_id = ? AND reason = 'pica-favorite'"
                )
                .run(comicId)
        return this.getComic(comicId)
    }

    favoriteIds() {
        return (
            this.db
                .prepare(
                    'SELECT id FROM comics WHERE is_favorite = 1 ORDER BY id'
                )
                .all() as SqlRow[]
        ).map((row) => String(row.id))
    }

    favoritesSyncState(): FavoritesSyncState {
        const row = this.db
            .prepare('SELECT * FROM favorites_sync_state WHERE id = 1')
            .get() as SqlRow
        return {
            lastFullSyncAt: row.last_full_sync_at
                ? String(row.last_full_sync_at)
                : null,
            lastQuickSyncAt: row.last_quick_sync_at
                ? String(row.last_quick_sync_at)
                : null,
            previousRemoteCount: numberValue(row.previous_remote_count),
            lastHeadIds: jsonArray(row.last_head_ids_json),
            lastHeadFingerprint: String(row.last_head_fingerprint ?? ''),
            lastKnownPageSize: numberValue(row.last_known_page_size),
            lastFullReconcileCount: numberValue(row.last_full_reconcile_count)
        }
    }

    saveFavoritesSyncState(state: FavoritesSyncState) {
        this.db
            .prepare(
                `UPDATE favorites_sync_state SET
                    last_full_sync_at = ?, last_quick_sync_at = ?,
                    previous_remote_count = ?, last_head_ids_json = ?,
                    last_head_fingerprint = ?, last_known_page_size = ?,
                    last_full_reconcile_count = ? WHERE id = 1`
            )
            .run(
                state.lastFullSyncAt,
                state.lastQuickSyncAt,
                state.previousRemoteCount,
                JSON.stringify(state.lastHeadIds),
                state.lastHeadFingerprint,
                state.lastKnownPageSize,
                state.lastFullReconcileCount
            )
        return state
    }

    listShelves(): Shelf[] {
        return (
            this.db
                .prepare(
                    `SELECT s.*, COUNT(si.comic_id) AS item_count
                     FROM shelves s
                     LEFT JOIN shelf_items si ON si.shelf_id = s.id
                     GROUP BY s.id
                     ORDER BY s.sort_order, s.created_at, s.name`
                )
                .all() as SqlRow[]
        ).map((row) => ({
            id: String(row.id),
            name: String(row.name),
            createdAt: String(row.created_at),
            updatedAt: String(row.updated_at),
            sortOrder: numberValue(row.sort_order),
            count: numberValue(row.item_count)
        }))
    }

    createShelf(name: string): Shelf {
        const display = name.trim()
        if (!display) throw new Error('书架名称不能为空')
        const normalized = normalizeAuthorKey(display)
        const now = new Date().toISOString()
        const id = randomUUID()
        try {
            this.db
                .prepare(
                    `INSERT INTO shelves(
                        id, name, normalized_name, created_at, updated_at, sort_order
                    ) VALUES (?, ?, ?, ?, ?, ?)`
                )
                .run(
                    id,
                    display,
                    normalized,
                    now,
                    now,
                    this.listShelves().length
                )
        } catch (error) {
            if (/unique/i.test(String(error))) throw new Error('已存在同名书架')
            throw error
        }
        return this.listShelves().find((shelf) => shelf.id === id)!
    }

    renameShelf(id: string, name: string): Shelf {
        const display = name.trim()
        if (!display) throw new Error('书架名称不能为空')
        try {
            const result = this.db
                .prepare(
                    `UPDATE shelves SET name = ?, normalized_name = ?, updated_at = ?
                     WHERE id = ?`
                )
                .run(
                    display,
                    normalizeAuthorKey(display),
                    new Date().toISOString(),
                    id
                )
            if (result.changes !== 1) throw new Error('书架不存在')
        } catch (error) {
            if (/unique/i.test(String(error))) throw new Error('已存在同名书架')
            throw error
        }
        return this.listShelves().find((shelf) => shelf.id === id)!
    }

    deleteShelf(id: string) {
        const result = this.db
            .prepare('DELETE FROM shelves WHERE id = ?')
            .run(id)
        if (result.changes !== 1) throw new Error('书架不存在')
        this.db.exec(`
            DELETE FROM library_membership
            WHERE reason = 'shelf'
              AND NOT EXISTS (
                SELECT 1 FROM shelf_items si
                WHERE si.comic_id = library_membership.comic_id
              )
        `)
        return { deleted: true, id }
    }

    addShelfItems(shelfId: string, comicIds: string[]) {
        if (!this.listShelves().some((shelf) => shelf.id === shelfId))
            throw new Error('书架不存在')
        const unique = [
            ...new Set(comicIds.map((id) => id.trim()).filter(Boolean))
        ]
        const now = new Date().toISOString()
        const exists = this.db.prepare(
            'SELECT 1 AS found FROM comics WHERE id = ?'
        )
        const maximum = this.db
            .prepare(
                'SELECT COALESCE(MAX(position), -1) AS position FROM shelf_items WHERE shelf_id = ?'
            )
            .get(shelfId) as SqlRow
        let position = numberValue(maximum.position) + 1
        let added = 0
        const insert = this.db.prepare(
            `INSERT OR IGNORE INTO shelf_items(
                shelf_id, comic_id, added_at, position
            ) VALUES (?, ?, ?, ?)`
        )
        const membership = this.db.prepare(
            `INSERT INTO library_membership(comic_id, reason, created_at, updated_at)
             VALUES (?, 'shelf', ?, ?)
             ON CONFLICT(comic_id, reason) DO UPDATE SET updated_at = excluded.updated_at`
        )
        this.db.exec('BEGIN IMMEDIATE')
        try {
            for (const comicId of unique) {
                if (!exists.get(comicId)) continue
                const result = insert.run(shelfId, comicId, now, position++)
                added += Number(result.changes)
                membership.run(comicId, now, now)
            }
            this.db
                .prepare('UPDATE shelves SET updated_at = ? WHERE id = ?')
                .run(now, shelfId)
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            throw error
        }
        return {
            shelfId,
            matched: unique.length,
            added,
            total: this.listShelfComics(shelfId).length
        }
    }

    removeShelfItems(shelfId: string, comicIds: string[]) {
        const remove = this.db.prepare(
            'DELETE FROM shelf_items WHERE shelf_id = ? AND comic_id = ?'
        )
        let removed = 0
        for (const comicId of [...new Set(comicIds)])
            removed += Number(remove.run(shelfId, comicId).changes)
        this.db.exec(`
            DELETE FROM library_membership
            WHERE reason = 'shelf'
              AND NOT EXISTS (
                SELECT 1 FROM shelf_items si
                WHERE si.comic_id = library_membership.comic_id
              )
        `)
        return { shelfId, removed, total: this.listShelfComics(shelfId).length }
    }

    listShelfComics(shelfId: string): StoredComic[] {
        const ids = (
            this.db
                .prepare(
                    `SELECT comic_id FROM shelf_items
                     WHERE shelf_id = ? ORDER BY position, added_at`
                )
                .all(shelfId) as SqlRow[]
        ).map((row) => String(row.comic_id))
        const comics = new Map(
            this.listComics({ limit: 5000 }).map((comic) => [
                comic.comicId,
                comic
            ])
        )
        return ids.flatMap((id) => {
            const comic = comics.get(id)
            return comic ? [comic] : []
        })
    }

    listReaderEpisodes(comicId: string): ReaderEpisode[] {
        return (
            this.db
                .prepare(
                    `SELECT e.id, e.comic_id, e.title, e.order_no,
                            COUNT(p.id) AS known_pictures,
                            SUM(CASE WHEN p.status = 'completed' AND p.local_path IS NOT NULL
                                THEN 1 ELSE 0 END) AS downloaded_pictures
                     FROM episodes e
                     LEFT JOIN pictures p ON p.episode_id = e.id
                     WHERE e.comic_id = ?
                     GROUP BY e.id ORDER BY e.order_no`
                )
                .all(comicId) as SqlRow[]
        ).map((row) => ({
            id: String(row.id),
            comicId: String(row.comic_id),
            title: String(row.title),
            order: numberValue(row.order_no),
            downloadedPictures: numberValue(row.downloaded_pictures),
            knownPictures: numberValue(row.known_pictures)
        }))
    }

    listDownloadedPictures(episodeId: string): ReaderPicture[] {
        return (
            this.db
                .prepare(
                    `SELECT id, comic_id, episode_id, position, original_name, local_path
                     FROM pictures
                     WHERE episode_id = ? AND status = 'completed' AND local_path IS NOT NULL
                     ORDER BY position`
                )
                .all(episodeId) as SqlRow[]
        ).map((row) => ({
            id: String(row.id),
            comicId: String(row.comic_id),
            episodeId: String(row.episode_id),
            position: numberValue(row.position),
            originalName: String(row.original_name),
            localPath: String(row.local_path)
        }))
    }

    getDownloadedPicture(pictureId: string): ReaderPicture | undefined {
        const row = this.db
            .prepare(
                `SELECT id, comic_id, episode_id, position, original_name, local_path
                 FROM pictures WHERE id = ? AND status = 'completed' AND local_path IS NOT NULL`
            )
            .get(pictureId) as SqlRow | undefined
        return row
            ? {
                  id: String(row.id),
                  comicId: String(row.comic_id),
                  episodeId: String(row.episode_id),
                  position: numberValue(row.position),
                  originalName: String(row.original_name),
                  localPath: String(row.local_path)
              }
            : undefined
    }

    saveReadingProgress(comicId: string, episodeId: string, pageIndex: number) {
        if (!Number.isInteger(pageIndex) || pageIndex < 0)
            throw new Error('阅读页码无效')
        const now = new Date().toISOString()
        this.db
            .prepare(
                `INSERT INTO reading_progress(comic_id, episode_id, page_index, updated_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(comic_id, episode_id) DO UPDATE SET
                    page_index = excluded.page_index,
                    updated_at = excluded.updated_at`
            )
            .run(comicId, episodeId, pageIndex, now)
        return {
            comicId,
            episodeId,
            pageIndex,
            updatedAt: now
        } as ReadingProgress
    }

    readingProgress(comicId?: string): ReadingProgress[] {
        const rows = comicId
            ? (this.db
                  .prepare(
                      `SELECT comic_id, episode_id, page_index, updated_at
                       FROM reading_progress WHERE comic_id = ? ORDER BY updated_at DESC`
                  )
                  .all(comicId) as SqlRow[])
            : (this.db
                  .prepare(
                      `SELECT comic_id, episode_id, page_index, updated_at
                       FROM reading_progress ORDER BY updated_at DESC`
                  )
                  .all() as SqlRow[])
        return rows.map((row) => ({
            comicId: String(row.comic_id),
            episodeId: String(row.episode_id),
            pageIndex: numberValue(row.page_index),
            updatedAt: String(row.updated_at)
        }))
    }

    recommendationSeen(cycleId: string) {
        return (
            this.db
                .prepare(
                    'SELECT comic_id FROM recommendation_seen WHERE cycle_id = ? ORDER BY first_seen_at'
                )
                .all(cycleId) as SqlRow[]
        ).map((row) => String(row.comic_id))
    }

    latestRecommendationSession(cycleId: string) {
        const row = this.db
            .prepare(
                `SELECT id, session_no, generated_at, result_ids_json, exhausted
                 FROM recommendation_sessions WHERE cycle_id = ?
                 ORDER BY session_no DESC LIMIT 1`
            )
            .get(cycleId) as SqlRow | undefined
        return row
            ? {
                  id: String(row.id),
                  sessionNo: numberValue(row.session_no),
                  generatedAt: String(row.generated_at),
                  comicIds: jsonArray(row.result_ids_json),
                  exhausted: Boolean(row.exhausted)
              }
            : null
    }

    recommendationSession(cycleId: string, sessionNo: number) {
        const row = this.db
            .prepare(
                `SELECT id, session_no, generated_at, result_ids_json, exhausted
                 FROM recommendation_sessions
                 WHERE cycle_id = ? AND session_no = ?`
            )
            .get(cycleId, sessionNo) as SqlRow | undefined
        return row
            ? {
                  id: String(row.id),
                  sessionNo: numberValue(row.session_no),
                  generatedAt: String(row.generated_at),
                  comicIds: jsonArray(row.result_ids_json),
                  exhausted: Boolean(row.exhausted)
              }
            : null
    }

    recommendationRecords(comicIds: string[]) {
        const byId = new Map(
            this.listComics({ limit: 5000 }).map((comic) => [
                comic.comicId,
                comic
            ])
        )
        return comicIds.flatMap((id) => {
            const comic = byId.get(id)
            return comic
                ? [
                      {
                          comic,
                          score: 0,
                          reasons: [] as string[],
                          recallSources: [] as string[],
                          matchedSignals: [] as string[],
                          exploration: false
                      }
                  ]
                : []
        })
    }

    saveRecommendationSession(
        cycleId: string,
        sessionNo: number,
        comicIds: string[],
        exhausted: boolean
    ) {
        const now = new Date().toISOString()
        const id = randomUUID()
        this.db.exec('BEGIN IMMEDIATE')
        try {
            this.db
                .prepare(
                    `INSERT INTO recommendation_sessions(
                        id, cycle_id, session_no, generated_at, result_ids_json, exhausted
                    ) VALUES (?, ?, ?, ?, ?, ?)`
                )
                .run(
                    id,
                    cycleId,
                    sessionNo,
                    now,
                    JSON.stringify(comicIds),
                    exhausted ? 1 : 0
                )
            const seen = this.db.prepare(
                `INSERT OR IGNORE INTO recommendation_seen(
                    cycle_id, comic_id, first_seen_at
                ) VALUES (?, ?, ?)`
            )
            for (const comicId of comicIds) seen.run(cycleId, comicId, now)
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            throw error
        }
        return { id, cycleId, sessionNo, generatedAt: now, comicIds, exhausted }
    }

    getAppState<T>(key: string): T | undefined {
        const row = this.db
            .prepare('SELECT value_json FROM app_state WHERE key = ?')
            .get(key) as SqlRow | undefined
        if (!row) return undefined
        try {
            return JSON.parse(String(row.value_json)) as T
        } catch {
            return undefined
        }
    }

    setAppState(key: string, value: unknown) {
        const now = new Date().toISOString()
        this.db
            .prepare(
                `INSERT INTO app_state(key, value_json, updated_at) VALUES (?, ?, ?)
                 ON CONFLICT(key) DO UPDATE SET
                    value_json = excluded.value_json,
                    updated_at = excluded.updated_at`
            )
            .run(key, JSON.stringify(value), now)
        return { key, updatedAt: now }
    }

    listAuthors(): AuthorGroup[] {
        const rows = this.db
            .prepare(
                `SELECT a.*,
                        COUNT(DISTINCT ca.comic_id) AS works
                 FROM authors a
                 LEFT JOIN comic_authors ca ON ca.author_id = a.id
                 GROUP BY a.id
                 ORDER BY works DESC, a.canonical_name ASC`
            )
            .all() as SqlRow[]
        const aliases = this.db.prepare(
            `SELECT alias_display FROM author_aliases
             WHERE author_id = ? ORDER BY alias_display`
        )
        const circles = this.db.prepare(
            `SELECT DISTINCT circle FROM comic_authors
             WHERE author_id = ? AND circle IS NOT NULL AND circle <> ''
             ORDER BY circle`
        )
        return rows.map((row) => ({
            id: String(row.id),
            canonicalName: String(row.canonical_name),
            normalizedKey: String(row.normalized_key),
            aliases: (aliases.all(String(row.id)) as SqlRow[]).map((item) =>
                String(item.alias_display)
            ),
            circles: (circles.all(String(row.id)) as SqlRow[]).map((item) =>
                String(item.circle)
            ),
            works: numberValue(row.works),
            confidence: numberValue(row.confidence),
            evidence: String(row.evidence),
            reviewStatus: String(row.review_status)
        }))
    }

    setAuthorDecision(
        authorId: string,
        reviewStatus: 'approved' | 'keep_separate' | 'needs_research',
        canonicalName?: string
    ) {
        const now = new Date().toISOString()
        const result = this.db
            .prepare(
                `UPDATE authors
                 SET review_status = ?, canonical_name = COALESCE(?, canonical_name),
                     updated_at = ?
                 WHERE id = ?`
            )
            .run(reviewStatus, canonicalName?.trim() || null, now, authorId)
        if (result.changes === 0) throw new Error(`Unknown author: ${authorId}`)
    }

    mergeAuthors(
        targetAuthorId: string,
        sourceAuthorIds: string[],
        canonicalName?: string
    ) {
        const sources = [...new Set(sourceAuthorIds)].filter(
            (id) => id && id !== targetAuthorId
        )
        if (sources.length === 0) {
            throw new Error('At least one different source author is required')
        }
        const target = this.db
            .prepare('SELECT id FROM authors WHERE id = ?')
            .get(targetAuthorId)
        if (!target) throw new Error(`Unknown target author: ${targetAuthorId}`)

        const now = new Date().toISOString()
        const copyLinks = this.db.prepare(`
            INSERT OR IGNORE INTO comic_authors(
                comic_id, author_id, raw_value, circle, role, is_primary,
                confidence, needs_review, evidence
            )
            SELECT comic_id, ?, raw_value, circle, role, is_primary,
                   confidence, 0, evidence || '; manually merged'
            FROM comic_authors WHERE author_id = ?
        `)
        const moveComics = this.db.prepare(
            'UPDATE comics SET canonical_author_id = ? WHERE canonical_author_id = ?'
        )
        const moveAliases = this.db.prepare(
            'UPDATE author_aliases SET author_id = ? WHERE author_id = ?'
        )
        const deleteLinks = this.db.prepare(
            'DELETE FROM comic_authors WHERE author_id = ?'
        )
        const deleteAuthor = this.db.prepare('DELETE FROM authors WHERE id = ?')

        this.db.exec('BEGIN IMMEDIATE')
        try {
            for (const sourceId of sources) {
                const source = this.db
                    .prepare('SELECT id FROM authors WHERE id = ?')
                    .get(sourceId)
                if (!source)
                    throw new Error(`Unknown source author: ${sourceId}`)
                copyLinks.run(targetAuthorId, sourceId)
                moveComics.run(targetAuthorId, sourceId)
                moveAliases.run(targetAuthorId, sourceId)
                deleteLinks.run(sourceId)
                deleteAuthor.run(sourceId)
            }
            this.db
                .prepare(
                    `UPDATE authors SET canonical_name = COALESCE(?, canonical_name),
                     review_status = 'approved', confidence = 1,
                     evidence = evidence || '; manually approved merge',
                     updated_at = ? WHERE id = ?`
                )
                .run(canonicalName?.trim() || null, now, targetAuthorId)
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            throw error
        }
        return this.listAuthors().find((author) => author.id === targetAuthorId)
    }

    applyAuthorDictionary(
        entries: Array<{ canonicalName: string; aliases: string[] }>
    ) {
        let applied = 0
        let merged = 0
        for (const entry of entries) {
            const ids = [entry.canonicalName, ...(entry.aliases ?? [])]
                .map(normalizeAuthorKey)
                .flatMap((key) => {
                    const row = this.db
                        .prepare(
                            'SELECT author_id FROM author_aliases WHERE alias_key = ?'
                        )
                        .get(key) as SqlRow | undefined
                    return row ? [String(row.author_id)] : []
                })
            const uniqueIds = [...new Set(ids)]
            if (uniqueIds.length === 0) continue
            const [targetId, ...sourceIds] = uniqueIds
            if (sourceIds.length > 0) {
                this.mergeAuthors(targetId, sourceIds, entry.canonicalName)
                merged += sourceIds.length
            } else {
                this.setAuthorDecision(
                    targetId,
                    'approved',
                    entry.canonicalName
                )
            }
            applied += 1
        }
        return { entries: entries.length, applied, merged }
    }

    upsertEpisode(episode: {
        id: string
        comicId: string
        title: string
        order: number
        updatedAt?: string
    }) {
        const now = new Date().toISOString()
        this.db
            .prepare(
                `INSERT INTO episodes(
                    id, comic_id, title, order_no, updated_at_source,
                    first_seen_at, last_seen_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    order_no = excluded.order_no,
                    updated_at_source = excluded.updated_at_source,
                    last_seen_at = excluded.last_seen_at`
            )
            .run(
                episode.id,
                episode.comicId,
                episode.title,
                episode.order,
                episode.updatedAt ?? null,
                now,
                now
            )
    }

    upsertPicture(picture: {
        id: string
        comicId: string
        episodeId: string
        position: number
        originalName: string
        mediaPath: string
        fileServer: string
    }) {
        const now = new Date().toISOString()
        this.db
            .prepare(
                `INSERT INTO pictures(
                    id, comic_id, episode_id, position, original_name,
                    media_path, file_server, first_seen_at, last_seen_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    position = excluded.position,
                    original_name = excluded.original_name,
                    media_path = excluded.media_path,
                    file_server = excluded.file_server,
                    last_seen_at = excluded.last_seen_at`
            )
            .run(
                picture.id,
                picture.comicId,
                picture.episodeId,
                picture.position,
                picture.originalName,
                picture.mediaPath,
                picture.fileServer,
                now,
                now
            )
    }

    listEpisodes(comicId: string) {
        return (
            this.db
                .prepare(
                    `SELECT id, title, order_no, updated_at_source
                     FROM episodes WHERE comic_id = ? ORDER BY order_no`
                )
                .all(comicId) as SqlRow[]
        ).map((row) => ({
            id: String(row.id),
            title: String(row.title),
            order: numberValue(row.order_no),
            updatedAt: row.updated_at_source
                ? String(row.updated_at_source)
                : undefined
        }))
    }

    listPictureHealth() {
        return (
            this.db
                .prepare(
                    `SELECT p.id, p.comic_id, p.episode_id, p.local_path,
                            p.status, e.order_no
                     FROM pictures p
                     JOIN episodes e ON e.id = p.episode_id
                     ORDER BY p.comic_id, e.order_no, p.position`
                )
                .all() as SqlRow[]
        ).map((row) => ({
            pictureId: String(row.id),
            comicId: String(row.comic_id),
            episodeId: String(row.episode_id),
            episodeOrder: numberValue(row.order_no),
            localPath: row.local_path ? String(row.local_path) : null,
            status: String(row.status)
        }))
    }

    saveUpdateFinding(finding: UpdateFinding) {
        this.db
            .prepare(
                `INSERT INTO update_findings(
                    id, comic_id, old_episode_count, new_episode_count,
                    new_episode_ids_json, new_episode_orders_json,
                    metadata_changed, checked_at, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
                finding.id,
                finding.comicId,
                finding.oldEpisodeCount,
                finding.newEpisodeCount,
                JSON.stringify(finding.newEpisodeIds),
                JSON.stringify(finding.newEpisodeOrders),
                finding.metadataChanged ? 1 : 0,
                finding.checkedAt,
                finding.status
            )
    }

    pictureDownloadState(pictureId: string) {
        const row = this.db
            .prepare(
                `SELECT status, local_path, byte_size, sha256
                 FROM pictures WHERE id = ?`
            )
            .get(pictureId) as SqlRow | undefined
        if (!row) return null
        return {
            status: String(row.status),
            localPath: row.local_path ? String(row.local_path) : null,
            byteSize: numberValue(row.byte_size),
            sha256: row.sha256 ? String(row.sha256) : null
        }
    }

    markPictureDownloaded(
        pictureId: string,
        localPath: string,
        byteSize: number,
        sha256: string
    ) {
        const picture = this.db
            .prepare('SELECT comic_id FROM pictures WHERE id = ?')
            .get(pictureId) as SqlRow | undefined
        const observedAt = new Date().toISOString()
        this.db
            .prepare(
                `UPDATE pictures SET status = 'completed', local_path = ?,
                 byte_size = ?, sha256 = ?, last_seen_at = ? WHERE id = ?`
            )
            .run(localPath, byteSize, sha256, observedAt, pictureId)
        if (picture) {
            this.db
                .prepare(
                    `INSERT INTO comic_provenance(
                        comic_id, source, first_seen_at, last_seen_at
                    ) VALUES (?, 'download:completion', ?, ?)
                    ON CONFLICT(comic_id, source) DO UPDATE SET
                        last_seen_at = excluded.last_seen_at`
                )
                .run(String(picture.comic_id), observedAt, observedAt)
            this.db
                .prepare(
                    `INSERT INTO library_membership(
                        comic_id, reason, created_at, updated_at
                    ) VALUES (?, 'download', ?, ?)
                    ON CONFLICT(comic_id, reason) DO UPDATE SET
                        updated_at = excluded.updated_at`
                )
                .run(String(picture.comic_id), observedAt, observedAt)
        }
    }

    createDownloadJob(input: CreateDownloadJob): DownloadJob {
        const id = randomUUID()
        const now = new Date().toISOString()
        this.db
            .prepare(
                `INSERT INTO comics(
                    id, title, raw_author, categories_json, tags_json,
                    first_seen_at, last_seen_at
                ) VALUES (?, ?, '', '[]', '[]', ?, ?)
                ON CONFLICT(id) DO NOTHING`
            )
            .run(input.comicId, `Pending metadata [${input.comicId}]`, now, now)
        this.db
            .prepare(
                `INSERT INTO download_jobs(
                    id, comic_id, episode_selection_json, source, priority,
                    runner, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?)`
            )
            .run(
                id,
                input.comicId,
                JSON.stringify(input.episodeOrders ?? []),
                input.source ?? 'manual',
                input.priority ?? 0,
                input.runner ?? 'LOCAL',
                now
            )
        this.db
            .prepare(
                `INSERT INTO comic_provenance(
                    comic_id, source, first_seen_at, last_seen_at
                ) VALUES (?, ?, ?, ?)
                ON CONFLICT(comic_id, source) DO UPDATE SET
                    last_seen_at = excluded.last_seen_at`
            )
            .run(
                input.comicId,
                `download:enqueue:${input.source ?? 'manual'}`,
                now,
                now
            )
        return this.getDownloadJob(id)
    }

    getDownloadJob(id: string): DownloadJob {
        const row = this.db
            .prepare(`${downloadJobSelect} WHERE j.id = ?`)
            .get(id) as SqlRow | undefined
        if (!row) throw new Error(`Unknown download job: ${id}`)
        return downloadJob(row)
    }

    listDownloadJobs(status?: DownloadStatus): DownloadJob[] {
        const rows = status
            ? (this.db
                  .prepare(
                      `${downloadJobSelect} WHERE j.status = ?
                       ORDER BY j.priority DESC, j.created_at`
                  )
                  .all(status) as SqlRow[])
            : (this.db
                  .prepare(
                      `${downloadJobSelect}
                       ORDER BY j.created_at DESC`
                  )
                  .all() as SqlRow[])
        return rows.map(downloadJob)
    }

    nextDownloadJobs(limit: number, runner?: DownloadJob['runner']) {
        const rows = runner
            ? (this.db
                  .prepare(
                      `${downloadJobSelect}
                       WHERE j.status = 'QUEUED' AND j.runner = ?
                       ORDER BY j.priority DESC, j.created_at LIMIT ?`
                  )
                  .all(runner, Math.max(1, limit)) as SqlRow[])
            : (this.db
                  .prepare(
                      `${downloadJobSelect}
                       WHERE j.status = 'QUEUED'
                       ORDER BY j.priority DESC, j.created_at LIMIT ?`
                  )
                  .all(Math.max(1, limit)) as SqlRow[])
        return rows.map(downloadJob)
    }

    transitionDownloadJob(
        id: string,
        status: DownloadStatus,
        patch: DownloadJobPatch = {}
    ): DownloadJob {
        const current = this.getDownloadJob(id)
        assertTransition(current.status, status)
        const now = new Date().toISOString()
        const result = this.db
            .prepare(
                `UPDATE download_jobs SET
                    status = ?,
                    started_at = CASE
                        WHEN ? = 'RUNNING' THEN COALESCE(started_at, ?)
                        ELSE started_at END,
                    finished_at = CASE WHEN ? = 1 THEN ? ELSE NULL END,
                    retry_count = COALESCE(?, retry_count),
                    error = CASE WHEN ? = 1 THEN ? ELSE error END
                 WHERE id = ? AND status = ?`
            )
            .run(
                status,
                status,
                now,
                isTerminal(status) ? 1 : 0,
                now,
                patch.retryCount ?? null,
                Object.prototype.hasOwnProperty.call(patch, 'error') ? 1 : 0,
                patch.error ?? null,
                id,
                current.status
            )
        if (result.changes !== 1)
            throw new Error(`Download job changed concurrently: ${id}`)
        const updated = this.getDownloadJob(id)
        const eventType =
            status === 'RUNNING'
                ? 'download_start'
                : status === 'COMPLETED'
                  ? 'download_complete'
                  : status === 'CANCELLED'
                    ? 'download_cancel'
                    : status === 'FAILED'
                      ? 'download_failed'
                      : null
        if (eventType)
            this.recordUserEvent({
                eventType,
                comicId: updated.comicId,
                source: updated.source,
                metadata: { jobId: updated.id, retryCount: updated.retryCount }
            })
        return updated
    }

    retryDownloadJob(id: string): DownloadJob {
        const current = this.getDownloadJob(id)
        if (current.status !== 'FAILED')
            throw new Error(`Only failed jobs can be retried: ${id}`)
        return this.transitionDownloadJob(id, 'QUEUED', {
            retryCount: 0,
            error: null
        })
    }

    updateDownloadProgress(id: string, patch: DownloadJobPatch): DownloadJob {
        const current = this.getDownloadJob(id)
        this.db
            .prepare(
                `UPDATE download_jobs SET
                    progress_completed = ?, progress_total = ?, bytes = ?,
                    expected_bytes = ?, current_episode_title = ?,
                    progress_updated_at = ?
                 WHERE id = ?`
            )
            .run(
                patch.progressCompleted ?? current.progressCompleted,
                patch.progressTotal ?? current.progressTotal,
                patch.bytes ?? current.bytes,
                patch.expectedBytes ?? current.expectedBytes ?? null,
                patch.chapterTitle ?? current.chapterTitle ?? null,
                new Date().toISOString(),
                id
            )
        return this.getDownloadJob(id)
    }
}
