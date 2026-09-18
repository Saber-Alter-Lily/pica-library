from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, content):
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"missing marker: {label}")
    return text.replace(old, new, 1)


def replace_between(text, start, end, replacement, label):
    a = text.find(start)
    if a < 0:
        raise RuntimeError(f"missing start marker: {label}")
    b = text.find(end, a)
    if b < 0:
        raise RuntimeError(f"missing end marker: {label}")
    return text[:a] + replacement + text[b:]


# ---------------------------------------------------------------------------
# V5 portable policy: real 10-step user correction, backward compatible with
# existing MORE/LESS controls and Android snapshots.
# ---------------------------------------------------------------------------
path = "src/recommendation-v5/portable-policy.ts"
s = read(path)
s = replace_once(
    s,
    """    source: 'DESKTOP' | 'ANDROID'
    updatedAt: string
}""",
    """    source: 'DESKTOP' | 'ANDROID'
    updatedAt: string
    /**
     * User correction relative to the collection-derived baseline, expressed
     * in 1..10 slider steps. Legacy controls may omit this field.
     */
    levelDelta?: number
}""",
    "PreferenceControlV5.levelDelta",
)
s = replace_once(
    s,
    """    supportCount: number
    supportShare: number
}""",
    """    supportCount: number
    supportShare: number
    /** Semantic V3 facet used for grouped presentation. */
    facet: string
    /** Collection-derived 1..10 baseline shown in the UI. */
    baselineLevel: number
}""",
    "PortablePreferenceSignalV5 presentation fields",
)
marker = """export function normalizePreferenceKey(value: unknown) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .toLocaleLowerCase('und')
        .replace(/\\s+/g, ' ')
}
"""
if marker not in s:
    raise RuntimeError("missing normalizePreferenceKey marker")
s = s.replace(
    marker,
    marker
    + """
export function normalizeLevelDeltaV5(value: unknown) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return undefined
    return Math.max(-9, Math.min(9, Math.round(numeric)))
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
""",
    1,
)
s = replace_between(
    s,
    "export function normalizeControlV5(",
    "\nexport function upsertControlV5",
    """export function normalizeControlV5(
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
""",
    "normalizeControlV5",
)
s = replace_once(
    s,
    """        } else if (control.direction === 'MORE') {
            adjustment += control.scope === 'SESSION' ? 0.12 : 0.08
            reasons.push(\`MORE:\${control.targetType}:\${control.label}\`)
        } else if (control.direction === 'LESS') {
            adjustment -= control.scope === 'SESSION' ? 0.12 : 0.08
            reasons.push(\`LESS:\${control.targetType}:\${control.label}\`)
        }""",
    """        } else if (control.direction === 'MORE') {
            const magnitude =
                control.levelDelta === undefined
                    ? control.scope === 'SESSION'
                        ? 0.12
                        : 0.08
                    : Math.min(0.27, Math.abs(control.levelDelta) * 0.03)
            adjustment += magnitude
            reasons.push(
                control.levelDelta === undefined
                    ? \`MORE:\${control.targetType}:\${control.label}\`
                    : \`MORE_LEVEL:\${control.targetType}:\${control.label}:+\${control.levelDelta}\`
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
                    ? \`LESS:\${control.targetType}:\${control.label}\`
                    : \`LESS_LEVEL:\${control.targetType}:\${control.label}:\${control.levelDelta}\`
            )
        }""",
    "graded preference adjustment",
)
s = replace_once(
    s,
    """            supportCount: row.ids.size,
            supportShare: row.ids.size / total
        }))""",
    """            supportCount: row.ids.size,
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
        }))""",
    "portable inferred presentation fields",
)
write(path, s)


# ---------------------------------------------------------------------------
# Policy store: accept levelDelta from Desktop and preserve future mobile
# compatibility without changing the schema version.
# ---------------------------------------------------------------------------
path = "src/recommendation-v5/policy-store.ts"
s = read(path)
s = replace_once(
    s,
    """        direction?: unknown
        scope?: unknown""",
    """        direction?: unknown
        levelDelta?: unknown
        scope?: unknown""",
    "setControl input levelDelta",
)
s = replace_once(
    s,
    """                direction: validDirection(input.direction),
                scope: validScope(input.scope),""",
    """                direction: validDirection(input.direction),
                levelDelta:
                    input.levelDelta === undefined
                        ? undefined
                        : Number(input.levelDelta),
                scope: validScope(input.scope),""",
    "setControl normalized levelDelta",
)
s = replace_once(
    s,
    """                    direction: validDirection(row.direction),
                    scope: validScope(row.scope),""",
    """                    direction: validDirection(row.direction),
                    levelDelta:
                        row.levelDelta === undefined
                            ? undefined
                            : Number(row.levelDelta),
                    scope: validScope(row.scope),""",
    "mobile normalized levelDelta",
)
write(path, s)


