import type { StoredComic } from '../library/types'

export const RECOMMENDATION_V5_POLICY_VERSION = '5.0.0-portable-policy-beta'
export const RECOMMENDATION_V5_POLICY_STATE_KEY = 'recommendation.v5.portablePolicy.v1'

export type PreferenceTargetType = 'TAG' | 'AUTHOR' | 'CATEGORY' | 'FANDOM' | 'STYLE_FAMILY'
export type PreferenceDirection = 'LESS' | 'DEFAULT' | 'MORE' | 'BLOCK'
export type PreferenceScope = 'PERSISTENT' | 'SESSION'
export type SessionIntentMode = 'DEFAULT' | 'FAMILIAR' | 'EXPLORE' | 'RECENT' | 'TARGET'

export type RecommendationItemFactV5 =
    | 'ALREADY_SEEN'
    | 'ALREADY_OWNED'
    | 'DUPLICATE_REPORT'

export interface TemporarySuppressionV5 {
    comicId: string
    createdAt: string
    expiresAt: string
}

export interface PreferenceControlV5 {
    targetType: PreferenceTargetType
    key: string
    label: string
    direction: PreferenceDirection
    scope: PreferenceScope
    source: 'DESKTOP' | 'ANDROID'
    updatedAt: string
    /**
     * User correction relative to the collection-derived baseline. The
     * product slider uses 0..10 with 5 as the neutral manual starting point;
     * the stored delta is bounded to -10..10. Legacy controls may omit it.
     */
    levelDelta?: number
}

export interface SessionIntentV5 {
    mode: SessionIntentMode
    targetType?: PreferenceTargetType
    key?: string
    label?: string
    source: 'DESKTOP' | 'ANDROID'
    updatedAt: string
}

export interface PortablePolicyStateV5 {
    schemaVersion: 1
    policyVersion: typeof RECOMMENDATION_V5_POLICY_VERSION
    revision: number
    updatedAt: string
    controls: PreferenceControlV5[]
    sessionIntent: SessionIntentV5
    /**
     * Legacy/permanent comic-level hard suppression. Kept for Android and
     * older V5 state compatibility; new factual actions use the typed fields
     * below instead of collapsing everything into this set.
     */
    hardSuppressComicIds: string[]
    seenComicIds: string[]
    ownedComicIds: string[]
    duplicateReportComicIds: string[]
    temporarySuppressions: TemporarySuppressionV5[]
    tasteExcludedComicIds: string[]
    explicitDistinctPairs: string[]
    deviceSyncRevisions: Record<string, number>
}

export interface PortablePreferenceSignalV5 {
    targetType: Exclude<PreferenceTargetType, 'STYLE_FAMILY'>
    key: string
    label: string
    supportCount: number
    supportShare: number
    /** Semantic V3 facet used for grouped presentation. */
    facet: string
    /** Collection-derived 1..10 baseline shown in the UI. */
    baselineLevel: number
}

export interface PortablePolicySnapshotV5 extends PortablePolicyStateV5 {
    inferred: PortablePreferenceSignalV5[]
    counts: {
        owned: number
        favorites: number
        controls: number
        blockedTargets: number
        hardSuppressed: number
        seenFacts: number
        ownedOverrides: number
        duplicateReports: number
        temporarySuppressed: number
        tasteExcluded: number
    }
}

export interface WorkIdentityEvidenceV5 {
    relation: 'EXACT_UPLOAD' | 'HIGH_CONFIDENCE_WORK' | 'DISTINCT_OR_UNKNOWN'
    reason: string
}

const nowIso = () => new Date().toISOString()

export function defaultPortablePolicyStateV5(): PortablePolicyStateV5 {
    return {
        schemaVersion: 1,
        policyVersion: RECOMMENDATION_V5_POLICY_VERSION,
        revision: 0,
        updatedAt: nowIso(),
        controls: [],
        sessionIntent: {
            mode: 'DEFAULT',
            source: 'DESKTOP',
            updatedAt: nowIso()
        },
        hardSuppressComicIds: [],
        seenComicIds: [],
        ownedComicIds: [],
        duplicateReportComicIds: [],
        temporarySuppressions: [],
        tasteExcludedComicIds: [],
        explicitDistinctPairs: [],
        deviceSyncRevisions: {}
    }
}

