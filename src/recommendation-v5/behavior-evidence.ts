import type { StoredComic } from '../library/types'
import type { UserEvent, V3EventType } from '../recommendation-v3/types'
import type { PortablePolicyStateV5 } from './portable-policy'
import {
    activeTemporarySuppressionsV5,
    normalizePreferenceKey
} from './portable-policy'

export const BEHAVIOR_EVIDENCE_VERSION = 'behavior-evidence-v1'

export type BehaviorEvidenceKindV5 =
    | 'TASTE'
    | 'OWNERSHIP'
    | 'EXPOSURE'
    | 'IDENTITY_REPORT'
    | 'TEMPORAL_CONSTRAINT'
    | 'HARD_CONSTRAINT'
    | 'PROFILE_CONTROL'
    | 'STATE_CHANGE'

export type BehaviorEvidencePolarityV5 =
    | 'POSITIVE'
    | 'NEGATIVE'
    | 'NEUTRAL'
    | 'UNKNOWN'

export type BehaviorEvidenceStrengthV5 =
    | 'STRONG'
    | 'MODERATE'
    | 'WEAK'
    | 'NONE'

export interface BehaviorEvidenceSignalV5 {
    comicId: string
    kind: BehaviorEvidenceKindV5
    polarity: BehaviorEvidencePolarityV5
    strength: BehaviorEvidenceStrengthV5
    source: 'EVENT' | 'CATALOG' | 'POLICY'
    sourceType: string
    explicit: boolean
    occurredAt: string | null
    contextKey: string | null
    metadata?: Record<string, unknown>
}

export type BehaviorTasteClassV5 =
    | 'EXCLUDED'
    | 'EXPLICIT_NEGATIVE'
    | 'STRONG_POSITIVE'
    | 'POSITIVE'
    | 'WEAK_POSITIVE'
    | 'UNKNOWN'

const tasteSignal = (
    event: UserEvent,
    strength: Exclude<BehaviorEvidenceStrengthV5, 'NONE'>,
    polarity: 'POSITIVE' | 'NEGATIVE' = 'POSITIVE',
    explicit = false
): BehaviorEvidenceSignalV5 => ({
    comicId: event.comicId!,
    kind: 'TASTE',
    polarity,
    strength,
    source: 'EVENT',
    sourceType: event.eventType,
    explicit,
    occurredAt: event.occurredAt,
    contextKey: event.contextId ?? event.id
})

const factSignal = (
    comicId: string,
    kind: Exclude<BehaviorEvidenceKindV5, 'TASTE'>,
    source: 'EVENT' | 'CATALOG' | 'POLICY',
    sourceType: string,
    input: {
        occurredAt?: string | null
        contextKey?: string | null
        metadata?: Record<string, unknown>
        polarity?: BehaviorEvidencePolarityV5
        explicit?: boolean
    } = {}
): BehaviorEvidenceSignalV5 => ({
    comicId,
    kind,
    polarity: input.polarity ?? 'NEUTRAL',
    strength: 'NONE',
    source,
    sourceType,
    explicit: input.explicit ?? false,
    occurredAt: input.occurredAt ?? null,
    contextKey: input.contextKey ?? null,
    ...(input.metadata ? { metadata: input.metadata } : {})
})

export function classifyBehaviorEventV5(
    event: UserEvent
): BehaviorEvidenceSignalV5[] {
    if (!event.comicId) return []
    const comicId = event.comicId
    const stateChange = (sourceType: V3EventType) => [
        factSignal(comicId, 'STATE_CHANGE', 'EVENT', sourceType, {
            occurredAt: event.occurredAt,
            contextKey: event.contextId ?? event.id
        })
    ]

    switch (event.eventType) {
        case 'recommend_like':
            return [tasteSignal(event, 'STRONG', 'POSITIVE', true)]
        case 'recommend_dislike':
            return [tasteSignal(event, 'STRONG', 'NEGATIVE', true)]
        case 'favorite_add':
            return [tasteSignal(event, 'STRONG')]
        case 'favorite_remove':
            return stateChange(event.eventType)
        case 'reader_complete':
            return [tasteSignal(event, 'MODERATE')]
        case 'reader_open':
        case 'reader_progress':
        case 'search_result_open':
        case 'recommend_detail_open':
        case 'preview_open':
        case 'preview_more':
            return [tasteSignal(event, 'WEAK')]
        case 'shelf_add':
            return [tasteSignal(event, 'MODERATE')]
        case 'shelf_remove':
            return stateChange(event.eventType)
        case 'download_enqueue':
        case 'download_complete':
            return [
                factSignal(comicId, 'OWNERSHIP', 'EVENT', event.eventType, {
                    occurredAt: event.occurredAt,
                    contextKey: event.contextId ?? event.id
                }),
                tasteSignal(event, 'WEAK')
            ]
        case 'download_cancel':
        case 'download_failed':
            return stateChange(event.eventType)
        case 'recommend_impression':
            return [
                factSignal(comicId, 'EXPOSURE', 'EVENT', event.eventType, {
                    occurredAt: event.occurredAt,
                    contextKey: event.contextId ?? event.id
                })
            ]
        case 'recommendation_item_disposition': {
            if (event.metadata.active === false) return stateChange(event.eventType)
            const reason = String(event.metadata.reason ?? '')
            const kind =
                reason === 'already_owned'
                    ? 'OWNERSHIP'
                    : reason === 'already_seen'
                      ? 'EXPOSURE'
                      : reason === 'duplicate'
                        ? 'IDENTITY_REPORT'
                        : reason === 'temporary'
                          ? 'TEMPORAL_CONSTRAINT'
                          : 'STATE_CHANGE'
            return [
                factSignal(comicId, kind, 'EVENT', event.eventType, {
                    occurredAt: event.occurredAt,
                    contextKey: event.contextId ?? event.id,
                    metadata: { reason }
                })
            ]
        }
        case 'recommendation_taste_exclusion':
            return [
                factSignal(
                    comicId,
                    'PROFILE_CONTROL',
                    'EVENT',
                    event.eventType,
                    {
                        occurredAt: event.occurredAt,
                        contextKey: event.contextId ?? event.id,
                        metadata: {
                            excluded: Boolean(event.metadata.excluded)
                        }
                    }
                )
            ]
        default:
            return []
    }
}

