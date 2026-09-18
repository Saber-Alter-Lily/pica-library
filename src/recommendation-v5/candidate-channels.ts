import type { StoredComic } from '../library/types'
import type { buildPreferenceTimescalesV5 } from './preference-timescales'
import type {
    PortablePolicyStateV5,
    PreferenceControlV5,
    PreferenceTargetType
} from './portable-policy'
import { normalizePreferenceKey } from './portable-policy'

export const CANDIDATE_CHANNEL_PLANNER_VERSION =
    'candidate-channel-planner-v1'

export type CandidateChannelFamilyV5 =
    | 'TARGET'
    | 'AUTHOR'
    | 'FANDOM'
    | 'TAG'
    | 'CATEGORY'
    | 'RELATED'
    | 'EXPLORATION'
    | 'REDISCOVERY'
    | 'VISUAL'

export type CandidateChannelSourceV5 =
    | 'EXPLICIT_SESSION'
    | 'EXPLICIT_PERSISTENT'
    | 'SESSION'
    | 'RECENT_7D'
    | 'RECENT_30D'
    | 'LIFETIME'
    | 'SYSTEM'

export type CandidateProviderSurfaceV5 =
    | 'pica'
    | 'eh'
    | 'exh'
    | 'local'

export interface CandidateChannelAnchorV5 {
    targetType:
        | 'TAG'
        | 'AUTHOR'
        | 'CATEGORY'
        | 'FANDOM'
        | 'ITEM'
        | 'STYLE_FAMILY'
    key: string
    label: string
    facet?: string
    score?: number
    supportItems?: number
    providerCanonical?: Partial<Record<'eh' | 'exh', string>>
}

export interface CandidateProviderAllocationV5 {
    surface: CandidateProviderSurfaceV5
    eligible: boolean
    plannedRequests: number
    targetCandidates: number
    strategy:
        | 'AUTHOR'
        | 'KEYWORD'
        | 'RELATED'
        | 'POPULAR'
        | 'LOCAL'
        | 'VISUAL'
    failureIsolation: true
    disabledReason?: string
}

export interface CandidateChannelV5 {
    channelId: string
    family: CandidateChannelFamilyV5
    sourceLayer: CandidateChannelSourceV5
    priority: number
    anchors: CandidateChannelAnchorV5[]
    exploration: boolean
    reasonCode: string
    providerAllocations: CandidateProviderAllocationV5[]
    localCandidateIds?: string[]
    enabled: boolean
    disabledReason?: string
}

type PreferenceTimescalesV5 = ReturnType<
    typeof buildPreferenceTimescalesV5
>

export interface CandidateChannelPlannerInputV5 {
    timescales: PreferenceTimescalesV5
    policy: PortablePolicyStateV5
    catalog: StoredComic[]
    tagFacets?: Record<string, string>
    tagProviderCanonicals?: Record<string, string>
    providerEligibility?: Partial<
        Record<'pica' | 'eh' | 'exh', boolean>
    >
    visualEligible?: boolean
}

const globalRequestCaps = {
    pica: 8,
    // Reuse the proven Android V3 pacing envelope. E-H itself enforces a
    // multi-second search interval, so larger shadow budgets add latency
    // faster than useful coverage at the current catalog scale.
    eh: 4,
    exh: 2
} as const

function controlIdentity(targetType: PreferenceTargetType, key: string) {
    return `${targetType}:${normalizePreferenceKey(key)}`
}

function channelFamilyForTarget(
    targetType: PreferenceTargetType,
    facet?: string
): CandidateChannelFamilyV5 {
    if (targetType === 'AUTHOR') return 'AUTHOR'
    if (targetType === 'CATEGORY') return 'CATEGORY'
    if (targetType === 'STYLE_FAMILY') return 'VISUAL'
    if (targetType === 'FANDOM' || facet === 'FANDOM_IP')
        return 'FANDOM'
    return 'TAG'
}

function anchorForControl(
    control: Pick<
        PreferenceControlV5,
        'targetType' | 'key' | 'label'
    >,
    tagFacets: Record<string, string>,
    tagProviderCanonicals: Record<string, string>
): CandidateChannelAnchorV5 {
    const key = normalizePreferenceKey(control.key)
    const facet =
        control.targetType === 'TAG' ? tagFacets[key] : undefined
    return {
        targetType:
            control.targetType === 'TAG' && facet === 'FANDOM_IP'
                ? 'FANDOM'
                : control.targetType,
        key,
        label: control.label || control.key,
        ...(facet ? { facet } : {}),
        ...(tagProviderCanonicals[key]
            ? {
                  providerCanonical: {
                      eh: tagProviderCanonicals[key],
                      exh: tagProviderCanonicals[key]
                  }
              }
            : {})
    }
}

