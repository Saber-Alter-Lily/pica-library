from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[1]

def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding='utf-8')

def write(rel: str, text: str) -> None:
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')

def replace_once(rel: str, old: str, new: str) -> None:
    source = read(rel)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{rel}: expected one anchor, found {count}: {old[:120]!r}')
    write(rel, source.replace(old, new, 1))

def insert_before(rel: str, needle: str, addition: str) -> None:
    replace_once(rel, needle, addition + needle)

replace_once('package.json', '"version": "0.4.0"', '"version": "0.5.0-beta.1"')

replace_once(
    'src/recommendation-v3/types.ts',
    "    | 'recommend_detail_open'\n",
    "    | 'recommend_detail_open'\n    | 'recommend_like'\n    | 'recommend_dislike'\n    | 'recommend_feedback_reason'\n",
)
replace_once(
    'src/recommendation-v3/behavior-profile.ts',
    "        recommend_detail_open: 0.2,\n",
    "        recommend_detail_open: 0.2,\n        recommend_like: 0.9,\n",
)
replace_once(
    'src/recommendation-v3/behavior-profile.ts',
    "        download_cancel: 0.25\n",
    "        download_cancel: 0.25,\n        recommend_dislike: 1\n",
)

replace_once(
    'src/storage/sqlite/migrations.ts',
    "    }\n]\n\nexport const latestMigrationVersion",
    r'''    },
    {
        version: 10,
        name: 'recommendation_v4_visual_style',
        up: `
            CREATE TABLE IF NOT EXISTS visual_embeddings (
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                model_id TEXT NOT NULL,
                model_version TEXT NOT NULL,
                sampling_policy_version TEXT NOT NULL,
                embedding_kind TEXT NOT NULL CHECK (embedding_kind IN ('body','cover')),
                vector_json TEXT NOT NULL,
                dimension INTEGER NOT NULL,
                source_kind TEXT NOT NULL CHECK (source_kind IN ('LOCAL_PAGES','REMOTE_PAGES','COVER_ONLY')),
                sample_count INTEGER NOT NULL DEFAULT 1,
                confidence REAL NOT NULL DEFAULT 0,
                generated_at TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                PRIMARY KEY (comic_id, model_id, model_version, sampling_policy_version, embedding_kind)
            );
            CREATE INDEX IF NOT EXISTS idx_visual_embeddings_model
                ON visual_embeddings(model_id, model_version, embedding_kind, generated_at);
            CREATE INDEX IF NOT EXISTS idx_visual_embeddings_comic
                ON visual_embeddings(comic_id, embedding_kind);
        `
    }
]

export const latestMigrationVersion''',
)

replace_once(
    'src/library/database.ts',
    "import type { UserEvent, UserEventInput } from '../recommendation-v3/types'\n",
    "import type { UserEvent, UserEventInput } from '../recommendation-v3/types'\nimport type {\n    RecommendationFeedbackState,\n    VisualEmbeddingRecord\n} from '../recommendation-v4/visual-style'\n",
)
insert_before(
    'src/library/database.ts',
    "    recordRecommendationEdge(input: {\n",
    r'''    recommendationFeedback(): RecommendationFeedbackState[] {
        const rows = this.db
            .prepare(
                `SELECT id, occurred_at, event_type, comic_id, metadata_json, created_at
                 FROM user_events
                 WHERE comic_id IS NOT NULL
                   AND event_type IN ('recommend_like','recommend_dislike','recommend_feedback_reason')
                 ORDER BY occurred_at ASC, created_at ASC, id ASC`
            )
            .all() as SqlRow[]
        const latest = new Map<string, RecommendationFeedbackState>()
        for (const row of rows) {
            const comicId = String(row.comic_id ?? '')
            if (!comicId) continue
            const eventType = String(row.event_type ?? '')
            if (eventType === 'recommend_like' || eventType === 'recommend_dislike') {
                latest.set(comicId, {
                    comicId,
                    sentiment: eventType === 'recommend_like' ? 'like' : 'dislike',
                    feedbackEventId: String(row.id),
                    occurredAt: String(row.occurred_at),
                    reasons: [],
                    reasonEventId: null
                })
                continue
            }
            const current = latest.get(comicId)
            if (!current) continue
            const metadata = jsonObject(row.metadata_json)
            if (String(metadata.sentiment ?? '') !== current.sentiment) continue
            if (
                metadata.parentFeedbackId &&
                String(metadata.parentFeedbackId) !== current.feedbackEventId
            )
                continue
            const reasons = Array.isArray(metadata.reasons)
                ? [
                      ...new Set(
                          metadata.reasons
                              .map(String)
                              .map((value) => value.trim())
                              .filter(Boolean)
                      )
                  ]
                : []
            current.reasons = reasons
            current.reasonEventId = String(row.id)
        }
        return [...latest.values()].sort(
            (a, b) =>
                b.occurredAt.localeCompare(a.occurredAt) ||
                a.comicId.localeCompare(b.comicId)
        )
    }

    saveVisualEmbedding(input: VisualEmbeddingRecord): VisualEmbeddingRecord {
        const vector = input.vector.map(Number)
        if (
            !vector.length ||
            vector.length !== Number(input.dimension) ||
            vector.length > 4096 ||
            vector.some((value) => !Number.isFinite(value))
        )
            throw new Error('Visual embedding is invalid')
        const norm = Math.sqrt(
            vector.reduce((sum, value) => sum + value * value, 0)
        )
        if (!Number.isFinite(norm) || norm < 1e-8)
            throw new Error('Visual embedding has zero magnitude')
        const normalized = vector.map((value) => value / norm)
        const confidence = Math.max(0, Math.min(1, Number(input.confidence)))
        const generatedAt = input.generatedAt || new Date().toISOString()
        this.db
            .prepare(
                `INSERT INTO visual_embeddings(
                    comic_id, model_id, model_version, sampling_policy_version,
                    embedding_kind, vector_json, dimension, source_kind, sample_count,
                    confidence, generated_at, metadata_json
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(comic_id, model_id, model_version, sampling_policy_version, embedding_kind)
                 DO UPDATE SET vector_json = excluded.vector_json,
                               dimension = excluded.dimension,
                               source_kind = excluded.source_kind,
                               sample_count = excluded.sample_count,
                               confidence = excluded.confidence,
                               generated_at = excluded.generated_at,
                               metadata_json = excluded.metadata_json`
            )
            .run(
                input.comicId,
                input.modelId,
                input.modelVersion,
                input.samplingPolicyVersion,
                input.embeddingKind,
                JSON.stringify(normalized),
                normalized.length,
                input.sourceKind,
                Math.max(1, Math.floor(Number(input.sampleCount) || 1)),
                confidence,
                generatedAt,
                JSON.stringify(input.metadata ?? {})
            )
        return {
            ...input,
            vector: normalized,
            dimension: normalized.length,
            confidence,
            generatedAt
        }
    }

    listVisualEmbeddings(comicIds?: string[]): VisualEmbeddingRecord[] {
        const requested = comicIds?.filter(Boolean) ?? []
        if (comicIds && !requested.length) return []
        const rows = requested.length
            ? (this.db
                  .prepare(
                      `SELECT * FROM visual_embeddings WHERE comic_id IN (${requested.map(() => '?').join(',')})`
                  )
                  .all(...requested) as SqlRow[])
            : (this.db.prepare('SELECT * FROM visual_embeddings').all() as SqlRow[])
        return rows.flatMap((row) => {
            try {
                const vector = JSON.parse(String(row.vector_json ?? '[]')) as unknown
                if (!Array.isArray(vector)) return []
                return [
                    {
                        comicId: String(row.comic_id),
                        modelId: String(row.model_id),
                        modelVersion: String(row.model_version),
                        samplingPolicyVersion: String(row.sampling_policy_version),
                        embeddingKind: String(row.embedding_kind) as 'body' | 'cover',
                        vector: vector.map(Number),
                        dimension: Number(row.dimension),
                        sourceKind: String(row.source_kind) as VisualEmbeddingRecord['sourceKind'],
                        sampleCount: Number(row.sample_count),
                        confidence: Number(row.confidence),
                        generatedAt: String(row.generated_at),
                        metadata: jsonObject(row.metadata_json)
                    }
                ]
            } catch {
                return []
            }
        })
    }

''',
)

