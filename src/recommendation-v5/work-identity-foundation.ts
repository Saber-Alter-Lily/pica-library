import type { StoredComic } from '../library/types'
import type { PortablePolicyStateV5 } from './portable-policy'
import {
    normalizePreferenceKey,
    workIdentityKeys
} from './portable-policy'
import {
    WORK_IDENTITY_V3_RESOLVER_VERSION,
    workIdentityCreatorBucketKeysV3,
    workIdentityDetailEvidenceV3
} from './work-identity-v3'

export const WORK_IDENTITY_RESOLVER_VERSION =
    WORK_IDENTITY_V3_RESOLVER_VERSION

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
        titleMatch: 'STRICT' | 'LOOSE' | 'FUZZY' | 'NONE'
        titleAliasMatch: boolean
        authorMatch: boolean
        authorIdentityMatch: 'CANONICAL_ID' | 'ALIAS' | 'NONE'
        titleSimilarity: number
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

function auditCandidate(
    left: StoredComic,
    right: StoredComic,
    selected: Map<string, WorkIdentityAuditCandidateV5>,
    state: PortablePolicyStateV5
): WorkIdentityAuditCandidateV5 | null {
    if (left.comicId === right.comicId) return null
    const key = stablePair(left.comicId, right.comicId)
    if (selected.has(key)) return null
    const pair = [left.comicId, right.comicId]
        .map(normalizePreferenceKey)
        .sort()
        .join('\u0000')
    if (state.explicitDistinctPairs.includes(pair)) return null
    const identity = workIdentityDetailEvidenceV3(left, right)
    if (identity.relation !== 'HIGH_CONFIDENCE_WORK') return null
    const a = workIdentityKeys(left)
    const b = workIdentityKeys(right)
    const leftProvider = providerId(left)
    const rightProvider = providerId(right)
    return {
        pairKey: key,
        leftComicId: left.comicId,
        rightComicId: right.comicId,
        leftTitle: left.title,
        rightTitle: right.title,
        author: left.canonicalAuthor || left.author || '',
        leftProvider,
        rightProvider,
        crossProvider: leftProvider !== rightProvider,
        relation: 'PROBABLE_SAME_WORK' as const,
        confidence: identity.confidence,
        evidence: {
            titleMatch:
                identity.titleMatch === 'CORE'
                    ? ('LOOSE' as const)
                    : identity.titleMatch,
            titleAliasMatch: identity.titleMatch !== 'NONE',
            authorMatch: identity.creatorMatch,
            authorIdentityMatch: identity.creatorMatchKind,
            titleSimilarity: identity.titleSimilarity,
            pageCountCompatible: identity.pageCountCompatible,
            leftPages: a.pages,
            rightPages: b.pages
        },
        resolverVersion: WORK_IDENTITY_RESOLVER_VERSION
    }
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
            const candidate = auditCandidate(
                bucket[leftIndex],
                bucket[rightIndex],
                selected,
                state
            )
            if (candidate) selected.set(candidate.pairKey, candidate)
        }
    }
}

