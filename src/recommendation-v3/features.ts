import { normalizeAuthorKey } from '../library/author'
import type { StoredComic } from '../library/types'
import type { ItemFeature } from './types'
import { recommendationTags } from './semantic-core'

export interface TagStats {
    catalogCount: number
    documentCount: number
    idf: number
    informativeness: number
}

export function normalizeFeatureValue(value: unknown) {
    return String(value ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase('und')
        .replace(/[\u200b-\u200d\ufeff]/g, '')
        .trim()
}

function unique(values: unknown[]) {
    return [
        ...new Set(values.map(normalizeFeatureValue).filter(Boolean))
    ].sort()
}

export function lengthBucket(
    comic: Pick<StoredComic, 'pagesCount' | 'epsCount'>
): ItemFeature['lengthBucket'] {
    const pages = Number(comic.pagesCount || 0)
    const eps = Number(comic.epsCount || 0)
    if (!pages && !eps) return 'unknown'
    const size = pages + eps * 40
    return size <= 40 ? 'short' : size <= 160 ? 'medium' : 'long'
}

export function popularityBucket(
    likes = 0,
    views = 0
): ItemFeature['popularityBucket'] {
    const score =
        Math.log10(1 + Math.max(0, likes)) + Math.log10(1 + Math.max(0, views))
    return score < 3 ? 'low' : score < 6 ? 'medium' : 'high'
}

export function itemFeature(comic: StoredComic): ItemFeature {
    const semantic = recommendationTags(comic).map(
        (feature) => feature.canonical
    )
    return {
        comicId: comic.comicId,
        author: normalizeFeatureValue(comic.canonicalAuthor ?? comic.author),
        circle: normalizeFeatureValue(comic.circle),
        tags: unique(semantic),
        categories: unique(comic.categories),
        finished: Boolean(comic.finished),
        lengthBucket: lengthBucket(comic),
        popularityBucket: popularityBucket(comic.totalLikes, comic.totalViews)
    }
}

export function featureSimilarity(
    left: ItemFeature,
    right: ItemFeature,
    stats?: Map<string, TagStats>
) {
    const overlap = (a: string[], b: string[]) => {
        const bSet = new Set(b)
        if (!a.length) return 0
        const weight = (x: string) => stats?.get(x)?.informativeness ?? 1
        const totalA = a.reduce((s, x) => s + weight(x), 0),
            totalB = b.reduce((s, x) => s + weight(x), 0)
        const common = a
            .filter((x) => bSet.has(x))
            .reduce((s, x) => s + weight(x), 0)
        return common / Math.max(totalA, totalB, 1)
    }
    return (
        (left.author && left.author === right.author ? 0.35 : 0) +
        (left.circle && left.circle === right.circle ? 0.15 : 0) +
        overlap(left.tags, right.tags) * 0.3 +
        overlap(left.categories, right.categories) * 0.15 +
        (left.finished === right.finished ? 0.025 : 0) +
        (left.lengthBucket === right.lengthBucket ? 0.025 : 0)
    )
}

export function featureKey(comic: StoredComic) {
    const f = itemFeature(comic)
    return [normalizeAuthorKey(f.author), f.circle, ...f.tags, ...f.categories]
        .filter(Boolean)
        .join('|')
}
