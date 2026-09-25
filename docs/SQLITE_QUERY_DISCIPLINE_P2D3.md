# SQLite / Library Query Cost Evidence — P2 D3

Status: **Library-query scaling harness + eager-author-read removal implemented; broader P2-D audit remains open**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-D SQLite/query/write discipline.

Dependencies:

- D1 removed accidental complete-domain 5000-row truncation.
- D2 removed Shelf/recommendation prefix materialization and the author 2N+1 query pattern.
- D3 now targets the ordinary Library query path itself.

## Finding

`LibraryQueryService.evaluate()` previously called `database.listAuthors()` before it knew whether author aliases were needed.

That meant ordinary Library operations such as:

- initial Library render;
- provider/finished/download filters;
- tag filters;
- pagination/facet refreshes with no text search

loaded the complete author-group metadata set, including aliases and circles, even though aliases participate only in free-text matching.

After D2, `listAuthors()` is a fixed three-query batch rather than 2N+1, but it is still unnecessary I/O and allocation on the common no-text path.

## D3 change

Author-group loading is now conditional:

- when normalized text search is non-empty, `listAuthors()` is loaded exactly as before so canonical names and aliases remain part of text matching;
- when there is no text search, no author-group query is issued.

For author facets on the no-text path, labels are taken from the already materialized `StoredComic.canonicalAuthor` value, falling back to the raw author and then the author ID.

This avoids introducing a second author authority: the canonical author displayed on each stored comic originates from the same canonical author relation used by the database projection.

## Semantic regression

Unit coverage requires:

- a no-text query to succeed even when `listAuthors()` would throw, proving the call is not made;
- the author facet label to remain the canonical author name;
- a text search matching only an author alias to still call `listAuthors()` and return the comic;
- canonical facet labels to remain unchanged on that text-search path.

## Library-query scaling harness

D3 adds:

```bash
pnpm benchmark:library-query
```

Default synthetic local SQLite sizes:

- 500 comics;
- 2,000 comics;
- 5,000 comics.

Optional integer sizes may be passed after `--`.

For each size the harness builds a real temporary Pica Library SQLite database, imports deterministic favorite records, then measures five repeated queries after two warm-up queries for:

1. normal Library latest view;
2. provider + finished structural filtering;
3. tag filtering;
4. text/author search, which intentionally exercises alias-aware author metadata.

Machine-readable output records p50/p95/max, result counts and facet cardinalities.

The import/setup duration is emitted separately and is not part of query latency.

## Interpretation boundary

The harness is **synthetic scaling evidence**, not a real-device performance claim.

CI/shared-runner timing must not become:

- a user-facing p95 target;
- a release budget;
- a Windows reference-machine result;
- evidence for P2-C3 enforced resource capacities.

Its purpose is to make regressions and nonlinear query growth observable while the real J2 Windows x64 scenario evidence is collected separately.

## Deliberate non-scope

D3 does not yet:

- move Unicode/tag filtering semantics into SQL;
- eliminate author-group loading for text search;
- change Library query result/facet semantics;
- rewrite `comicSelect` aggregate subqueries;
- change recommendation V3/V5 catalog/event budgets;
- change Work Identity or Visual query behavior;
- alter download/progress/event write frequency;
- select any performance threshold.

## Next P2-D work

Use the D3 harness plus J1/J2 runtime telemetry to decide which next change has evidence:

1. if text-search scaling is materially worse, scope author alias reads to only candidate author IDs rather than all authors;
2. if base Library queries dominate, inspect `comicSelect` correlated episode/picture counts and query plans before changing schema/projections;
3. audit repeated full-catalog materialization in Recommendation/Visual/Work Identity interactions;
4. audit download progress and user-event write cadence for foreground read starvation;
5. keep every rewrite semantics-preserving and independently reviewable.