replace_once(
    'src/recommendation-v3/ranker-adapter-v3.ts',
    "    evidence: RetrievedCandidateV3['evidence']\n",
    "    evidence: RetrievedCandidateV3['evidence']\n    feedbackAdjustment?: number\n    visual?: unknown\n",
)
replace_once(
    'src/recommendation-v3/cycle-coordinator-v3.ts',
    "                        evidence: item.evidence\n",
    "                        evidence: item.evidence,\n                        feedbackAdjustment: item.feedbackAdjustment,\n                        visual: item.visual\n",
)

replace_once(
    'src/library/service.ts',
    "import { BATCH_ALLOCATOR_VERSION } from '../recommendation-v3/batch-allocator-v3'\n",
    r'''import { BATCH_ALLOCATOR_VERSION } from '../recommendation-v3/batch-allocator-v3'
import {
    buildVisualPreferenceProfile,
    cosineSimilarity,
    metadataFeedbackAdjustment,
    rerankWithVisualStyle,
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_PROFILE_VERSION,
    VISUAL_RERANK_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION,
    type VisualEmbeddingRecord,
    type VisualRerankMode,
    type VisualSamplingMode
} from '../recommendation-v4/visual-style'
''',
)
replace_once(
    'src/library/service.ts',
    "    recordRecommendationEvent(input: UserEventInput) {\n        return this.database.recordUserEvent(input)\n    }\n",
    r'''    recordRecommendationEvent(input: UserEventInput) {
        return this.database.recordUserEvent(input)
    }

    visualSettings() {
        const stored = this.database.getAppState<{
            enabled?: boolean
            samplingMode?: VisualSamplingMode
            rerankMode?: VisualRerankMode
        }>('recommendation.visualSettings.v1')
        const samplingMode: VisualSamplingMode = [
            'local_only',
            'standard',
            'cover_only'
        ].includes(String(stored?.samplingMode ?? ''))
            ? (stored!.samplingMode as VisualSamplingMode)
            : 'local_only'
        const rerankMode: VisualRerankMode = ['OFF', 'SHADOW', 'LIVE'].includes(
            String(stored?.rerankMode ?? '')
        )
            ? (stored!.rerankMode as VisualRerankMode)
            : 'SHADOW'
        return {
            enabled: Boolean(stored?.enabled),
            samplingMode,
            rerankMode
        }
    }

    updateVisualSettings(input: {
        enabled?: unknown
        samplingMode?: unknown
        rerankMode?: unknown
    }) {
        const previous = this.visualSettings()
        const samplingMode = ['local_only', 'standard', 'cover_only'].includes(
            String(input.samplingMode ?? '')
        )
            ? (String(input.samplingMode) as VisualSamplingMode)
            : previous.samplingMode
        const rerankMode = ['OFF', 'SHADOW', 'LIVE'].includes(
            String(input.rerankMode ?? '')
        )
            ? (String(input.rerankMode) as VisualRerankMode)
            : previous.rerankMode
        const next = {
            enabled:
                input.enabled === undefined
                    ? previous.enabled
                    : Boolean(input.enabled),
            samplingMode,
            rerankMode
        }
        this.database.setAppState('recommendation.visualSettings.v1', next)
        return next
    }

    saveVisualEmbedding(
        input: Omit<VisualEmbeddingRecord, 'generatedAt'> & {
            generatedAt?: string
        }
    ) {
        if (!this.database.getComic(input.comicId)) throw new Error('Unknown comic')
        if (
            input.modelId !== VISUAL_MODEL_ID ||
            input.modelVersion !== VISUAL_MODEL_VERSION
        )
            throw new Error('Unsupported visual embedding model')
        if (input.samplingPolicyVersion !== VISUAL_SAMPLING_POLICY_VERSION)
            throw new Error('Unsupported visual sampling policy')
        return this.database.saveVisualEmbedding({
            ...input,
            generatedAt: input.generatedAt ?? new Date().toISOString()
        })
    }

    visualPreferenceProfile() {
        const catalog = this.database.listComics({ limit: 10000 })
        const favorites = new Set(
            catalog
                .filter((comic) => comic.isFavorite)
                .map((comic) => comic.comicId)
        )
        const feedback = this.database.recommendationFeedback()
        return buildVisualPreferenceProfile({
            embeddings: this.database.listVisualEmbeddings(),
            favoriteComicIds: favorites,
            feedback,
            catalogSize: Math.max(
                1,
                favorites.size +
                    feedback.filter((item) => item.sentiment === 'like').length
            )
        })
    }

    visualIndexStatus() {
        const settings = this.visualSettings()
        const catalog = this.database.listComics({ limit: 10000 })
        const feedback = this.database.recommendationFeedback()
        const targetIds = new Set([
            ...catalog
                .filter((comic) => comic.isFavorite)
                .map((comic) => comic.comicId),
            ...feedback.map((item) => item.comicId)
        ])
        const embeddings = this.database.listVisualEmbeddings()
        const current = embeddings.filter(
            (item) =>
                item.modelId === VISUAL_MODEL_ID &&
                item.modelVersion === VISUAL_MODEL_VERSION
        )
        const indexedIds = new Set(current.map((item) => item.comicId))
        const pendingComicIds = [...targetIds]
            .filter((id) => !indexedIds.has(id))
            .sort()
        return {
            settings,
            modelId: VISUAL_MODEL_ID,
            modelVersion: VISUAL_MODEL_VERSION,
            samplingPolicyVersion: VISUAL_SAMPLING_POLICY_VERSION,
            profileVersion: VISUAL_PROFILE_VERSION,
            rerankVersion: VISUAL_RERANK_VERSION,
            targetCount: targetIds.size,
            indexedCount: [...targetIds].filter((id) => indexedIds.has(id)).length,
            bodyCount: current.filter((item) => item.embeddingKind === 'body').length,
            coverCount: current.filter((item) => item.embeddingKind === 'cover').length,
            pendingComicIds,
            profile: this.visualPreferenceProfile()
        }
    }

    similarVisualStyle(comicId: string, limit = 20) {
        const embeddings = this.database.listVisualEmbeddings()
        const preferred = new Map<string, VisualEmbeddingRecord>()
        for (const item of embeddings) {
            if (
                item.modelId !== VISUAL_MODEL_ID ||
                item.modelVersion !== VISUAL_MODEL_VERSION
            )
                continue
            const previous = preferred.get(item.comicId)
            if (
                !previous ||
                (previous.embeddingKind === 'cover' && item.embeddingKind === 'body')
            )
                preferred.set(item.comicId, item)
        }
        const source = preferred.get(comicId)
        if (!source) return []
        return [...preferred.values()]
            .filter(
                (item) =>
                    item.comicId !== comicId &&
                    item.vector.length === source.vector.length
            )
            .map((item) => ({
                comic: this.database.getComic(item.comicId),
                similarity: cosineSimilarity(source.vector, item.vector),
                sourceKind: item.sourceKind,
                confidence: item.confidence
            }))
            .filter((item) => item.comic)
            .sort(
                (a, b) =>
                    b.similarity - a.similarity ||
                    a.comic!.comicId.localeCompare(b.comic!.comicId)
            )
            .slice(0, Math.max(1, Math.min(50, Math.floor(limit))))
    }
''',
)
replace_once(
    'src/library/service.ts',
    "    async buildFinalRecommendationCycleV3(cycleId: string) {\n        this.recommendationProgress = { state: 'running', phase: 'profile', done: 0, total: 6 }\n",
    "    async buildFinalRecommendationCycleV3(cycleId: string) {\n        this.recommendationProgress = { state: 'running', phase: 'profile', done: 0, total: 7 }\n",
)
replace_once(
    'src/library/service.ts',
    "        const explicitFavoriteIds = new Set(catalog.filter((comic) => comic.isFavorite).map((comic) => comic.comicId))\n        const favorites = catalog\n            .filter((comic) => comic.isFavorite || comic.inLibrary || comic.downloadedPictures > 0 || readingIds.has(comic.comicId))\n            .map((comic) => ({ ...comic, isFavorite: true }))\n",
    r'''        const explicitFavoriteIds = new Set(
            catalog
                .filter((comic) => comic.isFavorite)
                .map((comic) => comic.comicId)
        )
        const recommendationFeedback = this.database.recommendationFeedback()
        const latestFeedback = new Map(
            recommendationFeedback.map((item) => [item.comicId, item])
        )
        const dislikedIds = new Set(
            recommendationFeedback
                .filter((item) => item.sentiment === 'dislike')
                .map((item) => item.comicId)
        )
        const likedIds = new Set(
            recommendationFeedback
                .filter((item) => item.sentiment === 'like')
                .map((item) => item.comicId)
        )
        const favorites = catalog
            .filter(
                (comic) =>
                    !dislikedIds.has(comic.comicId) &&
                    (comic.isFavorite ||
                        comic.inLibrary ||
                        comic.downloadedPictures > 0 ||
                        readingIds.has(comic.comicId) ||
                        likedIds.has(comic.comicId))
            )
            .map((comic) => ({ ...comic, isFavorite: true }))
''',
)
for phase, done in [('intents', 1), ('routes', 2), ('retrieve', 3), ('rank', 4)]:
    replace_once(
        'src/library/service.ts',
        f"this.recommendationProgress = {{ state: 'running', phase: '{phase}', done: {done}, total: 6 }}",
        f"this.recommendationProgress = {{ state: 'running', phase: '{phase}', done: {done}, total: 7 }}",
    )