function auditResult(
    catalog: StoredComic[],
    selected: Map<string, WorkIdentityAuditCandidateV5>,
    limit: number
) {
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

function addToAuditBuckets(
    comic: StoredComic,
    creatorBuckets: Map<string, StoredComic[]>,
    titleFallbackBuckets: Map<string, StoredComic[]>
) {
    const creatorKeys = workIdentityCreatorBucketKeysV3(comic)
    for (const creator of creatorKeys)
        creatorBuckets.set(creator, [
            ...(creatorBuckets.get(creator) || []),
            comic
        ])

    // Exact/core title buckets are retained only as the author-uncertain
    // fallback. Fuzzy title matching never scans the whole catalog.
    const keys = workIdentityKeys(comic)
    for (const title of new Set([
        ...keys.strictTitles,
        ...keys.looseTitles
    ])) {
        const bucketKey = `title:${title}`
        titleFallbackBuckets.set(bucketKey, [
            ...(titleFallbackBuckets.get(bucketKey) || []),
            comic
        ])
    }
}

function candidateAuditBuckets(
    creatorBuckets: Map<string, StoredComic[]>,
    titleFallbackBuckets: Map<string, StoredComic[]>
) {
    return [
        ...creatorBuckets.values(),
        ...titleFallbackBuckets.values()
    ]
        .filter((items) => items.length > 1)
        .sort((a, b) => b.length - a.length)
}

export function buildWorkIdentityAuditV5(
    catalog: StoredComic[],
    state: PortablePolicyStateV5,
    requestedLimit = 200
) {
    const limit = Math.max(1, Math.min(1000, Math.floor(requestedLimit)))
    const creatorBuckets = new Map<string, StoredComic[]>()
    const titleFallbackBuckets = new Map<string, StoredComic[]>()

    for (const comic of catalog)
        addToAuditBuckets(comic, creatorBuckets, titleFallbackBuckets)

    const selected = new Map<string, WorkIdentityAuditCandidateV5>()
    const candidateBuckets = candidateAuditBuckets(
        creatorBuckets,
        titleFallbackBuckets
    )

    for (const bucket of candidateBuckets) {
        addPairs(bucket, selected, state, limit)
        if (selected.size >= limit) break
    }

    return auditResult(catalog, selected, limit)
}

export interface WorkIdentityAuditProgressV5 {
    phase: 'bucketing' | 'comparing'
    done: number
    total: number
    candidateCount: number
    pairChecks: number
}

export async function buildWorkIdentityAuditAsyncV5(
    catalog: StoredComic[],
    state: PortablePolicyStateV5,
    requestedLimit = 200,
    options: {
        checkpoint?: () => Promise<void>
        onProgress?: (progress: WorkIdentityAuditProgressV5) => void
        yieldEvery?: number
    } = {}
) {
    const limit = Math.max(1, Math.min(1000, Math.floor(requestedLimit)))
    const yieldEvery = Math.max(
        1,
        Math.min(2000, Math.floor(options.yieldEvery ?? 250))
    )
    const creatorBuckets = new Map<string, StoredComic[]>()
    const titleFallbackBuckets = new Map<string, StoredComic[]>()
    let pairChecks = 0

    for (let index = 0; index < catalog.length; index++) {
        addToAuditBuckets(
            catalog[index],
            creatorBuckets,
            titleFallbackBuckets
        )
        if ((index + 1) % yieldEvery === 0 || index + 1 === catalog.length) {
            await options.checkpoint?.()
            options.onProgress?.({
                phase: 'bucketing',
                done: index + 1,
                total: catalog.length,
                candidateCount: 0,
                pairChecks
            })
            await new Promise<void>((resolve) => setTimeout(resolve, 0))
        }
    }

    const candidateBuckets = candidateAuditBuckets(
        creatorBuckets,
        titleFallbackBuckets
    )
    const selected = new Map<string, WorkIdentityAuditCandidateV5>()

    for (
        let bucketIndex = 0;
        bucketIndex < candidateBuckets.length;
        bucketIndex++
    ) {
        const bucket = candidateBuckets[bucketIndex]
        for (let leftIndex = 0; leftIndex < bucket.length; leftIndex++) {
            for (
                let rightIndex = leftIndex + 1;
                rightIndex < bucket.length;
                rightIndex++
            ) {
                if (selected.size >= limit) break
                const candidate = auditCandidate(
                    bucket[leftIndex],
                    bucket[rightIndex],
                    selected,
                    state
                )
                pairChecks++
                if (candidate) selected.set(candidate.pairKey, candidate)
                if (pairChecks % yieldEvery === 0) {
                    await options.checkpoint?.()
                    options.onProgress?.({
                        phase: 'comparing',
                        done: bucketIndex,
                        total: candidateBuckets.length,
                        candidateCount: selected.size,
                        pairChecks
                    })
                    await new Promise<void>((resolve) =>
                        setTimeout(resolve, 0)
                    )
                }
            }
            if (selected.size >= limit) break
        }
        await options.checkpoint?.()
        options.onProgress?.({
            phase: 'comparing',
            done: bucketIndex + 1,
            total: candidateBuckets.length,
            candidateCount: selected.size,
            pairChecks
        })
        if (selected.size >= limit) break
    }

    return auditResult(catalog, selected, limit)
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


export const WORK_IDENTITY_MATERIALIZATION_PLAN_VERSION =
    'work-materialization-plan-v1'

export interface WorkIdentityExistingBindingV5 {
    comicId: string
    workId: string
    editionId?: string | null
    bindingStatus?: string
    confidence?: number
    resolverVersion?: string
}

function stablePlanToken(value: string) {
    let hash = 2166136261
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
}

function preferredWorkTitle(comics: StoredComic[]) {
    return [...comics]
        .sort(
            (a, b) =>
                normalizePreferenceKey(a.title).length -
                    normalizePreferenceKey(b.title).length ||
                normalizePreferenceKey(a.title).localeCompare(
                    normalizePreferenceKey(b.title)
                ) ||
                a.comicId.localeCompare(b.comicId)
        )[0]?.title ?? ''
}

export function buildWorkIdentityMaterializationPlanV5(
    catalog: StoredComic[],
    decisions: WorkIdentityDecisionInputV5[],
    existingBindings: WorkIdentityExistingBindingV5[] = []
) {
    const preview = buildWorkIdentityMaterializationPreviewV5(
        catalog,
        decisions
    )
    const catalogById = new Map(catalog.map((comic) => [comic.comicId, comic]))
    const bindingsByComic = new Map(
        existingBindings.map((binding) => [binding.comicId, binding])
    )
    const bindingsByWork = new Map<string, WorkIdentityExistingBindingV5[]>()
    for (const binding of existingBindings) {
        bindingsByWork.set(binding.workId, [
            ...(bindingsByWork.get(binding.workId) || []),
            binding
        ])
    }
    const normalizedDecisions = decisions
        .map((item) => ({
            leftComicId: String(item.leftComicId ?? '').trim(),
            rightComicId: String(item.rightComicId ?? '').trim(),
            decision: String(item.decision ?? '').trim()
        }))
        .filter(
            (item) =>
                item.leftComicId &&
                item.rightComicId &&
                item.leftComicId !== item.rightComicId &&
                ['SAME_WORK', 'EDITION_VARIANT', 'KEEP_SEPARATE'].includes(
                    item.decision
                )
        )

    const groups = preview.groups.map((previewGroup) => {
        const memberSet = new Set(previewGroup.comicIds)
        const comics = previewGroup.comicIds
            .map((id) => catalogById.get(id))
            .filter((comic): comic is StoredComic => Boolean(comic))
        const groupDecisions = normalizedDecisions.filter(
            (item) =>
                memberSet.has(item.leftComicId) &&
                memberSet.has(item.rightComicId)
        )
        const groupBindings = previewGroup.comicIds
            .map((id) => bindingsByComic.get(id))
            .filter(
                (
                    binding
                ): binding is WorkIdentityExistingBindingV5 =>
                    Boolean(binding)
            )
        const existingWorkIds = [
            ...new Set(groupBindings.map((binding) => binding.workId))
        ].sort()
        const authors = [
            ...new Set(
                comics
                    .map((comic) =>
                        normalizePreferenceKey(
                            comic.canonicalAuthor ?? comic.author
                        )
                    )
                    .filter(Boolean)
            )
        ].sort()

        const blockers: Array<{
            type: string
            detail: string
        }> = previewGroup.conflicts.map((conflict) => ({
            type: conflict.type,
            detail: `${conflict.leftComicId} <> ${conflict.rightComicId}`
        }))
        const warnings: Array<{
            type: string
            detail: string
        }> = []

        if (authors.length > 1)
            blockers.push({
                type: 'AUTHOR_CONFLICT',
                detail: authors.join(' <> ')
            })
        if (existingWorkIds.length > 1)
            blockers.push({
                type: 'EXISTING_WORK_SPLIT',
                detail: existingWorkIds.join(' <> ')
            })

        const existingWorkId =
            existingWorkIds.length === 1 ? existingWorkIds[0] : null
        if (existingWorkId) {
            const external = (bindingsByWork.get(existingWorkId) || [])
                .map((binding) => binding.comicId)
                .filter((comicId) => !memberSet.has(comicId))
                .sort()
            if (external.length)
                warnings.push({
                    type: 'EXISTING_WORK_HAS_EXTERNAL_MEMBERS',
                    detail: external.join(', ')
                })
        }

        const editionParent = new Map<string, string>()
        const ensureEdition = (id: string) => {
            if (!editionParent.has(id)) editionParent.set(id, id)
        }
        const findEdition = (id: string): string => {
            ensureEdition(id)
            const current = editionParent.get(id)!
            if (current === id) return id
            const root = findEdition(current)
            editionParent.set(id, root)
            return root
        }
        const unionEdition = (left: string, right: string) => {
            const a = findEdition(left)
            const b = findEdition(right)
            if (a === b) return
            const [keep, move] = [a, b].sort()
            editionParent.set(move, keep)
        }
        for (const comicId of previewGroup.comicIds) ensureEdition(comicId)
        for (const item of groupDecisions)
            if (item.decision === 'SAME_WORK')
                unionEdition(item.leftComicId, item.rightComicId)

        const editionClusters = new Map<string, string[]>()
        for (const comicId of previewGroup.comicIds) {
            const root = findEdition(comicId)
            editionClusters.set(root, [
                ...(editionClusters.get(root) || []),
                comicId
            ])
        }
        const clusterByComic = new Map<string, string>()
        for (const [root, ids] of editionClusters)
            for (const id of ids) clusterByComic.set(id, root)

        const variantPairs = new Set<string>()
        for (const item of groupDecisions) {
            if (item.decision !== 'EDITION_VARIANT') continue
            const leftCluster = clusterByComic.get(item.leftComicId)!
            const rightCluster = clusterByComic.get(item.rightComicId)!
            if (leftCluster === rightCluster) {
                blockers.push({
                    type: 'EDITION_CONSTRAINT_CONFLICT',
                    detail: `${item.leftComicId} and ${item.rightComicId} are both SAME_WORK-connected and EDITION_VARIANT`
                })
                continue
            }
            variantPairs.add(
                [leftCluster, rightCluster].sort().join('\u0000')
            )
        }

        const clusterRoots = [...editionClusters.keys()].sort()
        const possibleClusterPairs =
            (clusterRoots.length * (clusterRoots.length - 1)) / 2
        const editionPartitionUnderdetermined =
            clusterRoots.length > 1 &&
            variantPairs.size < possibleClusterPairs
        if (editionPartitionUnderdetermined)
            warnings.push({
                type: 'EDITION_PARTITION_UNDERDETERMINED',
                detail: `${variantPairs.size}/${possibleClusterPairs} edition-separation constraints are explicit`
            })

        for (const ids of editionClusters.values()) {
            const existingEditionIds = [
                ...new Set(
                    ids
                        .map((id) => bindingsByComic.get(id)?.editionId)
                        .filter((id): id is string => Boolean(id))
                )
            ].sort()
            if (existingEditionIds.length > 1)
                blockers.push({
                    type: 'EXISTING_EDITION_SPLIT_WITHIN_SAME_WORK_DECISION',
                    detail: `${ids.join(', ')} => ${existingEditionIds.join(' <> ')}`
                })
        }
        for (const item of groupDecisions) {
            if (item.decision !== 'EDITION_VARIANT') continue
            const leftEdition = bindingsByComic.get(item.leftComicId)?.editionId
            const rightEdition =
                bindingsByComic.get(item.rightComicId)?.editionId
            if (
                leftEdition &&
                rightEdition &&
                leftEdition === rightEdition
            )
                blockers.push({
                    type: 'EXISTING_EDITION_CONTRADICTS_VARIANT',
                    detail: `${item.leftComicId} and ${item.rightComicId} are both bound to ${leftEdition}`
                })
        }

        const preferredTitle = preferredWorkTitle(comics)
        const workId =
            existingWorkId ||
            `plan-work-${stablePlanToken(
                previewGroup.comicIds.join('|')
            )}`
        const shouldPlanEditions =
            variantPairs.size > 0 ||
            groupBindings.some((binding) => Boolean(binding.editionId))
        const editionBindingReady =
            blockers.length === 0 &&
            shouldPlanEditions &&
            !editionPartitionUnderdetermined

        const editionPlans = clusterRoots.map((root) => {
            const comicIds = [...(editionClusters.get(root) || [])].sort()
            const existingEditionIds = [
                ...new Set(
                    comicIds
                        .map((id) => bindingsByComic.get(id)?.editionId)
                        .filter((id): id is string => Boolean(id))
                )
            ].sort()
            return {
                planEditionKey: `edition-plan-${stablePlanToken(
                    `${workId}|${comicIds.join('|')}`
                )}`,
                comicIds,
                action:
                    existingEditionIds.length === 1
                        ? ('REUSE_EXISTING_EDITION' as const)
                        : shouldPlanEditions
                          ? ('CREATE_EDITION' as const)
                          : ('NO_EDITION_REQUIRED' as const),
                existingEditionId:
                    existingEditionIds.length === 1
                        ? existingEditionIds[0]
                        : null,
                plannedEditionId:
                    editionBindingReady && existingEditionIds.length === 0
                        ? `plan-edition-${stablePlanToken(
                              `${workId}|${comicIds.join('|')}`
                          )}`
                        : existingEditionIds.length === 1
                          ? existingEditionIds[0]
                          : null,
                editionKind: 'UNKNOWN' as const,
                language: null,
                label: '',
                readyForBinding:
                    blockers.length === 0 &&
                    (!shouldPlanEditions || editionBindingReady)
            }
        })
        const plannedEditionByComic = new Map<string, string | null>()
        for (const edition of editionPlans)
            for (const comicId of edition.comicIds)
                plannedEditionByComic.set(
                    comicId,
                    edition.plannedEditionId
                )

        const uploadBindings = previewGroup.comicIds.map((comicId) => {
            const existing = bindingsByComic.get(comicId)
            const plannedEditionId =
                plannedEditionByComic.get(comicId) ?? null
            const sameWork = existing?.workId === workId
            const sameEdition =
                (existing?.editionId ?? null) === plannedEditionId
            let action:
                | 'CREATE_BINDING'
                | 'NOOP'
                | 'UPDATE_EDITION'
                | 'MOVE_BINDING'
                | 'BLOCKED'
            if (blockers.length) action = 'BLOCKED'
            else if (!existing) action = 'CREATE_BINDING'
            else if (!sameWork) action = 'MOVE_BINDING'
            else if (!sameEdition && editionBindingReady)
                action = 'UPDATE_EDITION'
            else action = 'NOOP'
            return {
                comicId,
                action,
                plannedWorkId: workId,
                plannedEditionId:
                    editionBindingReady ? plannedEditionId : null,
                rollback: existing
                    ? {
                          workId: existing.workId,
                          editionId: existing.editionId ?? null,
                          bindingStatus:
                              existing.bindingStatus ?? 'UNKNOWN',
                          confidence: existing.confidence ?? 0,
                          resolverVersion:
                              existing.resolverVersion ?? ''
                      }
                    : null
            }
        })

        return {
            planWorkKey: `work-plan-${stablePlanToken(
                previewGroup.comicIds.join('|')
            )}`,
            sourcePreviewWorkKey: previewGroup.previewWorkKey,
            comicIds: previewGroup.comicIds,
            preferredTitle,
            normalizedTitle: normalizePreferenceKey(preferredTitle),
            canonicalAuthorKey: authors.length === 1 ? authors[0] : '',
            workAction: existingWorkId
                ? ('REUSE_EXISTING_WORK' as const)
                : ('CREATE_WORK' as const),
            plannedWorkId: workId,
            blockers,
            warnings,
            shouldPlanEditions,
            editionBindingReady,
            editionPlans,
            uploadBindings,
            readyForWorkBinding: blockers.length === 0,
            readyForFullBinding:
                blockers.length === 0 &&
                (!shouldPlanEditions || editionBindingReady)
        }
    })

    const readyForWorkBinding = groups.filter(
        (group) => group.readyForWorkBinding
    )
    const readyForFullBinding = groups.filter(
        (group) => group.readyForFullBinding
    )

    return {
        mode: 'DRY_RUN' as const,
        planVersion: WORK_IDENTITY_MATERIALIZATION_PLAN_VERSION,
        automaticBinding: false,
        writeEnabled: false,
        generatedFrom: {
            catalogComicCount: catalog.length,
            decisionCount: normalizedDecisions.length,
            existingBindingCount: existingBindings.length
        },
        summary: {
            workGroupCount: groups.length,
            workReadyCount: readyForWorkBinding.length,
            fullBindingReadyCount: readyForFullBinding.length,
            blockedGroupCount: groups.length - readyForWorkBinding.length,
            warningCount: groups.reduce(
                (sum, group) => sum + group.warnings.length,
                0
            ),
            blockerCount: groups.reduce(
                (sum, group) => sum + group.blockers.length,
                0
            ),
            createWorkCount: readyForWorkBinding.filter(
                (group) => group.workAction === 'CREATE_WORK'
            ).length,
            reuseWorkCount: readyForWorkBinding.filter(
                (group) => group.workAction === 'REUSE_EXISTING_WORK'
            ).length,
            proposedUploadBindingCount: readyForWorkBinding.reduce(
                (sum, group) =>
                    sum +
                    group.uploadBindings.filter(
                        (binding) => binding.action !== 'NOOP'
                    ).length,
                0
            )
        },
        groups
    }
}