function basePriority(
    source: CandidateChannelSourceV5,
    mode: PortablePolicyStateV5['sessionIntent']['mode']
) {
    let priority =
        source === 'EXPLICIT_SESSION'
            ? 108
            : source === 'SESSION'
              ? 96
              : source === 'EXPLICIT_PERSISTENT'
                ? 88
                : source === 'RECENT_7D'
                  ? 82
                  : source === 'RECENT_30D'
                    ? 74
                    : source === 'LIFETIME'
                      ? 62
                      : 40

    if (mode === 'RECENT') {
        if (source === 'SESSION') priority += 12
        if (source === 'RECENT_7D') priority += 14
        if (source === 'RECENT_30D') priority += 8
        if (source === 'LIFETIME') priority -= 8
    } else if (mode === 'FAMILIAR') {
        if (source === 'LIFETIME') priority += 12
        if (source === 'RECENT_30D') priority += 4
    } else if (mode === 'EXPLORE') {
        if (source === 'LIFETIME') priority -= 8
    }
    return priority
}

function desiredProviderAllocations(
    family: CandidateChannelFamilyV5,
    anchors: CandidateChannelAnchorV5[],
    providerEligibility: {
        pica: boolean
        eh: boolean
        exh: boolean
    }
): CandidateProviderAllocationV5[] {
    const allocation = (
        surface: 'pica' | 'eh' | 'exh',
        strategy: CandidateProviderAllocationV5['strategy'],
        requests: number,
        targetCandidates: number
    ): CandidateProviderAllocationV5 => ({
        surface,
        eligible: Boolean(providerEligibility[surface]),
        plannedRequests: providerEligibility[surface] ? requests : 0,
        targetCandidates: providerEligibility[surface]
            ? targetCandidates
            : 0,
        strategy,
        failureIsolation: true,
        ...(providerEligibility[surface]
            ? {}
            : { disabledReason: 'PROVIDER_NOT_ELIGIBLE' })
    })

    if (family === 'REDISCOVERY')
        return [
            {
                surface: 'local',
                eligible: true,
                plannedRequests: 0,
                targetCandidates: 24,
                strategy: 'LOCAL',
                failureIsolation: true
            }
        ]
    if (family === 'VISUAL')
        return [
            {
                surface: 'local',
                eligible: false,
                plannedRequests: 0,
                targetCandidates: 0,
                strategy: 'VISUAL',
                failureIsolation: true,
                disabledReason: 'VISUAL_DEFERRED_TO_P4'
            }
        ]

    const targetAnchor = anchors[0]
    const strategy: CandidateProviderAllocationV5['strategy'] =
        family === 'AUTHOR' ||
        (family === 'TARGET' && targetAnchor?.targetType === 'AUTHOR')
            ? 'AUTHOR'
            : family === 'RELATED'
              ? 'RELATED'
              : 'KEYWORD'

    // Related lookup currently has a provider-native implementation only on
    // the Pica path. E-H / ExH stay isolated and disabled for this family
    // until their own related-work retriever exists.
    if (family === 'RELATED') {
        const seed = anchors[0]?.key ?? ''
        const picaSeedEligible = !seed.startsWith('eh:')
        return [
            picaSeedEligible
                ? allocation('pica', strategy, 1, 40)
                : {
                      ...allocation('pica', strategy, 0, 0),
                      eligible: false,
                      plannedRequests: 0,
                      targetCandidates: 0,
                      disabledReason:
                          'CROSS_PROVIDER_RELATED_NOT_IMPLEMENTED'
                  },
            {
                ...allocation('eh', strategy, 0, 0),
                eligible: false,
                plannedRequests: 0,
                targetCandidates: 0,
                disabledReason: 'RELATED_RETRIEVER_NOT_IMPLEMENTED'
            },
            {
                ...allocation('exh', strategy, 0, 0),
                eligible: false,
                plannedRequests: 0,
                targetCandidates: 0,
                disabledReason: 'RELATED_RETRIEVER_NOT_IMPLEMENTED'
            }
        ]
    }

    const targetType = anchors[0]?.targetType
    if (
        family === 'CATEGORY' ||
        (family === 'TARGET' && targetType === 'CATEGORY')
    )
        return [
            allocation('pica', 'KEYWORD', 1, 45),
            {
                ...allocation('eh', 'KEYWORD', 0, 0),
                eligible: false,
                plannedRequests: 0,
                targetCandidates: 0,
                disabledReason: 'CATEGORY_RETRIEVER_NOT_IMPLEMENTED'
            },
            {
                ...allocation('exh', 'KEYWORD', 0, 0),
                eligible: false,
                plannedRequests: 0,
                targetCandidates: 0,
                disabledReason: 'CATEGORY_RETRIEVER_NOT_IMPLEMENTED'
            }
        ]

    return [
        allocation(
            'pica',
            strategy,
            1,
            family === 'EXPLORATION' ? 35 : 45
        ),
        allocation(
            'eh',
            strategy,
            1,
            family === 'EXPLORATION' ? 35 : 45
        ),
        allocation(
            'exh',
            strategy,
            1,
            family === 'EXPLORATION' ? 20 : 30
        )
    ]
}

