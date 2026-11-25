import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'
import {
    allocateRecommendationBatchV3 as allocate,
    BATCH_ALLOCATOR_VERSION
} from '../../src/recommendation-v3/batch-allocator-v3'
import {
    batchAuthorKey,
    batchFreshness,
    type PresentedBatchV3
} from '../../src/recommendation-v3/batch-freshness-v3'
import { CycleCoordinatorV3 } from '../../src/recommendation-v3/cycle-coordinator-v3'
import {
    rotateCreatorIntentsV3,
    type IntentCycleHistory,
    type RecommendationIntentV3
} from '../../src/recommendation-v3/intent-planner-v3'
import type { RankedCandidateWithEvidenceV3 } from '../../src/recommendation-v3/ranker-adapter-v3'
import { RecommendationPolicyStoreV5 } from '../../src/recommendation-v5/policy-store'

function candidate(i: number, author = 'artist-' + Math.floor(i / 4)) {
    const id = 'item-' + i
    return {
        comicId: id,
        rawRank: i + 1,
        score: 1000 - i,
        reasons: [],
        comic: {
            comicId: id,
            title: 'Unique synthetic ' + i,
            author,
            authorId: author,
            canonicalAuthor: author,
            description: '',
            categories: [],
            tags: [],
            finished: false
        },
        evidence: {
            originIntentIds: [],
            conjunctionEvidence: [],
            routeFamilies: ['CREATOR'],
            primaryFamily: 'CREATOR'
        }
    } as unknown as RankedCandidateWithEvidenceV3
}
const candidates = (n: number) =>
    Array.from({ length: n }, (_, i) => candidate(i))
const versions = {
    allocatorVersion: BATCH_ALLOCATOR_VERSION,
    profileVersion: 'fixture',
    registryVersion: 'fixture',
    rankerModelVersion: 'fixture',
    candidatePoolVersion: 'fixture'
}
const newCoordinator = (db: LibraryDatabase) =>
    new CycleCoordinatorV3(
        db,
        async () => {
            throw new Error('offline; do not generate')
        },
        versions
    )
function seed(
    db: LibraryDatabase,
    cycle: string,
    ranked: RankedCandidateWithEvidenceV3[]
) {
    db.importCatalog(
        ranked.map((r) => r.comic),
        'synthetic-test'
    )
    db.saveV3CandidatePool({
        cycleId: cycle,
        candidateIds: ranked.map((r) => r.comicId),
        telemetry: {
            state: 'READY',
            readiness: 'READY',
            intentPlan: [],
            rankedCandidates: ranked.map(({ comic: _comic, ...item }) => item)
        }
    })
    db.setAppState('recommendation.v3.activeCycle.v1', {
        schemaVersion: 1,
        activeCycleId: cycle,
        activeBatchIndex: -1,
        versions
    })
}
type Batch = {
    batchId: string
    contextId: string
    cycleId: string
    batchIndex: number
    recommendations: RankedCandidateWithEvidenceV3[]
}
const confirm = (
    db: LibraryDatabase,
    b: Batch,
    ids = b.recommendations.map((r) => r.comicId)
) =>
    db.confirmV3BatchPresentation({
        batchId: b.batchId,
        contextId: b.contextId,
        cycleId: b.cycleId,
        batchIndex: b.batchIndex,
        itemIds: ids
    })