replace_once(
    'src/library/service.ts',
    r'''        const ranked = rankCandidatesWithFrozenRankerV3({
            candidates: retrieved.candidates,
            favorites,
            graphEdges: this.database.listRecommendationEdges().map((edge) => ({
                sourceComicId: edge.sourceComicId,
                targetComicId: edge.targetComicId,
                confidence: edge.confidence,
                observationCount: edge.observationCount
            }))
        })
        this.recommendationProgress = { state: 'complete', phase: 'complete', done: 6, total: 6 }
''',
    r'''        const ranked = rankCandidatesWithFrozenRankerV3({
            candidates: retrieved.candidates,
            favorites,
            graphEdges: this.database.listRecommendationEdges().map((edge) => ({
                sourceComicId: edge.sourceComicId,
                targetComicId: edge.targetComicId,
                confidence: edge.confidence,
                observationCount: edge.observationCount
            }))
        })
        const catalogById = new Map(
            catalog.map((comic) => [comic.comicId, comic])
        )
        const feedbackAdjusted = ranked
            .filter((candidate) => !latestFeedback.has(candidate.comicId))
            .map((candidate, index) => {
                const feedbackAdjustment = metadataFeedbackAdjustment({
                    candidate: candidate.comic,
                    feedback: recommendationFeedback,
                    catalogById
                })
                const baselinePercentile =
                    ranked.length <= 1 ? 1 : 1 - index / (ranked.length - 1)
                return {
                    ...candidate,
                    feedbackAdjustment,
                    __feedbackRankScore:
                        baselinePercentile + feedbackAdjustment
                }
            })
            .sort(
                (a, b) =>
                    b.__feedbackRankScore - a.__feedbackRankScore ||
                    a.rawRank - b.rawRank ||
                    a.comicId.localeCompare(b.comicId)
            )
            .map(({ __feedbackRankScore: _score, ...candidate }) => candidate)
        this.recommendationProgress = {
            state: 'running',
            phase: 'visual',
            done: 5,
            total: 7
        }
        const visualSettings = this.visualSettings()
        const visualEmbeddings = this.database.listVisualEmbeddings()
        const visualProfile = buildVisualPreferenceProfile({
            embeddings: visualEmbeddings,
            favoriteComicIds: explicitFavoriteIds,
            feedback: recommendationFeedback,
            catalogSize: Math.max(1, explicitFavoriteIds.size + likedIds.size)
        })
        const reranked = rerankWithVisualStyle({
            ranked: feedbackAdjusted,
            embeddings: visualEmbeddings,
            profile: visualProfile,
            mode: visualSettings.enabled ? visualSettings.rerankMode : 'OFF'
        })
        this.recommendationProgress = {
            state: 'complete',
            phase: 'complete',
            done: 7,
            total: 7
        }
''',
)
replace_once(
    'src/library/service.ts',
    "            ranked,\n            readiness: retrieved.readiness,\n",
    "            ranked: reranked,\n            readiness: retrieved.readiness,\n",
)
replace_once(
    'src/library/service.ts',
    "                ...retrieved.telemetry,\n                cycleId,\n",
    r'''                ...retrieved.telemetry,
                cycleId,
                recommendationV4: {
                    feedbackCount: recommendationFeedback.length,
                    likedCount: likedIds.size,
                    dislikedCount: dislikedIds.size,
                    exactFeedbackItemsSuppressed:
                        ranked.length - feedbackAdjusted.length,
                    visual: {
                        settings: visualSettings,
                        profileAvailable: Boolean(visualProfile),
                        profileCoverage: visualProfile?.coverage ?? 0,
                        positivePrototypeCount:
                            visualProfile?.positivePrototypes.length ?? 0,
                        negativePrototypeCount:
                            visualProfile?.negativePrototypes.length ?? 0,
                        candidateEmbeddingCount: reranked.filter((item) =>
                            Boolean(
                                item.visual &&
                                    typeof item.visual === 'object' &&
                                    (item.visual as { available?: boolean })
                                        .available
                            )
                        ).length,
                        shadowMoveCount: reranked.filter((item) => {
                            const visual = item.visual as
                                | { shadowRank?: number | null }
                                | undefined
                            return Boolean(
                                visual?.shadowRank &&
                                    visual.shadowRank !== item.rawRank
                            )
                        }).length
                    }
                },
''',
)
replace_once(
    'src/library/service.ts',
    "                rankerModelVersion: RANKER_ADAPTER_VERSION,\n",
    "                rankerModelVersion: `${RANKER_ADAPTER_VERSION}/${VISUAL_RERANK_VERSION}`,\n",
)