function currentCatalogSignals(comic: StoredComic) {
    const signals: BehaviorEvidenceSignalV5[] = []
    if (comic.isFavorite)
        signals.push({
            comicId: comic.comicId,
            kind: 'TASTE',
            polarity: 'POSITIVE',
            strength: 'STRONG',
            source: 'CATALOG',
            sourceType: 'favorite_current',
            explicit: false,
            occurredAt: comic.lastSeenAt || null,
            contextKey: null
        })
    if (comic.downloadedPictures > 0) {
        signals.push(
            factSignal(
                comic.comicId,
                'OWNERSHIP',
                'CATALOG',
                'downloaded_current'
            )
        )
        signals.push({
            comicId: comic.comicId,
            kind: 'TASTE',
            polarity: 'POSITIVE',
            strength: 'WEAK',
            source: 'CATALOG',
            sourceType: 'downloaded_current',
            explicit: false,
            occurredAt: null,
            contextKey: null
        })
    } else if (comic.inLibrary) {
        signals.push(
            factSignal(
                comic.comicId,
                'OWNERSHIP',
                'CATALOG',
                'library_current'
            )
        )
    }
    return signals
}

function uniqueContextCount(
    signals: BehaviorEvidenceSignalV5[],
    sourceType: string
) {
    return new Set(
        signals
            .filter((signal) => signal.sourceType === sourceType)
            .map((signal) => signal.contextKey ?? `${signal.sourceType}:${signal.occurredAt ?? 'unknown'}`)
    ).size
}

function latestExplicitSentiment(signals: BehaviorEvidenceSignalV5[]) {
    const explicit = signals
        .filter(
            (signal) =>
                signal.kind === 'TASTE' &&
                signal.explicit &&
                (signal.sourceType === 'recommend_like' ||
                    signal.sourceType === 'recommend_dislike')
        )
        .sort(
            (a, b) =>
                String(a.occurredAt ?? '').localeCompare(
                    String(b.occurredAt ?? '')
                ) || a.sourceType.localeCompare(b.sourceType)
        )
    return explicit.at(-1) ?? null
}

function tasteClass(
    signals: BehaviorEvidenceSignalV5[],
    excluded: boolean
): BehaviorTasteClassV5 {
    if (excluded) return 'EXCLUDED'
    const explicit = latestExplicitSentiment(signals)
    if (explicit?.polarity === 'NEGATIVE') return 'EXPLICIT_NEGATIVE'
    if (explicit?.polarity === 'POSITIVE') return 'STRONG_POSITIVE'

    const positive = signals.filter(
        (signal) =>
            signal.kind === 'TASTE' && signal.polarity === 'POSITIVE'
    )
    if (positive.some((signal) => signal.strength === 'STRONG'))
        return 'STRONG_POSITIVE'

    const completedReads = uniqueContextCount(signals, 'reader_complete')
    if (completedReads >= 2) return 'STRONG_POSITIVE'
    if (
        completedReads === 1 ||
        positive.some((signal) => signal.strength === 'MODERATE')
    )
        return 'POSITIVE'
    if (positive.some((signal) => signal.strength === 'WEAK'))
        return 'WEAK_POSITIVE'
    return 'UNKNOWN'
}

