# comicSelect Picture-Count Scaling Evidence — P2 D8B

Status: **indexed-vs-no-index A/B harness implemented / no aggregate rewrite selected**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-D SQLite/query/write discipline.

Dependency: D8A adds `idx_pictures_comic_status(comic_id, status)` after query-plan evidence showed that the total-picture correlated count lacked a comic-first index.

## Goal

D8A fixes an obvious planner deficiency, but query-plan evidence alone does not answer whether a larger `comicSelect` rewrite is justified.

D8B therefore measures two real SQLite copies of the **same deterministic fixture**:

1. latest schema with migration 16 index present;
2. identical database with only `idx_pictures_comic_status` dropped.

No production query is changed by D8B.

## Command

```bash
pnpm benchmark:comic-select-picture-count
```

Optional comic counts may be supplied after `--`.

Default sizes:

- 500 comics;
- 2,000 comics;
- 5,000 comics.

Default density:

- one episode per comic;
- 20 pictures per comic;
- every third picture marked completed.

Picture density may be changed with:

```text
PICA_BENCH_PICTURES_PER_COMIC
```

bounded to 1–200.

## Fixture construction

For each size the harness:

1. creates a latest-schema Pica Library SQLite database;
2. inserts deterministic comics, episodes and pictures in one transaction;
3. checkpoints WAL state;
4. copies the database file;
5. drops only `idx_pictures_comic_status` from the comparison copy.

All other schema, rows and indexes remain the same.

## Measurements

Each variant is warmed before measurement.

### Detail projection

The harness samples up to 40 comic IDs spread across the catalog and times:

`LibraryDatabase.getComic(comicId)`

This exercises the normal single-comic `comicSelect` projection with correlated episode/picture counters.

### Broad catalog projection

The harness repeats five times:

`listComicsForLibraryQueryBase({ scope: 'catalog' })`

This exercises a broad SQL projection where the correlated counters are evaluated across many comic rows.

For each path the output reports:

- sample count;
- p50;
- p95;
- max.

It also reports descriptive:

`without-index / indexed`

ratios for p50/p95.

## Interpretation

A ratio greater than 1 means the comparison run without D8A's index took longer in that particular synthetic run. A ratio less than 1 can occur from noise, cache state or workload shape.

D8B deliberately defines **no pass/fail timing threshold**.

CI/shared-runner wall time must not be treated as:

- a user-facing latency budget;
- a Windows reference-machine result;
- a release gate;
- proof that a CTE/join rewrite is required;
- evidence for P2-C3 resource capacities.

The harness exists to make scaling behavior observable and to support a later decision using repeated representative runs.

## Semantic regression

Unit coverage constructs a real fixture and compares the complete relevant output with and without the D8A index.

The following must be identical:

- single-comic ID;
- known episode count;
- known picture count;
- downloaded picture count;
- broad catalog comic/count projection.

The index is therefore treated only as a planner/performance structure, never as semantic state.

## Decision rule for a later aggregate rewrite

Do **not** replace the correlated subqueries merely because a join/CTE looks more elegant.

Consider an aggregate rewrite only if repeated evidence shows one or more of:

1. broad catalog projection still scales materially worse than acceptable despite D8A;
2. single-detail queries remain dominated by picture-count lookup;
3. J1/J2 foreground measurements show Library/detail latency attributable to these counters;
4. query plans show repeated aggregate work that an alternative plan can remove without inflating small/detail queries.

Any rewrite must benchmark both single-comic and broad-query cases, because a plan that helps one can regress the other.

## Deliberate non-scope

D8B does not:

- change `comicSelect`;
- change count semantics;
- add cached/denormalized counters;
- alter picture write paths;
- remove any index;
- change Library filtering/order;
- establish a performance budget;
- enable P2-C3 resource enforcement.

## Next

After collecting D8B evidence:

1. combine it with J1/J2 real Desktop foreground latency;
2. decide whether the count projection is now sufficiently bounded;
3. if not, prototype an aggregate alternative behind equivalence benchmarks rather than replacing production SQL immediately;
4. continue write/query work only where measured evidence identifies a remaining bottleneck.
