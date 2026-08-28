import type { StoredComic } from '../library/types'
import { normalizeFeatureValue } from './features'
import type { TagCombinationPreference, TagPreference } from './types'

export const COMBINATION_CONFIG = {
    maxPairs: 200,
    maxTriples: 100,
    minSupport: 1,
    reliabilityK: 5,
    smoothing: 1
} as const

function transactions(records: StoredComic[]) {
    return records.map((comic) =>
        [
            ...new Set(comic.tags.map(normalizeFeatureValue).filter(Boolean))
        ].sort()
    )
}

function combinations(tags: string[], size: 2 | 3) {
    const result: string[][] = []
    const visit = (start: number, current: string[]) => {
        if (current.length === size) {
            result.push([...current])
            return
        }
        for (let i = start; i < tags.length; i++)
            visit(i + 1, [...current, tags[i]])
    }
    visit(0, [])
    return result
}

function probability(
    count: number,
    total: number,
    smoothing = COMBINATION_CONFIG.smoothing
) {
    return (count + smoothing) / (total + smoothing * 2)
}

function interaction(pair: number, a: number, b: number, total: number) {
    return Math.log(
        probability(pair, total) /
            (probability(a, total) * probability(b, total))
    )
}

export function mineTagPreferences(
    favorites: StoredComic[],
    background: StoredComic[] = []
) {
    const favoriteTx = transactions(favorites)
    const backgroundTx = transactions(background)
    const favTotal = Math.max(1, favoriteTx.length)
    const bgTotal = Math.max(1, backgroundTx.length)
    const all = [...new Set(favoriteTx.flat())]
    const favCounts = new Map(
        all.map((tag) => [
            tag,
            favoriteTx.filter((tx) => tx.includes(tag)).length
        ])
    )
    const bgCounts = new Map(
        all.map((tag) => [
            tag,
            backgroundTx.filter((tx) => tx.includes(tag)).length
        ])
    )
    return all
        .map((tag): TagPreference => {
            const fc = favCounts.get(tag) ?? 0
            const bc = bgCounts.get(tag) ?? 0
            const fs = fc / favTotal
            const bs = bc / bgTotal
            const enrichment = Math.log(
                probability(fc, favTotal) / probability(bc, bgTotal)
            )
            const reliability = fc / (fc + COMBINATION_CONFIG.reliabilityK)
            return {
                tag,
                favoriteCount: fc,
                favoriteSupport: fs,
                backgroundCount: bc,
                backgroundSupport: bs,
                enrichment,
                reliability,
                score: enrichment * reliability
            }
        })
        .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
}

function mineSize(
    favorites: StoredComic[],
    background: StoredComic[],
    size: 2 | 3
) {
    const ft = transactions(favorites)
    const bt = transactions(background)
    const totalF = Math.max(1, ft.length)
    const totalB = Math.max(1, bt.length)
    const tags = [...new Set(ft.flat())].sort()
    const singlesF = new Map(
        tags.map((tag) => [tag, ft.filter((tx) => tx.includes(tag)).length])
    )
    const singlesB = new Map(
        tags.map((tag) => [tag, bt.filter((tx) => tx.includes(tag)).length])
    )
    return combinations(tags, size)
        .map((set): TagCombinationPreference => {
            const fc = ft.filter((tx) =>
                set.every((tag) => tx.includes(tag))
            ).length
            const bc = bt.filter((tx) =>
                set.every((tag) => tx.includes(tag))
            ).length
            const favInteraction =
                size === 2
                    ? interaction(
                          fc,
                          singlesF.get(set[0]) ?? 0,
                          singlesF.get(set[1]) ?? 0,
                          totalF
                      )
                    : Math.log(
                          probability(fc, totalF) /
                              set.reduce(
                                  (acc, tag) =>
                                      acc *
                                      probability(
                                          singlesF.get(tag) ?? 0,
                                          totalF
                                      ),
                                  1
                              )
                      )
            const bgInteraction =
                size === 2
                    ? interaction(
                          bc,
                          singlesB.get(set[0]) ?? 0,
                          singlesB.get(set[1]) ?? 0,
                          totalB
                      )
                    : Math.log(
                          probability(bc, totalB) /
                              set.reduce(
                                  (acc, tag) =>
                                      acc *
                                      probability(
                                          singlesB.get(tag) ?? 0,
                                          totalB
                                      ),
                                  1
                              )
                      )
            const specific = favInteraction - bgInteraction
            const enrichment = Math.log(
                probability(fc, totalF) / probability(bc, totalB)
            )
            const reliability = fc / (fc + COMBINATION_CONFIG.reliabilityK)
            return {
                tags: set,
                order: size,
                favoriteCount: fc,
                favoriteSupport: fc / totalF,
                backgroundCount: bc,
                backgroundSupport: bc / totalB,
                enrichment,
                withinFavoriteInteraction: favInteraction,
                backgroundInteraction: bgInteraction,
                specificInteraction: specific,
                reliability,
                score: (enrichment + specific) * reliability
            }
        })
        .filter((item) => item.favoriteCount >= COMBINATION_CONFIG.minSupport)
}

export function mineTagCombinations(
    favorites: StoredComic[],
    background: StoredComic[] = [],
    config = COMBINATION_CONFIG
) {
    const pairs = mineSize(favorites, background, 2)
        .sort(
            (a, b) =>
                b.score - a.score ||
                a.tags.join('|').localeCompare(b.tags.join('|'))
        )
        .slice(0, config.maxPairs)
    const triples = mineSize(favorites, background, 3)
        .sort(
            (a, b) =>
                b.score - a.score ||
                a.tags.join('|').localeCompare(b.tags.join('|'))
        )
        .slice(0, config.maxTriples)
    return { pairs, triples }
}

export function residualCombinationBonus(
    tags: string[],
    pairs: TagCombinationPreference[],
    triples: TagCombinationPreference[]
) {
    const normalized = new Set(tags.map(normalizeFeatureValue))
    const pair = pairs
        .filter((item) => item.tags.every((tag) => normalized.has(tag)))
        .reduce(
            (sum, item) => sum + item.specificInteraction * item.reliability,
            0
        )
    const triple = triples
        .filter((item) => item.tags.every((tag) => normalized.has(tag)))
        .reduce(
            (sum, item) => sum + item.specificInteraction * item.reliability,
            0
        )
    return {
        pair: Number.isFinite(pair) ? pair : 0,
        triple: Number.isFinite(triple) ? triple : 0
    }
}
