# P2 Runtime Inventory and Hardening Audit

Status: **P2-0 initial inventory complete; remediation open**  
Last reconciled: **2026-09-24**  
Parent task log: `DEVELOPMENT_TASK_LOG.md`

## Purpose

This file is the checked-in runtime map required by P2-0. It records where long/heavy work currently runs, which component owns authoritative state, what control/recovery semantics exist, and which remaining gaps should be fixed before P2 is closed.

The goal is **not** to force every task into one scheduler implementation. Desktop async tasks, browser Workers, Android WorkManager and OS DownloadManager have different lifecycle needs. The goal is a consistent contract and explicit resource governance.

## Classification

Resource classes used below:

- **CPU** — ranking, identity analysis, Visual/model/QC computation.
- **DB-R** — potentially material SQLite reads.
- **DB-W** — potentially material SQLite writes.
- **FS-R / FS-W** — local file scanning, hashing, copying or writes.
- **NET-P** — Provider/API traffic.
- **NET-M** — media transfer.
- **NET-R** — remote storage.
- **UI** — work whose current execution can directly affect browser/Android UI responsiveness.

Risk levels are implementation priorities for P2 only; they are not release severity labels.

---

## 1. Runtime inventory

| ID | Operation | Current execution owner | Authoritative state / commit boundary | Control & recovery | Resources | P2 finding |
| --- | --- | --- | --- | --- | --- | --- |
| RT-01 | Recommendation V3 generation | Desktop `LibraryService` async work in Node process | in-memory progress/control + persisted active/building cycle metadata; replacement only promoted when usable | pause/resume/cancel checkpoints; Pica API timeout; provider failure budget; startup clears interrupted building state; prior usable cycle retained | CPU, DB-R/W, NET-P | **MATURE / PARTIAL** — task contract is good, but state/control is implementation-specific and there is no cross-task CPU/network budget |
| RT-02 | Visual-style indexing | Web page controller + dedicated Web Worker | page-memory control state; embeddings committed per work; unfinished works remain pending | comic-boundary pause/cancel; worker abort; model-load and page-inference timeouts | CPU, UI, DB/API writes | **MEDIUM** — compute is off UI thread, but task authority/control lives in the browser page rather than a durable runtime registry; reload means safe-stop/restart semantics rather than durable same-run resume |
| RT-03 | Desktop Pica favorites sync | `LibraryService` async task | in-memory task state; reconciliation only committed after completed remote listing | page checkpoint pause/resume/cancel; provider waits bounded by client layer | NET-P, DB-R/W | **MEDIUM** — good cooperative controls, but restart recovery is re-run/reuse rather than a durable task record; no global provider budget |
| RT-04 | WebDAV sync | `RemoteStorageDesktopManager` / sync service | manager in-memory state; publication flow is the commit boundary; SHA-matched remote objects reusable | pause/resume/cancel checkpoints; current bounded uploads finish before pause/cancel | NET-R, FS-R, CPU hash, DB/API | **MEDIUM** — local reads are async and checkpointed, but resource use is isolated from downloads/Visual; no process-wide IO/network budget |
| RT-05 | Local Desktop download queue | detached `LibraryService` runner + `DownloadScheduler` + `MediaRequestGate` | SQLite download job state; verified files/pages; single authoritative backend runner | DB-backed pause/resume/retry/cancel; startup recovers interrupted LOCAL jobs; partial files not trusted | NET-M, FS-W, DB-W | **MATURE** — strongest durable runtime model; current performance profiles govern downloads only, not competing application tasks |
| RT-06 | Desktop updater | `UpdateManager` + detached updater process | progress JSON + staged update + application backup; health check commits replacement | cancel/re-check/restart; bounded network calls; old install restored on failed health | NET, FS-W | **MATURE / ISOLATED** — synchronous filesystem operations occur mainly in the detached updater where blocking the main app is not the same risk; keep separate from ordinary runtime budget |
| RT-07 | Maintenance update check | HTTP request directly awaits `LibraryService.checkUpdates()` | each finding written to DB as each comic is checked | **no task progress/pause/cancel/restart contract** | NET-P, DB-R/W | **HIGH** — request-owned long work; provider calls are serial; default discovery currently uses `listComics({limit: 5000})`, which is both a runtime scalability limit and a potential correctness truncation |
| RT-08 | Maintenance repair scan | HTTP request directly calls `scanRepairIssues()` | scan result returned only at end; queued repair jobs use normal durable download queue | **no progress/pause/cancel** | FS-R, DB-R, UI/API event loop | **HIGH** — loops all picture health rows and performs synchronous `existsSync/statSync` per file on the Node event loop |
| RT-09 | Organize library views | HTTP request directly calls `organizeLibraryViews()` | filesystem links/manifests are written incrementally; final index JSON written at end | **no progress/pause/cancel/rollback** | FS-R/W, UI/API event loop | **HIGH** — route passes a `listComics({limit:5000})` snapshot and implementation uses synchronous exists/mkdir/symlink/write operations in a loop |
| RT-10 | Portable library materialization/export | synchronous organizer helper when invoked | output copied incrementally; final manifest written | no common long-task control | FS-R/W | **MEDIUM/HIGH** — recursive `cpSync` can be expensive; must not be hosted by foreground request without explicit detached/task semantics |
| RT-11 | Recommendation V5 shadow retrieval | manual Desktop POST directly awaits `runRecommendationV5ShadowRetrieval()` | candidate pool/audit telemetry persisted at completion; serving remains unchanged | explicit confirmation but **no pause/cancel/progress task state** | NET-P, CPU, DB-R/W | **HIGH** — deliberately manual, but still request-owned heavy work; loads up to 10k catalog entries and performs provider retrieval + hygiene + ranking + diversity before returning |
| RT-12 | Recommendation V5 evaluation/retrospective/steerability | synchronous `LibraryService` calculations behind explicit/manual endpoints | read-only evaluation outputs; no serving mutation | no task lifecycle; inputs are bounded but several methods materialize up to 10k catalog rows / 5k events / many historical pools | CPU, DB-R | **MEDIUM** — ordinary page open no longer auto-runs these, which is correct; instrumentation is still needed to decide which calculations need background execution or memoization |
| RT-13 | Visual QC / author atlas / style-family evaluation | synchronous service calculations for QC/gates; indexing itself is RT-02 | read-only output built from stored embeddings/catalog | manual/advanced only; no task lifecycle for QC calculation | CPU, DB-R | **MEDIUM/HIGH** — methods materialize embeddings and up to 10k comics and may perform pair/graph computations; must remain manual and needs latency measurement/background threshold |
| RT-14 | Work Identity audit/evidence refresh | synchronous service call; evidence refresh writes result | evidence table is durable; automatic binding disabled | no progress/pause/cancel | CPU, DB-R/W | **HIGH for large libraries** — audit calls `allComicsForIdentity()`, intentionally loading the full catalog with `Number.MAX_SAFE_INTEGER`; correct for identity coverage but unsuitable as ungoverned foreground work |
| RT-15 | Work Identity review/materialization preview | synchronous service calculation | read-only preview / prepare-only ledger; execution disabled | no task lifecycle | CPU, DB-R/W | **MEDIUM** — full catalog + decisions can be material; manual advanced workflow is acceptable only if bounded/observable enough |
| RT-16 | Large Library import/re-import | service/database import path | SQLite transaction/canonical rows are authority | no unified long-task contract identified in P2-0 | DB-W, CPU | **FOLLOW-UP** — needs dedicated measurement and confirmation that large imports do not monopolize foreground API |
| RT-17 | Android Native Recommendation V3 | WorkManager + recommendation engine | durable pause marker; new snapshot committed only after cooperative final checkpoint; prior snapshot retained | pause/resume/cancel; process-safe restart semantics; provider failure budget | CPU, NET-P, local storage | **MATURE / PARTIAL** — task-specific lifecycle is good; Android still lacks a cross-task heavy-work budget |
| RT-18 | Android phone downloads | WorkManager per chapter/task + persistent page index | completed page index + verified media; `.part` not trusted | durable pause/resume/cancel; WorkManager retry/backoff | NET-M, FS-W | **MATURE** — needs competition testing with recommendation/import/background sync |
| RT-19 | Android Desktop favorites/covers import | WorkManager unique work | reusable catalog/cover cache; atomic catalog write | durable safe-stop by Work cancellation; resume re-runs unfinished work | NET/local bridge, FS/DB | **MATURE / PARTIAL** — no global resource arbitration with downloads/recommendation |
| RT-20 | Android Pica favorites/bootstrap | WorkManager unique work | existing local cache retained until remote listing/merge completes | safe-stop/restart; network constraint/backoff | NET-P, local storage | **MATURE / PARTIAL** — same global Android concurrency question |
| RT-21 | Android app update | Android `DownloadManager` + Activity observer | system download record + locally persisted expected hash/version/signature state | cancel/retry; 120 s stall detection; verify before install | NET, FS | **MATURE / OS-OWNED** |
| RT-22 | Startup migration/recovery | Desktop startup / database migration authority | schema migrations + pre-migration backup where required; download/recommendation recovery | automatic startup logic | DB-R/W, FS | **CRITICAL BUT BOUNDED** — must be instrumented separately from interactive steady state; migration must never be hidden behind an indefinite startup |
| RT-23 | Server/Remote API long work | W4B authenticated gateway forwards allowlisted calls to loopback engine | operation-specific | depends on underlying operation | NET + underlying class | **FOLLOW-UP** — Remote API must not make request-owned heavy tasks harder to control; browser session allowlist is currently narrower/read-only |
| RT-24 | Remote Web W5B/W5C shell | browser UI/service worker only; user-data/API remains network-owned | W5A session + server state; W5C shell cache only | browser lifecycle; no user-content background work | UI, NET | **LOW for core runtime** — keep PWA shell cache isolated; do not use service worker as a hidden job scheduler |