replace_once(
    'src/library/server.ts',
    "import { PreviewService } from '../services/preview-service'\n",
    r'''import { PreviewService } from '../services/preview-service'
import { VisualStyleService } from '../services/visual-style-service'
import {
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION,
    type VisualSamplingMode
} from '../recommendation-v4/visual-style'
''',
)
replace_once(
    'src/library/server.ts',
    "    const readerService = new ReaderService(\n",
    r'''    const visualStyleService = new VisualStyleService(
        options.database,
        providerService,
        new PreviewCacheManager(
            path.join(
                options.cacheDir ?? options.service.dataDir,
                'visual-samples'
            ),
            { maxBytes: 192 * 1024 * 1024, ttlMs: 6 * 60 * 60 * 1000 }
        )
    )
    const readerService = new ReaderService(
''',
)
replace_once(
    'src/library/server.ts',
    "                    'recommend_detail_open',\n",
    "                    'recommend_detail_open',\n                    'recommend_like',\n                    'recommend_dislike',\n                    'recommend_feedback_reason',\n",
)
replace_once(
    'src/library/server.ts',
    "                if (\n                    eventType === 'recommend_impression' &&\n",
    r'''                if (
                    (eventType === 'recommend_like' ||
                        eventType === 'recommend_dislike' ||
                        eventType === 'recommend_feedback_reason') &&
                    !comicId
                )
                    return json(response, 400, {
                        error: 'Recommendation feedback requires a comic'
                    })
                if (eventType === 'recommend_feedback_reason') {
                    const metadata =
                        typeof input.metadata === 'object' && input.metadata
                            ? (input.metadata as Record<string, unknown>)
                            : {}
                    if (
                        !['like', 'dislike'].includes(
                            String(metadata.sentiment ?? '')
                        ) ||
                        !Array.isArray(metadata.reasons)
                    )
                        return json(response, 400, {
                            error: 'Feedback reasons require sentiment and reasons'
                        })
                }
                if (
                    eventType === 'recommend_impression' &&
''',
)
insert_before(
    'src/library/server.ts',
    "            if (\n                url.pathname === '/api/v1/update/check'",
    r'''            if (
                url.pathname === '/api/v1/recommendation-feedback' &&
                request.method === 'GET'
            )
                return json(
                    response,
                    200,
                    options.database.recommendationFeedback()
                )
            if (
                url.pathname === '/api/v1/visual/status' &&
                request.method === 'GET'
            )
                return json(response, 200, options.service.visualIndexStatus())
            if (
                url.pathname === '/api/v1/visual/settings' &&
                request.method === 'POST'
            )
                return json(
                    response,
                    200,
                    options.service.updateVisualSettings(await body(request))
                )
            if (
                url.pathname === '/api/v1/visual/prepare' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const mode = [
                    'local_only',
                    'standard',
                    'cover_only'
                ].includes(String(input.mode ?? ''))
                    ? (String(input.mode) as VisualSamplingMode)
                    : options.service.visualSettings().samplingMode
                return json(
                    response,
                    200,
                    await visualStyleService.prepare(
                        String(input.comicId ?? ''),
                        mode,
                        Number(input.limit ?? 6)
                    )
                )
            }
            if (
                url.pathname === '/api/v1/visual/embedding' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                const vector = Array.isArray(input.vector)
                    ? input.vector.map(Number)
                    : []
                const sourceKind = String(input.sourceKind ?? '')
                if (
                    ![
                        'LOCAL_PAGES',
                        'REMOTE_PAGES',
                        'COVER_ONLY'
                    ].includes(sourceKind)
                )
                    return json(response, 400, {
                        error: 'Invalid visual embedding source'
                    })
                return json(
                    response,
                    200,
                    options.service.saveVisualEmbedding({
                        comicId: String(input.comicId ?? ''),
                        modelId: String(input.modelId ?? VISUAL_MODEL_ID),
                        modelVersion: String(
                            input.modelVersion ?? VISUAL_MODEL_VERSION
                        ),
                        samplingPolicyVersion: String(
                            input.samplingPolicyVersion ??
                                VISUAL_SAMPLING_POLICY_VERSION
                        ),
                        embeddingKind:
                            input.embeddingKind === 'cover' ? 'cover' : 'body',
                        vector,
                        dimension: Number(input.dimension ?? vector.length),
                        sourceKind: sourceKind as
                            | 'LOCAL_PAGES'
                            | 'REMOTE_PAGES'
                            | 'COVER_ONLY',
                        sampleCount: Number(input.sampleCount ?? 1),
                        confidence: Number(
                            input.confidence ??
                                (sourceKind === 'COVER_ONLY' ? 0.5 : 1)
                        ),
                        metadata:
                            typeof input.metadata === 'object' && input.metadata
                                ? (input.metadata as Record<string, unknown>)
                                : {}
                    })
                )
            }
            const visualSimilar = url.pathname.match(
                /^\/api\/v1\/visual\/similar\/([^/]+)$/
            )
            if (visualSimilar && request.method === 'GET')
                return json(
                    response,
                    200,
                    options.service.similarVisualStyle(
                        decodeURIComponent(visualSimilar[1]),
                        Number(url.searchParams.get('limit') ?? 20)
                    )
                )
            const visualSample = url.pathname.match(
                /^\/api\/v1\/visual\/samples\/([^/]+)$/
            )
            if (visualSample && request.method === 'GET') {
                const image = visualStyleService.page(
                    decodeURIComponent(visualSample[1])
                )
                response.writeHead(200, {
                    'content-type': image.contentType,
                    'content-length': String(image.data.byteLength),
                    'cache-control': 'private, no-store',
                    'x-content-type-options': 'nosniff'
                })
                response.end(image.data)
                return
            }
            if (
                url.pathname === '/api/v1/visual/cache/clear' &&
                request.method === 'POST'
            )
                return json(response, 200, visualStyleService.clear())
''',
)

