# Pica Library Development Task Log

> **Purpose:** authoritative engineering task log for the architecture/runtime/multi-platform expansion.
>
> This file is intentionally different from `PROJECT_LOG.md`: `PROJECT_LOG.md` records released/versioned product evolution; this file records **what still needs to be done, why, in what order, and what evidence is required before a task is considered complete**.

Last reconciled: **2026-09-25**  
Authoritative repository baseline before the current I2 candidate: `main@e4d508dea0d342f4f9b173a20520e69e8262b1b5` (P2-I1 / PR #176 merged)  
Current critical-path work: **P2 Architecture & Runtime Hardening**

---

## 0. How this log must be maintained

### Status vocabulary

- **DONE** — implementation exists and acceptance evidence is present.
- **PARTIAL** — meaningful implementation exists, but one or more acceptance gates remain.
- **IN_PROGRESS** — active branch/PR is implementing the task.
- **PLANNED** — accepted target; implementation not yet started.
- **BLOCKED** — cannot complete until an external prerequisite is available.
- **DEFERRED** — intentionally postponed; not silently abandoned.

### Update rules

1. Every PR that materially changes architecture, runtime behavior, platform support, Remote Web, packaging, performance, or recovery must reference one or more task IDs from this file.
2. A task must not move to **DONE** only because code exists. The relevant unit/integration/browser/package/real-device gate must also exist and pass.
3. Newly discovered work is appended under the closest existing workstream. Do not silently remove an unfinished task.
4. If scope or order changes, update this file in the same PR and record the reason in the **Decision / scope-change log**.
5. Existing safety boundaries are constraints, not suggestions. A new platform or UI must not bypass them to make a demo work.
6. Do not reopen completed recommendation-science/model work merely because this architecture project touches recommendation runtime. This log governs product architecture/runtime/platform work, not model-quality promotion.
7. Release/version history stays in `PROJECT_LOG.md`. This file remains the forward-looking source of truth.

### Non-negotiable product rules

- Ordinary browsing, page switching, search, Reader navigation and settings must remain responsive while heavy work is running.
- A task that can take more than a few seconds must not be a black box.
- Long tasks expose authoritative state, progress or an explicit indeterminate phase, bounded waits, cancel, retry/resume, and a documented pause/safe-stop semantic where technically meaningful.
- The last usable result remains authoritative until a replacement is fully committed.
- Network loss must fail within bounded time with an actionable state; no indefinite spinner.
- User-requested pause/cancel is not an item-level failure and must not be swallowed.
- Partial download/upload/index/recommendation results must never masquerade as completed state.
- UI state must reflect backend/Worker state; decorative progress or pause controls are unacceptable.
- Application binaries and user data remain separate across every platform.
- Platform capability reporting must be honest. Unsupported/unvalidated targets remain `distributionReady=false` and `selfUpdate=false`.
- Remote access never weakens the local loopback boundary by simply exposing the Desktop controller to the network.

---

# 1. Current priority and execution order

The current critical path is:

1. **P2 — Architecture & Runtime Hardening**: finish the system-level runtime/performance work that earlier versions addressed only partially.
2. **P2-H1 — Maintenance runtime hardening**: remove the confirmed foreground blocking/truncation paths before introducing broader resource arbitration.
3. **P3 — Platform foundation regression lock**: keep the shared platform/runtime layer clean while P2 changes land.
4. **P4 — Real-platform acceptance**: finish the open Linux/macOS/Windows ARM64/Server gates without weakening capability truth.
5. **P5 — Remote Web**: W5A/W5B/W5C are complete. Continue later Remote Web stages without allowing them to replace the P2 hardening work.
6. **P6 — Formal distribution/release gates**: only after real-device, signing/trust, performance and rollback evidence exists.

**Parallel-work rule:** isolated future Remote Web work may proceed only when it does not redefine the priority order above or weaken the completed W5A/W5B/W5C boundaries.

---

# 2. P1 — Correctness Foundation

Overall status: **PARTIAL / regression baseline established**

The original architecture audit put correctness before portability. Several core items are already locked by `test/unit/correctness-foundation-p1.test.ts`; the remaining requirement is to keep these invariants intact while runtime/platform work proceeds.

## P1-A — Direct single-object data access
**Status: DONE**

- Single comic detail lookup uses direct indexed database access.
- Do not route a single-comic detail request through a full-catalog list.
- Keep direct lookup behavior for future platform/API wrappers.

**Acceptance**
- Contract test continues to assert direct `WHERE c.id = ?` style lookup.
- No new API adapter reintroduces whole-catalog scans for single-object reads.

## P1-B — Correct detail navigation identity
**Status: DONE**

- Android comic-to-comic navigation uses the normal Activity back stack.
- `A detail -> B detail -> Back` must restore A rather than reuse stale B state.
- Web/Desktop detail transitions must not reuse stale async responses.

**Acceptance**
- Android manifest/back-stack regression remains green.
- Web stale-response generation/request-ID gate remains green.

## P1-C — Stale asynchronous response suppression
**Status: DONE**

- Requests tied to a selected comic/page/session must carry a generation/request identity.
- Late A responses cannot overwrite newer B UI state.

**Acceptance**
- Existing request-ID checks remain covered in tests.
- New Remote Web/mobile async detail flows follow the same rule.

## P1-D — Atomic portable/catalog persistence
**Status: DONE for current Android catalog path**

- Android Unified Catalog uses `AtomicFile` recovery semantics.
- Future portable-state files that can be rewritten in place must use equivalent atomic replace semantics.

**Acceptance**
- Process interruption cannot leave a half-written authoritative portable file.

## P1-E — Bounded-list correctness
**Status: PARTIAL**

- Large-library Work Identity lookup no longer relies on the old 5000-row limit.
- Audit remaining code paths for fixed list limits being incorrectly reused as identity/correctness limits.

**Acceptance**
- Pagination/UX bounds may remain, but correctness queries must not silently truncate the domain they claim to reason over.

## P1-F — Conservative Canonical Work identity
**Status: PARTIAL / ongoing regression requirement**

- `KEEP_SEPARATE` remains higher authority than heuristic similarity.
- Cover similarity remains auxiliary evidence, never a sole authoritative merge trigger.
- Series / Work / Edition / Upload distinctions remain explicit.

**Acceptance**
- No architecture/platform refactor collapses these layers or auto-materializes uncertain relationships.

## P1-G — Last-known-good replacement semantics
**Status: PARTIAL**

Applies to:
- recommendations,
- Visual index generations,
- catalog/portable state,
- remote sync publication,
- update/install replacement,
- migration/rollback.

**Acceptance**
- Incomplete replacement cannot destroy or supersede a previously usable generation.
- Commit/publish/activate boundaries are explicit and testable.

---

# 3. P2 — Architecture & Runtime Hardening

Overall status: **IN_PROGRESS priority workstream**

Existing v0.4.1, v0.4.7 and v0.4.8 work solved important concrete problems. P2 is not a request to rewrite those systems. Its purpose is to turn those fixes into a consistent runtime architecture, remove remaining duplicated/hidden heavy work, establish resource budgets, and add real performance evidence.

## P2-0 — Full runtime inventory and dependency map
**Status: DONE — see [docs/RUNTIME_INVENTORY_P2.md](./docs/RUNTIME_INVENTORY_P2.md)**

Inventory every operation that can materially consume CPU, disk, network, SQLite write bandwidth or UI time.

Minimum inventory:
- Recommendation V3 generation.
- Recommendation V5 shadow/evaluation/manual benchmark paths.
- Visual indexing / Visual QC / embedding-related work.
- Pica favorites sync.
- E-H/ExH account/favorites operations where long-running.
- WebDAV scan/upload/publication.
- Local download queue.
- Android download Workers.
- Android recommendation generation.
- Android Pica bootstrap/favorites import.
- Desktop-to-Android catalog/cover import.
- update download/apply/restart flow.
- maintenance/repair scans.
- Work Identity evidence scans/materialization preview.
- large library import/re-import.
- Remote Web/server operations that may proxy long-running work.
- startup recovery and migration work.

For every task record:
- execution owner (main thread / Worker / WorkManager / detached backend / child process);
- authoritative state store;
- progress source;
- pause semantics;
- cancel semantics;
- timeout/failure budget;
- restart recovery;
- SQLite read/write pattern;
- CPU/IO/network class;
- concurrency with other heavy tasks;
- last-known-good/commit boundary.

**Acceptance**
- A checked-in audit table exists.
- Every long-running task has an owner and lifecycle; “unknown/implicit” is treated as a defect.

## P2-A — Unified long-task state contract
**Status: PARTIAL**

Current mature pieces already exist for recommendation, Visual, favorites sync, WebDAV, downloads and Android Workers.

Target:
- define a common conceptual lifecycle without forcing all tasks into one implementation class;
- standardize state names and user-visible semantics;
- standardize `phase`, `done/total`, failure reason, canPause/canCancel/canRetry and recovery metadata where applicable;
- distinguish **in-place pause** from **durable safe-stop**;
- prevent page-local state from being treated as task authority.

**Do not regress**
- recommendation pause/resume/cancel;
- Visual comic-boundary checkpointing;
- favorites page checkpointing;
- WebDAV checkpointing;
- DB-backed download pause/resume;
- Android WorkManager durable semantics.

**Acceptance**
- task state returned by backend/Worker is authoritative;
- reload/navigation reconstructs task UI from authoritative state;
- control availability matches real backend capability.

## P2-B — Heavy-work execution isolation
**Status: PARTIAL**

Target:
- CPU-heavy Visual/model work stays off the UI/main event loop.
- Long HTTP endpoints start/inspect/control work; they do not own the lifetime of the work.
- Disk scans and hashing remain asynchronous and periodically yield.
- Android Activities render first and load/compute heavy recommendation state off the UI thread.
- opening a normal page never implicitly launches Evaluation, Visual QC or provider shadow work.

**Acceptance**
- no normal navigation path performs a hidden full-library scan/model load/network benchmark before first usable render;
- long work survives page navigation according to its documented semantics.

## P2-C — Runtime resource classes and concurrency budgets
**Status: IN_PROGRESS — C1 foundation + C2/C2B Desktop observe-only coverage; production enforcement remains disabled**

Create explicit budgets for at least:
- provider/API requests;
- media transfers;
- SQLite write-heavy work;
- local file hashing/scanning;
- CPU/model inference;
- background analysis/evaluation.

Questions the implementation must answer:
- Which tasks may run together?
- Which tasks should serialize?
- What is the Desktop default budget?
- What is the more conservative Android budget?
- What happens when a new heavy task starts while another is active?
- Does user-facing work receive priority over maintenance/background work?

Target behavior:
- Recommendation/Visual/WebDAV/downloads cannot all independently saturate CPU/disk/network.
- Foreground library/detail/Reader API latency remains protected.
- Provider limits are respected; do not optimize by evading upstream restrictions.

**Acceptance**
- budgets are centralized or otherwise auditable;
- concurrency is bounded;
- stress tests cover representative competing workloads.

## P2-D — SQLite/query/write discipline
**Status: PARTIAL — D1–D8B + D7C merged; further query/write rewrites require representative performance evidence**

Already improved:
- direct comic lookup;
- removal of known Android N+1 catalog reads;
- batched/throttled download progress writes;
- bounded download queue page.

Remaining:
- audit N+1 loops across Library/Shelves/History/Work Identity/recommendation/supporting APIs;
- audit synchronous DB/file operations on hot request/UI paths;
- identify repeated full-catalog materialization in one interaction;
- ensure indexes support common filters/identity lookups;
- batch transactionally coherent writes;
- avoid high-frequency progress/event writes starving foreground reads.

**Acceptance**
- documented hot-query inventory;
- no known per-card/per-page full-catalog read;
- representative large-library query regression tests.

## P2-E — Snapshot/cache discipline
**Status: IN_PROGRESS — E1/E2 merged; critical cache authority inventory documented; remaining browser/process cache audit moves into P2-F**

Keep and generalize successful patterns:
- frozen Recommendation serving snapshot for batch switching;
- Android Catalog/Policy/evidence/package reuse;
- Reader current-comic metadata cache;
- ownership fingerprint invalidation;
- generation/version identities.

Target:
- cache by authoritative generation/revision, not arbitrary time when possible;
- define invalidation source for every long-lived cache;
- never let cache identity leak across users/sessions/devices;
- avoid duplicate JSON parsing and file hashing in one interaction;
- preserve portable-state version separation.

**Acceptance**
- cache ownership, key and invalidation reason are documented for critical caches;
- stale cache cannot silently become authoritative.

## P2-F — Frontend responsiveness and observer discipline
**Status: IMPLEMENTATION_COMPLETE_REFERENCE_TRACE_OPEN — F1–F13 merged; real-browser cadence evidence passed; representative low-end Windows/browser CPU+jank trace remains external evidence**

Already improved:
- coalesced observers;
- duplicate-submission locks;
- lazy cover rendering;
- bounded Library/download rendering;
- settings pages avoid automatic provider probes;
- experimental tools do not automatically recompute on page open.

Remaining evidence only:
- capture representative low-end Windows/browser CPU + jank trace across Settings, Online, Recommendation and long-running analysis-task transitions;
- do not add more frontend rewrites unless that trace or a future regression identifies a concrete remaining hotspot.

**Acceptance**
- no full-page rescan per DOM mutation;
- only one authority for each recurring poll/state stream;
- browser performance trace shows no persistent high-frequency idle work from the app itself.

## P2-G — Android runtime hardening
**Status: IMPLEMENTATION_COMPLETE_UI_THREAD_IO / PHYSICAL_DEVICE_EVIDENCE_REQUIRED — G1–G19 merged; G20 enforcement blocked pending representative Android evidence**

Already improved:
- heavy recommendation profile work moved off Activity first frame;
- Catalog/Policy/evidence caches;
- bounded recommendation redraw;
- WorkManager-based background operations;
- page-level durable download resume.

Remaining:
- inventory all Activities/Fragments for main-thread file/JSON/DB/network work;
- unify background-task status presentation through the task center where appropriate;
- collect representative physical-device G18 idle startup/frame timing;
- collect representative physical-device G19 real recommendation-overlap timing with provider-network + cpu-analysis actually RUNNING;
- add/collect explicit real download and Reader loaded scenarios using user-selected real comic/chapter inputs rather than synthetic media work;
- pair G17 resource-overlap evidence with G18/G19 foreground metrics before choosing concurrency budgets;
- keep G20/P2-C3 Android concurrency enforcement blocked unless measured contention justifies it;
- validate remaining OEM/physical-device background restrictions where generic emulator evidence is insufficient;
- verify large Catalog and long Reader behavior on representative mid-range hardware.

**Acceptance**
- no known heavy blocking operation on the Android UI thread;
- process death does not convert partial work into completed state;
- background task UI is reconstructible after Activity recreation.

## P2-H — Startup, shutdown and crash recovery
**Status: IMPLEMENTATION_COMPLETE — H3 merged; automated recovery matrix reconciled; external Android/OEM evidence tracked under P2-G/P2-K**

Required:
- stale recommendation building state cleanup;
- active download recovery without reviving deliberate PAUSED tasks;
- WebDAV publication safety;
- Visual pending work preservation;
- explicit graceful shutdown ordering;
- forced-exit fallback must not leave a false completed state;
- schema migration backup before destructive/irreversible change;
- Browser lifecycle must not kill Mobile Bridge when paired devices require it;
- headless runtime must not depend on browser lifecycle.

**Acceptance**
- automated kill/restart tests for critical durable tasks;
- explicit recovery table checked into docs/tests.

Current reconciliation:
- Recommendation interrupted-building recovery: implemented and tested;
- Desktop LOCAL download restart/PAUSED preservation: implemented and tested;
- WebDAV publication safety: implemented;
- Visual unfinished-work preservation: implemented;
- schema pre-migration backup: implemented and tested;
- browser-close Mobile Bridge lease protection: implemented and tested;
- headless/browser lifecycle separation: implemented and tested;
- **H3 merged (PR #175):** Desktop shutdown is globally bounded and fault-isolated; one failed close owner cannot skip later HTTP/DB/instance cleanup.
- Full platform/package acceptance plus Android regressions passed before merge.
- Detailed recovery matrix: `docs/DESKTOP_SHUTDOWN_RECOVERY_P2H3.md`.

## P2-I — Observability without exposing internals to ordinary users
**Status: IN_PROGRESS — I1 merged; I2 external Desktop owner adapters candidate**

Internal diagnostics should expose:
- task ID/type/state/phase;
- start/update/end time;
- queue/wait/run duration;
- retries and bounded failure reason;
- resource class;
- provider route where safe;
- recovery origin after restart.

Ordinary UI should expose only useful status, progress and actionable errors.

Security:
- no provider credentials, cookies, bearer tokens or sensitive local paths in normal diagnostic exports;
- providerRoute, when present, must be a fixed low-cardinality label and must never contain URL/host/account/path values.

**Acceptance**
- enough structured telemetry to diagnose “stuck” vs “slow” vs “waiting” vs “failed”;
- diagnostic data follows existing credential-exclusion rules.

I1 merged (PR #176):
- read-only adapter over existing task authorities; no second scheduler/registry;
- Desktop-only `GET /api/v1/desktop/runtime/tasks`;
- first batch covers Recommendation V3, Favorites, Maintenance Update/Repair/Organize, V5 Shadow, Work Identity evidence and aggregate LOCAL downloads;
- unavailable task IDs/timestamps/control flags remain `null` instead of being synthesized;
- current resource wait/run state is correlated from the existing RuntimeResourceCoordinator;
- bounded error text redacts URLs, absolute paths, Bearer/token/password/cookie/authorization shapes;
- endpoint is excluded from Remote API and from J1 HTTP latency samples.

I2 candidate:
- extends the same schema/endpoint to WebDAV, Browser Lite export, managed E-H login and software update;
- external owners remain authoritative; Desktop main only aggregates snapshots;
- WebDAV reuses the existing shared `remote-storage-sync` resource lease;
- Browser Lite/E-H/updater do not receive invented resource leases/timestamps/IDs;
- adds safe `providerRoute` labels only for `webdav`, `eh-managed-browser`, and `github-release`;
- failed external-owner messages pass through the same I1 sanitizer;
- Remote API/browser-session boundaries remain unchanged.
- Detailed boundaries: `docs/RUNTIME_TASK_DIAGNOSTICS_P2I1.md`, `docs/RUNTIME_TASK_DIAGNOSTICS_P2I2.md`.

## P2-J — Performance instrumentation
**Status: IN_PROGRESS — J1 runtime telemetry + J2 repeatable Desktop scenario harness implemented; startup/browser/Android measurements remain open**

Current `docs/audit/PERFORMANCE_REPORT.md` contains implementation bounds, not a complete real benchmark.

Add consistent measurement for:
- process cold start -> local API ready;
- browser open -> usable Home/Library;
- Android cold start -> usable main shell;
- Library first render and filtered query;
- comic detail open;
- shelf open;
- recommendation generation and batch switch separately;
- Reader chapter open / next page / long-session memory behavior;
- download queue API responsiveness under active transfers;
- WebDAV scan impact on foreground API latency;
- Visual indexing impact on foreground latency;
- task-concurrency scenarios;
- graceful shutdown.

**Acceptance**
- metrics are reproducible and emitted in machine-readable form where practical.

## P2-K — Real benchmark matrix and performance budgets
**Status: PLANNED**

Do not call synthetic benchmarks real throughput tests.

Minimum matrix:
- small / medium / large libraries;
- idle vs download-active vs scan-active vs Visual-active conditions;
- Windows x64 reference machine;
- representative Android mid-range device;
- later Linux/macOS/ARM64 reference hardware as those previews mature.

For provider/network tests:
- use the same content IDs/plans where possible;
- repeat runs and report median + range;
- record proxy/network route/region/provider limits;
- stop on rate limits rather than tuning to bypass them.

Initial budgets should be evidence-driven; do not invent flattering thresholds before measuring.

**Acceptance**
- checked-in benchmark report with environment and variance;
- regressions above approved budget fail or at minimum block release promotion.

## P2-L — Runtime hardening regression gate
**Status: PLANNED**

Final P2 gate combines:
- TypeScript/unit/integration tests;
- Chromium UI smoke;
- long-task contract;
- network interruption tests;
- large queue tests;
- Android unit/lint/assemble;
- Windows package smoke;
- runtime concurrency/performance checks;
- manual Windows + Android task-control acceptance.

**P2 exit criterion**
P2 is not complete until the product can demonstrate that heavy work may take time **without making ordinary use feel frozen or opaque**.

---

# 4. P3 — Shared Platform Foundation

Overall status: **DONE with regression obligations**

## P3-A — Platform/architecture capability model
**Status: DONE**

- Windows / macOS / Linux platform IDs.
- x64/arm64-aware capability reporting.
- `supported / available / reason / execution` distinction.
- Only Windows x64 currently reports formal production distribution/self-update readiness.

## P3-B — Native data roots
**Status: DONE**

- Windows: LocalAppData-based Pica root.
- macOS: Application Support.
- Linux: XDG data root with standard fallback.

## P3-C — OS action adapters
**Status: DONE / platform preview implementations still gated**

- browser launch;
- directory launch;
- folder/save picker capability;
- secure credential backend;
- managed E-H browser capability.

Business logic must not reintroduce direct Windows-only assumptions.

## P3-D — Interactive vs headless runtime
**Status: DONE**

- ordinary Desktop remains interactive;
- headless is persistent/no-GUI;
- Mobile Bridge and Remote API are explicit opt-ins;
- browser-close lifecycle is not applied to headless.

## P3-E — Network boundary
**Status: DONE**

- ordinary application engine remains loopback-only;
- remote access is behind the authenticated Remote API gateway.

## P3-F — Shared core services
**Status: PARTIAL / regression requirement**

CLI, local Web API, Desktop and Server should continue to reuse:
- `LibraryService`;
- `LibraryDatabase`;
- download state machine/scheduler;
- common Provider/domain logic where platform-appropriate.

**Acceptance**
- no new platform fork of core library/download semantics without a documented reason.

---

# 5. P4A — Desktop multi-platform previews

Overall status: **PARTIAL**

## P4A-Linux-x64
**Automated preview status: DONE**  
**User-preview promotion: BLOCKED by real environment evidence**

Completed automated evidence:
- official pinned Node linux-x64 runtime;
- glibc 2.28 boundary;
- Rocky Linux 8.9 live runtime gate;
- synthetic library reopen;
- Library/detail/shelf/Reader/download pause-resume/restart vertical acceptance;
- external data root;
- W4A application replacement/rollback;
- migration backup requirement when schema rises;
- rootless user installer/uninstaller;
- Desktop Entry/icon validation;
- formal distribution/self-update remain disabled.

Still required:
- real authorized Provider login/browse/detail/read flow;
- Secret Service in real graphical session;
- GNOME/Zenity and KDE/KDialog picker validation or narrower declared support;
- real menu/icon/browser-launch behavior;
- real graphical distro near glibc baseline;
- schema-changing real preview rollback;
- cold start / long Reader / task concurrency benchmark.

## P4A-macOS-arm64
**Automated preview status: DONE**  
**User-preview promotion: BLOCKED by real Mac trust/UX evidence**

Completed:
- native Apple Silicon runner/runtime;
- macOS minimum-version inspection;
- Keychain credential persistence;
- external data root;
- replacement/rollback;
- self-contained `Pica Library.app`;
- Bundle ID/icon/Info.plist;
- LaunchServices startup;
- signed/notarized/distributionReady/selfUpdate remain false.

Still required:
- real Provider login/read/download;
- interactive native folder/save pickers;
- Finder/Dock/browser-launch UX;
- Developer ID signing;
- hardened runtime where required;
- notarization/stapling/Gatekeeper;
- runtime check near macOS 13.5;
- schema-changing rollback;
- cold start / long Reader / task concurrency benchmark.

## P4A-Windows-ARM64
**Automated preview status: DONE**  
**User-preview promotion: BLOCKED by physical-device evidence**

Completed:
- native Windows ARM runner;
- official Node win-arm64 runtime;
- AnyCPU launcher;
- DPAPI;
- WinForms picker capability;
- vertical acceptance;
- replacement/rollback;
- per-user installer/uninstaller;
- running-engine install/uninstall refusal;
- formal distribution/self-update remain false.

Still required:
- physical ARM64 Windows device;
- real Provider login/read/download;
- interactive browser/picker/managed E-H flow;
- installer/Start Menu/uninstall UX on device;
- schema-changing rollback;
- cold start / long Reader / Visual / concurrent download benchmark;
- signing/SmartScreen/reputation/release provenance;
- formal update channel design.

---

# 6. P4B — Server / Docker operator preview

Overall status: **PARTIAL**

Completed W4B foundation:
- headless runtime;
- Caddy-only public ingress;
- authenticated Remote API gateway;
- loopback application engine;
- Host/Origin restrictions;
- non-root container;
- dropped Linux capabilities;
- no-new-privileges;
- read-only application filesystem;
- persistent config volume;
- one-shot secret-init flow with private runtime token;
- image replacement + stopped-volume snapshot rollback model;
- default Compose keeps browser sessions/Remote Web disabled.

Still required:
- real Provider credentials and real Provider behavior in a representative deployment;
- long-running soak/restart/resource tests;
- public/preview registry decision;
- immutable digest-based operator guidance;
- image signing/attestation/provenance;
- formal server release/update/rollback policy;
- multi-user/tenant isolation before calling it a family/shared-host product;
- P2 performance/resource-budget integration.

---

# 7. P5 — Remote Web

Overall status: **IN_PROGRESS**

## W5A — Browser session security primitive
**Status: DONE**

Locked boundary:
- long-lived bearer used only for explicit session bootstrap;
- browser receives HttpOnly Secure SameSite=Strict `__Host-pica_session`;
- gateway stores only session-token digest;
- process restart invalidates sessions;
- exact HTTPS Origin binding;
- CSRF for browser-session writes;
- bearer/session/Origin headers are stripped before loopback engine;
- disabled by default.

## W5B — Isolated read-only Remote Web shell
**Status: DONE**

Completed:
- library search;
- shelves;
- comic detail/covers;
- downloaded list;
- downloaded Reader;
- zh-CN/en/ja;
- logout;
- strict static asset allowlist;
- restrictive CSP and security headers;
- no LocalStorage/SessionStorage/IndexedDB/Cache Storage/service worker;
- browser-session API allowlist is narrower than bearer API;
- reader-progress/favorite/download/shelf/settings/provider/update/restart writes are denied.

## W5C — Installable shell-only Remote Web PWA
**Status: DONE — PR #109 merged**

Current PR scope is accepted as the actual W5C label. Do not rename it retroactively.

Intended W5C boundary:
- scoped manifest;
- dedicated reviewed icon;
- scoped service worker;
- cache **only** fixed shell assets;
- network-first shell with cache fallback;
- no API/session/media/cover/Reader/user-JSON caching;
- shell/login UI may load offline;
- offline manga/library data is explicitly out of scope;
- CSP opens only the minimum manifest/worker sources;
- capability is reported separately;
- default operator Compose remains disabled.

**W5C acceptance**
- source contract + gateway tests;
- Chromium service-worker/cache/offline-shell smoke;
- Docker/Caddy TLS validation;
- all existing Desktop/Android/Linux/macOS/Windows ARM64 gates remain green.

## W5D — Operator-friendly browser authorization/onboarding
**Status: PLANNED**

Goal: ordinary users should not need to understand or paste a long-lived Remote API bearer during routine use.

Design requirements:
- short-lived or one-time authorization/pairing primitive;
- long-lived bearer remains operator/admin secret;
- no bearer persistence in browser storage;
- explicit approval and revocation;
- origin/session binding preserved;
- clear session-expired/revoked/server-unreachable UI;
- no weakening of W5A CSRF/cookie boundary.

**Acceptance**
- successful onboarding without exposing the long-lived bearer to persistent browser JS state;
- revocation invalidates future use;
- replay/expired-code tests.

## W5E — Real mobile/desktop browser usability and weak-network validation
**Status: PLANNED**

Validate:
- iOS/Android browser layout;
- installed-PWA launch behavior where supported;
- narrow-width navigation;
- touch target sizing;
- Reader tap/swipe/page navigation decision;
- server disconnect/reconnect;
- high latency and intermittent network;
- large library search;
- cover/media loading;
- session expiration mid-use;
- browser back/forward behavior;
- long Reader memory behavior.

## W5F — Secure offline user-content design
**Status: DEFERRED until identity/cache model is proven**

This is distinct from W5C shell-only caching.

Before caching library/user content:
- partition cache by authenticated identity/session/tenant;
- version content/cache schema;
- define encrypted-at-rest expectations or explicitly state limitations;
- logout/revoke purge;
- server/account switch purge;
- stale-data rules;
- storage quota/eviction behavior;
- never cache provider/admin secrets.

Only after this contract exists may downloaded content/offline library reading be evaluated.

## W5G — Selective Remote Web writes
**Status: DEFERRED**

Potential future writes:
- reader progress;
- shelf mutation;
- favorite mutation;
- download creation/control;
- recommendation feedback.

Rules:
- add one workflow at a time;
- explicit browser-session permission;
- Origin + CSRF;
- idempotency where needed;
- auditability;
- do not expose the entire W4B bearer API to browser sessions.

## W5H — Multi-user / tenant model and formal Remote Web support
**Status: DEFERRED**

Required before shared household/server claims:
- user/tenant identity;
- per-user library state where appropriate;
- cache/session isolation;
- authorization model;
- audit/revocation;
- migration path from current single-operator server.

---

# 8. P6 — Formal distribution and release hardening

Overall status: **PLANNED / partially blocked on real devices and credentials**

## P6-A — Windows x64 regression authority
**Status: ONGOING**

Windows x64 remains the formal Desktop production target.

Every shared-platform/runtime refactor must prove it did not regress:
- existing install/update chain;
- DPAPI credentials;
- local data root;
- library/download/shelf/history state;
- Reader;
- Mobile Bridge;
- Provider flows;
- rollback/update safety.

## P6-B — Real-device/manual acceptance
**Status: PARTIAL**

Maintain explicit acceptance scripts for:
- Windows x64;
- Android;
- Linux x64 when real device/session available;
- macOS arm64;
- Windows ARM64;
- Server/Docker deployment.

## P6-C — Signing/trust/reputation
**Status: PARTIAL**

Required by platform:
- Windows: signing/SmartScreen/reputation/release provenance.
- macOS: Developer ID/notarization/Gatekeeper.
- Docker: image signing/attestation/provenance.
- Android: same production package/signing identity for in-place upgrades.

## P6-D — Performance promotion gate
**Status: PLANNED**

A platform must not be called ready solely because functional CI passes.

Need:
- cold start;
- Reader;
- task concurrency;
- download/API responsiveness;
- representative hardware evidence.

## P6-E — Schema-changing replacement/rollback
**Status: PARTIAL**

Same-schema replacement is already well covered for previews.

Still require real evidence when a future preview actually raises schema:
- pre-migration backup;
- candidate migration;
- functional validation;
- rollback using matching application + data snapshot;
- explicit statement about post-snapshot state loss.

## P6-F — Release documentation and support boundaries
**Status: PARTIAL**

Before promotion:
- support matrix matches capability truth;
- no unsupported self-update claims;
- install/uninstall data-preservation behavior documented;
- limitations visible;
- current README remains user-focused and does not expose unnecessary internal detail; engineering details stay in docs/task log.

---

# 9. Cross-cutting scenario acceptance

These scenarios must remain part of regression thinking even when a specific PR changes only one module.

1. Open a large Library while downloads are active.
2. Switch recommendation batches while the previous batch remains stable.
3. Start recommendation generation, navigate away, return, pause/resume/cancel.
4. Lose network during recommendation retrieval.
5. Kill/restart Desktop during recommendation generation.
6. Run Visual indexing while browsing Library/Reader.
7. Pause/resume/cancel Visual indexing.
8. Run WebDAV scan/sync on a large local library while using the local API.
9. Lose network during WebDAV upload.
10. Start a large download queue; reload/close/reopen Web UI.
11. Restart application with interrupted downloads.
12. Android process death during recommendation generation.
13. Android process death during a chapter download.
14. Rapidly open comic A then B while A async requests are still pending.
15. Navigate A detail -> B detail -> Back.
16. Switch between Library/Recommendation/Online/Settings repeatedly during background work.
17. Upgrade application while preserving external user data.
18. Roll back application with the matching data snapshot.
19. Headless runtime restart with Remote API enabled.
20. Browser Remote Web session expires/revokes while the page is open.
21. Weak/high-latency network Remote Web Reader.
22. New-platform missing native dependency: capability reports unavailable with a reason instead of crashing.
23. Provider failure/rate limit: bounded failure without aggressive retry escalation.
24. Multiple heavy tasks contend for CPU/disk/network: foreground use remains responsive.

---

# 10. Evidence references already in the repository

The task log should be updated against, not replace, these focused documents:

- `docs/architecture.md`
- `docs/LONG_TASK_STABILITY_V047.md`
- `docs/WEB_UX_AUDIT_V5.md`
- `docs/audit/PERFORMANCE_TEST_PLAN.md`
- `docs/audit/PERFORMANCE_REPORT.md`
- `docs/LINUX_X64_PREVIEW_SUPPORT.md`
- `docs/MACOS_ARM64_PREVIEW_SUPPORT.md`
- `docs/WINDOWS_ARM64_PREVIEW_SUPPORT.md`
- `docs/SERVER_DOCKER_PREVIEW_DEPLOYMENT.md`
- `docs/REMOTE_WEB_SESSION_W5A.md`
- `docs/REMOTE_WEB_READONLY_W5B.md`
- `docs/NEXT_STABLE_RELEASE_READINESS_20260920.md`
- `test/unit/correctness-foundation-p1.test.ts`
- `test/unit/long-task-stability-v047.test.ts`
- `test/unit/download-large-queue.test.ts`
- `test/unit/desktop-platform-foundation.test.ts`
- `test/unit/desktop-headless-runtime-p5c.test.ts`

---

# 11. Immediate next work

## NEXT-1 — P2-0 runtime inventory
**Status: DONE**

Produce the checked-in runtime inventory/dependency map and identify:
- remaining hidden main-thread work;
- duplicate task-state authorities;
- missing timeout/cancel/recovery behavior;
- resource-concurrency conflicts;
- repeated DB/full-catalog/JSON work;
- missing performance instrumentation.

## NEXT-2 — H1 maintenance runtime hardening
**Status: DONE**

Fix the confirmed foreground maintenance hazards before adding a global resource arbiter:

- **DONE (PR #112):** repair scanning no longer performs synchronous per-file `existsSync/statSync` work on the Node event loop; it now uses asynchronous stat calls, progress callbacks and event-loop yielding.
- **DONE (PR #113):** full maintenance update checks now run as an observable background task with pause/resume/cancel; explicit narrow comic-ID checks remain synchronous for compatibility.
- **DONE (PR #113):** the correctness-significant 5000-comic default update-scan cap was removed by querying the complete downloaded-comic ID domain directly.
- **DONE (PR #114):** organize/materialize filesystem work now uses asynchronous checkpointable primitives; the Web organize route is a controllable background task, CLI organize/portable use the complete catalog, and final indexes/manifests publish only after the last checkpoint.
- **DONE (PR #115):** repair scanning now uses the same background task model with authoritative progress and pause/resume/cancel.
- preserve the current safety model: scan/review first, then enqueue repair/update jobs.

## NEXT-3 — H2 background analysis runtime
**Status: IN_PROGRESS**

Promote expensive manual/advanced analysis paths to observable background tasks without changing their scientific/product semantics.

- **DONE (PR #116) — H2A / RT-11:** Recommendation V5 Shadow Retrieval is a detached Desktop task with authoritative phase/provider progress, pause/resume/cancel, reload recovery, and compact terminal summary. Shadow-only, explicit-confirmation and `servingImpact=false` boundaries remain unchanged.
- **IN_PROGRESS — H2B / RT-13:** Visual QC / Author Atlas / Style Family now record bounded runtime telemetry and have a deterministic synthetic scaling harness. No foreground threshold has been selected yet; background only calculations that exceed the later evidence-based threshold.
- **DONE (PR #118) — H2C / RT-14:** Work Identity evidence refresh is a checkpointable detached service-owned task with pause/resume/cancel and reload-safe Web controls. The async audit is tested for exact result equivalence with the synchronous baseline; evidence remains evidence-only and persists only after the final checkpoint. All main CI plus Linux, macOS arm64, Docker and rerun Windows ARM64 package gates passed before merge.

## NEXT-4 — P2-C resource-budget design
**Status: IN_PROGRESS — C1 foundation + C2/C2B Desktop observe-only coverage**

- **C1:** add a tested resource coordinator with shared resource-class vocabulary, atomic multi-resource leases, priority/FIFO admission semantics, cancellation and diagnostics. Production mode remains observe-only and does not impose invented capacities.
- **C2 first batch implemented:** maintenance update, repair, organize, Recommendation V5 Shadow and Work Identity evidence refresh now declare observe-only resource leases; Desktop-only diagnostics expose current/peak overlap.
- **C2B Desktop batch implemented:** Recommendation V3, favorites sync, local/GitHub download runners and WebDAV now join the same process-wide observe-only resource graph. Desktop injects one coordinator into LibraryService and RemoteStorageDesktopManager; existing task schedulers remain authoritative.
- **C2 remaining:** collect overlap/latency evidence, keep Visual under its H2B timing path unless phase/resource observation is useful, and design Android-specific cross-task observation rather than copying the Desktop mechanism.
- **C3 later:** propose enforceable capacities only after overlap and latency evidence exists; before enforcement, task-lifetime leases must become phase-aware where needed so paused tasks do not reserve enforced capacity.

Use the runtime inventory plus H1/H2 measurements to define resource classes and concurrency policy. Do not invent limits before observing current workloads.

## NEXT-5 — P2-J/P2-K performance baseline
**Status: IN_PROGRESS — J1 telemetry + J2 repeatable Desktop scenario windows**

- **J1 implemented:** bounded in-memory local HTTP latency telemetry classifies requests into low-cardinality route classes and correlates them with active resource-task types without storing URLs, comic IDs, search terms, bodies, tokens or paths.
- Desktop-only `/api/v1/desktop/runtime/http-profile` exposes count/p50/p95/max/error summaries for overall, idle, under-load, route class and active task type.
- **J2 implemented:** `pnpm benchmark:http-latency-scenario` drives repeatable sequential Library/detail/Reader foreground traffic against an already-running loopback Desktop engine, with warm-up, clean telemetry reset and three rounds by default.
- J2 idle windows are valid only when every foreground sample is idle; load windows are valid only when each requested observed task covers every foreground sample. This validates the measurement window, not the performance result.
- The J2 harness never starts or controls the measured background workload, never emits discovered comic/chapter IDs, and selects no latency threshold or release budget.
- **Next:** collect and check in representative Windows x64 idle-vs-download/WebDAV/recommendation/maintenance evidence, then add Android-specific startup/jank/foreground latency measurement before P2-K budgets.

## NEXT-6 — P2-D SQLite/query discipline
**Status: PARTIAL — D1–D8B + D7C merged; evidence collection blocks further production query rewrites**

This remains the next unblocked P2 lane while J2 real Windows x64 measurement evidence requires a representative running Desktop environment.

- **D1 merged (PR #124):** complete-domain Browser Lite/CLI paths no longer reuse the legacy 5000-row presentation cap.
- **D2 merged (PR #125):** Shelf/recommendation exact-ID reads use chunked `getComicsByIds()`; author metadata changed from 2N+1 to fixed batched queries with the required reverse indexes.
- **D3 merged (PR #126):** ordinary no-text Library queries avoid complete author metadata; `pnpm benchmark:library-query` records SQLite scaling evidence without defining a release budget.
- **D4 merged (PR #127):** Final V3 frozen serving, portable readback and serving-composition diagnostics use complete owned+candidate exact-ID domains instead of unrelated 10000-row catalog materialization; Canonical Work ownership semantics remain unchanged.
- **D5A merged (PR #128):** Work Identity bounded review reads and authoritative correctness reads are separate contracts. Materialization plan uses all decisions + all bindings; review preview switches to the full decision domain when the bounded review list is incomplete; Final V3 Canonical Work ownership uses all bindings.
- D5A regression constructs 10001 bindings and 5001 decisions in real SQLite, requiring bounded APIs to remain capped while authoritative APIs cross both former boundaries.
- **D5B merged (PR #129):** `workVariantsForComic()` uses targeted current binding, same-work bindings, current-comic decisions and current-comic probable evidence rather than global 10000/5000 relationship prefixes.
- D5B preserves binding metadata for decision/evidence variants through a batched exact-ID binding lookup and keeps the intentional full-catalog creator/title/cover heuristic funnel unchanged.
- Migration 15 adds only the missing right-side decision and left/right probable-evidence indexes needed by symmetric current-comic relationship reads.
- **D6A merged (PR #130):** `visualPreferenceProfile()` and `visualIndexStatus()` use the complete dedicated `favoriteIds()` query instead of materializing a nominal 10000-row / effective 5000-row catalog prefix merely to recover favorite IDs.
- D6A deliberately leaves Author Atlas / Style Families / Representation QC full-catalog inputs unchanged because those analyses use catalog/provider/favorite coverage denominators; blindly narrowing to embedding IDs would alter diagnostic meaning.
- A 10001-favorite SQLite regression places the only embedded favorite outside the legacy effective 5000-row catalog prefix and requires both Visual preference evidence and index target counts to include it.
- **D7A merged (PR #131):** the existing 250 ms download-progress persistence cadence remains unchanged, but each persisted patch no longer performs a pre-read solely to recover unspecified fields. SQLite `COALESCE` preserves omitted fields, reducing the hot write shape from SELECT → UPDATE → SELECT to UPDATE → SELECT.
- D7A regression preserves partial-patch semantics, explicit zero writes, unknown-job failure behavior and the existing 250 ms service throttle.
- **D7B merged (PR #132):** Shelf add/remove still records one behavior event per comic, but the route sends the event array through `recordUserEvents()`, which wraps the existing single-event recorder in one short `BEGIN IMMEDIATE / COMMIT / ROLLBACK` transaction.
- D7B preserves event IDs, metadata safety, dedupe behavior and per-comic evidence granularity; invalid input rolls back the event batch rather than leaving a partially recorded shelf action.
- **D8A merged (PR #133):** migration 16 adds `idx_pictures_comic_status(comic_id, status)`, filling the missing comic-first access path used by the correlated `comicSelect` picture-count subquery.
- D8A planner regression requires `COUNT(*) WHERE comic_id = ?` to use the new index; completed-picture counts may validly use either the new comic-first index or the existing status-first downloaded index.
- D8A does not rewrite `comicSelect`; aggregate joins/CTEs remain deferred until representative scaling evidence justifies a broader semantic-preserving query change.
- **D7C merged (PR #134):** Web recommendation impressions that pass the existing 50% / 800 ms visibility rule are queued into a 25 ms micro-batch and sent through a dedicated impression-only endpoint capped at 24 events.
- D7C reuses D7B `recordUserEvents()` so one natural impression burst becomes one short SQLite transaction while every impression retains its own event ID, client-observed time, cycle/batch/comic/rank context and dedupe key.
- The batch route preserves the existing zero-based rank contract, rejects non-impression event types, and rolls back the whole batch if one event fails storage validation. `recommend_batch_presented`, feedback and detail-open events stay on the existing single-event path because they are separate user/authority actions rather than one natural burst.
- **D8B merged (PR #135):** `pnpm benchmark:comic-select-picture-count` builds identical real SQLite fixtures with and without migration 16's `idx_pictures_comic_status`, then compares single-comic `getComic()` and broad catalog projection p50/p95/max.
- D8B reports descriptive without-index/indexed ratios but defines no timing pass/fail threshold. A semantic regression requires count outputs to remain identical with and without the planner index.
- D8B changes no production SQL. Aggregate join/CTE or denormalized-count work remains prohibited until repeated D8B plus J1/J2 foreground evidence demonstrates a remaining bottleneck.
- **Next after D8B:** collect representative A/B runs, combine them with real Windows x64 J2 idle/load profiles, then decide whether P2-D should prototype an aggregate alternative or move on to the remaining runtime/cache/frontend workstreams.
- Detailed boundaries: `docs/SQLITE_QUERY_DISCIPLINE_P2D1.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D2.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D3.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D4.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D5A.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D5B.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D6A.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D7A.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D7B.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D7C.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D8A.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D8B.md`.

## NEXT-7 — P2-E snapshot/cache discipline
**Status: DONE FOR CURRENT CRITICAL INVENTORY — E1/E2 merged**

P2-D remains evidence-gated. The critical cache authority pass is now complete enough to hand the next unblocked architecture lane to P2-F.

- **E1 merged (PR #136):** Desktop cover cache validates source/version identity instead of trusting comic ID alone.
- **E2 merged (PR #137):** Provider Preview and Online Reader caches are partitioned by non-secret provider/account/surface/revision identity; page data validates the actual locator by fingerprint; live Pica credential changes reset the cached authenticated SDK session.
- `docs/CACHE_DISCIPLINE_P2E2.md` records owner, key, authoritative invalidation and scope for the critical Desktop/Web/Android long-lived caches. TTL/LRU are classified as eviction rather than authority.
- No critical provider-backed cache identified in E1/E2 can silently cross the audited account/source authority boundary.
- Remaining browser/process-memory lifetime issues are primarily observer/poller/UI lifecycle concerns and continue under P2-F.
- Detailed boundaries: `docs/CACHE_DISCIPLINE_P2E1.md`, `docs/CACHE_DISCIPLINE_P2E2.md`.

## NEXT-8 — P2-F frontend observer/poller discipline
**Status: IMPLEMENTATION_COMPLETE_REFERENCE_TRACE_OPEN**

- **F1–F8 merged (PR #138–#145):** redundant idle polling removed; broad DOM observer work is scoped to its owner or processed incrementally/coalesced.
- **F9 merged (PR #146):** WebDAV task progress reattaches after reload and self-terminates on backend terminal state.
- **F10 merged (PR #147):** Recommendation final-cycle status has one normal polling authority with bounded App fallback.
- **F11 merged (PR #148):** Onboarding readiness is event-driven; the recursive 500 ms retry loop is removed.
- **F12 merged (PR #149):** Work Identity and V5 shadow status loops keep 500/600 ms foreground cadence, use 3000 ms hidden-page waits, and wake immediately when visible.
- **F13 merged (PR #151):** focused Playwright Chromium evidence passed for both F12 pollers.
- Observed browser evidence:
  - Work Identity: hidden 3004 ms → visible wake 2 ms → foreground 504 ms.
  - V5 shadow: hidden 3004 ms → visible wake 3 ms → foreground 602 ms.
- Browser evidence confirms the intended control-flow branches but is not promoted into a user-facing latency/CPU budget.
- **External evidence gate remains:** representative low-end Windows/browser CPU+jank trace across Settings/Online/Recommendation/analysis transitions.
- No further P2-F code work should be added without a concrete trace/regression showing a remaining problem.
- Detailed boundaries: `docs/FRONTEND_OBSERVER_DISCIPLINE_P2F1.md` through `P2F8.md`, `docs/FRONTEND_POLLER_DISCIPLINE_P2F9.md` through `P2F12.md`, and `docs/FRONTEND_BROWSER_EVIDENCE_P2F13.md`.

## NEXT-9 — P2-G Android runtime hardening
**Status: PHYSICAL_DEVICE_EVIDENCE_REQUIRED — G1–G19 merged; source/build work complete, G20/P2-C3 enforcement blocked**

- **G1–G12 merged (PR #153–#164):** audited Android UI-thread Catalog/Semantic/download/settings/browse/shelf/recommendation/history/direct-open/Reader-completion I/O owners are worker-owned.
- **G13 merged (PR #165):** durable task identity is persisted independently of Activity memory; Task Center reconstructs singleton/dynamic work from exact WorkRequest UUID + WorkManager state instead of WorkInfo list order/history.
- G13 also adds the explicit Android recovery matrix required by P2-H and preserves PAUSED download identity even when an old CANCELLED WorkInfo is unavailable.
- **G14 merged (PR #166) with the official WorkManager test harness:** recovery semantics remain covered by the official AndroidX test harness; G16 updates runtime + harness from historical 2.9.1 to current WorkManager 2.12.0.
- `WorkManagerRecoveryTest` creates real delayed WorkRequests and queries real WorkInfo/unique-work history under Robolectric rather than using a hand-built scheduler fake.
- G14 covers:
  - REPLACE history reconstructs exactly one current download;
  - stale registry UUID repairs from the actual active WorkInfo;
  - deliberate PAUSED download remains reconstructible when historical WorkInfo is unavailable;
  - missing non-paused download registration does not resurrect;
  - singleton unique-work recovery selects the exact persisted current request and repairs stale UUIDs.
- All G14 requests use a long initial delay, so provider/network Worker bodies do not execute; the test targets WorkManager DB/query + app recovery authority.
- **Evidence boundary:** G14 is Activity/process-state reconstruction evidence, not a claim of Android OS force-stop/reboot coverage.
- **G15 finding:** Favorite import, Pica bootstrap and Native Recommendation persisted current singleton WorkRequest UUIDs but did not retire those UUIDs on successful completion or explicit cancel. A later restart could therefore bind Task Center to historical SUCCEEDED/CANCELLED WorkInfo.
- **G15 production correction:** explicit cancel clears singleton recovery identity immediately; successful Workers clear it only after their existing durable success boundary. PAUSED/retry/failure states retain recovery identity.
- **G15 real process-death gate:** a debug-only normal app Activity seeds real WorkManager state and keeps a debug-only probe RUNNING; the seed deliberately does not use instrumentation because Android instrumentation itself adds target-package force-stop lifecycle events. The host executes `adb shell am force-stop com.picalibrary.android.dev`, confirms process death, re-enters through the normal launcher and requires probe runCount >= 2 in a fresh app process before verification-only instrumentation checks active/PAUSED recovery state, one-card Task Center reconstruction and cancelled-history non-resurrection.
- **G15 merged (PR #169):** normal CI, direct-upgrade acceptance and the real API-35 force-stop/relaunch emulator gate all passed before merge. The OS process-death recovery gate is now accepted.
- **G16 finding 1:** PicaLibraryApp had no trim-memory handling while CoverRepository and ImageRepository could each retain up to 72 MiB of decoded Bitmaps.
- **G16 memory correction:** Application.onTrimMemory now evicts only reconstructible in-memory Bitmap LRUs at UI_HIDDEN/background pressure; encoded disk caches and durable work are untouched. Robolectric + real `am send-trim-memory ... HIDDEN` evidence cover this boundary.
- **G16 finding 2:** Android durable work still used WorkManager 2.9.1, predating Android 15 SDK/network/foreground-timeout fixes. G16 upgrades both runtime and work-testing to stable 2.12.0 while preserving the G14/G15 recovery suite.
- **G16 merged (PR #170):** normal CI, direct-upgrade, G15 force-stop regression and the API-35 HIDDEN/Doze gate all passed. Generic trim-memory and Doze defer/resume evidence is accepted.
- **G17 merged (PR #171):** AndroidTaskResources provides observe-only resource tags and de-duplicated RUNNING/ENQUEUED-BLOCKED snapshots for RT-17–RT-20 without changing scheduling, concurrency or task controls.
- Current classes: provider-network, media-network, bridge-network, cpu-analysis, filesystem-heavy.
- A debug-only ADB collector writes an app-private JSON snapshot for representative-device overlap sampling; it is absent from release UI/manifest.
- **G18 merged (PR #172):** release-like benchmark target + AndroidX Macrobenchmark 1.5.0 / UiAutomator 2.4.0 compile successfully. Cold startup-to-usable-Library and idle top-level FrameTiming scenarios are checked in without thresholds.
- HomeActivity reports fully drawn only after the local Library list is usable, giving StartupTimingMetric a meaningful full-display boundary.
- CI remains build-only; GitHub emulator timing is not accepted as representative performance evidence. The physical-device runner archives device metadata, benchmarkData JSON and Perfetto traces.
- **G19 merged (PR #173):** the opt-in loaded Macrobenchmark triggers the real `重新生成手机推荐` action, requires G17 provider-network + cpu-analysis RUNNING before and after measured foreground navigation, and uses `startupMode=null` so the background WorkManager task is preserved.
- G19 source/build acceptance passed Macrobenchmark Build `36160396121`, CI `36160396044`, G15 regression `36160396042`, and G16 regression `36160396108`.
- G19 adds a benchmark-only exported resource snapshot receiver; release/debug builds do not expose it. It returns only coarse resource counts, never credentials or Provider payload.
- The prepare/run script leaves Provider/candidate configuration manual and explicit. No synthetic Worker is substituted when real recommendation load is unavailable.
- **Current hard gate:** source/build work through G19 is complete, but no valid G20/P2-C3 Android resource budget may be proposed until representative physical-device G18 idle + G19 recommendation-loaded evidence exists. Real download/Reader loaded scenarios also require explicit user-selected real inputs.
- OEM battery-manager / foreground-notification evidence and large-Catalog/long-Reader timing/jank/memory remain physical-device gates.
- Detailed boundaries: `docs/ANDROID_RUNTIME_HARDENING_P2G1.md` through `P2G12.md`, `docs/ANDROID_WORKER_RECOVERY_P2G13.md`, `docs/ANDROID_WORKMANAGER_RECOVERY_TEST_P2G14.md`, `docs/ANDROID_FORCE_STOP_RECOVERY_P2G15.md`, `docs/ANDROID_MEMORY_BACKGROUND_P2G16.md`, `docs/ANDROID_RESOURCE_OBSERVATION_P2G17.md`, `docs/ANDROID_FOREGROUND_PERFORMANCE_P2G18.md`, and `docs/ANDROID_LOADED_PERFORMANCE_P2G19.md`.

## NEXT-10 — P2-H Desktop shutdown/recovery reconciliation
**Status: DONE — H3 merged as PR #175**

- Recovery matrix reconciled and checked in.
- Global shutdown deadline + fault-isolated cleanup merged.
- Download quiesce timeout regression proves active LOCAL work is durably PAUSED before fallback exit.
- CI, Linux, macOS arm64, Windows ARM64, Docker and Android regression gates passed.
- Detailed boundary: `docs/DESKTOP_SHUTDOWN_RECOVERY_P2H3.md`.

## NEXT-11 — P2-I unified structured task diagnostics
**Status: I1_DONE / I2_CANDIDATE**

- **I1 merged (PR #176):** safe read-only schema + LibraryService-owned batch + Desktop-only endpoint.
- I1 full CI/platform/Android regression matrix passed before merge.
- **I2 candidate:** aggregate WebDAV, Browser Lite export, managed E-H login and software update without moving task authority.
- Additive `providerRoute` is fixed/low-cardinality only; no configured URL/host/account/path values.
- WebDAV correlates against the shared C2 resource coordinator; owners without a real lease remain resourceState=none.
- Keep absent IDs/timestamps/control metadata null/false according to the actual owner rather than synthesizing them.
- External failed messages reuse the I1 sanitizer.
- Detailed boundaries: `docs/RUNTIME_TASK_DIAGNOSTICS_P2I1.md`, `docs/RUNTIME_TASK_DIAGNOSTICS_P2I2.md`.

## PARALLEL-1 — W5C PR #109
**Status: DONE**

May continue independently if:
- shell-only cache boundary remains intact;
- W5A/W5B security and read-only guarantees stay intact;
- it does not expand into user-content offline caching, remote mutation or multi-user scope;
- all existing platform gates remain green.

---

# 12. Decision / scope-change log

## 2026-09-25 — P2-I2 external Desktop task diagnostics

State update:
- I1 is merged as PR #176 at `e4d508dea0d342f4f9b173a20520e69e8262b1b5` after the full CI/platform/Android regression matrix passed.
- I2 keeps the I1 endpoint/schema authority model and extends it through a Desktop-controller aggregation layer rather than moving external owners into LibraryService.
- External batch: WebDAV remote sync, Browser Lite export, managed E-H web login, software update.
- WebDAV maps its authoritative `syncProgress` and the existing shared `remote-storage-sync` RuntimeResourceCoordinator lease.
- Browser Lite only exposes the state/phase/completion timestamp it actually owns; missing start/update/resource metadata remains null/empty.
- E-H `opening/verifying` normalize to running and `waiting` remains waiting; only failed message is treated as sanitized lastError.
- Updater `staged` normalizes to waiting; apply/stage phases normalize to running; complete/failed stay terminal.
- I2 adds additive `providerRoute` with fixed safe labels only: `webdav`, `eh-managed-browser`, `github-release`.
- Remote API remains excluded; the existing Desktop-only endpoint is still excluded from J1 latency samples.
- Detailed boundary: `docs/RUNTIME_TASK_DIAGNOSTICS_P2I2.md`.

## 2026-09-25 — P2-I1 unified LibraryService runtime task diagnostics

State update:
- P2-H3 is merged as PR #175 at `60abf3a17516e98ab6f4bda0e63af2908e926338` after the full platform/package + Android regression matrix passed.
- P2-I begins with a read-only adapter, not a new task registry.
- `runtimeTaskDiagnostics()` maps eight LibraryService-owned logical tasks into one schema while leaving each original status method authoritative.
- `taskKey` is a stable diagnostic identity; `taskId` is null unless the underlying owner actually exposes a current run/job ID.
- Resource waiting/running state, priority and durations are correlated from RuntimeResourceCoordinator requested/started timestamps.
- LOCAL downloads remain an aggregate queue diagnostic and do not claim one comic job ID as the whole runtime identity.
- `sanitizeRuntimeDiagnosticError()` bounds and redacts URLs, absolute paths, Bearer values and common token/password/cookie/authorization key-value forms.
- New Desktop-only `GET /api/v1/desktop/runtime/tasks` is excluded from J1 latency sampling and is not added to Remote API.
- WebDAV/update/Browser Lite/E-H login/Visual browser-worker owners remain future owner-specific adapters.
- Detailed boundary: `docs/RUNTIME_TASK_DIAGNOSTICS_P2I1.md`.

## 2026-09-25 — P2-H3 Desktop shutdown fault isolation

State update:
- Recovery inventory shows the recommendation, download, WebDAV, Visual, schema-migration, Mobile Bridge and headless lifecycle requirements already have implementation/test evidence.
- The remaining concrete P2-H defect was shutdown fault isolation: `stop()` awaited an unguarded `closeEngine()` before registering its final process-exit fallback.
- H3 registers `SHUTDOWN_HARD_DEADLINE_MS = 35_000` before cleanup begins, covering the existing 30 s download-quiesce bound plus local HTTP close margin.
- `shutdownStep(...)` records one cleanup owner's failure and continues later owners instead of aborting the shutdown chain.
- Cleanup order remains Remote API → Mobile Bridge → managed E-H login → local downloads → local HTTP server → SQLite → instance lock.
- The normal short `SHUTDOWN_FINAL_HANDLE_GRACE_MS = 250` remains only after cleanup has completed/fault-isolated.
- A new behavior regression forces `quiesceLocalDownloads(20)` to time out while a real provider write is blocked and requires the LOCAL job to stay PAUSED.
- H3 does not claim same-run resume for every subsystem; documented safe-stop/restart semantics remain valid.
- Detailed boundary: `docs/DESKTOP_SHUTDOWN_RECOVERY_P2H3.md`.

## 2026-09-25 — G19 source/build accepted; Android enforcement enters physical-evidence gate

State update:
- G19 is merged as PR #173 at `529638cd1ff3ebe8c16e6ba54e8f43ea85c9a116`.
- Source/build acceptance passed Macrobenchmark Build `36160396121`, normal CI `36160396044`, G15 force-stop regression `36160396042`, and G16 memory/background regression `36160396108`.
- G17–G19 now provide the complete pre-enforcement toolchain: WorkManager resource observation, idle foreground Macrobenchmark, and an opt-in real Native Recommendation overlap Macrobenchmark.
- CI/emulator success is not promoted into a performance conclusion. The next accepted evidence must come from representative physical Android hardware.
- Required first evidence pair: G18 idle baseline + G19 real recommendation-loaded run on the same device/build context.
- Download/Reader loaded evidence must use explicit real comic/chapter inputs; synthetic media traffic remains prohibited for the promotion decision.
- G20/P2-C3 Android concurrency/resource enforcement is BLOCKED until those measurements show concrete contention and justify a policy.
- Detailed boundaries: `docs/ANDROID_FOREGROUND_PERFORMANCE_P2G18.md` and `docs/ANDROID_LOADED_PERFORMANCE_P2G19.md`.

## 2026-09-25 — P2-G19 real recommendation-loaded Android performance scenario

State update:
- G18 is merged as PR #172 after Macrobenchmark Build `36159189196`, CI `36159189211`, direct-upgrade `36159189201`, G16 regression `36159189220`, and G15 regression `36159189234` passed.
- G19 does not choose a performance/resource budget. It joins G17 resource observation with G18 FrameTiming.
- The first loaded scenario uses the real Native Recommendation trigger because it has a stable UI action and existing provider-network + cpu-analysis tags.
- The loaded test is opt-in via `picaG19Loaded=true`; it is skipped unless a tester explicitly enables it after configuring a real Pica source or synced candidate base.
- The scenario requires provider-network and cpu-analysis to both be RUNNING before and after measured navigation. A short/invalid/no-source run is rejected rather than relabeled as loaded evidence.
- Macrobenchmark `startupMode=null` is used so this non-startup benchmark does not force-stop the target before the measured interaction.
- BenchmarkResourceSnapshotReceiver exists only in the benchmark source set and returns coarse G17 resource occupancy through explicit shell broadcast result data.
- `run-android-loaded-macrobenchmark.sh prepare` installs/opens the benchmark app for manual source setup; `run` measures only the loaded recommendation method and exports performance artifacts. The script reads/exports no credentials.
- Real download + Reader scenarios remain later work because they require explicit real comic/chapter inputs; G19 will not invent fake media loads.
- Detailed boundary: `docs/ANDROID_LOADED_PERFORMANCE_P2G19.md`.

## 2026-09-25 — P2-G18 Android foreground Macrobenchmark measurement

State update:
- G17 is merged as PR #171 after CI `36149248370`, G15 force-stop regression `36149248427`, and G16 memory/background regression `36149248367` passed.
- G18 explicitly remains measurement-only. It does not replace G17 observation with concurrency enforcement.
- AndroidX Macrobenchmark is used instead of a custom jank timer.
- A release-like `benchmark` app variant is added with benchmark-only profileable/setup components; formal release/debug manifests remain unchanged.
- `coldStartupToUsableLibrary` uses StartupTimingMetric + COLD + Partial compilation for five iterations.
- HomeActivity calls `reportFullyDrawn()` once after the local Library adapter is attached, defining usable-local-Library full display without waiting for optional provider refreshes.
- `topLevelTabSwitchFrameTiming` uses FrameTimingMetric while switching Library → Recommendation → Online → Settings → Library through UiAutomator.
- CI only compiles `:app:assembleBenchmark` and `:macrobenchmark:assembleBenchmark`; GitHub emulator timings are not promoted as real performance evidence.
- `scripts/run-android-macrobenchmark.sh` is the physical-device collection entry and archives device metadata, benchmarkData JSON and Perfetto traces.
- G19 should add loaded overlap scenarios on representative hardware using G17 resource observation; G20/P2-C3 enforcement remains evidence-gated.
- Detailed boundary: `docs/ANDROID_FOREGROUND_PERFORMANCE_P2G18.md`.

## 2026-09-25 — P2-G17 Android cross-task resource observation

State update:
- G16 is merged as PR #170 after CI `36147604842`, direct-upgrade `36147604826`, G15 force-stop regression `36147604861`, and G16 memory/background gate `36147604843` all passed.
- P2-C and the runtime inventory already prohibit arbitrary concurrency limits before representative overlap/latency evidence.
- G17 therefore remains observe-only: AndroidTaskResources adds resource tags and current WorkManager snapshots, but does not cancel, delay, reprioritize or serialize jobs.
- RT-17 Native Recommendation = provider-network + cpu-analysis.
- RT-18 Pica/E-H downloads = media-network + filesystem-heavy.
- RT-19 Desktop favorites/covers import = bridge-network + filesystem-heavy.
- RT-20 Pica bootstrap = provider-network + filesystem-heavy.
- Snapshot totals de-duplicate one multi-resource WorkRequest while preserving per-resource counts.
- AndroidTaskResourcesTest uses the official WorkManager harness to verify this de-duplication.
- Debug-only AndroidResourceObservationActivity writes `p2-g17-resource-snapshot.json` for ADB collection on representative hardware and is absent from the release manifest.
- No G18/P2-C3 capacity will be chosen until resource-overlap samples are paired with foreground latency/memory evidence.
- Detailed boundary: `docs/ANDROID_RESOURCE_OBSERVATION_P2G17.md`.

## 2026-09-25 — P2-G16 Android low-memory and background restriction gate

State update:
- G15 is merged as PR #169 after the normal CI, v0.4 direct-upgrade gate and the real API-35 force-stop/relaunch emulator gate passed.
- Android memory audit found no process-wide onTrimMemory handler while CoverRepository and ImageRepository each allowed a 72 MiB decoded-Bitmap LRU.
- G16 adds Application.onTrimMemory handling that evicts only those reconstructible memory LRUs at UI_HIDDEN/background pressure; disk caches, active view references and durable WorkManager state are not deleted.
- AndroidMemoryPressureTest covers UI_HIDDEN/BACKGROUND eviction and protects against purging on a non-trim hint.
- G16 also upgrades WorkManager runtime/testing from 2.9.1 to stable 2.12.0. This crosses the Android 15 compatibility fixes for dataSync foreground timeout handling, blocked-network constraint tracking and background network execution.
- Existing durable network families remain WorkManager-owned with CONNECTED/UNMETERED constraints; no new raw service scheduler is introduced.
- The real emulator gate primes both Bitmap LRUs, sends ActivityManager HIDDEN trim in the same PID and requires both memory sizes to reach zero.
- The same API-35 emulator then enqueues a delayed network-constrained debug Worker, forces Doze past the eligibility boundary, requires zero execution while idle, exits Doze and requires the Worker to execute.
- Debug probes remain outside the release manifest.
- OEM battery managers, Android 16+ long-running Worker quota behavior, foreground-notification reconstruction on representative devices and enforceable concurrency budgets remain later evidence gates.
- Detailed boundary: `docs/ANDROID_MEMORY_BACKGROUND_P2G16.md`.

## 2026-09-25 — P2-G15 real Android force-stop recovery gate

State update:
- G14 is merged as PR #166 and validates WorkManager DB/WorkInfo reconstruction through the official test harness; it intentionally leaves real OS force-stop evidence open.
- G15 closes that named evidence gap by seeding from a debug-only **normal app Activity**, keeping a debug-only WorkManager probe actually RUNNING, then applying host-side `adb shell am force-stop`. Seed instrumentation was rejected after emulator evidence showed Android instrumentation itself force-stops the target at start/finish and would contaminate the measured boundary.
- Force-stop is treated as a real stopped-state boundary: the app is not expected to resurrect background work while stopped. After explicit launcher re-entry, the host requires a new target PID and probe runCount >= 2 before starting verification-only instrumentation, proving WorkManager reconstructed unfinished work rather than merely reading the old database row.
- G15 also fixes a recovery-identity terminal leak found during this work: Favorite import, Pica bootstrap and Native Recommendation now clear current UUIDs on explicit cancel and only after durable success, while pause/retry/failure retain them.
- The emulator scenario also preserves a deliberate PAUSED Favorite import and E-H download, retains an active Pica download, and verifies Task Center renders active/paused logical downloads exactly once.
- An explicitly cancelled Pica download remains historical CANCELLED WorkInfo but has no registry identity and must not reappear in Task Center.
- The test-only probe lives under the Android debug source set; release behavior receives only the singleton terminal-identity correction.
- CI uses `ReactiveCircus/android-emulator-runner@v2` with API 35 / x86_64 / KVM instead of a custom emulator bootstrap.
- G15 does not claim OEM low-memory/background restriction, vendor foreground-service, or physical-device performance acceptance; those remain the next P2-G gates.
- Detailed boundary: `docs/ANDROID_FORCE_STOP_RECOVERY_P2G15.md`.

## 2026-09-25 — P2-G14 official WorkManager recovery integration

State update:
- G13 is merged as PR #165 and provides durable task identity + Task Center reconstruction authority.
- G14 adds the official androidx.work:work-testing:2.9.1 artifact, matching the production WorkManager 2.9.1 runtime rather than introducing a custom scheduler fake.
- Robolectric WorkManagerRecoveryTest creates real delayed unique/tagged WorkRequests and exercises the real WorkManager database/WorkInfo query layer.
- Scenarios cover REPLACE-history de-duplication, stale registry self-repair, PAUSED recovery with missing historical WorkInfo, non-paused orphan non-resurrection, and singleton exact-current selection/repair.
- The test runs Task Center recovery methods against actual WorkInfo rows while keeping the normal Task Center poll loop paused.
- G14 does not claim to emulate am force-stop, process SIGKILL, reboot or OEM background restrictions; those remain a named device/emulator evidence gate.
- Detailed boundary: docs/ANDROID_WORKMANAGER_RECOVERY_TEST_P2G14.md.

## 2026-09-25 — P2-G13 durable WorkManager reconstruction authority

State update:
- G1–G12 are merged and close the currently audited Android UI-thread I/O remediation lane.
- TaskCenterActivity previously treated WorkInfo list position as current-attempt authority for singleton work and rendered every tag-matched historical download WorkInfo, allowing duplicate/stale cards after REPLACE/resume.
- Dynamic download PAUSED intent was durable but provider/comic/episode identity was not independently enumerable after old WorkInfo pruning.
- G13 adds MobileTaskRegistryStore: app-private recovery identity only, with no credentials, URLs or file paths.
- Favorite import, Pica bootstrap and Native Recommendation persist current WorkRequest UUID. Pica/E-H downloads persist provider/comic/episode/current UUID and keep that identity while paused.
- Download success unregisters only after page/index/catalog completion; explicit cancel unregisters immediately; retry/failure keep identity for recovery.
- Task Center reconstructs singleton work by exact UUID and dynamic downloads by registry identity + queried WorkInfo. Missing/stale UUIDs can be repaired only by an actually active same-identity WorkInfo.
- The old latest(list)=tail assumption is removed. One logical download produces at most one Task Center card.
- Robolectric MobileTaskRegistryStoreTest verifies persistence, replacement, removal and Pica/E-H identity separation.
- docs/ANDROID_WORKER_RECOVERY_P2G13.md adds the explicit recovery matrix required by P2-H; true OS kill/restart instrumentation remains the next evidence gate.
- Detailed boundary: docs/ANDROID_WORKER_RECOVERY_P2G13.md.

## 2026-09-24 — P2-G12 Reader completion evidence I/O hardening

State update:
- ReaderActivity.save() previously performed UnifiedCatalogStore.load(this) and RecommendationEvidenceStore.recordReaderComplete(...) synchronously when the current chapter first reached its final page.
- That completion branch could add a full Catalog parse plus recommendation-evidence JSON read/write to the UI-thread progress-save path.
- G12 adds recordReaderCompleteAsync(), capturing application context/current comic ID and submitting Catalog enrichment + evidence persistence to Reader's existing metadata executor.
- save() retains progress.save(), completionRecordedChapter dedupe and progress-sync scheduling, but contains no Catalog load and no direct evidence Store write.
- completionRecordedChapter is set before the background task is scheduled, preserving one completion evidence attempt per chapter across repeated save callbacks.
- Reader progress schema/cadence, chapter detection, reader_complete event schema, metadata enrichment and dirty/sync behavior are unchanged.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G12.md.

## 2026-09-24 — P2-G11 direct-open evidence I/O hardening

State update:
- MainActivity.openUnified() previously synchronously loaded UnifiedCatalogStore, looked up one comic's tags/categories, synchronously loaded/rewrote RecommendationEvidenceStore through recordDetailOpen(), and only then launched detail.
- G11 adds recordDetailOpenAsync(), using application context and MainActivity's existing requests executor for Catalog enrichment and evidence persistence.
- openUnified() now contains no Catalog Store load and no direct evidence Store write; detail Activity launch is immediate after scheduling the evidence task.
- The evidence task is not assigned to page-level pending, so ordinary tab/page cancellation does not cancel an already-recorded user interaction.
- Recommendation evidence event type/schema, author/tags/categories semantics, bounded evidence retention, dirty/sync behavior and detail Intent extras are unchanged.
- ReaderActivity reader_complete evidence remains outside G11 and is the explicit next owner-level batch.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G11.md.

## 2026-09-24 — P2-G10 History local snapshot hardening

State update:
- HistoryActivity previously executed ReadingHistoryStore.importLocalBookmarksOnce(this) before renderShell(), and renderList() synchronously reloaded ReadingHistoryStore + Unified Catalog on every page/filter/date render.
- G10 introduces HistoryData(history, catalog), Activity-held historySnapshot/catalogSnapshot, and worker-owned readHistoryData().
- onCreate() renders the shell first, schedules loadLocalHistory(true), and then schedules legacy-source import on the same single-thread worker.
- Initial bookmark migration, History JSON load and Catalog load are worker-owned; renderList() shows loading until snapshots exist, then filters only in memory and reuses catalogSnapshot for covers.
- Range/date changes no longer perform file/JSON reads.
- After WebDAV/Desktop legacy import persists rows, the same worker calls readHistoryData(false) and publishes refreshed snapshots before rerendering.
- Existing history grouping, chapter metadata, legacy labels, cover behavior and resume/open-detail controls are unchanged.
- Explicit resumeSupported() source checks and Reader/Main direct-open evidence reads remain outside G10.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G10.md.

## 2026-09-24 — P2-G9 Main Recommendation initial-state hardening

State update:
- MainActivity Recommendation previously synchronously loaded PortableRecommendationPackageStore, Unified Catalog and NativeRecommendationStore, scanned Catalog/feedback for local evidence, checked Pica availability, and when a cycle existed executed markCurrentSeen() plus another NativeRecommendation load before rendering.
- G9 introduces RecommendationPageState(portable, nativeSnapshot, canRun) and worker-owned readRecommendationPageState().
- The worker owns Portable/Catalog/NativeRecommendation file reads, Catalog evidence scan, Pica/portable availability decision, and initial markCurrentSeen() persistence/reload.
- recommendations() now renders a lightweight page/loading shell and submits the state read through the existing requests executor; valid(id) guards publication.
- renderRecommendationPage() performs no Portable/Catalog/NativeRecommendation load and no markCurrentSeen().
- Generate/Regenerate behavior, input-readiness rules, Portable guidance, recommendation cards, scores/reasons and batch contents are unchanged.
- Previous/Next batch persistence remains outside G9 as an explicit user-action path.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G9.md.

## 2026-09-24 — P2-G8 Main Bookshelves local-state hardening

State update:
- MainActivity Bookshelves previously loaded ShelfStore and RemoteConfig synchronously during page construction; renderShelves then loaded Unified Catalog synchronously for availability labels.
- WebDAV refresh failure returned to UI and loaded ShelfStore again; the success path also called an explicit UnifiedCatalogStore.reconcileLocalReferences() immediately after ShelfStore.save(), even though ShelfStore.save already performs reconciliation.
- G8 adds ShelfPageState(shelves, catalog, remote, sourceLabel, remoteConfigured) and worker-owned readLocalShelfState().
- Initial Bookshelves page renders its shell/status immediately, then loads Shelf/Catalog/config on the existing requests executor before one valid(id)-guarded publication.
- WebDAV success publishes a worker-prepared state using the Catalog already reconciled by ShelfStore.save; the redundant explicit reconcile is removed.
- WebDAV failure prepares its local fallback Shelf+Catalog state on the worker before UI publication.
- renderShelves() is Store-free and preserves shelf ordering, active shelf persistence, availability priority, refresh semantics and navigation.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G8.md.

## 2026-09-24 — P2-G7 Pica Browse render snapshot hardening

State update:
- PicaBrowseActivity already performed provider network requests and Catalog merges on its single-thread worker, but every showIds() call then reloaded Unified Catalog, E-H semantics and Tag Translation on the UI thread before drawing cards.
- G7 adds BrowseRenderState(ids, label, pages, catalog, semantics, translations) and worker-side prepareRenderState().
- Provider result paths now continue from provider merge into local render-state preparation on the same worker, then publish only the prepared state to UI.
- showIds(BrowseRenderState) contains no Catalog/Semantic/Translation Store load.
- E-H favorite-slot selection now submits render preparation to the worker instead of rendering directly from the dialog callback.
- Tag Translation scheduleUpdate callback now uses refreshLastRenderedIds(), which re-prepares the last visible result on the worker before UI publication.
- Existing single-worker ordering, destroyed guard, provider semantics, favorite writes, result ordering, translation rules and cover loading are unchanged.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G7.md.

## 2026-09-24 — P2-G6 Author Directory creator-concept hardening

State update:
- AuthorDirectoryActivity previously called AuthorConceptStore.build(this) in onCreate(), which synchronously loaded Unified Catalog, loaded E-H semantics and rebuilt creator concepts across the local catalog before the first directory frame.
- G6 renders the Author Directory shell/search immediately and schedules one Activity-local single-thread loadSnapshot() pipeline.
- The worker explicitly loads UnifiedCatalogStore + EhSemanticStore and calls AuthorConceptStore.build(catalog, semantics); AuthorConceptStore.build(this) is removed from the Activity.
- renderList() shows a lightweight loading state until the snapshot arrives. Search text changes remain local/UI-only while loading, and the published snapshot renders using the current search text.
- destroyed + loadGeneration guard snapshot publication; onDestroy() advances generation and shuts down the executor.
- Creator identity, aliases, circles/groups, focused-author grouping, 120-result cap and Author Works navigation are unchanged.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G6.md.

## 2026-09-24 — P2-G5 Main Settings summary I/O hardening

State update:
- MainActivity Settings previously built the page while synchronously loading FavoriteCacheStore, RemoteConfigStore, PicaAccountStore, NativeRecommendationStore and PhoneDownloadStore, scanning cover bytes, stat-ing every phone-download page through estimatedBytes(this), and recursively calculating StoragePolicy.usage().
- G5 introduces one worker-prepared SettingsSummary and leaves the Settings cards/buttons synchronous with lightweight loading placeholders.
- readSettingsSummary() owns the persistent JSON/Keystore/directory/stat work and reuses the already loaded PhoneDownload Snapshot for byte estimation.
- Desktop online probing remains on the existing pending Future; settingsSummaryTask is a separate page-owned Future so these state streams do not replace/cancel one another.
- Summary UI publication is guarded by serial/valid(id). settingsSummaryTask is cancelled on page switch, pause and destroy.
- Favorite action messages are not overwritten by an older summary completion.
- Settings actions, WorkManager jobs, Pica/WebDAV configuration, Task Center, Downloads, Storage and Update navigation are unchanged.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G5.md.

## 2026-09-24 — P2-G4 Main Library first-frame local-reference hardening

State update:
- MainActivity defaults to the Library tab and onResume immediately enters library().
- Before G4, library() synchronously called UnifiedCatalogStore.reconcileLocalReferences(this) before the first catalog render.
- reconcileLocalReferences is a full local-state merge: Unified Catalog load, ShelfStore merge, E-H/Favorite merge, PhoneDownloadStore merge and Catalog save.
- G4 keeps the Library search/filter/shortcuts/status/Grid shell synchronous, but moves local reconciliation into the existing requests executor.
- The worker captures the current serial generation and publishes only through runOnUiThread when valid(id) remains true.
- After the local Snapshot renders, the existing libraryRefreshedThisSession decision starts the normal asynchronous Desktop/WebDAV refresh exactly as before.
- cancelPageWork() already increments serial and cancels pending, so tab changes invalidate the in-flight local reconstruction without a second lifecycle system.
- Unified Catalog schema, local-reference authority, filtering/sorting, source labels and remote refresh semantics are unchanged.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G4.md.

## 2026-09-24 — P2-G3 Downloads persistent-index/stat hardening

State update:
- DownloadsActivity previously called PhoneDownloadStore.load(this) and PhoneDownloadStore.estimatedBytes(this) directly from renderList() on the UI thread.
- estimatedBytes(context) reloaded the complete download index and then stat-ed every page URI, so one render could parse the index twice before drawing the persistent-download list.
- Delete confirmation also executed PhoneDownloadStore.remove() synchronously on the UI thread; removal may delete many page URIs, rewrite the index and reconcile Unified Catalog.
- G3 adds one Activity-local single-thread executor and one immutable DownloadState(snapshot, bytes).
- onResume shows a loading state and schedules readDownloads(); the worker loads the index once and computes size from the same Snapshot through the new estimatedBytes(context, snapshot) overload.
- renderList() is now UI-only and performs no PhoneDownloadStore load/stat call.
- Delete confirmation dispatches deleteDownload(); remove + refreshed index/stat read run on the worker before one guarded UI publication.
- destroyed + loadGeneration prevent stale/out-of-order/destroyed Activity publications, and onDestroy() advances the generation and shuts down the executor.
- Persistent-download format, deletion semantics, Catalog reconciliation, displayed list/card behavior and navigation are unchanged.
- Audit correction: PhoneDownloadStore byte summary is in MainActivity Settings, not the default landing tab. The higher-priority default Library path synchronously runs UnifiedCatalogStore.reconcileLocalReferences(this), while Settings retains separate PhoneDownloadStore/storage summary I/O.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G3.md.

## 2026-09-24 — P2-G2 Comic Detail first-frame local-state hardening

State update:
- UnifiedComicDetailActivity is a high-frequency destination from Library, Recommendation, Download, History, Author and Browse surfaces.
- Its previous first-frame path synchronously parsed Unified Catalog in onCreate(), rebuilt Author concepts from Catalog+Semantic data, reloaded E-H semantic/translation data for tags, checked the phone-download index, and reopened Unified Catalog for each expanded same-work variant.
- G2 adds a worker-owned LocalDetailState and shows a lightweight detail loading shell immediately.
- The worker loads Catalog/Semantic snapshots once, builds Author concepts from those snapshots, derives creator/tag display, checks phone download state and loads initial E-H favorite metadata.
- Full render then consumes only prepared state; resolveSources receives the precomputed phone-download flag and existing provider probes remain asynchronous.
- workVariantEntry() now uses the already-loaded catalog snapshot rather than reopening the file per card.
- Initial E-H action rendering uses the worker-prepared favorite snapshot; remote favorite mutation refreshes that snapshot off-thread before returning to UI.
- No creator/tag/source/chapter/work-variant/favorite/shelf/recommendation semantics are intentionally changed.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G2.md.

## 2026-09-24 — P2-G1 Author Works main-thread local-state hardening

State update:
- Android runtime audit classified Store.load/build calls by actual cost rather than moving every preference read off-thread.
- UnifiedCatalogStore.load reads/parses the complete unified-catalog JSON; EhSemanticStore.load reads/parses the complete semantic JSON; AuthorConceptStore.build(Context) invokes both and builds creator identities across the catalog.
- AuthorWorksActivity previously executed those operations repeatedly on the UI thread during onCreate(), renderWorks(), filter refreshes and the post-provider-refresh UI callback.
- G1 introduces a worker-owned LocalState. readLocalState() loads Unified Catalog once, loads E-H semantics once, builds Author concepts from the already-loaded snapshots, and selects the requested concept.
- onCreate() now renders a lightweight shell first and schedules local-state loading on the existing single-thread executor.
- renderWorks() performs no Store load or AuthorConcept build and consumes only the committed in-memory snapshots.
- Provider refresh remains on the same worker; after merges it rebuilds local state off-thread and publishes it once to the UI.
- Source-contract regression forbids AuthorConceptStore.build(this) in AuthorWorks and forbids Catalog/Semantic/AuthorConcept load/build calls inside renderWorks().
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G1.md.

## 2026-09-24 — P2-F implementation closeout / reference trace open

State update:
- PR #151 merged the F13 real-browser evidence into main.
- Chromium browser evidence passed with Work Identity 3004 ms hidden / 2 ms visible wake / 504 ms foreground and V5 shadow 3004 ms hidden / 3 ms visible wake / 602 ms foreground.
- Across F1–F13, audited frontend observer/poller paths now have explicit ownership, bounded lifecycle, scoped or incremental DOM work, and no known duplicate recurring Recommendation status authority.
- No known persistent high-frequency idle loop remains in the audited Web paths without a named owner/start/stop condition.
- CI browser timing proves control-flow behavior only. It does not substitute for a representative low-end Windows/browser CPU, jank or interaction-latency trace.
- P2-F therefore moves to IMPLEMENTATION_COMPLETE_REFERENCE_TRACE_OPEN rather than DONE.
- Further frontend rewrites are prohibited unless the external reference trace or a future regression identifies a concrete remaining hotspot.
- Main architecture work proceeds to NEXT-9 / P2-G Android runtime hardening.

## 2026-09-24 — P2-F13 real-browser cadence evidence

State update:
- F12 visibility-aware polling is now covered by focused Playwright Chromium timing evidence rather than source contracts alone.
- A minimal same-origin shell loads the real Work Identity or V5 evaluation module without the rest of the App, while only the target status endpoint is stubbed as an active task.
- Each test begins with a test-only hidden visibility state, records actual browser request timestamps, observes one hidden-delay interval, restores visibility, and then observes the next foreground interval.
- The test expects the hidden interval to reflect the F12 3000 ms branch, visibility restoration to wake promptly, and the subsequent interval to return to the existing 500/600 ms foreground cadence.
- Timing bounds are deliberately wide scheduler/control-flow assertions. CI runner timing is not a user-facing performance budget or low-end-hardware claim.
- The browser smoke runner now includes test/e2e/poller-discipline.spec.mjs and emits structured [P2-F13] timing JSON into CI logs.
- F13 changes no runtime behavior and introduces no dependency/lockfile change.
- Detailed boundary: docs/FRONTEND_BROWSER_EVIDENCE_P2F13.md.

## 2026-09-24 — P2-F12 visibility-aware analysis task polling

State update:
- Hidden-tab audit found two long-running analysis/development status loops that continued foreground-rate polling while the page was hidden: Work Identity evidence refresh (500 ms) and Recommendation V5 shadow evaluation (600 ms).
- F12 keeps those foreground cadences unchanged but extends hidden-page waits to 3000 ms.
- Each visibility-aware delay registers one temporary visibilitychange listener and resolves immediately when the document becomes visible, so returning to the page triggers the next status request without waiting for the full hidden delay.
- Existing duplicate-watcher authorities remain unchanged: scanPollGeneration for Work Identity and EVAL.runningShadow for V5 shadow evaluation.
- E-H login, updater, Recommendation build, WebDAV and Downloads are intentionally excluded because their user-control/recovery ownership differs and the audit found no safe generic throttle to apply.
- Backend task execution, task outputs, pause/resume/cancel and recovery semantics are unchanged.
- Detailed boundary: docs/FRONTEND_POLLER_DISCIPLINE_P2F12.md.

## 2026-09-24 — P2-F11 event-driven Onboarding readiness

State update:
- onboarding-v1.js previously waited 650 ms once and then retried promptWelcomeIfNeeded() every 500 ms until the App became ready or onboarding was no longer needed.
- A user remaining on Setup or leaving the disclaimer open could therefore keep a page-local readiness timer running indefinitely without any readiness change.
- F11 removes the recursive retry loop. It keeps one 650 ms initial check, observes only #setup class/hidden/style readiness changes, reuses the existing Onboarding body observer for disclaimer gate mount/unmount, and checks once when the document becomes visible again.
- At most one readiness timeout is pending. Showing the welcome or making shouldPrompt() false clears the timeout, disconnects the Setup observer and removes the visibility listener.
- writeState() also stops readiness watching immediately when a user choice makes auto-prompting unnecessary.
- Onboarding prompt criteria, state/version semantics, disclaimer/Setup gates, target steps, copy and driver.js integration are unchanged.
- Detailed boundary: docs/FRONTEND_POLLER_DISCIPLINE_P2F11.md.

## 2026-09-24 — P2-F10 single Recommendation status poll authority

State update:
- Explicit Recommendation generation previously created two concurrent recurring readers of /api/v1/recommendation-sessions/status?mode=final: Theme Help at 500 ms for progress/control UI and app.js::waitForFinalCycle() at 1 s for completion detection.
- F10 keeps Theme Help as the normal recurring authority and publishes each successful status read through the local pica-recommendation-status CustomEvent.
- App stores the latest signal and waits on status events instead of running a fixed one-second polling loop.
- Before each explicit build wait, App clears any prior snapshot and dispatches pica-recommendation-watch after the backend has accepted the build, so Theme restarts from authoritative post-start state rather than relying on its earlier capture-click poll.
- App gives Theme 750 ms for the first status and treats signals as fresh for 1500 ms; direct status API reads remain only as bounded fallback when the signal is missing/stale.
- Failure detection, final-cycle identity rules, force-new previous-cycle guard and the 120-second timeout are unchanged.
- F10 adds no persistent bus, WebSocket/SSE, new backend endpoint or new stored data.
- Detailed boundary: docs/FRONTEND_POLLER_DISCIPLINE_P2F10.md.

## 2026-09-24 — P2-F9 persistent poller lifecycle audit and WebDAV reattach

State update:
- Persistent Web pollers were inventoried by owner, start condition, stop/terminal condition and state authority.
- Downloads, Favorites sync, Browser Lite export, updater, Recommendation build, E-H login, Work Identity evidence refresh and V5 shadow evaluation already have bounded request/view/task ownership and are not changed in F9.
- WebDAV sync had a recovery gap: load() rendered one remoteStorage.syncProgress snapshot after page/script reload but did not reattach polling to a still-running durable backend sync.
- F9 adds remoteProgressActive(progress), reload reattachment, terminal auto-stop and a remoteSyncRequestPending startup-race guard.
- Pause/resume/cancel responses restart/retain polling when the returned progress is still active, and pagehide stops only the page-local timer.
- Backend sync/checkpoint semantics, polling cadence, WebDAV configuration and progress fields are unchanged.
- Detailed boundary: docs/FRONTEND_POLLER_DISCIPLINE_P2F9.md.

## 2026-09-24 — P2-F8 incremental Visual QC mutation processing

State update:
- visual-qc.js previously observed the full body subtree and, after any child mutation, reran a88EnsurePanel(), a88InstallDetailButtons() and a88InstallIndexFailureCapture() globally.
- F8 keeps one broad mutation event source because Visual detail buttons span Library/Downloaded/Shelves while QC controls live in Settings, but it removes global work from each callback.
- Added/changed element roots are accumulated in pendingRoots and processed once per animation frame.
- a88InstallDetailButtons(root) now scopes card traversal to Library/Downloaded/Shelves sections inside that root.
- QC panel and failure-capture installers run only when an added subtree is/contains the Visual Settings panel, recommendation Settings host, Visual build button or Visual status message.
- Removed-only mutations do not schedule installer work.
- Visual embedding/QC data, similarity retrieval, scoring, failure semantics, lazy-load policy and existing native detail actions are unchanged.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F8.md.

## 2026-09-24 — P2-F7 incremental onboarding mutation processing

State update:
- onboarding-v1.js previously observed the complete body subtree and, after any child mutation, reran all 12 tour-target document queries plus the Settings-panel existence check.
- F7 promotes the tour selectors into one TOUR_TARGETS registry and makes markTourTargets(root = document) root-aware.
- The body observer now consumes mutation.addedNodes, accumulates unique roots in a Set and performs one requestAnimationFrame pass over those roots.
- The Help & Onboarding Settings panel is marked dirty only when an added subtree is/contains #a87-general-panel.
- Full-document target marking remains for bootstrap and explicit tour start/replay authority.
- Onboarding steps, target selectors, prompt/dismiss/completion semantics, driver.js integration and language behavior are unchanged.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F7.md.

## 2026-09-24 — P2-F6 scoped Settings Hub observer

State update:
- alpha8-7-desktop-hub.js previously observed the complete document.body subtree and ran Settings-panel relocation checks after unrelated Library/Recommendation/Reader/Download DOM changes.
- Ownership audit shows dynamic Product Appearance, Support and Personalization surfaces are created under the legacy #settings root before the Hub moves them into its panels.
- The top-header language control is static and is already moved explicitly during buildSettingsHub(), so it does not justify permanent body observation.
- F6 keeps the existing requestAnimationFrame coalescing but changes the observer target from document.body to #settings.
- Later settings-owned panels still trigger relocation while unrelated app views no longer schedule Hub work.
- Hub layout, tabs, keyboard navigation, language placement, Product panels, Personalization and Maintenance behavior are unchanged.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F6.md.

## 2026-09-24 — P2-F5 incremental Product source-entry cleanup

State update:
- alpha8-product.js performs an intentional initial scan to remove ordinary-product source-code entry points, but its dynamic body observer previously rescanned every a/button in the document after any child mutation.
- F5 keeps the initial full cleanup but changes dynamic processing to MutationObserver records + pendingSourceRoots + one requestAnimationFrame pass.
- Only mutation.addedNodes (or their parent elements for text insertions) become cleanup roots; each root is scanned only for a/button descendants.
- Source-link removal itself produces removed-only mutations, which no longer schedule another cleanup pass.
- The body observer remains the insertion event source because source entry points may be inserted by several modules; the work is now incremental rather than a full-document rescan.
- The existing source/open-source text policy, Product appearance/support behavior, personalization, update ownership and language behavior are unchanged.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F5.md.

## 2026-09-24 — P2-F4 incremental v0.4 parity mutation processing

State update:
- v040-parity.js previously observed the entire body subtree and synchronously called full-document translateVisibleTags() plus enhanceDetailAuthor() after every child mutation.
- That path queried all .tag and [data-eh-category] elements for unrelated Library/Recommendation/Reader/Settings/status mutations and was not coalesced.
- F4 changes translateVisibleTags(root = document) into a scoped-capable primitive while preserving full-document calls for explicit translation load/language changes.
- The body observer now consumes MutationObserver records, collects only added/changed roots in a Set, and performs one requestAnimationFrame pass over those roots.
- Detail-author enhancement is marked dirty only for mutations touching #recommend-detail-content.
- Tag/category text writes are guarded by current-value equality so translation-generated DOM changes do not keep feeding unnecessary writes into the observer.
- Translation sources, canonical tag/search semantics, author identity, history and provider behavior are unchanged.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F4.md.

## 2026-09-24 — P2-F3 one render authority per selection stream

State update:
- Library, Recommendation and Search already expose three separate selection-status DOM nodes and three separate selection-bar render functions.
- Previously every one of those three MutationObservers invoked all three render functions, so a Library selection change also recalculated Recommendation and Search selection bars, and vice versa.
- F3 registers each status selector with exactly one matching render authority.
- The observed mutation types remain childList + characterData + subtree, and selection parsing/bulk-action semantics are unchanged.
- Web UX regression requires the three selector/render pairs and forbids the former three-render callback sequence.
- F3 changes only render ownership; it does not alter selection state, result cards, bulk actions, scroll/focus behavior, task polling or the F2 scoped Settings/Downloads observers.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F3.md.

## 2026-09-24 — P2-F2 scoped UX polish observers

State update:
- ui-polish-v5.js previously used one document.body childList+subtree MutationObserver to schedule the full dynamic Settings/Downloads polish bundle after any DOM mutation anywhere in the application.
- requestAnimationFrame coalescing limited callback count but did not fix ownership: unrelated comic cards, Recommendation, Reader and other DOM churn could still trigger all Settings/Downloads installer checks.
- F2 replaces the global observer with one #settings observer for Settings-owned installers and one #downloads observer for Download-page polish.
- Each scoped observer keeps its own animation-frame queue guard.
- Dialog backdrop-close behavior moves from scanning/attaching listeners to every dialog into one delegated body click listener, preserving dynamically inserted dialogs without requiring a global observer.
- Web UX regression forbids the body-subtree observer and per-dialog click installer while requiring both scoped observers and delegated dialog behavior.
- F2 changes observer ownership only; Settings/Downloads content, task polling, selection-status observers, Recommendation/Visual observers, scroll/focus behavior and performance budgets are unchanged.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F2.md.

## 2026-09-24 — P2-F1 event-driven Theme decoration

State update:
- Theme decoration already had scoped MutationObservers on Recommendation/Downloads/Library/Downloaded roots, a theme-attribute observer, resize handling, visibility restoration, explicit theme application and requestAnimationFrame coalescing.
- Despite those authorities, alpha8-theme-help.js still ran setInterval(scheduleThemeDecoration, 2500) for the full page lifetime.
- Each visible active-theme tick rescanned progress elements and empty-state targets even when no UI state changed.
- F1 removes only this redundant interval and its pagehide cleanup branch.
- Recommendation build polling remains because it observes authoritative backend task state while a build is active and terminates with that task; it is not a DOM-decoration fallback.
- Existing Web UX regression now forbids the Theme interval while requiring mutation filtering, resize/visibility triggers and Recommendation polling to remain.
- F1 does not change Theme visuals, task polling cadences for other features, scroll restoration, or performance budgets.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F1.md.

## 2026-09-24 — P2-E2 provider/account cache partition and inventory

State update:
- Critical long-lived caches/snapshots now have an explicit owner/key/invalidation/scope inventory in docs/CACHE_DISCIPLINE_P2E2.md. TTL and LRU are classified as eviction policies, not authoritative invalidation.
- Provider Preview and Online Reader caches previously keyed provider-backed state only by comic/episode/page identity, so a live Pica account change, E-H session/surface change, provider revision change or page-locator change could reuse data created under a different authority.
- ProviderService now exposes a non-secret cache scope. Pica uses a hashed configured account identity + comic revision; E-H uses selected surface + a SHA-256 session partition + comic revision. Raw credentials are not exposed.
- Preview/Online Reader page validation adds a SHA-256 fingerprint over current provider scope + actual page locator. Only the digest is persisted.
- Preview routes additionally require the page to have been prepared under the current provider scope; an old route cannot directly retrieve a previous account/session entry after an authority switch.
- Online Reader album/chapter metadata and in-flight image dedupe are provider-scope partitioned.
- Desktop Pica credential changes now clear LibraryService's cached authenticated Pica SDK instance before subsequent requests.
- Regression coverage checks Pica/E-H scope changes without secret leakage, Preview direct-route invalidation, locator invalidation, Online Reader metadata/page reload after scope change and the Pica session-reset source contract.
- E2 does not change TTL/size budgets, create an offline reader cache contract, add generic provider probes, or change Android cache formats.
- Detailed boundary: docs/CACHE_DISCIPLINE_P2E2.md.

## 2026-09-24 — P2-E1 Desktop cover cache source identity

State update:
- Desktop cover cache filenames were keyed only by `comicId`, and metadata stored only MIME type. A changed provider cover locator/revision could therefore reuse an old image indefinitely.
- The existing Android `CoverRepository` already solves the same class of problem with source/version-aware cache identity; E1 adopts that established principle for Desktop rather than introducing a different cache model.
- Desktop still owns one image/metadata slot per comic. The filename remains `SHA-256(comicId)`, while cache validity now requires a source fingerprint derived from comic/provider/remote identity, trusted `coverUrl` and provider `updatedAt`.
- Source changes atomically replace the existing slot, so cache correctness improves without accumulating historical cover versions.
- Legacy metadata without `sourceFingerprint` refreshes once. Raw cover URLs are not written to the metadata file.
- Regression coverage uses a real Library SQLite database plus injected Pica image provider and requires unchanged cache hits, URL/revision invalidation, same-URL newer-revision invalidation, and one-time legacy refresh.
- E1 does not add TTLs, memory LRU, cache-size policy, provider probes or Android changes.
- Detailed boundary: docs/CACHE_DISCIPLINE_P2E1.md.

## 2026-09-24 — P2-D8B comicSelect picture-count A/B scaling evidence

State update:
- D8A fixed the missing comic-first picture-count index, but query-plan selection alone does not justify replacing correlated counters with aggregate joins/CTEs.
- D8B adds `pnpm benchmark:comic-select-picture-count`, which creates a deterministic latest-schema SQLite fixture, copies it, removes only `idx_pictures_comic_status` from the comparison copy, and measures both variants.
- The harness measures spread single-comic `getComic()` calls plus repeated broad `listComicsForLibraryQueryBase({ scope: 'catalog' })` projections at default 500/2000/5000 comic sizes and configurable picture density.
- Output includes p50/p95/max plus descriptive without-index/indexed ratios. These values are synthetic local scaling evidence and are explicitly not release thresholds or Windows reference-machine budgets.
- A real SQLite semantic regression compares detail and broad count projections with versus without the D8A index and requires identical comic/count results.
- D8B changes no production query, count semantics, picture write path or index set. Aggregate rewrites remain evidence-gated.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D8B.md.

## 2026-09-24 — P2-D7C transactional recommendation impression batching

State update:
- Recommendation event audit found that `recommend_batch_presented` is one event per render and feedback/detail events are independent user actions, so they are not transaction-batching targets.
- The real write burst is Web `recommend_impression`: several cards in the same recommendation batch can cross the existing 50% visibility / 800 ms dwell threshold nearly simultaneously and previously produced multiple independent POSTs and autocommit SQLite writes.
- D7C adds a 25 ms Web micro-batch queue, capped at 24 events. Each event freezes its own client-observed time, app/context/cycle/batch/comic fields, zero-based rank and dedupe key before entering the queue.
- `POST /api/v1/recommendation-events/batch` accepts only `recommend_impression` events and delegates to `recordRecommendationEvents()` / D7B `recordUserEvents()`, producing one short transaction per natural burst.
- The existing single-event endpoint is unchanged. Batch-presented, like/dislike, feedback-reason and detail actions continue through their existing independent event paths.
- Batch validation preserves rank 0, caps the batch at 24, and transaction rollback prevents a metadata-invalid event from leaving a partial impression burst.
- Web batching uses `keepalive: true` and flushes pending impressions when the document becomes hidden. This reduces avoidable loss but does not create a durable offline telemetry queue.
- D7C changes write/request fan-out only; visibility/dwell thresholds, evidence granularity, dedupe semantics, ranking/serving, SQLite journal mode, performance budgets and P2-C3 enforcement remain unchanged.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D7C.md.

## 2026-09-24 — P2-D8A picture count planner index

State update:
- `comicSelect` computes known/downloaded picture counts through correlated predicates on `pictures.comic_id`.
- Existing indexes covered episode-order reads and status-first downloaded-picture scans, but there was no index whose leading column is `comic_id` for `COUNT(*) WHERE comic_id = ?`.
- Migration 16 adds `idx_pictures_comic_status(comic_id, status)` without changing `comicSelect` output or removing existing indexes.
- A real SQLite `EXPLAIN QUERY PLAN` regression requires the total-picture count to use the new index. The completed-picture count may use either the new index or the existing `idx_pictures_downloaded(status, comic_id)`, both of which cover its equality predicates.
- The migration suite separately requires the new index to exist in a fresh latest database.
- D8A intentionally avoids a larger correlated-subquery-to-aggregate-join rewrite until query scaling evidence shows it is justified across single-comic and broad Library reads.
- No count semantics, Library ordering/filtering, write paths, performance budgets or P2-C3 enforcement change.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D8A.md.

## 2026-09-24 — P2-D7B transactional shelf event batching

State update:
- Shelf add/remove routes preserved correct per-comic behavior evidence but wrote each event through an independent autocommit `recordUserEvent()` call.
- D7B adds `recordUserEvents()`, which wraps the existing single-event recorder in one synchronous `BEGIN IMMEDIATE / COMMIT / ROLLBACK` transaction.
- Shelf routes now map the same one-event-per-comic payloads into the batch API; event granularity, IDs, app/context fields, metadata safety and dedupe behavior remain unchanged.
- If one event fails validation, the event batch rolls back rather than leaving a partially recorded route action. The shelf mutation itself remains outside this event transaction exactly as before.
- No network/async work occurs inside the transaction and no unrelated requests are combined.
- D7B does not change recommendation evidence semantics, download cadence, SQLite journal mode, performance budgets or P2-C3 enforcement.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D7B.md.

## 2026-09-24 — P2-D7A download progress write read-amplification

State update:
- Download progress persistence was already throttled to 250 ms per active job, but every persisted update still executed a leading `getDownloadJob()` only to fill omitted patch fields, followed by UPDATE and a second `getDownloadJob()` for the return value.
- D7A moves omitted-field preservation into SQLite with `COALESCE`, reducing each persisted progress patch from SELECT → UPDATE → SELECT to UPDATE → SELECT.
- Partial patch behavior is preserved: unspecified fields retain stored values, explicit numeric zero remains writable, and unknown job IDs still fail through the authoritative return lookup.
- The 250 ms persistence interval, UI callback frequency, forced final persistence, download concurrency, media pacing and pause/resume/cancel semantics are unchanged.
- D7A is a read-amplification cleanup, not evidence to tighten or relax the persistence cadence; that requires J1/J2 foreground-latency evidence under real active downloads.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D7A.md.

## 2026-09-24 — P2-D6A complete Visual favorite target domain

State update:
- `visualPreferenceProfile()` and `visualIndexStatus()` were still requesting up to 10000 comics (but effectively capped at 5000) only to derive favorite IDs.
- D6A replaces those reads with the existing complete-domain `favoriteIds()` query. Taste-exclusion filtering in the preference profile and feedback-derived targets in index status remain unchanged.
- A real SQLite regression stores 10001 favorites, deliberately places the only embedded favorite outside the legacy effective 5000-row catalog prefix, and requires Visual preference evidence plus `targetCount=10001` to include it.
- Author Atlas, Style Families and Representation QC retain their wider catalog inputs because they explicitly report total-catalog, provider and favorite coverage metrics. Narrowing those inputs to embedding-bearing rows would change diagnostic/scientific semantics.
- D6A changes only favorite-ID acquisition; it does not rebuild embeddings, change Visual serving/reranking, alter coverage denominators, choose a foreground threshold or enable P2-C3 enforcement.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D6A.md.

## 2026-09-24 — P2-D5B targeted Work Identity detail relationships

State update:
- `workVariantsForComic()` previously loaded global prefixes of 10000 bindings, 5000 decisions and 5000 evidence rows and then filtered them to the current comic.
- D5B adds targeted database APIs for the current binding, all bindings of the current Canonical Work, all decisions involving the current comic, and high-confidence probable evidence involving the current comic.
- Relationship candidate binding metadata is resolved in one chunked exact-ID batch rather than per-candidate N+1 lookups.
- The existing full-catalog Work Identity V3 creator/title/cover heuristic funnel remains unchanged because it is a separate discovery semantic, not relationship-state lookup.
- Migration 15 adds `idx_work_identity_decisions_right` plus symmetric left/right probable-evidence indexes. Existing binding primary/work indexes are reused.
- Boundary regressions extend the 10001/5001 D5A fixture and add a 5001-row evidence case where the target pair is outside the global review prefix but must be returned by the current-comic targeted API.
- Source-contract tests forbid `workVariantsForComic()` from using the legacy global relationship-prefix APIs.
- D5B changes query scope only; relation precedence, KEEP_SEPARATE authority, resolver confidence, materialization execution, recommendation ranking, performance budgets and P2-C3 enforcement remain unchanged.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D5B.md.

## 2026-09-24 — P2-D5A authoritative Work Identity domains

State update:
- Work Identity review/presentation and authoritative materialization previously shared bounded decision/binding APIs: 5000 decisions and 10000 bindings.
- D5A preserves those bounded APIs for ordinary review surfaces but adds explicit `listAllWorkIdentityDecisions()` and `listAllWorkIdentityBindings()` for correctness domains.
- Materialization preview uses the complete decision domain whenever storage exceeds the bounded review list. The materialization plan always uses complete decisions and existing bindings, so its digest represents the full stored state.
- Final V3 Canonical Work ownership expansion now uses complete bindings rather than the legacy 10000-row prefix.
- A real SQLite boundary regression stores 10001 bindings and 5001 decisions and requires bounded versus authoritative reads to return 10000/10001 and 5000/5001 respectively.
- D5A intentionally does not change `workVariantsForComic()`; that detail UX needs targeted per-comic/work relationship queries rather than replacing bounded prefixes with global full-domain reads.
- Materialization execution remains disabled; resolver confidence, human authority, KEEP_SEPARATE semantics, recommendation ranking and P2-C3 enforcement are unchanged.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D5A.md.

## 2026-09-24 — P2-D4 compact Final V3 serving catalog

State update:
- Final V3 frozen serving, portable readback and serving-composition diagnostics still materialized up to 10000 comics even though each path already had explicit ranked/batch IDs.
- The ownership filter only depends on records that are physically owned, explicitly policy-owned, or current candidates; unrelated unowned catalog rows cannot affect the decision.
- D4 replaces those broad reads with exact-ID `getComicsByIds()` sets built from `recommendationOwnershipState().ownedComicIds`, policy-owned IDs and current candidate/batch IDs.
- Frozen Final V3 serving preserves its existing Canonical Work expansion: uploads belonging to an already owned canonical work are still added to the serving policy and exact-ID filter catalog.
- Batch allocator favorites now come from the dedicated `favoriteIds()` query instead of filtering a broad serving catalog.
- Recommendation generation/profile, V5 Shadow, Portable Policy inferred-signal construction and recommendation-audit bounds are explicitly unchanged.
- Regression coverage requires compact ownership filtering to equal the previous full-catalog semantics and locks serving/portable/composition paths away from the 10000-row materialization.
- D4 changes query scope only; it does not change ranking, candidate generation, ownership authority, Work Identity confidence, performance budgets or P2-C3 enforcement.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D4.md.

## 2026-09-24 — P2-D3 Library-query cost evidence and lazy author metadata

State update:
- After D2 removed the author 2N+1 query shape, ordinary Library queries still eagerly loaded the complete author-group metadata set before determining whether aliases were needed.
- D3 makes author-group loading conditional on non-empty free-text search. Normal Library render, structural filters and tag filters no longer issue the full author/alias/circle batch.
- Author facet labels on no-text paths reuse the canonical author already projected on each StoredComic; text search keeps the previous alias-aware matching semantics.
- Unit coverage requires no-text queries to avoid `listAuthors()`, while a text query that matches only an alias must still load author groups and return the comic.
- D3 adds `pnpm benchmark:library-query`, which builds real temporary SQLite libraries at 500/2000/5000 rows and records repeated ordinary/structural/tag/text query p50/p95/max scaling evidence.
- The D3 harness is synthetic local scaling evidence only. It does not set a user-facing latency threshold, Windows reference result, P2-K budget or P2-C3 capacity.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D3.md.

## 2026-09-24 — P2-D2 hot-query batching and reverse author indexes

State update:
- Shelf reads were still loading the first 5000 comics into a Map after separately reading shelf IDs. This was both an avoidable catalog-scale hot path and a correctness bug for shelf items beyond the legacy boundary.
- `recommendationRecords(comicIds)` had the same catalog-prefix materialization despite receiving an explicit small ID set.
- `listAuthors()` executed one base author query plus separate alias and circle queries per author. Because Library facet evaluation calls `listAuthors()`, this formed a 2N+1 query pattern on an ordinary foreground path.
- D2 adds chunked exact-ID comic retrieval (400 IDs per SQL chunk) that reconstructs the original request order. Shelf and recommendation-record restoration now read only requested IDs.
- Author aliases and circles are loaded in two batch queries and grouped in memory, reducing `listAuthors()` to a fixed three-query shape.
- Existing shelf indexes already match shelf membership/order reads, so no duplicate shelf index is added.
- Migration 14 adds only the missing reverse author indexes: `author_aliases(author_id, alias_display)` and `comic_authors(author_id, circle)`.
- Regression coverage extends the 5007-record boundary test to Shelf and recommendation record restoration, adds an 805-record multi-chunk exact-ID ordering test, and verifies the new indexes through the migration integration suite.
- No recommendation ranking/serving logic, latency budget or P2-C3 enforcement changes in D2.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D2.md.

## 2026-09-24 — P2-D1 full-domain correctness-cap cleanup

State update:
- The first P2-D cap audit distinguished legitimate bounded presentation/algorithmic queries from operations that claim to cover the complete authoritative library.
- Browser Lite package export previously defaulted to `listComics({ limit: 5000 })`; libraries above 5000 rows were silently truncated. The default path now uses `listAllComics()`.
- CLI CSV export and unscoped progress now use the complete catalog. Scoped `progress <comicId>` uses direct `getComic(comicId)`, preserving the P1 direct-object rule.
- CLI `prepare-library` no longer omits favorites that fall beyond the first 5000 catalog rows.
- A 5007-record unit regression crosses the legacy boundary and requires the Browser Lite package to contain the complete domain.
- Recommendation V3/V5 and recommendation-audit 5000/10000 limits are intentionally not changed in D1 because they may be algorithmic/diagnostic budgets rather than accidental SQLite pagination. Their semantics and cost require separate evidence.
- D1 is a correctness cleanup, not a claim that P2-D is complete. Hot-query/N+1/index/write-frequency audit continues.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D1.md.

## 2026-09-24 — P2-J2 repeatable Desktop latency scenarios

State update:
- J1 measurement infrastructure is now paired with a repeatable Desktop scenario harness rather than relying on ad-hoc manual clicking.
- The harness connects only to a loopback Desktop engine, obtains the Desktop CSRF token, warms representative foreground paths, resets the J1 window, and records three clean rounds by default.
- Foreground traffic is sequential and user-interaction-shaped rather than saturation load: status, Library facet query, shelves, downloaded listing, Reader progress, plus an automatically discovered local comic detail/chapter path where available.
- Optional comic/chapter IDs are discovered before the measured window and are not emitted in the JSON report.
- Idle windows require zero observed background-task overlap. Load windows require every requested task type to cover every foreground sample; incomplete coverage invalidates the window but does not create a performance pass/fail threshold.
- The measured workload remains authoritative in its existing scheduler/UI. J2 does not start, pause, cancel or otherwise control downloads, WebDAV, recommendation, maintenance or analysis tasks.
- Output is machine-readable and includes environment, per-round J1 profiles, task coverage and measurement-window validity. It selects no p50/p95 budget and cannot authorize P2-C3 enforcement.
- Detailed protocol: docs/HTTP_LATENCY_SCENARIO_P2J2.md.

## 2026-09-24 — P2-J1 real local HTTP latency observation

State update:
- Existing performance docs and download/Visual benchmark harnesses are synthetic/implementation-bound evidence and cannot answer whether normal Library/detail/Reader interaction slows down while heavy work runs.
- J1 adds a bounded in-memory LocalHttpLatencyRegistry at the local HTTP server boundary.
- Requests are classified only into low-cardinality route classes (`library-query`, `comic`, `reader`, `downloads`, etc.); raw URL/path, comic/episode/page IDs, query strings, bodies and credentials are never retained.
- Each sample records duration/status plus sanitized active internal task types from the P2-C resource coordinator at request start.
- Profiles separate idle vs under-load samples and summarize p50/p95/max/error count by route class and background task type.
- Data is process-memory only, bounded to 500 samples in Desktop integration, not persisted and not uploaded.
- Desktop-only `/api/v1/desktop/runtime/http-profile` exposes the profile; it is not added to Remote Web/browser-session allowlists.
- Desktop-CSRF-protected `/api/v1/desktop/runtime/http-profile/reset` clears the in-memory window for repeatable scenarios; profile/reset requests themselves are excluded from samples so diagnostics do not contaminate the measurement.
- No performance threshold is selected. J1 is measurement infrastructure; representative Windows/Android evidence is still required before P2-K budgets or P2-C3 enforcement.
- Detailed boundary: docs/HTTP_LATENCY_RUNTIME_P2J1.md.
## 2026-09-24 — P2-C2B shared Desktop resource graph

State update:
- Desktop now creates one observe-only RuntimeResourceCoordinator per engine and injects it into LibraryService and RemoteStorageDesktopManager.
- The resource diagnostics therefore cover both service tasks and WebDAV instead of presenting separate module-local views.
- Added coarse observation declarations:
  - Recommendation V3 = provider-network + cpu-analysis + sqlite-read-heavy + sqlite-write-heavy;
  - favorites sync = provider-network + sqlite-write-heavy;
  - local/GitHub download runner = media-network + filesystem-heavy + sqlite-write-heavy;
  - WebDAV sync = remote-storage-network + filesystem-heavy + sqlite-read-heavy + sqlite-write-heavy.
- Download runners are tagged `user`; the other newly added observations remain `background`. Priority is still diagnostic-only because coordinator enforcement is disabled.
- Existing DownloadScheduler/MediaRequestGate, recommendation checkpoints, favorites controls and WebDAV controls remain the execution authorities; resource observation does not replace them.
- C2B leases remain coarse task-lifetime observations. They are not suitable for C3 enforcement until pause/phase ownership and foreground latency are measured.
- Detailed boundary: docs/RUNTIME_RESOURCE_OBSERVATION_P2C2B.md.
## 2026-09-24 — P2-C2 first observe-only integration batch

State update:
- The coordinator remains in observe mode: no task waits, no task is rejected for resource pressure, and no production capacity exists yet.
- First-batch service-owned tasks now declare coarse resource leases:
  - maintenance update = provider-network + sqlite-write-heavy;
  - maintenance repair = filesystem-heavy + sqlite-read-heavy;
  - library organize = filesystem-heavy;
  - Recommendation V5 Shadow = provider-network + cpu-analysis + sqlite-write-heavy;
  - Work Identity evidence refresh = cpu-analysis + sqlite-read-heavy + sqlite-write-heavy.
- Desktop control plane adds read-only `/api/v1/desktop/runtime/resources`; this internal runtime diagnostic is not added to Remote Web/browser-session allowlists.
- Desktop idle-browser shutdown now treats active observed background tasks as work leases, so detached maintenance/analysis work is not killed merely because the last Web UI tab closes.
- Behavioral coverage holds a real maintenance Provider request open, verifies the active lease/usage snapshot, then verifies release after task completion.
- First-batch leases describe task-lifetime overlap, not physical utilization. Paused tasks currently retain an observation lease.
- Therefore C2 data may identify potentially competing task combinations, but C3 enforcement is prohibited until resource ownership is phase-aware where needed and overlap is combined with latency measurements.
- Detailed boundary: docs/RUNTIME_RESOURCE_OBSERVATION_P2C2.md.
## 2026-09-24 — P2-C1 resource coordinator foundation

State update:
- H2C PR #118 passed all gates after a transient Windows ARM64 DPAPI settings timeout was reproduced as non-deterministic: the targeted rerun passed packaged acceptance, replacement/rollback and install/uninstall.
- P2-C may now begin while H2B continues collecting real Visual timing evidence; this does not authorize choosing a Visual foreground threshold.
- C1 introduces a shared resource-class vocabulary and a coordinator with observe/enforce modes.
- The application does not enable enforcement in C1. No production resource capacity has been selected.
- Enforcement semantics are tested in isolation: atomic multi-resource acquisition, foreground/user/background ordering, cancellable waiters, idempotent release and bounded diagnostics.
- C2 will integrate existing tasks in observe-only mode to collect real overlap before C3 selects any enforceable budget.
- Detailed boundary: docs/RUNTIME_RESOURCE_COORDINATOR_P2C1.md.
- Windows ARM64 packaged acceptance timeout was hardened after two identical hosted-runner DPAPI/settings POST overruns: that native operation remains bounded at 30 seconds and now logs elapsed time; other platform acceptance bounds remain unchanged.
- Docker TLS acceptance was hardened after a transient post-readiness 502: Caddy/Pica readiness remains bounded, but the post-TLS health assertion now retries within a finite window and fails with container logs if readiness does not stabilize.
## 2026-09-24 — H2C Work Identity background runtime candidate

State update:
- The ordinary Work Identity evidence refresh no longer needs to own one synchronous HTTP request.
- A checkpointable async audit uses the same pair-evaluation logic as the synchronous baseline and yields during catalog bucketing and candidate-pair comparison.
- The service-owned task exposes loading/bucketing/comparing/persisting progress plus pause/resume/cancel.
- The Web review surface polls authoritative backend state and can reattach after the panel is recreated.
- Evidence persistence occurs only after the final cooperative checkpoint; an incomplete cancelled scan is not committed as a completed new evidence refresh.
- Tests require the async audit result to equal the synchronous result for identical input.
- Resolver semantics, confidence rules, KEEP_SEPARATE authority, automatic binding, materialization execution and recommendation serving remain unchanged.
- Remaining Work Identity runtime measurement for review/materialization-preview and full-catalog SQLite materialization stays under later P2-D/P2-C work.

## 2026-09-24 — H2B Visual analysis measurement started

State update:
- Representation QC, Author Atlas and Style Families now record bounded in-memory runtime samples with input size, parameters, outcome and duration.
- `/api/v1/desktop/visual/runtime-profile` exposes those diagnostics without triggering analysis.
- The timing registry deliberately reports `foregroundThresholdMs=null` and `MEASURE_BEFORE_THRESHOLD`; no synchronous/background decision is being invented before evidence exists.
- A deterministic `pnpm benchmark:visual-analysis` scaling harness was added for relative regression comparison. CI/shared-runner wall time is explicitly not a user-facing threshold.
- Scientific/product boundaries remain unchanged: read-only Visual evidence, no embedding rebuild, no serving activation/promotion, and no hidden execution on ordinary page open.
- H2B remains open until representative real-use timings justify either retaining synchronous execution or promoting one or more calculations to a detached task.

## 2026-09-24 — H2A V5 Shadow Retrieval runtime completed

State update:
- PR #116 passed the main CI plus Linux, macOS arm64, Windows ARM64 and Docker package gates on its final implementation head.
- The Shadow Retrieval POST now starts a detached Desktop task and returns immediately; status and pause/resume/cancel are separate authoritative endpoints.
- Retrieval checkpoints exist between bounded provider work units and between local analysis phases. Concurrent Pica/E-H/ExH provider pipelines settle at safe checkpoints before a cancellation becomes terminal.
- The Evaluation UI polls authoritative backend state, exposes real task controls and reattaches to an already-running task after the surface is recreated.
- Incomplete cancelled output is not persisted as a completed new Shadow audit run.
- Scientific/product boundaries are unchanged: explicit confirmation remains required, execution remains `MANUAL_DESKTOP_ONLY`, `servingImpact=false`, and there is no serving promotion, Visual rebuild or Canonical Work materialization.
- H2B is now next and begins with latency instrumentation rather than automatically turning every Visual analysis into a background job.

## 2026-09-24 — H1C organizer runtime merged

State update:
- PR #114 passed CI plus Linux, macOS arm64, Windows ARM64 and Docker package gates and was merged.
- `/api/v1/organize` now starts a detached LibraryService task with status and pause/resume/cancel controls.
- Organizer/materialization filesystem operations use asynchronous APIs and explicit checkpoints instead of synchronous `existsSync/cpSync/symlinkSync/writeFileSync` loops.
- CLI `organize` and `portable` now use the complete catalog instead of a 5000-comic cap.
- Portable comic replacement uses a temporary copy before publication; final index/manifest publication occurs only after the final checkpoint.
- Existing published indexes/manifests are retained until replacement is ready, including a Windows-compatible backup/restore fallback.

## 2026-09-24 — H1B maintenance update runtime merged

State update:
- PR #113 passed CI, v0.4 direct-upgrade acceptance, Linux, macOS arm64, Windows ARM64 and Docker package gates and was merged.
- Full maintenance update scans now detach from the HTTP request lifecycle and expose authoritative progress plus pause/resume/cancel.
- The scan domain is now the complete set of downloaded comic IDs queried directly from SQLite; the previous 5000-comic list cap is gone.
- Pause/cancel checkpoints run before and after each bounded Provider request, so an already-active request may finish but no next comic starts after the control action.
- Full scans remain review-first and do not auto-queue download jobs.

## 2026-09-24 — H1 maintenance hardening started

State update:
- PR #112 merged the first H1 remediation: repair scanning now performs asynchronous file stats, yields the Node event loop, and exposes scan progress hooks.
- The next H1 branch changes full maintenance update checking from a request-owned scan into a background task with authoritative status and pause/resume/cancel controls.
- Full update-scan discovery now uses the database's complete downloaded-comic ID domain rather than `listComics({ limit: 5000 })`.
- Explicit small `comicIds` update checks remain synchronous for API compatibility; the ordinary full-scan UI uses the background task path.
- Automatic queueing is intentionally not added to the full scan: findings remain reviewable before update jobs are queued.


## 2026-09-24 — W5C shell-only PWA merged

State update:
- PR #109 passed CI plus Linux, macOS arm64, Windows ARM64 and Docker package workflows and was merged.
- W5C remains intentionally shell-only: no user-content offline cache, remote mutation or multi-user expansion.
- P2 remains the critical path after this merge.

## 2026-09-24 — P2-0 runtime inventory completed

Finding:
- Long-task implementations are functionally mature in several areas, but authority is split across LibraryService in-memory state, browser Worker/page state, RemoteStorage manager state, SQLite download jobs, Android WorkManager and Android DownloadManager.
- This does not justify a single universal scheduler. P2 will standardize the task contract and add cross-task resource governance while preserving platform-native executors.
- High-priority concrete gaps were confirmed:
  - maintenance update checking is request-owned, serial and defaults to a 5000-comic domain cap;
  - repair scanning performs synchronous per-file filesystem stat work on the Node event loop;
  - organize/materialize flows perform synchronous filesystem work in foreground request paths;
  - Recommendation V5 shadow retrieval is manual/shadow-only but still request-owned;
  - Visual indexing is Worker-isolated but its control authority is browser-page-local;
  - advanced Visual/Work Identity/evaluation calculations require instrumentation before deciding whether each needs background execution;
  - Android long tasks are individually durable but do not yet share a cross-task resource budget;
  - current performance documentation is not yet a real hardware/runtime baseline.

Action:
- Remediation starts with maintenance/runtime hardening (RT-07 through RT-10), then background analysis tasks, resource arbitration and performance instrumentation.
- Detailed evidence and remediation order are tracked in `docs/RUNTIME_INVENTORY_P2.md`.

## 2026-09-24 — Reconciled architecture/runtime work with the active multi-platform plan

Decision:
- Restore **P2 Architecture & Runtime Hardening** as the current critical engineering priority.
- Preserve existing repository naming: W5A session, W5B read-only shell, current PR #109 = W5C shell-only PWA.
- Do not retroactively rename W5C to onboarding.
- Add operator-friendly authorization as W5D.
- Treat user-content offline caching as a separate later security problem, not as an automatic consequence of “PWA”.
- Keep Linux/macOS/Windows ARM64 as experimental until their real-device/distribution gates pass.
- Keep Server/Docker as operator preview until provider/soak/provenance/multi-user questions are resolved.

Reason:
Recent work correctly advanced multi-platform and Remote Web foundations, but progress reporting had begun to underrepresent the earlier architecture/runtime optimization work. This reconciliation makes the full task package explicit so later development cannot drift into “add more platforms/features” while leaving runtime hardening and real performance validation unfinished.
