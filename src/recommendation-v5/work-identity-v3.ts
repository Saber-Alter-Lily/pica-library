import type { StoredComic } from '../library/types'
import {
    leadingCreatorCredit,
    normalizePreferenceKey,
    stripUploadNoise,
    workIdentityKeys,
    workIdentitySignalsV2
} from './portable-policy'

export const WORK_IDENTITY_V3_RESOLVER_VERSION =
    'work-identity-v3-creator-title-cover-funnel'

export type WorkIdentityV3Relation =
    | 'HIGH_CONFIDENCE_WORK'
    | 'REVIEW_CANDIDATE'
    | 'DISTINCT_OR_UNKNOWN'

export interface WorkIdentityV3Evidence {
    relation: WorkIdentityV3Relation
    confidence: number
    stage:
        | 'CREATOR_TITLE_EXACT'
        | 'CREATOR_TITLE_CORE'
        | 'CREATOR_TITLE_FUZZY'
        | 'TITLE_FALLBACK'
        | 'STRUCTURE_CONFLICT'
        | 'INSUFFICIENT'
    creatorMatch: boolean
    creatorMatchKind: 'CANONICAL_ID' | 'ALIAS' | 'NONE'
    titleMatch: 'STRICT' | 'CORE' | 'FUZZY' | 'NONE'
    titleSimilarity: number
    pageCountCompatible: boolean
}

function compactTitle(value: string) {
    const withoutCreatorCredit = leadingCreatorCredit(value).stripped
    return stripUploadNoise(normalizePreferenceKey(withoutCreatorCredit))
        .replace(/[\s\p{P}\p{S}_]+/gu, '')
}

function workStructureTokens(value: string) {
    const text = normalizePreferenceKey(value)
    const tokens = new Map<string, Set<string>>()
    const add = (kind: string, token: string) => {
        const normalized = token.replace(/^0+(?=\d)/, '')
        if (!normalized) return
        const values = tokens.get(kind) ?? new Set<string>()
        values.add(normalized)
        tokens.set(kind, values)
    }
    for (const match of text.matchAll(
        /\b(?:chapter|chap|ch)\.?\s*(\d+[a-z]?)\b/giu
    ))
        add('chapter', String(match[1] ?? ''))
    for (const match of text.matchAll(
        /\b(?:volume|vol)\.?\s*(\d+[a-z]?)\b/giu
    ))
        add('volume', String(match[1] ?? ''))
    for (const match of text.matchAll(
        /\bpart\.?\s*(\d+[a-z]?)\b/giu
    ))
        add('part', String(match[1] ?? ''))
    for (const match of text.matchAll(
        /第?\s*(\d+[a-z]?)\s*(話|话|章|巻|卷|冊|册|部)/giu
    )) {
        const suffix = String(match[2] ?? '')
        const kind = /話|话|章/u.test(suffix)
            ? 'chapter'
            : /巻|卷|冊|册/u.test(suffix)
              ? 'volume'
              : 'part'
        add(kind, String(match[1] ?? ''))
    }
    return tokens
}

function workIdentityStructureConflictV3(
    left: Pick<StoredComic, 'title' | 'alternateTitles'>,
    right: Pick<StoredComic, 'title' | 'alternateTitles'>
) {
    const merge = (
        comic: Pick<StoredComic, 'title' | 'alternateTitles'>
    ) => {
        const merged = new Map<string, Set<string>>()
        for (const title of [comic.title, ...(comic.alternateTitles ?? [])]) {
            for (const [kind, values] of workStructureTokens(String(title))) {
                const current = merged.get(kind) ?? new Set<string>()
                for (const value of values) current.add(value)
                merged.set(kind, current)
            }
        }
        return merged
    }
    const a = merge(left)
    const b = merge(right)
    for (const [kind, values] of a) {
        const other = b.get(kind)
        if (!other?.size) continue
        if (![...values].some((value) => other.has(value))) return true
    }
    return false
}

