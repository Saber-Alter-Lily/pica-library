import type { StoredComic } from '../library/types'
import type { RecommendationIntentV3 } from '../recommendation-v3/intent-planner-v3'
import { comicTagProviderV1, effectiveTagPolicyV1, normalizeTagPolicyKey, privateTagMatchesV1, privateTagSignalV1, rawTagParticipatesV1, tagIdentityV1, tagParticipatesV1, type TagPolicyCarrierV1 } from './tag-policy'

/** Expand a private concept to its original provider terms. Never search an alias/opaque ID. */
export function expandPrivateTagIntentV1(intent: RecommendationIntentV3, state: TagPolicyCarrierV1, catalog: StoredComic[] = []) {
    const key = normalizeTagPolicyKey(intent.anchors[0]?.canonicalKey)
    const policy = effectiveTagPolicyV1(state)
    const tag = policy.privateTags.find(tag => privateTagSignalV1(tag.id) === key)
    if (!key.startsWith('@private/')) return [intent]
    if (!tag || !tagParticipatesV1(policy, tagIdentityV1('private', tag.id))) return []
    if (tag.kind === 'MAPPED') return [{ ...intent, anchors: tag.mappings.map(mapping => {
        const split = mapping.indexOf('|'), provider = mapping.slice(0, split) as 'pica' | 'eh' | 'jm'
        return { ...intent.anchors[0], facet: 'PRIVATE_TAG', providerQueryLabel: mapping.slice(split + 1), allowedProviders: [provider] }
    }) }].filter(value => value.anchors.length)
    // No classifier is inferred from a manually applied label. A bounded related-work
    // request can use a known Pica seed; EH/JM have no implemented related endpoint here.
    const seed = catalog.find(comic => comicTagProviderV1(comic) === 'pica' && privateTagMatchesV1(tag, comic))
    return seed ? [{ ...intent, type: 'RELATED' as const, intentId: intent.intentId + ':MANUAL_RELATED', anchors: [{ ...intent.anchors[0], canonicalKey: seed.comicId, facet: 'PRIVATE_MANUAL_RELATED', providerQueryLabel: null }], explanation: { reasonCode: 'PRIVATE_MANUAL_RELATED', shortReason: `来自你标注「${tag.name}」的作品相关推荐（不是自动标签判断）` } }] : []
}

export function restrictTagIntentsV1(intents: RecommendationIntentV3[], state: TagPolicyCarrierV1, catalog: StoredComic[], canonical: (raw: string) => string = normalizeTagPolicyKey) {
    return intents.flatMap(intent => {
        if (intent.type === 'CREATOR' || intent.type === 'RELATED') return [intent]
        const anchors = intent.anchors.flatMap(anchor => {
            if (['CATEGORY', 'CREATOR_ENTITY', 'STYLE_FAMILY'].includes(anchor.facet)) return [anchor]
            if (anchor.facet === 'PRIVATE_TAG') return [anchor] // Selected private mapping has its own independent switch.
            const identity = normalizeTagPolicyKey(anchor.canonicalKey)
            const providers = (['pica', 'eh', 'jm'] as const).filter(provider => {
                const aliases = [...new Set(catalog.filter(c => comicTagProviderV1(c) === provider).flatMap(c => c.tags).filter(raw => normalizeTagPolicyKey(canonical(raw)) === identity || normalizeTagPolicyKey(raw) === identity))]
                return aliases.length ? aliases.some(raw => rawTagParticipatesV1(state, provider, raw)) : rawTagParticipatesV1(state, provider, anchor.providerQueryLabel || anchor.canonicalKey)
            })
            return providers.length ? [{ ...anchor, allowedProviders: [...providers] }] : []
        })
        // Never turn an AND/conjunction into a different, weaker question.
        return anchors.length === intent.anchors.length && anchors.length ? [{ ...intent, anchors }] : []
    })
}

export function inferredPrivateTagIntentsV1(favorites: StoredComic[], state: TagPolicyCarrierV1): RecommendationIntentV3[] {
    const policy = effectiveTagPolicyV1(state)
    return policy.privateTags.filter(tag => tagParticipatesV1(policy, tagIdentityV1('private', tag.id)))
        .map(tag => ({ tag, count: favorites.filter(comic => privateTagMatchesV1(tag, comic)).length }))
        .filter(row => row.count > 0).sort((a, b) => b.count - a.count || a.tag.id.localeCompare(b.tag.id)).slice(0, 3)
        .flatMap(({ tag, count }) => expandPrivateTagIntentV1({
            intentId: `PRIVATE_TAG:${tag.id}`, type: 'SEMANTIC_ANCHOR', sourceLayer: 'LIFETIME',
            anchors: [{ canonicalKey: privateTagSignalV1(tag.id), canonicalLabel: tag.name, facet: 'PRIVATE_TAG', providerQueryLabel: null, recommendationEligible: true, retrievalUtility: 'STANDARD' }],
            evidence: { supportCount: count, supportShare: count / Math.max(1, favorites.length), confidence: 'LOW' },
            retrieval: { providerEligible: true, utilityTier: 'STANDARD', estimatedRouteCost: 1 },
            planning: { familyRank: 0, recentUseCount: 0, lastUsedAt: null, exploration: false },
            explanation: { reasonCode: 'PRIVATE_TAG_FAVORITE_COVERAGE', shortReason: `你收藏中标注了「${tag.name}」的作品（用户标签）` }
        }, state, favorites))
}
