# Android Runtime Hardening — P2 G12

Status: **Reader chapter-completion recommendation evidence enrichment and persistence moved off the UI thread**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening.

Dependencies:

- G10 moves History local snapshots off the UI thread.
- G11 moves MainActivity detail-open recommendation evidence enrichment/persistence off the UI thread.
- ReaderActivity already owns a `metadata` executor for chapter metadata/source operations.

## Finding

`ReaderActivity.save(flush)` is a UI-thread method reached from:

- page display callbacks;
- chapter changes;
- pause/state save;
- explicit progress flush.

Most calls only persist reading progress.

When the current page reaches the final page of a chapter for the first time, the same method also synchronously performed:

1. `UnifiedCatalogStore.load(this)`;
2. lookup of the current comic;
3. `RecommendationEvidenceStore.recordReaderComplete(...)`.

The evidence recorder reads and rewrites the persisted recommendation-evidence JSON.

A chapter-completion interaction could therefore add a full Catalog read plus evidence file I/O to the UI-thread progress-save path.

## Existing dedupe authority

Reader already tracks:

`completionRecordedChapter`.

The completion branch executes only when:

- current index is the final page; and
- current chapter differs from `completionRecordedChapter`.

G12 preserves this authority on the UI thread.

The chapter is marked recorded **before** asynchronous evidence work is scheduled.

Repeated page callbacks, pause/save callbacks or page rebinding therefore do not schedule duplicate completion evidence for the same chapter.

## G12 change

G12 adds:

`recordReaderCompleteAsync()`.

### Application context

The helper captures:

- application context;
- current comic ID.

The background task does not require Activity UI state.

### Existing Reader executor

The helper submits to Reader's existing:

`metadata`

executor.

No new executor or WorkManager job is introduced.

The background task performs:

1. `UnifiedCatalogStore.load(app)`;
2. current comic metadata lookup;
3. `RecommendationEvidenceStore.recordReaderComplete(app,...)`.

### save() boundary

`save(flush)` now:

1. validates that a loaded page is actually displayed;
2. preserves the existing `progress.save(...)`;
3. when the chapter first reaches completion:
   - updates `completionRecordedChapter`;
   - schedules `recordReaderCompleteAsync()`;
4. preserves the existing progress-sync scheduling.

It performs no Catalog load and no recommendation-evidence file write.

## Metadata-executor lifecycle

Reader's metadata executor is already Activity-scoped and used for:

- initial chapter/source metadata;
- chapter transitions;
- portable settings reconciliation;
- diagnostics.

G12 reuses that same lifecycle.

`onDestroy()` still:

- marks Reader destroyed;
- advances generation;
- cancels the active chapter request;
- shuts down the metadata executor;
- clears pages/images.

G12 does not create a new durable evidence contract.

The event remains process-local/best-effort under abrupt process death, consistent with the existing mobile recommendation evidence store.

## Preserved behavior

G12 does not change:

- reading-progress persistence;
- progress sync cadence;
- chapter-completion detection;
- per-chapter dedupe;
- event type (`reader_complete`);
- author/tags/categories enrichment;
- evidence JSON schema;
- dirty/sync semantics;
- Reader navigation or page behavior.

## Regression contract

Android source coverage requires:

- `recordReaderCompleteAsync()`;
- application context capture;
- submission to Reader's existing `metadata` executor;
- Catalog enrichment inside that submitted task;
- `recordReaderComplete()` inside that submitted task;
- `completionRecordedChapter=chapter` before scheduling;
- no Catalog load in `save()`;
- no direct evidence Store call in `save()`.

Android compile/test/lint/build remains authoritative for Java/API correctness.

## Deliberate non-scope

G12 does not:

- make recommendation evidence a durable WorkManager task;
- change Reader metadata executor size/lifecycle;
- change progress persistence;
- change image/page prefetching;
- change Reader source recovery;
- modify recommendation ranking.

## P2-G transition after G12

With G12 complete, the audited UI-thread local file/JSON paths identified through G1–G12 are implementation-complete for the current scope.

Remaining P2-G work should move away from opportunistic UI-thread rewrites and into:

1. durable Worker process-death/relaunch validation;
2. Task Center reconstruction after Activity/process recreation;
3. low-memory/background restrictions;
4. representative mid-range Android latency/jank evidence;
5. Android-specific concurrency/resource budgets.

Those are lifecycle/resource evidence problems rather than more first-frame Store migration.
