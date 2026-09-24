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
**Status: IN_PROGRESS — C1 coordinator foundation implemented; production enforcement remains disabled**

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
**Status: PARTIAL**

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
**Status: PARTIAL**

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
**Status: PARTIAL**

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
**Status: PLANNED**

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
**Status: IN_PROGRESS — C1 foundation**

- **C1:** add a tested resource coordinator with shared resource-class vocabulary, atomic multi-resource leases, priority/FIFO admission semantics, cancellation and diagnostics. Production mode remains observe-only and does not impose invented capacities.
- **C2 next:** integrate heavy tasks with observe-only resource declarations so real overlap can be measured.
- **C3 later:** propose enforceable capacities only after overlap and latency evidence exists.

Use the runtime inventory plus H1/H2 measurements to define resource classes and concurrency policy. Do not invent limits before observing current workloads.

## NEXT-5 — P2-J/P2-K performance baseline
**Status: PLANNED after enough instrumentation exists**

Create repeatable local/browser/Android measurements and record the first real baseline.

## PARALLEL-1 — W5C PR #109
**Status: DONE**

May continue independently if:
- shell-only cache boundary remains intact;
- W5A/W5B security and read-only guarantees stay intact;
- it does not expand into user-content offline caching, remote mutation or multi-user scope;
- all existing platform gates remain green.

---

# 12. Decision / scope-change log

## 2026-09-24 — P2-C1 resource coordinator foundation

State update:
- H2C PR #118 passed all gates after a transient Windows ARM64 DPAPI settings timeout was reproduced as non-deterministic: the targeted rerun passed packaged acceptance, replacement/rollback and install/uninstall.
- P2-C may now begin while H2B continues collecting real Visual timing evidence; this does not authorize choosing a Visual foreground threshold.
- C1 introduces a shared resource-class vocabulary and a coordinator with observe/enforce modes.
- The application does not enable enforcement in C1. No production resource capacity has been selected.
- Enforcement semantics are tested in isolation: atomic multi-resource acquisition, foreground/user/background ordering, cancellable waiters, idempotent release and bounded diagnostics.
- C2 will integrate existing tasks in observe-only mode to collect real overlap before C3 selects any enforceable budget.
- Detailed boundary: docs/RUNTIME_RESOURCE_COORDINATOR_P2C1.md.
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
