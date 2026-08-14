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
        expect(versions.map((row) => row.version)).toEqual([1, 2, 3, 4])
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
        ).toMatchObject({ count: 4 })
        database.close()
    })

    it('rolls back a failed migration and does not record its version', () => {
        const database = new DatabaseSync(file())
        expect(() =>
            runMigrations(database, [
                ...migrations,
                {
                    version: 5,
                    name: 'broken',
                    up: 'CREATE TABLE transient(value TEXT); INVALID SQL;'
                }
            ])
        ).toThrow(/Migration 5/)
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
                    'SELECT version FROM schema_migrations WHERE version = 5'
                )
                .get()
        ).toBeUndefined()
        database.close()
    })
})
