import { normalizeAuthorKey } from '../library/author'
import type { LibraryDatabase } from '../library/database'
import type {
    FacetOption,
    LibraryFacetQuery,
    LibraryQueryResult,
    StoredComic
} from '../library/types'

function downloadedState(comic: StoredComic) {
    if (comic.downloadedPictures === 0) return 'not-downloaded'
    if (
        comic.knownPictures > 0 &&
        comic.downloadedPictures >= comic.knownPictures
    )
        return 'complete'
    return 'partial'
}

export class LibraryQueryService {
    constructor(private readonly database: LibraryDatabase) {}

    query(input: LibraryFacetQuery = {}): LibraryQueryResult {
        const query: LibraryFacetQuery = {
            scope: input.scope ?? 'all',
            text: input.text?.trim() || undefined,
            authorIds: [...new Set(input.authorIds ?? [])],
            tags: [
                ...new Set((input.tags ?? []).map((item) => item.trim()))
            ].filter(Boolean),
            tagMode: input.tagMode ?? 'all',
            finished: input.finished,
            download: input.download,
            sort: input.sort ?? 'latest',
            limit: Math.max(1, Math.min(input.limit ?? 100, 5000)),
            offset: Math.max(0, input.offset ?? 0)
        }
        const authors = this.database.listAuthors()
        const authorById = new Map(authors.map((author) => [author.id, author]))
        const text = normalizeAuthorKey(query.text ?? '')
        const tags = (query.tags ?? []).map(normalizeAuthorKey)
        const selectedAuthors = new Set(query.authorIds ?? [])
        const items = this.database
            .listComics({ limit: 5000 })
            .filter((comic) => {
                if (query.scope === 'favorites' && !comic.isFavorite)
                    return false
                if (
                    query.scope === 'downloaded' &&
                    comic.downloadedPictures === 0
                )
                    return false
                if (
                    query.finished !== undefined &&
                    comic.finished !== query.finished
                )
                    return false
                const state = downloadedState(comic)
                if (
                    query.download === 'downloaded' &&
                    state === 'not-downloaded'
                )
                    return false
                if (
                    query.download &&
                    query.download !== 'downloaded' &&
                    state !== query.download
                )
                    return false
                if (
                    selectedAuthors.size &&
                    (!comic.authorId || !selectedAuthors.has(comic.authorId))
                )
                    return false
                if (text) {
                    const author = comic.authorId
                        ? authorById.get(comic.authorId)
                        : undefined
                    const values = [
                        comic.title,
                        comic.author,
                        comic.canonicalAuthor ?? '',
                        ...(author?.aliases ?? [])
                    ]
                    if (
                        !values.some((value) =>
                            normalizeAuthorKey(value).includes(text)
                        )
                    )
                        return false
                }
                const comicTags = new Set(comic.tags.map(normalizeAuthorKey))
                if (
                    tags.length &&
                    (query.tagMode === 'any'
                        ? !tags.some((tag) => comicTags.has(tag))
                        : !tags.every((tag) => comicTags.has(tag)))
                )
                    return false
                return true
            })
        const total = items.length
        const direction = query.sort === 'oldest' ? 1 : -1
        items.sort((left, right) => {
            if (query.sort === 'title')
                return left.title.localeCompare(right.title)
            if (query.sort === 'likes')
                return (right.totalLikes ?? 0) - (left.totalLikes ?? 0)
            if (query.sort === 'views')
                return (right.totalViews ?? 0) - (left.totalViews ?? 0)
            return (
                String(left.updatedAt ?? '').localeCompare(
                    String(right.updatedAt ?? '')
                ) * direction
            )
        })
        const authorCounts = new Map<string, number>()
        const tagCounts = new Map<string, { label: string; count: number }>()
        for (const comic of items) {
            if (comic.authorId)
                authorCounts.set(
                    comic.authorId,
                    (authorCounts.get(comic.authorId) ?? 0) + 1
                )
            for (const tag of comic.tags) {
                const key = normalizeAuthorKey(tag)
                const current = tagCounts.get(key)
                tagCounts.set(key, {
                    label: current?.label ?? tag,
                    count: (current?.count ?? 0) + 1
                })
            }
        }
        const authorFacets: FacetOption[] = [...authorCounts.entries()]
            .map(([value, count]) => ({
                value,
                label: authorById.get(value)?.canonicalName ?? value,
                count
            }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        const tagFacets: FacetOption[] = [...tagCounts.entries()]
            .map(([value, item]) => ({
                value,
                label: item.label,
                count: item.count
            }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        return {
            items: items.slice(
                query.offset ?? 0,
                (query.offset ?? 0) + (query.limit ?? 100)
            ),
            total,
            facets: { authors: authorFacets, tags: tagFacets },
            query
        }
    }

    allIds(input: LibraryFacetQuery) {
        return this.query({ ...input, limit: 5000, offset: 0 }).items.map(
            (comic) => comic.comicId
        )
    }
}
