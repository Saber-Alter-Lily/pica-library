import type { StoredComic } from '../library/types'
import { recommendationTags, semanticTagFeatures } from './semantic-core'
import type { V3Profile } from './types'

export interface RecommendationIntent {
    clusterId: string
    intentWeight: number
    coreSemanticTags: string[]
    secondarySemanticTags: string[]
    fandoms: string[]
    authors: string[]
    genres: string[]
    styleModifiers: string[]
    formatModifiers: string[]
    positiveItemSeeds: string[]
    behaviorEvidence: string[]
}

export interface SemanticQueryPlan {
    intent: RecommendationIntent
    routes: Array<{
        kind: 'tag' | 'fandom' | 'author' | 'genre'
        query: string
        anchor?: string
        maxPages: number
        targetCandidates: number
    }>
}

export const SEMANTIC_RETRIEVAL_CONFIG = {
    maxPagesPerSemanticRoute: 3,
    maxRequestsPerIntent: 8,
    targetCandidatesPerIntent: 120,
    maxIntents: 8
} as const

function top(values: string[], limit: number) {
    return [...new Set(values.filter(Boolean))].slice(0, limit)
}

export function selectAnchor(tags: string[]) {
    return [...new Set(tags.filter(Boolean))].sort(
        (a, b) => a.length - b.length || a.localeCompare(b)
    )[0]
}

export function buildRecommendationIntents(
    profile: V3Profile,
    favorites: StoredComic[]
): RecommendationIntent[] {
    const byId = new Map(favorites.map((comic) => [comic.comicId, comic]))
    const clusters = profile.historical.clusters.slice(
        0,
        SEMANTIC_RETRIEVAL_CONFIG.maxIntents
    )
    return clusters.map((cluster) => {
        const members = cluster.itemIds
            .map((id) => byId.get(id))
            .filter((comic): comic is StoredComic => Boolean(comic))
        const features = members.flatMap((comic) => semanticTagFeatures(comic))
        const core = features
            .filter(
                (feature) =>
                    feature.recommendationRole === 'CORE' &&
                    feature.facet !== 'FANDOM_IP'
            )
            .map((feature) => feature.canonical)
        const secondary = features
            .filter((feature) => feature.recommendationRole === 'SECONDARY')
            .map((feature) => feature.canonical)
        const fandoms = features
            .filter((feature) => feature.facet === 'FANDOM_IP')
            .map((feature) => feature.canonical)
        const styleModifiers = features
            .filter((feature) => feature.facet === 'VISUAL_STYLE')
            .map((feature) => feature.canonical)
        const formatModifiers = features
            .filter((feature) => feature.facet === 'FORMAT')
            .map((feature) => feature.canonical)
        const authors = members
            .map((comic) => comic.canonicalAuthor ?? comic.author)
            .filter(Boolean)
        const genres = members.flatMap((comic) => comic.categories)
        return {
            clusterId: cluster.clusterId,
            intentWeight: cluster.weight,
            coreSemanticTags: top(core, 6),
            secondarySemanticTags: top(secondary, 6),
            fandoms: top(fandoms, 4),
            authors: top(authors, 3),
            genres: top(genres, 3),
            styleModifiers: top(styleModifiers, 2),
            formatModifiers: top(formatModifiers, 2),
            positiveItemSeeds: top(cluster.itemIds, 4),
            behaviorEvidence: []
        }
    })
}

export function planSemanticQueries(
    intents: RecommendationIntent[],
    config = SEMANTIC_RETRIEVAL_CONFIG
): SemanticQueryPlan[] {
    return intents.map((intent) => {
        const routes: SemanticQueryPlan['routes'] = []
        const add = (
            kind: 'tag' | 'fandom' | 'author' | 'genre',
            query: string,
            anchor?: string
        ) => {
            if (routes.length >= config.maxRequestsPerIntent || !query) return
            routes.push({
                kind,
                query,
                anchor,
                maxPages: config.maxPagesPerSemanticRoute,
                targetCandidates: config.targetCandidatesPerIntent
            })
        }
        for (const tag of intent.coreSemanticTags)
            add('tag', tag, selectAnchor([tag]))
        for (const fandom of intent.fandoms) add('fandom', fandom, fandom)
        for (const author of intent.authors) add('author', author, author)
        for (const genre of intent.genres) add('genre', genre, genre)
        return { intent, routes }
    })
}

export function applyLocalSemanticConjunction(
    comics: StoredComic[],
    intent: RecommendationIntent
) {
    const wanted = new Set(
        [...intent.coreSemanticTags, ...intent.secondarySemanticTags].map(
            (tag) => tag.toLocaleLowerCase('und')
        )
    )
    if (!wanted.size) return comics
    return comics.filter((comic) => {
        const values = new Set(
            recommendationTags(comic).map((feature) =>
                feature.canonical.toLocaleLowerCase('und')
            )
        )
        return (
            intent.coreSemanticTags.every((tag) =>
                values.has(tag.toLocaleLowerCase('und'))
            ) || [...wanted].some((tag) => values.has(tag))
        )
    })
}
