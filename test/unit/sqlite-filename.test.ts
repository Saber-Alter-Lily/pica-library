import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { buildLocalConfig } from '../../src/desktop/config'
import {
    sqliteDiskFilename,
    SqliteFilenameError
} from '../../src/storage/sqlite/filename'

const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')
const roots: string[] = []
afterEach(() => {
    vi.restoreAllMocks()
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

function syntheticFile(length: number) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-sqlite-path-'))
    roots.push(root)
    let directory = path.join(root, '中文 # % 文件夹 with spaces')
    while (directory.length + 11 < length) {
        const remaining = length - directory.length - 11
        if (remaining === 1) directory += 'x'
        else
            directory = path.join(
                directory,
                'x'.repeat(Math.min(remaining - 1, 60))
            )
    }
    return path.join(directory, 'library.db')
}

describe('SQLite disk filename adapter', () => {
    it('keeps non-Windows logical paths byte-for-byte unchanged', () => {
        const file = '/tmp/中文 # % folder/library.db'
        expect(sqliteDiskFilename(file, 'linux')).toBe(file)
        expect(sqliteDiskFilename(file, 'darwin')).toBe(file)
    })

    it.each([
        'C:\\library\\library.db',
        'C:\\中文 # % data\\library.db',
        '\\\\server\\share\\data\\library.db',
        '\\\\?\\C:\\already namespaced\\library.db'
    ])(
        'encodes a deep physical filename without exposing URI controls: %s',
        (file) => {
            const physical = path.win32.join(
                path.win32.dirname(file),
                ...Array.from({ length: 50 }, () => 'nested'),
                path.win32.basename(file)
            )
            const value = sqliteDiskFilename(physical, 'win32', '24.15.0')
            const uri = new URL(value)
            expect([...uri.searchParams]).toEqual([['vfs', 'win32-longpath']])
            expect(decodeURIComponent(value.slice(5, value.indexOf('?')))).toBe(
                path.win32.toNamespacedPath(physical)
            )
            expect(value).not.toContain('win32-longpath-none')
        }
    )

    it('does not interpret user filename characters as immutable/nolock options', () => {
        const file =
            'C:\\data\\literal%3Fimmutable=1#nolock=1\\' +
            'nested\\'.repeat(50) +
            'library.db'
        const value = sqliteDiskFilename(file, 'win32', '24.15.0')
        expect([...new URL(value).searchParams]).toEqual([
            ['vfs', 'win32-longpath']
        ])
        expect(decodeURIComponent(value.slice(5, value.indexOf('?')))).toBe(
            path.win32.toNamespacedPath(file)
        )
    })

    it('preserves old Node short-path compatibility and rejects only unsupported deep paths there', () => {
        expect(
            sqliteDiskFilename('C:\\data\\library.db', 'win32', '22.5.0')
        ).toBe('C:\\data\\library.db')
        expect(
            sqliteDiskFilename(
                'C:\\old folder. \\library.db',
                'win32',
                '24.15.0'
            )
        ).toBe('C:\\old folder. \\library.db')
        const file = 'C:\\' + 'long\\'.repeat(250) + 'library.db'
        expect(() => sqliteDiskFilename(file, 'win32', '22.5.0')).toThrow(
            /bundled runtime/
        )
        for (const version of ['22.15.0', '23.10.0', '24.0.0', '24.15.0'])
            expect(sqliteDiskFilename(file, 'win32', version)).toContain(
                '?vfs=win32-longpath'
            )
    })

    it('preflights real filesystem/recovery limits without touching files', () => {
        expect(() => sqliteDiskFilename('relative.db', 'win32')).toThrow(
            SqliteFilenameError
        )
        expect(() => sqliteDiskFilename('C:\\data\\bad\0.db', 'win32')).toThrow(
            SqliteFilenameError
        )
        expect(() =>
            sqliteDiskFilename(
                'C:\\' + 'nested\\'.repeat(4800) + 'library.db',
                'win32'
            )
        ).toThrow(/filesystem limit/)
        expect(() =>
            sqliteDiskFilename('C:\\data\\' + 'x'.repeat(250) + '.db', 'win32')
        ).toThrow(/filesystem limit/)
    })

    it.runIf(process.platform === 'win32')(
        'opens, migrates, writes and reopens deep logical files without relocation',
        () => {
            for (const length of [253, 520, 1200, 4096]) {
                const file = syntheticFile(length)
                let database = new LibraryDatabase(file)
                expect(database.file).toBe(file)
                database.importFavorites(
                    [
                        {
                            comicId: 'synthetic-local-fixture',
                            title: 'Synthetic retained library',
                            author: 'Synthetic author',
                            tags: ['Synthetic'],
                            categories: [],
                            finished: true,
                            totalLikes: 0,
                            totalViews: 0,
                            updatedAt: '2026-10-23'
                        }
                    ],
                    'synthetic-import'
                )
                database.close()
                expect(fs.statSync(file).size).toBeGreaterThan(0)
                database = new LibraryDatabase(file)
                expect(database.summary().favorites).toBe(1)
                database.close()
            }
        }
    )

    it.runIf(process.platform === 'win32')(
        'shares ordinary VFS locks and WAL with existing short-path clients',
        () => {
            const root = fs.mkdtempSync(
                path.join(os.tmpdir(), 'pica-sqlite-locks-')
            )
            roots.push(root)
            const file = path.join(root, 'library.db')
            const ordinary = new DatabaseSync(file)
            const adapted = new DatabaseSync(
                sqliteDiskFilename(path.toNamespacedPath(file))
            )
            try {
                ordinary.exec(
                    "PRAGMA journal_mode=WAL; CREATE TABLE retained(value TEXT); BEGIN IMMEDIATE; INSERT INTO retained VALUES ('held');"
                )
                expect(() =>
                    adapted.exec(
                        "INSERT INTO retained VALUES ('must be locked')"
                    )
                ).toThrow(/locked/)
                ordinary.exec('COMMIT')
                expect(
                    adapted.prepare('SELECT value FROM retained').get()
                ).toMatchObject({ value: 'held' })
                adapted.exec("INSERT INTO retained VALUES ('committed')")
                expect(
                    ordinary.prepare('SELECT COUNT(*) AS n FROM retained').get()
                ).toMatchObject({ n: 2 })
            } finally {
                ordinary.close()
                adapted.close()
            }
        }
    )

    it.runIf(process.platform === 'win32')(
        'rejects impossible setup/startup paths before creating a directory or database',
        () => {
            const file = 'C:\\' + 'nested\\'.repeat(4800) + 'library.db'
            const mkdir = vi.spyOn(fs, 'mkdirSync')
            expect(() => new LibraryDatabase(file)).toThrow(SqliteFilenameError)
            expect(() =>
                buildLocalConfig({
                    libraryDirectory: path.dirname(file),
                    profile: 'balanced'
                })
            ).toThrow(SqliteFilenameError)
            expect(mkdir).not.toHaveBeenCalled()
        }
    )

    it('closes a constructed SQLite connection when pre-migration backup fails', () => {
        const root = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-sqlite-init-failure-')
        )
        roots.push(root)
        const file = path.join(root, 'library.db')
        const initial = new DatabaseSync(sqliteDiskFilename(file))
        initial.exec('CREATE TABLE retained(value TEXT)')
        initial.close()
        const close = vi.spyOn(DatabaseSync.prototype, 'close')
        vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
            throw new Error('synthetic backup EACCES')
        })
        expect(() => new LibraryDatabase(file)).toThrow(
            'synthetic backup EACCES'
        )
        expect(close).toHaveBeenCalledTimes(1)
    })
})
