import { randomUUID } from 'node:crypto'
import type { LibraryDatabase } from '../library/database'
import type { FinalLifetimeProfileV3 } from './final-profile'
import type { RecommendationIntentV3 } from './intent-planner-v3'
import type { RetrievalRouteV3 } from './provider-query-translator'
import type { RankedCandidateWithEvidenceV3 } from './ranker-adapter-v3'
import type { PoolReadinessV3 } from './retriever-v3'
import {
    allocateRecommendationBatchV3,
    BATCH_ALLOCATOR_VERSION,
    FINAL_BATCH_SIZE
} from './batch-allocator-v3'
import { RecommendationPolicyStoreV5 } from '../recommendation-v5/policy-store'
import { activeTemporarySuppressionsV5, filterCandidatesAgainstOwnedV5 } from '../recommendation-v5/portable-policy'
import type { SessionIntentV5 } from '../recommendation-v5/portable-policy'
import { freezeReaderRound, policyForReaderRound, readerTargetToken, type FocusHistory } from './reader-round-builder'
import { readerWorkGroups, SUBSCRIBED_AUTHORS_KEY } from './reader-round-history'
import { READER_ROUND_VERSION, readerWorkKey, type ReaderRoundPlan } from './reader-round'
import { batchAuthorKey } from './batch-freshness-v3'

export const CYCLE_COORDINATOR_VERSION = '3.4.0-reader-rounds'
export const MAX_VISIBLE_BATCHES_PER_CYCLE = 6

export interface V3CycleVersions {
    profileVersion: string
    registryVersion: string
    rankerModelVersion: string
    candidatePoolVersion: string
    allocatorVersion: string
}

export interface BuiltRecommendationCycleV3 {
    profile: FinalLifetimeProfileV3
    intents: RecommendationIntentV3[]
    routes: RetrievalRouteV3[]
    ranked: RankedCandidateWithEvidenceV3[]
    readiness: PoolReadinessV3
    telemetry: Record<string, unknown>
    versions: V3CycleVersions
}

interface FrozenCycleServingSnapshotV3 {
    poolId: string
    ownershipKey: string
    eligibleRanked: RankedCandidateWithEvidenceV3[]
    eligibleById: Map<string, RankedCandidateWithEvidenceV3>
    intents: RecommendationIntentV3[]
    favoriteIds: Set<string>
    servingFilterTelemetry: Record<string, unknown>
}

interface CoordinatorStateV3 {
    schemaVersion: 1
    activeCycleId: string | null
    buildingCycleId: string | null
    activeBatchIndex: number
    previousUsableCycleId: string | null
    buildingRequestId: string | null
    versions: V3CycleVersions
    readerRoundOrdinal?:number
    readerConsumedIntent?:string|null
    readerFocusHistory?:FocusHistory[]
}

export class CycleCoordinatorV3 {
    private readonly stateKey = 'recommendation.v3.activeCycle.v1'
    private buildPromise: Promise<void> | null = null
    private readonly mutationPromises = new Map<string, Promise<unknown>>()
    private readonly servingSnapshots = new Map<string, FrozenCycleServingSnapshotV3>()

    constructor(
        private readonly database: LibraryDatabase,
        private readonly buildCycle: (
            cycleId: string
        ) => Promise<BuiltRecommendationCycleV3>,
        private readonly versions: V3CycleVersions
    ) {}

    private state(): CoordinatorStateV3 {
        const current = this.database.getAppState<CoordinatorStateV3>(
            this.stateKey
        )
        if (current?.schemaVersion === 1) return current
        return this.saveState({
            schemaVersion: 1,
            activeCycleId: null,
            buildingCycleId: null,
            activeBatchIndex: -1,
            previousUsableCycleId: null,
            buildingRequestId: null,
            versions: this.versions
        })
    }

    private saveState(state: CoordinatorStateV3) {
        this.database.setAppState(this.stateKey, state)
        return state
    }

    private pool(cycleId: string | null) {
        return cycleId ? this.database.latestV3CandidatePool(cycleId) : null
    }

    private poolState(cycleId: string | null) {
        const state = this.pool(cycleId)?.telemetry.state
        return typeof state === 'string' ? state : null
    }

