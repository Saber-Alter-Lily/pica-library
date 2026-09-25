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

function seededDatabase() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-p2d5a-'))
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
    const work = db.prepare(
        `INSERT INTO canonical_works(
            id, preferred_title, normalized_title, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)`
    )
    const binding = db.prepare(
        `INSERT INTO work_upload_bindings(
            comic_id, work_id, binding_status, confidence,
            resolver_version, created_at, updated_at
        ) VALUES (?, ?, 'MANUAL_CONFIRMED', 1, 'p2d5a', ?, ?)`
    )
    const decision = db.prepare(
        `INSERT INTO work_identity_decisions(
            id, left_comic_id, right_comic_id, decision,
            source, note, created_at, updated_at
        ) VALUES (?, ?, ?, 'SAME_WORK', 'TEST', '', ?, ?)`
    )

    db.exec('BEGIN IMMEDIATE')
    try {
        work.run('work-all', 'All Work', 'all work', now, now)
        for (let index = 0; index < 10001; index += 1) {
            const comicId = `comic-${index}`
            comic.run(comicId, `Comic ${index}`, now, now)
            binding.run(comicId, 'work-all', now, now)
        }
        for (let index = 1; index <= 5001; index += 1)
            decision.run(
                `decision-${index}`,
                'comic-0',
                `comic-${index}`,
                now,
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

describe('P2 D5A authoritative Work Identity domains', () => {
    it('keeps bounded review APIs while exposing complete binding and decision domains', () => {
        const database = seededDatabase()
        expect(database.workIdentityStorageStatus().counts).toMatchObject({
            bindings: 10001,
            decisions: 5001
        })

        expect(database.listWorkIdentityBindings(10000)).toHaveLength(10000)
        expect(database.listAllWorkIdentityBindings()).toHaveLength(10001)
        expect(database.getWorkIdentityBinding('comic-10000')).toMatchObject({
            comicId: 'comic-10000',
            workId: 'work-all'
        })
        expect(database.listWorkIdentityBindingsForWork('work-all')).toHaveLength(
            10001
        )
        expect(
            database
                .listWorkIdentityBindingsByComicIds([
                    'comic-10000',
                    'missing',
                    'comic-0'
                ])
                .map((item) => item.comicId)
        ).toEqual(['comic-10000', 'comic-0'])

        expect(database.listWorkIdentityDecisions(5000)).toHaveLength(5000)
        expect(database.listAllWorkIdentityDecisions()).toHaveLength(5001)
        expect(
            database.listWorkIdentityDecisionsForComic('comic-0')
        ).toHaveLength(5001)
        database.close()
    })

    it('routes authoritative materialization and Final V3 ownership through full-domain readers', () => {
        const service = fs.readFileSync('src/library/service.ts', 'utf8')
        const coordinator = fs.readFileSync(
            'src/recommendation-v3/cycle-coordinator-v3.ts',
            'utf8'
        )

        const planStart = service.indexOf(
            'recommendationV5WorkIdentityMaterializationPlan()'
        )
        const planEnd = service.indexOf(
            '\n    prepareRecommendationV5WorkIdentityMaterialization(',
            planStart
        )
        const plan = service.slice(planStart, planEnd)
        expect(plan).toContain('listAllWorkIdentityDecisions()')
        expect(plan).toContain('listAllWorkIdentityBindings()')
        expect(plan).not.toContain('listWorkIdentityDecisions(5000)')
        expect(plan).not.toContain('listWorkIdentityBindings(10000)')

        const reviewStart = service.indexOf(
            'recommendationV5WorkIdentityReview('
        )
        const reviewEnd = service.indexOf(
            '\n    recommendationV5WorkIdentityMaterializationPlan()',
            reviewStart
        )
        const review = service.slice(reviewStart, reviewEnd)
        expect(review).toContain('listWorkIdentityDecisions(5000)')
        expect(review).toContain('listAllWorkIdentityDecisions()')
        expect(review).toContain('authoritativeDecisions')
        expect(review).toContain(
            'buildWorkIdentityMaterializationPreviewV5('
        )

        expect(coordinator).toContain('listAllWorkIdentityBindings()')
        expect(coordinator).not.toContain(
            'listWorkIdentityBindings(10000)'
        )
    })
})
