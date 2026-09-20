import type { RankedCandidateWithEvidenceV3 } from '../recommendation-v3/ranker-adapter-v3'

export const VISUAL_MODEL_ID = 'onnx-community/dinov2-small'
export const VISUAL_MODEL_VERSION = 'dinov2-small-transformersjs-4.2.0'
export const VISUAL_SAMPLING_POLICY_VERSION = 'v1-spread-6-body-pages'
export const VISUAL_PROFILE_VERSION = 'visual-profile-v1-multiprototype'
export const VISUAL_RERANK_VERSION = 'visual-rerank-v2-modular-strength'

export type VisualSourceKind = 'LOCAL_PAGES' | 'REMOTE_PAGES' | 'COVER_ONLY'
export type VisualRerankMode = 'OFF' | 'SHADOW' | 'LIVE'
export type VisualInfluenceStrength = 'LIGHT' | 'STANDARD' | 'STRONG'
export type VisualSamplingMode = 'local_only' | 'standard' | 'cover_only'

export interface VisualEmbeddingRecord {
    comicId: string
    modelId: string
    modelVersion: string
    samplingPolicyVersion: string
    embeddingKind: 'body' | 'cover'
    vector: number[]
    dimension: number
    sourceKind: VisualSourceKind
    sampleCount: number
    confidence: number
    generatedAt: string
    metadata: Record<string, unknown>
}

export interface RecommendationFeedbackState {
    comicId: string
    sentiment: 'like' | 'dislike'
    feedbackEventId: string
    occurredAt: string
    reasons: string[]
    reasonEventId: string | null
}

export interface VisualPrototype {
    vector: number[]
    weight: number
    support: number
    representativeComicIds: string[]
}

export interface VisualPreferenceProfile {
    version: string
    modelId: string
    modelVersion: string
    generatedAt: string
    positivePrototypes: VisualPrototype[]
    negativePrototypes: VisualPrototype[]
    positiveEvidenceCount: number
    negativeEvidenceCount: number
    favoriteEmbeddingCount: number
    explicitLikeCount: number
    explicitDislikeCount: number
    coverage: number
}

export interface VisualCandidateSignal {
    available: boolean
    sourceKind?: VisualSourceKind
    embeddingConfidence: number
    positiveSimilarity: number
    negativeSimilarity: number
    affinity: number
    visualPercentile: number
    baselinePercentile: number
    appliedWeight: number
    shadowScore: number
    shadowRank: number | null
    live: boolean
}

export interface VisualRerankedCandidate extends RankedCandidateWithEvidenceV3 {
    visual?: VisualCandidateSignal
}

export function selectPreferredVisualEmbeddings(
    embeddings: VisualEmbeddingRecord[],
    input: {
        modelId?: string
        modelVersion?: string
        samplingPolicyVersion?: string
    } = {}
) {
    const modelId = input.modelId ?? VISUAL_MODEL_ID
    const modelVersion = input.modelVersion ?? VISUAL_MODEL_VERSION
    const samplingPolicyVersion =
        input.samplingPolicyVersion ?? VISUAL_SAMPLING_POLICY_VERSION
    const preferred = new Map<string, VisualEmbeddingRecord>()
    for (const item of embeddings) {
        if (
            item.modelId !== modelId ||
            item.modelVersion !== modelVersion ||
            item.samplingPolicyVersion !== samplingPolicyVersion
        )
            continue
        const previous = preferred.get(item.comicId)
        if (
            !previous ||
            (previous.embeddingKind === 'cover' &&
                item.embeddingKind === 'body')
        )
            preferred.set(item.comicId, item)
    }
    return preferred
}

const clamp = (value: number, min = 0, max = 1) =>
    Math.max(min, Math.min(max, value))

export function normalizeVector(input: readonly number[]) {
    if (!input.length || input.length > 4096)
        throw new Error('Visual embedding dimension is invalid')
    const values = input.map(Number)
    if (values.some((value) => !Number.isFinite(value)))
        throw new Error('Visual embedding contains non-finite values')
    const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
    if (!Number.isFinite(norm) || norm < 1e-8)
        throw new Error('Visual embedding has zero magnitude')
    return values.map((value) => value / norm)
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]) {
    if (left.length !== right.length || left.length === 0)
        throw new Error('Visual embeddings are not comparable')
    let dot = 0
    let leftNorm = 0
    let rightNorm = 0
    for (let index = 0; index < left.length; index++) {
        const a = Number(left[index])
        const b = Number(right[index])
        dot += a * b
        leftNorm += a * a
        rightNorm += b * b
    }
    if (leftNorm < 1e-12 || rightNorm < 1e-12) return 0
    return clamp(dot / Math.sqrt(leftNorm * rightNorm), -1, 1)
}