export function normalizePreferenceKey(value: unknown) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .toLocaleLowerCase('und')
        .replace(/\s+/g, ' ')
}

export function normalizeLevelDeltaV5(value: unknown) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return undefined
    return Math.max(-10, Math.min(10, Math.round(numeric)))
}

export const TEMPORARY_SUPPRESSION_DAYS_V5 = 30

export function activeTemporarySuppressionsV5(
    state: Pick<PortablePolicyStateV5, 'temporarySuppressions'>,
    now = new Date()
) {
    const nowMs = now.getTime()
    return (state.temporarySuppressions || []).filter((item) => {
        const expiresAt = Date.parse(item.expiresAt)
        return Number.isFinite(expiresAt) && expiresAt > nowMs
    })
}

export function isTemporarilySuppressedV5(
    comicId: string,
    state: Pick<PortablePolicyStateV5, 'temporarySuppressions'>,
    now = new Date()
) {
    const id = normalizePreferenceKey(comicId)
    return activeTemporarySuppressionsV5(state, now).some(
        (item) => normalizePreferenceKey(item.comicId) === id
    )
}

/**
 * Convert observed collection support into an interpretable 1..10 baseline.
 * A nonlinear curve keeps rare interests visible while preventing very common
 * interests from dominating the scale.
 */
export function preferenceBaselineLevelV5(
    supportCount: number,
    supportShare: number
) {
    const count = Math.max(0, Number(supportCount) || 0)
    const share = Math.max(0, Math.min(1, Number(supportShare) || 0))
    if (count <= 0) return 1
    const countStrength = 1 - Math.exp(-count / 12)
    const shareStrength = Math.sqrt(Math.min(1, share / 0.12))
    const combined = 0.75 * countStrength + 0.25 * shareStrength
    return Math.max(1, Math.min(10, Math.round(1 + 9 * combined)))
}

