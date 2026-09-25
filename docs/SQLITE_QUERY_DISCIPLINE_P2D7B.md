# Transactional Shelf Event Batching — P2 D7B

Status: **bulk shelf event writes grouped into one short transaction / event granularity preserved**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-D SQLite/query/write discipline.

Dependency: D7A reduces read amplification in the throttled download-progress write path. D7B audits a different write pattern: a single user action that emits many semantically distinct event rows.

## Finding

Shelf item add/remove routes accept multiple comic IDs.

The shelf mutation itself is already performed by the Shelf/Database layer, but the HTTP route then recorded the corresponding behavior evidence with:

```text
for each comic:
    recordUserEvent(...)
```

`recordUserEvent()` performs one SQLite insert and a readback. Outside an explicit transaction, a large shelf operation therefore produces many independent write transactions.

The event granularity is correct and must be preserved: recommendation behavior needs one `shelf_add` or `shelf_remove` event per comic.

The problem is transaction shape, not row count.

## Open-source / SQLite pattern

Mature SQLite Node implementations commonly group many short synchronous inserts in a single transaction while reusing the existing per-row insert logic. The important constraints are:

- keep the transaction synchronous and short;
- do not perform network or expensive computation while holding it;
- rollback the whole event batch on an exception.

D7B follows that pattern with the repository's existing manual `BEGIN IMMEDIATE / COMMIT / ROLLBACK` style.

## D7B change

`LibraryDatabase.recordUserEvents(inputs)`:

1. returns immediately for an empty input;
2. opens `BEGIN IMMEDIATE`;
3. calls the existing `recordUserEvent()` for every input;
4. commits after all rows succeed;
5. rolls back and rethrows if any row fails.

Reusing `recordUserEvent()` preserves:

- event IDs;
- event type and comic ID;
- app/context/recommendation identifiers;
- metadata safety rejection;
- dedupe behavior;
- returned `UserEvent` shape.

The shelf add/remove route now constructs the same per-comic event payloads and sends the array to `recordUserEvents()`.

## Atomicity

D7B makes the event-recording portion of one shelf request atomic:

- all behavior-evidence events for that route call are committed;
- or none are committed if one input violates event validation.

The shelf mutation itself still occurs before event recording, exactly as before. D7B does not attempt to create a cross-layer transaction spanning shelf mutation and HTTP event logging.

## Regression evidence

Unit coverage requires:

- three shelf-add inputs produce three distinct events with the same per-event fields as before;
- an invalid metadata payload in the middle of a batch causes the entire event batch to roll back;
- shelf add/remove route source uses `recordUserEvents()`;
- the route still maps one event payload per input comic ID;
- the batch method uses `BEGIN IMMEDIATE`, `COMMIT` and `ROLLBACK` around the existing single-event recorder.

## Deliberate non-scope

D7B does not:

- merge multiple comic events into one row;
- suppress duplicate input comic IDs beyond existing event behavior;
- change recommendation evidence meaning;
- batch unrelated requests together;
- keep a transaction open across network or async work;
- change download progress cadence;
- change SQLite journal mode;
- select a latency/performance budget;
- enable P2-C3 resource enforcement.

## Next write-side audit

After D7B:

1. inspect recommendation impression/batch event bursts for the same short-transaction opportunity;
2. use J1/J2 foreground latency during active downloads/interaction before changing write cadence;
3. separately benchmark `comicSelect` aggregate subqueries and large result materialization;
4. keep event-level evidence semantics intact even when transaction mechanics are optimized.
