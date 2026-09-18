import type {
    FavoriteRecord,
    StoredComic
} from '../library/types'
import type {
    ShadowRetrievedCandidateV5
} from './shadow-retrieval'
import type { PortablePolicyStateV5 } from './portable-policy'
import {
    buildOwnedCatalogV5,
    isAlreadyOwnedWorkV5,
    isTemporarilySuppressedV5,
    matchesControlV5,
    normalizePreferenceKey,
    workIdentityEvidenceV5
} from './portable-policy'

export const CANDIDATE_HYGIENE_V5_VERSION =
    'candidate-hygiene-v1'

export type CandidateHygieneReasonV5 =
    | 'HARD_SUPPRESS'
    | 'ALREADY_SEEN'
    | 'DUPLICATE_REPORT'
    | 'TEMPORARY_SUPPRESSION'
    | 'BLOCK_CONTROL'
    | 'EXPLICIT_OWNED'
    | 'OWNED_UPLOAD'
    | 'OWNED_WORK'
    | 'DUPLICATE_UPLOAD_IN_POOL'
    | 'DUPLICATE_WORK_IN_POOL'

export interface CandidateHygieneRemovalV5 {
    comicId: string
    reason: CandidateHygieneReasonV5
    matchedComicId?: string | null
    detail?: string
}

function containsComicId(ids: Iterable<string>, comicId: string) {
    const key = normalizePreferenceKey(comicId)
    for (const value of ids)
        if (normalizePreferenceKey(value) === key) return true
    return false
}

function projectCandidateV5(
    record: FavoriteRecord,
    existing?: StoredComic
): StoredComic {
    const observedAt = existing?.lastSeenAt ?? new Date(0).toISOString()
    return {
        ...record,
        canonicalAuthor: existing?.canonicalAuthor ?? null,
        circle: existing?.circle ?? null,
        authorId: existing?.authorId ?? null,
        // Candidate hygiene must not convert a recalled result into an owned
        // object merely because its ID already exists in the local catalog.
        isFavorite: false,
        firstSeenAt:
            existing?.firstSeenAt ?? new Date(0).toISOString(),
        lastSeenAt: observedAt,
        knownEpisodes:
            existing?.knownEpisodes ??
            Math.max(1, Number(record.epsCount ?? 1) || 1),
        knownPictures:
            existing?.knownPictures ??
            Math.max(0, Number(record.pagesCount ?? 0) || 0),
        downloadedPictures: 0,
        pagesCount: Math.max(
            0,
            Number(record.pagesCount ?? existing?.pagesCount ?? 0) || 0
        ),
        inLibrary: false
    }
}

function policyBlockReason(
    comic: StoredComic,
    state: PortablePolicyStateV5,
    now: Date
): CandidateHygieneRemovalV5 | null {
    const comicId = comic.comicId
    if (containsComicId(state.hardSuppressComicIds, comicId))
        return { comicId, reason: 'HARD_SUPPRESS' }
    if (containsComicId(state.seenComicIds, comicId))
        return { comicId, reason: 'ALREADY_SEEN' }
    if (containsComicId(state.duplicateReportComicIds, comicId))
        return { comicId, reason: 'DUPLICATE_REPORT' }
    if (isTemporarilySuppressedV5(comicId, state, now))
        return { comicId, reason: 'TEMPORARY_SUPPRESSION' }

    const block = state.controls.find(
        (control) =>
            control.direction === 'BLOCK' &&
            matchesControlV5(comic, control)
    )
    if (block)
        return {
            comicId,
            reason: 'BLOCK_CONTROL',
            detail: `${block.targetType}:${block.label}`
        }
    return null
}

export function applyCandidateHygieneV5(
    candidates: ShadowRetrievedCandidateV5[],
    catalog: StoredComic[],
    state: PortablePolicyStateV5,
    now = new Date()
) {
    const catalogById = new Map(
        catalog.map((comic) => [
            normalizePreferenceKey(comic.comicId),
            comic
        ])
    )
    const owned = buildOwnedCatalogV5(catalog, state)
    const explicitOwned = new Set(
        state.ownedComicIds.map(normalizePreferenceKey)
    )
    const kept: Array<{
        candidate: ShadowRetrievedCandidateV5
        projected: StoredComic
    }> = []
    const removals: CandidateHygieneRemovalV5[] = []

    for (const candidate of candidates) {
        const comicId = candidate.comic.comicId
        const projected = projectCandidateV5(
            candidate.comic,
            catalogById.get(normalizePreferenceKey(comicId))
        )

        const blocked = policyBlockReason(projected, state, now)
        if (blocked) {
            removals.push(blocked)
            continue
        }

        if (explicitOwned.has(normalizePreferenceKey(comicId))) {
            removals.push({
                comicId,
                reason: 'EXPLICIT_OWNED',
                matchedComicId: comicId
            })
            continue
        }

        const ownership = isAlreadyOwnedWorkV5(
            projected,
            owned,
            state.explicitDistinctPairs
        )
        if (ownership.owned) {
            removals.push({
                comicId,
                reason:
                    ownership.evidence?.relation === 'EXACT_UPLOAD'
                        ? 'OWNED_UPLOAD'
                        : 'OWNED_WORK',
                matchedComicId: ownership.matchedComicId,
                detail: ownership.evidence?.reason
            })
            continue
        }

        const duplicate = kept.find((previous) => {
            const evidence = workIdentityEvidenceV5(
                projected,
                previous.projected,
                state.explicitDistinctPairs
            )
            return evidence.relation !== 'DISTINCT_OR_UNKNOWN'
        })
        if (duplicate) {
            const evidence = workIdentityEvidenceV5(
                projected,
                duplicate.projected,
                state.explicitDistinctPairs
            )
            removals.push({
                comicId,
                reason:
                    evidence.relation === 'EXACT_UPLOAD'
                        ? 'DUPLICATE_UPLOAD_IN_POOL'
                        : 'DUPLICATE_WORK_IN_POOL',
                matchedComicId: duplicate.projected.comicId,
                detail: evidence.reason
            })
            continue
        }

        kept.push({ candidate, projected })
    }

    const reasonCounts = Object.fromEntries(
        (
            [
                'HARD_SUPPRESS',
                'ALREADY_SEEN',
                'DUPLICATE_REPORT',
                'TEMPORARY_SUPPRESSION',
                'BLOCK_CONTROL',
                'EXPLICIT_OWNED',
                'OWNED_UPLOAD',
                'OWNED_WORK',
                'DUPLICATE_UPLOAD_IN_POOL',
                'DUPLICATE_WORK_IN_POOL'
            ] as CandidateHygieneReasonV5[]
        ).map((reason) => [
            reason,
            removals.filter((item) => item.reason === reason).length
        ])
    ) as Record<CandidateHygieneReasonV5, number>

    return {
        mode: 'SHADOW' as const,
        hygieneVersion: CANDIDATE_HYGIENE_V5_VERSION,
        servingImpact: false,
        tasteNegativeHardFiltered: false,
        inputCandidateCount: candidates.length,
        outputCandidateCount: kept.length,
        removedCandidateCount: removals.length,
        candidates: kept.map((item) => item.candidate),
        removals,
        telemetry: {
            reasonCounts,
            removalRate:
                candidates.length > 0
                    ? removals.length / candidates.length
                    : 0
        }
    }
}