function meanVector(vectors: readonly number[][], weights?: readonly number[]) {
    if (!vectors.length) throw new Error('Cannot average an empty visual set')
    const dimension = vectors[0].length
    if (!dimension || vectors.some((vector) => vector.length !== dimension))
        throw new Error('Visual embedding dimensions do not match')
    const output = Array.from({ length: dimension }, () => 0)
    let total = 0
    for (let row = 0; row < vectors.length; row++) {
        const weight = Math.max(0, Number(weights?.[row] ?? 1))
        if (!weight) continue
        total += weight
        for (let column = 0; column < dimension; column++)
            output[column] += Number(vectors[row][column]) * weight
    }
    if (!total) throw new Error('Visual embedding weights are empty')
    return normalizeVector(output.map((value) => value / total))
}

export function aggregatePageEmbeddings(input: readonly number[][]) {
    if (!input.length) throw new Error('No page embeddings were supplied')
    const normalized = input.map((vector) => normalizeVector(vector))
    if (normalized.length <= 2) return meanVector(normalized)
    const firstCenter = meanVector(normalized)
    const similarities = normalized.map((vector) =>
        cosineSimilarity(vector, firstCenter)
    )
    const dropCount = Math.max(1, Math.floor(normalized.length * 0.2))
    const keepCount = Math.max(2, normalized.length - dropCount)
    const retained = normalized
        .map((vector, index) => ({ vector, similarity: similarities[index], index }))
        .sort((a, b) => b.similarity - a.similarity || a.index - b.index)
        .slice(0, keepCount)
        .map((item) => item.vector)
    return meanVector(retained.length >= 2 ? retained : normalized)
}

function desiredPrototypeCount(count: number, maximum: number) {
    if (count < 4) return Math.min(1, maximum)
    if (count < 12) return Math.min(2, maximum)
    if (count < 30) return Math.min(3, maximum)
    if (count < 60) return Math.min(4, maximum)
    return Math.min(5, maximum)
}

export interface VisualPrototypeEvidence {
    comicId: string
    vector: number[]
    weight: number
}

export function buildVisualPrototypes(
    evidence: VisualPrototypeEvidence[],
    maximum: number
) {
    if (!evidence.length || maximum <= 0) return []
    const dimension = evidence[0].vector.length
    const rows = evidence
        .filter((item) => item.vector.length === dimension && item.weight > 0)
        .map((item) => ({ ...item, vector: normalizeVector(item.vector) }))
        .sort((a, b) => a.comicId.localeCompare(b.comicId))
    if (!rows.length) return []
    const k = Math.max(1, desiredPrototypeCount(rows.length, maximum))
    const centers: number[][] = [rows[0].vector]
    while (centers.length < k) {
        let selected: VisualPrototypeEvidence | null = null
        let selectedDistance = -1
        for (const row of rows) {
            const nearest = Math.max(
                ...centers.map((center) => cosineSimilarity(row.vector, center))
            )
            const distance = 1 - nearest
            if (
                distance > selectedDistance + 1e-12 ||
                (Math.abs(distance - selectedDistance) <= 1e-12 &&
                    row.comicId.localeCompare(selected?.comicId ?? '') < 0)
            ) {
                selected = row
                selectedDistance = distance
            }
        }
        if (!selected) break
        centers.push(selected.vector)
    }
    let assignments = rows.map((row) =>
        centers.reduce(
            (best, center, index) => {
                const similarity = cosineSimilarity(row.vector, center)
                return similarity > best.similarity
                    ? { index, similarity }
                    : best
            },
            { index: 0, similarity: -Infinity }
        ).index
    )
    for (let iteration = 0; iteration < 4; iteration++) {
        const next = centers.map((center, index) => {
            const cluster = rows.filter((_, rowIndex) => assignments[rowIndex] === index)
            return cluster.length
                ? meanVector(
                      cluster.map((item) => item.vector),
                      cluster.map((item) => item.weight)
                  )
                : center
        })
        const nextAssignments = rows.map((row) =>
            next.reduce(
                (best, center, index) => {
                    const similarity = cosineSimilarity(row.vector, center)
                    return similarity > best.similarity
                        ? { index, similarity }
                        : best
                },
                { index: 0, similarity: -Infinity }
            ).index
        )
        centers.splice(0, centers.length, ...next)
        if (nextAssignments.every((value, index) => value === assignments[index]))
            break
        assignments = nextAssignments
    }
    return centers
        .map((vector, index): VisualPrototype | null => {
            const cluster = rows.filter((_, rowIndex) => assignments[rowIndex] === index)
            if (!cluster.length) return null
            return {
                vector,
                support: cluster.length,
                weight: cluster.reduce((sum, item) => sum + item.weight, 0),
                representativeComicIds: cluster
                    .map((item) => ({
                        comicId: item.comicId,
                        similarity: cosineSimilarity(item.vector, vector)
                    }))
                    .sort(
                        (a, b) =>
                            b.similarity - a.similarity ||
                            a.comicId.localeCompare(b.comicId)
                    )
                    .slice(0, 5)
                    .map((item) => item.comicId)
            }
        })
        .filter((item): item is VisualPrototype => Boolean(item))
        .sort((a, b) => b.weight - a.weight || b.support - a.support)
}

