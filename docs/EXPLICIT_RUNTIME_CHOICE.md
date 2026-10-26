# Explicit optional-runtime choice — local candidate

## Authority and status — 2026-10-25

Branch `codex/reader-explicit-runtime-choice-20261025`, parent `6a66711611c44df1b410bbe80d05ae725315af46`. This continues the human's goal-specific isolated-development exception after Local Memory context/claim returned `NOT_FOUND`. It is not new permission to push, build/sign in Actions, merge, publish, change OTA or deploy. PR210/Dev86, prior sealed archives and the G-drive application stay frozen. No formal profile/schema or local Java/application/browser/listener is accessed or started.

**Selected offline source gates: PASS. Exact-head full CI, actual browser/HTTP, installable and replacement gates: PENDING. Legacy first-hop recovery: HOLD. Complete source-neutral-reader objective: OPEN.**

## Problem addressed

The previous composition slice correctly prevented ordinary updates from silently adding/removing a JVM, but supplied no in-app user-controlled transition. This slice adds an explicit full-application transition; it does not create another updater, an executable extension format or an official source marketplace.

The application remains a local reader/library. Adding runtime files is distinct from enabling a source, signing in, choosing a host or fetching content. Removing runtime files is not a command to delete source accounts, local media or saved permissions. Those stored permissions also are not silently reset: later explicit source actions follow them. Product positioning is not a legal exemption or a claim about third-party content rights.

## Intended user path, not yet a verified installed workflow

1. Open **Software update → Optional source runtimes** (collapsed by default).
2. Select **Add JM runtime** or **Remove JM runtime**.
3. Preview the current/target composition, stable target version and available full-package size. Confirm the explanation about complete application replacement and restart.
4. The existing updater downloads the exact official full ZIP, checks its digest and metadata again, stages it, then uses its existing complete-application replacement/recovery path.
5. Reconnect only after the target version, declared composition and a different Desktop session are present. Same-version replacement cannot mistake the still-running old server for completion.

Example: a core reader can explicitly select the matching `with-jm` application, keeping library/account files unchanged. This does not enable or log into JM and does not start Java merely to install or display status. Ordinary subsequent updates stay `with-jm`. Selecting removal explicitly returns to core while retaining saved user state. A later reinstallation still requires an explicit choice; saved source permissions remain separate.

Current support is **Windows x64, stable application versions only**. An unpublished prerelease/RC is rejected rather than silently installing a public stable build. If the exact official variant/checksum is not published, selection fails without substituting a generic/core ZIP. Do not tell Dev86 users that this feature is already in their sealed package. Future cloud tests require clearly marked, disposable synthetic stable-version fixtures, not a user-installable or proposed release version.

## Safety and module boundaries

- Normal check/download/apply keeps the installed composition; incremental updates still cannot add/remove runtimes or replace the currently executing `app/updater.js`.
- Explicit preview is one-use, expires after 15 minutes and binds from/to composition, source commit, target version, archive filename and SHA-256. A fresh preview supersedes an older one. No downgrade; same-version replacement requires the same source commit.
- Preparation re-verifies official provenance and actual bytes, requires declared target composition, and rejects stale/cancelled work before extraction. A superseded stage cannot overwrite newer staged state/progress.
- Apply and the detached helper recheck the receipt and installed/staged facts. The helper checks before acknowledgement and after parent exit; copied composition must still match before candidate launch. Missing copied declaration rolls back rather than being reinterpreted as a legacy package.
- Administrative routes are strict POST/JSON, loopback peer/host, exact same Origin, nonempty CSRF and closed command fields; no query parameters or extra source-enable instructions. Body limit is 4096 bytes with a 5-second read deadline. Actual HTTP behavior remains untested locally.
- Normal and explicit downloads share one owned task. Cancellation/late failure of an old task cannot clear a newer task or admit a third. The owning response's disconnect reaches the actual download transport; already-aborted work never starts it, and linked listeners are disposed.
- UI installation is passive and localized in Chinese/English/Japanese. No startup metadata fetch or source command. Cancelled confirmation never prepares, downloads or applies. Explicit replacements require a new session plus matching composition; ordinary reconnect behavior remains version/shell-based.
- Readiness body reads now share the existing 2-second probe deadline. The 90-second overall reconnect and 1.5-second stability settings are not enlarged to hide failures.