    private servingSnapshot(
        cycleId: string,
        pool = this.pool(cycleId)
    ): FrozenCycleServingSnapshotV3 {
        if (!pool) throw new Error('Active V3 candidate pool is unavailable')
        const telemetry = pool.telemetry as {
            intentPlan?: RecommendationIntentV3[]
            rankedCandidates?: Array<
                Omit<RankedCandidateWithEvidenceV3, 'comic'>
            >
        }
        const policy = new RecommendationPolicyStoreV5(this.database).state()
        const subscribed = new Set(this.database.getAppState<string[]>(SUBSCRIBED_AUTHORS_KEY) ?? [])
        const ownership = this.database.recommendationOwnershipState()
        const ownedComicIds = new Set([
            ...ownership.ownedComicIds,
            ...policy.ownedComicIds
        ])
        const ownershipKey = JSON.stringify({
            ownedComicIds: [...ownedComicIds].sort(),
            policyRevision: policy.revision,
            subscribed:[...subscribed].sort(),
            activeSuppressions: activeTemporarySuppressionsV5(policy).map(item => item.comicId).sort(),
            identityBindingsVersion: ownership.identityBindingsVersion,
            explicitDistinctPairs: [...policy.explicitDistinctPairs].sort()
        })
        const existing = this.servingSnapshots.get(cycleId)
        if (
            existing?.poolId === pool.id &&
            existing.ownershipKey === ownershipKey
        )
            return existing

        const bindings = this.database.listAllWorkIdentityBindings()
        const ownedWorkIds = new Set(
            bindings
                .filter((binding) => ownedComicIds.has(binding.comicId))
                .map((binding) => binding.workId)
        )
        const canonicalOwnedComicIds = bindings
            .filter((binding) => ownedWorkIds.has(binding.workId))
            .map((binding) => binding.comicId)
        const servingPolicy = {
            ...policy,
            ownedComicIds: [
                ...new Set([
                    ...policy.ownedComicIds,
                    ...canonicalOwnedComicIds
                ])
            ]
        }
        const rankedCandidateIds = (telemetry.rankedCandidates ?? []).map(
            (item) => item.comicId
        )
        const filterCatalog = this.database.getComicsByIds([
            ...new Set([
                ...ownership.ownedComicIds,
                ...servingPolicy.ownedComicIds,
                ...rankedCandidateIds
            ])
        ])
        const filterCatalogById = new Map(
            filterCatalog.map((comic) => [comic.comicId, comic])
        )
        const ranked = (telemetry.rankedCandidates ?? []).flatMap((item) => {
            const comic = filterCatalogById.get(item.comicId)
            return comic ? [{ ...item, comic }] : []
        })
        const serving = filterCandidatesAgainstOwnedV5(
            ranked,
            filterCatalog,
            servingPolicy
        )
        const eligibleRanked = serving.rows.filter(row=>!subscribed.has(batchAuthorKey(row.comic)??''))
        const snapshot: FrozenCycleServingSnapshotV3 = {
            poolId: pool.id,
            ownershipKey,
            eligibleRanked,
            eligibleById: new Map(
                eligibleRanked.map((item) => [item.comicId, item])
            ),
            intents: telemetry.intentPlan ?? [],
            favoriteIds: new Set(this.database.favoriteIds()),
            servingFilterTelemetry: {
                ...serving.telemetry,
                canonicalOwnedWorkCount: ownedWorkIds.size,
                canonicalOwnedUploadCount: canonicalOwnedComicIds.length
            }
        }
        this.servingSnapshots.set(cycleId, snapshot)
        while (this.servingSnapshots.size > 2) {
            const oldest = this.servingSnapshots.keys().next().value
            if (!oldest) break
            this.servingSnapshots.delete(oldest)
        }
        return snapshot
    }

