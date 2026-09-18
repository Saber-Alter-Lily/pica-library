from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding="utf-8")

def write(path, content):
    (ROOT / path).write_text(content, encoding="utf-8")

def once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"missing marker: {label}")
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Portable state: explicit exclusion from taste inference while preserving
# ownership and the comic record.
# ---------------------------------------------------------------------------
path = "src/recommendation-v5/portable-policy.ts"
s = read(path)
s = once(
    s,
    """    temporarySuppressions: TemporarySuppressionV5[]
    explicitDistinctPairs: string[]
""",
    """    temporarySuppressions: TemporarySuppressionV5[]
    tasteExcludedComicIds: string[]
    explicitDistinctPairs: string[]
""",
    "taste excluded state field",
)
s = once(
    s,
    """        temporarySuppressed: number
    }
}
""",
    """        temporarySuppressed: number
        tasteExcluded: number
    }
}
""",
    "taste excluded count",
)
s = once(
    s,
    """        temporarySuppressions: [],
        explicitDistinctPairs: [],
""",
    """        temporarySuppressions: [],
        tasteExcludedComicIds: [],
        explicitDistinctPairs: [],
""",
    "default taste excluded ids",
)
old_sig = """export function portableInferredSignalsV5(catalog: StoredComic[], limit = 120): PortablePreferenceSignalV5[] {
    const positives = catalog.filter((comic) => comic.isFavorite)
"""
new_sig = """export function portableInferredSignalsV5(
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
"""
s = once(s, old_sig, new_sig, "portable inferred exclusion")
s = once(
    s,
    """        inferred: portableInferredSignalsV5(catalog),
""",
    """        inferred: portableInferredSignalsV5(
            catalog,
            120,
            state.tasteExcludedComicIds
        ),
""",
    "snapshot inferred exclusion",
)
s = once(
    s,
    """            temporarySuppressed: activeTemporarySuppressionsV5(state).length
""",
    """            temporarySuppressed: activeTemporarySuppressionsV5(state).length,
            tasteExcluded: state.tasteExcludedComicIds.length
""",
    "snapshot taste excluded count",
)
write(path, s)

# ---------------------------------------------------------------------------
# Store: normalize, mutate, audit, and prepare mobile sync fields.
# ---------------------------------------------------------------------------
path = "src/recommendation-v5/policy-store.ts"
s = read(path)
s = once(
    s,
    """    clearSuppressComicIds?: unknown
}
""",
    """    clearSuppressComicIds?: unknown
    tasteExcludedComicIds?: unknown
    clearTasteExcludedComicIds?: unknown
}
""",
    "mobile taste exclusion fields",
)
s = once(
    s,
    """                temporarySuppressions: activeTemporarySuppressionsV5({
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
                explicitDistinctPairs: Array.isArray(stored.explicitDistinctPairs)
""",
    """                temporarySuppressions: activeTemporarySuppressionsV5({
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
""",
    "normalize taste excluded ids",
)
marker = """    private applyFeedback(
"""
if marker not in s:
    raise RuntimeError("missing applyFeedback marker")
method = """    setTasteExclusion(
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

"""
s = s.replace(marker, method + marker, 1)
old_merge = """        const suppressed = new Set(state.hardSuppressComicIds)
        for (const id of stringArray(input.suppressComicIds)) suppressed.add(id)
        for (const id of stringArray(input.clearSuppressComicIds)) suppressed.delete(id)
        state = {
            ...state,
            hardSuppressComicIds: [...suppressed].sort(),
"""
new_merge = """        const suppressed = new Set(state.hardSuppressComicIds)
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
"""
s = once(s, old_merge, new_merge, "mobile taste exclusion merge")
write(path, s)

# ---------------------------------------------------------------------------
# Event taxonomy.
# ---------------------------------------------------------------------------
path = "src/recommendation-v3/types.ts"
s = read(path)
s = once(
    s,
    """    | 'recommendation_item_disposition'
    | 'preview_open'
""",
    """    | 'recommendation_item_disposition'
    | 'recommendation_taste_exclusion'
    | 'preview_open'
""",
    "taste exclusion event type",
)
write(path, s)