The metadata discovery module uses an injected official-update fetch port and no provider/credentials/FS/process API. The receipt module is pure. Filesystem identity stays in the existing runtime adapter. The full helper includes receipt validation but no release-discovery/provider module. The five new modules add no dependency or database/native/ranker/sync contract.

## Verified evidence

| Gate | Local result | Limitation |
| --- | --- | --- |
| Selected offline Vitest | **358/358 cases, 32 files, 0 skips** | Cases are not individual `expect` calls or full CI |
| Strict TypeScript | PASS, no incremental cache | Not a native build |
| Web syntax | **54/54 modules PASS** | No real browser started |
| Source cancellation differential | Old exact server branches reproduced lost ownership; current actual task preserves it | Inert AST/VM with controlled transport, not HTTP |
| Replacement/recovery tests | Add/remove preserve synthetic DB/config; missing copied descriptor rolls back before candidate launch | Real temp filesystem, fake child/health ports; not installed execution |
| In-memory esbuild closure | Desktop 207 modules; incremental helper 9; full helper 11 | `write:false`; generated code neither written nor executed; not production Rollup/package |

Final phases `unit-7`, `types-5`, `web-5`, `audit-1`, `compile-1` all exited 0 with zero guarded runtime-boundary events. Guards deny actual fetch/TCP/Java/application execution; test-framework named-pipe IPC is allowed. No formal-data directory was opened, so no claim of a production database hash audit is made.

Failed evidence is retained rather than relabelled: current TS lib lacks `AbortSignal.any` (fixed with a standard disposable AbortController fan-in, no lib upgrade/cast); three same-version reconnect cases failed before the actual fix; an initial copied-descriptor test injected into `copyFileSync` while the implementation used `cpSync` (corrected the injection, kept the rollback assertion); a new request-disconnect regression failed **355/356** before forwarding abort to the transport. The earlier download-owner audit pins the exact parent server Git blob/branch hashes and its old/new observation. Final source-hash audit is recorded separately.

## Required next gates; not a release instruction

1. Obtain separate authority for a new Draft/Actions build (candidate Dev code greater than 86 and exact branch whitelist if needed). Do not modify frozen PR210 or relabel Dev86.
2. Run exact-head full Desktop/Android suites and Chromium navigation/consent/cancel/readiness checks. Windows CI must test the real loopback routes, abort, competing requests and response disconnect.
3. Build/inspect actual core and JM packages; run same-composition updates and explicit add/remove via their real controller/helper, including same-version same-source, hash/consent/state drift, cancellation, health/launch rollback and restart readiness. Verify synthetic profile and complete application bytes; do not use production data or source login. Runtime installation/status must not launch Java.
4. Determine incremental eligibility from actual packaged bytes/compatibility. A component change needs a full transaction. A change to the running incremental updater forces the full path; a full-helper-only change does not by itself establish that restriction. The in-memory graphs do not establish the production delta decision.
5. Keep the [verified legacy asynchronous-launch counterexample](OLD_CLIENT_FIRST_HOP_GATE.md) as **HOLD**. Pinned old Launcher source also returns after starting Node and has no exit monitor/guardian. These are static/code-level observations, not proof of installed recovery or a supported first-hop fix. Run the authored exact-old-controller scenarios only after separate cloud approval; do not substitute candidate helpers or skip the failing-risk case.

User-owned source trust/install policy, wider catalogue/search/tag/sync/native parity and actual user issue/device/provider acceptance remain separate open work. This slice does not claim a finished extension ecosystem or guaranteed upgrades for all historical clients.
