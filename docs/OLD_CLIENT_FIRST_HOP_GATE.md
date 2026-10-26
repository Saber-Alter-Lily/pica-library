# Exact old-client first-hop update gate

## Authority / state — 2026-10-25

Local continuation on `codex/reader-old-client-first-hop-gate-20261025`, parent `a5e57e1b776ac54b6bf1b7bddf6718f3056a9b2a`. The standing goal-specific isolation exception applies after Local Memory context/claim again returned `NOT_FOUND`. No registration or DPAPI repair. No new cloud/push approval has been inferred from an automatic goal continuation. PR210, Dev86 and the parent's source-review ZIP stay frozen. No production profile/schema, source account, local Java/application/browser/listener, main merge, tag/Release/OTA or deployment is touched.

**Offline harness/source gates: PASS. Actual old-client first-hop runtime: NOT RUN. Old-helper asynchronous-launch recovery: VERIFIED CODE-LEVEL COUNTEREXAMPLE / NOT ACCEPTED. Full modular-reader goal: OPEN.**

## Why the earlier evidence did not suffice

`test-windows-universal-full-upgrade.ps1` copies the **candidate** runtime/helper into a separate bootstrap and invokes it directly. It is valuable replacement/recovery evidence, but not proof that an installed old controller discovers/downloads/stages/applies the next application or that its old helper has the same safety properties. The inert seven-case released-discovery audit also proves discovery policy only.

The new gate never manually stages a full image, copies a candidate helper into bootstrap, edits an installed instruction or substitutes a modern helper. It boots the exact public release and calls that app's actual `/api/v1/update/check` → `/prepare-latest` → `/apply` endpoints with its real local CSRF capability. Actual old-manager download limits, official URL checks, official digest/checksum verification, file validation, persistent-assistant selection, launch, health and recovery remain in control.

## Immutable old input

| Item | SHA-256 / identity |
| --- | --- |
| Public v0.5.0 ZIP | `14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf` |
| SOURCE_SHA | `bec7f9f31828e8c57e0a2c103b6b1206c22c37cf` |
| Actual `app/desktop.js` | `3866280efae561b85a3b90f57636d53214fbbd64df9a59bbde63900dedc082da` |
| Actual `app/full-upgrader.js` | `06825e73e99f78dabf7357a14a0fe4c77d32fd4e32a41e7505cac965e7430066` |

Readback of the fixed compiled source confirmed the update routes, an environment filter that removes `PICA_` but retains external Node preload settings, and the absence of a `startupReady` status field. This old app can serve updates while not configured with provider credentials. The gate therefore uses its actual capabilities/version health contract, not a fabricated modern readiness flag or fake source login. This is not full Library/account/UI acceptance.

## External synthetic publisher, not a product backdoor

`scripts/lib/old-client-first-hop-preload.mjs` is copied outside the application into an owned disposable CI fixture. No product module imports it; no builder redistributes it. It is explicit test tooling, not a supported setting or alternative official update source.

- Only a separately authorized GitHub-hosted Windows runner may execute it. Self-hosted/non-CI/non-Windows contexts fail before application/input/state access. Environment checks are additional safeguards, not a replacement for human authorization.
- An explicit descriptor binds the owned fresh temp root, exact old entry/helper hashes, candidate source/digest and audit paths. The app runs without a source checkout in that root. Startup is through the real old launcher; the existing old controller chooses/copies/spawns its own pinned helper.
- Only exact synthetic anonymous GET responses for the official repository's latest/tag/checksum/archive URLs are supplied. Unrecognized hosts/routes, credentials/cookies, nonlocal sockets/HTTP, unowned executable launches and Java are blocked/reported. No TLS validation or production-origin logic is disabled. Actual loopback health uses real HTTP.
- Old/helper/candidate processes are distinguished by actual entry hashes and source markers. Only the old Desktop may receive fake publisher responses. No provider account is seeded. Audits contain event kinds/known executable names, not headers/tokens.
- A narrowly identified post-health browser-opening convenience can be suppressed in headless CI; browser UI is explicitly not accepted by this gate. The old server's listener behavior is not rewritten to look like the candidate's default-LAN-off behavior.

This establishes neither real public-GitHub transport nor published OTA, Windows shell/browser UX, physical/OEM behavior or authenticated-session migration. It is real old-controller/helper execution with a synthetic publisher, once actually run. It is currently authored and syntax/offline-logic checked only.

## Test-only candidate version binding

The old controller accepts only a newer stable-looking target; an unpublished `0.5.0-postrc...` RC is not an eligible synthetic target. `build-windows-first-hop-fixture.ps1` therefore performs a **disposable CI-only version-metadata override** from the committed `0.5.0` to a fixture label `0.5.1`, using the real default-core builder and pinned accepted launcher. It verifies tracked source differs only at package metadata and restores original bytes/environment in `finally`. Compiled helpers/source are never patched after build.

