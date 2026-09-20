import type { StoredComic } from '../library/types'
import type { UserEvent } from '../recommendation-v3/types'
import {
    buildBehaviorEvidenceLedgerV5,
    classifyBehaviorEventV5,
    type BehaviorEvidenceSignalV5,
    type BehaviorTasteClassV5
} from './behavior-evidence'
import type { PortablePolicyStateV5 } from './portable-policy'
import {
    activeTemporarySuppressionsV5,
    normalizePreferenceKey
} from './portable-policy'

export const PREFERENCE_TIMESCALE_VERSION =
    'preference-timescale-v1'

export interface PreferenceDimensionV5 {
    key: string
    label: string
    score: number
    supportItems: number
}

export interface PreferenceWindowV5 {
    window: 'LIFETIME' | '7D' | '30D' | '90D' | 'SESSION'
    startAt: string | null
    endAt: string
    eventCount: number
    tasteEventCount: number
    positiveItemCount: number
    negativeItemCount: number
    itemScores: Array<{
        comicId: string
        title: string
        score: number
        evidenceCount: number
    }>
    positive: {
        authors: PreferenceDimensionV5[]
        tags: PreferenceDimensionV5[]
        categories: PreferenceDimensionV5[]
    }
    negative: {
        authors: PreferenceDimensionV5[]
        tags: PreferenceDimensionV5[]
        categories: PreferenceDimensionV5[]
    }
}

const strengthWeight: Record<
    BehaviorEvidenceSignalV5['strength'],
    number
> = {
    STRONG: 1,
    MODERATE: 0.6,
    WEAK: 0.2,
    NONE: 0
}

function tasteClassWeight(value: BehaviorTasteClassV5) {
    if (value === 'STRONG_POSITIVE') return 1
    if (value === 'POSITIVE') return 0.6
    if (value === 'WEAK_POSITIVE') return 0.2
    if (value === 'EXPLICIT_NEGATIVE') return -1
    return 0
}

function eventTasteWeight(signal: BehaviorEvidenceSignalV5) {
    if (signal.kind !== 'TASTE') return 0
    const weight = strengthWeight[signal.strength]
    return signal.polarity === 'NEGATIVE' ? -weight : weight
}

function dimensionRows(
    scores: Map<string, { score: number; items: Set<string>; label: string }>,
    direction: 'POSITIVE' | 'NEGATIVE'
) {
    const sign = direction === 'POSITIVE' ? 1 : -1
    return [...scores.entries()]
        .map(([key, value]) => ({
            key,
            label: value.label,
            score: Math.round(value.score * 1000) / 1000,
            supportItems: value.items.size
        }))
        .filter((item) =>
            direction === 'POSITIVE' ? item.score > 0 : item.score < 0
        )
        .sort(
            (a, b) =>
                sign * (b.score - a.score) ||
                b.supportItems - a.supportItems ||
                a.key.localeCompare(b.key)
        )
        .slice(0, 30)
}

function buildDimensions(
    itemScores: Map<string, { score: number; evidenceCount: number }>,
    catalogById: Map<string, StoredComic>
) {
    const authors = new Map<
        string,
        { score: number; items: Set<string>; label: string }
    >()
    const tags = new Map<
        string,
        { score: number; items: Set<string>; label: string }
    >()
    const categories = new Map<
        string,
        { score: number; items: Set<string>; label: string }
    >()
    const add = (
        target: typeof authors,
        raw: string,
        comicId: string,
        score: number
    ) => {
        const key = normalizePreferenceKey(raw)
        if (!key || score === 0) return
        const current = target.get(key) ?? {
            score: 0,
            items: new Set<string>(),
            label: raw.trim() || key
        }
        current.score += score
        current.items.add(comicId)
        target.set(key, current)
    }

    for (const [comicId, item] of itemScores) {
        const comic = catalogById.get(comicId)
        if (!comic || item.score === 0) continue
        add(
            authors,
            comic.canonicalAuthor ?? comic.author,
            comicId,
            item.score
        )
        for (const tag of comic.tags)
            add(tags, tag, comicId, item.score)
        for (const category of comic.categories)
            add(categories, category, comicId, item.score)
    }

    return {
        positive: {
            authors: dimensionRows(authors, 'POSITIVE'),
            tags: dimensionRows(tags, 'POSITIVE'),
            categories: dimensionRows(categories, 'POSITIVE')
        },
        negative: {
            authors: dimensionRows(authors, 'NEGATIVE'),
            tags: dimensionRows(tags, 'NEGATIVE'),
            categories: dimensionRows(categories, 'NEGATIVE')
        }
    }
}

