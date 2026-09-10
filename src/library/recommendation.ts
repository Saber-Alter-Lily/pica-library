import { normalizeAuthorKey } from './author'
import type {
    PreferenceItem,
    RecallRoute,
    RecommendationAudit,
    RecommendationCandidate,
    RecommendationProfile,
    RecommendationResult,
    StoredComic
} from './types'

const profileLimit = 20
const routeNames: RecallRoute[] = [
    'related',
    'author',
    'tag',
    'category',
    'circle'
]

function key(value: unknown) {
    return normalizeAuthorKey(value)
}

function add(map: Map<string, PreferenceItem>, raw: string, amount = 1) {
    const value = raw.trim()
    const normalized = key(value)
    if (!value || !normalized) return
    const current = map.get(normalized)
    if (current) {
        current.count += 1
        current.weight += amount
    } else map.set(normalized, { value, count: 1, weight: amount })
}

function ranked(map: Map<string, PreferenceItem>, limit = profileLimit) {
    return [...map.values()]
        .sort(
            (a, b) =>
                b.weight - a.weight ||
                b.count - a.count ||
                a.value.localeCompare(b.value)
        )
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
        comic.tags.forEach((value) => add(tags, value))
        comic.categories.forEach((value) => add(categories, value))
        add(authors, comic.canonicalAuthor ?? comic.author)
        if (comic.circle) add(circles, comic.circle)
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

function featureKeys(comic: StoredComic) {
    return {
        author: key(comic.canonicalAuthor ?? comic.author),
        circle: key(comic.circle),
        tags: comic.tags.map(key).filter(Boolean),
        categories: comic.categories.map(key).filter(Boolean)
    }
}

export function selectDiversifiedSeeds(
    favorites: StoredComic[],
    budget = 12
): StoredComic[] {
    const limit = Math.max(1, Math.min(16, budget))
    const remaining = [...favorites].sort((a, b) =>
        a.comicId.localeCompare(b.comicId)
    )
    const selected: StoredComic[] = []
    const usedAuthors = new Map<string, number>()
    const usedCircles = new Map<string, number>()
    const usedTags = new Map<string, number>()
    while (remaining.length && selected.length < limit) {
        remaining.sort((left, right) => {
            const score = (comic: StoredComic) => {
                const features = featureKeys(comic)
                const novelty =
                    (usedAuthors.has(features.author) ? 0 : 5) +
                    (features.circle && !usedCircles.has(features.circle)
                        ? 3
                        : 0) +
                    features.tags
                        .slice(0, 5)
                        .reduce(
                            (sum, tag) => sum + (usedTags.has(tag) ? 0 : 1),
                            0
                        )
                const recency = Date.parse(comic.updatedAt ?? '') || 0
                const information = Math.min(
                    4,
                    comic.tags.length + comic.categories.length
                )
                const dominance =
                    (usedAuthors.get(features.author) ?? 0) * 6 +
                    (features.circle
                        ? (usedCircles.get(features.circle) ?? 0) * 3
                        : 0)
                return (
                    novelty * 100 +
                    information * 10 +
                    recency / 1e12 -
                    dominance * 100
                )
            }
            return (
                score(right) - score(left) ||
                left.comicId.localeCompare(right.comicId)
            )
        })
        const chosen = remaining.shift()!
        selected.push(chosen)
        const features = featureKeys(chosen)
        usedAuthors.set(
            features.author,
            (usedAuthors.get(features.author) ?? 0) + 1
        )
        if (features.circle)
            usedCircles.set(
                features.circle,
                (usedCircles.get(features.circle) ?? 0) + 1
            )
        for (const tag of features.tags.slice(0, 5))
            usedTags.set(tag, (usedTags.get(tag) ?? 0) + 1)
    }
    return selected
}

export function mergeRecallCandidates(
    recalled: RecommendationCandidate[]
): RecommendationCandidate[] {
    const merged = new Map<string, RecommendationCandidate>()
    for (const candidate of recalled) {
        const current = merged.get(candidate.comic.comicId)
        if (!current) {
            merged.set(candidate.comic.comicId, {
                comic: candidate.comic,
                recalls: [...candidate.recalls]
            })
            continue
        }
        const seen = new Set(
            current.recalls.map(
                (item) =>
                    `${item.route}:${item.source}:${item.seedComicId ?? ''}`
            )
        )
        for (const evidence of candidate.recalls) {
            const id = `${evidence.route}:${evidence.source}:${evidence.seedComicId ?? ''}`
            if (!seen.has(id)) current.recalls.push(evidence)
        }
    }
    return [...merged.values()].sort((a, b) =>
        a.comic.comicId.localeCompare(b.comic.comicId)
    )
}

function preferenceMap(items: PreferenceItem[]) {
    const max = Math.max(1, ...items.map((item) => item.count))
    return new Map(
        items.map((item) => [key(item.value), item.count / max] as const)
    )
}

function provenanceMap(candidates: RecommendationCandidate[]) {
    return new Map(candidates.map((item) => [item.comic.comicId, item.recalls]))
}

function maxAuthorCount(items: RecommendationResult[]) {
    const counts = new Map<string, number>()
    for (const item of items) {
        const author = key(item.comic.canonicalAuthor ?? item.comic.author)
        counts.set(author, (counts.get(author) ?? 0) + 1)
    }
    return Math.max(0, ...counts.values())
}

export function recommendComics(
    records: StoredComic[],
    limit = 30,
    candidates: RecommendationCandidate[] = []
): {
    profile: RecommendationProfile
    recommendations: RecommendationResult[]
    audit: RecommendationAudit
} {
    const profile = buildRecommendationProfile(records)
    const favoriteIds = new Set(
        records
            .filter((comic) => comic.isFavorite)
            .map((comic) => comic.comicId)
    )
    const recalls = provenanceMap(candidates)
    const pool = candidates.length
        ? candidates
              .map((item) =>
                  records.find(
                      (record) => record.comicId === item.comic.comicId
                  )
              )
              .filter((comic): comic is StoredComic => Boolean(comic))
        : records.filter((comic) => !comic.isFavorite)
    const authors = preferenceMap(profile.authors)
    const circles = preferenceMap(profile.circles)
    const tags = preferenceMap(profile.tags)
    const categories = preferenceMap(profile.categories)
    const scored = pool
        .filter((comic) => !favoriteIds.has(comic.comicId))
        .map((comic): RecommendationResult => {
            const matchedSignals: string[] = []
            let affinity = 0
            const author = key(comic.canonicalAuthor ?? comic.author)
            const authorAffinity = authors.get(author) ?? 0
            if (authorAffinity) {
                affinity += authorAffinity * 0.34
                matchedSignals.push(`author:${author}`)
            }
            const circle = key(comic.circle)
            const circleAffinity = circles.get(circle) ?? 0
            if (circleAffinity) {
                affinity += circleAffinity * 0.16
                matchedSignals.push(`circle:${circle}`)
            }
            for (const tag of comic.tags.map(key)) {
                const value = tags.get(tag) ?? 0
                if (value) {
                    affinity += Math.min(0.28, value * 0.1)
                    matchedSignals.push(`tag:${tag}`)
                }
            }
            for (const category of comic.categories.map(key)) {
                const value = categories.get(category) ?? 0
                if (value) {
                    affinity += Math.min(0.16, value * 0.08)
                    matchedSignals.push(`category:${category}`)
                }
            }
            const evidence = recalls.get(comic.comicId) ?? []
            const routeSet = new Set(evidence.map((item) => item.route))
            const routeSupport = Math.min(0.15, routeSet.size * 0.04)
            const finishFit =
                comic.finished === profile.finishedRatio >= 0.5 ? 0.04 : 0
            const popularity =
                Math.min(1, Math.log10(1 + (comic.totalLikes ?? 0)) / 6) * 0.08
            const score = affinity + routeSupport + finishFit + popularity
            const recallSources = [...routeSet].sort()
            const reasons = [
                ...matchedSignals.slice(0, 3),
                ...recallSources.map((route) => `recall:${route}`)
            ].slice(0, 4)
            return {
                comic,
                score: Number(score.toFixed(4)),
                reasons,
                recallSources,
                matchedSignals,
                exploration: false
            }
        })
        .filter((item) => item.matchedSignals.length > 0)
        .sort(
            (a, b) =>
                b.score - a.score ||
                a.comic.comicId.localeCompare(b.comic.comicId)
        )

    const output: RecommendationResult[] = []
    const authorCounts = new Map<string, number>()
    const circleCounts = new Map<string, number>()
    const explorationCandidates = scored
        .filter((item) => item.score > 0 && item.score < 0.45)
        .sort(
            (a, b) =>
                a.score - b.score ||
                a.comic.comicId.localeCompare(b.comic.comicId)
        )
    const explorationTarget = Math.min(
        explorationCandidates.length,
        limit >= 7 ? Math.max(1, Math.floor(limit * 0.15)) : 0
    )
    const exploration = explorationCandidates.slice(0, explorationTarget)
    const explorationIds = new Set(
        exploration.map((item) => item.comic.comicId)
    )
    const addItem = (item: RecommendationResult) => {
        const author = key(item.comic.canonicalAuthor ?? item.comic.author)
        const circle = key(item.comic.circle)
        if ((authorCounts.get(author) ?? 0) >= 2) return false
        if (circle && (circleCounts.get(circle) ?? 0) >= 3) return false
        item.exploration = explorationIds.has(item.comic.comicId)
        output.push(item)
        authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1)
        if (circle)
            circleCounts.set(circle, (circleCounts.get(circle) ?? 0) + 1)
        return true
    }
    const exploitation = scored.filter(
        (item) => !explorationIds.has(item.comic.comicId)
    )
    const exploitationBudget = Math.max(0, limit - explorationTarget)
    for (const item of exploitation) {
        if (output.length >= exploitationBudget) break
        addItem(item)
    }
    for (const item of exploration) {
        if (output.length >= limit) break
        addItem(item)
    }
    for (const item of exploitation) {
        if (output.length >= limit) break
        if (!output.includes(item)) addItem(item)
    }

    const routeCounts = Object.fromEntries(
        routeNames.map((route) => [route, 0])
    ) as Record<RecallRoute, number>
    for (const candidate of candidates)
        for (const route of new Set(
            candidate.recalls.map((item) => item.route)
        ))
            routeCounts[route] += 1
    const seeds = candidates
        .flatMap((item) => item.recalls)
        .filter((item) => item.seedComicId)
    const seedIds = new Set(seeds.map((item) => item.seedComicId!))
    const seedRecords = records.filter((item) => seedIds.has(item.comicId))
    return {
        profile,
        recommendations: output,
        audit: {
            favoriteCount: profile.favoriteCount,
            seedCount: seedIds.size,
            seedAuthorDiversity: new Set(
                seedRecords.map((item) =>
                    key(item.canonicalAuthor ?? item.author)
                )
            ).size,
            seedTagDiversity: new Set(
                seedRecords.flatMap((item) => item.tags.map(key))
            ).size,
            candidateCountByRecallRoute: routeCounts,
            deduplicatedCandidateCount: candidates.length,
            alreadyFavoriteExcludedCount: candidates.filter((item) =>
                favoriteIds.has(item.comic.comicId)
            ).length,
            finalRecommendationCount: output.length,
            maxSameAuthorInTopN: maxAuthorCount(output),
            explorationCount: output.filter((item) => item.exploration).length
        }
    }
}
