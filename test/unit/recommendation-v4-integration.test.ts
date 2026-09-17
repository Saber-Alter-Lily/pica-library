import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { latestMigrationVersion } from '../../src/storage/sqlite/migrations'
import {
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION
} from '../../src/recommendation-v4/visual-style'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Recommendation V4 integration', () => {
    it('keeps schema 10 visual storage while later additive migrations advance the database', () => {
        expect(latestMigrationVersion).toBe(11)
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v4-'))
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        expect(
            fs.existsSync(path.join(dir, 'library.sqlite'))
        ).toBe(true)
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('records sentiment before optional reasons and latest sentiment wins', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v4-feedback-'))
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        database.importCatalog(
            [
                {
                    comicId: 'comic-a',
                    title: 'A',
                    author: 'Author',
                    tags: ['tag'],
                    categories: [],
                    finished: true
                }
            ],
            'test'
        )
        const feedback = database.recordUserEvent({
            eventType: 'recommend_dislike',
            comicId: 'comic-a',
            source: 'test'
        })
        expect(database.recommendationFeedback()[0]).toMatchObject({
            comicId: 'comic-a',
            sentiment: 'dislike',
            reasons: []
        })
        database.recordUserEvent({
            eventType: 'recommend_feedback_reason',
            comicId: 'comic-a',
            source: 'test',
            metadata: {
                parentFeedbackId: feedback.id,
                sentiment: 'dislike',
                reasons: ['style']
            }
        })
        expect(database.recommendationFeedback()[0].reasons).toEqual(['style'])
        const changed = database.recordUserEvent({
            eventType: 'recommend_like',
            comicId: 'comic-a',
            source: 'test'
        })
        expect(database.recommendationFeedback()[0]).toMatchObject({
            feedbackEventId: changed.id,
            sentiment: 'like',
            reasons: []
        })
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('persists normalized versioned embeddings', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v4-vector-'))
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        database.importCatalog(
            [
                {
                    comicId: 'comic-a',
                    title: 'A',
                    author: 'Author',
                    tags: [],
                    categories: [],
                    finished: true
                }
            ],
            'test'
        )
        database.saveVisualEmbedding({
            comicId: 'comic-a',
            modelId: VISUAL_MODEL_ID,
            modelVersion: VISUAL_MODEL_VERSION,
            samplingPolicyVersion: VISUAL_SAMPLING_POLICY_VERSION,
            embeddingKind: 'body',
            vector: [3, 4],
            dimension: 2,
            sourceKind: 'LOCAL_PAGES',
            sampleCount: 6,
            confidence: 1,
            generatedAt: new Date(0).toISOString(),
            metadata: {}
        })
        expect(database.listVisualEmbeddings()[0].vector).toEqual([0.6, 0.8])
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('keeps reasons optional in UI and visual analysis lazy', () => {
        const html = read('web/index.html')
        const app = read('web/app.js')
        const runtime = read('web/visual-runtime.js')
        expect(html).toContain('id="recommend-feedback-reasons-toggle"')
        expect(app).toContain(
            "eventType: sentiment === 'like' ? 'recommend_like' : 'recommend_dislike'"
        )
        expect(app.indexOf('state.recommendationFeedback[comicId] =')).toBeLessThan(
            app.indexOf("$('#recommend-feedback-dialog').showModal()")
        )
        expect(runtime).toContain('onnx-community/dinov2-small')
        expect(runtime).toContain('await import(VISUAL_RUNTIME.libraryUrl)')
    })
})