# ---------------------------------------------------------------------------
# Retrieval semantics for graded controls:
# ±1/2 steps remain rank-only; +2 or more can add an explicit retrieval route;
# -3 or lower suppresses that direct route. BLOCK remains absolute.
# ---------------------------------------------------------------------------
path = "src/recommendation-v5/intent-policy.ts"
s = read(path)
s = replace_once(
    s,
    """        return control?.direction === 'LESS' || control?.direction === 'BLOCK'""",
    """        if (control?.direction === 'BLOCK') return true
        if (control?.direction !== 'LESS') return false
        // Mild slider reductions remain ranking-only. Larger reductions
        // suppress the direct retrieval route; legacy LESS keeps old behavior.
        return control.levelDelta === undefined || control.levelDelta <= -3""",
    "graded LESS retrieval semantics",
)
write(path, s)

path = "src/recommendation-v5/explicit-intents.ts"
s = read(path)
s = replace_once(
    s,
    """                item.direction === 'MORE' &&
                item.scope === 'PERSISTENT' &&""",
    """                item.direction === 'MORE' &&
                (item.levelDelta === undefined || item.levelDelta >= 2) &&
                item.scope === 'PERSISTENT' &&""",
    "graded MORE retrieval semantics",
)
write(path, s)


# ---------------------------------------------------------------------------
# Desktop service:
# - enrich V5 signals using the existing V3 semantic facet registry;
# - return enriched snapshots after mutations;
# - expose Provider probing as a real progress phase instead of freezing at 2/7.
# ---------------------------------------------------------------------------
path = "src/library/service.ts"
s = read(path)
s = replace_once(
    s,
    """    private recommendationProgress = { state: 'idle', phase: 'idle', done: 0, total: 6 }""",
    """    private recommendationProgress = {
        state: 'idle',
        phase: 'idle',
        done: 0,
        total: 7
    }""",
    "recommendation progress initial total",
)
s = replace_between(
    s,
    "    recommendationV5Snapshot() {",
    "\n    updateRecommendationV5Control(",
    """    recommendationV5Snapshot() {
        const snapshot = new RecommendationPolicyStoreV5(
            this.database
        ).snapshot()
        try {
            const registry = loadTagRegistryV3(runtimeRegistryDirectory())
            const inferred = snapshot.inferred.flatMap((signal) => {
                if (signal.targetType !== 'TAG')
                    return [
                        {
                            ...signal,
                            facet:
                                signal.targetType === 'AUTHOR'
                                    ? 'CREATOR_ENTITY'
                                    : signal.targetType === 'CATEGORY'
                                      ? 'CATEGORY'
                                      : signal.facet || 'OTHER'
                        }
                    ]
                const resolved = resolveTagV3(
                    signal.label || signal.key,
                    registry
                )
                if (
                    resolved.resolutionType === 'SAFETY' ||
                    ['SAFETY_EXCLUDE', 'IGNORE', 'EXCLUDE'].includes(
                        resolved.recommendationRole
                    )
                )
                    return []
                return [
                    {
                        ...signal,
                        label:
                            resolved.resolutionStatus === 'RESOLVED'
                                ? resolved.canonicalLabel
                                : signal.label,
                        facet:
                            resolved.resolutionStatus === 'RESOLVED'
                                ? resolved.facet
                                : 'OTHER'
                    }
                ]
            })
            return { ...snapshot, inferred }
        } catch {
            // V5 controls remain usable when a packaged registry asset is
            // unavailable; the portable snapshot has a raw-tag fallback.
            return snapshot
        }
    }
""",
    "recommendationV5Snapshot enrichment",
)
s = replace_between(
    s,
    "    updateRecommendationV5Control(",
    "\n    updateRecommendationV5Session(",
    """    updateRecommendationV5Control(input: Record<string, unknown>) {
        const store = new RecommendationPolicyStoreV5(this.database)
        store.setControl({
            targetType: input.targetType,
            key: input.key,
            label: input.label,
            direction: input.direction,
            levelDelta: input.levelDelta,
            scope: input.scope,
            source: 'DESKTOP'
        })
        return this.recommendationV5Snapshot()
    }
""",
    "updateRecommendationV5Control",
)
s = replace_between(
    s,
    "    updateRecommendationV5Session(",
    "\n    suppressRecommendationV5Comic(",
    """    updateRecommendationV5Session(input: Record<string, unknown>) {
        const store = new RecommendationPolicyStoreV5(this.database)
        store.setSessionIntent({
            mode: input.mode,
            targetType: input.targetType,
            key: input.key,
            label: input.label,
            source: 'DESKTOP'
        })
        return this.recommendationV5Snapshot()
    }
""",
    "updateRecommendationV5Session",
)
s = replace_between(
    s,
    "    suppressRecommendationV5Comic(",
    "\n    mergeMobileRecommendationV5(",
    """    suppressRecommendationV5Comic(input: Record<string, unknown>) {
        const store = new RecommendationPolicyStoreV5(this.database)
        store.suppressComic(
            String(input.comicId ?? ''),
            input.suppressed !== false
        )
        return this.recommendationV5Snapshot()
    }
""",
    "suppressRecommendationV5Comic",
)
probe = """        const exhAvailable = (await providerService.probeExHentai().catch(() => 'UNAVAILABLE')) === 'AVAILABLE'"""
s = replace_once(
    s,
    probe,
    """        this.recommendationProgress = {
            state: 'running',
            phase: 'providers',
            done: 3,
            total: 7
        }
        const exhAvailable =
            (await providerService
                .probeExHentai()
                .catch(() => 'UNAVAILABLE')) === 'AVAILABLE'""",
    "provider progress before ExH probe",
)
s = replace_once(
    s,
    """        this.recommendationProgress = { state: 'running', phase: 'retrieve', done: 3, total: 7 }""",
    """        this.recommendationProgress = {
            state: 'running',
            phase: 'retrieve',
            done: 4,
            total: 7
        }""",
    "retrieve progress",
)
s = replace_once(
    s,
    """        this.recommendationProgress = { state: 'running', phase: 'rank', done: 4, total: 7 }""",
    """        this.recommendationProgress = {
            state: 'running',
            phase: 'rank',
            done: 5,
            total: 7
        }""",
    "rank progress",
)
s = replace_once(
    s,
    """            phase: 'visual',
            done: 5,""",
    """            phase: 'visual',
            done: 6,""",
    "visual progress",
)
write(path, s)


