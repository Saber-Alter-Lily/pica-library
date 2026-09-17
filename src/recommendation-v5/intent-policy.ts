import type { RecommendationIntentV3 } from '../recommendation-v3/intent-planner-v3'
import {
    controlIdentityV5,
    normalizePreferenceKey,
    type PortablePolicyStateV5,
    type PreferenceTargetType
} from './portable-policy'
import { explicitRetrievalIntentsV5 } from './explicit-intents'

function targetTypeForFacet(
    intent: RecommendationIntentV3,
    facet: string
): PreferenceTargetType | null {
    if (intent.type === 'CREATOR' || facet === 'CREATOR_ENTITY') return 'AUTHOR'
    if (facet === 'FANDOM_IP' || intent.type === 'FANDOM') return 'FANDOM'
    if (facet === 'CATEGORY') return 'CATEGORY'
    if (facet === 'STYLE_FAMILY') return 'STYLE_FAMILY'
    return 'TAG'
}

function suppressedDirectIntent(
    intent: RecommendationIntentV3,
    state: PortablePolicyStateV5
) {
    if (intent.type === 'RELATED') return false
    return intent.anchors.some((anchor) => {
        const targetType = targetTypeForFacet(intent, anchor.facet)
        if (!targetType) return false
        const id = controlIdentityV5(
            targetType,
            normalizePreferenceKey(anchor.canonicalKey || anchor.canonicalLabel)
        )
        const control = state.controls.find(
            (item) => controlIdentityV5(item.targetType, item.key) === id
        )
        return control?.direction === 'LESS' || control?.direction === 'BLOCK'
    })
}

export function applyIntentPolicyV5(
    base: RecommendationIntentV3[],
    state: PortablePolicyStateV5,
    maxExplicit = 5
) {
    const retained = base.filter((intent) => !suppressedDirectIntent(intent, state))
    const explicit = explicitRetrievalIntentsV5(state, maxExplicit)
    const seen = new Set<string>()
    return [...explicit, ...retained].filter((intent) => {
        const key = `${intent.type}:${intent.anchors
            .map((anchor) => `${anchor.facet}:${normalizePreferenceKey(anchor.canonicalKey)}`)
            .join('|')}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}
