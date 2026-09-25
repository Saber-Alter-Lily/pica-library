# Android Runtime Hardening — P2 G10

Status: **History local bookmark migration, history JSON and Catalog reads moved off the UI render path**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening.

Dependencies:

- G1–G9 move the highest-confidence scalable local file/JSON work off Author, Detail, Downloads, Main shell and Browse render paths.

## Finding

`HistoryActivity` is a filterable, date-selectable reading-history destination.

Before G10, several local persistence operations occurred synchronously on the UI thread.

### Before the shell

`onCreate()` called:

`ReadingHistoryStore.importLocalBookmarksOnce(this)`

before `renderShell()`.

That migration can:

- read legacy bookmark SharedPreferences;
- load the complete Unified Catalog;
- parse legacy bookmark JSON;
- load/save the reading-history JSON.

Therefore the History page could block before its first frame.

### Every render/filter change

`renderList()` called:

- `ReadingHistoryStore.load(this)`;
- `UnifiedCatalogStore.load(this)`.

Range/date buttons call `renderList()` directly, so every filter interaction could reparse both local files before redrawing.

### Legacy remote/Desktop import completion

The existing legacy import already ran on an Activity-local single-thread executor.

However, after it saved imported rows, the UI callback called `renderList()`, which reopened History/Catalog on the UI thread.

## G10 Activity snapshot boundary

G10 adds one immutable:

`HistoryData`

containing:

- `ReadingHistoryStore.Snapshot history`;
- `UnifiedCatalogStore.Snapshot catalog`.

The Activity holds the latest prepared snapshots in:

- `historySnapshot`;
- `catalogSnapshot`.

## UI-first startup

`onCreate()` now performs:

1. existing window/UI setup;
2. `renderShell()`;
3. `loadLocalHistory(true)`;
4. `importLegacySources()`.

The one-time bookmark migration is no longer executed before the shell.

## readHistoryData

`readHistoryData(boolean migrateBookmarks)` is worker-owned.

When requested it first performs:

`ReadingHistoryStore.importLocalBookmarksOnce(this)`.

It then loads:

- current ReadingHistory snapshot;
- current Unified Catalog snapshot.

## Initial local publication

`loadLocalHistory(true)` submits the local preparation to the existing single-thread worker.

After completion, the UI callback:

- checks `destroyed`;
- assigns both snapshots;
- calls `renderList()`.

No local file/JSON read occurs in that UI callback.

## In-memory filter/date interaction

`renderList()` now reads only:

- `historySnapshot`;
- `catalogSnapshot`;
- current Range;
- current exact date.

If snapshots are not ready, it renders a lightweight progress state.

Once loaded, filter/date changes call:

`ReadingHistoryStore.filter(historySnapshot, ...)`

which is an in-memory operation.

The Catalog snapshot is reused for cover/source metadata while cards are built.

Therefore repeated History filtering no longer reparses History/Catalog files.

## Legacy import serialization

`importLegacySources()` remains on the same existing single-thread worker.

This preserves serialized ordering with the initial local read:

1. initial HistoryData is loaded/published;
2. legacy WebDAV/Desktop import runs;
3. `ReadingHistoryStore.importLegacy(...)` persists imported rows;
4. the same worker calls `readHistoryData(false)`;
5. the refreshed snapshots are published once.

The user can filter the first prepared local snapshot while the longer legacy import continues.

## Legacy source behavior preserved

The import still:

- enriches WebDAV rows with Catalog metadata;
- enriches Desktop rows with provider identity;
- prefetches Desktop covers;
- imports through ReadingHistoryStore's existing dedupe/persistence semantics.

Only the final snapshot reload/publish location changes.

## UI-only render boundary

`renderList()` now contains no:

- `ReadingHistoryStore.load(...)`;
- `UnifiedCatalogStore.load(...)`.

It remains responsible for:

- filtering;
- comic grouping;
- date headings;
- card construction;
- cover display;
- chapter controls.

These operate on prepared in-memory state.

## Existing interaction paths left separate

G10 intentionally does not change `resumeSupported()`.

Explicit Continue Reading clicks may still check:

- `PhoneDownloadStore.has`;
- WebDAV configuration;
- Desktop pairing;
- Pica availability.

Those are interaction-triggered source validation paths rather than History list render paths.

Likewise G10 does not change Reader chapter-completion evidence, which remains a separate owner.

## Lifecycle boundary

HistoryActivity already owns one single-thread executor and `destroyed`.

Both initial and post-import publications retain the destroyed check.

`onDestroy()` shuts down the worker.

No second executor or background-task framework is added.

## Preserved behavior

G10 does not change:

- ReadingHistory JSON schema;
- legacy bookmark migration semantics;
- remote/Desktop import semantics;
- history range/date filters;
- comic grouping;
- chapter ordering;
- cover identity;
- source labels;
- resume/open-detail behavior;
- legacy-snapshot labels.

## Regression contract

The Android Library/Author/History source contract requires:

- `HistoryData`;
- worker-owned `readHistoryData(...)`;
- bookmark migration inside worker-owned preparation;
- no bookmark migration/History/Catalog load in `onCreate()`;
- no History/Catalog load inside `renderList()`;
- in-memory `ReadingHistoryStore.filter(historySnapshot,...)`;
- post-import worker reload through `readHistoryData(false)`;
- snapshot publication before rerender.

Android compile/test/lint/build remains authoritative for Java/API correctness.

## Deliberate non-scope

G10 does not address:

- `resumeSupported()` interaction-time source checks;
- MainActivity `openUnified()` Catalog lookup for detail-open evidence;
- ReaderActivity Catalog lookup at chapter completion;
- Previous/Next native recommendation persistence;
- durable Worker process-death/relaunch.

## Next P2-G work

After G10:

1. audit MainActivity direct-open evidence and Reader completion evidence metadata access;
2. review explicit user-action Store paths only if they are shown to block interaction;
3. move into durable Worker process-death/relaunch and Task Center reconstruction once the remaining high-confidence render-path I/O is closed.

Representative Android device latency/jank remains an external evidence gate.
