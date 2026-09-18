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
# 1. Portable policy: separate taste controls from item-level facts.
# ---------------------------------------------------------------------------
path = "src/recommendation-v5/portable-policy.ts"
s = read(path)

s = once(
    s,
    """export type SessionIntentMode = 'DEFAULT' | 'FAMILIAR' | 'EXPLORE' | 'RECENT' | 'TARGET'
""",
    """export type SessionIntentMode = 'DEFAULT' | 'FAMILIAR' | 'EXPLORE' | 'RECENT' | 'TARGET'

export type RecommendationItemFactV5 =
    | 'ALREADY_SEEN'
    | 'ALREADY_OWNED'
    | 'DUPLICATE_REPORT'

export interface TemporarySuppressionV5 {
    comicId: string
    createdAt: string
    expiresAt: string
}
""",
    "item fact types",
)

s = once(
    s,
    """    hardSuppressComicIds: string[]
    explicitDistinctPairs: string[]
""",
    """    /**
     * Legacy/permanent comic-level hard suppression. Kept for Android and
     * older V5 state compatibility; new factual actions use the typed fields
     * below instead of collapsing everything into this set.
     */
    hardSuppressComicIds: string[]
    seenComicIds: string[]
    ownedComicIds: string[]
    duplicateReportComicIds: string[]
    temporarySuppressions: TemporarySuppressionV5[]
    explicitDistinctPairs: string[]
""",
    "typed item state fields",
)

s = once(
    s,
    """        hardSuppressed: number
    }
}
""",
    """        hardSuppressed: number
        seenFacts: number
        ownedOverrides: number
        duplicateReports: number
        temporarySuppressed: number
    }
}
""",
    "snapshot counts",
)

s = once(
    s,
    """        hardSuppressComicIds: [],
        explicitDistinctPairs: [],
""",
    """        hardSuppressComicIds: [],
        seenComicIds: [],
        ownedComicIds: [],
        duplicateReportComicIds: [],
        temporarySuppressions: [],
        explicitDistinctPairs: [],
""",
    "default typed item state",
)

marker = """export function normalizeLevelDeltaV5(value: unknown) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return undefined
    return Math.max(-9, Math.min(9, Math.round(numeric)))
}
"""
if marker not in s:
    raise RuntimeError("missing normalizeLevelDeltaV5 marker")
s = s.replace(
    marker,
    marker
    + """
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
""",
    1,
)

s = once(
    s,
    """export function buildOwnedCatalogV5(catalog: StoredComic[]) {
    return catalog.filter(isOwnedComicV5)
}
""",
    """export function buildOwnedCatalogV5(
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
""",
    "owned overrides",
)

s = once(
    s,
    """    let blocked = state.hardSuppressComicIds.includes(comic.comicId)
""",
    """    const comicKey = normalizePreferenceKey(comic.comicId)
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
""",
    "fact suppression behavior",
)

s = once(
    s,
    """    const owned = buildOwnedCatalogV5(catalog)
""",
    """    const owned = buildOwnedCatalogV5(catalog, state)
""",
    "owned catalog uses overrides",
)

s = once(
    s,
    """            hardSuppressed: state.hardSuppressComicIds.length
""",
    """            hardSuppressed: state.hardSuppressComicIds.length,
            seenFacts: state.seenComicIds.length,
            ownedOverrides: state.ownedComicIds.length,
            duplicateReports: state.duplicateReportComicIds.length,
            temporarySuppressed: activeTemporarySuppressionsV5(state).length
""",
    "typed snapshot counts",
)

write(path, s)


# ---------------------------------------------------------------------------
# 2. Policy store: normalize old state, add semantic disposition mutation,
#    preserve legacy hard suppression and Android sync behavior.
# ---------------------------------------------------------------------------
path = "src/recommendation-v5/policy-store.ts"
s = read(path)

s = once(
    s,
    """    RECOMMENDATION_V5_POLICY_VERSION,
    defaultPortablePolicyStateV5,
""",
    """    RECOMMENDATION_V5_POLICY_VERSION,
    TEMPORARY_SUPPRESSION_DAYS_V5,
    activeTemporarySuppressionsV5,
    defaultPortablePolicyStateV5,
""",
    "policy store imports",
)

s = once(
    s,
    """                controls: stored.controls.map((item) => normalizeControlV5(item)),
                explicitDistinctPairs: Array.isArray(stored.explicitDistinctPairs)
""",
    """                controls: stored.controls.map((item) => normalizeControlV5(item)),
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
                explicitDistinctPairs: Array.isArray(stored.explicitDistinctPairs)
""",
    "normalize typed item state",
)

