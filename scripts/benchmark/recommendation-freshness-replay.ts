/** Local, aggregate-only audit. Explicit DB path + ten cycle IDs oldest first.
 * No LibraryDatabase constructor (which can migrate), provider client or generated fixture files.
 * Uses both the actual tagged allocator and the currently checked-out allocator. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { transformSync } from 'esbuild'
import { allocateRecommendationBatchV3 as allocate } from '../../src/recommendation-v3/batch-allocator-v3'
import {
    batchAuthorKey,
    batchFreshness,
    type PresentedBatchV3
} from '../../src/recommendation-v3/batch-freshness-v3'
import {
    rotateCreatorIntentsV3,
    type RecommendationIntentV3,
    type IntentCycleHistory
} from '../../src/recommendation-v3/intent-planner-v3'
import type { RankedCandidateWithEvidenceV3 as Ranked } from '../../src/recommendation-v3/ranker-adapter-v3'
import type { FinalLifetimeProfileV3 } from '../../src/recommendation-v3/final-profile'

const [dbPath, ...cycles] = process.argv.slice(2)
assert(
    dbPath &&
        existsSync(dbPath) &&
        cycles.length === 10 &&
        new Set(cycles).size === 10,
    'Supply one existing DB and ten distinct, chronological cycle IDs.'
)
assert(
    !existsSync(dbPath + '-journal') &&
        (!existsSync(dbPath + '-wal') || existsSync(dbPath + '-shm')),
    'Refusing an unsafe read-only SQLite open.'
)
const base = 'bec7f9f31828e8c57e0a2c103b6b1206c22c37cf'
const root = fileURLToPath(new URL('../../', import.meta.url))
const oldSource = execFileSync(
    'git',
    ['show', base + ':src/recommendation-v3/batch-allocator-v3.ts'],
    { cwd: root, encoding: 'utf8' }
)
const moduleText = transformSync(oldSource, {
    loader: 'ts',
    format: 'esm'
}).code
const oldAllocate: typeof allocate = (
    await import(
        'data:text/javascript;base64,' +
            Buffer.from(moduleText).toString('base64')
    )
).allocateRecommendationBatchV3
const db = new DatabaseSync(resolve(dbPath), { readOnly: true })
db.exec('PRAGMA query_only=ON; BEGIN')
function aggregate() {
    const works = new Set<string>(),
        counts = new Map<string, number>(),
        byRound: number[] = [],
        allRanks: number[] = []
    return {
        add(ids: string[], byId: Map<string, Ranked>) {
            const before = works.size
            for (const id of ids) {
                const item = byId.get(id)!
                works.add(id)
                allRanks.push(item.rawRank)
                const key = batchAuthorKey(item.comic)
                if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
            }
            byRound.push(works.size - before)
        },
        summary: () => ({
            slots: allRanks.length,
            works: works.size,
            knownAuthors: counts.size,
            maxAuthorSlots: Math.max(0, ...counts.values()),
            newWorkIdsByRound: byRound,
            meanOriginalRank: Number(
                (allRanks.reduce((a, b) => a + b, 0) / allRanks.length).toFixed(
                    2
                )
            )
        })
    }
}
try {
    assert.equal(db.prepare('PRAGMA query_only').get()?.query_only, 1)
    const official = aggregate(),
        candidate = aggregate()
    const ring: PresentedBatchV3[] = [],
        authorKeys = new Map<string, string>(),
        past: IntentCycleHistory[] = []
    const seedOld = new Set<string>(),
        seedNew = new Set<string>()
    let priorTime = '',
        poolSlots = 0,
        exactRounds = 0,
        capBreaks = 0,
        minBatch = 12
    for (const [idx, cycle] of cycles.entries()) {
        const pools = db
            .prepare(
                'SELECT id,generated_at,telemetry_json FROM recommendation_v3_candidate_pools WHERE recommendation_cycle_id=?'
            )
            .all(cycle)
        const batches = db
            .prepare(
                'SELECT item_ids_json,pool_id FROM recommendation_v3_batches WHERE recommendation_cycle_id=? AND batch_index=0'
            )
            .all(cycle)
        assert(
            pools.length === 1 &&
                batches.length === 1 &&
                batches[0].pool_id === pools[0].id
        )
        const at = String(pools[0].generated_at)
        assert(at > priorTime)
        priorTime = at
        const t = JSON.parse(String(pools[0].telemetry_json))
        const oldIds = JSON.parse(String(batches[0].item_ids_json)) as string[]
        const plan = t.intentPlan as RecommendationIntentV3[]
        const raw = t.rankedCandidates as Ranked[]
        const ids = raw.map((r) => r.comicId)
        assert(
            raw.length <= 500 &&
                raw.length >= 12 &&
                new Set(ids).size === ids.length
        )
        const cards = db
            .prepare(
                `SELECT c.id,c.canonical_author_id,c.is_favorite,a.canonical_name FROM comics c LEFT JOIN authors a ON a.id=c.canonical_author_id WHERE c.id IN (${ids.map(() => '?').join(',')})`
            )
            .all(...ids)
        assert.equal(cards.length, ids.length)
        const byCard = new Map(cards.map((c) => [String(c.id), c]))
        const fav = new Set(
            cards.filter((c) => Boolean(c.is_favorite)).map((c) => String(c.id))
        )
        const ranked = raw.map((r) => {
            const c = byCard.get(r.comicId)!
            const comic = {
                comicId: r.comicId,
                authorId: c.canonical_author_id
                    ? String(c.canonical_author_id)
                    : null,
                canonicalAuthor: c.canonical_name
                    ? String(c.canonical_name)
                    : null
            } as Ranked['comic']
            const key = batchAuthorKey(comic)
            if (key) authorKeys.set(r.comicId, key)
            return { ...r, comic }
        })
        const byId = new Map(ranked.map((r) => [r.comicId, r]))
        const hs = db
            .prepare(
                "SELECT recommendation_cycle_id, json_extract(telemetry_json,'$.state') AS state FROM recommendation_v3_candidate_pools WHERE generated_at<? ORDER BY generated_at DESC LIMIT 30"
            )
            .all(at)
        const completed = [
            ...new Set(
                hs
                    .filter((h) =>
                        ['EXHAUSTED', 'SUPERSEDED'].includes(String(h.state))
                    )
                    .map((h) => String(h.recommendation_cycle_id))
            )
        ].slice(0, 2)
        const oldRecent = new Set(
            completed.flatMap((k) =>
                db
                    .prepare(
                        'SELECT comic_id FROM recommendation_seen WHERE cycle_id=?'
                    )
                    .all(k)
                    .map((r) => String(r.comic_id))
            )
        )
        const common = {
            ranked,
            intents: plan,
            alreadyAllocated: new Set<string>(),
            currentFavoriteIds: fav
        }
        const original = oldAllocate({
            ...common,
            recentlyDisplayedComicIds: oldRecent
        }).map((s) => s.comicId)
        assert(
            original.length === oldIds.length &&
                original.every((v, i) => v === oldIds[i]),
            'Tagged allocator differs: do not interpret replay.'
        )
        exactRounds++
        official.add(original, byId)
        poolSlots += ids.length
        // New installations have no recovered evidence of actual display from old allocations.
        // In the experiment only, assume each successive counterfactual slate is presented once.
        const selected = allocate({
            ...common,
            ...batchFreshness(ring, authorKeys)
        })
        capBreaks += selected.filter((x) => x.authorLimitRelaxed).length
        minBatch = Math.min(minBatch, selected.length)
        const out = selected.map((x) => x.comicId)
        candidate.add(out, byId)
        ring.unshift({ batchId: String(idx), itemIds: out })
        const profileRow = db
            .prepare(
                'SELECT profile_json FROM recommendation_v3_profiles WHERE id=?'
            )
            .get(t.profileId)!
        const profile = JSON.parse(
            String(profileRow.profile_json)
        ) as FinalLifetimeProfileV3
        const actual = plan.filter((i) => i.type === 'CREATOR')
        actual.forEach((x) => seedOld.add(x.intentId))
        const available = profile.creatorProfiles
            .filter((x) => x.providerEligible && x.providerQueryLabel)
            .map((x) => ({
                ...actual[0],
                intentId: 'CREATOR:' + x.creatorId,
                type: 'CREATOR' as const,
                evidence: {
                    supportCount: x.supportCount,
                    supportShare: x.supportShare,
                    confidence: x.confidence
                },
                retrieval: {
                    providerEligible: true,
                    utilityTier: 'HIGH_PRECISION_ANCHOR',
                    estimatedRouteCost: 1
                }
            }))
        const chosen = rotateCreatorIntentsV3(available, past).map(
            (x) => x.intentId
        )
        assert.equal(chosen.length, actual.length)
        chosen.forEach((x) => seedNew.add(x))
        past.push({ state: 'ACTIVE', completedAt: at, intentIds: chosen })
    }
    console.log(
        JSON.stringify(
            {
                releaseCommit: base,
                readOnly: true,
                networkRequests: 0,
                oldFirstBatchesMatchedInOrder: exactRounds,
                poolSlots,
                official: official.summary(),
                candidate: candidate.summary(),
                shortestCandidateBatch: minBatch,
                authorCapRelaxedSlots: capBreaks,
                oldDistinctSearchAuthors: seedOld.size,
                candidateDistinctSearchAuthors: seedNew.size,
                assumption:
                    'cold start; one first batch per cycle, each presented once; frozen candidates, not user preference judgments'
            },
            null,
            2
        )
    )
} finally {
    db.exec('ROLLBACK')
    db.close()
}
