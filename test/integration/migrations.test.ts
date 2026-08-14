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
})