function editSimilarity(left: string, right: string) {
    if (!left || !right) return 0
    if (left === right) return 1
    const a = [...left]
    const b = [...right]
    if (!a.length || !b.length) return 0
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
    for (let i = 1; i <= a.length; i++) {
        const current = new Array<number>(b.length + 1)
        current[0] = i
        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(
                current[j - 1] + 1,
                previous[j] + 1,
                previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            )
        }
        previous = current
    }
    return Math.max(0, 1 - previous[b.length] / Math.max(a.length, b.length))
}

function diceSimilarity(left: string, right: string) {
    if (!left || !right) return 0
    if (left === right) return 1
    if (left.length < 2 || right.length < 2) return editSimilarity(left, right)
    const grams = (value: string) => {
        const out = new Map<string, number>()
        for (let index = 0; index < value.length - 1; index++) {
            const gram = value.slice(index, index + 2)
            out.set(gram, (out.get(gram) || 0) + 1)
        }
        return out
    }
    const a = grams(left)
    const b = grams(right)
    let overlap = 0
    for (const [gram, count] of a)
        overlap += Math.min(count, b.get(gram) || 0)
    const total =
        [...a.values()].reduce((sum, count) => sum + count, 0) +
        [...b.values()].reduce((sum, count) => sum + count, 0)
    return total ? (2 * overlap) / total : 0
}

export function workIdentityTitleSimilarityV3(
    left: Pick<StoredComic, 'title' | 'alternateTitles'>,
    right: Pick<StoredComic, 'title' | 'alternateTitles'>
) {
    const a = [
        left.title,
        ...(left.alternateTitles ?? [])
    ]
        .map((value) => compactTitle(String(value || '')))
        .filter(Boolean)
    const b = [
        right.title,
        ...(right.alternateTitles ?? [])
    ]
        .map((value) => compactTitle(String(value || '')))
        .filter(Boolean)
    let best = 0
    for (const x of a)
        for (const y of b) {
            best = Math.max(best, editSimilarity(x, y), diceSimilarity(x, y))
            if (
                x.length >= 4 &&
                y.length >= 4 &&
                (x.includes(y) || y.includes(x))
            ) {
                const ratio =
                    Math.min(x.length, y.length) /
                    Math.max(x.length, y.length)
                best = Math.max(best, 0.86 + 0.14 * ratio)
            }
        }
    return best
}

export function workIdentityCreatorBucketKeysV3(
    comic: Pick<
        StoredComic,
        'authorId' | 'author' | 'canonicalAuthor' | 'title' | 'alternateTitles' | 'comicId' | 'pagesCount'
    >
) {
    const keys = workIdentityKeys(comic)
    return [
        ...(keys.authorId ? [`id:${keys.authorId}`] : []),
        ...keys.authorAliases.map((value) => `alias:${value}`)
    ]
}