# ---------------------------------------------------------------------------
# Web module: staged source was generated separately so this patch stays easy
# to audit. It replaces the old flat button list with classified, collapsible
# 10-step controls and visible feedback acknowledgements.
# ---------------------------------------------------------------------------
web_module = read("scripts/v5-web-module.js")
if "10 档怎么理解" not in web_module or "v5-feedback-dislike" not in web_module:
    raise RuntimeError("staged V5 web module failed sanity check")
write("web/recommendation-v5-beta.js", web_module)


# ---------------------------------------------------------------------------
# Recommendation generation progress: tell the user old results remain on
# screen, expose provider probe/visual phases, and keep a visible completion
# acknowledgement so they can tell whether results actually changed.
# ---------------------------------------------------------------------------
path = "web/alpha8-theme-help.js"
s = read(path)
s = replace_once(
    s,
    """let recommendationTimer = null""",
    """let recommendationTimer = null
let recommendationCompletionTimer = null
let recommendationWatchBaselineCycleId = null
let recommendationWatchStartedAt = 0""",
    "progress watcher state",
)
s = replace_between(
    s,
    "const buildPhaseLabels = {",
    "\nfunction startRecommendationWatch()",
    """const buildPhaseLabels = {
    profile: '分析收藏与兴趣画像',
    intents: '规划推荐方向',
    routes: '准备多路召回',
    providers: '检查 Pica / E-H / ExH 可用性',
    retrieve: '跨来源召回候选漫画',
    rank: '排序、去重与偏好调节',
    visual: '应用画风信号与最终重排',
    complete: '正在保存推荐结果'
}
""",
    "progress phase labels",
)
s = replace_between(
    s,
    "function startRecommendationWatch() {",
    "\nasync function pollRecommendationProgress()",
    """function startRecommendationWatch() {
    ensureRecommendationProgress()
    updateRecommendationArtwork()
    const card = $('#a85-recommend-progress')
    if (!card) return
    if (recommendationCompletionTimer) {
        clearTimeout(recommendationCompletionTimer)
        recommendationCompletionTimer = null
    }
    recommendationWatchBaselineCycleId = null
    recommendationWatchStartedAt = Date.now()
    card.classList.add('active')
    $('#a85-recommend-phase').textContent = '正在启动推荐生成…'
    $('#a85-recommend-detail').textContent =
        '下方暂时保留上一轮推荐；新一轮完成后会自动切换。'
    $('#a85-recommend-line').classList.add('indeterminate')
    $('#a85-recommend-line').querySelector('span').style.width = ''
    if (recommendationTimer) clearInterval(recommendationTimer)
    recommendationTimer = setInterval(pollRecommendationProgress, 500)
    void pollRecommendationProgress()
}
""",
    "startRecommendationWatch",
)
s = replace_between(
    s,
    "async function pollRecommendationProgress() {",
    "\nfunction progressHeadFor(",
    """async function pollRecommendationProgress() {
    const card = $('#a85-recommend-progress')
    if (!card) return false
    try {
        const current = await api(
            '/api/v1/recommendation-sessions/status?mode=final'
        )
        const progress = current.buildProgress || {}
        if (
            recommendationWatchBaselineCycleId === null &&
            current.activeCycleId
        )
            recommendationWatchBaselineCycleId = current.activeCycleId
        if (current.buildingCycleId) {
            card.classList.add('active')
            $('#a85-recommend-phase').textContent =
                buildPhaseLabels[progress.phase] || '正在生成推荐…'
            const done = Number(progress.done || 0)
            const total = Number(progress.total || 0)
            const elapsed = recommendationWatchStartedAt
                ? Math.max(
                      0,
                      Math.round(
                          (Date.now() - recommendationWatchStartedAt) / 1000
                      )
                  )
                : 0
            if (total > 0) {
                const percent = Math.max(
                    0,
                    Math.min(100, Math.round((done * 100) / total))
                )
                $('#a85-recommend-detail').textContent =
                    '下方仍显示上一轮结果，完成后自动切换 · ' +
                    done +
                    ' / ' +
                    total +
                    ' · ' +
                    percent +
                    '% · 已用时 ' +
                    elapsed +
                    's'
                $('#a85-recommend-line').classList.remove('indeterminate')
                $('#a85-recommend-line').querySelector('span').style.width =
                    percent + '%'
            } else {
                $('#a85-recommend-detail').textContent =
                    '后台仍在处理；下方不是新结果 · 已用时 ' +
                    elapsed +
                    's'
                $('#a85-recommend-line').classList.add('indeterminate')
            }
            decorateProgress()
            return true
        }

        const watched =
            Boolean(recommendationTimer) || recommendationWatchStartedAt > 0
        if (recommendationTimer) clearInterval(recommendationTimer)
        recommendationTimer = null
        if (!watched) {
            card.classList.remove('active')
            return false
        }
        const elapsedMs = recommendationWatchStartedAt
            ? Date.now() - recommendationWatchStartedAt
            : 0
        const changed = Boolean(
            current.activeCycleId &&
                (!recommendationWatchBaselineCycleId ||
                    current.activeCycleId !==
                        recommendationWatchBaselineCycleId)
        )
        if (!changed && elapsedMs < 1200) {
            card.classList.remove('active')
            recommendationWatchStartedAt = 0
            return false
        }
        card.classList.add('active')
        $('#a85-recommend-line').classList.remove('indeterminate')
        $('#a85-recommend-line').querySelector('span').style.width = '100%'
        if (changed) {
            $('#a85-recommend-phase').textContent = '新一轮推荐已更新'
            const shortCycle = String(current.activeCycleId || '').slice(0, 8)
            $('#a85-recommend-detail').textContent =
                '已切换到新结果' +
                (shortCycle ? ' · cycle ' + shortCycle : '') +
                ' · ' +
                new Date().toLocaleTimeString()
        } else {
            $('#a85-recommend-phase').textContent =
                '推荐生成已结束，但当前结果未切换'
            $('#a85-recommend-detail').textContent =
                '下方仍是上一轮结果；请查看页面错误提示后重试。'
        }
        decorateProgress()
        recommendationCompletionTimer = window.setTimeout(() => {
            card.classList.remove('active')
            recommendationCompletionTimer = null
        }, 4800)
        recommendationWatchStartedAt = 0
        return false
    } catch (error) {
        $('#a85-recommend-phase').textContent = '正在等待推荐服务响应'
        $('#a85-recommend-detail').textContent =
            '暂时无法读取实时进度：' +
            String(error?.message || error)
        return false
    }
}
""",
    "pollRecommendationProgress",
)
write(path, s)