function styleReasonWeight(feedback: RecommendationFeedbackState) {
    if (feedback.sentiment === 'like')
        return feedback.reasons.includes('style') ? 2.5 : 1.5
    if (feedback.reasons.includes('already_seen')) return 0
    if (feedback.reasons.includes('topic')) return 0
    if (feedback.reasons.includes('author')) return 0
    if (feedback.reasons.includes('character')) return 0
    return feedback.reasons.includes('style') ? 1.5 : 0.25
}

export function buildVisualPreferenceProfile(input: {
    embeddings: VisualEmbeddingRecord[]
    favoriteComicIds: Set<string>
    feedback: RecommendationFeedbackState[]
    catalogSize?: number
    now?: Date
}): VisualPreferenceProfile | null {
    const preferred = selectPreferredVisualEmbeddings(input.embeddings)
    const feedbackByComic = new Map(input.feedback.map((item) => [item.comicId, item]))
    const positives: VisualPrototypeEvidence[] = []
    const negatives: VisualPrototypeEvidence[] = []
    let favoriteEmbeddingCount = 0
    for (const comicId of [...input.favoriteComicIds].sort()) {
        const embedding = preferred.get(comicId)
        if (!embedding) continue
        favoriteEmbeddingCount += 1
        positives.push({ comicId, vector: embedding.vector, weight: 1 })
    }
    let explicitLikeCount = 0
    let explicitDislikeCount = 0
    for (const feedback of [...feedbackByComic.values()].sort((a, b) =>
        a.comicId.localeCompare(b.comicId)
    )) {
        const embedding = preferred.get(feedback.comicId)
        if (!embedding) continue
        const weight = styleReasonWeight(feedback)
        if (feedback.sentiment === 'like') {
            explicitLikeCount += 1
            positives.push({
                comicId: feedback.comicId,
                vector: embedding.vector,
                weight
            })
        } else {
            explicitDislikeCount += 1
            if (weight > 0)
                negatives.push({
                    comicId: feedback.comicId,
                    vector: embedding.vector,
                    weight
                })
        }
    }
    if (!positives.length) return null
    const uniquePositive = new Map<string, VisualPrototypeEvidence>()
    for (const row of positives) {
        const previous = uniquePositive.get(row.comicId)
        uniquePositive.set(row.comicId, {
            ...row,
            weight: Math.max(previous?.weight ?? 0, row.weight)
        })
    }
    const uniqueNegative = new Map<string, VisualPrototypeEvidence>()
    for (const row of negatives) {
        const previous = uniqueNegative.get(row.comicId)
        uniqueNegative.set(row.comicId, {
            ...row,
            weight: Math.max(previous?.weight ?? 0, row.weight)
        })
    }
    const catalogSize = Math.max(1, input.catalogSize ?? input.favoriteComicIds.size)
    return {
        version: VISUAL_PROFILE_VERSION,
        modelId: VISUAL_MODEL_ID,
        modelVersion: VISUAL_MODEL_VERSION,
        generatedAt: (input.now ?? new Date()).toISOString(),
        positivePrototypes: buildVisualPrototypes([...uniquePositive.values()], 5),
        negativePrototypes: buildVisualPrototypes([...uniqueNegative.values()], 3),
        positiveEvidenceCount: uniquePositive.size,
        negativeEvidenceCount: uniqueNegative.size,
        favoriteEmbeddingCount,
        explicitLikeCount,
        explicitDislikeCount,
        coverage: clamp(uniquePositive.size / catalogSize)
    }
}

