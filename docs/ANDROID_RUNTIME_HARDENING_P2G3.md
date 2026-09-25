# Android Runtime Hardening — P2 G3

Status: **Downloads screen persistent-index parsing and page-size stat work moved off the Android UI thread**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening.

Dependencies:

- G1 moved Author Works Catalog/Semantic/creator reconstruction off the UI thread.
- G2 moved Comic Detail local Catalog/Semantic/PhoneDownload first-frame work off the UI thread.

## Finding

`DownloadsActivity` is the persistent-phone-download management surface.

Before G3, both Activity startup and every resume synchronously executed:

`renderList()`

on the UI thread.

That render path performed two scalable storage operations.

### Full download-index parse

`PhoneDownloadStore.load(this)`

opens and parses the complete:

`phone-download-index-v1.json`

and materializes every comic/chapter/page record.

### Full page-size stat scan

The same render then called:

`PhoneDownloadStore.estimatedBytes(this)`

which internally called `load(context)` again and traversed every stored page URI.

For each page it may:

- call `File.length()` for file URIs; or
- open a `ParcelFileDescriptor` and read its stat size for content URIs.

Therefore one Downloads screen render could:

1. parse the complete download index once for the list;
2. parse it a second time for byte estimation;
3. stat every downloaded page;
4. only then draw the list.

The delete-confirmation callback also executed:

`PhoneDownloadStore.remove(...)`

synchronously from the UI callback before rerendering.

`remove()` includes file/content deletion, index save and Catalog reconciliation, so it is not a UI-thread operation.

## G3 Activity pipeline

G3 reuses the Activity-local single-thread executor pattern already established in G1.

### Lightweight shell

`render()` now builds:

- the navigation bar;
- ScrollView/container;
- a small loading state.

It performs no PhoneDownloadStore load or page-size scan.

### DownloadState

One worker-owned immutable handoff contains:

- `PhoneDownloadStore.Snapshot snapshot`;
- precomputed `long bytes`.

### readDownloads

The worker performs:

1. one `PhoneDownloadStore.load(this)`;
2. one `PhoneDownloadStore.estimatedBytes(this, snapshot)`.

The new overload reuses the already parsed Snapshot and avoids reopening/reparsing the index solely for size estimation.

The legacy convenience overload remains:

`estimatedBytes(context)`

and delegates to:

`estimatedBytes(context, load(context))`

for callers that do not already own a Snapshot.

### onResume

`onResume()` calls `loadDownloads()`.

The Activity:

1. advances `loadGeneration`;
2. renders loading state immediately;
3. submits `readDownloads()` to the worker;
4. publishes `renderList(state)` on the UI thread only if the Activity/generation is still current.

## Render boundary

`renderList(DownloadState state)` is now in-memory/UI-only.

It:

- consumes the prepared Snapshot;
- formats the prepared byte total;
- creates cards/buttons;
- performs no PhoneDownloadStore load;
- performs no size stat traversal.

## Delete path

The confirmation dialog now only dispatches:

`deleteDownload(comic.id)`.

The worker performs:

1. `PhoneDownloadStore.remove(this, comicId)`;
2. a fresh `readDownloads()`.

The UI thread then publishes the refreshed list only if the generation is still current.

If deletion fails:

- the worker catches the error;
- UI publication is lifecycle/generation guarded;
- the Activity shows the existing failure Toast;
- `loadDownloads()` schedules a fresh worker read.

The existing deletion semantics are unchanged.

## Lifecycle / stale-publication boundary

G3 adds:

- `destroyed`;
- `loadGeneration`.

Every asynchronous UI publication checks both.

On destroy:

- `destroyed = true`;
- generation advances;
- the executor receives `shutdownNow()`.

An older load/delete completion therefore cannot overwrite a newer resume/load state or publish into a destroyed Activity.

The generation guard also prevents overlapping `onResume()` loads from publishing out of order.

## Preserved behavior

G3 does not change:

- persistent download index format;
- comic/chapter/page ordering;
- displayed comic count or page count;
- byte formatting;
- delete confirmation copy;
- deletion semantics;
- Catalog reconciliation;
- Task Center navigation;
- Storage Settings navigation;
- opening downloaded comics.

## Regression contract

The long-task/runtime source contract requires:

- one Activity-local single-thread executor;
- `DownloadState`;
- worker-owned `readDownloads()`;
- reuse of `estimatedBytes(context, snapshot)`;
- `renderList()` to contain no PhoneDownloadStore load/stat call;
- delete confirmation to contain no synchronous `PhoneDownloadStore.remove`;
- deletion to run on the worker;
- lifecycle/generation guards around UI publication;
- executor shutdown on destroy.

Android compile/test/lint/build remains the authoritative API/lifecycle gate.

## Deliberate non-scope

G3 does not claim PhoneDownloadStore is globally removed from UI-thread paths.

The audit still finds other potential first-frame/local-state consumers, notably:

- `MainActivity` home summary currently loads PhoneDownloadStore and estimates total bytes synchronously;
- `UnifiedCatalogStore.applyLocalReferences()` consumes PhoneDownloadStore as part of full Catalog reconstruction;
- other stores displayed on the Home screen may also perform scalable file/stat work.

Those require separate owner-level pipelines rather than being folded into DownloadsActivity.

## Next P2-G work

Evidence-based priority after G3:

1. audit/fix `MainActivity` home-summary file/stat work because it affects the app landing surface;
2. audit/fix `AuthorDirectoryActivity` creator-concept construction;
3. audit `PicaBrowseActivity` result/local snapshot construction;
4. lower-frequency Theme/About/Recommendation settings file reads;
5. then durable Worker process-death/relaunch and Task Center reconstruction.

Representative Android device performance and concurrency budgets remain external evidence gates.
