# Desktop Browser Detail / Shelf / Reader Benchmark — P2 J5

Status: **measurement harness candidate / no foreground browser budget selected**

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-J Performance instrumentation;
- J3 Desktop process startup/shutdown measurement;
- J4 Chromium Home/Library measurement.

## Purpose

J5 extends the Desktop browser performance plane from shell/Library readiness
into common foreground interactions that are still entirely local:

1. Library → comic Detail;
2. Shelves navigation → shelf list;
3. shelf selection → shelf contents;
4. shelf read action → usable local Reader;
5. Reader next-chapter action → usable next chapter.

J5 does not measure provider throughput and does not require real credentials.

## Reused open-source/browser tooling

J5 reuses the same isolated Playwright Chromium toolchain as J4:

`@playwright/test 1.63.0`

Playwright remains outside committed project dependencies and the project
lockfile.

Each measured round uses a new Chromium process, but J5 timing begins only at
the foreground UI action under study. Browser-process launch and Desktop engine
startup remain J4/J3 authorities respectively.

## Local deterministic fixture

J5 adds:

`scripts/benchmark/seed-desktop-browser-detail-reader-fixture.ts`

The fixture is created through public `LibraryDatabase` APIs, not direct SQL.

It creates:
- 3 local favorite/library comics;
- 1 shelf containing 2 comics;
- 2 downloaded chapters for the first comic;
- 3 valid local PNG pages per chapter.

The downloaded page files live inside the configured isolated Library root and
are registered through `markPictureDownloaded()`, so Reader path safety uses
the normal production contract.

The fixture is written before the first Desktop process starts. The normal
Desktop setup flow later points `libraryDirectory` at that already-prepared
isolated Library, so no live SQLite database is edited behind a running engine.

## Desktop runner

`scripts/run-desktop-browser-detail-reader-harness.mjs` follows J4 safety:

1. build the repository;
2. create isolated Desktop home and Library roots;
3. seed the local fixture;
4. install pinned Playwright/Chromium into a temporary tool root;
5. start the built Desktop engine;
6. verify credential backend is isolated-safe:
   - Windows DPAPI under the isolated Desktop home; or
   - session-memory;
7. persist synthetic local settings through the real Desktop API;
8. use dead loopback proxy `127.0.0.1:9`;
9. wait for configured restart;
10. run the browser benchmark;
11. request normal Desktop graceful shutdown;
12. delete all temporary roots.

The runner refuses macOS Keychain, Linux Secret Service and unknown credential
backends so the benchmark cannot overwrite a developer's real system credential
entry.

## Measured boundaries

### Library → Detail

Action:

`[data-library-detail="<fixture comic>"]`

Ready when:
- `#recommend-detail-dialog` is open;
- its `data-comic-id` matches the fixture;
- `#recommend-detail-content h2` matches the fixture title.

Metric:

`libraryDetailClickToUsableMs`

This does not wait for preview generation or provider requests.

### Shelves navigation → shelf list

Action:

`nav [data-view="shelves"]`

Ready when:
- the Shelves view is active;
- the fixture shelf button exists;
- its visible label contains the fixture shelf name.

Metric:

`shelvesClickToListUsableMs`

### Shelf open → shelf contents

Action:

`[data-shelf-open="<fixture shelf>"]`

Ready when:
- `#shelf-detail h3` matches the fixture shelf;
- the fixture comic's local read button exists and is enabled.

Metric:

`shelfOpenClickToUsableMs`

### Shelf → Reader first chapter

Action:

`[data-shelf-read="<fixture comic>"]`

Ready when:
- Reader view is active;
- title matches the fixture comic;
- chapter heading contains `J5 第一章`;
- all 3 expected page images exist;
- every image has completed decoding with `naturalWidth > 0`.

Metric:

`shelfReadClickToReaderUsableMs`

The image-complete requirement deliberately includes local page serving and
browser image decode in Reader usability.

### Reader → next chapter

Action:

`#reader-next-chapter`

Ready when the same Reader conditions hold for `J5 第二章`.

Metric:

`readerNextChapterClickToUsableMs`

## Machine-readable output

Default:

`test-results/desktop-browser-detail-reader/desktop-browser-detail-reader-benchmark.json`

The report contains:
- commit;
- platform / arch / Node / CPU / memory;
- Chromium version;
- fixed viewport/language protocol;
- non-identifying fixture shape;
- raw samples;
- min / median / max summaries.

The report does **not** include:
- loopback URL/port;
- comic IDs;
- shelf IDs;
- temporary Desktop/Library/tool paths;
- CSRF token;
- synthetic credentials;
- Provider credentials.

## CI harness validation

Workflow:

`.github/workflows/desktop-browser-detail-reader-harness.yml`

CI runs two rounds with `--harness-validation-only`.

Hosted Ubuntu timing proves only:
- fixture creation works;
- real Desktop startup/configuration works;
- Detail/Shelf/Reader browser journeys remain executable;
- readiness signals remain valid.

It is not P2-K reference evidence.

## Reference Windows use

Run:

`node scripts/run-desktop-browser-detail-reader-harness.mjs --rounds=7`

Record alongside J3/J4:
- machine/CPU;
- Windows version;
- display/refresh configuration;
- power mode;
- commit;
- rounds;
- min/median/max.

Use the same machine/build context where possible so:
- J3 isolates Desktop process cost;
- J4 isolates browser shell/Library cost;
- J5 isolates local foreground Detail/Shelf/Reader interactions.

## Remaining P2-J work

After J5 source/harness acceptance:

1. collect representative Windows x64 J3/J4/J5 evidence;
2. measure recommendation generation and batch switching separately;
3. capture long Reader memory/jank rather than only short chapter transitions;
4. pair J2 foreground API latency with real download/WebDAV/Visual workloads;
5. combine with Android physical G18/G19 evidence before P2-K budgets.

No performance threshold is selected by J5.
