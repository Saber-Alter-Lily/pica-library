import { describe, expect, it, vi } from 'vitest'
import { ReadingLibrary, ReadingLibraryInputError, readingLibraryQuery, type ReadingLibraryRow } from '../../src/library/reading-library'
import { catalogueReadingPort } from '../../src/services/reading-library-adapters'

const position = (day = 1) => ({ episodeId: 'chapter-one', pageIndex: 3, updatedAt: `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z` })
const entry = (override: Partial<ReadingLibraryRow> = {}): ReadingLibraryRow => ({ source: { key: 'owner:one', label: 'Chosen source' }, comicId: 'book-one', title: 'One', channel: 'local', available: true, progress: position(), ...override })
describe('actual source-neutral reading-library query, no persistence/network/runtime', () => {
    it('does not inspect a port until an explicit valid query and never accepts activation or credential fields', () => {
        const snapshot = vi.fn(() => [entry()]), library = new ReadingLibrary([{ id: 'fixture', snapshot }])
        expect(snapshot).not.toHaveBeenCalled()
        for (const value of [null, [], false, { auth: {} }, { sessionId: 'not-a-query' }, { limit: 101 }, { offset: -1 }, { text: 'x'.repeat(201) }, { recentOnly: 'true' }]) expect(() => library.query(value)).toThrow(ReadingLibraryInputError)
        expect(snapshot).not.toHaveBeenCalled()
        expect(library.query().total).toBe(1)
        expect(snapshot).toHaveBeenCalledOnce()
    })
    it('combines local/online replicas without rewriting or merging their distinct progress positions', () => {
        const rows = [entry(), entry({ channel: 'online', available: false, progress: position(2) })], before = JSON.stringify(rows)
        const result = new ReadingLibrary([{ id: 'fixture', snapshot: () => rows }]).query()
        expect(result.total).toBe(1)
        expect(result.items[0].lastReadAt).toBe(position(2).updatedAt)
        expect(result.items[0].routes.map(route => [route.channel, route.progress?.updatedAt])).toEqual([['local', position().updatedAt], ['online', position(2).updatedAt]])
        expect(result.sources[0].count).toBe(1)
        result.items[0].routes[0].progress!.pageIndex = 8
        result.items[0].source.label = 'Changed output'
        expect(JSON.stringify(rows)).toBe(before)
    })
    it('projects signed work only through a distinct session-owned channel, never legacy online', () => {
        const sessionId = '64d223e0-5d29-4320-babb-5a2da654d345'
        const signed = entry({
            source: { key: 'signed-source:demo', label: 'demo' },
            comicId: 'demo:book1', title: null,
            channel: 'signed', sessionId, progress: position()
        })
        const item = new ReadingLibrary([{ id: 'signed', snapshot: () => [signed] }])
            .query({ sourceKey: 'signed-source:demo' })
        expect(item).toMatchObject({
            total: 1,
            items: [{
                comicId: 'demo:book1',
                routes: [{ channel: 'signed', sessionId, available: true }]
            }]
        })
        const missing = new ReadingLibrary([{ id: 'signed', snapshot: () => [
            entry({ ...signed, sessionId: undefined })
        ] }]).query()
        expect(missing).toMatchObject({
            total: 0, complete: false,
            issues: [{ port: 'signed', code: 'READING_STATE_UNAVAILABLE' }]
        })
        const spoofed = new ReadingLibrary([{ id: 'signed', snapshot: () => [
            entry({ ...signed, channel: 'online' })
        ] }]).query()
        expect(spoofed).toMatchObject({ total: 0, complete: false })
    })

    it('never merges identical titles or remote row IDs from different host/principal/source ownership', () => {
        const rows = ['principal-a', 'principal-b', 'other-host'].map(key => entry({ source: { key, label: key }, channel: 'hosted' }))
        expect(new ReadingLibrary([{ id: 'fixture', snapshot: () => rows }]).query().total).toBe(3)
    })
    it('keeps selected books without progress, missing metadata and stable bounded pagination honest', () => {
        const rows = [entry({ comicId: 'selected', title: null, progress: undefined }), entry({ comicId: 'later', progress: position(2) }), entry()]
        const library = new ReadingLibrary([{ id: 'fixture', snapshot: () => rows }])
        expect(library.query({ limit: 1, offset: 1 }).items[0].comicId).toBe('book-one')
        expect(library.query({ recentOnly: true }).total).toBe(2)
        expect(library.query().items.at(-1)).toMatchObject({ comicId: 'selected', title: null, lastReadAt: null })
        expect(library.query({ text: 'LATER' }).items.map(row => row.comicId)).toEqual(['later'])
        expect(library.query({ sourceKey: 'unselected-source' }).total).toBe(0)
    })
    it('reports unavailable/corrupt optional ports without hiding local rows or exposing errors/resetting state', () => {
        const snapshot = vi.fn(() => { throw Error('synthetic-private-do-not-reflect') })
        const library = new ReadingLibrary([{ id: 'local', snapshot: () => [entry()] }, { id: 'hosted', snapshot }])
        const result = library.query()
        expect(result).toMatchObject({ total: 1, complete: false, issues: [{ port: 'hosted', code: 'READING_STATE_UNAVAILABLE' }] })
        expect(JSON.stringify(result)).not.toContain('synthetic-private')
    })
    it('applies each snapshot atomically and rejects malformed or oversized state without partial publication', () => {
        for (const rows of [[entry(), entry({ available: 'yes' as unknown as boolean })], Array.from({ length: 501 }, () => entry()), [entry({ progress: { ...position(), pageIndex: -1 } })], [entry(), entry({ source: { key: 'owner:one', label: 'Conflicting source' } })]]) {
            const result = new ReadingLibrary([{ id: 'fixture', snapshot: () => rows }]).query()
            expect(result).toMatchObject({ total: 0, complete: false })
        }
    })
    it('does not let a duplicate stale replica grant availability', () => {
        const result = new ReadingLibrary([{ id: 'fixture', snapshot: () => [entry({ available: false }), entry({ progress: position(2) })] }]).query()
        expect(result.items[0].routes).toEqual([{ channel: 'local', available: false, progress: position(2) }])
    })
    it('copies the registered port collection and rejects collisions before reading any state', () => {
        const snapshot = vi.fn(() => [entry()]), ports = [{ id: 'local', snapshot }], library = new ReadingLibrary(ports)
        ports.push({ id: 'later', snapshot })
        library.query()
        expect(snapshot).toHaveBeenCalledOnce()
        expect(() => new ReadingLibrary([{ id: 'same', snapshot }, { id: 'same', snapshot }])).toThrow()
        expect(readingLibraryQuery({ text: '  One  ' })).toMatchObject({ text: 'One', limit: 20 })
    })
})
describe('actual legacy catalogue adapter, fake read ports only', () => {
    it('uses one bounded bulk metadata read, retains IDs and leaves local content readable when a source is off', () => {
        const getComicsByIds = vi.fn(() => [{ comicId: 'legacy-id', title: 'Same', downloadedPictures: 4 }]), sourceEnabled = vi.fn(() => false)
        const values = [{ comicId: 'legacy-id', ...position() }, { comicId: 'legacy-id', ...position(2) }]
        const port = catalogueReadingPort('local', () => values, { getComicsByIds }, sourceEnabled)
        expect(getComicsByIds).not.toHaveBeenCalled()
        const result = new ReadingLibrary([port]).query()
        expect(getComicsByIds).toHaveBeenCalledOnce()
        expect(getComicsByIds).toHaveBeenCalledWith(['legacy-id'])
        expect(sourceEnabled).not.toHaveBeenCalled()
        expect(result.items[0]).toMatchObject({ comicId: 'legacy-id', source: { key: 'catalogue:pica' }, routes: [{ channel: 'local', available: true, progress: position(2) }] })
    })
    it('does not route local or unknown hosted namespaces through an online provider', () => {
        const getComicsByIds = vi.fn(() => []), sourceEnabled = vi.fn(() => true)
        const local = catalogueReadingPort('online', () => [{ comicId: 'local:fixture', ...position() }], { getComicsByIds }, sourceEnabled)
        expect(local.snapshot()[0].available).toBe(false)
        expect(sourceEnabled).not.toHaveBeenCalled()
        getComicsByIds.mockClear()
        const hosted = catalogueReadingPort('online', () => [{ comicId: 'hosted:fixture', ...position() }], { getComicsByIds }, sourceEnabled)
        expect(() => hosted.snapshot()).toThrow('Unrecognized catalog source')
        expect(getComicsByIds).not.toHaveBeenCalled()
    })
})
