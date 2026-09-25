# Android Runtime Hardening — P2 G9

Status: **MainActivity Recommendation initial Portable/Catalog/NativeRecommendation preparation moved off the UI thread**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening.

Dependencies:

- G1–G8 move the highest-confidence scalable local file/JSON work off Android Activity render paths.

## Finding

`MainActivity.recommendations()` previously mixed page construction with several persistent/local state operations.

### Portable package

`PortableRecommendationPackageStore.load(this)`

may read and parse the Desktop-prepared portable recommendation package on first access or after file change.

### Unified Catalog

`UnifiedCatalogStore.load(this)`

parses the full local Catalog.

The page then scanned the Catalog to determine whether local favorite/shelf/download/remote/Pica evidence exists.

### Provider availability

`PicaClient.available(this)`

reads local/desktop account availability state.

### Native recommendation cycle

`NativeRecommendationStore.load(this)`

parses the persisted Android recommendation cycle.

When a cycle existed, opening the tab also synchronously executed:

`NativeRecommendationStore.markCurrentSeen(this)`

which can:

- reload the native cycle;
- record impression evidence;
- save the updated cycle.

The page then loaded the native cycle again before rendering.

All of this occurred on the UI thread before the Recommendation cards were drawn.

## G9 RecommendationPageState

G9 introduces one immutable page handoff:

`RecommendationPageState`

containing:

- PortableRecommendationPackageStore Snapshot;
- prepared NativeRecommendationStore Snapshot;
- `canRun` input-readiness decision.

## readRecommendationPageState

The existing MainActivity `requests` executor performs:

1. load Portable recommendation package;
2. load Unified Catalog;
3. scan the Catalog for local evidence;
4. consult RecommendationFeedbackStore likes as part of that scan;
5. evaluate Pica/portable availability;
6. load the native recommendation cycle;
7. if a cycle is available, run `markCurrentSeen()`;
8. reload the native cycle after impression persistence;
9. return one RecommendationPageState.

Therefore initial native-cycle evidence persistence remains authoritative but no longer blocks the UI thread.

## UI-first Recommendation shell

`recommendations()` now synchronously creates only:

- page heading/subtitle;
- loading text;
- content container.

It captures the current MainActivity `serial` generation and submits the state preparation to `requests`.

The completed state is published only when:

`valid(id)`

remains true.

Switching tabs cancels/invalidates the page-owned Future through the existing `cancelPageWork()` authority.

## UI-only render boundary

`renderRecommendationPage(target, state)` consumes only prepared state.

It decides:

- Generate vs Regenerate button label;
- missing-input guidance;
- Portable reservoir guidance;
- current batch controls;
- current recommendation cards.

It performs no Portable/Catalog/NativeRecommendation load and no `markCurrentSeen()`.

## Existing batch rendering

`renderNativeRecommendationBatch(snapshot)` remains in-memory UI rendering.

The existing `recommendationBatchStatus` and `recommendationBatchList` fields are initialized only after a prepared available cycle is published.

## Explicit batch-switch actions

`switchNativeRecommendationBatch()` still calls:

- `NativeRecommendationStore.previousBatch(this)`; or
- `NativeRecommendationStore.nextBatch(this)`.

Those are explicit user interaction paths that include persistence/evidence work.

G9 deliberately does not combine that interaction rewrite with first-frame state preparation.

It remains a later auditable path.

## Preserved behavior

G9 does not change:

- Portable package schema;
- can-run semantics;
- local evidence rules;
- Pica availability semantics;
- native recommendation cycle schema;
- impression evidence authority;
- Generate/Regenerate behavior;
- RecommendationStyle navigation;
- RecommendationSync navigation;
- result ordering;
- batch contents/reason/score display.

## Regression contract

The Android Library/Author contract requires:

- `RecommendationPageState`;
- `readRecommendationPageState()`;
- Portable/Catalog/NativeRecommendation loads inside worker-side preparation;
- `markCurrentSeen()` inside that preparation;
- `pending=requests.submit(...)`;
- `valid(id)` UI publication;
- no Portable/Catalog/NativeRecommendation load or `markCurrentSeen()` in the synchronous Recommendation UI prefix;
- no such Store work inside `renderRecommendationPage()`.

Android compile/test/lint/build remains authoritative for Java/API correctness.

## Deliberate non-scope

G9 does not yet address:

- Previous/Next batch persistence on button click;
- MainActivity direct-open Catalog lookup for recommendation evidence;
- History/Reader local Catalog/store calls;
- durable NativeRecommendation Worker process-death/relaunch;
- Task Center reconstruction.

## Next P2-G work

After G9:

1. audit MainActivity direct-open and History/Reader local Catalog/store calls;
2. separately audit Previous/Next recommendation batch persistence if device traces show interaction jank;
3. then move to durable Worker process-death/relaunch, Task Center reconstruction and low-memory/background validation.

Representative Android device latency/jank remains an external evidence gate.