---

## 2. Confirmed P2-0 findings

### F-01 — No application-wide resource arbiter
**Priority: HIGH**

Download concurrency is explicitly governed by `PerformanceSettings`, `DownloadScheduler` and `MediaRequestGate`. Other heavy systems have their own limits/checkpoints, but there is no common policy answering what happens when, for example:

- Visual indexing is using CPU,
- WebDAV is hashing/uploading,
- downloads are saturating media/network,
- recommendation retrieval starts Provider requests,
- maintenance or V5 evaluation begins.

This does **not** imply one universal queue. P2-C should define resource classes and a small arbiter/budget policy that existing task systems can consult.

### F-02 — Maintenance update check is still request-owned and truncated at 5000
**Priority: HIGH — correctness + runtime**

Current behavior in `LibraryService.checkUpdates()`:

- when comic IDs are not explicitly supplied, it uses `listComics({ limit: 5000 })`;
- filters downloaded comics;
- loops IDs serially;
- awaits Provider episode lookup one comic at a time;
- persists each finding;
- the HTTP request stays open until the complete loop ends.

Required direction:

- remove the correctness-significant 5000-domain truncation;
- turn full-library scan into an observable background task or explicitly bounded batch task;
- add progress and cancel;
- define provider request budget/concurrency conservatively;
- keep each finding idempotent/reviewable;
- use the normal download queue only after the user chooses to queue updates.

