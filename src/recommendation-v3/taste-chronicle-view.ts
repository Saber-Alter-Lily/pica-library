import type { HistoricalTasteSnapshot } from './taste-chronicle'
import type { PreferenceControlV5 } from '../recommendation-v5/portable-policy'
import { normalizePreferenceKey } from '../recommendation-v5/portable-policy'
import type { PreferencePresentationIndex } from '../recommendation-v5/preference-discovery'

export interface ChronicleViewOptions {
    hideBlocked?: boolean
    hideLess?: boolean
}

/** A projection of the cached atlas, not a new atlas or a personal-interest model. */
export function projectTasteChronicleView(
    snapshot: HistoricalTasteSnapshot,
    controls: PreferenceControlV5[],
    options: ChronicleViewOptions,
    index: PreferencePresentationIndex
) {
    const hideBlocked = options.hideBlocked === true
    const hideLess = options.hideLess === true
    const enabled = hideBlocked || hideLess
    const selected = controls.filter(
        (control) =>
            control.scope === 'PERSISTENT' &&
            ((hideBlocked && control.direction === 'BLOCK') ||
                (hideLess && control.direction === 'LESS'))
    )
    const tags = new Set(
        selected
            .filter((item) => ['TAG', 'FANDOM'].includes(item.targetType))
            .map((item) => index.displayIdentity(item.key))
    )
    const authors = new Set(
        selected
            .filter((item) => item.targetType === 'AUTHOR')
            .map((item) => normalizePreferenceKey(item.key))
    )
    const hidden = (key: string) => tags.has(index.displayIdentity(key))
    const supported =
        Number(snapshot.snapshotVersion) >= 2 &&
        Array.isArray(snapshot.facetBands)
    let view = snapshot
    if (enabled && supported) {
        const themes = snapshot.themes.filter(
            (theme) =>
                !theme.anchors.some((anchor) => hidden(anchor.canonicalKey))
        )
        const themeIds = new Set(themes.map((theme) => theme.themeId))
        view = {
            ...snapshot,
            facetBands: snapshot.facetBands
                .map((band) => ({
                    ...band,
                    interests: band.interests.filter(
                        (item) => !hidden(item.canonicalKey)
                    )
                }))
                .filter((band) => band.interests.length > 0),
            themes,
            themeEdges: snapshot.themeEdges.filter(
                (edge) =>
                    themeIds.has(edge.sourceThemeId) &&
                    themeIds.has(edge.targetThemeId)
            ),
            fandomPreferences: snapshot.fandomPreferences.filter(
                (item) => !hidden(item.canonicalKey)
            ),
            authorPreferences: snapshot.authorPreferences.filter(
                (item) => !authors.has(normalizePreferenceKey(item.value))
            ),
            combinations: snapshot.combinations.filter(
                (item) => !item.canonicalKeys.some(hidden)
            )
        }
    }
    const countInterests = (value: HistoricalTasteSnapshot) =>
        (value.facetBands || []).reduce(
            (n, band) => n + band.interests.length,
            0
        )
    return {
        snapshot: view,
        view: {
            mode:
                enabled && supported
                    ? 'FILTERED_COLLECTION'
                    : 'OBJECTIVE_COLLECTION',
            hideBlocked,
            hideLess,
            supported,
            registryAvailable: index.registryAvailable,
            hiddenInterests: countInterests(snapshot) - countInterests(view),
            hiddenThemes:
                (snapshot.themes || []).length - (view.themes || []).length,
            hiddenAuthors:
                (snapshot.authorPreferences || []).length -
                (view.authorPreferences || []).length,
            unsupportedControlCount: selected.filter(
                (item) => !['TAG', 'FANDOM', 'AUTHOR'].includes(item.targetType)
            ).length,
            originalThemeCount: (snapshot.themes || []).length,
            originalFavoriteCount: snapshot.favoriteCount,
            denominator: 'ORIGINAL_SNAPSHOT',
            snapshotId: snapshot.snapshotId,
            generatedAt: snapshot.generatedAt
        }
    }
}
