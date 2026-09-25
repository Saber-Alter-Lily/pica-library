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

function seededEvidenceDatabase() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-p2d5b-evidence-'))
    roots.push(root)
    const file = path.join(root, 'library.db')
    const library = new LibraryDatabase(file)
    library.close()

    const db = new DatabaseSync(file)
    const now = '2026-09-24T00:00:00.000Z'
    const comic = db.prepare(
        `INSERT INTO comics(
            id, title, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?)`
    )
    const evidence = db.prepare(
        `INSERT INTO work_identity_evidence(
            id, left_comic_id, right_comic_id, relation,
            confidence, resolver_version, evidence_json, created_at
        ) VALUES (?, ?, ?, 'PROBABLE_SAME_WORK', ?, 'p2d5b', '{}', ?)`
    )

    db.exec('BEGIN IMMEDIATE')
    try {
        comic.run('target-a', 'Target A', now, now)
        comic.run('target-b', 'Target B', now, now)
        comic.run('filler-anchor', 'Filler Anchor', now, now)
        for (let index = 0; index < 5000; index += 1) {
            const comicId = `filler-${index}`
            comic.run(comicId, `Filler ${index}`, now, now)
            evidence.run(
                `evidence-filler-${index}`,
                'filler-anchor',
                comicId,
                0.99,
                now
            )
        }
        evidence.run(
            'evidence-target',
            'target-a',
            'target-b',
            0.95,
            now
        )
        db.exec('COMMIT')
    } catch (error) {
        db.exec('ROLLBACK')
        db.close()
        throw error
    }
    db.close()
    return new LibraryDatabase(file)
}

afterEach(() => {
    while (roots.length)
        fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('P2 D5B targeted Work Identity evidence', () => {
    it('finds current-comic probable evidence outside the global 5000-row prefix', () => {
        const database = seededEvidenceDatabase()
        const bounded = database.listWorkIdentityEvidence(5000)
        expect(bounded).toHaveLength(5000)
        expect(
            bounded.some((item) => item.id === 'evidence-target')
        ).toBe(false)

        const targeted =
            database.listWorkIdentityProbableEvidenceForComic(
                'target-a',
                0.94
            )
        expect(targeted).toHaveLength(1)
        expect(targeted[0]).toMatchObject({
            id: 'evidence-target',
            leftComicId: 'target-a',
            rightComicId: 'target-b',
            relation: 'PROBABLE_SAME_WORK',
            confidence: 0.95
        })
        database.close()
    })
})