replace_once(
    'web/app.js',
    "import { createDownloadedCloud } from './downloaded-cloud.js'\n",
    "import { createDownloadedCloud } from './downloaded-cloud.js'\nimport { analyzeVisualSamples, VISUAL_RUNTIME } from './visual-runtime.js'\n",
)
replace_once(
    'web/app.js',
    "    recommendationPending: false,\n",
    r'''    recommendationPending: false,
    recommendationFeedback: {},
    recommendationFeedbackReasonsEnabled:
        localStorage.getItem('pica-recommend-feedback-reasons') === 'true',
    visualIndexRunning: false,
    visualIndexStopRequested: false,
''',
)
replace_once(
    'web/app.js',
    '''                <div class="detail-actions"><button data-result-detail="${escapeHtml(comic.comicId)}" data-result-context="${context}">${t('result.details')}</button><button data-result-download="${escapeHtml(comic.comicId)}">${t('action.download')}</button>${state.mode === 'connected' && state.capabilities?.features?.providerFavoriteMutation ? `<button data-result-favorite="${escapeHtml(comic.comicId)}">${escapeHtml(providerFavoriteLabel(comic))}</button>` : ''}</div>\n''',
    '''                <div class="detail-actions"><button data-result-detail="${escapeHtml(comic.comicId)}" data-result-context="${context}">${t('result.details')}</button><button data-result-download="${escapeHtml(comic.comicId)}">${t('action.download')}</button>${state.mode === 'connected' && state.capabilities?.features?.providerFavoriteMutation ? `<button data-result-favorite="${escapeHtml(comic.comicId)}">${escapeHtml(providerFavoriteLabel(comic))}</button>` : ''}</div>
                ${recommendation && state.mode === 'connected' ? `<div class="recommend-feedback" aria-label="${escapeHtml(t('recommend.feedbackLabel'))}"><button type="button" data-recommend-feedback="like" class="${state.recommendationFeedback[comic.comicId]?.sentiment === 'like' ? 'active' : ''}">👍 ${escapeHtml(t('recommend.like'))}</button><button type="button" data-recommend-feedback="dislike" class="${state.recommendationFeedback[comic.comicId]?.sentiment === 'dislike' ? 'active' : ''}">👎 ${escapeHtml(t('recommend.dislike'))}</button></div>` : ''}
''',
)
insert_before(
    'web/app.js',
    "function renderPreparedRecommendations() {\n",
    r'''async function loadRecommendationFeedback() {
    if (state.mode !== 'connected') return
    try {
        const rows = await api('/api/v1/recommendation-feedback')
        state.recommendationFeedback = Object.fromEntries(
            (rows || []).map((item) => [item.comicId, item])
        )
    } catch {
        state.recommendationFeedback = {}
    }
}

let pendingRecommendationFeedback = null
async function submitRecommendationFeedback(button, sentiment) {
    if (state.mode !== 'connected') return
    const card = button.closest('.result')
    const comicId = card?.dataset.comicId
    if (!comicId || !['like', 'dislike'].includes(sentiment)) return
    const current = state.recommendationFeedback[comicId]
    if (current?.sentiment === sentiment) return
    const value = await post('/api/v1/recommendation-events', {
        eventType: sentiment === 'like' ? 'recommend_like' : 'recommend_dislike',
        comicId,
        source: 'recommendation_feedback',
        appSessionId: state.appSessionId,
        contextId: state.recommendationContextId,
        recommendationCycleId: state.recommendationCycleId,
        recommendationSessionId: String(state.recommendationSessionNo || ''),
        recommendationBatchIndex: state.recommendationBatch,
        rankPosition: Number(card.dataset.resultRank || 0)
    })
    state.recommendationFeedback[comicId] = {
        comicId,
        sentiment,
        feedbackEventId: value.id,
        occurredAt: value.occurredAt,
        reasons: [],
        reasonEventId: null
    }
    card.querySelectorAll('[data-recommend-feedback]').forEach((item) =>
        item.classList.toggle(
            'active',
            item.dataset.recommendFeedback === sentiment
        )
    )
    if (state.recommendationFeedbackReasonsEnabled) {
        pendingRecommendationFeedback = {
            comicId,
            sentiment,
            feedbackEventId: value.id
        }
        $('#recommend-feedback-dialog-title').textContent =
            sentiment === 'like'
                ? t('recommend.whyLike')
                : t('recommend.whyDislike')
        $$('#recommend-feedback-dialog input[type="checkbox"]').forEach(
            (input) => (input.checked = false)
        )
        $('#recommend-feedback-dialog').showModal()
    }
}

''',
)
replace_once(
    'web/app.js',
    "    dialog.showModal()\n    recordRecommendationEvent(\n",
    r'''    if (state.mode === 'connected') {
        const styleButton = document.createElement('button')
        styleButton.type = 'button'
        styleButton.dataset.detailSimilarStyle = 'true'
        styleButton.textContent = t('visual.similarStyle')
        $('#recommend-detail-content .detail-actions').append(styleButton)
    }
    dialog.showModal()
    recordRecommendationEvent(
''',
)
replace_once(
    'web/app.js',
    "    else if (event.target.dataset.detailPreview) await loadRecommendationPreview(0)\n",
    r'''    else if (event.target.dataset.detailPreview)
        await loadRecommendationPreview(0)
    else if (event.target.dataset.detailSimilarStyle) {
        try {
            const rows = await api(
                `/api/v1/visual/similar/${encodeURIComponent(comicId)}?limit=12`
            )
            $('#recommend-preview-message').textContent = rows.length
                ? t('visual.similarFound', { count: rows.length })
                : t('visual.similarEmpty')
            $('#recommend-preview').innerHTML = rows
                .map(
                    (item) =>
                        `<article class="visual-similar-item"><strong>${escapeHtml(item.comic.title)}</strong><span>${escapeHtml(item.comic.canonicalAuthor || item.comic.author || '')}</span></article>`
                )
                .join('')
        } catch (error) {
            $('#recommend-preview-message').textContent = localizeError(
                language,
                error
            )
        }
    }
''',
)
replace_once(
    'web/app.js',
    "        const favoriteId = event.target.dataset.resultFavorite\n",
    r'''        const feedback = event.target.dataset.recommendFeedback
        if (feedback) {
            try {
                await submitRecommendationFeedback(event.target, feedback)
            } catch (error) {
                $('#recommend-message').textContent = localizeError(
                    language,
                    error
                )
            }
        }
        const favoriteId = event.target.dataset.resultFavorite
''',
)
insert_before(
    'web/app.js',
    "$('#refresh-jobs').onclick = loadJobs\n",
    r'''$('#recommend-feedback-dialog-skip').onclick = () => {
    pendingRecommendationFeedback = null
    $('#recommend-feedback-dialog').close()
}
$('#recommend-feedback-dialog-save').onclick = async () => {
    if (!pendingRecommendationFeedback)
        return $('#recommend-feedback-dialog').close()
    const reasons = $$(
        '#recommend-feedback-dialog input[type="checkbox"]:checked'
    ).map((input) => input.value)
    if (reasons.length) {
        try {
            await post('/api/v1/recommendation-events', {
                eventType: 'recommend_feedback_reason',
                comicId: pendingRecommendationFeedback.comicId,
                source: 'recommendation_feedback',
                appSessionId: state.appSessionId,
                contextId: state.recommendationContextId,
                recommendationCycleId: state.recommendationCycleId,
                recommendationBatchIndex: state.recommendationBatch,
                metadata: {
                    parentFeedbackId:
                        pendingRecommendationFeedback.feedbackEventId,
                    sentiment: pendingRecommendationFeedback.sentiment,
                    reasons
                }
            })
            state.recommendationFeedback[
                pendingRecommendationFeedback.comicId
            ].reasons = reasons
        } catch (error) {
            $('#recommend-message').textContent = localizeError(language, error)
        }
    }
    pendingRecommendationFeedback = null
    $('#recommend-feedback-dialog').close()
}

async function loadVisualStatus() {
    if (state.mode !== 'connected') return null
    try {
        const value = await api('/api/v1/visual/status')
        $('#visual-enabled').checked = Boolean(value.settings?.enabled)
        $('#visual-sampling-mode').value =
            value.settings?.samplingMode || 'local_only'
        $('#visual-rerank-mode').value =
            value.settings?.rerankMode || 'SHADOW'
        $('#visual-index-status').textContent = t('visual.indexStatus', {
            indexed: value.indexedCount || 0,
            target: value.targetCount || 0,
            pending: value.pendingComicIds?.length || 0
        })
        return value
    } catch (error) {
        $('#visual-index-status').textContent = localizeError(language, error)
        return null
    }
}

async function saveVisualSettings() {
    if (state.mode !== 'connected') return
    await post('/api/v1/visual/settings', {
        enabled: $('#visual-enabled').checked,
        samplingMode: $('#visual-sampling-mode').value,
        rerankMode: $('#visual-rerank-mode').value
    })
    await loadVisualStatus()
}

async function buildVisualIndex() {
    if (state.mode !== 'connected' || state.visualIndexRunning) return
    state.visualIndexRunning = true
    state.visualIndexStopRequested = false
    $('#visual-index-build').disabled = true
    $('#visual-index-stop').hidden = false
    try {
        await saveVisualSettings()
        let status = await loadVisualStatus()
        const pending = [...(status?.pendingComicIds || [])]
        const total = pending.length
        for (let index = 0; index < pending.length; index++) {
            if (state.visualIndexStopRequested) break
            const comicId = pending[index]
            $('#visual-index-progress').hidden = false
            $('#visual-index-progress').max = Math.max(1, total)
            $('#visual-index-progress').value = index
            $('#visual-index-message').textContent = t('visual.processing', {
                current: index + 1,
                total
            })
            try {
                const prepared = await post('/api/v1/visual/prepare', {
                    comicId,
                    mode: $('#visual-sampling-mode').value,
                    limit: 6
                })
                if (!prepared.samples?.length) continue
                const result = await analyzeVisualSamples(
                    prepared.samples,
                    (progress) => {
                        if (progress.phase === 'page')
                            $('#visual-index-message').textContent = t(
                                'visual.processingPage',
                                {
                                    current: index + 1,
                                    total,
                                    page: progress.current,
                                    pages: progress.total
                                }
                            )
                        else if (progress.phase === 'model')
                            $('#visual-index-message').textContent = t(
                                'visual.loadingModel'
                            )
                    }
                )
                await post('/api/v1/visual/embedding', {
                    comicId,
                    ...result,
                    embeddingKind:
                        prepared.sourceKind === 'COVER_ONLY' ? 'cover' : 'body',
                    sourceKind: prepared.sourceKind,
                    confidence:
                        prepared.sourceKind === 'LOCAL_PAGES'
                            ? 1
                            : prepared.sourceKind === 'REMOTE_PAGES'
                              ? 0.85
                              : 0.5,
                    metadata: {
                        sampleIds: prepared.samples.map((item) => item.sampleId)
                    }
                })
            } catch (error) {
                $('#visual-index-message').textContent = t(
                    'visual.itemFailed',
                    {
                        current: index + 1,
                        total,
                        error: localizeError(language, error)
                    }
                )
            }
        }
        $('#visual-index-progress').value = total
        status = await loadVisualStatus()
        $('#visual-index-message').textContent = state.visualIndexStopRequested
            ? t('visual.stopped')
            : t('visual.finished', { indexed: status?.indexedCount || 0 })
    } finally {
        state.visualIndexRunning = false
        $('#visual-index-build').disabled = false
        $('#visual-index-stop').hidden = true
    }
}

$('#visual-enabled').onchange = () => void saveVisualSettings()
$('#visual-sampling-mode').onchange = () => void saveVisualSettings()
$('#visual-rerank-mode').onchange = () => void saveVisualSettings()
$('#visual-index-build').onclick = () => void buildVisualIndex()
$('#visual-index-stop').onclick = () => {
    state.visualIndexStopRequested = true
}
$('#recommend-feedback-reasons-toggle').checked =
    state.recommendationFeedbackReasonsEnabled
$('#recommend-feedback-reasons-toggle').onchange = (event) => {
    state.recommendationFeedbackReasonsEnabled = event.target.checked
    localStorage.setItem(
        'pica-recommend-feedback-reasons',
        String(event.target.checked)
    )
}

''',
)
replace_once(
    'web/app.js',
    "        if (activeView === 'settings') void loadPreviewCacheStats()\n",
    "        if (activeView === 'settings') { void loadPreviewCacheStats(); void loadVisualStatus() }\n",
)
replace_once(
    'web/app.js',
    "        state.mode = 'connected'\n",
    "        state.mode = 'connected'\n        await loadRecommendationFeedback()\n",
)

