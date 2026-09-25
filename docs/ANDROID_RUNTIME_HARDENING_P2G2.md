# Android Runtime Hardening — P2 G2

Status: **Comic Detail first-frame local file/JSON work moved to the existing executor**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening.

Dependency: G1 moved Author Works Catalog/Semantic/creator rebuilds off the UI thread.

## Finding

`UnifiedComicDetailActivity` is a high-frequency navigation destination from:

- Library;
- Recommendations;
- Downloads;
- History;
- Author Works;
- search/browse results.

Before G2, its `onCreate()` immediately performed:

`UnifiedCatalogStore.load(this)`

on the UI thread.

The full render then synchronously performed additional scalable local work.

### Creator summary

`authorSummary()` called:

`AuthorConceptStore.build(this)`

which itself loads the complete Unified Catalog and E-H semantic store before rebuilding creator concepts.

### E-H semantic tag display

`tagLine()` called:

- `EhSemanticStore.get(this, entry.id)`, which reloads/parses the semantic JSON;
- `EhTagTranslationStore.load(this)`, whose first load can read/parse the translation database.

### Phone download presence

`resolveSources()` called:

`PhoneDownloadStore.has(this, entry.id)`

before submitting source probes.

That loads/parses the complete phone-download index and checks stored page URIs.

### Work variant cards

`workVariantEntry()` called:

`UnifiedCatalogStore.load(this)`

for each variant row while rendering the expanded same-work list.

Therefore opening one comic could synchronously parse the local Catalog multiple times before/while the detail UI became interactive.

## G2 local-detail pipeline

G2 reuses the Activity's existing fixed worker pool.

### Lightweight shell

`onCreate()` now reads only Intent fields and creates a fallback `UnifiedCatalogStore.Entry`.

It immediately displays a lightweight loading shell containing:

- back navigation;
- detail title;
- progress indicator;
- fallback comic title.

It does not read Catalog, semantic or download-index files.

### LocalDetailState

One worker-owned handoff object contains:

- Unified Catalog snapshot;
- resolved comic entry;
- derived creator summary;
- derived display tag line;
- phone-download availability;
- initial E-H favorites snapshot when relevant.

### readLocalDetailState

The worker performs one local preparation pipeline:

1. load Unified Catalog once;
2. resolve the requested comic or keep the Intent fallback entry;
3. load E-H semantic snapshot once;
4. build Author concepts from those already-loaded snapshots;
5. derive creator display text;
6. derive translated E-H tag display when needed;
7. check phone-download availability;
8. load E-H favorite metadata when the comic is E-H.

The Activity then publishes the complete prepared state to the UI thread once.

## Full detail render

Only after LocalDetailState is available does the Activity run the existing full `render()`.

The render path now reads:

- `localAuthorSummary`;
- `localTagLine`;
- `ehFavoriteSnapshot`;
- `catalogSnapshot`.

It no longer performs the corresponding file/JSON loads itself.

## Source probing

`resolveSources(boolean phoneDownloaded)` receives the already-computed phone-download state.

The existing provider/source probes remain asynchronous on the worker pool.

No provider request is moved onto the UI thread.

## Same-work variants

`workVariantEntry()` now resolves cached comics from the already-loaded `catalogSnapshot`.

It no longer opens/parses Unified Catalog once per work-variant card.

Rows not present in that snapshot still use the existing API-row fallback construction.

## E-H favorites

The initial action rendering uses the E-H favorite snapshot prepared in LocalDetailState.

User-triggered favorite-menu operations may still reload/write the favorite store; those are explicit interaction paths and are not part of the first-frame G2 scope.

After an asynchronous E-H remote-favorite update, G2 refreshes the cached E-H favorite snapshot before returning to UI.

## Existing background paths preserved

The following remain asynchronous as before:

- Work Variant API/portable resolution;
- Pica source probing;
- E-H source probing;
- Desktop/remote reader probes;
- Pica favorite mutation;
- E-H remote favorite mutation;
- shelf sync.

## Preserved semantics

G2 does not change:

- detail metadata;
- creator identity rules;
- tag translation rules;
- source priority;
- chapter ordering;
- cover loading;
- same-work relation labels;
- favorite state semantics;
- shelf behavior;
- recommendation item controls.

## Regression contract

The Android author/history contract now requires:

- `LocalDetailState`;
- worker-owned `readLocalDetailState`;
- Unified Catalog + E-H semantic + AuthorConcept + PhoneDownload work inside that pipeline;
- no Unified Catalog / AuthorConcept / PhoneDownload call in `onCreate()`;
- no AuthorConcept build in `authorSummary()`;
- no semantic/translation store call in `tagLine()`;
- no Catalog load inside `workVariantEntry()`;
- no PhoneDownloadStore.has inside `resolveSources()`.

Android compile/lint/build remains authoritative for lifecycle/API correctness.

## Deliberate non-scope

G2 does not yet address explicit user-action paths that still contain file-backed Store calls, including:

- opening the E-H favorite menu;
- local favorite writes;
- shelf chooser/load/write;
- some source-detail dialogs.

Those are lower priority than first-frame and scrolling/navigation stalls and remain auditable later.

## Next P2-G work

Priority after G2:

1. DownloadsActivity: move PhoneDownloadStore load + full page-size stat calculation off the UI thread and avoid duplicate index loads;
2. AuthorDirectoryActivity: move creator-concept build off the UI thread if still synchronous;
3. PicaBrowse result rendering: move Catalog/Semantic/translation loads off the UI thread;
4. lower-frequency Theme/About/Recommendation settings first-use file reads;
5. then durable Worker/process-death and Task Center reconstruction audit.

Representative Android device performance remains an external evidence gate.
