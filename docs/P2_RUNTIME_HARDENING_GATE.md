# P2 Runtime Hardening Promotion Gate

Status: **automated gate candidate / P2 promotion still requires external evidence**

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-L Runtime hardening regression gate.
- P2-K real benchmark matrix remains a separate evidence authority.

## Purpose

P2 already has many strong regression gates, but they are distributed across:
- normal CI;
- package workflows;
- Android force-stop recovery;
- Android memory/background recovery;
- runtime-specific unit/integration contracts;
- benchmark instrumentation.

P2-L adds one explicit **candidate promotion gate** so a release/runtime-hardening
candidate can re-run the automated core on one commit and receive one
machine-readable verdict.

P2-L does not convert CI/synthetic evidence into a real performance conclusion.

## Workflow

`.github/workflows/p2-runtime-hardening-gate.yml`

Invocation:
- `workflow_dispatch` for an explicit P2/runtime-hardening candidate;
- pull-request self-test only when the P2-L gate implementation/docs themselves
  change.

It is intentionally not another always-on copy of normal CI for every product
PR.

## Automated gate jobs

### 1. Desktop / Web contracts

Runs:
- TypeScript check;
- Web syntax check;
- full unit/integration suite;
- production build;
- real Chromium Web smoke.

Then explicitly re-runs the critical runtime contracts so the promotion log
names them directly:

- long-task stability;
- recommendation network interruption recovery;
- large download queue;
- detached/restart-safe download runtime;
- runtime resource coordinator;
- C2/C2B resource observation;
- I1/I2 structured diagnostics;
- J1/J2 latency telemetry/scenario contracts;
- headless lifecycle;
- Desktop shutdown/quiesce recovery.

This is deliberate duplication inside a **promotion** gate, not a new test
implementation.

### 2. Windows current-package smoke

On `windows-latest`:
- reads the current version from `package.json`;
- queries GitHub Releases for the newest lower formal semver release;
- downloads its accepted Windows x64 asset into `artifacts/release-base`;
- builds the current repository version with `pnpm build:windows`;
- leaves the existing build script's accepted-base SHA and unchanged-launcher checks authoritative;
- resolves the candidate package filename from `package.json`;
- runs the existing `scripts/test-windows-artifact.ps1`.

The gate does not bypass the stable launcher's accepted-base rule merely to build a candidate.

The smoke continues to validate:
- package structure/runtime assets;
- local API startup;
- clean setup;
- core Web surfaces;
- single-instance behavior;
- graceful shutdown and port release.

P2-L reuses this existing package authority rather than inventing a smaller
mock package.

### 3. Android static/runtime build

Runs:
- `:app:testDebugUnitTest`;
- `:app:lintDebug`;
- `:app:assembleRelease`;
- release-like benchmark target build;
- Macrobenchmark test APK build.

This proves Android runtime and measurement instrumentation still compile
together.

### 4. Android real force-stop recovery

Reuses:

`scripts/run-android-worker-force-stop-recovery.sh`

under the existing API-35 emulator/KVM environment.

This remains the G15 process-death/relaunch authority.

### 5. Android memory / background recovery

Reuses:

`scripts/run-android-memory-background.sh`

This remains the G16 authority:
- HIDDEN trim evicts reconstructible Bitmap LRUs in the same process;
- forced Doze must not execute the delayed WorkRequest;
- after unforce the durable WorkRequest may recover through OS-controlled
  background dispatch or normal launcher re-entry;
- no fixed post-Doze JobScheduler latency SLA is claimed.

## Machine-readable report

The final job calls:

`scripts/write-p2-runtime-hardening-gate-report.mjs`

Output:

`test-results/p2-runtime-hardening-gate.json`

Key fields:
- source SHA;
- per-job automated results;
- `automatedStatus`;
- `promotionStatus`;
- explicit external blockers.

If any automated component fails:
- `automatedStatus = FAIL`;
- `promotionStatus = AUTOMATED_FAIL`;
- report writer exits non-zero.

If all automated components pass:
- `automatedStatus = PASS`;
- `promotionStatus = AUTOMATED_PASS_EXTERNAL_EVIDENCE_REQUIRED`.

There is intentionally no `P2_COMPLETE` automated state.

## External blockers

An automated PASS still lists these requirements as external evidence:

### P2-K real benchmark matrix

Required before performance budgets:
- representative hardware;
- environment metadata;
- repeated runs;
- variance;
- idle vs loaded scenarios.

Synthetic/CI wall time is not accepted.

### Windows manual task-control acceptance

Representative Windows use must verify:
- long work remains visible;
- pause/cancel/resume behave correctly;
- ordinary Library/detail/Reader use does not feel frozen.

### Android physical-device acceptance

Still required:
- physical Task Center / foreground notification behavior;
- OEM/background restriction behavior;
- real loaded foreground performance;
- long Reader memory/jank.

### G18/G19 physical performance

Need:
- idle G18 baseline;
- real recommendation-loaded G19 run;
- same device/build context where practical.

These precede G20/P2-C3 enforcement.

### Low-end Windows/browser trace

P2-F still has an explicit external CPU/jank evidence gate.

## Security

P2-L:
- uploads only bounded test/diagnostic artifacts;
- follows the repository public-artifact guard;
- does not export credentials;
- does not enable Remote API;
- does not publish a release.

## Interpretation

A green P2-L automated workflow means:

**the checked-in automated runtime-hardening regression surface is coherent on
the candidate commit.**

It does not mean:
- P2 exit criterion is fully satisfied;
- performance budgets are approved;
- Android OEM evidence is complete;
- manual task-control acceptance is complete;
- a release should be published automatically.

## Next

After P2-L automated gate source/CI acceptance:
1. use workflow_dispatch on a future release/runtime-hardening candidate;
2. collect the named external evidence;
3. check in P2-K benchmark environment/variance results;
4. only after those blockers close may the P2 exit criterion be promoted to
   complete.