describe('ten confirmed presentations, not ten builds or reads', () => {
    it('keeps works fresh and authors <=2 per batch and <=4 across three when supply is adequate', () => {
        const ranked = candidates(180),
            history: PresentedBatchV3[] = []
        const authors = new Map(
            ranked.map((r) => [r.comicId, r.comic.authorId!])
        )
        for (let n = 0; n < 10; n++) {
            const fresh = batchFreshness(history, authors)
            const got = allocate({
                ranked,
                intents: [],
                alreadyAllocated: new Set(),
                ...fresh
            })
            expect(got).toHaveLength(12)
            expect(
                got.some(
                    (x) =>
                        x.authorLimitRelaxed ||
                        fresh.recentlyDisplayedComicIds.has(x.comicId)
                )
            ).toBe(false)
            const counts = new Map<string, number>()
            for (const x of got) {
                const a = authors.get(x.comicId)!
                const k = (counts.get(a) ?? 0) + 1
                expect(k).toBeLessThanOrEqual(2)
                expect(
                    k + (fresh.recentAuthorCounts.get(a) ?? 0)
                ).toBeLessThanOrEqual(4)
                counts.set(a, k)
            }
            history.unshift({
                batchId: String(n),
                itemIds: got.map((x) => x.comicId)
            })
        }
        expect(new Set(history.flatMap((b) => b.itemIds)).size).toBe(120)
    })
    it('relaxes author diversity only, returns a short slate before reusing works, and does not invent unknown authors', () => {
        const ranked = Array.from({ length: 9 }, (_, i) =>
            candidate(i, 'only artist')
        )
        const out = allocate({
            ranked,
            intents: [],
            alreadyAllocated: new Set(['item-0']),
            currentFavoriteIds: new Set(['item-1']),
            recentlyDisplayedComicIds: new Set(['item-2']),
            recentAuthorCounts: new Map([['only artist', 4]])
        })
        expect(out.map((v) => v.comicId)).toEqual(
            ranked.slice(3).map((v) => v.comicId)
        )
        expect(out.every((v) => v.authorLimitRelaxed)).toBe(true)
        for (const label of ['unknown', '匿名', 'various', 'A & B', null])
            expect(
                batchAuthorKey({
                    authorId: 'identical-placeholder',
                    canonicalAuthor: label
                })
            ).toBeNull()
    })
    it('persists one confirmed batch across refresh, portable cache, another coordinator and restart; applies new blocks immediately', async () => {
        const root = mkdtempSync(
                path.join(os.tmpdir(), 'pica-presented-test-')
            ),
            file = path.join(root, 'library.db')
        let db = new LibraryDatabase(file)
        try {
            const ranked = candidates(64)
            seed(db, 'round-one', ranked)
            let co = newCoordinator(db)
            const first = co.current() as Batch
            expect(first.recommendations).toHaveLength(12)
            co.portable()
            newCoordinator(db).current()
            expect(
                db.recentV3BatchFreshness().recentlyDisplayedComicIds.size
            ).toBe(0)
            expect(confirm(db, { ...first, contextId: 'wrong' })).toBe(false)
            expect(confirm(db, first, ['foreign-item'])).toBe(false)
            expect(confirm(db, first, [])).toBe(false)
            const shown = first.recommendations.map((x) => x.comicId)
            expect(confirm(db, first, shown)).toBe(true)
            expect(confirm(db, first, shown)).toBe(true)
            expect(
                db.recentV3BatchFreshness().recentlyDisplayedComicIds.size
            ).toBe(12)
            const next = (await co.next('tap')) as Batch
            expect(((await co.next('tap')) as Batch).batchId).toBe(next.batchId)
            expect(
                next.recommendations.some((x) => shown.includes(x.comicId))
            ).toBe(false)
            db.close()
            db = new LibraryDatabase(file)
            co = newCoordinator(db)
            expect((co.current() as Batch).batchId).toBe(next.batchId)
            expect(
                db.recentV3BatchFreshness().recentlyDisplayedComicIds.size
            ).toBe(12)
            seed(db, 'round-two', ranked)
            const rebuilt = co.current() as Batch
            expect(
                rebuilt.recommendations.some((x) => shown.includes(x.comicId))
            ).toBe(false)
            const author = rebuilt.recommendations[0].comic.canonicalAuthor!
            new RecommendationPolicyStoreV5(db).setControl({
                targetType: 'AUTHOR',
                key: author,
                label: author,
                direction: 'BLOCK',
                scope: 'PERSISTENT'
            })
            expect(
                (co.current() as Batch).recommendations.some(
                    (x) => x.comic.canonicalAuthor === author
                )
            ).toBe(false)
        } finally {
            db.close()
            rmSync(root, { recursive: true, force: true })
        }
    })
    it('an evicted batch re-opened from a stale tab never re-enters the ring; only acknowledged items count', () => {
        const root = mkdtempSync(path.join(os.tmpdir(), 'pica-ring-test-')),
            db = new LibraryDatabase(path.join(root, 'library.db'))
        try {
            const ranked = candidates(22)
            seed(db, 'old', ranked)
            const pool = db.latestV3CandidatePool('old')!
            const batches = Array.from({ length: 11 }, (_, i) =>
                db.saveV3BatchAndAllocate({
                    cycleId: 'old',
                    poolId: pool.id,
                    batchIndex: i,
                    contextId: 'ctx' + i,
                    itemIds: ['item-' + 2 * i, 'item-' + (2 * i + 1)],
                    evidence: {
                        allocatorVersion: BATCH_ALLOCATOR_VERSION,
                        requestId: 'req' + i
                    }
                })
            )
            const ack = (i: number) =>
                db.confirmV3BatchPresentation({
                    batchId: batches[i].id,
                    cycleId: 'old',
                    batchIndex: i,
                    contextId: 'ctx' + i,
                    itemIds: ['item-' + 2 * i]
                })
            for (let i = 0; i < 11; i++) expect(ack(i)).toBe(true)
            expect(ack(0)).toBe(true)
            const history = db.recentV3BatchFreshness()
            expect(history.recentlyDisplayedComicIds.size).toBe(10)
            expect(history.recentlyDisplayedComicIds.has('item-0')).toBe(false)
            expect(history.recentlyDisplayedComicIds.has('item-21')).toBe(false)
            expect(
                [...history.recentAuthorCounts.values()].reduce(
                    (a, b) => a + b,
                    0
                )
            ).toBe(2)
        } finally {
            db.close()
            rmSync(root, { recursive: true, force: true })
        }
    })
    it('validates a real desktop receipt, deduplicates across sessions, and keeps the last short batch accessible', async () => {
        const root = mkdtempSync(path.join(os.tmpdir(), 'pica-ack-api-')),
            db = new LibraryDatabase(path.join(root, 'library.db'))
        const { server, url } = await startLibraryServer({
            database: db,
            service: new LibraryService(db, root),
            host: '127.0.0.1',
            port: 0
        })
        try {
            seed(db, 'short', candidates(3))
            const post = async (route: string, body: unknown) =>
                fetch(url + route, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(body)
                })
            const batch = await (
                await post('/api/v1/recommendations', { action: 'current' })
            ).json()
            expect(batch.exhausted).toBe(true)
            expect(batch.evidence.freshness.short).toBe(true)
            expect(
                db.recentV3BatchFreshness().recentlyDisplayedComicIds.size
            ).toBe(0)
            const ids = batch.recommendations.map(
                (r: { comicId: string }) => r.comicId
            )
            const receipt = {
                eventType: 'recommend_batch_presented',
                source: 'final-v3-visible',
                recommendationCycleId: batch.cycleId,
                contextId: batch.contextId,
                recommendationBatchId: batch.batchId,
                recommendationBatchIndex: batch.batchIndex,
                metadata: { itemIds: ids },
                dedupeKey: 'caller-key'
            }
            expect(
                (
                    await post('/api/v1/recommendation-events', {
                        ...receipt,
                        contextId: 'wrong'
                    })
                ).status
            ).toBe(400)
            const a = await (
                await post('/api/v1/recommendation-events', receipt)
            ).json()
            const b = await (
                await post('/api/v1/recommendation-events', {
                    ...receipt,
                    appSessionId: 'other-client',
                    dedupeKey: 'other-key'
                })
            ).json()
            expect(a.id).toBeTruthy()
            expect(b.id).toBe(a.id)
            expect(
                db.recentV3BatchFreshness().recentlyDisplayedComicIds
            ).toEqual(new Set(ids))
            const next = await (
                await post('/api/v1/recommendations', {
                    action: 'next',
                    requestId: 'after-end'
                })
            ).json()
            expect(next.batchId).toBe(batch.batchId)
        } finally {
            await new Promise<void>((done, reject) =>
                server.close((e) => (e ? reject(e) : done()))
            )
            db.close()
            rmSync(root, { recursive: true, force: true })
        }
    })
})