# ---------------------------------------------------------------------------
# Desktop service: endpoint method and actual consumption by profile, retrieval
# seeds, and visual preference prototypes.
# ---------------------------------------------------------------------------
path = "src/library/service.ts"
s = read(path)
marker = """    mergeMobileRecommendationV5(input: MobileRecommendationSyncV5) {
"""
if marker not in s:
    raise RuntimeError("missing merge mobile marker")
method = """    updateRecommendationV5TasteExclusion(
        input: Record<string, unknown>
    ) {
        const store = new RecommendationPolicyStoreV5(this.database)
        store.setTasteExclusion(
            String(input.comicId ?? ''),
            input.excluded !== false,
            'DESKTOP'
        )
        return this.recommendationV5Snapshot()
    }

"""
s = s.replace(marker, method + marker, 1)

old_visual = """    visualPreferenceProfile() {
        const catalog = this.database.listComics({ limit: 10000 })
        const favorites = new Set(
            catalog
                .filter((comic) => comic.isFavorite)
                .map((comic) => comic.comicId)
        )
"""
new_visual = """    visualPreferenceProfile() {
        const catalog = this.database.listComics({ limit: 10000 })
        const tasteExcluded = new Set(
            new RecommendationPolicyStoreV5(this.database).state()
                .tasteExcludedComicIds
        )
        const favorites = new Set(
            catalog
                .filter(
                    (comic) =>
                        comic.isFavorite &&
                        !tasteExcluded.has(comic.comicId)
                )
                .map((comic) => comic.comicId)
        )
"""
s = once(s, old_visual, new_visual, "visual preference exclusions")

old_cycle = """        const recommendationV5State = recommendationV5Store.state()
        const readingIds = new Set(this.database.readingProgress().map((item) => item.comicId))
        const explicitFavoriteIds = new Set(
            catalog
                .filter((comic) => comic.isFavorite)
                .map((comic) => comic.comicId)
        )
"""
new_cycle = """        const recommendationV5State = recommendationV5Store.state()
        const tasteExcludedIds = new Set(
            recommendationV5State.tasteExcludedComicIds
        )
        const readingIds = new Set(
            this.database.readingProgress().map((item) => item.comicId)
        )
        const explicitFavoriteIds = new Set(
            catalog
                .filter(
                    (comic) =>
                        comic.isFavorite &&
                        !tasteExcludedIds.has(comic.comicId)
                )
                .map((comic) => comic.comicId)
        )
"""
s = once(s, old_cycle, new_cycle, "cycle taste exclusions")
s = once(
    s,
    """                (comic) =>
                    !dislikedIds.has(comic.comicId) &&
                    (comic.isFavorite || likedIds.has(comic.comicId))
""",
    """                (comic) =>
                    !tasteExcludedIds.has(comic.comicId) &&
                    !dislikedIds.has(comic.comicId) &&
                    (comic.isFavorite || likedIds.has(comic.comicId))
""",
    "positive seed taste exclusions",
)
s = once(
    s,
    """                    hardSuppressCount:
                        recommendationV5State.hardSuppressComicIds.length,
""",
    """                    hardSuppressCount:
                        recommendationV5State.hardSuppressComicIds.length,
                    tasteExcludedCount:
                        recommendationV5State.tasteExcludedComicIds.length,
""",
    "telemetry taste exclusion count",
)
write(path, s)

# ---------------------------------------------------------------------------
# Server endpoint.
# ---------------------------------------------------------------------------
path = "src/library/server.ts"
s = read(path)
marker = """            if (
                url.pathname === '/api/v1/recommendation-v5/suppress' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    options.service.suppressRecommendationV5Comic(input)
                )
            }

"""
if marker not in s:
    raise RuntimeError("missing v5 suppress route")
route = marker + """            if (
                url.pathname ===
                    '/api/v1/recommendation-v5/taste-exclusion' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                return json(
                    response,
                    200,
                    options.service.updateRecommendationV5TasteExclusion(input)
                )
            }

"""
s = s.replace(marker, route, 1)
write(path, s)

