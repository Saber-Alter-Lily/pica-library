# Unified Desktop Runtime Task Diagnostics — P2 I1

Status: **PASS / merged as PR #176 / LibraryService-owned task batch**

Accepted evidence before merge:
- normal CI run `36205909691`: PASS;
- Linux x64 package run `36205909814`: PASS;
- macOS arm64 package run `36205909697`: PASS;
- Windows ARM64 package run `36205909681`: PASS;
- Docker headless package run `36205909726`: PASS;
- Android Macrobenchmark build run `36205909754`: PASS;
- Android memory/background regression run `36205909709`: PASS;
- Android force-stop recovery regression run `36205909682`: PASS;
- merged commit: `e4d508dea0d342f4f9b173a20520e69e8262b1b5`.

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-I Observability without exposing internals to ordinary users.
- Existing resource observation: `docs/RUNTIME_RESOURCE_OBSERVATION_P2C2.md` and `P2C2B.md`.
- Existing HTTP performance observation: `docs/HTTP_LATENCY_RUNTIME_P2J1.md`.

## Purpose

Pica Library already has mature authoritative task status surfaces, but they are
split across task-specific methods and endpoints.

I1 does **not** create another task registry and does not become a new task
authority.

It adds one read-only adapter over existing owners so internal diagnostics can
answer, in one schema:

- what task is this?
- is it idle, waiting, running, paused or failed?
- what phase/progress is authoritative?
- what controls actually exist?
- what resource classes does it occupy?
- is it currently waiting for a resource lease or running under one?
- how long has it waited/run?
- what is the safe recovery/commit boundary?
- what bounded error can be shown without leaking secrets?

## Endpoint

Desktop-only loopback control plane:

`GET /api/v1/desktop/runtime/tasks`

The endpoint:
- requires `options.desktop`;
- is not added to Remote API/browser-session allowlists;
- uses normal `no-store` JSON responses;
- is excluded from J1 HTTP latency sampling so diagnostic polling does not
  contaminate the performance profile.

No ordinary-user UI is added in I1.

## Identity semantics

I1 deliberately separates:

### taskKey

Stable logical diagnostic key, for example:

- `recommendation-v3`;
- `favorites-sync`;
- `maintenance-update`;
- `local-downloads`.

### taskId

Current underlying run/job identity **only when the owner genuinely has one**.

If the authoritative owner does not expose a run ID, I1 returns:

`taskId: null`

It does not synthesize UUIDs merely to fill the schema.

The LOCAL download entry is an aggregate queue diagnostic, so it intentionally
does not claim one comic/job ID as the identity of the whole download runtime.

## I1 service-owned task batch

I1 covers eight LibraryService-owned logical task families:

| taskKey | taskType | Recovery / commit boundary |
| --- | --- | --- |
| recommendation-v3 | recommendation-v3-build | interrupted build resets; last-good cycle retained; new cycle promoted only after successful final build |
| favorites-sync | favorites-sync | rerun with committed cache reuse; full reconciliation only after completed remote listing |
| maintenance-update | maintenance-update-scan | restart scan; findings authoritative only through completed task state |
| maintenance-repair | maintenance-repair-scan | restart scan; scan is review-only and does not itself perform destructive repair |
| library-organize | library-organize | restart from checkpointed filesystem state; final indexes/manifests publish after final checkpoint |
| recommendation-v5-shadow | recommendation-v5-shadow | restart shadow analysis; result remains non-serving |
| work-identity-evidence | work-identity-evidence-refresh | restart checkpointed refresh; evidence persists after final cooperative checkpoint |
| local-downloads | local-download-runner | DB-backed resume from verified page/file state |

External-owner tasks such as WebDAV remain outside this first batch. They should
join later through a Desktop controller adapter rather than pretending to be
LibraryService-owned.

## Unified schema

Each diagnostic row exposes:

