# Pica Library Development Task Log

> **Purpose:** authoritative engineering task log for the architecture/runtime/multi-platform expansion.
>
> This file is intentionally different from `PROJECT_LOG.md`: `PROJECT_LOG.md` records released/versioned product evolution; this file records **what still needs to be done, why, in what order, and what evidence is required before a task is considered complete**.

Last reconciled: **2026-09-24**  
Authoritative repository baseline after 2026-09-24 reconciliation: `main@e4f83987d78795426f191d6753798c56e39a32ec` (W5C merged)  
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
**Status: IN_PROGRESS — F1–F8 merged; F9 WebDAV poller recovery candidate; hidden-tab/remaining poller audit remains open**

Already improved:
- coalesced observers;
- duplicate-submission locks;
- lazy cover rendering;
- bounded Library/download rendering;
- settings pages avoid automatic provider probes;
- experimental tools do not automatically recompute on page open.

Remaining:
- audit all MutationObservers/timers/pollers;
- remove duplicate authorities/pollers;
- ensure large tables/grids use bounded rendering;
- prevent one status update from rebuilding unrelated page sections;
- preserve scroll/focus during incremental updates;
- verify settings/online/recommendation transitions on low-end hardware.

**Acceptance**
- no full-page rescan per DOM mutation;
- only one authority for each recurring poll/state stream;
- browser performance trace shows no persistent high-frequency idle work from the app itself.

## P2-G — Android runtime hardening
**Status: PARTIAL**

Already improved:
- heavy recommendation profile work moved off Activity first frame;
- Catalog/Policy/evidence caches;
- bounded recommendation redraw;
- WorkManager-based background operations;
- page-level durable download resume.

Remaining:
- inventory all Activities/Fragments for main-thread file/JSON/DB/network work;
- unify background-task status presentation through the task center where appropriate;
- define Android-specific concurrency/resource budgets;
- validate process death/relaunch for every durable Worker class;
- validate low-memory/background restrictions;
- verify large Catalog and long Reader behavior on representative mid-range hardware.

**Acceptance**
- no known heavy blocking operation on the Android UI thread;
- process death does not convert partial work into completed state;
- background task UI is reconstructible after Activity recreation.

## P2-H — Startup, shutdown and crash recovery
**Status: PARTIAL**

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

## P2-I — Observability without exposing internals to ordinary users
**Status: PLANNED / PARTIAL**

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
- no provider credentials, cookies, bearer tokens or sensitive local paths in normal diagnostic exports.

**Acceptance**
- enough structured telemetry to diagnose “stuck” vs “slow” vs “waiting” vs “failed”;
- diagnostic data follows existing credential-exclusion rules.

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
**Status: IN_PROGRESS — F1–F8 merged; F9 WebDAV poller recovery candidate**

- **F1–F8 merged (PR #138–#145):** idle Theme polling removed; broad DOM observer work is either scoped to an owning root or processed incrementally/coalesced.
- **F9 poller inventory completed:** Downloads, Favorites sync, Browser Lite export, WebDAV, updater, Recommendation build, E-H login, Work Identity evidence refresh, V5 shadow evaluation and onboarding readiness now have documented owner/start/stop/terminal contracts.
- Most existing pollers are already request-, view-, or task-scoped and are not changed merely to lower frequency.
- **F9 WebDAV gap fixed:** after page/script reload, `load()` now reattaches polling when `remoteStorage.syncProgress` is still active/recoverable instead of rendering one frozen snapshot.
- Restored WebDAV polling now self-terminates when backend progress becomes terminal; a local `remoteSyncRequestPending` guard prevents the initiating request's first still-idle status snapshot from prematurely stopping its timer.
- Pause/resume/cancel responses ensure polling is active while the returned task is still active, and `pagehide` clears the page-local timer without affecting backend durability.
- **Next after F9:** audit hidden-tab/background behavior, onboarding readiness retry lifetime, and duplicate watcher prevention. Make changes only where a poller can outlive its UI/task authority.
- Detailed boundaries: `docs/FRONTEND_OBSERVER_DISCIPLINE_P2F1.md` through `docs/FRONTEND_OBSERVER_DISCIPLINE_P2F8.md`, plus `docs/FRONTEND_POLLER_DISCIPLINE_P2F9.md`.

## PARALLEL-1 — W5C PR #109
**Status: DONE**

May continue independently if:
- shell-only cache boundary remains intact;
- W5A/W5B security and read-only guarantees stay intact;
- it does not expand into user-content offline caching, remote mutation or multi-user scope;
- all existing platform gates remain green.

---

# 12. Decision / scope-change log

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