The output carries `FIRST_HOP_FIXTURE.json` and `TEST_BUILD.txt`, an explicit metadata-override receipt, exact candidate source/digest and the name `SYNTHETIC-NOT-FOR-INSTALLATION.zip`. It is not an exact-tree production-version artifact, must not be handed to users or uploaded as an installable, and performs/reserves/proposes no tag or release. Fixture response labels `0.5.1`/`0.5.2` say nothing about the live public tag list; no live latest-release claim is made.

## Four actual runtime scenarios, still NOT RUN

| Scenario | Mechanism / required result |
| --- | --- |
| Success | Old app discovers, downloads, officially verifies and stages the real fixture; its exact old helper replaces the full tree; actual capabilities/version, source marker, complete application-byte tree and selected state canaries match. |
| Hash mismatch | Flip one delivered archive byte while metadata/checksums retain the correct digest; old verification must reject before helper launch or installed mutation, and old process/state remain. |
| Health rollback | Publisher advertises fixture `0.5.2` while the unmodified candidate reports `0.5.1`; the actual old helper must detect real version-health failure and restore the old app/state. No instruction/timeout edit or fake health response. |
| Launch rollback | External test-only injection causes one asynchronous candidate-launch EACCES in the old helper; actual recovery must restore the old app/state. **Known old code risk below; never skip or substitute helpers to obtain green.** |

The synthetic SQL/file contract reuses the existing incremental acceptance canaries: imported favorite metadata, episode/reading progress, private app_state, a Like event, selected configuration/source choices and a downloaded-byte sentinel. No comic body, real token, formal DB or new production schema. The whole app tree is hashed before/after. These selected canaries are not proof of every historical user-data field.

Processes are checked through Windows CIM against the exact real fixture root before stopping. Known child/helper PIDs are retained; terminal-helper disappearance fails immediately instead of treating an observation timeout as a restart request. Failed fixtures remain for diagnosis; successful cleanup is limited to the validated owned temp root. Logs/receipts are flushed and retained under `artifacts/old-client-first-hop-evidence`; no test is silently retried or timeout widened to hide failure.

## Verified defect 1: packaging hash stream leak — fixed locally

The actual `Get-Sha256` in `build-windows-package.ps1` passed a newly opened FileStream into ComputeHash without disposing it. A pure Windows PowerShell test extracts only that actual function, hashes a synthetic file and immediately opens it with `FileShare.None`. Before correction: **98/99 PASS, exclusive reopen failed with IOException**. This can obstruct later rename/replacement/build steps in the same process.

The stream is now acquired inside `try`, disposed in `finally`, then the hash algorithm is disposed. No GC-delay/retry/lock-check relaxation. The same real-function test passes after correction.

## Verified defect 2: old first-hop helper asynchronous error — unresolved

`audit-released-first-hop-helper.mjs` verifies the pinned ZIP/helper hashes and AST-extracts the actual old launch function `w` unchanged. In a VM with a fake filesystem predicate/path join and inert EventEmitter child, it returns undefined, registers **zero `error` listeners**, and a subsequent asynchronous EACCES escapes. The standalone helper source declares no global uncaught-exception handler. No real process, data mutation or rollback is executed by this audit.

Result is deliberately `VERIFIED_LEGACY_COUNTEREXAMPLE_NOT_UPGRADE_PASS`. New candidate helpers have a different launch/recovery implementation; their passing tests cannot retroactively fix this installed old helper. The cloud launch-rollback gate may expose precisely this limitation and must remain a blocker rather than be skipped/relabelled.

Next work must determine a genuinely supported legacy transition/compatibility path without weakening self-replacement, official provenance or state-preservation rules. No compatibility bootstrap has been implemented or validated here. Do not call a one-time manual unzip an accomplished one-action upgrade requirement, and do not assume an old incremental helper is safe without its own evidence. Current-source safety and legacy first-hop support remain separate.

## Local evidence and next authorized action

Final selected offline suite: **323/323 assertions / 29 files, 0 skips**, strict types and Web **53/53** PASS. Includes real synthetic SQLite mutation/loss detection, real pure PowerShell hash/reopen, CI-only script refusal before side effects, publisher allowlist/corruption/credential-denial and existing module/update suites. Guards report zero network/listener/Java/application events.

Retain initial suite-load failure (test loader did not recognize direct `node:sqlite`), the Vitest mock generic type error, and the real 98/99 hash-lock counterexample. Tests use the project's existing createRequire/native SQLite pattern and correct inferred mock types; no new dependency, check suppression, skip or timeout workaround.

After separate push/Draft/cloud approval: build the marked synthetic version fixture on disposable CI, run the four scenarios with pinned baseline/receipt/source arguments, retain all failures, and address the legacy counterexample before claiming first-hop safety. Do not upload the synthetic fixture as a user installable or change stable OTA. Full real-device/source/sync/gesture and source-neutral architecture acceptance remain open.