insert_after = """    suppressComic(comicId: string, suppressed = true) {
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
"""
if insert_after not in s:
    raise RuntimeError("missing suppressComic block")
semantic_method = insert_after + """
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
"""
s = s.replace(insert_after, semantic_method, 1)

write(path, s)


# ---------------------------------------------------------------------------
# 3. Event taxonomy: item facts are auditable but not taste feedback.
# ---------------------------------------------------------------------------
path = "src/recommendation-v3/types.ts"
s = read(path)
s = once(
    s,
    """    | 'recommend_feedback_reason'
    | 'preview_open'
""",
    """    | 'recommend_feedback_reason'
    | 'recommendation_item_disposition'
    | 'preview_open'
""",
    "item disposition event type",
)
write(path, s)


# ---------------------------------------------------------------------------
# 4. Service endpoint preserves old /suppress route but now respects reason.
# ---------------------------------------------------------------------------
path = "src/library/service.ts"
s = read(path)
old = """    suppressRecommendationV5Comic(input: Record<string, unknown>) {
        const store = new RecommendationPolicyStoreV5(this.database)
        store.suppressComic(
            String(input.comicId ?? ''),
            input.suppressed !== false
        )
        return this.recommendationV5Snapshot()
    }
"""
new = """    suppressRecommendationV5Comic(input: Record<string, unknown>) {
        const store = new RecommendationPolicyStoreV5(this.database)
        store.setItemDisposition({
            comicId: input.comicId,
            reason: input.reason,
            active: input.suppressed !== false,
            durationDays: input.durationDays,
            source: 'DESKTOP'
        })
        return this.recommendationV5Snapshot()
    }
"""
s = once(s, old, new, "service semantic suppress route")
write(path, s)


# ---------------------------------------------------------------------------
# 5. Web copy: temporary now has an explicit beta duration instead of implying
#    permanent suppression. Other factual actions remain visually immediate.
# ---------------------------------------------------------------------------
path = "web/recommendation-v5-beta.js"
s = read(path)
s = s.replace(
    "temporary:'已隐藏当前作品 · 可在后续偏好管理中恢复'",
    "temporary:'已暂时隐藏当前作品 · 30 天后自动恢复'",
)
s = s.replace(
    '>暂时不想看</button>',
    '>暂时不想看（30天）</button>',
)
write(path, s)


# ---------------------------------------------------------------------------
# 6. Tests.
# ---------------------------------------------------------------------------
path = "test/unit/recommendation-v5-portable-policy.test.ts"
s = read(path)
marker = """    it('persists controls and merges dirty mobile feedback using server-side events', () => {"""
if marker not in s:
    raise RuntimeError("missing V5 portable test marker")
tests = """    it('keeps seen/owned/duplicate/temporary facts separate from taste feedback', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v5-facts-'))
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        database.importCatalog(
            [
                {
                    comicId: 'comic-seen',
                    title: 'Seen',
                    author: 'Artist',
                    tags: [],
                    categories: [],
                    finished: true
                },
                {
                    comicId: 'comic-owned',
                    title: 'Owned',
                    author: 'Artist',
                    tags: [],
                    categories: [],
                    finished: true
                }
            ],
            'test'
        )
        const store = new RecommendationPolicyStoreV5(database)
        store.setItemDisposition({
            comicId: 'comic-seen',
            reason: 'already_seen'
        })
        store.setItemDisposition({
            comicId: 'comic-owned',
            reason: 'already_owned'
        })
        store.setItemDisposition({
            comicId: 'comic-dup',
            reason: 'duplicate'
        })
        store.setItemDisposition({
            comicId: 'comic-temp',
            reason: 'temporary',
            durationDays: 30
        })
        const snapshot = store.snapshot()
        expect(snapshot.seenComicIds).toContain('comic-seen')
        expect(snapshot.ownedComicIds).toContain('comic-owned')
        expect(snapshot.duplicateReportComicIds).toContain('comic-dup')
        expect(snapshot.temporarySuppressions).toHaveLength(1)
        expect(database.recommendationFeedback()).toHaveLength(0)
        expect(
            database
                .listUserEvents({ limit: 50 })
                .filter(
                    (event) =>
                        event.eventType ===
                        'recommendation_item_disposition'
                )
        ).toHaveLength(4)
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('expires temporary suppression without turning it into a taste negative', () => {
        const target = comic({
            comicId: 'temporary',
            title: 'Temporary'
        })
        const state = {
            ...defaultPortablePolicyStateV5(),
            temporarySuppressions: [
                {
                    comicId: 'temporary',
                    createdAt: '2026-01-01T00:00:00.000Z',
                    expiresAt: '2026-01-02T00:00:00.000Z'
                }
            ]
        }
        expect(preferenceAdjustmentV5(target, state).blocked).toBe(false)
    })

    it('treats an ownership override as owned without changing the comic record', () => {
        const target = comic({
            comicId: 'manual-owned',
            title: 'Manual owned'
        })
        const state = {
            ...defaultPortablePolicyStateV5(),
            ownedComicIds: ['manual-owned']
        }
        const result = filterCandidatesAgainstOwnedV5(
            [{ comic: target }],
            [target],
            state
        )
        expect(result.rows).toHaveLength(0)
        expect(target.isFavorite).toBe(false)
        expect(target.inLibrary).toBe(false)
    })

"""
s = s.replace(marker, tests + marker, 1)
write(path, s)

