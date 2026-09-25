# Startup / Crash Recovery — P2 H3A Maintenance Interruption Tombstones

Status: **maintenance update / repair / organize interruptions survive Desktop process restart as explicit restart-required failures**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-H Startup, shutdown and crash recovery.

## Goal

A background task that was still active when the Desktop process disappeared must not come back as:

- `idle`, which hides the interruption;
- `complete`, which would falsely promote partial work;
- automatically resumed, when no durable same-run checkpoint contract exists.

H3A therefore adds a narrow recovery rule for three existing service-owned maintenance tasks:

- maintenance update scan;
- maintenance repair scan;
- library organize.

The rule is:

> persist only the active task boundary; after process restart, convert it to a durable `restart_required` interruption tombstone and require an explicit new run.

## Existing storage authority

The repository already has the SQLite `app_state` table:

```sql
CREATE TABLE app_state (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

and `LibraryDatabase.getAppState()` / `setAppState()`.

H3A reuses that authority rather than adding a sidecar JSON file or another migration.

A small `deleteAppState()` primitive is added for clean terminal cleanup.

## Recovery keys

H3A uses one versioned key per task:

- `runtime.maintenance-update.recovery.v1`;
- `runtime.maintenance-repair.recovery.v1`;
- `runtime.library-organize.recovery.v1`.

Each active snapshot contains only sanitized task state:

- schema version;
- task kind;
- active state;
- phase;
- done / total from the last persisted boundary;
- started / updated timestamps;
- small numeric summary fields.

It does **not** persist:

- Provider credentials;
- cookies;
- local file lists;
- findings/issues payloads;
- partial organizer result objects;
- remote response bodies.

## Write discipline

Recovery metadata is intentionally **not** written on every progress callback.

Snapshots are written only when the task crosses a control/lifecycle boundary:

1. task start;
2. pause request;
3. resume request;
4. cancel request;
5. checkpoint actually enters `paused`;
6. checkpoint returns to `running`.

This avoids converting crash recovery into another high-frequency SQLite writer.

Normal task terminal paths remove the recovery row in `finally`.

If the process is killed, `finally` never executes and the active row remains.

## Startup recovery

`LibraryService` startup already performs:

- interrupted local-download recovery;
- interrupted Recommendation-build cleanup.

H3A adds:

`recoverInterruptedMaintenanceTasks()`

after those existing startup recovery steps.

For every recovery key:

### Active snapshot

If the stored state is one of:

- running;
- pausing;
- paused;
- cancelling;

startup first rewrites the stored row to:

- state = `interrupted`;
- `recoveredState` = previous active state;
- updated timestamp = current startup time.

This is the durable tombstone.

### Existing interrupted tombstone

If the stored state is already `interrupted`, startup keeps it.

Therefore a second Desktop restart does not erase the interruption and fall back to `idle`.

### Invalid / non-active row

A valid row that is neither active nor interrupted is removed and ignored.

Malformed JSON is already ignored by the existing `getAppState()` boundary.

## Public task status after recovery

The corresponding in-memory task status becomes:

- `state: failed`;
- `phase: failed`;
- `active: false`;
- all pause/resume/cancel controls false;
- `recoveryMode: restart_required`;
- `recoveredState`: running / pausing / paused / cancelling;
- error: previous Desktop process interrupted the task and a new run is required.

The last persisted numeric summary is preserved for diagnostics only.

### Update scan

Partial `findings` are discarded.

Recovered status returns:

`findings: []`

rather than treating partially scanned update findings as a completed report.

### Repair scan

Partial `issues` are discarded.

Recovered status returns:

`issues: []`.

### Library organize

`libraryOrganizeResult` is explicitly null.

Any filesystem changes already atomically published by the organizer remain filesystem facts, but H3A does not claim the interrupted run produced a complete organizer result.

## Explicit rerun

A restart-required tombstone does not block a new explicit task run.

Starting the task again overwrites the tombstone with a fresh active snapshot.

When that new run reaches a normal terminal state:

- complete;
- failed;
- cancelled;

its recovery key is removed.

The next Desktop restart therefore does not report the old interruption.

## Deliberate pause behavior

A persisted `paused` snapshot is **not automatically resumed**.

After process death, its recovered state is:

- failed;
- restart_required;
- recoveredState = paused.

This is deliberate. In-memory pause waiters cannot survive process death, and H3A does not pretend that they can.

A future durable-resume design would need an operation-specific checkpoint contract before changing this behavior.

## Recovery matrix

| Operation | Durable authority / commit boundary | Current process-restart behavior | H3A status |
| --- | --- | --- | --- |
| Local Desktop downloads | SQLite job/page state + verified files | interrupted LOCAL jobs recovered; deliberate paused state remains explicit | existing mature path |
| Recommendation V3 build | persisted active/building cycle metadata + prior usable cycle | startup clears interrupted building state; prior usable cycle retained | existing path |
| Maintenance update scan | service task + H3A `app_state` active boundary | active/paused/cancelling → failed + restart_required; explicit rerun required | **H3A implemented** |
| Maintenance repair scan | service task + H3A `app_state` active boundary | active/paused/cancelling → failed + restart_required; partial issues discarded | **H3A implemented** |
| Library organize | atomic per-output filesystem primitives + H3A `app_state` active boundary | active/paused/cancelling → failed + restart_required; no completed result promoted | **H3A implemented** |
| WebDAV sync | remote publication commit boundary + reusable SHA-matched objects | browser reload reattaches; process-level same-run resume remains operation-specific | follow-up P2-H evidence |
| Visual indexing | embeddings committed per completed work | unfinished works remain pending; browser-process loss uses safe restart rather than same-run resume | follow-up P2-H evidence |
| Favorites sync | reconciliation commits after remote listing | process loss requires rerun/reuse; no durable same-run task record | follow-up P2-H |
| V5 shadow retrieval | final candidate/audit commit after safe checkpoints | service task is page-reconnectable within process; process restart is not same-run durable | follow-up P2-H |
| Work Identity evidence refresh | evidence rows commit through service task | page reattach within process; process restart recovery remains non-durable | follow-up P2-H |
| Desktop updater | staged update + backup + health-check/rollback | detached updater owns replacement safety | existing isolated mature path |

This table is descriptive. H3A does not claim the remaining follow-up rows are closed.

## Regression coverage

`maintenance-crash-recovery-p2h3a.test.ts` uses a real SQLite file.

It seeds:

- update = running;
- repair = paused;
- organize = cancelling.

Then it:

1. closes the first database;
2. reopens it and constructs a fresh `LibraryService`;
3. requires all three statuses to be failed + restart_required;
4. requires partial findings/issues/result not to be promoted;
5. requires persisted rows to be rewritten to `interrupted`;
6. closes/reopens again and requires the tombstones to remain visible.

A second test explicitly reruns empty maintenance tasks and requires their recovery rows to disappear after clean completion.

## Deliberate non-scope

H3A does not:

- automatically resume any maintenance task after process death;
- persist partial finding/issue arrays;
- persist per-item organizer output as a task result;
- add a generic task scheduler;
- change resource-coordinator enforcement;
- change maintenance algorithms;
- add periodic recovery-state writes;
- alter download or Recommendation recovery.

## Next P2-H work

After H3A:

1. make shutdown ordering explicitly settle/stop service-owned tasks before database/process teardown where practical;
2. extend the recovery matrix with automated kill/restart coverage for remaining critical durable operations;
3. verify browser lifecycle cannot accidentally terminate Mobile Bridge when paired devices need it;
4. verify headless Server lifecycle remains independent of browser lifecycle;
5. keep automatic restart/resume operation-specific rather than generic.