function eventWindow(
    window: PreferenceWindowV5['window'],
    events: UserEvent[],
    catalogById: Map<string, StoredComic>,
    endAt: Date,
    startAt: Date | null,
    appSessionId?: string | null
): PreferenceWindowV5 {
    const filtered = events.filter((event) => {
        if (!event.comicId) return false
        if (
            window === 'SESSION' &&
            (!appSessionId || event.appSessionId !== appSessionId)
        )
            return false
        const time = Date.parse(event.occurredAt)
        if (!Number.isFinite(time)) return false
        if (time > endAt.getTime()) return false
        return !startAt || time >= startAt.getTime()
    })

    const itemScores = new Map<
        string,
        {
            score: number
            evidenceCount: number
            explicit: Array<{
                polarity: 'POSITIVE' | 'NEGATIVE'
                occurredAt: string
            }>
        }
    >()
    let tasteEventCount = 0
    for (const event of filtered) {
        for (const signal of classifyBehaviorEventV5(event)) {
            if (signal.kind !== 'TASTE') continue
            tasteEventCount++
            const comicId = normalizePreferenceKey(signal.comicId)
            if (!comicId) continue
            const current = itemScores.get(comicId) ?? {
                score: 0,
                evidenceCount: 0,
                explicit: []
            }
            current.score += eventTasteWeight(signal)
            current.evidenceCount++
            if (
                signal.explicit &&
                (signal.polarity === 'POSITIVE' ||
                    signal.polarity === 'NEGATIVE')
            )
                current.explicit.push({
                    polarity: signal.polarity,
                    occurredAt: signal.occurredAt ?? ''
                })
            itemScores.set(comicId, current)
        }
    }

    for (const item of itemScores.values()) {
        const explicit = item.explicit.sort((a, b) =>
            a.occurredAt.localeCompare(b.occurredAt)
        ).at(-1)
        if (explicit)
            item.score =
                explicit.polarity === 'NEGATIVE'
                    ? -1
                    : Math.max(1, item.score)
        item.score = Math.max(-1, Math.min(2, item.score))
    }

    const normalizedScores = new Map(
        [...itemScores.entries()].map(([comicId, item]) => [
            comicId,
            {
                score: Math.round(item.score * 1000) / 1000,
                evidenceCount: item.evidenceCount
            }
        ])
    )
    const dimensions = buildDimensions(normalizedScores, catalogById)
    const rows = [...normalizedScores.entries()]
        .map(([comicId, item]) => ({
            comicId,
            title: catalogById.get(comicId)?.title ?? '',
            score: item.score,
            evidenceCount: item.evidenceCount
        }))
        .sort(
            (a, b) =>
                Math.abs(b.score) - Math.abs(a.score) ||
                b.score - a.score ||
                a.comicId.localeCompare(b.comicId)
        )

    return {
        window,
        startAt: startAt?.toISOString() ?? null,
        endAt: endAt.toISOString(),
        eventCount: filtered.length,
        tasteEventCount,
        positiveItemCount: rows.filter((item) => item.score > 0)
            .length,
        negativeItemCount: rows.filter((item) => item.score < 0)
            .length,
        itemScores: rows.slice(0, 100),
        ...dimensions
    }
}