function stableChannelId(
    family: CandidateChannelFamilyV5,
    source: CandidateChannelSourceV5,
    anchors: CandidateChannelAnchorV5[]
) {
    return [
        family,
        source,
        ...anchors.map((anchor) => `${anchor.targetType}:${anchor.key}`)
    ].join('|')
}

function rediscoveryCandidates(
    catalog: StoredComic[],
    timescales: PreferenceTimescalesV5,
    state: PortablePolicyStateV5
) {
    const recent = new Set(
        timescales.layers.inferred.days90.itemScores.map(
            (item) => item.comicId
        )
    )
    const excluded = new Set([
        ...state.tasteExcludedComicIds,
        ...state.hardSuppressComicIds
    ].map(normalizePreferenceKey))
    return catalog
        .filter(
            (comic) =>
                (comic.isFavorite || comic.inLibrary) &&
                !recent.has(normalizePreferenceKey(comic.comicId)) &&
                !excluded.has(normalizePreferenceKey(comic.comicId))
        )
        .sort(
            (a, b) =>
                String(a.lastSeenAt).localeCompare(String(b.lastSeenAt)) ||
                a.comicId.localeCompare(b.comicId)
        )
        .slice(0, 24)
        .map((comic) => comic.comicId)
}

function recentRelatedSeed(
    timescales: PreferenceTimescalesV5
) {
    const source =
        timescales.layers.inferred.session.itemScores.find(
            (item) => item.score > 0
        ) ??
        timescales.layers.inferred.days7.itemScores.find(
            (item) => item.score > 0
        ) ??
        timescales.layers.inferred.days30.itemScores.find(
            (item) => item.score > 0
        )
    return source?.comicId ?? null
}

function favoriteRelatedSeed(
    catalog: StoredComic[],
    timescales: PreferenceTimescalesV5
) {
    const favorites = new Set(
        catalog
            .filter((comic) => comic.isFavorite)
            .map((comic) => normalizePreferenceKey(comic.comicId))
    )
    return (
        timescales.layers.inferred.lifetime.itemScores.find(
            (item) =>
                item.score > 0 &&
                favorites.has(normalizePreferenceKey(item.comicId))
        )?.comicId ??
        [...catalog]
            .filter((comic) => comic.isFavorite)
            .sort((a, b) => a.comicId.localeCompare(b.comicId))[0]
            ?.comicId ??
        null
    )
}

