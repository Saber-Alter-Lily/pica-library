import {
    controlIdentityV5,
    normalizeControlV5,
    type PreferenceControlV5,
    type PreferenceTargetType
} from './portable-policy'

export const MOBILE_RECOMMENDATION_SYNC_SCHEMA_V1 = 1

export interface MobileSyncControlWireV1 {
    targetType?: unknown
    key?: unknown
    label?: unknown
    direction?: unknown
    levelDelta?: unknown
    scope?: unknown
    updatedAt?: unknown
}

export interface MobileSyncConflictV1 {
    identity: string
    targetType: PreferenceTargetType
    key: string
    label: string
    base: PreferenceControlV5 | null
    desktop: PreferenceControlV5 | null
    android: PreferenceControlV5 | null
}

export interface MobileSyncPreviewV1 {
    schemaVersion: typeof MOBILE_RECOMMENDATION_SYNC_SCHEMA_V1
    baseRevision: number
    desktopRevision: number
    androidControlChanges: number
    desktopControlChanges: number
    feedbackChanges: number
    eventChanges: number
    suppressChanges: number
    tasteExclusionChanges: number
    dispositionChanges: number
    conflicts: MobileSyncConflictV1[]
    hasPortableChanges: boolean
}

function targetType(value: unknown): PreferenceTargetType | null {
    const type = String(value ?? '')
    return ['TAG', 'AUTHOR', 'CATEGORY', 'FANDOM', 'STYLE_FAMILY'].includes(type)
        ? (type as PreferenceTargetType)
        : null
}

export function normalizeSyncControlV1(
    value: unknown,
    source: 'DESKTOP' | 'ANDROID'
): PreferenceControlV5 | null {
    if (!value || typeof value !== 'object') return null
    const raw = value as MobileSyncControlWireV1
    const type = targetType(raw.targetType)
    const key = String(raw.key ?? '').trim()
    if (!type || !key) return null
    const rawDirection = String(raw.direction ?? 'DEFAULT')
    const direction = ['LESS', 'DEFAULT', 'MORE', 'BLOCK'].includes(
        rawDirection
    )
        ? (rawDirection as PreferenceControlV5['direction'])
        : 'DEFAULT'
    const scope: PreferenceControlV5['scope'] =
        String(raw.scope ?? '') === 'SESSION' ? 'SESSION' : 'PERSISTENT'
    return normalizeControlV5({
        targetType: type,
        key,
        label: String(raw.label ?? key),
        direction,
        levelDelta:
            raw.levelDelta === undefined ? undefined : Number(raw.levelDelta),
        scope,
        source,
        updatedAt: String(raw.updatedAt ?? '')
    })
}

function comparable(control: PreferenceControlV5 | null) {
    if (!control) return null
    return {
        targetType: control.targetType,
        key: control.key,
        direction: control.direction,
        scope: control.scope,
        levelDelta:
            control.levelDelta === undefined ? null : Number(control.levelDelta)
    }
}

export function syncControlsEqualV1(
    left: PreferenceControlV5 | null,
    right: PreferenceControlV5 | null
) {
    return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right))
}

function mapControls(
    values: unknown,
    source: 'DESKTOP' | 'ANDROID'
) {
    const map = new Map<string, PreferenceControlV5>()
    if (!Array.isArray(values)) return map
    for (const value of values) {
        const control = normalizeSyncControlV1(value, source)
        if (!control) continue
        map.set(controlIdentityV5(control.targetType, control.key), control)
    }
    return map
}

