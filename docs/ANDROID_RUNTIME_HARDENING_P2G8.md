# Android Runtime Hardening — P2 G8

Status: **MainActivity Bookshelves Shelf/Catalog preparation moved off the UI thread**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening.

Dependencies:

- G1–G7 move the highest-confidence scalable local file/JSON work off Android Activity render paths.

## Finding

`MainActivity.bookshelves()` previously synchronously performed:

- `ShelfStore.load(this)`;
- `RemoteConfigStore.load(this)`.

It then called `renderShelves(...)`, whose UI renderer synchronously performed:

- `UnifiedCatalogStore.load(this)`.

The WebDAV refresh path had two additional issues:

1. after `ShelfStore.save(this, snapshot)`, it explicitly called
   `UnifiedCatalogStore.reconcileLocalReferences(this)` again even though
   `ShelfStore.save()` already performs that reconciliation;
2. the failure UI callback called `ShelfStore.load(this)` on the UI thread before rendering fallback state.

## G8 ShelfPageState

G8 introduces one immutable page handoff:

`ShelfPageState`

containing:

- ShelfStore Snapshot;
- Unified Catalog Snapshot;
- optional remote Catalog map;
- source label;
- whether WebDAV is configured.

## Initial local page

The Bookshelves page now renders immediately:

- title;
- toolbar;
- status placeholder;
- content container.

Then the existing MainActivity `requests` executor runs:

`readLocalShelfState()`

which prepares:

1. `ShelfStore.load(this)`;
2. `UnifiedCatalogStore.load(this)`;
3. `RemoteConfigStore.load(this).configured()`.

One state object is published through the existing `serial/valid(id)` page-generation guard.

Only after local state is rendered does the existing one-refresh-per-session decision start WebDAV refresh.

## Remote success path

The existing WebDAV request remains worker-owned.

After downloading shelves:

1. `ShelfStore.save(this, shelves)`;
2. load the now-reconciled Unified Catalog;
3. optionally load remote Catalog rows for cloud availability;
4. build one ShelfPageState;
5. publish to UI.

G8 removes the explicit second:

`UnifiedCatalogStore.reconcileLocalReferences(this)`

because `ShelfStore.save()` already invokes local-reference reconciliation.

The subsequent Catalog load is a read used for UI availability labels, not another reconciliation.

## Remote failure path

Before G8, the catch block returned to UI and then loaded ShelfStore synchronously.

G8 keeps fallback preparation on the worker:

`ShelfPageState fallback = readLocalShelfState()`.

Only the prepared fallback state is published to UI.

The existing labels remain:

- 书架尚未同步到云端;
- 云端暂不可用 · 正在使用本地书架缓存.

## UI-only render boundary

`renderShelves(..., ShelfPageState state)` now performs no Store reads.

It consumes:

- `state.shelves`;
- `state.catalog`;
- `state.remote`;
- `state.sourceLabel`.

Availability labels preserve the existing priority:

1. cloud-readable;
2. phone-downloaded;
3. Desktop-downloaded;
4. Pica online;
5. metadata-only.

## Existing page lifecycle

G8 reuses MainActivity's existing:

- `pending` Future;
- `serial`;
- `valid(id)`;
- `cancelPageWork()`.

Switching tabs invalidates/cancels the page-owned work.

No new executor or lifecycle authority is added.

## Preserved behavior

G8 does not change:

- Shelf schema;
- ShelfStore save/delete/membership semantics;
- active shelf persistence;
- shelf ordering;
- WebDAV client behavior;
- remote Catalog usage;
- card/open behavior;
- availability priority;
- manual refresh button;
- one-refresh-per-session policy.

## Regression contract

The Android Library/Author contract requires:

- `ShelfPageState`;
- worker-owned `readLocalShelfState()`;
- no Shelf/Catalog/RemoteConfig Store reads before the initial worker submit;
- no Store reads inside `renderShelves()`;
- WebDAV success to load Catalog after `ShelfStore.save()`;
- no duplicate explicit `reconcileLocalReferences()` in the refresh path;
- WebDAV failure to prepare fallback state on the worker.

Android compile/test/lint/build remains authoritative for Java/API correctness.

## Deliberate non-scope

G8 does not yet address:

- MainActivity Recommendation tab local Portable/Catalog/NativeRecommendation reads;
- direct comic-open Catalog lookup;
- History/Reader local Catalog/store calls;
- repeated shelf-tab page reconstruction, which is now non-blocking but can be revisited only with evidence;
- durable Worker process-death/relaunch.

## Next P2-G work

After G8:

1. MainActivity Recommendation tab local-state preparation;
2. direct-open and History/Reader local Catalog/store paths;
3. then durable Worker process-death/relaunch, Task Center reconstruction and low-memory/background validation.

Representative Android device timing remains an external evidence gate.
