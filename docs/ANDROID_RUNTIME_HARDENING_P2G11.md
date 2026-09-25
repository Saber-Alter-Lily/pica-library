# Android Runtime Hardening — P2 G11

Status: **MainActivity direct-open recommendation evidence enrichment and persistence moved off the UI thread**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening.

Dependencies:

- G1–G10 removed scalable local Store/Catalog/Semantic work from the audited first-frame/render paths.
- G10 leaves explicit lower-frequency interaction paths such as MainActivity direct-open and Reader completion evidence as separate owners.

## Finding

`MainActivity.openUnified()` is the common navigation helper used by Library, Shelves, Recommendation and History fallback cards.

Before G11, a card click synchronously performed:

1. `UnifiedCatalogStore.load(this)`;
2. lookup of the selected comic's tags/categories;
3. `RecommendationEvidenceStore.recordDetailOpen(...)`;
4. only then launched `UnifiedComicDetailActivity`.

Both steps 1 and 3 perform persistent I/O.

### Catalog enrichment

`UnifiedCatalogStore.load(...)` reads/parses the local unified-catalog JSON.

The direct-open path only needs one entry's tags/categories for recommendation evidence enrichment, but paid the full Catalog load cost on the UI thread.

### Evidence persistence

`RecommendationEvidenceStore.recordDetailOpen(...)` delegates to the synchronized evidence recorder.

That recorder:

- loads the persisted recommendation evidence JSON;
- creates a new event;
- retains the bounded tail;
- rewrites the evidence file.

Therefore the card-click path blocked navigation on both a Catalog read and an evidence read/write cycle.

## G11 change

G11 adds:

`recordDetailOpenAsync(comicId, author)`

### Immediate navigation

`openUnified()` now:

1. schedules the evidence task;
2. constructs the existing detail Intent;
3. starts the detail Activity immediately.

It contains no Catalog Store load and no evidence Store write.

### Existing executor ownership

The evidence task uses MainActivity's existing:

`requests`

executor.

No second executor, WorkManager job or global task queue is introduced.

The task is deliberately **not** assigned to MainActivity's page-level `pending` Future.

That matters because:

- `pending` is cancelled on tab/page transitions;
- recommendation evidence describes the user action that already occurred;
- opening the detail Activity naturally pauses MainActivity.

The evidence write therefore remains independent of page-render cancellation.

### Application context

The task captures:

`getApplicationContext()`

before submission.

Catalog enrichment and evidence persistence use that application context rather than retaining Activity UI state.

### Background work

The submitted task performs:

1. `UnifiedCatalogStore.load(app)`;
2. lookup of the selected comic entry;
3. `RecommendationEvidenceStore.recordDetailOpen(app,...)`.

If the comic is absent from Catalog, the same prior behavior is preserved:

- author = the caller-provided author;
- tags/categories = empty collections.

## Reliability boundary

G11 changes execution timing, not evidence semantics.

The task is still process-local and uses MainActivity's executor.

It is not promoted to a durable Worker because:

- this is a low-latency interaction evidence event;
- current evidence storage is itself process/file scoped;
- introducing durable WorkManager semantics for one event would expand scope far beyond the existing evidence contract.

On ordinary detail navigation MainActivity is paused, not destroyed, so the executor remains alive.

A full process kill can still interrupt a queued evidence write; that limitation already exists for other non-durable interaction evidence and remains outside G11.

## Preserved behavior

G11 does not change:

- detail Intent extras;
- UnifiedComicDetailActivity behavior;
- recommendation evidence event type;
- event schema;
- author/tags/categories semantics;
- evidence bounding;
- event dirty/sync semantics;
- card click behavior;
- Library/Shelf/Recommendation/History navigation.

## Regression contract

The Android source contract requires:

- `recordDetailOpenAsync(...)`;
- application context capture;
- `requests.submit(...)`;
- Catalog load inside the submitted background task;
- evidence persistence inside that background task;
- no use of page `pending` for this interaction evidence task;
- `openUnified()` to contain no Catalog load;
- `openUnified()` to contain no direct evidence Store call;
- immediate detail Activity navigation remains.

Android compile/test/lint/build remains authoritative for Java/API correctness.

## Deliberate non-scope

G11 does not address Reader completion evidence.

`ReaderActivity.save()` still synchronously loads Unified Catalog and persists:

`reader_complete`

evidence when the user reaches the end of a chapter.

Reader already owns a metadata executor, so that path is the natural separate G12 owner.

G11 also does not change:

- recommendation impression persistence;
- batch navigation persistence;
- History resume source checks;
- durable Worker recovery.

## Next P2-G work

After G11:

1. move Reader chapter-completion evidence enrichment/persistence onto Reader's existing metadata executor;
2. then transition from UI-thread I/O hardening into durable Worker process-death/relaunch and Task Center reconstruction;
3. retain representative Android device timing as an external evidence gate.
