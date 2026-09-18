import type { LibraryDatabase } from '../library/database'
import {
    RECOMMENDATION_V5_POLICY_STATE_KEY,
    RECOMMENDATION_V5_POLICY_VERSION,
    TEMPORARY_SUPPRESSION_DAYS_V5,
    activeTemporarySuppressionsV5,
    defaultPortablePolicyStateV5,
    normalizeControlV5,
    portablePolicySnapshotV5,
    type PortablePolicyStateV5,
    type PreferenceControlV5,
    type PreferenceDirection,
    type PreferenceScope,
    type PreferenceTargetType,
    type SessionIntentV5,
    type SessionIntentMode,
    upsertControlV5
} from './portable-policy'

interface MobileFeedbackMutationV5 {
    comicId?: unknown
    sentiment?: unknown
    reasons?: unknown
}

export interface MobileRecommendationSyncV5 {
    deviceId?: unknown
    mutationId?: unknown
    controls?: unknown
    sessionIntent?: unknown
    feedback?: unknown
    suppressComicIds?: unknown
    clearSuppressComicIds?: unknown
    tasteExcludedComicIds?: unknown
    clearTasteExcludedComicIds?: unknown
}

function stringArray(value: unknown) {
    return Array.isArray(value)
        ? [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))]
        : []
}

function validTargetType(value: unknown): PreferenceTargetType | null {
    const type = String(value ?? '')
    return ['TAG', 'AUTHOR', 'CATEGORY', 'FANDOM', 'STYLE_FAMILY'].includes(type)
        ? (type as PreferenceTargetType)
        : null
}

function validDirection(value: unknown): PreferenceDirection {
    const direction = String(value ?? '')
    return ['LESS', 'DEFAULT', 'MORE', 'BLOCK'].includes(direction)
        ? (direction as PreferenceDirection)
        : 'DEFAULT'
}

function validScope(value: unknown): PreferenceScope {
    return String(value ?? '') === 'SESSION' ? 'SESSION' : 'PERSISTENT'
}

function validSessionMode(value: unknown): SessionIntentMode {
    const mode = String(value ?? '')
    return ['DEFAULT', 'FAMILIAR', 'EXPLORE', 'RECENT', 'TARGET'].includes(mode)
        ? (mode as SessionIntentMode)
        : 'DEFAULT'
}

export class RecommendationPolicyStoreV5 {
    constructor(private readonly database: LibraryDatabase) {}

    state(): PortablePolicyStateV5 {
        const stored = this.database.getAppState<PortablePolicyStateV5>(
            RECOMMENDATION_V5_POLICY_STATE_KEY
        )
        if (
            stored?.schemaVersion === 1 &&
            stored.policyVersion === RECOMMENDATION_V5_POLICY_VERSION &&
            Array.isArray(stored.controls) &&
            Array.isArray(stored.hardSuppressComicIds)
        )
            return {
                ...stored,
                controls: stored.controls.map((item) => normalizeControlV5(item)),
                seenComicIds: Array.isArray(stored.seenComicIds)
                    ? stored.seenComicIds.map(String)
                    : [],
                ownedComicIds: Array.isArray(stored.ownedComicIds)
                    ? stored.ownedComicIds.map(String)
                    : [],
                duplicateReportComicIds: Array.isArray(
                    stored.duplicateReportComicIds
                )
                    ? stored.duplicateReportComicIds.map(String)
                    : [],
                temporarySuppressions: activeTemporarySuppressionsV5({
                    temporarySuppressions: Array.isArray(
                        stored.temporarySuppressions
                    )
                        ? stored.temporarySuppressions
                              .filter(
                                  (item) =>
                                      item &&
                                      typeof item === 'object' &&
                                      String(item.comicId ?? '').trim() &&
                                      String(item.expiresAt ?? '').trim()
                              )
                              .map((item) => ({
                                  comicId: String(item.comicId),
                                  createdAt: String(
                                      item.createdAt ??
                                          new Date().toISOString()
                                  ),
                                  expiresAt: String(item.expiresAt)
                              }))
                        : []
                }),
                tasteExcludedComicIds: Array.isArray(
                    stored.tasteExcludedComicIds
                )
                    ? stored.tasteExcludedComicIds.map(String)
                    : [],
                explicitDistinctPairs: Array.isArray(stored.explicitDistinctPairs)
                    ? stored.explicitDistinctPairs.map(String)
                    : [],
                deviceSyncRevisions:
                    stored.deviceSyncRevisions &&
                    typeof stored.deviceSyncRevisions === 'object'
                        ? stored.deviceSyncRevisions
                        : {}
            }
        const initial = defaultPortablePolicyStateV5()
        this.database.setAppState(RECOMMENDATION_V5_POLICY_STATE_KEY, initial)
        return initial
    }

