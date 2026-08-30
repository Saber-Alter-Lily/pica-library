import type { StoredComic } from '../library/types'
import { normalizeFeatureValue } from './features'
import { classifyTagFacet, semanticTagFeatures } from './semantic-core'
import type {
    BackgroundQuality,
    TagCombinationPreference,
    TagPreference
} from './types'

export const COMBINATION_CONFIG = {
    maxPairs: 200,
    maxTriples: 100,
    minSupport: 1,
    reliabilityK: 5,
    smoothing: 1,
    maxMiningTags: 80,
    pairMinCount: 1,
    tripleMinCount: 1,
    pairRelativeSupport: 0,
    tripleRelativeSupport: 0,
    maxNearUniversalSupport: 1
} as const
export type CombinationMiningConfig = Partial<
    Record<keyof typeof COMBINATION_CONFIG, number>
>
function transactions(records: StoredComic[]) {
    return records.map((c) =>
        [
            ...new Set(
                semanticTagFeatures(c)
                    .filter((feature) => feature.eligibleForCombination)
                    .map((feature) => feature.canonical)
            )
        ].sort()
    )
}
function combinations(tags: string[], size: 2 | 3) {
    const out: string[][] = []
    const visit = (start: number, cur: string[]) => {
        if (cur.length === size) {
            out.push(cur)
            return
        }
        for (let i = start; i < tags.length; i++)
            visit(i + 1, [...cur, tags[i]])
    }
    visit(0, [])
    return out
}
function countTransactions(records: StoredComic[]) {
    const singles = new Map<string, number>(),
        pairs = new Map<string, number>(),
        triples = new Map<string, number>()
    for (const tx of transactions(records)) {
        for (const t of tx) singles.set(t, (singles.get(t) ?? 0) + 1)
        for (const s of combinations(tx, 2)) {
            const k = s.join('|')
            pairs.set(k, (pairs.get(k) ?? 0) + 1)
        }
        for (const s of combinations(tx, 3)) {
            const k = s.join('|')
            triples.set(k, (triples.get(k) ?? 0) + 1)
        }
    }
    return { singles, pairs, triples }
}
function probability(count: number, total: number, smoothing: number) {
    return (count + smoothing) / Math.max(1, total + smoothing * 2)
}
function interaction(
    pair: number,
    a: number,
    b: number,
    total: number,
    smoothing: number
) {
    return Math.log(
        probability(pair, total, smoothing) /
            (probability(a, total, smoothing) *
                probability(b, total, smoothing))
    )
}
export function backgroundConfidenceFor(
    favoriteCount: number,
    catalogCount: number
) {
    if (!catalogCount) return 0
    const r = favoriteCount / catalogCount
    return r >= 0.8 ? 0.1 : r >= 0.6 ? 0.35 : r >= 0.3 ? 0.65 : 1
}
function quality(c: number, has: boolean): BackgroundQuality {
    return !has
        ? 'NONE'
        : c >= 0.8
          ? 'OBSERVED_PROVIDER_CATALOG'
          : 'LOCAL_BIASED'
}
function cfg(c?: CombinationMiningConfig) {
    return { ...COMBINATION_CONFIG, ...(c ?? {}) }
}

export function mineTagPreferences(
    favorites: StoredComic[],
    background: StoredComic[] = []
) {
    const fc = countTransactions(favorites).singles,
        bc = countTransactions(background).singles
    const ft = Math.max(1, favorites.length),
        bt = Math.max(1, background.length),
        confidence = backgroundConfidenceFor(
            favorites.length,
            background.length
        )
    return [...fc.keys()]
        .map((tag): TagPreference => {
            const f = fc.get(tag) ?? 0,
                b = bc.get(tag) ?? 0,
                fs = f / ft,
                bs = b / bt,
                enrichment = Math.log(
                    probability(f, ft, 1) / probability(b, bt, 1)
                ),
                idf = Math.max(0, Math.log((1 + bt) / (1 + b))),
                reliability = f / (f + COMBINATION_CONFIG.reliabilityK)
            return {
                tag,
                favoriteCount: f,
                favoriteSupport: fs,
                backgroundCount: b,
                backgroundSupport: bs,
                enrichment,
                reliability,
                score:
                    (enrichment * confidence + fs * (1 - confidence)) *
                    reliability,
                idf,
                informativeness: idf
            }
        })
        .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
}

