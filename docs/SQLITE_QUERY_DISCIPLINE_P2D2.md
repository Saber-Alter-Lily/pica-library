# SQLite / Hot-Query Batching — P2 D2

Status: **first hot-query/N+1 batch implemented; broader P2-D audit remains open**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-D SQLite/query/write discipline.

Dependency: P2-D1 removed fixed 5000-row caps from operations that claim to cover the complete library. D2 focuses on foreground/supporting query shape rather than global resource enforcement.

## Findings

The D2 audit found three high-confidence hot-query problems.

### 1. Shelf reads materialized an unrelated catalog prefix

`listShelfComics()` first loaded the ordered shelf IDs, then called:

```text
listComics({ limit: 5000 })
```

and built a whole-catalog Map just to resolve those IDs.

Consequences:

- work scales with an unrelated catalog prefix instead of shelf size;
- a valid shelf item beyond the first 5000 catalog rows can disappear from the returned shelf;
- every shelf open pays JSON/row conversion and aggregate subquery work for comics the shelf does not contain.

### 2. Recommendation record restoration did the same 5000-row materialization

`recommendationRecords(comicIds)` also loaded the first 5000 comics and built a Map even when the caller supplied only a small list of IDs.

That creates unnecessary work and repeats the same correctness boundary for recommendation records outside the first 5000 rows.

### 3. Author listing used 2N+1 SQL queries

`listAuthors()` executed:

1. one author/work-count query;
2. one alias query for each author;
3. one circle query for each author.

`LibraryQueryService.evaluate()` calls `listAuthors()` to build author labels/alias-aware filtering, so this query pattern can sit directly on ordinary Library search/filter interactions.

## D2 changes

### Batched exact-ID lookup

`LibraryDatabase.getComicsByIds()` now:

- normalizes requested IDs;
- deduplicates only for SQL retrieval;
- reads requested comics with `WHERE c.id IN (...)`;
- chunks at 400 IDs so the implementation does not depend on a high SQLite parameter limit;
- reconstructs output in the original request order;
- preserves duplicate requested IDs and omits missing IDs.

The existing `comicSelect` projection remains authoritative, so callers receive the same `StoredComic` shape as direct/list queries.

### Shelf query

`listShelfComics()` still reads shelf membership in authoritative `position, added_at` order, then resolves only those IDs through `getComicsByIds()`.

It no longer materializes a catalog prefix.

### Recommendation record restoration

`recommendationRecords()` resolves only the supplied IDs through `getComicsByIds()`, then attaches the existing neutral score/evidence defaults.

No recommendation ranking, serving or candidate-generation semantics are changed.

### Author batching

`listAuthors()` now uses a fixed three-query shape:

1. authors + work counts;
2. all aliases ordered by `author_id, alias_display`;
3. distinct non-empty circles ordered by `author_id, circle`.

Aliases/circles are grouped in memory by author ID. The returned `AuthorGroup` shape and per-author ordering remain unchanged.

### Minimal reverse-lookup indexes

Existing migration coverage already includes:

- `idx_shelf_items_order(shelf_id, position, added_at)`;
- `idx_shelf_items_comic(comic_id, shelf_id)`.

D2 therefore adds no shelf index.

The audit found no equivalent reverse indexes for the two author-side batch queries. Migration 14 adds only:

- `idx_author_aliases_author_display(author_id, alias_display)`;
- `idx_comic_authors_author_circle(author_id, circle)`.

These also support existing author merge/link operations that filter by `author_id`.

## Regression evidence

D2 extends the D1 5007-record fixture and requires a comic beyond the former 5000 boundary to remain visible through:

- Browser Lite full export;
- a shelf containing that comic;
- `recommendationRecords()` for that comic.

A separate 805-record test crosses two 400-ID SQL chunks and verifies that `getComicsByIds()` preserves request order while omitting a missing ID.

Source contracts also lock:

- Shelf/recommendation record lookup away from `listComics()` full/prefix materialization;
- author alias/circle batching away from per-author `WHERE author_id = ?` queries.

Migration integration coverage verifies the two new index names are present on a fresh database and the existing migration/upgrade suite continues to own rollback and preservation behavior.

## Deliberate non-scope

D2 does not claim all database work is optimized.

Still open:

- `LibraryQueryService.evaluate()` intentionally materializes the SQL-prefiltered candidate domain and performs text/tag facet logic in TypeScript; large-library timing evidence is still needed before moving more semantics into SQL.
- Recommendation V3/V5 fixed catalog/event windows require semantic classification before changing their limits.
- `addShelfItems()` and other write paths still contain item-wise validation/upsert loops; those require transactional/write-frequency analysis rather than mechanical batching.
- Work Identity evidence/materialization and Visual paths still need hotspot review under representative large libraries.
- High-frequency download/progress/event writes still need starvation/transaction-coalescing review.
- No p50/p95 performance budget is selected by D2.
- No P2-C3 runtime resource enforcement is enabled.

## Next P2-D evidence

The next audit batch should prioritize:

1. Library facet/query cost on small/medium/large local libraries;
2. repeated full-catalog materialization inside one recommendation/Visual interaction;
3. Work Identity review/materialization query shape;
4. download/progress write frequency and read starvation;
5. only then additional indexes or query rewrites supported by actual plans/timings.