export function visualAffinity(
    embedding: VisualEmbeddingRecord,
    profile: VisualPreferenceProfile
) {
    const vector = normalizeVector(embedding.vector)
    const positiveSimilarity = profile.positivePrototypes.length
        ? Math.max(
              ...profile.positivePrototypes.map((prototype) =>
                  cosineSimilarity(vector, prototype.vector)
              )
          )
        : 0
    const negativeSimilarity = profile.negativePrototypes.length
        ? Math.max(
              ...profile.negativePrototypes.map((prototype) =>
                  cosineSimilarity(vector, prototype.vector)
              )
          )
        : 0
    const positive = clamp((positiveSimilarity + 1) / 2)
    const negative = clamp((negativeSimilarity + 1) / 2)
    const negativePenalty = profile.negativePrototypes.length
        ? Math.max(0, negative - 0.55) * 0.65
        : 0
    return {
        positiveSimilarity,
        negativeSimilarity,
        affinity: clamp(positive - negativePenalty)
    }
}

export function visualSourceWeight(
    source: VisualSourceKind,
    confidence: number,
    strength: VisualInfluenceStrength = 'LIGHT'
) {
    const maximum =
        strength === 'STRONG'
            ? source === 'LOCAL_PAGES'
                ? 0.3
                : source === 'REMOTE_PAGES'
                  ? 0.26
                  : 0.07
            : strength === 'STANDARD'
              ? source === 'LOCAL_PAGES'
                  ? 0.2
                  : source === 'REMOTE_PAGES'
                    ? 0.17
                    : 0.05
              : source === 'LOCAL_PAGES'
                ? 0.1
                : source === 'REMOTE_PAGES'
                  ? 0.08
                  : 0.03
    return maximum * clamp(confidence)
}

function percentileMap(rows: Array<{ id: string; value: number }>) {
    const sorted = [...rows].sort(
        (a, b) => b.value - a.value || a.id.localeCompare(b.id)
    )
    const denominator = Math.max(1, sorted.length - 1)
    return new Map(
        sorted.map((row, index) => [row.id, 1 - index / denominator] as const)
    )
}

export function rerankWithVisualStyle(input: {
    ranked: RankedCandidateWithEvidenceV3[]
    embeddings: VisualEmbeddingRecord[]
    profile: VisualPreferenceProfile | null
    mode: VisualRerankMode
    strength?: VisualInfluenceStrength
}): VisualRerankedCandidate[] {
    const baseline = input.ranked.map((candidate, index) => ({
        candidate,
        baselineIndex: index,
        baselinePercentile:
            input.ranked.length <= 1 ? 1 : 1 - index / (input.ranked.length - 1)
    }))
    if (input.mode === 'OFF' || !input.profile) return baseline.map((item) => item.candidate)
    const preferred = new Map<string, VisualEmbeddingRecord>()
    for (const embedding of input.embeddings) {
        if (
            embedding.modelId !== input.profile.modelId ||
            embedding.modelVersion !== input.profile.modelVersion
        )
            continue
        const previous = preferred.get(embedding.comicId)
        if (!previous || (previous.embeddingKind === 'cover' && embedding.embeddingKind === 'body'))
            preferred.set(embedding.comicId, embedding)
    }
    const computed = baseline.map((row) => {
        const embedding = preferred.get(row.candidate.comicId)
        if (!embedding)
            return {
                ...row,
                embedding: null,
                affinity: row.baselinePercentile,
                positiveSimilarity: 0,
                negativeSimilarity: 0
            }
        const value = visualAffinity(embedding, input.profile!)
        return { ...row, embedding, ...value }
    })
    const visualPercentiles = percentileMap(
        computed
            .filter((row) => row.embedding)
            .map((row) => ({ id: row.candidate.comicId, value: row.affinity }))
    )
    const signaled = computed.map((row) => {
        const visualPercentile = row.embedding
            ? (visualPercentiles.get(row.candidate.comicId) ?? row.baselinePercentile)
            : row.baselinePercentile
        const weight = row.embedding
            ? visualSourceWeight(
                  row.embedding.sourceKind,
                  row.embedding.confidence,
                  input.strength ?? 'LIGHT'
              )
            : 0
        const shadowScore =
            row.baselinePercentile * (1 - weight) + visualPercentile * weight
        return {
            ...row,
            visualPercentile,
            appliedWeight: weight,
            shadowScore
        }
    })
    const shadowOrder = [...signaled].sort(
        (a, b) =>
            b.shadowScore - a.shadowScore ||
            a.baselineIndex - b.baselineIndex ||
            a.candidate.comicId.localeCompare(b.candidate.comicId)
    )
    const shadowRank = new Map(
        shadowOrder.map((row, index) => [row.candidate.comicId, index + 1] as const)
    )
    const output = signaled.map((row): VisualRerankedCandidate => ({
        ...row.candidate,
        visual: {
            available: Boolean(row.embedding),
            sourceKind: row.embedding?.sourceKind,
            embeddingConfidence: row.embedding?.confidence ?? 0,
            positiveSimilarity: row.positiveSimilarity,
            negativeSimilarity: row.negativeSimilarity,
            affinity: row.affinity,
            visualPercentile: row.visualPercentile,
            baselinePercentile: row.baselinePercentile,
            appliedWeight: row.appliedWeight,
            shadowScore: row.shadowScore,
            shadowRank: shadowRank.get(row.candidate.comicId) ?? null,
            live: input.mode === 'LIVE'
        }
    }))
    return input.mode === 'LIVE'
        ? output.sort(
              (a, b) =>
                  (a.visual?.shadowRank ?? Number.MAX_SAFE_INTEGER) -
                      (b.visual?.shadowRank ?? Number.MAX_SAFE_INTEGER) ||
                  a.rawRank - b.rawRank
          )
        : output
}