    private async completeBuild(
        cycleId: string,
        requestId: string,
        previousActive: string | null
    ) {
        try {
            const built = await this.buildCycle(cycleId)
            const before=this.state()
            if(before.buildingCycleId!==cycleId)return
            if (built.readiness === 'FAILED_INSUFFICIENT_POOL')
                throw new Error(
                    'Recommendation generation did not produce a usable pool; previous recommendations were kept'
                )
            const currentPolicy=new RecommendationPolicyStoreV5(this.database).state()
            const builtIntent=(built.telemetry.recommendationV5 as {portableBaseline?:{sessionIntent?:SessionIntentV5}}|undefined)?.portableBaseline?.sessionIntent
            const policy=policyForReaderRound({...currentPolicy,sessionIntent:builtIntent??currentPolicy.sessionIntent},before.readerConsumedIntent)
            const {plan,focus}=freezeReaderRound(this.database,built.ranked,(before.readerRoundOrdinal??0)+1,policy,before.readerFocusHistory??[])
            const identity = [
                built.profile.favoriteFingerprint,
                built.profile.registryVersion,
                built.profile.profileVersion
            ].join(':')
            const profile = this.database.saveOrReuseV3Profile({
                profileKind: 'LIFETIME_V3_V1',
                evidenceCutoff: built.profile.generatedAt,
                modelVersion: built.profile.profileVersion,
                identity,
                profile: built.profile as unknown as Record<string, unknown>
            })
            this.database.saveV3CandidatePool({
                cycleId,
                candidateIds: built.ranked.map((item) => item.comicId),
                modelVersion: built.versions.candidatePoolVersion,
                telemetry: {
                    schemaVersion: 1,
                    state: built.readiness,
                    profileId: profile.id,
                    profileReused: profile.reused,
                    intentPlan: built.intents,
                    routes: built.routes,
                    rankedCandidates: built.ranked.map((item) => ({
                        comicId: item.comicId,
                        rawRank: item.rawRank,
                        score: item.score,
                        features: item.features,
                        reasons: item.reasons,
                        evidence: item.evidence,
                        feedbackAdjustment: item.feedbackAdjustment,
                        visual: (item as { visual?: unknown }).visual
                    })),
                    readerRound:plan,
                    readiness: built.readiness,
                    versions: built.versions,
                    completedAt: new Date().toISOString(),
                    buildRequestId: requestId,
                    telemetry: built.telemetry
                }
            })
            const current = this.state()
            if (current.buildingCycleId !== cycleId) return
            if (previousActive)
                this.database.updateV3CandidatePoolState(
                    previousActive,
                    'SUPERSEDED'
                )
            this.servingSnapshots.clear()
            this.saveState({
                ...current,
                activeCycleId: cycleId,
                buildingCycleId: null,
                activeBatchIndex: -1,
                previousUsableCycleId: previousActive,
                buildingRequestId: null,
                versions: built.versions,
                readerRoundOrdinal:plan.ordinal,
                readerConsumedIntent:readerTargetToken(policy.sessionIntent)??before.readerConsumedIntent,
                readerFocusHistory:focus?[...(before.readerFocusHistory??[]),focus].slice(-24):before.readerFocusHistory
            })
        } catch (error) {
            const current = this.state()
            if (current.buildingCycleId === cycleId)
                this.saveState({
                    ...current,
                    buildingCycleId: null,
                    buildingRequestId: null
                })
            throw error
        }
    }

    private startBuild(requestId: string) {
        const current = this.state()
        if (current.buildingCycleId) return this.status()
        const cycleId = randomUUID()
        const next = this.saveState({
            ...current,
            buildingCycleId: cycleId,
            buildingRequestId: requestId
        })
        this.buildPromise = this.completeBuild(
            cycleId,
            requestId,
            current.activeCycleId
        ).finally(() => {
            this.buildPromise = null
        })
        void this.buildPromise.catch(() => undefined)
        return { ...this.status(), buildingCycleId: next.buildingCycleId }
    }

    resumeOrCreate(requestId = `resume:${randomUUID()}`) {
        const current = this.state()
        if (current.activeCycleId || current.buildingCycleId)
            return this.status()
        return this.startBuild(requestId)
    }

    forceNew(requestId: string) {
        if (!requestId) throw new Error('requestId is required for force_new')
        const current = this.state()
        if (
            current.buildingRequestId === requestId ||
            this.pool(current.activeCycleId)?.telemetry.buildRequestId ===
                requestId
        )
            return this.status()
        return this.startBuild(requestId)
    }

    async waitForBuild() {
        await this.buildPromise
        return this.status()
    }

    status() {
        const state = this.state()
        const activePool = this.pool(state.activeCycleId)
        const activePoolState = this.poolState(state.activeCycleId)
        return {
            engine: 'v3' as const,
            activeCycleId: state.activeCycleId,
            buildingCycleId: state.buildingCycleId,
            activeBatchIndex: state.activeBatchIndex,
            previousUsableCycleId: state.previousUsableCycleId,
            activeCycleState: activePool
                ? state.activeBatchIndex >= 0
                    ? 'ACTIVE'
                    : activePoolState
                : null,
            buildingCycleState: state.buildingCycleId ? 'BUILDING' : null,
            poolId: activePool?.id ?? null,
            poolReadiness: activePool?.telemetry.readiness ?? null,
            versions: state.versions,
            fallbackMode: 'NONE' as const
        }
    }