insert_before(
    'web/index.html',
    '                <article id="settings-browser-lite"',
    r'''                <article id="settings-recommendation-v4" class="panel">
                    <h3>推荐反馈与画风推荐 · Beta</h3>
                    <p>喜欢/不喜欢会立即记录。反馈原因始终可选；关闭后不会弹出原因面板。</p>
                    <label class="toggle-row"><input id="recommend-feedback-reasons-toggle" type="checkbox" /> 喜欢/不喜欢后询问可选原因</label>
                    <hr />
                    <label class="toggle-row"><input id="visual-enabled" type="checkbox" /> 启用画风信号</label>
                    <label>画风取样来源<select id="visual-sampling-mode"><option value="local_only">仅本地已下载正文</option><option value="standard">本地 + 在线收藏少量正文</option><option value="cover_only">仅封面（低置信度）</option></select></label>
                    <label>推荐接入模式<select id="visual-rerank-mode"><option value="OFF">关闭排序影响</option><option value="SHADOW">Shadow：只计算不改排序</option><option value="LIVE">Live：低权重参与排序</option></select></label>
                    <p class="status">视觉模型在本机浏览器运行；首次使用会下载 Transformers.js 与 DINOv2 Small 模型。漫画页面仅从本机 Pica Library 服务读取，不上传给模型服务。</p>
                    <p id="visual-index-status" class="status">尚未读取画风索引。</p>
                    <progress id="visual-index-progress" max="1" value="0" hidden></progress>
                    <p id="visual-index-message" class="status" aria-live="polite"></p>
                    <div class="actions"><button id="visual-index-build" type="button" class="primary">建立 / 补全画风索引</button><button id="visual-index-stop" type="button" hidden>停止</button></div>
                </article>
''',
)
insert_before(
    'web/index.html',
    '        <dialog id="recommend-detail-dialog"',
    r'''        <dialog id="recommend-feedback-dialog" class="app-dialog">
            <div>
                <h3 id="recommend-feedback-dialog-title">可选反馈原因</h3>
                <p>不选择也没关系：喜欢/不喜欢已经记录。</p>
                <div class="feedback-reasons">
                    <label><input type="checkbox" value="style" /> 画风</label>
                    <label><input type="checkbox" value="topic" /> 题材 / 标签</label>
                    <label><input type="checkbox" value="author" /> 作者</label>
                    <label><input type="checkbox" value="character" /> 角色 / IP</label>
                    <label><input type="checkbox" value="already_seen" /> 已经看过</label>
                    <label><input type="checkbox" value="repetitive" /> 推荐太重复</label>
                </div>
                <div class="actions"><button id="recommend-feedback-dialog-skip" type="button">跳过</button><button id="recommend-feedback-dialog-save" class="primary" type="button">保存原因</button></div>
            </div>
        </dialog>
''',
)