- `taskKey`;
- `taskId`;
- `taskType`;
- `owner`;
- `state` and `active`;
- `phase`;
- `done / total`;
- `startedAt / updatedAt / finishedAt`;
- `canPause / canResume / canCancel / canRetry`;
- `pauseSemantics`;
- `resourceClasses`;
- `resourceState`;
- `resourcePriority`;
- `resourceRequestedAt / resourceStartedAt`;
- `waitDurationMs / runDurationMs`;
- `retryCount`;
- `lastError`;
- `recoveryMode`;
- `commitBoundary`.

Snapshot envelope:

- `schemaVersion: 1`;
- `capturedAt`;
- sorted `tasks[]`.

## Null means unknown / not owned

I1 does not infer unavailable metadata.

Examples:
- Favorites currently has no authoritative task start/update timestamps →
  `null`.
- Aggregate LOCAL download runtime has no single queue task ID → `null`.
- A task without a direct retry control does not get a guessed
  `canRetry=true`.

This is intentional. A false timestamp or control flag is worse than a null in
an internal diagnostic contract.

## Resource correlation

I1 reuses the existing process-shared `RuntimeResourceCoordinator`.

For each task type, the adapter correlates current:
- active lease;
- waiting request;
- priority;
- requested time;
- started time;
- resource weights.

It reports:

- `resourceState=running` when an active lease exists;
- `resourceState=waiting` when a waiting request exists;
- `resourceState=none` otherwise.

Durations are derived only from coordinator timestamps:

- waiting → `waitDurationMs`;
- running → `runDurationMs`.

Declared resource classes remain visible even after a task reaches terminal
state, while current lease state returns to `none`.

This lets future C3 enforcement distinguish "business task says running but is
waiting for resources" without changing the task state machine.

## LOCAL download aggregation

LOCAL downloads are not represented as one fake job.

I1 derives the aggregate logical state from:
- `localDownloadRuntime().running`;
- the first authoritative active LOCAL DB job ordered by the existing queue
  priority/status ordering.

Result:
- active runner → `running`;
- queued/preparing/retry-wait work without runner → `waiting`;
- only PAUSED work → `paused`;
- only FAILED work → `failed`;
- no active LOCAL work → `idle`.

The row's task ID remains null because this is runtime/queue-level diagnostics.

## Sensitive error redaction

I1 does not return raw error strings unchanged.

`sanitizeRuntimeDiagnosticError()`:
- truncates to a bounded length;
- replaces HTTP/HTTPS URLs;
- redacts Bearer values;
- redacts common password/token/cookie/authorization key-value forms;
- replaces Windows absolute paths;
- replaces multi-segment Unix absolute paths.

The adapter is intentionally conservative: diagnostics may lose detail rather
than leak credentials or sensitive local paths.

## Automated evidence

`test/unit/runtime-task-diagnostics-p2i1.test.ts`:

1. starts a real Maintenance Update task with the Provider call blocked;
2. requires unified diagnostics to report:
   - authoritative running/checking state;
   - provider-network + sqlite-write-heavy classes;
   - active background resource lease;
   - requested/started timestamps and run duration;
3. releases the Provider and requires:
   - terminal complete state;
   - resourceState=none;
4. verifies unavailable metadata remains null;
5. verifies URL/path/token/password/Bearer redaction;
6. verifies the endpoint is Desktop-only and absent from Remote API;
7. verifies diagnostic requests are excluded from HTTP latency telemetry.

## Deliberate non-claims

I1 does not yet unify every task owner.

Still outside the first batch:
- WebDAV / RemoteStorageDesktopManager;
- Browser Lite export;
- managed E-H web login;
- update download/apply;
- Android WorkManager task diagnostics;
- Visual browser-worker task state.

Those should be added by owner-specific read-only adapters where useful, not by
duplicating their state.

I1 also does not persist diagnostics or upload them anywhere.

## Next

After I1 acceptance:
1. add Desktop-controller-owned task adapters where they materially improve
   "stuck vs waiting vs slow vs failed" diagnosis;
2. decide whether a bounded diagnostic export is useful;
3. keep normal user UI limited to actionable status/progress/errors;
4. preserve Remote API credential/management boundaries.
