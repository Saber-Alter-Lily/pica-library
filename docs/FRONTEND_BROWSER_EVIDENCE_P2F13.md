# Browser Timing Evidence for Analysis Pollers — P2 F13

Status: **real-browser cadence evidence added / no user-facing performance budget selected**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-F Frontend responsiveness and observer/poller discipline.

Dependencies:

- F1–F11 remove redundant or duplicate frontend work.
- F12 makes Work Identity and V5 shadow status polling visibility-aware.
- Existing CI already runs Playwright Chromium browser smoke.

## Purpose

F13 converts the F12 source-level contract into a real-browser control-flow check.

It does **not** claim to benchmark a representative user machine.

The goal is narrower:

1. prove the actual browser executes the hidden-page delay path;
2. prove returning to visible wakes the pending delay immediately;
3. prove foreground polling returns to its existing cadence;
4. retain structured timing evidence in CI logs;
5. avoid introducing a separate benchmark dependency or harness.

## Test architecture

F13 adds:

`test/e2e/poller-discipline.spec.mjs`

to the existing Playwright smoke suite.

The test uses small same-origin HTML shells that load only the target production module:

- `work-identity-review.js`;
- `recommendation-v5-evaluation.js`.

This avoids unrelated App/Settings/Provider requests contaminating the timing evidence.

The production modules and their normal relative imports are served by the existing Web smoke HTTP server.

## Visibility control

The Playwright page installs a test-only visibility override before the module loads.

The page begins as:

`document.visibilityState = 'hidden'`

for the production polling helper.

The helper itself is not mocked.

The test changes only the browser-visible readiness signal and dispatches the same `visibilitychange` event that the production code listens to.

No production code receives a test flag.

## Backend status stubs

Each focused shell routes only the target status endpoint to a deterministic active-task payload.

### Work Identity

Endpoint:

`/api/v1/recommendation-v5/work-identity/evidence/refresh/status`

The module performs its normal panel initialization and active-task reattach path.

### V5 shadow evaluation

Endpoint:

`/api/v1/desktop/recommendation-v5/shadow-retrieval/status`

The module performs its normal evaluation panel initialization and active-task restore path.

All other API requests fail with a test-only 503, so no provider or heavy analysis work runs.

## Browser evidence sequence

For each module, Playwright records real request timestamps.

### Hidden cadence

Bootstrap/reattach may make an initial status read followed by the watcher’s immediate first read.

The test then measures the next watcher interval.

F12 specifies a 3000 ms hidden delay.

The browser contract uses deliberately wide structural bounds around that delay to avoid treating shared-runner timing as a product benchmark.

### Visibility restoration

After one hidden interval, the test changes visibility to `visible`.

The next status read must occur promptly rather than waiting another hidden delay.

This validates the temporary `visibilitychange` listener path in the actual browser.

### Foreground cadence

The subsequent interval is measured after visibility restoration.

It must return to the existing production cadence:

- Work Identity: 500 ms;
- V5 shadow: 600 ms.

Again, the assertion bounds are intentionally broad control-flow guards, not latency targets.

## Structured CI evidence

Each test writes one line to the Playwright/CI log:

```text
[P2-F13] {"label":"...","hiddenGapMs":...,"visibleWakeMs":...,"foregroundGapMs":...}
```

This gives reviewable browser timing evidence on every PR without creating a new success-artifact retention policy.

Playwright failure traces/screenshots remain governed by the existing smoke configuration.

## CI integration

`scripts/run-web-browser-smoke.sh` now includes:

`test/e2e/poller-discipline.spec.mjs`

The existing CI-only Playwright installation, Chromium version, static server and smoke workflow remain unchanged.

No package dependency or lockfile is added.

## Interpretation boundary

F13 is valid evidence for:

- event-loop/timer control flow;
- hidden-vs-visible polling cadence selection;
- visibility wake behavior;
- absence of a source-only implementation gap.

F13 is **not** evidence for:

- low-end CPU utilization;
- browser jank;
- battery impact;
- foreground interaction latency;
- a user-facing p50/p95 budget;
- production network timing.

Shared CI runner timings must not be promoted into product performance thresholds.

## P2-F close criteria after F13

If F13 passes the full Web/Desktop browser gate:

- observer/poller authority cleanup is code-complete for the audited paths;
- no known persistent high-frequency idle loop remains without an explicit owner;
- browser cadence behavior is covered in real Chromium;
- quantitative low-end-hardware trace remains a separate evidence gate.

Therefore P2-F may move from active code remediation to:

`IMPLEMENTATION_COMPLETE_REFERENCE_TRACE_OPEN`

until a representative low-end Windows/browser trace is captured.

That remaining evidence should not block unrelated P2-G/H architecture work.

## Preserved behavior

F13 changes no runtime behavior.

It only adds:

- one focused Playwright test file;
- one existing smoke-test command entry;
- documentation/task-log status.

## Next work

After F13:

1. run and review the new browser evidence in CI;
2. record measured cadence values from the passing run in the PR validation note;
3. mark P2-F implementation complete if no regression appears;
4. leave the low-end reference trace as a named external evidence gate;
5. continue the next unblocked architecture lane rather than inventing further frontend rewrites.
