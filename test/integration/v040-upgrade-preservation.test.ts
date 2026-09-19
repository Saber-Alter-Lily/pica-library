import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import {
    latestMigrationVersion,
    migrations,
    runMigrations
} from '../../src/storage/sqlite/migrations'

const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')

const tempDirs: string[] = []

function databaseFile() {
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-v040-upgrade-')
    )
    tempDirs.push(directory)
    return path.join(directory, 'library.db')
}

afterEach(() => {
    for (const directory of tempDirs.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('public v0.4.0 to next-release database preservation', () => {
    it('migrates schema 9 through every additive migration without losing durable user state', () => {
        const file = databaseFile()
        const v040 = new DatabaseSync(file)
        runMigrations(
            v040,
            migrations.filter((migration) => migration.version <= 9)
        )

        const now = '2026-09-15T08:24:28.000Z'
        v040
            .prepare(`
                INSERT INTO authors(
                    id, canonical_name, normalized_key, confidence, evidence,
                    review_status, created_at, updated_at
                ) VALUES (?, ?, ?, 1, ?, 'approved', ?, ?)
            `)
            .run(
                'author-v040',
                'Public V040 Author',
                'public v040 author',
                'public-v0.4.0',
                now,
                now
            )
        v040
            .prepare(`
                INSERT INTO comics(
                    id, title, raw_author, canonical_author_id, description,
                    categories_json, tags_json, is_favorite, cover_url,
                    first_seen_at, last_seen_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            `)
            .run(
                'comic-v040',
                'Public V040 Comic',
                'Public V040 Author',
                'author-v040',
                'preserve description',
                '["category-v040"]',
                '["tag-v040"]',
                'https://example.invalid/v040-cover.jpg',
                now,
                now
            )
        v040
            .prepare(`
                INSERT INTO episodes(
                    id, comic_id, title, order_no, first_seen_at, last_seen_at
                ) VALUES (?, ?, ?, 1, ?, ?)
            `)
            .run(
                'episode-v040',
                'comic-v040',
                'Chapter 1',
                now,
                now
            )
        v040
            .prepare(`
                INSERT INTO pictures(
                    id, comic_id, episode_id, position, original_name,
                    media_path, file_server, local_path, byte_size, status,
                    first_seen_at, last_seen_at
                ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, 4096, 'completed', ?, ?)
            `)
            .run(
                'picture-v040',
                'comic-v040',
                'episode-v040',
                '001.jpg',
                '/media/001.jpg',
                'https://example.invalid',
                'Public V040 Author/Public V040 Comic/Chapter 1/001.jpg',
                now,
                now
            )
        v040
            .prepare(`
                INSERT INTO download_jobs(
                    id, comic_id, episode_selection_json, source, priority,
                    runner, status, created_at, finished_at,
                    progress_completed, progress_total, bytes
                ) VALUES (?, ?, '["episode-v040"]', 'v0.4.0', 7,
                          'LOCAL', 'COMPLETED', ?, ?, 1, 1, 4096)
            `)
            .run('download-v040', 'comic-v040', now, now)
        v040
            .prepare(`
                INSERT INTO comic_provenance(
                    comic_id, source, first_seen_at, last_seen_at
                ) VALUES (?, 'pica:favorites', ?, ?)
            `)
            .run('comic-v040', now, now)
        v040
            .prepare(`
                INSERT INTO shelves(
                    id, name, normalized_name, created_at, updated_at, sort_order
                ) VALUES ('shelf-v040', '保留书架', '保留书架', ?, ?, 3)
            `)
            .run(now, now)
        v040
            .prepare(`
                INSERT INTO shelf_items(
                    shelf_id, comic_id, added_at, position
                ) VALUES ('shelf-v040', 'comic-v040', ?, 2)
            `)
            .run(now)
        v040
            .prepare(`
                INSERT INTO reading_progress(
                    comic_id, episode_id, page_index, updated_at
                ) VALUES ('comic-v040', 'episode-v040', 17, ?)
            `)
            .run(now)
        v040
            .prepare(`
                INSERT INTO app_state(key, value_json, updated_at)
                VALUES ('theme.current', '{"theme":"v040-preserve"}', ?)
            `)
            .run(now)
        v040
            .prepare(`
                INSERT INTO user_events(
                    id, occurred_at, event_type, comic_id, source,
                    app_session_id, context_id, recommendation_cycle_id,
                    recommendation_session_id, recommendation_batch_index,
                    rank_position, metadata_json, dedupe_key, created_at
                ) VALUES (
                    'event-v040', ?, 'recommendation_like', 'comic-v040',
                    'recommendation', 'app-session-v040', 'context-v040',
                    'cycle-v040', 'session-v040', 0, 1,
                    '{"reason":"preserve"}', 'event-v040-dedupe', ?
                )
            `)
            .run(now, now)
        v040
            .prepare(`
                INSERT INTO recommendation_v3_profiles(
                    id, profile_kind, generated_at, evidence_cutoff,
                    model_version, profile_json
                ) VALUES (
                    'profile-v040', 'LIFETIME', ?, ?,
                    'v3/public-v040', '{"favoriteCount":1}'
                )
            `)
            .run(now, now)
        v040
            .prepare(`
                INSERT INTO recommendation_v3_candidate_pools(
                    id, app_session_id, recommendation_cycle_id, generated_at,
                    model_version, telemetry_json, candidate_ids_json
                ) VALUES (
                    'pool-v040', 'app-session-v040', 'cycle-v040', ?,
                    'v3/public-v040', '{"source":"public-v040"}',
                    '["comic-v040"]'
                )
            `)
            .run(now)
        v040
            .prepare(`
                INSERT INTO recommendation_v3_batches(
                    id, pool_id, recommendation_cycle_id,
                    recommendation_session_id, batch_index, context_id,
                    generated_at, item_ids_json, evidence_json
                ) VALUES (
                    'batch-v040', 'pool-v040', 'cycle-v040', 'session-v040',
                    0, 'context-v040', ?, '["comic-v040"]',
                    '{"source":"public-v040"}'
                )
            `)
            .run(now)
        v040
            .prepare(`
                INSERT INTO comic_provider_metadata(
                    comic_id, provider_id, provider_remote_id,
                    alternate_titles_json, completion_status, rating,
                    provider_metadata_json, first_seen_at, last_seen_at
                ) VALUES (
                    'comic-v040', 'pica', 'comic-v040',
                    '["Public V040 Alt"]', 'ONGOING', 4.5,
                    '{"preserve":true}', ?, ?
                )
            `)
            .run(now, now)

        expect(
            v040
                .prepare(
                    'SELECT MAX(version) AS version FROM schema_migrations'
                )
                .get()
        ).toMatchObject({ version: 9 })
        v040.close()

        const upgraded = new LibraryDatabase(file)
        expect(upgraded.getComic('comic-v040')).toMatchObject({
            comicId: 'comic-v040',
            title: 'Public V040 Comic',
            author: 'Public V040 Author',
            isFavorite: true,
            inLibrary: true
        })
        upgraded.close()

        const current = new DatabaseSync(file)
        expect(
            current
                .prepare(
                    'SELECT MAX(version) AS version FROM schema_migrations'
                )
                .get()
        ).toMatchObject({ version: latestMigrationVersion })
        expect(latestMigrationVersion).toBeGreaterThanOrEqual(13)

        expect(
            current
                .prepare(
                    'SELECT local_path, byte_size, status FROM pictures WHERE id = ?'
                )
                .get('picture-v040')
        ).toMatchObject({
            local_path:
                'Public V040 Author/Public V040 Comic/Chapter 1/001.jpg',
            byte_size: 4096,
            status: 'completed'
        })
        expect(
            current
                .prepare(
                    'SELECT status, priority, progress_completed, progress_total, bytes FROM download_jobs WHERE id = ?'
                )
                .get('download-v040')
        ).toMatchObject({
            status: 'COMPLETED',
            priority: 7,
            progress_completed: 1,
            progress_total: 1,
            bytes: 4096
        })
        expect(
            current
                .prepare(
                    'SELECT shelf_id, comic_id, position FROM shelf_items WHERE shelf_id = ?'
                )
                .get('shelf-v040')
        ).toMatchObject({
            shelf_id: 'shelf-v040',
            comic_id: 'comic-v040',
            position: 2
        })
        expect(
            current
                .prepare(
                    'SELECT page_index FROM reading_progress WHERE comic_id = ? AND episode_id = ?'
                )
                .get('comic-v040', 'episode-v040')
        ).toMatchObject({ page_index: 17 })
        expect(
            current
                .prepare('SELECT value_json FROM app_state WHERE key = ?')
                .get('theme.current')
        ).toMatchObject({ value_json: '{"theme":"v040-preserve"}' })
        expect(
            current
                .prepare(
                    'SELECT event_type, app_session_id, recommendation_cycle_id, metadata_json FROM user_events WHERE id = ?'
                )
                .get('event-v040')
        ).toMatchObject({
            event_type: 'recommendation_like',
            app_session_id: 'app-session-v040',
            recommendation_cycle_id: 'cycle-v040',
            metadata_json: '{"reason":"preserve"}'
        })
        expect(
            current
                .prepare(
                    'SELECT model_version, candidate_ids_json FROM recommendation_v3_candidate_pools WHERE id = ?'
                )
                .get('pool-v040')
        ).toMatchObject({
            model_version: 'v3/public-v040',
            candidate_ids_json: '["comic-v040"]'
        })
        expect(
            current
                .prepare(
                    'SELECT provider_id, provider_remote_id, alternate_titles_json, rating FROM comic_provider_metadata WHERE comic_id = ?'
                )
                .get('comic-v040')
        ).toMatchObject({
            provider_id: 'pica',
            provider_remote_id: 'comic-v040',
            alternate_titles_json: '["Public V040 Alt"]',
            rating: 4.5
        })

        for (const table of [
            'visual_embeddings',
            'canonical_series',
            'canonical_works',
            'work_editions',
            'work_upload_bindings',
            'work_identity_evidence',
            'work_identity_decisions',
            'work_identity_materialization_runs'
        ])
            expect(
                current
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
                    )
                    .get(table)
            ).toBeTruthy()

        expect(
            current
                .prepare('SELECT COUNT(*) AS count FROM visual_embeddings')
                .get()
        ).toMatchObject({ count: 0 })
        expect(
            current
                .prepare('SELECT COUNT(*) AS count FROM work_upload_bindings')
                .get()
        ).toMatchObject({ count: 0 })
        current.close()

        const backup = `${file}.pre-migration-v${latestMigrationVersion}.bak`
        expect(fs.existsSync(backup)).toBe(true)
        const previous = new DatabaseSync(backup)
        expect(
            previous
                .prepare(
                    'SELECT MAX(version) AS version FROM schema_migrations'
                )
                .get()
        ).toMatchObject({ version: 9 })
        expect(
            previous
                .prepare('SELECT title FROM comics WHERE id = ?')
                .get('comic-v040')
        ).toMatchObject({ title: 'Public V040 Comic' })
        expect(
            previous
                .prepare('SELECT page_index FROM reading_progress WHERE comic_id = ?')
                .get('comic-v040')
        ).toMatchObject({ page_index: 17 })
        previous.close()
    })
})