path = "test/unit/recommendation-v5-product-contract.test.ts"
s = read(path)
marker = """    it('applies work-level duplicate/owned suppression at ranking and serving', () => {"""
if marker not in s:
    raise RuntimeError("missing product contract marker")
contract = """    it('separates factual recommendation dispositions from taste feedback', () => {
        const policy = read('src/recommendation-v5/policy-store.ts')
        const portable = read('src/recommendation-v5/portable-policy.ts')
        const web = read('web/recommendation-v5-beta.js')
        expect(policy).toContain('setItemDisposition')
        expect(policy).toContain('recommendation_item_disposition')
        expect(portable).toContain('seenComicIds')
        expect(portable).toContain('ownedComicIds')
        expect(portable).toContain('duplicateReportComicIds')
        expect(portable).toContain('temporarySuppressions')
        expect(web).toContain('30 天后自动恢复')
    })

"""
s = s.replace(marker, contract + marker, 1)
write(path, s)


# ---------------------------------------------------------------------------
# 7. Existing project log becomes the single unpublished R&D log as requested.
# ---------------------------------------------------------------------------
path = "PROJECT_LOG.md"
s = read(path)
if "## Unreleased — 研发进展" not in s:
    anchor = """本文件只记录版本的核心能力演变，不记录纯文案、微小样式和一次性修复。

"""
    if anchor not in s:
        raise RuntimeError("missing project log intro")
    entry = """## Unreleased — 研发进展

> 本节记录尚未进入正式 Release 的核心研发能力。完成自动测试不等于正式发布；实机验证、合并与 Release 仍需单独授权。

### Recommendation V5 / Visual V1

- 建立 V5 Portable Policy：Desktop 负责完整画像、跨 Provider 召回与重计算；Android 接收候选缓存与策略基线，离线仅做轻量增量调整，下一次配对再双向合并。
- 新作发现增加第一版 owned/work-level suppression：收藏、书库、已下载视为 owned，并用归一标题 + 作者 + 页数识别高置信跨来源同作品。
- 显式偏好从“多一点 / 少一点”升级为基于收藏画像的 1–10 档控制；系统基准由收藏支持数和占比推导，用户调整同时可影响排序与后续完整召回。
- V3 Tag Registry 的 facet 被复用于 V5 控制中心，标签按作者、IP、角色、题材、剧情、关系、外观等语义组折叠展示。
- 推荐重算进度拆出 Provider 可用性检查，并明确区分“下方旧结果”和“新 cycle 已切换”。
- Like / Dislike 增加即时可见回执；Dislike 卡片弱化，避免用户无法判断操作是否生效。
- Visual V1 保持冻结、版本化和可回滚；当前研发原则是不因 Recommendation V5 改造而重建或覆盖现有视觉向量。
- P1 语义收尾开始：将“已经看过 / 已经拥有 / 重复上传 / 暂时不想看”从口味反馈中拆出，作为独立事实或约束；临时隐藏采用可过期状态。

"""
    s = s.replace(anchor, anchor + entry, 1)
else:
    if "P1 语义收尾开始" not in s:
        s = s.replace(
            "## Unreleased — 研发进展\n",
            "## Unreleased — 研发进展\n\n- P1 语义收尾开始：将事实反馈与口味反馈拆分，并为临时隐藏增加可过期状态。\n",
            1,
        )
write(path, s)

print("V5 feedback semantics patch prepared.")