styles = r'''
.recommend-feedback { display:flex; gap:.45rem; margin-top:.65rem; flex-wrap:wrap; }
.recommend-feedback button { min-width:5.5rem; }
.recommend-feedback button.active { outline:2px solid currentColor; font-weight:700; }
.feedback-reasons { display:grid; gap:.55rem; margin:1rem 0; }
.toggle-row { display:flex; align-items:center; gap:.55rem; }
#settings-recommendation-v4 progress { width:100%; }
.visual-similar-item { display:flex; flex-direction:column; gap:.2rem; padding:.7rem; border:1px solid var(--border, #ddd); border-radius:.6rem; }
'''
current_styles = read('web/styles.css')
if '.recommend-feedback {' not in current_styles:
    write('web/styles.css', current_styles + styles)

zh = r'''        'recommend.feedbackLabel': '推荐反馈',
        'recommend.like': '喜欢',
        'recommend.dislike': '不喜欢',
        'recommend.whyLike': '为什么喜欢？（可选）',
        'recommend.whyDislike': '为什么不喜欢？（可选）',
        'visual.similarStyle': '相似画风',
        'visual.similarFound': '找到 {count} 本画风相近作品。',
        'visual.similarEmpty': '这本作品还没有可比较的画风向量。',
        'visual.indexStatus': '画风索引：{indexed}/{target}，待分析 {pending}。',
        'visual.processing': '正在分析 {current}/{total}…',
        'visual.processingPage': '正在分析 {current}/{total} · 页面 {page}/{pages}',
        'visual.loadingModel': '正在加载本地视觉模型…',
        'visual.itemFailed': '第 {current}/{total} 本分析失败：{error}',
        'visual.stopped': '画风索引已停止，可稍后继续。',
        'visual.finished': '画风索引本轮完成，已建立 {indexed} 本。',
'''
en = r'''        'recommend.feedbackLabel': 'Recommendation feedback',
        'recommend.like': 'Like',
        'recommend.dislike': 'Dislike',
        'recommend.whyLike': 'Why did you like it? (optional)',
        'recommend.whyDislike': 'Why did you dislike it? (optional)',
        'visual.similarStyle': 'Similar style',
        'visual.similarFound': 'Found {count} visually similar works.',
        'visual.similarEmpty': 'This work does not have a comparable visual vector yet.',
        'visual.indexStatus': 'Style index: {indexed}/{target}, {pending} pending.',
        'visual.processing': 'Analyzing {current}/{total}…',
        'visual.processingPage': 'Analyzing {current}/{total} · page {page}/{pages}',
        'visual.loadingModel': 'Loading the local visual model…',
        'visual.itemFailed': 'Item {current}/{total} failed: {error}',
        'visual.stopped': 'Style indexing stopped. You can resume later.',
        'visual.finished': 'Style indexing complete for this run: {indexed} indexed.',
'''
i18n = read('web/i18n.js')
needle = "        'recommend.exhausted':"
positions = []
pos = 0
while True:
    found = i18n.find(needle, pos)
    if found < 0:
        break
    positions.append(found)
    pos = found + len(needle)
