# Android Runtime Hardening — P2 G1

Status: **first Android main-thread file/JSON hotspot removed from Author Works; broader Activity/Worker audit remains open**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening.

## Architecture reference

G1 keeps the project’s existing Android architecture rather than introducing another task framework.

The repository already uses:

- WorkManager for durable background jobs;
- Activity-local executors for short-lived screen work;
- persistent Store classes for reconstructible state;
- main-thread handlers only for UI publication.

The Android runtime audit therefore applies the same boundary:

> file / JSON / SQLite / provider work that scales with library size must not execute synchronously from Activity render/onCreate paths.

## Main-thread audit findings

The first audit separated cheap preference reads from data stores that perform real file/JSON work.

### Confirmed heavy local stores

#### UnifiedCatalogStore

`UnifiedCatalogStore.load(Context)`:

- opens `unified-catalog-v1.json`;
- reads the complete file;
- parses the root JSONObject;
- parses every catalog entry into a Snapshot.

This work scales with total catalog size.

#### EhSemanticStore

`EhSemanticStore.load(Context)`:

- reads `eh-semantics-v1.json`;
- parses every semantic record and raw tag.

This also scales with the local E-H catalog.

#### PhoneDownloadStore

`PhoneDownloadStore.load(Context)`:

- reads/parses the full phone download index.

Some callers additionally stat every stored page URI through `estimatedBytes()` or readability checks.

#### ThemePackStore

`ThemePackStore.list(Context)` may:

- materialize the bundled theme on first use;
- scan theme directories;
- read/parse manifests and component JSON.

This is a lower-frequency Settings/appearance path but still real disk work.

### Stores not automatically classified as heavy

Account/capability/config stores backed by SharedPreferences are not moved off-thread merely because they expose a `load()` method.

P2-G changes only paths with evidence of scalable file/JSON/database/network work.

## G1 finding: AuthorWorksActivity

Before G1, `AuthorWorksActivity` performed the heaviest creator-page local work directly on the UI thread.

### onCreate

The Activity called:

`AuthorConceptStore.build(this)`

before rendering the shell.

That call itself performs:

1. `UnifiedCatalogStore.load(context)`;
2. `EhSemanticStore.load(context)`;
3. creator-concept construction across the catalog.

### renderWorks

Every render/filter refresh then called:

- `AuthorConceptStore.build(this)` again;
- `UnifiedCatalogStore.load(this)` again.

A single initial page open therefore could parse the same Catalog/Semantic data repeatedly before/while online refresh began.

### online refresh completion

Although provider search itself already ran on the Activity’s executor, its completion callback returned to the UI thread and called:

`AuthorConceptStore.build(this)`

before calling `renderWorks()`, which previously rebuilt again.

Therefore the existing executor did not protect the expensive local rebuild path.

## G1 change

G1 reuses the Activity’s existing single-thread executor.

### LocalState

One immutable handoff object contains:

- `UnifiedCatalogStore.Snapshot catalog`;
- the resolved `AuthorConceptStore.Concept` for this page.

### readLocalState

This method is executed on the worker and performs exactly one local snapshot pipeline:

1. load Unified Catalog;
2. load E-H semantics;
3. build Author concepts from those already loaded snapshots;
4. select the requested concept.

It intentionally calls:

`AuthorConceptStore.build(nextCatalog, semantics)`

instead of `AuthorConceptStore.build(this)` so Catalog is not loaded twice.

### Activity startup

`onCreate()` now:

1. applies window/UI;
2. reads only the requested concept ID from the Intent;
3. renders the lightweight shell;
4. schedules `loadLocalState(true)`.

The shell can display immediately with a loading status while disk/JSON work runs on the executor.

### renderWorks

`renderWorks()` is now an in-memory render function.

It consumes:

- current `concept`;
- current `catalog`;
- current filter mode.

It performs no Store loads or AuthorConcept rebuild.

### online refresh

Provider refresh remains on the existing worker.

After provider merges finish, the same worker runs one `readLocalState()` and then publishes the rebuilt state to the UI thread once.

The UI callback only:

- clears `refreshing`;
- assigns the new snapshots;
- renders.

## Generation/lifecycle boundary

Initial local loads use `localLoadGeneration`.

When the Activity is destroyed:

- `destroyed = true`;
- generation is advanced;
- executor is shut down.

A stale initial local-state completion therefore cannot publish into a destroyed Activity.

The existing provider refresh path retains its destroyed check before UI publication.

## Preserved behavior

G1 does not change:

- creator identity rules;
- Pica/E-H/ExH source filtering;
- online provider search queries;
- catalog merge semantics;
- ordering by `updatedAt`;
- refresh button behavior;
- result item navigation;
- ExH optional-capability behavior.

## Regression contract

The Android Library/Author source contract requires:

- a worker-owned `LocalState` pipeline;
- exactly the snapshot-based AuthorConcept build path in that pipeline;
- no `AuthorConceptStore.build(this)` in AuthorWorksActivity;
- no UnifiedCatalog/EhSemantic/AuthorConcept load/build calls inside `renderWorks()`;
- `onCreate()` to render the shell before scheduling local-state loading.

The normal Android compile/test/lint/build gate remains authoritative for lifecycle/API correctness.

## Deliberate non-scope

G1 does not yet fix other confirmed heavy UI-thread paths, including:

- UnifiedComicDetailActivity initial full Catalog load and creator summary build;
- AuthorDirectoryActivity if its creator model is built synchronously;
- DownloadsActivity full PhoneDownloadStore load + estimated byte scan;
- first-use ThemePackActivity theme-pack materialization/listing;
- first-use AboutActivity E-H translation file load;
- NativeRecommendationStore file reads on recommendation UI surfaces.

These are queued for later G batches and should be fixed in user-impact order.

## Next P2-G work

Priority after G1:

1. audit/fix UnifiedComicDetailActivity startup, especially full Catalog + creator-summary work and PhoneDownloadStore.has on the UI thread;
2. move DownloadsActivity download-index/size calculation off the UI thread;
3. audit AuthorDirectoryActivity creator-concept construction;
4. then lower-frequency Theme/About/Recommendation settings file reads;
5. separately inventory durable Workers for process-death/relaunch correctness and Task Center reconstruction.

Android concurrency/resource budgets remain evidence-gated until representative device measurements exist.
