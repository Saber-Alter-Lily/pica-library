# Picture Count Index for comicSelect — P2 D8A

Status: **missing comic-first picture index added / query-plan regression implemented**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-D SQLite/query/write discipline.

Dependency: D7A/D7B reduce write-side amplification. D8A returns to a read-path issue already visible in the shared `comicSelect` projection.

## Finding

Every `StoredComic` projected through `comicSelect` derives:

- known episode count;
- known picture count;
- completed/downloaded picture count.

The episode count predicate is:

```sql
WHERE e.comic_id = c.id
```

and already has:

```text
idx_episodes_comic(comic_id, order_no)
```

The picture counters use:

```sql
WHERE p.comic_id = c.id
```

and:

```sql
WHERE p.comic_id = c.id AND p.status = 'completed'
```

Before D8A, picture indexes included:

- `idx_pictures_episode(episode_id, position)`;
- `idx_pictures_downloaded(status, comic_id)`.

The second index is suitable when `status` is constrained first, but there was no index whose leading column is `comic_id` for the total-picture count.

This matters because the picture-count subquery is correlated with each comic row returned by `comicSelect`.

## D8A change

Migration 16 adds:

```sql
CREATE INDEX IF NOT EXISTS idx_pictures_comic_status
    ON pictures(comic_id, status);
```

This is intentionally additive. D8A does not rewrite `comicSelect`, change the `StoredComic` projection or remove the existing status-first downloaded-picture index.

## Planner regression

The integration test opens a freshly migrated real SQLite database and runs `EXPLAIN QUERY PLAN`.

For:

```sql
SELECT COUNT(*) FROM pictures WHERE comic_id = ?
```

the planner must use:

```text
idx_pictures_comic_status
```

For:

```sql
SELECT COUNT(*) FROM pictures
WHERE comic_id = ? AND status = 'completed'
```

either of the two covering indexes is acceptable:

- `idx_pictures_comic_status`;
- `idx_pictures_downloaded`.

The test also locks the current `comicSelect` predicates to the indexed shapes so a future query change cannot silently invalidate the evidence.

The migration integration suite separately requires `idx_pictures_comic_status` to exist in a fresh latest-version database.

## Why D8A does not rewrite the aggregate projection yet

A larger rewrite could replace correlated subqueries with pre-aggregated joins/CTEs. That may or may not be faster depending on:

- returned comic row count;
- picture-table size;
- filter selectivity;
- whether the caller requests one comic or a broad Library page.

Adding the missing index fixes the most obvious planner deficiency without changing query semantics. A broader aggregate rewrite should only follow benchmark/query-plan evidence across representative small and large libraries.

## Deliberate non-scope

D8A does not:

- change episode/picture count semantics;
- remove existing indexes;
- change Library result ordering or filters;
- add cached count columns;
- change write paths;
- select a latency budget;
- enable P2-C3 resource enforcement.

## Next P2-D evidence

After D8A:

1. compare Library/detail query scaling with the new index before considering aggregate CTE/join rewrites;
2. finish D7B-style event transaction batching where evidence supports it;
3. use J1/J2 real foreground latency under downloads/WebDAV/recommendation loads;
4. avoid schema denormalization until count-maintenance/write costs are explicitly justified.
