# External Desktop Runtime Task Diagnostics — P2 I2

Status: **PASS / merged as PR #177 / external-owner adapter batch**

Accepted evidence before merge:
- normal CI run `36212602733`: PASS;
- Linux x64 package run `36212602711`: PASS;
- macOS arm64 package run `36212602662`: PASS;
- Windows ARM64 package run `36212602709`: PASS;
- Docker headless package run `36212602678`: PASS;
- Android Macrobenchmark build run `36212602738`: PASS;
- Android force-stop recovery run `36212602671`: PASS;
- Android memory/background run `36212602704`: PASS with the corrected no-fixed-JobScheduler-SLA recovery gate;
- merged commit: `c7eab55f0b54d6a520aa524e50a9ab6c93258404`.

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-I Observability without exposing internals to ordinary users.
- I1 schema: `docs/RUNTIME_TASK_DIAGNOSTICS_P2I1.md`.

## Purpose

I1 unified eight `LibraryService`-owned logical tasks without creating a second
task authority.

I2 extends the **same read-only schema and same endpoint** to Desktop tasks whose
authoritative state lives outside `LibraryService`:

- WebDAV / remote-storage sync;
- Browser Lite export;
- managed E-H web login;
- software update.

The owner remains authoritative. I2 only adapts snapshots.

## Endpoint

No new public endpoint is added.

Desktop loopback continues to expose:

`GET /api/v1/desktop/runtime/tasks`

I2 changes its source from:
- LibraryService-only snapshot;

to:
- LibraryService I1 snapshot;
- plus Desktop external-owner adapters.

The endpoint remains:
- Desktop control plane only;
- loopback-only through the existing local server;
- excluded from Remote API/browser-session allowlists;
- excluded from J1 HTTP latency samples.

## Safe provider route

I2 adds one additive field to schema v1:

`providerRoute: string | null`

This field is a **low-cardinality internal label only**.

Allowed I2 examples:
- `webdav`;
- `eh-managed-browser`;
- `github-release`.

It must not contain:
- URL;
- host;
- account;
- remote root/path;
- cookies;
- token;
- credentials.

I1 task rows default to `null` unless an owner has a safe route label.

## WebDAV mapping

Authority:
`RemoteStorageDesktopManager.status().syncProgress`

Mapped fields:
- state / phase;
- page or comic progress;
- updatedAt;
- pause/resume/cancel capabilities;
- failed message only as bounded/sanitized `lastError`;
- providerRoute = `webdav`.

Resource correlation uses the existing shared C2 coordinator for:

`remote-storage-sync`

Expected classes:
- remote-storage-network;
- filesystem-heavy;
- sqlite-read-heavy;
- sqlite-write-heavy.

No duplicate resource counter is introduced.

Recovery mode:
`restart_sync_reuse_sha_objects`

Commit boundary:
generation catalog/current pointer publication remains the authoritative remote
publish boundary.

## Browser Lite export mapping

Authority:
Desktop `browserLiteExportProgress`.

Available owner metadata is intentionally sparse:
- state;
- phase;
- last successful export timestamp.

I2 does **not** invent:
- taskId;
- startedAt;
- updatedAt;
- resource lease;
- retry count.

The export has no pause/resume/cancel control API, so those controls are false.

Recovery mode:
`restart_export`

Commit boundary:
the selected export file is written before the persisted last-export timestamp
is atomically replaced.

## Managed E-H login mapping

Authority:
`DesktopEhWebLogin.status()`.

Owner states:
- opening;
- waiting;
- verifying;
- complete;
- failed;
- cancelled.

Unified mapping:
- opening/verifying → running;
- waiting → waiting;
- terminal states preserved.

The original owner state remains in `phase`.

Only failed state message is treated as `lastError` and passes through the
I1 sanitizer.

Safe provider route:
`eh-managed-browser`.

No cookie/session payload is returned.

## Software-update mapping

Authority:
`UpdateManager.progress()`.

Phase mapping:
- idle → idle;
- staged → waiting;
- complete → complete;
- failed → failed;
- other apply/stage phases → running.

Available current/total/updatedAt values are reused.

Only failed progress message is treated as `lastError`.

Safe provider route:
`github-release`.

I2 does not infer a RuntimeResourceCoordinator lease because updater work has
not been integrated into C2 resource observation.

## Missing metadata policy

I2 keeps the I1 rule:

**Unavailable means null, not guessed.**

Examples:
- Browser Lite has no authoritative start timestamp → `startedAt=null`;
- E-H login has no task ID → `taskId=null`;
- updater has no shared resource lease → `resourceState=none`;
- Browser Lite has no resource taxonomy declaration → empty resourceClasses.

## Security

All external failed messages pass through
`sanitizeRuntimeDiagnosticError()`.

The sanitizer remains bounded and removes:
- URL-like values;
- absolute Windows/POSIX paths;
- Bearer values;
- token/password/cookie/authorization key-value shapes.

Provider route labels are constants, not values derived from user configuration.

## Tests

`runtime-task-diagnostics-p2i2.test.ts` requires:

1. WebDAV active lease appears as a running task with real C2 resource timing;
2. I1 base tasks remain present after aggregation;
3. Browser Lite/E-H/updater missing fields remain null rather than synthesized;
4. failed external-owner messages are scrubbed;
5. Desktop main supplies external-owner snapshots;
6. Remote API does not expose the endpoint.

## Deliberate exclusions

I2 does not yet adapt:
- browser-side Visual worker execution;
- Android WorkManager Task Center into this Desktop endpoint;
- every short request/operation into a long-task record.

Visual remains browser-owned and already has H2B timing/profile diagnostics.
Android has its own Task Center and G17 resource observation.

I2 is not a new scheduler, task registry, persistence layer or user-facing UI.

## Next

After I2 acceptance:
1. mark core Desktop structured long-task observability materially complete;
2. assess whether Visual needs an owner-specific I3 adapter or whether H2B
   profile + existing Visual status is sufficient;
3. continue P2-J/P2-K evidence without exposing internal diagnostics to normal UI.
