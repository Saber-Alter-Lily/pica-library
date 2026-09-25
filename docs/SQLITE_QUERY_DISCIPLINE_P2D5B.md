# Work Identity Targeted Detail Reads — P2 D5B

Status: **targeted current-comic/work relationship reads implemented; full-catalog metadata heuristic funnel preserved**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-D SQLite/query discipline.

Dependency: P2-D5A separates bounded Work Identity review reads from complete authoritative materialization/ownership reads.

## Problem

`workVariantsForComic()` has two fundamentally different data needs:

1. **relationship state for the current comic**:
   - current upload binding;
   - other uploads bound to the same Canonical Work;
   - human decisions involving the current comic;
   - high-confidence probable evidence involving the current comic;
2. **metadata heuristic candidates**:
   - the wider catalog used by the Work Identity V3 creator/title/cover funnel.

Before D5B, the detail path mixed those concerns. It loaded:

- the first 10,000 Work Identity bindings;
- the first 5,000 decisions;
- the first 5,000 evidence rows;

then filtered those global prefixes down to rows involving the current comic.

That is both inefficient and a correctness problem: a relevant relationship can fall outside the global prefix even though the detail request is for exactly that comic.

The full-catalog metadata funnel is intentionally different. It performs creator/title candidate discovery across the catalog and remains unchanged in D5B.

## D5B database APIs

### Current binding

`getWorkIdentityBinding(comicId)`

Returns the single binding for the requested upload, using the primary-key comic lookup.

### Same-work bindings

`listWorkIdentityBindingsForWork(workId)`

Returns all upload bindings for one Canonical Work. The existing `work_upload_bindings(work_id, binding_status)` index already supports this access path.

### Exact binding metadata for relationship candidates

`listWorkIdentityBindingsByComicIds(comicIds)`

Resolves binding metadata for an explicit ID set in 400-ID SQL chunks and reconstructs caller order. This avoids per-candidate N+1 binding lookups while preserving work/edition metadata for decision/evidence-derived variants.

### Decisions involving one comic

`listWorkIdentityDecisionsForComic(comicId)`

Returns all decisions where the requested comic is either the left or right side. It is unbounded with respect to the current comic because this is a targeted relationship domain, not a review page.

### High-confidence probable evidence involving one comic

`listWorkIdentityProbableEvidenceForComic(comicId, minimumConfidence)`

Returns only:

- relation = `PROBABLE_SAME_WORK`;
- confidence >= requested threshold;
- pairs containing the current comic.

`workVariantsForComic()` uses the existing 0.94 threshold.

## Detail-path behavior

`workVariantsForComic()` now builds relationship state from:

1. current binding;
2. all bindings for the current Canonical Work;
3. all current-comic decisions;
4. all current-comic probable evidence >= 0.94;
5. one batched binding lookup for the relationship candidate IDs.

The existing relationship precedence remains unchanged:

1. confirmed same edition;
2. confirmed work variant;
3. adjudicated edition variant;
4. adjudicated same work;
5. probable same work.

`KEEP_SEPARATE` remains authoritative.

Binding metadata for variants introduced by decisions/evidence is preserved by the batched exact-ID binding read.

## Preserved heuristic funnel

D5B deliberately keeps:

`allComicsForIdentity()`

inside `workVariantsForComic()`.

That catalog is used by the V3 detail resolver to:

- form creator buckets;
- allow only strict/core/loose title fallback when creator metadata is incomplete;
- rank review candidates;
- optionally use cover identity as confirmation.

This is not replaced with a targeted relationship query because doing so would change discovery semantics. Future optimization of this metadata funnel requires separate candidate-index/query evidence.

## Indexes

Existing indexes already cover:

- binding by comic ID: primary key on `work_upload_bindings.comic_id`;
- same-work bindings: `idx_work_upload_bindings_work(work_id, binding_status)`;
- decision/evidence left-side pair lookup.

Migration 15 adds only the missing targeted-detail indexes:

- `idx_work_identity_decisions_right(right_comic_id, left_comic_id)`;
- `idx_work_identity_evidence_left_probable(left_comic_id, relation, confidence DESC, right_comic_id)`;
- `idx_work_identity_evidence_right_probable(right_comic_id, relation, confidence DESC, left_comic_id)`.

These make the symmetric current-comic relationship reads auditable without a speculative index sweep.

## Boundary regression

D5B extends the D5A large SQLite fixture:

- 10,001 bindings remain queryable by exact comic and by complete same-work domain;
- 5,001 decisions involving one comic remain queryable through the targeted API even though the review API stays capped at 5,000;
- exact binding metadata lookup preserves requested order and omits a missing ID.

A separate evidence fixture stores:

- 5,000 higher-confidence unrelated probable rows;
- one lower-ranked but still >=0.94 target pair.

The global 5,000-row evidence review prefix intentionally excludes the target pair, while the targeted current-comic API must return it.

Source-contract coverage additionally requires `workVariantsForComic()` to use the targeted APIs and forbids the old global 10,000/5,000 relationship readers inside that method.

Migration integration coverage verifies all three new index names.

## Deliberate non-scope

D5B does not:

- remove the full-catalog metadata heuristic funnel;
- change Work Identity resolver/version/confidence rules;
- change relation precedence;
- change `KEEP_SEPARATE` authority;
- change materialization execution;
- change Final V3 ranking or serving;
- change bounded review UI APIs;
- select a performance budget;
- enable P2-C3 resource enforcement.

## Next P2-D work

After D5B, the remaining high-value SQLite/runtime audit should move away from relationship-prefix correctness and focus on:

1. repeated full-catalog materialization in Visual and remaining Work Identity/recommendation analysis paths;
2. `comicSelect` aggregate subquery cost under large Library reads;
3. high-frequency download-progress and user-event write cadence versus foreground read latency;
4. J2 real Windows x64 idle/load evidence before any global resource capacity decision.
