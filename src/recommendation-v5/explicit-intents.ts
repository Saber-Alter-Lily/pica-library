import type { RecommendationIntentV3 } from '../recommendation-v3/intent-planner-v3'
import type {
    PortablePolicyStateV5,
    PreferenceControlV5,
    PreferenceTargetType
} from './portable-policy'

export const RECOMMENDATION_V5_EXPLICIT_RETRIEVAL_VERSION =
    '5.0.0-explicit-retrieval-beta'

function facetFor(type: PreferenceTargetType) {
    if (type === 'AUTHOR') return 'CREATOR_ENTITY'
    if (type === 'FANDOM') return 'FANDOM_IP'
    if (type === 'CATEGORY') return 'CATEGORY'
    if (type === 'TAG') return 'USER_TAG'
    return 'STYLE_FAMILY'
}

function intentFor(control: PreferenceControlV5): RecommendationIntentV3 | null {
    if (
        control.direction !== 'MORE' ||
        control.targetType === 'STYLE_FAMILY'
    )
        return null
    const creator = control.targetType === 'AUTHOR'
    const type: RecommendationIntentV3['type'] = creator
        ? 'CREATOR'
        : control.targetType === 'FANDOM'
          ? 'FANDOM'
          : 'SEMANTIC_ANCHOR'
    return {
        intentId: `V5_EXPLICIT:${control.targetType}:${control.key}`,
        type,
        anchors: [
            {
                canonicalKey: control.key,
                canonicalLabel: control.label,
                facet: facetFor(control.targetType),
                providerQueryLabel: control.label || control.key,
                recommendationEligible: true,
                retrievalUtility: creator
                    ? 'HIGH_PRECISION_ANCHOR'
                    : 'STANDARD'
            }
        ],
        // V3's sourceLayer union predates explicit controls. The intent id and
        // explanation retain provenance until the shared type is versioned.
        sourceLayer: 'LIFETIME',
        evidence: {
            supportCount: 1,
            supportShare: 1,
            confidence: 'HIGH'
        },
        retrieval: {
            providerEligible: true,
            utilityTier: creator ? 'HIGH_PRECISION_ANCHOR' : 'STANDARD',
            estimatedRouteCost: 1
        },
        planning: {
            familyRank: -1,
            recentUseCount: 0,
            lastUsedAt: null,
            exploration: false
        },
        explanation: {
            reasonCode: 'V5_EXPLICIT_MORE',
            shortReason: `你主动选择多一点：${control.label}`
        }
    }
}

function targetIntent(state: PortablePolicyStateV5) {
    const target = state.sessionIntent
    if (
        target.mode !== 'TARGET' ||
        !target.targetType ||
        !target.key ||
        target.targetType === 'STYLE_FAMILY'
    )
        return null
    return intentFor({
        targetType: target.targetType,
        key: target.key,
        label: target.label ?? target.key,
        direction: 'MORE',
        scope: 'SESSION',
        source: target.source,
        updatedAt: target.updatedAt
    })
}

export function explicitRetrievalIntentsV5(
    state: PortablePolicyStateV5,
    maximum = 5
) {
    const values: RecommendationIntentV3[] = []
    const session = targetIntent(state)
    if (session)
        values.push({
            ...session,
            intentId: session.intentId.replace(
                'V5_EXPLICIT:',
                'V5_SESSION_TARGET:'
            ),
            explanation: {
                reasonCode: 'V5_SESSION_TARGET',
                shortReason: `本次想看：${session.anchors[0]?.canonicalLabel ?? ''}`
            }
        })
    const controls = [...state.controls]
        .filter(
            (item) =>
                item.direction === 'MORE' &&
                (item.levelDelta === undefined || item.levelDelta >= 2) &&
                item.scope === 'PERSISTENT' &&
                item.targetType !== 'STYLE_FAMILY'
        )
        .sort(
            (a, b) =>
                b.updatedAt.localeCompare(a.updatedAt) ||
                a.targetType.localeCompare(b.targetType) ||
                a.key.localeCompare(b.key)
        )
    for (const control of controls) {
        const intent = intentFor(control)
        if (!intent) continue
        if (
            values.some(
                (value) =>
                    value.anchors[0]?.canonicalKey ===
                        intent.anchors[0]?.canonicalKey &&
                    value.anchors[0]?.facet === intent.anchors[0]?.facet
            )
        )
            continue
        values.push(intent)
        if (values.length >= Math.max(1, maximum)) break
    }
    return values
}
