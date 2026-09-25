import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'

const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')

const roots: string[] = []

function databaseFile() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-p2d8a-'))
    roots.push(root)
    const file = path.join(root, 'library.db')
    const library = new LibraryDatabase(file)
    library.close()
    return file
}

afterEach(() => {
    while (roots.length)
        fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

function planDetails(database: InstanceType<typeof DatabaseSync>, sql: string) {
    return (
        database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all('comic-a') as Array<{
            detail: string
        }>
    ).map((row) => String(row.detail))
}

describe('P2 D8A picture count query plan', () => {
    it('uses the comic-first picture index for total and completed counts', () => {
        const database = new DatabaseSync(databaseFile())

        const total = planDetails(
            database,
            'SELECT COUNT(*) FROM pictures WHERE comic_id = ?'
        )
        expect(total.some((detail) =>
            detail.includes('idx_pictures_comic_status')
        )).toBe(true)

        const completed = planDetails(
            database,
            "SELECT COUNT(*) FROM pictures WHERE comic_id = ? AND status = 'completed'"
        )
        expect(completed.some((detail) =>
            detail.includes('idx_pictures_comic_status')
        )).toBe(true)

        database.close()
    })

    it('keeps comicSelect picture counters aligned with the indexed predicates', () => {
        const source = fs.readFileSync('src/library/database.ts', 'utf8')

        expect(source).toContain(
            '(SELECT COUNT(*) FROM pictures p WHERE p.comic_id = c.id)'
        )
        expect(source).toContain(
            "WHERE p.comic_id = c.id AND p.status = 'completed'"
        )
    })
})
