import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import { LibraryDatabase } from '../../src/library/database'
import { migrations, runMigrations } from '../../src/storage/sqlite/migrations'

const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')
const tempDirs: string[] = []

function file() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-migration-'))
    tempDirs.push(dir)
    return path.join(dir, 'library.db')
}

afterEach(() => {
    tempDirs
        .splice(0)
        .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }))
})

describe('SQLite migrations', () => {
    it('creates a fresh database at the latest version', () => {
        const databaseFile = file()
        const library = new LibraryDatabase(databaseFile)
        library.close()
        const database = new DatabaseSync(databaseFile)
        const versions = database
            .prepare('SELECT version FROM schema_migrations ORDER BY version')
            .all() as Array<{ version: number }>
        expect(versions.map((row) => row.version)).toEqual([
            1, 2, 3, 4, 5, 6, 7
        ])
        expect(
            database
                .prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='download_jobs'"
                )
                .get()
        ).toBeTruthy()
        expect(
            database
                .prepare('PRAGMA table_info(comics)')
                .all()
                .some((column) =>
                    Object.values(column as Record<string, unknown>).includes(
                        'cover_url'
                    )
                )
        ).toBe(true)
        database.close()
    })

    it('upgrades a legacy unversioned database without deleting data', () => {
        const databaseFile = file()
        const database: DatabaseSyncType = new DatabaseSync(databaseFile)
        database.exec(`
            CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
            CREATE TABLE pictures(
                id TEXT PRIMARY KEY, comic_id TEXT, episode_id TEXT, position INTEGER,
                original_name TEXT, media_path TEXT, file_server TEXT, local_path TEXT,
                byte_size INTEGER, sha256 TEXT, status TEXT, first_seen_at TEXT, last_seen_at TEXT
            );
        `)
        runMigrations(database)
        const columns = database
            .prepare('PRAGMA table_info(pictures)')
            .all() as Array<{
            name: string
        }>
        expect(columns.map((column) => column.name)).toContain('retry_count')
        expect(
            database
                .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
                .get()
        ).toMatchObject({ count: 7 })
        database.close()
    })

    it('rolls back a failed migration and does not record its version', () => {
        const database = new DatabaseSync(file())
        expect(() =>
            runMigrations(database, [
                ...migrations,
                {
                    version: 8,
                    name: 'broken',
                    up: 'CREATE TABLE transient(value TEXT); INVALID SQL;'
                }
            ])
        ).toThrow(/Migration 8/)
        expect(
            database
                .prepare(
                    "SELECT name FROM sqlite_master WHERE name='transient'"
                )
                .get()
        ).toBeUndefined()
        expect(
            database
                .prepare(
                    'SELECT version FROM schema_migrations WHERE version = 8'
                )
                .get()
        ).toBeUndefined()
        database.close()
    })

    it('backs up an older database before applying a newer schema', () => {
        const databaseFile = file()
        const legacy = new DatabaseSync(databaseFile)
        runMigrations(
            legacy,
            migrations.filter((item) => item.version <= 4)
        )
        legacy.close()

        const library = new LibraryDatabase(databaseFile)
        library.close()

        const backup = `${databaseFile}.pre-migration-v7.bak`
        expect(fs.existsSync(backup)).toBe(true)
        const backedUp = new DatabaseSync(backup)
        expect(
            backedUp
                .prepare(
                    'SELECT MAX(version) AS version FROM schema_migrations'
                )
                .get()
        ).toMatchObject({ version: 4 })
        expect(
            backedUp
                .prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='shelves'"
                )
                .get()
        ).toBeUndefined()
        backedUp.close()
    })

    it('migrates a dev.1 catalog without deleting cache and derives durable membership', () => {
        const databaseFile = file()
        const dev1 = new DatabaseSync(databaseFile)
        runMigrations(
            dev1,
            migrations.filter((item) => item.version <= 6)
        )
        const insert = dev1.prepare(`
            INSERT INTO comics(
                id, title, raw_author, categories_json, tags_json,
                is_favorite, first_seen_at, last_seen_at
            ) VALUES (?, ?, 'Author', '[]', '[]', ?, ?, ?)
        `)
        const provenance = dev1.prepare(`
            INSERT INTO comic_provenance(
                comic_id, source, first_seen_at, last_seen_at
            ) VALUES (?, ?, ?, ?)
        `)
        const now = new Date().toISOString()
        for (let index = 0; index < 1773; index++) {
            const id = `favorite-${index}`
            insert.run(id, id, 1, now, now)
            provenance.run(id, 'pica:favorites', now, now)
        }
        for (let index = 0; index < 187; index++) {
            const id = `cache-${index}`
            insert.run(id, id, 0, now, now)
            provenance.run(id, 'pica:recommendations', now, now)
        }
        dev1.close()

        const migrated = new LibraryDatabase(databaseFile)
        expect(migrated.summary()).toMatchObject({
            comics: 1773,
            favorites: 1773,
            catalogComics: 1960
        })
        expect(migrated.getComic('cache-0')).toMatchObject({
            inLibrary: false
        })
        migrated.close()
    })

    it('upgrades public v0.1.3-style state to v0.2.0 without data loss', () => {
        const databaseFile = file()
        const legacy = new DatabaseSync(databaseFile)
        runMigrations(
            legacy,
            migrations.filter((item) => item.version <= 3)
        )
        const now = '2026-08-13T00:00:00.000Z'
        legacy
            .prepare(
                `INSERT INTO authors(
                    id, canonical_name, normalized_key, confidence, evidence,
                    review_status, created_at, updated_at
                ) VALUES (?, ?, ?, 1, ?, 'approved', ?, ?)`
            )
            .run(
                'author-v013',
                'Legacy Author',
                'legacy author',
                'verified',
                now,
                now
            )
        legacy
            .prepare(
                `INSERT INTO comics(
                    id, title, raw_author, canonical_author_id, description,
                    categories_json, tags_json, is_favorite,
                    first_seen_at, last_seen_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
            )
            .run(
                'comic-v013',
                'Legacy Comic',
                'Legacy Author',
                'author-v013',
                'preserve me',
                '["legacy-category"]',
                '["legacy-tag"]',
                now,
                now
            )
        legacy
            .prepare(
                `INSERT INTO episodes(
                    id, comic_id, title, order_no, first_seen_at, last_seen_at
                ) VALUES (?, ?, ?, 1, ?, ?)`
            )
            .run('episode-v013', 'comic-v013', 'Chapter 1', now, now)
        legacy
            .prepare(
                `INSERT INTO pictures(
                    id, comic_id, episode_id, position, original_name,
                    media_path, file_server, local_path, byte_size, status,
                    first_seen_at, last_seen_at
                ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, 321, 'completed', ?, ?)`
            )
            .run(
                'picture-v013',
                'comic-v013',
                'episode-v013',
                '001.jpg',
                '/media/001.jpg',
                'https://example.invalid',
                'Legacy Author/Legacy Comic/Chapter 1/001.jpg',
                now,
                now
            )
        legacy
            .prepare(
                `INSERT INTO download_jobs(
                    id, comic_id, episode_selection_json, source, priority,
                    runner, status, created_at, finished_at,
                    progress_completed, progress_total, bytes
                ) VALUES (?, ?, ?, ?, 0, 'LOCAL', 'COMPLETED', ?, ?, 1, 1, 321)`
            )
            .run(
                'job-v013',
                'comic-v013',
                '["episode-v013"]',
                'v0.1.3',
                now,
                now
            )
        legacy.close()

        const upgraded = new LibraryDatabase(databaseFile)
        expect(upgraded.getComic('comic-v013')).toMatchObject({
            comicId: 'comic-v013',
            title: 'Legacy Comic',
            author: 'Legacy Author',
            isFavorite: true,
            inLibrary: true
        })
        upgraded.close()

        const verified = new DatabaseSync(databaseFile)
        expect(
            verified
                .prepare('SELECT canonical_name FROM authors WHERE id = ?')
                .get('author-v013')
        ).toMatchObject({ canonical_name: 'Legacy Author' })
        expect(
            verified
                .prepare(
                    'SELECT local_path, byte_size, status FROM pictures WHERE id = ?'
                )
                .get('picture-v013')
        ).toMatchObject({
            local_path: 'Legacy Author/Legacy Comic/Chapter 1/001.jpg',
            byte_size: 321,
            status: 'completed'
        })
        expect(
            verified
                .prepare(
                    'SELECT status, progress_completed, progress_total, bytes FROM download_jobs WHERE id = ?'
                )
                .get('job-v013')
        ).toMatchObject({
            status: 'COMPLETED',
            progress_completed: 1,
            progress_total: 1,
            bytes: 321
        })
        for (const table of [
            'shelves',
            'reading_progress',
            'recommendation_sessions',
            'app_state',
            'library_membership',
            'favorites_sync_state'
        ])
            expect(
                verified
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
                    )
                    .get(table)
            ).toBeTruthy()
        expect(
            verified
                .prepare(
                    'SELECT reason FROM library_membership WHERE comic_id = ?'
                )
                .all('comic-v013')
        ).toEqual(
            expect.arrayContaining([
                { reason: 'pica-favorite' },
                { reason: 'download' }
            ])
        )
        expect(
            verified
                .prepare(
                    'SELECT MAX(version) AS version FROM schema_migrations'
                )
                .get()
        ).toMatchObject({ version: 7 })
        verified.close()
    })
})