export function metadataFeedbackAdjustment(input: {
    candidate: { comicId: string; author?: string; canonicalAuthor?: string | null; circle?: string | null; tags?: string[]; categories?: string[] }
    feedback: RecommendationFeedbackState[]
    catalogById: Map<string, { author?: string; canonicalAuthor?: string | null; circle?: string | null; tags?: string[]; categories?: string[] }>
}) {
    const normalize = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('und')
    const candidateAuthor = normalize(input.candidate.canonicalAuthor ?? input.candidate.author)
    const candidateCircle = normalize(input.candidate.circle)
    const candidateTags = new Set((input.candidate.tags ?? []).map(normalize).filter(Boolean))
    const candidateCategories = new Set((input.candidate.categories ?? []).map(normalize).filter(Boolean))
    let score = 0
    for (const feedback of input.feedback) {
        const source = input.catalogById.get(feedback.comicId)
        if (!source || feedback.comicId === input.candidate.comicId) continue
        const reasons = new Set(feedback.reasons)
        if (reasons.has('style') && reasons.size === 1) continue
        const hasTasteReason = ['style', 'topic', 'author', 'character'].some(
            (reason) => reasons.has(reason)
        )
        if (
            !hasTasteReason &&
            ['already_seen', 'already_owned', 'duplicate', 'repetitive', 'temporary'].some(
                (reason) => reasons.has(reason)
            )
        )
            continue
        const sign = feedback.sentiment === 'like' ? 1 : -1
        const strength = feedback.sentiment === 'like' ? 0.03 : 0.04
        const sourceAuthor = normalize(source.canonicalAuthor ?? source.author)
        const sourceCircle = normalize(source.circle)
        if (candidateAuthor && sourceAuthor && candidateAuthor === sourceAuthor && !reasons.has('topic'))
            score += sign * strength * (reasons.has('author') ? 2 : 1)
        if (candidateCircle && sourceCircle && candidateCircle === sourceCircle)
            score += sign * strength * 0.5
        const sourceTags = new Set((source.tags ?? []).map(normalize).filter(Boolean))
        const sourceCategories = new Set((source.categories ?? []).map(normalize).filter(Boolean))
        const tagOverlap = [...candidateTags].filter((tag) => sourceTags.has(tag)).length
        const categoryOverlap = [...candidateCategories].filter((category) => sourceCategories.has(category)).length
        const topicMultiplier = reasons.has('topic') ? 2 : 1
        score += sign * Math.min(0.06, tagOverlap * 0.01 * topicMultiplier)
        score += sign * Math.min(0.025, categoryOverlap * 0.0125 * topicMultiplier)
    }
    return Math.max(-0.2, Math.min(0.15, score))
}