    private save(state: PortablePolicyStateV5) {
        this.database.setAppState(RECOMMENDATION_V5_POLICY_STATE_KEY, state)
        return state
    }

    snapshot() {
        return portablePolicySnapshotV5(
            this.state(),
            this.database.listComics({ limit: 10000 })
        )
    }

    setControl(input: {
        targetType: unknown
        key: unknown
        label?: unknown
        direction?: unknown
        levelDelta?: unknown
        scope?: unknown
        source?: 'DESKTOP' | 'ANDROID'
    }) {
        const targetType = validTargetType(input.targetType)
        if (!targetType) throw new Error('Unknown recommendation control target')
        const state = upsertControlV5(
            this.state(),
            normalizeControlV5({
                targetType,
                key: String(input.key ?? ''),
                label: String(input.label ?? input.key ?? ''),
                direction: validDirection(input.direction),
                levelDelta:
                    input.levelDelta === undefined
                        ? undefined
                        : Number(input.levelDelta),
                scope: validScope(input.scope),
                source: input.source === 'ANDROID' ? 'ANDROID' : 'DESKTOP',
                updatedAt: new Date().toISOString()
            })
        )
        this.save(state)
        return this.snapshot()
    }

    setSessionIntent(input: {
        mode?: unknown
        targetType?: unknown
        key?: unknown
        label?: unknown
        source?: 'DESKTOP' | 'ANDROID'
    }) {
        const previous = this.state()
        const targetType = validTargetType(input.targetType)
        const sessionIntent: SessionIntentV5 = {
            mode: validSessionMode(input.mode),
            ...(targetType ? { targetType } : {}),
            ...(String(input.key ?? '').trim() ? { key: String(input.key).trim() } : {}),
            ...(String(input.label ?? '').trim() ? { label: String(input.label).trim() } : {}),
            source: input.source === 'ANDROID' ? 'ANDROID' : 'DESKTOP',
            updatedAt: new Date().toISOString()
        }
        if (sessionIntent.mode === 'TARGET' && (!sessionIntent.targetType || !sessionIntent.key))
            throw new Error('Target session intent needs a type and key')
        this.save({
            ...previous,
            revision: previous.revision + 1,
            updatedAt: new Date().toISOString(),
            sessionIntent
        })
        return this.snapshot()
    }

    suppressComic(comicId: string, suppressed = true) {
        const id = comicId.trim()
        if (!id) throw new Error('Comic id is required')
        const previous = this.state()
        const values = new Set(previous.hardSuppressComicIds)
        if (suppressed) values.add(id)
        else values.delete(id)
        this.save({
            ...previous,
            revision: previous.revision + 1,
            updatedAt: new Date().toISOString(),
            hardSuppressComicIds: [...values].sort()
        })
        return this.snapshot()
    }