export function buildCandidateChannelPlanV5(
    input: CandidateChannelPlannerInputV5
) {
    const providerEligibility = {
        pica: input.providerEligibility?.pica !== false,
        eh: input.providerEligibility?.eh !== false,
        exh: Boolean(input.providerEligibility?.exh)
    }
    const tagFacets = Object.fromEntries(
        Object.entries(input.tagFacets ?? {}).map(([key, value]) => [
            normalizePreferenceKey(key),
            value
        ])
    )
    const tagProviderCanonicals = Object.fromEntries(
        Object.entries(input.tagProviderCanonicals ?? {}).map(
            ([key, value]) => [
                normalizePreferenceKey(key),
                String(value ?? '').trim()
            ]
        )
    )
    const mode = input.policy.sessionIntent.mode
    const blockedTargets = new Set(
        input.policy.controls
            .filter((control) => control.direction === 'BLOCK')
            .map((control) =>
                controlIdentity(control.targetType, control.key)
            )
    )
    const softDownweights = input.policy.controls
        .filter((control) => control.direction === 'LESS')
        .map((control) => ({
            targetType: control.targetType,
            key: normalizePreferenceKey(control.key),
            levelDelta: control.levelDelta ?? -1
        }))

    const channels: CandidateChannelV5[] = []
    const add = (
        family: CandidateChannelFamilyV5,
        sourceLayer: CandidateChannelSourceV5,
        anchors: CandidateChannelAnchorV5[],
        reasonCode: string,
        options: {
            priorityDelta?: number
            exploration?: boolean
            enabled?: boolean
            disabledReason?: string
            localCandidateIds?: string[]
        } = {}
    ) => {
        const normalizedAnchors = anchors
            .map((anchor) => ({
                ...anchor,
                key: normalizePreferenceKey(anchor.key)
            }))
            .filter((anchor) => anchor.key)
        if (!normalizedAnchors.length && family !== 'REDISCOVERY')
            return
        if (
            normalizedAnchors.some((anchor) =>
                blockedTargets.has(
                    controlIdentity(
                        anchor.targetType === 'FANDOM'
                            ? 'FANDOM'
                            : (anchor.targetType as PreferenceTargetType),
                        anchor.key
                    )
                )
            )
        )
            return
        const enabled = options.enabled !== false
        channels.push({
            channelId: stableChannelId(
                family,
                sourceLayer,
                normalizedAnchors
            ),
            family,
            sourceLayer,
            priority:
                basePriority(sourceLayer, mode) +
                (options.priorityDelta ?? 0),
            anchors: normalizedAnchors,
            exploration: Boolean(options.exploration),
            reasonCode,
            providerAllocations: desiredProviderAllocations(
                family,
                normalizedAnchors,
                providerEligibility
            ),
            ...(options.localCandidateIds
                ? { localCandidateIds: options.localCandidateIds }
                : {}),
            enabled,
            ...(enabled
                ? {}
                : {
                      disabledReason:
                          options.disabledReason ?? 'CHANNEL_DISABLED'
                  })
        })
    }

    const addDimensions = (
        sourceLayer: CandidateChannelSourceV5,
        window: PreferenceTimescalesV5['layers']['inferred']['lifetime'],
        limits: { authors: number; tags: number; categories: number }
    ) => {
        for (const item of window.positive.authors.slice(
            0,
            limits.authors
        ))
            add(
                'AUTHOR',
                sourceLayer,
                [
                    {
                        targetType: 'AUTHOR',
                        key: item.key,
                        label: item.label,
                        score: item.score,
                        supportItems: item.supportItems
                    }
                ],
                'AUTHOR_AFFINITY'
            )
        for (const item of window.positive.tags.slice(0, limits.tags)) {
            const facet = tagFacets[normalizePreferenceKey(item.key)]
            const family =
                facet === 'FANDOM_IP' ? 'FANDOM' : 'TAG'
            add(
                family,
                sourceLayer,
                [
                    {
                        targetType:
                            family === 'FANDOM' ? 'FANDOM' : 'TAG',
                        key: item.key,
                        label: item.label,
                        ...(facet ? { facet } : {}),
                        ...(tagProviderCanonicals[
                            normalizePreferenceKey(item.key)
                        ]
                            ? {
                                  providerCanonical: {
                                      eh: tagProviderCanonicals[
                                          normalizePreferenceKey(item.key)
                                      ],
                                      exh: tagProviderCanonicals[
                                          normalizePreferenceKey(item.key)
                                      ]
                                  }
                              }
                            : {}),
                        score: item.score,
                        supportItems: item.supportItems
                    }
                ],
                family === 'FANDOM'
                    ? 'FANDOM_AFFINITY'
                    : 'TAG_AFFINITY'
            )
        }
        for (const item of window.positive.categories.slice(
            0,
            limits.categories
        ))
            add(
                'CATEGORY',
                sourceLayer,
                [
                    {
                        targetType: 'CATEGORY',
                        key: item.key,
                        label: item.label,
                        score: item.score,
                        supportItems: item.supportItems
                    }
                ],
                'CATEGORY_AFFINITY'
            )
    }

    addDimensions(
        'SESSION',
        input.timescales.layers.inferred.session,
        { authors: 1, tags: 2, categories: 1 }
    )
    addDimensions(
        'RECENT_7D',
        input.timescales.layers.inferred.days7,
        { authors: 1, tags: 2, categories: 1 }
    )
    addDimensions(
        'RECENT_30D',
        input.timescales.layers.inferred.days30,
        { authors: 1, tags: 2, categories: 1 }
    )
    addDimensions(
        'LIFETIME',
        input.timescales.layers.inferred.lifetime,
        { authors: 2, tags: 4, categories: 1 }
    )

    for (const control of input.policy.controls.filter(
        (item) =>
            item.direction === 'MORE' &&
            item.scope === 'SESSION'
    )) {
        const anchor = anchorForControl(control, tagFacets, tagProviderCanonicals)
        add(
            channelFamilyForTarget(control.targetType, anchor.facet),
            'EXPLICIT_SESSION',
            [anchor],
            'EXPLICIT_SESSION_MORE',
            { priorityDelta: Math.max(0, control.levelDelta ?? 0) }
        )
    }
    for (const control of input.policy.controls.filter(
        (item) =>
            item.direction === 'MORE' &&
            item.scope === 'PERSISTENT'
    )) {
        const anchor = anchorForControl(control, tagFacets, tagProviderCanonicals)
        add(
            channelFamilyForTarget(control.targetType, anchor.facet),
            'EXPLICIT_PERSISTENT',
            [anchor],
            'EXPLICIT_PERSISTENT_MORE',
            { priorityDelta: Math.max(0, control.levelDelta ?? 0) }
        )
    }

    const intent = input.policy.sessionIntent
    if (
        intent.mode === 'TARGET' &&
        intent.targetType &&
        intent.key
    ) {
        const anchor = anchorForControl(
            {
                targetType: intent.targetType,
                key: intent.key,
                label: intent.label ?? intent.key
            },
            tagFacets,
            tagProviderCanonicals
        )
        add(
            'TARGET',
            'EXPLICIT_SESSION',
            [anchor],
            'SESSION_TARGET',
            { priorityDelta: 30 }
        )
    }

    const recentSeed = recentRelatedSeed(input.timescales)
    if (recentSeed)
        add(
            'RELATED',
            'RECENT_7D',
            [
                {
                    targetType: 'ITEM',
                    key: recentSeed,
                    label:
                        input.catalog.find(
                            (comic) => comic.comicId === recentSeed
                        )?.title ?? recentSeed
                }
            ],
            'RELATED_RECENT_ITEM',
            { priorityDelta: 3 }
        )

    const favoriteSeed = favoriteRelatedSeed(
        input.catalog,
        input.timescales
    )
    if (favoriteSeed && favoriteSeed !== recentSeed)
        add(
            'RELATED',
            'LIFETIME',
            [
                {
                    targetType: 'ITEM',
                    key: favoriteSeed,
                    label:
                        input.catalog.find(
                            (comic) => comic.comicId === favoriteSeed
                        )?.title ?? favoriteSeed
                }
            ],
            'RELATED_FAVORITE_ITEM'
        )

    const rediscovery = rediscoveryCandidates(
        input.catalog,
        input.timescales,
        input.policy
    )
    if (rediscovery.length)
        add(
            'REDISCOVERY',
            'SYSTEM',
            [],
            'LOCAL_REDISCOVERY',
            {
                localCandidateIds: rediscovery,
                priorityDelta: mode === 'FAMILIAR' ? 18 : 0
            }
        )

    const lifetimeTail = [
        ...input.timescales.layers.inferred.lifetime.positive.tags
    ]
        .sort(
            (a, b) =>
                a.supportItems - b.supportItems ||
                Math.abs(a.score) - Math.abs(b.score) ||
                a.key.localeCompare(b.key)
        )
        .slice(0, mode === 'EXPLORE' ? 2 : 1)
    for (const item of lifetimeTail) {
        const facet = tagFacets[normalizePreferenceKey(item.key)]
        add(
            'EXPLORATION',
            'SYSTEM',
            [
                {
                    targetType:
                        facet === 'FANDOM_IP' ? 'FANDOM' : 'TAG',
                    key: item.key,
                    label: item.label,
                    ...(facet ? { facet } : {}),
                    ...(tagProviderCanonicals[
                        normalizePreferenceKey(item.key)
                    ]
                        ? {
                              providerCanonical: {
                                  eh: tagProviderCanonicals[
                                      normalizePreferenceKey(item.key)
                                  ],
                                  exh: tagProviderCanonicals[
                                      normalizePreferenceKey(item.key)
                                  ]
                              }
                          }
                        : {}),
                    score: item.score,
                    supportItems: item.supportItems
                }
            ],
            'PROFILE_TAIL_EXPLORATION',
            {
                exploration: true,
                priorityDelta: mode === 'EXPLORE' ? 34 : 0
            }
        )
    }

    add(
        'VISUAL',
        'SYSTEM',
        [
            {
                targetType: 'STYLE_FAMILY',
                key: 'visual-v1',
                label: 'Visual V1'
            }
        ],
        'VISUAL_DEFERRED',
        {
            enabled: false,
            disabledReason: input.visualEligible
                ? 'P4_ACTIVATION_NOT_AUTHORIZED'
                : 'VISUAL_NOT_ELIGIBLE'
        }
    )

    const deduped = new Map<string, CandidateChannelV5>()
    for (const channel of channels) {
        const existing = deduped.get(channel.channelId)
        if (!existing || channel.priority > existing.priority)
            deduped.set(channel.channelId, channel)
    }

    const ordered = [...deduped.values()].sort(
        (a, b) =>
            Number(b.enabled) - Number(a.enabled) ||
            b.priority - a.priority ||
            a.channelId.localeCompare(b.channelId)
    )

    const used = { pica: 0, eh: 0, exh: 0 }
    for (const channel of ordered) {
        if (!channel.enabled) continue
        channel.providerAllocations =
            channel.providerAllocations.map((allocation) => {
                if (
                    allocation.surface === 'local' ||
                    !allocation.eligible ||
                    allocation.plannedRequests <= 0
                )
                    return allocation
                const surface = allocation.surface
                const remaining =
                    globalRequestCaps[surface] - used[surface]
                const plannedRequests = Math.max(
                    0,
                    Math.min(
                        allocation.plannedRequests,
                        remaining
                    )
                )
                used[surface] += plannedRequests
                return {
                    ...allocation,
                    plannedRequests,
                    targetCandidates:
                        plannedRequests > 0
                            ? allocation.targetCandidates
                            : 0,
                    ...(plannedRequests > 0
                        ? {}
                        : {
                              eligible: false,
                              disabledReason:
                                  'GLOBAL_PROVIDER_BUDGET_EXHAUSTED'
                          })
                }
            })
    }

    for (const channel of ordered) {
        if (!channel.enabled) continue
        const hasExecutableRoute =
            Boolean(channel.localCandidateIds?.length) ||
            channel.providerAllocations.some(
                (allocation) =>
                    allocation.eligible &&
                    (allocation.surface === 'local' ||
                        allocation.plannedRequests > 0)
            )
        if (!hasExecutableRoute) {
            channel.enabled = false
            channel.disabledReason = 'NO_PROVIDER_ROUTE_AVAILABLE'
        }
    }

    return {
        mode: 'SHADOW' as const,
        plannerVersion: CANDIDATE_CHANNEL_PLANNER_VERSION,
        servingImpact: false,
        providerFailureIsolation: true,
        sessionMode: mode,
        providerBudgets: {
            pica: {
                eligible: providerEligibility.pica,
                maxRequests: globalRequestCaps.pica,
                plannedRequests: used.pica
            },
            eh: {
                eligible: providerEligibility.eh,
                maxRequests: globalRequestCaps.eh,
                plannedRequests: used.eh
            },
            exh: {
                eligible: providerEligibility.exh,
                maxRequests: globalRequestCaps.exh,
                plannedRequests: used.exh
            }
        },
        controlEffects: {
            hardBlockedTargets: [...blockedTargets].sort(),
            softDownweights
        },
        summary: {
            channelCount: ordered.length,
            enabledChannelCount: ordered.filter(
                (channel) => channel.enabled
            ).length,
            disabledChannelCount: ordered.filter(
                (channel) => !channel.enabled
            ).length,
            families: Object.fromEntries(
                (
                    [
                        'TARGET',
                        'AUTHOR',
                        'FANDOM',
                        'TAG',
                        'CATEGORY',
                        'RELATED',
                        'EXPLORATION',
                        'REDISCOVERY',
                        'VISUAL'
                    ] as CandidateChannelFamilyV5[]
                ).map((family) => [
                    family,
                    ordered.filter(
                        (channel) =>
                            channel.enabled &&
                            channel.family === family
                    ).length
                ])
            )
        },
        channels: ordered
    }
}