# ---------------------------------------------------------------------------
# Tests: enforce graded controls, collection-derived baseline, grouped UI,
# feedback acknowledgement, and the new provider progress phase.
# ---------------------------------------------------------------------------
path = "test/unit/recommendation-v5-portable-policy.test.ts"
s = read(path)
s = replace_once(
    s,
    """    portableInferredSignalsV5,
    preferenceAdjustmentV5,""",
    """    portableInferredSignalsV5,
    preferenceAdjustmentV5,
    preferenceBaselineLevelV5,""",
    "test import preferenceBaselineLevelV5",
)
marker = """    it('keeps hard block separate from a soft negative', () => {"""
if marker not in s:
    raise RuntimeError("missing portable policy test insertion marker")
s = s.replace(
    marker,
    """    it('maps the 10-step control to a graded ranking adjustment', () => {
        const target = comic({
            comicId: 'x',
            title: 'X',
            tags: ['Tag A']
        })
        let state = defaultPortablePolicyStateV5()
        state = upsertControlV5(
            state,
            normalizeControlV5({
                targetType: 'TAG',
                key: 'Tag A',
                direction: 'MORE',
                levelDelta: 3
            })
        )
        expect(state.controls[0]).toMatchObject({
            direction: 'MORE',
            levelDelta: 3
        })
        expect(preferenceAdjustmentV5(target, state).adjustment).toBeCloseTo(
            0.09,
            6
        )
        state = upsertControlV5(
            state,
            normalizeControlV5({
                targetType: 'TAG',
                key: 'Tag A',
                direction: 'LESS',
                levelDelta: -2
            })
        )
        expect(preferenceAdjustmentV5(target, state).adjustment).toBeCloseTo(
            -0.06,
            6
        )
    })

    it('derives a nonlinear 1..10 baseline from collection evidence', () => {
        expect(preferenceBaselineLevelV5(0, 0)).toBe(1)
        expect(preferenceBaselineLevelV5(1, 0.001)).toBeLessThan(
            preferenceBaselineLevelV5(10, 0.03)
        )
        expect(preferenceBaselineLevelV5(10, 0.03)).toBeLessThanOrEqual(
            preferenceBaselineLevelV5(50, 0.1)
        )
        expect(preferenceBaselineLevelV5(50, 0.1)).toBeLessThanOrEqual(10)
    })

"""
    + marker,
    1,
)
write(path, s)

path = "test/unit/recommendation-v5-product-contract.test.ts"
s = read(path)
marker = """    it('applies work-level duplicate/owned suppression at ranking and serving', () => {"""
if marker not in s:
    raise RuntimeError("missing V5 product test insertion marker")
s = s.replace(
    marker,
    """    it('renders classified 10-step Desktop controls and explicit feedback acknowledgement', () => {
        const web = read('web/recommendation-v5-beta.js')
        const service = read('src/library/service.ts')
        const theme = read('web/alpha8-theme-help.js')
        expect(web).toContain('type="range"')
        expect(web).toContain('系统基准')
        expect(web).toContain('v5-facet-group')
        expect(web).toContain('已记录不喜欢')
        expect(web).toContain('v5-feedback-dislike')
        expect(service).toContain('resolveTagV3(')
        expect(service).toContain("phase: 'providers'")
        expect(theme).toContain('下方仍显示上一轮结果')
        expect(theme).toContain('新一轮推荐已更新')
    })

"""
    + marker,
    1,
)
write(path, s)

print("V5 web polish patch prepared successfully.")