export function buildBehaviorEvidenceLedgerV5(
    events: UserEvent[],
    catalog: StoredComic[],
    state: PortablePolicyStateV5,
    now = new Date()
) {
    const byComic = new Map<string, BehaviorEvidenceSignalV5[]>()
    const add = (signal: BehaviorEvidenceSignalV5) => {
        const comicId = normalizePreferenceKey(signal.comicId)
        if (!comicId) return
        byComic.set(comicId, [
            ...(byComic.get(comicId) || []),
            { ...signal, comicId }
        ])
    }

    for (const event of events)
        for (const signal of classifyBehaviorEventV5(event)) add(signal)
    for (const comic of catalog)
        for (const signal of currentCatalogSignals(comic)) add(signal)

    const addPolicy = (
        ids: Iterable<string>,
        kind: Exclude<BehaviorEvidenceKindV5, 'TASTE'>,
        sourceType: string
    ) => {
        for (const rawId of ids) {
            const comicId = normalizePreferenceKey(rawId)
            if (!comicId) continue
            add(
                factSignal(comicId, kind, 'POLICY', sourceType, {
                    explicit: true
                })
            )
        }
    }
    addPolicy(state.ownedComicIds, 'OWNERSHIP', 'owned_explicit')
    addPolicy(state.seenComicIds, 'EXPOSURE', 'seen_explicit')
    addPolicy(
        state.duplicateReportComicIds,
        'IDENTITY_REPORT',
        'duplicate_explicit'
    )
    addPolicy(
        state.hardSuppressComicIds,
        'HARD_CONSTRAINT',
        'hard_suppress'
    )
    addPolicy(
        state.tasteExcludedComicIds,
        'PROFILE_CONTROL',
        'taste_excluded'
    )
    addPolicy(
        activeTemporarySuppressionsV5(state, now).map(
            (item) => item.comicId
        ),
        'TEMPORAL_CONSTRAINT',
        'temporary_suppress'
    )

    const excluded = new Set(
        state.tasteExcludedComicIds.map(normalizePreferenceKey)
    )
    const catalogById = new Map(
        catalog.map((comic) => [
            normalizePreferenceKey(comic.comicId),
            comic
        ])
    )
    const items = [...byComic.entries()]
        .map(([comicId, signals]) => {
            const current = catalogById.get(comicId)
            const explicit = latestExplicitSentiment(signals)
            const ownershipSources = [
                ...new Set(
                    signals
                        .filter(
                            (signal) => signal.kind === 'OWNERSHIP'
                        )
                        .map((signal) => signal.sourceType)
                )
            ].sort()
            const exposureSources = [
                ...new Set(
                    signals
                        .filter(
                            (signal) => signal.kind === 'EXPOSURE'
                        )
                        .map((signal) => signal.sourceType)
                )
            ].sort()
            return {
                comicId,
                title: current?.title ?? '',
                tasteClass: tasteClass(
                    signals,
                    excluded.has(comicId)
                ),
                tasteExcluded: excluded.has(comicId),
                explicitSentiment: explicit
                    ? explicit.polarity === 'NEGATIVE'
                        ? ('DISLIKE' as const)
                        : ('LIKE' as const)
                    : null,
                currentFavorite: Boolean(current?.isFavorite),
                currentDownloaded: Boolean(
                    current && current.downloadedPictures > 0
                ),
                ownership: ownershipSources.length > 0,
                ownershipSources,
                exposureSources,
                exposureCount: signals.filter(
                    (signal) => signal.kind === 'EXPOSURE'
                ).length,
                completedReadContexts: uniqueContextCount(
                    signals,
                    'reader_complete'
                ),
                weakTasteSignalCount: signals.filter(
                    (signal) =>
                        signal.kind === 'TASTE' &&
                        signal.polarity === 'POSITIVE' &&
                        signal.strength === 'WEAK'
                ).length,
                signals: signals.sort(
                    (a, b) =>
                        String(a.occurredAt ?? '').localeCompare(
                            String(b.occurredAt ?? '')
                        ) ||
                        a.kind.localeCompare(b.kind) ||
                        a.sourceType.localeCompare(b.sourceType)
                )
            }
        })
        .sort((a, b) => a.comicId.localeCompare(b.comicId))

    const classCounts = Object.fromEntries(
        (
            [
                'EXCLUDED',
                'EXPLICIT_NEGATIVE',
                'STRONG_POSITIVE',
                'POSITIVE',
                'WEAK_POSITIVE',
                'UNKNOWN'
            ] as BehaviorTasteClassV5[]
        ).map((value) => [
            value,
            items.filter((item) => item.tasteClass === value).length
        ])
    ) as Record<BehaviorTasteClassV5, number>

    return {
        mode: 'SHADOW' as const,
        evidenceVersion: BEHAVIOR_EVIDENCE_VERSION,
        rankingImpact: false,
        generatedAt: now.toISOString(),
        summary: {
            eventCount: events.length,
            catalogComicCount: catalog.length,
            evidenceComicCount: items.length,
            ownershipComicCount: items.filter((item) => item.ownership)
                .length,
            exposedComicCount: items.filter(
                (item) => item.exposureCount > 0
            ).length,
            tasteExcludedCount: items.filter(
                (item) => item.tasteExcluded
            ).length,
            classCounts
        },
        items
    }
}
