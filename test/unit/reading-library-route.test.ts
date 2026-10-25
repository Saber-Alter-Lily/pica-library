import { describe, expect, it, vi } from 'vitest'
import { actualDesktopCallback, VirtualReply } from '../helpers/virtual-desktop-route'
import { ReadingLibrary, ReadingLibraryInputError } from '../../src/library/reading-library'
import { catalogueReadingPort } from '../../src/services/reading-library-adapters'

const HOST = '64d223e0-5d29-4320-babb-5a2da654d345'
interface VirtualCallOptions { method?: string; headers?: Record<string, string>; raw?: string; peer?: string; query?: string }
function fixture() {
    const readingProgress = vi.fn(() => [{ comicId: 'local:one', episodeId: 'chapter', pageIndex: 2, updatedAt: '2026-10-25T00:00:00Z' }])
    const getComicsByIds = vi.fn(() => [{ comicId: 'local:one', title: 'Owned local comic', providerId: 'local' as const, downloadedPictures: 3 }])
    const recentProgress = vi.fn(() => [])
    const readingLibraryRows = vi.fn((_id: string) => [{ source: { key: 'chosen-owner', label: 'Chosen host' }, comicId: 'hosted:owned', title: 'Selected host comic', channel: 'hosted' as const, available: true }])
    const options = { database: { recentReadingProgress: readingProgress, getComicsByIds }, service: { runtimeActiveTaskTypes: () => [], sources: { isEnabled: vi.fn(() => false) } }, desktop: { configured: () => true, csrfToken: 'fixture-csrf', status: () => ({ startupReady: true }), hostedReader: { readingLibraryRows } } }
    const handler = actualDesktopCallback({ options, host: '127.0.0.1', port: 4789, httpLatency: { start: () => () => {} }, onlineReader: { recentProgress }, ReadingLibrary, ReadingLibraryInputError, catalogueReadingPort })
    async function call(value: unknown = {}, more: VirtualCallOptions = {}) {
        let consumed = 0
        const iterate = async function* () { consumed++; yield Buffer.from(more.raw ?? JSON.stringify(value)) }
        const request = { url: '/api/v1/desktop/reading-library/query' + (more.query ?? ''), method: more.method ?? 'POST', socket: { remoteAddress: more.peer ?? '127.0.0.1' }, headers: { host: '127.0.0.1:4789', origin: 'http://127.0.0.1:4789', 'x-pica-csrf': 'fixture-csrf', 'content-type': 'application/json', ...more.headers }, [Symbol.asyncIterator]: iterate, iterator: () => iterate() }
        const response = new VirtualReply()
        await handler(request, response)
        return { response, consumed }
    }
    return { options, call, readingProgress, getComicsByIds, recentProgress, readingLibraryRows }
}
describe('actual reading-library HTTP callback over virtual memory requests only', () => {
    it('queries local saved state with bounded bulk metadata and no implicit hosted session', async () => {
        const f = fixture(), { response } = await f.call({ query: {} })
        expect(response.statusCode).toBe(200)
        expect(response.json()).toMatchObject({ total: 1, complete: true, items: [{ comicId: 'local:one' }] })
        expect(f.readingProgress).toHaveBeenCalledWith(100)
        expect(f.getComicsByIds).toHaveBeenCalledWith(['local:one'])
        expect(f.readingLibraryRows).not.toHaveBeenCalled()
    })
    it('includes only the explicitly requested host scope and keeps local rows on revocation', async () => {
        const f = fixture(), first = await f.call({ query: {}, hostSessionId: HOST })
        expect(first.response.json()).toMatchObject({ total: 2, complete: true })
        expect(f.readingLibraryRows).toHaveBeenCalledWith(HOST)
        f.readingLibraryRows.mockImplementation(() => { throw Error('synthetic-secret-not-for-client') })
        const next = await f.call({ hostSessionId: HOST })
        expect(next.response.statusCode).toBe(200)
        expect(next.response.json()).toMatchObject({ total: 1, complete: false, issues: [{ port: 'selected-host' }] })
        expect(next.response.text).not.toContain('synthetic-secret')
    })
    const rejectedAuthority: VirtualCallOptions[] = [{ method: 'GET' }, { headers: { 'x-pica-csrf': '' } }, { headers: { origin: 'https://outside.example' } }, { peer: '192.0.2.1' }]
    for (const more of rejectedAuthority) {
        it('rejects an unauthorized/method request before reading a body or saved state: ' + JSON.stringify(more), async () => {
            const f = fixture(), result = await f.call({ hostSessionId: HOST }, more)
            expect([403, 405]).toContain(result.response.statusCode)
            expect(result.consumed).toBe(0)
            expect(f.readingProgress).not.toHaveBeenCalled()
            expect(f.readingLibraryRows).not.toHaveBeenCalled()
        })
    }
    for (const input of [null, [], { query: null }, { auth: {} }, { hostSessionId: 'wrong' }, { query: { limit: 101 } }, { query: { enabled: ['jm'] } }]) {
        it('rejects malformed input before any saved-state acquisition: ' + JSON.stringify(input), async () => {
            const f = fixture(), { response } = await f.call(input)
            expect(response.statusCode).toBe(400)
            expect(response.json()).toEqual({ error: 'Invalid reading library query' })
            expect(f.readingProgress).not.toHaveBeenCalled()
            expect(f.readingLibraryRows).not.toHaveBeenCalled()
        })
    }
    for (const more of [{ headers: { 'content-type': 'text/plain' } }, { raw: '{"password":"synthetic-private"' }, { raw: ' '.repeat(4097) }, { query: '?host=unapproved' }]) {
        it('enforces JSON/byte/URL bounds without reflecting body details: ' + JSON.stringify({ ...more, raw: more.raw?.length }), async () => {
            const f = fixture(), { response } = await f.call({}, more)
            expect(response.statusCode).toBe(400)
            expect(response.headers.connection).toBe('close')
            expect(response.text).not.toContain('synthetic-private')
            expect(f.readingProgress).not.toHaveBeenCalled()
        })
    }
})