function normalizeTitleStrict(value: unknown) {
    return normalizePreferenceKey(value)
        .replace(/[“”"'‘’]/g, '')
        .replace(/[‐‑‒–—]/g, '-')
        .replace(/\s*[-–—_]\s*/g, '-')
}

function stripUploadNoise(value: string) {
    const noise = /(chinese|english|translated|translation|汉化|漢化|翻译|翻譯|中文|中国翻訳|無修正|无修正|decensored|digital|dl版|修正|重制|重製|rev(?:ision)?\.?\s*\d*|v\d+)/i
    return value
        .replace(/\[[^\]]{1,48}\]/g, (token) => (noise.test(token) ? ' ' : token))
        .replace(/\([^)]{1,48}\)/g, (token) => (noise.test(token) ? ' ' : token))
        .replace(/\{[^}]{1,48}\}/g, (token) => (noise.test(token) ? ' ' : token))
        .replace(/\b(?:chinese|english|translated|digital|decensored|rev(?:ision)?\.?\s*\d*|v\d+)\b/gi, ' ')
        .replace(/(?:汉化|漢化|翻译|翻譯|中文|無修正|无修正|修正|重制|重製)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

export function workIdentityKeys(comic: Pick<StoredComic, 'comicId' | 'title' | 'author' | 'canonicalAuthor' | 'pagesCount'>) {
    const author = normalizePreferenceKey(comic.canonicalAuthor ?? comic.author)
    const strictTitle = normalizeTitleStrict(comic.title)
    const looseTitle = stripUploadNoise(strictTitle)
    return {
        uploadKey: normalizePreferenceKey(comic.comicId),
        author,
        strictTitle,
        looseTitle,
        pages: Math.max(0, Number(comic.pagesCount ?? 0) || 0)
    }
}

function closePageCount(left: number, right: number) {
    if (!left || !right) return false
    const delta = Math.abs(left - right)
    return delta <= Math.max(4, Math.ceil(Math.max(left, right) * 0.08))
}

function pairKey(leftId: string, rightId: string) {
    return [leftId, rightId].map(normalizePreferenceKey).sort().join('\u0000')
}

export function workIdentityEvidenceV5(
    left: Pick<StoredComic, 'comicId' | 'title' | 'author' | 'canonicalAuthor' | 'pagesCount'>,
    right: Pick<StoredComic, 'comicId' | 'title' | 'author' | 'canonicalAuthor' | 'pagesCount'>,
    explicitDistinctPairs: Iterable<string> = []
): WorkIdentityEvidenceV5 {
    if (normalizePreferenceKey(left.comicId) === normalizePreferenceKey(right.comicId))
        return { relation: 'EXACT_UPLOAD', reason: 'same comic id' }
    const distinct = new Set(explicitDistinctPairs)
    if (distinct.has(pairKey(left.comicId, right.comicId)))
        return { relation: 'DISTINCT_OR_UNKNOWN', reason: 'user-confirmed distinct' }
    const a = workIdentityKeys(left)
    const b = workIdentityKeys(right)
    const authorsCompatible = a.author && b.author ? a.author === b.author : false
    if (authorsCompatible && a.strictTitle && a.strictTitle === b.strictTitle)
        return { relation: 'HIGH_CONFIDENCE_WORK', reason: 'same normalized title and author' }
    if (
        authorsCompatible &&
        a.looseTitle &&
        a.looseTitle === b.looseTitle &&
        closePageCount(a.pages, b.pages)
    )
        return {
            relation: 'HIGH_CONFIDENCE_WORK',
            reason: 'same normalized core title/author with compatible page count'
        }
    if (
        !a.author &&
        !b.author &&
        a.strictTitle &&
        a.strictTitle === b.strictTitle &&
        closePageCount(a.pages, b.pages)
    )
        return {
            relation: 'HIGH_CONFIDENCE_WORK',
            reason: 'same normalized title with compatible page count'
        }
    return { relation: 'DISTINCT_OR_UNKNOWN', reason: 'insufficient identity evidence' }
}

export function isOwnedComicV5(comic: StoredComic) {
    return Boolean(comic.isFavorite || comic.inLibrary || comic.downloadedPictures > 0)
}

export function buildOwnedCatalogV5(
    catalog: StoredComic[],
    state?: Pick<PortablePolicyStateV5, 'ownedComicIds'>
) {
    const overrides = new Set(
        (state?.ownedComicIds || []).map(normalizePreferenceKey)
    )
    return catalog.filter(
        (comic) =>
            isOwnedComicV5(comic) ||
            overrides.has(normalizePreferenceKey(comic.comicId))
    )
}

export function isAlreadyOwnedWorkV5(
    candidate: StoredComic,
    owned: StoredComic[],
    explicitDistinctPairs: Iterable<string> = []
) {
    for (const item of owned) {
        const evidence = workIdentityEvidenceV5(candidate, item, explicitDistinctPairs)
        if (evidence.relation !== 'DISTINCT_OR_UNKNOWN') return { owned: true, evidence, matchedComicId: item.comicId }
    }
    return { owned: false as const, evidence: null, matchedComicId: null }
}

export function controlIdentityV5(targetType: PreferenceTargetType, key: string) {
    return `${targetType}:${normalizePreferenceKey(key)}`
}

export function normalizeControlV5(
    input: Partial<PreferenceControlV5> &
        Pick<PreferenceControlV5, 'targetType' | 'key'>
): PreferenceControlV5 {
    const targetType = input.targetType
    const key = normalizePreferenceKey(input.key)
    if (!key) throw new Error('Preference control key is required')
    const requestedDirection: PreferenceDirection = [
        'LESS',
        'DEFAULT',
        'MORE',
        'BLOCK'
    ].includes(String(input.direction))
        ? (input.direction as PreferenceDirection)
        : 'DEFAULT'
    const levelDelta = normalizeLevelDeltaV5(input.levelDelta)
    const direction: PreferenceDirection =
        requestedDirection === 'BLOCK'
            ? 'BLOCK'
            : levelDelta === undefined
              ? requestedDirection
              : levelDelta > 0
                ? 'MORE'
                : levelDelta < 0
                  ? 'LESS'
                  : 'DEFAULT'
    const scope: PreferenceScope =
        input.scope === 'SESSION' ? 'SESSION' : 'PERSISTENT'
    return {
        targetType,
        key,
        label: String(input.label ?? input.key).trim().slice(0, 160) || key,
        direction,
        scope,
        source: input.source === 'ANDROID' ? 'ANDROID' : 'DESKTOP',
        updatedAt: String(input.updatedAt ?? nowIso()),
        ...(direction !== 'BLOCK' && levelDelta !== undefined
            ? { levelDelta }
            : {})
    }
}

export function upsertControlV5(state: PortablePolicyStateV5, control: PreferenceControlV5) {
    const normalized = normalizeControlV5(control)
    const id = controlIdentityV5(normalized.targetType, normalized.key)
    const controls = state.controls.filter((item) => controlIdentityV5(item.targetType, item.key) !== id)
    if (normalized.direction !== 'DEFAULT') controls.push(normalized)
    return {
        ...state,
        revision: state.revision + 1,
        updatedAt: nowIso(),
        controls: controls.sort((a, b) => controlIdentityV5(a.targetType, a.key).localeCompare(controlIdentityV5(b.targetType, b.key)))
    }
}

export function matchesControlV5(comic: StoredComic, control: PreferenceControlV5) {
    const key = normalizePreferenceKey(control.key)
    if (!key) return false
    if (control.targetType === 'AUTHOR')
        return normalizePreferenceKey(comic.canonicalAuthor ?? comic.author) === key
    if (control.targetType === 'CATEGORY')
        return comic.categories.some((value) => normalizePreferenceKey(value) === key)
    if (control.targetType === 'TAG' || control.targetType === 'FANDOM')
        return comic.tags.some((value) => normalizePreferenceKey(value) === key)
    return false
}

export function preferenceAdjustmentV5(comic: StoredComic, state: PortablePolicyStateV5) {
    let adjustment = 0
    const reasons: string[] = []
    const comicKey = normalizePreferenceKey(comic.comicId)
    let blocked =
        state.hardSuppressComicIds.some(
            (id) => normalizePreferenceKey(id) === comicKey
        ) ||
        state.seenComicIds.some(
            (id) => normalizePreferenceKey(id) === comicKey
        ) ||
        state.duplicateReportComicIds.some(
            (id) => normalizePreferenceKey(id) === comicKey
        ) ||
        isTemporarilySuppressedV5(comic.comicId, state)
    for (const control of state.controls) {
        if (!matchesControlV5(comic, control)) continue
        if (control.direction === 'BLOCK') {
            blocked = true
            reasons.push(`BLOCK:${control.targetType}:${control.label}`)
        } else if (control.direction === 'MORE') {
            const magnitude =
                control.levelDelta === undefined
                    ? control.scope === 'SESSION'
                        ? 0.12
                        : 0.08
                    : Math.min(0.27, Math.abs(control.levelDelta) * 0.03)
            adjustment += magnitude
            reasons.push(
                control.levelDelta === undefined
                    ? `MORE:${control.targetType}:${control.label}`
                    : `MORE_LEVEL:${control.targetType}:${control.label}:+${control.levelDelta}`
            )
        } else if (control.direction === 'LESS') {
            const magnitude =
                control.levelDelta === undefined
                    ? control.scope === 'SESSION'
                        ? 0.12
                        : 0.08
                    : Math.min(0.27, Math.abs(control.levelDelta) * 0.03)
            adjustment -= magnitude
            reasons.push(
                control.levelDelta === undefined
                    ? `LESS:${control.targetType}:${control.label}`
                    : `LESS_LEVEL:${control.targetType}:${control.label}:${control.levelDelta}`
            )
        }

    }
    const intent = state.sessionIntent
    if (intent.mode === 'TARGET' && intent.targetType && intent.key) {
        const synthetic: PreferenceControlV5 = {
            targetType: intent.targetType,
            key: intent.key,
            label: intent.label ?? intent.key,
            direction: 'MORE',
            scope: 'SESSION',
            source: intent.source,
            updatedAt: intent.updatedAt
        }
        if (matchesControlV5(comic, synthetic)) {
            adjustment += 0.16
            reasons.push(`SESSION_TARGET:${synthetic.targetType}:${synthetic.label}`)
        }
    }
    return {
        blocked,
        adjustment: Math.max(-0.3, Math.min(0.3, adjustment)),
        reasons
    }
}

export function dedupeRankedByWorkV5<T extends { comic: StoredComic }>(rows: T[], state: PortablePolicyStateV5) {
    const selected: T[] = []
    for (const row of rows) {
        if (selected.some((previous) => workIdentityEvidenceV5(row.comic, previous.comic, state.explicitDistinctPairs).relation !== 'DISTINCT_OR_UNKNOWN'))
            continue
        selected.push(row)
    }
    return selected
}

export function filterCandidatesAgainstOwnedV5<T extends { comic: StoredComic }>(
    rows: T[],
    catalog: StoredComic[],
    state: PortablePolicyStateV5
) {
    const owned = buildOwnedCatalogV5(catalog, state)
    let exactOrOwnedRemoved = 0
    let workDuplicateRemoved = 0
    let hardBlockedRemoved = 0
    const kept: T[] = []
    for (const row of rows) {
        const preference = preferenceAdjustmentV5(row.comic, state)
        if (preference.blocked) {
            hardBlockedRemoved++
            continue
        }
        const match = isAlreadyOwnedWorkV5(row.comic, owned, state.explicitDistinctPairs)
        if (match.owned) {
            if (match.evidence?.relation === 'EXACT_UPLOAD') exactOrOwnedRemoved++
            else workDuplicateRemoved++
            continue
        }
        kept.push(row)
    }
    return {
        rows: dedupeRankedByWorkV5(kept, state),
        telemetry: { exactOrOwnedRemoved, workDuplicateRemoved, hardBlockedRemoved }
    }
}

export function portableInferredSignalsV5(
    catalog: StoredComic[],
    limit = 120,
    tasteExcludedComicIds: Iterable<string> = []
): PortablePreferenceSignalV5[] {
    const excluded = new Set(
        [...tasteExcludedComicIds].map(normalizePreferenceKey)
    )
    const positives = catalog.filter(
        (comic) =>
            comic.isFavorite &&
            !excluded.has(normalizePreferenceKey(comic.comicId))
    )
    const total = Math.max(1, positives.length)
    const groups = new Map<string, { targetType: PortablePreferenceSignalV5['targetType']; key: string; label: string; ids: Set<string> }>()
    const add = (targetType: PortablePreferenceSignalV5['targetType'], raw: string, comicId: string) => {
        const key = normalizePreferenceKey(raw)
        if (!key) return
        const id = `${targetType}:${key}`
        const row = groups.get(id) ?? { targetType, key, label: raw.trim() || key, ids: new Set<string>() }
        row.ids.add(comicId)
        groups.set(id, row)
    }
    for (const comic of positives) {
        add('AUTHOR', comic.canonicalAuthor ?? comic.author, comic.comicId)
        for (const tag of comic.tags) add('TAG', tag, comic.comicId)
        for (const category of comic.categories) add('CATEGORY', category, comic.comicId)
    }
    return [...groups.values()]
        .map((row) => ({
            targetType: row.targetType,
            key: row.key,
            label: row.label,
            supportCount: row.ids.size,
            supportShare: row.ids.size / total,
            facet:
                row.targetType === 'AUTHOR'
                    ? 'CREATOR_ENTITY'
                    : row.targetType === 'CATEGORY'
                      ? 'CATEGORY'
                      : 'RAW_TAG',
            baselineLevel: preferenceBaselineLevelV5(
                row.ids.size,
                row.ids.size / total
            )
        }))
        .sort((a, b) => b.supportCount - a.supportCount || a.targetType.localeCompare(b.targetType) || a.key.localeCompare(b.key))
        .slice(0, Math.max(1, Math.min(500, limit)))
}

export function portablePolicySnapshotV5(state: PortablePolicyStateV5, catalog: StoredComic[]): PortablePolicySnapshotV5 {
    return {
        ...state,
        inferred: portableInferredSignalsV5(
            catalog,
            500,
            state.tasteExcludedComicIds
        ),
        counts: {
            owned: catalog.filter(isOwnedComicV5).length,
            favorites: catalog.filter((comic) => comic.isFavorite).length,
            controls: state.controls.length,
            blockedTargets: state.controls.filter(
                (control) => control.direction === 'BLOCK'
            ).length,
            hardSuppressed: state.hardSuppressComicIds.length,
            seenFacts: state.seenComicIds.length,
            ownedOverrides: state.ownedComicIds.length,
            duplicateReports: state.duplicateReportComicIds.length,
            temporarySuppressed: activeTemporarySuppressionsV5(state).length,
            tasteExcluded: state.tasteExcludedComicIds.length
        }
    }
}
