# Desktop Reader Long-session Benchmark — P2 J6

Status: **measurement harness candidate / no Reader memory or jank budget selected**

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-J Performance instrumentation;
- J5 local Detail/Shelf/Reader benchmark;
- P2-K real benchmark matrix and evidence-driven budgets.

## Purpose

J5 measures one local Reader open and one next-chapter transition.

J6 extends that same fully local fixture into a **single long-lived Chromium Reader
session** so the project can observe whether repeated Reader work causes:

- retained JavaScript heap growth;
- retained embedder/backing-store growth;
- accumulating DOM nodes/documents/event listeners;
- degrading chapter-switch readiness time;
- degrading main-thread `requestAnimationFrame` cadence during controlled
  Reader scrolling.

J6 is measurement infrastructure only. It does not define a budget or modify
Reader runtime behavior.

## Reused isolation/tooling

J6 deliberately does not duplicate the J5 Desktop/Playwright setup stack.

`scripts/run-desktop-browser-detail-reader-harness.mjs` now accepts an
optional:

`--benchmark-script=<path>`

The default remains the J5 benchmark script, so J5 behavior is unchanged.

J6 uses:

`scripts/run-desktop-reader-long-session-harness.mjs`

as a thin wrapper that reuses the J5 runner for:

- production build;
- isolated Desktop home;
- deterministic local J5 fixture;
- isolated synthetic credential backend;
- dead loopback Provider proxy;
- pinned temporary Playwright Chromium 1.63.0;
- normal Desktop graceful shutdown;
- temporary-root cleanup.

Playwright remains outside project/package dependencies.

## Session protocol

Default reference run:

`40` chapter-switch cycles.

One Chromium process/context/page stays alive for the full session.

The Reader is opened through the same real UI path as J5:

1. Home ready;
2. Shelves;
3. fixture shelf;
4. shelf local-read action;
5. first local chapter fully decoded.

The session then alternates:

- `#reader-next-chapter`;
- `#reader-prev-chapter`.

Every switch requires the normal Reader readiness contract:

- Reader view active;
- comic title correct;
- expected chapter title visible;
- exactly the expected local page images present;
- every image complete with `naturalWidth > 0`.

## Memory/retention observation

J6 uses a Chromium CDP session from Playwright.

Before each retained-memory sample:

`HeapProfiler.collectGarbage`

is requested so the sample is less dominated by ordinary collectible garbage.

Collected CDP fields:

### Runtime heap

`Runtime.getHeapUsage`

- JS heap used bytes;
- JS heap total bytes;
- embedder heap used bytes;
- backing-storage bytes.

### DOM counters

`Memory.getDOMCounters`

- documents;
- nodes;
- JavaScript event listeners.

### Cumulative page work counters

`Performance.getMetrics`

- LayoutCount;
- RecalcStyleCount.

The report records the baseline, periodic samples, final sample, peaks and
final-minus-baseline deltas.

## Critical scope limitation

J6 memory is **not full Chromium process RSS**.

It intentionally reports:

> Chromium Runtime/DOM counters only; not full browser-process RSS

The result can identify likely retained browser-page state, but it does not
claim to cover:

- Chromium renderer/native allocations outside exposed CDP fields;
- GPU process memory;
- decoded image memory owned outside the measured Runtime/DOM counters;
- OS working set/private bytes;
- complete Desktop Node process memory.

Representative Windows P2-K evidence should later add process-level memory
capture if a real budget requires it.

## Controlled Reader scrolling / RAF cadence

After each chapter becomes usable, J6 performs a bounded vertical scroll wave
inside the real Reader document.

A `requestAnimationFrame` loop records frame-to-frame intervals during that
scroll.

Per-cycle report includes:

- interval min/median/p95/max;
- sample count;
- count of observed intervals above 34 ms.

The 34 ms count is a descriptive signal only. It is **not** an approved frame
budget.

Critical limitation:

> requestAnimationFrame interval observation during controlled Reader scrolling;
> not compositor frame telemetry

J6 therefore must not be described as a full Chrome compositor-jank benchmark.

## Machine-readable output

Default:

`test-results/desktop-reader-long-session/desktop-reader-long-session-benchmark.json`

Includes:

- commit;
- platform/arch/Node/CPU/memory environment metadata;
- Chromium version;
- protocol metadata;
- non-identifying fixture shape;
- periodic memory/DOM samples;
- chapter-switch latency samples;
- scroll RAF interval samples;
- retention deltas/peaks;
- descriptive summaries.

Does not include:

- loopback URL/port;
- comic/shelf IDs;
- temporary Desktop/Library/tool paths;
- CSRF token;
- credentials;
- Provider account data.

## CI harness validation

Workflow:

`.github/workflows/desktop-reader-long-session-harness.yml`

CI runs only:

- 6 chapter-switch cycles;
- `--harness-validation-only`;
- hosted Chromium.

The CI run proves:

- the reused J5 isolated runner still works;
- Chromium CDP domains are available;
- Reader navigation remains executable;
- the memory/DOM/RAF report can be emitted.

Hosted-runner values are not P2-K reference data and do not select thresholds.

## Reference Windows use

Suggested first representative run:

```bash
node scripts/run-desktop-reader-long-session-harness.mjs --cycles=80
```

Run alongside J3/J4/J5 on the same machine/build context where practical.

Record:

- Windows version/build;
- CPU/model;
- physical memory;
- display refresh rate;
- power mode;
- commit;
- cycle count;
- browser version;
- raw machine-readable J6 report.

If the retention curve is unclear, repeat the same protocol instead of changing
cycle count/fixture between candidate and baseline.

## Acceptance

Source/harness acceptance requires:

- J5 runner default behavior preserved;
- J6 reuses J5 isolation instead of cloning credential/setup logic;
- one real browser session survives repeated chapter switches;
- Reader image readiness is enforced every cycle;
- CDP heap/DOM metrics are sampled after requested GC;
- scroll RAF intervals are recorded descriptively;
- no budget/threshold is selected;
- CI smoke is harness-only.

## Next

After J6 source/harness acceptance:

1. run J3–J6 on representative Windows x64;
2. compare Reader memory/DOM retention across repeated runs;
3. add full process RSS/working-set measurement only if P2-K needs a formal
   memory budget;
4. separately instrument Recommendation generation vs batch switch;
5. continue loaded foreground scenarios for downloads/WebDAV/Visual using the
   existing J1/J2 resource-overlap framework.

J6 does not authorize P2-K budgets or P2 completion.
