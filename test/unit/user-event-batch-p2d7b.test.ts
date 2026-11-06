import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'

const roots: string[] = []

function setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-p2d7b-'))
    roots.push(root)
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    return { database }
}

afterEach(() => {
    while (roots.length)
        fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('P2 D7B transactional user-event batching', () => {
    it('preserves one event per comic while committing the batch together', () => {
        const { database } = setup()
        const inputs = ['comic-a', 'comic-b', 'comic-c'].map((comicId) => ({
            eventType: 'shelf_add' as const,
            comicId,
            source: 'shelf',
            appSessionId: 'session-a',
            contextId: 'context-a',
            metadata: { shelfId: 'shelf-a' }
        }))

        const events = database.recordUserEvents(inputs)
        expect(events).toHaveLength(3)
        expect(events.map((event) => event.comicId)).toEqual([
            'comic-a',
            'comic-b',
            'comic-c'
        ])
        expect(events.every((event) => event.eventType === 'shelf_add')).toBe(
            true
        )
        expect(
            events.every(
                (event) =>
                    event.source === 'shelf' &&
                    event.appSessionId === 'session-a' &&
                    event.contextId === 'context-a' &&
                    event.metadata.shelfId === 'shelf-a'
            )
        ).toBe(true)

        expect(
            database.listUserEvents({ eventType: 'shelf_add', limit: 10 })
        ).toHaveLength(3)
        database.close()
    })

    it('rolls back the whole batch if one event violates metadata safety', () => {
        const { database } = setup()

        expect(() =>
            database.recordUserEvents([
                {
                    eventType: 'shelf_add',
                    comicId: 'comic-a',
                    source: 'shelf',
                    metadata: { shelfId: 'shelf-a' }
                },
                {
                    eventType: 'shelf_add',
                    comicId: 'comic-b',
                    source: 'shelf',
                    metadata: {
                        shelfId: 'shelf-a',
                        token: 'must-not-be-recorded'
                    }
                }
            ])
        ).toThrow(/Invalid recommendation event metadata/)

        expect(
            database.listUserEvents({ eventType: 'shelf_add', limit: 10 })
        ).toHaveLength(0)
        database.close()
    })

    it('keeps the original shelf add/remove event granularity after moving the HTTP routes to a source-neutral core', () => {
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        const core = fs.readFileSync('src/library/core-shelf-routes.ts', 'utf8')
        const start = server.indexOf('const shelfMatch = coreShelfMatch(')
        const end = server.indexOf(
            "\n            if (\n                url.pathname === '/api/v1/recommendation-sessions'",
            start
        )
        const shelfRoutes = server.slice(start, end)

        // Production Desktop still batches the same event objects into the
        // transactional SQLite recorder, now through the shared shelf port.
        expect(start).toBeGreaterThan(0)
        expect(end).toBeGreaterThan(start)
        expect(shelfRoutes).toContain('coreShelfExecute(')
        expect(shelfRoutes).toContain('options.database.recordUserEvents(events)')
        expect(shelfRoutes).toContain("request.headers['x-pica-app-session']")
        expect(shelfRoutes).toContain("request.headers['x-pica-context-id']")
        expect(core).toContain("emit('shelf_add', shelfId, ids, options)")
        expect(core).toContain("emit('shelf_remove', shelfId, ids, options)")
        expect(core).toContain('options.recordUserEvents(comicIds.map(')
        expect(core).toContain("source: 'shelf'")
        expect(core).toContain('metadata: { shelfId }')
        expect(shelfRoutes).not.toContain('options.database.recordUserEvent({')
    })

    it('uses one explicit SQLite transaction around the existing event recorder', () => {
        const database = fs.readFileSync('src/library/database.ts', 'utf8')
        const start = database.indexOf(
            'recordUserEvents(inputs: UserEventInput[])'
        )
        const end = database.indexOf('\n    listUserEvents(', start)
        const method = database.slice(start, end)

        expect(method).toContain("this.db.exec('BEGIN IMMEDIATE')")
        expect(method).toContain(
            'inputs.map((input) => this.recordUserEvent(input))'
        )
        expect(method).toContain("this.db.exec('COMMIT')")
        expect(method).toContain("this.db.exec('ROLLBACK')")
    })
})