export function previewMobileRecommendationSyncV1(input: {
    baseRevision?: unknown
    desktopRevision: number
    baseControls?: unknown
    desktopControls: PreferenceControlV5[]
    androidControls?: unknown
    feedback?: unknown
    events?: unknown
    suppressComicIds?: unknown
    clearSuppressComicIds?: unknown
    tasteExcludedComicIds?: unknown
    clearTasteExcludedComicIds?: unknown
    itemDispositions?: unknown
}): MobileSyncPreviewV1 {
    const baseRevision = Math.max(0, Math.floor(Number(input.baseRevision) || 0))
    const base = mapControls(input.baseControls, 'DESKTOP')
    const desktop = new Map(
        input.desktopControls.map((control) => [
            controlIdentityV5(control.targetType, control.key),
            control
        ])
    )
    const android = mapControls(input.androidControls, 'ANDROID')
    const identities = new Set([
        ...base.keys(),
        ...desktop.keys(),
        ...android.keys()
    ])
    let desktopControlChanges = 0
    const conflicts: MobileSyncConflictV1[] = []
    for (const identity of identities) {
        const baseline = base.get(identity) ?? null
        const desktopValue = desktop.get(identity) ?? null
        const androidValue = android.get(identity) ?? null
        const desktopChanged = !syncControlsEqualV1(desktopValue, baseline)
        if (desktopChanged) desktopControlChanges += 1
        if (!android.has(identity)) continue
        const androidChanged = !syncControlsEqualV1(androidValue, baseline)
        if (
            androidChanged &&
            desktopChanged &&
            !syncControlsEqualV1(androidValue, desktopValue)
        ) {
            const source = androidValue ?? desktopValue ?? baseline
            if (!source) continue
            conflicts.push({
                identity,
                targetType: source.targetType,
                key: source.key,
                label:
                    androidValue?.label ??
                    desktopValue?.label ??
                    baseline?.label ??
                    source.key,
                base: baseline,
                desktop: desktopValue,
                android: androidValue
            })
        }
    }
    const count = (value: unknown) => (Array.isArray(value) ? value.length : 0)
    const feedbackChanges = count(input.feedback)
    const eventChanges = count(input.events)
    const suppressChanges =
        count(input.suppressComicIds) + count(input.clearSuppressComicIds)
    const tasteExclusionChanges =
        count(input.tasteExcludedComicIds) +
        count(input.clearTasteExcludedComicIds)
    const dispositionChanges = count(input.itemDispositions)
    const androidControlChanges = android.size
    return {
        schemaVersion: MOBILE_RECOMMENDATION_SYNC_SCHEMA_V1,
        baseRevision,
        desktopRevision: Math.max(0, Math.floor(input.desktopRevision)),
        androidControlChanges,
        desktopControlChanges,
        feedbackChanges,
        eventChanges,
        suppressChanges,
        tasteExclusionChanges,
        dispositionChanges,
        conflicts: conflicts.sort((a, b) =>
            a.identity.localeCompare(b.identity)
        ),
        hasPortableChanges:
            androidControlChanges +
                desktopControlChanges +
                feedbackChanges +
                eventChanges +
                suppressChanges +
                tasteExclusionChanges +
                dispositionChanges >
            0
    }
}

export function applyConflictResolutionsV1(input: {
    androidControls?: unknown
    conflicts: MobileSyncConflictV1[]
    resolutions?: unknown
}) {
    const controls = mapControls(input.androidControls, 'ANDROID')
    const resolutionMap = new Map<string, 'ANDROID' | 'DESKTOP'>()
    if (Array.isArray(input.resolutions))
        for (const raw of input.resolutions) {
            if (!raw || typeof raw !== 'object') continue
            const row = raw as Record<string, unknown>
            const identity = String(row.identity ?? '')
            const choice = String(row.choice ?? '')
            if (
                identity &&
                (choice === 'ANDROID' || choice === 'DESKTOP')
            )
                resolutionMap.set(identity, choice)
        }

    const unresolved: MobileSyncConflictV1[] = []
    for (const conflict of input.conflicts) {
        const choice = resolutionMap.get(conflict.identity)
        if (!choice) {
            unresolved.push(conflict)
            continue
        }
        if (choice === 'DESKTOP') controls.delete(conflict.identity)
    }
    return {
        controls: [...controls.values()],
        unresolved
    }
}
