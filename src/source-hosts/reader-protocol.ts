import { SourceHostError, object } from './contract'
import { sourceHostData, suwayomiSourceId } from './suwayomi'

// Official 2.4.2366 fixed subset; no extension/account/favorite/library/progress mutation.
const mangaFields = 'id sourceId url title'
const chapterFields = 'id mangaId url name sourceOrder pageCount chapterNumber'
export const HOST_READER_OPERATIONS = {
    library: { operationName: 'PicaHostLibrary', query: `query PicaHostLibrary($offset: Int!) { mangas(condition: { inLibrary: true }, first: 25, offset: $offset) { nodes { ${mangaFields} } pageInfo { hasNextPage } } }` },
    manga: { operationName: 'PicaHostManga', query: `query PicaHostManga($id: Int!) { manga(id: $id) { ${mangaFields} chapters { nodes { ${chapterFields} } } } }` },
    chapter: { operationName: 'PicaHostChapter', query: `query PicaHostChapter($id: Int!) { chapter(id: $id) { ${chapterFields} } }` },
    pages: { operationName: 'PicaHostChapterPages', query: `mutation PicaHostChapterPages($id: Int!) { fetchChapterPages(input: { chapterId: $id }) { chapter { ${chapterFields} } pages } }` }
} as const
export type HostReaderOperation = keyof typeof HOST_READER_OPERATIONS
function text(value: unknown, max: number) {
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new SourceHostError('SOURCE_HOST_PROTOCOL')
    return value
}
export function hostInteger(value: unknown, zero = false): number {
    if (!Number.isInteger(value) || Number(value) < (zero ? 0 : 1) || Number(value) > 2147483647) throw new SourceHostError('SOURCE_HOST_PROTOCOL')
    return Number(value)
}
export function hostManga(value: unknown) {
    const row = object(value)
    return { id: hostInteger(row.id), sourceId: suwayomiSourceId(row.sourceId), url: text(row.url, 2048), title: text(row.title, 500) }
}
export function hostChapter(value: unknown) {
    const row = object(value), pageCount = hostInteger(row.pageCount, true)
    if (pageCount > 10000 || typeof row.chapterNumber !== 'number' || !Number.isFinite(row.chapterNumber)) throw new SourceHostError('SOURCE_HOST_PROTOCOL')
    return { id: hostInteger(row.id), mangaId: hostInteger(row.mangaId), url: text(row.url, 2048), name: text(row.name, 500), sourceOrder: hostInteger(row.sourceOrder, true), pageCount, chapterNumber: row.chapterNumber }
}
export type HostManga = ReturnType<typeof hostManga>
export type HostChapter = ReturnType<typeof hostChapter>
export function hostLibraryPage(value: unknown) {
    const data = object(sourceHostData(value).mangas), page = object(data.pageInfo)
    if (!Array.isArray(data.nodes) || data.nodes.length > 25 || typeof page.hasNextPage !== 'boolean') throw new SourceHostError('SOURCE_HOST_PROTOCOL')
    const mangas = data.nodes.map(hostManga)
    if (new Set(mangas.map(row => row.id)).size !== mangas.length) throw new SourceHostError('SOURCE_HOST_PROTOCOL')
    return { mangas, hasNext: page.hasNextPage }
}
export function hostMangaChapters(value: unknown) {
    const data = object(sourceHostData(value).manga), manga = hostManga(data), chapters = object(data.chapters).nodes
    if (!Array.isArray(chapters) || chapters.length > 2000) throw new SourceHostError('SOURCE_HOST_TOO_LARGE')
    const rows = chapters.map(hostChapter)
    if (rows.some(row => row.mangaId !== manga.id) || new Set(rows.map(row => row.id)).size !== rows.length || new Set(rows.map(row => row.url)).size !== rows.length) throw new SourceHostError('SOURCE_HOST_PROTOCOL')
    return { manga, chapters: rows }
}
export function hostChapterPages(value: unknown, expected: HostChapter) {
    const data = object(sourceHostData(value).fetchChapterPages), chapter = hostChapter(data.chapter)
    if (chapter.id !== expected.id || chapter.mangaId !== expected.mangaId || chapter.url !== expected.url || chapter.sourceOrder !== expected.sourceOrder) throw new SourceHostError('SOURCE_HOST_STALE')
    if (!Array.isArray(data.pages) || data.pages.length !== chapter.pageCount || !data.pages.length || data.pages.length > 10000) throw new SourceHostError('SOURCE_HOST_PROTOCOL')
    const paths = data.pages.map((route, index) => {
        const expectedPath = `/api/v1/manga/${chapter.mangaId}/chapter/${chapter.sourceOrder}/page/${index}`
        if (route !== expectedPath) throw new SourceHostError('SOURCE_HOST_PROTOCOL')
        return expectedPath.slice(1)
    })
    return { chapter, paths }
}