function mineSize(
    favorites: StoredComic[],
    background: StoredComic[],
    size: 2 | 3,
    raw?: CombinationMiningConfig
) {
    const c = cfg(raw),
        f = countTransactions(favorites),
        b = countTransactions(background),
        tf = Math.max(1, favorites.length),
        tb = Math.max(1, background.length),
        confidence = backgroundConfidenceFor(
            favorites.length,
            background.length
        )
    const allowed = new Set(
        [...f.singles.keys()]
            .sort((x, y) => {
                const sx =
                        ((f.singles.get(x) ?? 0) / tf) *
                        Math.max(
                            0,
                            Math.log((1 + tb) / (1 + (b.singles.get(x) ?? 0)))
                        ),
                    sy =
                        ((f.singles.get(y) ?? 0) / tf) *
                        Math.max(
                            0,
                            Math.log((1 + tb) / (1 + (b.singles.get(y) ?? 0)))
                        )
                return sy - sx || x.localeCompare(y)
            })
            .filter(
                (t) => (f.singles.get(t) ?? 0) / tf <= c.maxNearUniversalSupport
            )
            .slice(0, c.maxMiningTags)
    )
    const source = size === 2 ? f.pairs : f.triples,
        bg = size === 2 ? b.pairs : b.triples,
        min = size === 2 ? c.pairMinCount : c.tripleMinCount,
        rel = size === 2 ? c.pairRelativeSupport : c.tripleRelativeSupport,
        out: TagCombinationPreference[] = []
    for (const [key, count] of source) {
        const tags = key.split('|')
        if (
            !tags.every((t) => allowed.has(t)) ||
            count < Math.max(min, Math.ceil(favorites.length * rel))
        )
            continue
        const bgCount = bg.get(key) ?? 0
        const fi =
            size === 2
                ? interaction(
                      count,
                      f.singles.get(tags[0]) ?? 0,
                      f.singles.get(tags[1]) ?? 0,
                      tf,
                      c.smoothing
                  )
                : Math.log(
                      probability(count, tf, c.smoothing) /
                          tags.reduce(
                              (p, t) =>
                                  p *
                                  probability(
                                      f.singles.get(t) ?? 0,
                                      tf,
                                      c.smoothing
                                  ),
                              1
                          )
                  )
        const bi =
            size === 2
                ? interaction(
                      bgCount,
                      b.singles.get(tags[0]) ?? 0,
                      b.singles.get(tags[1]) ?? 0,
                      tb,
                      c.smoothing
                  )
                : Math.log(
                      probability(bgCount, tb, c.smoothing) /
                          tags.reduce(
                              (p, t) =>
                                  p *
                                  probability(
                                      b.singles.get(t) ?? 0,
                                      tb,
                                      c.smoothing
                                  ),
                              1
                          )
                  )
        const enrichment = Math.log(
                probability(count, tf, c.smoothing) /
                    probability(bgCount, tb, c.smoothing)
            ),
            specific = fi - bi,
            reliability = count / (count + c.reliabilityK)
        out.push({
            tags,
            facets: tags.map((tag) => classifyTagFacet(tag)),
            interactionType: tags
                .map((tag) => classifyTagFacet(tag))
                .sort()
                .join('×'),
            order: size,
            favoriteCount: count,
            favoriteSupport: count / tf,
            backgroundCount: bgCount,
            backgroundSupport: bgCount / tb,
            enrichment,
            withinFavoriteInteraction: fi,
            backgroundInteraction: bi,
            specificInteraction: specific,
            reliability,
            score:
                (enrichment * confidence +
                    specific * confidence +
                    fi * (1 - confidence)) *
                reliability,
            backgroundQuality: quality(confidence, background.length > 0)
        })
    }
    return out
}
export function mineTagCombinations(
    favorites: StoredComic[],
    background: StoredComic[] = [],
    config?: CombinationMiningConfig
) {
    const c = cfg(config)
    return {
        pairs: mineSize(favorites, background, 2, c)
            .sort(
                (a, b) =>
                    b.score - a.score ||
                    a.tags.join('|').localeCompare(b.tags.join('|'))
            )
            .slice(0, c.maxPairs),
        triples: mineSize(favorites, background, 3, c)
            .sort(
                (a, b) =>
                    b.score - a.score ||
                    a.tags.join('|').localeCompare(b.tags.join('|'))
            )
            .slice(0, c.maxTriples)
    }
}
export function residualCombinationBonus(
    tags: string[],
    pairs: TagCombinationPreference[],
    triples: TagCombinationPreference[]
) {
    const n = new Set(tags.map(normalizeFeatureValue)),
        matched = pairs
            .filter((p) => p.tags.every((t) => n.has(t)))
            .sort((a, b) => b.score - a.score)
    let pair = 0,
        explained = 0
    for (const p of matched) {
        const gain =
            Math.max(0, p.specificInteraction * p.reliability) *
            Math.exp(-explained)
        pair += gain
        explained += gain
    }
    let triple = 0
    for (const t of triples
        .filter((x) => x.tags.every((y) => n.has(y)))
        .sort((a, b) => b.score - a.score)) {
        const raw = Math.max(0, t.specificInteraction * t.reliability),
            overlap = matched
                .filter((p) => p.tags.every((x) => t.tags.includes(x)))
                .reduce(
                    (s, p) =>
                        s + Math.max(0, p.specificInteraction * p.reliability),
                    0
                )
        triple += Math.max(0, raw - overlap * 0.5) * Math.exp(-triple)
    }
    return { pair: Math.min(1, pair), triple: Math.min(1, triple) }
}
