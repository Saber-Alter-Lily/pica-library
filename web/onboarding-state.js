// Guide progress is browser-local help state, never recommendation/account state.
export const GUIDE_VERSION = 3
export const ADVANCED_CHAPTER_IDS = ['accounts', 'preferences', 'visual', 'connections', 'storage', 'diagnostics', 'maintenance']

const count = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0
const progress = (value = {}) => ({
    completedVersion: count(value?.completedVersion),
    dismissedVersion: count(value?.dismissedVersion),
    position: Math.min(50, count(value?.position))
})

export function normalizeGuideState(value = {}) {
    const source = value && typeof value === 'object' ? value : {}
    // Existing v2 users already saw the daily content. Do not force another welcome.
    const inherited = (version) => count(version) >= 2 ? GUIDE_VERSION : count(version)
    const daily = source.daily ? progress(source.daily) : progress({
        completedVersion: inherited(source.completedVersion),
        dismissedVersion: inherited(source.dismissedVersion)
    })
    const chapters = Object.fromEntries(ADVANCED_CHAPTER_IDS.map((id) => [id, progress(source.chapters?.[id])]))
    return { autoShow: source.autoShow !== false, daily, chapters,
        completedVersion: daily.completedVersion, dismissedVersion: daily.dismissedVersion }
}

export function updateGuideProgress(value, track, chapter, patch) {
    const state = normalizeGuideState(value)
    if (track === 'advanced') {
        if (!ADVANCED_CHAPTER_IDS.includes(chapter)) return state
        state.chapters[chapter] = progress({ ...state.chapters[chapter], ...patch })
    } else {
        state.daily = progress({ ...state.daily, ...patch })
        state.completedVersion = state.daily.completedVersion
        state.dismissedVersion = state.daily.dismissedVersion
    }
    return state
}

export function shouldPromptDaily(value, sessionDismissed = false) {
    const state = normalizeGuideState(value)
    return state.autoShow && !sessionDismissed &&
        Math.max(state.daily.completedVersion, state.daily.dismissedVersion) < GUIDE_VERSION
}
