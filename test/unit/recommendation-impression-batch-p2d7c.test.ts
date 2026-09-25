import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'

describe('P2 D7C recommendation impression batching', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-p2d7c-'))
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    const service = new LibraryService(database, root)
    let server: Server
    let url: string

    beforeAll(async () => {
        const started = await startLibraryServer({
            database,
            service,
            host: '127.0.0.1',
            port: 0
        })
        server = started.server
        url = started.url
    })

    afterAll(async () => {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
        )
        database.close()
        fs.rmSync(root, { recursive: true, force: true })
    })

    function impression(index: number, cycle = 'cycle-d7c') {
        return {
            eventType: 'recommend_impression',
            occurredAt: `2026-09-24T20:00:0${index}.000Z`,
            comicId: `comic-${index}`,
            source: 'web-recommendation-grid',
            appSessionId: 'session-d7c',
            contextId: 'context-d7c',
            recommendationCycleId: cycle,
            recommendationBatchIndex: 2,
            rankPosition: index + 1,
            dedupeKey: `context-d7c:2:comic-${index}`
        }
    }

    it('persists one impression burst through one batch request', async () => {
        const response = await fetch(
            `${url}/api/v1/recommendation-events/batch`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    events: [impression(0), impression(1), impression(2)]
                })
            }
        )
        expect(response.status).toBe(200)
        const payload = (await response.json()) as {
            events: Array<{ comicId: string; eventType: string }>
        }
        expect(payload.events).toHaveLength(3)
        expect(
            payload.events.map((event) => event.comicId)
        ).toEqual(['comic-0', 'comic-1', 'comic-2'])

        const stored = database
            .listUserEvents({
                eventType: 'recommend_impression',
                limit: 100
            })
            .filter(
                (event) => event.recommendationCycleId === 'cycle-d7c'
            )
        expect(stored).toHaveLength(3)
        expect(stored.map((event) => event.rankPosition)).toEqual([1, 2, 3])
    })

    it('rolls back the whole impression batch when one event fails storage validation', async () => {
        const cycle = 'cycle-d7c-rollback'
        const first = {
            ...impression(4, cycle),
            dedupeKey: 'rollback:valid'
        }
        const invalid = {
            ...impression(5, cycle),
            dedupeKey: 'rollback:invalid',
            metadata: { token: 'must-not-be-stored' }
        }

        const response = await fetch(
            `${url}/api/v1/recommendation-events/batch`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ events: [first, invalid] })
            }
        )
        expect(response.status).toBe(500)
        expect(
            database
                .listUserEvents({
                    eventType: 'recommend_impression',
                    limit: 100
                })
                .filter(
                    (event) => event.recommendationCycleId === cycle
                )
        ).toHaveLength(0)
    })

    it('keeps non-impression recommendation actions on the single-event contract', async () => {
        const response = await fetch(
            `${url}/api/v1/recommendation-events/batch`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    events: [
                        {
                            ...impression(6),
                            eventType: 'recommend_like'
                        }
                    ]
                })
            }
        )
        expect(response.status).toBe(400)

        const app = fs.readFileSync('web/app.js', 'utf8')
        expect(app).toContain(
            "api('/api/v1/recommendation-events/batch'"
        )
        expect(app).toContain('queueRecommendationImpression({')
        expect(app).toContain(
            "recordRecommendationEvent('recommend_batch_presented'"
        )
        expect(app).toContain(
            "post('/api/v1/recommendation-events', {"
        )
        expect(app).toContain('keepalive: true')
    })

    it('bounds the micro-batch size at 24 events', async () => {
        const response = await fetch(
            `${url}/api/v1/recommendation-events/batch`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    events: Array.from({ length: 25 }, (_, index) => ({
                        ...impression(index + 10, 'cycle-d7c-too-large'),
                        comicId: `too-large-${index}`,
                        rankPosition: index + 1,
                        dedupeKey: `too-large:${index}`
                    }))
                })
            }
        )
        expect(response.status).toBe(400)
    })
})
