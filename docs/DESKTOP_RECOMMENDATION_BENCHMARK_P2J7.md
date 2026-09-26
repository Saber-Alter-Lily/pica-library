# Desktop Recommendation Generation / Batch Benchmark — P2 J7

Status: **SOURCE/HARNESS PASS / merged as PR #184 / recommendation generation and batch switching remain separate metrics**

Accepted source/harness evidence before merge:
- Desktop Recommendation Benchmark Harness `36228962705`: PASS;
- P2 Runtime Hardening Promotion Gate `36228962691`: PASS;
- Desktop Startup Harness `36228962718`: PASS;
- Desktop Browser Home Harness `36228962698`: PASS;
- Desktop Browser Detail Reader Harness `36228962715`: PASS;
- Desktop Reader Long Session Harness `36228962707`: PASS;
- Android Macrobenchmark Build `36228962712`: PASS;
- normal CI `36228962722`: PASS;
- G16 memory/background regression `36228962702`: PASS;
- G15 force-stop regression `36228962741`: PASS;
- merged commit: `5750a52d671c9e6db1854d84897c263cb5f26ad0`.

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-J Performance instrumentation;
- J3 process startup/shutdown;
- J4 Home/Library browser timing;
- J5 Detail/Shelf/Reader browser timing.

## Purpose

P2-J explicitly requires Recommendation generation and Recommendation batch
switching to be measured separately.

Those paths have different owners and cost models:

- generation can perform Provider retrieval, ranking, SQLite writes and cycle
  publication;
- an already-built managed V3 next batch is a local serving/allocation/UI path.

J7 therefore creates two independent harnesses and never reports one as a proxy
for the other.

## Reused tooling

J7 reuses:
- production `LibraryDatabase`;
- production `CycleCoordinatorV3`;
- production managed-V3 `/api/v1/recommendations` UI flow;
- the J4/J5 temporary Playwright Chromium 1.63.0 tool-root pattern;
- the I1/I2 Desktop-only structured task diagnostic endpoint for validating
  real generation resource ownership.

Playwright is not added to project dependencies or the lockfile.

## J7A — deterministic local managed-V3 batch switching

### Fixture

`scripts/benchmark/seed-desktop-recommendation-benchmark-fixture.ts`

creates an isolated local Library before Desktop startup.

It:
- imports 72 non-favorite local candidates through `LibraryDatabase.importCatalog()`;
- constructs a minimal valid `FinalLifetimeProfileV3`;
- constructs deterministic ranked candidates;
- instantiates the production `CycleCoordinatorV3`;
- calls `forceNew()`, `waitForBuild()` and `current()`;
- requires the first production managed-V3 batch to contain 12 items.

It does not:
- write recommendation tables with direct SQL;
- call a fake allocator;
- require Provider success;
- use real user library data.

### Browser journey

`desktop-recommendation-batch-harness.mjs`:

1. opens a new Chromium process;
2. enters Discover → Recommendation;
3. clicks the real `#recommend-button` so the prepared managed cycle is
   rendered through production UI;
4. confirms one 12-card current batch;
5. starts timing immediately before `#recommend-next-batch`;
6. waits until:
   - the visible managed-batch label changes;
   - exactly 12 recommendation cards are rendered;
   - the card identity set differs from the prior batch;
7. rejects duplicate cards or reuse of the previous batch;
8. records `nextBatchClickToUsableMs`.

The default five rounds cover managed transitions 1→2 through 5→6 using the
72-candidate fixture.

### Measurement exclusions

J7A excludes:
- Desktop process startup;
- Chromium process startup;
- initial cycle generation;
- Provider network time;
- setup/configuration.

Those are owned by J3/J4/J7B respectively.

## J7B — opt-in real Provider regeneration

### Why CI cannot supply this result

A meaningful generation measurement requires:
- an already configured real Desktop;
- a preexisting usable managed V3 cycle;
- a real Provider/candidate path;
- the actual Recommendation Work/resource lifecycle.

CI must not substitute a fake Provider response and then call the resulting
number "generation performance."

### Preconditions

`desktop-recommendation-generation-harness.mjs` requires:
- loopback Desktop URL;
- `--confirm-regeneration=YES`;
- an already usable managed V3 active cycle **before any Recommendation UI
  action**.

The harness fails if no active cycle already exists. It never creates an
unmeasured first cycle just to satisfy its own prerequisite.

### Measured boundary

The UI path is the real product flow:

1. enter Discover → Recommendation;
2. load the existing active cycle;
3. click `#recommend-restart`;
4. wait for the application confirmation dialog;
5. start timing immediately before clicking `#app-confirm-submit`;
6. let the real UI issue `force_new` and use the existing Recommendation
   status-watch authority;
7. stop only after:
   - active cycle ID has changed;
   - no building cycle remains;
   - recommendation cards are rendered;
   - the I1/I2 task diagnostic endpoint has observed the
     `recommendation-v3` task with `provider-network` resource state RUNNING.

Metric:

`regenerationConfirmedToUsableMs`

If a cycle finishes without observing a real Provider-network lease, the run is
rejected as invalid real-generation evidence.

### Explicit mutation

Real generation intentionally changes the current Desktop recommendation cycle.

The runner therefore requires:

`--confirm-regeneration=YES`

The runner:
- does not write Desktop credentials/settings;
- does not read/export account/password/token/cookie values;
- strips matching secret environment variables from its Playwright subprocess;
- connects only to an already-running loopback Desktop.

## CI policy

Workflow:

`.github/workflows/desktop-recommendation-benchmark-harness.yml`

CI runs **J7A only**:
- two local batch-switch rounds;
- `--harness-validation-only`;
- temporary pinned Chromium toolchain.

CI never runs the real generation harness.

Hosted-runner J7A values are harness-executability evidence, not P2-K budgets.

## Report privacy

J7 reports contain:
- timing samples and min/median/max summaries;
- generic fixture shape;
- platform/runtime/browser metadata.

Reports do not contain:
- recommendation cycle IDs;
- comic IDs;
- loopback URLs;
- credentials;
- temporary Desktop/tool paths.

J7B also intentionally does not record Provider URL/account values. A human
benchmark report may separately record the approved low-cardinality
network/proxy/provider environment needed by P2-K.

## Acceptance

Source/harness acceptance requires:
- deterministic V3 fixture uses production database/coordinator APIs;
- local batch switch reaches production managed-V3 next-batch UI path;
- generation remains opt-in and requires actual provider-network resource
  observation;
- the generation precondition exists before Recommendation UI can generate a
  cycle;
- CI executes only the local J7A harness;
- project dependencies/lockfile remain unchanged;
- no performance threshold is selected.

## Next

After J7 source/harness acceptance:

1. collect representative Windows x64 J3/J4/J5/J7A evidence;
2. collect J7B real-generation evidence with network/provider context;
3. continue P2-J with loaded foreground cases still missing from the matrix:
   - download-active foreground/API responsiveness;
   - WebDAV-scan impact;
   - Visual-index impact;
   - Reader long-session memory/jank;
   - explicit task-concurrency scenarios;
4. only P2-K may convert representative repeated measurements into budgets.

J7 itself selects no performance budget.
