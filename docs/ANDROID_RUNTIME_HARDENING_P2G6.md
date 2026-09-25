# Android Runtime Hardening — P2 G6

Status: **AuthorDirectory creator-concept construction moved off the UI thread**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening.

Dependencies:

- G1 moved Author Works Catalog/Semantic/creator reconstruction off the UI thread.
- G2 moved Comic Detail first-frame local state off the UI thread.
- G3 moved Downloads persistent-index/stat work off the UI thread.
- G4 moved Main Library local-reference reconciliation off the UI thread.
- G5 moved Main Settings summary file/stat work off the UI thread.

## Finding

`AuthorDirectoryActivity` previously executed:

`snapshot = AuthorConceptStore.build(this)`

inside `onCreate()`.

That call is not a cheap in-memory transform.

`AuthorConceptStore.build(Context)` performs:

1. `UnifiedCatalogStore.load(context)`;
2. `EhSemanticStore.load(context)`;
3. creator-concept construction across the complete local catalog;
4. provider-specific person/group binding and alias indexing.

The Activity therefore blocked its first frame on two file/JSON loads plus a catalog-wide creator rebuild before the author directory UI appeared.

## G6 change

G6 adds one Activity-local single-thread executor.

### UI-first shell

`onCreate()` now:

1. applies the existing window/UI policy;
2. reads only the focused comic ID from the Intent;
3. calls `render()`;
4. schedules `loadSnapshot()`.

`render()` builds immediately:

- back navigation;
- title;
- author search field;
- ScrollView/list container.

While the creator snapshot is unavailable, `renderList()` shows a lightweight loading state.

The search field remains usable while loading.

### Worker-owned creator snapshot

`loadSnapshot()` captures a generation and submits:

1. `UnifiedCatalogStore.load(this)`;
2. `EhSemanticStore.load(this)`;
3. `AuthorConceptStore.build(catalog, semantics)`.

Using the snapshot-based build path makes the file/JSON authority explicit and avoids any hidden extra Store reload through `AuthorConceptStore.build(this)`.

The completed snapshot is published once on the UI thread.

## Search behavior while loading

Text changes continue to call `renderList()`.

Before the snapshot arrives:

- the list remains in loading state;
- no file/JSON work is triggered by typing.

After publication:

- `renderList()` reads the current search text;
- focused-author and directory filtering behave exactly as before.

## Lifecycle / stale publication boundary

G6 adds:

- `destroyed`;
- `loadGeneration`.

Every snapshot publication checks:

`destroyed || generation != loadGeneration`

before touching the UI.

`onDestroy()`:

- marks the Activity destroyed;
- advances the generation;
- calls `worker.shutdownNow()`.

A slow Catalog/Semantic load therefore cannot publish into a destroyed Activity.

## Preserved behavior

G6 does not change:

- creator identity rules;
- canonical names;
- aliases;
- circle/group handling;
- Pica/E-H source labels;
- “本作作者” grouping;
- search matching;
- 120-entry display cap;
- Author Works navigation;
- focused comic behavior.

## Regression contract

The Android Library/Author source contract requires:

- one Activity-local single-thread executor;
- `loadSnapshot()`;
- explicit Catalog + Semantic loads inside the worker;
- `AuthorConceptStore.build(catalog, semantics)`;
- no `AuthorConceptStore.build(this)`;
- no Catalog/Semantic/AuthorConcept build in `onCreate()`;
- loading UI before the snapshot is ready;
- lifecycle/generation guard;
- executor shutdown on destroy.

Android compile/test/lint/build remains authoritative for Java/API/lifecycle correctness.

## Deliberate non-scope

G6 does not yet address:

- PicaBrowseActivity local Catalog/Semantic/translation work;
- MainActivity Bookshelves local Shelf/Catalog reads;
- MainActivity Recommendation tab Portable/Catalog/NativeRecommendation reads;
- MainActivity direct-open Catalog lookup for recommendation evidence;
- History/Reader local Catalog/store calls;
- durable Worker process-death/relaunch behavior.

These remain separate owner-level batches.

## Next P2-G work

After G6:

1. audit/fix `PicaBrowseActivity` local Catalog/Semantic/translation preparation;
2. return to MainActivity Bookshelves/Recommendation local-state owners;
3. audit History/Reader local file calls;
4. then move to durable Worker process-death/relaunch and Task Center reconstruction.

Representative Android device timing remains an external evidence gate.
