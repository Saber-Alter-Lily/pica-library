import type { DatabaseSync } from 'node:sqlite'

export interface Migration {
    version: number
    name: string
    up: string
    after?: (database: DatabaseSync) => void
}

function ensureColumn(
    database: DatabaseSync,
    table: string,
    definition: string
) {
    const column = definition.trim().split(/\s+/, 1)[0]
    const columns = database
        .prepare(`PRAGMA table_info(${table})`)
        .all() as Array<{
        name: string
    }>
    if (!columns.some((item) => item.name === column))
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
}

export const migrations: Migration[] = [
    {
        version: 1,
        name: 'canonical_library',
        up: `
            CREATE TABLE IF NOT EXISTS authors (
                id TEXT PRIMARY KEY,
                canonical_name TEXT NOT NULL,
                normalized_key TEXT NOT NULL UNIQUE,
                confidence REAL NOT NULL DEFAULT 1,
                evidence TEXT NOT NULL DEFAULT '',
                review_status TEXT NOT NULL DEFAULT 'approved',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS author_aliases (
                alias_key TEXT PRIMARY KEY,
                alias_display TEXT NOT NULL,
                author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
                source TEXT NOT NULL,
                evidence TEXT NOT NULL DEFAULT '',
                confidence REAL NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS comics (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                raw_author TEXT NOT NULL DEFAULT '',
                circle TEXT,
                author_candidate TEXT,
                canonical_author_id TEXT REFERENCES authors(id),
                description TEXT NOT NULL DEFAULT '',
                chinese_team TEXT NOT NULL DEFAULT '',
                categories_json TEXT NOT NULL DEFAULT '[]',
                tags_json TEXT NOT NULL DEFAULT '[]',
                finished INTEGER NOT NULL DEFAULT 0,
                created_at_source TEXT,
                updated_at_source TEXT,
                total_likes INTEGER NOT NULL DEFAULT 0,
                total_views INTEGER NOT NULL DEFAULT 0,
                pages_count INTEGER NOT NULL DEFAULT 0,
                eps_count INTEGER NOT NULL DEFAULT 0,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS comic_authors (
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
                raw_value TEXT NOT NULL,
                circle TEXT,
                role TEXT NOT NULL DEFAULT 'creator',
                is_primary INTEGER NOT NULL DEFAULT 1,
                confidence REAL NOT NULL DEFAULT 1,
                needs_review INTEGER NOT NULL DEFAULT 0,
                evidence TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (comic_id, author_id, raw_value)
            );
            CREATE TABLE IF NOT EXISTS episodes (
                id TEXT PRIMARY KEY,
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                order_no INTEGER NOT NULL,
                updated_at_source TEXT,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS pictures (
                id TEXT PRIMARY KEY,
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                original_name TEXT NOT NULL,
                media_path TEXT NOT NULL,
                file_server TEXT NOT NULL,
                local_path TEXT,
                byte_size INTEGER,
                sha256 TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                error TEXT,
                retry_count INTEGER NOT NULL DEFAULT 0,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sync_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                item_count INTEGER NOT NULL DEFAULT 0,
                error TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_comics_favorite ON comics(is_favorite);
            CREATE INDEX IF NOT EXISTS idx_comics_author ON comics(canonical_author_id);
            CREATE INDEX IF NOT EXISTS idx_episodes_comic ON episodes(comic_id, order_no);
            CREATE INDEX IF NOT EXISTS idx_pictures_episode ON pictures(episode_id, position);
        `,
        after(database) {
            ensureColumn(database, 'pictures', 'error TEXT')
            ensureColumn(
                database,
                'pictures',
                'retry_count INTEGER NOT NULL DEFAULT 0'
            )
        }
    },
    {
        version: 2,
        name: 'lifecycle_state',
        up: `
            CREATE TABLE IF NOT EXISTS favorite_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                captured_at TEXT NOT NULL,
                source TEXT NOT NULL,
                comic_ids_json TEXT NOT NULL,
                item_count INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS download_jobs (
                id TEXT PRIMARY KEY,
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                episode_selection_json TEXT NOT NULL DEFAULT '[]',
                source TEXT NOT NULL,
                priority INTEGER NOT NULL DEFAULT 0,
                runner TEXT NOT NULL DEFAULT 'LOCAL',
                status TEXT NOT NULL DEFAULT 'DRAFT',
                created_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                retry_count INTEGER NOT NULL DEFAULT 0,
                progress_completed INTEGER NOT NULL DEFAULT 0,
                progress_total INTEGER NOT NULL DEFAULT 0,
                bytes INTEGER NOT NULL DEFAULT 0,
                error TEXT
            );
            CREATE TABLE IF NOT EXISTS download_items (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL REFERENCES download_jobs(id) ON DELETE CASCADE,
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                episode_id TEXT,
                picture_id TEXT,
                status TEXT NOT NULL DEFAULT 'QUEUED',
                retry_count INTEGER NOT NULL DEFAULT 0,
                bytes INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                created_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT
            );
            CREATE TABLE IF NOT EXISTS update_findings (
                id TEXT PRIMARY KEY,
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                old_episode_count INTEGER NOT NULL,
                new_episode_count INTEGER NOT NULL,
                new_episode_ids_json TEXT NOT NULL DEFAULT '[]',
                new_episode_orders_json TEXT NOT NULL DEFAULT '[]',
                metadata_changed INTEGER NOT NULL DEFAULT 0,
                checked_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'OPEN'
            );
            CREATE TABLE IF NOT EXISTS recommendation_profiles (
                id TEXT PRIMARY KEY,
                generated_at TEXT NOT NULL,
                favorite_count INTEGER NOT NULL,
                profile_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS recommendation_results (
                profile_id TEXT NOT NULL REFERENCES recommendation_profiles(id) ON DELETE CASCADE,
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                rank_no INTEGER NOT NULL,
                score REAL NOT NULL,
                reasons_json TEXT NOT NULL,
                PRIMARY KEY (profile_id, comic_id)
            );
            CREATE INDEX IF NOT EXISTS idx_download_jobs_status
                ON download_jobs(status, priority DESC, created_at);
            CREATE INDEX IF NOT EXISTS idx_download_items_job
                ON download_items(job_id, status);
            CREATE INDEX IF NOT EXISTS idx_update_findings_comic
                ON update_findings(comic_id, checked_at DESC);
        `
    },
    {
        version: 3,
        name: 'comic_cover_reference',
        up: '',
        after(database) {
            ensureColumn(database, 'comics', 'cover_url TEXT')
        }
    },
    {
        version: 4,
        name: 'library_provenance_and_download_observability',
        up: `
            CREATE TABLE IF NOT EXISTS comic_provenance (
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                source TEXT NOT NULL,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                PRIMARY KEY (comic_id, source)
            );
            CREATE INDEX IF NOT EXISTS idx_comic_provenance_source
                ON comic_provenance(source, comic_id);
            CREATE INDEX IF NOT EXISTS idx_pictures_downloaded
                ON pictures(status, comic_id);
        `,
        after(database) {
            ensureColumn(database, 'download_jobs', 'expected_bytes INTEGER')
            ensureColumn(
                database,
                'download_jobs',
                'current_episode_title TEXT'
            )
            ensureColumn(database, 'download_jobs', 'progress_updated_at TEXT')
            database.exec(`
                INSERT OR IGNORE INTO comic_provenance(
                    comic_id, source, first_seen_at, last_seen_at
                )
                SELECT id, 'legacy/unknown', first_seen_at, last_seen_at
                FROM comics
            `)
        }
    },
    {
        version: 5,
        name: 'v020_local_product_state',
        up: `
            CREATE TABLE IF NOT EXISTS shelves (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                normalized_name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS shelf_items (
                shelf_id TEXT NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                added_at TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (shelf_id, comic_id)
            );
            CREATE TABLE IF NOT EXISTS reading_progress (
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
                page_index INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (comic_id, episode_id)
            );
            CREATE TABLE IF NOT EXISTS recommendation_sessions (
                id TEXT PRIMARY KEY,
                cycle_id TEXT NOT NULL,
                session_no INTEGER NOT NULL,
                generated_at TEXT NOT NULL,
                result_ids_json TEXT NOT NULL DEFAULT '[]',
                exhausted INTEGER NOT NULL DEFAULT 0,
                UNIQUE (cycle_id, session_no)
            );
            CREATE TABLE IF NOT EXISTS recommendation_seen (
                cycle_id TEXT NOT NULL,
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                first_seen_at TEXT NOT NULL,
                PRIMARY KEY (cycle_id, comic_id)
            );
            CREATE INDEX IF NOT EXISTS idx_shelf_items_comic
                ON shelf_items(comic_id, shelf_id);
            CREATE INDEX IF NOT EXISTS idx_shelf_items_order
                ON shelf_items(shelf_id, position, added_at);
            CREATE INDEX IF NOT EXISTS idx_reading_progress_updated
                ON reading_progress(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_recommendation_seen_cycle
                ON recommendation_seen(cycle_id, first_seen_at);
        `
    },
    {
        version: 6,
        name: 'v020_application_state',
        up: `
            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        `
    },
    {
        version: 7,
        name: 'v020_fast_sync_and_library_membership',
        up: `
            CREATE TABLE IF NOT EXISTS library_membership (
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                reason TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (comic_id, reason)
            );
            CREATE INDEX IF NOT EXISTS idx_library_membership_reason
                ON library_membership(reason, comic_id);
            CREATE TABLE IF NOT EXISTS favorites_sync_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                last_full_sync_at TEXT,
                last_quick_sync_at TEXT,
                previous_remote_count INTEGER NOT NULL DEFAULT 0,
                last_head_ids_json TEXT NOT NULL DEFAULT '[]',
                last_head_fingerprint TEXT NOT NULL DEFAULT '',
                last_known_page_size INTEGER NOT NULL DEFAULT 0,
                last_full_reconcile_count INTEGER NOT NULL DEFAULT 0
            );
            INSERT OR IGNORE INTO favorites_sync_state(id) VALUES (1);
            UPDATE favorites_sync_state SET
                last_full_sync_at = COALESCE(
                    (SELECT finished_at FROM sync_runs
                     WHERE status = 'completed' AND source LIKE 'pica:favorites%'
                     ORDER BY finished_at DESC LIMIT 1),
                    last_full_sync_at
                ),
                previous_remote_count = (
                    SELECT COUNT(*) FROM comics WHERE is_favorite = 1
                ),
                last_full_reconcile_count = (
                    SELECT COUNT(*) FROM comics WHERE is_favorite = 1
                );

            INSERT OR IGNORE INTO library_membership(
                comic_id, reason, created_at, updated_at
            )
            SELECT id, 'pica-favorite', first_seen_at, last_seen_at
            FROM comics WHERE is_favorite = 1;

            INSERT OR IGNORE INTO library_membership(
                comic_id, reason, created_at, updated_at
            )
            SELECT DISTINCT comic_id, 'shelf', added_at, added_at
            FROM shelf_items;

            INSERT OR IGNORE INTO library_membership(
                comic_id, reason, created_at, updated_at
            )
            SELECT DISTINCT comic_id, 'download', first_seen_at, last_seen_at
            FROM pictures
            WHERE status = 'completed' AND local_path IS NOT NULL;

            INSERT OR IGNORE INTO library_membership(
                comic_id, reason, created_at, updated_at
            )
            SELECT DISTINCT comic_id, 'explicit-import', first_seen_at, last_seen_at
            FROM comic_provenance
            WHERE source LIKE '%import%'
               OR source LIKE '%csv%'
               OR source LIKE '%bundle%'
               OR source = 'legacy/unknown';
        `
    },
    {
        version: 8,
        name: 'recommendation_v3_additive',
        up: `
            CREATE TABLE IF NOT EXISTS user_events (
                id TEXT PRIMARY KEY,
                occurred_at TEXT NOT NULL,
                event_type TEXT NOT NULL,
                comic_id TEXT,
                source TEXT,
                app_session_id TEXT,
                context_id TEXT,
                recommendation_cycle_id TEXT,
                recommendation_session_id TEXT,
                recommendation_batch_index INTEGER,
                rank_position INTEGER,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                dedupe_key TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(event_type, dedupe_key)
            );
            CREATE INDEX IF NOT EXISTS idx_user_events_time ON user_events(occurred_at);
            CREATE INDEX IF NOT EXISTS idx_user_events_type_time ON user_events(event_type, occurred_at);
            CREATE INDEX IF NOT EXISTS idx_user_events_comic_time ON user_events(comic_id, occurred_at);
            CREATE INDEX IF NOT EXISTS idx_user_events_context ON user_events(context_id, recommendation_cycle_id);

            CREATE TABLE IF NOT EXISTS recommendation_item_edges (
                source_comic_id TEXT NOT NULL,
                target_comic_id TEXT NOT NULL,
                edge_type TEXT NOT NULL,
                first_observed_at TEXT NOT NULL,
                last_observed_at TEXT NOT NULL,
                observation_count INTEGER NOT NULL DEFAULT 1,
                confidence REAL NOT NULL DEFAULT 0,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                PRIMARY KEY (source_comic_id, target_comic_id, edge_type)
            );
            CREATE INDEX IF NOT EXISTS idx_recommendation_edges_source ON recommendation_item_edges(source_comic_id, edge_type);
            CREATE INDEX IF NOT EXISTS idx_recommendation_edges_target ON recommendation_item_edges(target_comic_id, edge_type);

            CREATE TABLE IF NOT EXISTS recommendation_v3_profiles (
                id TEXT PRIMARY KEY,
                profile_kind TEXT NOT NULL,
                generated_at TEXT NOT NULL,
                evidence_cutoff TEXT NOT NULL,
                model_version TEXT NOT NULL,
                profile_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_recommendation_v3_profiles_kind ON recommendation_v3_profiles(profile_kind, generated_at);

            CREATE TABLE IF NOT EXISTS recommendation_v3_candidate_pools (
                id TEXT PRIMARY KEY,
                app_session_id TEXT,
                recommendation_cycle_id TEXT,
                generated_at TEXT NOT NULL,
                expires_at TEXT,
                model_version TEXT NOT NULL,
                telemetry_json TEXT NOT NULL DEFAULT '{}',
                candidate_ids_json TEXT NOT NULL DEFAULT '[]'
            );

            CREATE TABLE IF NOT EXISTS recommendation_v3_batches (
                id TEXT PRIMARY KEY,
                pool_id TEXT NOT NULL REFERENCES recommendation_v3_candidate_pools(id) ON DELETE CASCADE,
                recommendation_cycle_id TEXT NOT NULL,
                recommendation_session_id TEXT,
                batch_index INTEGER NOT NULL,
                context_id TEXT NOT NULL,
                generated_at TEXT NOT NULL,
                item_ids_json TEXT NOT NULL DEFAULT '[]',
                evidence_json TEXT NOT NULL DEFAULT '{}',
                UNIQUE(pool_id, batch_index)
            );
            CREATE INDEX IF NOT EXISTS idx_recommendation_v3_batches_cycle ON recommendation_v3_batches(recommendation_cycle_id, batch_index);
        `
    },
    {
        version: 9,
        name: 'provider_identity_metadata',
        up: `
            CREATE TABLE IF NOT EXISTS comic_provider_metadata (
                comic_id TEXT PRIMARY KEY REFERENCES comics(id) ON DELETE CASCADE,
                provider_id TEXT NOT NULL,
                provider_remote_id TEXT NOT NULL,
                alternate_titles_json TEXT NOT NULL DEFAULT '[]',
                completion_status TEXT NOT NULL DEFAULT 'UNKNOWN',
                rating REAL,
                provider_metadata_json TEXT NOT NULL DEFAULT '{}',
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_comic_provider_identity
                ON comic_provider_metadata(provider_id, provider_remote_id);
            INSERT OR IGNORE INTO comic_provider_metadata(
                comic_id, provider_id, provider_remote_id,
                alternate_titles_json, completion_status,
                provider_metadata_json, first_seen_at, last_seen_at
            )
            SELECT id, 'pica', id, '[]',
                   CASE WHEN finished = 1 THEN 'FINISHED' ELSE 'ONGOING' END,
                   '{}', first_seen_at, last_seen_at
            FROM comics;
        `
    },
    {
        version: 10,
        name: 'recommendation_v4_visual_style',
        up: `
            CREATE TABLE IF NOT EXISTS visual_embeddings (
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                model_id TEXT NOT NULL,
                model_version TEXT NOT NULL,
                sampling_policy_version TEXT NOT NULL,
                embedding_kind TEXT NOT NULL CHECK (embedding_kind IN ('body','cover')),
                vector_json TEXT NOT NULL,
                dimension INTEGER NOT NULL,
                source_kind TEXT NOT NULL CHECK (source_kind IN ('LOCAL_PAGES','REMOTE_PAGES','COVER_ONLY')),
                sample_count INTEGER NOT NULL DEFAULT 1,
                confidence REAL NOT NULL DEFAULT 0,
                generated_at TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                PRIMARY KEY (comic_id, model_id, model_version, sampling_policy_version, embedding_kind)
            );
            CREATE INDEX IF NOT EXISTS idx_visual_embeddings_model
                ON visual_embeddings(model_id, model_version, embedding_kind, generated_at);
            CREATE INDEX IF NOT EXISTS idx_visual_embeddings_comic
                ON visual_embeddings(comic_id, embedding_kind);
        `
    },
    {
        version: 11,
        name: 'download_queue_scale_indexes',
        up: `
            CREATE INDEX IF NOT EXISTS idx_download_jobs_status_runner_priority_created
                ON download_jobs(status, runner, priority DESC, created_at);
            CREATE INDEX IF NOT EXISTS idx_download_jobs_status_created
                ON download_jobs(status, created_at DESC);
        `
    }
    ,
    {
        version: 12,
        name: 'canonical_work_identity_foundation',
        up: `
            CREATE TABLE IF NOT EXISTS canonical_series (
                id TEXT PRIMARY KEY,
                preferred_title TEXT NOT NULL DEFAULT '',
                normalized_title TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'CANDIDATE'
                    CHECK (status IN ('CANDIDATE','CONFIRMED','REJECTED')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS canonical_works (
                id TEXT PRIMARY KEY,
                series_id TEXT REFERENCES canonical_series(id)
                    ON DELETE SET NULL,
                preferred_title TEXT NOT NULL,
                normalized_title TEXT NOT NULL,
                canonical_author_key TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'CANDIDATE'
                    CHECK (status IN ('CANDIDATE','CONFIRMED','REJECTED')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_canonical_works_identity
                ON canonical_works(normalized_title, canonical_author_key);

            CREATE TABLE IF NOT EXISTS work_editions (
                id TEXT PRIMARY KEY,
                work_id TEXT NOT NULL REFERENCES canonical_works(id)
                    ON DELETE CASCADE,
                language TEXT,
                edition_kind TEXT NOT NULL DEFAULT 'UNKNOWN',
                label TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_work_editions_work
                ON work_editions(work_id, language, edition_kind);

            CREATE TABLE IF NOT EXISTS work_upload_bindings (
                comic_id TEXT PRIMARY KEY REFERENCES comics(id)
                    ON DELETE CASCADE,
                work_id TEXT NOT NULL REFERENCES canonical_works(id)
                    ON DELETE CASCADE,
                edition_id TEXT REFERENCES work_editions(id)
                    ON DELETE SET NULL,
                binding_status TEXT NOT NULL
                    CHECK (
                        binding_status IN (
                            'AUTO_HIGH_CONFIDENCE',
                            'MANUAL_CONFIRMED',
                            'REVIEW_REQUIRED'
                        )
                    ),
                confidence REAL NOT NULL DEFAULT 0,
                resolver_version TEXT NOT NULL,
                evidence_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_work_upload_bindings_work
                ON work_upload_bindings(work_id, binding_status);

            CREATE TABLE IF NOT EXISTS work_identity_evidence (
                id TEXT PRIMARY KEY,
                left_comic_id TEXT NOT NULL REFERENCES comics(id)
                    ON DELETE CASCADE,
                right_comic_id TEXT NOT NULL REFERENCES comics(id)
                    ON DELETE CASCADE,
                relation TEXT NOT NULL
                    CHECK (
                        relation IN (
                            'PROBABLE_SAME_WORK',
                            'EDITION_VARIANT',
                            'RELATED_WORK',
                            'DISTINCT'
                        )
                    ),
                confidence REAL NOT NULL DEFAULT 0,
                resolver_version TEXT NOT NULL,
                evidence_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                UNIQUE(left_comic_id, right_comic_id, resolver_version)
            );
            CREATE INDEX IF NOT EXISTS idx_work_identity_evidence_pair
                ON work_identity_evidence(left_comic_id, right_comic_id);
            CREATE INDEX IF NOT EXISTS idx_work_identity_evidence_relation
                ON work_identity_evidence(relation, confidence DESC);

            CREATE TABLE IF NOT EXISTS work_identity_decisions (
                id TEXT PRIMARY KEY,
                left_comic_id TEXT NOT NULL REFERENCES comics(id)
                    ON DELETE CASCADE,
                right_comic_id TEXT NOT NULL REFERENCES comics(id)
                    ON DELETE CASCADE,
                decision TEXT NOT NULL
                    CHECK (
                        decision IN (
                            'SAME_WORK',
                            'EDITION_VARIANT',
                            'KEEP_SEPARATE'
                        )
                    ),
                source TEXT NOT NULL DEFAULT 'USER',
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(left_comic_id, right_comic_id)
            );
            CREATE INDEX IF NOT EXISTS idx_work_identity_decisions_pair
                ON work_identity_decisions(left_comic_id, right_comic_id);
        `
    },
    {
        version: 13,
        name: 'work_identity_materialization_audit',
        up: `
            CREATE TABLE IF NOT EXISTS work_identity_materialization_runs (
                id TEXT PRIMARY KEY,
                request_key TEXT NOT NULL UNIQUE,
                plan_version TEXT NOT NULL,
                plan_digest TEXT NOT NULL,
                status TEXT NOT NULL
                    CHECK (
                        status IN (
                            'PREPARED',
                            'APPLIED',
                            'ROLLED_BACK',
                            'FAILED'
                        )
                    ),
                plan_json TEXT NOT NULL,
                before_state_json TEXT NOT NULL DEFAULT '{}',
                after_state_json TEXT NOT NULL DEFAULT '{}',
                error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_work_identity_materialization_status
                ON work_identity_materialization_runs(status, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_work_identity_materialization_digest
                ON work_identity_materialization_runs(plan_digest);
        `
    },
    {
        version: 14,
        name: 'p2d2_author_reverse_lookup_indexes',
        up: `
            CREATE INDEX IF NOT EXISTS idx_author_aliases_author_display
                ON author_aliases(author_id, alias_display);
            CREATE INDEX IF NOT EXISTS idx_comic_authors_author_circle
                ON comic_authors(author_id, circle);
        `
    }
,
    {
        version: 15,
        name: 'p2d5b_work_identity_detail_indexes',
        up: `
            CREATE INDEX IF NOT EXISTS idx_work_identity_decisions_right
                ON work_identity_decisions(right_comic_id, left_comic_id);
            CREATE INDEX IF NOT EXISTS idx_work_identity_evidence_left_probable
                ON work_identity_evidence(
                    left_comic_id, relation, confidence DESC, right_comic_id
                );
            CREATE INDEX IF NOT EXISTS idx_work_identity_evidence_right_probable
                ON work_identity_evidence(
                    right_comic_id, relation, confidence DESC, left_comic_id
                );
        `
    }
]

