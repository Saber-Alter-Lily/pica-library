import { authorIdForKey, parseAuthorIdentity } from '../library/author'

// A presentation is one confirmed batch, not a pool build, cached read or
// individual card impression. The ring is stored newest first.
export const PRESENTED_BATCH_WINDOW = 10
export const AUTHOR_HISTORY_BATCHES = 2
export const AUTHOR_BATCH_CAP = 2
export const AUTHOR_ROLLING_CAP = 4
export const PRESENTATION_STATE_KEY = 'recommendation.v3.presentedBatches.v1'

export interface PresentedBatchV3 {
    batchId: string
    itemIds: string[]
}

export function batchAuthorKey(comic: {
    authorId: string | null
    canonicalAuthor: string | null
}): string | null {
    if (!comic.canonicalAuthor) return null
    const author = parseAuthorIdentity(comic.canonicalAuthor)
    if (
        author.genericLabel ||
        author.multiCreator ||
        /^(?:anonymous|unknown|null|undefined|未知|不详|无|匿名|佚名|\(missing\)|[-?]+)$/iu.test(
            author.normalizedKey
        )
    )
        return null
    return comic.authorId || authorIdForKey(author.normalizedKey)
}

export function batchFreshness(
    presentations: readonly PresentedBatchV3[],
    authorByComic: ReadonlyMap<string, string>
) {
    const recentlyDisplayedComicIds = new Set<string>()
    const recentAuthorCounts = new Map<string, number>()
    for (const [index, batch] of presentations
        .slice(0, PRESENTED_BATCH_WINDOW)
        .entries()) {
        for (const id of new Set(batch.itemIds)) {
            recentlyDisplayedComicIds.add(id)
            const author =
                index < AUTHOR_HISTORY_BATCHES && authorByComic.get(id)
            if (author)
                recentAuthorCounts.set(
                    author,
                    (recentAuthorCounts.get(author) ?? 0) + 1
                )
        }
    }
    return { recentlyDisplayedComicIds, recentAuthorCounts }
}
