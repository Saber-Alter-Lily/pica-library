import { describe, expect, it, vi } from 'vitest'
import {
    localReaderGet, type LocalReaderGetPort
} from '../../src/reader/local-http-read'
import { collectSourceModuleGraph } from '../../scripts/audit-modules'

function ports(): LocalReaderGetPort {
    return {
        chapters: vi.fn((_comic: string) => [{ id: 'chapter-1', title: 'Owned pages' }]) as never,
        chapter: vi.fn((_comic: string, _episode: string) => ({
            episode: { id: 'chapter-1' },
            pages: [{ id: 'local:page-1' }]
        })) as never,
        picture: vi.fn((_id: string) => ({
            data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
            contentType: 'image/png'
        })) as never,
        recentProgress: vi.fn(() => [
            { comicId: 'local:fixture', episodeId: 'chapter-1', pageIndex: 1 }
        ]) as never
    }
}

describe('original Desktop Reader GET route contract shared with offline core', () => {
    it('keeps original chapters/chapter/progress URLs and decodes only URL path segments', () => {
        const reader = ports()
        expect(localReaderGet(
            '/api/v1/reader/comics/local%3Afixture/chapters', reader
        )).toEqual({
            kind: 'json',
            value: [{ id: 'chapter-1', title: 'Owned pages' }]
        })
        expect(reader.chapters).toHaveBeenCalledWith('local:fixture')

        expect(localReaderGet(
            '/api/v1/reader/comics/local%3Afixture/chapters/chapter-1',
            reader
        )).toEqual({
            kind: 'json',
            value: { episode: { id: 'chapter-1' },
                pages: [{ id: 'local:page-1' }] }
        })
        expect(reader.chapter).toHaveBeenCalledWith(
            'local:fixture', 'chapter-1'
        )
        expect(localReaderGet('/api/v1/reader/progress', reader)).toEqual({
            kind: 'json',
            value: [{ comicId: 'local:fixture',
                episodeId: 'chapter-1', pageIndex: 1 }]
        })
        expect(reader.recentProgress).toHaveBeenCalledOnce()
    })

    it('preserves old binary response identity, content type, size and cache policy', () => {
        const reader = ports()
        const local = localReaderGet('/api/v1/reader/pictures/local%3Apage-1',
            reader)
        expect(local).toEqual({
            kind: 'image',
            data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
            contentType: 'image/png',
            cacheControl: 'private, no-store'
        })
        expect(reader.picture).toHaveBeenCalledWith('local:page-1')
        const legacy = localReaderGet('/api/v1/reader/pictures/legacy-1', reader)
        expect(legacy).toMatchObject({
            kind: 'image', cacheControl: 'private, max-age=3600'
        })
    })

    it('never handles online, signed, Host or write URLs as local Reader GETs', () => {
        const reader = ports()
        for (const path of [
            '/api/v1/online-reader/progress',
            '/api/v1/desktop/signed-reader/session/progress',
            '/api/v1/desktop/host-reader/session/progress',
            '/api/v1/reader/export-zip',
            '/api/v1/reader/open-default',
            '/api/v1/reader/comics/local%3Afixture/chapters/a/b',
            '/api/v1/reader/pictures/pic/extra',
            '/api/v1/reader/progress/other'
        ])
            expect(localReaderGet(path, reader)).toBeNull()
        expect(reader.chapters).not.toHaveBeenCalled()
        expect(reader.chapter).not.toHaveBeenCalled()
        expect(reader.picture).not.toHaveBeenCalled()
        expect(reader.recentProgress).not.toHaveBeenCalled()
        expect(() => localReaderGet(
            '/api/v1/reader/pictures/%EF%BC%ZZ', reader
        )).toThrow(URIError)
    })

    it('imports no runtime source SDK and is actually consumed by both Desktop HTTP and offline CLI', () => {
        const graph = collectSourceModuleGraph()
        const file = 'src/reader/local-http-read.ts'
        expect(graph.nodes).toContain(file)
        expect(graph.edges).toContainEqual({
            from: 'src/library/server.ts',
            to: file,
            typeOnly: false
        })
        expect(graph.edges).toContainEqual({
            from: 'src/offline-core/qa-cli.ts',
            to: file,
            typeOnly: false
        })
        const runtime = graph.edges.filter(edge =>
            edge.from === file && !edge.typeOnly)
        expect(runtime).toEqual([])
    })
})
