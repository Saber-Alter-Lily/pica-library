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
    }
]

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