if len(positions) != 2:
    raise RuntimeError(f'web/i18n.js: expected 2 recommend.exhausted anchors, got {len(positions)}')
for idx, addition in [(positions[1], en), (positions[0], zh)]:
    i18n = i18n[:idx] + addition + i18n[idx:]
write('web/i18n.js', i18n)

write(
    'test/unit/recommendation-v4-integration.test.ts',
    r'''import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { latestMigrationVersion } from '../../src/storage/sqlite/migrations'
import {
    VISUAL_MODEL_ID,
    VISUAL_MODEL_VERSION,
    VISUAL_SAMPLING_POLICY_VERSION
} from '../../src/recommendation-v4/visual-style'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Recommendation V4 integration', () => {
    it('adds additive schema 10 visual storage', () => {
        expect(latestMigrationVersion).toBe(10)
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v4-'))
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        expect(
            fs.existsSync(path.join(dir, 'library.sqlite'))
        ).toBe(true)
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('records sentiment before optional reasons and latest sentiment wins', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v4-feedback-'))
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        database.importCatalog(
            [
                {
                    comicId: 'comic-a',
                    title: 'A',
                    author: 'Author',
                    tags: ['tag'],
                    categories: [],
                    finished: true
                }
            ],
            'test'
        )
        const feedback = database.recordUserEvent({
            eventType: 'recommend_dislike',
            comicId: 'comic-a',
            source: 'test'
        })
        expect(database.recommendationFeedback()[0]).toMatchObject({
            comicId: 'comic-a',
            sentiment: 'dislike',
            reasons: []
        })
        database.recordUserEvent({
            eventType: 'recommend_feedback_reason',
            comicId: 'comic-a',
            source: 'test',
            metadata: {
                parentFeedbackId: feedback.id,
                sentiment: 'dislike',
                reasons: ['style']
            }
        })
        expect(database.recommendationFeedback()[0].reasons).toEqual(['style'])
        const changed = database.recordUserEvent({
            eventType: 'recommend_like',
            comicId: 'comic-a',
            source: 'test'
        })
        expect(database.recommendationFeedback()[0]).toMatchObject({
            feedbackEventId: changed.id,
            sentiment: 'like',
            reasons: []
        })
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('persists normalized versioned embeddings', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v4-vector-'))
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        database.importCatalog(
            [
                {
                    comicId: 'comic-a',
                    title: 'A',
                    author: 'Author',
                    tags: [],
                    categories: [],
                    finished: true
                }
            ],
            'test'
        )
        database.saveVisualEmbedding({
            comicId: 'comic-a',
            modelId: VISUAL_MODEL_ID,
            modelVersion: VISUAL_MODEL_VERSION,
            samplingPolicyVersion: VISUAL_SAMPLING_POLICY_VERSION,
            embeddingKind: 'body',
            vector: [3, 4],
            dimension: 2,
            sourceKind: 'LOCAL_PAGES',
            sampleCount: 6,
            confidence: 1,
            generatedAt: new Date(0).toISOString(),
            metadata: {}
        })
        expect(database.listVisualEmbeddings()[0].vector).toEqual([0.6, 0.8])
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('keeps reasons optional in UI and visual analysis lazy', () => {
        const html = read('web/index.html')
        const app = read('web/app.js')
        const runtime = read('web/visual-runtime.js')
        expect(html).toContain('id="recommend-feedback-reasons-toggle"')
        expect(app).toContain(
            "eventType: sentiment === 'like' ? 'recommend_like' : 'recommend_dislike'"
        )
        expect(app.indexOf('state.recommendationFeedback[comicId] =')).toBeLessThan(
            app.indexOf("$('#recommend-feedback-dialog').showModal()")
        )
        expect(runtime).toContain('onnx-community/dinov2-small')
        expect(runtime).toContain('await import(VISUAL_RUNTIME.libraryUrl)')
    })
})
''',
)

write(
    'docs/RECOMMENDATION_V4_VISUAL_BETA.md',
    '''# Recommendation V4 Visual + Feedback Beta

This branch is an unpublished beta. It layers explicit like/dislike feedback and local visual-style representations on top of the frozen Recommendation V3 recall/ranker.

## Feedback contract

- Like/dislike is committed immediately as an append-only event.
- Optional reasons are a separate event and may be disabled entirely.
- Latest sentiment wins for a comic.
- `already_seen`, `topic`, `author` and `character` do not become strong negative visual-style signals. `style` does.

## Visual contract

- Encoder: DINOv2 Small through Transformers.js 4.2.0.
- Page images remain local to Pica Library. The browser downloads model code/weights on first use; image content is not uploaded to the model host.
- Sources: downloaded body pages (high confidence), bounded remote body-page sampling (medium/high confidence), or cover-only (low confidence).
- Embeddings are versioned by model and sampling policy. Full comic pages are not retained by the visual index.
- User style is multi-prototype, not one global centroid.
- Missing visual data is neutral: candidates are not penalized.
- Modes: OFF, SHADOW (audit only), LIVE (bounded low-weight reranking).
- Visual vectors also power Similar Style browsing.

## Safety / release

This branch must not publish releases or tags. A test artifact is produced only after CI is green.
''',
)

for rel in [
    'scripts/apply-recommendation-v4-visual-feedback-dev.mjs',
    'scripts/fix-recommendation-v4-apply.mjs',
    'scripts/post-recommendation-v4-apply.mjs',
    '.github/workflows/recommendation-v4-apply.yml',
    'scripts/apply_recommendation_v4.py',
]:
    try:
        (ROOT / rel).unlink()
    except FileNotFoundError:
        pass

print('Recommendation V4 integration applied with interpolation-safe patcher')