function lifetimeWindow(
    events: UserEvent[],
    catalog: StoredComic[],
    state: PortablePolicyStateV5,
    endAt: Date
): PreferenceWindowV5 {
    const ledger = buildBehaviorEvidenceLedgerV5(
        events,
        catalog,
        state,
        endAt
    )
    const catalogById = new Map(
        catalog.map((comic) => [
            normalizePreferenceKey(comic.comicId),
            comic
        ])
    )
    const itemScores = new Map(
        ledger.items
            .map((item) => [
                item.comicId,
                {
                    score: tasteClassWeight(item.tasteClass),
                    evidenceCount: item.signals.filter(
                        (signal) => signal.kind === 'TASTE'
                    ).length
                }
            ] as const)
            .filter(([, item]) => item.score !== 0)
    )
    const dimensions = buildDimensions(itemScores, catalogById)
    const rows = [...itemScores.entries()]
        .map(([comicId, item]) => ({
            comicId,
            title: catalogById.get(comicId)?.title ?? '',
            score: item.score,
            evidenceCount: item.evidenceCount
        }))
        .sort(
            (a, b) =>
                Math.abs(b.score) - Math.abs(a.score) ||
                b.score - a.score ||
                a.comicId.localeCompare(b.comicId)
        )

    return {
        window: 'LIFETIME',
        startAt: null,
        endAt: endAt.toISOString(),
        eventCount: events.filter((event) => Boolean(event.comicId)).length,
        tasteEventCount: ledger.items.reduce(
            (sum, item) =>
                sum +
                item.signals.filter((signal) => signal.kind === 'TASTE')
                    .length,
            0
        ),
        positiveItemCount: rows.filter((item) => item.score > 0)
            .length,
        negativeItemCount: rows.filter((item) => item.score < 0)
            .length,
        itemScores: rows.slice(0, 100),
        ...dimensions
    }
}

export function buildPreferenceTimescalesV5(
    events: UserEvent[],
    catalog: StoredComic[],
    state: PortablePolicyStateV5,
    input: {
        appSessionId?: string | null
        now?: Date
    } = {}
) {
    const now = input.now ?? new Date()
    const catalogById = new Map(
        catalog.map((comic) => [
            normalizePreferenceKey(comic.comicId),
            comic
        ])
    )
    const cutoff = (days: number) =>
        new Date(now.getTime() - days * 86_400_000)

    const windows = {
        lifetime: lifetimeWindow(events, catalog, state, now),
        days7: eventWindow(
            '7D',
            events,
            catalogById,
            now,
            cutoff(7)
        ),
        days30: eventWindow(
            '30D',
            events,
            catalogById,
            now,
            cutoff(30)
        ),
        days90: eventWindow(
            '90D',
            events,
            catalogById,
            now,
            cutoff(90)
        ),
        session: eventWindow(
            'SESSION',
            events,
            catalogById,
            now,
            null,
            input.appSessionId ?? null
        )
    }

    const persistentControls = state.controls.filter(
        (control) => control.scope === 'PERSISTENT'
    )
    const sessionControls = state.controls.filter(
        (control) => control.scope === 'SESSION'
    )
    const blockControls = state.controls.filter(
        (control) => control.direction === 'BLOCK'
    )
    const activeTemporary = activeTemporarySuppressionsV5(state, now)

    return {
        mode: 'SHADOW' as const,
        preferenceVersion: PREFERENCE_TIMESCALE_VERSION,
        rankingImpact: false,
        generatedAt: now.toISOString(),
        appSessionId: input.appSessionId ?? null,
        layers: {
            inferred: windows,
            explicit: {
                persistentControls,
                sessionControls,
                sessionIntent: state.sessionIntent
            },
            hardConstraints: {
                blockedTargets: blockControls,
                hardSuppressComicIds: [...state.hardSuppressComicIds],
                activeTemporarySuppressions: activeTemporary,
                explicitDistinctPairCount:
                    state.explicitDistinctPairs.length
            }
        },
        diagnostics: {
            lifetimePositiveItems:
                windows.lifetime.positiveItemCount,
            recent7PositiveItems: windows.days7.positiveItemCount,
            recent30PositiveItems:
                windows.days30.positiveItemCount,
            recent90PositiveItems:
                windows.days90.positiveItemCount,
            sessionPositiveItems:
                windows.session.positiveItemCount,
            persistentControlCount: persistentControls.length,
            sessionControlCount: sessionControls.length,
            hardConstraintCount:
                blockControls.length +
                state.hardSuppressComicIds.length +
                activeTemporary.length
        }
    }
}