    setItemDisposition(input: {
        comicId: unknown
        reason?: unknown
        active?: unknown
        durationDays?: unknown
        source?: 'DESKTOP' | 'ANDROID'
    }) {
        const comicId = String(input.comicId ?? '').trim()
        if (!comicId) throw new Error('Comic id is required')
        const reason = String(input.reason ?? '').trim().toLowerCase()
        const active = input.active !== false
        const previous = this.state()
        const now = new Date()
        const updateSet = (values: string[], enabled: boolean) => {
            const next = new Set(values)
            if (enabled) next.add(comicId)
            else next.delete(comicId)
            return [...next].sort()
        }

        let next: PortablePolicyStateV5 = {
            ...previous,
            temporarySuppressions: activeTemporarySuppressionsV5(previous, now)
        }
        let expiresAt: string | null = null
        let auditReason = reason || 'legacy'

        if (reason === 'already_seen') {
            next = {
                ...next,
                seenComicIds: updateSet(next.seenComicIds, active)
            }
        } else if (reason === 'already_owned') {
            next = {
                ...next,
                ownedComicIds: updateSet(next.ownedComicIds, active)
            }
        } else if (reason === 'duplicate') {
            next = {
                ...next,
                duplicateReportComicIds: updateSet(
                    next.duplicateReportComicIds,
                    active
                )
            }
        } else if (reason === 'temporary') {
            const durationDays = Math.max(
                1,
                Math.min(
                    365,
                    Math.round(
                        Number(input.durationDays) ||
                            TEMPORARY_SUPPRESSION_DAYS_V5
                    )
                )
            )
            const remaining = next.temporarySuppressions.filter(
                (item) => item.comicId !== comicId
            )
            if (active) {
                const expiry = new Date(
                    now.getTime() + durationDays * 24 * 60 * 60 * 1000
                )
                expiresAt = expiry.toISOString()
                remaining.push({
                    comicId,
                    createdAt: now.toISOString(),
                    expiresAt
                })
            }
            next = {
                ...next,
                temporarySuppressions: remaining.sort((a, b) =>
                    a.comicId.localeCompare(b.comicId)
                )
            }
        } else {
            auditReason = 'legacy_hard_suppress'
            next = {
                ...next,
                hardSuppressComicIds: updateSet(
                    next.hardSuppressComicIds,
                    active
                )
            }
        }

        next = {
            ...next,
            revision: next.revision + 1,
            updatedAt: now.toISOString()
        }
        this.save(next)
        this.database.recordUserEvent({
            eventType: 'recommendation_item_disposition',
            comicId,
            source:
                input.source === 'ANDROID'
                    ? 'android-v5'
                    : 'desktop-v5',
            metadata: {
                reason: auditReason,
                active,
                ...(expiresAt ? { expiresAt } : {})
            }
        })
        return this.snapshot()
    }

    setTasteExclusion(
        comicId: string,
        excluded = true,
        source: 'DESKTOP' | 'ANDROID' = 'DESKTOP'
    ) {
        const id = comicId.trim()
        if (!id) throw new Error('Comic id is required')
        const previous = this.state()
        const values = new Set(previous.tasteExcludedComicIds)
        if (excluded) values.add(id)
        else values.delete(id)
        const next = {
            ...previous,
            revision: previous.revision + 1,
            updatedAt: new Date().toISOString(),
            tasteExcludedComicIds: [...values].sort()
        }
        this.save(next)
        this.database.recordUserEvent({
            eventType: 'recommendation_taste_exclusion',
            comicId: id,
            source: source === 'ANDROID' ? 'android-v5' : 'desktop-v5',
            metadata: { excluded }
        })
        return this.snapshot()
    }

