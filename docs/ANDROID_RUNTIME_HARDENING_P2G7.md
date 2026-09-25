# Android Runtime Hardening — P2 G7

Status: **PicaBrowse result Catalog/Semantic/translation preparation moved off the UI thread**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening.

Dependencies:

- G1–G6 remove the highest-confidence scalable local file/JSON work from Author Works, Comic Detail, Downloads, Main Library, Main Settings and Author Directory UI paths.

## Finding

`PicaBrowseActivity` already used a single-thread worker for:

- Pica search/browse/favorites/leaderboard requests;
- E-H / ExH browse/search;
- provider Catalog merges.

However, every successful result then returned to the UI thread and called:

`showIds(ids, label, pages)`.

That renderer synchronously performed:

- `UnifiedCatalogStore.load(this)`;
- `EhSemanticStore.load(this)`;
- `EhTagTranslationStore.load(this)`.

Therefore provider/network work was asynchronous, but result presentation still parsed local Catalog/Semantic/translation state on the UI thread for each:

- search;
- page switch;
- category;
- leaderboard;
- Pica favorites;
- E-H / ExH result set;
- combined-provider result set.

Two additional paths also re-entered the same UI-thread Store work:

- E-H favorite-slot selection;
- tag-translation database update callback.

## G7 render-state boundary

G7 adds one immutable:

`BrowseRenderState`

containing:

- result IDs;
- status label;
- page count;
- Unified Catalog snapshot;
- E-H Semantic snapshot;
- Tag Translation snapshot.

## prepareRenderState

`prepareRenderState(ids, label, pages)` performs the local file/JSON preparation:

1. copy result IDs;
2. load Unified Catalog;
3. load E-H semantics;
4. load E-H tag translations;
5. return one render state.

This method is called only from the Activity's existing single-thread worker.

No second executor or cache layer is introduced.

## Provider result publication

Provider operations remain on the same worker as before.

After provider merge/result ID collection, the worker now continues directly into:

`prepareRenderState(...)`

before returning to UI.

The UI thread receives only:

`showIds(BrowseRenderState state)`.

The renderer:

- updates last-result metadata;
- clears loading/status;
- reads entries from `state.catalog`;
- derives E-H labels from `state.semantics` and `state.translations`;
- builds cards;
- starts existing asynchronous cover loading.

It opens no Catalog/Semantic/translation Store.

## E-H favorite-slot path

The favorite-category dialog callback originates on the UI thread.

G7 now:

1. derives the selected result IDs/label;
2. shows the existing loading state;
3. submits `publishIds(...)` to the worker.

The local snapshots are therefore prepared off-thread before the favorite subset is rendered.

## Translation update path

`EhTagTranslationStore.scheduleUpdate(...)` posts its completion callback on the main thread.

Before G7, that callback directly re-ran `showIds(...)`, which reloaded all three local Stores on UI.

G7 replaces it with:

`refreshLastRenderedIds()`

which:

- snapshots the current last IDs/label/page count;
- submits worker preparation;
- republishes one `BrowseRenderState`.

A translation-database refresh therefore updates visible cards without returning file/JSON parsing to the main thread.

## Combined-provider partial failure

Combined Pica + E-H/ExH discovery still keeps its existing partial-failure semantics.

The worker prepares the BrowseRenderState first.

The UI callback then:

1. renders the prepared result state;
2. overlays the existing partial-source warning when required.

No result-authority behavior changes.

## Pica favorites write path

`loadFavorites()` already performed its favorite flag Catalog load/save inside the worker.

G7 preserves that write path.

After the favorite Catalog update is saved, the same worker prepares the render snapshot and publishes it.

## Lifecycle boundary

The Activity already owns:

- one single-thread executor;
- `destroyed`;
- `onDestroy() -> worker.shutdownNow()`.

`showIds(BrowseRenderState)` retains the existing destroyed guard.

Because all browse/result work remains serialized on the same worker, G7 does not introduce a second result ordering authority.

## Preserved behavior

G7 does not change:

- provider request semantics;
- Pica/E-H/ExH source selection;
- Catalog merge behavior;
- Pica favorite persistence;
- ExH capability checks;
- category/filter/search semantics;
- result ordering;
- translated tag semantics;
- page navigation;
- card/open behavior;
- CoverRepository behavior.

## Regression contract

The Android Library/Author source contract requires:

- `BrowseRenderState`;
- `prepareRenderState(...)`;
- Catalog/Semantic/Translation Store loads inside worker-side preparation;
- `showIds(BrowseRenderState)`;
- no Store load inside `showIds`;
- no legacy `showIds(ids, label, pages)` renderer signature;
- translation update callback to use worker-side refresh;
- E-H favorite-slot rendering to submit worker preparation.

Android compile/test/lint/build remains authoritative for Java/API correctness.

## Deliberate non-scope

G7 does not address:

- MainActivity Bookshelves local Shelf/Catalog reads;
- MainActivity Recommendation Portable/Catalog/NativeRecommendation reads;
- direct comic-open Catalog lookup;
- History/Reader local Catalog/store calls;
- E-H capability/config preference reads that do not parse the large render snapshots;
- durable Worker process-death/relaunch.

## Next P2-G work

After G7:

1. MainActivity Bookshelves local Shelf/Catalog preparation;
2. MainActivity Recommendation tab local Portable/Catalog/NativeRecommendation preparation;
3. History/Reader local Catalog/store calls;
4. then durable Worker process-death/relaunch, Task Center reconstruction and low-memory/background validation.

Representative Android device latency/jank remains an external evidence gate.
