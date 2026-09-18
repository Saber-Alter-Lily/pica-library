import type { StoredComic } from '../library/types'
import type { PortablePolicyStateV5 } from './portable-policy'
import {
    normalizePreferenceKey,
    workIdentityEvidenceV5,
    workIdentityKeys
} from './portable-policy'

export const WORK_IDENTITY_RESOLVER_VERSION =
    'work-identity-v1-title-author-pages'

export interface WorkIdentityAuditCandidateV5 {
    pairKey: string
    leftComicId: string
    rightComicId: string
    leftTitle: string
    rightTitle: string
    author: string
    leftProvider: string
    rightProvider: string
    crossProvider: boolean
    relation: 'PROBABLE_SAME_WORK'
    confidence: number
    evidence: {
        titleMatch: 'STRICT' | 'LOOSE'
        authorMatch: true
        pageCountCompatible: boolean
        leftPages: number
        rightPages: number
    }
    resolverVersion: typeof WORK_IDENTITY_RESOLVER_VERSION
}

function providerId(comic: StoredComic) {
    if (comic.providerId) return comic.providerId
    return comic.comicId.startsWith('eh:') ? 'eh' : 'pica'
}

function stablePair(leftId: string, rightId: string) {
    return [leftId, rightId]
        .map(normalizePreferenceKey)
        .sort()
        .join('\u0000')
}

function addPairs(
    bucket: StoredComic[],
    selected: Map<string, WorkIdentityAuditCandidateV5>,
    state: PortablePolicyStateV5,
    limit: number
) {
    for (let leftIndex = 0; leftIndex < bucket.length; leftIndex++) {
        for (
            let rightIndex = leftIndex + 1;
            rightIndex < bucket.length;
            rightIndex++
        ) {
            if (selected.size >= limit) return
            const left = bucket[leftIndex]
            const right = bucket[rightIndex]
            const key = stablePair(left.comicId, right.comicId)
            if (selected.has(key)) continue
            const identity = workIdentityEvidenceV5(
                left,
                right,
                state.explicitDistinctPairs
            )
            if (identity.relation !== 'HIGH_CONFIDENCE_WORK') continue
            const a = workIdentityKeys(left)
            const b = workIdentityKeys(right)
            if (!a.author || a.author !== b.author) continue
            const strict = Boolean(
                a.strictTitle &&
                    a.strictTitle === b.strictTitle
            )
            const loose = Boolean(
                a.looseTitle &&
                    a.looseTitle === b.looseTitle
            )
            if (!strict && !loose) continue
            const pageCountCompatible =
                a.pages > 0 &&
                b.pages > 0 &&
                Math.abs(a.pages - b.pages) <=
                    Math.max(
                        4,
                        Math.ceil(Math.max(a.pages, b.pages) * 0.08)
                    )
            const leftProvider = providerId(left)
            const rightProvider = providerId(right)
            selected.set(key, {
                pairKey: key,
                leftComicId: left.comicId,
                rightComicId: right.comicId,
                leftTitle: left.title,
                rightTitle: right.title,
                author: left.canonicalAuthor || left.author || '',
                leftProvider,
                rightProvider,
                crossProvider: leftProvider !== rightProvider,
                relation: 'PROBABLE_SAME_WORK',
                confidence: strict ? 0.99 : 0.94,
                evidence: {
                    titleMatch: strict ? 'STRICT' : 'LOOSE',
                    authorMatch: true,
                    pageCountCompatible,
                    leftPages: a.pages,
                    rightPages: b.pages
                },
                resolverVersion: WORK_IDENTITY_RESOLVER_VERSION
            })
        }
    }
}

export function buildWorkIdentityAuditV5(
    catalog: StoredComic[],
    state: PortablePolicyStateV5,
    requestedLimit = 200
) {
    const limit = Math.max(1, Math.min(1000, Math.floor(requestedLimit)))
    const strictBuckets = new Map<string, StoredComic[]>()
    const looseBuckets = new Map<string, StoredComic[]>()

    for (const comic of catalog) {
        const keys = workIdentityKeys(comic)
        if (!keys.author) continue
        if (keys.strictTitle) {
            const key = keys.author + '\u0000' + keys.strictTitle
            strictBuckets.set(key, [
                ...(strictBuckets.get(key) || []),
                comic
            ])
        }
        if (keys.looseTitle) {
            const key = keys.author + '\u0000' + keys.looseTitle
            looseBuckets.set(key, [
                ...(looseBuckets.get(key) || []),
                comic
            ])
        }
    }

    const selected = new Map<string, WorkIdentityAuditCandidateV5>()
    const candidateBuckets = [
        ...strictBuckets.values(),
        ...looseBuckets.values()
    ]
        .filter((items) => items.length > 1)
        .sort((a, b) => b.length - a.length)

    for (const bucket of candidateBuckets) {
        addPairs(bucket, selected, state, limit)
        if (selected.size >= limit) break
    }

    const candidates = [...selected.values()]
        .sort(
            (a, b) =>
                Number(b.crossProvider) - Number(a.crossProvider) ||
                b.confidence - a.confidence ||
                a.pairKey.localeCompare(b.pairKey)
        )
        .slice(0, limit)

    return {
        mode: 'READ_ONLY' as const,
        resolverVersion: WORK_IDENTITY_RESOLVER_VERSION,
        scannedComicCount: catalog.length,
        candidateCount: candidates.length,
        crossProviderCandidateCount: candidates.filter(
            (item) => item.crossProvider
        ).length,
        candidates
    }
}