### F-03 — Repair scan performs synchronous filesystem stat work on the Node event loop
**Priority: HIGH**

`scanRepairIssues()` currently:

- enumerates picture-health rows;
- calls `fs.existsSync()`;
- calls `fs.statSync()`;
- does so inside the foreground server request.

Required direction:

- asynchronous/batched stat;
- periodic event-loop yield;
- progress and cancel for large scans;
- bounded scan page/chunk size;
- no loss of the existing “scan first, queue repair second” safety model.

### F-04 — Organize/materialize filesystem work is foreground synchronous
**Priority: HIGH**

`organizeLibraryViews()` uses synchronous existence checks, directory creation, symlink/junction creation and index writes. `materializePortableLibrary()` can recursively `cpSync` entire comic directories.

Required direction:

- move heavy materialization out of the foreground request lifecycle;
- async or isolated worker/process implementation;
- progress/cancel;
- explicit partial-output cleanup/re-run semantics;
- no arbitrary 5000-comic correctness boundary.

### F-05 — V5 shadow retrieval is manual but still a long HTTP request
**Priority: HIGH**

The good boundary is already present: it requires explicit confirmation, persists shadow-only evidence and cannot change serving.

The runtime weakness is that the POST waits for provider retrieval + hygiene + ranking + diversity + audit completion.

Required direction:

- preserve manual-only/shadow-only science boundary;
- run as a background analysis task;
- return task ID immediately;
- expose phase/progress/cancel;
- persist final audit atomically;
- do not promote or alter serving.

### F-06 — Visual indexing has Worker isolation but browser-page task authority
**Priority: MEDIUM**

This is not a current UI-thread computation bug. The model runs in a Worker and commits per work.

Remaining architectural question:

- page reload/browser close destroys in-memory controls and Worker;
- resume is effectively “start again and skip already indexed works”, not a durable same-run task.

Required direction:
- either formalize this as durable safe-stop semantics in the task contract, or move orchestration to a durable Desktop-side task owner if real usage shows page lifecycle is confusing.

Do not rewrite the working Worker pipeline without evidence.

### F-07 — Advanced analysis paths need latency thresholds, not automatic migration
**Priority: MEDIUM**

Evaluation, steerability, Visual QC, atlas/style families, Work Identity audit and materialization preview intentionally run only from advanced/manual surfaces. Several load up to 10k comics/full embeddings/full identity catalog.

Required direction:
- instrument first;
- establish a latency threshold for “safe synchronous calculation” versus “background task required”;
- cache by generation where appropriate;
- do not automatically turn every read-only calculation into a persistent job.

