# Desktop Process Startup Benchmark — P2 J3

Status: **PASS / merged as PR #179 / no startup budget selected**

Accepted source/harness evidence before merge:
- Desktop Startup Harness run `36222961030`: PASS;
- normal CI run `36222960972`: PASS;
- P2 Runtime Hardening Promotion Gate run `36222961015`: PASS;
- Linux x64 package run `36222960986`: PASS;
- macOS arm64 package run `36222961039`: PASS;
- Windows ARM64 package run `36222961116`: PASS;
- Docker headless package run `36222960967`: PASS;
- Android Macrobenchmark build run `36222961067`: PASS;
- Android force-stop regression run `36222960988`: PASS;
- Android memory/background regression run `36222961046`: PASS;
- merged commit: `e4112a9c9cc1a7a654d1be16c2a197a21d5feb79`.

The hosted-runner millisecond values from the harness smoke are not promoted to
P2-K budgets.

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-J Performance instrumentation;
- J1 local HTTP latency telemetry;
- J2 repeatable Desktop foreground HTTP scenario harness.

## Purpose

J3 closes one previously uninstrumented P2-J boundary:

**Desktop process cold start → local API ready**

It also measures the matching graceful-shutdown interval so startup measurements do
not rely on unclean process termination between rounds.

J3 does **not** define a startup threshold and does not promote GitHub-hosted runner
timings into P2-K performance evidence.

Browser open → usable Home/Library remains a separate J4 measurement because it
requires a real browser journey and should not be approximated from HTTP/static
asset timing.

## Measured executable

The harness measures the built production-style Desktop entry:

`dist/desktop.js --headless`

The normal `benchmark:desktop-startup` command runs `pnpm build` first, outside
all measured windows.

Provider credentials are explicitly removed from the child-process environment.
The measurement therefore covers local process/database/server startup rather
than account login, provider latency or proxy behavior.

## Data-root protocol

Each benchmark invocation creates one isolated temporary Desktop home.

### Fresh-home sample

The first process starts against the new home and records:
- spawn → instance metadata publication;
- spawn → `GET /api/v1/desktop/status` identified as Pica Library;
- shutdown POST response;
- shutdown request → process exit.

This sample includes first creation of the local DB/runtime state and is reported
separately.

### Reused-home samples

After the first clean shutdown, the same isolated data root is reused for the
configured number of process-cold rounds.

Default:

`5 reused-home rounds`

Each round is a new Node process. No previous process remains alive.

The main repeatable summary is calculated only from these reused-home rounds.

## Readiness boundary

Two distinct timestamps are retained:

1. `spawnToInstanceMs`
   - the Desktop instance file exists and exposes a valid loopback URL;
2. `spawnToApiReadyMs`
   - the loopback URL answers `/api/v1/desktop/status`;
   - the response identifies `application = Pica Library`.

This avoids calling instance-file publication equivalent to an actually
requestable local API.

The harness polls with a small configurable interval. Polling overhead is
therefore part of measurement uncertainty and must be kept identical when
comparing candidate runs.

## Shutdown boundary

After API readiness, the harness:
- reads the local CSRF token from the Desktop status response;
- sends the normal Desktop shutdown POST;
- waits for the actual child process exit;
- requires exit code 0.

The CSRF token is never written to the result.

Metrics:
- `shutdownResponseMs`;
- `shutdownToExitMs`.

The 40 second process-exit wait is only a harness safety bound. It is not a
performance budget.

## Machine-readable output

Default path:

`test-results/desktop-startup/desktop-startup-benchmark.json`

The report includes:
- schema version;
- commit SHA when available;
- platform / arch / Node version;
- CPU model, logical CPU count and total memory;
- measurement protocol;
- all raw samples;
- min / median / max summaries for reused-home rounds.

The report deliberately omits:
- temporary Desktop home path;
- CSRF token;
- stdout/stderr;
- provider credentials;
- configured account/proxy values.

## Command

Default local evidence run:

`pnpm benchmark:desktop-startup`

Example:

`pnpm benchmark:desktop-startup -- --rounds=7 --poll-ms=20 --output=test-results/desktop-startup/reference.json`

A reference-machine run should keep:
- same build mode;
- same poll interval;
- same Node/runtime version;
- same machine power/performance mode;
- no competing benchmark workloads where practical.

## CI harness validation

`.github/workflows/desktop-startup-harness.yml` runs a two-round smoke with:

`--harness-validation-only`

This proves:
- the built Desktop process launches;
- instance publication works;
- the local API becomes ready;
- normal shutdown works;
- JSON output is produced.

The GitHub runner's timing is **not** an accepted P2-K benchmark.

The workflow may upload its short JSON artifact for debugging, with the same
public-repository artifact guard used by other runtime workflows.

## Interpretation

J3 does not select:
- p50/p95 startup targets;
- release blocking thresholds;
- an acceptable shutdown duration.

P2-K remains responsible for evidence-driven budgets after representative
hardware data exists.

For comparable Windows x64 evidence, report at minimum:
- machine / CPU;
- Windows version;
- Node/package version;
- number of reused-home rounds;
- min / median / max;
- relevant background load.

## Remaining P2-J gaps

After J3 source/runtime-harness acceptance:
1. J4 browser open → usable Home/Library;
2. real Library/detail/shelf/Reader foreground journeys with browser timing;
3. recommendation generation and batch-switch timing as separate operations;
4. long Reader memory/jank;
5. representative Windows idle-vs-load evidence;
6. Android physical G18/G19 evidence already prepared by the Android lane.

No P2-K threshold should be chosen until the corresponding real measurements
exist.