    private applyFeedback(
        feedback: MobileFeedbackMutationV5,
        deviceId: string,
        mutationId: string,
        index: number
    ) {
        const comicId = String(feedback.comicId ?? '').trim()
        const sentiment = String(feedback.sentiment ?? '').toLowerCase()
        if (!comicId || !['like', 'dislike'].includes(sentiment)) return
        const event = this.database.recordUserEvent({
            eventType: sentiment === 'like' ? 'recommend_like' : 'recommend_dislike',
            comicId,
            source: 'android-sync-v5',
            metadata: { deviceId, mutationId },
            dedupeKey: `v5-mobile:${deviceId}:${mutationId}:${index}:sentiment`
        })
        const reasons = stringArray(feedback.reasons)
        if (reasons.length)
            this.database.recordUserEvent({
                eventType: 'recommend_feedback_reason',
                comicId,
                source: 'android-sync-v5',
                metadata: {
                    deviceId,
                    mutationId,
                    sentiment,
                    parentFeedbackId: event.id,
                    reasons
                },
                dedupeKey: `v5-mobile:${deviceId}:${mutationId}:${index}:reasons`
            })
    }

    mergeMobile(input: MobileRecommendationSyncV5) {
        const deviceId = String(input.deviceId ?? '').trim().slice(0, 160)
        const mutationId = String(input.mutationId ?? '').trim().slice(0, 200)
        if (!deviceId || !mutationId)
            throw new Error('deviceId and mutationId are required for recommendation sync')
        let state = this.state()
        const previousRevision = state.deviceSyncRevisions[deviceId] ?? 0
        const controls = Array.isArray(input.controls) ? input.controls : []
        for (const item of controls) {
            if (!item || typeof item !== 'object') continue
            const row = item as Record<string, unknown>
            const targetType = validTargetType(row.targetType)
            if (!targetType) continue
            state = upsertControlV5(
                state,
                normalizeControlV5({
                    targetType,
                    key: String(row.key ?? ''),
                    label: String(row.label ?? row.key ?? ''),
                    direction: validDirection(row.direction),
                    levelDelta:
                        row.levelDelta === undefined
                            ? undefined
                            : Number(row.levelDelta),
                    scope: validScope(row.scope),
                    source: 'ANDROID',
                    updatedAt: new Date().toISOString()
                })
            )
        }
        if (input.sessionIntent && typeof input.sessionIntent === 'object') {
            const raw = input.sessionIntent as Record<string, unknown>
            const targetType = validTargetType(raw.targetType)
            const mode = validSessionMode(raw.mode)
            state = {
                ...state,
                revision: state.revision + 1,
                updatedAt: new Date().toISOString(),
                sessionIntent: {
                    mode,
                    ...(targetType ? { targetType } : {}),
                    ...(String(raw.key ?? '').trim() ? { key: String(raw.key).trim() } : {}),
                    ...(String(raw.label ?? '').trim() ? { label: String(raw.label).trim() } : {}),
                    source: 'ANDROID',
                    updatedAt: new Date().toISOString()
                }
            }
        }
        const suppressed = new Set(state.hardSuppressComicIds)
        for (const id of stringArray(input.suppressComicIds)) suppressed.add(id)
        for (const id of stringArray(input.clearSuppressComicIds))
            suppressed.delete(id)
        const tasteExcluded = new Set(state.tasteExcludedComicIds)
        for (const id of stringArray(input.tasteExcludedComicIds))
            tasteExcluded.add(id)
        for (const id of stringArray(input.clearTasteExcludedComicIds))
            tasteExcluded.delete(id)
        state = {
            ...state,
            hardSuppressComicIds: [...suppressed].sort(),
            tasteExcludedComicIds: [...tasteExcluded].sort(),
            deviceSyncRevisions: {
                ...state.deviceSyncRevisions,
                [deviceId]: Math.max(previousRevision + 1, state.revision + 1)
            },
            revision: state.revision + 1,
            updatedAt: new Date().toISOString()
        }
        this.save(state)
        const feedback = Array.isArray(input.feedback) ? input.feedback : []
        feedback.forEach((item, index) => {
            if (item && typeof item === 'object')
                this.applyFeedback(
                    item as MobileFeedbackMutationV5,
                    deviceId,
                    mutationId,
                    index
                )
        })
        return {
            acknowledgedMutationId: mutationId,
            deviceRevision: state.deviceSyncRevisions[deviceId],
            snapshot: this.snapshot()
        }
    }
}