    private responseForBatch(
        batch: ReturnType<LibraryDatabase['saveV3BatchAndAllocate']>
    ) {
        const state = this.state()
        const pool = this.database.getV3CandidatePool(batch.poolId)
        const snapshot = this.servingSnapshot(batch.cycleId, pool)
        const recommendations = batch.itemIds.flatMap((id) => {
            const item = snapshot.eligibleById.get(id)
            return item ? [item] : []
        })
        const exhausted = pool?.telemetry.readerRound
            ? pool.telemetry.state === 'EXHAUSTED'
            : recommendations.length === 0 || pool?.telemetry.state === 'EXHAUSTED'
        return {
            ...this.status(),
            cycleId: batch.cycleId,
            poolId: batch.poolId,
            batchId: batch.id,
            batchIndex: batch.batchIndex,
            contextId: batch.contextId,
            batchSize: FINAL_BATCH_SIZE,
            maxVisibleBatches: MAX_VISIBLE_BATCHES_PER_CYCLE,
            recommendations,
            servingFilteredCount:
                batch.itemIds.length - recommendations.length,
            servingFilterTelemetry: {
                frozenCycleSnapshot: true,
                cacheSize: snapshot.eligibleRanked.length,
                ...snapshot.servingFilterTelemetry
            },
            evidence: batch.evidence,
            exhausted,
            cycleState: exhausted ? 'EXHAUSTED' : 'ACTIVE',
            poolReadiness: pool?.telemetry.readiness ?? null,
            activeBatchIndex: state.activeBatchIndex
        }
    }

    private existingRequest(poolId: string, requestId: string) {
        return this.database
            .listV3Batches(poolId)
            .find((batch) => batch.evidence.requestId === requestId)
    }

    private allocate(requestId: string, next: boolean) {
        const state = this.state()
        if (!state.activeCycleId)
            return {
                ...this.status(),
                recommendations: [],
                cycleState: 'BUILDING'
            }
        const pool = this.pool(state.activeCycleId)
        if (!pool) throw new Error('Active V3 candidate pool is unavailable')
        const existing = next
            ? this.existingRequest(pool.id, requestId)
            : undefined
        if (existing) return this.responseForBatch(existing)
        const batches = this.database.listV3Batches(pool.id)
        const last = batches.at(-1)
        if (!next && last) return this.responseForBatch(last)
        const plan=pool.telemetry.readerRound as ReaderRoundPlan|undefined
        if(plan?.version===READER_ROUND_VERSION){
            const index=last?last.batchIndex+1:0
            if(last&&index>=plan.pages.length)return this.responseForBatch(last)
            const snapshot=this.servingSnapshot(state.activeCycleId,pool)
            const slots=plan.pages[index]??[]
            const workByComic=readerWorkGroups(this.database.listAllWorkIdentityBindings(),this.database.listAllWorkIdentityDecisions(),
                new RecommendationPolicyStoreV5(this.database).state().explicitDistinctPairs)
            const late=this.database.readerReceiptHistory([...slots.map(s=>s.comicId),...workByComic.keys()],[])
            const lateSeen=new Set(Array.from(late.shown,id=>readerWorkKey(id,workByComic)))
            const items=slots.filter(s=>snapshot.eligibleById.has(s.comicId)&&!lateSeen.has(readerWorkKey(s.comicId,workByComic)))
            const batch=this.database.saveV3BatchAndAllocate({
                poolId:pool.id,cycleId:state.activeCycleId,batchIndex:index,contextId:randomUUID(),itemIds:items.map(s=>s.comicId),
                evidence:{schemaVersion:2,allocatorVersion:READER_ROUND_VERSION,readerRoundOrdinal:plan.ordinal,requestId,
                    readerMix:{familiar:items.filter(s=>s.group==='familiar').length,unfamiliar:items.filter(s=>s.group==='unfamiliar').length,
                        matchedTarget:items.filter(s=>s.targetMatch).length,focus:plan.focus},
                    freshness:{short:items.length<FINAL_BATCH_SIZE,authorCapRelaxedSlots:0},items}
            })
            if(index+1>=plan.pages.length)this.database.updateV3CandidatePoolState(state.activeCycleId,'EXHAUSTED')
            this.saveState({...state,activeBatchIndex:index})
            return this.responseForBatch(batch)
        }
        if (
            next &&
            last &&
            (last.batchIndex >= MAX_VISIBLE_BATCHES_PER_CYCLE - 1 || last.itemIds.length < FINAL_BATCH_SIZE)
        ) {
            this.database.updateV3CandidatePoolState(
                state.activeCycleId,
                'EXHAUSTED'
            )
            return this.responseForBatch(last)
        }
        const snapshot = this.servingSnapshot(state.activeCycleId, pool)
        const freshness = this.database.recentV3BatchFreshness()
        const alreadyAllocated = new Set(this.database.recommendationSeen(state.activeCycleId))
        const allocated = allocateRecommendationBatchV3({
            ranked: snapshot.eligibleRanked,
            intents: snapshot.intents,
            alreadyAllocated,
            currentFavoriteIds: snapshot.favoriteIds,
            ...freshness
        })
        const batchIndex = last ? last.batchIndex + 1 : 0
        const batch = this.database.saveV3BatchAndAllocate({
            poolId: pool.id,
            cycleId: state.activeCycleId,
            batchIndex,
            contextId: randomUUID(),
            itemIds: allocated.map((item) => item.comicId),
            evidence: {
                schemaVersion: 1,
                allocatorVersion: BATCH_ALLOCATOR_VERSION,
                requestId,
                freshness: {
                    short: allocated.length < FINAL_BATCH_SIZE,
                    recentWorksWithheld: snapshot.eligibleRanked.filter(item =>
                        !alreadyAllocated.has(item.comicId) && !snapshot.favoriteIds.has(item.comicId) &&
                        freshness.recentlyDisplayedComicIds.has(item.comicId)).length,
                    authorCapRelaxedSlots: allocated.filter(item => item.authorLimitRelaxed).length
                },
                items: allocated
            }
        })
        if (
            allocated.length < FINAL_BATCH_SIZE ||
            batchIndex >= MAX_VISIBLE_BATCHES_PER_CYCLE - 1
        )
            this.database.updateV3CandidatePoolState(
                state.activeCycleId,
                'EXHAUSTED'
            )
        this.saveState({ ...state, activeBatchIndex: batchIndex })
        return this.responseForBatch(batch)
    }

