# Runtime Resource Observation — P2 C2

Status: **first observation batch implemented / no production throttling**

Parent: P2-C in DEVELOPMENT_TASK_LOG.md.

## Scope

C2 wires the first set of already-detached service tasks into the C1 RuntimeResourceCoordinator in **observe-only** mode.

Observed tasks:

| Task | Resource declaration |
| --- | --- |
| Maintenance update scan | provider-network + sqlite-write-heavy |
| Maintenance repair scan | filesystem-heavy + sqlite-read-heavy |
| Library organize | filesystem-heavy |
| Recommendation V5 Shadow | provider-network + cpu-analysis + sqlite-write-heavy |
| Work Identity evidence refresh | cpu-analysis + sqlite-read-heavy + sqlite-write-heavy |

These declarations describe the coarse resource domains a task can materially occupy. They are not CPU percentages, byte rates, or Provider request counts.

## Diagnostics

Desktop control plane exposes:

`GET /api/v1/desktop/runtime/resources`

The endpoint returns the coordinator snapshot: mode, capacities, current/peak usage, active leases, waiting requests and bounded recent lifecycle events.

The endpoint is not part of W4B/W5 browser-session Remote Web allowlists. Remote Web does not receive this internal diagnostic surface.

The same active observation leases are also consulted by the Desktop browser-close lifecycle. An observed background task therefore keeps the local engine alive after the last browser tab closes instead of being terminated by the idle-browser grace timer. This fixes a lifecycle gap introduced as H1/H2 work became detached from request/page ownership.

## Important measurement limitation

C2 first-batch leases are **task-lifetime observations**.

A paused task currently keeps its observation lease until the task reaches a terminal state. Therefore:

- active/peak counts mean 'these heavy task lifetimes overlapped';
- they do not prove all declared resources were physically busy for the entire interval;
- the data is useful for identifying combinations that can overlap;
- the data is not sufficient to select enforceable capacities.

Before C3 enforcement, resource ownership must become phase-aware where necessary. In particular, paused tasks must not reserve enforced capacity, and tasks whose network/CPU/SQLite phases are separated should acquire only the resources needed by that phase if measurements show this distinction matters.

## Preserved behavior

C2 does not:

- make a task wait;
- reject a task because another task is running;
- alter task pause/resume/cancel semantics;
- change download concurrency;
- change Provider budgets/retries;
- change Recommendation serving;
- change Work Identity or Visual semantics;
- choose a Desktop or Android resource capacity.

## Evidence

The C2 behavioral test holds a real maintenance Provider call open, verifies that the maintenance-update resource lease is visible while the task is active, then verifies the lease is released after completion.

Source-contract assertions also lock the first-batch declarations and the Desktop-only diagnostic route.

## Next observation batch

After this batch is accepted, add observe-only declarations for:

1. Recommendation V3 generation;
2. favorites sync;
3. WebDAV sync;
4. local download runner;
5. Visual analysis paths where task/phase ownership can be measured without distorting the timing sample.

Android receives a separate observation design because its executors are WorkManager/DownloadManager rather than the Desktop Node runtime.

Only after enough overlap + latency evidence exists should P2-C3 propose enforceable capacities.