### F-08 — Android task lifecycles are mature individually but not globally budgeted
**Priority: MEDIUM/HIGH**

Recommendation, downloads, favorite import and Pica bootstrap all use WorkManager/durable markers appropriately.

Remaining risk:
- WorkManager task uniqueness prevents duplicate copies of the same task, but does not by itself prevent several different heavy tasks competing for network/CPU/storage.

Required direction:
- Android resource-class policy;
- foreground/user-visible download/Reader traffic priority;
- WorkManager constraints where useful;
- representative process-death and low-memory tests.

### F-09 — Existing performance report is not a real performance baseline
**Priority: HIGH**

`docs/audit/PERFORMANCE_REPORT.md` records useful implementation bounds, but `PERFORMANCE_TEST_PLAN.md` correctly states real Pica throughput has not been benchmarked.

P2 must not close without:
- startup latency,
- foreground API latency under heavy work,
- Library/detail/Reader response,
- large queue behavior,
- memory/CPU where practical,
- real Windows x64 + representative Android measurements.

---

## 3. Target task contract

P2-A should standardize the following fields conceptually. Implementations may map them to Node state, SQLite, WorkManager, DownloadManager, etc.

```text
taskId
taskType
state
phase
done / total OR indeterminate
startedAt / updatedAt / finishedAt
canPause / canResume / canCancel / canRetry
pauseSemantics = in_place | durable_safe_stop | unsupported
resourceClasses[]
lastError
recoveryMode
resultGeneration / commitBoundary
```

Required state semantics:

```text
queued
running
pausing
paused
cancelling
cancelled
retry_wait
completed
failed
```

Not every task must support every state. Unsupported controls must be explicit.

---

## 4. Target resource classes for P2-C design

Initial resource groups to model:

1. **provider-network**
   - Recommendation retrieval
   - favorites sync
   - maintenance update check
   - Android recommendation/bootstrap

2. **media-network**
   - Desktop downloads
   - Android downloads
   - online Reader media where applicable

3. **remote-storage-network**
   - WebDAV scan/upload/publish

4. **cpu-model**
   - Visual indexing/inference

5. **cpu-analysis**
   - V5 evaluation/QC
   - Work Identity audit
   - recommendation ranking/large local analysis

6. **filesystem-heavy**
   - repair scan
   - organize/materialize
   - WebDAV hashing
   - update replacement (isolated updater; normally exempt from interactive arbitration)

7. **sqlite-write-heavy**
   - import/re-import
   - high-frequency progress/event updates
   - bulk evidence refresh

Design questions for NEXT-2:
- Which groups have independent budgets?
- Which combinations are allowed?
- Which combinations are throttled?
- How does foreground work preempt/deprioritize background work?
- What is the policy on Android versus Desktop?
- How are headless Server defaults different, if at all?

---

## 5. Remediation order from this audit

### H1 — Maintenance runtime hardening
Tasks: RT-07, RT-08, RT-09, RT-10

Why first:
- contains synchronous event-loop filesystem work;
- contains a correctness-relevant 5000-item cap;
- currently lacks task controls;
- fixes are separable from recommendation semantics.

### H2 — Background analysis runtime
Tasks: RT-11, RT-13, RT-14

Why second:
- user-triggered advanced work can still be expensive;
- should become observable without changing scientific/recommendation results.

### H3 — Resource arbiter
Tasks: all heavy task classes

Why after inventory/first instrumentation:
- avoid inventing arbitrary limits;
- reuse existing download/provider limits;
- add policy rather than rewriting every executor.

### H4 — Performance instrumentation and real baseline
Tasks: P2-J/P2-K

Measure before setting promotion budgets.

### H5 — Android cross-task budget and device validation
Tasks: RT-17–RT-20

Preserve existing WorkManager correctness while preventing cross-task contention.

---

## 6. Explicit non-goals of P2 remediation

P2 does **not** authorize:

- changing Recommendation V3/V5 ranking semantics merely for performance;
- promoting V5 shadow work into serving;
- rebuilding Visual embeddings without a separate scientific/product decision;
- auto-materializing Canonical Work identity;
- weakening Provider rate limits;
- hiding background work instead of exposing it;
- making Remote Web browser sessions writable;
- turning W5C into user-content offline caching;
- changing Linux/macOS/ARM64 distribution readiness without their separate real-platform gates.

---

## 7. P2-0 exit

P2-0 is considered complete when:

- this inventory is merged;
- the high-risk request-owned/synchronous paths are explicitly tracked;
- the task log points to this audit;
- next remediation starts with H1 rather than expanding to another unrelated platform feature.

P2 itself remains open.
