# SQLite / Recommendation Serving Catalog Scope — P2 D4

Status: **serving/portable exact-scope catalog implemented; recommendation model/profile budgets unchanged**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-D SQLite/query/write discipline.

Dependencies:

- D2 introduced `getComicsByIds()` for ordered, chunked exact-ID reads.
- D3 established real SQLite Library-query scaling evidence.
- D4 applies the exact-ID primitive only where recommendation code already has explicit candidate/batch IDs and the ownership filter does not require unrelated catalog rows.

## Finding

Several Final V3 serving/readback paths still materialized:

```text
listComics({ limit: 10000 })
```

even though they already knew the candidate IDs being served.

This was different from recommendation generation or preference-profile construction:

- candidate generation/profile paths may intentionally use a bounded catalog as an algorithmic budget;
- serving/readback paths only need candidate records plus the records that can make a candidate count as already owned.

The ownership filter `filterCandidatesAgainstOwnedV5()` constructs its comparison set with `buildOwnedCatalogV5()`. A catalog row influences filtering only when it is:

- physically owned: favorite, durable library membership, or downloaded;
- explicitly marked owned in portable policy;
- the candidate itself, when needed to resolve an explicit owned override.

Unowned unrelated catalog rows do not affect the filter.

## D4 changes

### Final V3 frozen serving snapshot

The frozen snapshot no longer reads the first 10,000 comics.

It now builds the filter catalog from the exact union of:

- `recommendationOwnershipState().ownedComicIds`;
- portable-policy owned overrides;
- canonical upload IDs belonging to an already owned Canonical Work;
- the current ranked candidate IDs.

The current ranked candidates are reconstructed from this exact-ID result.

Canonical Work expansion is preserved exactly as before: the coordinator still loads Work Identity bindings, identifies works owned through any upload, and adds all uploads for those owned works to the serving policy.

The frozen snapshot no longer retains an unused full `catalog` / `catalogById` pair.

Favorite IDs for batch allocation are now obtained from the dedicated indexed `favoriteIds()` query instead of filtering a broad catalog materialization.

### Final V3 portable cache

`CycleCoordinatorV3.portable()` now loads only:

- physical ownership IDs;
- policy-owned IDs;
- ranked candidate IDs.

This is semantically equivalent to the previous whole-catalog input for `buildOwnedCatalogV5()`, while preserving the portable path's existing behavior. D4 does not add the Canonical Work expansion here because the previous portable implementation did not apply that expansion either.

### Serving composition diagnostic

`LibraryService.recommendationServingCompositionV3()` now loads only:

- physical ownership IDs;
- policy-owned IDs;
- active batch item IDs.

The composition result still applies the same ownership/work-duplicate filter to the same active batch before computing family, intent and reason telemetry.

## Semantic evidence

D4 includes a direct equivalence test:

- one physically owned work;
- one same-work variant;
- one unrelated novel candidate;
- one explicit-policy-owned candidate;
- 100 unrelated unowned catalog records.

Filtering the candidate rows against the complete catalog must equal filtering them against the compact owned + candidate catalog, including telemetry counters.

Existing Final V3 serving tests already require:

- exact owned upload exclusion;
- same-work variant exclusion;
- frozen serving snapshot reuse across CURRENT/NEXT;
- idempotent batch behavior.

D4 updates the frozen-snapshot query assertion from one broad `listComics()` read to one exact-ID `getComicsByIds()` read and requires subsequent batch reads to reuse the frozen snapshot without another exact-ID read.

Source contracts additionally require Final V3 serving, portable and serving-composition methods to remain free of the 10,000-row catalog materialization.

## Deliberate non-scope

D4 does **not** change:

- Recommendation V3 profile construction;
- Recommendation V3 candidate retrieval/ranking;
- Recommendation V5 Shadow Retrieval;
- Recommendation V5 preference-timescale/ranking semantics;
- Portable Policy snapshot inferred-signal construction;
- recommendation-audit export bounds;
- Work Identity binding confidence/materialization semantics;
- the 10,000 binding cap in Work Identity review paths.

Those remaining limits may be algorithmic, diagnostic, or correctness-significant and must be evaluated separately.

D4 also selects no performance threshold and enables no P2-C3 resource enforcement.

## Why this is safe

The compact catalog is not a sample of the full library. It is a complete materialization of the subset that can affect this serving decision:

```text
all physical owned records
+ all explicit policy-owned records available locally
+ current candidates
+ Final V3 canonical-owned uploads where that path already expands Work Identity
```

Therefore the change removes unrelated row conversion/aggregate-subquery work without narrowing the ownership evidence used for the candidate decision.

## Next P2-D work

Remaining high-value audit areas:

1. decide whether text-search author metadata can be scoped to candidate author IDs using D3 measurements;
2. inspect `comicSelect` correlated episode/picture aggregates with query plans before rewriting them;
3. classify Work Identity 10,000-row binding/review limits as UI/diagnostic versus correctness domains;
4. inspect Visual/Work Identity full-catalog materialization under representative data;
5. continue write/read-starvation evidence only where current 250 ms download persistence and 400 ms Reader progress debounce are insufficient in real runtime telemetry.
