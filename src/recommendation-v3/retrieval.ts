import type { StoredComic } from '../library/types'
import type { RecallTelemetry } from './types'
import type { V3Profile } from './types'
import { normalizeTag, recommendationTags } from './semantic-core'

export const RETRIEVAL_CONFIG = {
    maxPagesPerRoute: 3,
    maxRequestsPerCycle: 32,
    targetCandidates: 1000,
    maxCandidates: 1500
} as const

export function conjunctionFilter(comics: StoredComic[], tags: string[]) {
    const wanted = new Set(tags.map(normalizeTag).filter(Boolean))
    return comics.filter((comic) => {
        const values = new Set(
            recommendationTags(comic).map((feature) => feature.canonical)
        )
        return [...wanted].every((tag) => values.has(tag))
    })
}

export function mergeCandidateIds(
    routeResults: string[][],
    maxCandidates: number = RETRIEVAL_CONFIG.maxCandidates
) {
    const unique: string[] = []
    const seen = new Set<string>()
    for (const result of routeResults)
        for (const id of result) {
            if (seen.has(id)) continue
            seen.add(id)
            unique.push(id)
            if (unique.length >= maxCandidates) return unique
        }
    return unique
}

export function retrievalTelemetry(
    input: Omit<RecallTelemetry, 'yield'>
): RecallTelemetry {
    return {
        ...input,
        yield: input.uniqueCandidateCount / Math.max(1, input.requestCount)
    }
}

/** Deterministic local candidate retriever used by evaluation and offline Browser Lite. */
export function retrieveV3(
    catalog: StoredComic[],
    favorites: StoredComic[],
    profile: V3Profile,
    limit: number = RETRIEVAL_CONFIG.maxCandidates
) {
    // Candidate eligibility is authoritative from the current catalog labels;
    // the favorites argument may contain non-favorite training rows.
    const favIds = new Set(
        catalog.filter((x) => x.isFavorite).map((x) => x.comicId)
    )
    const routes: string[][] = []
    routes.push(profile.historical.clusters.flatMap((c) => c.itemIds))
    routes.push(
        profile.historical.tags
            .slice(0, 40)
            .flatMap((t) =>
                conjunctionFilter(catalog, [t.tag]).map((x) => x.comicId)
            )
    )
    routes.push(
        profile.historical.pairs
            .slice(0, 20)
            .flatMap((p) =>
                conjunctionFilter(catalog, p.tags).map((x) => x.comicId)
            )
    )
    routes.push(
        profile.historical.clusters.flatMap((c) =>
            c.authors.flatMap((a) =>
                catalog
                    .filter((x) => (x.canonicalAuthor ?? x.author) === a)
                    .map((x) => x.comicId)
            )
        )
    )
    routes.push(
        catalog
            .filter((x) => !favIds.has(x.comicId))
            .sort(
                (a, b) =>
                    (b.totalLikes ?? 0) - (a.totalLikes ?? 0) ||
                    a.comicId.localeCompare(b.comicId)
            )
            .map((x) => x.comicId)
    )
    const eligibleRoutes = routes.map((route) =>
        route.filter((id) => !favIds.has(id))
    )
    return mergeCandidateIds(
        eligibleRoutes,
        Math.min(limit, RETRIEVAL_CONFIG.maxCandidates)
    )
}
