import { Converter } from 'opencc-js/t2cn'
import type { StoredComic } from '../library/types'
import {
    resolveTagV3,
    type TagRegistryV3,
    type TagResolutionV3
} from '../recommendation-v3/tag-resolution-v3'
import {
    collectPortableInferredSignalsV5,
    normalizePreferenceKey,
    type PortablePolicyStateV5,
    type PortablePreferenceSignalV5
} from './portable-policy'

// Presentation/search only. NEVER use this lossy fold as a persisted policy ID,
// a provider query, or a replacement for the versioned portable-policy matcher.
let toSimplified: ((text: string) => string) | undefined
export function preferenceSearchText(value: unknown) {
    toSimplified ??= Converter({ from: 't', to: 'cn' })
    return toSimplified(normalizePreferenceKey(value))
}

const namespaced = (value: string) => /^[a-z][a-z0-9_-]*:/i.test(value)
const excluded = (item: TagResolutionV3) =>
    item.resolutionType === 'SAFETY' ||
    ['SAFETY_EXCLUDE', 'IGNORE', 'EXCLUDE'].includes(item.recommendationRole) ||
    item.retrievalUtility === 'SAFETY_BLOCKED'

/** Registry-backed display identity. Ambiguous folded aliases are not guessed. */
export function createPreferencePresentationIndex(registry?: TagRegistryV3) {
    const folded = new Map<string, Map<string, TagResolutionV3>>()
    const canonical = new Map<string, Map<string, TagResolutionV3>>()
    const terms = new Map<string, Set<string>>()
    const identity = (row: TagResolutionV3) =>
        `${row.facet}:${normalizePreferenceKey(row.canonicalKey)}`
    if (registry) {
        const keys = new Set([
            ...registry.semantic.keys(),
            ...registry.entities.keys(),
            ...registry.aliases.keys()
        ])
        for (const key of keys) {
            if (namespaced(key)) continue
            const resolved = resolveTagV3(key, registry)
            if (resolved.resolutionStatus !== 'RESOLVED') continue
            const id = identity(resolved)
            const canonicalKey = normalizePreferenceKey(resolved.canonicalKey)
            const canonicalTargets =
                canonical.get(canonicalKey) ??
                new Map<string, TagResolutionV3>()
            canonicalTargets.set(id, resolved)
            canonical.set(canonicalKey, canonicalTargets)
            const aliases = terms.get(id) ?? new Set<string>()
            for (const term of [
                key,
                resolved.canonicalKey,
                resolved.canonicalLabel
            ]) {
                const text = preferenceSearchText(term)
                if (!text) continue
                aliases.add(text)
                const targets =
                    folded.get(text) ?? new Map<string, TagResolutionV3>()
                targets.set(id, resolved)
                folded.set(text, targets)
            }
            terms.set(id, aliases)
        }
    }
    const resolve = (raw: string) => {
        if (!registry) return undefined
        const knownKey = canonical.get(normalizePreferenceKey(raw))
        if (knownKey?.size === 1) return [...knownKey.values()][0]
        if (namespaced(normalizePreferenceKey(raw))) return undefined
        const exact = resolveTagV3(raw, registry)
        if (exact.resolutionStatus === 'RESOLVED') return exact
        const candidates = folded.get(preferenceSearchText(raw))
        return candidates?.size === 1 ? [...candidates.values()][0] : undefined
    }
    return {
        registryAvailable: Boolean(registry),
        resolve,
        searchTerms(raw: string) {
            const resolved = resolve(raw)
            return [
                preferenceSearchText(raw),
                ...(resolved ? terms.get(identity(resolved)) ?? [] : [])
            ]
        },
        displayIdentity(raw: string) {
            const resolved = resolve(raw)
            // Keep unresolved/provider-namespaced keys exact: search equivalence
            // is not sufficient evidence to hide an unrelated semantic concept.
            return resolved
                ? `registry:${identity(resolved)}`
                : `raw:${normalizePreferenceKey(raw)}`
        }
    }
}

export type PreferencePresentationIndex = ReturnType<
    typeof createPreferencePresentationIndex
>

export function searchPreferenceSignalsV5(
    catalog: StoredComic[],
    state: Pick<PortablePolicyStateV5, 'tasteExcludedComicIds' | 'controls'>,
    query: string,
    index: PreferencePresentationIndex,
    limit = 100
) {
    const text = preferenceSearchText(query).slice(0, 160)
    const cap = Number.isFinite(limit)
        ? Math.max(1, Math.min(200, Math.floor(limit)))
        : 100
    const signals = collectPortableInferredSignalsV5(
        catalog,
        state.tasteExcludedComicIds
    )
    const byId = new Map(
        signals.map((item) => [`${item.targetType}:${item.key}`, item])
    )
    // Existing custom controls must remain discoverable even with no favorites.
    for (const control of state.controls) {
        if (control.targetType === 'STYLE_FAMILY') continue
        const id = `${control.targetType}:${control.key}`
        if (!byId.has(id))
            byId.set(id, {
                targetType: control.targetType,
                key: control.key,
                label: control.label,
                supportCount: 0,
                supportShare: 0,
                facet: 'OTHER',
                baselineLevel: 5
            })
    }
    const matches: Array<
        PortablePreferenceSignalV5 & { systemUnknown: boolean }
    > = []
    for (const signal of byId.values()) {
        const isTag =
            signal.targetType === 'TAG' || signal.targetType === 'FANDOM'
        const resolved = isTag ? index.resolve(signal.key) : undefined
        if (resolved && excluded(resolved)) continue
        const label = resolved?.canonicalLabel || signal.label
        const facet = resolved?.facet || signal.facet
        const tokens = [
            preferenceSearchText(
                `${signal.key} ${signal.label} ${label} ${signal.targetType} ${facet}`
            )
        ]
        if (isTag) tokens.push(...index.searchTerms(signal.key))
        if (text && !tokens.some((value) => value.includes(text))) continue
        matches.push({
            ...signal,
            label,
            facet,
            systemUnknown: signal.supportCount === 0
        })
    }
    // Prioritize exact query matches; keep raw keys distinct even if labels alias.
    const exact = (item: PortablePreferenceSignalV5) =>
        [item.key, item.label].some(
            (value) => preferenceSearchText(value) === text
        )
            ? 1
            : 0
    matches.sort(
        (a, b) =>
            exact(b) - exact(a) ||
            b.supportCount - a.supportCount ||
            a.targetType.localeCompare(b.targetType) ||
            a.key.localeCompare(b.key)
    )
    return {
        query,
        items: matches.slice(0, cap),
        total: matches.length,
        truncated: matches.length > cap,
        limit: cap,
        registryAvailable: index.registryAvailable,
        source: 'full-local-collection-and-explicit-controls' as const
    }
}
