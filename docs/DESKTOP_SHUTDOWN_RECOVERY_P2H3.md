# Desktop Shutdown & Recovery Matrix — P2 H3

Status: **PASS / merged as PR #175 / automated recovery matrix reconciled**

Accepted evidence before merge:
- normal CI run `36204308430`: PASS;
- Linux x64 package run `36204308449`: PASS;
- macOS arm64 package run `36204308443`: PASS;
- Windows ARM64 package run `36204308453`: PASS;
- Docker headless package run `36204308468`: PASS;
- Android Macrobenchmark build run `36204308433`: PASS;
- Android memory/background regression run `36204308462`: PASS;
- Android force-stop recovery regression run `36204308553`: PASS;
- merged commit: `60abf3a17516e98ab6f4bda0e63af2908e926338`.

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-H Startup, shutdown and crash recovery.
- Existing long-task baseline: `docs/LONG_TASK_STABILITY_V047.md`.

## Purpose

P2-H listed several recovery requirements that had accumulated across different
subsystems. Most were already implemented and tested, but the Desktop shutdown
path still had one real fault-isolation gap.

H3 does two things:

1. records one explicit recovery matrix mapping each P2-H requirement to the
   current authority/commit boundary;
2. fixes Desktop shutdown so one failed cleanup step cannot skip the remaining
   cleanup or prevent a globally bounded exit.

## Recovery matrix

| Requirement | Current authority / behavior | Evidence / status |
| --- | --- | --- |
| Stale Recommendation V3 building state | `LibraryService.recoverInterruptedRecommendationBuild()` clears persisted building request/cycle identity and reports recovered failure instead of promoting an incomplete cycle | implementation + recommendation recovery tests — PASS |
| Active Desktop download recovery without reviving deliberate PAUSED work | LOCAL `PREPARING/RUNNING/RETRY_WAIT` recovers to QUEUED on startup; PAUSED stays PAUSED; verified page/file state is authoritative | `download-runtime-stability.test.ts`, packaged Linux/macOS/ARM64 restart acceptance — PASS |
| WebDAV publication safety | generation catalog/object work completes before the current pointer/publication is promoted; later sync reuses SHA-matched objects | `remote-storage/sync-service.ts`, remote storage tests, long-task matrix — PASS |
| Visual pending work preservation | embeddings commit per work; interrupted/unindexed works remain pending instead of being marked complete | Visual runtime + long-task matrix — PASS |
| Explicit graceful shutdown ordering | Remote API → Mobile Bridge → managed E-H login → local download quiesce → local HTTP server → SQLite → instance lock | H3 implementation candidate |
| Forced-exit fallback cannot create false completed downloads | local download quiesce writes eligible LOCAL jobs to PAUSED before waiting for active runners; H3 hard-exit deadline is registered before cleanup begins | H3 behavior test + source contract candidate |
| Schema migration backup | DB constructor checkpoints WAL and copies `.pre-migration-vN.bak` before a newer migration runs | migration integration + upgrade/replacement acceptance — PASS |
| Browser lifecycle must not kill Mobile Bridge while needed | last-browser close checks active Desktop leases and recent/active Mobile Bridge requests before idle shutdown | `desktop-web.test.ts`, long-task matrix — PASS |
| Headless runtime independent of browser lifecycle | headless mode is persistent/no-GUI; idle-browser shutdown disabled; Mobile Bridge/Remote API explicit opt-ins | `desktop-headless-runtime-p5c.test.ts` — PASS |

## H3 finding

Before H3:

`stop()` awaited `closeEngine()`, then released the instance lock, then
registered a 250 ms final `process.exit()` fallback.

That ordering had a failure mode:

- `closeEngine()` called multiple asynchronous cleanup owners serially;
- any rejection, including the bounded 30 s
  `quiesceLocalDownloads()` timeout, aborted the rest of the function;
- HTTP server/database cleanup could therefore be skipped;
- the instance lock release and final exit fallback were never reached.

This violated the P2-H requirement that explicit shutdown be both ordered and
bounded even when one subsystem fails to close cleanly.

## H3 shutdown policy

### Global hard deadline

Shutdown now registers:

`SHUTDOWN_HARD_DEADLINE_MS = 35_000`

**before** graceful cleanup starts.

The deadline is intentionally longer than:
- the 30 s local-download quiesce bound;
- the 1 s local HTTP forced-close fallback;
- normal short cleanup steps.

If a close operation hangs beyond the global deadline:
- the instance lock gets a best-effort release;
- the process exits with the requested exit code.

The deadline is a last resort, not the normal shutdown path.

### Fault-isolated cleanup

`shutdownStep(...)` wraps every major cleanup owner.

A failure:
- is logged with a bounded text reason;
- is collected into a cleanup error list;
- does not prevent later cleanup steps.

The ordering remains:

1. Remote API gateway;
2. Mobile Bridge;
3. managed E-H login;
4. local download quiesce;
5. local HTTP server;
6. SQLite database;
7. process instance lock.

The service/database references are retired after their cleanup attempt so no
later shutdown code continues treating them as live authorities.

### Download safety before timeout

`LibraryService.quiesceLocalDownloads()` already performs its durable safety
transition before waiting for active runner promises:

1. stop accepting new LOCAL downloads;
2. stop active schedulers;
3. synchronously change LOCAL QUEUED/PREPARING/RUNNING/RETRY_WAIT jobs to
   PAUSED;
4. then wait for active runners;
5. reject only if that wait exceeds the timeout.

H3 adds a behavior test that blocks a real download inside `downloadToFile`,
calls `quiesceLocalDownloads(20)`, expects the timeout, and requires the DB job
to remain PAUSED before and after the rejection.

Therefore a later hard process exit cannot convert that known active job into a
false completed state.

### Final handle grace

After cleanup completes or is fault-isolated:
- instance release is attempted;
- the global hard timer is cleared;
- cleanup errors are logged;
- a short `SHUTDOWN_FINAL_HANDLE_GRACE_MS = 250` timer handles unrelated
  third-party Node handles.

This 250 ms timer is no longer the only shutdown bound and is no longer
registered after an unguarded cleanup chain.

## Automated evidence

H3 updates:
- `test/unit/desktop-headless-runtime-p5c.test.ts`
  - hard deadline exists;
  - hard deadline is registered before `closeEngine()`;
  - fault-isolated shutdown helper exists;
  - instance lock release and final grace remain explicit.
- `test/unit/desktop-remediation.test.ts`
  - a real LOCAL download is blocked in the provider write;
  - quiesce timeout is forced;
  - PAUSED persistence is required before/after timeout;
  - new local work is rejected after shutdown begins.

Existing platform/package acceptance continues to cover normal graceful
shutdown + restart persistence.

## Deliberate non-claims

H3 does not turn every task into restart-durable same-run execution.

Safe-stop/restart semantics remain valid where documented:
- Visual unfinished works remain pending;
- favorites/WebDAV may restart/reuse committed work;
- interrupted Recommendation building state is recovered as failed/reset;
- Android WorkManager owns its own durable lifecycle.

H3 also does not close OEM/physical-device Android background/notification
evidence.

## Next

After H3 CI/source acceptance:
1. mark the P2-H code/recovery matrix implementation complete;
2. move the next unblocked architecture work to P2-I structured observability;
3. keep external Android/OEM evidence under P2-G/P2-K rather than reopening
   shutdown architecture without a concrete regression.
