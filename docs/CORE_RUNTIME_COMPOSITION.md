# Core reader and optional source runtime composition

## Authority and current status — 2026-10-25

This is isolated local development on `codex/reader-core-runtime-composition-20261025`, based on frozen PR210 source `4a18ba769fb3c8df1e6bd100293d38db3013b5dc`. The human granted a continuing goal-specific Local Memory coordination exception after routing returned `NOT_FOUND`. No project registration/DPAPI repair or invented claim is performed. The exception permits local source/analysis only: no production data/schema change, local Java/app/browser/listener, push, merge, tag, Release, OTA change or deployment. A new Draft and cloud/signing run require separate permission. PR210, its Dev86 package and the G-drive application remain outside this change.

**Local implementation and selected offline gates: PASS. Actual new installables/cloud runtime gates: PENDING. Complete modular-reader objective: OPEN.**

## Concrete problem and implementation

Previously the Windows builder copied `runtime/jm` whenever it happened to exist in the checkout. Packaging a local reader could therefore silently include a JVM/SDK. Availability also searched other candidate roots, so a packaged core needed an explicit boundary against borrowing a checkout's runtime.

| Build choice | Physical payload | Normal stable full ZIP name |
| --- | --- | --- |
| Default `core` | Node/application/local Reader; no `runtime/jm` | `Pica-Library-v<VERSION>-windows-x64.zip` |
| Explicit `jm` | Same application plus the existing pinned JM SDK/JRE | `Pica-Library-v<VERSION>-with-jm-windows-x64.zip` |

`-SourceRuntimes core|jm` is an explicit build choice, not user enablement. For existing build compatibility only, `PICA_REQUIRE_JM_RUNTIME=1` selects JM when the parameter is omitted; explicit core + required JM fails. A corrupt unused checkout runtime does not affect a core build. RC repackaging receives the same resolved choice. No dependency, source protocol or SDK version is changed.

`app/runtime-composition.json` contains only `{"formatVersion":1,"sourceRuntimes":[]}` or `{"formatVersion":1,"sourceRuntimes":["jm"]}`. It cannot declare entrypoints, download URLs, permissions or arbitrary executable plugins. Pure format/compatibility rules live under `src/modules`; filesystem inspection lives under `src/runtime`. Missing application roots and unreadable, linked, malformed or incomplete optional metadata are not silently interpreted as a core installation. Legacy packages infer the presence of JM from a complete physical runtime. Packaged source lookup uses its own application root, not another checkout's cwd.

The staging module validates the existing SDK manifest/JAR digest, copies only an explicitly selected non-linked runtime, refuses profile/media filenames and writes the descriptor last. Core staging does not read/copy/probe the checkout JVM. The existing Java probe is retained **only** for an explicitly selected JM build; it has not run on the user's PC this phase. ZIP inspection reads final bytes without extracting or executing them. It verifies declared composition, source SHA, required engine files, the Windows runtime allowlist and obvious private/media filenames. These are structural checks, not semantic/copyright clearance of every binary/image or proof that all source code has left the core.

## One update action, no hidden component migration

The existing application updater is reused; there is no separate source-module updater/marketplace.

1. Discover assets for the installed composition. Core retains historical scoped/generic delta compatibility. JM accepts only explicitly `with-jm` scoped assets and never falls back to a generic/core package.
2. Verify existing official origin, SHA-256, target OS/architecture, source/API/schema and file allowlists. These guards are not relaxed.
3. Bind delta manifest composition to descriptor bytes. An incremental update cannot add/remove a runtime, remove the descriptor, replace the updater helper or write non-allowlisted runtime files.
4. A full automatic update must retain composition. Recheck at staging, before preparing/launching a helper, in the detached helper's preflight and after parent exit before replacement. Invalid or changed facts fail without treating the issue as a network outage.
5. Component changes require a separately selected complete application, not an automatic update. No in-app runtime installer is implemented here. Account, enabled-source choices, local media and private state are not packaging facts and are not rewritten by this slice.

