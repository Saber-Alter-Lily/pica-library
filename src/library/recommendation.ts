import { normalizeAuthorKey } from './author'
import type {
    PreferenceItem,
    RecommendationProfile,
    RecommendationResult,
    StoredComic
} from './types'

function add(map: Map<string, PreferenceItem>, raw: string, amount = 1) {
    const value = raw.trim()
    const key = normalizeAuthorKey(value)
    if (!value || !key) return
    const current = map.get(key)
    if (current) {
        current.count += 1
        current.weight += amount
    } else map.set(key, { value, count: 1, weight: amount })
}

function ranked(map: Map<string, PreferenceItem>, limit = 20) {
    return [...map.values()]
        .sort((a, b) => b.weight - a.weight || b.count - a.count)
        .slice(0, limit)
}

export function buildRecommendationProfile(
    records: StoredComic[]
): RecommendationProfile {
    const favorites = records.filter((comic) => comic.isFavorite)
    const tags = new Map<string, PreferenceItem>()
    const categories = new Map<string, PreferenceItem>()
    const authors = new Map<string, PreferenceItem>()
    const circles = new Map<string, PreferenceItem>()
    for (const comic of favorites) {
        // A small popularity adjustment prevents one obscure item from dominating.
        const weight =
            1 + Math.min(1, Math.log10(1 + (comic.totalLikes ?? 0)) / 5)
        comic.tags.forEach((value) => add(tags, value, weight))
        comic.categories.forEach((value) => add(categories, value, weight))
        add(authors, comic.canonicalAuthor ?? comic.author, weight)
        if (comic.circle) add(circles, comic.circle, weight)
    }
    return {
        favoriteCount: favorites.length,
        finishedRatio:
            favorites.length === 0
                ? 0
                : favorites.filter((comic) => comic.finished).length /
                  favorites.length,
        tags: ranked(tags),
        categories: ranked(categories),
        authors: ranked(authors),
        circles: ranked(circles)
    }
}

function preferenceMap(items: PreferenceItem[]) {
    return new Map(items.map((item) => [normalizeAuthorKey(item.value), item]))
}

export function recommendComics(
    records: StoredComic[],
    limit = 30
): { profile: RecommendationProfile; recommendations: RecommendationResult[] } {
    const profile = buildRecommendationProfile(records)
    const tags = preferenceMap(profile.tags)
    const categories = preferenceMap(profile.categories)
    const authors = preferenceMap(profile.authors)
    const circles = preferenceMap(profile.circles)
    const scored = records
        .filter((comic) => !comic.isFavorite)
        .map((comic): RecommendationResult => {
            const reasons: Array<{ value: string; points: number }> = []
            let affinity = 0
            for (const tag of comic.tags) {
                const match = tags.get(normalizeAuthorKey(tag))
                if (!match) continue
                const points = Math.min(12, 3 + Math.log2(1 + match.count) * 2)
                affinity += points
                reasons.push({ value: `常看 Tag：${tag}`, points })
            }
            for (const category of comic.categories) {
                const match = categories.get(normalizeAuthorKey(category))
                if (!match) continue
                const points = Math.min(8, 2 + Math.log2(1 + match.count) * 1.5)
                affinity += points
                reasons.push({ value: `偏好分类：${category}`, points })
            }
            const author = comic.canonicalAuthor ?? comic.author
            const authorMatch = authors.get(normalizeAuthorKey(author))
            if (authorMatch) {
                const points =
                    8 + Math.min(8, Math.log2(1 + authorMatch.count) * 2)
                affinity += points
                reasons.push({ value: `常看作者：${author}`, points })
            }
            const circleMatch = comic.circle
                ? circles.get(normalizeAuthorKey(comic.circle))
                : undefined
            if (circleMatch) {
                affinity += 5
                reasons.push({ value: `常看社团：${comic.circle}`, points: 5 })
            }
            const finishFit =
                profile.favoriteCount > 0 &&
                comic.finished === profile.finishedRatio >= 0.5
                    ? 2
                    : 0
            const popularity =
                Math.log10(1 + (comic.totalLikes ?? 0)) * 1.2 +
                Math.log10(1 + (comic.totalViews ?? 0)) * 0.35
            if (popularity >= 5)
                reasons.push({ value: '站内热度较高', points: popularity })
            return {
                comic,
                score: Number((affinity + finishFit + popularity).toFixed(2)),
                reasons: reasons
                    .sort((a, b) => b.points - a.points)
                    .slice(0, 3)
                    .map((reason) => reason.value)
            }
        })
        .filter((item) => item.reasons.length > 0)
        .sort((a, b) => b.score - a.score)

    // Keep the first page varied instead of filling it with one prolific author.
    const perAuthor = new Map<string, number>()
    const recommendations = scored.filter((item) => {
        const author = normalizeAuthorKey(
            item.comic.canonicalAuthor ?? item.comic.author
        )
        const count = perAuthor.get(author) ?? 0
        if (count >= 2) return false
        perAuthor.set(author, count + 1)
        return true
    })
    return { profile, recommendations: recommendations.slice(0, limit) }
}