export function workIdentityDetailEvidenceV3(
    left: StoredComic,
    right: StoredComic
): WorkIdentityV3Evidence {
    const signals = workIdentitySignalsV2(left, right)
    const fuzzy = workIdentityTitleSimilarityV3(left, right)
    if (workIdentityStructureConflictV3(left, right))
        return {
            relation: 'DISTINCT_OR_UNKNOWN',
            confidence: 0,
            stage: 'STRUCTURE_CONFLICT',
            creatorMatch: signals.authorsCompatible,
            creatorMatchKind: signals.authorIdMatch
                ? 'CANONICAL_ID'
                : signals.authorAliasMatch
                  ? 'ALIAS'
                  : 'NONE',
            titleMatch: fuzzy >= 0.5 ? 'FUZZY' : 'NONE',
            titleSimilarity: fuzzy,
            pageCountCompatible: signals.pageCountCompatible
        }
    const creatorMatchKind = signals.authorIdMatch
        ? ('CANONICAL_ID' as const)
        : signals.authorAliasMatch
          ? ('ALIAS' as const)
          : ('NONE' as const)

    if (signals.authorsCompatible && signals.strictTitleMatch)
        return {
            relation: 'HIGH_CONFIDENCE_WORK',
            confidence: 0.995,
            stage: 'CREATOR_TITLE_EXACT',
            creatorMatch: true,
            creatorMatchKind,
            titleMatch: 'STRICT',
            titleSimilarity: 1,
            pageCountCompatible: signals.pageCountCompatible
        }

    if (signals.authorsCompatible && signals.trustedCoreTitleMatch)
        return {
            relation: 'HIGH_CONFIDENCE_WORK',
            confidence: 0.985,
            stage: 'CREATOR_TITLE_CORE',
            creatorMatch: true,
            creatorMatchKind,
            titleMatch: 'CORE',
            titleSimilarity: Math.max(0.96, fuzzy),
            pageCountCompatible: signals.pageCountCompatible
        }

    if (signals.authorsCompatible && signals.looseTitleMatch)
        return {
            relation: 'HIGH_CONFIDENCE_WORK',
            confidence: signals.pageCountCompatible ? 0.98 : 0.965,
            stage: 'CREATOR_TITLE_CORE',
            creatorMatch: true,
            creatorMatchKind,
            titleMatch: 'CORE',
            titleSimilarity: Math.max(0.94, fuzzy),
            pageCountCompatible: signals.pageCountCompatible
        }

    if (signals.authorsCompatible && fuzzy >= 0.9)
        return {
            relation: 'HIGH_CONFIDENCE_WORK',
            confidence: signals.pageCountCompatible ? 0.965 : 0.95,
            stage: 'CREATOR_TITLE_FUZZY',
            creatorMatch: true,
            creatorMatchKind,
            titleMatch: 'FUZZY',
            titleSimilarity: fuzzy,
            pageCountCompatible: signals.pageCountCompatible
        }

    if (
        signals.authorsCompatible &&
        (fuzzy >= 0.68 || signals.pageCountCompatible)
    )
        return {
            relation: 'REVIEW_CANDIDATE',
            confidence: Math.min(
                0.92,
                0.6 +
                    Math.max(0, fuzzy - 0.45) * 0.7 +
                    (signals.pageCountCompatible ? 0.06 : 0)
            ),
            stage: 'CREATOR_TITLE_FUZZY',
            creatorMatch: true,
            creatorMatchKind,
            titleMatch: fuzzy >= 0.5 ? 'FUZZY' : 'NONE',
            titleSimilarity: fuzzy,
            pageCountCompatible: signals.pageCountCompatible
        }

    if (
        !signals.authorsCompatible &&
        (signals.strictTitleMatch ||
            signals.trustedCoreTitleMatch ||
            signals.looseTitleMatch)
    ) {
        const a = workIdentityKeys(left)
        const b = workIdentityKeys(right)
        const bothCreatorsUnknown =
            a.authorAliases.length === 0 && b.authorAliases.length === 0
        return {
            relation:
                bothCreatorsUnknown &&
                signals.pageCountCompatible &&
                signals.strictTitleMatch
                    ? 'HIGH_CONFIDENCE_WORK'
                    : 'REVIEW_CANDIDATE',
            confidence:
                bothCreatorsUnknown &&
                signals.pageCountCompatible &&
                signals.strictTitleMatch
                    ? 0.94
                    : signals.pageCountCompatible
                      ? 0.88
                      : 0.82,
            stage: 'TITLE_FALLBACK',
            creatorMatch: false,
            creatorMatchKind: 'NONE',
            titleMatch: signals.strictTitleMatch ? 'STRICT' : 'CORE',
            titleSimilarity: Math.max(signals.strictTitleMatch ? 1 : 0.92, fuzzy),
            pageCountCompatible: signals.pageCountCompatible
        }
    }

    return {
        relation: 'DISTINCT_OR_UNKNOWN',
        confidence: 0,
        stage: 'INSUFFICIENT',
        creatorMatch: signals.authorsCompatible,
        creatorMatchKind,
        titleMatch: fuzzy >= 0.5 ? 'FUZZY' : 'NONE',
        titleSimilarity: fuzzy,
        pageCountCompatible: signals.pageCountCompatible
    }
}