export const latestMigrationVersion = Math.max(
    0,
    ...migrations.map((migration) => migration.version)
)

export function runMigrations(
    database: DatabaseSync,
    available: Migration[] = migrations
) {
    database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        applied_at TEXT NOT NULL
    )`)
    const columns = database
        .prepare('PRAGMA table_info(schema_migrations)')
        .all() as Array<{
        name: string
    }>
    if (!columns.some((column) => column.name === 'name'))
        database.exec(
            "ALTER TABLE schema_migrations ADD COLUMN name TEXT NOT NULL DEFAULT ''"
        )
    const applied = new Set(
        (
            database
                .prepare('SELECT version FROM schema_migrations')
                .all() as Array<{
                version: number
            }>
        ).map((row) => Number(row.version))
    )
    for (const migration of [...available].sort(
        (a, b) => a.version - b.version
    )) {
        if (applied.has(migration.version)) continue
        database.exec('BEGIN IMMEDIATE')
        try {
            database.exec(migration.up)
            migration.after?.(database)
            database
                .prepare(
                    'INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)'
                )
                .run(
                    migration.version,
                    migration.name,
                    new Date().toISOString()
                )
            database.exec('COMMIT')
        } catch (error) {
            database.exec('ROLLBACK')
            throw new Error(
                `Migration ${migration.version} (${migration.name}) failed: ${String(error)}`
            )
        }
    }
}