# ---------------------------------------------------------------------------
# Library DOM exposes favorite state; V5 module adds one compact toggle only
# on actual favorites, avoiding another global settings list.
# ---------------------------------------------------------------------------
path = "web/app.js"
s = read(path)
s = once(
    s,
    """            (comic) => `<article class="comic-card">
""",
    """            (comic) => `<article class="comic-card" data-comic-id="${escapeHtml(comic.comicId)}" data-is-favorite="${comic.isFavorite ? 'true' : 'false'}">
""",
    "grid favorite metadata",
)
s = once(
    s,
    """            (comic) => `<tr>
""",
    """            (comic) => `<tr data-comic-id="${escapeHtml(comic.comicId)}" data-is-favorite="${comic.isFavorite ? 'true' : 'false'}">
""",
    "list favorite metadata",
)
write(path, s)

path = "web/recommendation-v5-beta.js"
s = read(path)
css_marker = """#recommend-results .result{position:relative;transition:opacity .2s ease,filter .2s ease}
"""
if css_marker not in s:
    raise RuntimeError("missing v5 css marker")
s = s.replace(
    css_marker,
    css_marker + """.v5-taste-toggle{margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.v5-taste-toggle button{min-height:34px;padding:5px 9px}
.v5-taste-toggle .status{margin:0}
""",
    1,
)
marker = """function decorateRecommendationCards() {
"""
if marker not in s:
    raise RuntimeError("missing recommendation decorator")
library_fn = """function tasteExcluded(comicId) {
    return Array.isArray(V5.snapshot?.tasteExcludedComicIds) &&
        V5.snapshot.tasteExcludedComicIds.includes(comicId)
}

async function setTasteExclusion(comicId, excluded) {
    try {
        V5.snapshot = await post(
            '/api/v1/recommendation-v5/taste-exclusion',
            { comicId, excluded }
        )
        renderPolicy()
        decorateLibraryTasteToggles()
        showToast(
            excluded
                ? '收藏已保留，但这本不再参与推荐口味画像。'
                : '这本收藏已恢复参与推荐口味画像。',
            'positive'
        )
    } catch (error) {
        showToast('口味画像设置失败：' + error.message, 'negative')
    }
}

function decorateLibraryTasteToggles() {
    ensureStyles()
    document
        .querySelectorAll(
            '#comic-grid .comic-card[data-is-favorite="true"], #comic-rows tr[data-is-favorite="true"]'
        )
        .forEach((card) => {
            const comicId =
                card.dataset.comicId ||
                card.querySelector('[data-comic-id]')?.dataset.comicId
            if (!comicId) return
            const target =
                card.querySelector('.comic-card-body') ||
                card.querySelector('td:nth-child(2)')
            if (!target) return
            let holder = target.querySelector('.v5-taste-toggle')
            if (!holder) {
                holder = document.createElement('div')
                holder.className = 'v5-taste-toggle'
                target.appendChild(holder)
            }
            const excluded = tasteExcluded(comicId)
            holder.innerHTML =
                '<span class="status">推荐口味：' +
                (excluded ? '已排除' : '参与') +
                '</span><button type="button">' +
                (excluded
                    ? '恢复用于推荐口味'
                    : '保留收藏，但不用于推荐口味') +
                '</button>'
            holder.querySelector('button').addEventListener('click', () => {
                void setTasteExclusion(comicId, !excluded)
            })
        })
}

"""
s = s.replace(marker, library_fn + marker, 1)
observer_marker = """const recommendationRoot=document.querySelector('#recommend-results')
"""
if observer_marker not in s:
    raise RuntimeError("missing recommendation observer marker")
library_observer = """const libraryRoots = [
    document.querySelector('#comic-grid'),
    document.querySelector('#comic-rows')
].filter(Boolean)
for (const root of libraryRoots)
    new MutationObserver(() => decorateLibraryTasteToggles()).observe(root, {
        childList: true,
        subtree: true
    })

"""
s = s.replace(observer_marker, library_observer + observer_marker, 1)
s = once(
    s,
    """decorateRecommendationCards()
void loadPolicy()
""",
    """decorateRecommendationCards()
decorateLibraryTasteToggles()
void loadPolicy().then(() => decorateLibraryTasteToggles())
""",
    "bootstrap library taste controls",
)
write(path, s)

