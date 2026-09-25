# Android Runtime Hardening — P2 G4

Status: **MainActivity default Library local-reference reconciliation moved off the UI thread**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening.

Dependencies:

- G1 moved Author Works Catalog/Semantic/creator reconstruction off the UI thread.
- G2 moved Comic Detail first-frame local state off the UI thread.
- G3 moves Downloads persistent-index parsing, page-size stat work and delete refresh off the UI thread.

## Finding

The default Android bottom-tab is:

`书库`

and `MainActivity.onResume()` immediately calls `showTab()`, which enters:

`library()`.

Before G4, the Library method created its controls and then synchronously executed:

`UnifiedCatalogStore.reconcileLocalReferences(this)`

before the first catalog could be rendered.

This is not a cheap preference read.

## reconcileLocalReferences cost

`UnifiedCatalogStore.reconcileLocalReferences(context)` performs:

1. full Unified Catalog load/JSON parse;
2. ShelfStore load and shelf-membership merge;
3. E-H local favorite migration/load;
4. FavoriteCacheStore load and favorite merge;
5. PhoneDownloadStore load and phone-download merge;
6. Unified Catalog save.

The amount of work scales with the local catalog, shelves, favorites and phone-download index.

Therefore the app's default Library tab could block the Android UI thread on file/JSON work before the list became available.

## Existing MainActivity concurrency model

G4 does not add another executor.

MainActivity already owns:

`requests = Executors.newFixedThreadPool(4)`

for provider/remote/background page work.

It also already has:

- `serial`;
- `pending`;
- `valid(id)`;
- `cancelPageWork()`.

These provide the correct page-lifetime authority.

## G4 change

### UI-first Library shell

`library()` still creates synchronously:

- page heading;
- search field;
- filter/sort controls;
- refresh/column controls;
- shelf/Pica/download shortcuts;
- status text;
- empty GridView shell.

No local Catalog reconstruction occurs before these controls exist.

### Worker-owned local reconcile

After the shell exists:

1. capture `final int id = serial`;
2. submit the local reconcile pipeline to `requests`;
3. execute `UnifiedCatalogStore.reconcileLocalReferences(this)` on that worker;
4. publish to UI only through `runOnUiThread`;
5. reject publication when `!valid(id)`.

### Publication

The UI publication:

- calls `renderUnifiedLibrary(..., local, "本地目录")`;
- then preserves the existing per-session source-refresh decision.

If the current session has not checked sources yet:

`refreshUnifiedCatalog(...)`

starts exactly as before.

Otherwise the existing “本次会话已检查来源” status is appended.

## Page-switch cancellation

`cancelPageWork()` already:

- increments `serial`;
- cancels `pending`;
- clears the active page/grid adapter.

Therefore switching away from Library while reconciliation is running:

- cancels/interupts the page-owned Future where possible;
- invalidates its generation;
- prevents stale UI publication even if the Store operation completes.

No new Activity lifecycle flag is required for G4 because MainActivity's existing `valid(id)` also checks finishing/destroyed state.

## Existing remote refresh remains asynchronous

`refreshUnifiedCatalog()` already runs on the same requests executor.

G4 does not change:

- Desktop refresh;
- WebDAV refresh;
- favorite/shelf remote sync;
- final local-reference reconciliation after source refresh.

The key change is only the **initial local** reconciliation that previously ran synchronously.

## Preserved behavior

G4 does not change:

- Unified Catalog schema;
- local-reference merge authority;
- shelf/favorite/download availability semantics;
- Library filters/sorting;
- catalog source labels;
- one-refresh-per-session behavior;
- provider/WebDAV refresh logic;
- grid adapter/navigation;
- recommendation evidence semantics.

## Regression contract

The Android Library/Author source contract requires:

- `library()` to create the Library shell before local reconciliation;
- `pending=requests.submit(...)`;
- `UnifiedCatalogStore.reconcileLocalReferences(this)` inside that submitted worker block;
- `runOnUiThread` publication;
- `valid(id)` generation/lifecycle guard;
- no `reconcileLocalReferences` call in the synchronous prefix of `library()`.

Android compile/test/lint/build remains authoritative for Java/API correctness.

## Deliberate non-scope

MainActivity still has other file-backed UI-thread paths that require separate batches:

- Settings/source summary:
  - FavoriteCacheStore load/metadata size;
  - CoverRepository disk size;
  - NativeRecommendationStore load;
  - PhoneDownloadStore load/byte estimation;
  - StoragePolicy usage scan;
- Bookshelves local ShelfStore/Catalog reads;
- Recommendation tab Portable/Catalog/NativeRecommendation reads;
- `openUnified()` Catalog load used to enrich recommendation evidence;
- some filter/sort rerenders that intentionally reuse in-memory state but may re-enter page construction.

G4 does not combine these owners into one large rewrite.

## Next P2-G work

Priority after G4:

1. isolate MainActivity Settings/source-summary file/stat work behind one worker-prepared snapshot;
2. audit AuthorDirectoryActivity creator-concept construction;
3. audit PicaBrowseActivity local Catalog/Semantic/translation work;
4. continue MainActivity Bookshelves/Recommendation tab local-state batches where evidence shows UI-thread I/O;
5. then durable Worker process-death/relaunch and Task Center reconstruction.

Representative Android device timing remains an external evidence gate.
