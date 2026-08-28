import type { StoredComic } from '../library/types'
import { buildTasteClusters } from './taste-model'
import { mineTagPreferences } from './tag-combinations'
import type { ProfileWindow, UserEvent, V3EventType, V3Profile } from './types'

export const BEHAVIOR_CONFIG = {
    recentHalfLifeDays: 21,
    historicalFloor: 0.25,
    engagement: {
        recommend_impression: 0.05,
        recommend_detail_open: 0.2,
        search_result_open: 0.2,
        preview_open: 0.35,
        preview_more: 0.5,
        shelf_add: 0.65,
        favorite_add: 0.8,
        download_enqueue: 0.8,
        download_complete: 0.9,
        reader_open: 0.9,
        reader_progress: 0.95,
        reader_complete: 1
    } satisfies Partial<Record<V3EventType, number>>,
    negative: {
        favorite_remove: 1,
        shelf_remove: 0.35,
        download_cancel: 0.25
    } satisfies Partial<Record<V3EventType, number>>
} as const

function eventStrength(eventType: V3EventType) {
    return (
        BEHAVIOR_CONFIG.engagement[
            eventType as keyof typeof BEHAVIOR_CONFIG.engagement
        ] ?? 0
    )
}

function strongestByContext(events: UserEvent[]) {
    const contexts = new Map<string, UserEvent>()
    for (const event of events) {
        const strength = eventStrength(event.eventType)
        if (!event.comicId || strength <= 0) continue
        const key = `${event.contextId ?? event.id}:${event.comicId}`
        const previous = contexts.get(key)
        if (!previous || strength > eventStrength(previous.eventType))
            contexts.set(key, event)
    }
    return [...contexts.values()]
}

function profileWindow(
    events: UserEvent[],
    catalog: StoredComic[]
): ProfileWindow {
    const byId = new Map(catalog.map((comic) => [comic.comicId, comic]))
    const evidence = strongestByContext(events).flatMap((event) => {
        const comic = event.comicId ? byId.get(event.comicId) : undefined
        return comic ? [{ ...comic, isFavorite: true }] : []
    })
    return {
        clusters: buildTasteClusters(evidence),
        tags: mineTagPreferences(evidence, catalog),
        pairs: [],
        triples: []
    }
}

export function buildBehaviorProfile(
    historical: V3Profile,
    events: UserEvent[],
    catalog: StoredComic[],
    appSessionId?: string | null,
    now = new Date()
): V3Profile {
    const lifetimeEvents = events.filter((event) => event.comicId)
    const recentCutoff = now.getTime() - 90 * 86_400_000
    const recentEvents = lifetimeEvents.filter(
        (event) => new Date(event.occurredAt).getTime() >= recentCutoff
    )
    const sessionEvents = appSessionId
        ? lifetimeEvents.filter((event) => event.appSessionId === appSessionId)
        : []
    return {
        ...historical,
        lifetime: profileWindow(lifetimeEvents, catalog),
        recent: profileWindow(recentEvents, catalog),
        session: profileWindow(sessionEvents, catalog),
        generatedAt: now.toISOString(),
        evidenceCutoff: now.toISOString()
    }
}

export function profileConfidence(profile: V3Profile) {
    const volumes = {
        historical: profile.historical.clusters.reduce(
            (sum, item) => sum + item.size,
            0
        ),
        lifetime: profile.lifetime.clusters.reduce(
            (sum, item) => sum + item.size,
            0
        ),
        recent: profile.recent.clusters.reduce(
            (sum, item) => sum + item.size,
            0
        ),
        session: profile.session.clusters.reduce(
            (sum, item) => sum + item.size,
            0
        )
    }
    const raw = {
        historical: Math.max(
            BEHAVIOR_CONFIG.historicalFloor,
            Math.log1p(volumes.historical)
        ),
        lifetime: Math.log1p(volumes.lifetime) * 0.8,
        recent: Math.log1p(volumes.recent) * 1.1,
        session: Math.log1p(volumes.session) * 1.5
    }
    const total = Object.values(raw).reduce((sum, value) => sum + value, 0) || 1
    return Object.fromEntries(
        Object.entries(raw).map(([key, value]) => [key, value / total])
    ) as Record<keyof typeof raw, number>
}