# ---------------------------------------------------------------------------
# Tests.
# ---------------------------------------------------------------------------
path = "test/unit/recommendation-v5-portable-policy.test.ts"
s = read(path)
marker = """    it('persists controls and merges dirty mobile feedback using server-side events', () => {"""
if marker not in s:
    raise RuntimeError("missing portable test marker")
tests = """    it('excludes selected favorites from inferred taste without changing ownership', () => {
        const favorite = comic({
            comicId: 'archive-favorite',
            title: 'Archive',
            author: 'Artist',
            tags: ['Archive Tag'],
            isFavorite: true
        })
        const signals = portableInferredSignalsV5(
            [favorite],
            120,
            ['archive-favorite']
        )
        expect(signals).toHaveLength(0)
        expect(favorite.isFavorite).toBe(true)
        expect(
            filterCandidatesAgainstOwnedV5(
                [{ comic: favorite }],
                [favorite],
                {
                    ...defaultPortablePolicyStateV5(),
                    tasteExcludedComicIds: ['archive-favorite']
                }
            ).rows
        ).toHaveLength(0)
    })

    it('persists and audits taste-profile exclusion independently', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-v5-taste-exclusion-')
        )
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        database.importFavorites(
            [
                {
                    comicId: 'favorite-a',
                    title: 'A',
                    author: 'Artist',
                    tags: ['T'],
                    categories: [],
                    finished: true
                }
            ],
            'test',
            false,
            true
        )
        const store = new RecommendationPolicyStoreV5(database)
        store.setTasteExclusion('favorite-a', true)
        expect(store.snapshot().tasteExcludedComicIds).toEqual(['favorite-a'])
        expect(store.snapshot().counts.tasteExcluded).toBe(1)
        expect(database.recommendationFeedback()).toHaveLength(0)
        expect(
            database.listUserEvents({
                eventType: 'recommendation_taste_exclusion',
                limit: 10
            })
        ).toHaveLength(1)
        store.setTasteExclusion('favorite-a', false)
        expect(store.snapshot().tasteExcludedComicIds).toEqual([])
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

"""
s = s.replace(marker, tests + marker, 1)
write(path, s)

path = "test/unit/recommendation-v5-product-contract.test.ts"
s = read(path)
marker = """    it('applies work-level duplicate/owned suppression at ranking and serving', () => {"""
if marker not in s:
    raise RuntimeError("missing product contract marker")
contract = """    it('supports keeping a favorite while excluding it from taste inference', () => {
        const service = read('src/library/service.ts')
        const server = read('src/library/server.ts')
        const web = read('web/recommendation-v5-beta.js')
        const portable = read('src/recommendation-v5/portable-policy.ts')
        expect(server).toContain(
            '/api/v1/recommendation-v5/taste-exclusion'
        )
        expect(service).toContain('tasteExcludedIds')
        expect(service).toContain('tasteExcluded.has(comic.comicId)')
        expect(portable).toContain('tasteExcludedComicIds')
        expect(web).toContain('保留收藏，但不用于推荐口味')
    })

"""
s = s.replace(marker, contract + marker, 1)
write(path, s)

# ---------------------------------------------------------------------------
# Unreleased log.
# ---------------------------------------------------------------------------
path = "PROJECT_LOG.md"
s = read(path)
needle = "- P1 语义收尾开始：将“已经看过 / 已经拥有 / 重复上传 / 暂时不想看”从口味反馈中拆出，作为独立事实或约束；临时隐藏采用可过期状态。\n"
if needle in s and "保留收藏但不参与推荐口味画像" not in s:
    s = s.replace(
        needle,
        needle
        + "- 增加“保留收藏但不参与推荐口味画像”：仅移出 preference inference、召回 seed 与 Visual preference prototype，收藏/下载/已拥有过滤和 Visual embedding 均保留。\n",
        1,
    )
write(path, s)

print("V5 taste exclusion patch prepared.")
