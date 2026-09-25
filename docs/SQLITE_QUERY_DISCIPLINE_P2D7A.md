# Download Progress Write Read-Amplification — P2 D7A

Status: **hot-path pre-read removal implemented / existing persistence cadence preserved**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-D SQLite/query/write discipline.

Dependency: D6A completes the current complete-domain/favorite-target correctness cleanup. D7A moves the P2-D audit from row-domain correctness into high-frequency write shape.

## Finding

Download progress persistence is already deliberately throttled in `LibraryService.runDownloadQueue()`:

```text
DOWNLOAD_PROGRESS_PERSIST_INTERVAL_MS = 250
```

The UI progress callback can still run more frequently, but SQLite persistence is limited to approximately four writes per second per active job, plus forced terminal/final writes.

That cadence is intentionally preserved.

The database write itself still had avoidable read amplification:

1. `getDownloadJob(id)`;
2. `UPDATE download_jobs ...`;
3. `getDownloadJob(id)` again for the return value.

The first read existed only to supply existing values for fields absent from a partial `DownloadJobPatch`.

On an active download queue this turns every persisted progress update into two full job reads around one write.

## D7A change

`updateDownloadProgress()` now uses SQLite `COALESCE` directly in the UPDATE:

- provided numeric/string values replace the stored value;
- `undefined` / `null` parameters retain the current stored value;
- explicit zero values remain writable;
- an explicit empty chapter title remains writable;
- `progress_updated_at` is refreshed exactly as before.

The method then performs one `getDownloadJob(id)` to return the authoritative updated job.

The hot path is therefore:

```text
UPDATE -> SELECT
```

instead of:

```text
SELECT -> UPDATE -> SELECT
```

## Behavioral equivalence

Regression coverage requires:

- a complete initial progress patch to persist all fields;
- a later partial patch to change only the supplied field while retaining total/completed/expected bytes/chapter title;
- explicit `0` values and an empty chapter title to remain valid writes;
- an unknown job ID to retain the existing failure behavior;
- the method source to contain one return lookup and no leading `const current = getDownloadJob(...)`;
- the existing 250 ms service persistence throttle to remain present.

## What D7A does not change

D7A does not:

- change download concurrency;
- change Provider/media request pacing;
- change pause/resume/cancel semantics;
- change the 250 ms SQLite persistence interval;
- batch progress across different jobs;
- weaken final/forced persistence;
- change download event semantics;
- select a SQLite latency budget;
- enable P2-C3 resource enforcement.

## Next P2-D write evidence

After D7A, remaining write-side work should be evidence-driven:

1. measure foreground J1/J2 latency with active downloads before changing the 250 ms cadence;
2. inspect bulk shelf add/remove user-event writes, which currently record one event per comic and may benefit from a transactional batch API while preserving event granularity;
3. inspect recommendation impression/event bursts for equivalent batching opportunities;
4. avoid suppressing or coalescing semantically distinct user events merely to reduce row count.