export type WorkIdentityHumanDecisionV5 =
    | 'SAME_WORK'
    | 'EDITION_VARIANT'
    | 'KEEP_SEPARATE'

export interface WorkIdentityDecisionInputV5 {
    leftComicId: string
    rightComicId: string
    decision: string
}

export function buildWorkIdentityMaterializationPreviewV5(
    catalog: StoredComic[],
    decisions: WorkIdentityDecisionInputV5[]
) {
    const catalogById = new Map(catalog.map((comic) => [comic.comicId, comic]))
    const normalized = decisions
        .map((item) => ({
            leftComicId: String(item.leftComicId ?? '').trim(),
            rightComicId: String(item.rightComicId ?? '').trim(),
            decision: item.decision
        }))
        .filter(
            (item) =>
                item.leftComicId &&
                item.rightComicId &&
                item.leftComicId !== item.rightComicId &&
                catalogById.has(item.leftComicId) &&
                catalogById.has(item.rightComicId) &&
                ['SAME_WORK', 'EDITION_VARIANT', 'KEEP_SEPARATE'].includes(
                    item.decision
                )
        )

    const parent = new Map<string, string>()
    const ensure = (id: string) => {
        if (!parent.has(id)) parent.set(id, id)
    }
    const find = (id: string): string => {
        ensure(id)
        const current = parent.get(id)!
        if (current === id) return id
        const root = find(current)
        parent.set(id, root)
        return root
    }
    const union = (left: string, right: string) => {
        const a = find(left)
        const b = find(right)
        if (a === b) return
        const [keep, move] = [a, b].sort()
        parent.set(move, keep)
    }

    for (const item of normalized) {
        ensure(item.leftComicId)
        ensure(item.rightComicId)
        if (item.decision !== 'KEEP_SEPARATE')
            union(item.leftComicId, item.rightComicId)
    }

    const memberIds = new Map<string, string[]>()
    for (const id of parent.keys()) {
        const root = find(id)
        memberIds.set(root, [...(memberIds.get(root) || []), id])
    }

    const acceptedEdges = normalized.filter(
        (item) => item.decision !== 'KEEP_SEPARATE'
    )
    const separateEdges = normalized.filter(
        (item) => item.decision === 'KEEP_SEPARATE'
    )

    const groups = [...memberIds.entries()]
        .map(([root, ids]) => {
            const comicIds = [...new Set(ids)].sort()
            if (comicIds.length < 2) return null
            const memberSet = new Set(comicIds)
            const groupEdges = acceptedEdges.filter(
                (item) =>
                    memberSet.has(item.leftComicId) &&
                    memberSet.has(item.rightComicId)
            )
            const conflicts = separateEdges.filter(
                (item) =>
                    memberSet.has(item.leftComicId) &&
                    memberSet.has(item.rightComicId)
            )
            const editionVariantEdges = groupEdges.filter(
                (item) => item.decision === 'EDITION_VARIANT'
            )
            return {
                previewWorkKey: `work-preview:${root}`,
                comicIds,
                titles: comicIds.map(
                    (id) => catalogById.get(id)?.title || id
                ),
                acceptedDecisionCount: groupEdges.length,
                editionVariantPairCount: editionVariantEdges.length,
                editionStatus:
                    editionVariantEdges.length > 0
                        ? ('VARIANT_RELATION_RECORDED' as const)
                        : ('UNRESOLVED' as const),
                conflicts: conflicts.map((item) => ({
                    leftComicId: item.leftComicId,
                    rightComicId: item.rightComicId,
                    type: 'KEEP_SEPARATE_INSIDE_WORK_COMPONENT' as const
                })),
                readyForBinding: conflicts.length === 0
            }
        })
        .filter(
            (
                item
            ): item is NonNullable<typeof item> => item !== null
        )
        .sort(
            (a, b) =>
                Number(a.readyForBinding) - Number(b.readyForBinding) ||
                b.comicIds.length - a.comicIds.length ||
                a.previewWorkKey.localeCompare(b.previewWorkKey)
        )

    const conflictCount = groups.reduce(
        (sum, group) => sum + group.conflicts.length,
        0
    )
    const readyGroups = groups.filter((group) => group.readyForBinding)

    return {
        mode: 'PREVIEW_ONLY' as const,
        automaticBinding: false,
        workGroupCount: groups.length,
        readyGroupCount: readyGroups.length,
        conflictCount,
        proposedUploadBindingCount: readyGroups.reduce(
            (sum, group) => sum + group.comicIds.length,
            0
        ),
        groups
    }
}
