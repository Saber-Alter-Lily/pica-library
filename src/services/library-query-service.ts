import { normalizeAuthorKey } from '../library/author'
import type { LibraryDatabase } from '../library/database'
import type {
    FacetOption,
    LibraryFacetQuery,
    LibraryQueryResult,
    StoredComic
} from '../library/types'

export class LibraryQueryService {
    constructor(private readonly database: LibraryDatabase) {}

    private normalize(input: LibraryFacetQuery = {}): LibraryFacetQuery {
        return {
            scope: input.scope ?? 'library',
            text: input.text?.trim() || undefined,
            authorIds: [...new Set(input.authorIds ?? [])],
            tags: [
                ...new Set((input.tags ?? []).map((item) => item.trim()))
            ].filter(Boolean),
            tagMode: input.tagMode ?? 'all',
            providerIds: [...new Set(input.providerIds ?? [])].filter(
                (value): value is 'pica' | 'eh' =>
                    value === 'pica' || value === 'eh'
            ),
            finished: input.finished,
            download: input.download,
            sort: input.sort ?? 'latest',
            limit: Math.max(1, Math.min(input.limit ?? 100, 5000)),
            offset: Math.max(0, input.offset ?? 0)
        }
    }

    private evaluate(input: LibraryFacetQuery = {}) {
        const query = this.normalize(input)
        const text = normalizeAuthorKey(query.text ?? '')
        const authorById = text
            ? new Map(
                  this.database
                      .listAuthors()
                      .map((author) => [author.id, author] as const)
              )
            : new Map()
        const tags = (query.tags ?? []).map(normalizeAuthorKey)
        const items = this.database
            .listComicsForLibraryQueryBase(query)
            .filter((comic) => {
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
        const authorLabels = new Map<string, string>()
        const tagCounts = new Map<string, { label: string; count: number }>()
        for (const comic of items) {
            if (comic.authorId) {
                authorCounts.set(
                    comic.authorId,
                    (authorCounts.get(comic.authorId) ?? 0) + 1
                )
                if (!authorLabels.has(comic.authorId))
                    authorLabels.set(
                        comic.authorId,
                        comic.canonicalAuthor ?? comic.author ?? comic.authorId
                    )
            }
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
                label:
                    authorById.get(value)?.canonicalName ??
                    authorLabels.get(value) ??
                    value,
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
            query,
            items,
            facets: { authors: authorFacets, tags: tagFacets }
        }
    }

    query(input: LibraryFacetQuery = {}): LibraryQueryResult {
        const evaluated = this.evaluate(input)
        const offset = evaluated.query.offset ?? 0
        const limit = evaluated.query.limit ?? 100
        return {
            items: evaluated.items.slice(offset, offset + limit),
            total: evaluated.items.length,
            facets: evaluated.facets,
            query: evaluated.query
        }
    }

    allIds(input: LibraryFacetQuery) {
        return this.evaluate({ ...input, offset: 0 }).items.map(
            (comic) => comic.comicId
        )
    }
}