describe('three actual creator search slots', () => {
    const pool = Array.from(
        { length: 35 },
        (_, i) =>
            ({
                intentId: 'c' + i,
                type: 'CREATOR',
                evidence: {
                    confidence: 'HIGH',
                    supportCount: 50 - i,
                    supportShare: (50 - i) / 100
                },
                retrieval: { providerEligible: true }
            }) as unknown as RecommendationIntentV3
    )
    it('rotates within evidence tiers, includes the active previous plan and never adds a fourth search', () => {
        const history: IntentCycleHistory[] = [],
            seen = new Set<string>()
        for (let i = 0; i < 10; i++) {
            const picked = rotateCreatorIntentsV3(pool, history).map(
                (p) => p.intentId
            )
            expect(picked).toHaveLength(3)
            expect(
                picked.slice(0, 2).every((id) => Number(id.slice(1)) < 8)
            ).toBe(true)
            expect(Number(picked[2].slice(1))).toBeGreaterThanOrEqual(8)
            expect(Number(picked[2].slice(1))).toBeLessThan(24)
            if (i === 1) expect(picked.some((id) => seen.has(id))).toBe(false)
            for (const id of picked) seen.add(id)
            history.push({
                state: 'ACTIVE',
                completedAt: new Date(i * 1000).toISOString(),
                intentIds: picked
            })
        }
        expect(seen.size).toBeGreaterThanOrEqual(8)
    })
    it('never invents creators or uses a disabled provider label in a sparse profile', () => {
        expect(rotateCreatorIntentsV3([], [])).toEqual([])
        expect(rotateCreatorIntentsV3([pool[0], { ...pool[0] }], [])).toEqual([
            pool[0]
        ])
        expect(
            rotateCreatorIntentsV3(
                [
                    pool[0],
                    {
                        ...pool[1],
                        retrieval: {
                            ...pool[1].retrieval,
                            providerEligible: false
                        }
                    }
                ],
                []
            )
        ).toEqual([pool[0]])
    })
})
