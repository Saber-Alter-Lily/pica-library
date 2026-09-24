# SQLite / Full-Domain Query Discipline — P2 D1

Status: **first correctness-cap cleanup implemented; broader hot-query audit remains open**

Parent: `DEVELOPMENT_TASK_LOG.md` → P1-E bounded-list correctness + P2-D SQLite/query/write discipline.

## Problem

Pica Library has legitimate bounded queries for UI pagination, recommendation candidate work and diagnostic sampling. A fixed row limit becomes a correctness bug when the caller claims to operate on the **complete authoritative domain**.

The initial P2-D audit found several legacy `listComics({ limit: 5000 })` calls that were not pagination at all:

- Browser Lite data-package export;
- CLI CSV export;
- CLI `progress` without a comic ID;
- CLI `progress <comicId>` indirectly searched only the first 5000 rows;
- CLI `prepare-library` favorite export.

A library larger than 5000 rows could therefore be silently truncated even though these operations present themselves as complete exports/status operations.

## D1 changes

### Browser Lite export

`serializeBrowserLiteDataPackage()` now uses `database.listAllComics()` when no explicit `options.comics` subset is supplied.

An explicitly supplied subset remains authoritative. This preserves `prepare-library` and other callers that intentionally provide a scoped collection.

### CLI export

The ordinary CSV `export` command now uses `listAllComics()`.

### CLI progress

- `progress <comicId>` now uses direct `getComic(comicId)` lookup.
- unscoped `progress` uses `listAllComics()`.

This both removes the 5000-row correctness cap and follows the P1 direct-object lookup rule.

### CLI prepare-library

The favorite set is derived from `listAllComics()` before filtering favorites, so favorites beyond row 5000 are not silently omitted.

## Large-library regression

The D1 unit gate creates **5007 catalog records** and requires:

- `listAllComics()` to return the complete set;
- Browser Lite serialization to contain all 5007 records;
- the record beyond the legacy 5000 boundary to be present.

Source contracts also prevent the corrected CLI/bundle paths from reintroducing `listComics({ limit: 5000 })`.

## Fixed limits that are not changed in D1

D1 deliberately does **not** replace every `limit: 5000` or `limit: 10000` in the repository.

### User-facing pagination

`/api/v1/comics` and CLI `list` remain bounded by caller/page limits. These are presentation/query contracts, not claims to return the whole database.

### Recommendation runtime

Recommendation V3/V5 code contains bounded catalog/event windows. Those limits may affect model/profile semantics and runtime cost. Changing them is not a mechanical SQLite cleanup and could alter ranking, candidate allocation, portable-policy behavior or memory use.

They remain under a separate P2-D/P2-K audit:

- identify whether each cap is an intentional algorithmic budget or an accidental correctness bound;
- measure large-library cost;
- change only with recommendation regression evidence.

### Recommendation audit export

The Desktop recommendation-audit package currently uses bounded catalog/event windows. It is diagnostic evidence rather than the authoritative library export. Its completeness semantics still need an explicit audit contract before changing its limits.

### Scripts/tests

Historical migration, validation and synthetic benchmark scripts may use fixed fixture bounds. They do not become production correctness defects merely because they contain a numeric limit.

## Remaining P2-D work

D1 does not close P2-D. Remaining work includes:

1. inventory hot SQLite queries for Library, Shelves, History, Work Identity and recommendation support;
2. detect repeated full-catalog materialization within one foreground interaction;
3. audit N+1 database lookups after SQL/result bounding;
4. review synchronous file/DB work on hot request paths;
5. verify indexes for common filters and identity lookup;
6. inspect high-frequency progress/event writes for read starvation;
7. classify the remaining 5000/10000 recommendation/audit caps by **presentation**, **algorithmic budget**, **diagnostic sample**, or **correctness domain**;
8. add representative large-library query timing/regression evidence without inventing a user-facing performance budget.

P2-C3 resource enforcement and recommendation semantic changes remain outside D1.