    portable(limit = FINAL_BATCH_SIZE * MAX_VISIBLE_BATCHES_PER_CYCLE) {
        const state = this.state()
        if (!state.activeCycleId)
            return { ...this.status(), items: [], source: 'final-v3-portable-cache', cached: true }
        const pool = this.pool(state.activeCycleId)
        if (!pool)
            return { ...this.status(), items: [], source: 'final-v3-portable-cache', cached: true }
        const telemetry = pool.telemetry as { rankedCandidates?: Array<Omit<RankedCandidateWithEvidenceV3, 'comic'>> }
        const policy = new RecommendationPolicyStoreV5(this.database).state()
        const ownership = this.database.recommendationOwnershipState()
        const rankedCandidateIds = (telemetry.rankedCandidates ?? []).map(
            (item) => item.comicId
        )
        const filterCatalog = this.database.getComicsByIds([
            ...new Set([
                ...ownership.ownedComicIds,
                ...policy.ownedComicIds,
                ...rankedCandidateIds
            ])
        ])
        const byId = new Map(
            filterCatalog.map((comic) => [comic.comicId, comic])
        )
        const ranked = (telemetry.rankedCandidates ?? []).flatMap((item) => {
            const comic = byId.get(item.comicId)
            return comic ? [{ ...item, comic }] : []
        })
        const serving = filterCandidatesAgainstOwnedV5(
            ranked,
            filterCatalog,
            policy
        )
        const bounded = Math.max(1, Math.min(120, Math.floor(limit)))
        const plan=pool.telemetry.readerRound as ReaderRoundPlan|undefined
        const allowed=plan?.version===READER_ROUND_VERSION?this.servingSnapshot(state.activeCycleId,pool).eligibleById:null
        const readerPages=allowed&&plan?plan.pages.map(page=>page.map(s=>s.comicId).filter(id=>allowed.has(id))):undefined
        const buildTelemetry = pool.telemetry.telemetry as
            | {
                  recommendationV5?: {
                      portableBaseline?: unknown
                  }
              }
            | undefined
        return {
            ...this.status(),
            cycleId: state.activeCycleId,
            items:readerPages&&allowed?readerPages.flat().slice(0,bounded).map(id=>allowed.get(id)!):serving.rows.slice(0, bounded),
            ...(readerPages?{readerPages,readerRoundOrdinal:plan!.ordinal}:{}),
            policyBaseline:
                buildTelemetry?.recommendationV5?.portableBaseline ?? null,
            source: 'final-v3-portable-cache',
            cached: true,
            servingFilterTelemetry: serving.telemetry
        }
    }

    current() {
        return this.allocate('CURRENT', false)
    }

    next(requestId: string) {
        if (!requestId) throw new Error('requestId is required for next')
        const key = `NEXT:${requestId}`
        const existing = this.mutationPromises.get(key)
        if (existing) return existing
        const promise = Promise.resolve().then(() =>
            this.allocate(requestId, true)
        )
        this.mutationPromises.set(key, promise)
        void promise.finally(() => this.mutationPromises.delete(key))
        return promise
    }
}
