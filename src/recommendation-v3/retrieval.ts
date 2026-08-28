import type { StoredComic } from '../library/types'
import type { RecallTelemetry } from './types'

export const RETRIEVAL_CONFIG = {
    maxPagesPerRoute: 3,
    maxRequestsPerCycle: 32,
    targetCandidates: 1000,
    maxCandidates: 1500
} as const

export function conjunctionFilter(comics: StoredComic[], tags: string[]) {
    const wanted = new Set(
        tags
            .map((tag) => tag.normalize('NFKC').trim().toLocaleLowerCase())
            .filter(Boolean)
    )
    return comics.filter((comic) => {
        const values = new Set(
            comic.tags.map((tag) =>
                tag.normalize('NFKC').trim().toLocaleLowerCase()
            )
        )
        return [...wanted].every((tag) => values.has(tag))
    })
}

export function mergeCandidateIds(
    routeResults: string[][],
    maxCandidates = RETRIEVAL_CONFIG.maxCandidates
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
