# Runtime Resource Observation — P2 C2B

Status: **second Desktop observation batch implemented / enforcement still disabled**

Parent: DEVELOPMENT_TASK_LOG.md → P2-C.

## Purpose

C2 first batch proved the coordinator can observe detached H1/H2 task lifetimes. C2B extends that observation to the long-running product runtimes that already have their own mature schedulers and controls.

The key architecture change is that Desktop now creates **one process-shared RuntimeResourceCoordinator** and injects it into both LibraryService and RemoteStorageDesktopManager. The `/api/v1/desktop/runtime/resources` profile therefore sees WebDAV and LibraryService workloads in one graph.

Standalone LibraryService or RemoteStorageDesktopManager instances still create an observe-only coordinator when no instance is injected, preserving tests/CLI callers.

## Added observations

| Runtime | Coarse task-lifetime declaration | Existing executor remains authoritative |
| --- | --- | --- |
| Recommendation V3 generation | provider-network + cpu-analysis + sqlite-read-heavy + sqlite-write-heavy | Recommendation checkpoints/control |
| Favorites sync | provider-network + sqlite-write-heavy | favorites sync checkpoints/control |
| Local download runner | media-network + filesystem-heavy + sqlite-write-heavy | DownloadScheduler + MediaRequestGate + SQLite job state |
| GitHub download runner | media-network + filesystem-heavy + sqlite-write-heavy | existing runner/scheduler semantics |
| WebDAV sync | remote-storage-network + filesystem-heavy + sqlite-read-heavy + sqlite-write-heavy | RemoteStorage sync checkpoints/control |

These declarations **do not replace** the existing download performance profile, MediaRequestGate, Provider request budgets, WebDAV upload concurrency or task-specific pause/cancel logic.

## Priority labels

- download runners are marked `user`, because a user-visible transfer should not later be treated the same as maintenance/analysis work;
- Recommendation V3, favorites sync and WebDAV remain `background` observations for now.

Priority has no effect while the coordinator remains in observe mode.

## Measurement interpretation

C2B still records whole task lifetimes. A task may move between provider, CPU, filesystem and SQLite phases while its coarse lease stays active.

This is intentionally sufficient for the current question: **which heavy task lifetimes are allowed to overlap in real use?**

It is not sufficient for enforcement. Before C3:

- paused tasks must not reserve enforced capacity;
- resources that are phase-separated should be narrowed to phase leases when the data shows the distinction matters;
- foreground Library/Reader latency must be measured during representative overlaps;
- download scheduler/media concurrency remains an independent lower-level mechanism.

## Lifecycle effect

Because LibraryService exposes the shared coordinator profile and Desktop idle-browser shutdown already treats active resource leases as work leases, the newly observed V3/favorites/download/WebDAV operations remain visible to the same engine-lifetime protection.

Existing explicit task-state checks remain in place; resource leases are additive diagnostics/lifecycle protection, not the sole authority for task correctness.

## C2B acceptance

Tests require:

- an externally acquired lease on an injected coordinator to appear through `LibraryService.runtimeResourceProfile()`, proving the service consumes the supplied shared instance;
- Desktop source wiring to pass the same coordinator to LibraryService and RemoteStorageDesktopManager;
- explicit observation declarations for Recommendation V3, favorites sync, local/GitHub downloads and remote storage sync.

## Deferred

- Visual analysis keeps its H2B timing registry; it is not forced into an async resource lease merely to complete a matrix.
- Android cross-task observation is separate because WorkManager/DownloadManager lifecycle and OS scheduling differ from Desktop Node.
- Production resource capacities remain undefined.

Next work should combine C2/C2B overlap evidence with P2-J/P2-K foreground latency instrumentation before any C3 enforcement proposal.