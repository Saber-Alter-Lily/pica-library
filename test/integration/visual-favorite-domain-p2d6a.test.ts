import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import {
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION
} from '../../src/recommendation-v4/visual-style'

const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite'
) as typeof import('node:sqlite')

const roots: string[] = []

function seededFavorites() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-p2d6a-'))
    roots.push(root)
    const file = path.join(root, 'library.db')
    const library = new LibraryDatabase(file)
    library.close()

    const db = new DatabaseSync(file)
    const insert = db.prepare(
        `INSERT INTO comics(
            id, title, is_favorite, updated_at_source,
            first_seen_at, last_seen_at
        ) VALUES (?, ?, 1, ?, ?, ?)`
    )
    const recent = '2026-09-24T00:00:00.000Z'
    const old = '2020-01-01T00:00:00.000Z'
    db.exec('BEGIN IMMEDIATE')
    try {
        for (let index = 0; index < 10000; index += 1)
            insert.run(
                `favorite-${index}`,
                `Favorite ${index}`,
                recent,
                recent,
                recent
            )
        insert.run(
            'favorite-tail',
            'Favorite Tail',
            old,
            old,
            old
        )
        db.exec('COMMIT')
    } catch (error) {
        db.exec('ROLLBACK')
        db.close()
        throw error
    }
    db.close()

    return {
        root,
        database: new LibraryDatabase(file)
    }
}

afterEach(() => {
    while (roots.length)
        fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('P2 D6A Visual favorite target domain', () => {
    it('keeps Visual target and preference favorites beyond the legacy 10000 catalog prefix', () => {
        const { root, database } = seededFavorites()
        expect(database.favoriteIds()).toHaveLength(10001)
        expect(database.listComics({ limit: 10000 })).toHaveLength(5000)
        expect(
            database
                .listComics({ limit: 10000 })
                .some((comic) => comic.comicId === 'favorite-tail')
        ).toBe(false)

        database.saveVisualEmbedding({
            comicId: 'favorite-tail',
            modelId: VISUAL_MODEL_ID,
            modelVersion: VISUAL_MODEL_VERSION,
            samplingPolicyVersion: VISUAL_SAMPLING_POLICY_VERSION,
            embeddingKind: 'body',
            vector: [1, 0, 0, 0],
            dimension: 4,
            sourceKind: 'LOCAL_PAGES',
            sampleCount: 1,
            confidence: 1,
            generatedAt: '2026-09-24T00:00:00.000Z',
            metadata: {}
        })

        const service = new LibraryService(database, root)
        const profile = service.visualPreferenceProfile()
        expect(profile).toMatchObject({
            favoriteEmbeddingCount: 1,
            positiveEvidenceCount: 1
        })

        const status = service.visualIndexStatus()
        expect(status.targetCount).toBe(10001)
        expect(status.indexedCount).toBe(1)
        expect(status.pendingComicIds).toHaveLength(10000)
        database.close()
    }, 30_000)

    it('narrows only favorite-ID reads and preserves full-catalog Visual coverage analyses', () => {
        const service = fs.readFileSync('src/library/service.ts', 'utf8')

        const preferenceStart = service.indexOf(
            '    visualPreferenceProfile() {'
        )
        const preferenceEnd = service.indexOf(
            '\n    visualAnalysisRuntimeProfile()',
            preferenceStart
        )
        const preference = service.slice(preferenceStart, preferenceEnd)
        expect(preference).toContain('.favoriteIds()')
        expect(preference).not.toContain(
            'listComics({ limit: 10000 })'
        )

        const statusStart = service.indexOf('    visualIndexStatus() {')
        const statusEnd = service.indexOf(
            '\n    similarVisualStyle(',
            statusStart
        )
        const status = service.slice(statusStart, statusEnd)
        expect(status).toContain('.favoriteIds()')
        expect(status).not.toContain(
            'listComics({ limit: 10000 })'
        )

        const atlasStart = service.indexOf('visualAuthorAtlas(')
        const atlasEnd = service.indexOf(
            '\n    visualRepresentationQc(',
            atlasStart
        )
        expect(service.slice(atlasStart, atlasEnd)).toContain(
            'listComics({ limit: 10000 })'
        )

        const qcStart = service.indexOf('visualRepresentationQc(')
        const qcEnd = service.indexOf(
            '\n    visualIndexStatus()',
            qcStart
        )
        expect(service.slice(qcStart, qcEnd)).toContain(
            'listComics({ limit: 10000 })'
        )
    })
})