Actual helper bytes change in this source: a transition from an older helper must use the existing full-application route, not pretend to qualify as an incremental update. Both profiles remain one application transaction with existing recovery/state preservation.

## Evidence and honest limits

- Later local continuation adds an [exact old-client first-hop gate and verified legacy launch counterexample](OLD_CLIENT_FIRST_HOP_GATE.md), not a new installed-OTA PASS. The parent's source-review ZIP remains frozen. The builder's SHA stream leak was independently reproduced/fixed; current-source offline scope and old-client recovery remain separate.
- Final selected offline regression: **293 assertions / 28 files, 0 skips**. Strict TypeScript PASS; Web syntax **53/53**. Dedicated guards prohibit real provider/TCP/Java/application execution; all final receipts have zero boundary events. Synthetic application/SDK bytes are never executable test evidence.
- In-memory-only esbuild graphs include all three composition boundaries in Desktop (202 modules), incremental helper (9) and full helper (8); helpers contain no provider source modules. No generated file is written/executed. This is not the production Rollup build or an installable gate. All five changed/new PowerShell entry scripts are parsed, not executed; the pure resolver/stem alone runs inside its synthetic unit test.
- Preserved development failures: first run 117/119, with a stale UI expectation and a genuine pure-module filesystem boundary violation. The filesystem adapter was moved, not the boundary rule weakened. Two strict-type failures in newly added test-table declarations were fixed with typed inputs, not casts/check suppression. Earlier failed receipts remain in the source-review handoff.
- Actual official v0.5.0 ZIP is pinned to SHA-256 `14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf`, source `bec7f9f31828e8c57e0a2c103b6b1206c22c37cf`. Its compiled discovery methods/helpers were AST-extracted unchanged into an inert VM with synthetic transports: **7/7** discovery checks. Standard full names work; a newly invented `-core` name does not, including checksum fallback. Synthetic `0.5.1` is a fixture, not a proposed/reserved/published version. This is a pinned baseline audit, not a live latest-release check.
- Those extracted methods do **not** prove old installed-controller download/staging, first-hop OTA, process handoff or recovery. Existing replacement tests start a candidate helper directly. The new CI-only recipe explicitly retains this distinction.
- An old controller without composition support cannot be retroactively guaranteed to preserve a historical optional-runtime variant. The pinned public v0.5.0 has no JM payload; old unreleased JM variants need a separately verified transition. Do not claim arbitrary old-client first-hop compatibility.

## Separately authorized cloud validation

Do not run the builders or runtime recipe on the user's PC. `scripts/test-windows-runtime-compositions.ps1` refuses outside disposable GitHub-hosted Windows CI. It is authored/parsed locally, **not executed** and not wired to automatic triggers.

After separate push/Draft/build approval, build exact-head core and JM RC packages in disposable CI using the existing builder and signing flow. Use separate explicit outputs and compatible `PICA_REQUIRE_JM_RUNTIME` values. Inspect actual ZIPs; run compiled local-only setup/status in each, assert JM physically available only in its profile and disabled/anonymous in both. Reuse the nine replacement/recovery scenarios, now correctly paired: pinned released-core → core, exact frozen Dev86-JM → JM, current-core → current-core with a deep library path. Missing/expired/wrong predecessor bytes must fail, never substitute a rebuild or skip. Retain failure/health/launch diagnostics. This script does not establish old-controller first-hop OTA.

No Android build version is changed now. The frozen Dev86 signed APK is not relabeled with this source. New exact-source full CI, Chromium, real package/upgrade and any signed-APK continuity require their own evidence before handing over another installable.

## Still open in the full goal

The core still compiles historical provider-specific adapters/namespaces and UI. JVM-free default packaging is not a complete source-neutral architecture. User-owned source repositories/code trust, install/remove/rollback permissions, broader source-native catalogue/search/history/tag/sync parity, persistent identity and independent compatibility contracts remain unfinished. Physical Reader/gesture/offline sync/provider acceptance and the original user issues remain unclosed without user evidence. No recommendation/Visual algorithm or state, source permission, database schema or private feedback is changed by this work.
